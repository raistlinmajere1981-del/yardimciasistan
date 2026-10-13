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
    commerce.orders.push({ id: source, customer_id: "customer-1", status: "placed", source, total: 12, currency: "TRY", delivery_method: "shipping", placed_at: now, updated_at: now,
      buyer_snapshot: { phone: "PRIVATE" }, address: "PRIVATE", note: "PRIVATE", items: ["PRIVATE"] });
    commerce.order_counts.push({ source, status: "placed", count: 200 });
    commerce.shipment_counts.push({ source, pending: 300 });
    commerce.shipments.push({ id: `ship-${source}`, order_id: source, status: "ready", tracking_available: true, updated_at: now, tracking_url: "PRIVATE" });
  }
  commerce.customer_profiles.push({ customer_id: "customer-1", dealer_status: "active", price_group: "dealer_a", updated_at: now, company_name: "Authorized company", tax_number: "PRIVATE" });
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

function operationalDetails() {
  return { customer_name: "Order customer", buyer: { name: "Guest", phone: "+905551234567", email: "guest@example.test", api_key: "SYSTEM_PRIVATE" },
    delivery_address: { recipient_name: "Receiver", address_line1: "Example street", address_line2: "", district: "Merkez", city: "Ankara",
      postal_code: "", country_code: "TR", note: "Door 2", service_secret: "SYSTEM_PRIVATE" },
    subtotal: 25, discount_total: 5, note: "Operation note",
    items: [{ id: "item-1", product_id: "product-1", product_name: "Product", unit: "piece", quantity: 2, unit_price: 12.5, line_total: 25,
      purchase_price: "SYSTEM_PRIVATE", image: "SYSTEM_PRIVATE" }],
    items_total_count: 1, items_complete: true, available_actions: ["commerce_order_confirm", "commerce_order_cancel", "commerce_order_fulfill"],
    payment_secret: "SYSTEM_PRIVATE" };
}

test("B2 details retain canonical item totals and delivery facts but exclude system credentials/media", () => {
  const f = fixture(); f.commerce.orders[0].details = operationalDetails();
  f.commerce.orders[0].total = 20;
  const result = projectAndroidCompanion(f.commerce, f.marketing, caps).commerce.orders[0];
  assert.equal(result.total, 20);
  assert.equal(result.details.subtotal, 25);
  assert.equal(result.details.discount_total, 5);
  assert.equal(result.details.items[0].line_total, 25);
  assert.equal(result.details.buyer.phone, "+905551234567");
  assert.equal(result.details.delivery_address.address_line1, "Example street");
  assert.deepEqual(result.details.available_actions, ["commerce_order_confirm", "commerce_order_cancel"]);
  assert.equal(JSON.stringify(result).includes("SYSTEM_PRIVATE"), false);
  const view = projectAndroidCompanion(f.commerce, f.marketing, caps, ["commerce_order.view"]);
  assert.deepEqual(view.commerce.orders[0].details.available_actions, []);
  assert.equal(view.commerce.orders[0].customer_id, "");
});

test("B2 customer contacts and commercial profiles remain order-linked with separate grants", () => {
  const f = fixture();
  f.commerce.customers = ["customer-1", "unrelated"].map(id => ({ id, full_name: id, phone: "123", email: "", updated_at: now }));
  f.commerce.customer_profiles.push({ ...f.commerce.customer_profiles[0], customer_id: "unrelated", company_name: "Unrelated private company" });
  const basic = projectAndroidCompanion(f.commerce, f.marketing, caps, ["commerce_order.view", "customer.view"]);
  assert.equal(basic.commerce.customers.length, 1);
  assert.equal(basic.commerce.customers[0].id, "customer-1");
  assert.deepEqual(basic.commerce.customer_profiles, []);
  const dealer = projectAndroidCompanion(f.commerce, f.marketing, caps, ["commerce_order.view", "dealer.view"]);
  assert.equal(dealer.commerce.customer_profiles.length, 1);
  assert.equal(dealer.commerce.customer_profiles[0].company_name, "Authorized company");
  assert.equal(dealer.commerce.customers.length, 1);
  const orderOnly = projectAndroidCompanion(f.commerce, f.marketing, caps, ["commerce_order.view"]);
  assert.deepEqual(orderOnly.commerce.customers, []);
  assert.deepEqual(orderOnly.commerce.customer_profiles, []);
});

