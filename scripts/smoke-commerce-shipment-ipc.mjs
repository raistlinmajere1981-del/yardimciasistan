import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const { CommerceShipmentDomainError } = require("../apps/desktop-app/dist-electron/commerce-shipment-store.js");
const source = (file) => readFileSync(new URL(`../apps/desktop-app/dist-electron/${file}.js`, import.meta.url), "utf8");
// Load the actual commerce rejection classifier without registering unrelated handlers.
const commerceModule = { exports: {} };
runInNewContext(source("commerce-ipc"), {
  exports: commerceModule.exports,
  require: (name) => name === "./market-sale-full-refund" || name === "./commerce-benefits-engine"
    ? require(`../apps/desktop-app/dist-electron/${name.slice(2)}.js`) : {}, Error
});
const handlers = new Map();
const logs = [];
const shipmentModule = { exports: {} };
runInNewContext(source("ipc/commerce-shipment-ipc"), {
  exports: shipmentModule.exports,
  require: (name) => {
    if (name === "electron") return { ipcMain: { handle: (channel, fn) => { assert.ok(!handlers.has(channel)); handlers.set(channel, fn); } } };
    if (name === "../commerce-shipment-store") return { CommerceShipmentDomainError };
    if (name === "../commerce-ipc") return commerceModule.exports;
    if (name === "../desktop-logger") return { desktopLog: { warn: (record) => logs.push(record) } };
    throw new Error(`Unexpected import: ${name}`);
  }
});
const calls = [];
const changed = [];
let locked = false, failure;
const shipment = { id: "shipment", orderId: "order", status: "draft" };
const database = {
  listShipmentsForOrder: (id) => { calls.push(["list", id]); if (failure) throw failure; return [shipment]; },
  createShipmentForOrder: (id) => { calls.push(["create", id]); if (failure) throw failure; return shipment; },
  updateShipmentStatus: (input) => { calls.push(["update", input]); if (failure) throw failure; return { ...shipment, status: input.status }; }
};
shipmentModule.exports.registerCommerceShipmentIpcHandlers({
  getDatabase: () => database,
  assertUnlocked: () => { if (locked) throw new Error("Session locked"); },
  onChanged: (orderId) => changed.push(orderId)
});
const invoke = (channel, ...args) => handlers.get(channel)({}, ...args);
assert.deepEqual([...handlers.keys()], ["commerce:shipment:listForOrder", "commerce:shipment:create", "commerce:shipment:updateStatus"]);
assert.deepEqual(invoke("commerce:shipment:listForOrder", "order"), [shipment]);
assert.equal(invoke("commerce:shipment:create", "order").value, shipment);
const input = { shipmentId: "shipment", status: "ready" };
assert.equal(invoke("commerce:shipment:updateStatus", input).value.status, "ready");
assert.equal(calls.at(-1)[1], input, "IPC routes the original input to the facade");
assert.deepEqual(changed, ["order", "order"]);
for (const channel of handlers.keys()) {
  locked = true;
  const before = calls.length;
  assert.throws(() => invoke(channel, input), /Session locked/);
  assert.equal(calls.length, before, "session gate precedes facade calls");
}
locked = false;
failure = new CommerceShipmentDomainError("Geçersiz gönderi durum geçişi.");
const rejection = invoke("commerce:shipment:updateStatus", input);
assert.equal(rejection.ok, false);
assert.equal(rejection.expected, true);
assert.equal(rejection.code, "invalid_shipment");
assert.equal(rejection.message, failure.message);
assert.equal(logs.at(-1).event, "commerce-shipment.domain.rejected");
assert.deepEqual(changed, ["order", "order"]);
failure = new Error("Sipariş yönetimi bu işletmede etkin değil.");
assert.equal(invoke("commerce:shipment:create", "order").code, "invalid_order");
failure = new Error("SQLITE_BUSY");
assert.throws(() => invoke("commerce:shipment:create", "order"), /SQLITE_BUSY/);

let bridge;
const listeners = new Map();
let response = rejection;
const bridgeCalls = [];
runInNewContext(source("preload"), {
  exports: {}, require: (name) => {
    assert.equal(name, "electron");
    return { contextBridge: { exposeInMainWorld: (_key, value) => { bridge = value; } }, webFrame: {}, ipcRenderer: {
      on: (channel, fn) => { const set = listeners.get(channel) ?? new Set(); set.add(fn); listeners.set(channel, set); },
      removeListener: (channel, fn) => listeners.get(channel)?.delete(fn),
      invoke: async (channel, ...args) => {
        if (channel === "appLock:getStatus") return { locked: false };
        bridgeCalls.push([channel, ...args]); return response;
      }
    } };
  }
});
await assert.rejects(bridge.commerce.updateShipmentStatus(input), (error) => error.name === "CommerceDomainError" && error.message === rejection.message);
response = { ok: true, value: shipment };
assert.equal(await bridge.commerce.createShipmentForOrder("order"), shipment);
response = [shipment];
assert.equal((await bridge.commerce.listShipmentsForOrder("order"))[0], shipment);
assert.deepEqual(bridgeCalls.map((call) => call[0]), ["commerce:shipment:updateStatus", "commerce:shipment:create", "commerce:shipment:listForOrder"]);
const notifications = [];
const unsubscribe = bridge.commerce.onShipmentsChanged((id) => notifications.push(id));
for (const fn of listeners.get("commerce:shipmentsChanged")) fn({}, "order");
assert.deepEqual(notifications, ["order"]);
unsubscribe(); unsubscribe();
assert.equal(listeners.get("commerce:shipmentsChanged").size, 0);
console.log("commerce-shipment-ipc-smoke-ok");
