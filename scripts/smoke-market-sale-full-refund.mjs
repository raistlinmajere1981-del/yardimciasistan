import assert from "node:assert/strict";
import { test } from "node:test";
import { Worker } from "node:worker_threads";
import { mkdtempSync, rmSync, globSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saleFixture, databaseState, completeMarketSale, completeMarketSaleInTransaction, load, marketSaleIpcModules,
  synchronizeFinanceSourceInTransaction, withCommerceBenefitsTransaction } from "./test-helpers/market-sale-benefits-fixture.mjs";
import { exampleRules, installRules, adjust, balance, rules, capabilities } from "./test-helpers/commerce-benefits-fixture.mjs";
const { fullRefundMarketSale } = load("market-sale-full-refund");
const { previewMarketSaleBenefits } = load("market-sale-benefits");
const use = t => { const f = saleFixture(); t.after(() => f.close()); return f; };
const command = (saleId, operationId = "refund_operation") => ({ saleId, operationId, kind: "full" });
const legacy = (f, overrides = {}) => completeMarketSale(f.path, { settlement: "paid", operationId: "legacy_original",
  paymentMethod: "cash", items: [{ productId: "p1", quantity: 1 }], locationId: "loc", ...overrides });
function benefitsSale(f, overrides = {}) {
  const request = { operationId: "benefit_original", items: [{ productId: "p1", quantity: 1 }], customerId: "c1",
    paymentMethod: "bank", requestedPointsMinor: 10000, ...overrides };
  const preview = previewMarketSaleBenefits(f.path, request, f.authority);
  return completeMarketSale(f.path, { ...request, locationId: "loc", settlement: "paid", paymentAmountMinor: preview.quote.payableMinor,
    benefits: { requestedPointsMinor: request.requestedPointsMinor, expectedQuote: preview.quote,
      ...(request.couponCode ? { couponCode: request.couponCode } : {}) } }, f.authority);
}
const setup = (f, amount = 10000) => { installRules(f, exampleRules().map(r => ({ ...r, startsAt: 0 }))); adjust(f, amount); };
const fails = (fn, code) => assert.throws(fn, error => error.code === code, code);
const refund = (f, saleId, operationId) => fullRefundMarketSale(f.path, command(saleId, operationId), f.authority);
const row = (f, sql, ...params) => f.db.prepare(sql).get(...params);

function verifyRefund(f, sale, result, cash, points) {
  const receipt = result.receipt;
  assert.equal(receipt.cashMinor, cash); assert.equal(receipt.pointsMinor, points);
  assert.equal(row(f, "SELECT quantity FROM inventory_balances WHERE product_id = 'p1' AND location_id = 'loc'").quantity, 50);
  const original = row(f, "SELECT * FROM finance_entries WHERE source_type = 'commerce_sale' AND source_id = ?", sale.id);
  const expense = row(f, "SELECT * FROM finance_entries WHERE source_type = 'commerce_sale_refund' AND source_id = ?", receipt.refundId);
  if (cash) {
    assert.equal(original.amount_minor, cash); assert.equal(original.deleted_at, ""); assert.equal(original.direction, "income");
    assert.equal(expense.amount_minor, cash); assert.equal(expense.direction, "expense");
    assert.equal(expense.payment_method, sale.paymentMethod); assert.equal(expense.currency, sale.currency);
    assert.equal(row(f, "SELECT SUM(CASE direction WHEN 'income' THEN amount_minor ELSE -amount_minor END) AS net FROM finance_entries WHERE deleted_at = ''").net, 0);
  } else { assert.equal(original, undefined); assert.equal(expense, undefined); }
  assert.equal(row(f, "SELECT status FROM commerce_sales WHERE id = ?", sale.id).status, "paid");
  const parent = row(f, "SELECT * FROM commerce_sale_full_refunds WHERE id = ?", receipt.refundId);
  assert.equal(parent.sale_id, sale.id); assert.equal(parent.actor_id, "local-desktop-owner");
  assert.equal(JSON.parse(parent.items_json).length, 1); assert.equal(JSON.parse(parent.stock_movements_json).length, 1);
  const returned = row(f, "SELECT * FROM inventory_movements WHERE reference_type = 'commerce_sale_refund' AND reference_id = ?", receipt.refundId);
  assert.equal(returned.movement_type, "return_in"); assert.equal(returned.quantity_delta, 1); assert.equal(returned.location_id, "loc");
  assert.equal(returned.unit_cost, JSON.parse(parent.stock_movements_json)[0].unit_cost);
  assert.deepEqual(receipt.stockMovementIds, [returned.id]);
  assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(), []);
}

