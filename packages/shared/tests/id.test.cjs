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
  assert.equal(isSupportedIdPrefix("android_device_"), true);
  assert.equal(isSupportedIdPrefix("catalog_product_draft_"), true);
  assert.equal(isSupportedIdPrefix("commerce_cart_draft_"), true);
  assert.equal(isSupportedIdPrefix("commerce_order_"), true);
  assert.equal(isSupportedIdPrefix("commerce_order_item_"), true);
  assert.equal(isSupportedIdPrefix("commerce_order_fulfillment_"), true);
  assert.equal(isSupportedIdPrefix("unknown_"), false);
});
