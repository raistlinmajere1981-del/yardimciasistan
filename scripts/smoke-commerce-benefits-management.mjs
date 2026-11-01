import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { managementFixture, managementModules, benefitsNavigationModule } from "./test-helpers/commerce-benefits-management-fixture.mjs";
import { NOW, rule, capabilities } from "./test-helpers/commerce-benefits-fixture.mjs";

function useFixture(t) { const f = managementFixture(); t.after(() => f.close()); return f; }
const adjustment = (overrides = {}) => ({ customerId: "c1", currency: "TRY", amountMinor: 1500, expiresAt: null,
  reason: "correction", note: "Sayım düzeltmesi", operationKey: "staff-adjustment", ...overrides });
const fails = (operation, code) => assert.throws(operation, error => error.code === code);

test("owner-only spend management pins paired device identity independently of balance", t => {
  const f = useFixture(t), s = f.service, db = f.db;
  db.exec(`INSERT INTO business_capabilities(business_id,capability_id,created_at,updated_at) VALUES ('b1','service.android','t','t');
    INSERT INTO android_devices(id,device_id,role,is_active,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('row1','device-one','admin',0,'t','t','t','t');
    UPDATE android_devices SET is_active=1 WHERE id='row1';
    INSERT INTO android_local_credentials(device_id,token_hash,created_at,updated_at) VALUES ('device-one','fixture-hash','t','t');`);
  const input = { deviceId: "device-one", customerId: "c1", recordId: "row1", confirmed: true };
  assert.equal(typeof s.changeCompanionPointSpendGrant, "function");
  assert.equal(s.companionPointSpendGrantStatus(input), false);
  assert.equal(s.grantCompanionPointBalance(input.deviceId, input.customerId, input.recordId), true);
  assert.equal(s.companionPointSpendGrantStatus(input), false);
  db.exec("UPDATE android_local_credentials SET revoked_at='revoked' WHERE device_id='device-one'");
  assert.equal(s.changeCompanionPointSpendGrant(input, true), false);
  db.exec("UPDATE android_local_credentials SET revoked_at='' WHERE device_id='device-one'");
  fails(() => s.changeCompanionPointSpendGrant({ ...input, confirmed: false }, true), "BENEFITS_INVALID_CONTEXT");
  fails(() => s.changeCompanionPointSpendGrant({ ...input, confirmed: false }, false), "BENEFITS_INVALID_CONTEXT");
  fails(() => s.changeCompanionPointSpendGrant({ ...input, recordId: undefined }, true), "BENEFITS_INVALID_CONTEXT");
  fails(() => s.companionPointSpendGrantStatus({ ...input, recordId: " row1" }), "BENEFITS_INVALID_CONTEXT");
  assert.equal(s.changeCompanionPointSpendGrant({ ...input, recordId: "wrong" }, true), false);
  assert.equal(s.changeCompanionPointSpendGrant(input, true), true);
  assert.equal(s.companionPointSpendGrantStatus(input), true);
  assert.equal(s.companionPointSpendGrantStatus({ ...input, recordId: "wrong" }), false);
  assert.equal(s.changeCompanionPointSpendGrant({ ...input, recordId: "wrong" }, false), false);
  assert.equal(s.revokeCompanionPointBalance(input.deviceId, input.customerId, input.recordId), true);
  assert.equal(s.companionPointGrantStatus(input), false);
  assert.equal(s.companionPointSpendGrantStatus(input), true);
  for (const property of ["locked", "revoked"]) {
    f.state[property] = true;
    fails(() => s.companionPointSpendGrantStatus(input), "BENEFITS_STAFF_REQUIRED");
    fails(() => s.changeCompanionPointSpendGrant(input, true), "BENEFITS_STAFF_REQUIRED");
    fails(() => s.changeCompanionPointSpendGrant(input, false), "BENEFITS_STAFF_REQUIRED");
    f.state[property] = false;
  }
  f.state.role = "staff";
  fails(() => s.changeCompanionPointSpendGrant(input, false), "BENEFITS_STAFF_REQUIRED");
  fails(() => s.companionPointSpendGrantStatus(input), "BENEFITS_STAFF_REQUIRED");
  f.state.role = "desktop_owner";
  db.exec("UPDATE android_local_credentials SET revoked_at='revoked' WHERE device_id='device-one'");
  assert.equal(s.companionPointSpendGrantStatus(input), false);
  assert.equal(s.changeCompanionPointSpendGrant(input, true), false);
  db.exec("UPDATE android_local_credentials SET revoked_at='' WHERE device_id='device-one'");
  assert.equal(s.changeCompanionPointSpendGrant(input, false), true);
  assert.equal(s.companionPointSpendGrantStatus(input), false);
  const snap = s.snapshot(); s.configure({ revision: snap.revision, families: { ...snap.families, points: false } });
  fails(() => s.changeCompanionPointSpendGrant(input, true), "BENEFITS_POINTS_UNAVAILABLE");
  const disabled = s.snapshot(); s.configure({ revision: disabled.revision, families: { ...disabled.families, points: true } });
  assert.equal(s.changeCompanionPointSpendGrant(input, true), true);
  db.exec("UPDATE android_devices SET is_active=0 WHERE id='row1'"); assert.equal(s.companionPointSpendGrantStatus(input), false);
  db.exec("DELETE FROM android_devices WHERE id='row1'");
  db.exec("INSERT INTO android_devices(id,device_id,role,is_active,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('row2','device-one','admin',0,'t','t','t','t'); UPDATE android_devices SET is_active=1 WHERE id='row2'");
  assert.equal(s.companionPointSpendGrantStatus(input), false);
  assert.equal(s.changeCompanionPointSpendGrant(input, true), false);
});

