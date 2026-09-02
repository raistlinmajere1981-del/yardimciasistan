import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
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

const dataDir = mkdtempSync(join(tmpdir(), "yardimci-asistan-cap-runtime-v2-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataDir
});

try {
  database.initialize();
  const databasePath = database.databasePath;

  const initial = readBusinessCapabilitySnapshot(databasePath);
  assert.equal(initial.profileId, "pension_restaurant");
  assert.equal(initial.enabledCapabilities.includes(C.ACCOMMODATION_ROOMS), true);
  assert.equal(initial.enabledCapabilities.includes(C.FOOD_TABLES), true);
  assert.equal(initial.enabledCapabilities.includes(C.RETAIL_BARCODE), false);
  assert.equal(hasPersistedBusinessCapability(databasePath, C.ACCOMMODATION_FOLIO), true);
  assert.doesNotThrow(() => assertPersistedBusinessCapability(databasePath, C.ACCOMMODATION_FOLIO));

  const market = applyBusinessProfileCapabilities(databasePath, "market", {
    preserveUserOverrides: false
  });
  assert.equal(market.profileId, "market");
  assert.equal(market.enabledCapabilities.includes(C.CATALOG), true);
  assert.equal(market.enabledCapabilities.includes(C.INVENTORY), true);
  assert.equal(market.enabledCapabilities.includes(C.SALES), true);
  assert.equal(market.enabledCapabilities.includes(C.RETAIL_BARCODE), true);
  assert.equal(market.enabledCapabilities.includes(C.RETAIL_PURCHASING), true);
  assert.equal(market.enabledCapabilities.includes(C.ACCOMMODATION_ROOMS), false);
  assert.equal(market.enabledCapabilities.includes(C.FOOD_TABLES), false);
  assert.equal(market.enabledCapabilities.includes(C.QR_MENU), false);
  assert.equal(hasPersistedBusinessCapability(databasePath, C.ACCOMMODATION_FOLIO), false);
  assert.throws(
    () => assertPersistedBusinessCapability(databasePath, C.ACCOMMODATION_FOLIO, "folio-disabled"),
    /folio-disabled/
  );

  // modules_json is now a compatibility projection. A direct legacy write must
  // not be able to turn Market into a room/table application.
  const raw = new DatabaseSync(databasePath);
  try {
    raw.prepare(`
      UPDATE business
      SET modules_json = '{"rooms":true,"tables":true,"qr_menu":true,"ai":true,"whatsapp":true,"android":true}'
      WHERE deleted_at = ''
    `).run();
  } finally {
    raw.close();
  }
  const projectedMarketSetup = database.getSetupData();
  assert.equal(projectedMarketSetup.modules.rooms, false);
  assert.equal(projectedMarketSetup.modules.tables, false);
  assert.equal(projectedMarketSetup.modules.qrMenu, false);

  // Profiles are presets, not mutually exclusive permanent business types. A
  // user may compose Market + Rooms, but dependent capabilities cannot be
  // enabled in an invalid order.
  const marketWithRooms = setBusinessCapability(databasePath, {
    capability: C.ACCOMMODATION_ROOMS,
    enabled: true
  });
  const roomOverride = marketWithRooms.capabilities.find((entry) => entry.capability === C.ACCOMMODATION_ROOMS);
  assert.equal(roomOverride?.enabled, true);
  assert.equal(roomOverride?.source, "user");
  assert.equal(database.getSetupData().modules.rooms, true);
  assert.equal(hasPersistedBusinessCapability(databasePath, C.ACCOMMODATION_ROOMS), true);
  assert.equal(hasPersistedBusinessCapability(databasePath, C.ACCOMMODATION_FOLIO), false, "Capabilities remain independently composable.");

  assert.throws(
    () => setBusinessCapability(databasePath, {
      capability: C.ACCOMMODATION_FOLIO,
      enabled: true
    }),
    /accommodation\.stays/
  );

  setBusinessCapability(databasePath, {
    capability: C.ACCOMMODATION_STAYS,
    enabled: true
  });
  const marketWithFolio = setBusinessCapability(databasePath, {
    capability: C.ACCOMMODATION_FOLIO,
    enabled: true
  });
  assert.equal(marketWithFolio.enabledCapabilities.includes(C.ACCOMMODATION_FOLIO), true);

  const restaurantHybrid = applyBusinessProfileCapabilities(databasePath, "restaurant");
  assert.equal(restaurantHybrid.profileId, "restaurant");
  assert.equal(restaurantHybrid.enabledCapabilities.includes(C.FOOD_TABLES), true);
  assert.equal(restaurantHybrid.enabledCapabilities.includes(C.RETAIL_BARCODE), false);
  assert.equal(restaurantHybrid.enabledCapabilities.includes(C.ACCOMMODATION_ROOMS), true, "User override must survive profile changes.");
  assert.equal(restaurantHybrid.enabledCapabilities.includes(C.ACCOMMODATION_STAYS), true);
  assert.equal(restaurantHybrid.enabledCapabilities.includes(C.ACCOMMODATION_FOLIO), true);

  // A prerequisite override cannot be cleared while preserved user capabilities
  // still depend on it.
  assert.throws(
    () => clearBusinessCapabilityOverride(databasePath, C.ACCOMMODATION_ROOMS),
    /gerekli yetenekler|bağlı/i
  );

  clearBusinessCapabilityOverride(databasePath, C.ACCOMMODATION_FOLIO);
  clearBusinessCapabilityOverride(databasePath, C.ACCOMMODATION_STAYS);
  const restaurantDefault = clearBusinessCapabilityOverride(databasePath, C.ACCOMMODATION_ROOMS);
  const clearedRoom = restaurantDefault.capabilities.find((entry) => entry.capability === C.ACCOMMODATION_ROOMS);
  assert.equal(clearedRoom?.enabled, false);
  assert.equal(clearedRoom?.source, "profile");
  assert.equal(database.getSetupData().modules.rooms, false);

  assert.throws(
    () => setBusinessCapability(databasePath, { capability: C.FINANCE, enabled: false }),
    /Çekirdek işletme yeteneği kapatılamaz/
  );

  console.log("capability-runtime-v2-smoke-ok");
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
