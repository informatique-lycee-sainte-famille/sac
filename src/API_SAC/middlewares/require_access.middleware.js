// ./API_SAC/middlewares/require_access.middleware.js
const { ROLE_PRIORITY } = require("../commons/constants.common");
const { TECHNICAL_LEVELS, log_technical } = require("../commons/logger.common");

module.exports = function require_access({ role, minRole } = {}) {
  return (req, res, next) => {
    try {
      const user = req.session?.user;

      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userRole = user.roleConst;

      if (!userRole) {
        return res.status(403).json({ message: "No role assigned" });
      }

      if (role && minRole) {
        throw new Error("Cannot use both role and minRole");
      }

      // ✅ Exact role
      if (role) {
        if (userRole !== role) {
          return res.status(403).json({
            message: `Requires role: ${role}`,
          });
        }
        return next();
      }

      // ✅ Minimum role (hierarchy)
      if (minRole) {
        if (ROLE_PRIORITY[userRole] < ROLE_PRIORITY[minRole]) {
          return res.status(403).json({
            message: `Requires at least role: ${minRole}`,
          });
        }
        return next();
      }
      // No restriction
      return next();
    } catch (err) {
      log_technical(TECHNICAL_LEVELS.ERROR, "Access middleware failed", {
        error: err,
        path: req.path,
        userId: req.session?.user?.id,
      });
      res.status(500).send("Internal Server Error");
    }
  };
};
