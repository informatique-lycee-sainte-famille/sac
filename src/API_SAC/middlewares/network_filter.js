const path = require("path");
const ipaddr = require("ipaddr.js");

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

      // Allow localhost in dev
      if (env === "dev" && (clientIp == "::1" || clientIp == "127.0.0.1")) {
        return next();
      }

      if (!clientIp) return next();

      const parsedIp = parseIp(clientIp);
      const isInLan = ipMatchesAnySubnet(parsedIp, LAN_SUBNETS);

      console.log(
        `IP: ${parsedIp.toString()} | Role: ${role} | LAN: ${isInLan} | ` +
        `Allowed LANs: ${LAN_SUBNETS.map(formatSubnet).join(", ") || "none"} | ` +
        `Express chain: ${ipChain.expressIps.join(" -> ") || "none"} | ` +
        `XFF: ${ipChain.forwardedFor.join(" -> ") || "none"} | ` +
        `X-Real-IP: ${ipChain.realIp || "none"} | Socket: ${ipChain.socketIp || "none"}`
      );

      // 🔒 Define access logic
      const isStudent =
        role === "STUDENT";

      if (isStudent && !isInLan) {
        console.warn(
          `Blocked STUDENT outside allowed LANs: ${parsedIp.toString()} ` +
          `(${LAN_SUBNETS.map(formatSubnet).join(", ") || "none configured"})`
        );

        return res
          .status(403)
          .sendFile(
            path.join(__dirname, "../../front/public/errors/403.html")
          );
      }

      next();
    } catch (err) {
      console.error("IP filter error:", err.message);
      return res.status(500).send("Internal Server Error");
    }
  };
};
