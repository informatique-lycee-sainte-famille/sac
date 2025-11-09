// commons/helpers.js
const { DATA_URLS, BASE_URLS, API_VERSION, API_VERSION_PARAM } = require('./constants');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../src/.env'), quiet: true });

const TOKEN = process.env.ECOLEDIRECTE_USER_TOKEN;
const USER_ID = process.env.ECOLEDIRECTE_USER_ID;

const fs = require('fs');
const path = require('path');

if (!TOKEN) {
  console.error('⚠️  Variable ECOLEDIRECTE_USER_TOKEN manquante dans .env');
  process.exit(1);
}

const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/x-www-form-urlencoded',
  'Sec-GPC': '1',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  'X-Token': TOKEN,
};

// --- argument parsing ---
function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(arg => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (!value) {
      // Bare argument (e.g., "MESSAGES")
      args._ = key.toUpperCase();
    } else {
      // Convert common truthy/falsey strings to booleans
      const lowerVal = value.toLowerCase();
      if (lowerVal === 'true') args[key.toLowerCase()] = true;
      else if (lowerVal === 'false') args[key.toLowerCase()] = false;
      else args[key.toLowerCase()] = value;
    }
  });
  return args;
}

// --- dynamic URL builder ---
async function buildUrl(type, params) {
  const upper = type.toUpperCase();
  let path = DATA_URLS.APIP[upper] || DATA_URLS.API[upper];
  if (!path) throw new Error(`Type de donnée inconnu : ${type}`);

  // replace placeholders
  if (path.includes(':id')) {
    const id =
      params.id ||
      params.classe ||
      params.salle ||
      params.niveau ||
      params.etab ||
      USER_ID;
    if (!id) throw new Error(`Aucun ID fourni pour ${type}.`);
    path = path.replace(':id', id);
  }

  const base = DATA_URLS.API[upper] ? BASE_URLS.API : BASE_URLS.APIP;

  // build full URL with proper query separator
  const separator = path.includes('?') ? '&' : '?';
  return `${base}${path}${separator}verbe=get&v=${API_VERSION}`;
}

async function fetchData(url, bodyData = '{}') {
  console.log(`➡️  Fetching ${url}`);

  // ✅ If bodyData is an object, convert to JSON string
  const payload =
    typeof bodyData === 'object' ? JSON.stringify(bodyData) : bodyData;

  const body = new URLSearchParams({ data: payload });
  console.log(`   with body: ${body}`);

  const res = await fetch(url, { method: 'POST', headers: HEADERS, body });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  try {
    return await res.json();
  } catch {
    throw new Error('Réponse non JSON : ' + (await res.text()));
  }
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

module.exports = { fetchData, USER_ID, TOKEN, HEADERS, outputJSON, buildUrl, parseArgs };
