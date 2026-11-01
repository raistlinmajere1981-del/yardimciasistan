import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { Worker } from "node:worker_threads";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tableFixture, tableOrder, request, command, preview, complete, benefits, tables, load, databaseState, mockedTableModules } from "./test-helpers/table-order-benefits-fixture.mjs";
import { issue, balance, adjust } from "./test-helpers/commerce-benefits-fixture.mjs";
const use = t => { const f = tableFixture(); t.after(() => f.close()); return f; };
const n = (f, name) => f.db.prepare(`SELECT COUNT(*) n FROM ${name}`).get().n;
const fails = (fn, code) => assert.throws(fn, error => error.code === code, code);
const couponCheckout = f => {
  const coupon = issue(f, { expiresAt: Date.now() + 600000 });
  const order = tableOrder(f), input = request(order, { couponCode: coupon.secret, paymentMethod: "bank" });
  return { coupon, order, input, paidInput: command(input, preview(f, input)) };
};

test("real percent coupon + bank modifier + points settle paid table with actual cash finance, immutable customer/items and no second stock consumption", t => {
  const f = use(t), x = couponCheckout(f), stockBefore = f.db.prepare("SELECT * FROM inventory_movements").all();
  const paid = complete(f, x.paidInput), q = paid.benefits.quote;
  assert.deepEqual([q.subtotalMinor, q.discountMinor, q.pointsTenderMinor, q.payableMinor, q.pointsEarnPreviewMinor], [100000, 14500, 10000, 75500, 1888]);
  assert.deepEqual({ ...f.db.prepare("SELECT subtotal,discount_total,total,status FROM table_orders WHERE id = ?").get(x.order.id) },
    { subtotal: 1000, discount_total: 145, total: 855, status: "paid" });
  const tender = f.db.prepare("SELECT * FROM table_order_settlements").get();
  assert.equal(tender.customer_id, "c1"); assert.equal(tender.payment_method, "bank"); assert.equal(tender.cash_received_minor, 75500);
  assert.equal(f.db.prepare("SELECT current_customer_id FROM tables WHERE id = ?").get(x.order.tableId).current_customer_id, "");
  assert.equal(balance(f).availableMinor, 1888);
  assert.deepEqual(f.db.prepare("SELECT * FROM inventory_movements").all(), stockBefore);
  const finance = f.db.prepare("SELECT * FROM finance_entries WHERE source_id = ?").get(x.order.id);
  assert.equal(finance.amount_minor, 75500); assert.equal(finance.payment_method, "bank");
  f.db.exec("BEGIN IMMEDIATE"); load("finance").synchronizeFinanceSourceInTransaction(f.db, "restaurant_order", x.order.id); f.db.exec("COMMIT");
  assert.equal(n(f, "finance_entries"), 1); assert.equal(f.db.prepare("SELECT amount_minor FROM finance_entries").get().amount_minor, 75500);
  for (const sql of ["UPDATE table_order_settlements SET cash_received_minor=1", "DELETE FROM table_order_settlements"]) assert.throws(() => f.db.exec(sql), /immutable/);
  const persisted = JSON.stringify(databaseState(f.db)); assert(!persisted.includes(x.coupon.secret));
  assert(!persisted.includes(createHash("sha256").update(x.coupon.secret).digest("hex")));
  assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(), []);
});

