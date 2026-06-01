// ./API_SAC/commons/logger.common.js

// Niveaux de debug pour contrôler la verbosité des logs dans la console.
// Plus la valeur est basse, moins de logs sont affichés.
const LEVELS = {
  PRODUCTION: 0, // Mode production : seulement les erreurs
  WARNING: 1, // Avertissements + erreurs
  INFO: 2, // Informations + avertissements + erreurs
  VERBOSE: 3, // Tout est loggé (mode debug complet)
};

// Niveaux techniques utilisés comme étiquettes pour chaque message de log
const TECHNICAL_LEVELS = {
  ERROR: "ERROR", // Erreur critique
  WARNING: "WARNING", // Avertissement
  INFO: "INFO", // Information
  VERBOSE: "VERBOSE", // Détail (debug)
};

// Destinations possibles pour les logs métier (business logs)
const LOG_DESTINATIONS = {
  CONSOLE: "console", // Seulement dans la console
  DATABASE: "database", // Seulement dans la base de données
  BOTH: "both", // Console + base de données
};

// Indique si la console a déjà été reconfigurée (pour éviter de le faire deux fois)
let configured = false;
// Stocke les fonctions console originales avant remplacement
let originalConsole = null;

// Détermine le mode de debug actuel en lisant les variables d'environnement DEBUG ou ENV
function getDebugMode() {
  // En production, on utilise le mode PRODUCTION par défaut, sinon INFO
  const value = String(process.env.DEBUG || (process.env.ENV === "prod" ? "PRODUCTION" : "INFO")).toUpperCase();
  // Vérifie que la valeur est un niveau valide, sinon utilise INFO par défaut
  return Object.prototype.hasOwnProperty.call(LEVELS, value) ? value : "INFO";
}

// Retourne la valeur numérique du niveau de debug actuel
function getDebugLevel() {
  return LEVELS[getDebugMode()];
}

// Détermine si un message d'un certain niveau doit être affiché selon la config actuelle
function shouldLog(level) {
  // Normalise le niveau en majuscules
  const normalized = String(level || TECHNICAL_LEVELS.INFO).toUpperCase();
  // Les erreurs sont toujours affichées
  if (normalized === TECHNICAL_LEVELS.ERROR) return true;
  // Les warnings sont affichés si le niveau est >= WARNING
  if (normalized === TECHNICAL_LEVELS.WARNING) return getDebugLevel() >= LEVELS.WARNING;
  // Le mode verbose est affiché si le niveau est >= VERBOSE
  if (normalized === TECHNICAL_LEVELS.VERBOSE) return getDebugLevel() >= LEVELS.VERBOSE;
  // Par défaut (INFO), affiché si le niveau est >= INFO
  return getDebugLevel() >= LEVELS.INFO;
}

// Retourne les fonctions console originales (avant remplacement), ou la console normale si pas encore configurée
function getOriginalConsole() {
  return originalConsole || console;
}

// Transforme un objet Error en un objet JSON sérialisable
function normalizeError(error) {
  if (!error) return null;
  // Si c'est une instance d'Error, extrait le nom, message et stack (stack seulement en mode verbose)
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: getDebugLevel() >= LEVELS.VERBOSE ? error.stack : undefined,
    };
  }

  // Si ce n'est pas un Error standard, on le retourne tel quel
  return error;
}

// Normalise les métadonnées en convertissant les instances d'Error en objets sérialisables
function normalizeMeta(meta = {}) {
  if (!meta || typeof meta !== "object") return meta;

  // Parcourt chaque entrée et normalise les valeurs qui sont des Error
  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [
      key,
      value instanceof Error ? normalizeError(value) : value,
    ])
  );
}

