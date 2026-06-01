// ./API_SAC/app.server.js
// Point d'entrée principal du serveur SAC (Saintonge Access Control).
// Ce fichier orchestre tous les middlewares, routes, tâches planifiées et le serveur HTTP.

// Charge les variables d'environnement depuis le fichier .env
require("./commons/env.common");
// Importe le système de logging (fonctions de log, niveaux, purge)
const {
  LOG_DESTINATIONS,
  TECHNICAL_LEVELS,
  configureConsole,
  getDebugMode,
  log_business,
  log_technical,
  purge_business_logs,
} = require("./commons/logger.common");
// Configure la console pour filtrer les logs selon le niveau de debug défini dans .env
configureConsole();
// Importe les middlewares de sécurité et de performance
const networkFilter = require("./middlewares/network_filter.middleware"); // Filtrage réseau (LAN uniquement pour les élèves)
const csrfProtection = require("./middlewares/csrf_protection.middleware"); // Protection CSRF
const rateLimit = require("./middlewares/rate_limit.middleware"); // Limitation de débit
const securityHeaders = require("./middlewares/security_headers.middleware"); // En-têtes de sécurité HTTP
// Importe le client Prisma (ORM base de données)
const { prisma } = require("./commons/prisma.common");
// Importe Express (framework web)
const express = require("express");
// Importe node-cron pour les tâches planifiées (cron jobs)
const cron = require('node-cron');
// Importe le module path pour la manipulation de chemins de fichiers
const path = require("path");
// Importe express-session pour la gestion des sessions utilisateur
const session = require("express-session");
// Importe ipaddr.js pour parser les sous-réseaux CIDR
const ipaddr = require('ipaddr.js');
// Importe le document Swagger (spécification OpenAPI de l'API)
const swaggerDocument = require('./swagger.openapi.json');
// Importe la configuration des sessions Express (durée, cookie, store Prisma)
const { session_options } = require("./commons/session_config.common");
// Importe le workflow d'import des données EcoleDirecte vers la base de données
const { import_ed_data_to_db } = require("./workflows/import_ed_data_to_db.workflow");
// Importe la gestion du WebSocket temps réel (pour les mises à jour de présence en direct)
const { handleRealtimeUpgrade } = require("./commons/realtime.common");
// Importe le traitement de la file d'attente des photos ED à télécharger
const { process_ed_photo_queue } = require("../scripts/auto/download_ed_student_photo.script");

// ═══════════════════════════════════════════════════════════════
// IMPORT DES ROUTES
// ═══════════════════════════════════════════════════════════════

const adminRoutes = require("./routes/admin.route"); // Routes d'administration (CRUD utilisateurs, sessions, etc.)
const attendanceRoutes = require("./routes/attendance.route"); // Routes pour les PDF de présence journaliers
const businessLogsRoutes = require("./routes/business_logs.route"); // Routes de consultation des logs métier
const classesRoutes = require("./routes/classes.route"); // Routes de gestion des classes
const documentationRoutes = require("./routes/documentation.route"); // Route Swagger UI
const nfcRoutes = require("./routes/nfc.route"); // Routes de scan NFC
const o365Routes = require("./routes/o365.route"); // Routes d'authentification Office 365
const sessionsRoutes = require("./routes/sessions.route"); // Routes des sessions de cours
const systemRoutes = require("./routes/system.route"); // Routes système (health check)
const userRoutes = require("./routes/user.route"); // Routes utilisateur (profil, liste enseignants)

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION DE L'APPLICATION EXPRESS
// ═══════════════════════════════════════════════════════════════

// Crée l'application Express
const app = express();
// Port d'écoute du serveur (par défaut 3000)
const port = process.env.PORT || 3000;
// Environnement (dev ou prod)
const env = process.env.ENV || 'dev';
// Parse les sous-réseaux LAN autorisés depuis la variable d'environnement (séparés par des virgules)
const lanSubnetValues = (process.env.LAN_SUBNETS || process.env.LAN_SUBNET || "")
  .split(",")
  .map(subnet => subnet.trim())
  .filter(Boolean);
