// ./API_SAC/commons/auth_config.common.js
// Charge les variables d'environnement (fichier .env)
require("./env.common");

// Construit l'URL de redirection Azure OAuth :
// - Si EXTERNAL_DOMAIN est défini dans .env, on utilise ce domaine + /api/o365/redirect
// - Sinon, on utilise localhost:3000 par défaut (mode développement)
const AZURE_REDIRECT_URI = process.env.EXTERNAL_DOMAIN
  ? `${process.env.EXTERNAL_DOMAIN}/api/o365/redirect`
  : "http://localhost:3000/api/o365/redirect";

// Exporte la configuration d'authentification Azure / Microsoft OAuth
module.exports = {
  // Configuration d'authentification Azure AD (MSAL)
  auth: {
    clientId: process.env.AZURE_CLIENT_ID, // Identifiant de l'application Azure
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`, // URL du tenant Azure AD
    clientSecret: process.env.AZURE_CLIENT_SECRET, // Clé secrète de l'application Azure
  },
  redirectUri: AZURE_REDIRECT_URI, // URL de redirection après authentification OAuth
  // Permissions (scopes) demandées lors de la connexion Office 365
  scopes: ["User.Read", "email", "openid", "profile", "Group.Read.All"],
};