test("legacy paid cash: source-owned expense, original income/sale/items retained, exact stock and outbox", t => {
  const f = use(t), sale = legacy(f).sale;
  const original = row(f, "SELECT * FROM finance_entries WHERE source_id = ?", sale.id);
  const originalSale = row(f, "SELECT * FROM commerce_sales WHERE id = ?", sale.id);
  const revision = row(f, "SELECT source_revision FROM sync_outbox WHERE job_key = 'menu'").source_revision;
  f.authority.keys.load = () => { throw new Error("legacy must not load a key"); };
  const result = refund(f, sale.id); verifyRefund(f, sale, result, 100000, 0);
  assert.equal(result.receipt.benefits, null); assert.equal(f.state.keyLoads, 0);
  assert.deepEqual(row(f, "SELECT * FROM finance_entries WHERE source_id = ?", sale.id), original);
  assert.deepEqual(row(f, "SELECT * FROM commerce_sales WHERE id = ?", sale.id), originalSale);
  assert.ok(row(f, "SELECT source_revision FROM sync_outbox WHERE job_key = 'menu'").source_revision > revision);
  withCommerceBenefitsTransaction(f.db, Date.now(), () => {
    synchronizeFinanceSourceInTransaction(f.db, "commerce_sale", sale.id);
    synchronizeFinanceSourceInTransaction(f.db, "commerce_sale_refund", result.receipt.refundId);
  });
  assert.equal(row(f, "SELECT COUNT(*) n FROM finance_entries").n, 2);
  const finance = new (load("finance").DesktopFinanceService)(f.path);
  assert.equal(finance.deleteManualEntry(row(f, "SELECT id FROM finance_entries WHERE direction = 'expense'").id).ok, false);
});

test("customer-linked non-benefit paid sale remains a normal cash refund without benefits tender", t => {
  const f = use(t), sale = legacy(f, { customerId: "c1" }).sale;
  assert.equal(row(f, "SELECT customer_id FROM commerce_sales WHERE id = ?", sale.id).customer_id, "c1");
  assert.equal(row(f, "SELECT * FROM commerce_sale_settlements WHERE sale_id = ?", sale.id), undefined);
  const result = refund(f, sale.id); verifyRefund(f, sale, result, 100000, 0);
  assert.equal(result.receipt.benefits, null);
});

for (const mode of ["mixed", "cash", "all_points"]) test(`real benefits ${mode}: actual tender refunded and existing reverse restores Puan atomically`, t => {
  const f = use(t); setup(f, mode === "all_points" ? 100000 : 10000);
  const sale = benefitsSale(f, mode === "all_points" ? { requestedPointsMinor: 100000, paymentMethod: "cash" }
    : mode === "cash" ? { requestedPointsMinor: 0, paymentMethod: "card" } : {}).sale;
  const tender = row(f, "SELECT * FROM commerce_sale_settlements WHERE sale_id = ?", sale.id);
  const result = refund(f, sale.id);
  verifyRefund(f, sale, result, tender.cash_received_minor, tender.points_tender_minor);
  assert.ok(result.receipt.benefits); assert.equal(result.receipt.benefits.couponUsageRestored, false);
  assert.equal(balance(f).availableMinor, mode === "all_points" ? 100000 : 10000);
});

