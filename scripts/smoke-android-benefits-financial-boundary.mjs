import assert from "node:assert/strict";
import { saleFixture, load } from "./test-helpers/market-sale-benefits-fixture.mjs";
import { installRules, adjust } from "./test-helpers/commerce-benefits-fixture.mjs";

// Current TypeScript owners and current schema; no dist-electron or live data.
const { applyAndroidActionTransaction } = load("android-action-application-service");
const { readEnabledBusinessCapabilities } = load("business-capability-store");
const { withCommerceBenefitsTransaction, benefitsOperation } = load("commerce-benefits-rules");
const f = saleFixture();
try {
  const db = f.db;
  for (const cap of ["service.android", "core.finance", "commerce.customer_credit", "retail.barcode"]) {
    db.prepare("INSERT INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(cap);
  }
  db.exec("INSERT INTO android_devices (id,device_id,role,is_active,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('d1','device-one','admin',1,'fixture','fixture','fixture','fixture')");
  db.exec("UPDATE android_devices SET is_active=1 WHERE id='d1'");
  db.exec("INSERT INTO android_devices (id,device_id,role,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('d2','device-two','admin','fixture','fixture','fixture','fixture'); UPDATE android_devices SET is_active=1 WHERE id='d2'");
  installRules(f); adjust(f);
  // This fixture tests the legacy sale/credit financial boundary, not C20 protected cash earn.
  // Production earn is covered by smoke-companion-points-production-path.mjs; never bypass it here.
  db.prepare("UPDATE commerce_benefit_settings SET points_enabled=0 WHERE business_id='b1'").run();
  const caps = readEnabledBusinessCapabilities(db);
  const line = { product_id: "p1", quantity: 1, expected_unit_price: 1000, expected_currency: "TRY", expected_updated_at: "fixture" };
  const sale = { lines: [line], location_id: "loc", settlement: "paid", customer_id: "", payment_method: "cash", external_payment_confirmed: false };
  const credit = { ...sale, settlement: "credit", customer_id: "c1", payment_method: "" };
  const action = (id, type, payload) => ({ id, action_type: type, device_id: "device-one", payload, created_at: "2026-10-29T00:00:00.000Z" });
  const apply = a => applyAndroidActionTransaction(db, a, caps);
  const tables = ["commerce_sales", "commerce_sale_items", "commerce_sale_settlements", "inventory_movements", "customer_credit_entries", "finance_entries", "android_action_receipts", "commerce_market_sale_receipts", "commerce_benefit_point_ledger", "commerce_benefit_reservations", "commerce_benefit_snapshots", "commerce_benefit_coupon_redemptions"];
  const state = () => Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n]));
  const rejected = (a, pattern) => { const before = state(); const result = apply(a); assert.equal(result.ok, false, JSON.stringify(a.payload)); if (pattern) assert.ok(pattern.test(result.message) || (a.action_type === "market_sale_complete" && ["Mobil nakit satışının Puan kazanımı güvenli biçimde kesinleştirilemedi.", "Mobil nakit satışının Puan kazanımı doğrulanamadı."].includes(result.message)), `Unexpected protected rejection: ${result.message}`); assert.deepEqual(state(), before); };
  // Disabled customer capability with an active earn rule must fail closed as a result,
  // never throw before BEGIN or silently downgrade to an unprotected cash sale.
  db.prepare("UPDATE commerce_benefit_settings SET points_enabled=1 WHERE business_id='b1'").run();
  db.prepare("UPDATE business_capabilities SET is_enabled=0 WHERE business_id='b1' AND capability_id='core.customers'").run();
  rejected(action("blocked_active_cash_earn", "market_sale_complete", { ...sale, customer_id: "c1" }), /Puan kazanımı doğrulanamadı/);
  db.prepare("UPDATE business_capabilities SET is_enabled=1 WHERE business_id='b1' AND capability_id='core.customers'").run();
  db.prepare("UPDATE commerce_benefit_settings SET points_enabled=0 WHERE business_id='b1'").run();
  const forged = { benefits: { requestedPointsMinor: 1 }, coupon_code: "test", points_minor: 1, discount_minor: 1, total_minor: 1, availableMinor: 123, current_balance: 123 };
  for (const [key, value] of Object.entries(forged)) {
    rejected(action(`forged_sale_${key}`, "market_sale_complete", { ...sale, [key]: value }), /alan/);
    rejected(action(`forged_customer_sale_${key}`, "market_sale_complete", { ...sale, customer_id: "c1", [key]: value }), /alan/);
    rejected(action(`forged_line_${key}`, "market_sale_complete", { ...sale, lines: [{ ...line, [key]: value }] }), /alan/);
  }
  db.prepare(`INSERT INTO android_devices (id,device_id,role,is_active,permissions_json,first_seen_at,last_seen_at,created_at,updated_at)
    VALUES ('staff','staff-device','staff',1,?,'fixture','fixture','fixture','fixture')`).run(JSON.stringify(["market.product.view", "market.sale.complete", "customer_credit.view"]));
  db.exec("UPDATE android_devices SET is_active=1 WHERE id='staff'");
  rejected({ ...action("staff_customer_1", "market_sale_complete", { ...sale, customer_id: "c1" }), device_id: "staff-device" }, /müşteri görüntüleme/);
  rejected(action("foreign_customer", "market_sale_complete", { ...sale, customer_id: "c3" }), /müşteri/i);
  db.prepare("UPDATE customers SET deleted_at='deleted' WHERE id='c2'").run();
  rejected(action("deleted_customer", "market_sale_complete", { ...sale, customer_id: "c2" }), /müşteri/i);
  db.prepare("UPDATE customers SET deleted_at='' WHERE id='c2'").run();
  db.prepare("UPDATE business_capabilities SET is_enabled=0 WHERE business_id='b1' AND capability_id='core.customers'").run();
  rejected(action("disabled_customer", "market_sale_complete", { ...sale, customer_id: "c1" }), /müşteri/i);
  db.prepare("UPDATE business_capabilities SET is_enabled=1 WHERE business_id='b1' AND capability_id='core.customers'").run();
  db.prepare("INSERT INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1','commerce.wholesale','fixture','fixture')").run();
  db.prepare("INSERT INTO customer_commercial_profiles(customer_id,business_id,company_name,dealer_status,price_group,created_at,updated_at) VALUES ('c1','b1','Dealer','active','dealer_a','fixture','fixture')").run();
  rejected(action("stale_dealer_price", "market_sale_complete", { ...sale, customer_id: "c1" }), /fiyat/i);
  db.prepare("UPDATE business_capabilities SET is_enabled=0 WHERE capability_id='commerce.wholesale'").run();
  db.exec("CREATE TRIGGER fail_android_sale_finance BEFORE INSERT ON finance_entries WHEN NEW.source_type='commerce_sale' BEGIN SELECT RAISE(ABORT, 'finance failure'); END");
  rejected(action("rollback_customer", "market_sale_complete", { ...sale, customer_id: "c1" }));
  db.exec("DROP TRIGGER fail_android_sale_finance");
  db.prepare("UPDATE android_devices SET permissions_json=? WHERE id='staff'").run(JSON.stringify(["market.product.view", "market.sale.complete", "customer.view"]));
  const beforeStaffBenefits = state();
  const staffResult = apply({ ...action("staff_allowed_sale", "market_sale_complete", { ...sale, customer_id: "c1" }), device_id: "staff-device" });
  assert.equal(staffResult.ok, true, staffResult.message);
  for (const table of ["commerce_benefit_point_ledger", "commerce_benefit_reservations", "commerce_benefit_snapshots", "commerce_benefit_coupon_redemptions"]) assert.equal(state()[table], beforeStaffBenefits[table], table);
  rejected({ ...action("staff_forged_benefits", "market_sale_complete", { ...sale, customer_id: "c1", benefits: { requestedPointsMinor: 1 } }), device_id: "staff-device" }, /alan/);
  const beforeBenefits = state();
  const linked = action("paid_customer_1", "market_sale_complete", { ...sale, customer_id: "c1" });
  const linkedResult = apply(linked); assert.equal(linkedResult.ok, true, linkedResult.message);
  const linkedSale = db.prepare("SELECT id, customer_id FROM commerce_sales WHERE source = 'android-market-sale' ORDER BY rowid DESC LIMIT 1").get();
  assert.equal(linkedSale.customer_id, "c1");
  assert.equal(db.prepare("SELECT amount_minor FROM finance_entries WHERE source_id = ?").get(linkedSale.id).amount_minor, 100000);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM commerce_sale_settlements").get().n, 0);
  const linkedState = state(); assert.equal(apply(linked).alreadyApplied, true); assert.deepEqual(state(), linkedState);
  rejected({ ...linked, payload: { ...linked.payload, customer_id: "c2" } }, /farklı/);
  rejected({ ...linked, device_id: "device-two" }, /farklı/);
  const paidSale = action("paid_sale_0001", "market_sale_complete", sale);
  const paidSaleResult = apply(paidSale); assert.equal(paidSaleResult.ok, true, paidSaleResult.message);
  assert.equal(db.prepare("SELECT customer_id FROM commerce_sales WHERE source = 'android-market-sale' ORDER BY rowid DESC LIMIT 1").get().customer_id, null);
  const first = action("credit_sale_001", "market_sale_complete", credit);
  assert.deepEqual({ ...db.prepare("SELECT is_active, revoked_at FROM android_devices WHERE device_id='device-one'").get() }, { is_active: 1, revoked_at: null });
  const creditResult = apply(first); assert.equal(creditResult.ok, true, creditResult.message);
  const payment = { customer_id: "c1", amount_minor: 100, currency: "TRY", expected_balance_minor: 100000, payment_method: "cash", external_payment_confirmed: false };
  for (const [key, value] of Object.entries(forged)) rejected(action(`forged_pay_${key}`, "customer_credit_payment_add", { ...payment, [key]: value }), /alan/);
  rejected(action("stale_payment_1", "customer_credit_payment_add", { ...payment, expected_balance_minor: 1 }), /bakiye/);
  const pay = action("credit_payment_01", "customer_credit_payment_add", payment);
  const paid = apply(pay); assert.equal(paid.ok, true, paid.message);
  const after = state();
  for (const table of ["commerce_benefit_point_ledger", "commerce_benefit_reservations", "commerce_benefit_snapshots", "commerce_benefit_coupon_redemptions"]) assert.equal(after[table], beforeBenefits[table], table);
  for (const original of [paidSale, first, pay]) {
    const unchanged = state(); assert.equal(apply(original).alreadyApplied, true); assert.deepEqual(state(), unchanged);
    rejected({ ...original, payload: { ...original.payload, forged: true } }, /farklı/);
    rejected({ ...original, device_id: "device-two" }, /farklı/);
  }
  assert.equal(apply({ ...pay, payload: Object.fromEntries(Object.entries(pay.payload).reverse()) }).alreadyApplied, true);
  rejected({ ...pay, payload: { ...payment, amount_minor: 99 } }, /farklı/);
  rejected({ ...first, payload: { ...credit, lines: [{ ...line, quantity: 2 }] } }, /farklı/);
  db.exec("BEGIN IMMEDIATE");
  try {
    assert.throws(() => withCommerceBenefitsTransaction(db, 1, () => {}), /BENEFITS_PARENT_TRANSACTION_REQUIRED/);
    assert.throws(() => benefitsOperation({ database: db, now: 1 }, () => {}), /BENEFITS_PARENT_TRANSACTION_REQUIRED/);
    assert.equal(db.isTransaction, true);
  } finally { db.exec("ROLLBACK"); }
  console.log("PASS source-backed Android financial benefits boundary");
} finally { f.close(); }
