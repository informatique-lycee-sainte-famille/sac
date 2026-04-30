// ./API_SAC/app.server.js
require("./commons/env.common");
const {
  LOG_DESTINATIONS,
  TECHNICAL_LEVELS,
  configureConsole,
  getDebugMode,
  log_business,
  log_technical,
  purge_business_logs,
} = require("./commons/logger.common");
configureConsole();
const networkFilter = require("./middlewares/network_filter.middleware");
const csrfProtection = require("./middlewares/csrf_protection.middleware");
const rateLimit = require("./middlewares/rate_limit.middleware");
const securityHeaders = require("./middlewares/security_headers.middleware");
const { prisma } = require("./commons/prisma.common");
const express = require("express");
const cron = require('node-cron');
const path = require("path");
const session = require("express-session");
const ipaddr = require('ipaddr.js');
const swaggerDocument = require('./swagger.openapi.json');
const { session_options } = require("./commons/session_config.common");
const { import_ed_data_to_db } = require("./workflows/import_ed_data_to_db.workflow");
const { process_ed_photo_queue } = require("../scripts/auto/download_ed_student_photo.script");

const adminRoutes = require("./routes/admin.route");
const attendanceRoutes = require("./routes/attendance.route");
const businessLogsRoutes = require("./routes/business_logs.route");
const classesRoutes = require("./routes/classes.route");
const documentationRoutes = require("./routes/documentation.route");
const nfcRoutes = require("./routes/nfc.route");
const o365Routes = require("./routes/o365.route");
const sessionsRoutes = require("./routes/sessions.route");
const systemRoutes = require("./routes/system.route");
const userRoutes = require("./routes/user.route");

const app = express();
const port = process.env.PORT || 3000;
const env = process.env.ENV || 'dev';
const lanSubnetValues = (process.env.LAN_SUBNETS || process.env.LAN_SUBNET || "")
  .split(",")
  .map(subnet => subnet.trim())
  .filter(Boolean);
const LAN_SUBNETS = lanSubnetValues.map(subnet => ipaddr.parseCIDR(subnet));
const trustProxy = process.env.TRUST_PROXY || "loopback";
const apiRateLimit = rateLimit({
  windowMs: 1000,
  max: Number(process.env.API_RATE_LIMIT_PER_SECOND || 10),
  keyGenerator: req => `api:${req.session?.user?.id || req.ip}`,
  message: "Trop de requetes API, veuillez patienter.",
});
const staticRateLimit = rateLimit({
  windowMs: 1000,
  max: Number(process.env.STATIC_RATE_LIMIT_PER_SECOND || 100),
  keyGenerator: req => `static:${req.ip}`,
  message: "Trop de requetes statiques, veuillez patienter.",
});

function firstForwardedValue(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)[0] || "";
}

function getExternalOrigin(req) {
  const configuredOrigin = process.env.ASSETLINKS_SITE || process.env.EXTERNAL_DOMAIN;
  if (configuredOrigin) {
    return configuredOrigin.replace(/\/+$/, "");
  }

  const proto =
    firstForwardedValue(req.headers["x-forwarded-proto"]) ||
    req.protocol ||
    (req.secure ? "https" : "http");
  const host =
    firstForwardedValue(req.headers["x-forwarded-host"]) ||
    req.get("host") ||
    `localhost:${port}`;

  return `${proto}://${host}`.replace(/\/+$/, "");
}

app.set('trust proxy', trustProxy);
app.disable("x-powered-by");
app.use(securityHeaders);
app.use(session(session_options));

const require_access = require("./middlewares/require_access.middleware");
const { ROLES } = require("./commons/constants.common");

app.use("/api", apiRateLimit);
app.use(express.json({ limit: "1mb", type: "application/json" }));
app.use(csrfProtection);
app.use("/api/o365", o365Routes);
// Serve static files from the React frontend app
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  return staticRateLimit(req, res, next);
});
app.get("/.well-known/assetlinks.json", (req, res) => {
  res.type("application/json").json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "web",
        site: getExternalOrigin(req),
      },
    },
  ]);
});
app.use(express.static(path.join(__dirname, "../front/public"),
  {
    extensions: ['html', 'json', 'png', 'svg', 'js', 'css'],
    dotfiles: 'ignore',
    index: "index.page.html",
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
    },
  }));

