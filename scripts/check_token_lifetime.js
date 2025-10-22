// scripts/check_token_lifetime.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const TOKEN = process.env.ECOLEDIRECTE_USER_TOKEN;
const ECOLEDIRECTE_APIP_BASE_URL = process.env.ECOLEDIRECTE_APIP_BASE_URL;
const USER_ID = process.env.ECOLEDIRECTE_USER_ID;
const API_VERSION = process.env.ECOLEDIRECTE_API_VERSION;

if (!TOKEN) {
  console.error('⚠️  ECOLEDIRECTE_USER_TOKEN manquant dans .env');
  process.exit(1);
}

const CHECK_URL = `${ECOLEDIRECTE_APIP_BASE_URL}/enseignants/${USER_ID}/messages.awp?typeRecuperation=received&orderBy=date&order=desc&onlyRead=0&getAll=1&verbe=get&v=${API_VERSION}`;

const HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Content-Type': 'application/x-www-form-urlencoded',
  'Origin': 'https://www.ecoledirecte.com',
  'Referer': 'https://www.ecoledirecte.com/',
  'Sec-Fetch-Site': 'same-site',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Dest': 'empty',
  'Sec-GPC': '1',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  'Sec-CH-UA': '"Brave";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
  'Sec-CH-UA-Platform': '"Windows"',
  'Sec-CH-UA-Mobile': '?0',
  'X-Token': TOKEN,
};

async function isTokenValid() {
  try {
    const body = new URLSearchParams({ data: '{}' });
    const res = await fetch(CHECK_URL, { method: 'POST', headers: HEADERS, body });
    const json = await res.json().catch(() => ({}));
    return json.code === 200;
  } catch {
    return false;
  }
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

(async () => {
  console.log(`🕒 Starting token lifetime check for user ${USER_ID}...`);
  const start = Date.now();
  let count = 0;

  while (true) {
    const valid = await isTokenValid();
    count++;

    if (!valid) {
      const elapsed = Date.now() - start;
      console.log(`❌ Token expired after ${formatDuration(elapsed)} (${elapsed / 1000}s).`);
      process.exit(0);
    }

    if (count % 60 === 0) {
      const elapsed = Date.now() - start;
      console.log(`✅ Still valid after ${formatDuration(elapsed)} (${elapsed / 1000}s).`);
    }

    console.log(`⏳ Token is still valid... checked ${count} time(s).`);
    await new Promise(r => setTimeout(r, 1000)); // wait 1 second
  }
})();
