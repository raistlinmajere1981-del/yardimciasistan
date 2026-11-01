import assert from "node:assert/strict";
import { dirname } from "node:path";
import { request as httpsRequest } from "node:https";
import { createHash, X509Certificate } from "node:crypto";
import { saleFixture, load, databaseState } from "./test-helpers/market-sale-benefits-fixture.mjs";

const { LocalCompanionServer } = load("local-companion-server");
const { LocalCompanionTlsIdentity } = load("local-companion-tls-identity");
const { quoteAndroidPointSpend } = load("android-point-spend-quote");
const { storeAndroidLocalCredential, authorizeAndroidLocalCredential } = load("database/android-local-credential-store");
const { grantAndroidBenefitsSpend } = load("database/android-benefits-spend-grant-store");
const { grantAndroidBenefitsBalance } = load("database/android-benefits-grant-store");
const f = saleFixture();
try {
  const db = f.db, token = `yal_${"a".repeat(64)}`;
  for (const cap of ["service.android", "retail.barcode", "commerce.wholesale"]) db.prepare("INSERT INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(cap);
  db.exec(`INSERT INTO android_devices(id,device_id,role,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('d1','device-one','admin','t','t','t','t');
    UPDATE android_devices SET is_active=1 WHERE id='d1';
    INSERT INTO customer_commercial_profiles(customer_id,business_id,company_name,dealer_status,price_group,created_at,updated_at) VALUES ('c1','b1','Dealer','active','dealer_a','t','t');`);
  assert.equal(storeAndroidLocalCredential(db, "device-one", token), true);
  const safeStorage = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => "gnome_libsecret",
    encryptString: value => Buffer.from(value), decryptString: value => value.toString() };
  const identity = new LocalCompanionTlsIdentity({ userDataPath: dirname(f.path), safeStorage, platform: "linux", addresses: () => ["127.0.0.1"] });
  const material = await identity.load(); let enabled = true;
  const server = new LocalCompanionServer({ enabled: () => enabled,
    authorize: ({ deviceId, token: secret }) => authorizeAndroidLocalCredential(db, deviceId, secret),
    readPointSpendQuote: ({ deviceId, token: secret, customerId, lines }) => quoteAndroidPointSpend(db, { deviceId, token: secret }, { customerId, lines }),
    httpsExperiment: { enabled: true, identity } });
  const address = await server.start("127.0.0.1", 0);
  try {
    const dispatch = (body, secret = token) => new Promise((resolve, reject) => {
      const request = httpsRequest({ hostname: "127.0.0.1", port: address.port, path: "/local/v1/point-spend-quote", method: "POST",
        ca: material.certificatePem, headers: { "X-YA-Device-Id": "device-one", "X-YA-Local-Token": secret } }, response => {
        const certificate = new X509Certificate(response.socket.getPeerCertificate(true).raw);
        assert.equal(createHash("sha256").update(certificate.publicKey.export({ type: "spki", format: "der" })).digest("base64url"), material.spkiSha256);
        const chunks = []; response.on("data", chunk => chunks.push(chunk)); response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks)), cache: response.headers["cache-control"] }));
      }); request.on("error", reject); request.end(typeof body === "string" ? body : JSON.stringify(body));
    });
    const body = { customerId: "c1", lines: [{ productId: "p1", quantity: 1 }] }, owner = { assertAuthorized() {} };
    assert.equal((await dispatch(body)).status, 403, "admin alone denied");
    assert.equal(grantAndroidBenefitsBalance(db, owner, "b1", "device-one", "c1"), true);
    assert.equal((await dispatch(body)).status, 403, "balance only denied");
    assert.equal(grantAndroidBenefitsSpend(db, owner, "b1", "device-one", "c1"), true);
    const before = databaseState(db), result = await dispatch(body);
    assert.equal(result.status, 200); assert.equal(result.cache, "no-store");
    assert.deepEqual(Object.keys(result.body).sort(), ["availablePointMinor", "currency", "expiresAtMs", "generatedAtMs", "lines", "maxSpendableMinor", "subtotalMinor"].sort());
    assert.equal(result.body.lines[0].unitPriceMinor, 80000); assert.equal(result.body.expiresAtMs - result.body.generatedAtMs, 30000);
    assert.equal((await dispatch(body)).status, 200); assert.deepEqual(databaseState(db), before);
    for (const forged of [{ ...body, deviceId: "device-one" }, { ...body, pointsMinor: 1 }, { ...body, coupon: "x" }, { ...body, now: 1 },
      { ...body, merchantId: "b1" }, { ...body, discount: 1 }, { ...body, lines: [{ ...body.lines[0], unitPrice: 1 }] }, { ...body, customerId: "" },
      { ...body, lines: [] }, { ...body, lines: Array(201).fill(body.lines[0]) }, { ...body, lines: [{ productId: "p1", quantity: "1" }] }, "{broken"]) {
      const denied = await dispatch(forged); assert.equal(denied.status, 403); assert.equal(denied.cache, "no-store"); assert.deepEqual(denied.body, { code: "point_spend_quote_denied" });
    }
    assert.equal((await dispatch(body, `yal_${"b".repeat(64)}`)).status, 403);
    enabled = false; assert.equal((await dispatch(body)).status, 403); enabled = true;
    db.exec("UPDATE android_local_credentials SET revoked_at='revoked'"); assert.equal((await dispatch(body)).status, 403);
    db.exec("UPDATE android_local_credentials SET revoked_at=''; UPDATE commerce_benefit_settings SET points_enabled=0 WHERE business_id='b1'");
    assert.equal((await dispatch(body)).status, 403);
    console.log("PASS source-backed TLS Android point spend quote");
  } finally { await server.stop(); }
} finally { f.close(); }
