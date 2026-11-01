import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { saleFixture, databaseState, load } from "./test-helpers/market-sale-benefits-fixture.mjs";

assert.ok(existsSync("apps/desktop-app/electron/database/android-benefits-spend-grant-store.ts"), "isolated spend grant owner required");
const spend = load("database/android-benefits-spend-grant-store");
const balance = load("database/android-benefits-grant-store");
const { CommerceBenefitsManagement } = load("commerce-benefits-management");
const { withCommerceBenefitsTransaction, configureCommerceBenefits } = load("commerce-benefits-rules");
const f = saleFixture();
try {
  const db = f.db;
  db.prepare("INSERT INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1','service.android','fixture','fixture')").run();
  db.exec(`INSERT INTO android_devices(id,device_id,role,is_active,permissions_json,first_seen_at,last_seen_at,created_at,updated_at)
    VALUES ('row1','device','admin',1,'[]','fixture','fixture','fixture','fixture')`);
  db.exec("UPDATE android_devices SET is_active=1 WHERE id='row1'");
  const management = new CommerceBenefitsManagement(db, f.authority.keys, f.authority.actor, () => 12345);
  const configurePoints = points => {
    const snapshot = management.snapshot();
    return management.configure({ revision: snapshot.revision, families: { ...snapshot.families, points } });
  };
  const owner = { assertAuthorized() {} };
  const deniedOwner = { assertAuthorized() { throw new Error("owner denied"); } };
  const check = (business = "b1", customer = "c1") => spend.canSpendAndroidBenefits(db, business, "device", customer);
  assert.equal(check(), false, "admin and absence do not grant spend");
  assert.equal(balance.grantAndroidBenefitsBalance(db, owner, "b1", "device", "c1"), true);
  assert.equal(check(), false, "balance grant is not spend authority");
  assert.throws(() => spend.grantAndroidBenefitsSpend(db, deniedOwner, "b1", "device", "c1"), /owner denied/);
  assert.equal(check(), false);
  assert.equal(spend.grantAndroidBenefitsSpend(db, owner, "b1", "device", "c1"), true);
  assert.equal(check(), true);
  const generation = () => spend.readAndroidBenefitsSpendGrantGeneration(db, "b1", "device", "c1");
  const first = generation();
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(spend.grantAndroidBenefitsSpend(db, owner, "b1", "device", "c1"), true);
  assert.notEqual(generation(), first, "identical owner reissue rotates generation");
  const reissued = generation();
  assert.equal(spend.grantAndroidBenefitsSpend(db, owner, "b1", "device", "c2"), true);
  assert.equal(generation(), reissued, "other customer grant cannot rotate this grant's lifetime");
  assert.notEqual(spend.readAndroidBenefitsSpendGrantGeneration(db, "b1", "device", "c2"), reissued);
  assert.equal(spend.revokeAndroidBenefitsSpend(db, owner, "b1", "device", "c2"), true);
  const before = databaseState(db), writes = db.prepare("SELECT total_changes() n").get().n;
  assert.throws(() => spend.grantAndroidBenefitsSpend(db, deniedOwner, "b1", "device", "c1"), /owner denied/);
  assert.throws(() => spend.revokeAndroidBenefitsSpend(db, deniedOwner, "b1", "device", "c1"), /owner denied/);
  assert.equal(spend.grantAndroidBenefitsSpend(db, owner, "b1", "device", "c1", "wrong-row"), false);
  assert.equal(spend.revokeAndroidBenefitsSpend(db, owner, "b1", "device", "c1", "wrong-row"), false);
  assert.equal(generation(), reissued);
  assert.deepEqual(databaseState(db), before);
  assert.equal(db.prepare("SELECT total_changes() n").get().n, writes, "denied owners and stale record cause zero writes");
  assert.equal(check("b1", "c2"), false);
  assert.equal(check("other", "c1"), false);
  db.exec("UPDATE android_devices SET is_active=0 WHERE id='row1'"); assert.equal(check(), false);
  db.exec("UPDATE android_devices SET is_active=1, revoked_at='revoked' WHERE id='row1'"); assert.equal(check(), false);
  db.exec("UPDATE android_devices SET revoked_at=NULL, authorization_epoch=authorization_epoch+1 WHERE id='row1'"); assert.equal(check(), false);
  assert.equal(spend.grantAndroidBenefitsSpend(db, owner, "b1", "device", "c1"), true);
  assert.throws(() => withCommerceBenefitsTransaction(db, 12345, tx => {
    configureCommerceBenefits(tx, "b1", { coupon: true, points: false, payment_modifier: true });
    throw new Error("rollback fixture");
  }), /rollback fixture/);
  assert.equal(check(), true, "rollback restores family and spend grant");
  configurePoints(false); assert.equal(check(), false);
  configurePoints(true); assert.equal(check(), false, "re-enabling points must not revive spend authorization");
  assert.equal(spend.grantAndroidBenefitsSpend(db, owner, "b1", "device", "c1"), true);
  db.exec("UPDATE android_devices SET role='staff', permissions_json='[]' WHERE id='row1'"); assert.equal(check(), false);
  db.prepare("UPDATE android_devices SET permissions_json=? WHERE id='row1'").run(JSON.stringify(["market.sale.complete", "customer.view"])); assert.equal(check(), true);
  for (const capability of ["service.android", "commerce.benefits", "commerce.catalog", "core.customers", "commerce.sales"]) {
    db.prepare("UPDATE business_capabilities SET is_enabled=0 WHERE business_id='b1' AND capability_id=?").run(capability);
    assert.equal(check(), false, capability);
    db.prepare("UPDATE business_capabilities SET is_enabled=1 WHERE business_id='b1' AND capability_id=?").run(capability);
  }
  db.exec("UPDATE android_devices SET permissions_json='invalid' WHERE id='row1'"); assert.equal(check(), false);
  db.prepare("UPDATE android_devices SET permissions_json=? WHERE id='row1'").run(JSON.stringify(["market.sale.complete", "customer.view"]));
  assert.equal(spend.grantAndroidBenefitsSpend(db, owner, "b1", "device", "c1", "wrong-row"), false);
  assert.equal(spend.revokeAndroidBenefitsSpend(db, owner, "b1", "device", "c1", "wrong-row"), false);
  assert.throws(() => spend.revokeAndroidBenefitsSpend(db, deniedOwner, "b1", "device", "c1"), /owner denied/);
  assert.equal(check(), true);
  assert.equal(spend.revokeAndroidBenefitsSpend(db, owner, "b1", "device", "c1"), true);
  assert.equal(check(), false);
  assert.equal(spend.grantAndroidBenefitsSpend(db, owner, "b1", "device", "c1"), true);
  db.exec("DELETE FROM android_devices WHERE id='row1'");
  db.exec("INSERT INTO android_devices(id,device_id,role,is_active,permissions_json,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('row2','device','admin',1,'[]','fixture','fixture','fixture','fixture')");
  db.exec("UPDATE android_devices SET is_active=1 WHERE id='row2'");
  assert.equal(check(), false, "re-enrollment is a distinct device row");
  console.log("PASS source-backed Android spend grants");
} finally { f.close(); }
