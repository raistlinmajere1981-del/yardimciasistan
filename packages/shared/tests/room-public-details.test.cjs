const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ROOM_PUBLIC_FEATURE_CATALOG,
  ROOM_PUBLIC_DETAIL_LIMITS,
  getRoomPublicFeatureLabel,
  isRoomPublicFeatureId,
  normalizeRoomPublicFeatures
} = require("../dist/index.js");

test("public room feature catalog keeps stable unique ids", () => {
  const ids = ROOM_PUBLIC_FEATURE_CATALOG.map((feature) => feature.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("air_conditioning"));
  assert.ok(ids.includes("wifi"));
  assert.ok(ids.includes("sea_view"));
  assert.ok(ids.includes("step_free_access"));
  assert.equal(ROOM_PUBLIC_DETAIL_LIMITS.features, ids.length);
});

test("public room feature normalization allow-lists and deduplicates values", () => {
  assert.deepEqual(
    normalizeRoomPublicFeatures(["wifi", "internal_note", "wifi", "sea_view", null, 7]),
    ["wifi", "sea_view"]
  );
  assert.equal(isRoomPublicFeatureId("air_conditioning"), true);
  assert.equal(isRoomPublicFeatureId("maintenance_note"), false);
});

test("public room feature labels are deterministic", () => {
  assert.equal(getRoomPublicFeatureLabel("air_conditioning"), "Klima");
  assert.equal(getRoomPublicFeatureLabel("sea_view"), "Deniz manzarası");
  assert.equal(getRoomPublicFeatureLabel("future_custom_value"), "future_custom_value");
});