test("coupon remains consumed, disabled benefits/families still refund; no coupon secret persisted", t => {
  const f = use(t); setup(f);
  const coupon = f.transact(tx => rules.issueCommerceBenefitCoupon(tx, "b1", f.authority.keys.load(),
    { ruleId: "coupon100", maxUses: 1, maxUsesPerCustomer: 1, expiresAt: Date.now() + 600000 }));
  const sale = benefitsSale(f, { couponCode: coupon.secret }).sale;
  f.db.prepare("UPDATE business_capabilities SET is_enabled = 0 WHERE capability_id = 'commerce.benefits'").run();
  f.db.prepare("UPDATE commerce_benefit_settings SET coupons_enabled = 0, points_enabled = 0, payment_modifiers_enabled = 0").run();
  const result = refund(f, sale.id);
  assert.equal(result.receipt.cashMinor, 75500); assert.equal(balance(f).availableMinor, 10000);
  assert.equal(row(f, "SELECT COUNT(*) n FROM commerce_benefit_coupon_redemptions").n, 1);
  assert.ok(!JSON.stringify(databaseState(f.db)).includes(coupon.secret));
});

test("exact command replay after price/rule/customer/catalog changes; altered intent, second operation, injected fields reject", t => {
  const f = use(t); setup(f); const sale = benefitsSale(f).sale, first = refund(f, sale.id);
  const second = legacy(f, { operationId: "different_sale" }).sale;
  f.db.prepare("UPDATE catalog_products SET sale_price = 9999, deleted_at = 'later' WHERE id = 'p1'").run();
  f.db.prepare("UPDATE commerce_benefit_coupon_codes SET status = 'disabled'").run();
  f.authority.keys.load = () => { throw new Error("replay must not require key I/O"); };
  const before = databaseState(f.db);
  assert.deepEqual(refund(f, sale.id), { ...first, replayed: true });
  fails(() => refund(f, sale.id, "second_refund_operation"), "REFUND_ALREADY_COMPLETED");
  for (const extra of [{ amount: 1 }, { customerId: "c2" }, { businessId: "b2" }, { items: [] }, { refundMethod: "cash" }])
    fails(() => fullRefundMarketSale(f.path, { ...command(sale.id), ...extra }, f.authority), "REFUND_INVALID_COMMAND");
  fails(() => refund(f, second.id), "REFUND_INTENT_CHANGED");
  assert.deepEqual(databaseState(f.db), before);
});

for (const phase of ["parent", "finance", "stock", "points", "receipt"]) test(`injected failure after ${phase} rolls back parent/Finance/stock/points/receipt/outbox together`, t => {
  const f = use(t); setup(f); const sale = benefitsSale(f).sale;
  const [table, when] = { parent: ["commerce_sale_full_refunds", ""], finance: ["finance_entries", "WHEN NEW.source_type = 'commerce_sale_refund'"],
    stock: ["inventory_movements", "WHEN NEW.reference_type = 'commerce_sale_refund'"], points: ["commerce_benefit_point_ledger", "WHEN NEW.kind = 'reversal'"],
    receipt: ["commerce_sale_full_refund_receipts", ""] }[phase];
  f.db.exec(`CREATE TRIGGER injected_refund_failure AFTER INSERT ON ${table} ${when} BEGIN SELECT RAISE(ABORT, 'injected_refund_failure'); END`);
  const before = databaseState(f.db);
  assert.throws(() => refund(f, sale.id), /injected_refund_failure/);
  assert.deepEqual(databaseState(f.db), before);
  f.db.exec("DROP TRIGGER injected_refund_failure");
  assert.equal(refund(f, sale.id).replayed, false);
});

test("earned points already spent reject the entire real refund", t => {
  const f = use(t); setup(f); const sale = benefitsSale(f).sale;
  benefitsSale(f, { operationId: "spend_earned_points", requestedPointsMinor: 1000 });
  const before = databaseState(f.db);
  fails(() => refund(f, sale.id), "BENEFITS_EARNED_POINTS_ALREADY_USED");
  assert.deepEqual(databaseState(f.db), before);
});

test("earned points held by a real reservation reject the entire refund", t => {
  const f = use(t); setup(f); const sale = benefitsSale(f).sale;
  const intent = { businessId: "b1", customerId: "c1", source: { kind: "sale", id: "pending_quick_sale" },
    channel: "desktop_cart", currency: "TRY", lines: [{ productId: "p1", quantityTenThousandths: 10000 }],
    paymentMethodId: "bank", requestedPointsMinor: 1000, couponCodes: [] };
  const { marketSaleBenefitsPorts } = load("market-sale-benefits");
  const { CommerceBenefitsStore } = load("commerce-benefits-store");
  const store = new CommerceBenefitsStore(f.authority.keys.load(), marketSaleBenefitsPorts(f.authority.actor, rules.benefitsIntentForStorage(intent)));
  withCommerceBenefitsTransaction(f.db, Date.now(), tx => store.reserve(tx, intent, "hold-earned-points"));
  const before = databaseState(f.db);
  fails(() => refund(f, sale.id), "BENEFITS_EARNED_POINTS_ALREADY_USED");
  assert.deepEqual(databaseState(f.db), before);
});

