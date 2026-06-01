// ./API_SAC/routes/user.route.js
// Routes pour la gestion des utilisateurs : profil personnel (/me) et liste des enseignants (/teachers).

// Importe Express pour créer le routeur
const express = require("express");
// Importe le client Prisma pour les requêtes en base de données
const { prisma } = require("../commons/prisma.common");
// Importe la fonction de formatage de l'utilisateur en session
const { format_session_user } = require("../commons/session_user.common");
// Importe le middleware de contrôle d'accès par rôle
const require_access = require("../middlewares/require_access.middleware");
// Importe les constantes de rôles
const { ROLES } = require("../commons/constants.common");
// Importe le système de logging technique
const { TECHNICAL_LEVELS, log_technical } = require("../commons/logger.common");

// Crée un nouveau routeur Express
const router = express.Router();

// Formate les données d'un enseignant pour la vue "staff" (tableau de bord du personnel)
// Enrichit les données avec des statistiques d'activité (dernière connexion, dernier scan NFC, etc.)
function formatTeacherUser(user, latestBrowserSessionByUserId) {
  // Récupère la dernière session de navigateur de cet enseignant
  const lastSession = latestBrowserSessionByUserId.get(Number(user.id)) || null;
  // Récupère la date du dernier scan NFC
  const lastNfcScan = user.nfcScans?.[0]?.scannedAt || null;
  // Récupère le dernier cours enseigné
  const lastCourse = user.teachingSessions?.[0] || null;
  // Récupère la dernière finalisation d'appel
  const lastFinalization = user.finalizedSessions?.[0] || null;

  return {
    id: user.id, // ID interne
    firstName: user.firstName, // Prénom
    lastName: user.lastName, // Nom
    role: user.role, // Rôle Prisma
    edId: user.edId, // ID EcoleDirecte
    o365Email: user.o365Email, // Email Office 365
    o365AvatarB64: user.o365AvatarB64, // Avatar Office 365 en base64
    hasO365AccountLinked: Boolean(user.o365Id || user.o365Email), // L'enseignant a-t-il un compte O365 lié ?
    hasLoggedIn: Boolean(user.o365Email), // L'enseignant s'est-il déjà connecté ?
    lastLoginAt: lastSession?.createdAt || null, // Date de la dernière connexion
    lastNfcScanAt: lastNfcScan, // Date du dernier scan NFC
    teachingSessionsCount: user._count?.teachingSessions || 0, // Nombre total de cours enseignés
    finalizedSessionsCount: user._count?.finalizedSessions || 0, // Nombre de sessions finalisées
    attendanceRecordsCount: user._count?.attendance || 0, // Nombre d'enregistrements de présence
    nfcScansCount: user._count?.nfcScans || 0, // Nombre total de scans NFC
    // Dernier cours enseigné (avec détails de la classe et de la salle)
    lastCourse: lastCourse
      ? {
          id: lastCourse.id,
          label: lastCourse.label,
          matiere: lastCourse.matiere,
          startTime: lastCourse.startTime,
          endTime: lastCourse.endTime,
          class: lastCourse.class
            ? {
                id: lastCourse.class.id,
                code: lastCourse.class.code,
                name: lastCourse.class.name,
              }
            : null,
          room: lastCourse.room
            ? {
                id: lastCourse.room.id,
                code: lastCourse.room.code,
                name: lastCourse.room.name,
              }
            : null,
        }
      : null,
    lastFinalizationAt: lastFinalization?.createdAt || null, // Date de la dernière finalisation
  };
}

