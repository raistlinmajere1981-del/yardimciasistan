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
    ["pension_restaurant", "pension", "restaurant", "cafe", "market"]
  );
  assert.equal(normalizeBusinessType("invalid"), "pension_restaurant");
  assert.equal(getBusinessProfile("unknown_profile").id, "pension_restaurant");
});

test("market profile is available as retail foundation without accommodation coupling", () => {
  const market = BUSINESS_PROFILES.market;
  assert.equal(hasBusinessCapability(market.defaultCapabilities, C.RETAIL_BARCODE), true);
  assert.equal(hasBusinessCapability(market.defaultCapabilities, C.INVENTORY), true);
  assert.equal(hasBusinessCapability(market.defaultCapabilities, C.ACCOMMODATION_ROOMS), false);
  assert.equal(getBusinessProfiles().some((profile) => profile.id === "market"), true);
});
