import assert from "node:assert/strict";
import { test } from "node:test";
import { Worker } from "node:worker_threads";
import { saleFixture, databaseState, load } from "./test-helpers/market-sale-benefits-fixture.mjs";

const { applyAndroidActionTransaction } = load("android-action-application-service");
const { readEnabledBusinessCapabilities } = load("business-capability-store");
const { fullRefundMarketSale } = load("market-sale-full-refund");
function setup(t, mixed = false) {
  const f = saleFixture(); t.after(() => f.close());
  for (const cap of ["service.android", "core.finance", "commerce.customer_credit", "retail.barcode"])
    f.db.prepare("INSERT OR IGNORE INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(cap);
  f.db.exec("INSERT INTO android_devices (id,device_id,role,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('d1','device-one','admin','fixture','fixture','fixture','fixture'); UPDATE android_devices SET is_active=1 WHERE id='d1'");
  const caps = readEnabledBusinessCapabilities(f.db);
  const action = { id: "android_sale_001", action_type: "market_sale_complete", device_id: "device-one", created_at: "2026-10-29T00:00:00.000Z", payload: {
    lines: [{ product_id: "p1", quantity: 1, expected_unit_price: 1000, expected_currency: "TRY", expected_updated_at: "fixture" }],
    location_id: "loc", settlement: "paid", customer_id: "c1", payment_method: "cash", external_payment_confirmed: false } };
  if (mixed) {
    f.db.prepare("INSERT INTO catalog_products(id,business_id,category_id,name,sale_price,currency,created_at,updated_at) VALUES ('p2','b1','category1','Second',1000,'TRY','fixture','fixture')").run();
    f.db.prepare("INSERT INTO inventory_balances(product_id,location_id,quantity,updated_at) VALUES ('p2','loc',50,'fixture')").run();
    action.payload.lines.push({ product_id: "p2", quantity: 1, expected_unit_price: 1000, expected_currency: "TRY", expected_updated_at: "fixture" });
  }
  const result = applyAndroidActionTransaction(f.db, action, caps); assert.equal(result.ok, true, result.message);
  const sale = f.db.prepare("SELECT * FROM commerce_sales WHERE source='android-market-sale'").get();
  return { ...f, sale, action, caps };
}
const cmd = (id, operationId = "android_refund_01") => ({ saleId: id, operationId, kind: "full" });
const refund = (f, operationId) => fullRefundMarketSale(f.path, cmd(f.sale.id, operationId), f.authority);

test("owner refunds Android sale exactly once with persisted source, stock and Finance", t => {
  const f = setup(t), db = f.db;
  assert.throws(() => db.prepare("UPDATE commerce_sales SET source='desktop-market-quick-sale' WHERE id=?").run(f.sale.id), /immutable/);
  assert.equal(applyAndroidActionTransaction(db, { ...f.action, id: "forged_refund_01", action_type: "market_sale_refund", payload: cmd(f.sale.id) }, f.caps).ok, false);
  assert.throws(() => fullRefundMarketSale(f.path, cmd(f.sale.id), { ...f.authority, actor: { id: "device-one", role: "admin", assertAuthorized() {} } }), e => e.code === "REFUND_SCOPE");
  const beforeLedger = db.prepare("SELECT count(*) n FROM commerce_benefit_point_ledger").get().n;
  const result = refund(f); assert.equal(result.replayed, false); assert.equal(result.receipt.customerId, "c1");
  assert.equal(result.receipt.cashMinor, 100000); assert.equal(result.receipt.pointsMinor, 0); assert.equal(result.receipt.benefits, null);
  assert.equal(db.prepare("SELECT source FROM commerce_sale_full_refunds WHERE id=?").get(result.receipt.refundId).source, "android-market-sale");
  assert.equal(db.prepare("SELECT actor_source FROM inventory_movements WHERE reference_type='commerce_sale_refund' AND reference_id=?").get(result.receipt.refundId).actor_source, "android-market-sale");
  assert.equal(db.prepare("SELECT quantity FROM inventory_balances WHERE product_id='p1' AND location_id='loc'").get().quantity, 50);
  assert.equal(db.prepare("SELECT amount_minor FROM finance_entries WHERE source_type='commerce_sale_refund' AND source_id=?").get(result.receipt.refundId).amount_minor, 100000);
  const state = databaseState(db); assert.deepEqual(refund(f), { receipt: result.receipt, replayed: true }); assert.deepEqual(databaseState(db), state);
  assert.throws(() => refund(f, "different_refund"), e => e.code === "REFUND_ALREADY_COMPLETED");
  assert.throws(() => fullRefundMarketSale(f.path, { ...cmd(f.sale.id), source: "desktop-market-quick-sale" }, f.authority), e => e.code === "REFUND_INVALID_COMMAND");
  assert.equal(db.prepare("SELECT count(*) n FROM commerce_benefit_point_ledger").get().n, beforeLedger);
  assert.equal(db.prepare("SELECT count(*) n FROM finance_entries WHERE source_type='commerce_sale_refund'").get().n, 1);
  assert.throws(() => db.prepare("UPDATE commerce_sale_full_refund_receipts SET receipt_json='{}' WHERE refund_id=?").run(result.receipt.refundId), /immutable/);
  const second = applyAndroidActionTransaction(db, { ...f.action, id: "android_sale_002" }, f.caps); assert.equal(second.ok, true, second.message);
  const other = db.prepare("SELECT id FROM commerce_sales WHERE source='android-market-sale' AND id != ?").get(f.sale.id);
  assert.throws(() => fullRefundMarketSale(f.path, cmd(other.id), f.authority), e => e.code === "REFUND_INTENT_CHANGED");
});

test("mismatched stock source fails closed", t => {
  const f = setup(t); f.db.prepare("UPDATE inventory_movements SET actor_source='desktop-market-quick-sale' WHERE reference_id=?").run(f.sale.id);
  const before = databaseState(f.db); assert.throws(() => refund(f), e => e.code === "REFUND_STOCK_UNSAFE"); assert.deepEqual(databaseState(f.db), before);
});

test("mixed stock actors reject the whole Android refund", t => {
  const f = setup(t, true);
  f.db.prepare("UPDATE inventory_movements SET actor_source='desktop-market-quick-sale' WHERE reference_id=? AND product_id='p2'").run(f.sale.id);
  const actors = f.db.prepare("SELECT actor_source FROM inventory_movements WHERE reference_id=? ORDER BY product_id").all(f.sale.id).map(r => r.actor_source);
  assert.deepEqual(actors, ["android-market-sale", "desktop-market-quick-sale"]);
  const before = databaseState(f.db); assert.throws(() => refund(f), e => e.code === "REFUND_STOCK_UNSAFE"); assert.deepEqual(databaseState(f.db), before);
});

test("Finance failure rolls back parent, ledger and stock", t => {
  const f = setup(t); f.db.exec("CREATE TRIGGER fail_refund_finance BEFORE INSERT ON finance_entries WHEN NEW.source_type='commerce_sale_refund' BEGIN SELECT RAISE(ABORT,'refund_failure'); END");
  const before = databaseState(f.db); assert.throws(() => refund(f), /refund_failure/); assert.deepEqual(databaseState(f.db), before);
});

test("Android tender evidence is rejected without settlement or key access", t => {
  const f = setup(t);
  f.db.prepare("INSERT INTO commerce_sale_settlements VALUES (?, 'b1', 'c1', 'cash', 100000, 0, 'fixture')").run(f.sale.id);
  f.authority.keys.load = () => { throw new Error("key should not load"); };
  const before = databaseState(f.db); assert.throws(() => refund(f), e => e.code === "REFUND_EVIDENCE_CONFLICT"); assert.deepEqual(databaseState(f.db), before);
});

test("forged Android benefits snapshot is rejected without key or ledger reversal", t => {
  const f = setup(t), db = f.db;
  db.prepare(`INSERT INTO commerce_benefit_reservations (business_id,id,customer_id,source_kind,source_id,currency,status,intent_json,context_json,quote_json,rules_json,points_minor,created_at_ms,expires_at_ms)
    VALUES ('b1','forged_reservation','c1','sale',?,'TRY','settled','{}','{}','{}','{}',0,1,2)`).run(f.sale.id);
  db.prepare(`INSERT INTO commerce_benefit_snapshots VALUES ('b1','forged_snapshot',1,'forged_reservation','sale',?,'{}','{}','{}',1)`).run(f.sale.id);
  f.authority.keys.load = () => { throw new Error("key should not load"); };
  const before = databaseState(db); assert.throws(() => refund(f), e => e.code === "REFUND_EVIDENCE_CONFLICT"); assert.deepEqual(databaseState(db), before);
});

test("revoked owner and disabled business capability fail before write", t => {
  const f = setup(t); let calls = 0;
  f.authority.actor.assertAuthorized = () => { if (++calls === 3) throw new Error("owner_revoked"); };
  const before = databaseState(f.db); assert.throws(() => refund(f), /owner_revoked/); assert.deepEqual(databaseState(f.db), before);
  f.authority.actor.assertAuthorized = () => {};
  f.db.prepare("UPDATE business_capabilities SET is_enabled=0 WHERE business_id='b1' AND capability_id='commerce.sales'").run();
  const disabled = databaseState(f.db); assert.throws(() => refund(f), e => e.code === "REFUND_SCOPE"); assert.deepEqual(databaseState(f.db), disabled);
});

test("changed original Finance amount fails closed without reversal", t => {
  const f = setup(t); f.db.prepare("UPDATE finance_entries SET amount_minor=1 WHERE source_type='commerce_sale' AND source_id=?").run(f.sale.id);
  const before = databaseState(f.db); assert.throws(() => refund(f), e => e.code === "REFUND_EVIDENCE_CONFLICT"); assert.deepEqual(databaseState(f.db), before);
});

for (const same of [true, false]) test(`Android concurrent owner refund ${same ? "same" : "different"} operation`, async t => {
  const f = setup(t), start = new SharedArrayBuffer(4);
  const workers = [0, 1].map(i => new Worker(new URL("./test-helpers/market-sale-full-refund-concurrent.mjs", import.meta.url),
    { workerData: { path: f.path, input: cmd(f.sale.id, same ? "android_race_same" : `android_race_${i}`), start } }));
  t.after(async () => { await Promise.all(workers.map(w => w.terminate())); });
  await Promise.all(workers.map(w => new Promise((resolve, reject) => { w.once("message", resolve); w.once("error", reject); })));
  const done = workers.map(w => new Promise((resolve, reject) => { w.once("message", resolve); w.once("error", reject); }));
  Atomics.store(new Int32Array(start), 0, 1); Atomics.notify(new Int32Array(start), 0);
  const outcomes = await Promise.all(done), successes = outcomes.filter(x => x.ok);
  assert.equal(successes.length, same ? 2 : 1, JSON.stringify(outcomes));
  if (same) { assert.deepEqual(successes[0].receipt, successes[1].receipt); assert.equal(successes.filter(x => x.replayed).length, 1); }
  else assert.equal(outcomes.find(x => !x.ok).code, "REFUND_ALREADY_COMPLETED");
  assert.equal(f.db.prepare("SELECT count(*) n FROM commerce_sale_full_refunds WHERE sale_id=?").get(f.sale.id).n, 1);
  assert.equal(f.db.prepare("SELECT count(*) n FROM finance_entries WHERE source_type='commerce_sale_refund'").get().n, 1);
  assert.equal(f.db.prepare("SELECT quantity FROM inventory_balances WHERE product_id='p1' AND location_id='loc'").get().quantity, 50);
});
