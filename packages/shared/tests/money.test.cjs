const test = require("node:test");
const assert = require("node:assert/strict");
const { moneyToMinor } = require("../dist");

test("money conversion preserves minor units at binary floating point boundaries", () => {
  for (const [major, minor] of [[0, 0], [0.1 + 0.2, 30], [1.005, 101], [19.99, 1999], [50.3 - 0.3, 5000]]) {
    assert.equal(moneyToMinor(major), minor);
  }
});

test("money conversion rejects invalid, negative and unsafe amounts", () => {
  for (const value of [-1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER, "10", null, undefined]) {
    assert.throws(() => moneyToMinor(value), /tutar/i);
  }
});
