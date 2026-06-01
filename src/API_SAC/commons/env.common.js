// ./API_SAC/commons/env.common.js
// Charge les variables d'environnement depuis le fichier .env situé deux dossiers au-dessus (dans src/),
// en utilisant le module "dotenv". L'option "quiet: true" évite d'afficher une erreur si le fichier .env n'existe pas.
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env'), quiet: true });