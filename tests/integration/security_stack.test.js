// ./tests/integration/security_stack.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const rateLimit = require("../../src/API_SAC/middlewares/rate_limit.middleware");
const csrfProtection = require("../../src/API_SAC/middlewares/csrf_protection.middleware");
const securityHeaders = require("../../src/API_SAC/middlewares/security_headers.middleware");

function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

function createTestApp() {
  const app = express();
  app.use(securityHeaders);
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { user: { id: 42 }, csrfToken: "csrf-ok" };
    next();
  });
  app.use("/api", rateLimit({ windowMs: 1000, max: 2, keyGenerator: req => req.session.user.id }));
  app.use(csrfProtection);
  app.get("/api/ping", (req, res) => res.json({ ok: true }));
  app.post("/api/write", (req, res) => res.json({ ok: true, body: req.body }));
  return app;
}

test("integrated security stack exposes headers and csrf token on safe API calls", async () => {
  const { server, origin } = await listen(createTestApp());
  try {
    const response = await fetch(`${origin}/api/ping`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.match(response.headers.get("set-cookie"), /XSRF-TOKEN=csrf-ok/);
  } finally {
    server.close();
  }
});

test("integrated security stack blocks unsafe writes without csrf", async () => {
  const { server, origin } = await listen(createTestApp());
  try {
    const response = await fetch(`${origin}/api/write`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: 1 }),
    });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.error, "CSRF_TOKEN_INVALID");
  } finally {
    server.close();
  }
});

test("integrated security stack rate limits repeated API calls", async () => {
  const { server, origin } = await listen(createTestApp());
  try {
    await fetch(`${origin}/api/ping`);
    await fetch(`${origin}/api/ping`);
    const response = await fetch(`${origin}/api/ping`);
    const body = await response.json();

    assert.equal(response.status, 429);
    assert.equal(body.error, "RATE_LIMITED");
  } finally {
    server.close();
  }
});
