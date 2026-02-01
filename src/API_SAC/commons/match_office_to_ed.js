// returnEDAccount.js (adjust path/filename as needed)

const { getDataByType } = require('../../scripts/get_data.js');

// === CONFIG ===
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
  const na = normalize(a);
  const nb = normalize(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
};

// Map your higher‑level role to the data type used by getDataByType
function mapRoleToDataType(role) {
  const r = role?.toUpperCase();
  if (r === 'ELEVE') return 'ELEVES_ALL';
  if( r === 'PERSONNEL') return 'PERSONNELS';
  if (r === 'PROFESSEUR' || r === 'FORMATEUR') {
    return 'PROFESSEURS';
  }
  throw new Error(`Type d'annuaire non supporté: ${role}`);
}

/**
 * Find the best matching user in EcoleDirecte for a given Office 365 account.
 *
 * @param {Object} officeAccount - AAD / Office365 user object
 * @param {String} role          - "ELEVE" | "PROFESSEUR" | "FORMATEUR" | "PERSONNEL"
 * @param {Object} [options]     - Extra filters passed to getDataByType (e.g. { classe: 142 })
 *
 * @returns {Promise<null|{ match_score:number, ED:object }>}
 */
async function returnEDAccount(officeAccount, role = 'ELEVE', options = {}) {
  if (!officeAccount) return null;

  // Map "FORMATEUR" -> "PROFESSEURS", etc.
  const dataType = mapRoleToDataType(role);

  // 1) Load ED directory dynamically
  //    For ELEVES you probably want to pass a class filter in options,
  //    otherwise it may load *all* students.
  const ecoledirecte = await getDataByType(dataType, options);

  // 2) Extract Office365 identity
  const email = normalize(officeAccount.mail || officeAccount.userPrincipalName);
  const fullName = normalize(officeAccount.displayName || "");
  const parts = fullName.split(" ");
  let prenom = normalize(officeAccount.givenName || parts[0] || "");
  let nom = normalize(officeAccount.surname || parts.slice(1).join(" ") || "");

  // Swap if Office puts uppercase name first
  if (prenom.length > 0 && nom.length === 0) {
    nom = prenom;
  }

  // 3) Find best candidate in ED directory
  let bestMatch = null;
  let bestScore = 0;

  for (const ed of ecoledirecte) {
    let score = 0;

    const edNom = normalize(ed.nom);
    const edPrenom = normalize(ed.prenom);
    const edEmail = normalize(ed.email || "");

    // Email weight
    if (email && edEmail && (email === edEmail || email.includes(edEmail))) {
      score += 3;
    }

    // Name similarity
    if (similarity(nom, edNom) > 0.8) score += 2;
    if (similarity(prenom, edPrenom) > 0.8) score += 2;

    // Optionally, you can also use classe or matiere if available

    if (score > bestScore) {
      bestScore = score;
      bestMatch = ed;
    }
  }

  if (!bestMatch || bestScore < MATCH_THRESHOLD) return null;

  // 4) Normalize ED output (fields differ slightly between ELEVES / PROFESSEURS / PERSONNELS)
  const result = {
    match_score: bestScore,
    ED: {
      id: bestMatch.id,
      nom: bestMatch.nom,
      prenom: bestMatch.prenom,
      email: bestMatch.email || null,
    },
  };

  // For élèves you might have classeId/Code/Libelle derived in your ELEVES logic
  if (bestMatch.classe.id || bestMatch.classe.code || bestMatch.classe.libelle) {
    result.ED.classeId = bestMatch.classe.id || null;
    result.ED.classeCode = bestMatch.classe.code || null;
    result.ED.classeLibelle = bestMatch.classe.libelle || null;
  }

  return result;
}

module.exports = {
  returnEDAccount,
};