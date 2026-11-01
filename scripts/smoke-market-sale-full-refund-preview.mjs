import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { saleFixture, databaseState, completeMarketSale, completeMarketSaleInTransaction, withCommerceBenefitsTransaction, load, marketSaleIpcModules } from "./test-helpers/market-sale-benefits-fixture.mjs";
import { exampleRules, installRules, adjust, capabilities } from "./test-helpers/commerce-benefits-fixture.mjs";
const { getFullRefundMarketSalePreview: preview, fullRefundMarketSale } = load("market-sale-full-refund");
const { previewMarketSaleBenefits } = load("market-sale-benefits");
const use = t => { const f = saleFixture(); t.after(() => f.close()); return f; };
const legacy = (f, operationId = "original_sale") => completeMarketSale(f.path, { settlement: "paid", operationId,
  paymentMethod: "cash", items: [{ productId: "p1", quantity: 1 }], locationId: "loc" }).sale;
const saleWithSource = (f, source) => withCommerceBenefitsTransaction(f.db, Date.now(), tx => completeMarketSaleInTransaction(f.db, {
  settlement: "paid", operationId: "excluded_sale", paymentMethod: "cash", items: [{ productId: "p1", quantity: 1 }], locationId: "loc", source
}, new Date(tx.now).toISOString()).sale);

test("history validates page limits and malformed cursors", t => {
  const f = use(t), history = load("market-sale-full-refund").listMarketSaleHistory;
  for (const limit of [0, 51, -1, 1.5, "30", null])
    assert.throws(() => history(f.path, { limit }, f.authority), error => error.code === "REFUND_INVALID_COMMAND");
  for (const cursor of [false, 0, "", null, [], {}, { openedAt: "", id: "x" }, { openedAt: "x", id: "!" },
    { openedAt: "x".repeat(65), id: "x" }, { openedAt: "x", id: "x", businessId: "b2" }])
    assert.throws(() => history(f.path, { limit: 30, cursor }, f.authority), error => error.code === "REFUND_INVALID_COMMAND");
  assert.equal(history(f.path, { limit: 50 }, f.authority).items.length, 0);
});

test("stable keyset pagination handles identical timestamps and out-of-scope cursor", t => {
  const f = use(t), history = load("market-sale-full-refund").listMarketSaleHistory;
  const insert = f.db.prepare(`INSERT INTO commerce_sales(id,business_id,status,total,currency,payment_method,source,opened_at,closed_at,created_at,updated_at)
    VALUES (?,?,'paid',10,'TRY','cash','desktop-market-quick-sale','2024-01-01','2024-01-01','2024-01-01','2024-01-01')`);
  for (let i = 0; i < 57; i++) insert.run(`tie_${String(i).padStart(3, "0")}`, "b1");
  insert.run("tie_other_business", "b2");
  const readAll = () => { let cursor; const ids = []; do {
    const page = history(f.path, { limit: 30, ...(cursor ? { cursor } : {}) }, f.authority);
    ids.push(...page.items.map(item => item.saleId)); cursor = page.nextCursor;
  } while (cursor); return ids; };
  const expected = Array.from({ length: 57 }, (_, i) => `tie_${String(i).padStart(3, "0")}`).reverse();
  assert.deepEqual(readAll(), expected); assert.deepEqual(readAll(), expected);
  assert.equal(new Set(readAll()).size, 57);
  const page = history(f.path, { limit: 50, cursor: { openedAt: "2024-01-01", id: "tie_other_business" } }, f.authority);
  assert.equal(page.businessId, "b1"); assert.equal(page.items.length, 50);
  assert.ok(page.items.every(item => item.saleId !== "tie_other_business"));
});

test("mislabeled paid quick sale with a credit ledger link is excluded", t => {
  const f = use(t), sale = legacy(f);
  // Deliberately simulate inconsistent persisted data only in the disposable fixture.
  f.db.exec("DROP TRIGGER trg_customer_credit_validate_insert");
  f.db.prepare(`INSERT INTO customer_credit_entries(id,business_id,customer_id,direction,amount_minor,currency,entry_type,sale_id,occurred_at,created_at,updated_at)
    VALUES ('credit_link','b1','c1','debit',100000,'TRY','credit_sale',?,'fixture','fixture','fixture')`).run(sale.id);
  assert.equal(preview(f.path, sale.id, f.authority).eligible, false);
  assert.equal(load("market-sale-full-refund").listMarketSaleHistory(f.path, { limit: 30 }, f.authority).items.length, 0);
});

