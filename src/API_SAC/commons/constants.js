// commons/constants.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env'), quiet: true });

const { ECOLEDIRECTE_APIP_BASE_URL, ECOLEDIRECTE_API_BASE_URL, ECOLEDIRECTE_API_VERSION } = process.env;

const API_VERSION = ECOLEDIRECTE_API_VERSION || '4.87.0';

const DATA_URLS = {
  APIP: {
    CLASSES: '/niveauxListe.awp',
    NIVEAUX: '/niveauxListe.awp',
    NIVEAUX_ALL: '/niveauxListeAll.awp',
    ETABLISSEMENTS: '/niveauxListe.awp',
    ELEVES: '/classes/:id/eleves.awp?recupAll=1',
    ELEVES_ALL: '/messagerie/contacts/eleves.awp',
    PROFESSEURS: '/messagerie/contacts/professeurs.awp',
    SALLES: '/salles.awp',
    EDT: '/C/:id/emploidutemps.awp',
    MESSAGES: '/enseignants/:id/messages.awp?force=true&typeRecuperation=received&idClasseur=0&orderBy=date&order=desc&query=&onlyRead=&page=0&itemsPerPage=100&getAll=0',
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

module.exports = { DATA_URLS, BASE_URLS, API_VERSION, API_VERSION_PARAM };
