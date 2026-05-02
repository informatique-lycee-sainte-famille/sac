// ./API_SAC/middlewares/network_filter.middleware.js
require("path");
const ipaddr = require("ipaddr.js");
const { TECHNICAL_LEVELS, log_business, log_technical } = require("../commons/logger.common");

function parseForwardedFor(value) {
  if (!value) return [];

  return String(value)
    .split(",")
    .map(ip => ip.trim())
    .filter(Boolean);
}

function normalizeIp(ip) {
  if (!ip) return null;

  const value = String(ip).replace(/^::ffff:/, "");
  try {
    const parsed = ipaddr.parse(value);
    return parsed.toString();
  } catch {
    return value;
  }
}

function getRequestIpChain(req) {
  const socketIp = normalizeIp(req.socket?.remoteAddress);
  const forwardedFor = parseForwardedFor(req.headers["x-forwarded-for"]).map(normalizeIp);
  const expressIps = (req.ips || []).map(normalizeIp);

  return {
    clientIp: normalizeIp(req.ip),
    expressIps,
    forwardedFor,
    realIp: normalizeIp(req.headers["x-real-ip"]),
    socketIp,
    chain: [...forwardedFor, socketIp].filter(Boolean),
  };
}

function parseIp(value) {
  let parsedIp = ipaddr.parse(value);

  if (parsedIp.kind() === "ipv6" && parsedIp.isIPv4MappedAddress()) {
    parsedIp = parsedIp.toIPv4Address();
  }

  return parsedIp;
}

function ipMatchesAnySubnet(parsedIp, subnets) {
  return subnets.some(subnet => (
    parsedIp.kind() === subnet[0].kind() &&
    parsedIp.match(subnet)
  ));
}

function formatSubnet(subnet) {
  return `${subnet[0].toString()}/${subnet[1]}`;
}

module.exports = function ipFilter({ env, LAN_SUBNETS = [] }) {
  return (req, res, next) => {
    try {
      const ipChain = getRequestIpChain(req);
      let clientIp = ipChain.clientIp;
      req.network = ipChain;

      const userInfo = req.session?.user || {};
      const role = (userInfo.role || "").toUpperCase();

      if (env === "dev" && (clientIp == "::1" || clientIp == "127.0.0.1")) {
        return next();
      }

      if (!clientIp) return next();

      const parsedIp = parseIp(clientIp);
      const isInLan = ipMatchesAnySubnet(parsedIp, LAN_SUBNETS);

      if (env === "dev" || process.env.NETWORK_FILTER_LOGS === "true") {
        log_technical(TECHNICAL_LEVELS.VERBOSE, "Network filter request context", {
          ip: parsedIp.toString(),
          role,
          isInLan,
          allowedLans: LAN_SUBNETS.map(formatSubnet),
          expressIps: ipChain.expressIps,
          forwardedFor: ipChain.forwardedFor,
          realIp: ipChain.realIp,
          socketIp: ipChain.socketIp,
        });
      }

      const isStudent =
        role === "STUDENT";

      if (isStudent && !isInLan) {
        const clientIpStr = parsedIp.toString();
        log_technical(TECHNICAL_LEVELS.WARNING, "Blocked student outside allowed LANs", {
          ip: clientIpStr,
          allowedLans: LAN_SUBNETS.map(formatSubnet),
          userId: req.session?.user?.id,
        });

        log_business("student_network_access_blocked", "Accès élève bloqué hors LAN autorisé.", {
          req,
          userId: req.session?.user?.id,
          entityType: "NetworkAccess",
          metadata: {
            ip: clientIpStr,
            allowedLans: LAN_SUBNETS.map(formatSubnet),
            ipChain,
          },
        });

        // Return 403 JSON response for API calls, let page loads through
        // (page loads will fail when they try to call /api/user/me)
        return res.status(403).json({
          error: "NETWORK_ACCESS_BLOCKED",
          message: "Vous n'êtes pas connecté aux réseaux autorisés de l'établissement.",
          blockedIp: clientIpStr,
          code: "NETWORK_ACCESS_BLOCKED",
        });
      }

      next();
    } catch (err) {
      log_technical(TECHNICAL_LEVELS.ERROR, "IP filter error", { error: err });
      return res.status(500).send("Internal Server Error");
    }
  };
};
