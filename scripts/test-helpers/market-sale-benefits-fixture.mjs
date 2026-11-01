import Module, { createRequire } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { fixture, secretKey } from "./commerce-benefits-fixture.mjs";

// Compile the actual synchronous sale dependency graph, including current shared
// source, into /tmp. No stub price, payment, finance, stock or settlement adapters.
const compiled = mkdtempSync(join(tmpdir(), "market-benefits-source-"));
const require = createRequire(import.meta.url);
const cache = new Map();
function compile(file) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file);
  const output = join(compiled, relative(process.cwd(), file).replace(/\.ts$/, ".js"));
  cache.set(file, output);
  const js = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText.replace(/require\("([^"]+)"\)/g, (match, id) => {
    if (id === "@yardimci-asistan/shared") return `require(${JSON.stringify(compile("packages/shared/index.ts"))})`;
    if (id === "@yardimci-asistan/sync-core") return `require(${JSON.stringify(compile("packages/sync-core/index.ts"))})`;
    if (id.startsWith(".")) {
      const target = resolve(dirname(file), id.replace(/\.js$/, ""));
      const source = existsSync(`${target}.ts`) ? `${target}.ts` : join(target, "index.ts");
      return `require(${JSON.stringify(compile(source))})`;
    }
    return id.startsWith("node:") ? match : `require(${JSON.stringify(require.resolve(id))})`;
  });
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, js);
  return output;
}
export const load = name => require(compile(`apps/desktop-app/electron/${name}.ts`));
export const { completeMarketSale, completeMarketSaleInTransaction } = load("market-sale-operation");
export const { marketSaleBenefitsPorts } = load("market-sale-benefits");
export const { synchronizeFinanceSourceInTransaction } = load("finance");
export const { withCommerceBenefitsTransaction } = load("commerce-benefits-rules");
export const { CommerceBenefitsStore } = load("commerce-benefits-store");
export const { calculateCommerceBenefits } = load("commerce-benefits-engine");
process.on("exit", () => rmSync(compiled, { recursive: true, force: true }));

export function saleFixture() {
  const f = fixture();
  f.db.prepare("INSERT INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1','commerce.inventory','fixture','fixture')").run();
  f.db.prepare("INSERT INTO inventory_locations(id,business_id,name,is_primary,created_at,updated_at) VALUES ('loc','b1','Primary',1,'fixture','fixture')").run();
  f.db.prepare("INSERT INTO inventory_balances(product_id,location_id,quantity,updated_at) VALUES ('p1','loc',50,'fixture')").run();
  f.db.prepare("INSERT INTO menu_categories(id,name,created_at,updated_at) VALUES ('menu_category','Fixture','fixture','fixture')").run();
  f.db.prepare("INSERT INTO menu_product_entries(id,product_id,category_id,created_at,updated_at) VALUES ('menu_p1','p1','menu_category','fixture','fixture')").run();
  const state = { authorized: true, keyLoads: 0 };
  const authority = { actor: { id: "local-desktop-owner", role: "desktop_owner", assertAuthorized() {
    if (!state.authorized) throw Object.assign(new Error("fixture authority revoked"), { code: "BENEFITS_STAFF_REQUIRED" });
  } }, keys: { available: () => true, load() { state.keyLoads++; return secretKey; } } };
  return { ...f, authority, state };
}

export function databaseState(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return tables.map(({ name }) => [name, db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]);
}

/** Load the actual IPC registration with only Electron's transport/keystore replaced. */
export function marketSaleIpcModules(electron) {
  function loadMocked(name) {
    const original = Module._load;
    Module._load = function (id, ...args) {
      if (id === require.resolve("electron")) return electron;
      return original.call(this, id, ...args);
    };
    try { return load(name); }
    finally { Module._load = original; }
  }
  return { ipc: loadMocked("commerce-ipc"), failures: loadMocked("ipc/commerce-benefits-ipc"), preload: () => loadMocked("preload") };
}
