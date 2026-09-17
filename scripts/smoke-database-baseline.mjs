import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { once } from "node:events";
import { Worker } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { SyncCoordinator } = require("../apps/desktop-app/dist-electron/sync-coordinator.js");
const syncClientIdPattern = /^desktop-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
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
  const clientId = firstDatabase.getSyncRuntimeStatus().clientId;
  assert.match(clientId, syncClientIdPattern, "Fresh initialization must persist a local UUID before setup.");
  firstDatabase.initialize();
  assert.equal(firstDatabase.getSyncRuntimeStatus().clientId, clientId);
  const freshRaw = new DatabaseSync(firstDatabase.databasePath);
  assert.equal(freshRaw.prepare("SELECT COUNT(*) AS count FROM settings").get().count, 0);
  freshRaw.close();
  assertCurrentBaseline(firstDatabase, { setupRequired: true });
  firstDatabase.close();

  const reopenedDatabase = openDatabase(cleanUserDataPath, cleanBackupPath);
  reopenedDatabase.initialize();
  assert.equal(reopenedDatabase.getSyncRuntimeStatus().clientId, clientId);
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
  assert.equal(selectedMarketDatabase.getSyncRuntimeStatus().clientId, clientId);
  await assertSyncReachesTransport(selectedMarketDatabase);
  assertCurrentBaseline(selectedMarketDatabase, { setupRequired: false, market: true });
  selectedMarketDatabase.close();

  const afterSetupRestart = openDatabase(cleanUserDataPath, cleanBackupPath);
  afterSetupRestart.initialize();
  assert.equal(afterSetupRestart.getSyncRuntimeStatus().clientId, clientId);
  afterSetupRestart.close();

  const sourceDatabase = new DatabaseSync(join(cleanUserDataPath, "yardimci-asistan.sqlite"));
  sourceDatabase.exec(`VACUUM INTO '${sqlString(backupFilePath)}'`);
  sourceDatabase.close();
  assertCurrentDatabaseFile(backupFilePath, { market: true });
  assertAlreadyInitializedBaseline(backupFilePath, "", undefined);
  assertAlreadyInitializedBaseline(backupFilePath, clientId, clientId);

  mkdirSync(restoredUserDataPath, { recursive: true });
  copyFileSync(backupFilePath, join(restoredUserDataPath, "yardimci-asistan.sqlite"));
  const restoredDatabase = openDatabase(restoredUserDataPath, restoredBackupPath);
  restoredDatabase.initialize();
  assert.equal(restoredDatabase.getSyncRuntimeStatus().clientId, clientId);
  assertCurrentBaseline(restoredDatabase, { setupRequired: false, market: true });
  restoredDatabase.close();

  const secondDatabase = openDatabase(join(tempRoot, "second-fresh"), cleanBackupPath);
  try {
    secondDatabase.initialize();
    const secondClientId = secondDatabase.getSyncRuntimeStatus().clientId;
    assert.match(secondClientId, syncClientIdPattern);
    assert.notEqual(secondClientId, clientId);
  } finally {
    secondDatabase.close();
  }

  const concurrentDataPath = join(tempRoot, "concurrent-fresh");
  const concurrentIds = await initializeConcurrently(concurrentDataPath);
  assert.equal(new Set(concurrentIds).size, 1, "Concurrent first startup must persist exactly one identity.");
  assert.match(concurrentIds[0], syncClientIdPattern);
  assert.notEqual(concurrentIds[0], clientId);
  assert.deepEqual(await initializeConcurrently(concurrentDataPath), concurrentIds);

  createInvalidDatabase();
  let invalidDatabase;
  assert.throws(() => {
    invalidDatabase = openDatabase(invalidUserDataPath, invalidBackupPath);
    invalidDatabase.initialize();
  }, /baseline|migration|eski|temiz kurulum/i, "Eski migration işaretli veritabanı reddedilmeli.");
  invalidDatabase?.close();

  console.log("database-baseline-smoke-ok: stable local UUID, concurrent startup, Market setup, offline transport, current baseline identity initialization, backup restore and legacy database rejection verified");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function openDatabase(userDataPath, backupPath) {
  mkdirSync(userDataPath, { recursive: true });
  return new DesktopDatabase({
    appPath,
    userDataPath,
    backupPath
  });
}

async function assertSyncReachesTransport(database) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    throw new TypeError("baseline smoke: offline");
  };
  try {
    const setup = database.getSetupData();
    const coordinator = new SyncCoordinator({
      database,
      getSyncConfig: () => ({ baseUrl: setup.webModuleUrl, syncSecret: setup.syncSecret }),
      createAndroidSnapshot: () => { throw new Error("Offline smoke must stop at capabilities."); },
      onDashboardChanged: () => {},
      onStatusChanged: () => {}
    });
    const result = await coordinator.runNow();
    assert.equal(result.ok, false);
    assert.notEqual(result.message, "Masaüstü senkron kimliği oluşturulamadı.");
    assert.ok(calls.length > 0, "A fresh Market database must reach the transport even while offline.");
    assert.ok(calls.every((call) => call.body.action === "capabilities"));
    assert.ok(database.getSyncRuntimeStatus().lastAttemptAt);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function assertCurrentBaseline(database, options = {}) {
  const raw = new DatabaseSync(database.databasePath);
  try {
    assertCurrentDatabase(raw, options);
    const identities = raw.prepare("SELECT id, client_id FROM desktop_sync_identity").all();
    assert.equal(identities.length, 1);
    assert.equal(identities[0].id, "primary");
    assert.match(identities[0].client_id, syncClientIdPattern);
    assert.equal(identities[0].client_id, database.getSyncRuntimeStatus().clientId);
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

function assertAlreadyInitializedBaseline(sourcePath, storedClientId, expectedClientId) {
  const userDataPath = join(tempRoot, storedClientId ? "existing-identity" : "missing-identity");
  mkdirSync(userDataPath);
  const databasePath = join(userDataPath, "yardimci-asistan.sqlite");
  copyFileSync(sourcePath, databasePath);
  const raw = new DatabaseSync(databasePath);
  // Model the current, already-applied 001_baseline.sql before this local identity fix.
  raw.exec("DROP TABLE desktop_sync_identity");
  raw.prepare("UPDATE settings SET sync_client_id = ?").run(storedClientId);
  raw.close();
  const database = openDatabase(userDataPath, cleanBackupPath);
  try {
    database.initialize();
    const clientId = database.getSyncRuntimeStatus().clientId;
    assert.match(clientId, syncClientIdPattern);
    if (expectedClientId) assert.equal(clientId, expectedClientId);
    assertCurrentBaseline(database, { setupRequired: false, market: true });
    database.initialize();
    assert.equal(database.getSyncRuntimeStatus().clientId, clientId);
  } finally {
    database.close();
  }
}

async function initializeConcurrently(userDataPath) {
  const workers = Array.from({ length: 3 }, () => new Worker(
    new URL("./fixtures/initialize-desktop-database.mjs", import.meta.url),
    { workerData: { appPath, userDataPath, backupPath: cleanBackupPath } }
  ));
  try {
    await Promise.all(workers.map((worker) => once(worker, "message")));
    const identities = workers.map((worker) => once(worker, "message"));
    const exits = workers.map((worker) => once(worker, "exit"));
    for (const worker of workers) worker.postMessage("initialize");
    const [results, exitCodes] = await Promise.all([Promise.all(identities), Promise.all(exits)]);
    assert.ok(exitCodes.every(([code]) => code === 0));
    return results.map(([clientId]) => clientId);
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
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
