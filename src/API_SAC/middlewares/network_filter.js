const path = require("path");
const ipaddr = require("ipaddr.js");

module.exports = function ipFilter({ env, LAN_SUBNET }) {
  return (req, res, next) => {
    try {
      let clientIp = req.ip;

      const userInfo = req.session?.userInfo || {};
      const roles = (userInfo.roles || []).map(r => r.toUpperCase());
      const groups = (userInfo.groups || []).map(g => g.toUpperCase());

      // console.log(`Session info: ${JSON.stringify(req.session)}`);

      // Allow localhost in dev
      if (env === "dev" && (clientIp === "::1" || clientIp === "127.0.0.1")) {
        return next();
      }

      if (!clientIp) return next();

      let parsedIp = ipaddr.parse(clientIp);

      // Convert IPv4-mapped IPv6 (::ffff:x.x.x.x)
      if (parsedIp.kind() === "ipv6" && parsedIp.isIPv4MappedAddress()) {
        parsedIp = parsedIp.toIPv4Address();
      }

      // Skip if IP version mismatch
      if (parsedIp.kind() !== LAN_SUBNET[0].kind()) {
        console.log("IP version mismatch, skipping LAN check");
        return next();
      }

      const isInLan = parsedIp.match(LAN_SUBNET);

      // console.log(
      //   `IP: ${parsedIp.toString()} | Roles: ${roles.join(",")} | Groups: ${groups.join(",")} | LAN: ${isInLan}`
      // );

      // 🔒 Define access logic
      const isStudent =
        roles.includes("STUDENT") || groups.includes("ELEVE");

      if (isStudent && !isInLan) {
        console.warn(`Blocked STUDENT outside LAN: ${parsedIp.toString()}`);

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