test("no-code preview is read-only; availability key-free; legacy paid/cancel/Android stay without benefits or key access", t => {
  const f = use(t), order = tableOrder(f), before = databaseState(f.db);
  assert.equal(benefits.getTableOrderBenefitsState(f.db).enabled, true); assert.equal(f.state.keyLoads, 0);
  const quoted = preview(f, request(order)); assert.equal(quoted.authority.state, "preview_only"); assert.deepEqual(databaseState(f.db), before);
  f.authority.keys.load = () => { throw new Error("must_not_load"); };
  assert.equal(tables.closeTableOrder(f.db, { orderId: order.id, status: "paid" }).ok, true);
  const finance = f.db.prepare("SELECT amount_minor,payment_method FROM finance_entries WHERE source_id=?").get(order.id);
  assert.deepEqual({ ...finance }, { amount_minor: 100000, payment_method: "unspecified" });
  const cancelled = tableOrder(f); assert.equal(tables.closeTableOrder(f.db, { orderId: cancelled.id, status: "cancelled" }).ok, true);
  const android = tableOrder(f);
  const action = { id: "android-close", device_id: "phone", action_type: "table_order_close_paid", payload: { order_id: android.id }, created_at: new Date().toISOString() };
  const result = load("android-table-order-actions").applyAndroidTableOrderClose(f.db, action, new Date().toISOString(), "paid");
  assert.equal(result.ok, true);
  assert.equal(n(f, "table_order_settlements"), 0); assert.equal(n(f, "commerce_benefit_snapshots"), 0); assert.equal(balance(f).availableMinor, 10000);
});

test("exact replay after coupon expiry/family disable uses stored receipt; altered secret/quote/tender/method/operation rejects", t => {
  const f = use(t), x = couponCheckout(f), paid = complete(f, x.paidInput);
  f.db.exec("UPDATE commerce_benefit_coupon_codes SET expires_at_ms=1; UPDATE commerce_benefit_settings SET coupons_enabled=0,points_enabled=0,payment_modifiers_enabled=0");
  f.db.exec("UPDATE tables SET current_customer_id='c2'");
  const before = databaseState(f.db); assert.deepEqual(complete(f, x.paidInput), paid); assert.deepEqual(databaseState(f.db), before);
  for (const changed of [{ operationKey: "different" }, { paymentMethod: "cash" }, { benefits: { ...x.paidInput.benefits, couponCode: "bad?" } },
    { benefits: { ...x.paidInput.benefits, paymentAmountMinor: 1 } }, { benefits: { ...x.paidInput.benefits, expectedQuote: { ...x.paidInput.benefits.expectedQuote, payableMinor: 1 } } }]) {
    fails(() => complete(f, { ...x.paidInput, ...changed }), "BENEFITS_IDEMPOTENCY_INTENT_CHANGED");
    assert.deepEqual(databaseState(f.db), before);
  }
});

test("manual discount, bad totals/lines, zero/cancelled/unpaid, spoofed scope/authority, disabled gates and unsupported methods fail closed before key I/O", t => {
  const f = use(t), order = tableOrder(f), input = request(order);
  const checkNoKey = (fn, code) => { const before = f.state.keyLoads; fails(fn, code); assert.equal(f.state.keyLoads, before); };
  tables.updateTableOrderDiscount(f.db, { orderId: order.id, discountTotal: 100 });
  checkNoKey(() => preview(f, input), "BENEFITS_TABLE_MANUAL_DISCOUNT_UNSUPPORTED");
  assert.equal(f.db.prepare("SELECT discount_total FROM table_orders WHERE id=?").get(order.id).discount_total, 100);
  tables.updateTableOrderDiscount(f.db, { orderId: order.id, discountTotal: 0 });
  for (const extra of [{ businessId: "b2" }, { customerId: "c3" }, { actor: "owner" }, { source: { kind: "sale", id: "fake" } }, { lines: [] }, { paymentMethod: "transfer" }, { paymentMethod: "credit" }])
    checkNoKey(() => preview(f, { ...input, ...extra }), "BENEFITS_INVALID_INTENT");
  f.db.exec("UPDATE tables SET current_customer_id='c3'"); checkNoKey(() => preview(f, input), "BENEFITS_CUSTOMER_SCOPE"); f.db.exec("UPDATE tables SET current_customer_id='c1'");
  f.state.authorized = false; checkNoKey(() => preview(f, input), "BENEFITS_STAFF_REQUIRED"); f.state.authorized = true;
  for (const capability of ["food_service.orders", "commerce.benefits", "commerce.sales", "commerce.catalog", "core.customers"]) {
    f.db.prepare("UPDATE business_capabilities SET is_enabled=0 WHERE capability_id=?").run(capability);
    assert.equal(benefits.getTableOrderBenefitsState(f.db).enabled, false);
    checkNoKey(() => preview(f, input), "BENEFITS_CAPABILITY_DISABLED");
    f.db.prepare("UPDATE business_capabilities SET is_enabled=1 WHERE capability_id=?").run(capability);
  }
  f.db.exec("UPDATE table_orders SET total=0"); checkNoKey(() => preview(f, input), "BENEFITS_TABLE_SNAPSHOT_CONFLICT"); f.db.exec("UPDATE table_orders SET total=1000");
  const paid = command(input, preview(f, input));
  for (const status of ["cancelled", "credit", "payment"]) checkNoKey(() => complete(f, { ...paid, status }), "BENEFITS_TABLE_PAID_REQUIRED");
  tables.closeTableOrder(f.db, { orderId: order.id, status: "cancelled" }); checkNoKey(() => preview(f, input), "BENEFITS_CONTEXT_SCOPE");
});

