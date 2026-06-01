// ./API_SAC/middlewares/rate_limit.middleware.js
// Middleware de limitation de débit (rate limiting) implémenté en mémoire.
// Limite le nombre de requêtes qu'un client peut faire dans une fenêtre de temps donnée.

// Fonction par défaut pour identifier un client : utilise son adresse IP
function getClientKey(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

// Fabrique (factory) du middleware de rate limiting.
// Accepte des options de configuration et retourne le middleware Express.
module.exports = function rateLimit({
  windowMs = 1000, // Fenêtre de temps en millisecondes (par défaut 1 seconde)
  max = 10, // Nombre maximum de requêtes autorisées par fenêtre
  keyGenerator = getClientKey, // Fonction qui génère une clé unique par client
  message = "Trop de requetes, veuillez reessayer.", // Message d'erreur retourné en cas de dépassement
} = {}) {
  // Map qui stocke les compteurs de requêtes par clé client
  const buckets = new Map();

  // Nettoyage périodique : supprime les buckets expirés pour éviter les fuites de mémoire.
  // .unref() empêche ce timer de maintenir le processus Node.js en vie.
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
      // Supprime les buckets dont la fenêtre de temps est expirée
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }, Math.max(windowMs, 1000)).unref();

  // Retourne le middleware Express
  return (req, res, next) => {
    const now = Date.now();
    // Génère la clé unique pour ce client (basée sur l'IP ou la session)
    const key = keyGenerator(req) || getClientKey(req);
    // Récupère le bucket (compteur) existant pour cette clé
    const bucket = buckets.get(key);

    // Si aucun bucket n'existe ou s'il est expiré, on en crée un nouveau
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next(); // Première requête de la fenêtre, on laisse passer
    }

    // Incrémente le compteur de requêtes
    bucket.count += 1;
    // Si le nombre de requêtes dépasse la limite, on bloque avec un code 429
    if (bucket.count > max) {
      // Calcule le temps d'attente avant la prochaine fenêtre
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      // Ajoute l'en-tête Retry-After pour informer le client du temps d'attente
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: "RATE_LIMITED",
        message,
      });
    }

    // La requête est dans la limite, on la laisse passer
    return next();
  };
};
