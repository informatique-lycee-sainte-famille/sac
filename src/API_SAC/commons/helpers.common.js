// ./API_SAC/commons/helpers.common.js
// Charge les variables d'environnement
require("./env.common");
// Importe les URLs et constantes de l'API EcoleDirecte
const { DATA_URLS, BASE_URLS, API_VERSION } = require("./constants.common");
// Importe le client Prisma (ORM base de données)
const { prisma } = require("./prisma.common");
// Importe le système de logging technique
const { TECHNICAL_LEVELS, log_technical } = require("./logger.common");

// Modules Node.js natifs
const fs = require("fs"); // Système de fichiers (lecture/écriture)
const path = require("path"); // Manipulation de chemins de fichiers
const { execSync } = require("child_process"); // Exécution de commandes système de manière synchrone
const { DateTime } = require("luxon"); // Librairie de manipulation de dates/heures


// Token d'authentification EcoleDirecte (peut être mis à jour si le token expire)
let TOKEN = process.env.ECOLEDIRECTE_USER_TOKEN;
// ID de l'utilisateur EcoleDirecte (compte administrateur utilisé par le serveur)
const USER_ID = process.env.ECOLEDIRECTE_USER_ID;

// Construit les en-têtes HTTP nécessaires pour les requêtes vers l'API EcoleDirecte
function getHeaders() {
  return {
    Accept: "application/json, text/plain, */*", // Types de réponse acceptés
    "Content-Type": "application/x-www-form-urlencoded", // Format du corps de la requête
    "Sec-GPC": "1", // Indicateur "Global Privacy Control"
    "User-Agent": // Simule un navigateur Chrome pour que l'API accepte les requêtes
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    "X-Token": TOKEN, // Token d'authentification EcoleDirecte
  };
}

// Parse les arguments de la ligne de commande (ex: --key=value, --flag)
function parseArgs() {
  const args = {};
  // Parcourt les arguments à partir du 3ème (les 2 premiers sont "node" et le nom du script)
  process.argv.slice(2).forEach((arg) => {
    // Supprime le préfixe "--" et sépare clé/valeur
    const [key, value] = arg.replace(/^--/, "").split("=");
    if (!value) args._ = key.toUpperCase(); // Si pas de valeur, c'est un argument positionnel
    else {
      const lowerVal = value.toLowerCase();
      // Convertit "true"/"false" en booléens
      if (lowerVal === "true") args[key.toLowerCase()] = true;
      else if (lowerVal === "false") args[key.toLowerCase()] = false;
      else args[key.toLowerCase()] = value; // Sinon garde la valeur telle quelle
    }
  });
  return args;
}

// Construit une URL complète pour l'API EcoleDirecte à partir d'un type de donnée et de paramètres
async function buildUrl(type, params = {}, options = {}) {
  const upper = type.toUpperCase(); // Normalise le type en majuscules
  // Cherche le chemin de l'URL dans les URLs APIP ou API
  let pathDef = DATA_URLS.APIP[upper] || DATA_URLS.API[upper];
  if (!pathDef) throw new Error(`Type de donnée inconnu : ${type}`);

  // Remplace le placeholder ":id" par l'ID fourni dans les paramètres
  if (pathDef.includes(":id")) {
    const id =
      params.id ||
      params.classe ||
      params.salle ||
      params.niveau ||
      params.etab ||
      USER_ID; // Utilise l'ID utilisateur par défaut si aucun ID spécifique
    if (!id) throw new Error(`Aucun ID fourni pour ${type}.`);
    pathDef = pathDef.replace(":id", id);
  }

  // Remplace le placeholder ":horaire" par l'horaire fourni (pour l'envoi d'appel)
  if (pathDef.includes(":horaire")) {
    if (!params.horaire) {
      throw new Error("Paramètre horaire manquant pour APPEL.");
    }
    pathDef = pathDef.replace(":horaire", params.horaire);
  }

  // Détermine l'URL de base (API publique ou privée) selon le type de donnée
  const base = DATA_URLS.API[upper] ? BASE_URLS.API : BASE_URLS.APIP;
  // Choisit le séparateur de paramètres (& si l'URL contient déjà un ?, sinon ?)
  const separator = pathDef.includes("?") ? "&" : "?";
  // Le verbe HTTP par défaut est "get"
  const verbe = options.verbe || "get";
  // Construit et retourne l'URL complète avec les paramètres de version
  return `${base}${pathDef}${separator}verbe=${verbe}&v=${API_VERSION}`;
}

// Extrait le nouveau token EcoleDirecte depuis la sortie du script de login
function extractTokenFromOutput(output) {
  // Cherche le pattern "Nouveau token profil A : <token>" dans le texte
  const match = output.match(/Nouveau token profil A\s*:\s*([a-z0-9-]+)/i);
  return match ? match[1] : null;
}