// Convertit les sous-réseaux en objets CIDR parsés par ipaddr.js
const LAN_SUBNETS = lanSubnetValues.map(subnet => ipaddr.parseCIDR(subnet));
// Configuration du proxy de confiance (pour récupérer la vraie IP du client derrière un reverse proxy)
const trustProxy = process.env.TRUST_PROXY || "loopback";
// Limiteur de débit pour les routes API (par défaut 10 requêtes/seconde par utilisateur ou IP)
const apiRateLimit = rateLimit({
  windowMs: 1000, // Fenêtre de 1 seconde
  max: Number(process.env.API_RATE_LIMIT_PER_SECOND || 10), // Maximum de requêtes par fenêtre
  keyGenerator: req => `api:${req.session?.user?.id || req.ip}`, // Identifie le client par ID utilisateur ou IP
  message: "Trop de requetes API, veuillez patienter.",
});
// Limiteur de débit pour les fichiers statiques (par défaut 100 requêtes/seconde par IP)
const staticRateLimit = rateLimit({
  windowMs: 1000,
  max: Number(process.env.STATIC_RATE_LIMIT_PER_SECOND || 100),
  keyGenerator: req => `static:${req.ip}`, // Identifie le client par IP uniquement
  message: "Trop de requetes statiques, veuillez patienter.",
});

// ═══════════════════════════════════════════════════════════════
// FONCTIONS UTILITAIRES
// ═══════════════════════════════════════════════════════════════

// Extrait la première valeur d'un en-tête HTTP "forwarded" (peut contenir plusieurs valeurs séparées par des virgules)
function firstForwardedValue(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)[0] || "";
}

// Supprime les slashes finaux d'une URL (ex: "https://example.com/" → "https://example.com")
function removeTrailingSlashes(value) {
  let result = String(value || "").trim();

  while (result.endsWith("/")) {
    result = result.slice(0, -1);
  }

  return result;
}

// Détermine l'URL externe du serveur (pour les asset links Android, le sitemap, etc.)
// Utilise la variable d'environnement ASSETLINKS_SITE ou EXTERNAL_DOMAIN si configurée,
// sinon reconstruit l'URL depuis les en-têtes de la requête
function getExternalOrigin(req) {
  const configuredOrigin = process.env.ASSETLINKS_SITE || process.env.EXTERNAL_DOMAIN;
  if (configuredOrigin) {
    return removeTrailingSlashes(configuredOrigin);
  }

  // Détecte le protocole (http/https) en tenant compte des proxys
  const proto =
    firstForwardedValue(req.headers["x-forwarded-proto"]) ||
    req.protocol ||
    (req.secure ? "https" : "http");
  // Détecte le host en tenant compte des proxys
  const host =
    firstForwardedValue(req.headers["x-forwarded-host"]) ||
    req.get("host") ||
    `localhost:${port}`;

  return removeTrailingSlashes(`${proto}://${host}`);
}

// ═══════════════════════════════════════════════════════════════
// MIDDLEWARES GLOBAUX (appliqués à TOUTES les requêtes)
// ═══════════════════════════════════════════════════════════════

// Configure la confiance des proxys (nécessaire pour récupérer la vraie IP)
app.set('trust proxy', trustProxy);
// Désactive l'en-tête X-Powered-By (ne pas révéler qu'on utilise Express)
app.disable("x-powered-by");
// Applique les en-têtes de sécurité HTTP (CSP, HSTS, X-Frame-Options, etc.)
app.use(securityHeaders);
// Active la gestion des sessions Express (stockées en base via Prisma)
app.use(session(session_options));

// Importe le middleware d'accès et les constantes de rôles
const require_access = require("./middlewares/require_access.middleware");
const { ROLES } = require("./commons/constants.common");

// ═══════════════════════════════════════════════════════════════
// ROUTES PUBLIQUES ET SEMI-PUBLIQUES
// ═══════════════════════════════════════════════════════════════

// Applique le rate limiting aux routes API
app.use("/api", apiRateLimit);
// Parse le corps des requêtes JSON (limite à 1 Mo)
app.use(express.json({ limit: "1mb", type: "application/json" }));
// Applique la protection CSRF (vérifie le jeton pour les requêtes non-sûres)
app.use(csrfProtection);
// Monte les routes OAuth Office 365 (login/redirect/logout) — AVANT le middleware d'accès
// car l'utilisateur n'est pas encore connecté quand il arrive sur /login
app.use("/api/o365", o365Routes);

// Applique le rate limiting aux fichiers statiques (mais pas aux routes API)
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next(); // Les routes API ont déjà leur propre rate limit
  return staticRateLimit(req, res, next);
});

// Route /.well-known/assetlinks.json : fichier de vérification Android (Digital Asset Links)
// Permet à une application Android de se lier à ce site web
app.get("/.well-known/assetlinks.json", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600"); // Cache 1 heure
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

// Route /robots.txt : indique aux moteurs de recherche de ne pas indexer l'API
app.get("/robots.txt", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.type("text/plain").send("User-agent: *\nDisallow: /api/\n");
});

