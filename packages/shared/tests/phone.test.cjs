const assert = require("node:assert/strict");
const test = require("node:test");
const {
  formatPhoneForDisplay,
  formatPhoneForWhatsApp,
  isValidTRPhone,
  normalizePhone
} = require("../dist");

test("normalizePhone accepts common Turkey mobile formats", () => {
  const result = normalizePhone("0532 123 45 67");

  assert.equal(result.ok, true);
  assert.equal(result.e164, "+905321234567");
  assert.equal(result.whatsapp, "905321234567");
});

test("formatPhoneForDisplay returns a readable Turkish format", () => {
  assert.equal(formatPhoneForDisplay("+90 532 123 45 67"), "+90 532 123 45 67");
});

test("formatPhoneForWhatsApp removes plus signs and spacing", () => {
  assert.equal(formatPhoneForWhatsApp("00905321234567"), "905321234567");
});

test("invalid phone numbers return an understandable result", () => {
  const result = normalizePhone("123");

  assert.equal(result.ok, false);
  assert.match(result.error, /Türkiye cep telefonu/);
  assert.equal(isValidTRPhone("123"), false);
});