test("secure key loads before write lock; checkout adapter still rejects reversal without a refund parent", t => {
  const f = use(t); setup(f); const original = benefitsSale(f), sale = original.sale;
  const snapshot = row(f, "SELECT r.intent_json FROM commerce_benefit_reservations r WHERE id = ?", original.benefits.reservationId);
  const { marketSaleBenefitsPorts } = load("market-sale-benefits");
  const { CommerceBenefitsStore } = load("commerce-benefits-store");
  const key = f.authority.keys.load();
  const checkoutStore = new CommerceBenefitsStore(key, marketSaleBenefitsPorts(f.authority.actor, JSON.parse(snapshot.intent_json)));
  const before = databaseState(f.db);
  fails(() => withCommerceBenefitsTransaction(f.db, Date.now(), tx => checkoutStore.reverse(tx, "b1", original.benefits.snapshotId, "not-a-refund")), "BENEFITS_CONTEXT_SCOPE");
  assert.deepEqual(databaseState(f.db), before);
  f.authority.keys.load = () => {
    // A second connection can acquire the writer lock only before the parent BEGIN.
    f.db.exec("BEGIN IMMEDIATE"); f.db.exec("COMMIT"); return key;
  };
  assert.equal(refund(f, sale.id).replayed, false);
});

test("canonical order fulfillment link forbids refund even if a sale source is mislabeled", t => {
  const f = use(t);
  for (const capability of capabilities.expandBusinessCapabilities(["commerce.orders"]))
    f.db.prepare("INSERT OR IGNORE INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(capability);
  const { createCommerceOrder, updateCommerceOrderStatus } = load("commerce-order-store");
  const { fulfillCommerceOrder } = load("commerce-order-fulfillment-service");
  const order = createCommerceOrder(f.path, { customerId: "c1", source: "desktop", items: [{ productId: "p1", quantity: 1 }] });
  updateCommerceOrderStatus(f.path, { orderId: order.order.id, status: "confirmed" });
  const result = fulfillCommerceOrder(f.path, { orderId: order.order.id, operationKey: "original_fulfillment", settlement: { type: "paid", paymentMethod: "cash" } });
  // Corrupt only the isolated fulfillment link, not immutable sale provenance.
  const desktopSale = legacy(f).sale;
  f.db.prepare("UPDATE commerce_order_fulfillments SET sale_id = ? WHERE sale_id = ?").run(desktopSale.id, result.sale.id);
  assert.equal(row(f, "SELECT source FROM commerce_sales WHERE id = ?", desktopSale.id).source, "desktop-market-quick-sale");
  assert.ok(row(f, "SELECT 1 FROM commerce_order_fulfillments WHERE sale_id = ?", desktopSale.id));
  const before = databaseState(f.db);
  fails(() => refund(f, desktopSale.id), "REFUND_SCOPE"); assert.deepEqual(databaseState(f.db), before);
});

test("untracked original never gains stock when tracking is later enabled; tracked fractional quantities return to original warehouse", t => {
  const f = use(t);
  f.db.prepare("UPDATE catalog_products SET track_inventory = 0 WHERE id = 'p1'").run();
  const sale = legacy(f).sale;
  f.db.prepare("UPDATE catalog_products SET track_inventory = 1 WHERE id = 'p1'").run();
  assert.deepEqual(refund(f, sale.id).receipt.stockMovementIds, []);
  assert.equal(row(f, "SELECT quantity FROM inventory_balances WHERE product_id = 'p1'").quantity, 50);
  f.db.prepare("INSERT INTO inventory_locations(id,business_id,name,created_at,updated_at) VALUES ('other','b1','Other','fixture','fixture')").run();
  f.db.prepare("INSERT INTO inventory_balances VALUES ('p1','other',5,'fixture')").run();
  const second = legacy(f, { operationId: "fractional_sale", locationId: "other", items: [{ productId: "p1", quantity: 0.1234 }] }).sale;
  refund(f, second.id, "fractional_refund");
  assert.equal(row(f, "SELECT quantity FROM inventory_balances WHERE product_id = 'p1' AND location_id = 'other'").quantity, 5);
  assert.equal(row(f, "SELECT quantity FROM inventory_balances WHERE product_id = 'p1' AND location_id = 'loc'").quantity, 50);
});

for (const [label, sql] of [
  ["deleted product", "UPDATE catalog_products SET deleted_at = 'deleted' WHERE id = 'p1'"],
  ["disabled tracking", "UPDATE catalog_products SET track_inventory = 0 WHERE id = 'p1'"],
  ["wrong tenant location", "UPDATE inventory_locations SET business_id = 'b2' WHERE id = 'loc'"],
  ["deleted warehouse", "UPDATE inventory_locations SET deleted_at = 'deleted' WHERE id = 'loc'"],
  ["movement quantity", "UPDATE inventory_movements SET quantity_delta = -0.5 WHERE reference_type = 'commerce_sale'"],
  ["movement type", "UPDATE inventory_movements SET movement_type = 'return_in' WHERE reference_type = 'commerce_sale'"],
  ["sale line quantity", "UPDATE commerce_sale_items SET quantity = 2"],
  ["income amount", "UPDATE finance_entries SET amount_minor = 1 WHERE source_type = 'commerce_sale'"]
]) test(`unsafe evidence fails closed: ${label}`, t => {
  const f = use(t), sale = legacy(f).sale;
  f.db.exec(sql); const before = databaseState(f.db);
  assert.throws(() => refund(f, sale.id)); assert.deepEqual(databaseState(f.db), before);
});

test("order/table/Android/credit/other business sales and revoked owner cannot enter this parent", t => {
  for (const source of ["commerce-order", "table_order", "android"]) {
    const f = use(t);
    const sale = withCommerceBenefitsTransaction(f.db, Date.now(), tx => completeMarketSaleInTransaction(f.db, {
      settlement: "paid", operationId: "source_scope_sale", paymentMethod: "cash", items: [{ productId: "p1", quantity: 1 }], locationId: "loc", source
    }, new Date(tx.now).toISOString()).sale);
    assert.equal(row(f, "SELECT source FROM commerce_sales WHERE id = ?", sale.id).source, source);
    const before = databaseState(f.db); fails(() => refund(f, sale.id), "REFUND_SCOPE");
    assert.deepEqual(databaseState(f.db), before);
  }
  for (const change of ["status = 'credit'", "business_id = 'b2'"]) {
    const f = use(t), sale = legacy(f).sale;
    f.db.exec(`UPDATE commerce_sales SET ${change} WHERE id = '${sale.id}'`);
    const before = databaseState(f.db); fails(() => refund(f, sale.id), "REFUND_SCOPE");
    assert.deepEqual(databaseState(f.db), before);
  }
  const f = use(t), sale = legacy(f).sale; f.state.authorized = false;
  fails(() => refund(f, sale.id), "BENEFITS_STAFF_REQUIRED"); assert.equal(f.state.keyLoads, 0);
});

test("parent and exact receipt are immutable; Finance mutations remain solely in the Finance owner", t => {
  const f = use(t), sale = legacy(f).sale; refund(f, sale.id);
  for (const table of ["commerce_sale_full_refunds", "commerce_sale_full_refund_receipts"])
    for (const mutation of [`DELETE FROM ${table}`, `UPDATE ${table} SET ${table.endsWith('receipts') ? 'receipt_json = receipt_json' : 'cash_minor = cash_minor'}`])
      assert.throws(() => f.db.exec(mutation), /immutable/);
  assert.throws(() => f.db.prepare("UPDATE commerce_sales SET total = 1 WHERE id = ?").run(sale.id), /immutable/);
  const writes = /\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+finance_entries\b/i;
  for (const file of globSync("apps/desktop-app/electron/**/*.ts")) if (!file.endsWith("/finance.ts"))
    assert.doesNotMatch(readFileSync(file, "utf8"), writes, file);
});

for (const sameOperation of [true, false]) test(`two concurrent full refunds serialize (${sameOperation ? 'same' : 'different'} operation)`, async t => {
  const f = use(t); setup(f); const sale = benefitsSale(f).sale, start = new SharedArrayBuffer(4);
  const workers = [0, 1].map(index => new Worker(new URL("./test-helpers/market-sale-full-refund-concurrent.mjs", import.meta.url),
    { workerData: { path: f.path, input: command(sale.id, sameOperation ? "racing_refund" : `racing_refund_${index}`), start } }));
  t.after(async () => { await Promise.all(workers.map(w => w.terminate())); });
  await Promise.all(workers.map(w => new Promise((resolve, reject) => { w.once("message", resolve); w.once("error", reject); })));
  const done = workers.map(w => new Promise((resolve, reject) => { w.once("message", resolve); w.once("error", reject); }));
  Atomics.store(new Int32Array(start), 0, 1); Atomics.notify(new Int32Array(start), 0);
  const outcomes = await Promise.all(done);
  assert.equal(outcomes.filter(o => o.ok).length, sameOperation ? 2 : 1, JSON.stringify(outcomes));
  if (sameOperation) assert.equal(outcomes.filter(o => o.replayed).length, 1);
  assert.equal(row(f, "SELECT COUNT(*) n FROM commerce_sale_full_refunds").n, 1);
  assert.equal(row(f, "SELECT COUNT(*) n FROM commerce_benefit_reversals").n, 1);
  assert.equal(row(f, "SELECT quantity FROM inventory_balances WHERE product_id = 'p1'").quantity, 50);
});

test("real main handler/preload: untrusted frame blocked before DB/key, unlocked owner refund and exact retry", async t => {
  const f = use(t), sale = legacy(f).sale, handlers = new Map(), root = mkdtempSync(join(tmpdir(), "refund-ipc-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let dbReads = 0, secureReads = 0, locked = false, failAfterCommit = false;
  const electron = { ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, app: { getPath: () => root },
    safeStorage: { isEncryptionAvailable: () => { secureReads++; throw new Error("legacy key access"); } } };
  const modules = marketSaleIpcModules(electron);
  modules.ipc.registerCommerceIpcHandlers({ databasePath: () => { dbReads++; return f.path; },
    assertUnlocked: () => { if (locked) throw new Error("locked"); }, onMutation: () => { if (failAfterCommit) throw new Error("post_commit_failure"); } });
  const frame = { url: "file:///trusted/index.html" }, sender = { getType: () => "window", mainFrame: frame }, event = { sender, senderFrame: frame };
  const handle = handlers.get("commerce:sale:fullRefundMarket");
  for (const bad of [{ ...event, senderFrame: { url: frame.url } }, { ...event, senderFrame: null },
    { ...event, sender: { ...sender, getType: () => "webview" } }]) assert.equal(handle(bad, command(sale.id)).ok, false);
  frame.url = "https://untrusted.test"; assert.equal(handle(event, command(sale.id)).ok, false); frame.url = "file:///trusted/index.html";
  locked = true; assert.throws(() => handle(event, command(sale.id)), /locked/); locked = false;
  assert.equal(dbReads, 0); assert.equal(secureReads, 0);
  let bridge;
  electron.contextBridge = { exposeInMainWorld: (_name, value) => { bridge = value; } };
  electron.ipcRenderer = { invoke: async (channel, ...args) => channel === "appLock:getStatus" ? { locked } : handlers.get(channel)(event, ...args) };
  modules.preload(); failAfterCommit = true;
  await assert.rejects(bridge.commerce.tryFullRefundMarketSale(command(sale.id)), /post_commit_failure/);
  assert.equal(row(f, "SELECT COUNT(*) n FROM commerce_sale_full_refunds").n, 1);
  failAfterCommit = false;
  const replay = await bridge.commerce.fullRefundMarketSale(command(sale.id)); assert.equal(replay.replayed, true);
  assert.equal((await bridge.commerce.tryFullRefundMarketSale(command(sale.id, "second_refund"))).code, "REFUND_ALREADY_COMPLETED");
  assert.equal(secureReads, 0);
});
