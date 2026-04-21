require("./env");
const { DATA_URLS, BASE_URLS, API_VERSION } = require("./constants");
const { prisma } = require("./prisma");

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { DateTime } = require("luxon");


let TOKEN = process.env.ECOLEDIRECTE_USER_TOKEN;
const USER_ID = process.env.ECOLEDIRECTE_USER_ID;

if (!TOKEN) {
  console.error("⚠️  Variable ECOLEDIRECTE_USER_TOKEN manquante dans .env");
  process.exit(1);
}

function getHeaders() {
  return {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/x-www-form-urlencoded",
    "Sec-GPC": "1",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    "X-Token": TOKEN,
  };
}

function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    if (!value) args._ = key.toUpperCase();
    else {
      const lowerVal = value.toLowerCase();
      if (lowerVal === "true") args[key.toLowerCase()] = true;
      else if (lowerVal === "false") args[key.toLowerCase()] = false;
      else args[key.toLowerCase()] = value;
    }
  });
  return args;
}

async function buildUrl(type, params = {}, options = {}) {
  const upper = type.toUpperCase();
  let pathDef = DATA_URLS.APIP[upper] || DATA_URLS.API[upper];
  if (!pathDef) throw new Error(`Type de donnée inconnu : ${type}`);

  if (pathDef.includes(":id")) {
    const id =
      params.id ||
      params.classe ||
      params.salle ||
      params.niveau ||
      params.etab ||
      USER_ID;
    if (!id) throw new Error(`Aucun ID fourni pour ${type}.`);
    pathDef = pathDef.replace(":id", id);
  }

  if (pathDef.includes(":horaire")) {
    if (!params.horaire) {
      throw new Error("Paramètre horaire manquant pour APPEL.");
    }
    pathDef = pathDef.replace(":horaire", params.horaire);
  }

  const base = DATA_URLS.API[upper] ? BASE_URLS.API : BASE_URLS.APIP;
  const separator = pathDef.includes("?") ? "&" : "?";
  const verbe = options.verbe || "get";
  return `${base}${pathDef}${separator}verbe=${verbe}&v=${API_VERSION}`;
}

function extractTokenFromOutput(output) {
  const match = output.match(/Nouveau token profil A\s*:\s*([a-z0-9-]+)/i);
  return match ? match[1] : null;
}

// --- fetchData ---
async function fetchData(url, bodyData = "{}", retries = 0) {
  if (retries > 2)
    throw new Error("❌ Trop de tentatives de reconnexion (boucle 520).");

  // console.log(`➡️  Fetching ${url}`);
  const payload =
    typeof bodyData === "object" ? JSON.stringify(bodyData) : bodyData;
  const body = new URLSearchParams({ data: payload });
  // console.log(`   with body: ${body}`);

  const res = await fetch(url, { method: "POST", headers: getHeaders(), body });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const resJson = await res.json().catch(async () => {
    throw new Error("Réponse non JSON : " + (await res.text()));
  });

  if (!resJson) throw new Error("Réponse vide du serveur");

  if (resJson.code === 520) {
    console.log("🔄 Token expiré, reconnexion via exec…");
    try {
      const output = execSync("node ./scripts/login.js", {
        cwd: path.resolve(__dirname, "../../"),
        encoding: "utf8",
        stdio: "pipe",
      });

      const newToken = extractTokenFromOutput(output);
      if (newToken) {
        TOKEN = newToken;
        console.log(`🔁 Nouveau token extrait : ${TOKEN}`);
      } else {
        console.error("⚠️  Impossible d’extraire le nouveau token du script.");
        throw new Error("Token non trouvé dans la sortie de login.js");
      }
    } catch (err) {
      console.error("💥 Erreur pendant la reconnexion :", err.message);
      throw err;
    }

    console.log("🔁 Relance de la requête après reconnexion…");
    return fetchData(url, bodyData, retries + 1);
  }

  if (resJson.code !== 200) {
    throw new Error(
      `Erreur API (${resJson.code}) : ${
        resJson.message || "Aucun message d'erreur"
      }`
    );
  }

  return resJson;
}

function outputJSON(data, args) {
  if (args.savepath) {
    fs.mkdirSync(path.dirname(args.savepath), { recursive: true });
    fs.writeFileSync(args.savepath, JSON.stringify(data, null, 2), "utf8");
    console.log(`💾 Data saved to ${args.savepath}`);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

// Timezone helpers

// Parse EDT → JS Date (UTC)
function fromParis(str) {
  return DateTime.fromFormat(str, "yyyy-MM-dd HH:mm", { zone: process.env.TZ }).toJSDate();
}

// Convert DB → Paris (string)
function toParis(date) {
  return DateTime.fromJSDate(date).setZone(process.env.TZ).toFormat("yyyy-MM-dd HH:mm");
}

// Convert DB → Paris ISO (API-safe)
function toParisISO(date) {
  return DateTime.fromJSDate(date).setZone(process.env.TZ).toISO();
}

// Normalize PROFS NAMES

function normalize(str) {
  if (!str) return "";

  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .toUpperCase()
    .replace(/[^A-Z]/g, ""); // keep only letters
}

// Keep structure (for better matching)
function normalizeSoft(str) {
  if (!str) return "";

  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseProfName(prof) {
  if (!prof) return { lastName: "", firstInitial: "" };

  // remove civilities
  prof = prof.replace(/^(M\.|MME|Mme|MR|Madame|Monsieur)\s+/i, "");

  const parts = prof.trim().split(" ");

  if (parts.length === 0) return { lastName: "", firstInitial: "" };

  const lastPart = parts[parts.length - 1];

  // detect initial like "E."
  if (/^[A-Z]\.?$/i.test(lastPart)) {
    return {
      lastName: parts.slice(0, -1).join(" "),
      firstInitial: lastPart[0].toUpperCase(),
    };
  }

  // otherwise assume full firstname
  return {
    lastName: parts.slice(0, -1).join(" "),
    firstInitial: parts[parts.length - 1][0]?.toUpperCase() || "",
  };
}

function scoreTeacherMatch(input, teacher) {
  let score = 0;

  const inputLast = normalize(input.lastName);
  const teacherLast = normalize(teacher.lastName);

  // exact match
  if (inputLast === teacherLast) score += 100;

  // contains (handles DE / LA / etc.)
  if (teacherLast.includes(inputLast) || inputLast.includes(teacherLast)) {
    score += 50;
  }

  // soft match (spaces preserved)
  const softInput = normalizeSoft(input.lastName);
  const softTeacher = normalizeSoft(teacher.lastName);

  if (softInput === softTeacher) score += 30;

  // first initial match
  if (
    input.firstInitial &&
    teacher.firstName &&
    input.firstInitial === teacher.firstName[0]?.toUpperCase()
  ) {
    score += 20;
  }

  return score;
}

async function findBestTeacherMatch(prof) {
  const parsed = parseProfName(prof);

  const teachers = await prisma.teacher.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  });

  let best = null;
  let bestScore = 0;

  for (const t of teachers) {
    const score = scoreTeacherMatch(parsed, t);

    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }

  // threshold → avoid bad matches
  if (bestScore < 50) {
    console.warn("⚠️ No reliable teacher match:", prof);
    return null;
  }

  return best;
}

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
  findBestTeacherMatch
};
