// ./API_SAC/routes/documentation.route.js
const express = require("express");
const swaggerUi = require("swagger-ui-express");
const require_access = require("../middlewares/require_access.middleware");
const { ROLES } = require("../commons/constants.common");

function firstForwardedValue(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)[0] || "";
}

function getRequestOrigin(req) {
  const proto =
    firstForwardedValue(req.headers["x-forwarded-proto"]) ||
    req.protocol ||
    (req.secure ? "https" : "http");
  const host =
    firstForwardedValue(req.headers["x-forwarded-host"]) ||
    req.get("host") ||
    "localhost";

  return {
    proto,
    host,
  };
}

function buildSwaggerDocument(swaggerDocument, req) {
  const document = JSON.parse(JSON.stringify(swaggerDocument));
  const { proto, host } = getRequestOrigin(req);

  document.host = host;
  document.schemes = [proto];
  document.basePath = "/api";

  return document;
}

module.exports = ({ swaggerDocument }) => {
  const router = express.Router();

  router.use(require_access({ minRole: ROLES.ADMIN }));

  router.get("/swagger.json", (req, res) => {
    res.json(buildSwaggerDocument(swaggerDocument, req));
  });

  router.use("/", swaggerUi.serve, swaggerUi.setup(null, {
    swaggerOptions: {
      url: "/api/documentation/swagger.json",
      withCredentials: true,
      requestInterceptor: (req) => {
        req.credentials = "include";
        const csrfToken = document.cookie
          .split(";")
          .map(cookie => cookie.trim())
          .find(cookie => cookie.startsWith("XSRF-TOKEN="))
          ?.slice("XSRF-TOKEN=".length);
        if (csrfToken && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
          req.headers["x-csrf-token"] = csrfToken;
        }
        return req;
      },
    },
  }));

  return router;
};
