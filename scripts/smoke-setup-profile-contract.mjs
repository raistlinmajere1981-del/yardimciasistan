import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { BUSINESS_PROFILES, getBusinessProfiles, normalizeBusinessType } = require("../packages/shared/dist/index.js");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { readBusinessCapabilitySnapshot } = require("../apps/desktop-app/dist-electron/business-capability-store.js");

const root = process.cwd();
const setupWizard = readFileSync(join(root, "apps/desktop-app/src/components/settings/SetupWizard.tsx"), "utf8");
const setupForm = readFileSync(join(root, "apps/desktop-app/src/components/settings/SetupForm.tsx"), "utf8");
const setupController = readFileSync(join(root, "apps/desktop-app/src/app/use-setup-controller.ts"), "utf8");
const profileIds = getBusinessProfiles().map((profile) => profile.id);

assert.deepEqual(profileIds, ["pension_restaurant", "pension", "restaurant", "cafe", "market"]);
assert.equal(Object.keys(BUSINESS_PROFILES).length, 5);
assert.equal(normalizeBusinessType("unknown"), "pension_restaurant");
assert.equal("other" in BUSINESS_PROFILES, false);
assert.match(setupForm, /value=\{form\.profileId\}/);
assert.match(setupForm, /getBusinessProfiles\(\)\.map/);
assert.match(setupController, /profileId:\s*setupForm\.profileId/);
assert.match(setupController, /servicePreferences:/);
assert.doesNotMatch(setupWizard, /LegacySetupWizard|querySelector|replaceChildren/);
assert.doesNotMatch(setupForm, /business_type|modules_json|rooms_enabled|tables_enabled|qr_menu_enabled/);

const dataDir = mkdtempSync(join(tmpdir(), "yardimci-setup-profile-"));
const database = new DesktopDatabase({
  appPath: join(root, "apps", "desktop-app"),
  userDataPath: dataDir
});

try {
  database.initialize();
  // Remove initialization publications so this assertion exercises setup itself.
  for (const job of database.getPendingSyncJobs()) {
    database.completeSyncJob(job.jobKey, job.sourceRevision);
  }
  assert.equal(database.getPendingSyncJobs().length, 0);
  const result = database.saveInitialSetup({
    businessName: "Temiz Kurulum İşletmesi",
    profileId: "market",
    phone: "+905550000000",
    whatsapp: "+905550000000",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "123456789012",
    autoSyncEnabled: true,
    aiEnabled: false,
    aiProvider: "openai_compatible",
    aiService: "openai",
    aiProjectName: "",
    aiModel: "",
    aiModelOptions: [],
    aiBaseUrl: "https://api.openai.com/v1",
    aiTimeoutSeconds: 30,
    aiApiKey: "",
    clearAiApiKey: false,
    servicePreferences: { whatsapp: true, android: false },
    initialCounts: { rooms: 0, tables: 0 },
    tableCategories: []
  });

  assert.equal(result.ok, true);
  const setup = database.getSetupData();
  const capabilities = readBusinessCapabilitySnapshot(database.databasePath);
  assert.equal(setup.profileId, "market");
  assert.deepEqual(setup.servicePreferences, { whatsapp: true, android: false });
  assert.equal(capabilities.profileId, "market");
  assert.equal(capabilities.enabledCapabilities.includes("retail.barcode"), true);
  assert.equal(capabilities.enabledCapabilities.includes("food_service.tables"), false);
  assert.equal(capabilities.enabledCapabilities.includes("accommodation.rooms"), false);
  assert.equal(capabilities.enabledCapabilities.includes("service.android"), false);
  assert.equal(capabilities.enabledCapabilities.includes("service.whatsapp"), true);
  assert.equal(capabilities.enabledCapabilities.includes("service.ai"), false);
  assert.equal(
    database.getPendingSyncJobs().some((job) => job.jobType === "android_snapshot"),
    true,
    "setup must queue the capability manifest even when Android is disabled"
  );
  console.log("setup-profile-contract-smoke-ok");
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
