// ./API_SAC/commons/msal_client.common.js
const { ConfidentialClientApplication } = require("@azure/msal-node");
const auth_config = require("./auth_config.common");

let client = null;

function get_msal_client() {
  if (client) return client;

  const auth = auth_config.auth;
  if (!auth.clientId || !auth.authority || !auth.clientSecret) {
    throw new Error("Azure OAuth credentials are missing.");
  }

  client = new ConfidentialClientApplication({ auth });
  return client;
}

const msal_client = new Proxy({}, {
  get(_target, property) {
    const value = get_msal_client()[property];
    return typeof value === "function" ? value.bind(get_msal_client()) : value;
  },
});

module.exports = { msal_client };
