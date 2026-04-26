//app.js

require("./commons/env");
const networkFilter = require("./middlewares/network_filter");
const { prisma } = require("./commons/prisma");
const express = require("express");
const cron = require('node-cron');
const bodyParser = require("body-parser");
const path = require("path");
const session = require("express-session");
const swaggerUi = require('swagger-ui-express');
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
const allowedPaths = ['/api/o365', '/api/documentation'];
const LAN_SUBNET = ipaddr.parseCIDR(process.env.LAN_SUBNET); 

app.set('trust proxy', true);
app.use(bodyParser.json());
app.use(session(sessionOptions));

const require_access = require("./middlewares/require_access");
const { ROLES } = require("./commons/constants");

app.use("/api/o365", o365Routes);
// Serve static files from the React frontend app
app.use(express.static(path.join(__dirname, "../front/public"),
  { extensions: ['html', 'json', 'png', 'svg', 'js', 'css'], dotfiles: 'allow' }));

// Default: at least logged-in user (student)
app.use(require_access({ minRole: ROLES.STUDENT }));

// Global access filter middleware
app.use(
  networkFilter({
    env,
    LAN_SUBNET,
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

// run importdatatodb workflow on startup and every day at 6am
importEDDataToDB(['SALLES', 'CLASSES', 'USERS', 'EDT_CLASSE']).catch(err => {
  console.error("Error during initial ED import:", err.message);
});

cron.schedule('0 6 * * *', () => {
  importEDDataToDB(['SALLES', 'CLASSES', 'USERS', 'EDT_CLASSE'])
    .catch(err => console.error("Cron import error:", err.message));
});

cron.schedule('*/5 * * * *', () => {
  importEDDataToDB(['EDT_CLASSE'])
    .catch(err => console.error("Cron import error:", err.message));
});

const server = app.listen(port, () => {
  console.log(`SAC server is running on http://localhost:${port}`);
});
