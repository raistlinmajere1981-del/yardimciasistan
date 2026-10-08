import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const {
  applyBusinessProfileCapabilities,
  clearBusinessCapabilityOverride,
  readBusinessCapabilitySnapshot,
  setBusinessCapability
} = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const {
  assertPersistedBusinessCapability,
  hasPersistedBusinessCapability
} = require("../apps/desktop-app/dist-electron/business-capability-runtime.js");
const { BUSINESS_CAPABILITIES: C } = require("../packages/shared/dist/index.js");

const dataDir = mkdtempSync(join(tmpdir(), "yardimci-asistan-cap-runtime-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataDir
});

try {
  database.initialize();
  const setupResult = database.saveInitialSetup({
    businessName: "Çalışma Zamanı Test İşletmesi",
    profileId: "pension_restaurant",
    phone: "+905550002002",
    whatsapp: "+905550002002",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "capability-runtime-secret",
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
  const databasePath = database.databasePath;
  const initial = readBusinessCapabilitySnapshot(databasePath);
  assert.equal(initial.profileId, "pension_restaurant");
  assert.equal(initial.enabledCapabilities.includes(C.ACCOMMODATION_ROOMS), true);
  assert.equal(initial.enabledCapabilities.includes(C.FOOD_TABLES), true);
  assert.equal(initial.enabledCapabilities.includes(C.RETAIL_BARCODE), false);
  assert.doesNotThrow(() => assertPersistedBusinessCapability(databasePath, C.ACCOMMODATION_FOLIO));

  const market = applyBusinessProfileCapabilities(databasePath, "market", { preserveUserOverrides: false });
  assert.equal(market.profileId, "market");
  for (const capability of [C.CATALOG, C.INVENTORY, C.SALES, C.RETAIL_BARCODE, C.RETAIL_PURCHASING]) {
    assert.equal(market.enabledCapabilities.includes(capability), true, `Market is missing ${capability}`);
  }
  assert.equal(market.enabledCapabilities.includes(C.ACCOMMODATION_ROOMS), false);
  assert.equal(market.enabledCapabilities.includes(C.FOOD_TABLES), false);
  assert.equal(hasPersistedBusinessCapability(databasePath, C.ACCOMMODATION_FOLIO), false);
  assert.throws(
    () => assertPersistedBusinessCapability(databasePath, C.ACCOMMODATION_FOLIO, "folio-disabled"),
    /folio-disabled/
  );

  for (const capability of [C.ACCOMMODATION_ROOMS, C.ACCOMMODATION_STAYS, C.ACCOMMODATION_FOLIO]) {
    assert.throws(() => setBusinessCapability(databasePath, { capability, enabled: true }), /profilinde/);
  }

  const restaurant = applyBusinessProfileCapabilities(databasePath, "restaurant");
  assert.equal(restaurant.profileId, "restaurant");
  assert.equal(restaurant.enabledCapabilities.includes(C.FOOD_TABLES), true);
  assert.equal(restaurant.enabledCapabilities.includes(C.RETAIL_BARCODE), false);
  assert.equal(restaurant.enabledCapabilities.includes(C.ACCOMMODATION_ROOMS), false);
  assert.equal(restaurant.enabledCapabilities.includes(C.ACCOMMODATION_STAYS), false);
  assert.equal(restaurant.enabledCapabilities.includes(C.ACCOMMODATION_FOLIO), false);

  assert.throws(() => setBusinessCapability(databasePath, { capability: C.ACCOMMODATION_ROOMS, enabled: true }), /profilinde/);
  setBusinessCapability(databasePath, { capability: C.QR_MENU, enabled: false });
  const cleared = clearBusinessCapabilityOverride(databasePath, C.QR_MENU);
  assert.equal(cleared.enabledCapabilities.includes(C.QR_MENU), true);
  assert.equal(cleared.profileId, "restaurant");
  assert.throws(
    () => setBusinessCapability(databasePath, { capability: C.FINANCE, enabled: false }),
    /Çekirdek işletme yeteneği kapatılamaz/
  );

  console.log("capability-runtime-smoke-ok");
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
