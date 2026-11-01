import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { fixture, engine, rules, points, capabilities, CommerceBenefitsStore, secretKey, NOW } from "./commerce-benefits-fixture.mjs";

const require = createRequire(import.meta.url);
/** Executes current source in isolation. All persistence uses the real canonical SQLite schema. */
export function managementModules(electron = {}) {
  const cache = new Map([
    ["commerce-benefits-engine", engine], ["commerce-benefits-rules", rules], ["commerce-benefits-points", points],
    ["commerce-benefits-store", { CommerceBenefitsStore }],
  ]);
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const exports = {}; cache.set(name, exports);
    const file = resolve("apps/desktop-app/electron", `${name}.ts`);
    const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(source, { exports, Buffer, Error, URL, process, Uint8Array, require: id => {
      if (id === "electron") return electron;
      if (name === "database") return id === "./commerce-benefits-management" ? load("commerce-benefits-management") : {};
      if (id.startsWith(".")) return load(id.replace(/^\.\.?\//, "").replace(/\.js$/, ""));
      return require(id);
    } }, { filename: file });
    return exports;
  }
  return { load };
}
export function managementFixture(options = {}) {
  const f = fixture(), modules = managementModules(options.electron);
  const state = { locked: false, revoked: false, role: "desktop_owner", secure: true, now: NOW, keyLoads: 0 };
  const keys = { available: () => state.secure, load: () => {
    state.keyLoads++;
    if (!state.secure) throw new engine.CommerceBenefitsError("BENEFITS_SECURE_STORAGE_UNAVAILABLE");
    return secretKey;
  } };
  const actor = { id: "local-desktop-owner", get role() { return state.role; }, assertAuthorized: () => {
    if (state.locked || state.revoked) throw new engine.CommerceBenefitsError("BENEFITS_STAFF_REQUIRED");
  } };
  const { CommerceBenefitsManagement } = modules.load("commerce-benefits-management");
  const create = database => new CommerceBenefitsManagement(database, keys, actor, () => state.now);
  return { ...f, modules, state, keys, actor, create, service: create(f.db) };
}

/** Run the real static navigation contribution predicates without a browser/server. */
export function benefitsNavigationModule() {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(source, { exports, require: id => id === "@yardimci-asistan/shared" ? capabilities
      : id.startsWith(".") ? load(resolve(dirname(file), `${id}.ts`)) : require(id) }, { filename: file });
    return exports;
  }
  return load(resolve("apps/desktop-app/src/app/navigation.ts"));
}
