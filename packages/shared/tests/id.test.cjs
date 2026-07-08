const assert = require("node:assert/strict");
const test = require("node:test");
const { createId, extractIdPrefix, hasIdPrefix, isSupportedIdPrefix } = require("../dist");

test("createId prefixes records consistently", () => {
  const id = createId("request_", {
    now: new Date("2026-07-10T14:30:00.000Z"),
    random: () => "abc-123"
  });

  assert.match(id, /^request_[a-z0-9]+_abc123$/);
  assert.equal(extractIdPrefix(id), "request_");
  assert.equal(hasIdPrefix(id, "request_"), true);
});

test("isSupportedIdPrefix allows documented prefixes", () => {
  assert.equal(isSupportedIdPrefix("business_"), true);
  assert.equal(isSupportedIdPrefix("unknown_"), false);
});
