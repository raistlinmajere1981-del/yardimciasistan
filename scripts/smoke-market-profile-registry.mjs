import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const {
  BUSINESS_CAPABILITIES: C,
  BUSINESS_PROFILES,
  getBusinessProfiles
} = require("../packages/shared/dist/index.js");

const root = process.cwd();
const setupForm = readFileSync(join(root, "apps/desktop-app/src/components/settings/SetupForm.tsx"), "utf8");
const capabilitySettings = readFileSync(join(root, "apps/desktop-app/src/components/settings/BusinessCapabilitySettings.tsx"), "utf8");
const profileIds = getBusinessProfiles().map((profile) => profile.id);

assert.deepEqual(profileIds, Object.keys(BUSINESS_PROFILES));
assert.equal(profileIds.includes("market"), true);
assert.equal(profileIds.includes("unknown_profile"), false);
assert.equal(BUSINESS_PROFILES.market.defaultCapabilities.includes(C.RETAIL_BARCODE), true);
assert.equal(BUSINESS_PROFILES.market.defaultCapabilities.includes(C.RETAIL_PURCHASING), true);
assert.equal(BUSINESS_PROFILES.market.defaultCapabilities.includes(C.RETAIL_SUPPLIERS), true);
assert.equal(BUSINESS_PROFILES.market.defaultCapabilities.includes(C.RETAIL_LABELS), true);
assert.equal(BUSINESS_PROFILES.market.defaultCapabilities.includes(C.ACCOMMODATION_ROOMS), false);
assert.equal(BUSINESS_PROFILES.market.defaultCapabilities.includes(C.FOOD_TABLES), false);
assert.match(setupForm, /getBusinessProfiles\(\)\.map/);
assert.match(setupForm, /value=\{form\.profileId\}/);
assert.match(capabilitySettings, /title:\s*"Perakende"/);
for (const capability of ["RETAIL_BARCODE", "RETAIL_PURCHASING", "RETAIL_SUPPLIERS", "RETAIL_LABELS"]) {
  assert.match(capabilitySettings, new RegExp(`C\\.${capability}`));
}

console.log("market-profile-registry-smoke-ok");
