import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const {
  inspectDesktopDatabaseCompatibility
} = require("../apps/desktop-app/dist-electron/desktop-database-compatibility.js");
const {
  CLEAN_START_SESSION_CLEAR_TIMEOUT_MS,
  archiveLocalDataForCleanStart,
  cleanupTransientStateForCleanStart,
  settleCleanStartOperation
} = require("../apps/desktop-app/dist-electron/clean-start.js");

function createCurrentSchemaFixture(filePath) {
  const database = new DatabaseSync(filePath);
  try {
    database.exec(readFileSync(schemaPath, "utf8"));
  } finally {
    database.close();
  }
}

const root = mkdtempSync(join(tmpdir(), "ya-clean-start-"));
const schemaPath = join(process.cwd(), "apps", "desktop-app", "db", "schema.sql");
try {
  const missingPath = join(root, "missing.sqlite");
  assert.equal(inspectDesktopDatabaseCompatibility(missingPath, schemaPath).state, "fresh");

  const currentPath = join(root, "current.sqlite");
  createCurrentSchemaFixture(currentPath);
  assert.equal(inspectDesktopDatabaseCompatibility(currentPath, schemaPath).state, "current");

  const legacyPath = join(root, "legacy.sqlite");
  {
    const database = new DatabaseSync(legacyPath);
    try {
      database.exec("CREATE TABLE settings (id TEXT PRIMARY KEY);");
    } finally {
      database.close();
    }
  }
  const legacy = inspectDesktopDatabaseCompatibility(legacyPath, schemaPath);
  assert.equal(legacy.state, "incompatible");
  assert.match(legacy.reason, /Eksik tablo|Eksik alan/);

  const brokenPath = join(root, "broken.sqlite");
  writeFileSync(brokenPath, "not-a-sqlite-database");
  assert.equal(inspectDesktopDatabaseCompatibility(brokenPath, schemaPath).state, "unreadable");

  const dataRoot = join(root, "archive-fixture");
  mkdirSync(join(dataRoot, "assets", "products"), { recursive: true });
  mkdirSync(join(dataRoot, "maintenance"), { recursive: true });
  mkdirSync(join(dataRoot, "backups", "old-backup"), { recursive: true });
  mkdirSync(join(dataRoot, "logs", "sessions", "kept-session"), { recursive: true });
  mkdirSync(join(dataRoot, "legacy-data", "older-clean"), { recursive: true });
  mkdirSync(join(dataRoot, "updates", "downloads"), { recursive: true });

  const databasePath = join(dataRoot, "yardimci-asistan.sqlite");
  writeFileSync(databasePath, "legacy-db");
  writeFileSync(`${databasePath}-wal`, "legacy-wal");
  writeFileSync(`${databasePath}-shm`, "legacy-shm");
  writeFileSync(join(dataRoot, "assets", "products", "image.webp"), "asset");
  writeFileSync(join(dataRoot, "maintenance", "pending-data-maintenance.json"), '{"kind":"restore"}');
  writeFileSync(join(dataRoot, "backups", "old-backup", "backup.json"), '{"format":"old"}');
  writeFileSync(join(dataRoot, "logs", "sessions", "kept-session", "session.json"), '{"version":1}');
  writeFileSync(join(dataRoot, "legacy-data", "older-clean", "archive.json"), '{"format":"older"}');
  writeFileSync(join(dataRoot, "updates", "settings.json"), '{"version":1,"autoCheckEnabled":false}');
  writeFileSync(join(dataRoot, "updates", "pending.json"), '{"version":1}');
  writeFileSync(join(dataRoot, "updates", "installing.json"), '{"version":1}');
  writeFileSync(join(dataRoot, "updates", "downloads", "old-installer.exe"), "installer");

  const transientCleanup = cleanupTransientStateForCleanStart(dataRoot);
  assert.deepEqual(transientCleanup.failedEntries, []);
  assert.deepEqual(
    [...transientCleanup.removedEntries].sort(),
    ["updates/downloads", "updates/installing.json", "updates/pending.json"].sort()
  );
  assert.equal(existsSync(join(dataRoot, "updates", "settings.json")), true);
  assert.equal(existsSync(join(dataRoot, "updates", "pending.json")), false);
  assert.equal(existsSync(join(dataRoot, "updates", "installing.json")), false);
  assert.equal(existsSync(join(dataRoot, "updates", "downloads")), false);
  assert.equal(existsSync(join(dataRoot, "logs", "sessions", "kept-session", "session.json")), true);
  assert.equal(existsSync(join(dataRoot, "legacy-data", "older-clean", "archive.json")), true);

  assert.ok(CLEAN_START_SESSION_CLEAR_TIMEOUT_MS >= 1_000);
  assert.deepEqual(
    await settleCleanStartOperation("completed", Promise.resolve(), 50),
    { name: "completed", status: "completed", message: "" }
  );
  const failedOperation = await settleCleanStartOperation(
    "failed",
    Promise.reject(new Error("fixture failure")),
    50
  );
  assert.equal(failedOperation.status, "failed");
  assert.match(failedOperation.message, /fixture failure/);
  const timedOutOperation = await settleCleanStartOperation(
    "timeout",
    new Promise(() => undefined),
    15
  );
  assert.equal(timedOutOperation.status, "timed-out");

  const archived = archiveLocalDataForCleanStart(
    dataRoot,
    new Date("2026-09-30T18:00:00.000Z"),
    join(dataRoot, "backups")
  );
  assert.equal(archived.archived, true);
  assert.equal(existsSync(databasePath), false);
  assert.equal(existsSync(`${databasePath}-wal`), false);
  assert.equal(existsSync(`${databasePath}-shm`), false);
  assert.equal(existsSync(join(dataRoot, "assets")), false);
  assert.equal(existsSync(join(dataRoot, "maintenance")), false);
  assert.equal(existsSync(join(dataRoot, "backups")), false);
  assert.equal(existsSync(join(dataRoot, "logs", "sessions", "kept-session", "session.json")), true);
  assert.equal(existsSync(join(dataRoot, "legacy-data", "older-clean", "archive.json")), true);
  assert.equal(existsSync(join(dataRoot, "updates", "settings.json")), true);
  assert.equal(existsSync(join(archived.archiveDirectory, "yardimci-asistan.sqlite")), true);
  assert.equal(existsSync(join(archived.archiveDirectory, "yardimci-asistan.sqlite-wal")), true);
  assert.equal(existsSync(join(archived.archiveDirectory, "yardimci-asistan.sqlite-shm")), true);
  assert.equal(existsSync(join(archived.archiveDirectory, "assets", "products", "image.webp")), true);
  assert.equal(existsSync(join(archived.archiveDirectory, "maintenance", "pending-data-maintenance.json")), true);
  assert.equal(existsSync(join(archived.archiveDirectory, "backups", "old-backup", "backup.json")), true);

  const manifest = JSON.parse(readFileSync(join(archived.archiveDirectory, "archive.json"), "utf8"));
  assert.equal(manifest.format, "yardimci-asistan-clean-start-archive-v1");
  assert.deepEqual(
    [...manifest.movedEntries].sort(),
    ["assets", "backups", "maintenance", "yardimci-asistan.sqlite", "yardimci-asistan.sqlite-shm", "yardimci-asistan.sqlite-wal"].sort()
  );

  const mainSource = readFileSync("apps/desktop-app/electron/main.ts", "utf8");
  assert.match(mainSource, /process\.argv\.includes\("--clean-start"\)/);
  assert.match(mainSource, /startup\.clean-start\.required/);
  assert.match(mainSource, /startup\.clean-start\.completed/);
  assert.match(mainSource, /startup\.clean-start\.transient-cleanup\.incomplete/);
  assert.match(mainSource, /CLEAN_START_SESSION_CLEAR_TIMEOUT_MS/);
  assert.match(mainSource, /clearStorageData\(\)/);
  assert.match(mainSource, /clearCache\(\)/);
  assert.match(mainSource, /Temiz Başlat/);

  const mainEntrySource = readFileSync("apps/desktop-app/electron/main-entry.ts", "utf8");
  assert.match(mainEntrySource, /shouldDeferPendingMaintenanceToCleanStart/);
  assert.match(mainEntrySource, /startup\.maintenance\.deferred-for-clean-start/);
  assert.match(mainEntrySource, /deferPendingMaintenance \? "" : readPendingMaintenanceKind\(\)/);

  const startDevSource = readFileSync("apps/desktop-app/scripts/start-dev.mjs", "utf8");
  assert.match(startDevSource, /const electronArgs = process\.argv\.slice\(2\)/);
  assert.match(startDevSource, /\["electron", "\.", \.\.\.electronArgs\]/);

  console.log("clean-start-smoke-ok");
} finally {
  rmSync(root, { recursive: true, force: true });
}