test("B2 shipping links are exact provider facts and only shipment permission exposes them", () => {
  const f = fixture();
  f.commerce.shipments[0] = { ...f.commerce.shipments[0], provider_name: "Carrier", tracking_number: "123456789",
    tracking_url: "https://tracking.example.test/?code=123456789", note: "Shipment note", provider_password: "SYSTEM_PRIVATE" };
  const shipment = projectAndroidCompanion(f.commerce, f.marketing, caps).commerce.shipments[0];
  assert.equal(shipment.tracking_number, "123456789");
  assert.equal(shipment.tracking_url, f.commerce.shipments[0].tracking_url);
  assert.equal(JSON.stringify(shipment).includes("SYSTEM_PRIVATE"), false);
  for (const url of ["javascript:alert(1)", "intent://example.test", "file:///etc/passwd", "https://name:password@example.test/"]) {
    f.commerce.shipments[0].tracking_url = url;
    assert.equal(projectAndroidCompanion(f.commerce, f.marketing, caps).commerce.shipments[0].tracking_url, "");
  }
  assert.deepEqual(projectAndroidCompanion(f.commerce, f.marketing, caps, ["commerce_order.view"]).commerce.shipments, []);
});

test("B2 bounded or malformed item lists cannot advertise a decision", () => {
  const f = fixture();
  const d = operationalDetails();
  d.items = Array.from({ length: 501 }, (_, i) => ({ ...d.items[0], id: "item-" + i }));
  d.items_total_count = 501;
  f.commerce.orders[0].details = d;
  const bounded = projectAndroidCompanion(f.commerce, f.marketing, caps).commerce.orders[0].details;
  assert.equal(bounded.items_complete, false);
  assert.deepEqual(bounded.available_actions, []);
  assert.equal(bounded.items.length, 0);
  f.commerce.orders[0].details = operationalDetails(); f.commerce.orders[0].details.items[0].quantity = -1;
  assert.equal(projectAndroidCompanion(f.commerce, f.marketing, caps).commerce.orders[0].details.items_complete, false);
  f.commerce.orders[0].details.subtotal = "25";
  assert.equal(projectAndroidCompanion(f.commerce, f.marketing, caps).commerce.orders[0].details, undefined);
});

test("B2 entire snapshot detail budget remains bounded and old rows remain valid", () => {
  const f = fixture(), d = operationalDetails();
  d.note = "😀".repeat(4000);
  f.commerce.orders = Array.from({ length: 100 }, (_, i) => ({ ...f.commerce.orders[0], id: "order-" + i, details: d }));
  const result = projectAndroidCompanion(f.commerce, f.marketing, caps).commerce;
  assert.equal(result.orders.length, 100);
  const bytes = result.orders.reduce((sum, order) => sum + (order.details ? Buffer.byteLength(JSON.stringify(order.details)) : 0), 0);
  assert.ok(bytes <= 1024 * 1024);
  assert.ok(result.orders.some(order => !order.details));
  delete f.commerce.orders[0].details;
  assert.equal(projectAndroidCompanion(f.commerce, f.marketing, caps).commerce.orders[0].details, undefined);
  const itemDetails = operationalDetails();
  itemDetails.items = Array.from({ length: 500 }, (_, i) => ({ ...itemDetails.items[0], id: "item-" + i }));
  itemDetails.items_total_count = 500;
  f.commerce.orders = Array.from({ length: 8 }, (_, i) => ({ ...f.commerce.orders[0], id: "large-" + i, details: itemDetails }));
  const large = projectAndroidCompanion(f.commerce, f.marketing, caps).commerce.orders;
  assert.equal(large.reduce((sum, order) => sum + (order.details?.items.length ?? 0), 0), 2000);
  assert.equal(large.filter(order => order.details?.items_complete).length, 4);
});

test("manual dealer source preserves the legacy enum while respecting wholesale gates and complete counters", () => {
  const f = fixture();
  f.commerce.orders.push({ ...f.commerce.orders[0], id: "manual-dealer", source: "other", dealer_order: true });
  f.commerce.order_counts.push({ source: "other", status: "placed", count: 7, dealer_count: 5 });
  f.commerce.shipment_counts.push({ source: "other", pending: 8, dealer_pending: 6 });
  const off = projectAndroidCompanion(f.commerce, f.marketing, caps.filter(c => c !== C.WHOLESALE));
  assert.equal(off.commerce.orders.some(order => order.id === "manual-dealer"), false);
  assert.equal(off.commerce.order_counts.find(row => row.source === "other").count, 2);
  assert.equal(off.commerce.shipment_counts.find(row => row.source === "other").pending, 2);
  assert.equal(projectAndroidCompanion(f.commerce, f.marketing, caps).commerce.orders.find(order => order.id === "manual-dealer").dealer_order, true);
  assert.equal(androidActionAllowedByCapabilities("commerce_order_confirm", caps.filter(c => c !== C.WHOLESALE),
    { commerceOrderSource: "desktop-wholesale" }), false);
});
