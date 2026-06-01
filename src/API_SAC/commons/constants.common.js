// ./API_SAC/commons/constants.common.js
// Charge les variables d'environnement
require("./env.common");
// Récupère les URLs de l'API EcoleDirecte et la version de l'API depuis les variables d'environnement
const { ECOLEDIRECTE_APIP_BASE_URL, ECOLEDIRECTE_API_BASE_URL, ECOLEDIRECTE_API_VERSION } = process.env;

// Version de l'API EcoleDirecte (par défaut 4.98.0 si non définie dans .env)
const API_VERSION = ECOLEDIRECTE_API_VERSION || '4.98.0';

// URLs des différents endpoints de l'API EcoleDirecte
// APIP = API privée (nécessite un token), API = API publique (login)
const DATA_URLS = {
  APIP: {
    CLASSES: '/niveauxListe.awp', // Liste des classes
    NIVEAUX: '/niveauxListe.awp', // Liste des niveaux scolaires
    NIVEAUX_ALL: '/niveauxListeAll.awp', // Liste complète de tous les niveaux
    ETABLISSEMENTS: '/niveauxListe.awp', // Liste des établissements
    ELEVES: '/classes/:id/eleves.awp?recupAll=1', // Liste des élèves d'une classe (avec :id remplacé par l'ID de la classe)
    ELEVES_ALL: '/messagerie/contacts/eleves.awp', // Liste de tous les élèves (via la messagerie)
    PROFESSEURS: '/messagerie/contacts/professeurs.awp', // Liste de tous les professeurs
    PERSONNELS: '/messagerie/contacts/personnels.awp', // Liste de tout le personnel
    SALLES: '/salles.awp', // Liste des salles
    EDT_CLASSE: '/C/:id/emploidutemps.awp', // Emploi du temps d'une classe
    EDT_SALLE: '/S/:id/emploidutemps.awp', // Emploi du temps d'une salle
    EDT_PROFESSEUR: '/P/:id/emploidutemps.awp', // Emploi du temps d'un professeur
    COURS: '/cours/:id/detailsCours.awp', // Détails d'un cours spécifique
    MESSAGES: '/enseignants/:id/messages.awp?force=true&typeRecuperation=received&idClasseur=0&orderBy=date&order=desc&query=&onlyRead=&page=0&itemsPerPage=100&getAll=0', // Messages reçus d'un enseignant
    APPEL: '/classes/:id/appel/horaires/:horaire.awp', // Envoi de l'appel (présences) pour une classe à un horaire donné
  },
  API: {
    LOGIN: '/login.awp', // Endpoint de connexion
  },
};

// URLs de base pour les deux types d'API EcoleDirecte
const BASE_URLS = {
  APIP: ECOLEDIRECTE_APIP_BASE_URL, // URL de base de l'API privée
  API: ECOLEDIRECTE_API_BASE_URL, // URL de base de l'API publique
};

// Paramètre de version ajouté à chaque requête API
const API_VERSION_PARAM = `?verbe=get&v=${API_VERSION}`;

// Définition des rôles utilisateurs dans l'application
const ROLES = {
  STUDENT: "STUDENT", // Élève
  TEACHER: "TEACHER", // Enseignant
  STAFF: "STAFF", // Personnel (vie scolaire, etc.)
  ADMIN: "ADMIN", // Administrateur
};

// Priorité des rôles : plus le nombre est élevé, plus le rôle a de droits
const ROLE_PRIORITY = {
  [ROLES.STUDENT]: 1, // Priorité la plus basse
  [ROLES.TEACHER]: 2,
  [ROLES.STAFF]: 3,
  [ROLES.ADMIN]: 4, // Priorité la plus haute
};

// Correspondance entre les noms de groupes Azure AD (Office 365) et les rôles de l'application
const GROUP_TO_ROLE = {
  SAC_ELEVES: ROLES.STUDENT, // Groupe Azure "SAC_ELEVES" → rôle STUDENT
  SAC_ENSEIGNANTS: ROLES.TEACHER, // Groupe Azure "SAC_ENSEIGNANTS" → rôle TEACHER
  SAC_PERSONNELS: ROLES.STAFF, // Groupe Azure "SAC_PERSONNELS" → rôle STAFF
  SAC_ADMINS: ROLES.ADMIN, // Groupe Azure "SAC_ADMINS" → rôle ADMIN
};

// Détermine le rôle le plus élevé parmi les groupes Azure AD de l'utilisateur
function get_highest_role_from_groups(groups) {
  // Si aucun groupe n'est fourni, retourne le rôle STUDENT par défaut
  if (!groups || groups.length === 0) return ROLES.STUDENT;

  // Commence avec le rôle le plus bas (STUDENT)
  let highestRole = ROLES.STUDENT;

  // Parcourt chaque groupe Azure AD de l'utilisateur
  for (const group of groups) {
    // Cherche le rôle correspondant au nom du groupe
    const role = GROUP_TO_ROLE[group.name];

    // Si le groupe n'est pas reconnu, on passe au suivant
    if (!role) continue;

    // Si ce rôle a une priorité plus élevée que le rôle actuel, on le met à jour
    if (ROLE_PRIORITY[role] > ROLE_PRIORITY[highestRole]) {
      highestRole = role;
    }
  }

  return highestRole;
}

// Convertit un rôle de constante (ADMIN, STAFF, etc.) vers le format utilisé par Prisma (en minuscules)
function map_to_prisma_role(role) {
  switch (role) {
    case ROLES.ADMIN:
      return "admin";
    case ROLES.STAFF:
      return "staff";
    case ROLES.TEACHER:
      return "teacher";
    case ROLES.STUDENT:
    default:
      return "student"; // Par défaut, rôle "student"
  }
}


// Exporte toutes les constantes et fonctions utilitaires
module.exports = { DATA_URLS, BASE_URLS, API_VERSION, API_VERSION_PARAM, ROLES, ROLE_PRIORITY, GROUP_TO_ROLE, get_highest_role_from_groups, map_to_prisma_role };
