const assert = require("node:assert/strict");
const test = require("node:test");
const {
  PUBLIC_RESOURCE_MEDIA_KINDS,
  TABLE_PUBLIC_FEATURE_CATALOG,
  TABLE_PUBLIC_DETAIL_LIMITS,
  TABLE_SMOKING_POLICY_LABELS,
  getTablePublicFeatureLabel,
  getTableSmokingPolicyLabel,
  isPublicResourceMediaKind,
  isTablePublicFeatureId,
  isTableSmokingPolicy,
  normalizeTablePublicFeatures,
  normalizeTableSmokingPolicy
} = require("../dist/index.js");

test("public resource media kinds are shared and stable", () => {
  assert.deepEqual(PUBLIC_RESOURCE_MEDIA_KINDS, [
    "cover",
    "photo",
    "panorama_360",
    "panorama_180",
    "video"
  ]);
  assert.equal(isPublicResourceMediaKind("cover"), true);
  assert.equal(isPublicResourceMediaKind("internal_scan"), false);
});

test("public table feature catalog allow-lists customer-facing values", () => {
  const ids = TABLE_PUBLIC_FEATURE_CATALOG.map((feature) => feature.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("outdoor"));
  assert.ok(ids.includes("window_side"));
  assert.ok(ids.includes("sea_view"));
  assert.ok(ids.includes("wheelchair_friendly"));
  assert.equal(TABLE_PUBLIC_DETAIL_LIMITS.features, ids.length);

  assert.deepEqual(
    normalizeTablePublicFeatures(["outdoor", "internal_note", "outdoor", "sea_view", null]),
    ["outdoor", "sea_view"]
  );
  assert.equal(isTablePublicFeatureId("quiet_area"), true);
  assert.equal(isTablePublicFeatureId("occupied"), false);
  assert.equal(getTablePublicFeatureLabel("window_side"), "Cam kenarı");
  assert.equal(getTablePublicFeatureLabel("future_custom_value"), "future_custom_value");
});

test("table smoking policy keeps unknown legacy values unpublished", () => {
  assert.equal(normalizeTableSmokingPolicy("non_smoking"), "non_smoking");
  assert.equal(normalizeTableSmokingPolicy("outdoor_only"), "outdoor_only");
  assert.equal(normalizeTableSmokingPolicy("legacy_value"), "unspecified");
  assert.equal(normalizeTableSmokingPolicy(null), "unspecified");
  assert.equal(isTableSmokingPolicy("smoking_allowed"), true);
  assert.equal(isTableSmokingPolicy("smoking"), false);
  assert.equal(getTableSmokingPolicyLabel("unspecified"), "");
  assert.equal(getTableSmokingPolicyLabel("outdoor_only"), TABLE_SMOKING_POLICY_LABELS.outdoor_only);
});
