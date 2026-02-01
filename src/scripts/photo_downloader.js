const fs = require("fs");
const https = require("https");
const path = require("path");

// ================= CONFIG =================
const JSON_PATH = "./eleves.json";
const OUTPUT_DIR = path.join(__dirname, "photos_dl");
const COOLDOWN_MS = 1000; // 1 second between requests
// =========================================

// Ensure output directory exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Read JSON safely (strip UTF-8 BOM)
const raw = fs.readFileSync(JSON_PATH, "utf8").replace(/^\uFEFF/, "");
const data = JSON.parse(raw);

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]+/g, "").trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function downloadPhoto(student) {
  return new Promise((resolve, reject) => {
    if (!student.photo) return resolve();

    const url = "https:" + student.photo;

    const filename =
      sanitizeFilename(`${student.nom} ${student.prenom}`) +
      path.extname(student.photo);

    const filePath = path.join(OUTPUT_DIR, filename);

    // Skip if already downloaded
    if (fs.existsSync(filePath)) {
      console.log(`Skipped (exists): ${filename}`);
      return resolve();
    }

    const file = fs.createWriteStream(filePath);

    const requestOptions = {
      headers: {
        "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "accept-language": "fr-FR,fr;q=0.6",
        "cache-control": "no-cache",
        "pragma": "no-cache",

        // Ces headers sont *cosmétiques* mais on les met pour matcher
        "sec-ch-ua": "\"Brave\";v=\"143\", \"Chromium\";v=\"143\", \"Not A(Brand\";v=\"24\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "image",
        "sec-fetch-mode": "no-cors",
        "sec-fetch-site": "same-site",
        "sec-gpc": "1",

        // ESSENTIEL
        "referer": "https://www.ecoledirecte.com/",
        "cookie": "OGEC_ED_CAS=0331556M; TOKEN_ED_CAS_0=2539addf-8de3-43ec-a9d4-e83aaeebcbff",

        // User-Agent très recommandé
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
      }
    };

    https
      .get(url, requestOptions, response => {
        if (response.statusCode !== 200) {
          file.close();
          fs.unlink(filePath, () => {});
          return reject(
            new Error(`HTTP ${response.statusCode}`)
          );
        }

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          console.log(`Downloaded: ${filename}`);
          resolve();
        });
      })
      .on("error", err => {
        file.close();
        fs.unlink(filePath, () => {});
        reject(err);
      });
  });
}

async function run() {
  const students = data.filter(s => s.photo);

  console.log(`Sequentially downloading ${students.length} photos`);

  for (let i = 0; i < students.length; i++) {
    const student = students[i];

    try {
      await downloadPhoto(student);
    } catch (err) {
      console.error(
        `Failed: ${student.nom} ${student.prenom} — ${err.message} -- URL: https:${student.photo}`
      );
    }

    // Absolute politeness: wait after *every* request
    await sleep(COOLDOWN_MS);
  }

  console.log("\nAll downloads completed (slowly and respectfully).");
}

run();
