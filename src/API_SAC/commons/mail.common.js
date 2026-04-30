// ./API_SAC/commons/mail.common.js
const { ConfidentialClientApplication } = require("@azure/msal-node");
const { TECHNICAL_LEVELS, log_technical } = require("./logger.common");

let cca = null;

function getMailClient() {
  if (cca) return cca;

  if (!process.env.AZURE_CLIENT_ID || !process.env.AZURE_TENANT_ID || !process.env.AZURE_CLIENT_SECRET) {
    throw new Error("Azure mail credentials are missing.");
  }

  cca = new ConfidentialClientApplication({
    auth: {
      clientId: process.env.AZURE_CLIENT_ID,
      authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
  });

  return cca;
}

async function getAccessToken() {
  const result = await getMailClient().acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });

  if (!result) {
    throw new Error("Failed to acquire token");
  }

  return result.accessToken;
}

async function sendMail({ to, subject, html, attachments = [] }) {
  const token = await getAccessToken();

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
          toRecipients: emails.map(email => ({
            emailAddress: { address: email },
          })),

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
    log_technical(TECHNICAL_LEVELS.ERROR, "Graph sendMail failed", {
      status: response.status,
      error,
      recipients: emails,
      subject,
    });
    throw new Error("Email send failed");
  }

  log_technical(TECHNICAL_LEVELS.INFO, "Email sent", {
    recipients: emails,
    subject,
    attachmentCount: attachments.length,
  });
}

module.exports = { sendMail };
