// ./tests/helpers/http_mocks.js
const assert = require("node:assert/strict");

function createRequest({
  method = "GET",
  path = "/",
  ip = "127.0.0.1",
  headers = {},
  session = {},
  socket = {},
} = {}) {
  return {
    method,
    path,
    ip,
    ips: [],
    headers,
    session,
    socket: {
      remoteAddress: ip,
      ...socket,
    },
    secure: headers["x-forwarded-proto"] === "https",
    get(name) {
      return this.headers[String(name).toLowerCase()];
    },
  };
}

function createResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    cookies: {},
    body: undefined,
    filePath: undefined,
    headersSent: false,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
      return this;
    },
    getHeader(name) {
      return this.headers[String(name).toLowerCase()];
    },
    cookie(name, value, options) {
      this.cookies[name] = { value, options };
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
    send(payload) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
    sendFile(filePath) {
      this.filePath = filePath;
      this.headersSent = true;
      return this;
    },
  };

  return res;
}

async function callMiddleware(middleware, req, res = createResponse()) {
  let nextCalled = false;
  let nextError = null;

  await middleware(req, res, err => {
    nextCalled = true;
    nextError = err || null;
  });

  return { req, res, nextCalled, nextError };
}

function assertNext(result) {
  assert.equal(result.nextError, null);
  assert.equal(result.nextCalled, true);
}

module.exports = {
  assertNext,
  callMiddleware,
  createRequest,
  createResponse,
};
