const { ROLE_PRIORITY } = require("../commons/constants");

module.exports = function require_access({ role, minRole } = {}) {
  return (req, res, next) => {
    try {
      const user = req.session?.userInfo;

      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userRole = user.jobTitle?.toUpperCase();

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
      console.error("Access middleware error:", err.message);
      res.status(500).send("Internal Server Error");
    }
  };
};