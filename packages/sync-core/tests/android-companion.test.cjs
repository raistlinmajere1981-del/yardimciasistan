const assert = require("node:assert/strict");
const test = require("node:test");
const { BUSINESS_CAPABILITIES: C } = require("../../shared/dist");
const { ANDROID_PERMISSIONS, ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS, androidEffectivePermissionsForRole,
  androidEffectivePermissionsForGroups, androidActionAllowedByCapabilities,
  projectAndroidCompanion, androidCompanionCounters, emptyAndroidCommerceSnapshot, emptyAndroidMarketingSnapshot } = require("../dist");
const caps = [C.ANDROID, C.ORDERS, C.CUSTOMERS, C.WHOLESALE, C.ONLINE_SALES, C.MARKETING_STUDIO, C.MESSAGING_CAMPAIGNS];
const now = "2026-10-12T12:00:00.000Z";
function fixture() {
  const commerce = emptyAndroidCommerceSnapshot();
  for (const source of ["desktop", "web-dealer", "web-online-sales"]) {
    commerce.orders.push({ id: source, status: "placed", source, total: 12, currency: "TRY", delivery_method: "shipping", placed_at: now, updated_at: now,
      buyer_snapshot: { phone: "PRIVATE" }, address: "PRIVATE", note: "PRIVATE", items: ["PRIVATE"] });
    commerce.order_counts.push({ source, status: "placed", count: 200 });
    commerce.shipment_counts.push({ source, pending: 300 });
    commerce.shipments.push({ id: `ship-${source}`, order_id: source, status: "ready", tracking_available: true, updated_at: now, tracking_url: "PRIVATE" });
  }
  commerce.customer_profiles.push({ customer_id: "customer-1", dealer_status: "active", price_group: "dealer_a", updated_at: now, company_name: "PRIVATE", tax_number: "PRIVATE" });
  commerce.online_catalog = { desired_product_count: 1500, pending: true, updated_at: now, products: ["PRIVATE"] };
  const marketing = { publications: [{ id: "pub-1", channel: "website", status: "failed", revision: 2, published_revision: 1, desired_published: true, updated_at: now,
    title: "PRIVATE", text: "PRIVATE", last_error: "PRIVATE", media: ["PRIVATE"] }],
    schedules: [{ id: "schedule-1", channel: "sms", target_type: "audience_campaign", status: "active", next_run_at: now, last_execution_status: "failed", updated_at: now, name: "PRIVATE" }],
    campaigns: [{ id: "campaign-1", channel: "sms", status: "running", pending_count: 4, failed_count: 3, updated_at: now, recipients: ["PRIVATE"] }] };
  return { commerce, marketing };
}

test("legacy optional snapshots and Android OFF fail closed", () => {
  const empty = { commerce: emptyAndroidCommerceSnapshot(), marketing: emptyAndroidMarketingSnapshot() };
  assert.deepEqual(projectAndroidCompanion(undefined, undefined, caps), empty);
  const f = fixture();
  assert.deepEqual(projectAndroidCompanion(f.commerce, f.marketing, caps.filter(c => c !== C.ANDROID)), empty);
  assert.deepEqual(projectAndroidCompanion(f.commerce, f.marketing, caps, []), empty);
});

test("commerce and table orders have independent capabilities and grants", () => {
  const permissions = androidEffectivePermissionsForRole("admin", [], [C.ANDROID, C.FOOD_ORDERS]);
  assert.equal(permissions.includes("commerce_order.confirm"), false);
  assert.equal(androidActionAllowedByCapabilities("commerce_order_confirm", [C.ANDROID, C.FOOD_ORDERS]), false);
  assert.equal(androidActionAllowedByCapabilities("table_order_cancel", caps), false);
  const staff = androidEffectivePermissionsForGroups({ ...ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS, commerce_orders_view: true }, caps);
  assert.equal(staff.includes("commerce_order.view"), true);
  assert.equal(staff.includes("commerce_order.confirm"), false);
  const manage = androidEffectivePermissionsForGroups({ ...ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS, commerce_orders_manage: true }, caps);
  assert.equal(manage.includes("commerce_order.confirm"), true);
  assert.equal(manage.includes("commerce_order.cancel"), true);
  assert.equal(manage.includes("table_order.cancel"), false);
});

