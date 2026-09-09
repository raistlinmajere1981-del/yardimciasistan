import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const repoRoot = process.cwd();
const appPath = join(repoRoot, "apps", "desktop-app");
const migrationPath = join(appPath, "db", "migrations");
const tempRoot = mkdtempSync(join(tmpdir(), "yardimci-database-baseline-"));
const cleanUserDataPath = join(tempRoot, "clean-user-data");
const cleanBackupPath = join(tempRoot, "clean-backups");
const restoredUserDataPath = join(tempRoot, "restored-user-data");
const restoredBackupPath = join(tempRoot, "restored-backups");
const invalidUserDataPath = join(tempRoot, "invalid-user-data");
const invalidBackupPath = join(tempRoot, "invalid-backups");
const backupFilePath = join(tempRoot, "current-baseline.sqlite");

try {
  assert.deepEqual(
    readdirSync(migrationPath).filter((file) => file.endsWith(".sql")),
    ["001_baseline.sql"],
    "Desktop migration klasörü tek canonical baseline taşımalı."
  );

  const firstDatabase = openDatabase(cleanUserDataPath, cleanBackupPath);
  firstDatabase.initialize();
  assertCurrentBaseline(firstDatabase, { setupRequired: true });
  firstDatabase.close();

  const reopenedDatabase = openDatabase(cleanUserDataPath, cleanBackupPath);
  reopenedDatabase.initialize();
  assertCurrentBaseline(reopenedDatabase, { setupRequired: true });
  reopenedDatabase.close();

  const selectedMarketDatabase = openDatabase(cleanUserDataPath, cleanBackupPath);
  const setupResult = selectedMarketDatabase.saveInitialSetup({
    businessName: "Smoke Market",
    profileId: "market",
    phone: "05551112233",
    whatsapp: "05551112233",
    email: "market@example.test",
    address: "Smoke adresi",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "baseline-smoke-secret-12345",
    autoSyncEnabled: true,
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
    servicePreferences: { whatsapp: false, android: true },
    initialCounts: { rooms: 0, tables: 0 },
    tableCategories: []
  });
  assert.equal(setupResult.ok, true, setupResult.ok ? "" : setupResult.message);
  assert.equal(selectedMarketDatabase.getSetupData().profileId, "market");
  assertCurrentBaseline(selectedMarketDatabase, { setupRequired: false, market: true });
  selectedMarketDatabase.close();

  const sourceDatabase = new DatabaseSync(join(cleanUserDataPath, "yardimci-asistan.sqlite"));
  sourceDatabase.exec(`VACUUM INTO '${sqlString(backupFilePath)}'`);
  sourceDatabase.close();
  assertCurrentDatabaseFile(backupFilePath, { market: true });

  mkdirSync(restoredUserDataPath, { recursive: true });
  copyFileSync(backupFilePath, join(restoredUserDataPath, "yardimci-asistan.sqlite"));
  const restoredDatabase = openDatabase(restoredUserDataPath, restoredBackupPath);
  restoredDatabase.initialize();
  assertCurrentBaseline(restoredDatabase, { setupRequired: false, market: true });
  restoredDatabase.close();

  createInvalidDatabase();
  let invalidDatabase;
  assert.throws(() => {
    invalidDatabase = openDatabase(invalidUserDataPath, invalidBackupPath);
    invalidDatabase.initialize();
  }, /baseline|migration|eski|temiz kurulum/i, "Eski migration işaretli veritabanı reddedilmeli.");
  invalidDatabase?.close();

  console.log("database-baseline-smoke-ok: single baseline, idempotent reopen, market clean install, current backup restore and legacy database rejection verified");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function openDatabase(userDataPath, backupPath) {
  mkdirSync(userDataPath, { recursive: true });
  return new DesktopDatabase({
    appPath,
    userDataPath,
    backupPath,
    demoProfile: null
  });
}

function assertCurrentBaseline(database, options = {}) {
  const raw = new DatabaseSync(database.databasePath);
  try {
    assertCurrentDatabase(raw, options);
  } finally {
    raw.close();
  }

  const setupData = database.getSetupData();
  assert.equal(setupData.setupRequired, options.setupRequired);
  if (options.market) {
    assert.equal(setupData.profileId, "market");
    const enabled = new Set(database.getEnabledBusinessCapabilities());
    assert.equal([...enabled].some((capability) => capability.startsWith("accommodation.")), false);
    assert.equal([...enabled].some((capability) => capability.startsWith("food_service.")), false);
    assert.ok(enabled.has("commerce.catalog"));
    assert.ok(enabled.has("commerce.sales"));
    assert.ok(enabled.has("retail.barcode"));
  }
}

function assertCurrentDatabase(database, options = {}) {
  const migrationRows = database.prepare("SELECT id FROM schema_migrations ORDER BY id").all();
  assert.deepEqual(migrationRows.map((row) => row.id), ["001_baseline.sql"]);
  assert.equal(database.prepare("PRAGMA quick_check").get().quick_check, "ok");
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);

  const businessColumns = tableColumns(database, "business");
  const settingsColumns = tableColumns(database, "settings");
  assert.ok(businessColumns.has("profile_id"));
  for (const column of ["business_type", "modules_json"]) {
    assert.equal(businessColumns.has(column), false);
  }
  for (const column of ["rooms_enabled", "tables_enabled", "qr_menu_enabled", "ai_enabled", "whatsapp_enabled", "android_enabled"]) {
    assert.equal(settingsColumns.has(column), false);
  }

  if (options.market) {
    const business = database.prepare("SELECT profile_id FROM business WHERE deleted_at = '' LIMIT 1").get();
    assert.equal(business?.profile_id, "market");
    assert.ok(database.prepare("SELECT 1 FROM business_capabilities WHERE capability_id = 'retail.barcode' AND is_enabled = 1").get());
  }
}

function assertCurrentDatabaseFile(filePath, options = {}) {
  const database = new DatabaseSync(filePath);
  try {
    assertCurrentDatabase(database, options);
  } finally {
    database.close();
  }
}

function createInvalidDatabase() {
  mkdirSync(invalidUserDataPath, { recursive: true });
  const database = new DatabaseSync(join(invalidUserDataPath, "yardimci-asistan.sqlite"));
  database.exec(`
    CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE business (id TEXT PRIMARY KEY, deleted_at TEXT NOT NULL DEFAULT '');
    INSERT INTO schema_migrations (id, applied_at) VALUES ('039_customer_credit_ledger.sql', '2026-09-09T00:00:00.000Z');
  `);
  database.close();
}

function tableColumns(database, table) {
  return new Set(database.prepare(`PRAGMA table_info('${table}')`).all().map((row) => String(row.name)));
}

function sqlString(value) {
  return value.replaceAll("'", "''");
}