// Route /sitemap.xml : plan du site pour les moteurs de recherche
app.get("/sitemap.xml", (req, res) => {
  const origin = getExternalOrigin(req);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.type("application/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `  <url><loc>${origin}/</loc></url>\n` +
    `  <url><loc>${origin}/legal-notice</loc></url>\n` +
    `  <url><loc>${origin}/privacy-policy</loc></url>\n` +
    `</urlset>\n`
  );
});

// Sert les fichiers statiques du front-end (HTML, CSS, JS, images)
app.use(express.static(path.join(__dirname, "../front/public"),
  {
    extensions: ['html', 'json', 'png', 'svg', 'js', 'css'], // Extensions autorisées
    dotfiles: 'ignore', // Ignore les fichiers commençant par un point
    index: "index.page.html", // Page d'accueil par défaut
    // Personnalise les en-têtes de cache selon le type de fichier
    setHeaders: (res, filePath) => {
      res.setHeader("X-Content-Type-Options", "nosniff"); // Protection MIME sniffing
      if (filePath.endsWith(".html")) {
        // Les fichiers HTML ne sont jamais mis en cache (toujours la version à jour)
        res.setHeader("Cache-Control", "no-cache");
      } else if (
        // Les fichiers JS critiques ne sont pas mis en cache (pour forcer les mises à jour)
        filePath.endsWith(path.join("front", "public", "script.app.js")) ||
        filePath.endsWith(path.join("front", "public", "js", "component_loader.loader.js")) ||
        filePath.endsWith(path.join("front", "public", "sw.service_worker.js"))
      ) {
        res.setHeader("Cache-Control", "no-cache, max-age=0, must-revalidate");
      } else {
        // Les autres fichiers statiques sont mis en cache 1 heure
        res.setHeader("Cache-Control", "public, max-age=3600");
      }
    },
  }));

// ═══════════════════════════════════════════════════════════════
// MIDDLEWARES D'AUTHENTIFICATION (à partir d'ici, l'utilisateur DOIT être connecté)
// ═══════════════════════════════════════════════════════════════

// Exige que l'utilisateur soit au minimum un élève (STUDENT) pour accéder aux routes suivantes
app.use(require_access({ minRole: ROLES.STUDENT }));

// Applique le filtre réseau : les élèves doivent être sur le LAN de l'établissement
app.use(
  networkFilter({
    env, // Environnement (dev/prod)
    LAN_SUBNETS, // Sous-réseaux autorisés
  })
);

// ═══════════════════════════════════════════════════════════════
// MONTAGE DES ROUTES API PROTÉGÉES
// ═══════════════════════════════════════════════════════════════

app.use("/api/admin", adminRoutes); // Routes d'administration (ADMIN uniquement)
app.use("/api/attendance", attendanceRoutes); // Routes de présence (PDF journalier)
app.use("/api/business-logs", businessLogsRoutes); // Routes de logs métier (STAFF+)
app.use("/api/classes", classesRoutes); // Routes des classes
app.use("/api/nfc", nfcRoutes); // Routes NFC (scan, finalisation)

app.use("/api/sessions", sessionsRoutes); // Routes des sessions de cours
app.use("/api/system", systemRoutes); // Routes système (health check)
app.use("/api/user", userRoutes); // Routes utilisateur (profil)
// Route de documentation Swagger UI (ADMIN uniquement)
app.use(
  "/api/documentation",
  documentationRoutes({
    swaggerDocument,
  })
);

// ═══════════════════════════════════════════════════════════════
// GESTIONNAIRE D'ERREURS GLOBAL
// ═══════════════════════════════════════════════════════════════

// Middleware de gestion d'erreurs Express (4 arguments = error handler)
// Attrape toutes les erreurs non gérées par les routes
app.use((err, req, res, next) => {
  // Log l'erreur avec les détails de la requête
  log_technical(TECHNICAL_LEVELS.ERROR, "Unhandled request error", {
    method: req.method,
    path: req.path,
    error: err,
  });
  // Si les en-têtes ont déjà été envoyés, on ne peut plus répondre → passe au handler suivant
  if (res.headersSent) return next(err);

  // Pour les routes API, retourne du JSON
  if (req.path.startsWith("/api/")) {
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Erreur serveur.",
    });
  }

  // Pour les autres routes, retourne du texte brut
  return res.status(500).send("Erreur serveur.");
});

// ═══════════════════════════════════════════════════════════════
// TÂCHES PLANIFIÉES (CRON JOBS)
// ═══════════════════════════════════════════════════════════════

