// ./API_SAC/commons/realtime.common.js
const crypto = require("crypto");
const { TECHNICAL_LEVELS, log_technical } = require("./logger.common");

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const clients = new Set();

function encodeFrame(payload) {
  const data = Buffer.from(JSON.stringify(payload));
  const header = data.length < 126
    ? Buffer.from([0x81, data.length])
    : data.length < 65536
      ? Buffer.from([0x81, 126, data.length >> 8, data.length & 0xff])
      : null;

  if (!header) {
    throw new Error("Realtime payload too large");
  }

  return Buffer.concat([header, data]);
}

function decodeClientTextFrame(buffer) {
  if (!buffer.length) return null;

  const opcode = buffer[0] & 0x0f;
  if (opcode === 0x8) return { type: "close" };
  if (opcode !== 0x1) return null;

  let offset = 2;
  let length = buffer[1] & 0x7f;
  const masked = Boolean(buffer[1] & 0x80);

  if (length === 126) {
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    return null;
  }

  if (!masked || buffer.length < offset + 4 + length) return null;

  const mask = buffer.subarray(offset, offset + 4);
  offset += 4;
  const payload = Buffer.alloc(length);
  for (let index = 0; index < length; index += 1) {
    payload[index] = buffer[offset + index] ^ mask[index % 4];
  }

  return { type: "message", text: payload.toString("utf8") };
}

function send(client, payload) {
  if (client.socket.destroyed) return;

  try {
    client.socket.write(encodeFrame(payload));
  } catch (error) {
    log_technical(TECHNICAL_LEVELS.WARNING, "Realtime websocket send failed", { error });
    clients.delete(client);
  }
}

function broadcastAttendanceUpdate(sessionId, payload = {}) {
  const normalizedSessionId = String(sessionId);

  for (const client of clients) {
    if (client.subscriptions.has(normalizedSessionId)) {
      send(client, {
        type: "attendance.updated",
        sessionId: Number(sessionId),
        ...payload,
      });
    }
  }
}

function handleClientMessage(client, text) {
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    return;
  }

  if (message?.type === "subscribe" && message.sessionId !== undefined) {
    client.subscriptions.add(String(message.sessionId));
    send(client, { type: "subscribed", sessionId: Number(message.sessionId) });
  }
}

function handleRealtimeUpgrade(req, socket) {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname !== "/ws/realtime") return false;

  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) {
        socket.destroy();
        return true;
      }
    } catch {
      socket.destroy();
      return true;
    }
  }

  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return true;
  }

  const accept = crypto
    .createHash("sha1")
    .update(`${key}${WS_GUID}`)
    .digest("base64");

  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    "",
  ].join("\r\n"));

  const client = {
    socket,
    subscriptions: new Set(),
  };
  clients.add(client);
  send(client, { type: "ready" });

  socket.on("data", chunk => {
    const frame = decodeClientTextFrame(chunk);
    if (frame?.type === "close") {
      clients.delete(client);
      socket.end();
      return;
    }
    if (frame?.type === "message") {
      handleClientMessage(client, frame.text);
    }
  });

  socket.on("close", () => clients.delete(client));
  socket.on("error", error => {
    log_technical(TECHNICAL_LEVELS.VERBOSE, "Realtime websocket closed with error", { error });
    clients.delete(client);
  });

  return true;
}

module.exports = {
  broadcastAttendanceUpdate,
  handleRealtimeUpgrade,
};
