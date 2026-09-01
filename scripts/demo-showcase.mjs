import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const root = process.cwd();
const desktopAppPath = join(root, "apps", "desktop-app");
const databaseModulePath = join(desktopAppPath, "dist-electron", "database.js");
const command = process.argv[2] ?? "print";
const profile = readArg("--profile") ?? "pension-restaurant";
const dataDir = resolve(
  readArg("--data-dir")
    ?? process.env.YA_DESKTOP_DATA_DIR
    ?? join(root, ".demo-runtime", profile)
);

const profileFiles = {
  "pension-restaurant": join(desktopAppPath, "db", "demo-profiles", "showcase-pension-restaurant.sql")
};

const profileFile = profileFiles[profile];
if (!profileFile) {
  fail(`Desteklenmeyen tanıtım profili: ${profile}`);
}

if (command === "print") {
  console.log(`showcase-profile: ${profile}`);
  console.log(`showcase-data-dir: ${dataDir}`);
  console.log(`showcase-database: ${join(dataDir, "yardimci-asistan.sqlite")}`);
  process.exit(0);
}

if (command !== "prepare" && command !== "reset") {
  fail("Kullanım: node scripts/demo-showcase.mjs [prepare|reset|print] [--profile pension-restaurant] [--data-dir <klasör>]");
}

if (!existsSync(databaseModulePath)) {
  fail([
    "Masaüstü build çıktısı bulunamadı.",
    "Önce şu komutu çalıştırın:",
    "npm run build:packages && npm run build -w @yardimci-asistan/desktop-app"
  ].join("\n"));
}

resetDataDirectory(dataDir);
mkdirSync(dataDir, { recursive: true });

const { DesktopDatabase } = require(databaseModulePath);
const database = new DesktopDatabase({
  appPath: desktopAppPath,
  userDataPath: dataDir,
  demoProfile: null
});

try {
  database.initialize();
} finally {
  database.close();
}

const databasePath = join(dataDir, "yardimci-asistan.sqlite");
const sqlite = new DatabaseSync(databasePath);
try {
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(readFileSync(profileFile, "utf8"));
  assert.equal(String(scalar(sqlite, "PRAGMA integrity_check")), "ok");

  const summary = {
    business: Number(scalar(sqlite, "SELECT COUNT(*) FROM business WHERE deleted_at = ''")),
    rooms: Number(scalar(sqlite, "SELECT COUNT(*) FROM rooms WHERE deleted_at = ''")),
    tables: Number(scalar(sqlite, "SELECT COUNT(*) FROM tables WHERE deleted_at = ''")),
    menuCategories: Number(scalar(sqlite, "SELECT COUNT(*) FROM menu_categories WHERE deleted_at = ''")),
    menuItems: Number(scalar(sqlite, "SELECT COUNT(*) FROM menu_items WHERE deleted_at = ''")),
    stockTracked: Number(scalar(sqlite, "SELECT COUNT(*) FROM menu_items WHERE deleted_at = '' AND stock_quantity IS NOT NULL")),
    customers: Number(scalar(sqlite, "SELECT COUNT(*) FROM customers WHERE deleted_at = ''")),
    reservations: Number(scalar(sqlite, "SELECT COUNT(*) FROM reservations WHERE deleted_at = ''")),
    tableOrders: Number(scalar(sqlite, "SELECT COUNT(*) FROM table_orders WHERE deleted_at = ''"))
  };

  assert.deepEqual(summary, {
    business: 1,
    rooms: 5,
    tables: 6,
    menuCategories: 3,
    menuItems: 9,
    stockTracked: 9,
    customers: 0,
    reservations: 0,
    tableOrders: 0
  });

  console.log(`showcase-${command}-ok: ${profile}`);
  console.log(`data-dir: ${dataDir}`);
  console.log(`inventory: ${summary.rooms} rooms, ${summary.tables} tables, ${summary.menuItems} menu items`);
  console.log("operations: customers=0 reservations=0 table-orders=0");
  console.log("launch with the same YA_DESKTOP_DATA_DIR to use this isolated showcase database");
} finally {
  sqlite.close();
}

function resetDataDirectory(directory) {
  for (const file of [
    "yardimci-asistan.sqlite",
    "yardimci-asistan.sqlite-wal",
    "yardimci-asistan.sqlite-shm",
    "yardimci-asistan.sqlite-journal"
  ]) {
    rmSync(join(directory, file), { force: true });
  }
}

function scalar(database, sql) {
  const row = database.prepare(sql).get();
  assert.ok(row, `Sorgu sonuç döndürmedi: ${sql}`);
  return Object.values(row)[0];
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    fail(`${name} için bir değer gerekli.`);
  }
  return value;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