// Default: at least logged-in user (student)
app.use(require_access({ minRole: ROLES.STUDENT }));

// Global access filter middleware
app.use(
  networkFilter({
    env,
    LAN_SUBNETS,
  })
);

// mount routes
app.use("/api/admin", adminRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/business-logs", businessLogsRoutes);
app.use("/api/classes", classesRoutes);
app.use("/api/nfc", nfcRoutes);

app.use("/api/sessions", sessionsRoutes);
app.use("/api/system", systemRoutes);
app.use("/api/user", userRoutes);
app.use(
  "/api/documentation",
  documentationRoutes({
    swaggerDocument,
  })
);

app.use((err, req, res, next) => {
  log_technical(TECHNICAL_LEVELS.ERROR, "Unhandled request error", {
    method: req.method,
    path: req.path,
    error: err,
  });
  if (res.headersSent) return next(err);

  if (req.path.startsWith("/api/")) {
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Erreur serveur.",
    });
  }

  return res.status(500).send("Erreur serveur.");
});


setInterval(async () => {
  try {
    await prisma.browserSession.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    log_technical(TECHNICAL_LEVELS.VERBOSE, "Expired browser sessions cleaned");
  } catch (err) {
    log_technical(TECHNICAL_LEVELS.WARNING, "Browser session cleanup failed", { error: err });
  }
}, 1000 * 60 * 60);

purge_business_logs();
cron.schedule('30 3 * * *', () => {
  purge_business_logs();
});

// cron.schedule('15 2 * * *', () => {
//   process_ed_photo_queue({
//     delayMs: Number(process.env.ED_PHOTO_CACHE_DELAY_MS || 5000),
//     limit: Number(process.env.ED_PHOTO_CACHE_DAILY_LIMIT || 500),
//     timeoutMs: Number(process.env.ED_PHOTO_CACHE_TIMEOUT_MS || 15000),
//   }).catch(err => log_technical(TECHNICAL_LEVELS.WARNING, "Daily ED student photo cache failed", { error: err }));
// });

function getNextMonthEdtRange() {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 30);

  const format = date => date.toISOString().slice(0, 10);
  return `${format(start)}:${format(end)}`;
}

async function refreshNextMonthClassSchedule(reason) {
  const date = getNextMonthEdtRange();
  log_technical(TECHNICAL_LEVELS.INFO, "Refreshing next month class schedules", { date, reason });

  await import_ed_data_to_db(['EDT_CLASSE'], {
    edtClasse: { date },
  });

  await log_business("edt_class_refresh_completed", "Refresh des EDT classe effectué.", {
    destination: LOG_DESTINATIONS.BOTH,
    entityType: "EDT_CLASSE",
    entityId: date,
    metadata: { date, reason },
  });
}

// run importdatatodb workflow on startup and every day at 6am
import_ed_data_to_db(['SALLES', 'CLASSES', 'USERS'])
  .then(() => refreshNextMonthClassSchedule("startup"))
  .catch(err => {
    log_technical(TECHNICAL_LEVELS.ERROR, "Initial ED import failed", { error: err });
  });

cron.schedule('0 6 * * *', () => {
  import_ed_data_to_db(['SALLES', 'CLASSES', 'USERS'])
    .then(() => refreshNextMonthClassSchedule("daily cron"))
    .catch(err => log_technical(TECHNICAL_LEVELS.ERROR, "Daily ED import cron failed", { error: err }));
});

cron.schedule('*/5 * * * *', () => {
  import_ed_data_to_db(['EDT_CLASSE'])
    .catch(err => log_technical(TECHNICAL_LEVELS.WARNING, "Frequent EDT import cron failed", { error: err }));
});

const server = app.listen(port, () => {
  log_technical(TECHNICAL_LEVELS.INFO, `SAC server is running on http://localhost:${port}`);
  log_technical(TECHNICAL_LEVELS.INFO, `Backend debug level: ${getDebugMode()}`);
});
