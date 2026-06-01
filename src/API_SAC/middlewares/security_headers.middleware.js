// ./API_SAC/middlewares/security_headers.middleware.js
// Middleware Express qui ajoute des en-têtes de sécurité HTTP à chaque réponse.
// Ces en-têtes protègent contre diverses attaques web (XSS, clickjacking, injection, etc.)
module.exports = function securityHeaders(req, res, next) {
  // Empêche le navigateur de deviner le type MIME d'un fichier (protection contre les attaques MIME sniffing)
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Empêche l'affichage de la page dans une iframe (protection contre le clickjacking)
  res.setHeader("X-Frame-Options", "DENY");
  // Contrôle les informations envoyées dans le header Referer (protection de la vie privée)
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Désactive les APIs sensibles du navigateur sauf NFC (autorisé pour l'app)
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), nfc=(self)");
  // Politique d'embarquement cross-origin : autorise les ressources sans credentials
  res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
  // Isole la page des autres onglets/fenêtres (protection contre les attaques Spectre)
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  // Empêche le chargement de ressources par d'autres origines
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");

  // En HTTPS, active HSTS (force le navigateur à toujours utiliser HTTPS pendant 180 jours)
  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }

  // Content Security Policy (CSP) : contrôle les sources de contenu autorisées sur la page
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'", // Par défaut, seul le même domaine est autorisé
      "base-uri 'self'", // L'URL de base ne peut pas être modifiée
      "object-src 'none'", // Pas de plugins (Flash, Java, etc.)
      "frame-ancestors 'none'", // Interdit l'affichage dans des iframes
      "img-src 'self' data: blob:", // Images : même domaine + data URI + blob (pour les avatars en base64)
      "font-src 'self' https://cdn.jsdelivr.net data:", // Polices : même domaine + CDN jsDelivr
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net", // Styles : même domaine + inline + CDN
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net", // Scripts : même domaine + inline + CDN
      "connect-src 'self' https://cdn.jsdelivr.net", // Requêtes AJAX/fetch : même domaine + CDN
      "manifest-src 'self'", // Manifest PWA : même domaine uniquement
      "worker-src 'self' blob:", // Service workers : même domaine + blob
      "form-action 'self' https://login.microsoftonline.com", // Actions de formulaire : même domaine + login Microsoft
    ].join("; ")
  );

  // Passe au middleware suivant
  next();
};
