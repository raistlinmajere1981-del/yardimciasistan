import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { saleFixture, databaseState, load, marketSaleIpcModules, marketSaleBenefitsPorts, synchronizeFinanceSourceInTransaction } from "./test-helpers/market-sale-benefits-fixture.mjs";
import { exampleRules, installRules, adjust, issue, balance, capabilities } from "./test-helpers/commerce-benefits-fixture.mjs";
const { fulfillCommerceOrder } = load("commerce-order-fulfillment-service");
const { previewCommerceOrderBenefits, orderBenefitsPorts } = load("commerce-order-benefits");
const { createCommerceOrder, updateCommerceOrderStatus } = load("commerce-order-store");
const rules = load("commerce-benefits-rules");
const use = t => {
  const f = saleFixture(); t.after(() => f.close());
  for (const capability of capabilities.expandBusinessCapabilities(["commerce.orders", "commerce.customer_credit"])) {
    f.db.prepare("INSERT OR IGNORE INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(capability);
  }
  installRules(f, exampleRules().map(rule => ({ ...rule, startsAt: 0 }))); adjust(f);
  return f;
};
const order = (f, overrides = {}, confirm = true) => {
  const detail = createCommerceOrder(f.path, { customerId: "c1", source: "desktop", items: [{ productId: "p1", quantity: 1 }], ...overrides });
  return confirm ? updateCommerceOrderStatus(f.path, { orderId: detail.order.id, status: "confirmed" }) : detail;
};
const request = (detail, overrides = {}) => ({ orderId: detail.order.id, operationKey: `fulfill:${detail.order.id}`,
  paymentMethod: "cash", requestedPointsMinor: 10000, ...overrides });
const command = (input, preview) => ({ orderId: input.orderId, operationKey: input.operationKey,
  settlement: { type: "paid", paymentMethod: input.paymentMethod }, benefits: { requestedPointsMinor: input.requestedPointsMinor,
    expectedQuote: preview.quote, paymentAmountMinor: preview.quote.payableMinor, ...(input.couponCode === undefined ? {} : { couponCode: input.couponCode }) } });
const preview = (f, input) => previewCommerceOrderBenefits(f.path, input, f.authority);
const complete = (f, input) => fulfillCommerceOrder(f.path, input, f.authority);
const fails = (fn, code) => assert.throws(fn, error => error.code === code, code);
const n = (f, table) => f.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

test("order creation, confirmation and no-code preview never grant, hold or settle; current prices never replace accepted prices", t => {
  const f = use(t), opening = balance(f).availableMinor;
  const detail = order(f);
  assert.equal(balance(f).availableMinor, opening);
  for (const table of ["commerce_sales", "finance_entries", "commerce_benefit_reservations", "commerce_benefit_snapshots"]) assert.equal(n(f, table), 0);
  f.db.prepare("UPDATE catalog_products SET sale_price = 2000 WHERE id = 'p1'").run();
  const before = databaseState(f.db), value = preview(f, request(detail));
  assert.deepEqual(value.authority, { state: "preview_only", canConfirmPoints: false });
  assert.equal(value.quote.subtotalMinor, 100000); assert.equal(value.quote.payableMinor, 90000);
  assert.deepEqual(databaseState(f.db), before);
});

test("real paid order uses commerce_order source, immutable sale tender, one stock path and cash-only finance", t => {
  const f = use(t), detail = order(f), input = request(detail), quoted = preview(f, input);
  const result = complete(f, command(input, quoted));
  assert.deepEqual(result.benefits.quote, quoted.quote);
  assert.deepEqual(result.benefits.source, { kind: "commerce_order", id: detail.order.id });
  assert.equal(result.order.order.status, "fulfilled"); assert.equal(result.sale.source, "commerce-order");
  assert.equal(result.sale.total, detail.order.total); assert.equal(result.sale.total, 1000);
  assert.equal(balance(f).availableMinor, 2250);
  assert.equal(f.db.prepare("SELECT quantity FROM inventory_balances WHERE product_id = 'p1'").get().quantity, 49);
  const tender = f.db.prepare("SELECT * FROM commerce_sale_settlements WHERE sale_id = ?").get(result.sale.id);
  assert.equal(tender.customer_id, "c1"); assert.equal(tender.cash_received_minor, 90000); assert.equal(tender.points_tender_minor, 10000);
  assert.equal(f.db.prepare("SELECT amount_minor FROM finance_entries WHERE source_id = ?").get(result.sale.id).amount_minor, 90000);
  f.db.exec("BEGIN IMMEDIATE"); synchronizeFinanceSourceInTransaction(f.db, "commerce_sale", result.sale.id); f.db.exec("COMMIT");
  assert.equal(f.db.prepare("SELECT amount_minor FROM finance_entries WHERE source_id = ?").get(result.sale.id).amount_minor, 90000);
  assert.equal(n(f, "inventory_movements"), 1); assert.equal(n(f, "customer_credit_entries"), 0);
  assert.throws(() => f.db.prepare("UPDATE commerce_sale_settlements SET cash_received_minor = 1").run(), /immutable/);
});

function couponCheckout(f) {
  const coupon = issue(f, { expiresAt: Date.now() + 600000 });
  // Accepted discount is already part of this order; benefits cannot silently add another discount.
  const detail = order(f, { discountTotal: 145 });
  const input = request(detail, { paymentMethod: "bank", couponCode: coupon.secret });
  const quoted = preview(f, input);
  return { coupon, detail, input, quoted, saleInput: command(input, quoted) };
}

test("coupon + bank + points supported only when discount exactly matches stored order; no plaintext or coupon digest leaks", t => {
  const f = use(t), x = couponCheckout(f);
  assert.deepEqual([x.quoted.quote.discountMinor, x.quoted.quote.pointsTenderMinor, x.quoted.quote.payableMinor, x.quoted.quote.pointsEarnPreviewMinor], [14500, 10000, 75500, 1888]);
  const result = complete(f, x.saleInput);
  assert.equal(result.sale.total, 855); assert.equal(result.order.order.total, 855); assert.equal(n(f, "commerce_benefit_coupon_redemptions"), 1);
  assert.equal(balance(f).availableMinor, 1888);
  assert.equal(f.db.prepare("SELECT amount_minor FROM finance_entries WHERE source_id = ?").get(result.sale.id).amount_minor, 75500);
  const digest = f.db.prepare("SELECT secret_hmac FROM commerce_benefit_coupon_codes").get().secret_hmac;
  assert(!JSON.stringify([x.quoted, result]).includes(x.coupon.secret)); assert(!JSON.stringify(result).includes(digest));
  assert(!JSON.stringify(databaseState(f.db)).includes(x.coupon.secret));
  f.db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); assert(!readFileSync(f.path).includes(Buffer.from(x.coupon.secret)));
});

