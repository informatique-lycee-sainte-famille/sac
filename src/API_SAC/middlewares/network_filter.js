const path = require("path");
const ipaddr = require("ipaddr.js");

module.exports = function ipFilter({ env, LAN_SUBNET }) {
  return (req, res, next) => {
    try {
      let clientIp = req.ip;

      const jobTitle = req.session?.userInfo?.jobTitle?.toUpperCase();

      // Allow localhost in dev
      if (env === "dev" && (clientIp === "::1" || clientIp === "127.0.0.1")) {
        // console.log("Allowing localhost access in dev mode");
        return next();
      }

      if (!clientIp || !jobTitle) return next();

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

      console.log(
        `IP: ${parsedIp.toString()} | Job: ${jobTitle} | LAN: ${isInLan}`
      );

      if (jobTitle === "ELEVE" && !isInLan) {
        console.warn(`Blocked ELEVE outside LAN: ${parsedIp.toString()}`);

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