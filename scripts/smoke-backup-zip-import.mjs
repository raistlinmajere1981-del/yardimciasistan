import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { zipSync, strToU8 } from "fflate";

const dist = path.resolve("apps/desktop-app/dist-electron");
const moduleRequire = createRequire(path.join(dist, "data-maintenance.js"));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ya-backup-zip-smoke-"));
const backupRoot = path.join(tempRoot, "backups");
const source = path.resolve("artifacts/demo-data/yardimci-asistan-demo-2.2.1-a-pension-restaurant.zip");
assert.ok(fs.existsSync(source), "Demo fixture ZIP dosyası bulunamadı.");
const handlers = new Map();
let selectedZip = source;
const exports = {};
const electronMock = {
  app: { isPackaged: false, getAppPath: () => process.cwd() },
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [selectedZip] }) },
  ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => handlers.delete(channel) },
  shell: { openPath: async () => "" },
  session: { defaultSession: { clearStorageData: async () => {} } }
};
const dataPaths = {
  DESKTOP_DATABASE_FILE_NAME: "yardimci-asistan.sqlite",
  resolveBackupRoot: () => backupRoot,
  resolveMaintenancePath: () => path.join(tempRoot, ".maintenance"),
  resolveDatabasePath: () => path.join(tempRoot, "yardimci-asistan.sqlite"),
  resolveAssetsPath: () => path.join(tempRoot, "assets"),
  resolvePendingMaintenanceMarkerPath: () => path.join(tempRoot, "marker"),
  resolveStagedRestorePath: () => path.join(tempRoot, "stage-restore.sqlite"),
  resolveStagedRestoreAssetsPath: () => path.join(tempRoot, "stage-restore-assets")
};
const overrides = {
  electron: electronMock,
  "./data-paths.js": dataPaths,
  "./data-maintenance-confirmation": { requestDataMaintenanceConfirmation: async () => false },
  "./desktop-logger": { desktopLog: { error: () => {}, warn: () => {} } },
  "./product-image-reader": { readProductImageAsset: () => "" },
  "./database/restore-reconciliation-store": { beginRestoreReconciliation: () => {} }
};
runInNewContext(fs.readFileSync(path.join(dist, "data-maintenance.js"), "utf8"), {
  exports, require: name => name in overrides ? overrides[name] : moduleRequire(name),
  fs, path, process, console, Buffer, URL, setTimeout, clearTimeout, Date, Error, Map, Set, Promise
}, { filename: path.join(dist, "data-maintenance.js") });
exports.registerDataMaintenanceIpcHandlers(() => tempRoot, { assertUnlocked: () => {} });
const importZip = () => handlers.get("dataMaintenance:importBackupZip")({ sender: { id: 3 } });

try {
  const result = await importZip();
  assert.equal(result.ok, true, result.message);
  assert.equal(result.backups.length, 1);
  const folder = result.backup.folderPath;
  assert.ok(fs.existsSync(path.join(folder, "backup.json")));
  assert.ok(fs.existsSync(path.join(folder, "yardimci-asistan.sqlite")));
  const db = new DatabaseSync(path.join(folder, "yardimci-asistan.sqlite"));
  try { assert.equal(Object.values(db.prepare("PRAGMA quick_check").get())[0], "ok"); }
  finally { db.close(); }
  assert.equal(fs.existsSync(path.join(tempRoot, "yardimci-asistan.sqlite")), false, "Import must not restore current data");

  const duplicate = await importZip();
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.message, /zaten mevcut/);
  assert.ok(fs.existsSync(path.join(folder, "backup.json")), "Duplicate import must preserve existing backup");

  // Every published demo pack should enter the same backup list.
  for (const pack of ["b-market", "c-market-dealer"]) {
    selectedZip = path.resolve(`artifacts/demo-data/yardimci-asistan-demo-2.2.1-${pack}.zip`);
    const imported = await importZip();
    assert.equal(imported.ok, true, imported.message);
    assert.ok(fs.existsSync(path.join(imported.backup.folderPath, "backup.json")));
  }
  assert.equal((await handlers.get("dataMaintenance:listBackups")()).backups.length, 3);

  const invalidZip = path.join(tempRoot, "unsafe.zip");
  fs.writeFileSync(invalidZip, zipSync({ "../outside.txt": strToU8("bad"), "valid/backup.json": strToU8("{}") }));
  selectedZip = invalidZip;
  const unsafe = await importZip();
  assert.equal(unsafe.ok, false);
  assert.match(unsafe.message, /ZIP/);
  assert.equal(fs.existsSync(path.join(tempRoot, "outside.txt")), false);
  assert.deepEqual(fs.readdirSync(backupRoot).filter(name => name.startsWith(".tmp-import-")), []);
  assert.equal(fs.readdirSync(backupRoot).length, 3);
  console.log("smoke-backup-zip-import-ok: all three real demo ZIPs, SQLite validated, no live restore, duplicates safe, traversal rejected, temporary files removed");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
