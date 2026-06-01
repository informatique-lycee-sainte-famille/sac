// ./API_SAC/routes/documentation.route.js
// Route qui sert la documentation Swagger UI de l'API.
// Accessible uniquement aux administrateurs.

// Importe Express pour créer le routeur
const express = require("express");
// Importe swagger-ui-express pour servir l'interface Swagger
const swaggerUi = require("swagger-ui-express");
// Importe le middleware de contrôle d'accès par rôle
const require_access = require("../middlewares/require_access.middleware");
// Importe les constantes de rôles
const { ROLES } = require("../commons/constants.common");

// Extrait la première valeur d'un en-tête HTTP "forwarded" (qui peut contenir plusieurs valeurs séparées par des virgules)
function firstForwardedValue(value) {
  return String(value || "")
    .split(",") // Sépare les valeurs par virgule
    .map(item => item.trim()) // Nettoie les espaces
    .filter(Boolean)[0] || ""; // Retourne la première valeur non vide
}

// Détermine le protocole (http/https) et le host de la requête, en tenant compte des proxys
function getRequestOrigin(req) {
  // Le protocole est déterminé par l'en-tête X-Forwarded-Proto (si derrière un proxy), sinon par Express
  const proto =
    firstForwardedValue(req.headers["x-forwarded-proto"]) ||
    req.protocol ||
    (req.secure ? "https" : "http");
  // Le host est déterminé par l'en-tête X-Forwarded-Host (si derrière un proxy), sinon par l'en-tête Host
  const host =
    firstForwardedValue(req.headers["x-forwarded-host"]) ||
    req.get("host") ||
    "localhost";

  return {
    proto,
    host,
  };
}

// Construit le document Swagger en adaptant le host et le protocole à la requête en cours
function buildSwaggerDocument(swaggerDocument, req) {
  // Clone le document Swagger pour ne pas modifier l'original
  const document = JSON.parse(JSON.stringify(swaggerDocument));
  // Récupère le protocole et le host de la requête
  const { proto, host } = getRequestOrigin(req);

  document.host = host; // Définit le host du document Swagger
  document.schemes = [proto]; // Définit le schéma (http ou https)
  document.basePath = "/api"; // Toutes les routes API sont sous /api

  return document;
}

// Exporte une factory qui crée le routeur de documentation
// Prend en paramètre le document Swagger (spécification OpenAPI)
module.exports = ({ swaggerDocument }) => {
  // Crée un nouveau routeur Express
  const router = express.Router();

  // Protège toute la documentation : accessible uniquement aux administrateurs
  router.use(require_access({ minRole: ROLES.ADMIN }));

  // Route GET /swagger.json : retourne le document Swagger au format JSON (adapté à la requête)
  router.get("/swagger.json", (req, res) => {
    res.json(buildSwaggerDocument(swaggerDocument, req));
  });

  // Sert l'interface Swagger UI sur la racine "/" de ce routeur
  router.use("/", swaggerUi.serve, swaggerUi.setup(null, {
    swaggerOptions: {
      url: "/api/documentation/swagger.json", // URL du document Swagger à charger
      withCredentials: true, // Envoie les cookies avec les requêtes (nécessaire pour l'auth)
      // Intercepteur de requêtes : ajoute automatiquement le jeton CSRF aux requêtes non-sûres
      requestInterceptor: (req) => {
        req.credentials = "include"; // Inclut les cookies dans les requêtes
        // Récupère le jeton CSRF depuis le cookie XSRF-TOKEN
        const csrfToken = document.cookie
          .split(";")
          .map(cookie => cookie.trim())
          .find(cookie => cookie.startsWith("XSRF-TOKEN="))
          ?.slice("XSRF-TOKEN=".length);
        // Ajoute le jeton CSRF aux requêtes non-sûres (POST, PUT, DELETE, PATCH)
        if (csrfToken && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
          req.headers["x-csrf-token"] = csrfToken;
        }
        return req;
      },
    },
  }));

  return router;
};
