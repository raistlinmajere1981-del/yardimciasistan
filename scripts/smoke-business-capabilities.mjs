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

  const overridden = setBusinessCapability(databasePath, {
    capability: C.ACCOMMODATION_ROOMS,
    enabled: false
  });
  const roomOverride = overridden.capabilities.find((entry) => entry.capability === C.ACCOMMODATION_ROOMS);
  assert.equal(roomOverride?.enabled, false);
  assert.equal(roomOverride?.source, "user");

  // v2 no longer mirrors room/table/QR settings booleans into capabilities.
  // A stale compatibility write therefore cannot overwrite an explicit
  // capability decision.
  const raw = new DatabaseSync(databasePath);
  try {
    const now = new Date().toISOString();
    raw.prepare("UPDATE settings SET rooms_enabled = 0, updated_at = ? WHERE deleted_at = ''").run(now);
    raw.prepare("UPDATE settings SET rooms_enabled = 1, updated_at = ? WHERE deleted_at = ''").run(now);
  } finally {
    raw.close();
  }

  const afterLegacyWrite = readBusinessCapabilitySnapshot(databasePath);
  const protectedRoomOverride = afterLegacyWrite.capabilities.find((entry) => entry.capability === C.ACCOMMODATION_ROOMS);
  assert.equal(protectedRoomOverride?.enabled, false);
  assert.equal(protectedRoomOverride?.source, "user");
  assert.equal(afterLegacyWrite.enabledCapabilities.includes(C.ACCOMMODATION_STAYS), true);

  assert.throws(
    () => setBusinessCapability(databasePath, { capability: C.FINANCE, enabled: false }),
    /Çekirdek işletme yeteneği kapatılamaz/
  );

  console.log("business-capabilities-smoke-ok");
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
