const session = require("express-session");
const FileStore = require("session-file-store")(session);

const DAY = 1000 * 60 * 60 * 24;

module.exports.sessionOptions = {
  secret: process.env.SESSION_SECRET || "supersecretkey",
  resave: false,
  saveUninitialized: false,
  store: new FileStore(),
  cookie: {
    httpOnly: true,
    secure: false,     // put true IF behind HTTPS reverse-proxy
    maxAge: 180 * DAY, // 30 or 180 days
  },
};
    