test("exact fulfillment replay survives expired/exhausted/disabled coupon, family disable and catalog changes without another attempt", t => {
  const f = use(t), x = couponCheckout(f), first = complete(f, x.saleInput);
  f.db.prepare("UPDATE commerce_benefit_coupon_codes SET status = 'disabled',expires_at_ms = 1").run();
  f.db.prepare("UPDATE catalog_products SET sale_price = 2000 WHERE id = 'p1'").run();
  rules.withCommerceBenefitsTransaction(f.db, Date.now(), tx => rules.configureCommerceBenefits(tx, "b1", { coupon: false, points: false, payment_modifier: false }));
  const before = databaseState(f.db);
  assert.deepEqual(complete(f, x.saleInput), first); assert.deepEqual(databaseState(f.db), before);
  f.db.prepare("UPDATE business_capabilities SET is_enabled = 0 WHERE capability_id = 'commerce.benefits'").run();
  fails(() => complete(f, x.saleInput), "BENEFITS_CAPABILITY_DISABLED");
});

test("changed coupon, expected quote, tender, payment method or location rejects command replay; no-code downgrade also rejects", t => {
  const f = use(t), x = couponCheckout(f); complete(f, x.saleInput);
  const before = databaseState(f.db);
  for (const change of [
    { benefits: { ...x.saleInput.benefits, couponCode: "A".repeat(40) } },
    { benefits: { ...x.saleInput.benefits, requestedPointsMinor: 0 } },
    { benefits: { ...x.saleInput.benefits, expectedQuote: { ...x.quoted.quote, payableMinor: 1 } } },
    { benefits: { ...x.saleInput.benefits, paymentAmountMinor: 1 } },
    { settlement: { type: "paid", paymentMethod: "card" } }, { locationId: "other" }, { benefits: undefined }
  ]) assert.throws(() => complete(f, { ...x.saleInput, ...change }), /farklı bir istek/);
  assert.deepEqual(databaseState(f.db), before);
});