// Écrit un message dans la console avec le bon niveau (error, warn, info, debug)
function writeConsole(level, message, meta = {}) {
  // Vérifie si ce niveau de log doit être affiché
  if (!shouldLog(level)) return;

  // Normalise le niveau
  const normalized = String(level || TECHNICAL_LEVELS.INFO).toUpperCase();
  // Récupère les fonctions console originales
  const output = getOriginalConsole();
  // Prépare les métadonnées (seulement si elles ne sont pas vides)
  const payload = Object.keys(meta || {}).length ? normalizeMeta(meta) : undefined;
  // Préfixe le message avec le niveau entre crochets (ex: [ERROR])
  const prefix = `[${normalized}]`;

  // Utilise console.error pour les erreurs
  if (normalized === TECHNICAL_LEVELS.ERROR) {
    payload ? output.error(prefix, message, payload) : output.error(prefix, message);
    return;
  }

  // Utilise console.warn pour les avertissements
  if (normalized === TECHNICAL_LEVELS.WARNING) {
    payload ? output.warn(prefix, message, payload) : output.warn(prefix, message);
    return;
  }

  // Utilise console.debug pour le mode verbose
  if (normalized === TECHNICAL_LEVELS.VERBOSE) {
    payload ? output.debug(prefix, message, payload) : output.debug(prefix, message);
    return;
  }

  // Utilise console.info pour le reste (INFO)
  payload ? output.info(prefix, message, payload) : output.info(prefix, message);
}

// Retourne le nombre de jours de rétention des logs métier (par défaut 30 jours)
function getRetentionDays() {
  const value = Number.parseInt(process.env.BUSINESS_LOG_RETENTION_DAYS || "30", 10);
  return Number.isInteger(value) && value > 0 ? value : 30;
}

// Charge le client Prisma de manière paresseuse (évite les imports circulaires)
function getPrisma() {
  return require("./prisma.common").prisma;
}

// Extrait le contexte de la requête HTTP pour enrichir les logs métier
function getRequestContext(req) {
  return {
    userId: req?.session?.user?.id ? Number(req.session.user.id) : undefined, // ID de l'utilisateur connecté
    ipAddress: req?.ip, // Adresse IP du client
    userAgent: req?.headers?.["user-agent"] ? String(req.headers["user-agent"]).slice(0, 500) : undefined, // User-Agent (tronqué à 500 caractères)
  };
}

// Reconfigure les fonctions console.log/info/debug/warn/error pour filtrer selon le niveau de debug.
// Cela permet de contrôler globalement la verbosité de tous les console.log du projet.
function configureConsole() {
  // Empêche la double configuration
  if (configured) return;
  configured = true;

  // Sauvegarde les fonctions console originales avant de les remplacer
  originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  // Remplace console.log : ne s'affiche que si le niveau INFO est activé
  console.log = (...args) => {
    if (shouldLog(TECHNICAL_LEVELS.INFO)) originalConsole.log(...args);
  };
  // Remplace console.info : ne s'affiche que si le niveau INFO est activé
  console.info = (...args) => {
    if (shouldLog(TECHNICAL_LEVELS.INFO)) originalConsole.info(...args);
  };
  // Remplace console.debug : ne s'affiche que si le niveau VERBOSE est activé
  console.debug = (...args) => {
    if (shouldLog(TECHNICAL_LEVELS.VERBOSE)) originalConsole.debug(...args);
  };
  // Remplace console.warn : ne s'affiche que si le niveau WARNING est activé
  console.warn = (...args) => {
    if (shouldLog(TECHNICAL_LEVELS.WARNING)) originalConsole.warn(...args);
  };
  // console.error reste toujours affiché (les erreurs ne sont jamais filtrées)
  console.error = (...args) => {
    originalConsole.error(...args);
  };
}

// Écrit un log technique dans la console (wrapper simplifié de writeConsole)
function log_technical(level, message, meta = {}) {
  writeConsole(level, message, meta);
}