test("changed quote, customer, quantity and benefit rules invalidate preview and roll back settlement", t => {
  const f = use(t), order = tableOrder(f), input = request(order), paid = command(input, preview(f, input));
  f.db.exec("UPDATE table_order_items SET unit_price=1001,line_total=1001; UPDATE table_orders SET subtotal=1001,total=1001");
  fails(() => complete(f, paid), "BENEFITS_QUOTE_CHANGED");
  f.db.exec("UPDATE table_order_items SET unit_price=1000,line_total=1000; UPDATE table_orders SET subtotal=1000,total=1000; UPDATE tables SET current_customer_id='c2'");
  assert.throws(() => complete(f, paid));
  assert.equal(n(f, "table_order_settlements"), 0); assert.equal(n(f, "commerce_benefit_reservations"), 0);
});

for (const [name, sql] of [
  ["finance", "CREATE TRIGGER inject BEFORE INSERT ON finance_entries BEGIN SELECT RAISE(ABORT,'injected_finance'); END"],
  ["event after finance", "CREATE TRIGGER inject BEFORE INSERT ON events WHEN NEW.type='table_order.paid' BEGIN SELECT RAISE(ABORT,'injected_event'); END"],
  ["point grant", "CREATE TRIGGER inject BEFORE INSERT ON commerce_benefit_point_ledger WHEN NEW.kind='grant' BEGIN SELECT RAISE(ABORT,'injected_grant'); END"],
  ["after point grant", "CREATE TRIGGER inject BEFORE INSERT ON commerce_benefit_snapshots BEGIN SELECT RAISE(ABORT,'injected_snapshot'); END"],
  ["financial corruption after finance", "CREATE TRIGGER inject AFTER INSERT ON finance_entries BEGIN UPDATE table_orders SET total=total+1 WHERE id=NEW.source_id; END"],
  ["line corruption after points", "CREATE TRIGGER inject AFTER INSERT ON commerce_benefit_point_ledger WHEN NEW.kind='grant' BEGIN UPDATE table_order_items SET product_name='changed', unit_price=unit_price+1; END"],
]) test(`${name} failure rolls back status, customer assignment, finance, events, outbox, tender and every benefit write`, t => {
  const f = use(t), order = tableOrder(f), input = request(order), paid = command(input, preview(f, input));
  f.db.exec(sql); const before = databaseState(f.db);
  assert.throws(() => complete(f, paid)); assert.deepEqual(databaseState(f.db), before);
});

test("failed coupon attempts survive checkout rollback and actor code rate limits persist", t => {
  const f = use(t), order = tableOrder(f), input = request(order), originalNow = Date.now, now = Math.floor(originalNow() / 60000) * 60000 + 1000;
  Date.now = () => now; t.after(() => { Date.now = originalNow; });
  for (let i = 0; i < 20; i++) fails(() => preview(f, { ...input, couponCode: i % 2 ? "bad?" : "A".repeat(40) }), "BENEFITS_COUPON_UNAVAILABLE");
  fails(() => preview(f, { ...input, couponCode: "bad?" }), "BENEFITS_COUPON_RATE_LIMITED");
  assert.deepEqual(f.db.prepare("SELECT attempts FROM commerce_benefit_coupon_rate_limits").all().map(row => row.attempts), [21, 21]);
  assert.equal(n(f, "table_order_settlements"), 0); assert.equal(n(f, "commerce_benefit_reservations"), 0);
});