// Effectue une requête POST vers l'API EcoleDirecte avec gestion automatique de la reconnexion
async function fetchData(url, bodyData = "{}", retries = 0) {
  // Limite à 2 tentatives de reconnexion pour éviter les boucles infinies
  if (retries > 2)
    throw new Error("❌ Trop de tentatives de reconnexion (boucle 520).");

  // Convertit les données du corps en JSON si c'est un objet
  const payload =
    typeof bodyData === "object" ? JSON.stringify(bodyData) : bodyData;
  // Encapsule les données dans un formulaire URL-encoded (format attendu par EcoleDirecte)
  const body = new URLSearchParams({ data: payload });

  // Effectue la requête POST vers l'API EcoleDirecte
  const res = await fetch(url, { method: "POST", headers: getHeaders(), body });

  // Vérifie que la réponse HTTP est OK (status 200-299)
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  // Parse la réponse JSON, avec un message d'erreur explicite si la réponse n'est pas du JSON
  const resJson = await res.json().catch(async () => {
    throw new Error("Réponse non JSON : " + (await res.text()));
  });

  // Vérifie que la réponse n'est pas vide
  if (!resJson) throw new Error("Réponse vide du serveur");

  // Code 520 = token expiré, il faut se reconnecter automatiquement
  if (resJson.code === 520) {
    log_technical(TECHNICAL_LEVELS.INFO, "EcoleDirecte token expired, reconnecting");
    try {
      // Lance le script de login pour obtenir un nouveau token
      const output = execSync("node ./scripts/auto/login.script.js", {
        cwd: path.resolve(__dirname, "../../"), // Exécute depuis le dossier src/
        encoding: "utf8",
        stdio: "pipe", // Capture la sortie standard
      });

      // Extrait le nouveau token depuis la sortie du script
      const newToken = extractTokenFromOutput(output);
      if (newToken) {
        TOKEN = newToken; // Met à jour le token en mémoire
        log_technical(TECHNICAL_LEVELS.INFO, "New EcoleDirecte token extracted");
      } else {
        log_technical(TECHNICAL_LEVELS.ERROR, "Unable to extract new EcoleDirecte token");
        throw new Error("Token non trouvé dans la sortie de login.js");
      }
    } catch (err) {
      log_technical(TECHNICAL_LEVELS.ERROR, "EcoleDirecte reconnect failed", { error: err });
      throw err;
    }

    // Relance la requête avec le nouveau token (incrémente le compteur de tentatives)
    log_technical(TECHNICAL_LEVELS.INFO, "Retrying EcoleDirecte request after reconnect");
    return fetchData(url, bodyData, retries + 1);
  }

  // Si le code de réponse n'est pas 200, l'API a retourné une erreur
  if (resJson.code !== 200) {
    throw new Error(
      `Erreur API (${resJson.code}) : ${
        resJson.message || "Aucun message d'erreur"
      }`
    );
  }

  // Retourne la réponse JSON complète
  return resJson;
}

// Sauvegarde des données JSON dans un fichier ou les affiche dans la console
function outputJSON(data, args) {
  // Si un chemin de fichier est spécifié, sauvegarde dans un fichier
  if (args.savepath) {
    fs.mkdirSync(path.dirname(args.savepath), { recursive: true }); // Crée le dossier si nécessaire
    fs.writeFileSync(args.savepath, JSON.stringify(data, null, 2), "utf8"); // Écrit le JSON formaté
    log_technical(TECHNICAL_LEVELS.INFO, "Data saved to disk", { savepath: args.savepath });
  } else {
    // Sinon affiche dans la console
    console.log(JSON.stringify(data, null, 2));
  }
}

// Convertit une chaîne de date/heure au format "yyyy-MM-dd HH:mm" depuis le fuseau horaire de Paris en objet Date JavaScript
function fromParis(str) {
  return DateTime.fromFormat(str, "yyyy-MM-dd HH:mm", { zone: process.env.TZ }).toJSDate();
}

// Convertit un objet Date JavaScript en chaîne au format "yyyy-MM-dd HH:mm" dans le fuseau horaire de Paris
function toParis(date) {
  return DateTime.fromJSDate(date).setZone(process.env.TZ).toFormat("yyyy-MM-dd HH:mm");
}

// Convertit un objet Date JavaScript en format ISO dans le fuseau horaire de Paris
function toParisISO(date) {
  return DateTime.fromJSDate(date).setZone(process.env.TZ).toISO();
}

