// ./API_SAC/commons/msal_client.common.js
// Importe le client confidentiel MSAL (Microsoft Authentication Library) pour l'authentification côté serveur
const { ConfidentialClientApplication } = require("@azure/msal-node");
// Importe la configuration d'authentification Azure (clientId, authority, clientSecret)
const auth_config = require("./auth_config.common");

// Variable pour stocker l'instance unique du client MSAL (pattern singleton)
let client = null;

// Fonction qui crée ou retourne le client MSAL existant (initialisation paresseuse / lazy)
function get_msal_client() {
  // Si le client existe déjà, on le retourne directement
  if (client) return client;

  // Récupère la configuration d'authentification
  const auth = auth_config.auth;
  // Vérifie que toutes les informations nécessaires sont présentes
  if (!auth.clientId || !auth.authority || !auth.clientSecret) {
    throw new Error("Azure OAuth credentials are missing.");
  }

  // Crée une nouvelle instance du client MSAL confidentiel
  client = new ConfidentialClientApplication({ auth });
  return client;
}

// Crée un Proxy JavaScript qui redirige tous les accès de propriétés vers le vrai client MSAL.
// Cela permet d'utiliser msal_client comme si c'était directement le client,
// tout en gardant l'initialisation paresseuse (le client n'est créé qu'au premier appel).
const msal_client = new Proxy({}, {
  get(_target, property) {
    // Récupère la propriété sur le vrai client MSAL
    const value = get_msal_client()[property];
    // Si c'est une fonction, on la lie (bind) au client pour conserver le contexte "this"
    return typeof value === "function" ? value.bind(get_msal_client()) : value;
  },
});

// Exporte le proxy du client MSAL
module.exports = { msal_client };