test("owner-bound Companion grants deny disabled points and never revive on re-enable", t => {
  const f = useFixture(t), s = f.service, db = f.db;
  const grants = f.modules.load("database/android-benefits-grant-store");
  db.prepare("INSERT INTO business_capabilities (business_id,capability_id,created_at,updated_at) VALUES ('b1','service.android','fixture','fixture')").run();
  db.prepare("INSERT INTO android_devices (id,device_id,role,is_active,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('d1','device-one','admin',0,'t','t','t','t')").run();
  db.prepare("UPDATE android_devices SET is_active=1 WHERE id='d1'").run();
  const check = () => grants.canReadAndroidBenefitsBalance(db, "b1", "device-one", "c1");
  assert.equal(check(), false);
  assert.equal(typeof s.grantCompanionPointBalance, "function");
  assert.equal(s.grantCompanionPointBalance("device-one", "c1"), true);
  assert.equal(check(), true);
  assert.equal(s.grantCompanionPointBalance("device-one", "c3"), false);
  assert.equal(s.grantCompanionPointBalance("unknown-device", "c1"), false);
  fails(() => s.grantCompanionPointBalance(" device-one", "c1"), "BENEFITS_INVALID_CONTEXT");
  for (const property of ["locked", "revoked"]) {
    f.state[property] = true;
    fails(() => s.grantCompanionPointBalance("device-one", "c1"), "BENEFITS_STAFF_REQUIRED");
    fails(() => s.revokeCompanionPointBalance("device-one", "c1"), "BENEFITS_STAFF_REQUIRED");
    f.state[property] = false;
  }
  f.state.role = "staff";
  fails(() => s.grantCompanionPointBalance("device-one", "c1"), "BENEFITS_STAFF_REQUIRED");
  fails(() => s.revokeCompanionPointBalance("device-one", "c1"), "BENEFITS_STAFF_REQUIRED");
  f.state.role = "desktop_owner";
  db.prepare("UPDATE business_capabilities SET is_enabled=0 WHERE business_id='b1' AND capability_id='commerce.benefits'").run();
  fails(() => s.revokeCompanionPointBalance("device-one", "c1"), "BENEFITS_CAPABILITY_DISABLED");
  db.prepare("UPDATE business_capabilities SET is_enabled=1 WHERE business_id='b1' AND capability_id='commerce.benefits'").run();
  const before = s.snapshot();
  s.configure({ revision: before.revision, families: { ...before.families, points: false } });
  assert.equal(check(), false);
  fails(() => s.grantCompanionPointBalance("device-one", "c1"), "BENEFITS_POINTS_UNAVAILABLE");
  assert.equal(s.revokeCompanionPointBalance("device-one", "c1"), false);
  const disabled = s.snapshot();
  s.configure({ revision: disabled.revision, families: { ...disabled.families, points: true } });
  assert.equal(check(), false);
  assert.equal(s.grantCompanionPointBalance("device-one", "c1"), true);
  assert.equal(s.revokeCompanionPointBalance("device-one", "c1"), true);
  assert.equal(check(), false);
  assert.equal(f.state.keyLoads, 0);
});

