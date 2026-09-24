import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const {
  readBusinessCapabilitySnapshot,
  setBusinessCapability
} = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const { BUSINESS_CAPABILITIES: C } = require("../packages/shared/dist/index.js");

const dataDir = mkdtempSync(join(tmpdir(), "yardimci-asistan-capabilities-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataDir
});

try {
  database.initialize();
  const setupResult = database.saveInitialSetup({
    businessName: "Yetenek Test İşletmesi",
    profileId: "pension_restaurant",
    phone: "+905550002001",
    whatsapp: "+905550002001",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "capability-smoke-secret",
    autoSyncEnabled: false,
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
    servicePreferences: { whatsapp: true, android: true },
    initialCounts: { rooms: 1, tables: 1 },
    tableCategories: []
  });
  assert.equal(setupResult.ok, true, setupResult.ok ? "" : setupResult.message);
  const databasePath = join(dataDir, "yardimci-asistan.sqlite");

  const initial = readBusinessCapabilitySnapshot(databasePath);
  assert.ok(initial.businessId, "Demo fixture should create an active business.");
  assert.equal(initial.profileId, "pension_restaurant");
  assert.equal(initial.enabledCapabilities.includes(C.CUSTOMERS), true);
  assert.equal(initial.enabledCapabilities.includes(C.REQUESTS), true);
  assert.equal(initial.enabledCapabilities.includes(C.ACCOMMODATION_ROOMS), true);
  assert.equal(initial.enabledCapabilities.includes(C.FOOD_TABLES), true);
  assert.equal(initial.enabledCapabilities.includes(C.QR_MENU), true);
  assert.equal(initial.enabledCapabilities.includes(C.RETAIL_BARCODE), false);

  // QR menu is a leaf capability, so it can be independently disabled without
  // invalidating food menu/catalog/inventory prerequisites.
  const overridden = setBusinessCapability(databasePath, {
    capability: C.QR_MENU,
    enabled: false
  });
  const qrOverride = overridden.capabilities.find((entry) => entry.capability === C.QR_MENU);
  assert.equal(qrOverride?.enabled, false);
  assert.equal(qrOverride?.source, "user");

  const afterSchemaAudit = readBusinessCapabilitySnapshot(databasePath);
  const protectedQrOverride = afterSchemaAudit.capabilities.find((entry) => entry.capability === C.QR_MENU);
  assert.equal(protectedQrOverride?.enabled, false);
  assert.equal(protectedQrOverride?.source, "user");
  assert.equal(afterSchemaAudit.enabledCapabilities.includes(C.FOOD_MENU), true);

  // Catalog is a prerequisite of inventory/sales. Disabling it while those
  // capabilities are still enabled must be rejected rather than creating an
  // invalid hybrid configuration.
  assert.throws(
    () => setBusinessCapability(databasePath, { capability: C.CATALOG, enabled: false }),
    /bağlı/i
  );

  assert.throws(
    () => setBusinessCapability(databasePath, { capability: C.FINANCE, enabled: false }),
    /Çekirdek işletme yeteneği kapatılamaz/
  );

  console.log("business-capabilities-smoke-ok");
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
