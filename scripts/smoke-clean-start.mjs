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
  archiveLocalDataForCleanStart
} = require("../apps/desktop-app/dist-electron/clean-start.js");

function createCurrentSchemaFixture(filePath) {
  const database = new DatabaseSync(filePath);
  try {
    database.exec(`
      CREATE TABLE android_local_credentials (id TEXT PRIMARY KEY);
      CREATE TABLE desktop_sync_identity (id TEXT PRIMARY KEY);
      CREATE TABLE settings (
        id TEXT PRIMARY KEY,
        local_network_enabled INTEGER,
        ai_service TEXT,
        ai_last_published_at TEXT,
        google_reviews_enabled INTEGER,
        google_place_id TEXT,
        google_places_api_key_encrypted TEXT,
        google_reviews_last_published_at TEXT,
        google_reviews_publish_pending INTEGER,
        product_data_enabled INTEGER
      );
      CREATE TABLE business (
        id TEXT PRIMARY KEY,
        publish_rooms_web INTEGER,
        publish_tables_web INTEGER
      );
      CREATE TABLE tables (
        id TEXT PRIMARY KEY,
        public_description TEXT,
        public_features_json TEXT,
        smoking_policy TEXT
      );
    `);
  } finally {
    database.close();
  }
}

const root = mkdtempSync(join(tmpdir(), "ya-clean-start-"));
try {
  const missingPath = join(root, "missing.sqlite");
  assert.equal(inspectDesktopDatabaseCompatibility(missingPath).state, "fresh");

  const currentPath = join(root, "current.sqlite");
  createCurrentSchemaFixture(currentPath);
  assert.equal(inspectDesktopDatabaseCompatibility(currentPath).state, "current");

  const legacyPath = join(root, "legacy.sqlite");
  {
    const database = new DatabaseSync(legacyPath);
    try {
      database.exec("CREATE TABLE settings (id TEXT PRIMARY KEY);");
    } finally {
      database.close();
    }
  }
  const legacy = inspectDesktopDatabaseCompatibility(legacyPath);
  assert.equal(legacy.state, "incompatible");
  assert.match(legacy.reason, /Eksik tablo|Eksik alan/);

  const brokenPath = join(root, "broken.sqlite");
  writeFileSync(brokenPath, "not-a-sqlite-database");
  assert.equal(inspectDesktopDatabaseCompatibility(brokenPath).state, "unreadable");

  const dataRoot = join(root, "archive-fixture");
  mkdirSync(join(dataRoot, "assets", "products"), { recursive: true });
  const databasePath = join(dataRoot, "yardimci-asistan.sqlite");
  writeFileSync(databasePath, "legacy-db");
  writeFileSync(`${databasePath}-wal`, "legacy-wal");
  writeFileSync(`${databasePath}-shm`, "legacy-shm");
  writeFileSync(join(dataRoot, "assets", "products", "image.webp"), "asset");

  const archived = archiveLocalDataForCleanStart(
    dataRoot,
    new Date("2026-09-30T18:00:00.000Z")
  );
  assert.equal(archived.archived, true);
  assert.equal(existsSync(databasePath), false);
  assert.equal(existsSync(`${databasePath}-wal`), false);
  assert.equal(existsSync(`${databasePath}-shm`), false);
  assert.equal(existsSync(join(dataRoot, "assets")), false);
  assert.equal(existsSync(join(archived.archiveDirectory, "yardimci-asistan.sqlite")), true);
  assert.equal(existsSync(join(archived.archiveDirectory, "yardimci-asistan.sqlite-wal")), true);
  assert.equal(existsSync(join(archived.archiveDirectory, "yardimci-asistan.sqlite-shm")), true);
  assert.equal(existsSync(join(archived.archiveDirectory, "assets", "products", "image.webp")), true);

  const manifest = JSON.parse(readFileSync(join(archived.archiveDirectory, "archive.json"), "utf8"));
  assert.equal(manifest.format, "yardimci-asistan-clean-start-archive-v1");
  assert.deepEqual(
    [...manifest.movedEntries].sort(),
    ["assets", "yardimci-asistan.sqlite", "yardimci-asistan.sqlite-shm", "yardimci-asistan.sqlite-wal"].sort()
  );

  const mainSource = readFileSync("apps/desktop-app/electron/main.ts", "utf8");
  assert.match(mainSource, /process\.argv\.includes\("--clean-start"\)/);
  assert.match(mainSource, /startup\.clean-start\.required/);
  assert.match(mainSource, /startup\.clean-start\.completed/);
  assert.match(mainSource, /Temiz Başlat/);

  console.log("clean-start-smoke-ok");
} finally {
  rmSync(root, { recursive: true, force: true });
}