test("disposable 1500-sale history query plan and bounded page latency", t => {
  const f = use(t), history = load("market-sale-full-refund").listMarketSaleHistory;
  f.db.exec("PRAGMA foreign_keys = OFF; DROP TRIGGER trg_customer_credit_validate_insert; BEGIN");
  const sale = f.db.prepare(`INSERT INTO commerce_sales(id,business_id,status,total,currency,payment_method,source,opened_at,closed_at,created_at,updated_at)
    VALUES (?,?,'paid',10,'TRY','cash','desktop-market-quick-sale',?,'2024-01-01','2024-01-01','2024-01-01')`);
  const credit = f.db.prepare(`INSERT INTO customer_credit_entries(id,business_id,customer_id,direction,amount_minor,currency,entry_type,sale_id,occurred_at,created_at,updated_at)
    VALUES (?,'b1','c1','debit',1000,'TRY','credit_sale',?,'fixture','fixture','fixture')`);
  const order = f.db.prepare(`INSERT INTO commerce_order_fulfillments(id,business_id,order_id,sale_id,operation_key,request_fingerprint,settlement_type,payment_method,created_at)
    VALUES (?,'b1',?,?,?,'fixture','paid','cash','fixture')`);
  for (let i = 0; i < 1800; i++) {
    const id = `bench_${String(i).padStart(4, "0")}`;
    sale.run(id, i >= 1500 ? "b2" : "b1", `2024-01-${String(i % 28 + 1).padStart(2, "0")}`);
    if (i < 250) credit.run(`credit_${i}`, id);
    else if (i < 500) order.run(`fulfillment_${i}`, `order_${i}`, id, `op_${i}`);
  }
  f.db.exec("COMMIT; PRAGMA foreign_keys = ON");
  const source = readFileSync("apps/desktop-app/electron/market-sale-full-refund.ts", "utf8");
  const sql = source.match(/const rows = db\.prepare\(`([\s\S]*?)`\)\.all\(businessId, source/)[1];
  const plan = f.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all("b1", "desktop-market-quick-sale", null, null, null, null, 31).map(row => row.detail);
  const times = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now(), page = history(f.path, { limit: 30 }, f.authority);
    times.push(performance.now() - start);
    assert.equal(page.items.length, 30); assert.ok(page.nextCursor);
    assert.ok(page.items.every(item => Number(item.saleId.slice(6)) >= 500 && Number(item.saleId.slice(6)) < 1500));
  }
  assert.ok(Math.max(...times) < 2000, `30-row page exceeded 2s: ${times}`);
  console.log(`history benchmark ms: ${times.map(value => value.toFixed(2)).join(", ")}; plan: ${plan.join(" | ")}`);
});

test("history pages only persisted quick sales, without key access or database writes", t => {
  const f = use(t), history = load("market-sale-full-refund").listMarketSaleHistory;
  const old = legacy(f, "history_old"), refunded = legacy(f, "history_refunded"), excluded = saleWithSource(f, "android");
  f.db.prepare("UPDATE commerce_sales SET opened_at = ? WHERE id = ?").run("2020-01-01", old.id);
  assert.equal(excluded.source, "android");
  fullRefundMarketSale(f.path, { saleId: refunded.id, operationId: "history_refund", kind: "full" }, f.authority);
  f.authority.keys.load = () => { throw new Error("history must not load key"); };
  const before = databaseState(f.db);
  const first = history(f.path, { limit: 1 }, f.authority);
  assert.equal(first.items.length, 1); assert.equal(first.items[0].saleId, refunded.id);
  assert.equal(first.items[0].refunded, true); assert.equal(first.items[0].cashMinor, 100000);
  assert.equal(first.items[0].paymentMethod, "cash");
  assert.ok(first.nextCursor);
  const second = history(f.path, { limit: 1, cursor: first.nextCursor }, f.authority);
  assert.equal(second.items.length, 1); assert.equal(second.items[0].saleId, old.id);
  assert.equal(second.nextCursor, null); assert.deepEqual(databaseState(f.db), before);
  assert.throws(() => history(f.path, { limit: 51 }, f.authority));
  assert.throws(() => history(f.path, { limit: 1, cursor: { openedAt: "x", id: "x", businessId: "b2" } }, f.authority));
  f.state.authorized = false;
  assert.throws(() => history("/nonexistent/never-open.sqlite", { limit: 1 }, f.authority));
});

