// ./API_SAC/commons/match_office_to_ed.common.js
const { get_data_by_type } = require('../../scripts/auto/get_data.script.js');

const MATCH_THRESHOLD = 3;

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

function mapRoleToDataType(role) {
  const r = role?.toUpperCase();
  if (r === 'STUDENT') return 'ELEVES_ALL';
  if( r === 'STAFF' || r === 'ADMIN') return 'PERSONNELS';
  if (r === 'TEACHER') return 'PROFESSEURS';
  if(r === 'ADMIN') return null;
  throw new Error(`Type d'annuaire non supporté: ${role}`);
}

async function return_ed_account(officeAccount, role = 'STUDENT', options = {}) {
  if (!officeAccount) return null;

  const dataType = mapRoleToDataType(role);
  const ecoledirecte = await get_data_by_type(dataType, options);

  const email = normalize(officeAccount.mail || officeAccount.userPrincipalName);
  const fullName = normalize(officeAccount.displayName || "");
  const parts = fullName.split(" ");
  let prenom = normalize(officeAccount.givenName || parts[0] || "");
  let nom = normalize(officeAccount.surname || parts.slice(1).join(" ") || "");

  // Some Office accounts only expose one display-name chunk; keep it searchable.
  if (prenom.length > 0 && nom.length === 0) {
    nom = prenom;
  }

  let bestMatch = null;
  let bestScore = 0;

  for (const ed of ecoledirecte) {
    let score = 0;

    const edNom = normalize(ed.nom);
    const edPrenom = normalize(ed.prenom);
    const edEmail = normalize(ed.email || "");

    if (email && edEmail && (email === edEmail || email.includes(edEmail))) {
      score += 3;
    }

    if (similarity(nom, edNom) > 0.8) score += 2;
    if (similarity(prenom, edPrenom) > 0.8) score += 2;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = ed;
    }
  }

  if (!bestMatch || bestScore < MATCH_THRESHOLD) return null;

  const result = {
    match_score: bestScore,
    ED: {
      id: bestMatch.id,
      nom: bestMatch.nom,
      prenom: bestMatch.prenom,
      email: bestMatch.email || null,
    },
  };

  if (bestMatch.classe.id || bestMatch.classe.code || bestMatch.classe.libelle) {
    result.ED.classeId = bestMatch.classe.id || null;
    result.ED.classeLibelle = bestMatch.classe.libelle || null;
  }

  return result;
}

module.exports = {
  return_ed_account,
};
