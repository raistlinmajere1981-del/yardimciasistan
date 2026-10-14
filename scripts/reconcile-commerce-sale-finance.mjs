#!/usr/bin/env node
import { statSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute } from "node:path";
import { DatabaseSync } from "node:sqlite";

const args = process.argv.slice(2);
const usage = "Kullanım: node scripts/reconcile-commerce-sale-finance.mjs /mutlak/yol/desktop.sqlite --apply";
if (args.length === 1 && args[0] === "--help") {
  console.log(usage);
} else {
  let db;
  try {
    const [databasePath, mode] = args;
    if (args.length !== 2 || mode !== "--apply") throw new Error(usage);
    if (!isAbsolute(databasePath) || !statSync(databasePath).isFile()) {
      throw new Error("Mevcut veritabanı dosyasının mutlak yolu gerekli.");
    }
    const require = createRequire(import.meta.url);
    const { reconcileMissingCommerceSaleFinanceInTransaction } = require("../apps/desktop-app/dist-electron/finance.js");
    db = new DatabaseSync(databasePath);
    db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE");
    try {
      const result = reconcileMissingCommerceSaleFinanceInTransaction(db);
      db.exec("COMMIT");
      console.log(`Tamamlanan eksik satış-finans bağlantısı: ${result.reconciledCount}`);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    db?.close();
  }
}