test("SQLite rule CRUD is versioned; independent family switches survive connection reopen; no dummy rules", t => {
  const f = useFixture(t), s = f.service;
  assert.equal(s.snapshot().rules.length, 0);
  assert.equal(s.snapshot().checkoutIntegrated, false);
  const initial = s.snapshot();
  const configured = s.configure({ revision: initial.revision, families: { coupon: true, points: false, payment_modifier: true } });
  assert.equal(configured.revision, initial.revision + 1);
  fails(() => s.configure({ revision: initial.revision, families: initial.families }), "BENEFITS_SETTINGS_VERSION_CONFLICT");
  const created = s.saveRule(rule("summer", "coupon", { status: "draft" }));
  fails(() => s.saveRule(created), "BENEFITS_RULE_VERSION_CONFLICT");
  const edited = s.saveRule({ ...created, version: 2, percentBps: 1000, status: "active" });
  s.saveRule({ ...edited, version: 3, status: "disabled" });
  const reopened = new DatabaseSync(f.path); t.after(() => reopened.close());
  const projection = f.create(reopened).snapshot();
  assert.deepEqual(projection.families, { coupon: true, points: false, payment_modifier: true });
  assert.equal(projection.rules[0].status, "disabled");
  assert.equal(projection.rules[0].version, 3);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_benefit_rules").get().n, 3);
  assert.throws(() => f.db.prepare("DELETE FROM commerce_benefit_rules").run(), /BENEFITS_IMMUTABLE/);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_benefit_point_ledger").get().n, 0);
});

test("empty management reads do not create rules/settings/key; navigation exposes only the authorized existing page", t => {
  const f = useFixture(t);
  f.db.prepare("DELETE FROM commerce_benefit_settings WHERE business_id = 'b1'").run();
  assert.deepEqual(f.service.snapshot().families, { coupon: false, points: false, payment_modifier: false });
  assert.equal(f.service.snapshot().revision, 0);
  assert.equal(f.state.keyLoads, 0);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_benefit_settings WHERE business_id = 'b1'").get().n, 0);
  const navigation = benefitsNavigationModule();
  const snapshot = values => ({ enabledCapabilities: values });
  const rows = values => navigation.buildNavigation(snapshot(values)).filter(item => item.id === "marketing");
  assert.equal(rows([]).length, 0);
  assert.equal(rows(["commerce.benefits"]).length, 0);
  const base = ["commerce.benefits", "core.customers", "commerce.catalog"];
  assert.equal(rows(base).length, 0);
  for (const parent of ["commerce.sales", "commerce.orders"]) {
    assert.equal(rows([...base, parent]).length, 1);
    assert.equal(rows([...base, parent])[0].label, "İndirim ve Puan");
    assert.equal(navigation.getPageMeta("marketing", snapshot([...base, parent])).title, "İndirim ve Puan");
  }
  // Marketing Studio's persisted dependency closure is supplied by its canonical graph.
  const studio = capabilities.expandBusinessCapabilities([capabilities.BUSINESS_CAPABILITIES.MARKETING_STUDIO]);
  assert.equal(rows([...base, "commerce.sales", ...studio]).length, 1);
  assert.equal(rows([...base, "commerce.sales", ...studio])[0].label, "Pazarlama");
});

