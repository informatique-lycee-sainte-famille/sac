// ./API_SAC/routes/business_logs.route.js
// Routes pour la consultation des logs métier (événements applicatifs importants).
// Accessible uniquement au personnel (STAFF) et aux administrateurs.

// Importe Express pour créer le routeur
const express = require("express");
// Importe le client Prisma pour les requêtes en base de données
const { prisma } = require("../commons/prisma.common");
// Importe le middleware de contrôle d'accès par rôle
const require_access = require("../middlewares/require_access.middleware");
// Importe les constantes de rôles
const { ROLES } = require("../commons/constants.common");
// Importe le système de logging technique
const { TECHNICAL_LEVELS, log_technical } = require("../commons/logger.common");

// Crée un nouveau routeur Express
const router = express.Router();

// Fonction utilitaire : parse une valeur en entier positif, retourne null si invalide
function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

// Fonction utilitaire : retourne une chaîne nettoyée et tronquée, ou null si vide
function stringOrNull(value, maxLength = 160) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

// Protège toutes les routes de ce routeur : accessible uniquement au STAFF et ADMIN
router.use(require_access({ minRole: ROLES.STAFF }));

// Route GET / : récupère les logs métier avec filtrage et pagination
router.get("/", async (req, res) => {
  try {
    // Nombre maximum de logs à retourner (par défaut 100, maximum 500)
    const take = Math.min(parsePositiveInt(req.query.take) || 100, 500);
    // Filtres optionnels depuis les paramètres de requête
    const userId = parsePositiveInt(req.query.userId); // Filtrer par utilisateur
    const event = stringOrNull(req.query.event, 160); // Filtrer par type d'événement
    const level = stringOrNull(req.query.level, 20); // Filtrer par niveau (ERROR, WARNING, INFO, VERBOSE)
    const entityType = stringOrNull(req.query.entityType, 80); // Filtrer par type d'entité

    // Construit l'objet de filtrage Prisma dynamiquement
    const where = {};
    if (userId) where.userId = userId;
    if (event) where.event = event;
    if (level) where.level = level.toUpperCase(); // Normalise le niveau en majuscules
    if (entityType) where.entityType = entityType;

    // Exécute 3 requêtes en parallèle pour optimiser les performances :
    const [logs, events, entityTypes] = await Promise.all([
      // 1. Récupère les logs avec les informations de l'utilisateur associé
      prisma.businessLog.findMany({
        where,
        orderBy: { createdAt: "desc" }, // Les plus récents d'abord
        take, // Limite le nombre de résultats
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
              o365Email: true,
              edEmail: true,
            },
          },
        },
      }),
      // 2. Récupère la liste distincte de tous les types d'événements existants (pour les filtres du front)
      prisma.businessLog.findMany({
        distinct: ["event"],
        orderBy: { event: "asc" },
        select: { event: true },
        take: 250,
      }),
      // 3. Récupère la liste distincte de tous les types d'entités existants (pour les filtres du front)
      prisma.businessLog.findMany({
        distinct: ["entityType"],
        where: { entityType: { not: null } },
        orderBy: { entityType: "asc" },
        select: { entityType: true },
        take: 250,
      }),
    ]);

    // Retourne les logs avec les filtres appliqués et les options de filtrage disponibles
    return res.json({
      filters: { take, userId, event, level, entityType }, // Filtres actuellement appliqués
      options: {
        events: events.map(row => row.event).filter(Boolean), // Liste des événements disponibles
        entityTypes: entityTypes.map(row => row.entityType).filter(Boolean), // Liste des types d'entités
        levels: ["ERROR", "WARNING", "INFO", "VERBOSE"], // Niveaux de log possibles
      },
      logs, // Les logs récupérés
    });
  } catch (err) {
    // En cas d'erreur, log et retourne une erreur 500
    log_technical(TECHNICAL_LEVELS.ERROR, "Business logs fetch failed", {
      error: err,
      userId: req.session?.user?.id,
      filters: req.query,
    });

    return res.status(500).json({
      error: "BUSINESS_LOGS_FETCH_FAILED",
      message: "Erreur lors du chargement des logs metier.",
    });
  }
});

// Exporte le routeur
module.exports = router;