test("history includes all-Puan tender even without a Finance income", t => {
  const f = use(t);
  installRules(f, exampleRules().map(r => ({ ...r, startsAt: 0 }))); adjust(f, 100000);
  const input = { operationId: "history_all_points", customerId: "c1", paymentMethod: "cash", requestedPointsMinor: 100000,
    items: [{ productId: "p1", quantity: 1 }] };
  const quote = previewMarketSaleBenefits(f.path, input, f.authority).quote;
  const sale = completeMarketSale(f.path, { ...input, settlement: "paid", locationId: "loc", paymentAmountMinor: quote.payableMinor,
    benefits: { requestedPointsMinor: 100000, expectedQuote: quote } }, f.authority).sale;
  assert.equal(f.db.prepare("SELECT 1 FROM finance_entries WHERE source_type = 'commerce_sale' AND source_id = ?").get(sale.id), undefined);
  const page = load("market-sale-full-refund").listMarketSaleHistory(f.path, { limit: 30 }, f.authority);
  assert.equal(page.items[0].saleId, sale.id); assert.equal(page.items[0].cashMinor, 0);
  assert.equal(page.items[0].pointsMinor, 100000); assert.equal(page.items[0].totalMinor, 100000);
});

for (const mixed of [false, true]) test(`read-only ${mixed ? "mixed Puan" : "paid cash"} preview uses original evidence without key access`, t => {
  const f = use(t);
  let sale;
  if (mixed) {
    installRules(f, exampleRules().map(r => ({ ...r, startsAt: 0 }))); adjust(f);
    const input = { operationId: "benefits_sale", customerId: "c1", paymentMethod: "bank", requestedPointsMinor: 10000,
      items: [{ productId: "p1", quantity: 1 }] };
    const quote = previewMarketSaleBenefits(f.path, input, f.authority).quote;
    sale = completeMarketSale(f.path, { ...input, settlement: "paid", locationId: "loc", paymentAmountMinor: quote.payableMinor,
      benefits: { requestedPointsMinor: 10000, expectedQuote: quote } }, f.authority).sale;
  } else sale = legacy(f);
  const before = databaseState(f.db), loads = f.state.keyLoads;
  f.authority.keys.load = () => { throw new Error("preview must not load protected key"); };
  const result = preview(f.path, sale.id, f.authority);
  assert.equal(result.eligible, true); assert.equal(result.refunded, false);
  assert.equal(result.businessId, "b1"); assert.equal(result.actorId, "local-desktop-owner");
  assert.equal(result.pointsMinor, mixed ? 10000 : 0);
  assert.equal(result.cashMinor, mixed ? 85000 : 100000);
  assert.equal(result.totalMinor, result.cashMinor + result.pointsMinor);
  assert.equal(result.currency, "TRY"); assert.equal(result.lines[0].name, "Fixture product");
  assert.equal(typeof result.customerName, mixed ? "string" : "object");
  assert.equal(f.state.keyLoads, loads); assert.deepEqual(databaseState(f.db), before);
  // Current prices never replace the historical paid tender.
  f.db.prepare("UPDATE catalog_products SET sale_price = 9999 WHERE id = 'p1'").run();
  assert.equal(preview(f.path, sale.id, f.authority).cashMinor, result.cashMinor);
});

test("refunded state is read-only and hides action; missing Finance evidence and unsafe stock fail closed", t => {
  const f = use(t), sale = legacy(f);
  fullRefundMarketSale(f.path, { saleId: sale.id, operationId: "full_refund", kind: "full" }, f.authority);
  const before = databaseState(f.db), result = preview(f.path, sale.id, f.authority);
  assert.equal(result.refunded, true); assert.equal(result.eligible, false); assert.equal(result.cashMinor, 100000); assert.deepEqual(databaseState(f.db), before);
  const second = legacy(f, "second_original");
  f.db.prepare("UPDATE finance_entries SET deleted_at = 'removed' WHERE source_id = ?").run(second.id);
  assert.equal(preview(f.path, second.id, f.authority).eligible, false);
  const third = legacy(f, "third_original");
  f.db.prepare("UPDATE inventory_locations SET is_active = 0 WHERE id = 'loc'").run();
  assert.equal(preview(f.path, third.id, f.authority).eligible, false);
});

for (const change of ["source = 'commerce-order'", "source = 'android'", "status = 'credit'", "business_id = 'b2'"])
  test(`preview denies ${change}`, t => {
    const f = use(t), sale = change.startsWith("source = ") ? saleWithSource(f, change.includes("commerce-order") ? "commerce-order" : "android") : legacy(f);
    if (!change.startsWith("source = ")) f.db.exec(`UPDATE commerce_sales SET ${change} WHERE id = '${sale.id}'`);
    const before = databaseState(f.db);
    assert.equal(preview(f.path, sale.id, f.authority).eligible, false); assert.deepEqual(databaseState(f.db), before);
    assert.equal(load("market-sale-full-refund").listMarketSaleHistory(f.path, { limit: 30 }, f.authority).items.length, 0);
  });

