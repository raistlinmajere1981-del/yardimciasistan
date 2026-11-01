import assert from "node:assert/strict";
import { saleFixture, load, databaseState } from "./test-helpers/market-sale-benefits-fixture.mjs";

const { previewAndroidCustomerSale, previewAndroidCustomerSaleInTransaction } = load("android-customer-sale-preview");
const { storeAndroidLocalCredential } = load("database/android-local-credential-store");
const { readCommercePointBalance } = load("commerce-benefits-points");
const { canSpendAndroidBenefits } = load("database/android-benefits-spend-grant-store");
const f = saleFixture();
try {
  const db = f.db, token = `yal_${"a".repeat(64)}`;
  for (const cap of ["service.android", "retail.barcode", "commerce.wholesale"]) {
    db.prepare("INSERT INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(cap);
  }
  db.prepare("INSERT INTO android_devices(id,device_id,role,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('d1','device-one','staff','fixture','fixture','fixture','fixture')").run();
  db.prepare("UPDATE android_devices SET is_active=1,permissions_json=? WHERE id='d1'").run(JSON.stringify(["market.product.view", "market.sale.complete", "customer.view"]));
  assert.equal(storeAndroidLocalCredential(db, "device-one", token), true);
  db.prepare("INSERT INTO customer_commercial_profiles(customer_id,business_id,company_name,dealer_status,price_group,created_at,updated_at) VALUES ('c1','b1','Dealer','active','dealer_a','fixture','fixture')").run();
  db.prepare("INSERT INTO catalog_products(id,business_id,name,sale_price,currency,created_at,updated_at) VALUES ('p2','b1','Euro',2,'EUR','fixture','fixture'),('p3','b2','Foreign',2,'TRY','fixture','fixture')").run();
  const auth = { deviceId: "device-one", token }, input = { customerId: "c1", lines: [{ productId: "p1", quantity: 1.5 }] };
  const before = databaseState(db);
  const linked = previewAndroidCustomerSale(db, auth, input);
  assert.equal(linked.lines[0].unitPriceMinor, 80000); assert.equal(linked.subtotalMinor, 120000); assert.equal(linked.currency, "TRY");
  assert.equal(linked.lines[0].updatedAt, "fixture"); assert.equal(linked.lines[0].currency, "TRY");
  assert.ok(Number.isFinite(linked.generatedAtMs));
  assert.equal(typeof previewAndroidCustomerSaleInTransaction, "function");
  assert.throws(() => previewAndroidCustomerSaleInTransaction(db, auth, input), /transaction/i);
  db.exec("BEGIN DEFERRED");
  try {
    const inside = previewAndroidCustomerSaleInTransaction(db, auth, input);
    assert.deepEqual({ ...inside, generatedAtMs: 0 }, { ...linked, generatedAtMs: 0 });
    assert.equal(readCommercePointBalance(db, "b1", "c1", "TRY", Date.now()).availableMinor, 0);
    assert.equal(canSpendAndroidBenefits(db, "b1", "device-one", "c1"), false);
    assert.equal(db.isTransaction, true);
    assert.throws(() => previewAndroidCustomerSaleInTransaction(db, { ...auth, deviceId: "unknown" }, input));
    assert.throws(() => previewAndroidCustomerSaleInTransaction(db, auth, { ...input, customerId: "c3" }));
    assert.throws(() => previewAndroidCustomerSaleInTransaction(db, auth, null));
    assert.equal(db.isTransaction, true);
  } finally { db.exec("ROLLBACK"); }
  assert.deepEqual(databaseState(db), before);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE catalog_products SET updated_at='changed-in-parent', dealer_price_a=700 WHERE id='p1'").run();
    const changed = previewAndroidCustomerSaleInTransaction(db, auth, input);
    assert.equal(changed.lines[0].updatedAt, "changed-in-parent");
    assert.equal(changed.lines[0].unitPriceMinor, 70000);
    assert.throws(() => previewAndroidCustomerSaleInTransaction(db, { ...auth, token: "bad" }, input));
    assert.equal(db.isTransaction, true);
  } finally { db.exec("ROLLBACK"); }
  assert.deepEqual(databaseState(db), before);
  assert.equal(previewAndroidCustomerSale(db, auth, { ...input, customerId: "" }).subtotalMinor, 150000);
  assert.throws(() => previewAndroidCustomerSale(db, { ...auth, token: `yal_${"b".repeat(64)}` }, input));
  assert.throws(() => previewAndroidCustomerSale(db, { ...auth, deviceId: "unknown" }, input));
  for (const customerId of ["c3", "missing"]) assert.throws(() => previewAndroidCustomerSale(db, auth, { ...input, customerId }));
  for (const quantity of [0, -1, 1.00001, 1000001]) assert.throws(() => previewAndroidCustomerSale(db, auth, { ...input, lines: [{ productId: "p1", quantity }] }));
  assert.throws(() => previewAndroidCustomerSale(db, auth, { ...input, lines: [{ productId: "p3", quantity: 1 }] }));
  assert.throws(() => previewAndroidCustomerSale(db, auth, { ...input, lines: [{ productId: "p1", quantity: 1 }, { productId: "p2", quantity: 1 }] }));
  assert.equal(previewAndroidCustomerSale(db, auth, { ...input, lines: [{ productId: "p2", quantity: 2 }] }).currency, "EUR");
  assert.deepEqual(databaseState(db), before);
  db.prepare("UPDATE catalog_products SET updated_at='new-version' WHERE id='p1'").run();
  assert.equal(previewAndroidCustomerSale(db, auth, input).lines[0].updatedAt, "new-version");
  db.prepare("UPDATE catalog_products SET updated_at='fixture' WHERE id='p1'").run();
  db.exec("PRAGMA query_only=ON");
  try { assert.equal(previewAndroidCustomerSale(db, auth, input).lines[0].updatedAt, "fixture"); }
  finally { db.exec("PRAGMA query_only=OFF"); }
  assert.throws(() => db.prepare("UPDATE catalog_products SET dealer_price_a=-1 WHERE id='p1'").run(), /CHECK constraint/);
  db.prepare("UPDATE catalog_products SET sale_price=50000000000000, currency='TRY' WHERE id IN ('p1','p2')").run();
  assert.throws(() => previewAndroidCustomerSale(db, auth, { customerId: "", lines: [{ productId: "p1", quantity: 1 }, { productId: "p2", quantity: 1 }] }));
  db.prepare("UPDATE catalog_products SET sale_price=1000 WHERE id='p1'").run();
  db.prepare("UPDATE catalog_products SET sale_price=2, currency='EUR' WHERE id='p2'").run();
  db.prepare("UPDATE catalog_products SET is_active=0 WHERE id='p1'").run();
  assert.throws(() => previewAndroidCustomerSale(db, auth, input));
  db.prepare("UPDATE catalog_products SET is_active=1 WHERE id='p1'").run();
  db.prepare("UPDATE customers SET deleted_at='deleted' WHERE id='c1'").run();
  assert.throws(() => previewAndroidCustomerSale(db, auth, input));
  db.prepare("UPDATE customers SET deleted_at='' WHERE id='c1'").run();
  db.prepare("UPDATE android_devices SET permissions_json=? WHERE id='d1'").run(JSON.stringify(["market.product.view", "market.sale.complete"]));
  assert.throws(() => previewAndroidCustomerSale(db, auth, input));
  assert.equal(previewAndroidCustomerSale(db, auth, { ...input, customerId: "" }).subtotalMinor, 150000);
  db.prepare("UPDATE android_devices SET is_active=0 WHERE id='d1'").run();
  assert.throws(() => previewAndroidCustomerSale(db, auth, input));
  db.prepare("UPDATE android_devices SET is_active=1, permissions_json=? WHERE id='d1'").run(JSON.stringify(["market.product.view", "market.sale.complete", "customer.view"]));
  for (const cap of ["core.customers", "commerce.sales", "commerce.catalog"]) {
    db.prepare("UPDATE business_capabilities SET is_enabled=0 WHERE business_id='b1' AND capability_id=?").run(cap);
    const disabled = databaseState(db);
    assert.throws(() => previewAndroidCustomerSale(db, auth, input));
    assert.deepEqual(databaseState(db), disabled);
    db.prepare("UPDATE business_capabilities SET is_enabled=1 WHERE business_id='b1' AND capability_id=?").run(cap);
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE catalog_products SET updated_at='parent-change' WHERE id='p1'").run();
    assert.throws(() => previewAndroidCustomerSale(db, auth, input)); assert.equal(db.isTransaction, true);
    assert.equal(db.prepare("SELECT updated_at FROM catalog_products WHERE id='p1'").get().updated_at, "parent-change");
  }
  finally { db.exec("ROLLBACK"); }
  console.log("PASS source-backed Android customer sale preview");
} finally { f.close(); }
