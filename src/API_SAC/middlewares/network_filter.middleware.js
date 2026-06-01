// ./API_SAC/middlewares/network_filter.middleware.js
// Middleware de filtrage réseau : bloque les élèves qui ne sont pas connectés au réseau local (LAN) de l'établissement.
// Les enseignants, le personnel et les admins peuvent accéder depuis n'importe où.

// Importe le module path (chargé mais non utilisé directement ici)
require("path");
// Importe ipaddr.js pour parser et comparer les adresses IP (supporte IPv4 et IPv6)
const ipaddr = require("ipaddr.js");
// Importe le système de logging
const { TECHNICAL_LEVELS, log_business, log_technical } = require("../commons/logger.common");

// Parse l'en-tête X-Forwarded-For qui contient les IPs du client à travers les proxys
function parseForwardedFor(value) {
  if (!value) return [];

  // Sépare les IPs par virgule et nettoie chaque entrée
  return String(value)
    .split(",")
    .map(ip => ip.trim())
    .filter(Boolean);
}

// Normalise une adresse IP (supprime le préfixe IPv6 "::ffff:" pour les adresses IPv4 mappées)
function normalizeIp(ip) {
  if (!ip) return null;

  // Supprime le préfixe IPv4-mapped IPv6
  const value = String(ip).replace(/^::ffff:/, "");
  try {
    // Parse l'adresse IP et la convertit en forme canonique
    const parsed = ipaddr.parse(value);
    return parsed.toString();
  } catch {
    return value; // Si le parsing échoue, retourne la valeur brute
  }
}

// Extrait toute la chaîne d'IPs d'une requête HTTP (IP client, proxys, etc.)
function getRequestIpChain(req) {
  const socketIp = normalizeIp(req.socket?.remoteAddress); // IP du socket TCP
  const forwardedFor = parseForwardedFor(req.headers["x-forwarded-for"]).map(normalizeIp); // IPs des proxys
  const expressIps = (req.ips || []).map(normalizeIp); // IPs détectées par Express (trust proxy)

  return {
    clientIp: normalizeIp(req.ip), // IP du client selon Express
    expressIps, // IPs Express
    forwardedFor, // IPs Forwarded-For
    realIp: normalizeIp(req.headers["x-real-ip"]), // IP réelle (en-tête X-Real-IP)
    socketIp, // IP du socket
    chain: [...forwardedFor, socketIp].filter(Boolean), // Chaîne complète d'IPs
  };
}

// Parse une adresse IP en objet ipaddr.js et convertit les adresses IPv4-mapped en IPv4 pur
function parseIp(value) {
  let parsedIp = ipaddr.parse(value);

  // Si c'est une adresse IPv6 qui est en fait du IPv4 mappé, convertit en IPv4
  if (parsedIp.kind() === "ipv6" && parsedIp.isIPv4MappedAddress()) {
    parsedIp = parsedIp.toIPv4Address();
  }

  return parsedIp;
}

// Vérifie si une adresse IP appartient à l'un des sous-réseaux autorisés
function ipMatchesAnySubnet(parsedIp, subnets) {
  return subnets.some(subnet => (
    // L'IP et le sous-réseau doivent être du même type (IPv4 ou IPv6)
    parsedIp.kind() === subnet[0].kind() &&
    // Vérifie si l'IP est dans le sous-réseau (CIDR matching)
    parsedIp.match(subnet)
  ));
}

// Formate un sous-réseau CIDR en chaîne lisible (ex: "192.168.1.0/24")
function formatSubnet(subnet) {
  return `${subnet[0].toString()}/${subnet[1]}`;
}

// Fabrique (factory) du middleware de filtrage réseau
module.exports = function ipFilter({ env, LAN_SUBNETS = [] }) {
  return (req, res, next) => {
    try {
      // Récupère la chaîne d'IPs de la requête
      const ipChain = getRequestIpChain(req);
      let clientIp = ipChain.clientIp;
      // Attache les informations réseau à la requête pour utilisation ultérieure
      req.network = ipChain;

      // Récupère les informations de l'utilisateur connecté
      const userInfo = req.session?.user || {};
      const role = (userInfo.role || "").toUpperCase();

      // En mode développement, localhost est toujours autorisé
      if (env === "dev" && (clientIp == "::1" || clientIp == "127.0.0.1")) {
        return next();
      }

      // Si aucune IP client n'est détectée, on laisse passer (pas de filtrage possible)
      if (!clientIp) return next();

      // Parse l'IP du client et vérifie si elle est dans un sous-réseau LAN autorisé
      const parsedIp = parseIp(clientIp);
      const isInLan = ipMatchesAnySubnet(parsedIp, LAN_SUBNETS);

      // En mode dev ou si les logs de filtrage réseau sont activés, log le contexte
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

      // Vérifie si l'utilisateur est un élève
      const isStudent =
        role === "STUDENT";

      // Si c'est un élève ET qu'il n'est pas sur le réseau LAN autorisé → blocage
      if (isStudent && !isInLan) {
        const clientIpStr = parsedIp.toString();
        // Log technique du blocage
        log_technical(TECHNICAL_LEVELS.WARNING, "Blocked student outside allowed LANs", {
          ip: clientIpStr,
          allowedLans: LAN_SUBNETS.map(formatSubnet),
          userId: req.session?.user?.id,
        });

        // Log métier du blocage (enregistré en base de données)
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

        // Retourne une erreur 403 avec un message explicatif
        return res.status(403).json({
          error: "NETWORK_ACCESS_BLOCKED",
          message: "Vous n'êtes pas connecté aux réseaux autorisés de l'établissement.",
          blockedIp: clientIpStr,
          code: "NETWORK_ACCESS_BLOCKED",
        });
      }

      // L'utilisateur n'est pas un élève ou est sur le LAN autorisé → on laisse passer
      next();
    } catch (err) {
      // En cas d'erreur dans le middleware, log l'erreur et retourne 500
      log_technical(TECHNICAL_LEVELS.ERROR, "IP filter error", { error: err });
      return res.status(500).send("Internal Server Error");
    }
  };
};
