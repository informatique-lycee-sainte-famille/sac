// test_login_two_cookies.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.resolve(__dirname, '../.env');
const IDENT = process.env.ECOLEDIRECTE_IDENTIFIANT;
const PASS = process.env.ECOLEDIRECTE_MDP;
const ECOLEDIRECTE_API_BASE_URL = process.env.ECOLEDIRECTE_API_BASE_URL;
const ECOLEDIRECTE_API_VERSION = process.env.ECOLEDIRECTE_API_VERSION || '4.87.0';

if (!IDENT || !PASS) {
  console.error('⚠️  Renseigne ECOLEDIRECTE_IDENTIFIANT et ECOLEDIRECTE_MDP dans .env');
  process.exit(1);
}

const GTK_URL = `${ECOLEDIRECTE_API_BASE_URL}/login.awp?gtk=1&v=${ECOLEDIRECTE_API_VERSION}`;
const LOGIN_URL = `${ECOLEDIRECTE_API_BASE_URL}/login.awp?v=${ECOLEDIRECTE_API_VERSION}`;

const COMMON_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Sec-Fetch-Site': 'same-site',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Dest': 'empty',
  'Sec-GPC': '1',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  'Sec-CH-UA': '"Brave";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
  'Sec-CH-UA-Platform': '"Windows"',
  'Sec-CH-UA-Mobile': '?0',
};

/**
 * Extract cookie name=value pairs from raw Set-Cookie headers.
 */
function parseCookies(rawHeader) {
  if (!rawHeader) return {};
  const str = Array.isArray(rawHeader) ? rawHeader.join('; ') : String(rawHeader);
  const cookies = {};
  for (const [, name, value] of str.matchAll(/([^\s=;,\r\n]+)=([^;,\r\n]+)/g)) {
    if (!(name in cookies)) cookies[name] = value;
  }
  return cookies;
}

/**
 * Fetch GTK + long cookie (≈462 chars)
 */
async function fetchCookies() {
  const res = await fetch(GTK_URL, { headers: COMMON_HEADERS });
  const raw = res.headers?.raw?.()['set-cookie'] || res.headers.get('set-cookie') || '';
  const cookies = parseCookies(raw);
  if (!Object.keys(cookies).length) throw new Error('Aucun cookie extrait.');

  const gtk = cookies.GTK || cookies.Gtk;
  if (!gtk) throw new Error('Cookie GTK introuvable.');

  let [longName, longValue] =
    Object.entries(cookies).find(([k, v]) => k !== 'GTK' && String(v).length === 462)
    || Object.entries(cookies).filter(([k]) => k !== 'GTK')
       .sort((a, b) => b[1].length - a[1].length)[0] || [];

  if (!longName) throw new Error('Aucun cookie long trouvé.');
  if (String(longValue).length !== 462)
    console.warn(`⚠️ Cookie 462-char introuvable — fallback ${longName} (len=${longValue.length})`);

  return {
    gtk,
    longName,
    longValue,
    header: `GTK=${gtk}; ${longName}=${longValue}`,
  };
}

/**
 * Login with GTK + long cookie
 */
async function login(cookieHeader, gtk) {
  const body = new URLSearchParams({
    data: JSON.stringify({
      identifiant: IDENT,
      motdepasse: PASS,
      isReLogin: false,
      uuid: '',
      fa: [],
    }),
  });

  const headers = {
    ...COMMON_HEADERS,
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Gtk': gtk,
    'Cookie': cookieHeader,
  };

  const res = await fetch(LOGIN_URL, { method: 'POST', headers, body });
  try {
    return await res.json();
  } catch {
    throw new Error('Réponse non JSON: ' + (await res.text()));
  }
}

function updateEnv(key, value) {
  if (!key || !value) return;
  let envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const regex = new RegExp(`^${key}=.*$`, 'm');

  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, `${key}=${value}`);
  } else {
    envContent += `${envContent.endsWith('\n') ? '' : '\n'}${key}=${value}\n`;
  }

  fs.writeFileSync(ENV_PATH, envContent.trimEnd() + '\n');
  console.log(`🔑 ${key} enregistré dans .env (${ENV_PATH})`);
}

(async () => {
  try {
    console.log('1️⃣  Récupération GTK + cookie long…');
    const { gtk, longName, longValue, header } = await fetchCookies();
    console.log(`GTK: ${gtk.slice(0, 40)}...`);
    console.log(`Long cookie: ${longName} (len=${String(longValue).length})`);

    console.log(`2️⃣  Tentative de login avec GTK + ${longName}…`);
    const resp = await login(header, gtk);

    console.log('Réponse API :', JSON.stringify(resp, null, 2));
    if (resp?.code === 200 && resp.token) {
      console.log('✅ Login réussi. Token :', resp.token);
      updateEnv('ECOLEDIRECTE_USER_TOKEN', resp.token);
      updateEnv('ECOLEDIRECTE_USER_ID', resp.data.accounts[0].id);
    } else {
      console.error(`❌ Login échoué (${resp.code}) : ${resp.message || resp.error || 'Erreur inconnue'}`);
    }
  } catch (err) {
    console.error('Erreur :', err.message);
    process.exit(2);
  }
})();
