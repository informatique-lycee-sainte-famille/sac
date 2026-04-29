// ./API_SAC/commons/constants.common.js
// commons/constants.js
require("./env.common");
const { ECOLEDIRECTE_APIP_BASE_URL, ECOLEDIRECTE_API_BASE_URL, ECOLEDIRECTE_API_VERSION } = process.env;

const API_VERSION = ECOLEDIRECTE_API_VERSION || '4.98.0';

const DATA_URLS = {
  APIP: {
    CLASSES: '/niveauxListe.awp',
    NIVEAUX: '/niveauxListe.awp',
    NIVEAUX_ALL: '/niveauxListeAll.awp',
    ETABLISSEMENTS: '/niveauxListe.awp',
    ELEVES: '/classes/:id/eleves.awp?recupAll=1',
    ELEVES_ALL: '/messagerie/contacts/eleves.awp',
    PROFESSEURS: '/messagerie/contacts/professeurs.awp',
    PERSONNELS: '/messagerie/contacts/personnels.awp',
    SALLES: '/salles.awp',
    EDT_CLASSE: '/C/:id/emploidutemps.awp',
    EDT_SALLE: '/S/:id/emploidutemps.awp',
    EDT_PROFESSEUR: '/P/:id/emploidutemps.awp',
    COURS: '/cours/:id/detailsCours.awp',
    MESSAGES: '/enseignants/:id/messages.awp?force=true&typeRecuperation=received&idClasseur=0&orderBy=date&order=desc&query=&onlyRead=&page=0&itemsPerPage=100&getAll=0',
    APPEL: '/classes/:id/appel/horaires/:horaire.awp',
  },
  API: {
    LOGIN: '/login.awp',
  },
};

const BASE_URLS = {
  APIP: ECOLEDIRECTE_APIP_BASE_URL,
  API: ECOLEDIRECTE_API_BASE_URL,
};

const API_VERSION_PARAM = `?verbe=get&v=${API_VERSION}`;

const ROLES = {
  STUDENT: "STUDENT",
  TEACHER: "TEACHER",
  STAFF: "STAFF",
  ADMIN: "ADMIN",
};

// Priority (higher = more privileges)
const ROLE_PRIORITY = {
  [ROLES.STUDENT]: 1,
  [ROLES.TEACHER]: 2,
  [ROLES.STAFF]: 3,
  [ROLES.ADMIN]: 4,
};

// 🔑 Azure Groups → App Roles
const GROUP_TO_ROLE = {
  SAC_ELEVES: ROLES.STUDENT,
  SAC_PROFESSEURS: ROLES.TEACHER,
  SAC_FORMATEURS: ROLES.TEACHER,
  SAC_PERSONNELS: ROLES.STAFF,
  SAC_ADMINS: ROLES.ADMIN,
};

// 🔑 MAIN FUNCTION (used everywhere)
function get_highest_role_from_groups(groups) {
  if (!groups || groups.length === 0) return ROLES.STUDENT;

  let highestRole = ROLES.STUDENT;

  for (const group of groups) {
    const role = GROUP_TO_ROLE[group.name];

    if (!role) continue;

    if (ROLE_PRIORITY[role] > ROLE_PRIORITY[highestRole]) {
      highestRole = role;
    }
  }

  return highestRole;
}

// 🔑 Prisma mapping (only for DB)
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
      return "student";
  }
}


module.exports = { DATA_URLS, BASE_URLS, API_VERSION, API_VERSION_PARAM, ROLES, ROLE_PRIORITY, GROUP_TO_ROLE, get_highest_role_from_groups, map_to_prisma_role };
