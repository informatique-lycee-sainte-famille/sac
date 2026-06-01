// ./API_SAC/middlewares/csrf_protection.middleware.js
// Middleware de protection contre les attaques CSRF (Cross-Site Request Forgery).
// Un jeton CSRF est généré et stocké dans la session côté serveur + dans un cookie côté client.
// Les requêtes non-sûres (POST, PUT, DELETE, etc.) doivent fournir ce jeton dans un en-tête HTTP.

// Importe le module crypto de Node.js pour générer des tokens aléatoires
const crypto = require("crypto");

// Méthodes HTTP considérées comme "sûres" (qui ne modifient pas les données) : pas besoin de vérification CSRF
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Génère les options du cookie CSRF selon le contexte de la requête
function getCookieOptions(req) {
  // Détecte si la connexion est sécurisée (HTTPS)
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  return {
    httpOnly: false, // Le cookie DOIT être accessible par JavaScript côté client (pour lire le jeton)
    sameSite: "lax", // Protection contre les requêtes cross-site (mais autorise les navigations classiques)
    secure, // Cookie envoyé uniquement via HTTPS en production
    path: "/", // Le cookie est disponible sur tout le site
  };
}

// S'assure qu'un jeton CSRF existe dans la session et le place dans un cookie
function ensureToken(req, res) {
  // Pas de session = pas de protection CSRF possible
  if (!req.session) return null;
  // Si l'utilisateur n'est pas connecté ET n'a pas déjà de token CSRF, on ne crée rien
  if (!req.session.user && !req.session.csrfToken) return null;

  // Génère un nouveau jeton CSRF s'il n'en existe pas encore (32 octets aléatoires en base64url)
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("base64url");
  }

  // Place le jeton dans un cookie "XSRF-TOKEN" (accessible par JavaScript côté client)
  res.cookie("XSRF-TOKEN", req.session.csrfToken, getCookieOptions(req));
  return req.session.csrfToken;
}

// Middleware principal de protection CSRF
module.exports = function csrfProtection(req, res, next) {
  // Ne s'applique qu'aux routes API (pas aux fichiers statiques ni aux pages HTML)
  if (!req.path.startsWith("/api/")) {
    return next();
  }

  // Génère/récupère le jeton CSRF pour cette session
  const token = ensureToken(req, res);

  // Les méthodes sûres (GET, HEAD, OPTIONS) ne nécessitent pas de vérification CSRF
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Pour les méthodes non-sûres (POST, PUT, DELETE, PATCH) :
  // Si aucun token n'existe dans la session, la requête est rejetée
  if (!token) {
    return res.status(403).json({
      error: "CSRF_SESSION_MISSING",
      message: "Session CSRF manquante.",
    });
  }

  // Vérifie que le jeton soumis par le client (dans un en-tête HTTP) correspond au jeton de la session
  const submittedToken = req.headers["x-csrf-token"] || req.headers["x-xsrf-token"];
  if (!submittedToken || submittedToken !== token) {
    return res.status(403).json({
      error: "CSRF_TOKEN_INVALID",
      message: "Jeton CSRF invalide ou manquant.",
    });
  }

  // Le jeton est valide, on laisse passer la requête
  return next();
};
