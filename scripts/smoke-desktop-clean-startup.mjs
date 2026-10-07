import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const cleanDataRoot = mkdtempSync(join(tmpdir(), "yardimci-clean-startup-"));

try {
  const cleanDatabase = new DesktopDatabase({
    appPath: join(process.cwd(), "apps", "desktop-app"),
    userDataPath: cleanDataRoot
  });
  try {
    cleanDatabase.initialize();
    const setup = cleanDatabase.getSetupData();
    const dashboard = cleanDatabase.getDashboardData();

    assert.equal(setup.setupRequired, true);
    assert.equal(setup.businessName, "");
    assert.equal(setup.phone, "");
    assert.equal(setup.whatsapp, "");
    assert.equal(dashboard.rooms.length, 0);
    assert.equal(dashboard.tables.length, 0);
    assert.equal(dashboard.menu.categories.length, 0);
    assert.equal(dashboard.menu.items.length, 0);

    const sqlite = new DatabaseSync(cleanDatabase.databasePath, { readOnly: true });
    try {
      assert.equal(Number(scalar(sqlite, "SELECT COUNT(*) FROM business")), 0);
      assert.equal(Number(scalar(sqlite, "SELECT COUNT(*) FROM settings")), 0);
      assert.equal(Number(scalar(sqlite, "SELECT COUNT(*) FROM rooms WHERE deleted_at = ''")), 0);
      assert.equal(Number(scalar(sqlite, "SELECT COUNT(*) FROM tables WHERE deleted_at = ''")), 0);
      assert.equal(Number(scalar(sqlite, "SELECT COUNT(*) FROM menu_categories WHERE deleted_at = ''")), 0);
      assert.equal(Number(scalar(sqlite, "SELECT COUNT(*) FROM menu_product_entries WHERE deleted_at = ''")), 0);
      assert.equal(String(scalar(sqlite, "PRAGMA integrity_check")), "ok");
    } finally {
      sqlite.close();
    }
  } finally {
    cleanDatabase.close();
  }

  console.log("desktop-clean-startup-ok: clean install without demo data");
} finally {
  rmSync(cleanDataRoot, { recursive: true, force: true });
}

function scalar(database, sql) {
  const row = database.prepare(sql).get();
  assert.ok(row, `Sorgu sonuç döndürmedi: ${sql}`);
  return Object.values(row)[0];
}
