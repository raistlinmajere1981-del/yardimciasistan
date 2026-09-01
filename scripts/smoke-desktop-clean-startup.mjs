import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const cleanDataRoot = mkdtempSync(join(tmpdir(), "yardimci-clean-startup-"));
const demoDataRoot = mkdtempSync(join(tmpdir(), "yardimci-demo-profile-"));

try {
  const cleanDatabase = new DesktopDatabase({
    appPath: join(process.cwd(), "apps", "desktop-app"),
    userDataPath: cleanDataRoot,
    demoProfile: null
  });
  try {
    cleanDatabase.initialize();
    const setup = cleanDatabase.getSetupData();
    const dashboard = cleanDatabase.getDashboardData();

    assert.equal(setup.setupRequired, true);
    assert.equal(setup.businessName, "");
    assert.equal(dashboard.rooms.length, 0);
    assert.equal(dashboard.tables.length, 0);
    assert.equal(dashboard.menu.categories.length, 0);
    assert.equal(dashboard.menu.items.length, 0);

    const sqlite = new DatabaseSync(cleanDatabase.databasePath, { readOnly: true });
    try {
      assert.equal(Number(scalar(sqlite, "SELECT COUNT(*) FROM business")), 0);
      assert.equal(Number(scalar(sqlite, "SELECT COUNT(*) FROM settings")), 0);
      assert.equal(String(scalar(sqlite, "PRAGMA integrity_check")), "ok");
    } finally {
      sqlite.close();
    }
  } finally {
    cleanDatabase.close();
  }

  const demoDatabase = new DesktopDatabase({
    appPath: join(process.cwd(), "apps", "desktop-app"),
    userDataPath: demoDataRoot,
    demoProfile: "pension-restaurant"
  });
  try {
    demoDatabase.initialize();
    const dashboard = demoDatabase.getDashboardData();
    assert.ok(dashboard.rooms.length > 0);
    assert.ok(dashboard.tables.length > 0);
    assert.ok(dashboard.menu.categories.length > 0);
    assert.ok(dashboard.menu.items.length > 0);
  } finally {
    demoDatabase.close();
  }

  const demoSqlite = new DatabaseSync(join(demoDataRoot, "yardimci-asistan.sqlite"));
  try {
    demoSqlite.exec("PRAGMA foreign_keys = ON; DELETE FROM menu_items; DELETE FROM menu_categories;");
  } finally {
    demoSqlite.close();
  }

  const reopenedDemoDatabase = new DesktopDatabase({
    appPath: join(process.cwd(), "apps", "desktop-app"),
    userDataPath: demoDataRoot,
    demoProfile: "pension-restaurant"
  });
  try {
    reopenedDemoDatabase.initialize();
    const dashboard = reopenedDemoDatabase.getDashboardData();
    assert.equal(dashboard.menu.categories.length, 0);
    assert.equal(dashboard.menu.items.length, 0);
  } finally {
    reopenedDemoDatabase.close();
  }

  console.log("desktop-clean-startup-ok: production empty, demo profile opt-in");
} finally {
  rmSync(cleanDataRoot, { recursive: true, force: true });
  rmSync(demoDataRoot, { recursive: true, force: true });
}

function scalar(database, sql) {
  const row = database.prepare(sql).get();
  assert.ok(row, `Sorgu sonuç döndürmedi: ${sql}`);
  return Object.values(row)[0];
}
