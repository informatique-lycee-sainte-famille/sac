const express = require("express");
const swaggerUi = require("swagger-ui-express");
const require_access = require("../middlewares/require_access");
const { ROLES } = require("../commons/constants");

module.exports = ({ swaggerDocument, env, port }) => {
  const router = express.Router();

  // =========================
  // Swagger config (NOW SAFE HERE)
  // =========================
  try {
    if (env === "dev") {
      swaggerDocument.host = `localhost:${port}`;
      swaggerDocument.schemes = ["http"];
    } else if (env === "prod") {
      swaggerDocument.host = process.env.EXTERNAL_DOMAIN.split("://")[1];
      swaggerDocument.schemes = [process.env.EXTERNAL_DOMAIN.split("://")[0]];
    }
  } catch (error) {
    console.error("Erreur Swagger config:", error.message);
  }

  // =========================
  // Route protection
  // =========================
  router.use(require_access({ minRole: ROLES.ADMIN }));

  // =========================
  // Swagger UI
  // =========================
  router.use("/", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  return router;
};