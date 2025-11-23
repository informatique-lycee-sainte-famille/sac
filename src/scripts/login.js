#!/usr/bin/env node
// scripts/login.js
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const fs = require("fs");
const path = require("path");

const ENV_PATH = path.resolve(__dirname, "../.env");
const IDENT = process.env.ECOLEDIRECTE_IDENTIFIANT;
const PASS = process.env.ECOLEDIRECTE_MDP;
const { DATA_URLS, BASE_URLS, API_VERSION_PARAM } = require('../API_SAC/commons/constants');

if (!IDENT || !PASS) {
  console.error("⚠️  Renseigne ECOLEDIRECTE_IDENTIFIANT et ECOLEDIRECTE_MDP dans .env");
  process.exit(1);
}

const GTK_URL = `${BASE_URLS.API}/login.awp?gtk=1&v=${API_VERSION_PARAM}`;
const LOGIN_URL = `${BASE_URLS.API}/login.awp?v=${API_VERSION_PARAM}`;
const RENEW_URL = `${BASE_URLS.API}/renewtoken.awp?verbe=put&v=${API_VERSION_PARAM}`;

const BASE_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  "Sec-GPC": "1",
};

function parseCookies(raw) {
  if (!raw) return {};
  const str = Array.isArray(raw) ? raw.join("; ") : String(raw);
  return Object.fromEntries(
    [...str.matchAll(/([^\s=;,\r\n]+)=([^;,\r\n]+)/g)].map(([, k, v]) => [k, v])
  );
}

async function fetchCookies() {
  const res = await fetch(GTK_URL, { headers: BASE_HEADERS });
  const raw = res.headers?.raw?.()["set-cookie"] || res.headers.get("set-cookie") || "";
  const cookies = parseCookies(raw);

  if (!Object.keys(cookies).length) throw new Error("Aucun cookie extrait.");

  const gtk = cookies.GTK || cookies.Gtk;
  if (!gtk) throw new Error("Cookie GTK introuvable.");

  const [longName, longValue] = Object.entries(cookies)
    .filter(([k]) => k !== "GTK")
    .sort((a, b) => b[1].length - a[1].length)[0] || [];

  if (!longName) throw new Error("Aucun cookie long trouvé.");

  return {
    gtk,
    longName,
    longValue,
    header: `GTK=${gtk}; ${longName}=${longValue}`,
  };
}

async function login(cookieHeader, gtk) {
  const body = new URLSearchParams({
    data: JSON.stringify({
      identifiant: IDENT,
      motdepasse: PASS,
      isReLogin: false,
      uuid: "",
      fa: [],
    }),
  });

  const headers = {
    ...BASE_HEADERS,
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Gtk": gtk,
    Cookie: cookieHeader,
  };

  const res = await fetch(LOGIN_URL, { method: "POST", headers, body });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Réponse non JSON: " + text);
  }
}

/**
 * SWITCH PROFILE (P → A)
 */
async function switchProfile(token, uid, profil = "A") {
  const headers = {
    ...BASE_HEADERS,
    "Content-Type": "application/x-www-form-urlencoded",
    "x-token": token,
  };

  const body = new URLSearchParams({
    data: JSON.stringify({
      profil,
      uid,
      uuid: ""
    })
  });

  const res = await fetch(RENEW_URL, {
    method: "POST",
    headers,
    body
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Réponse non JSON à switchProfile: " + text);
  }
}

function updateEnvBatch(updates) {
  if (!updates || !Object.keys(updates).length) return;
  let envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";

  for (const [key, value] of Object.entries(updates)) {
    if (!key || !value) continue;
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) envContent = envContent.replace(regex, `${key}=${value}`);
    else envContent += `${envContent.endsWith("\n") ? "" : "\n"}${key}=${value}\n`;
  }

  fs.writeFileSync(ENV_PATH, envContent.trimEnd() + "\n");
  console.log(`🔑 ${Object.keys(updates).join(", ")} enregistré(s) dans .env (${ENV_PATH})`);
}

(async () => {
  try {
    console.log("1️⃣  Récupération GTK + cookie long…");
    const { gtk, longName, longValue, header } = await fetchCookies();
    console.log(`   • GTK: ${gtk.slice(0, 40)}...`);
    console.log(`   • Cookie long: ${longName} (len=${String(longValue).length})`);

    console.log("2️⃣  Tentative de login…");
    const resp = await login(header, gtk);

    if (!(resp?.code === 200 && resp.token)) {
      console.error(`❌ Login échoué (${resp.code}) : ${resp.message}`);
      process.exit(2);
    }

    const baseToken = resp.token;
    const account = resp.data.accounts[0];
    const uid = account.uid ?? account.id;

    console.log("   • Profil actuel : " + account.typeCompte);
    console.log("   • Token de base : " + baseToken);
    console.log("   • UID : " + uid);

    // 🔥 Si déjà en A, on saute
    if (account.typeCompte !== "A") {
      console.log("3️⃣  Changement de profil vers A…");
      const sw = await switchProfile(baseToken, uid, "A");

      if (sw.code === 200 && sw.token) {
        console.log("Nouveau token profil A : " + sw.token);
        console.log("Nouveau type compte : A");

        updateEnvBatch({
          ECOLEDIRECTE_USER_TOKEN: sw.token,
          ECOLEDIRECTE_USER_ID: sw.data.id,
        });
      } else {
        console.error("❌ Impossible de changer de profil :", sw);
        process.exit(2);
      }
    } else {
      // Déjà en A
      updateEnvBatch({
        ECOLEDIRECTE_USER_TOKEN: baseToken,
        ECOLEDIRECTE_USER_ID: account.id,
      });
    }

    console.log("✅ Tout est OK !");
  } catch (err) {
    console.error("💥 Erreur :", err.message);
    process.exitCode = 2;
  }
})();