// Normalise une chaîne de texte : supprime les accents, convertit en majuscules, ne garde que les lettres
function normalize(str) {
  if (!str) return "";

  return str
    .normalize("NFD") // Décompose les caractères accentués (é → e + accent)
    .replace(/[\u0300-\u036f]/g, "") // Supprime les accents
    .toUpperCase() // Convertit en majuscules
    .replace(/[^A-Z]/g, ""); // Ne garde que les lettres A-Z
}

// Normalisation "douce" : comme normalize() mais garde les espaces
function normalizeSoft(str) {
  if (!str) return "";

  return str
    .normalize("NFD") // Décompose les caractères accentués
    .replace(/[\u0300-\u036f]/g, "") // Supprime les accents
    .toUpperCase() // Convertit en majuscules
    .replace(/\s+/g, " ") // Remplace les espaces multiples par un seul espace
    .trim(); // Supprime les espaces en début et fin
}

// Parse le nom d'un professeur depuis le format EcoleDirecte (ex: "DUPONT M." → { lastName: "DUPONT", firstInitial: "M" })
function parseProfName(prof) {
  if (!prof) return { lastName: "", firstInitial: "" };

  // Supprime les civilités en début de chaîne (M., MME, Mme, MR, Madame, Monsieur)
  prof = prof.replace(/^(M\.|MME|Mme|MR|Madame|Monsieur)\s+/i, "");

  // Sépare le nom en parties
  const parts = prof.trim().split(" ");

  if (parts.length === 0) return { lastName: "", firstInitial: "" };

  // La dernière partie peut être l'initiale du prénom (ex: "M." ou "M")
  const lastPart = parts[parts.length - 1];

  // Si la dernière partie est une seule lettre (avec ou sans point), c'est l'initiale du prénom
  if (/^[A-Z]\.?$/i.test(lastPart)) {
    return {
      lastName: parts.slice(0, -1).join(" "), // Tout sauf la dernière partie = nom de famille
      firstInitial: lastPart[0].toUpperCase(), // Première lettre = initiale du prénom
    };
  }

  // Sinon, la dernière partie est le prénom complet
  return {
    lastName: parts.slice(0, -1).join(" "), // Tout sauf le dernier = nom de famille
    firstInitial: parts[parts.length - 1][0]?.toUpperCase() || "", // Initiale du prénom
  };
}

// Calcule un score de correspondance entre un nom de prof ED et un enseignant de la base de données
function scoreTeacherMatch(input, teacher) {
  let score = 0;

  // Normalise les noms de famille pour la comparaison
  const inputLast = normalize(input.lastName);
  const teacherLast = normalize(teacher.lastName);

  // Correspondance exacte du nom de famille = 100 points
  if (inputLast === teacherLast) score += 100;

  // Gère les particules composées (DE, LA, LE) : correspondance partielle = 50 points
  if (teacherLast.includes(inputLast) || inputLast.includes(teacherLast)) {
    score += 50;
  }

  // Comparaison "douce" des noms de famille (avec espaces) = 30 points
  const softInput = normalizeSoft(input.lastName);
  const softTeacher = normalizeSoft(teacher.lastName);

  if (softInput === softTeacher) score += 30;

  // Correspondance de l'initiale du prénom = 20 points
  if (
    input.firstInitial &&
    teacher.firstName &&
    input.firstInitial === teacher.firstName[0]?.toUpperCase()
  ) {
    score += 20;
  }

  return score;
}

// Trouve le meilleur enseignant correspondant dans la base de données pour un nom de prof EcoleDirecte
async function findBestUserTeacherMatch(prof) {
  // Parse le nom du prof depuis le format EcoleDirecte
  const parsed = parseProfName(prof);

  // Récupère tous les enseignants de la base de données
  const teachers = await prisma.user.findMany({
    where: { role: "teacher" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  });

  // Variables pour suivre le meilleur match
  let best = null;
  let bestScore = 0;

  // Compare chaque enseignant et garde celui avec le meilleur score
  for (const t of teachers) {
    const score = scoreTeacherMatch(parsed, t);

    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }

  // Si le meilleur score est trop bas (< 50), on considère qu'il n'y a pas de correspondance fiable
  if (bestScore < 50) {
    log_technical(TECHNICAL_LEVELS.WARNING, "No reliable teacher match", { teacherLabel: prof });
    return null;
  }

  return best;
}

// Exporte toutes les fonctions utilitaires
module.exports = {
  fetchData,
  USER_ID,
  TOKEN,
  getHeaders,
  outputJSON,
  buildUrl,
  parseArgs,
  fromParis,
  toParis,
  toParisISO,
  normalize,
  normalizeSoft,
  parseProfName,
  findBestUserTeacherMatch
};
