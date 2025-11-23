const { ConfidentialClientApplication } = require("@azure/msal-node");
const authConfig = require("./authConfig");

const msalClient = new ConfidentialClientApplication({
  auth: authConfig.auth,
});

module.exports = { msalClient };
