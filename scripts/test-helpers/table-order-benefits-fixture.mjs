import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { saleFixture, load } from "./market-sale-benefits-fixture.mjs";
import { capabilities, exampleRules, installRules, adjust } from "./commerce-benefits-fixture.mjs";
export { load, databaseState } from "./market-sale-benefits-fixture.mjs";
export const tables = load("table-order-service");
export const benefits = load("table-order-benefits");
const require = createRequire(import.meta.url);
export function tableFixture() {
  const f = saleFixture();
  for (const id of capabilities.expandBusinessCapabilities(["food_service.orders"])) {
    f.db.prepare("INSERT OR IGNORE INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(id);
  }
  installRules(f, exampleRules().map(rule => ({ ...rule, startsAt: 0, ...(rule.family === "coupon" ? { fixedMinor: 0, percentBps: 1000 } : {}) })));
  adjust(f);
  const original = f.authority.keys.load;
  f.authority.keys.load = (...args) => { assert.equal(f.db.isTransaction, false, "key I/O outside transaction"); return original(...args); };
  return f;
}
export function tableOrder(f, { customerId = "c1", ...context } = {}) {
  const id = `table_${f.db.prepare("SELECT COUNT(*) n FROM tables").get().n}`;
  f.db.prepare("INSERT INTO tables(id,name,current_customer_id,created_at,updated_at) VALUES (?,?,?,'fixture','fixture')").run(id, id, customerId);
  const opened = tables.openTableOrder(f.db, id, context);
  assert.equal(opened.ok, true, opened.message);
  const added = tables.addTableOrderItem(f.db, { orderId: opened.order.id, menuEntryId: "menu_p1", quantity: 1, note: "" });
  assert.equal(added.ok, true, added.message);
  return added.order;
}
export const request = (order, overrides = {}) => ({ orderId: order.id, operationKey: `close:${order.id}`, paymentMethod: "cash", requestedPointsMinor: 10000, ...overrides });
export const command = (input, preview) => ({ orderId: input.orderId, status: "paid", operationKey: input.operationKey, paymentMethod: input.paymentMethod,
  benefits: { requestedPointsMinor: input.requestedPointsMinor, expectedQuote: preview.quote, previewToken: preview.previewToken, paymentAmountMinor: preview.quote.payableMinor,
    ...(input.couponCode === undefined ? {} : { couponCode: input.couponCode }) } });
export const preview = (f, input) => benefits.previewTableOrderBenefits(f.db, input, f.authority);
export const complete = (f, input) => benefits.settleTableOrderBenefits(f.db, input, f.authority);
export function mockedTableModules(electron) {
  const original = Module._load;
  Module._load = function (id, ...args) { return id === require.resolve("electron") ? electron : original.call(this, id, ...args); };
  try { return { ipc: load("ipc/table-order-ipc"), roomTableIpc: load("ipc/room-table-ipc"), folioIpc: load("room-folio-ipc"), preload: () => {
    const previous = Module._load;
    Module._load = function (id, ...args) { return id === require.resolve("electron") ? electron : previous.call(this, id, ...args); };
    try { return load("preload"); } finally { Module._load = previous; }
  } }; } finally { Module._load = original; }
}