// Écrit un log métier (business log) dans la console et/ou la base de données.
// Les logs métier sont des événements importants de l'application (connexion, scan NFC, envoi d'appel, etc.)
async function log_business(event, message, options = {}) {
  // Destructure les options avec des valeurs par défaut
  const {
    destination = LOG_DESTINATIONS.DATABASE, // Destination par défaut : base de données
    level = TECHNICAL_LEVELS.INFO, // Niveau par défaut : INFO
    req, // Objet requête Express (optionnel, pour extraire l'IP et le user-agent)
    userId, // ID de l'utilisateur concerné
    entityType, // Type d'entité concernée (ex: "User", "CourseSession")
    entityId, // ID de l'entité concernée
    metadata, // Métadonnées supplémentaires (objet JSON libre)
  } = options;
  // Extrait le contexte de la requête (IP, user-agent, userId)
  const requestContext = getRequestContext(req);
  // Normalise la destination
  const normalizedDestination = String(destination || LOG_DESTINATIONS.DATABASE).toLowerCase();
  // Normalise le niveau
  const normalizedLevel = String(level || TECHNICAL_LEVELS.INFO).toUpperCase();
  // Normalise les métadonnées (convertit les Error en objets sérialisables)
  const normalizedMetadata = normalizeMeta(metadata || {});

  // Si la destination inclut la console, on écrit dans la console
  if (normalizedDestination === LOG_DESTINATIONS.CONSOLE || normalizedDestination === LOG_DESTINATIONS.BOTH) {
    log_technical(normalizedLevel, message, {
      event,
      userId: userId || requestContext.userId,
      entityType,
      entityId,
      ...normalizedMetadata,
    });
  }

  // Si la destination n'inclut PAS la base de données, on s'arrête là
  if (normalizedDestination !== LOG_DESTINATIONS.DATABASE && normalizedDestination !== LOG_DESTINATIONS.BOTH) {
    return null;
  }

  // Enregistre le log métier dans la table BusinessLog de la base de données
  try {
    return await getPrisma().businessLog.create({
      data: {
        event: String(event).slice(0, 160), // Nom de l'événement (tronqué à 160 caractères)
        message: String(message).slice(0, 1000), // Message descriptif (tronqué à 1000 caractères)
        level: normalizedLevel, // Niveau du log
        userId: userId || requestContext.userId || null, // ID de l'utilisateur
        entityType: entityType ? String(entityType).slice(0, 80) : null, // Type d'entité
        entityId: entityId === undefined || entityId === null ? null : String(entityId).slice(0, 120), // ID de l'entité
        metadata: Object.keys(normalizedMetadata).length ? normalizedMetadata : undefined, // Métadonnées JSON
        ipAddress: requestContext.ipAddress || null, // Adresse IP
        userAgent: requestContext.userAgent || null, // User-Agent
      },
    });
  } catch (error) {
    // Si l'écriture en BDD échoue, on log un warning dans la console (mais on ne plante pas l'app)
    log_technical(TECHNICAL_LEVELS.WARNING, "Business log persistence failed", {
      event,
      error,
    });
    return null;
  }
}

// Purge (supprime) les anciens logs métier de la base de données selon la durée de rétention configurée
async function purge_business_logs(options = {}) {
  // Nombre de jours de rétention (par défaut : valeur de la variable d'environnement ou 30)
  const retentionDays = options.retentionDays || getRetentionDays();
  // Calcule la date limite : tous les logs plus anciens que cette date seront supprimés
  const olderThan = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  try {
    // Supprime tous les logs métier créés avant la date limite
    const result = await getPrisma().businessLog.deleteMany({
      where: {
        createdAt: { lt: olderThan },
      },
    });

    // Log le résultat de la purge
    log_technical(TECHNICAL_LEVELS.INFO, "Business logs purged", {
      deletedCount: result.count,
      retentionDays,
    });

    return result;
  } catch (error) {
    // En cas d'erreur, on log un warning mais on ne plante pas l'app
    log_technical(TECHNICAL_LEVELS.WARNING, "Business log purge failed", { error, retentionDays });
    return { count: 0 };
  }
}

// Exporte les fonctions et constantes du module de logging
module.exports = {
  LOG_DESTINATIONS,
  TECHNICAL_LEVELS,
  configureConsole,
  getDebugMode,
  log_business,
  log_technical,
  purge_business_logs,
};
