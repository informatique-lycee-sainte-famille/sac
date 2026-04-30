// ./tests/unit/security_headers.middleware.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const securityHeaders = require("../../src/API_SAC/middlewares/security_headers.middleware");
const { assertNext, callMiddleware, createRequest, createResponse } = require("../helpers/http_mocks");

test("security headers deny framing and lock down content execution", async () => {
  const result = await callMiddleware(securityHeaders, createRequest(), createResponse());
  const csp = result.res.getHeader("content-security-policy");

  assertNext(result);
  assert.equal(result.res.getHeader("x-frame-options"), "DENY");
  assert.equal(result.res.getHeader("x-content-type-options"), "nosniff");
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
});

test("security headers enable HSTS only behind HTTPS", async () => {
  const result = await callMiddleware(
    securityHeaders,
    createRequest({ headers: { "x-forwarded-proto": "https" } }),
    createResponse()
  );

  assertNext(result);
  assert.match(result.res.getHeader("strict-transport-security"), /max-age=/);
});
