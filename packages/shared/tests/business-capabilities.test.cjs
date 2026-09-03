const assert = require("node:assert/strict");
const test = require("node:test");
const {
  BUSINESS_CAPABILITIES: C,
  BUSINESS_PROFILES,
  getAvailableBusinessProfiles,
  hasBusinessCapability,
  legacyModuleDefaultsForProfile,
  resolveBusinessCapabilities
} = require("../dist");

test("restaurant profile resolves from capabilities instead of renderer-specific modules", () => {
  const defaults = legacyModuleDefaultsForProfile("restaurant");
  assert.deepEqual(defaults, {
    roomsEnabled: false,
    tablesEnabled: true,
    qrMenuEnabled: true,
    whatsappEnabled: true,
    androidEnabled: true
  });
});

test("market profile is available as retail foundation without accommodation coupling", () => {
  const market = BUSINESS_PROFILES.market;
  assert.equal(market.availability, "available");
  assert.equal(hasBusinessCapability(market.defaultCapabilities, C.RETAIL_BARCODE), true);
  assert.equal(hasBusinessCapability(market.defaultCapabilities, C.INVENTORY), true);
  assert.equal(hasBusinessCapability(market.defaultCapabilities, C.ACCOMMODATION_ROOMS), false);
  assert.equal(getAvailableBusinessProfiles().some((profile) => profile.id === "market"), true);
});

test("legacy persisted flags can be translated once at the capability boundary", () => {
  const capabilities = resolveBusinessCapabilities({
    businessType: "pension_restaurant",
    modules: {
      rooms: true,
      tables: false,
      qrMenu: false,
      whatsapp: true,
      android: false
    },
    aiEnabled: true
  });

  assert.equal(hasBusinessCapability(capabilities, C.ACCOMMODATION_ROOMS), true);
  assert.equal(hasBusinessCapability(capabilities, C.FOOD_TABLES), false);
  assert.equal(hasBusinessCapability(capabilities, C.WHATSAPP), true);
  assert.equal(hasBusinessCapability(capabilities, C.AI), true);
  assert.equal(hasBusinessCapability(capabilities, C.FINANCE), true);
});