// Nettoyage des sessions de navigateur expirées toutes les heures
setInterval(async () => {
  try {
    // Supprime toutes les sessions dont la date d'expiration est passée
    await prisma.browserSession.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    log_technical(TECHNICAL_LEVELS.VERBOSE, "Expired browser sessions cleaned");
  } catch (err) {
    log_technical(TECHNICAL_LEVELS.WARNING, "Browser session cleanup failed", { error: err });
  }
}, 1000 * 60 * 60); // 1 heure = 3 600 000 ms

// Purge des anciens logs métier au démarrage du serveur
purge_business_logs();
// Purge des anciens logs métier tous les jours à 3h30 du matin
cron.schedule('30 3 * * *', () => {
  purge_business_logs();
});

// Mise en cache des photos EcoleDirecte des élèves tous les jours à 2h15 du matin
cron.schedule('15 2 * * *', () => {
  process_ed_photo_queue({
    delayMs: Number(process.env.ED_PHOTO_CACHE_DELAY_MS || 5000), // Délai entre chaque téléchargement (anti-rate-limit)
    limit: Number(process.env.ED_PHOTO_CACHE_DAILY_LIMIT || 500), // Nombre max de photos par jour
    timeoutMs: Number(process.env.ED_PHOTO_CACHE_TIMEOUT_MS || 15000), // Timeout par téléchargement
  }).catch(err => log_technical(TECHNICAL_LEVELS.WARNING, "Daily ED student photo cache failed", { error: err }));
});

// Calcule la plage de dates pour les 30 prochains jours (format "YYYY-MM-DD:YYYY-MM-DD")
function getNextMonthEdtRange() {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 30); // 30 jours dans le futur

  const format = date => date.toISOString().slice(0, 10);
  return `${format(start)}:${format(end)}`;
}

// Rafraîchit les emplois du temps des classes pour les 30 prochains jours depuis EcoleDirecte
async function refreshNextMonthClassSchedule(reason) {
  const date = getNextMonthEdtRange();
  log_technical(TECHNICAL_LEVELS.INFO, "Refreshing next month class schedules", { date, reason });

  // Lance le workflow d'import des emplois du temps
  await import_ed_data_to_db(['EDT_CLASSE'], {
    edtClasse: { date },
  });

  // Log métier : enregistre le rafraîchissement
  await log_business("edt_class_refresh_completed", "Refresh des EDT classe effectué.", {
    destination: LOG_DESTINATIONS.BOTH,
    entityType: "EDT_CLASSE",
    entityId: date,
    metadata: { date, reason },
  });
}

// Tâches de démarrage et crons quotidiens (désactivés en mode CI/test)
if (process.env.CI_SKIP_STARTUP_JOBS !== "true") {
  // Au démarrage : importe les salles, classes et utilisateurs depuis EcoleDirecte,
  // puis rafraîchit les emplois du temps
  import_ed_data_to_db(['SALLES', 'CLASSES', 'USERS'])
    .then(() => refreshNextMonthClassSchedule("startup"))
    .catch(err => {
      log_technical(TECHNICAL_LEVELS.ERROR, "Initial ED import failed", { error: err });
    });

  // Tous les jours à 6h00 : import complet des données EcoleDirecte + emplois du temps
  cron.schedule('0 6 * * *', () => {
    import_ed_data_to_db(['SALLES', 'CLASSES', 'USERS'])
      .then(() => refreshNextMonthClassSchedule("daily cron"))
      .catch(err => log_technical(TECHNICAL_LEVELS.ERROR, "Daily ED import cron failed", { error: err }));
  });

  // Toutes les 5 minutes : rafraîchit les emplois du temps (pour détecter les changements en quasi temps réel)
  cron.schedule('*/5 * * * *', () => {
    import_ed_data_to_db(['EDT_CLASSE'])
      .catch(err => log_technical(TECHNICAL_LEVELS.WARNING, "Frequent EDT import cron failed", { error: err }));
  });
}

// ═══════════════════════════════════════════════════════════════
// DÉMARRAGE DU SERVEUR HTTP
// ═══════════════════════════════════════════════════════════════

// Lance le serveur HTTP sur le port configuré
const server = app.listen(port, () => {
  log_technical(TECHNICAL_LEVELS.INFO, `SAC server is running on http://localhost:${port}`);
  log_technical(TECHNICAL_LEVELS.INFO, `Backend debug level: ${getDebugMode()}`);
});

// Gère les mises à niveau WebSocket (pour le temps réel via /ws/realtime)
server.on("upgrade", (req, socket) => {
  // Si la mise à niveau n'est pas gérée par notre handler, détruit la connexion
  if (!handleRealtimeUpgrade(req, socket)) {
    socket.destroy();
  }
});

// Exporte l'application Express et le serveur HTTP (pour les tests)
module.exports = { app, server };