test("fulfillment committed during key loading replays exactly instead of retrying an exhausted coupon", t => {
  const f = use(t), x = couponCheckout(f);
  let committed;
  const authority = { ...f.authority, keys: { ...f.authority.keys, load() {
    committed = complete(f, x.saleInput);
    return f.authority.keys.load();
  } } };
  const result = fulfillCommerceOrder(f.path, x.saleInput, authority);
  assert.deepEqual(result, committed);
  assert.equal(n(f, "commerce_sales"), 1); assert.equal(n(f, "commerce_benefit_snapshots"), 1);
  assert.deepEqual(f.db.prepare("SELECT attempts FROM commerce_benefit_coupon_rate_limits").all().map(row => row.attempts), [2, 2]);
});

test("one order cannot settle twice under another operation or also grant through resulting sale source", t => {
  const f = use(t), detail = order(f), input = request(detail), paid = complete(f, command(input, preview(f, input)));
  const before = databaseState(f.db);
  assert.throws(() => complete(f, { ...command(input, { quote: paid.benefits.quote }), operationKey: "another_operation" }), /farklı bir işlem anahtarı/);
  const bound = { businessId: "b1", customerId: "c1", source: { kind: "sale", id: paid.sale.id }, channel: "desktop_cart", currency: "TRY",
    lines: [{ productId: "p1", quantityTenThousandths: 10000 }], paymentMethodId: "cash", requestedPointsMinor: 0 };
  fails(() => marketSaleBenefitsPorts(f.authority.actor, bound).authorize(f.db, bound, "checkout"), "BENEFITS_CONTEXT_SCOPE");
  assert.equal(orderBenefitsPorts(f.authority.actor, { ...bound, source: paid.benefits.source, channel: "desktop_desk" }, "unrelated-sale")
    .readSettlement(f.db, paid.benefits.source), null);
  assert.deepEqual(databaseState(f.db), before);
});

test("new discount or mismatching existing discount fails closed without altering the order total", t => {
  const f = use(t), detail = order(f), before = databaseState(f.db);
  fails(() => preview(f, request(detail, { paymentMethod: "bank" })), "BENEFITS_ORDER_SNAPSHOT_CONFLICT");
  assert.deepEqual(databaseState(f.db), before);
  const discounted = order(f, { discountTotal: 1 });
  fails(() => preview(f, request(discounted)), "BENEFITS_ORDER_SNAPSHOT_CONFLICT");
  assert.equal(f.db.prepare("SELECT total FROM commerce_orders WHERE id = ?").get(discounted.order.id).total, 999);
});

test("stale rule/quote, changed method and under/overpayment reject with no sale, stock or points effects", t => {
  const f = use(t), detail = order(f), input = request(detail), quoted = preview(f, input), valid = command(input, quoted);
  const before = databaseState(f.db);
  for (const amount of [0, quoted.quote.payableMinor - 1, quoted.quote.payableMinor + 1])
    fails(() => complete(f, { ...valid, benefits: { ...valid.benefits, paymentAmountMinor: amount } }), "BENEFITS_ACTUAL_PAYMENT_REQUIRED");
  fails(() => complete(f, { ...valid, benefits: { ...valid.benefits, expectedQuote: { ...quoted.quote, pointsEarnPreviewMinor: 1 } } }), "BENEFITS_QUOTE_CHANGED");
  fails(() => complete(f, { ...valid, settlement: { type: "paid", paymentMethod: "bank" } }), "BENEFITS_ORDER_SNAPSHOT_CONFLICT");
  assert.deepEqual(databaseState(f.db), before);
  const earn = exampleRules().find(rule => rule.id === "earn");
  rules.withCommerceBenefitsTransaction(f.db, Date.now(), tx => rules.saveCommerceBenefitsRule(tx, "b1", { ...earn, startsAt: 0, version: 2, percentBps: 500 }));
  const changed = databaseState(f.db);
  fails(() => complete(f, valid), "BENEFITS_QUOTE_CHANGED"); assert.deepEqual(databaseState(f.db), changed);
});

