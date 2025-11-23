require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env'), quiet: true });

module.exports = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
  },
  redirectUri: process.env.AZURE_REDIRECT_URI || "http://localhost:3000/api/auth/redirect",
  scopes: ["User.Read", "email", "openid", "profile"],
};
