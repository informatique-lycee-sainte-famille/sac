require("./env");

const AZURE_REDIRECT_URI = process.env.EXTERNAL_DOMAIN
  ? `${process.env.EXTERNAL_DOMAIN}/api/o365/redirect`
  : "http://localhost:3000/api/o365/redirect";

module.exports = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
  },
  redirectUri: AZURE_REDIRECT_URI,
  scopes: ["User.Read", "email", "openid", "profile", "Group.Read.All"],
};
