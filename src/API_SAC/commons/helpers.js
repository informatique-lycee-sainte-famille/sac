// commons/helpers.js
const TOKEN = process.env.ECOLEDIRECTE_USER_TOKEN;
const USER_ID = process.env.ECOLEDIRECTE_USER_ID;

const fs = require('fs');

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

async function fetchData(url, bodyData = '{}') {
  const body = new URLSearchParams({ data: bodyData });
  const res = await fetch(url, { method: 'POST', headers: HEADERS, body });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json().catch(async () => {
    throw new Error('Réponse non JSON : ' + (await res.text()));
  });
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

module.exports = { fetchData, USER_ID, TOKEN, HEADERS, outputJSON };
