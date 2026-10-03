const assert = require("node:assert/strict");
const { test } = require("node:test");
const { normalizeCommerceOrderBuyerSnapshot } = require("../dist");

test("guest contact normalization preserves international contact without Customer identity", () => {
  assert.deepEqual(normalizeCommerceOrderBuyerSnapshot({ name: " Guest ", phone: "+1 (202) 555-0100", email: " guest@example.test ", customerId: "private" }),
    { name: "Guest", phone: "+1 (202) 555-0100", email: "guest@example.test" });
  for (const phone of ["0044 7911 123456", "020 7946 0958", "+90 212 555 0100"]) {
    assert.deepEqual(normalizeCommerceOrderBuyerSnapshot({ name: "Guest", phone }), { name: "Guest", phone });
  }
  assert.deepEqual(normalizeCommerceOrderBuyerSnapshot({ name: "Guest", phone: "2025550100", email: "" }), { name: "Guest", phone: "2025550100" });
});

test("invalid guest contact produces bounded validation errors without PII", () => {
  const valid = { name: "Private Guest", phone: "+1 202 555 0100", email: "private@example.test" };
  for (const input of [null, [], {}, { ...valid, name: "" }, { ...valid, name: "x".repeat(161) },
    { ...valid, name: "Private\nGuest" }, { ...valid, phone: "123" }, { ...valid, phone: "1234567890123456" },
    { ...valid, phone: "1+2025550100" }, { ...valid, email: "invalid" }, { ...valid, email: "x".repeat(255) }]) {
    assert.throws(() => normalizeCommerceOrderBuyerSnapshot(input), (error) => {
      assert.equal(error.message, "Sipariş iletişim bilgileri geçersiz.");
      return true;
    });
  }
});
