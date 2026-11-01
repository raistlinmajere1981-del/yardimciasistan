import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { dirname } from "node:path";
import { request as httpsRequest } from "node:https";
import { createHash, X509Certificate } from "node:crypto";
import { saleFixture, load, databaseState } from "./test-helpers/market-sale-benefits-fixture.mjs";

const { LocalCompanionServer } = load("local-companion-server");
const { LocalCompanionTlsIdentity } = load("local-companion-tls-identity");
const { previewAndroidCustomerSale } = load("android-customer-sale-preview");
const { storeAndroidLocalCredential, authorizeAndroidLocalCredential } = load("database/android-local-credential-store");
const f = saleFixture();
try {
  const db = f.db, token = `yal_${"a".repeat(64)}`;
  for (const cap of ["service.android", "retail.barcode", "commerce.wholesale"]) db.prepare("INSERT INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'fixture','fixture')").run(cap);
  db.prepare("INSERT INTO android_devices(id,device_id,role,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('d1','device-one','staff','fixture','fixture','fixture','fixture')").run();
  db.prepare("UPDATE android_devices SET is_active=1, permissions_json=? WHERE id='d1'").run(JSON.stringify(["market.product.view", "market.sale.complete", "customer.view"]));
  assert.equal(storeAndroidLocalCredential(db, "device-one", token), true);
  db.prepare("INSERT INTO customer_commercial_profiles(customer_id,business_id,company_name,dealer_status,price_group,created_at,updated_at) VALUES ('c1','b1','Dealer','active','dealer_a','fixture','fixture')").run();
  let enabled = true;
  const server = new LocalCompanionServer({ enabled: () => enabled,
    authorize: ({ deviceId, token: secret }) => authorizeAndroidLocalCredential(db, deviceId, secret),
    readCustomerSalePreview: ({ deviceId, token: secret, customerId, lines }) => previewAndroidCustomerSale(db, { deviceId, token: secret }, { customerId, lines }) });
  await assert.rejects(() => server.start("127.0.0.1", 0), /https_required/);
  const dispatch = async (body, secret = token, deviceId = "device-one") => {
    const request = Readable.from([Buffer.from(typeof body === "string" ? body : JSON.stringify(body))]);
    Object.assign(request, { url: "/local/v1/customer-sale-preview", method: "POST", headers: { "x-ya-device-id": deviceId, "x-ya-local-token": secret }, socket: { remoteAddress: "127.0.0.1" } });
    let status, headers, payload;
    const response = { headersSent: false, writeHead(code, value) { status = code; headers = value; this.headersSent = true; }, end(value) { payload = JSON.parse(value); } };
    await server.handleRequest(request, response);
    assert.equal(headers["Cache-Control"], "no-store");
    return { status, payload };
  };
  const input = { customerId: "c1", lines: [{ productId: "p1", quantity: 1.5 }] };
  const before = databaseState(db), allowed = await dispatch(input);
  assert.equal(allowed.status, 200);
  assert.deepEqual(Object.keys(allowed.payload).sort(), ["currency", "generatedAtMs", "lines", "subtotalMinor"]);
  assert.deepEqual(allowed.payload.lines[0], { productId: "p1", quantity: 1.5, unitPriceMinor: 80000, currency: "TRY", updatedAt: "fixture" });
  assert.equal(allowed.payload.subtotalMinor, 120000); assert.deepEqual(databaseState(db), before);
  const anonymous = await dispatch({ lines: input.lines });
  assert.equal(anonymous.status, 200); assert.equal(anonymous.payload.subtotalMinor, 150000);
  const safeStorage = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => "gnome_libsecret",
    encryptString: value => Buffer.from(value), decryptString: value => value.toString() };
  const identity = new LocalCompanionTlsIdentity({ userDataPath: dirname(f.path), safeStorage, platform: "linux", addresses: () => ["127.0.0.1"] });
  const material = await identity.load();
  const tlsServer = new LocalCompanionServer({ ...server.options, httpsExperiment: { enabled: true, identity } });
  const address = await tlsServer.start("127.0.0.1", 0);
  try {
    const tlsResult = await new Promise((resolve, reject) => {
      const request = httpsRequest({ hostname: "127.0.0.1", port: address.port, path: "/local/v1/customer-sale-preview", method: "POST",
        ca: material.certificatePem, headers: { "X-YA-Device-Id": "device-one", "X-YA-Local-Token": token } }, response => {
        const certificate = new X509Certificate(response.socket.getPeerCertificate(true).raw);
        assert.equal(createHash("sha256").update(certificate.publicKey.export({ type: "spki", format: "der" })).digest("base64url"), material.spkiSha256);
        const chunks = []; response.on("data", chunk => chunks.push(chunk)); response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks)), cache: response.headers["cache-control"] }));
      });
      request.on("error", reject); request.end(JSON.stringify(input));
    });
    assert.equal(tlsResult.status, 200); assert.equal(tlsResult.cache, "no-store"); assert.equal(tlsResult.body.subtotalMinor, 120000);
  } finally { await tlsServer.stop(); }
  for (const body of [{ ...input, deviceId: "device-one" }, { ...input, token }, { ...input, lines: [{ ...input.lines[0], price: 1 }] },
    { lines: [] }, { lines: Array(201).fill(input.lines[0]) }, { customerId: null, lines: input.lines },
    { lines: [{ productId: "p1", quantity: "1" }] }, { lines: [{ productId: "p1", quantity: 0 }] }, "{broken"]) {
    const denied = await dispatch(body); assert.equal(denied.status, 403); assert.deepEqual(denied.payload, { code: "customer_sale_preview_denied" });
  }
  assert.equal((await dispatch(input, `yal_${"b".repeat(64)}`)).status, 403);
  enabled = false; assert.equal((await dispatch(input)).status, 403); enabled = true;
  db.prepare("UPDATE android_devices SET permissions_json=? WHERE id='d1'").run(JSON.stringify(["market.product.view", "market.sale.complete"]));
  assert.equal((await dispatch(input)).status, 403);
  db.prepare("UPDATE android_devices SET permissions_json=? WHERE id='d1'").run(JSON.stringify(["market.product.view", "market.sale.complete", "customer.view"]));
  db.prepare("UPDATE android_local_credentials SET revoked_at='revoked' WHERE device_id='device-one'").run();
  assert.equal((await dispatch(input)).status, 403);
  db.prepare("UPDATE android_local_credentials SET revoked_at='' WHERE device_id='device-one'").run();
  db.prepare("UPDATE android_devices SET is_active=0 WHERE id='d1'").run(); assert.equal((await dispatch(input)).status, 403);
  console.log("PASS source-backed Android customer sale preview server");
} finally { f.close(); }
