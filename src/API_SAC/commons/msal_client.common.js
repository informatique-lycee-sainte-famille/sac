// ./API_SAC/commons/msal_client.common.js
const { ConfidentialClientApplication } = require("@azure/msal-node");
const auth_config = require("./auth_config.common");

const msal_client = new ConfidentialClientApplication({
  auth: auth_config.auth,
});

module.exports = { msal_client };
