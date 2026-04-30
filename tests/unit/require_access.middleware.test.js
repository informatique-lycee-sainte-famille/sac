// ./tests/unit/require_access.middleware.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const requireAccess = require("../../src/API_SAC/middlewares/require_access.middleware");
const { ROLES } = require("../../src/API_SAC/commons/constants.common");
const { assertNext, callMiddleware, createRequest, createResponse } = require("../helpers/http_mocks");

test("require_access rejects unauthenticated users", async () => {
  const result = await callMiddleware(
    requireAccess({ minRole: ROLES.STUDENT }),
    createRequest({ session: {} }),
    createResponse()
  );

  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 401);
});

test("require_access accepts users above the minimum role", async () => {
  const result = await callMiddleware(
    requireAccess({ minRole: ROLES.TEACHER }),
    createRequest({ session: { user: { id: 1, roleConst: ROLES.STAFF } } }),
    createResponse()
  );

  assertNext(result);
});

test("require_access rejects users below the minimum role", async () => {
  const result = await callMiddleware(
    requireAccess({ minRole: ROLES.STAFF }),
    createRequest({ session: { user: { id: 1, roleConst: ROLES.STUDENT } } }),
    createResponse()
  );

  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 403);
});
