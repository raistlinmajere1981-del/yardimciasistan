import assert from "node:assert/strict";
import { dirname } from "node:path";
import { request as httpsRequest } from "node:https";
import { saleFixture, load } from "./test-helpers/market-sale-benefits-fixture.mjs";

const f = saleFixture();
try {
  const db = f.db, token = `yal_${"a".repeat(64)}`;
  for (const cap of ["service.android", "core.finance", "commerce.customer_credit", "retail.barcode"])
    db.prepare("INSERT OR IGNORE INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(cap);
  db.exec("INSERT INTO android_devices(id,device_id,role,is_active,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('d1','device-one','admin',1,'fixture','fixture','fixture','fixture')");
  db.exec("UPDATE android_devices SET is_active=1 WHERE id='d1'");
  const credentials = load("database/android-local-credential-store");
  assert.equal(credentials.storeAndroidLocalCredential(db, "device-one", token), true);
  const safeStorage = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => "gnome_libsecret",
    encryptString: value => Buffer.from(value), decryptString: value => value.toString() };
  const identity = new (load("local-companion-tls-identity").LocalCompanionTlsIdentity)({ userDataPath: dirname(f.path), safeStorage, platform: "linux", addresses: () => ["127.0.0.1"] });
  const material = await identity.load();
  let afterApply = () => {}, enabled = true;
  const server = new (load("local-companion-server").LocalCompanionServer)({ enabled: () => enabled,
    httpsExperiment: { enabled: true, identity }, authorize: ({ deviceId, token: secret }) => credentials.authorizeAndroidLocalCredential(db, deviceId, secret),
    readAuthorizedSaleReceipt: (action, deviceId, secret) => load("android-action-application-service").readAuthorizedLocalSaleReceipt(db, action, deviceId, secret),
    applyAction: action => {
      const result = load("android-action-application-service").applyAndroidActionTransaction(db, action, load("business-capability-store").readEnabledBusinessCapabilities(db));
      afterApply(); return result;
    } });
  const address = await server.start("127.0.0.1", 0);
  try {
    const send = (action, secret = token, device = "device-one") => new Promise((resolve, reject) => {
      const req = httpsRequest({ hostname: "127.0.0.1", port: address.port, path: "/local/v1/action", method: "POST", ca: material.certificatePem,
        headers: { "X-YA-Device-Id": device, "X-YA-Local-Token": secret } }, res => {
        const chunks = []; res.on("data", chunk => chunks.push(chunk)); res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks)), cache: res.headers["cache-control"] }));
      });
      req.on("error", reject); req.end(JSON.stringify(action));
    });
    const action = { id: "https_sale_ack_01", action_type: "market_sale_complete", payload: {
      lines: [{ product_id: "p1", quantity: 1, expected_unit_price: 1000, expected_currency: "TRY", expected_updated_at: "fixture" }],
      location_id: "loc", settlement: "paid", customer_id: "c1", payment_method: "cash", external_payment_confirmed: false } };
    const forbidden = result => {
      assert.equal(result.status, 403); assert.equal(result.cache, "no-store");
      assert.deepEqual(result.body, { ok: false, code: "local_action_forbidden", message: "Yerel bağlantı kullanılamıyor." });
    };
    afterApply = () => db.prepare("UPDATE android_local_credentials SET revoked_at='revoked' WHERE device_id='device-one'").run();
    forbidden(await send(action));
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_sales WHERE source='android-market-sale'").get().n, 1);
    assert.equal(db.prepare("SELECT count(*) n FROM finance_entries WHERE source_type='commerce_sale'").get().n, 1);
    db.prepare("UPDATE android_local_credentials SET revoked_at='' WHERE device_id='device-one'").run();
    afterApply = () => {};
    const first = await send(action); assert.equal(first.status, 200); assert.equal(first.body.status, "applied", first.body.message);
    assert.equal(first.body.already_applied, true);
    assert.equal(first.cache, "no-store"); assert.ok(first.body.sale_receipt, "authorized sale ACK requires canonical receipt");
    assert.equal(first.body.sale_receipt.source, "android-market-sale"); assert.equal(first.body.sale_receipt.cashPaidMinor, 100000);
    const persisted = JSON.parse(db.prepare("SELECT result_json FROM android_market_sale_result_receipts WHERE action_id=?").get(action.id).result_json);
    assert.deepEqual(first.body.sale_receipt, { saleId: persisted.saleId, businessId: "b1", source: "android-market-sale",
      customerId: "c1", cashPaidMinor: 100000, pointsTenderMinor: 0, discountMinor: 0, currency: "TRY", paymentMethod: "cash" });
    const replay = await send(action); assert.equal(replay.body.already_applied, true); assert.deepEqual(replay.body.sale_receipt, first.body.sale_receipt);
    const credit = { ...action, id: "https_sale_credit_01", payload: { ...action.payload, settlement: "credit", payment_method: "" } };
    afterApply = () => { enabled = false; };
    forbidden(await send(credit)); enabled = true; afterApply = () => {};
    const creditFirst = await send(credit); assert.equal(creditFirst.body.status, "applied", creditFirst.body.message);
    assert.equal(creditFirst.body.already_applied, true);
    assert.equal(creditFirst.body.sale_receipt.cashPaidMinor, 0);
    const creditReplay = await send(credit); assert.equal(creditReplay.body.already_applied, true);
    assert.deepEqual(creditReplay.body.sale_receipt, creditFirst.body.sale_receipt);
    for (const original of [action, credit]) {
      const fresh = { ...original, id: `${original.id}_fresh` };
      const initial = await send(fresh); assert.equal(initial.body.status, "applied", initial.body.message);
      assert.equal(initial.body.already_applied, false); assert.ok(initial.body.sale_receipt);
      assert.equal(initial.body.sale_receipt.cashPaidMinor, original === action ? 100000 : 0);
      assert.deepEqual((await send(fresh)).body.sale_receipt, initial.body.sale_receipt);
    }
    const barcode = { id: "https_barcode_01", action_type: "market_barcode_scan", payload: { barcode: "12345678", scanned_at: "2020-01-01T00:00:00.000Z" } };
    const other = await send(barcode);
    assert.equal(other.body.status, "applied", other.body.message); assert.equal(Object.hasOwn(other.body, "sale_receipt"), false);
    afterApply = () => { enabled = false; }; forbidden(await send(barcode)); enabled = true; afterApply = () => {};
    assert.equal((await send(barcode)).body.already_applied, true);
    const altered = await send({ ...action, payload: { ...action.payload, customer_id: "c2" } });
    assert.equal(altered.body.status, "failed"); assert.equal(Object.hasOwn(altered.body, "sale_receipt"), false);
    const forged = await send({ ...action, payload: { ...action.payload, pointsTenderMinor: 100 } });
    assert.equal(forged.body.status, "failed"); assert.equal(Object.hasOwn(forged.body, "sale_receipt"), false);
    afterApply = () => { enabled = false; };
    forbidden(await send(action)); enabled = true; afterApply = () => {};
    assert.equal((await send(action)).body.already_applied, true);
    afterApply = () => { enabled = false; };
    forbidden(await send({ ...action, payload: { ...action.payload, customer_id: "c2" } }));
    enabled = true; afterApply = () => {};
    afterApply = () => db.prepare("UPDATE android_local_credentials SET revoked_at='revoked' WHERE device_id='device-one'").run();
    forbidden(await send({ ...action, payload: { ...action.payload, customer_id: "c2" } }));
    db.prepare("UPDATE android_local_credentials SET revoked_at='' WHERE device_id='device-one'").run(); afterApply = () => {};
    assert.equal((await send(action, `yal_${"b".repeat(64)}`)).status, 401);
    assert.equal((await send(action, token, "device-two")).status, 401);
    db.exec("INSERT INTO android_devices(id,device_id,role,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('d2','device-two','admin','fixture','fixture','fixture','fixture'); UPDATE android_devices SET is_active=1 WHERE id='d2'");
    const otherToken = `yal_${"b".repeat(64)}`;
    assert.equal(credentials.storeAndroidLocalCredential(db, "device-two", otherToken), true);
    const otherDevice = await send(action, otherToken, "device-two");
    assert.equal(otherDevice.body.status, "failed"); assert.equal(Object.hasOwn(otherDevice.body, "sale_receipt"), false);
    afterApply = () => db.prepare("UPDATE android_local_credentials SET revoked_at='revoked' WHERE device_id='device-one'").run();
    const revokedDuring = await send(action);
    forbidden(revokedDuring);
    assert.equal((await send(action)).status, 401);
    db.prepare("UPDATE android_local_credentials SET revoked_at='' WHERE device_id='device-one'").run();
    afterApply = () => db.prepare("UPDATE android_devices SET is_active=0 WHERE device_id='device-one'").run();
    const deactivated = await send(action); assert.equal(deactivated.status, 200);
    assert.equal(Object.hasOwn(deactivated.body, "sale_receipt"), false);
    db.prepare("UPDATE android_devices SET is_active=1 WHERE device_id='device-one'").run();
    afterApply = () => db.prepare("UPDATE business SET deleted_at='inactive' WHERE id='b1'").run();
    const switchedDuring = await send(action);
    assert.equal(switchedDuring.status, 200); assert.equal(switchedDuring.body.already_applied, true);
    assert.equal(Object.hasOwn(switchedDuring.body, "sale_receipt"), false);
    db.exec(`INSERT OR IGNORE INTO business_capabilities(business_id,capability_id,is_enabled,created_at,updated_at)
      SELECT 'b2',capability_id,is_enabled,'fixture','fixture' FROM business_capabilities WHERE business_id='b1'`);
    afterApply = () => {};
    const wrongTenant = await send(action); assert.equal(wrongTenant.body.status, "failed");
    assert.equal(Object.hasOwn(wrongTenant.body, "sale_receipt"), false);
    assert.equal(db.prepare("SELECT count(*) n FROM finance_entries WHERE source_type='commerce_sale'").get().n, 2);
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_sales WHERE source='android-market-sale'").get().n, 4);
    assert.equal(db.prepare("SELECT count(*) n FROM inventory_movements WHERE reference_type='commerce_sale'").get().n, 4);
    console.log("PASS paired HTTPS sale receipt ACK and post-apply authorization");
  } finally { await server.stop(); }
} finally { f.close(); }
