// ./API_SAC/commons/session_config.common.js
const session = require("express-session");
const PrismaSessionStore = require("./prisma_session_store.common");

const DAY = 1000 * 60 * 60 * 24;
const SESSION_DURATION_DAYS = parseInt(process.env.SESSION_DURATION_DAYS) || 180; // 6 months by default
const isProduction = process.env.ENV === "prod" || process.env.NODE_ENV === "production";
const secureCookie = process.env.SESSION_COOKIE_SECURE
  ? process.env.SESSION_COOKIE_SECURE === "true"
  : isProduction;
const sessionSecret = process.env.SESSION_SECRET;

if (isProduction && !sessionSecret) {
  throw new Error("SESSION_SECRET is required in production.");
}

module.exports.session_options = {
  name: "sac.sid",
  secret: sessionSecret || "dev-only-change-me",
  resave: false,
  saveUninitialized: false,
  store: new PrismaSessionStore(),
  cookie: {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    maxAge: SESSION_DURATION_DAYS * DAY, // 30 or 180 days
  },
};
    
