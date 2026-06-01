// ./API_SAC/commons/match_office_to_ed.common.js
// Importe la fonction qui récupère les données depuis l'API EcoleDirecte
const { get_data_by_type } = require('../../scripts/auto/get_data.script.js');

// Seuil minimum de score pour considérer qu'un match est fiable entre un compte Office 365 et EcoleDirecte
const MATCH_THRESHOLD = 3;

// Normalise une chaîne de texte pour la comparaison : minuscules, suppression des accents et caractères spéciaux
const normalize = (str = "") =>
  str
    .toLowerCase() // Convertit en minuscules
    .normalize("NFD") // Décompose les caractères accentués
    .replace(/[\u0300-\u036f]/g, "") // Supprime les accents
    .replace(/[^a-z0-9@. ]/g, "") // Ne garde que les lettres, chiffres, @, points et espaces
    .trim(); // Supprime les espaces en début et fin

// Calcule la distance de Levenshtein entre deux chaînes (nombre minimum d'opérations pour transformer a en b).
// Plus la distance est petite, plus les chaînes se ressemblent.
const levenshtein = (a, b) => {
  if (!a || !b) return Math.max(a?.length || 0, b?.length || 0);
  const matrix = [];
  // Initialise la première colonne de la matrice
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  // Initialise la première ligne de la matrice
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  // Remplit la matrice en comparant chaque caractère
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // Suppression
        matrix[i][j - 1] + 1, // Insertion
        matrix[i - 1][j - 1] + (a[j - 1] === b[i - 1] ? 0 : 1) // Substitution (0 si même caractère)
      );
    }
  }
  // La distance finale est dans le coin inférieur droit de la matrice
  return matrix[b.length][a.length];
};

// Calcule un score de similarité entre 0 et 1 (1 = identique, 0 = totalement différent)
const similarity = (a, b) => {
  const na = normalize(a);
  const nb = normalize(b);
  // Si les deux chaînes sont vides, elles sont identiques
  if (!na && !nb) return 1;
  // Si une seule est vide, elles sont totalement différentes
  if (!na || !nb) return 0;
  // Calcule la similarité = 1 - (distance / longueur max)
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
};

// Convertit un rôle utilisateur en type de données à récupérer depuis EcoleDirecte
function mapRoleToDataType(role) {
  const r = role?.toUpperCase();
  if (r === 'STUDENT') return 'ELEVES_ALL'; // Les élèves
  if( r === 'STAFF' || r === 'ADMIN') return 'PERSONNELS'; // Le personnel
  if (r === 'TEACHER') return 'PROFESSEURS'; // Les professeurs
  if(r === 'ADMIN') return null; // Doublon pour admin (déjà géré ci-dessus)
  throw new Error(`Type d'annuaire non supporté: ${role}`);
}

// Recherche le compte EcoleDirecte correspondant à un compte Office 365.
// Compare l'email, le nom et le prénom pour trouver la meilleure correspondance.
async function return_ed_account(officeAccount, role = 'STUDENT', options = {}) {
  // Si aucun compte Office n'est fourni, retourne null
  if (!officeAccount) return null;

  // Détermine le type de données ED à interroger selon le rôle
  const dataType = mapRoleToDataType(role);
  // Récupère la liste des utilisateurs EcoleDirecte correspondants au rôle
  const ecoledirecte = await get_data_by_type(dataType, options);

  // Normalise les données du compte Office 365
  const email = normalize(officeAccount.mail || officeAccount.userPrincipalName);
  const fullName = normalize(officeAccount.displayName || "");
  const parts = fullName.split(" ");
  let prenom = normalize(officeAccount.givenName || parts[0] || "");
  let nom = normalize(officeAccount.surname || parts.slice(1).join(" ") || "");

  // Certains comptes Office n'exposent qu'un seul nom ; on le garde pour la recherche
  if (prenom.length > 0 && nom.length === 0) {
    nom = prenom;
  }

  // Variables pour suivre la meilleure correspondance
  let bestMatch = null;
  let bestScore = 0;

  // Parcourt tous les comptes EcoleDirecte pour trouver la meilleure correspondance
  for (const ed of ecoledirecte) {
    let score = 0;

    // Normalise les données EcoleDirecte pour comparaison
    const edNom = normalize(ed.nom);
    const edPrenom = normalize(ed.prenom);
    const edEmail = normalize(ed.email || "");

    // Correspondance par email = +3 points (la plus fiable)
    if (email && edEmail && (email === edEmail || email.includes(edEmail))) {
      score += 3;
    }

    // Correspondance du nom de famille (similarité > 80%) = +2 points
    if (similarity(nom, edNom) > 0.8) score += 2;
    // Correspondance du prénom (similarité > 80%) = +2 points
    if (similarity(prenom, edPrenom) > 0.8) score += 2;

    // Met à jour le meilleur match si ce score est plus élevé
    if (score > bestScore) {
      bestScore = score;
      bestMatch = ed;
    }
  }

  // Si aucune correspondance suffisamment fiable (score < seuil), retourne null
  if (!bestMatch || bestScore < MATCH_THRESHOLD) return null;

  // Construit le résultat avec les informations EcoleDirecte
  const result = {
    match_score: bestScore, // Score de correspondance
    ED: {
      id: bestMatch.id, // ID EcoleDirecte
      nom: bestMatch.nom, // Nom de famille
      prenom: bestMatch.prenom, // Prénom
      email: bestMatch.email || null, // Email ED
    },
  };

  // Ajoute les informations de classe si elles existent
  if (bestMatch.classe.id || bestMatch.classe.code || bestMatch.classe.libelle) {
    result.ED.classeId = bestMatch.classe.id || null; // ID de la classe ED
    result.ED.classeLibelle = bestMatch.classe.libelle || null; // Nom de la classe ED
  }

  return result;
}

// Exporte la fonction de correspondance Office 365 → EcoleDirecte
module.exports = {
  return_ed_account,
};