// Route GET /teachers : récupère la liste de tous les enseignants avec leurs statistiques
// Accessible uniquement au personnel (STAFF) et aux administrateurs
router.get("/teachers", require_access({ minRole: ROLES.STAFF }), async (req, res) => {
  try {
    // Exécute 2 requêtes en parallèle pour optimiser les performances
    const [teachers, browserSessions] = await Promise.all([
      // 1. Récupère tous les enseignants avec leurs dernières activités
      prisma.user.findMany({
        where: { role: "teacher" }, // Filtre uniquement les enseignants
        orderBy: [
          { lastName: "asc" }, // Tri par nom de famille (A→Z)
          { firstName: "asc" }, // Puis par prénom
        ],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          o365Id: true,
          edId: true,
          o365Email: true,
          o365AvatarB64: true,
          // Dernier scan NFC de l'enseignant
          nfcScans: {
            orderBy: { scannedAt: "desc" },
            take: 1,
            select: { scannedAt: true },
          },
          // Dernier cours enseigné (avec classe et salle)
          teachingSessions: {
            orderBy: { startTime: "desc" },
            take: 1,
            select: {
              id: true,
              label: true,
              matiere: true,
              startTime: true,
              endTime: true,
              class: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                },
              },
              room: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                },
              },
            },
          },
          // Dernière finalisation d'appel
          finalizedSessions: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
          // Compteurs d'activité agrégés
          _count: {
            select: {
              teachingSessions: true, // Nombre total de cours
              finalizedSessions: true, // Nombre de sessions finalisées
              attendance: true, // Nombre d'enregistrements de présence
              nfcScans: true, // Nombre de scans NFC
            },
          },
        },
      }),
      // 2. Récupère toutes les sessions de navigateur (pour trouver la dernière connexion de chaque user)
      prisma.browserSession.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          data: true,
          createdAt: true,
        },
      }),
    ]);

    // Construit une Map pour trouver rapidement la dernière session de navigateur de chaque utilisateur
    const latestBrowserSessionByUserId = new Map();
    for (const browserSession of browserSessions) {
      const userId = Number(browserSession.data?.user?.id);
      // Ne garde que la première occurrence (la plus récente car triée par date desc)
      if (Number.isInteger(userId) && !latestBrowserSessionByUserId.has(userId)) {
        latestBrowserSessionByUserId.set(userId, browserSession);
      }
    }

    // Formate chaque enseignant avec ses statistiques d'activité
    const formattedTeachers = teachers.map(user => formatTeacherUser(user, latestBrowserSessionByUserId));

    // Retourne la liste des enseignants avec un résumé global
    return res.json({
      teachers: formattedTeachers,
      summary: {
        teachersCount: formattedTeachers.length, // Nombre total d'enseignants
        linkedCount: formattedTeachers.filter(user => user.hasO365AccountLinked).length, // Comptes O365 liés
        loggedInCount: formattedTeachers.filter(user => user.hasLoggedIn).length, // Se sont déjà connectés
        scannedCount: formattedTeachers.filter(user => user.nfcScansCount > 0).length, // Ont déjà scanné NFC
      },
    });
  } catch (err) {
    // En cas d'erreur, log et retourne une erreur 500
    log_technical(TECHNICAL_LEVELS.ERROR, "Staff teachers fetch failed", {
      error: err,
      userId: req.session?.user?.id,
    });

    return res.status(500).json({
      error: "STAFF_TEACHERS_FETCH_FAILED",
      message: "Erreur lors du chargement des enseignants.",
    });
  }
});

// Route GET /me : retourne le profil de l'utilisateur actuellement connecté
// Accessible à tous les utilisateurs authentifiés (élèves inclus)
router.get("/me", require_access({ minRole: ROLES.STUDENT }), async (req, res) => {
  try {
    // Vérifie que l'utilisateur est bien authentifié
    if (!req.session?.user?.id) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Utilisateur non authentifie." });
    }

    // Récupère les données à jour de l'utilisateur depuis la base de données (avec sa classe)
    const user = await prisma.user.findUnique({
      where: { id: req.session.user.id },
      include: { class: true }, // Inclut les informations de la classe
    });

    // Si l'utilisateur n'existe plus en base, retourne une erreur 404
    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "Utilisateur introuvable." });
    }

    // Met à jour les données de session avec les données fraîches de la base
    req.session.user = format_session_user(user, req.session.user);
    // Retourne les données utilisateur mises à jour
    return res.json(req.session.user);
  } catch (err) {
    // En cas d'erreur, log et retourne une erreur 500
    log_technical(TECHNICAL_LEVELS.ERROR, "User profile fetch failed", { error: err, userId: req.session?.user?.id });
    return res.status(500).json({
      error: "USER_FETCH_FAILED",
      message: "Erreur lors du chargement du profil.",
    });
  }
});

// Exporte le routeur
module.exports = router;