test("anonymous cannot earn/redeem points, anonymous coupon allowed; all-points paid creates no cash finance", t => {
  const f = use(t), anonymous = tableOrder(f, { customerId: "" }), input = request(anonymous, { requestedPointsMinor: 0 });
  const q = preview(f, input); assert.equal(q.quote.pointsEarnPreviewMinor, 0);
  assert.throws(() => preview(f, request(anonymous)));
  const coupon = issue(f, { maxUsesPerCustomer: null, expiresAt: Date.now() + 600000 });
  const anonInput = { ...input, couponCode: coupon.secret }; complete(f, command(anonInput, preview(f, anonInput)));
  adjust(f, 90000, { operationKey: "more" });
  const order = tableOrder(f), all = request(order, { requestedPointsMinor: 100000 });
  const paid = complete(f, command(all, preview(f, all))); assert.equal(paid.benefits.quote.payableMinor, 0);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM finance_entries WHERE source_id=?").get(order.id).n, 0);
});

test("room-folio transfer remains no collection/no benefits and cannot later enroll", t => {
  const f = use(t), order = tableOrder(f, { customerId: "" });
  f.db.exec(`INSERT INTO rooms(id,name,created_at,updated_at) VALUES ('room','Room','fixture','fixture');
    INSERT INTO customer_room_stays(id,customer_id,room_id,check_in_date,check_out_date,guest_count,status,created_at,updated_at) VALUES ('stay','c1','room','2035-01-01','2035-01-02',1,'checked_in','fixture','fixture');
    INSERT INTO room_folios(id,stay_id,room_id,customer_id,check_in_date,opened_at,currency,status,created_at,updated_at) VALUES ('folio','stay','room','c1','2035-01-01','fixture','TRY','open','fixture','fixture')`);
  const result = load("room-folio-order-transfer").transferTableOrderToRoomFolio(f.path, { folioId: "folio", tableOrderId: order.id });
  assert.equal(result.ok, true, result.message);
  fails(() => preview(f, request(order)), "BENEFITS_TABLE_PAID_REQUIRED");
  assert.equal(n(f, "table_order_settlements"), 0); assert.equal(n(f, "commerce_benefit_snapshots"), 0); assert.equal(n(f, "finance_entries"), 0);
});

test("concurrent table writers cannot spend same points or collect the same table twice", async t => {
  const f = use(t);
  async function race(inputs) {
    const start = new SharedArrayBuffer(4);
    const workers = inputs.map(input => new Worker(new URL("./test-helpers/table-order-benefits-concurrent.mjs", import.meta.url), { workerData: { path: f.path, input, start } }));
    t.after(async () => { await Promise.all(workers.map(worker => worker.terminate())); });
    await Promise.all(workers.map(worker => new Promise((resolve, reject) => { worker.once("message", resolve); worker.once("error", reject); })));
    const results = workers.map(worker => new Promise((resolve, reject) => { worker.once("message", resolve); worker.once("error", reject); }));
    Atomics.store(new Int32Array(start), 0, 1); Atomics.notify(new Int32Array(start), 0);
    return Promise.all(results);
  }
  const inputs = [tableOrder(f), tableOrder(f)].map(order => { const input = request(order); return command(input, preview(f, input)); });
  const outcomes = await race(inputs); assert.equal(outcomes.filter(x => x.ok).length, 1, JSON.stringify(outcomes));
  const paidInput = inputs[outcomes.findIndex(x => x.ok)];
  const replays = await race([paidInput, paidInput]); assert(replays.every(x => x.ok), JSON.stringify(replays));
  assert.equal(n(f, "table_order_settlements"), 1); assert.equal(n(f, "commerce_benefit_snapshots"), 1); assert.equal(n(f, "finance_entries"), 1);
  const fresh = request(tableOrder(f), { requestedPointsMinor: 0 }), sameCommand = command(fresh, preview(f, fresh));
  const same = await race([sameCommand, sameCommand]); assert(same.every(x => x.ok), JSON.stringify(same));
  assert.deepEqual(same[0].receipt, same[1].receipt);
  assert.equal(n(f, "table_order_settlements"), 2); assert.equal(n(f, "finance_entries"), 2);
});

