//app.js

require("./commons/env");
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const session = require("express-session");
const swaggerUi = require('swagger-ui-express');
const ipaddr = require('ipaddr.js');
const swaggerDocument = require('./swagger.json');
const { sessionOptions } = require("./commons/sessionConfig");

const adminRoutes = require("./routes/admin");
const attendanceRoutes = require("./routes/attendance");
const classesRoutes = require("./routes/classes");
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

// Global access filter middleware
app.use((req, res, next) => {
    try {
        let clientIp = req.ip;

        // console.log(`Received request from IP: ${clientIp} for path: ${req.path}`);

        const jobTitle = req.session?.userInfo?.jobTitle?.toUpperCase();

        if (env === 'dev' && (clientIp === '::1' || clientIp === '127.0.0.1')) {
            return next();
        }

        if (!clientIp || !jobTitle) return next();

        let parsedIp = ipaddr.parse(clientIp);

        // Convert IPv4-mapped IPv6 (::ffff:10.29.x.x) to IPv4
        if (parsedIp.kind() === 'ipv6' && parsedIp.isIPv4MappedAddress()) {
            parsedIp = parsedIp.toIPv4Address();
        }

        // If still IPv6 (like ::1), skip LAN check in dev
        if (parsedIp.kind() !== LAN_SUBNET[0].kind()) {
            console.log("IP version mismatch, skipping LAN check");
            return next();
        }

        const isInLan = parsedIp.match(LAN_SUBNET);

        console.log(
            `IP: ${parsedIp.toString()} | Job: ${jobTitle} | LAN: ${isInLan}`
        );

        if (jobTitle === "ELEVE" && !isInLan) {
            console.warn(`Blocked ELEVE outside LAN: ${parsedIp.toString()}`);

            return res
                .status(403)
                .sendFile(path.join(__dirname, "../front/public/errors/403.html"));
        }

        next();
    } catch (err) {
        console.error("IP filter error:", err.message);
        return res.status(500).send("Internal Server Error");
    }
});

// Set the correct host based on the environment
try {
    if (env === 'dev') {
        swaggerDocument.host = `localhost:${port}`;
        swaggerDocument.schemes = ['http'];
    } else if (env === 'prod') {
        swaggerDocument.host = process.env.EXTERNAL_DOMAIN.split('://')[1];
        swaggerDocument.schemes = [process.env.EXTERNAL_DOMAIN.split('://')[0]];
    }
} catch (error) {
    console.error("Erreur lors de la configuration de Swagger:", error.message);
}

//// DOCS ROUTE ////
try {
    app.use('/api/documentation', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (error) {
    console.error("Erreur lors de la configuration de Swagger UI:", error.message);
}
//// DOCS ROUTE ////

// mount routes

app.use("/api/admin", adminRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/classes", classesRoutes);
app.use("/api/nfc", nfcRoutes);
app.use("/api/o365", o365Routes);
app.use("/api/sessions", sessionsRoutes);
app.use("/api/system", systemRoutes);
app.use("/api/user", userRoutes);

// Serve static files from the React frontend app
app.use(express.static(path.join(__dirname, "../front/public"),
  { extensions: ['html', 'json', 'png', 'svg', 'js', 'css'], dotfiles: 'allow' }));

const server = app.listen(port, () => {
  console.log(`SAC server is running on http://localhost:${port}`);
});
