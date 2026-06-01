// ./API_SAC/commons/session_config.common.js
// Charge le module express-session (nécessaire pour que PrismaSessionStore puisse hériter de session.Store)
require("express-session");
// Importe notre store de sessions personnalisé qui stocke les sessions dans la base de données via Prisma
const PrismaSessionStore = require("./prisma_session_store.common");

// Constante : nombre de millisecondes dans une journée (1000ms * 60s * 60min * 24h)
const DAY = 1000 * 60 * 60 * 24;
// Durée de vie des sessions en jours (par défaut 180 jours = 6 mois)
const SESSION_DURATION_DAYS = parseInt(process.env.SESSION_DURATION_DAYS) || 180; // 6 months by default
// Détermine si on est en environnement de production
const isProduction = process.env.ENV === "prod" || process.env.NODE_ENV === "production";
// Détermine si le cookie de session doit être sécurisé (HTTPS uniquement)
// - Si SESSION_COOKIE_SECURE est défini, on utilise sa valeur
// - Sinon, on active le cookie sécurisé en production uniquement
const secureCookie = process.env.SESSION_COOKIE_SECURE
  ? process.env.SESSION_COOKIE_SECURE === "true"
  : isProduction;
// Clé secrète pour signer les cookies de session
const sessionSecret = process.env.SESSION_SECRET;

// En production, la clé secrète est obligatoire (sinon risque de sécurité)
if (isProduction && !sessionSecret) {
  throw new Error("SESSION_SECRET is required in production.");
}

// Configuration des sessions Express exportée pour être utilisée par le serveur
module.exports.session_options = {
  name: "sac.sid", // Nom du cookie de session (au lieu du défaut "connect.sid")
  secret: sessionSecret || "dev-only-change-me", // Clé secrète (valeur par défaut uniquement pour le dev)
  resave: false, // Ne pas re-sauvegarder la session si elle n'a pas été modifiée
  saveUninitialized: false, // Ne pas créer de session pour les visiteurs non authentifiés
  store: new PrismaSessionStore(), // Utilise notre store Prisma pour persister les sessions en BDD
  cookie: {
    httpOnly: true, // Le cookie n'est pas accessible par JavaScript côté client (protection XSS)
    secure: secureCookie, // Le cookie ne sera envoyé que via HTTPS en production
    sameSite: "lax", // Protection contre les attaques CSRF (le cookie est envoyé pour les navigations top-level)
    maxAge: SESSION_DURATION_DAYS * DAY, // Durée de vie du cookie (30 ou 180 jours selon config)
  },
};
    
