// scripts/get_messages.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const ECOLEDIRECTE_APIP_BASE_URL = process.env.ECOLEDIRECTE_APIP_BASE_URL;
const API_VERSION = process.env.ECOLEDIRECTE_API_VERSION;
const TOKEN = process.env.ECOLEDIRECTE_USER_TOKEN;
const USER_ID = process.env.ECOLEDIRECTE_USER_ID;

if (!TOKEN) {
  console.error('⚠️  Variable ECOLEDIRECTE_USER_TOKEN manquante dans .env');
  process.exit(1);
}

const MESSAGES_URL = `${ECOLEDIRECTE_APIP_BASE_URL}/enseignants/${USER_ID}/messages.awp?typeRecuperation=received&orderBy=date&order=desc&onlyRead=0&getAll=1&verbe=get&v=${API_VERSION}`;

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

/**
 * Récupère les messages reçus de l'utilisateur
 */
async function getMessages() {
  const body = new URLSearchParams({ data: '{}' });

  const res = await fetch(MESSAGES_URL, {
    method: 'POST',
    headers: HEADERS,
    body,
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json().catch(async () => {
    throw new Error('Réponse non JSON : ' + (await res.text()));
  });

  return json;
}

(async () => {
  try {
    console.log(`📬 Récupération des messages reçus pour l’utilisateur ${USER_ID}...`);
    const data = await getMessages();

    console.log('Réponse API :', JSON.stringify(data, null, 2));

    if (data?.code === 200 && data.data?.messages?.received) {
      const messages = data.data.messages.received;
      console.log(`✅ ${messages.length} message(s) reçu(s) :`);
      messages.forEach(m => console.log(`  - [${m.date}] ${m.subject} (de ${m.from.prenom} ${m.from.nom})`));
    } else {
      console.error(`❌ Échec (${data.code}) : ${data.message || 'Réponse inattendue'}`);
    }
  } catch (err) {
    console.error('Erreur :', err.message);
    process.exit(2);
  }
})();
