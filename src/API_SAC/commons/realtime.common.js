// ./API_SAC/commons/realtime.common.js
// Module qui implémente un serveur WebSocket minimaliste (sans librairie externe)
// pour envoyer des mises à jour de présence en temps réel aux clients connectés.

// Importe le module crypto de Node.js pour le handshake WebSocket
const crypto = require("crypto");
// Importe le système de logging
const { TECHNICAL_LEVELS, log_technical } = require("./logger.common");

// GUID magique du protocole WebSocket (défini dans la RFC 6455)
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
// Ensemble de tous les clients WebSocket actuellement connectés
const clients = new Set();

// Encode un objet JavaScript en une trame WebSocket binaire (format texte)
function encodeFrame(payload) {
  // Convertit l'objet en JSON puis en Buffer binaire
  const data = Buffer.from(JSON.stringify(payload));
  // Construit l'en-tête de la trame selon la taille des données
  const header = data.length < 126
    ? Buffer.from([0x81, data.length]) // Trame courte : opcode texte (0x81) + taille directe
    : data.length < 65536
      ? Buffer.from([0x81, 126, data.length >> 8, data.length & 0xff]) // Trame moyenne : taille sur 2 octets
      : null; // Trame trop grande (>64Ko) : non supportée

  if (!header) {
    throw new Error("Realtime payload too large");
  }

  // Concatène l'en-tête et les données en un seul Buffer
  return Buffer.concat([header, data]);
}

// Décode une trame WebSocket texte envoyée par le client (les trames clients sont masquées)
function decodeClientTextFrame(buffer) {
  if (!buffer.length) return null;

  // Extrait l'opcode (type de trame) des 4 bits de poids faible du premier octet
  const opcode = buffer[0] & 0x0f;
  if (opcode === 0x8) return { type: "close" }; // Opcode 0x8 = trame de fermeture
  if (opcode !== 0x1) return null; // Opcode 0x1 = trame texte (seul type supporté)

  let offset = 2; // Position de lecture dans le buffer
  let length = buffer[1] & 0x7f; // Taille du payload (7 bits de poids faible du 2ème octet)
  const masked = Boolean(buffer[1] & 0x80); // Bit de masquage (doit être true pour les trames clients)

  // Si la taille indique 126, la vraie taille est sur les 2 octets suivants
  if (length === 126) {
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    return null; // Taille sur 8 octets non supportée
  }

  // Les trames clients doivent être masquées et le buffer doit être assez grand
  if (!masked || buffer.length < offset + 4 + length) return null;

  // Extrait le masque de 4 octets
  const mask = buffer.subarray(offset, offset + 4);
  offset += 4;
  // Démasque le payload en appliquant un XOR avec le masque (rotation circulaire)
  const payload = Buffer.alloc(length);
  for (let index = 0; index < length; index += 1) {
    payload[index] = buffer[offset + index] ^ mask[index % 4];
  }

  // Retourne le texte décodé
  return { type: "message", text: payload.toString("utf8") };
}

// Envoie un message à un client WebSocket spécifique
function send(client, payload) {
  // Vérifie que le socket n'est pas détruit
  if (client.socket.destroyed) return;

  try {
    // Encode et envoie la trame WebSocket
    client.socket.write(encodeFrame(payload));
  } catch (error) {
    // En cas d'erreur d'envoi, log un warning et supprime le client
    log_technical(TECHNICAL_LEVELS.WARNING, "Realtime websocket send failed", { error });
    clients.delete(client);
  }
}

// Diffuse une mise à jour de présence à tous les clients abonnés à une session spécifique
function broadcastAttendanceUpdate(sessionId, payload = {}) {
  // Normalise l'ID de session en chaîne de caractères
  const normalizedSessionId = String(sessionId);

  // Parcourt tous les clients connectés
  for (const client of clients) {
    // Vérifie si ce client est abonné à cette session
    if (client.subscriptions.has(normalizedSessionId)) {
      // Envoie la mise à jour au client
      send(client, {
        type: "attendance.updated", // Type de message
        sessionId: Number(sessionId), // ID de la session concernée
        ...payload, // Données supplémentaires
      });
    }
  }
}

// Traite un message reçu d'un client WebSocket (ex: demande d'abonnement à une session)
function handleClientMessage(client, text) {
  let message;
  try {
    // Parse le message JSON
    message = JSON.parse(text);
  } catch {
    return; // Ignore les messages non-JSON
  }

  // Si le client veut s'abonner aux mises à jour d'une session
  if (message?.type === "subscribe" && message.sessionId !== undefined) {
    // Ajoute l'ID de session aux abonnements du client
    client.subscriptions.add(String(message.sessionId));
    // Confirme l'abonnement au client
    send(client, { type: "subscribed", sessionId: Number(message.sessionId) });
  }
}

// Gère la mise à niveau HTTP → WebSocket (handshake WebSocket).
// Appelé lorsqu'une requête HTTP "Upgrade" est reçue par le serveur.
function handleRealtimeUpgrade(req, socket) {
  // Vérifie que l'URL correspond au endpoint WebSocket
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname !== "/ws/realtime") return false;

  // Vérification de l'origine pour empêcher les connexions cross-origin non autorisées
  const origin = req.headers.origin;
  if (origin) {
    try {
      // L'origine doit correspondre au host de la requête
      if (new URL(origin).host !== req.headers.host) {
        socket.destroy(); // Détruit la connexion si l'origine est différente
        return true;
      }
    } catch {
      socket.destroy();
      return true;
    }
  }

  // Récupère la clé WebSocket du client (nécessaire pour le handshake)
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return true;
  }

  // Calcule la clé d'acceptation selon le protocole WebSocket (SHA-1 de la clé + GUID magique)
  const accept = crypto
    .createHash("sha1")
    .update(`${key}${WS_GUID}`)
    .digest("base64");

  // Envoie la réponse HTTP 101 (Switching Protocols) pour compléter le handshake
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    "",
  ].join("\r\n"));

  // Crée un objet client avec le socket et un ensemble d'abonnements vide
  const client = {
    socket, // Socket TCP brut
    subscriptions: new Set(), // Ensemble des IDs de sessions auxquelles le client est abonné
  };
  // Ajoute le client à l'ensemble des clients connectés
  clients.add(client);
  // Envoie un message "ready" pour confirmer que la connexion est établie
  send(client, { type: "ready" });

  // Écoute les données entrantes du client
  socket.on("data", chunk => {
    // Décode la trame WebSocket reçue
    const frame = decodeClientTextFrame(chunk);
    // Si c'est une trame de fermeture, supprime le client et ferme la connexion
    if (frame?.type === "close") {
      clients.delete(client);
      socket.end();
      return;
    }
    // Si c'est un message texte, le traite
    if (frame?.type === "message") {
      handleClientMessage(client, frame.text);
    }
  });

  // Supprime le client quand la connexion est fermée
  socket.on("close", () => clients.delete(client));
  // Gère les erreurs du socket
  socket.on("error", error => {
    log_technical(TECHNICAL_LEVELS.VERBOSE, "Realtime websocket closed with error", { error });
    clients.delete(client);
  });

  return true; // Indique que la mise à niveau a été gérée
}

// Exporte les fonctions de diffusion et de gestion WebSocket
module.exports = {
  broadcastAttendanceUpdate,
  handleRealtimeUpgrade,
};