test("pending, cancelled, zero, remote/dealer orders and credit/no-payment commands cannot use benefits", t => {
  const f = use(t);
  for (const detail of [order(f, {}, false), order(f, { discountTotal: 1000 })])
    fails(() => preview(f, request(detail)), "BENEFITS_ORDER_PAID_REQUIRED");
  const cancelled = order(f); updateCommerceOrderStatus(f.path, { orderId: cancelled.order.id, status: "cancelled" });
  fails(() => preview(f, request(cancelled)), "BENEFITS_ORDER_PAID_REQUIRED");
  const remote = order(f, { source: "web-online-sales", deliverySnapshot: { method: "pickup" } });
  fails(() => preview(f, request(remote)), "BENEFITS_ORDER_SOURCE_UNSUPPORTED");
  f.db.prepare("UPDATE commerce_orders SET source = 'web-dealer' WHERE id = ?").run(remote.order.id);
  fails(() => preview(f, request(remote)), "BENEFITS_ORDER_SOURCE_UNSUPPORTED");
  const detail = order(f), input = request(detail), valid = command(input, preview(f, input)), before = databaseState(f.db);
  for (const type of ["credit", "no_payment"]) fails(() => complete(f, { ...valid, settlement: { type } }), "BENEFITS_ORDER_PAID_REQUIRED");
  assert.deepEqual(databaseState(f.db), before);
});

test("disabled benefits preserves exact legacy paid/credit/no-payment path without key or benefits effects", t => {
  const f = use(t);
  f.db.prepare("UPDATE business_capabilities SET is_enabled = 0 WHERE capability_id = 'commerce.benefits'").run();
  for (const settlement of [{ type: "paid", paymentMethod: "cash" }, { type: "credit" }, { type: "no_payment" }]) {
    const detail = order(f, { discountTotal: settlement.type === "no_payment" ? 1000 : 5 });
    const input = { orderId: detail.order.id, operationKey: `legacy:${detail.order.id}`, settlement };
    const first = complete(f, input); assert.deepEqual(complete(f, input), first);
    assert.equal(first.sale.total, detail.order.total); assert.equal(first.benefits, undefined);
  }
  assert.equal(n(f, "commerce_sale_settlements"), 0); assert.equal(n(f, "commerce_benefit_snapshots"), 0); assert.equal(f.state.keyLoads, 0);
  const detail = order(f), loads = f.state.keyLoads;
  fails(() => preview(f, request(detail)), "BENEFITS_CAPABILITY_DISABLED"); assert.equal(f.state.keyLoads, loads);
});

test("server scope rejects spoofed tenant/customer/prices/actor/source and revoked or foreign customer before settlement", t => {
  const f = use(t), detail = order(f), input = request(detail), valid = command(input, preview(f, input)), before = databaseState(f.db);
  for (const extra of [{ actor: {} }, { businessId: "b2" }, { customerId: "c3" }, { items: [] }, { source: { kind: "sale", id: "x" } }, { authority: {} }]) {
    fails(() => preview(f, { ...input, ...extra }), "BENEFITS_INVALID_INTENT");
    fails(() => complete(f, { ...valid, ...extra }), "BENEFITS_ORDER_PAID_REQUIRED");
  }
  fails(() => fulfillCommerceOrder(f.path, valid), "BENEFITS_STAFF_REQUIRED");
  f.state.authorized = false; fails(() => complete(f, valid), "BENEFITS_STAFF_REQUIRED"); f.state.authorized = true;
  assert.deepEqual(databaseState(f.db), before);
  f.db.prepare("UPDATE customers SET deleted_at = 'fixture' WHERE id = 'c1'").run();
  fails(() => preview(f, input), "BENEFITS_CUSTOMER_SCOPE");
});

