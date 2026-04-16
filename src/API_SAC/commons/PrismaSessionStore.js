const session = require("express-session");
const { prisma } = require("./prisma");

class PrismaSessionStore extends session.Store {
  async get(sid, callback) {
    try {
      const record = await prisma.browserSession.findUnique({
        where: { sid },
      });

      if (!record) return callback(null, null);

      callback(null, record.data);
    } catch (err) {
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
      callback(err);
    }
  }
}

module.exports = PrismaSessionStore;