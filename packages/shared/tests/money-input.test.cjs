const test = require("node:test");
const assert = require("node:assert/strict");
const {
  formatMajorCurrency,
  formatMajorToInput,
  formatMinorCurrency,
  formatMinorToInput,
  isMoneyInputBlank,
  normalizePastedMoneyText,
  parseMoneyInput,
  parseMoneyToMajor,
  parseMoneyToMinor,
  sanitizeMoneyKeystroke
} = require("../dist");

test("money input accepts Turkish comma and dot decimals", () => {
  for (const [input, major, minor] of [
    ["125", 125, 12500],
    ["125,5", 125.5, 12550],
    ["125,50", 125.5, 12550],
    ["125.50", 125.5, 12550],
    ["1250,75", 1250.75, 125075],
    ["1250.75", 1250.75, 125075],
    ["0", 0, 0],
    ["0,00", 0, 0],
    ["1", 1, 100],
    ["1,5", 1.5, 150],
    ["1,50", 1.5, 150],
    ["1.50", 1.5, 150],
    [",50", 0.5, 50]
  ]) {
    const parsed = parseMoneyInput(input);
    assert.equal(parsed.status, "valid", input);
    assert.equal(parsed.major, major, input);
    assert.equal(parsed.minor, minor, input);
    assert.equal(parseMoneyToMajor(input), major, input);
    assert.equal(parseMoneyToMinor(input), minor, input);
  }
});

test("money input rejects letters, signs and malformed separators", () => {
  for (const input of [
    "abc", "12abc", "fsdfdsf0", "1,2,3", "1.2.3", "--10", "-10",
    "-0,5", "+10", "10,123", "1.250", "1,250.50", "12.34,56",
    "125,", "125.", ".", "1,", ","
  ]) {
    const parsed = parseMoneyInput(input);
    assert.equal(parsed.status, "invalid", input);
    assert.equal(parsed.major, null, input);
    assert.equal(parsed.minor, null, input);
    assert.equal(parseMoneyToMajor(input), null, input);
    assert.equal(parseMoneyToMinor(input), null, input);
  }
});

test("money input keeps the editing state clearable", () => {
  for (const input of ["", "   "]) {
    assert.equal(parseMoneyInput(input).status, "empty", JSON.stringify(input));
    assert.equal(parseMoneyToMinor(input), null, JSON.stringify(input));
    assert.ok(isMoneyInputBlank(input), JSON.stringify(input));
  }
  assert.ok(!isMoneyInputBlank("0"));
  assert.ok(!isMoneyInputBlank("125,"));
});

test("money input parses grouped thousands deterministically", () => {
  assert.equal(parseMoneyToMinor("1.250,50"), 125050);
  assert.equal(parseMoneyToMinor("1.250.000"), 125000000);
  assert.equal(parseMoneyToMinor("12.345,67"), 1234567);
});

test("pasted money text is normalized or rejected", () => {
  assert.equal(normalizePastedMoneyText("125,50 TL"), "125,5");
  assert.equal(normalizePastedMoneyText("₺1.250,50"), "1250,5");
  assert.equal(normalizePastedMoneyText("125.50"), "125,5");
  assert.equal(normalizePastedMoneyText(" 1 250,50 "), "1250,5");
  assert.equal(normalizePastedMoneyText("250"), "250");
  for (const input of ["abc", "12abc", "10,123", "-10", "1,2,3", "", "   "]) {
    assert.equal(normalizePastedMoneyText(input), null, JSON.stringify(input));
  }
});

test("money keystrokes accept only plain editing text", () => {
  assert.equal(sanitizeMoneyKeystroke("125,50"), "125,50");
  assert.equal(sanitizeMoneyKeystroke("125.5"), "125.5");
  assert.equal(sanitizeMoneyKeystroke(""), "");
  assert.equal(sanitizeMoneyKeystroke(","), ",");
  for (const input of ["fsdfdsf0", "12abc", "-1", "-10", "10,123", "1,2,3", "1.2.3", "125,50 TL", "₺12", "12 50", "+5"]) {
    assert.equal(sanitizeMoneyKeystroke(input), null, JSON.stringify(input));
  }
});

test("money formatting separates editing and display forms", () => {
  assert.equal(formatMinorToInput(125050), "1250,5");
  assert.equal(formatMinorToInput(12500), "125");
  assert.equal(formatMinorToInput(25000), "250");
  assert.equal(formatMinorToInput(0), "0");
  assert.equal(formatMajorToInput(19.99), "19,99");
  assert.equal(formatMajorToInput(125), "125");
  assert.equal(formatMinorCurrency(125050), "₺1.250,50");
  assert.equal(formatMajorCurrency(125.5, "EUR"), "€125,50");
});
