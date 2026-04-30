// ./tests/unit/rate_limit.middleware.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const rateLimit = require("../../src/API_SAC/middlewares/rate_limit.middleware");
const { assertNext, callMiddleware, createRequest, createResponse } = require("../helpers/http_mocks");

test("rate limit allows requests under the configured window", async () => {
  const middleware = rateLimit({ windowMs: 1000, max: 2, keyGenerator: () => "same-user" });

  assertNext(await callMiddleware(middleware, createRequest()));
  assertNext(await callMiddleware(middleware, createRequest()));
});

test("rate limit returns 429 when the bucket is exhausted", async () => {
  const middleware = rateLimit({ windowMs: 1000, max: 1, keyGenerator: () => "same-user" });

  assertNext(await callMiddleware(middleware, createRequest()));
  const result = await callMiddleware(middleware, createRequest(), createResponse());

  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 429);
  assert.equal(result.res.body.error, "RATE_LIMITED");
  assert.equal(result.res.getHeader("retry-after"), "1");
});