test("same-total customer/line changes reject signed preview, even with no redemption; payment/rule changes reject", t => {
  const f = use(t), order = tableOrder(f), input = request(order, { requestedPointsMinor: 0 }), paid = command(input, preview(f, input));
  f.db.exec("UPDATE tables SET current_customer_id='c2'");
  fails(() => complete(f, paid), "BENEFITS_QUOTE_CHANGED");
  f.db.exec("UPDATE tables SET current_customer_id='c1'; UPDATE table_order_items SET id='changed_line'");
  fails(() => complete(f, paid), "BENEFITS_QUOTE_CHANGED");
  f.db.prepare("UPDATE table_order_items SET id=?").run(order.items[0].id);
  fails(() => complete(f, { ...paid, paymentMethod: "card" }), "BENEFITS_QUOTE_CHANGED");
  const { saveCommerceBenefitsRule, withCommerceBenefitsTransaction } = load("commerce-benefits-rules");
  const original = JSON.parse(f.db.prepare("SELECT canonical_json FROM commerce_benefit_rules WHERE id='earn'").get().canonical_json);
  withCommerceBenefitsTransaction(f.db, Date.now(), tx => saveCommerceBenefitsRule(tx, "b1", { ...original, version: 2, percentBps: 300 }));
  fails(() => complete(f, paid), "BENEFITS_QUOTE_CHANGED");
  assert.equal(n(f, "table_order_settlements"), 0); assert.equal(n(f, "commerce_benefit_reservations"), 0);
});

test("malformed currency, fractional money, quantity/line/subtotal mismatch and zero effective total never produce tender", t => {
  const f = use(t), order = tableOrder(f), input = request(order, { requestedPointsMinor: 0 });
  const reset = () => f.db.exec("UPDATE table_order_items SET currency='TRY',quantity=1,unit_price=1000,line_total=1000,status='open'; UPDATE table_orders SET subtotal=1000,discount_total=0,total=1000");
  assert.throws(() => f.db.exec("UPDATE table_order_items SET currency='bad'"), /CHECK constraint/);
  for (const sql of ["UPDATE table_order_items SET quantity=1.00001",
    "UPDATE table_order_items SET line_total=999", "UPDATE table_orders SET subtotal=1001,total=1001", "UPDATE table_orders SET total=1000.001"]) {
    f.db.exec(sql); fails(() => preview(f, input), "BENEFITS_TABLE_SNAPSHOT_CONFLICT"); reset();
  }
  const { saveCommerceBenefitsRule, withCommerceBenefitsTransaction } = load("commerce-benefits-rules");
  const original = JSON.parse(f.db.prepare("SELECT canonical_json FROM commerce_benefit_rules WHERE id='bank5'").get().canonical_json);
  withCommerceBenefitsTransaction(f.db, Date.now(), tx => saveCommerceBenefitsRule(tx, "b1", { ...original, version: 2, percentBps: 10000 }));
  fails(() => preview(f, { ...input, paymentMethod: "bank" }), "BENEFITS_TABLE_SNAPSHOT_CONFLICT");
  assert.equal(n(f, "table_order_settlements"), 0); assert.equal(n(f, "commerce_benefit_reservations"), 0);
});

