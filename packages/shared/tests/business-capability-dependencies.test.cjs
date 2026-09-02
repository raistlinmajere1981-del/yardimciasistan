const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BUSINESS_CAPABILITIES: C,
  expandBusinessCapabilities,
  getEnabledBusinessCapabilityDependents,
  validateBusinessCapabilitySet
} = require("../dist/index.js");

test("folio expands to its structural prerequisites", () => {
  const expanded = new Set(expandBusinessCapabilities([C.ACCOMMODATION_FOLIO]));
  assert.equal(expanded.has(C.ACCOMMODATION_FOLIO), true);
  assert.equal(expanded.has(C.ACCOMMODATION_ROOMS), true);
  assert.equal(expanded.has(C.ACCOMMODATION_STAYS), true);
  assert.equal(expanded.has(C.FINANCE), true);
});

test("invalid capability sets report missing prerequisites", () => {
  const violations = validateBusinessCapabilitySet([
    C.CATALOG,
    C.RETAIL_PURCHASING
  ]);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].capability, C.RETAIL_PURCHASING);
  assert.deepEqual(violations[0].missingDependencies, [C.INVENTORY]);
});

test("enabled dependents include transitive consumers", () => {
  const enabled = expandBusinessCapabilities([
    C.ACCOMMODATION_FOLIO,
    C.RETAIL_PURCHASING
  ]);
  const roomDependents = getEnabledBusinessCapabilityDependents(C.ACCOMMODATION_ROOMS, enabled);
  assert.equal(roomDependents.includes(C.ACCOMMODATION_STAYS), true);
  assert.equal(roomDependents.includes(C.ACCOMMODATION_FOLIO), true);

  const catalogDependents = getEnabledBusinessCapabilityDependents(C.CATALOG, enabled);
  assert.equal(catalogDependents.includes(C.INVENTORY), true);
  assert.equal(catalogDependents.includes(C.RETAIL_PURCHASING), true);
});
