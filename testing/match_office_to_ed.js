import fs from "fs";
import csv from "csv-parser";

// === CONFIG ===
const OFFICE_FILE = "./office_users.csv";
const ECOLEDIRECTE_FILE = "./ecoledirecte.json";
const OUTPUT_FILE = "./office_matched.json";
const UNMATCHED_FILE = "./unmatched_office.json";
const MATCH_THRESHOLD = 3;

// === Helpers ===
const normalize = (str = "") =>
  str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@. ]/g, "")
    .trim();

const levenshtein = (a, b) => {
  if (!a || !b) return Math.max(a?.length || 0, b?.length || 0);
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (a[j - 1] === b[i - 1] ? 0 : 1)
      );
    }
  }
  return matrix[b.length][a.length];
};

const similarity = (a, b) => {
  const dist = levenshtein(normalize(a), normalize(b));
  return 1 - dist / Math.max(a.length, b.length);
};

// === Load JSON ===
const ecoledirecte = JSON.parse(
  fs.readFileSync(ECOLEDIRECTE_FILE, "utf8").replace(/^\uFEFF/, "")
);

// === Load CSV and Process ===
const officeUsers = [];
fs.createReadStream(OFFICE_FILE)
  .pipe(csv())
  .on("data", (row) => officeUsers.push(row))
  .on("end", () => {
    console.log(`✅ Loaded ${officeUsers.length} Office users and ${ecoledirecte.length} ED users.`);

    const results = officeUsers.map((office) => {
      const prenom = normalize(office["First name"]);
      const nom = normalize(office["Last name"]);
      const email = normalize(office["User principal name"]);
      const dept = normalize(office["Department"]);
      const title = normalize(office["Title"] || "");

      let bestMatch = null;
      let bestScore = 0;

      for (const ed of ecoledirecte) {
        let score = 0;

        const edNom = normalize(ed.nom);
        const edPrenom = normalize(ed.prenom);
        const edEmail = normalize(ed.email);
        const edClasse = normalize(ed.classeCode || ed.classeLibelle || "");

        if (email && edEmail && email.includes(edEmail)) score += 3;
        if (similarity(nom, edNom) > 0.8) score += 2;
        if (similarity(prenom, edPrenom) > 0.8) score += 2;
        if (dept && edClasse && dept.includes(edClasse)) score += 1;

        if (score > bestScore) {
          bestScore = score;
          bestMatch = ed;
        }
      }

      if (bestScore >= MATCH_THRESHOLD && bestMatch) {
        return {
          ...office,
          ED_id: bestMatch.id,
          ED_nom: bestMatch.nom,
          ED_prenom: bestMatch.prenom,
          ED_classeCode: bestMatch.classeCode,
          match_score: bestScore,
        };
      } else {
        return { ...office, ED_id: -1, match_score: bestScore };
      }
    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), "utf8");
    console.log(`🎯 Matching complete → results saved to ${OUTPUT_FILE}`);

    // === Verification phase ===
    console.log(`\n🔍 Starting verification phase...\n`);
    const matched = results.filter((r) => r.ED_id !== -1);

    // Filter unmatched: not EXT, and title == ELEVE
    const unmatched = results.filter(
      (r) =>
        r.ED_id === -1 &&
        !r["User principal name"]?.includes("#EXT#") &&
        normalize(r["Title"]) === "eleve"
    );

    let mismatchCount = 0;

    for (const entry of matched) {
      const ed = ecoledirecte.find((e) => e.id === entry.ED_id);
      if (!ed) continue;

      const diffs = [];

      const compare = (label, a, b) => {
        if (normalize(a) !== normalize(b)) diffs.push(`${label}: "${a}" ≠ "${b}"`);
      };

      compare("Nom", entry["Last name"], ed.nom);
      compare("Prénom", entry["First name"], ed.prenom);
      compare("Classe", entry["Department"], ed.classeCode);
      // Email intentionally ignored

      if (diffs.length > 0) {
        mismatchCount++;
        console.log(
          `⚠️  ${entry["Display name"] || entry["User principal name"]} (ED_id ${entry.ED_id}) → differences:\n   - ${diffs.join(
            "\n   - "
          )}\n`
        );
      }
    }

    console.log(`\n📋 Mismatched entries: ${mismatchCount}`);
    console.log(`🚫 Unmatched entries (ED_id = -1, excluding EXT & non-ELEVE): ${unmatched.length}`);

    if (unmatched.length) {
      unmatched.sort((a, b) =>
        (a["User principal name"] || "").localeCompare(b["User principal name"] || "")
      );
      fs.writeFileSync(UNMATCHED_FILE, JSON.stringify(unmatched, null, 2), "utf8");
      console.log(`💾 Full unmatched list saved to ${UNMATCHED_FILE}\n`);
      console.log("Preview :");
      unmatched.forEach((u) =>
        console.log(
          `   - ${u["Display name"] || "undefined"} (${u["User principal name"]})`
        )
      );
    }

    console.log(`\n✅ Verification done.`);
  });