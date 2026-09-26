const assert = require("node:assert/strict");
const test = require("node:test");
const {
  BUSINESS_PUBLIC_FEATURE_CATALOG,
  BUSINESS_PUBLIC_PROFILE_LIMITS,
  getBusinessPublicFeatureCatalogForCapabilities,
  getBusinessPublicFeatureLabel,
  hasCompleteBusinessPublicMapPoint,
  isBusinessPublicClockTime,
  isBusinessPublicFeatureId,
  normalizeBusinessPublicFeatures,
  normalizeBusinessPublicLanguages,
  normalizeBusinessSocialLinks,
  normalizeBusinessSocialLinkUrl
} = require("../dist/index.js");

test("business public feature catalog keeps stable unique ids", () => {
  const ids = BUSINESS_PUBLIC_FEATURE_CATALOG.map((feature) => feature.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("wifi"));
  assert.ok(ids.includes("parking"));
  assert.ok(ids.includes("wheelchair_access"));
  assert.equal(BUSINESS_PUBLIC_PROFILE_LIMITS.features, ids.length);
});

test("business public feature normalization allow-lists and deduplicates values", () => {
  assert.deepEqual(
    normalizeBusinessPublicFeatures(["wifi", "internal_note", "wifi", "parking", null, 7]),
    ["wifi", "parking"]
  );
  assert.equal(isBusinessPublicFeatureId("pet_friendly"), true);
  assert.equal(isBusinessPublicFeatureId("owner_private_note"), false);
  assert.equal(getBusinessPublicFeatureLabel("wifi"), "Wi-Fi");
});

test("business public clock times accept empty or valid 24-hour values", () => {
  assert.equal(isBusinessPublicClockTime(""), true);
  assert.equal(isBusinessPublicClockTime("14:30"), true);
  assert.equal(isBusinessPublicClockTime("24:00"), false);
  assert.equal(isBusinessPublicClockTime("9:30"), false);
  assert.equal(isBusinessPublicClockTime(null), false);
});

test("business public map point requires a valid coordinate pair", () => {
  assert.equal(hasCompleteBusinessPublicMapPoint(36.789, 28.12), true);
  assert.equal(hasCompleteBusinessPublicMapPoint(-90, 180), true);
  assert.equal(hasCompleteBusinessPublicMapPoint(91, 28.12), false);
  assert.equal(hasCompleteBusinessPublicMapPoint(36.789, null), false);
});

test("business public languages are trimmed, deduplicated and bounded", () => {
  assert.deepEqual(
    normalizeBusinessPublicLanguages([" Türkçe ", "İngilizce", "türkçe", "", null]),
    ["Türkçe", "İngilizce"]
  );
  const many = Array.from({ length: BUSINESS_PUBLIC_PROFILE_LIMITS.languages + 4 }, (_, index) => `Dil ${index}`);
  assert.equal(normalizeBusinessPublicLanguages(many).length, BUSINESS_PUBLIC_PROFILE_LIMITS.languages);
});


test("business public features are capability-aware", () => {
  assert.deepEqual(
    getBusinessPublicFeatureCatalogForCapabilities(["commerce.catalog", "retail.barcode"]).map((feature) => feature.id),
    []
  );

  const restaurantFeatures = getBusinessPublicFeatureCatalogForCapabilities([
    "food_service.menu",
    "food_service.tables"
  ]).map((feature) => feature.id);
  assert.ok(restaurantFeatures.includes("wifi"));
  assert.ok(restaurantFeatures.includes("parking"));
  assert.equal(restaurantFeatures.includes("luggage_storage"), false);
  assert.equal(restaurantFeatures.includes("airport_transfer"), false);

  const accommodationFeatures = getBusinessPublicFeatureCatalogForCapabilities([
    "accommodation.rooms"
  ]).map((feature) => feature.id);
  assert.ok(accommodationFeatures.includes("luggage_storage"));
  assert.ok(accommodationFeatures.includes("airport_transfer"));
});


test("business social links are allow-listed, normalized and deduplicated", () => {
  assert.equal(
    normalizeBusinessSocialLinkUrl("instagram", "instagram.com/blacksea"),
    "https://instagram.com/blacksea"
  );
  assert.equal(normalizeBusinessSocialLinkUrl("instagram", "https://example.com/blacksea"), "");
  assert.deepEqual(
    normalizeBusinessSocialLinks([
      { platform: "facebook", url: "facebook.com/blacksea" },
      { platform: "instagram", url: "https://www.instagram.com/blacksea/" },
      { platform: "facebook", url: "https://facebook.com/other" },
      { platform: "unsupported", url: "https://example.com" }
    ]),
    [
      { platform: "facebook", url: "https://facebook.com/blacksea" },
      { platform: "instagram", url: "https://www.instagram.com/blacksea/" }
    ]
  );
});
