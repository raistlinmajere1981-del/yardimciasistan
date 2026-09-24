import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { BUSINESS_PROFILES, getBusinessProfiles, normalizeBusinessType } = require("../packages/shared/dist/index.js");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { readBusinessCapabilitySnapshot } = require("../apps/desktop-app/dist-electron/business-capability-store.js");

const root = process.cwd();
const profileIds = getBusinessProfiles().map((profile) => profile.id);

assert.deepEqual(profileIds, ["pension_restaurant", "pension", "restaurant", "market"]);
assert.equal(Object.keys(BUSINESS_PROFILES).length, 4);
assert.equal(normalizeBusinessType("unknown"), "pension_restaurant");
assert.equal("other" in BUSINESS_PROFILES, false);

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

  const freshSetup = database.getSetupData();
  assert.equal(freshSetup.setupRequired, true);
  assert.equal(freshSetup.profileId, "pension_restaurant");
  assert.deepEqual(
    [...freshSetup.profileOptions].sort(),
    [...BUSINESS_PROFILES.pension_restaurant.defaultOptionalCapabilities].sort(),
    "fresh setup must expose the selected profile's default optional capabilities"
  );

  const baseSetupInput = {
    businessName: "Temiz Kurulum İşletmesi",
    profileId: "market",
    phone: "+905550000000",
    whatsapp: "",
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
    servicePreferences: { whatsapp: false, android: false },
    tableCategories: []
  };

  const missingWhatsAppResult = database.saveInitialSetup({
    ...baseSetupInput,
    servicePreferences: { whatsapp: true, android: false }
  });
  assert.equal(missingWhatsAppResult.ok, false);
  assert.equal(missingWhatsAppResult.message, "WhatsApp servisi açıkken WhatsApp numarası gerekli.");

  const whatsappDisabledResult = database.saveInitialSetup(baseSetupInput);
  assert.equal(whatsappDisabledResult.ok, true);

  const result = database.saveInitialSetup({
    ...baseSetupInput,
    whatsapp: "+905550000000",
    servicePreferences: { whatsapp: true, android: false }
  });

  assert.equal(result.ok, true);
  const setup = database.getSetupData();
  const capabilities = readBusinessCapabilitySnapshot(database.databasePath);
  assert.equal(setup.profileId, "market");
  assert.deepEqual(setup.servicePreferences, { whatsapp: true, android: false });
  assert.equal(capabilities.profileId, "market");
  assert.equal(capabilities.enabledCapabilities.includes("retail.barcode"), true);
  assert.equal(capabilities.enabledCapabilities.includes("customer.requests"), false);
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
