const assert = require("node:assert/strict");
const test = require("node:test");
const {
  BUSINESS_CAPABILITIES: C,
  BUSINESS_PROFILES,
  getBusinessProfiles,
  getBusinessProfile,
  hasBusinessCapability,
  normalizeBusinessType
} = require("../dist");

test("profile registry contains only supported setup profiles", () => {
  assert.deepEqual(
    getBusinessProfiles().map((profile) => profile.id),
    ["pension_restaurant", "pension", "restaurant", "market"]
  );
  assert.equal(normalizeBusinessType("invalid"), "pension_restaurant");
  assert.equal(getBusinessProfile("unknown_profile").id, "pension_restaurant");
});

test("market profile is available as retail foundation without accommodation coupling", () => {
  const market = BUSINESS_PROFILES.market;
  assert.equal(hasBusinessCapability(market.defaultCapabilities, C.RETAIL_BARCODE), true);
  assert.equal(hasBusinessCapability(market.defaultCapabilities, C.INVENTORY), true);
  assert.equal(hasBusinessCapability(market.defaultCapabilities, C.ACCOMMODATION_ROOMS), false);
  assert.equal(market.optionalCapabilities.includes(C.REQUESTS), true);
  assert.equal(market.defaultOptionalCapabilities.includes(C.REQUESTS), false);
  assert.equal(hasBusinessCapability(market.defaultCapabilities, C.REQUESTS), false);
  assert.equal(getBusinessProfiles().some((profile) => profile.id === "market"), true);
});

test("customer requests are an optional default-on feature outside Market", () => {
  for (const profileId of ["pension_restaurant", "pension", "restaurant"]) {
    const profile = BUSINESS_PROFILES[profileId];
    assert.equal(profile.optionalCapabilities.includes(C.REQUESTS), true);
    assert.equal(profile.defaultOptionalCapabilities.includes(C.REQUESTS), true);
    assert.equal(hasBusinessCapability(profile.defaultCapabilities, C.REQUESTS), true);
  }
});

test("accommodation profiles expose room reservations as a default optional feature", () => {
  for (const profileId of ["pension_restaurant", "pension"]) {
    const profile = BUSINESS_PROFILES[profileId];
    assert.equal(profile.requiredCapabilities.includes(C.ACCOMMODATION_RESERVATIONS), false);
    assert.equal(profile.optionalCapabilities.includes(C.ACCOMMODATION_RESERVATIONS), true);
    assert.equal(profile.defaultOptionalCapabilities.includes(C.ACCOMMODATION_RESERVATIONS), true);
    assert.equal(hasBusinessCapability(profile.defaultCapabilities, C.ACCOMMODATION_RESERVATIONS), true);
  }
});
