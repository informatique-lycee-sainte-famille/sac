const crypto = require("crypto");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function getCookieOptions(req) {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  return {
    httpOnly: false,
    sameSite: "lax",
    secure,
    path: "/",
  };
}

function ensureToken(req, res) {
  if (!req.session) return null;
  if (!req.session.user && !req.session.csrfToken) return null;

  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("base64url");
  }

  res.cookie("XSRF-TOKEN", req.session.csrfToken, getCookieOptions(req));
  return req.session.csrfToken;
}

module.exports = function csrfProtection(req, res, next) {
  if (!req.path.startsWith("/api/")) {
    return next();
  }

  const token = ensureToken(req, res);

  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  if (!token) {
    return res.status(403).json({
      error: "CSRF_SESSION_MISSING",
      message: "Session CSRF manquante.",
    });
  }

  const submittedToken = req.headers["x-csrf-token"] || req.headers["x-xsrf-token"];
  if (!submittedToken || submittedToken !== token) {
    return res.status(403).json({
      error: "CSRF_TOKEN_INVALID",
      message: "Jeton CSRF invalide ou manquant.",
    });
  }

  return next();
};
