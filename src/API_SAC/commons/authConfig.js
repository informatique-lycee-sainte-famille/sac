require("./env");

module.exports = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
  },
  redirectUri: process.env.AZURE_REDIRECT_URI || "http://localhost:3000/api/o365/redirect",
  scopes: ["User.Read", "email", "openid", "profile"],
};
