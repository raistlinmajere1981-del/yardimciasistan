import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const shared = require("../packages/shared/dist/index.js");
const { BUSINESS_CAPABILITIES: C } = shared;
const handlers = new Map(), calls = [], gates = [];
const input = { importId: "stock_import_ipc_smoke", imageHash: "a".repeat(64), lines: [] };
const analyzed = { ok: true }, applied = { ok: true }, finalized = { ...applied, finalized: true };
const database = { applyStockImageImport: value => { calls.push(["apply", value]); return applied; } };
const module = { exports: {} };
runInNewContext(readFileSync(new URL("../apps/desktop-app/dist-electron/ipc/image-analysis-ipc.js", import.meta.url), "utf8"), {
  exports: module.exports,
  require: name => {
    if (name === "electron") return { ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } };
    if (name === "@yardimci-asistan/shared") return shared;
    if (name === "../image-analysis-service") return {
      analyzeDesktopStockImage: (db, value) => { assert.equal(db, database); calls.push(["analyze", value]); return analyzed; },
      cancelDesktopStockImageAnalysis: (db, value) => { assert.equal(db, database); calls.push(["cancel", value]); return true; },
      parseStockImageApplyInput: value => { calls.push(["parse", value]); return value === input ? input : null; },
      analyzeDesktopIdentityImage: (db, value) => { assert.equal(db, database); calls.push(["identity", value]); return analyzed; }
    };
    throw new Error(`Unexpected import: ${name}`);
  }
});
let locked = false;
// Retail/wholesale stock operations have no FOOD_MENU capability.
let enabled = new Set([C.AI, C.INVENTORY, C.CATALOG]);
module.exports.registerImageAnalysisIpcHandlers({
  getDatabase: () => { calls.push(["database"]); return database; },
  assertUnlocked: () => { gates.push("unlocked"); if (locked) throw new Error("Session locked"); },
  assertCapability: (capability, message) => { gates.push(capability); if (!enabled.has(capability)) throw new Error(message); },
  finalizeStockImageApply: result => { assert.equal(result, applied); calls.push(["finalize"]); return finalized; }
});
const invoke = (channel, value = input) => handlers.get(channel)({}, value);
for (const [channel, expected, operation] of [
  ["stockImage:analyze", analyzed, "analyze"],
  ["stockImage:cancel", true, "cancel"],
  ["stockImage:apply", finalized, "apply"]
]) {
  calls.length = gates.length = 0;
  const value = channel === "stockImage:cancel" ? input.importId : input;
  assert.equal(await invoke(channel, value), expected);
  assert.deepEqual(gates, ["unlocked", C.AI, C.INVENTORY]);
  assert.equal(calls.find(call => call[0] === operation)[1], value, "original input reaches the canonical owner");
  for (const [missing, message] of [[C.AI, /AI stok analizi/], [C.INVENTORY, /Stok yönetimi/]]) {
    enabled.delete(missing); calls.length = gates.length = 0;
    await assert.rejects(async () => invoke(channel), message);
    assert.equal(calls.length, 0, "denied operations never parse, analyze or write");
    assert.deepEqual(gates, missing === C.AI ? ["unlocked", C.AI] : ["unlocked", C.AI, C.INVENTORY]);
    enabled.add(missing);
  }
  locked = true; calls.length = gates.length = 0;
  await assert.rejects(async () => invoke(channel), /Session locked/);
  assert.deepEqual(gates, ["unlocked"]); assert.equal(calls.length, 0);
  locked = false;
}
assert.equal(invoke("stockImage:apply", null).ok, false, "invalid drafts stay rejected");
enabled = new Set([C.AI, C.CUSTOMERS]);
gates.length = 0;
assert.equal(await invoke("customer:analyzeIdentityImage"), analyzed);
assert.deepEqual(gates, ["unlocked", C.CUSTOMERS, C.AI]);
for (const missing of [C.CUSTOMERS, C.AI]) {
  enabled.delete(missing); calls.length = 0;
  await assert.rejects(async () => invoke("customer:analyzeIdentityImage"));
  assert.equal(calls.length, 0);
  enabled.add(missing);
}
locked = true; gates.length = calls.length = 0;
await assert.rejects(async () => invoke("customer:analyzeIdentityImage"), /Session locked/);
assert.deepEqual(gates, ["unlocked"]); assert.equal(calls.length, 0);
console.log("stock-image-ipc-smoke-ok: stock delegation without FOOD_MENU, lock/AI/inventory rejection and identity gates");