test("canonical DesktopDatabase facade passes its existing SQLite connection into the management owner", t => {
  const f = useFixture(t);
  const { DesktopDatabase } = f.modules.load("database");
  // Inject the disposable canonical connection; unrelated facade service imports are inert.
  const facade = Object.create(DesktopDatabase.prototype); facade.db = f.db;
  const service = facade.commerceBenefitsManagement(f.keys, f.actor);
  service.saveRule(rule("facade-rule", "payment_modifier"));
  assert.equal(f.service.snapshot().rules[0].id, "facade-rule");
  f.state.locked = true;
  fails(() => service.snapshot(), "BENEFITS_STAFF_REQUIRED");
});

test("management rechecks current staff role, lock, revocation and persisted dependencies on every operation", t => {
  const f = useFixture(t), s = f.service;
  const operations = [() => s.snapshot(), () => s.saveRule(rule("x", "coupon")), () => s.configure({ revision: 1, families: { coupon: false, points: false, payment_modifier: false } }),
    () => s.pointAccount("c1", "TRY"), () => s.adjustPoints(adjustment()), () => s.expirePoints({ customerId: "c1", currency: "TRY", operationKey: "expiry", note: "Süre sonu" }),
    () => s.issueCoupon({ ruleId: "x", maxUses: 1, maxUsesPerCustomer: null, expiresAt: NOW + 10000 })];
  for (const property of ["locked", "revoked"]) { f.state[property] = true; operations.forEach(operation => fails(operation, "BENEFITS_STAFF_REQUIRED")); f.state[property] = false; }
  f.state.role = "viewer"; operations.forEach(operation => fails(operation, "BENEFITS_STAFF_REQUIRED")); f.state.role = "desktop_owner";
  for (const capability of ["commerce.benefits", "commerce.catalog", "core.customers", "commerce.sales"]) {
    f.db.prepare("UPDATE business_capabilities SET is_enabled = 0 WHERE business_id = 'b1' AND capability_id = ?").run(capability);
    operations.forEach(operation => fails(operation, "BENEFITS_CAPABILITY_DISABLED"));
    f.db.prepare("UPDATE business_capabilities SET is_enabled = 1 WHERE business_id = 'b1' AND capability_id = ?").run(capability);
  }
  fails(() => s.pointAccount("c3", "TRY"), "BENEFITS_CUSTOMER_SCOPE");
  fails(() => s.adjustPoints(adjustment({ customerId: "c3" })), "BENEFITS_CUSTOMER_SCOPE");
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_benefit_management_audit").get().n, 0);
});

test("manual Puan adjustments/expiry retain immutable reason + actor and exact idempotent receipts", t => {
  const f = useFixture(t), s = f.service;
  const input = adjustment({ expiresAt: NOW + 1000, actor: "renderer-forged-staff" });
  fails(() => s.adjustPoints({ ...input, note: "" }), "BENEFITS_ADJUSTMENT_REASON_REQUIRED");
  fails(() => s.adjustPoints({ ...input, operationKey: "" }), "BENEFITS_OPERATION_KEY_REQUIRED");
  const receipt = s.adjustPoints(input);
  assert.equal(s.adjustPoints(input).entryId, receipt.entryId);
  fails(() => s.adjustPoints({ ...input, note: "Başka gerekçe" }), "BENEFITS_IDEMPOTENCY_INTENT_CHANGED");
  fails(() => s.adjustPoints({ ...input, amountMinor: 1501 }), "BENEFITS_IDEMPOTENCY_INTENT_CHANGED");
  const account = s.pointAccount("c1", "TRY");
  assert.equal(account.availableMinor, 1500); assert.equal(account.entries.length, 1);
  assert.equal(account.entries[0].reason, input.note); assert.equal(account.entries[0].actor, "local-desktop-owner");
  assert.equal(s.pointAccount("c1", "USD").availableMinor, 0);
  assert.throws(() => f.db.prepare("UPDATE commerce_benefit_management_audit SET note = 'changed'").run(), /BENEFITS_IMMUTABLE/);
  f.state.now += 1001;
  assert.equal(s.pointAccount("c1", "TRY").availableMinor, 0);
  const expire = { customerId: "c1", currency: "TRY", operationKey: "expire", note: "Süresi dolan Puan" };
  const expired = s.expirePoints(expire);
  assert.equal(expired.entryIds.length, 1); assert.equal(s.expirePoints(expire).entryIds[0], expired.entryIds[0]);
  assert.equal(s.pointAccount("c1", "TRY").postedMinor, 0);
});

