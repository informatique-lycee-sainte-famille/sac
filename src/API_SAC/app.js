//app.js

require("./commons/env");
const { configureConsole, getDebugMode } = require("./commons/logger");
configureConsole();
const networkFilter = require("./middlewares/network_filter");
const csrfProtection = require("./middlewares/csrf_protection");
const rateLimit = require("./middlewares/rate_limit");
const securityHeaders = require("./middlewares/security_headers");
const { prisma } = require("./commons/prisma");
const express = require("express");
const cron = require('node-cron');
const path = require("path");
const session = require("express-session");
const ipaddr = require('ipaddr.js');
const swaggerDocument = require('./swagger.json');
const { sessionOptions } = require("./commons/sessionConfig");
const { importEDDataToDB } = require("./workflows/importEDDataToDB");

const adminRoutes = require("./routes/admin");
const attendanceRoutes = require("./routes/attendance");
const classesRoutes = require("./routes/classes");
const documentationRoutes = require("./routes/documentation");
const nfcRoutes = require("./routes/nfc");
const o365Routes = require("./routes/o365");
const sessionsRoutes = require("./routes/sessions");
const systemRoutes = require("./routes/system");
const userRoutes = require("./routes/user");

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

app.set('trust proxy', trustProxy);
app.disable("x-powered-by");
app.use(securityHeaders);
app.use(session(sessionOptions));

const require_access = require("./middlewares/require_access");
const { ROLES } = require("./commons/constants");

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
  res.sendFile(path.join(__dirname, "../front/public/.well-known/assetlinks.json"));
});
app.use(express.static(path.join(__dirname, "../front/public"),
  {
    extensions: ['html', 'json', 'png', 'svg', 'js', 'css'],
    dotfiles: 'ignore',
    index: "index.html",
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
app.use("/api/classes", classesRoutes);
app.use("/api/nfc", nfcRoutes);

app.use("/api/sessions", sessionsRoutes);
app.use("/api/system", systemRoutes);
app.use("/api/user", userRoutes);
app.use(
  "/api/documentation",
  documentationRoutes({
    swaggerDocument,
    env,
    port,
  })
);

app.use((err, req, res, next) => {
  console.error("Unhandled request error:", err.message);
  if (res.headersSent) return next(err);

  if (req.path.startsWith("/api/")) {
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Erreur serveur.",
    });
  }

  return res.status(500).send("Erreur serveur.");
});


// 🧹 Cleanup expired sessions every hour
setInterval(async () => {
  try {
    await prisma.browserSession.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    console.log("🧹 Expired sessions cleaned");
  } catch (err) {
    console.error("Session cleanup error:", err.message);
  }
}, 1000 * 60 * 60);

function getNextMonthEdtRange() {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 30);

  const format = date => date.toISOString().slice(0, 10);
  return `${format(start)}:${format(end)}`;
}

async function refreshNextMonthClassSchedule(reason) {
  const date = getNextMonthEdtRange();
  console.log(`📅 Refreshing EDT_CLASSE for next month (${date}) - ${reason}`);

  await importEDDataToDB(['EDT_CLASSE'], {
    edtClasse: { date },
  });
}

// run importdatatodb workflow on startup and every day at 6am
importEDDataToDB(['SALLES', 'CLASSES', 'USERS'])
  .then(() => refreshNextMonthClassSchedule("startup"))
  .catch(err => {
    console.error("Error during initial ED import:", err.message);
  });

cron.schedule('0 6 * * *', () => {
  importEDDataToDB(['SALLES', 'CLASSES', 'USERS'])
    .then(() => refreshNextMonthClassSchedule("daily cron"))
    .catch(err => console.error("Cron import error:", err.message));
});

cron.schedule('*/5 * * * *', () => {
  importEDDataToDB(['EDT_CLASSE'])
    .catch(err => console.error("Cron import error:", err.message));
});

const server = app.listen(port, () => {
  console.log(`SAC server is running on http://localhost:${port}`);
  console.info(`Backend debug level: ${getDebugMode()}`);
});
