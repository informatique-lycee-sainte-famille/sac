// ./API_SAC/middlewares/rate_limit.middleware.js
function getClientKey(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

module.exports = function rateLimit({
  windowMs = 1000,
  max = 10,
  keyGenerator = getClientKey,
  message = "Trop de requetes, veuillez reessayer.",
} = {}) {
  const buckets = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }, Math.max(windowMs, 1000)).unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = keyGenerator(req) || getClientKey(req);
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: "RATE_LIMITED",
        message,
      });
    }

    return next();
  };
};
