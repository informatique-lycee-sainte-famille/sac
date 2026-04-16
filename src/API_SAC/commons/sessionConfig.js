const session = require("express-session");
const PrismaSessionStore = require("./PrismaSessionStore");

const DAY = 1000 * 60 * 60 * 24;

module.exports.sessionOptions = {
  secret: process.env.SESSION_SECRET || "supersecretkey",
  resave: false,
  saveUninitialized: false,
  store: new PrismaSessionStore(),
  cookie: {
    httpOnly: true,
    secure: false,     // put true IF behind HTTPS reverse-proxy
    maxAge: 180 * DAY, // 30 or 180 days
  },
};
    