for (const [label, sql] of [
  ["finance", "CREATE TRIGGER fail_finance BEFORE INSERT ON finance_entries BEGIN SELECT RAISE(ABORT,'injected_finance'); END;"],
  ["stock", "CREATE TRIGGER fail_stock BEFORE INSERT ON inventory_movements BEGIN SELECT RAISE(ABORT,'injected_stock'); END;"],
  ["late benefits settlement", "CREATE TRIGGER fail_snapshot BEFORE INSERT ON commerce_benefit_snapshots BEGIN SELECT RAISE(ABORT,'injected_snapshot'); END;"]
]) test(`${label} failure rolls back order, sale, tender, stock, finance, publication, holds, coupon and points together`, t => {
  const f = use(t), x = couponCheckout(f); f.db.exec(sql);
  const before = databaseState(f.db);
  assert.throws(() => complete(f, x.saleInput), /injected_/);
  const after = databaseState(f.db);
  const parent = state => state.filter(([name]) => !["commerce_benefit_coupon_rate_limits", "commerce_benefit_coupon_authorizations"].includes(name));
  assert.deepEqual(parent(after), parent(before));
  assert.deepEqual(f.db.prepare("SELECT attempts FROM commerce_benefit_coupon_rate_limits").all().map(row => row.attempts), [2, 2]);
  assert.equal(f.db.prepare("SELECT status FROM commerce_orders WHERE id = ?").get(x.detail.order.id).status, "confirmed");
});

for (const state of ["open", "credit"]) test(`persisted ${state} sale evidence after Finance cannot settle order benefits`, t => {
  const f = use(t), detail = order(f), input = request(detail), valid = command(input, preview(f, input));
  f.db.exec(`CREATE TRIGGER corrupt_paid_evidence AFTER INSERT ON finance_entries BEGIN
    UPDATE commerce_sales SET status = '${state}' WHERE id = NEW.source_id; END;`);
  const before = databaseState(f.db);
  fails(() => complete(f, valid), "BENEFITS_SETTLEMENT_MISMATCH");
  assert.deepEqual(databaseState(f.db), before);
});

test("mismatching persisted sale total after Finance fails paid evidence and rolls back all effects", t => {
  const f = use(t), detail = order(f), input = request(detail), valid = command(input, preview(f, input));
  f.db.exec("CREATE TRIGGER corrupt_paid_total AFTER INSERT ON finance_entries BEGIN UPDATE commerce_sales SET total = total + 1 WHERE id = NEW.source_id; END;");
  const before = databaseState(f.db);
  fails(() => complete(f, valid), "BENEFITS_SETTLEMENT_MISMATCH"); assert.deepEqual(databaseState(f.db), before);
});

test("invalid/malformed coupon attempts remain independently durable and bounded across rejected checkouts", t => {
  const f = use(t), detail = order(f), realNow = Date.now, pinned = Math.floor(realNow() / 60000) * 60000 + 1000;
  Date.now = () => pinned; t.after(() => { Date.now = realNow; });
  for (let i = 0; i < 20; i++) fails(() => preview(f, request(detail, { couponCode: i % 2 ? "A".repeat(40) : "bad?" })), "BENEFITS_COUPON_UNAVAILABLE");
  fails(() => preview(f, request(detail, { couponCode: "bad?" })), "BENEFITS_COUPON_RATE_LIMITED");
  assert.deepEqual(f.db.prepare("SELECT attempts FROM commerce_benefit_coupon_rate_limits").all().map(row => row.attempts), [21, 21]);
  assert.equal(n(f, "commerce_sales"), 0); assert.equal(n(f, "commerce_benefit_reservations"), 0);
  fails(() => preview(f, request(detail, { couponCode: "A".repeat(129) })), "BENEFITS_INVALID_INTENT");
});

