// ./API_SAC/commons/mail.common.js
// Importe le client MSAL confidentiel pour l'authentification avec Microsoft Graph API
const { ConfidentialClientApplication } = require("@azure/msal-node");
// Importe le système de logging
const { TECHNICAL_LEVELS, log_technical } = require("./logger.common");

// Instance singleton du client MSAL pour l'envoi de mails
let cca = null;

// Crée ou retourne le client MSAL pour l'envoi d'emails (initialisation paresseuse)
function getMailClient() {
  // Si le client existe déjà, on le retourne directement
  if (cca) return cca;

  // Vérifie que les identifiants Azure sont configurés
  if (!process.env.AZURE_CLIENT_ID || !process.env.AZURE_TENANT_ID || !process.env.AZURE_CLIENT_SECRET) {
    throw new Error("Azure mail credentials are missing.");
  }

  // Crée le client MSAL avec les identifiants Azure
  cca = new ConfidentialClientApplication({
    auth: {
      clientId: process.env.AZURE_CLIENT_ID, // ID de l'application Azure
      authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`, // URL du tenant Azure
      clientSecret: process.env.AZURE_CLIENT_SECRET, // Clé secrète de l'application
    },
  });

  return cca;
}

// Obtient un token d'accès pour l'API Microsoft Graph (utilisé pour envoyer des mails)
async function getAccessToken() {
  // Utilise le flux "client credentials" (l'application agit en son propre nom, pas au nom d'un utilisateur)
  const result = await getMailClient().acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"], // Permissions par défaut de Graph API
  });

  // Vérifie qu'un token a bien été obtenu
  if (!result) {
    throw new Error("Failed to acquire token");
  }

  return result.accessToken;
}

// Envoie un email via l'API Microsoft Graph en utilisant un compte robot Office 365
async function sendMail({ to, subject, html, attachments = [] }) {
  // Obtient le token d'accès pour Microsoft Graph
  const token = await getAccessToken();

  // Normalise la liste des destinataires (accepte une seule adresse ou un tableau)
  const emails = Array.isArray(to) ? to : [to];

  // Appelle l'API Microsoft Graph pour envoyer l'email
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${process.env.O365_ROBOT_EMAIL}/sendMail`, // Envoie depuis le compte robot
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`, // Token d'authentification
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject, // Sujet de l'email
          body: {
            contentType: "HTML", // Le contenu est en HTML
            content: html, // Corps HTML de l'email
          },
          // Convertit la liste d'emails en format attendu par Graph API
          toRecipients: emails.map(email => ({
            emailAddress: { address: email },
          })),

          // Convertit les pièces jointes au format Graph API
          attachments: attachments.map(file => ({
            "@odata.type": "#microsoft.graph.fileAttachment", // Type de pièce jointe
            name: file.name, // Nom du fichier
            contentType: file.contentType, // Type MIME (ex: "application/pdf")
            contentBytes: file.contentBytes, // Contenu en base64
          })),
        },
      }),
    }
  );

  // Si l'envoi a échoué, on log l'erreur et on lève une exception
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

  // Log de succès avec les détails de l'envoi
  log_technical(TECHNICAL_LEVELS.INFO, "Email sent", {
    recipients: emails,
    subject,
    attachmentCount: attachments.length,
  });
}

// Exporte la fonction d'envoi de mail
module.exports = { sendMail };
