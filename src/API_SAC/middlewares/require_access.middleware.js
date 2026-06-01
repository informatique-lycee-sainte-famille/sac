// ./API_SAC/middlewares/require_access.middleware.js
// Middleware de contrôle d'accès basé sur les rôles (RBAC).
// Vérifie que l'utilisateur connecté possède le rôle requis pour accéder à la route.

// Importe la table de priorité des rôles pour comparer les niveaux d'accès
const { ROLE_PRIORITY } = require("../commons/constants.common");
// Importe le système de logging
const { TECHNICAL_LEVELS, log_technical } = require("../commons/logger.common");

// Fabrique (factory) du middleware de contrôle d'accès.
// Deux modes possibles :
// - role : l'utilisateur doit avoir exactement ce rôle
// - minRole : l'utilisateur doit avoir ce rôle ou un rôle supérieur
module.exports = function require_access({ role, minRole } = {}) {
  return (req, res, next) => {
    try {
      // Récupère l'utilisateur depuis la session Express
      const user = req.session?.user;

      // Si aucun utilisateur n'est connecté, retourne 401 (non authentifié)
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Récupère le rôle de l'utilisateur (au format constante : STUDENT, TEACHER, etc.)
      const userRole = user.roleConst;

      // Si l'utilisateur n'a aucun rôle assigné, retourne 403 (interdit)
      if (!userRole) {
        return res.status(403).json({ message: "No role assigned" });
      }

      // On ne peut pas utiliser les deux modes en même temps
      if (role && minRole) {
        throw new Error("Cannot use both role and minRole");
      }

      // Mode "rôle exact" : l'utilisateur doit avoir exactement le rôle spécifié
      if (role) {
        if (userRole !== role) {
          return res.status(403).json({
            message: `Requires role: ${role}`,
          });
        }
        return next(); // Le rôle correspond, on laisse passer
      }

      // Mode "rôle minimum" : l'utilisateur doit avoir un rôle de priorité >= au rôle minimum
      if (minRole) {
        if (ROLE_PRIORITY[userRole] < ROLE_PRIORITY[minRole]) {
          return res.status(403).json({
            message: `Requires at least role: ${minRole}`,
          });
        }
        return next(); // Le rôle est suffisant, on laisse passer
      }
      // Si aucun rôle n'est spécifié (ni role, ni minRole), on laisse passer tout le monde
      return next();
    } catch (err) {
      // En cas d'erreur interne, log l'erreur et retourne 500
      log_technical(TECHNICAL_LEVELS.ERROR, "Access middleware failed", {
        error: err,
        path: req.path,
        userId: req.session?.user?.id,
      });
      res.status(500).send("Internal Server Error");
    }
  };
};
