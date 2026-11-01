import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { saleFixture, databaseState, load } from "./test-helpers/market-sale-benefits-fixture.mjs";
import { capabilities } from "./test-helpers/commerce-benefits-fixture.mjs";

const { applyAndroidActionTransaction } = load("android-action-application-service");
const { readEnabledBusinessCapabilities } = load("business-capability-store");
const { listMarketSaleHistory, getFullRefundMarketSalePreview } = load("market-sale-full-refund");
const f = saleFixture();
try {
  for (const cap of ["service.android", "core.finance", "commerce.customer_credit", "retail.barcode"])
    f.db.prepare("INSERT OR IGNORE INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(cap);
  f.db.exec("INSERT INTO android_devices (id,device_id,role,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('d1','device-one','admin','fixture','fixture','fixture','fixture'); UPDATE android_devices SET is_active=1 WHERE id='d1'");
  const action = { id: "history_android_01", action_type: "market_sale_complete", device_id: "device-one", created_at: "2026-10-29T00:00:00.000Z", payload: {
    lines: [{ product_id: "p1", quantity: 1, expected_unit_price: 1000, expected_currency: "TRY", expected_updated_at: "fixture" }],
    location_id: "loc", settlement: "paid", customer_id: "c1", payment_method: "cash", external_payment_confirmed: false } };
  const caps = readEnabledBusinessCapabilities(f.db);
  const result = applyAndroidActionTransaction(f.db, action, caps); assert.equal(result.ok, true, result.message);
  const mobile = f.db.prepare("SELECT id,opened_at FROM commerce_sales WHERE source='android-market-sale'").get();
  const insert = f.db.prepare(`INSERT INTO commerce_sales(id,business_id,status,total,currency,payment_method,source,opened_at,closed_at,created_at,updated_at)
    VALUES (?,?,?,10,'TRY','cash',?,?,?,'fixture','fixture')`);
  insert.run("tie_desktop", "b1", "paid", "desktop-market-quick-sale", mobile.opened_at, mobile.opened_at);
  insert.run("excluded_other", "b1", "paid", "commerce-order", mobile.opened_at, mobile.opened_at);
  insert.run("excluded_credit", "b1", "credit", "android-market-sale", mobile.opened_at, mobile.opened_at);
  insert.run("excluded_tenant", "b2", "paid", "android-market-sale", mobile.opened_at, mobile.opened_at);
  insert.run("excluded_order", "b1", "paid", "android-market-sale", mobile.opened_at, mobile.opened_at);
  for (const capability of capabilities.expandBusinessCapabilities(["commerce.orders"]))
    f.db.prepare("INSERT OR IGNORE INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(capability);
  const { createCommerceOrder, updateCommerceOrderStatus } = load("commerce-order-store");
  const order = createCommerceOrder(f.path, { customerId: "c1", source: "desktop", items: [{ productId: "p1", quantity: 1 }] });
  updateCommerceOrderStatus(f.path, { orderId: order.order.id, status: "confirmed" });
  const fulfillment = load("commerce-order-fulfillment-service").fulfillCommerceOrder(f.path, { orderId: order.order.id,
    operationKey: "history_order_01", settlement: { type: "paid", paymentMethod: "cash" } });
  f.db.prepare("UPDATE commerce_order_fulfillments SET sale_id='excluded_order' WHERE sale_id=?").run(fulfillment.sale.id);
  const otherAction = applyAndroidActionTransaction(f.db, { ...action, id: "history_android_02" }, caps);
  assert.equal(otherAction.ok, true, otherAction.message);
  const withTender = f.db.prepare("SELECT sale_id AS id FROM commerce_market_sale_receipts WHERE operation_id='history_android_02'").get();
  f.db.prepare("INSERT INTO commerce_sale_settlements VALUES (?, 'b1', 'c1', 'cash', 100000, 0, 'fixture')").run(withTender.id);
  assert.equal(f.db.prepare("SELECT business_id FROM commerce_sale_settlements WHERE sale_id=?").get(withTender.id).business_id, "b1");
  const before = databaseState(f.db), ids = [], sources = [];
  let cursor;
  do { const page = listMarketSaleHistory(f.path, { limit: 1, ...(cursor ? { cursor } : {}) }, f.authority);
    ids.push(...page.items.map(item => item.saleId)); sources.push(...page.items.map(item => item.source)); cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(ids, [mobile.id, "tie_desktop"].sort().reverse());
  assert.equal(sources[ids.indexOf(mobile.id)], "android-market-sale");
  assert.equal(sources[ids.indexOf("tie_desktop")], "desktop-market-quick-sale");
  const preview = getFullRefundMarketSalePreview(f.path, mobile.id, f.authority);
  assert.equal(preview.eligible, true); assert.equal(preview.source, "android-market-sale"); assert.equal(preview.pointsMinor, 0);
  assert.equal(getFullRefundMarketSalePreview(f.path, "excluded_credit", f.authority).eligible, false);
  assert.equal(getFullRefundMarketSalePreview(f.path, "excluded_tenant", f.authority).eligible, false);
  assert.equal(getFullRefundMarketSalePreview(f.path, "excluded_order", f.authority).eligible, false);
  assert.equal(getFullRefundMarketSalePreview(f.path, withTender.id, f.authority).eligible, false);
  assert.deepEqual(databaseState(f.db), before);
  const ui = readFileSync("apps/desktop-app/src/components/finance/MarketSaleHistory.tsx", "utf8");
  assert.match(ui, /item\.source\s*===\s*"android-market-sale"\s*&&\s*<>Telefon/);
  console.log("PASS Android history and refund preview scope");
} finally { f.close(); }
