import assert from "node:assert/strict";
import { dirname } from "node:path";
import { request as httpsRequest } from "node:https";
import { saleFixture, load } from "./test-helpers/market-sale-benefits-fixture.mjs";
import { exampleRules, installRules, issue, secretKey } from "./test-helpers/commerce-benefits-fixture.mjs";

// C20q Phase 2: real TLS coupon permit -> protected owner paid-cash sale.
// A real HTTPS coupon-attempt mints the 60s opaque permit; a second real HTTPS
// action consumes it inside the SAME Android BEGIN IMMEDIATE: Store coupon
// reserve (hold), canonical discounted sale, Store settle (redemption + earn),
// discount-aware receipt/ACK. The coupon code never enters the action payload,
// receipt, event log or any response.
const f = saleFixture();
try {
  const db = f.db, token = `yal_${"a".repeat(64)}`, deviceId = "device-one";
  for (const cap of ["service.android", "core.finance", "commerce.customer_credit", "retail.barcode"])
    db.prepare("INSERT OR IGNORE INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(cap);

  installRules(f, exampleRules().map(rule => rule.id === "earn" ? { ...rule, percentBps: 1000 } : rule));
  db.exec("INSERT INTO android_devices(id,device_id,role,is_active,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('d1','device-one','admin',1,'fixture','fixture','fixture','fixture')");
  db.exec("UPDATE android_devices SET is_active=1 WHERE id='d1'");
  const credentials = load("database/android-local-credential-store");
  assert.equal(credentials.storeAndroidLocalCredential(db, deviceId, token), true);

  const couponNow = Date.now();
  const coupon = issue(f, { expiresAt: couponNow + 600_000 });
  assert.match(coupon.secret, /^[A-F0-9]{40}$/);

  const safeStorage = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => "gnome_libsecret",
    encryptString: value => Buffer.from(value), decryptString: value => value.toString() };
  const keyOwner = new (load("commerce-benefits-key").CommerceBenefitsKey)(dirname(f.path), safeStorage, "linux");
  keyOwner.load();
  const keyLoads = [];
  const pointsKeys = { available: () => keyOwner.available(), load(create) {
    keyLoads.push({ inTransaction: db.isTransaction, create }); return keyOwner.load(create);
  } };

  const identity = new (load("local-companion-tls-identity").LocalCompanionTlsIdentity)({ userDataPath: dirname(f.path), safeStorage,
    platform: "linux", addresses: () => ["127.0.0.1"] });
  const material = await identity.load();
  const app = load("android-action-application-service");
  const { authorizeCompanionCouponAttempt } = load("companion-coupon-permit");
  const caps = () => load("business-capability-store").readEnabledBusinessCapabilities(db);
  const server = new (load("local-companion-server").LocalCompanionServer)({
    enabled: () => true,
    httpsExperiment: { enabled: true, identity },
    authorize: ({ deviceId: device, token: secret }) => credentials.authorizeAndroidLocalCredential(db, device, secret),
    readAuthorizedSaleReceipt: (action, device, secret) => app.readAuthorizedLocalSaleReceipt(db, action, device, secret),
    readCouponAttempt: ({ deviceId: device, token: secret, actionId, customerId, lines, couponCode, paymentMethod }) =>
      authorizeCompanionCouponAttempt(db, { deviceId: device, token: secret },
        { actionId, customerId, lines, couponCode, paymentMethod }, secretKey),
    applyAction: (action, context) => {
      assert.ok(context, "HTTPS handler must mint an opaque action context");
      return app.applyAndroidActionTransaction(db, action, caps(), context, pointsKeys);
    }
  });
  const address = await server.start("127.0.0.1", 0);
  const send = (path, body) => new Promise((resolve, reject) => {
    const req = httpsRequest({ hostname: "127.0.0.1", port: address.port, path, method: "POST", ca: material.certificatePem,
      headers: { "X-YA-Device-Id": deviceId, "X-YA-Local-Token": token } }, res => {
      const chunks = []; res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks)) }));
    });
    req.on("error", reject); req.end(JSON.stringify(body));
  });
  const counts = () => ({
    sales: db.prepare("SELECT count(*) n FROM commerce_sales").get().n,
    settlements: db.prepare("SELECT count(*) n FROM commerce_sale_settlements").get().n,
    finance: db.prepare("SELECT count(*) n FROM finance_entries").get().n,
    stock: db.prepare("SELECT COALESCE(Sum(quantity_delta),0) n FROM inventory_movements").get().n,
    reservations: db.prepare("SELECT count(*) n FROM commerce_benefit_reservations").get().n,
    holds: db.prepare("SELECT count(*) n FROM commerce_benefit_coupon_holds").get().n,
    redemptions: db.prepare("SELECT count(*) n FROM commerce_benefit_coupon_redemptions").get().n,
    snapshots: db.prepare("SELECT count(*) n FROM commerce_benefit_snapshots").get().n,
    actions: db.prepare("SELECT count(*) n FROM android_action_receipts").get().n,
    receipts: db.prepare("SELECT count(*) n FROM android_market_sale_result_receipts").get().n,
    grants: db.prepare("SELECT count(*) n FROM commerce_benefit_point_ledger WHERE kind='grant'").get().n
  });

  try {
    const attempt = await send("/local/v1/coupon-attempt", { actionId: "c20q_coupon_sale_01", customerId: "c1",
      couponCode: coupon.secret, paymentMethod: "cash", lines: [{ productId: "p1", quantity: 1 }] });
    assert.equal(attempt.status, 200, JSON.stringify(attempt.body));
    assert.equal(attempt.body.subtotalMinor, 100_000);
    assert.equal(attempt.body.discountMinor, 10_000);
    assert.equal(attempt.body.payableMinor, 90_000);
    assert.equal(JSON.stringify(attempt.body).includes(coupon.secret), false);

    const action = { id: "c20q_coupon_sale_01", action_type: "market_sale_complete", created_at: "2026-10-31T09:00:00.000Z",
      payload: { lines: [{ product_id: "p1", quantity: 1, expected_unit_price: 1000, expected_currency: "TRY", expected_updated_at: "fixture" }],
        location_id: "loc", settlement: "paid", customer_id: "c1", payment_method: "cash", external_payment_confirmed: false,
        couponPermitId: attempt.body.permitId } };
    assert.equal(JSON.stringify(action).includes(coupon.secret), false, "action payload must carry only the opaque permit id");

    const before = counts();
    const first = await send("/local/v1/action", action);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.status, "applied", first.body.error_message);
    assert.equal(first.body.already_applied, false);
    assert.ok(first.body.sale_receipt, "coupon sale must return a durable receipt/ACK");
    assert.equal(first.body.sale_receipt.discountMinor, 10_000);
    assert.equal(first.body.sale_receipt.cashPaidMinor, 90_000);
    assert.equal(first.body.sale_receipt.pointsTenderMinor, 0);
    assert.equal(first.body.sale_receipt.currency, "TRY");
    assert.equal(first.body.sale_receipt.source, "android-market-sale");
    assert.equal(JSON.stringify(first.body).includes(coupon.secret), false);

    const after = counts();
    assert.deepEqual(after, { ...before, sales: before.sales + 1, settlements: before.settlements + 1,
      finance: before.finance + 1, stock: before.stock - 1, reservations: before.reservations + 1,
      holds: before.holds + 1, redemptions: before.redemptions + 1, snapshots: before.snapshots + 1,
      actions: before.actions + 1, receipts: before.receipts + 1, grants: before.grants + 1 });
    const sale = db.prepare("SELECT subtotal,discount_total,total,status FROM commerce_sales").get();
    assert.equal(Math.round(Number(sale.subtotal) * 100), 100_000);
    assert.equal(Math.round(Number(sale.discount_total) * 100), 10_000);
    assert.equal(Math.round(Number(sale.total) * 100), 90_000);
    assert.equal(sale.status, "paid");
    assert.equal(db.prepare("SELECT cash_received_minor,points_tender_minor FROM commerce_sale_settlements").get().cash_received_minor, 90_000);
    assert.equal(db.prepare("SELECT amount_minor FROM finance_entries").get().amount_minor, 90_000,
      "Finance books only received cash, never the coupon discount");
    assert.equal(db.prepare("SELECT status FROM commerce_benefit_reservations").get().status, "settled");
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_benefit_coupon_redemptions WHERE customer_id='c1'").get().n, 1);
    assert.equal(db.prepare("SELECT amount_minor FROM commerce_benefit_point_ledger WHERE kind='grant'").get().amount_minor, 9000,
      "10% earn applies to the discounted payable exactly once");
    assert.equal(db.prepare("SELECT count(*) n FROM commerce_benefit_point_ledger WHERE kind='spend'").get().n, 0);
    assert.deepEqual(keyLoads, [{ inTransaction: false, create: false }], "protected key is read once pre-BEGIN");

    // Durable rows and the durable action event must never contain the code.
    const durable = JSON.stringify([
      db.prepare("SELECT * FROM android_market_sale_result_receipts").all(),
      db.prepare("SELECT * FROM android_action_receipts").all(),
      db.prepare("SELECT * FROM events").all(),
      db.prepare("SELECT * FROM commerce_benefit_coupon_authorizations").all(),
      db.prepare("SELECT result_json FROM android_market_sale_result_receipts").all()
    ]);
    assert.equal(durable.includes(coupon.secret), false, "coupon plaintext must never be durable");

    const replay = await send("/local/v1/action", action);
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.equal(replay.body.status, "applied");
    assert.equal(replay.body.already_applied, true);
    assert.deepEqual(replay.body.sale_receipt, first.body.sale_receipt, "exact retry returns the canonical receipt");
    assert.deepEqual(counts(), after, "retry must not double reserve, redeem, earn or ACK");
    assert.equal(keyLoads.length, 1, "retry must not re-prepare the protected source");

    const mutated = { ...action, payload: { ...action.payload, lines: [{ ...action.payload.lines[0], quantity: 2, expected_unit_price: 2000 }] } };
    const denied = await send("/local/v1/action", mutated);
    assert.equal(denied.status, 200); assert.equal(denied.body.status, "failed");
    assert.equal(Object.hasOwn(denied.body, "sale_receipt"), false);
    assert.deepEqual(counts(), after, "mutated payload for the same action must not write");

    const reused = { ...action, id: "c20q_coupon_sale_reuse_01" };
    const reuse = await send("/local/v1/action", reused);
    assert.equal(reuse.status, 200); assert.equal(reuse.body.status, "failed");
    assert.deepEqual(counts(), after, "a consumed permit must never authorize a second sale");

    const freshAttempt = await send("/local/v1/coupon-attempt", { actionId: "c20q_coupon_sale_expired_01", customerId: "c1",
      couponCode: coupon.secret, paymentMethod: "cash", lines: [{ productId: "p1", quantity: 1 }] });
    assert.equal(freshAttempt.status, 403, "max-uses coupon is no longer mintable after redemption");
    // Expired permit / wrong customer / wrong quantity / points mixing fail closed.
    const permitRow = db.prepare("SELECT id FROM commerce_benefit_coupon_authorizations WHERE reservation_id IS NOT NULL ORDER BY rowid DESC LIMIT 1").get();
    db.prepare("UPDATE commerce_benefit_coupon_authorizations SET reservation_id=NULL, expires_at_ms=? WHERE id=?").run(Date.now() - 1, permitRow.id);
    const expired = await send("/local/v1/action", { ...action, id: "c20q_coupon_sale_expired_01", payload: { ...action.payload, couponPermitId: permitRow.id } });
    assert.equal(expired.status, 200); assert.equal(expired.body.status, "failed");
    assert.deepEqual(counts(), after, "expired permit must not write");

    const wrongCustomer = { ...action, id: "c20q_coupon_sale_customer_01", payload: { ...action.payload, customer_id: "c2", couponPermitId: permitRow.id } };
    assert.equal((await send("/local/v1/action", wrongCustomer)).body.status, "failed");
    const wrongQuantity = { ...action, id: "c20q_coupon_sale_quantity_01", payload: { ...action.payload,
      lines: [{ ...action.payload.lines[0], quantity: 2 }], couponPermitId: permitRow.id } };
    assert.equal((await send("/local/v1/action", wrongQuantity)).body.status, "failed");
    const mixedPoints = { ...action, id: "c20q_coupon_sale_points_01", payload: { ...action.payload, requestedPointsMinor: 500, couponPermitId: permitRow.id } };
    assert.equal((await send("/local/v1/action", mixedPoints)).body.status, "failed", "coupon + points mixing stays closed");
    assert.deepEqual(counts(), after, "denied coupon variants must not write");

    // Device permission revocation still denies before any owner write.
    db.prepare("UPDATE android_devices SET role='staff', permissions_json='[]' WHERE device_id=?").run(deviceId);
    const noPermission = { ...action, id: "c20q_coupon_sale_permission_01", payload: { ...action.payload, couponPermitId: permitRow.id } };
    const deniedRole = await send("/local/v1/action", noPermission);
    assert.equal(deniedRole.status, 200); assert.equal(deniedRole.body.status, "failed");
    assert.deepEqual(counts(), after, "unauthorized role must not write");

    console.log("PASS Companion coupon permit -> TLS paid cash sale: reserve/hold, discounted sale/Finance/stock, settle/redemption/earn, discount-aware receipt+ACK, exact retry, mutated/reused/expired/permission negatives");
  } finally { await server.stop(); }
} finally { f.close(); }
