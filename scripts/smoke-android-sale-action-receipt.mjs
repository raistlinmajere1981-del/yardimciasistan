import assert from "node:assert/strict";
import { test } from "node:test";
import { saleFixture, databaseState, load } from "./test-helpers/market-sale-benefits-fixture.mjs";

const { applyAndroidActionTransaction: apply } = load("android-action-application-service");
const receiptForAck = load("android-action-application-service").androidSaleReceiptForAck;
const { readEnabledBusinessCapabilities } = load("business-capability-store");
for (const settlement of ["paid", "credit"]) test(`${settlement} Android sale has immutable canonical replay receipt`, t => {
  const f = saleFixture(); t.after(() => f.close());
  for (const cap of ["service.android", "core.finance", "commerce.customer_credit", "retail.barcode"])
    f.db.prepare("INSERT OR IGNORE INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(cap);
  f.db.exec("INSERT INTO android_devices (id,device_id,role,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('d1','device-one','admin','fixture','fixture','fixture','fixture')");
  f.db.exec("UPDATE android_devices SET is_active=1 WHERE id='d1'");
  const caps = readEnabledBusinessCapabilities(f.db);
  const action = { id: `receipt_${settlement}_001`, action_type: "market_sale_complete", device_id: "device-one", created_at: "2026-10-29T00:00:00.000Z", payload: {
    lines: [{ product_id: "p1", quantity: 1, expected_unit_price: 1000, expected_currency: "TRY", expected_updated_at: "fixture" }],
    location_id: "loc", settlement, customer_id: "c1", payment_method: settlement === "paid" ? "cash" : "", external_payment_confirmed: false } };
  const first = apply(f.db, action, caps); assert.equal(first.ok, true, first.message);
  assert.ok(first.receipt, "canonical receipt required");
  assert.equal(typeof receiptForAck, "function", "private scoped ACK adapter required");
  assert.deepEqual(receiptForAck(action, first, "device-one", "b1"), first.receipt);
  assert.equal(receiptForAck(action, first, "device-two", "b1"), undefined);
  assert.equal(receiptForAck(action, first, "device-one", "b2"), undefined);
  assert.equal(receiptForAck({ ...action, payload: { ...action.payload, customer_id: "c2" } }, first, "device-one", "b1"), undefined);
  assert.equal(receiptForAck({ ...action, payload: { ...action.payload, lines: [{ ...action.payload.lines[0], expected_unit_price: 1 }] } }, first, "device-one", "b1"), undefined);
  assert.equal(receiptForAck({ ...action, payload: { ...action.payload, pointsTenderMinor: 100 } }, first, "device-one", "b1"), undefined);
  assert.equal(receiptForAck(action, { ...first, receipt: { ...first.receipt, pointsTenderMinor: 1 } }, "device-one", "b1"), undefined);
  assert.equal(receiptForAck({ ...action, action_type: "market_stock_count" }, first, "device-one", "b1"), undefined);
  assert.equal(receiptForAck(action, { ok: false, message: "failed" }, "device-one", "b1"), undefined);
  assert.equal(first.receipt.source, "android-market-sale"); assert.equal(first.receipt.businessId, "b1");
  assert.equal(first.receipt.customerId, "c1"); assert.equal(first.receipt.cashPaidMinor, settlement === "paid" ? 100000 : 0);
  assert.equal(first.receipt.pointsTenderMinor, 0); assert.equal(first.receipt.currency, "TRY");
  assert.equal(f.db.prepare("SELECT result_json FROM android_market_sale_result_receipts WHERE action_id=?").get(action.id).result_json, JSON.stringify(first.receipt));
  assert.equal(first.receipt.actionId, action.id); assert.equal(first.receipt.deviceId, action.device_id);
  assert.match(first.receipt.intentHash, /^[a-f0-9]{64}$/);
  assert.equal(first.receipt.paymentMethod, settlement === "paid" ? "cash" : "");
  const before = databaseState(f.db), replay = apply(f.db, action, caps);
  assert.equal(replay.ok, true); assert.equal(replay.alreadyApplied, true); assert.equal(JSON.stringify(replay.receipt), JSON.stringify(first.receipt));
  assert.deepEqual(receiptForAck(action, replay, "device-one", "b1"), first.receipt);
  assert.deepEqual(databaseState(f.db), before);
  assert.throws(() => f.db.prepare("UPDATE android_market_sale_result_receipts SET result_json='{}' WHERE action_id=?").run(action.id), /immutable/);
  assert.throws(() => f.db.prepare("DELETE FROM android_market_sale_result_receipts WHERE action_id=?").run(action.id), /immutable/);
  assert.equal(apply(f.db, { ...action, payload: { ...action.payload, customer_id: "c2" } }, caps).ok, false);
  f.db.exec("INSERT INTO android_devices (id,device_id,role,is_active,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('d2','device-two','admin',1,'fixture','fixture','fixture','fixture')");
  assert.equal(apply(f.db, { ...action, device_id: "device-two" }, caps).ok, false);
  f.db.prepare("UPDATE business_capabilities SET is_enabled=0 WHERE business_id='b1' AND capability_id='commerce.sales'").run();
  assert.equal(apply(f.db, action, caps).ok, false);
  f.db.prepare("UPDATE business_capabilities SET is_enabled=1 WHERE business_id='b1' AND capability_id='commerce.sales'").run();
  f.db.prepare("UPDATE android_devices SET is_active=0 WHERE device_id='device-one'").run();
  const revoked = apply(f.db, action, caps); assert.equal(revoked.ok, false);
  assert.equal(receiptForAck(action, revoked, "device-one", "b1"), undefined);
  f.db.prepare("UPDATE android_devices SET is_active=1 WHERE device_id='device-one'").run();
  assert.deepEqual(apply(f.db, action, caps).receipt, first.receipt);
  f.db.exec(`INSERT OR IGNORE INTO business_capabilities(business_id,capability_id,is_enabled,created_at,updated_at)
    SELECT 'b2',capability_id,is_enabled,'fixture','fixture' FROM business_capabilities WHERE business_id='b1'`);
  f.db.prepare("UPDATE business SET deleted_at='inactive' WHERE id='b1'").run();
  assert.equal(f.db.prepare("SELECT id FROM business WHERE deleted_at='' ORDER BY created_at ASC LIMIT 1").get().id, "b2");
  const otherTenant = apply(f.db, action, caps);
  assert.equal(otherTenant.ok, false, "receipt must not replay for another active business");
  assert.equal(otherTenant.receipt, undefined);
  f.db.prepare("UPDATE business SET deleted_at='inactive' WHERE id='b2'").run();
  const noTenant = apply(f.db, action, caps);
  assert.equal(noTenant.ok, false); assert.equal(noTenant.receipt, undefined);
  f.db.prepare("UPDATE business SET deleted_at='' WHERE id='b2'").run();
  f.db.prepare("UPDATE business SET deleted_at='' WHERE id='b1'").run();
  assert.deepEqual(apply(f.db, action, caps).receipt, first.receipt);
  assert.equal(f.db.prepare("SELECT count(*) n FROM commerce_sales").get().n, 1);
  assert.equal(f.db.prepare("SELECT count(*) n FROM finance_entries WHERE source_type='commerce_sale'").get().n, settlement === "paid" ? 1 : 0);
  assert.equal(f.db.prepare("SELECT count(*) n FROM inventory_movements WHERE reference_type='commerce_sale'").get().n, 1);
});

test("receipt insertion failure rolls back sale, stock, finance and action receipt", t => {
  const f = saleFixture(); t.after(() => f.close());
  for (const cap of ["service.android", "core.finance", "commerce.customer_credit", "retail.barcode"])
    f.db.prepare("INSERT OR IGNORE INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(cap);
  f.db.exec("INSERT INTO android_devices (id,device_id,role,is_active,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('d1','device-one','admin',1,'fixture','fixture','fixture','fixture')");
  f.db.exec("CREATE TRIGGER fail_result BEFORE INSERT ON android_market_sale_result_receipts BEGIN SELECT RAISE(ABORT,'test failure'); END");
  const action = { id: "receipt_rollback_01", action_type: "market_sale_complete", device_id: "device-one", created_at: "2026-10-29T00:00:00.000Z", payload: {
    lines: [{ product_id: "p1", quantity: 1, expected_unit_price: 1000, expected_currency: "TRY", expected_updated_at: "fixture" }],
    location_id: "loc", settlement: "paid", customer_id: "c1", payment_method: "cash", external_payment_confirmed: false } };
  const before = databaseState(f.db);
  assert.equal(apply(f.db, action, readEnabledBusinessCapabilities(f.db)).ok, false);
  assert.deepEqual(databaseState(f.db), before);
  assert.equal(f.db.prepare("SELECT count(*) n FROM android_action_receipts WHERE id=?").get(action.id).n, 0);
});