test("snapshot edits after preview reject stale expectation while keeping a failed coupon attempt durable", t => {
  const f = use(t), x = couponCheckout(f);
  f.db.prepare("UPDATE commerce_order_items SET unit_price = 1001,line_total = 1001 WHERE order_id = ?").run(x.detail.order.id);
  f.db.prepare("UPDATE commerce_orders SET subtotal = 1001,total = 856 WHERE id = ?").run(x.detail.order.id);
  fails(() => complete(f, x.saleInput), "BENEFITS_ORDER_SNAPSHOT_CONFLICT");
  assert.equal(n(f, "commerce_sales"), 0); assert.equal(n(f, "commerce_benefit_reservations"), 0);
  assert.deepEqual(f.db.prepare("SELECT attempts FROM commerce_benefit_coupon_rate_limits").all().map(row => row.attempts), [2, 2]);
});

test("dealer order keeps accepted dealer snapshot while current group/rule eligibility is revalidated", t => {
  const f = use(t);
  f.db.prepare("INSERT INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1','commerce.wholesale','fixture','fixture')").run();
  f.db.prepare("INSERT INTO customer_commercial_profiles(customer_id,business_id,company_name,dealer_status,price_group,created_at,updated_at) VALUES ('c1','b1','Fixture','active','dealer_a','fixture','fixture')").run();
  const detail = createCommerceOrder(f.path, { customerId: "c1", source: "desktop-wholesale", items: [{ productId: "p1", quantity: 1 }] }, { wholesaleEnabled: true });
  updateCommerceOrderStatus(f.path, { orderId: detail.order.id, status: "confirmed" });
  const input = request(detail);
  f.db.prepare("UPDATE catalog_products SET dealer_price_a = 650 WHERE id = 'p1'").run();
  const paid = complete(f, command(input, preview(f, input))); assert.equal(paid.sale.total, 800);
  assert.equal(f.db.prepare("SELECT unit_price FROM commerce_sale_items WHERE sale_id = ?").get(paid.sale.id).unit_price, 800);
});

test("anonymous cannot earn or spend points; all-points tender creates no cash finance", t => {
  const f = use(t), anonymous = order(f, { customerId: "" });
  const noPoints = preview(f, request(anonymous, { requestedPointsMinor: 0 })); assert.equal(noPoints.quote.pointsEarnPreviewMinor, 0);
  assert.throws(() => preview(f, request(anonymous)));
  adjust(f, 90000, { operationKey: "more_points" });
  const detail = order(f), input = request(detail, { requestedPointsMinor: 100000 }), result = complete(f, command(input, preview(f, input)));
  assert.equal(result.benefits.quote.payableMinor, 0); assert.equal(result.sale.total, 1000);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM finance_entries WHERE source_id = ?").get(result.sale.id).n, 0);
});

test("concurrent paid orders cannot spend the same available points twice", async t => {
  const f = use(t), start = new SharedArrayBuffer(4);
  const inputs = [order(f), order(f)].map(detail => { const input = request(detail); return command(input, preview(f, input)); });
  const workers = inputs.map(input => new Worker(new URL("./test-helpers/commerce-order-benefits-concurrent.mjs", import.meta.url), { workerData: { path: f.path, input, start } }));
  t.after(async () => { await Promise.all(workers.map(worker => worker.terminate())); });
  await Promise.all(workers.map(worker => new Promise((resolve, reject) => { worker.once("message", resolve); worker.once("error", reject); })));
  const results = workers.map(worker => new Promise((resolve, reject) => { worker.once("message", resolve); worker.once("error", reject); }));
  Atomics.store(new Int32Array(start), 0, 1); Atomics.notify(new Int32Array(start), 0);
  const outcomes = await Promise.all(results);
  assert.equal(outcomes.filter(result => result.ok).length, 1, JSON.stringify(outcomes));
  assert.equal(n(f, "commerce_sales"), 1); assert.equal(n(f, "commerce_order_fulfillments"), 1); assert.equal(n(f, "commerce_benefit_snapshots"), 1);
  assert.equal(balance(f).availableMinor, 2250);
});

