// ./API_SAC/routes/o365.route.js
// Routes d'authentification Office 365 (Microsoft OAuth 2.0).
// Gère la connexion (/login), le callback (/redirect) et la déconnexion (/logout).

// Importe Sharp pour la compression d'images (avatar Office 365)
const sharp = require("sharp");
// Importe le module crypto pour générer des états OAuth aléatoires
const crypto = require("crypto");
// Importe Express pour créer le routeur
const express = require("express");
// Crée un nouveau routeur Express
const router = express.Router();

// Importe le client MSAL (Microsoft Authentication Library) pour l'authentification
const { msal_client } = require("../commons/msal_client.common");
// Importe la configuration OAuth Azure (clientId, redirectUri, scopes)
const auth_config = require("../commons/auth_config.common");
// Importe le client Prisma pour les requêtes en base de données
const { prisma } = require("../commons/prisma.common");
// Importe la fonction de correspondance Office 365 → EcoleDirecte
const { return_ed_account } = require("../commons/match_office_to_ed.common");
// Importe la fonction de formatage de l'utilisateur en session
const { format_session_user } = require("../commons/session_user.common");
// Importe le système de logging (métier + technique)
const { LOG_DESTINATIONS, TECHNICAL_LEVELS, log_business, log_technical } = require("../commons/logger.common");

// Importe les fonctions de gestion des rôles (détermination du rôle selon les groupes Azure AD)
const { get_highest_role_from_groups, map_to_prisma_role } = require("../commons/constants.common");

// Route GET /login : redirige l'utilisateur vers la page de connexion Microsoft
router.get("/login", async (req, res) => {
  // Génère un état aléatoire pour protéger contre les attaques CSRF OAuth
  const state = crypto.randomBytes(24).toString("base64url");
  // Stocke l'état dans la session pour vérification ultérieure
  req.session.oauthState = state;

  // Génère l'URL d'authentification Microsoft avec les scopes et la redirection
  const authUrl = await msal_client.getAuthCodeUrl({
    redirectUri: auth_config.redirectUri, // URL de callback
    scopes: auth_config.scopes, // Permissions demandées (User.Read, email, etc.)
    prompt: "login", // Force l'affichage de la page de connexion (pas de connexion automatique)
    state, // État CSRF
  });

  // Redirige le navigateur vers la page de connexion Microsoft
  res.redirect(authUrl);
});