test("coupon attempt stays durable when parent fails after finance and failed pre-transaction reads cannot authorize changed ingress", t => {
  const f = use(t), x = couponCheckout(f);
  f.db.exec("CREATE TRIGGER inject BEFORE INSERT ON events WHEN NEW.type='table_order.paid' BEGIN SELECT RAISE(ABORT,'injected_event'); END");
  const parentState = () => databaseState(f.db).filter(([name]) => !["commerce_benefit_coupon_rate_limits", "commerce_benefit_coupon_authorizations"].includes(name));
  const before = parentState(); assert.throws(() => complete(f, x.paidInput), /injected_event/); assert.deepEqual(parentState(), before);
  assert.deepEqual(f.db.prepare("SELECT attempts FROM commerce_benefit_coupon_rate_limits").all().map(row => row.attempts), [2, 2]);
  f.db.exec("DROP TRIGGER inject");
  const originalLoad = f.authority.keys.load;
  f.authority.keys.load = (...args) => { const key = originalLoad(...args); f.db.exec("UPDATE tables SET current_customer_id='c2'"); return key; };
  fails(() => complete(f, x.paidInput), "BENEFITS_CONTEXT_SCOPE");
  assert.equal(n(f, "table_order_settlements"), 0);
});

test("all confirmed tender methods use actual finance; disabled benefits never enroll legacy closes; ports reject forged scope/refunds", t => {
  const f = use(t);
  for (const paymentMethod of ["cash", "card", "bank", "other"]) {
    const order = tableOrder(f), input = request(order, { paymentMethod, requestedPointsMinor: 0 });
    const result = complete(f, command(input, preview(f, input)));
    assert.equal(f.db.prepare("SELECT payment_method FROM finance_entries WHERE source_id=?").get(order.id).payment_method, paymentMethod);
    assert.equal(result.benefits.source.kind, "table_order");
    fails(() => preview(f, input), "BENEFITS_TABLE_PAID_REQUIRED");
  }
  const order = tableOrder(f), bound = { businessId: "b1", customerId: "c1", source: { kind: "table_order", id: order.id },
    channel: "desktop_desk", currency: "TRY", lines: [{ productId: "p1", quantityTenThousandths: 10000 }], paymentMethodId: "cash", requestedPointsMinor: 0 };
  const ports = benefits.tableOrderBenefitsPorts(f.authority, bound);
  for (const change of [{ businessId: "b2" }, { customerId: "c3" }, { source: { kind: "sale", id: order.id } }, { channel: "companion" }])
    assert.throws(() => ports.authorize(f.db, { ...bound, ...change }, "checkout"));
  fails(() => ports.authorize(f.db, bound, "refund"), "BENEFITS_CONTEXT_SCOPE"); assert.equal(ports.readFullRefund(f.db, bound.source), null);
  f.db.exec("UPDATE business_capabilities SET is_enabled=0 WHERE capability_id='commerce.benefits'");
  const keyLoads = f.state.keyLoads; assert.equal(benefits.getTableOrderBenefitsState(f.db).enabled, false);
  assert.equal(tables.closeTableOrder(f.db, { orderId: order.id, status: "paid" }).ok, true); assert.equal(f.state.keyLoads, keyLoads);
  assert.equal(f.db.prepare("SELECT payment_method FROM finance_entries WHERE source_id=?").get(order.id).payment_method, "unspecified");
});