test("coupon secret returned once only; projections, SQLite and safe failures never reveal it or URL secrets", t => {
  const f = useFixture(t), s = f.service;
  s.saveRule(rule("coupon", "coupon"));
  const issued = s.issueCoupon({ ruleId: "coupon", maxUses: 3, maxUsesPerCustomer: 1, expiresAt: NOW + 10000 });
  assert.match(issued.secret, /^[A-F0-9]{40}$/);
  const projection = JSON.stringify(s.snapshot());
  assert(!projection.includes(issued.secret)); assert(!projection.includes("code_hmac"));
  const row = f.db.prepare("SELECT * FROM commerce_benefit_coupon_codes WHERE id = ?").get(issued.codeId);
  assert(!JSON.stringify(row).includes(issued.secret));
  assert(!readFileSync(f.path).includes(Buffer.from(issued.secret)));
  const ipc = f.modules.load("ipc/commerce-benefits-ipc");
  const result = ipc.benefitsManagementFailure(new Error(`https://example.test/?secret=${issued.secret}`));
  assert.equal(result.ok, false); assert(!JSON.stringify(result).includes(issued.secret)); assert(!JSON.stringify(result).includes("https://"));
  f.state.secure = false;
  assert.equal(s.snapshot().secureOperationsAvailable, false);
  fails(() => s.issueCoupon({ ruleId: "coupon", maxUses: 1, maxUsesPerCustomer: null, expiresAt: NOW + 10000 }), "BENEFITS_SECURE_STORAGE_UNAVAILABLE");
  fails(() => s.adjustPoints(adjustment()), "BENEFITS_SECURE_STORAGE_UNAVAILABLE");
  s.saveRule(rule("offline-configuration", "points"));
  assert.equal(s.snapshot().rules.length, 2);
});

