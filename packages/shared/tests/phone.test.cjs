const assert = require("node:assert/strict");
const test = require("node:test");
const {
  formatPhoneForDisplay,
  formatPhoneForWhatsApp,
  isValidPhone,
  isValidTRPhone,
  normalizePhone
} = require("../dist");

test("normalizePhone accepts common Turkey phone formats", () => {
  const result = normalizePhone("0532 123 45 67");
  assert.equal(result.ok, true);
  assert.equal(result.e164, "+905321234567");
  assert.equal(result.whatsapp, "905321234567");
  assert.equal(isValidTRPhone("0532 123 45 67"), true);
});

test("normalizePhone accepts international E.164 phone formats", () => {
  const uk = normalizePhone("+44 7911 123456");
  const us = normalizePhone("001 202 555 0123");
  assert.equal(uk.ok, true);
  assert.equal(uk.e164, "+447911123456");
  assert.equal(uk.whatsapp, "447911123456");
  assert.equal(us.ok, true);
  assert.equal(us.e164, "+12025550123");
  assert.equal(isValidPhone("+44 7911 123456"), true);
  assert.equal(isValidTRPhone("+44 7911 123456"), false);
});

test("formatPhoneForDisplay preserves Turkey formatting and canonicalizes foreign numbers", () => {
  assert.equal(formatPhoneForDisplay("+90 532 123 45 67"), "+90 532 123 45 67");
  assert.equal(formatPhoneForDisplay("+44 7911 123456"), "+447911123456");
});

test("formatPhoneForWhatsApp removes plus signs and spacing", () => {
  assert.equal(formatPhoneForWhatsApp("00905321234567"), "905321234567");
  assert.equal(formatPhoneForWhatsApp("+44 7911 123456"), "447911123456");
});

test("invalid or ambiguous phone numbers return an understandable result", () => {
  const result = normalizePhone("123");
  assert.equal(result.ok, false);
  assert.match(result.error, /ülke kodunu|geçerli format/i);
  assert.equal(isValidPhone("123"), false);
  assert.equal(normalizePhone("0212 123 45 67").ok, false);
  assert.equal(normalizePhone("+90 212 123 45 67").ok, false);
});