test("source, profile, shipment, online and campaign redaction also removes counters", () => {
  const f = fixture();
  const noOrder = projectAndroidCompanion(f.commerce, f.marketing, caps.filter(c => c !== C.ORDERS));
  assert.deepEqual(noOrder.commerce, emptyAndroidCommerceSnapshot());
  const noWholesale = projectAndroidCompanion(f.commerce, f.marketing, caps.filter(c => c !== C.WHOLESALE));
  assert.equal(noWholesale.commerce.orders.some(r => r.source === "web-dealer"), false);
  assert.deepEqual(noWholesale.commerce.customer_profiles, []);
  assert.equal(androidCompanionCounters(noWholesale.commerce, noWholesale.marketing).pending_commerce_orders, 400);
  const noOnline = projectAndroidCompanion(f.commerce, f.marketing, caps.filter(c => c !== C.ONLINE_SALES));
  assert.equal(noOnline.commerce.orders.some(r => r.source === "web-online-sales"), false);
  assert.equal(noOnline.commerce.online_catalog.pending, false);
  const noShipping = projectAndroidCompanion(f.commerce, f.marketing, caps, ANDROID_PERMISSIONS.filter(p => p !== "shipment.view"));
  assert.deepEqual(noShipping.commerce.shipments, []);
  assert.equal(androidCompanionCounters(noShipping.commerce, noShipping.marketing).pending_shipments, 0);
  const noCampaign = projectAndroidCompanion(f.commerce, f.marketing, caps.filter(c => c !== C.MESSAGING_CAMPAIGNS));
  assert.deepEqual(noCampaign.marketing.campaigns, []);
  assert.deepEqual(noCampaign.marketing.schedules, []);
  const noMarketing = projectAndroidCompanion(f.commerce, f.marketing, caps.filter(c => c !== C.MARKETING_STUDIO));
  assert.deepEqual(noMarketing.marketing, emptyAndroidMarketingSnapshot());
});

test("allowlists exclude sensitive fields and cap every collection and payload size", () => {
  const f = fixture();
  const safe = projectAndroidCompanion(f.commerce, f.marketing, caps);
  assert.equal(JSON.stringify(safe).includes("PRIVATE"), false);
  assert.deepEqual(androidCompanionCounters(safe.commerce, safe.marketing), {
    pending_commerce_orders: 600, open_commerce_orders: 600, pending_shipments: 900,
    online_catalog_pending: 1, recent_failed_marketing_operations: 3
  });
  for (const [key, rows] of Object.entries(f.commerce)) if (Array.isArray(rows) && rows.length) f.commerce[key] = Array.from({ length: 5000 }, () => rows[0]);
  for (const [key, rows] of Object.entries(f.marketing)) if (rows.length) f.marketing[key] = Array.from({ length: 5000 }, () => rows[0]);
  const bounded = projectAndroidCompanion(f.commerce, f.marketing, caps);
  assert.equal(bounded.commerce.orders.length, 100);
  assert.equal(bounded.commerce.shipments.length, 100);
  assert.equal(bounded.commerce.customer_profiles.length, 100);
  assert.equal(bounded.marketing.publications.length, 50);
  assert.equal(bounded.marketing.schedules.length, 50);
  assert.equal(bounded.marketing.campaigns.length, 50);
  assert.ok(Buffer.byteLength(JSON.stringify(bounded)) < 256 * 1024);
});

test("queued online and dealer actions close when their source capability is withdrawn", () => {
  for (const action of ["commerce_order_confirm", "commerce_order_cancel"]) {
    assert.equal(androidActionAllowedByCapabilities(action, caps.filter(c => c !== C.WHOLESALE), { commerceOrderSource: "web-dealer" }), false);
    assert.equal(androidActionAllowedByCapabilities(action, caps.filter(c => c !== C.ONLINE_SALES), { commerceOrderSource: "web-online-sales" }), false);
    assert.equal(androidActionAllowedByCapabilities(action, caps, { commerceOrderSource: "web-online-sales" }), true);
  }
});
