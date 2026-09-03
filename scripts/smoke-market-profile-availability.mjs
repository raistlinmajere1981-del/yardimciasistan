import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const {
  BUSINESS_CAPABILITIES: C,
  BUSINESS_PROFILES,
  getAvailableBusinessProfiles
} = require("../packages/shared/dist/index.js");

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const setupWizard = read("apps/desktop-app/src/components/settings/SetupWizard.tsx");
const capabilitySettings = read("apps/desktop-app/src/components/settings/BusinessCapabilitySettings.tsx");

const market = BUSINESS_PROFILES.market;
assert.equal(market.availability, "available", "Market profile must be released for normal setup.");
assert.equal(BUSINESS_PROFILES.other.availability, "planned", "General profile remains planned until its workspace contract is defined.");

const availableIds = getAvailableBusinessProfiles().map((profile) => profile.id);
assert.equal(availableIds.includes("market"), true, "Available profile selector must include Market.");
assert.equal(availableIds.includes("other"), false, "Planned profiles must stay out of the normal selector.");

for (const capability of [
  C.CATALOG,
  C.INVENTORY,
  C.SALES,
  C.RETAIL_BARCODE,
  C.RETAIL_PURCHASING,
  C.RETAIL_SUPPLIERS,
  C.RETAIL_LABELS
]) {
  assert.equal(
    market.defaultCapabilities.includes(capability),
    true,
    `Market profile is missing default capability ${capability}.`
  );
}

assert.match(setupWizard, /getAvailableBusinessProfiles/, "Setup boundary must derive visible profiles from the shared availability registry.");
assert.match(setupWizard, /getBusinessProfile\(props\.form\.businessType\)/, "Existing planned profiles must retain a stable settings projection.");
assert.match(setupWizard, /selector\.replaceChildren/, "Legacy static sector options must be projected from the authoritative profile list.");

assert.match(capabilitySettings, /title:\s*"Perakende"/, "Capability settings must expose a retail override group for hybrid businesses.");
for (const capability of ["RETAIL_BARCODE", "RETAIL_PURCHASING", "RETAIL_SUPPLIERS", "RETAIL_LABELS"]) {
  assert.match(capabilitySettings, new RegExp(`C\\.${capability}`), `Retail override group must include ${capability}.`);
}

console.log("market-profile-availability-smoke-ok");
