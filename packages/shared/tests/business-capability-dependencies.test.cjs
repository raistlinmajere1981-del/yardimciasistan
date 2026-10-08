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

test("commerce orders depend only on the catalog foundation", () => {
  const expanded = new Set(expandBusinessCapabilities([C.ORDERS]));
  assert.equal(expanded.has(C.ORDERS), true);
  assert.equal(expanded.has(C.CATALOG), true);
  assert.equal(expanded.has(C.SALES), false);
  assert.equal(expanded.has(C.INVENTORY), false);
});

test("wholesale expands to customers and shared commerce orders", () => {
  const expanded = new Set(expandBusinessCapabilities([C.WHOLESALE]));
  assert.equal(expanded.has(C.WHOLESALE), true);
  assert.equal(expanded.has(C.CUSTOMERS), true);
  assert.equal(expanded.has(C.ORDERS), true);
  assert.equal(expanded.has(C.CATALOG), true);
  assert.equal(expanded.has(C.SALES), false);
  assert.equal(expanded.has(C.INVENTORY), false);
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

test("online sales is an optional retail channel with canonical order dependencies", () => {
  const { BUSINESS_PROFILES } = require("../dist");
  const expanded = new Set(expandBusinessCapabilities([C.ONLINE_SALES]));
  assert.equal(expanded.has(C.ORDERS), true);
  assert.equal(expanded.has(C.CATALOG), true);
  assert.equal(expanded.has(C.CUSTOMERS), false);
  assert.equal(BUSINESS_PROFILES.market.optionalCapabilities.includes(C.ONLINE_SALES), true);
  assert.equal(BUSINESS_PROFILES.market.defaultCapabilities.includes(C.ONLINE_SALES), false);
});


test("online sales is optional and defaults OFF for food-service profiles only", () => {
  const { BUSINESS_PROFILES, getBusinessProfileSelectionCapabilities } = require("../dist");
  for (const profileId of ["restaurant", "pension_restaurant", "market"]) {
    const profile = BUSINESS_PROFILES[profileId];
    assert.equal(profile.optionalCapabilities.includes(C.ONLINE_SALES), true, profileId);
    assert.equal(profile.defaultOptionalCapabilities.includes(C.ONLINE_SALES), false, profileId);
    assert.equal(profile.defaultCapabilities.includes(C.ONLINE_SALES), false, profileId);
    const selected = getBusinessProfileSelectionCapabilities(profileId, [C.ONLINE_SALES]);
    for (const capability of [C.ONLINE_SALES, C.ORDERS, C.CATALOG]) assert.equal(selected.includes(capability), true);
  }
  assert.equal(BUSINESS_PROFILES.pension.optionalCapabilities.includes(C.ONLINE_SALES), false);
  assert.equal(getBusinessProfileSelectionCapabilities("pension", [C.ONLINE_SALES]).includes(C.ONLINE_SALES), false);
});
