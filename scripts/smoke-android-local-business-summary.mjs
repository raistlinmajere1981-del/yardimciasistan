import assert from "node:assert/strict";
import { dirname } from "node:path";
import { request as httpsRequest } from "node:https";
import { saleFixture, load } from "./test-helpers/market-sale-benefits-fixture.mjs";

const f = saleFixture();
try {
  const db = f.db, token = `yal_${"a".repeat(64)}`;
  db.exec("INSERT INTO android_devices(id,device_id,role,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('d1','device-one','admin','fixture','fixture','fixture','fixture'); UPDATE android_devices SET is_active=1 WHERE id='d1'");
  const credentials = load("database/android-local-credential-store");
  assert.equal(credentials.storeAndroidLocalCredential(db, "device-one", token), true);
  const safeStorage = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => "gnome_libsecret", encryptString: x => Buffer.from(x), decryptString: x => x.toString() };
  const identity = new (load("local-companion-tls-identity").LocalCompanionTlsIdentity)({ userDataPath: dirname(f.path), safeStorage, platform: "linux", addresses: () => ["127.0.0.1"] });
  const material = await identity.load();
  const snapshot = { requests: [], summary: {}, business_capabilities: [], androidPermissions: { "device-one": { is_active: true, permissions: [] } } };
  let invalidIdentity = false;
  const server = new (load("local-companion-server").LocalCompanionServer)({ enabled: () => true, httpsExperiment: { enabled: true, identity },
    authorize: ({ deviceId, token: secret }) => credentials.authorizeAndroidLocalCredential(db, deviceId, secret),
    desktopId: () => "desktop-test",
    businessInfo: () => ({ displayName: "Example", phone: "", whatsapp: "" }),
    activeBusinessId: () => invalidIdentity ? " invalid " : String(db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get()?.id ?? ""),
    createSummary: () => snapshot });
  const address = await server.start("127.0.0.1", 0);
  try {
    const send = (body, secret = token) => new Promise((resolve, reject) => {
      const req = httpsRequest({ hostname: "127.0.0.1", port: address.port, path: "/local/v1/summary", method: "POST", ca: material.certificatePem,
        headers: { "X-YA-Device-Id": "device-one", "X-YA-Local-Token": secret } }, res => {
        const chunks = []; res.on("data", chunk => chunks.push(chunk)); res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks)), cache: res.headers["cache-control"] }));
      }); req.on("error", reject); req.end(JSON.stringify(body));
    });
    const first = await send({ business_id: "forged" }); assert.equal(first.status, 200); assert.equal(first.body.business_id, "b1"); assert.equal(first.cache, "no-store");
    const unchanged = await send({ known_server_revision: first.body.server_revision }); assert.equal(unchanged.body.not_modified, true); assert.equal(unchanged.body.business_id, "b1");
    snapshot.androidPermissions["device-one"].is_active = false;
    assert.equal(Object.hasOwn((await send({})).body, "business_id"), false);
    snapshot.androidPermissions["device-one"].is_active = true;
    invalidIdentity = true; assert.equal(Object.hasOwn((await send({})).body, "business_id"), false); invalidIdentity = false;
    db.prepare("UPDATE business SET deleted_at='inactive' WHERE id='b1'").run();
    const changed = await send({ known_server_revision: first.body.server_revision }); assert.equal(changed.body.business_id, "b2"); assert.notEqual(changed.body.not_modified, true);
    assert.equal((await send({}, `yal_${"b".repeat(64)}`)).status, 401);
    db.prepare("UPDATE business SET deleted_at='inactive' WHERE id='b2'").run();
    const none = await send({ known_server_revision: changed.body.server_revision }); assert.notEqual(none.body.not_modified, true); assert.equal(Object.hasOwn(none.body, "business_id"), false);
    console.log("PASS local HTTPS current business identity");
  } finally { await server.stop(); }
} finally { f.close(); }
