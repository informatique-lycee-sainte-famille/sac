// ./API_SAC/commons/logger.common.js
const LEVELS = {
  PRODUCTION: 0,
  WARNING: 1,
  INFO: 2,
  VERBOSE: 3,
};

const TECHNICAL_LEVELS = {
  ERROR: "ERROR",
  WARNING: "WARNING",
  INFO: "INFO",
  VERBOSE: "VERBOSE",
};

const LOG_DESTINATIONS = {
  CONSOLE: "console",
  DATABASE: "database",
  BOTH: "both",
};

let configured = false;
let originalConsole = null;

function getDebugMode() {
  const value = String(process.env.DEBUG || (process.env.ENV === "prod" ? "PRODUCTION" : "INFO")).toUpperCase();
  return Object.prototype.hasOwnProperty.call(LEVELS, value) ? value : "INFO";
}

function getDebugLevel() {
  return LEVELS[getDebugMode()];
}

function shouldLog(level) {
  const normalized = String(level || TECHNICAL_LEVELS.INFO).toUpperCase();
  if (normalized === TECHNICAL_LEVELS.ERROR) return true;
  if (normalized === TECHNICAL_LEVELS.WARNING) return getDebugLevel() >= LEVELS.WARNING;
  if (normalized === TECHNICAL_LEVELS.VERBOSE) return getDebugLevel() >= LEVELS.VERBOSE;
  return getDebugLevel() >= LEVELS.INFO;
}

function getOriginalConsole() {
  return originalConsole || console;
}

function normalizeError(error) {
  if (!error) return null;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: getDebugLevel() >= LEVELS.VERBOSE ? error.stack : undefined,
    };
  }

  return error;
}

function normalizeMeta(meta = {}) {
  if (!meta || typeof meta !== "object") return meta;

  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [
      key,
      value instanceof Error ? normalizeError(value) : value,
    ])
  );
}

function writeConsole(level, message, meta = {}) {
  if (!shouldLog(level)) return;

  const normalized = String(level || TECHNICAL_LEVELS.INFO).toUpperCase();
  const output = getOriginalConsole();
  const payload = Object.keys(meta || {}).length ? normalizeMeta(meta) : undefined;
  const prefix = `[${normalized}]`;

  if (normalized === TECHNICAL_LEVELS.ERROR) {
    payload ? output.error(prefix, message, payload) : output.error(prefix, message);
    return;
  }

  if (normalized === TECHNICAL_LEVELS.WARNING) {
    payload ? output.warn(prefix, message, payload) : output.warn(prefix, message);
    return;
  }

  if (normalized === TECHNICAL_LEVELS.VERBOSE) {
    payload ? output.debug(prefix, message, payload) : output.debug(prefix, message);
    return;
  }

  payload ? output.info(prefix, message, payload) : output.info(prefix, message);
}

function getRetentionDays() {
  const value = Number.parseInt(process.env.BUSINESS_LOG_RETENTION_DAYS || "30", 10);
  return Number.isInteger(value) && value > 0 ? value : 30;
}

function getPrisma() {
  return require("./prisma.common").prisma;
}

function getRequestContext(req) {
  return {
    userId: req?.session?.user?.id ? Number(req.session.user.id) : undefined,
    ipAddress: req?.ip,
    userAgent: req?.headers?.["user-agent"] ? String(req.headers["user-agent"]).slice(0, 500) : undefined,
  };
}

function configureConsole() {
  if (configured) return;
  configured = true;

  originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  console.log = (...args) => {
    if (shouldLog(TECHNICAL_LEVELS.INFO)) originalConsole.log(...args);
  };
  console.info = (...args) => {
    if (shouldLog(TECHNICAL_LEVELS.INFO)) originalConsole.info(...args);
  };
  console.debug = (...args) => {
    if (shouldLog(TECHNICAL_LEVELS.VERBOSE)) originalConsole.debug(...args);
  };
  console.warn = (...args) => {
    if (shouldLog(TECHNICAL_LEVELS.WARNING)) originalConsole.warn(...args);
  };
  console.error = (...args) => {
    originalConsole.error(...args);
  };
}

function log_technical(level, message, meta = {}) {
  writeConsole(level, message, meta);
}

async function log_business(event, message, options = {}) {
  const {
    destination = LOG_DESTINATIONS.DATABASE,
    level = TECHNICAL_LEVELS.INFO,
    req,
    userId,
    entityType,
    entityId,
    metadata,
  } = options;
  const requestContext = getRequestContext(req);
  const normalizedDestination = String(destination || LOG_DESTINATIONS.DATABASE).toLowerCase();
  const normalizedLevel = String(level || TECHNICAL_LEVELS.INFO).toUpperCase();
  const normalizedMetadata = normalizeMeta(metadata || {});

  if (normalizedDestination === LOG_DESTINATIONS.CONSOLE || normalizedDestination === LOG_DESTINATIONS.BOTH) {
    log_technical(normalizedLevel, message, {
      event,
      userId: userId || requestContext.userId,
      entityType,
      entityId,
      ...normalizedMetadata,
    });
  }

  if (normalizedDestination !== LOG_DESTINATIONS.DATABASE && normalizedDestination !== LOG_DESTINATIONS.BOTH) {
    return null;
  }

  try {
    return await getPrisma().businessLog.create({
      data: {
        event: String(event).slice(0, 160),
        message: String(message).slice(0, 1000),
        level: normalizedLevel,
        userId: userId || requestContext.userId || null,
        entityType: entityType ? String(entityType).slice(0, 80) : null,
        entityId: entityId === undefined || entityId === null ? null : String(entityId).slice(0, 120),
        metadata: Object.keys(normalizedMetadata).length ? normalizedMetadata : undefined,
        ipAddress: requestContext.ipAddress || null,
        userAgent: requestContext.userAgent || null,
      },
    });
  } catch (error) {
    log_technical(TECHNICAL_LEVELS.WARNING, "Business log persistence failed", {
      event,
      error,
    });
    return null;
  }
}

async function purge_business_logs(options = {}) {
  const retentionDays = options.retentionDays || getRetentionDays();
  const olderThan = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  try {
    const result = await getPrisma().businessLog.deleteMany({
      where: {
        createdAt: { lt: olderThan },
      },
    });

    log_technical(TECHNICAL_LEVELS.INFO, "Business logs purged", {
      deletedCount: result.count,
      retentionDays,
    });

    return result;
  } catch (error) {
    log_technical(TECHNICAL_LEVELS.WARNING, "Business log purge failed", { error, retentionDays });
    return { count: 0 };
  }
}

module.exports = {
  LOG_DESTINATIONS,
  TECHNICAL_LEVELS,
  configureConsole,
  getDebugMode,
  log_business,
  log_technical,
  purge_business_logs,
};
