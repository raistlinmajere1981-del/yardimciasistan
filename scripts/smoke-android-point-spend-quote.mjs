import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { saleFixture, load, databaseState } from "./test-helpers/market-sale-benefits-fixture.mjs";

assert.ok(existsSync("apps/desktop-app/electron/android-point-spend-quote.ts"), "internal point quote owner required");
const { quoteAndroidPointSpend } = load("android-point-spend-quote");
const { storeAndroidLocalCredential } = load("database/android-local-credential-store");
const { CommerceBenefitsManagement } = load("commerce-benefits-management");
const f = saleFixture();
try {
  const db = f.db, token = `yal_${"a".repeat(64)}`, now = 1_800_000_000_000;
  for (const capability of ["service.android", "retail.barcode", "commerce.wholesale"]) db.prepare("INSERT INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(capability);
  db.exec(`INSERT INTO android_devices(id,device_id,role,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('row1','device-one','admin','t','t','t','t');
    UPDATE android_devices SET is_active=1 WHERE id='row1';
    INSERT INTO customer_commercial_profiles(customer_id,business_id,company_name,dealer_status,price_group,created_at,updated_at) VALUES ('c1','b1','Dealer','active','dealer_a','t','t');
    INSERT INTO catalog_products(id,business_id,name,sale_price,currency,created_at,updated_at) VALUES ('euro','b1','Euro',2,'EUR','t','t');`);
  assert.equal(storeAndroidLocalCredential(db, "device-one", token), true);
  const auth = { deviceId: "device-one", token }, input = { customerId: "c1", lines: [{ productId: "p1", quantity: 1 }] };
  const quote = (credential = auth, body = input) => quoteAndroidPointSpend(db, credential, body, now);
  const management = new CommerceBenefitsManagement(db, f.authority.keys, f.authority.actor, () => now);
  const grant = { deviceId: "device-one", customerId: "c1", recordId: "row1", confirmed: true };
  const authorizationEpoch = db.prepare("SELECT authorization_epoch FROM android_devices WHERE id='row1'").get().authorization_epoch;
  assert.equal(quote(), null, "admin alone denied");
  assert.equal(management.changeCompanionPointGrant(grant, true), true, "desktop owner balance grant");
  assert.equal(quote(), null, "balance grant is not spend grant");
  assert.equal(management.changeCompanionPointSpendGrant(grant, true), true, "desktop owner spend grant");
  assert.equal(db.prepare("SELECT authorization_epoch FROM android_devices WHERE id='row1'").get().authorization_epoch,
    authorizationEpoch, "grant preserves device authorization epoch");
  assert.equal(db.prepare("SELECT authorization_epoch FROM android_benefits_spend_grants WHERE business_id='b1' AND customer_id='c1'").get().authorization_epoch,
    authorizationEpoch, "spend grant binds the current device epoch");
  const empty = quote(); assert.equal(empty.availablePointMinor, 0); assert.equal(empty.maxSpendableMinor, 0);
  db.prepare(`INSERT INTO commerce_benefit_point_ledger(business_id,id,customer_id,currency,kind,amount_minor,source_kind,source_id,operation_key,created_at_ms)
    VALUES ('b1','credit1','c1','TRY','grant',120000,'fixture','source','operation',?)`).run(now);
  db.prepare(`INSERT INTO commerce_benefit_point_ledger(business_id,id,customer_id,currency,kind,amount_minor,source_kind,source_id,operation_key,expires_at_ms,created_at_ms)
    VALUES ('b1','expired','c1','TRY','grant',500,'fixture','expired-source','expired-operation',?,?)`).run(now, now - 1);
  const before = databaseState(db), result = quote();
  assert.deepEqual(Object.keys(result).sort(), ["availablePointMinor", "currency", "expiresAtMs", "generatedAtMs", "lines", "maxSpendableMinor", "subtotalMinor"].sort());
  assert.equal(result.lines[0].unitPriceMinor, 80000); assert.equal(result.lines[0].updatedAt, "fixture");
  assert.equal(result.subtotalMinor, 80000); assert.equal(result.availablePointMinor, 120000); assert.equal(result.maxSpendableMinor, 80000);
  assert.equal(result.generatedAtMs, now); assert.equal(result.expiresAtMs, now + 30000);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.lines) && Object.isFrozen(result.lines[0]));
  assert.deepEqual(databaseState(db), before);
  db.exec("PRAGMA query_only=ON");
  try { assert.equal(quote().availablePointMinor, 120000); } finally { db.exec("PRAGMA query_only=OFF"); }
  assert.equal(quoteAndroidPointSpend(db, auth, input, Number.MAX_SAFE_INTEGER), null);
  assert.equal(quote(auth, null), null);
  for (const bad of [{ ...auth, token: `yal_${"b".repeat(64)}` }, { ...auth, deviceId: "missing" }]) assert.equal(quote(bad), null);
  for (const customerId of ["", "c2", "c3", "missing"]) assert.equal(quote(auth, { ...input, customerId }), null);
  assert.equal(quote(auth, { ...input, lines: [...input.lines, { productId: "euro", quantity: 1 }] }), null);
  for (const sql of ["UPDATE android_local_credentials SET revoked_at='revoked'", "UPDATE android_devices SET is_active=0", "UPDATE android_devices SET revoked_at='revoked'", "UPDATE commerce_benefit_settings SET points_enabled=0 WHERE business_id='b1'", "UPDATE business_capabilities SET is_enabled=0 WHERE business_id='b1' AND capability_id='commerce.benefits'"]) {
    db.exec("BEGIN IMMEDIATE"); db.exec(sql); db.exec("COMMIT"); assert.equal(quote(), null, sql);
    if (sql.includes("android_local_credentials")) db.exec("UPDATE android_local_credentials SET revoked_at=''");
    else if (sql.includes("is_active=0")) db.exec("UPDATE android_devices SET is_active=1");
    else if (sql.includes("android_devices")) db.exec("UPDATE android_devices SET revoked_at=NULL");
    else if (sql.includes("points_enabled")) db.exec("UPDATE commerce_benefit_settings SET points_enabled=1 WHERE business_id='b1'");
    else db.exec("UPDATE business_capabilities SET is_enabled=1 WHERE business_id='b1' AND capability_id='commerce.benefits'");
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("UPDATE catalog_products SET updated_at='parent-change' WHERE id='p1'");
    assert.equal(quote(), null); assert.equal(db.isTransaction, true);
    assert.equal(db.prepare("SELECT updated_at FROM catalog_products WHERE id='p1'").get().updated_at, "parent-change");
  } finally { db.exec("ROLLBACK"); }
  db.exec("UPDATE catalog_products SET dealer_price_a=50000000000000 WHERE id='p1'");
  assert.equal(quote(auth, { ...input, lines: [{ productId: 'p1', quantity: 1000000 }] }), null);
  console.log("PASS source-backed Android point spend quote");
} finally { f.close(); }
