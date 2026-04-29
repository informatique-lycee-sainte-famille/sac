// ./API_SAC/commons/prisma_session_store.common.js
const session = require("express-session");
const { prisma } = require("./prisma.common");
const { TECHNICAL_LEVELS, log_technical } = require("./logger.common");

class PrismaSessionStore extends session.Store {
  async get(sid, callback) {
    try {
      const record = await prisma.browserSession.findUnique({
        where: { sid },
      });

      if (!record) return callback(null, null);

      callback(null, record.data);
    } catch (err) {
      log_technical(TECHNICAL_LEVELS.WARNING, "Browser session read failed", { error: err });
      callback(err);
    }
  }

  async set(sid, sessionData, callback) {
    try {
      const expires = sessionData.cookie?.expires
        ? new Date(sessionData.cookie.expires)
        : new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

      await prisma.browserSession.upsert({
        where: { sid },
        update: {
          data: sessionData,
          expiresAt: expires,
        },
        create: {
          sid,
          data: sessionData,
          expiresAt: expires,
        },
      });

      callback(null);
    } catch (err) {
      log_technical(TECHNICAL_LEVELS.WARNING, "Browser session write failed", { error: err });
      callback(err);
    }
  }

  async destroy(sid, callback) {
    try {
      await prisma.browserSession.delete({
        where: { sid },
      });
      callback(null);
    } catch (err) {
      log_technical(TECHNICAL_LEVELS.WARNING, "Browser session destroy failed", { error: err });
      callback(err);
    }
  }
}

module.exports = PrismaSessionStore;
