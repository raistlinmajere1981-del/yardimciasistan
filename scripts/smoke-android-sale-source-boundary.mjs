import assert from "node:assert/strict";
import { saleFixture, load, completeMarketSale } from "./test-helpers/market-sale-benefits-fixture.mjs";

// Exercise current TypeScript transaction owners and schema, never live data.
const { applyAndroidActionTransaction } = load("android-action-application-service");
const { readEnabledBusinessCapabilities } = load("business-capability-store");
const { fullRefundMarketSale } = load("market-sale-full-refund");
const { marketSaleBenefitsPorts } = load("market-sale-benefits");
const f = saleFixture();
try {
  const db = f.db;
  for (const cap of ["service.android", "core.finance", "commerce.customer_credit", "retail.barcode"]) {
    db.prepare("INSERT OR IGNORE INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(cap);
  }
  db.exec("INSERT INTO android_devices (id,device_id,role,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('d1','device-one','admin','fixture','fixture','fixture','fixture'); UPDATE android_devices SET is_active=1 WHERE id='d1'");
  const caps = readEnabledBusinessCapabilities(db);
  const payload = { lines: [{ product_id: "p1", quantity: 1, expected_unit_price: 1000, expected_currency: "TRY", expected_updated_at: "fixture" }],
    location_id: "loc", settlement: "paid", customer_id: "c1", payment_method: "cash", external_payment_confirmed: false };
  const action = (id, body) => ({ id, action_type: "market_sale_complete", device_id: "device-one", payload: body, created_at: "2026-10-29T00:00:00.000Z" });
  const forged = applyAndroidActionTransaction(db, action("forged_source_01", { ...payload, source: "desktop-market-quick-sale", role: "desktop_owner" }), caps);
  assert.equal(forged.ok, false);
  assert.equal(db.prepare("SELECT count(*) n FROM commerce_sales").get().n, 0);
  const result = applyAndroidActionTransaction(db, action("mobile_source_01", payload), caps);
  assert.equal(result.ok, true, result.message);
  const sale = db.prepare("SELECT id,source,customer_id FROM commerce_sales").get();
  assert.equal(sale.source, "android-market-sale"); assert.equal(sale.customer_id, "c1");
  assert.equal(db.prepare("SELECT actor_source FROM inventory_movements WHERE reference_id=?").get(sale.id).actor_source, sale.source);
  assert.equal(db.prepare("SELECT amount_minor FROM finance_entries WHERE source_type='commerce_sale' AND source_id=?").get(sale.id).amount_minor, 100000);
  assert.equal(db.prepare("SELECT quantity FROM inventory_balances WHERE product_id='p1' AND location_id='loc'").get().quantity, 49);
  assert.equal(applyAndroidActionTransaction(db, action("mobile_source_01", payload), caps).alreadyApplied, true);
  assert.equal(db.prepare("SELECT quantity FROM inventory_balances WHERE product_id='p1' AND location_id='loc'").get().quantity, 49);
  const mobileAuthority = { ...f.authority, actor: { id: "device-one", role: "admin", assertAuthorized() {} } };
  assert.throws(() => fullRefundMarketSale(f.path, { saleId: sale.id, operationId: "mobile_refund_01", kind: "full" }, mobileAuthority), e => e.code === "REFUND_SCOPE");
  const before = db.prepare("SELECT count(*) n FROM finance_entries").get().n;
  assert.throws(() => db.prepare("UPDATE commerce_sales SET source='desktop-market-quick-sale' WHERE id=?").run(sale.id), /commerce_sale_source_immutable/);
  assert.equal(db.prepare("SELECT source FROM commerce_sales WHERE id=?").get(sale.id).source, "android-market-sale");
  assert.equal(db.prepare("UPDATE commerce_sales SET source=source WHERE id=?").run(sale.id).changes, 1);
  assert.throws(() => fullRefundMarketSale(f.path, { saleId: sale.id, operationId: "mobile_refund_02", kind: "full" }, mobileAuthority));
  assert.equal(db.prepare("SELECT count(*) n FROM finance_entries").get().n, before);
  const desktopInput = { settlement: "paid", operationId: "desktop_source_01", customerId: "c1", paymentMethod: "cash",
    items: [{ productId: "p1", quantity: 1 }], locationId: "loc" };
  const desktop = completeMarketSale(f.path, desktopInput).sale;
  assert.equal(desktop.source, "desktop-market-quick-sale");
  assert.throws(() => db.prepare("UPDATE commerce_sales SET source='android-market-sale' WHERE id=?").run(desktop.id), /commerce_sale_source_immutable/);
  assert.equal(completeMarketSale(f.path, desktopInput).replayed, true);
  assert.equal(db.prepare("SELECT quantity FROM inventory_balances WHERE product_id='p1' AND location_id='loc'").get().quantity, 48);
  assert.equal(db.prepare("SELECT count(*) n FROM finance_entries WHERE source_type='commerce_sale' AND source_id=?").get(desktop.id).n, 1);
  const actor = { role: "admin", id: "device-one", assertAuthorized() {} };
  assert.throws(() => marketSaleBenefitsPorts(actor, {}).authorize(db, {}, "checkout"), /BENEFITS_STAFF_REQUIRED/);
  console.log("PASS Android sale source: immutable source and refund boundary");
} finally { f.close(); }