test("all real B1 IPC registrations reject untrusted frames, webviews, lock and revoked capability without invoking mutations", t => {
  const handlers = new Map(), root = mkdtempSync(join(tmpdir(), "benefits-ipc-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const modules = managementModules({ app: { getPath: () => root }, safeStorage: {}, ipcMain: { handle: (name, handler) => handlers.set(name, handler) } });
  const f = useFixture(t); let locked = false;
  const facade = { commerceBenefitsManagement: () => f.service };
  modules.load("ipc/commerce-benefits-ipc").registerCommerceBenefitsIpcHandlers({ getDatabase: () => facade,
    assertUnlocked: () => { if (locked) throw new Error("LOCK_PRIVATE"); }, isTrustedRendererUrl: url => url === "file:///trusted.html" });
  const frame = { url: "file:///trusted.html" }, sender = { getType: () => "window", mainFrame: frame };
  const event = { sender, senderFrame: frame };
  assert.equal(handlers.size, 14);
  for (const handler of handlers.values()) {
    assert.equal(handler({ ...event, senderFrame: { url: frame.url } }).code, "BENEFITS_STAFF_REQUIRED");
    assert.equal(handler({ ...event, sender: { ...sender, getType: () => "webview" } }).code, "BENEFITS_STAFF_REQUIRED");
    frame.url = "https://evil.test/?token=PRIVATE_URL_SECRET";
    const result = handler(event); assert.equal(result.ok, false); assert(!JSON.stringify(result).includes("PRIVATE_URL_SECRET")); frame.url = "file:///trusted.html";
    locked = true; assert.equal(handler(event).code, "BENEFITS_SESSION_LOCKED"); locked = false;
  }
  assert.equal(handlers.get("benefits:get")(event).ok, true);
  f.db.prepare("UPDATE business_capabilities SET is_enabled = 0 WHERE capability_id = 'commerce.benefits'").run();
  for (const handler of handlers.values()) assert.equal(handler(event).code, "BENEFITS_CAPABILITY_DISABLED");
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_benefit_point_ledger").get().n, 0);
});

test("Companion grant IPC requires trusted owner confirmation and exposes only current exact scope", t => {
  const f = useFixture(t), handlers = new Map();
  const modules = managementModules({ app: { getPath: () => "/tmp/opencode" }, safeStorage: {}, ipcMain: { handle: (name, handler) => handlers.set(name, handler) } });
  let locked = false;
  modules.load("ipc/commerce-benefits-ipc").registerCommerceBenefitsIpcHandlers({ getDatabase: () => ({ commerceBenefitsManagement: () => f.service }),
    assertUnlocked: () => { if (locked) throw Error("locked"); }, isTrustedRendererUrl: url => url === "file:///trusted" });
  const frame = { url: "file:///trusted" }, event = { senderFrame: frame, sender: { getType: () => "window", mainFrame: frame } };
  f.db.prepare("INSERT INTO business_capabilities (business_id,capability_id,created_at,updated_at) VALUES ('b1','service.android','t','t')").run();
  f.db.prepare("INSERT INTO android_devices (id,device_id,role,is_active,first_seen_at,last_seen_at,created_at,updated_at) VALUES ('d1','device-one','admin',1,'t','t','t','t')").run();
  f.db.prepare("UPDATE android_devices SET is_active=1 WHERE id='d1'").run();
  const devices = handlers.get("benefits:companionDevices");
  assert.equal(typeof devices, "function");
  assert.equal(devices(event).value.length, 0, "unpaired device excluded");
  f.db.prepare("INSERT INTO android_local_credentials (device_id,token_hash,created_at,updated_at) VALUES ('device-one',?,'t','t')").run("a".repeat(64));
  assert.equal(devices(event).value.length, 1);
  assert.equal(devices(event).value[0].deviceId, "device-one");
  assert.deepEqual(Object.keys(devices(event).value[0]).sort(), ["deviceId", "deviceName", "recordId"]);
  f.db.prepare("UPDATE android_local_credentials SET revoked_at='revoked' WHERE device_id='device-one'").run();
  assert.equal(devices(event).value.length, 0);
  f.db.prepare("UPDATE android_local_credentials SET revoked_at='' WHERE device_id='device-one'").run();
  f.db.prepare("UPDATE android_devices SET is_active=0 WHERE id='d1'").run();
  assert.equal(devices(event).value.length, 0);
  f.db.prepare("UPDATE android_devices SET is_active=1 WHERE id='d1'").run();
  const scope = { deviceId: "device-one", customerId: "c1" };
  const list = handlers.get("benefits:companionGrantStatus"), grant = handlers.get("benefits:companionGrant"), revoke = handlers.get("benefits:companionRevoke");
  const spendStatus = handlers.get("benefits:companionSpendStatus"), spendGrant = handlers.get("benefits:companionSpendGrant"), spendRevoke = handlers.get("benefits:companionSpendRevoke");
  assert.equal(typeof spendStatus, "function");
  const spendScope = { ...scope, recordId: "d1", confirmed: true };
  assert.equal(spendStatus(event, spendScope).value, false);
  assert.equal(spendGrant(event, { ...spendScope, recordId: "wrong" }).value, false);
  assert.equal(spendGrant(event, { ...spendScope, confirmed: false }).ok, false);
  assert.equal(spendGrant(event, spendScope).value, true);
  assert.equal(list(event, scope).value, false);
  assert.equal(spendStatus(event, spendScope).value, true);
  assert.equal(spendRevoke(event, spendScope).value, true);
  assert.equal(spendStatus(event, spendScope).value, false);
  assert.equal(typeof list, "function");
  assert.equal(list(event, scope).value, false);
  assert.equal(grant(event, scope).ok, false, "explicit owner confirmation required");
  assert.equal(grant(event, { ...scope, confirmed: true, recordId: "replaced-record" }).value, false);
  assert.equal(grant(event, { ...scope, confirmed: true }).value, true);
  assert.equal(list(event, scope).value, true);
  assert.equal(list(event, { ...scope, customerId: "c2" }).value, false);
  locked = true;
  for (const handler of [list, grant, revoke, spendStatus, spendGrant, spendRevoke]) assert.equal(handler(event, { ...spendScope, confirmed: true }).code, "BENEFITS_SESSION_LOCKED");
  locked = false;
  f.db.prepare("UPDATE android_devices SET authorization_epoch=authorization_epoch+1 WHERE id='d1'").run();
  assert.equal(list(event, scope).value, false, "stale epoch invisible");
  assert.equal(grant(event, { ...scope, confirmed: true }).value, true);
  assert.equal(revoke(event, { ...scope, confirmed: true }).value, true);
  assert.equal(list(event, scope).value, false);
  assert.equal(f.state.keyLoads, 0);
});

test("secure key owner persists encrypted per-user key; basic_text/corruption/missing established key fail closed", t => {
  const root = mkdtempSync(join(tmpdir(), "benefits-key-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  let backend = "basic_text";
  // Deterministic keystore adapter for tests only; production always passes Electron safeStorage.
  const storage = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => backend,
    encryptString: text => Buffer.from([...Buffer.from(text)].map(byte => byte ^ 0xa5)),
    decryptString: bytes => Buffer.from([...bytes].map(byte => byte ^ 0xa5)).toString() };
  const { CommerceBenefitsKey } = managementModules().load("commerce-benefits-key");
  const key = new CommerceBenefitsKey(root, storage, "linux");
  assert.equal(key.available(), false); fails(() => key.load(), "BENEFITS_SECURE_STORAGE_UNAVAILABLE");
  backend = "gnome_libsecret";
  fails(() => key.load(false), "BENEFITS_SECURE_STORAGE_UNAVAILABLE");
  const first = key.load(), reopened = new CommerceBenefitsKey(root, storage, "linux").load(false);
  assert.equal(Buffer.from(first.key).toString("hex"), Buffer.from(reopened.key).toString("hex"));
  const path = join(root, "commerce-benefits-key-v1/key.enc"), bytes = readFileSync(path);
  assert(!bytes.includes(Buffer.from(first.key).toString("hex")));
  writeFileSync(path, "corrupt"); fails(() => key.load(), "BENEFITS_SECURE_STORAGE_UNAVAILABLE");
  unlinkSync(path); fails(() => key.load(), "BENEFITS_SECURE_STORAGE_UNAVAILABLE");
});

test("management never replaces a lost protected key after coupon/receipt creation", t => {
  const f = useFixture(t), root = mkdtempSync(join(tmpdir(), "benefits-established-key-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const storage = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => "gnome_libsecret",
    encryptString: text => Buffer.from(text).map(byte => byte ^ 0xa5), decryptString: bytes => Buffer.from(bytes).map(byte => byte ^ 0xa5).toString() };
  const { CommerceBenefitsKey } = f.modules.load("commerce-benefits-key");
  const { CommerceBenefitsManagement } = f.modules.load("commerce-benefits-management");
  const key = () => new CommerceBenefitsKey(root, storage, "linux");
  const service = () => new CommerceBenefitsManagement(f.db, key(), f.actor, () => NOW);
  const receipt = service().adjustPoints(adjustment());
  assert.equal(service().adjustPoints(adjustment()).entryId, receipt.entryId);
  rmSync(join(root, "commerce-benefits-key-v1"), { recursive: true });
  fails(() => service().adjustPoints(adjustment()), "BENEFITS_SECURE_STORAGE_UNAVAILABLE");
  assert.equal(service().pointAccount("c1", "TRY").availableMinor, 1500);
});