test("actual preload/main order APIs enforce local owner/session before DB/key, sanitize failures and preserve uncertain post-commit replay", async t => {
  const f = use(t), handlers = new Map(), root = mkdtempSync(join(tmpdir(), "order-benefits-ipc-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let dbReads = 0, secureReads = 0, locked = false, failAfterCommit = false;
  const electron = { ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, app: { getPath: () => root },
    safeStorage: { isEncryptionAvailable: () => { secureReads++; return true; }, getSelectedStorageBackend: () => "gnome_libsecret",
      encryptString: text => Buffer.from(text).map(byte => byte ^ 0xa5), decryptString: bytes => Buffer.from(bytes).map(byte => byte ^ 0xa5).toString() } };
  const modules = marketSaleIpcModules(electron);
  modules.ipc.registerCommerceIpcHandlers({ databasePath: () => { dbReads++; return f.path; }, assertUnlocked() { if (locked) throw new Error("fixture_locked"); },
    onMutation() { if (failAfterCommit) throw new (load("commerce-benefits-engine").CommerceBenefitsError)("BENEFITS_QUOTE_CHANGED"); } });
  const frame = { url: "file:///trusted/index.html" }, sender = { getType: () => "window", mainFrame: frame }, event = { sender, senderFrame: frame };
  const detail = order(f), input = request(detail), saleInput = command(input, { quote: {} });
  for (const bad of [{ ...event, senderFrame: { url: frame.url } }, { ...event, sender: { ...sender, getType: () => "webview" } }, { ...event, senderFrame: null }]) {
    assert.equal(handlers.get("commerce:order:previewBenefits")(bad, input).code, "BENEFITS_STAFF_REQUIRED");
    assert.equal(handlers.get("commerce:order:fulfill")(bad, saleInput).code, "BENEFITS_STAFF_REQUIRED");
  }
  frame.url = "https://evil.test/"; assert.equal(handlers.get("commerce:order:previewBenefits")(event, input).code, "BENEFITS_STAFF_REQUIRED"); frame.url = "file:///trusted/index.html";
  locked = true; assert.equal(handlers.get("commerce:order:previewBenefits")(event, input).code, "BENEFITS_SESSION_LOCKED"); locked = false;
  assert.equal(dbReads, 0); assert.equal(secureReads, 0);
  let bridge;
  electron.contextBridge = { exposeInMainWorld(name, value) { assert.equal(name, "yardimciDesktop"); bridge = value; } };
  electron.ipcRenderer = { invoke: async (channel, ...args) => channel === "appLock:getStatus" ? { locked } : handlers.get(channel)(event, ...args) };
  modules.preload();
  const key = new (load("commerce-benefits-key").CommerceBenefitsKey)(root, electron.safeStorage).load();
  const coupon = rules.withCommerceBenefitsTransaction(f.db, Date.now(), tx => rules.issueCommerceBenefitCoupon(tx, "b1", key,
    { ruleId: "coupon100", maxUses: 1, maxUsesPerCustomer: 1, expiresAt: Date.now() + 600000 }));
  const discounted = order(f, { discountTotal: 100 }), couponInput = request(discounted, { couponCode: coupon.secret });
  const quoted = await bridge.commerce.previewOrderBenefits(couponInput); assert.equal(quoted.ok, true);
  const paidInput = command(couponInput, quoted.value);
  failAfterCommit = true; await assert.rejects(bridge.commerce.tryFulfillOrder(paidInput), error => error.code === "BENEFITS_QUOTE_CHANGED");
  assert.equal(n(f, "commerce_sales"), 1); failAfterCommit = false;
  const result = await bridge.commerce.tryFulfillOrder(paidInput); assert.equal(result.ok, true); assert.equal(n(f, "commerce_sales"), 1);
  assert(!JSON.stringify(result).includes(coupon.secret));
  locked = true; await assert.rejects(bridge.commerce.previewOrderBenefits(couponInput), /kilitli/);
});
