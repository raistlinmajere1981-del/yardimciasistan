const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeBarcodeIdentity } = require("../dist");

test("numeric barcodes discard visual separators", () => {
  assert.equal(normalizeBarcodeIdentity(" 5449-0000-00996 "), "5449000000996");
  assert.equal(normalizeBarcodeIdentity("5 449 000 000 996"), "5449000000996");
  assert.equal(normalizeBarcodeIdentity("5449.0000.00996"), "5449000000996");
  assert.equal(normalizeBarcodeIdentity("5449–0000—00996"), "5449000000996");
});

test("alphanumeric barcode identities keep meaningful punctuation", () => {
  assert.equal(normalizeBarcodeIdentity("ABC-123"), "ABC-123");
  assert.equal(normalizeBarcodeIdentity("TR-ÜRN-42"), "TR-ÜRN-42");
});
