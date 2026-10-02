import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const dataDir = resolve(process.argv[2] || "");
assert.ok(process.argv[2], "Kullanım: node scripts/smoke-desktop-windows-data.mjs <data-dir>");
const mode = process.argv[3] || "";
const require = createRequire(import.meta.url);
const { cleanupTransientStateForCleanStart } = require("../apps/desktop-app/dist-electron/clean-start.js");

const databasePath = join(dataDir, "yardimci-asistan.sqlite");
const backupPath = join(dataDir, "backups");
assert.ok(existsSync(databasePath), `Windows ilk açılış veritabanı bulunamadı: ${databasePath}`);
assert.ok(statSync(databasePath).size > 0, "Windows ilk açılış veritabanı boş.");
assert.ok(existsSync(backupPath) && statSync(backupPath).isDirectory(), "Windows yedek klasörü oluşmadı.");

const database = new DatabaseSync(databasePath);
try {
  assert.equal(String(scalar(database, "PRAGMA integrity_check")), "ok");
  assert.equal(
    Number(scalar(database, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")),
    0,
    "Current-only veritabanında schema_migrations tablosu olmamalı."
  );
  for (const table of ["business", "settings", "rooms", "tables", "menu_categories", "menu_items"]) {
    assert.equal(
      Number(scalar(database, `SELECT COUNT(*) FROM ${table}`)),
      0,
      `Temiz Windows kurulumunda ${table} tablosu boş olmalı.`
    );
  }
  assert.equal(Number(scalar(database, "SELECT COUNT(*) FROM room_folio_table_order_transfers")), 0);

  const approvalTrigger = Number(scalar(database, `
    SELECT COUNT(*)
    FROM sqlite_master
    WHERE type = 'trigger' AND name = 'android_devices_require_approval_after_insert'
  `));
  assert.equal(approvalTrigger, 1, "Yeni Android cihaz onay trigger'ı Windows kurulumunda yok.");

  const roomTransferGuard = Number(scalar(database, `
    SELECT COUNT(*)
    FROM sqlite_master
    WHERE type = 'trigger' AND name = 'trg_room_folio_transfer_item_delete_guard'
  `));
  assert.equal(roomTransferGuard, 1, "Restoran→oda transfer bütünlük trigger'ı Windows kurulumunda yok.");
} finally {
  database.close();
}

if (mode === "--locked-cleanup") {
  const cleanup = cleanupTransientStateForCleanStart(dataDir);
  assert.ok(cleanup.removedEntries.includes("updates/pending.json"));
  assert.ok(cleanup.removedEntries.includes("updates/installing.json"));
  assert.ok(
    cleanup.failedEntries.some((entry) => entry.name === "updates/downloads"),
    "Windows dosya kilidinde updates/downloads best-effort failure olarak raporlanmalı."
  );
  assert.ok(existsSync(join(dataDir, "updates", "downloads")), "Kilitli downloads klasörü erken silinmemeli.");
  console.log("windows-clean-start-locked-transient-ok");
} else if (mode === "--cleanup-after-unlock") {
  const cleanup = cleanupTransientStateForCleanStart(dataDir);
  assert.deepEqual(cleanup.failedEntries, []);
  assert.equal(existsSync(join(dataDir, "updates", "downloads")), false);
  console.log("windows-clean-start-unlocked-transient-ok");
}

console.log(`windows-first-run-data-ok: ${databasePath}`);

function scalar(database, sql) {
  const row = database.prepare(sql).get();
  assert.ok(row, `Sorgu sonuç döndürmedi: ${sql}`);
  return Object.values(row)[0];
}
