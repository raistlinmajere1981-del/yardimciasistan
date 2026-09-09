const assert = require("node:assert/strict");
const test = require("node:test");
const bridge = import("../dist/index.js");

test("credit draft formats a single TRY debt without gender assumptions", async () => {
  const { buildCustomerCreditWhatsAppMessage: build } = await bridge;
  assert.equal(build({ customerName: "Ahmet", balances: [{ currency: "TRY", amountMinor: 48000 }] }),
    "Merhaba Ahmet,\n\nKayıtlarımıza göre güncel veresiye bakiyeniz:\n\n• ₺480,00\n\nBilginize sunarız.");
});
test("credit draft keeps currencies separate and omits zero balances", async () => {
  const { buildCustomerCreditWhatsAppMessage: build } = await bridge;
  const message = build({ customerName: "Ahmet", balances: [{ currency: "TRY", amountMinor: 50000 }, { currency: "EUR", amountMinor: 2000 }, { currency: "USD", amountMinor: 0 }] });
  assert.match(message, /bakiyeleriniz/);
  assert.match(message, /• ₺500,00\n• €20,00/);
  assert.doesNotMatch(message, /520|USD|\$|Bey|Hanım/);
});
test("credit formatter is deterministic, pure and has a safe empty-name greeting", async () => {
  const { buildCustomerCreditWhatsAppMessage: build } = await bridge;
  const input = { customerName: "  ", balances: [{ currency: "TRY", amountMinor: 12345 }], businessName: "Örnek İşletme" };
  const original = JSON.stringify(input);
  assert.match(build(input), /^Merhaba,\n/);
  assert.match(build(input), /Örnek İşletme$/);
  assert.equal(build(input), build(input));
  assert.equal(JSON.stringify(input), original);
  assert.equal(build({ customerName: "Ahmet", balances: [{ currency: "TRY", amountMinor: 0 }] }), "");
});
test("credit freshness compares balances and recipient without history/order dependence", async () => {
  const { customerCreditWhatsAppFingerprint: fingerprint } = await bridge;
  const input = { customerName: "Ahmet", phone: "05321234567", balances: [{ currency: "TRY", amountMinor: 50000 }, { currency: "EUR", amountMinor: 2000 }] };
  assert.equal(fingerprint(input), fingerprint({ ...input, balances: [...input.balances].reverse() }));
  assert.notEqual(fingerprint(input), fingerprint({ ...input, phone: "05321234568" }));
  assert.notEqual(fingerprint(input), fingerprint({ ...input, balances: [{ currency: "TRY", amountMinor: 30000 }, input.balances[1]] }));
});
