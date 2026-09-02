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

  // Profiles are presets, not mutually exclusive permanent business types.
  // An explicit user capability can compose a hybrid without adding a new id.
  const marketWithRooms = setBusinessCapability(databasePath, {
    capability: C.ACCOMMODATION_ROOMS,
    enabled: true
  });
  const roomOverride = marketWithRooms.capabilities.find((entry) => entry.capability === C.ACCOMMODATION_ROOMS);
  assert.equal(roomOverride?.enabled, true);
  assert.equal(roomOverride?.source, "user");
  assert.equal(database.getSetupData().modules.rooms, true);

  const restaurantHybrid = applyBusinessProfileCapabilities(databasePath, "restaurant");
  assert.equal(restaurantHybrid.profileId, "restaurant");
  assert.equal(restaurantHybrid.enabledCapabilities.includes(C.FOOD_TABLES), true);
  assert.equal(restaurantHybrid.enabledCapabilities.includes(C.RETAIL_BARCODE), false);
  assert.equal(restaurantHybrid.enabledCapabilities.includes(C.ACCOMMODATION_ROOMS), true, "User override must survive profile changes.");

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