// Route GET /redirect : callback OAuth appelé par Microsoft après la connexion
// C'est ici que toute la logique de création/mise à jour de l'utilisateur se passe
router.get("/redirect", async (req, res) => {
  try {
    // Vérifie que l'état OAuth correspond à celui stocké en session (protection CSRF)
    if (!req.query.state || req.query.state !== req.session?.oauthState) {
      return res.status(403).send("Invalid login state");
    }
    // Supprime l'état OAuth de la session (usage unique)
    delete req.session.oauthState;

    // Échange le code d'autorisation contre un token d'accès
    const tokenResponse = await msal_client.acquireTokenByCode({
      code: req.query.code, // Code d'autorisation reçu de Microsoft
      redirectUri: auth_config.redirectUri,
      scopes: auth_config.scopes,
    });

    // Obtient un token silencieux pour accéder à l'API Microsoft Graph
    const userInfoResponse = await msal_client.acquireTokenSilent({
      account: tokenResponse.account,
      scopes: ["User.Read"],
    });

    // Récupère les informations du profil utilisateur depuis Microsoft Graph
    const userInfo = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${userInfoResponse.accessToken}`,
      },
    }).then(res => res.json());

    // Récupère les groupes Azure AD de l'utilisateur (pour déterminer son rôle)
    const groupsResponse = await fetch(
      "https://graph.microsoft.com/v1.0/me/memberOf",
      {
        headers: {
          Authorization: `Bearer ${userInfoResponse.accessToken}`,
        },
      }
    );

    const groupsData = await groupsResponse.json();

    // Filtre les groupes : ne garde que les groupes Azure AD commençant par "SAC_"
    const groups = (groupsData.value || [])
      .filter(group =>
        group["@odata.type"] === "#microsoft.graph.group" &&
        group.displayName &&
        group.displayName.startsWith("SAC_") // SAC_ELEVES, SAC_ENSEIGNANTS, SAC_PERSONNELS, SAC_ADMINS
      )
      .map(group => ({
        id: group.id,
        name: group.displayName,
      }));

    // Détermine le rôle le plus élevé de l'utilisateur à partir de ses groupes Azure AD
    const roleConst = get_highest_role_from_groups(groups);
    // Convertit le rôle en format Prisma (minuscules)
    const role = map_to_prisma_role(roleConst);

    // Tente de trouver le compte EcoleDirecte correspondant à ce compte Office 365
    let edProfile = null;

    if (roleConst) {
      edProfile = await return_ed_account(
        userInfo,
        roleConst,
      );
    }

    // Tente de récupérer la photo de profil Office 365
    let avatarBase64 = null;

    try {
      const photoResponse = await fetch(
        "https://graph.microsoft.com/v1.0/me/photo/$value",
        {
          headers: {
            Authorization: `Bearer ${userInfoResponse.accessToken}`,
          },
        }
      );

      if (photoResponse.ok) {
        // Convertit la photo en buffer
        const buffer = Buffer.from(await photoResponse.arrayBuffer());
        // Compresse et redimensionne la photo (50x50 pixels, JPEG qualité 85)
        const compressedBuffer = await sharp(buffer)
          .resize(50, 50, { fit: "cover" })
          .jpeg({ quality: 85 })
          .toBuffer();

        // Convertit en chaîne base64 avec le préfixe data URI
        avatarBase64 = `data:image/jpeg;base64,${compressedBuffer.toString("base64")}`;
      }
    } catch (err) {
      // Si la photo n'est pas disponible, on continue sans (ce n'est pas bloquant)
      log_technical(TECHNICAL_LEVELS.WARNING, "Office 365 profile picture fetch failed", { error: err });
    }

    // --- Création ou mise à jour de l'utilisateur en base de données ---
    let dbUser = null;

    // Récupère l'ID et l'email EcoleDirecte si un match a été trouvé
    const edId = edProfile?.ED?.id ? String(edProfile.ED.id) : null;
    const edEmail = edProfile?.ED?.email || null;
    // Prépare les données communes pour la création/mise à jour
    const baseUserUpdate = {
      o365Id: userInfo.id, // ID Microsoft
      o365Email: userInfo.mail || userInfo.userPrincipalName, // Email Office 365
      firstName: userInfo.givenName, // Prénom
      lastName: userInfo.surname, // Nom
      role, // Rôle Prisma
    };

    // Ajoute l'avatar s'il a été récupéré
    if (avatarBase64) {
      baseUserUpdate.o365AvatarB64 = avatarBase64;
    }

    // Ajoute l'email EcoleDirecte s'il existe
    if (edEmail !== null) {
      baseUserUpdate.edEmail = edEmail;
    }

    // Si un ID EcoleDirecte a été trouvé, on cherche d'abord par edId
    if (edId) {
      const existingUser = await prisma.user.findUnique({
        where: { edId },
      });

      if (existingUser) {
        // L'utilisateur existe déjà (créé par l'import ED) : on rattache les données O365
        dbUser = await prisma.user.update({
          where: { id: existingUser.id },
          data: baseUserUpdate,
        });
      } else {
        // L'utilisateur n'existe pas encore : on le crée avec les données O365 et ED
        dbUser = await prisma.user.create({
          data: {
            edId,
            o365Id: userInfo.id,
            o365Email: userInfo.mail || userInfo.userPrincipalName,
            firstName: userInfo.givenName,
            lastName: userInfo.surname,
            role,
            o365AvatarB64: avatarBase64,
            edEmail,
          },
        });
      }
    }

    // Si aucun ID EcoleDirecte n'a été trouvé, on cherche/crée par o365Id
    else {
      dbUser = await prisma.user.upsert({
        where: { o365Id: userInfo.id }, // Cherche par ID Microsoft
        update: baseUserUpdate, // Met à jour si trouvé
        create: {
          o365Id: userInfo.id,
          o365Email: userInfo.mail || userInfo.userPrincipalName,
          firstName: userInfo.givenName,
          lastName: userInfo.surname,
          role,
          o365AvatarB64: avatarBase64,
        },
      });
    }

    // Recharge l'utilisateur avec ses informations de classe
    dbUser = await prisma.user.findUnique({
      where: { id: dbUser.id },
      include: { class: true },
    });

    // Régénère la session Express (nouvelle session = nouveau cookie)
    // Cela empêche le vol de session (session fixation attack)
    await new Promise((resolve, reject) => {
      req.session.regenerate(err => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Stocke les informations de l'utilisateur dans la session
    req.session.user = format_session_user(dbUser, {}, roleConst, userInfo.groups, edProfile);

    // Stocke le compte MSAL dans la session (pour les futures requêtes silencieuses)
    req.session.account = tokenResponse.account;

    // Log métier : enregistre la connexion en base de données
    await log_business("user_o365_login", "Utilisateur connecté via Office 365.", {
      req,
      destination: LOG_DESTINATIONS.DATABASE,
      userId: dbUser.id,
      entityType: "User",
      entityId: dbUser.id,
      metadata: {
        role,
        o365Email: dbUser.o365Email,
        hasEdMatch: Boolean(edId), // Indique si un match ED a été trouvé
      },
    });

    // Sauvegarde la session et redirige vers la page d'accueil
    req.session.save(() => {
      res.redirect("/");
    });

  } catch (err) {
    // En cas d'erreur critique lors de la connexion, log et retourne une erreur 500
    log_technical(TECHNICAL_LEVELS.ERROR, "Office 365 login failed", { error: err });
    res.status(500).send("Login failed");
  }
});

// Route GET /logout : déconnecte l'utilisateur (détruit la session)
router.get("/logout", (req, res) => {
  // Détruit la session Express (supprime le cookie et les données en base)
  req.session.destroy(() => {
    // Redirige vers la page d'accueil après déconnexion
    res.redirect("/");
  });
});

// Exporte le routeur
module.exports = router;
