import assert from "node:assert/strict";
import { dirname } from "node:path";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createHash, X509Certificate } from "node:crypto";
import { saleFixture, load, databaseState } from "./test-helpers/market-sale-benefits-fixture.mjs";
import { installRules, issue, NOW, secretKey } from "./test-helpers/commerce-benefits-fixture.mjs";

// Phase 1 Companion coupon permit: real HTTPS/TLS, current schema, real price,
// coupon, rate-limit and permit-issuance owners. No stub authorization.
const { LocalCompanionServer } = load("local-companion-server");
const { LocalCompanionTlsIdentity } = load("local-companion-tls-identity");
const { authorizeCompanionCouponAttempt } = load("companion-coupon-permit");
const { storeAndroidLocalCredential, authorizeAndroidLocalCredential } = load("database/android-local-credential-store");

const f = saleFixture();
const db = f.db;
const token = `yal_${"a".repeat(64)}`;
const deviceId = "device-one";
try {
  for (const cap of ["service.android", "retail.barcode"]) {
    db.prepare("INSERT INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(cap);
  }
  db.exec(`INSERT INTO android_devices(id,device_id,role,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('d1','${deviceId}','admin','t','t','t','t');
    UPDATE android_devices SET is_active=1 WHERE id='d1';`);
  assert.equal(storeAndroidLocalCredential(db, deviceId, token), true);
  installRules(f);
  const coupon = issue(f, { expiresAt: NOW + 600_000 });
  assert.match(coupon.secret, /^[A-F0-9]{40}$/);

  const safeStorage = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => "gnome_libsecret",
    encryptString: value => Buffer.from(value), decryptString: value => value.toString() };
  const identity = new LocalCompanionTlsIdentity({ userDataPath: dirname(f.path), safeStorage, platform: "linux",
    addresses: () => ["127.0.0.1"] });
  const material = await identity.load();
  let enabled = true;
  const readCouponAttempt = ({ deviceId: device, token: secret, actionId, customerId, lines, couponCode, paymentMethod }) =>
    authorizeCompanionCouponAttempt(db, { deviceId: device, token: secret },
      { actionId, customerId, lines, couponCode, paymentMethod }, secretKey, NOW);
  const server = new LocalCompanionServer({ enabled: () => enabled,
    authorize: ({ deviceId: device, token: secret }) => authorizeAndroidLocalCredential(db, device, secret),
    readCouponAttempt, httpsExperiment: { enabled: true, identity } });
  const address = await server.start("127.0.0.1", 0);
  try {
    const dispatch = (body, secret = token) => new Promise((resolve, reject) => {
      const request = httpsRequest({ hostname: "127.0.0.1", port: address.port,
        path: "/local/v1/coupon-attempt", method: "POST", ca: material.certificatePem,
        headers: { "X-YA-Device-Id": deviceId, "X-YA-Local-Token": secret } }, response => {
        const certificate = new X509Certificate(response.socket.getPeerCertificate(true).raw);
        assert.equal(createHash("sha256").update(certificate.publicKey.export({ type: "spki", format: "der" })).digest("base64url"),
          material.spkiSha256, "authenticated TLS peer");
        const chunks = []; response.on("data", chunk => chunks.push(chunk));
        response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks)),
          cache: response.headers["cache-control"] }));
      });
      request.on("error", reject);
      request.end(typeof body === "string" ? body : JSON.stringify(body));
    });
    const body = { actionId: "action-coupon-0001", customerId: "c1", couponCode: coupon.secret,
      paymentMethod: "cash", lines: [{ productId: "p1", quantity: 1 }] };
    const before = new Map(databaseState(db));
    const result = await dispatch(body);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.cache, "no-store");
    assert.deepEqual(Object.keys(result.body).sort(),
      ["discountMinor", "expiresAtMs", "payableMinor", "permitId", "subtotalMinor", "currency"].sort());
    assert.equal(result.body.currency, "TRY");
    assert.equal(result.body.subtotalMinor, 100_000);
    assert.equal(result.body.discountMinor, 10_000);
    assert.equal(result.body.payableMinor, 90_000);
    assert.equal(result.body.expiresAtMs, NOW + 60_000);
    assert.match(result.body.permitId, /^[0-9a-f-]{36}$/);
    assert.equal(JSON.stringify(result.body).includes(coupon.secret), false, "coupon code never returned");
    assert.equal(JSON.stringify(result.body).includes(token), false, "device token never returned");

    const after = new Map(databaseState(db));
    const changed = [...after.keys()].filter(name => JSON.stringify(after.get(name)) !== JSON.stringify(before.get(name))).sort();
    assert.deepEqual(changed, ["commerce_benefit_coupon_authorizations", "commerce_benefit_coupon_rate_limits"]);
    for (const table of ["commerce_sales", "commerce_sale_items", "finance_entries", "commerce_benefit_point_ledger",
      "commerce_benefit_reservations", "commerce_benefit_coupon_holds",
      "commerce_benefit_coupon_redemptions", "commerce_benefit_receipts"]) {
      assert.ok(before.has(table), `${table} exists`);
      assert.deepEqual(after.get(table), before.get(table), `${table} untouched`);
    }

    // A replay mints a fresh advisory permit without reserving or redeeming the coupon.
    const replay = await dispatch(body);
    assert.equal(replay.status, 200);
    assert.notEqual(replay.body.permitId, result.body.permitId);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM commerce_benefit_coupon_redemptions").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM commerce_benefit_coupon_holds").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM commerce_benefit_reservations").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM commerce_benefit_coupon_authorizations WHERE reservation_id IS NOT NULL").get().n, 0);

    // Forged scope, unknown codes, invalid bodies, tokens and non-TLS all fail closed.
    for (const forged of [
      { ...body, discountMinor: 90_000 },
      { ...body, now: NOW },
      { ...body, couponCode: "A".repeat(40) },
      { ...body, couponCode: "SHORT" },
      { ...body, customerId: "c3" },
      { ...body, customerId: "" },
      { ...body, actionId: "short" },
      { ...body, paymentMethod: "" },
      { ...body, lines: [] },
      { ...body, lines: Array(201).fill({ productId: "p1", quantity: 1 }) },
      { ...body, lines: [{ productId: "p1", quantity: 1 }, { productId: "p1", quantity: 1 }] },
      { ...body, lines: [{ productId: "p1", quantity: "1" }] },
      { ...body, lines: [{ productId: "p1", quantity: 1, unitPriceMinor: 1 }] },
      { ...body, lines: [{ productId: "missing", quantity: 1 }] },
      "{broken"
    ]) {
      const denied = await dispatch(forged);
      assert.equal(denied.status, 403, JSON.stringify(forged));
      assert.equal(denied.cache, "no-store");
      assert.deepEqual(denied.body, { code: "coupon_attempt_denied" });
    }
    assert.equal((await dispatch(body, `yal_${"b".repeat(64)}`)).status, 403);

    enabled = false;
    assert.equal((await dispatch(body)).status, 403);
    enabled = true;
    db.exec("UPDATE android_local_credentials SET revoked_at = 'revoked'");
    assert.equal((await dispatch(body)).status, 403);
    db.exec("UPDATE android_local_credentials SET revoked_at = ''");
    db.exec("UPDATE commerce_benefit_settings SET coupons_enabled = 0 WHERE business_id = 'b1'");
    assert.equal((await dispatch(body)).status, 403);
    db.exec("UPDATE commerce_benefit_settings SET coupons_enabled = 1 WHERE business_id = 'b1'");
    db.prepare("UPDATE commerce_benefit_coupon_codes SET status = 'disabled' WHERE business_id = 'b1' AND id = ?").run(coupon.codeId);
    assert.equal((await dispatch(body)).status, 403, "disabled coupon denied");
    db.prepare("UPDATE commerce_benefit_coupon_codes SET status = 'active', expires_at_ms = ? WHERE business_id = 'b1' AND id = ?")
      .run(NOW - 1, coupon.codeId);
    assert.equal((await dispatch(body)).status, 403, "expired coupon denied");
    db.prepare("UPDATE commerce_benefit_coupon_codes SET expires_at_ms = ? WHERE business_id = 'b1' AND id = ?")
      .run(NOW + 600_000, coupon.codeId);

    // The route refuses plaintext even when the test-only listener is enabled.
    process.env.NODE_ENV = "test";
    const plain = new LocalCompanionServer({ enabled: () => true, testOnlyHttp: true,
      authorize: ({ deviceId: device, token: secret }) => authorizeAndroidLocalCredential(db, device, secret),
      readCouponAttempt });
    const plainAddress = await plain.start("127.0.0.1", 0);
    try {
      const plainResult = await new Promise((resolve, reject) => {
        const request = httpRequest({ hostname: "127.0.0.1", port: plainAddress.port,
          path: "/local/v1/coupon-attempt", method: "POST",
          headers: { "X-YA-Device-Id": deviceId, "X-YA-Local-Token": token } }, response => {
          const chunks = []; response.on("data", chunk => chunks.push(chunk));
          response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks)) }));
        });
        request.on("error", reject); request.end(JSON.stringify(body));
      });
      assert.equal(plainResult.status, 403);
      assert.deepEqual(plainResult.body, { code: "coupon_attempt_denied" });
    } finally { await plain.stop(); }

    // Durable rate limiting survives across attempts (per authenticated device).
    for (let index = 0; index < 20; index++) {
      assert.equal((await dispatch({ ...body, couponCode: "B".repeat(40) })).status, 403);
    }
    const limited = await dispatch(body);
    assert.equal(limited.status, 403, "rate limit denies a valid coupon after 20 attempts");
    assert.ok(db.prepare("SELECT MAX(attempts) AS n FROM commerce_benefit_coupon_rate_limits").get().n > 20);
    console.log("PASS Companion coupon permit over TLS (quote, replay, forgery, TLS-only, rate limit)");
  } finally { await server.stop(); }
} finally { f.close(); }
