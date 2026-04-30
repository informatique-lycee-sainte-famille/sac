// ./tests/unit/csrf_protection.middleware.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const csrfProtection = require("../../src/API_SAC/middlewares/csrf_protection.middleware");
const { assertNext, callMiddleware, createRequest, createResponse } = require("../helpers/http_mocks");

test("csrf middleware creates a readable token cookie for safe API requests", async () => {
  const session = { user: { id: 1 } };
  const result = await callMiddleware(
    csrfProtection,
    createRequest({ method: "GET", path: "/api/user/me", session }),
    createResponse()
  );

  assertNext(result);
  assert.ok(session.csrfToken);
  assert.equal(result.res.cookies["XSRF-TOKEN"].value, session.csrfToken);
  assert.equal(result.res.cookies["XSRF-TOKEN"].options.httpOnly, false);
});

test("csrf middleware rejects unsafe API requests without token", async () => {
  const result = await callMiddleware(
    csrfProtection,
    createRequest({ method: "POST", path: "/api/nfc/scan", session: { user: { id: 1 } } }),
    createResponse()
  );

  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 403);
  assert.equal(result.res.body.error, "CSRF_TOKEN_INVALID");
});

test("csrf middleware accepts unsafe API requests with matching token", async () => {
  const result = await callMiddleware(
    csrfProtection,
    createRequest({
      method: "POST",
      path: "/api/nfc/scan",
      headers: { "x-csrf-token": "token-123" },
      session: { user: { id: 1 }, csrfToken: "token-123" },
    }),
    createResponse()
  );

  assertNext(result);
});
