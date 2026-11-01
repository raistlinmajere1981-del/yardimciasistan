import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { saleFixture, databaseState, load } from "./test-helpers/market-sale-benefits-fixture.mjs";

assert.ok(existsSync("apps/desktop-app/electron/companion-points-principal.ts"), "trusted Companion principal required");
const { requireCompanionPointsPrincipal, readCompanionPointsPreparationScope } = load("companion-points-principal");
const spend = load("database/android-benefits-spend-grant-store");
const balance = load("database/android-benefits-grant-store");
const credentials = load("database/android-local-credential-store");
const f = saleFixture();
try {
  const db = f.db, token = `yal_${"a".repeat(64)}`, owner = { assertAuthorized() {} };
  db.exec("INSERT INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1','retail.barcode','fixture','fixture')");
  db.exec("INSERT INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1','service.android','fixture','fixture'); INSERT INTO android_devices(id,device_id,role,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('record1','device-one','admin','fixture','fixture','fixture','fixture'); UPDATE android_devices SET is_active=1 WHERE id='record1'");
  assert.equal(credentials.storeAndroidLocalCredential(db, "device-one", token), true);
  const initial = databaseState(db);
  const requirePrincipal = (customer = "c1", secret = token) => requireCompanionPointsPrincipal(db, { deviceId: "device-one", token: secret }, customer);
  const readOnly = fn => {
    const before = databaseState(db), writes = db.prepare("SELECT total_changes() n").get().n;
    try { return fn(); }
    finally { assert.deepEqual(databaseState(db), before); assert.equal(db.prepare("SELECT total_changes() n").get().n, writes); }
  };
  const denied = fn => readOnly(() => assert.throws(fn, error => error.code === "COMPANION_POINTS_DENIED"));
  denied(requirePrincipal);
  db.exec("BEGIN IMMEDIATE");
  try {
    denied(requirePrincipal); // admin alone
    assert.equal(balance.grantAndroidBenefitsBalance(db, owner, "b1", "device-one", "c1"), true);
    denied(requirePrincipal);
    assert.equal(spend.grantAndroidBenefitsSpend(db, owner, "b1", "device-one", "c1"), true);
    const before = databaseState(db), principal = requirePrincipal();
    assert.equal(principal.kind, "companion_points_spend"); assert.equal(principal.businessId, "b1");
    assert.equal(principal.deviceRecordId, "record1"); assert.equal(principal.customerId, "c1");
    assert.equal(JSON.stringify(principal).includes(token), false);
    principal.assertAuthorized(); assert.deepEqual(databaseState(db), before);
    db.exec("UPDATE android_devices SET role='staff',permissions_json='[]' WHERE id='record1'"); denied(() => principal.assertAuthorized());
    db.prepare("UPDATE android_devices SET permissions_json=? WHERE id='record1'").run(JSON.stringify(["market.sale.complete", "customer.view"]));
    denied(() => principal.assertAuthorized()); // product visibility is independently required
    db.prepare("UPDATE android_devices SET permissions_json=? WHERE id='record1'").run(JSON.stringify(["market.sale.complete", "customer.view", "market.product.view"]));
    principal.assertAuthorized();
    db.exec("UPDATE android_local_credentials SET revoked_at='revoked' WHERE device_id='device-one'"); denied(() => principal.assertAuthorized());
    db.exec("UPDATE android_local_credentials SET revoked_at='' WHERE device_id='device-one'");
    db.exec("UPDATE android_devices SET is_active=0 WHERE id='record1'"); denied(() => principal.assertAuthorized());
    db.exec("UPDATE android_devices SET is_active=1 WHERE id='record1'");
    db.exec("UPDATE customers SET deleted_at='deleted' WHERE id='c1'"); denied(() => principal.assertAuthorized());
    db.exec("UPDATE customers SET deleted_at='' WHERE id='c1'");
    denied(() => requirePrincipal("c2")); denied(() => requirePrincipal("c3")); denied(() => requirePrincipal("c1", "bad"));
    spend.revokeAndroidBenefitsSpend(db, owner, "b1", "device-one", "c1"); denied(() => principal.assertAuthorized());
    spend.grantAndroidBenefitsSpend(db, owner, "b1", "device-one", "c1");
    denied(() => principal.assertAuthorized()); // same row + epoch cannot revive old lifetime
    const fresh = readOnly(requirePrincipal);
    assert.match(fresh.spendGrantGeneration, /^[a-f0-9]{64}$/);
    readOnly(() => fresh.assertAuthorized());
    spend.grantAndroidBenefitsSpend(db, owner, "b1", "device-one", "c1");
    denied(() => fresh.assertAuthorized()); // reissue without revoke also rotates
    const reissued = readOnly(requirePrincipal);
    assert.notEqual(reissued.spendGrantGeneration, fresh.spendGrantGeneration);
    for (const operation of ["grant", "revoke"]) {
      db.exec("SAVEPOINT grant_lifetime");
      if (operation === "grant") spend.grantAndroidBenefitsSpend(db, owner, "b1", "device-one", "c1");
      else spend.revokeAndroidBenefitsSpend(db, owner, "b1", "device-one", "c1");
      const transient = operation === "grant" ? readOnly(requirePrincipal) : undefined;
      denied(() => reissued.assertAuthorized());
      db.exec("ROLLBACK TO grant_lifetime; RELEASE grant_lifetime");
      readOnly(() => reissued.assertAuthorized());
      if (transient) denied(() => transient.assertAuthorized());
      assert.equal(requirePrincipal().spendGrantGeneration, reissued.spendGrantGeneration);
    }
    db.exec("UPDATE android_devices SET authorization_epoch=authorization_epoch+1 WHERE id='record1'");
    denied(() => principal.assertAuthorized()); denied(() => reissued.assertAuthorized()); denied(requirePrincipal);
    spend.grantAndroidBenefitsSpend(db, owner, "b1", "device-one", "c1");
    const current = requirePrincipal(); denied(() => principal.assertAuthorized());
    db.exec("UPDATE commerce_benefit_settings SET points_enabled=0 WHERE business_id='b1'"); denied(() => current.assertAuthorized());
    db.exec("UPDATE commerce_benefit_settings SET points_enabled=1 WHERE business_id='b1'");
    for (const cap of ["service.android", "commerce.benefits", "commerce.catalog", "core.customers", "commerce.sales"]) {
      db.prepare("UPDATE business_capabilities SET is_enabled=0 WHERE business_id='b1' AND capability_id=?").run(cap); denied(() => current.assertAuthorized());
      db.prepare("UPDATE business_capabilities SET is_enabled=1 WHERE business_id='b1' AND capability_id=?").run(cap);
    }
    db.exec("UPDATE business SET deleted_at='gone' WHERE id='b1'"); denied(() => current.assertAuthorized());
    db.exec("UPDATE business SET deleted_at='' WHERE id='b1'; DELETE FROM android_devices WHERE id='record1'; INSERT INTO android_devices(id,device_id,role,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('record2','device-one','admin','fixture','fixture','fixture','fixture'); UPDATE android_devices SET is_active=1 WHERE id='record2'");
    denied(() => current.assertAuthorized());
    credentials.storeAndroidLocalCredential(db, "device-one", token);
    spend.grantAndroidBenefitsSpend(db, owner, "b1", "device-one", "c1");
    requirePrincipal().assertAuthorized(); denied(() => current.assertAuthorized());
  } finally { db.exec("ROLLBACK"); }
  assert.equal(db.isTransaction, false);
  readOnly(() => assert.throws(() => readCompanionPointsPreparationScope(db, { deviceId: "device-one", token }, "c1"),
    e => e.code === "COMPANION_POINTS_DENIED"));
  assert.deepEqual(databaseState(db), initial);
  assert.equal(db.prepare("SELECT count(*) n FROM commerce_benefit_point_ledger").get().n, 0);
  assert.equal(db.prepare("SELECT count(*) n FROM finance_entries").get().n, 0);
  console.log("PASS Companion points principal: current grant, identity and parent ownership");
} finally { f.close(); }
