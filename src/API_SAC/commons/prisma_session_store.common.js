// ./API_SAC/commons/prisma_session_store.common.js
// Importe le module express-session pour hériter de la classe Store
const session = require("express-session");
// Importe le client Prisma pour interagir avec la base de données
const { prisma } = require("./prisma.common");
// Importe le système de logging technique
const { TECHNICAL_LEVELS, log_technical } = require("./logger.common");

// Store de sessions personnalisé qui stocke les sessions dans la table "BrowserSession" de la BDD via Prisma.
// Hérite de session.Store (la classe de base d'express-session) pour être compatible avec le middleware.
class PrismaSessionStore extends session.Store {

  // Récupère une session depuis la base de données à partir de son identifiant (sid)
  async get(sid, callback) {
    try {
      // Cherche la session dans la table BrowserSession par son identifiant unique
      const record = await prisma.browserSession.findUnique({
        where: { sid },
      });

      // Si aucune session trouvée, retourne null (session inexistante)
      if (!record) return callback(null, null);

      // Retourne les données de la session (objet JSON stocké dans le champ "data")
      callback(null, record.data);
    } catch (err) {
      // En cas d'erreur, on log un warning et on propage l'erreur via le callback
      log_technical(TECHNICAL_LEVELS.WARNING, "Browser session read failed", { error: err });
      callback(err);
    }
  }

  // Crée ou met à jour une session dans la base de données
  async set(sid, sessionData, callback) {
    try {
      // Calcule la date d'expiration du cookie de session
      // Si le cookie a une date d'expiration, on l'utilise, sinon on met 180 jours par défaut
      const expires = sessionData.cookie?.expires
        ? new Date(sessionData.cookie.expires)
        : new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

      // Utilise "upsert" : met à jour si la session existe déjà, sinon en crée une nouvelle
      await prisma.browserSession.upsert({
        where: { sid }, // Critère de recherche : l'identifiant de session
        update: {
          data: sessionData, // Met à jour les données de la session
          expiresAt: expires, // Met à jour la date d'expiration
        },
        create: {
          sid, // Identifiant unique de la session
          data: sessionData, // Données de la session (sérialisées en JSON)
          expiresAt: expires, // Date d'expiration
        },
      });

      // Signale que l'opération s'est bien passée (pas d'erreur)
      callback(null);
    } catch (err) {
      // En cas d'erreur, on log un warning et on propage l'erreur
      log_technical(TECHNICAL_LEVELS.WARNING, "Browser session write failed", { error: err });
      callback(err);
    }
  }

  // Supprime une session de la base de données (quand l'utilisateur se déconnecte par exemple)
  async destroy(sid, callback) {
    try {
      // Supprime la session correspondant à l'identifiant
      await prisma.browserSession.delete({
        where: { sid },
      });
      // Signale que l'opération s'est bien passée
      callback(null);
    } catch (err) {
      // En cas d'erreur, on log un warning et on propage l'erreur
      log_technical(TECHNICAL_LEVELS.WARNING, "Browser session destroy failed", { error: err });
      callback(err);
    }
  }
}

// Exporte la classe pour qu'elle puisse être utilisée comme store de sessions dans la config Express
module.exports = PrismaSessionStore;
