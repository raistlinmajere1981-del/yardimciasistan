const assert = require("node:assert/strict");
const test = require("node:test");
const { BUSINESS_CAPABILITIES: C } = require("../../shared/dist");
const { ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS: defaults, androidEffectivePermissionsForGroups,
  androidEffectivePermissionsForRole, androidActionAllowedByCapabilities, resolveAndroidActionPermission } = require("../dist");
const caps = [C.ANDROID, C.CATALOG, C.SALES, C.INVENTORY, C.RETAIL_BARCODE, C.CUSTOMERS, C.FINANCE, C.CUSTOMER_CREDIT];

test("sales, credit read and payment are explicit independent staff grants", () => {
  assert.equal(defaults.market_sales, false);
  assert.equal(defaults.customer_credit_view, false);
  assert.equal(defaults.customer_credit_payment, false);
  const handheld = androidEffectivePermissionsForGroups({ ...defaults, market_operations: true }, caps);
  for (const permission of ["market.sale.complete", "customer_credit.view", "customer_credit.payment"]) assert.equal(handheld.includes(permission), false);
  const read = androidEffectivePermissionsForGroups({ ...defaults, customer_credit_view: true }, caps);
  assert.equal(read.includes("customer_credit.view"), true);
  assert.equal(read.includes("customer_credit.payment"), false);
  assert.equal(read.includes("customer.manage"), false);
  const pay = androidEffectivePermissionsForGroups({ ...defaults, customer_credit_payment: true }, caps);
  assert.equal(pay.includes("customer_credit.payment"), true);
  assert.equal(pay.includes("market.sale.complete"), false);
});

test("paid and credit actions fail closed on each capability and unknown names", () => {
  assert.equal(resolveAndroidActionPermission("market_sale_complete"), "market.sale.complete");
  assert.equal(resolveAndroidActionPermission("customer_credit_payment_add"), "customer_credit.payment");
  for (const unknown of ["unknown", "toString", "constructor", "__proto__"]) assert.equal(resolveAndroidActionPermission(unknown), null);
  assert.equal(androidActionAllowedByCapabilities("market_sale_complete", caps, { payload: { settlement: "paid" } }), true);
  assert.equal(androidActionAllowedByCapabilities("market_sale_complete", caps, { payload: { settlement: "credit" } }), true);
  for (const cap of [C.ANDROID, C.CATALOG, C.SALES, C.CUSTOMERS, C.FINANCE, C.CUSTOMER_CREDIT, C.RETAIL_BARCODE]) {
    const missing = caps.filter(value => value !== cap);
    assert.equal(androidActionAllowedByCapabilities("customer_credit_payment_add", missing), false, cap);
    assert.equal(androidActionAllowedByCapabilities("market_sale_complete", missing, { payload: { settlement: "credit" } }), false, cap);
    assert.equal(androidEffectivePermissionsForRole("admin", [], missing).includes("customer_credit.view"), false, cap);
  }
  assert.equal(androidActionAllowedByCapabilities("market_sale_complete", caps.filter(c => c !== C.CUSTOMER_CREDIT), { payload: { settlement: "paid" } }), true);
});
