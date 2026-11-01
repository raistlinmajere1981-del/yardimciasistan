import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

const repo = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const openingReference = "c19-opening-v1";

// Load current canonical source into a disposable directory; never rebuild Desktop
// or depend on potentially stale dist-electron. No domain adapters are replaced.
function loadCommerceStore(directory) {
  const cache = new Map();
  function compile(file) {
    file = resolve(repo, file);
    if (cache.has(file)) return cache.get(file);
    const output = join(directory, relative(repo, file).replace(/\.ts$/, ".js"));
    cache.set(file, output);
    const source = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText.replace(/require\("([^"]+)"\)/g, (match, id) => {
      if (id === "@yardimci-asistan/shared") return `require(${JSON.stringify(compile("packages/shared/index.ts"))})`;
      if (id.startsWith(".")) {
        const target = resolve(dirname(file), id.replace(/\.js$/, ""));
        return `require(${JSON.stringify(compile(existsSync(`${target}.ts`) ? `${target}.ts` : join(target, "index.ts")))})`;
      }
      return id.startsWith("node:") ? match : `require(${JSON.stringify(require.resolve(id))})`;
    });
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, source);
    return output;
  }
  return require(compile("apps/desktop-app/electron/commerce-store.ts"));
}

// Linux-only, offline preparation. Refuse open DBs BEFORE opening SQLite ourselves.
// This does not coordinate a concurrent Desktop launch: start Desktop only AFTER
// this command exits. Sidecars are never removed, including stale ones.
function assertOffline(databasePath) {
  if (process.platform !== "linux") throw new Error("C19 offline preparation currently requires Linux /proc.");
  for (const path of [databasePath + "-wal", databasePath + "-shm", databasePath + "-journal", join(dirname(databasePath), "SingletonLock")]) {
    try { lstatSync(path); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    throw new Error("Sandbox may be running (lock/SQLite sidecar present); preparation refused.");
  }
  for (const pid of readdirSync("/proc").filter(value => /^\d+$/.test(value))) {
    let descriptors;
    try { descriptors = readdirSync(`/proc/${pid}/fd`); }
    catch (error) { if (["ENOENT", "EACCES", "EPERM"].includes(error.code)) continue; throw error; }
    for (const fd of descriptors) {
      let target;
      try { target = readlinkSync(`/proc/${pid}/fd/${fd}`); }
      catch (error) { if (["ENOENT", "EACCES", "EPERM"].includes(error.code)) continue; throw error; }
      if (target === databasePath) throw new Error("Sandbox database is open in a process; preparation refused.");
    }
  }
}

export function prepareC19Fixture({ databasePath, businessId, offlineDisposablePilot = false }) {
  if (!offlineDisposablePilot || !databasePath || !businessId) {
    throw new Error("Require --database, --business-id and --offline-disposable-pilot; Desktop must already be stopped.");
  }
  const path = realpathSync(resolve(databasePath)); // Existing initialized DB only; never create/reset one.
  assertOffline(path);
  const compiled = mkdtempSync(join(tmpdir(), "c19-source-"));
  let db;
  try {
    const store = loadCommerceStore(compiled);
    assertOffline(path);
    db = new DatabaseSync(path);
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=0; BEGIN IMMEDIATE");
    try {
      const business = db.prepare("SELECT id,name FROM business WHERE deleted_at='' ORDER BY created_at ASC LIMIT 1").get();
      if (business?.id !== businessId || business.name !== "C19 Test Market") {
        throw new Error("Expected active C19 Test Market business and matching --business-id.");
      }
      for (const capability of ["commerce.catalog", "commerce.inventory", "commerce.sales"]) {
        if (!db.prepare("SELECT 1 FROM business_capabilities WHERE business_id=? AND capability_id=? AND is_enabled=1").get(businessId, capability)) {
          throw new Error(`Required persisted capability is disabled: ${capability}`);
        }
      }
      const now = new Date().toISOString();
      const locationId = store.resolveInventoryLocation(db, businessId, undefined, now);
      function product(column, identity, input) {
        const existing = db.prepare(`SELECT * FROM catalog_products WHERE business_id=? AND ${column}=?`).all(businessId, identity);
        if (existing.length) {
          if (existing.length !== 1 || existing[0].deleted_at || !existing[0].is_active || existing[0].name !== input.name) {
            throw new Error("C19 product identity is occupied or inactive; existing state preserved.");
          }
          return existing[0].id;
        }
        return store.saveCatalogProductInTransaction(db, { ...input, onlineSalesPublished: false }, now).id;
      }
      const productId = product("barcode", "8690000000004", {
        name: "C19 Test Item", barcode: "8690000000004", salePrice: 12.5, currency: "TRY", trackInventory: false
      });
      const stockProductId = product("sku", "C19-STOCK-ITEM", {
        name: "C19 Stock Item", sku: "C19-STOCK-ITEM", salePrice: 12.5, currency: "TRY", trackInventory: true
      });
      if (db.prepare("SELECT track_inventory FROM catalog_products WHERE id=?").get(stockProductId).track_inventory !== 1) {
        throw new Error("C19 Stock Item has inventory tracking disabled; existing state preserved.");
      }
      const hasMovement = db.prepare("SELECT 1 FROM inventory_movements WHERE business_id=? AND product_id=? AND location_id=? LIMIT 1").get(businessId, stockProductId, locationId);
      const balance = db.prepare("SELECT quantity FROM inventory_balances WHERE product_id=? AND location_id=?").get(stockProductId, locationId);
      let seeded = false;
      if (!hasMovement && !Number(balance?.quantity ?? 0)) {
        store.setInventoryCountInTransaction(db, { productId: stockProductId, locationId, countedQuantity: 20,
          referenceType: "c19_fixture", referenceId: openingReference, actorSource: "c19-fixture" }, now);
        seeded = true;
      }
      const quantity = db.prepare("SELECT quantity FROM inventory_balances WHERE product_id=? AND location_id=?").get(stockProductId, locationId)?.quantity ?? 0;
      db.exec("COMMIT");
      return { businessId, locationId, productId, stockProductId, quantity, seeded };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db?.close();
    rmSync(compiled, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const { values } = parseArgs({ options: {
      database: { type: "string" }, "business-id": { type: "string" }, "offline-disposable-pilot": { type: "boolean" }, help: { type: "boolean" }
    } });
    if (values.help) console.log("Offline Linux C19 pilot only. Desktop must be stopped; no live mode.\nnode scripts/prepare-c19-fixture.mjs --database <existing.sqlite> --business-id <id> --offline-disposable-pilot");
    else console.log(JSON.stringify(prepareC19Fixture({ databasePath: values.database, businessId: values["business-id"], offlineDisposablePilot: values["offline-disposable-pilot"] })));
  } catch (error) {
    console.error(`C19 fixture: ${error.message}`);
    process.exitCode = 1;
  }
}
