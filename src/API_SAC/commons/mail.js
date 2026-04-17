const { ConfidentialClientApplication } = require("@azure/msal-node");
// const fetch = require("node-fetch");

const msalConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
  },
};

const cca = new ConfidentialClientApplication(msalConfig);

// 🔑 Get app token (no user needed)
async function getAccessToken() {
  const result = await cca.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });

  if (!result) {
    throw new Error("Failed to acquire token");
  }

  return result.accessToken;
}

// 📧 Send email
async function sendMail({ to, subject, html, attachments = [] }) {
  const token = await getAccessToken();

  // ensure array
  const emails = Array.isArray(to) ? to : [to];

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${process.env.O365_ROBOT_EMAIL}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: "HTML",
            content: html,
          },

          // ✅ MULTIPLE RECIPIENTS
          toRecipients: emails.map(email => ({
            emailAddress: { address: email },
          })),

          // ✅ OPTIONAL ATTACHMENTS
          attachments: attachments.map(file => ({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: file.name,
            contentType: file.contentType,
            contentBytes: file.contentBytes, // base64
          })),
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Graph sendMail error:", error);
    throw new Error("Email send failed");
  }

  console.log("✅ Email sent");
}

module.exports = { sendMail };