import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import { Readable } from "node:stream";
import ts from "typescript";

// Load the current owners, not dist-electron, against the canonical schema.
const require = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022
  } }).outputText;
  runInNewContext(code, { exports, Buffer, process, require: id => id.startsWith(".")
    ? load(resolve(dirname(file), id.replace(/\.js$/, ".ts"))) : require(id) }, { filename: file });
  return exports;
}
const owner = load("apps/desktop-app/electron/database/android-device-store.ts");
assert.equal(typeof owner.readAndroidDeviceAuthorizationEpoch, "function", "internal device epoch reader required");
const root = mkdtempSync("/tmp/opencode/android-device-epoch-");
const path = join(root, "fixture.sqlite");
const db = new DatabaseSync(path);
try {
  db.exec("PRAGMA journal_mode=WAL");
  db.exec(readFileSync("apps/desktop-app/db/schema.sql", "utf8"));
  const caps = new Set();
  const sighting = device_id => ({ device_id, device_name: "fixture", app_version: "test",
    first_seen_at: "2026-01-01T00:00:00.000Z", last_seen_at: "2026-01-01T00:00:00.000Z" });
  owner.upsertAndroidDeviceSightings(db, [sighting("device-one"), sighting("device-two")]);
  const epoch = id => owner.readAndroidDeviceAuthorizationEpoch(db, id);
  const first = epoch("device-one"), other = epoch("device-two");
  assert.ok(Number.isSafeInteger(first) && first > 0);
  assert.ok(Number.isSafeInteger(other) && other > 0);
  assert.equal(epoch("missing-device"), null);
  owner.upsertAndroidDeviceSightings(db, [{ ...sighting("device-one"), device_name: "renamed" }]);
  assert.equal(epoch("device-one"), first);
  assert.equal(owner.setAndroidDeviceActive(db, "device-one", true, caps).ok, true);
  assert.equal(owner.setAndroidDeviceRole(db, "device-one", "admin", caps).ok, true);
  assert.equal(epoch("device-one"), first);
  assert.equal(owner.setAndroidDeviceActive(db, "device-one", false, caps).ok, true);
  const disabled = epoch("device-one");
  assert.ok(disabled > first);
  assert.equal(owner.setAndroidDeviceActive(db, "device-one", true, caps).ok, true);
  assert.equal(epoch("device-one"), disabled);
  assert.equal(owner.revokeAndroidDevice(db, "device-one", caps).ok, true);
  const revoked = epoch("device-one");
  assert.ok(revoked > disabled);
  assert.equal(owner.setAndroidDeviceActive(db, "device-one", true, caps).ok, true);
  assert.equal(epoch("device-one"), revoked);
  assert.equal(epoch("device-two"), other);
  const reopened = new DatabaseSync(path);
  try { assert.equal(owner.readAndroidDeviceAuthorizationEpoch(reopened, "device-one"), revoked); }
  finally { reopened.close(); }
  assert.ok(existsSync("apps/desktop-app/electron/database/android-benefits-grant-store.ts"), "customer-scoped grant owner required");
  const grants = load("apps/desktop-app/electron/database/android-benefits-grant-store.ts");
  db.exec(`INSERT INTO business (id,name,display_name,profile_id,created_at,updated_at) VALUES ('b1','Fixture','Fixture','market','2026','2026');
    INSERT INTO customers (id,business_id,full_name,phone,created_at,updated_at) VALUES ('c1','b1','Fixture','','2026','2026'),('c2','b1','Other','','2026','2026');`);
  for (const capability of ["service.android", "commerce.benefits", "commerce.catalog", "core.customers", "commerce.sales"]) {
    db.prepare("INSERT INTO business_capabilities (business_id,capability_id,created_at,updated_at) VALUES ('b1',?,'2026','2026')").run(capability);
  }
  db.prepare("INSERT INTO commerce_benefit_settings (business_id,coupons_enabled,points_enabled,payment_modifiers_enabled,revision,updated_at_ms) VALUES ('b1',0,1,0,1,1)").run();
  const actor = { assertAuthorized() {} };
  assert.ok(existsSync("apps/desktop-app/electron/android-benefits-balance.ts"), "internal balance projection required");
  const projection = load("apps/desktop-app/electron/android-benefits-balance.ts");
  const credentials = load("apps/desktop-app/electron/database/android-local-credential-store.ts");
  const token = `yal_${"a".repeat(64)}`;
  assert.equal(credentials.storeAndroidLocalCredential(db, "device-one", token), true);
  const balance = (device = "device-one", secret = token, customer = "c1") =>
    projection.readAndroidPointBalance(db, "b1", device, secret, customer, "TRY");
  assert.equal(balance(), null, "admin has no implicit balance access");
  const check = (device = "device-one", customer = "c1") => grants.canReadAndroidBenefitsBalance(db, "b1", device, customer);
  assert.equal(check(), false, "admin has no inherited grant");
  assert.equal(check("device-two"), false, "staff has no inherited grant");
  assert.equal(grants.grantAndroidBenefitsBalance(db, actor, "b1", "device-one", "c1"), true);
  assert.equal(check(), true);
  db.prepare(`INSERT INTO commerce_benefit_point_ledger (business_id,id,customer_id,currency,kind,amount_minor,source_kind,source_id,operation_key,created_at_ms)
    VALUES ('b1','entry','c1','TRY','grant',125,'fixture','source','operation',1)`).run();
  const before = Date.now(), result = balance(), after = Date.now();
  assert.equal(result.availableMinor, 125);
  assert.ok(result.generatedAtMs >= before && result.generatedAtMs <= after);
  assert.deepEqual(Object.keys(result).sort(), ["availableMinor", "generatedAtMs"]);
  const serverExports = {};
  const serverCode = ts.transpileModule(readFileSync("apps/desktop-app/electron/local-companion-server.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  runInNewContext(serverCode, { exports: serverExports, Buffer, URL, process, setTimeout, clearTimeout,
    require: createRequire(resolve("apps/desktop-app/dist-electron/local-companion-server.js")) });
  let enabled = true;
  const server = new serverExports.LocalCompanionServer({ enabled: () => enabled,
    authorize: ({ deviceId, token }) => credentials.authorizeAndroidLocalCredential(db, deviceId, token),
    readBenefitsBalance: ({ deviceId, token, customerId, currency }) =>
      projection.readAndroidPointBalance(db, "b1", deviceId, token, customerId, currency) });
  const dispatch = async (body, secret = token) => {
    const request = Readable.from([Buffer.from(JSON.stringify(body))]);
    Object.assign(request, { url: "/local/v1/benefits-balance", method: "POST",
      headers: { "x-ya-device-id": "device-one", "x-ya-local-token": secret }, socket: { remoteAddress: "127.0.0.1" } });
    let status, headers, payload;
    const response = { headersSent: false, writeHead(code, value) { status = code; headers = value; this.headersSent = true; },
      end(value) { payload = JSON.parse(value); } };
    await server.handleRequest(request, response);
    assert.equal(headers["Cache-Control"], "no-store");
    return { status, payload };
  };
  const input = { customerId: "c1", currency: "TRY" };
  const allowed = await dispatch(input);
  assert.equal(allowed.status, 200);
  assert.equal(allowed.payload.availableMinor, 125);
  assert.deepEqual(Object.keys(allowed.payload).sort(), ["availableMinor", "generatedAtMs"]);
  for (const [body, secret] of [[input, ""], [input, `yal_${"b".repeat(64)}`], [{ ...input, customerId: "c2" }, token],
    [{ ...input, deviceId: "device-two" }, token]]) {
    const denied = await dispatch(body, secret);
    assert.equal(denied.status, 403);
    assert.equal(denied.payload.code, "benefits_balance_denied");
  }
  enabled = false;
  assert.equal((await dispatch(input)).status, 403);
  enabled = true;
  assert.equal(grants.revokeAndroidBenefitsBalance(db, actor, "b1", "device-one", "c1"), true);
  assert.equal((await dispatch(input)).status, 403);
  assert.equal(grants.grantAndroidBenefitsBalance(db, actor, "b1", "device-one", "c1"), true);
  db.prepare("UPDATE business_capabilities SET is_enabled=0 WHERE business_id='b1' AND capability_id='commerce.benefits'").run();
  assert.equal((await dispatch(input)).status, 403);
  db.prepare("UPDATE business_capabilities SET is_enabled=1 WHERE business_id='b1' AND capability_id='commerce.benefits'").run();
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE business SET display_name='pending' WHERE id='b1'").run();
    assert.equal(balance(), null, "existing transaction must fail closed");
    assert.equal(db.prepare("SELECT display_name FROM business WHERE id='b1'").get().display_name, "pending");
  } finally { db.exec("ROLLBACK"); }
  const failingReader = new Proxy(db, { get(target, property) {
    if (property === "prepare") return sql => {
      if (sql.includes("android_benefits_balance_grants")) throw new Error("fixture read failure");
      return target.prepare(sql);
    };
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  assert.throws(() => projection.readAndroidPointBalance(failingReader, "b1", "device-one", token, "c1", "TRY"), /fixture read failure/);
  assert.equal(balance()?.availableMinor, 125, "read failure rolls back its own transaction");
  const writer = new DatabaseSync(path);
  try {
    let intervened = false;
    const reader = new Proxy(db, { get(target, property) {
      if (property === "prepare") return sql => {
        const statement = target.prepare(sql);
        if (!sql.includes("SELECT credentials.token_hash")) return statement;
        return new Proxy(statement, { get(stmt, key) {
          if (key === "get") return (...args) => {
            const row = stmt.get(...args);
            writer.exec(`BEGIN IMMEDIATE;
              DELETE FROM android_benefits_balance_grants WHERE business_id='b1';
              INSERT INTO commerce_benefit_point_ledger (business_id,id,customer_id,currency,kind,amount_minor,source_kind,source_id,operation_key,created_at_ms)
                VALUES ('b1','entry2','c1','TRY','grant',50,'fixture','source2','operation2',2);
              COMMIT;`);
            intervened = true;
            return row;
          };
          const value = Reflect.get(stmt, key, stmt);
          return typeof value === "function" ? value.bind(stmt) : value;
        } });
      };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    const concurrent = projection.readAndroidPointBalance(reader, "b1", "device-one", token, "c1", "TRY");
    assert.equal(intervened, true);
    assert.equal(concurrent?.availableMinor, 125, "one snapshot sees original grant and balance");
    assert.equal(balance(), null, "next snapshot sees revocation");
    assert.equal(grants.grantAndroidBenefitsBalance(db, actor, "b1", "device-one", "c1"), true);
    assert.equal(balance()?.availableMinor, 175);
    owner.setAndroidDeviceActive(writer, "device-one", false, caps);
    assert.equal(balance(), null, "subsequent snapshot sees disabled device");
    owner.setAndroidDeviceActive(writer, "device-one", true, caps);
    assert.equal(grants.grantAndroidBenefitsBalance(db, actor, "b1", "device-one", "c1"), true);
  } finally { writer.close(); }
  assert.equal(balance("device-one", `yal_${"b".repeat(64)}`), null);
  assert.equal(balance("device-two"), null);
  assert.equal(balance("device-one", token, "c2"), null);
  assert.equal(projection.readAndroidPointBalance(db, "other-business", "device-one", token, "c1", "TRY"), null);
  assert.equal(projection.readAndroidPointBalance(db, "b1", "device-one", token, "c1", "try"), null);
  credentials.revokeAndroidLocalCredential(db, "device-one");
  assert.equal(balance(), null, "revoked credential denied");
  assert.equal(credentials.storeAndroidLocalCredential(db, "device-one", token), true);
  db.prepare("UPDATE commerce_benefit_settings SET points_enabled=0 WHERE business_id='b1'").run();
  assert.equal(balance(), null);
  db.prepare("UPDATE commerce_benefit_settings SET points_enabled=1 WHERE business_id='b1'").run();
  assert.equal(check("device-one", "c2"), false);
  assert.equal(check("device-one", "missing"), false);
  assert.equal(grants.canReadAndroidBenefitsBalance(db, "other-business", "device-one", "c1"), false);
  assert.equal(grants.grantAndroidBenefitsBalance(db, actor, "b1", "device-one", "missing"), false);
  db.prepare("UPDATE customers SET deleted_at='deleted' WHERE id='c1'").run();
  assert.equal(check(), false);
  db.prepare("UPDATE customers SET deleted_at='' WHERE id='c1'").run();
  for (const capability of ["service.android", "commerce.benefits", "commerce.catalog", "core.customers", "commerce.sales"]) {
    db.prepare("UPDATE business_capabilities SET is_enabled=0 WHERE capability_id=?").run(capability);
    assert.equal(check(), false, capability);
    assert.equal(balance(), null, capability);
    db.prepare("UPDATE business_capabilities SET is_enabled=1 WHERE capability_id=?").run(capability);
  }
  db.prepare("UPDATE business_capabilities SET is_enabled=0 WHERE capability_id='commerce.sales'").run();
  db.prepare("INSERT INTO business_capabilities (business_id,capability_id,created_at,updated_at) VALUES ('b1','commerce.orders','2026','2026')").run();
  assert.equal(check(), true, "orders can replace sales");
  db.prepare("UPDATE business_capabilities SET is_enabled=1 WHERE capability_id='commerce.sales'").run();
  owner.setAndroidDeviceActive(db, "device-one", false, caps);
  assert.equal(check(), false);
  assert.equal(balance(), null);
  owner.setAndroidDeviceActive(db, "device-one", true, caps);
  assert.equal(check(), false, "old grant remains stale after reactivation");
  assert.equal(balance(), null);
  assert.equal(grants.grantAndroidBenefitsBalance(db, actor, "b1", "device-one", "c1"), true);
  owner.revokeAndroidDevice(db, "device-one", caps);
  assert.equal(check(), false);
  assert.equal(balance(), null);
  owner.setAndroidDeviceActive(db, "device-one", true, caps);
  assert.equal(check(), false);
  assert.equal(grants.grantAndroidBenefitsBalance(db, actor, "b1", "device-one", "c1"), true);
  assert.equal(grants.revokeAndroidBenefitsBalance(db, actor, "b1", "device-one", "c1"), true);
  assert.equal(check(), false);
  assert.equal(balance(), null);
  assert.throws(() => grants.grantAndroidBenefitsBalance(db, { assertAuthorized() { throw new Error("locked"); } }, "b1", "device-one", "c1"), /locked/);
  assert.equal(grants.grantAndroidBenefitsBalance(db, actor, "b1", "device-one", "c1"), true);
  db.prepare("DELETE FROM android_devices WHERE device_id = ?").run("device-one");
  owner.upsertAndroidDeviceSightings(db, [sighting("device-one")]);
  owner.setAndroidDeviceActive(db, "device-one", true, caps);
  assert.equal(check(), false, "re-enrolled external id is not the original device");
  console.log("android-device-authorization-epoch: PASS");
} finally { db.close(); rmSync(root, { recursive: true, force: true }); }