test("actual native IPC/preload guard rejects untrusted/locked before DB/key; uncertain response retries identical committed command", async t => {
  const f = use(t), handlers = new Map(), root = mkdtempSync(join(tmpdir(), "table-ipc-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  let dbReads = 0, keyReads = 0, locked = false, loseResponse = false, bridge;
  const electron = { app: { getPath: () => root }, ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, safeStorage: {
    isEncryptionAvailable() { keyReads++; assert.equal(f.db.isTransaction, false); return true; }, getSelectedStorageBackend: () => "gnome_libsecret",
    encryptString: value => Buffer.from(value), decryptString: value => value.toString() }, contextBridge: { exposeInMainWorld(_name, value) { bridge = value; } } };
  const modules = mockedTableModules(electron);
  const ownerFacade = { getTableOrderBenefitsState: () => benefits.getTableOrderBenefitsState(f.db),
    previewTableOrderBenefits: (input, owner) => benefits.previewTableOrderBenefits(f.db, input, owner),
    settleTableOrderBenefits: (input, owner) => benefits.settleTableOrderBenefits(f.db, input, owner), closeTableOrder: input => tables.closeTableOrder(f.db, input) };
  modules.ipc.registerTableOrderIpcHandlers({ getDatabase() { dbReads++; return ownerFacade; }, assertUnlocked() { if (locked) throw new Error("locked"); },
    assertCapability() {}, isTrustedRendererUrl: url => url === "file:///trusted/index.html" });
  const frame = { url: "file:///trusted/index.html" }, sender = { getType: () => "window", mainFrame: frame }, event = { sender, senderFrame: frame };
  const order = tableOrder(f), input = request(order);
  for (const bad of [{ ...event, senderFrame: { url: frame.url } }, { ...event, senderFrame: null }, { ...event, sender: { ...sender, getType: () => "webview" } }]) {
    for (const channel of ["tableOrder:benefitsState", "tableOrder:previewBenefits", "tableOrder:close"]) {
      const payload = channel === "tableOrder:close" ? { ...command(input, { quote: {} }) } : input;
      assert.equal(handlers.get(channel)(bad, payload).code, "BENEFITS_STAFF_REQUIRED");
    }
  }
  frame.url = "https://evil.test"; assert.equal(handlers.get("tableOrder:benefitsState")(event).code, "BENEFITS_STAFF_REQUIRED"); frame.url = "file:///trusted/index.html";
  locked = true; assert.equal(handlers.get("tableOrder:previewBenefits")(event, input).code, "BENEFITS_SESSION_LOCKED"); locked = false;
  assert.equal(dbReads, 0); assert.equal(keyReads, 0);
  electron.ipcRenderer = { invoke: async (channel, ...args) => {
    if (channel === "appLock:getStatus") return { locked };
    const result = handlers.get(channel)(event, ...args);
    if (loseResponse && channel === "tableOrder:close") throw new Error("uncertain_transport");
    return result;
  } };
  modules.preload(); assert.equal((await bridge.getTableOrderBenefitsState()).value.enabled, true); assert.equal(keyReads, 0);
  const key = new (load("commerce-benefits-key").CommerceBenefitsKey)(root, electron.safeStorage).load();
  const ownerRules = load("commerce-benefits-rules");
  const coupon = ownerRules.withCommerceBenefitsTransaction(f.db, Date.now(), tx => ownerRules.issueCommerceBenefitCoupon(tx, "b1", key,
    { ruleId: "coupon100", maxUses: 1, maxUsesPerCustomer: 1, expiresAt: Date.now() + 600000 }));
  const couponInput = { ...input, couponCode: coupon.secret };
  const quoted = await bridge.previewTableOrderBenefits(couponInput); assert.equal(quoted.ok, true, JSON.stringify(quoted));
  const paidInput = command(couponInput, quoted.value); loseResponse = true;
  await assert.rejects(bridge.settleTableOrderBenefits(paidInput), /uncertain_transport/); assert.equal(n(f, "table_order_settlements"), 1);
  loseResponse = false;
  const attempts = f.db.prepare("SELECT attempts FROM commerce_benefit_coupon_rate_limits").all();
  const replay = await bridge.settleTableOrderBenefits(paidInput); assert.equal(replay.ok, true); assert.equal(n(f, "table_order_settlements"), 1);
  assert(!JSON.stringify(replay).includes(coupon.secret));
  assert.deepEqual(f.db.prepare("SELECT attempts FROM commerce_benefit_coupon_rate_limits").all(), attempts);
  locked = true; await assert.rejects(bridge.previewTableOrderBenefits(input), /kilitli/);
  assert.equal(readFileSync("apps/desktop-app/src/components/restaurant/table-order-operations.ts", "utf8").includes("settleTableOrderBenefits"), false, "Legacy order operations must stay separate from the explicit opt-in command");
});