test("canonical order fulfillment is ineligible even with a mislabeled quick-sale source", t => {
  const f = use(t);
  for (const capability of capabilities.expandBusinessCapabilities(["commerce.orders"]))
    f.db.prepare("INSERT OR IGNORE INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(capability);
  const { createCommerceOrder, updateCommerceOrderStatus } = load("commerce-order-store");
  const order = createCommerceOrder(f.path, { customerId: "c1", source: "desktop", items: [{ productId: "p1", quantity: 1 }] });
  updateCommerceOrderStatus(f.path, { orderId: order.order.id, status: "confirmed" });
  const result = load("commerce-order-fulfillment-service").fulfillCommerceOrder(f.path, { orderId: order.order.id,
    operationKey: "original_fulfillment", settlement: { type: "paid", paymentMethod: "cash" } });
  const sale = legacy(f);
  f.db.prepare("UPDATE commerce_order_fulfillments SET sale_id = ? WHERE sale_id = ?").run(sale.id, result.sale.id);
  assert.equal(preview(f.path, sale.id, f.authority).eligible, false);
  assert.equal(load("market-sale-full-refund").listMarketSaleHistory(f.path, { limit: 30 }, f.authority).items.length, 0);
});

test("preview requires current Sales capability and authorized owner before key/DB access", t => {
  const f = use(t), sale = legacy(f);
  f.state.authorized = false;
  assert.throws(() => preview("/nonexistent/never-open.sqlite", sale.id, f.authority), error => error.code === "BENEFITS_STAFF_REQUIRED");
  f.state.authorized = true;
  f.db.prepare("UPDATE business_capabilities SET is_enabled = 0 WHERE capability_id = 'commerce.sales'").run();
  assert.throws(() => preview(f.path, sale.id, f.authority), error => error.code === "REFUND_SCOPE");
  assert.throws(() => load("market-sale-full-refund").listMarketSaleHistory(f.path, { limit: 30 }, f.authority), error => error.code === "REFUND_SCOPE");
  assert.equal(f.state.keyLoads, 0);
});

test("actual main IPC and preload reject locked/untrusted/subframes before database and secure storage", async t => {
  const f = use(t), sale = legacy(f), handlers = new Map();
  let dbReads = 0, locked = false, bridge;
  const frame = { url: "file:///trusted/index.html" }, sender = { getType: () => "window", mainFrame: frame }, event = { sender, senderFrame: frame };
  const electron = { ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, app: { getPath: () => f.path },
    safeStorage: { isEncryptionAvailable: () => { throw new Error("preview key access"); } },
    contextBridge: { exposeInMainWorld: (_name, value) => { bridge = value; } },
    ipcRenderer: { invoke: async (channel, ...args) => channel === "appLock:getStatus" ? { locked } : handlers.get(channel)(event, ...args) } };
  const modules = marketSaleIpcModules(electron);
  modules.ipc.registerCommerceIpcHandlers({ databasePath: () => { dbReads++; return f.path; }, assertUnlocked: () => { if (locked) throw new Error("locked"); } });
  const handle = handlers.get("commerce:sale:fullRefundMarketPreview");
  const historyHandle = handlers.get("commerce:sale:marketHistory");
  assert.equal(typeof historyHandle, "function");
  for (const bad of [{ ...event, senderFrame: null }, { ...event, senderFrame: { url: frame.url } },
    { ...event, sender: { ...sender, getType: () => "webview" } }]) {
    assert.throws(() => handle(bad, sale.id)); assert.throws(() => historyHandle(bad, { limit: 1 }));
  }
  frame.url = "https://untrusted.test"; assert.throws(() => handle(event, sale.id));
  assert.throws(() => historyHandle(event, { limit: 1 })); frame.url = "file:///trusted/index.html";
  locked = true; assert.throws(() => handle(event, sale.id)); assert.equal(dbReads, 0);
  assert.throws(() => historyHandle(event, { limit: 1 })); assert.equal(dbReads, 0);
  modules.preload(); await assert.rejects(bridge.commerce.getFullRefundMarketSalePreview(sale.id)); assert.equal(dbReads, 0);
  await assert.rejects(bridge.commerce.listMarketSaleHistory({ limit: 30 })); assert.equal(dbReads, 0);
  locked = false;
  const before = databaseState(f.db);
  assert.equal((await bridge.commerce.getFullRefundMarketSalePreview(sale.id)).eligible, true);
  assert.equal((await bridge.commerce.getFullRefundMarketSalePreview("unknown_sale")).eligible, false);
  assert.equal((await bridge.commerce.listMarketSaleHistory({ limit: 1 })).items[0].saleId, sale.id);
  assert.deepEqual(databaseState(f.db), before);
});
