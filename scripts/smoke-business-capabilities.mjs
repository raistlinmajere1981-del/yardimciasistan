import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

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
  const databasePath = join(dataDir, "yardimci-asistan.sqlite");

  const initial = readBusinessCapabilitySnapshot(databasePath);
  assert.ok(initial.businessId, "Demo fixture should create an active business.");
  assert.equal(initial.profileId, "pension_restaurant");
  assert.equal(initial.enabledCapabilities.includes(C.CUSTOMERS), true);
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

  // The baseline has one capability store; the removed boolean/projection
  // columns must not exist in a fresh database.
  const raw = new DatabaseSync(databasePath);
  try {
    const businessColumns = new Set(raw.prepare("PRAGMA table_info('business')").all().map((row) => row.name));
    const settingsColumns = new Set(raw.prepare("PRAGMA table_info('settings')").all().map((row) => row.name));
    assert.equal(businessColumns.has("profile_id"), true);
    assert.equal(businessColumns.has("business_type"), false);
    assert.equal(businessColumns.has("modules_json"), false);
    for (const column of ["rooms_enabled", "tables_enabled", "qr_menu_enabled", "ai_enabled", "whatsapp_enabled", "android_enabled"]) {
      assert.equal(settingsColumns.has(column), false, `${column} must not be part of the current baseline`);
    }
  } finally {
    raw.close();
  }

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
