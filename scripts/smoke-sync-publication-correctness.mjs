import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";
import { seedSmokeBusinessLayout } from "./test-helpers/business-layout.mjs";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { SyncCoordinator } = require("../apps/desktop-app/dist-electron/sync-coordinator.js");
const { AndroidActionSyncService } = require("../apps/desktop-app/dist-electron/android-action-sync-service.js");
const { createAndroidOperationsSnapshot } = require("../apps/desktop-app/dist-electron/android-operations-snapshot.js");
const { setBusinessCapability } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const { BUSINESS_CAPABILITIES: C } = require("@yardimci-asistan/shared");
const nativeFetch = globalThis.fetch;

async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "sync-correctness-"));
  const hosting = join(root, "web-module");
  cpSync("firm-template/web-module", hosting, { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) rmSync(join(hosting, "data", `yardimci-asistan.sqlite${suffix}`), { force: true });
  const secret = "sync-correctness-secret";
  const configPath = join(hosting, "config/business.json");
  writeFileSync(configPath, JSON.stringify({ ...JSON.parse(readFileSync(configPath)), sync_secret: secret }));
  const listener = http.createServer();
  await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", hosting], { stdio: "ignore" });
  const databaseOptions = { appPath: join(process.cwd(), "apps/desktop-app"), userDataPath: join(root, "desktop") };
  let database = new DesktopDatabase(databaseOptions);
  const config = { baseUrl, syncSecret: secret };
  const createCoordinator = () => new SyncCoordinator({ database, getSyncConfig: () => config,
    createAndroidSnapshot: () => createAndroidOperationsSnapshot(database, database.getDashboardData()),
    onDashboardChanged() {}, onStatusChanged() {} });
  let coordinator = createCoordinator();
  t.after(async () => {
    globalThis.fetch = nativeFetch;
    coordinator.stop(); database.close();
    const exited = new Promise(resolve => server.once("exit", resolve)); server.kill(); await exited;
    rmSync(root, { recursive: true, force: true });
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await nativeFetch(`${baseUrl}/api/menu.php`)).ok) break; } catch { /* server startup */ }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  database.initialize();
  const setup = createSmokeSetupInput({ businessName: "Sync correctness", phone: "", whatsapp: "", webModuleUrl: baseUrl,
    syncSecret: secret, autoSyncEnabled: true, servicePreferences: { whatsapp: false, android: true } });
  assert.equal(database.saveInitialSetup(setup).ok, true);
  const category = database.saveMenuCategory({ name: "Visible category", description: "", is_active: true, sort_order: 0 });
  assert.equal(category.ok, true);
  const stored = name => {
    const read = spawnSync("php", ["-r", "require $argv[1]; echo json_encode(ya_storage_get_publication($argv[2], []));", join(hosting, "lib/storage.php"), name], { encoding: "utf8" });
    assert.equal(read.status, 0, read.stderr); return JSON.parse(read.stdout);
  };
  const allJobs = () => database.getPendingSyncJobs("9999");
  const drain = () => { for (const job of allJobs()) database.completeSyncJob(job.jobKey, job.sourceRevision); };
  const reopen = () => {
    coordinator.stop(); database.close(); database = new DesktopDatabase(databaseOptions); database.initialize(); coordinator = createCoordinator();
  };
  return { get database() { return database; }, databaseOptions, get coordinator() { return coordinator; }, config, setup, stored, allJobs, drain, reopen };
}

test("request import creates durable Android snapshot intent, retained across reopen", async t => {
  const { database, databaseOptions, allJobs, drain } = await fixture(t);
  drain();
  database.upsertRequests([{ id: "imported-request", source: "web", request_type: "general", status: "new", customer_name: "Fixture",
    customer_phone: "", date_text: "", start_date: "", end_date: "", time: "", guest_count: 1, adult_count: 1, child_count: 0,
    message: "", ai_summary: "", ai_suggested_reply: "", whatsapp_message: "", assigned_to: "", priority: "normal",
    created_at: "2026-10-07T00:00:00Z", updated_at: "2026-10-07T00:00:00Z" }], 1);
  const pending = allJobs().find(job => job.jobType === "android_snapshot");
  assert.ok(pending, "successful import must durably invalidate Android publication");
  const reopened = new DesktopDatabase(databaseOptions);
  try { reopened.initialize(); assert.equal(reopened.getPendingSyncJobs().find(job => job.jobType === "android_snapshot").sourceRevision, pending.sourceRevision); }
  finally { reopened.close(); }
});

test("Android action ingress does not own or send snapshot publication", async t => {
  const { database, config, drain } = await fixture(t);
  drain();
  const actions = new AndroidActionSyncService({ database, isSuspended: () => false, markLocalSnapshotDirty() {}, notifyDashboardChanged() {} });
  const writes = [];
  globalThis.fetch = (url, init) => { if (init?.body && JSON.parse(init.body).action === "publish_android_snapshot") writes.push(JSON.parse(init.body)); return nativeFetch(url, init); };
  assert.deepEqual(await actions.processQueue(false), { pulled: 0, applied: 0, failed: 0 });
  assert.equal(writes.length, 0, "pull/apply must not be a second snapshot writer");
  assert.equal(config.baseUrl.startsWith("http://127.0.0.1:"), true);
});

test("automatic QR capability OFF publishes an empty ordered withdrawal, not local completion", async t => {
  const { database, coordinator, stored, allJobs } = await fixture(t);
  assert.equal((await coordinator.runNow()).ok, true);
  assert.equal(stored("menu").enabled, true);
  setBusinessCapability(database.databasePath, { capability: C.QR_MENU, enabled: false });
  database.queueSyncJob("menu_publish");
  const withdrawal = allJobs().find(job => job.jobType === "menu_publish");
  assert.equal((await coordinator.runNow()).ok, true);
  assert.deepEqual(stored("menu").categories, [], "disabled intent must actually reach hosting");
  assert.deepEqual(stored("menu").items, []);
  assert.equal(stored("menu").enabled, false);
  assert.ok(withdrawal.sourceRevision > 1);
  assert.equal(allJobs().some(job => job.jobType === "menu_publish"), false);
});

test("explicit publish_qr_menu_web=false projection contains no remotely publishable rows", async t => {
  const { database } = await fixture(t);
  database.setQrMenuWebPublicationEnabled(false);
  const projection = database.getQrMenuPublication();
  assert.equal(projection.enabled, false);
  assert.deepEqual(projection.categories, []);
  assert.deepEqual(projection.items, []);
});

test("setup disabling QR queues withdrawal even when QR capability is no longer enabled", async t => {
  const { database, setup, drain, allJobs } = await fixture(t);
  drain();
  assert.equal(database.saveInitialSetup({ ...setup, profileId: "general", profileOptions: [] }).ok, true);
  assert.equal(database.getEnabledBusinessCapabilities().includes(C.QR_MENU), false);
  assert.ok(allJobs().some(job => job.jobType === "menu_publish"), "setup disable must queue withdrawal");
});

test("manual snapshot is a canonical coordinator outbox entry, sharing automatic in-flight publication", async t => {
  const { database, coordinator, allJobs } = await fixture(t);
  assert.equal(typeof coordinator.publishAndroidSnapshotNow, "function", "manual snapshot entry must belong to the canonical outbox owner");
  assert.equal((await coordinator.runNow()).ok, true);
  database.queueSyncJob("android_snapshot");
  const writes = [];
  let entered, release;
  const sending = new Promise(resolve => { entered = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  globalThis.fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    if (body.action === "publish_android_snapshot") { writes.push(body); entered(); await barrier; }
    return nativeFetch(url, init);
  };
  const automatic = coordinator.runNow();
  await sending;
  const manual = coordinator.publishAndroidSnapshotNow();
  release();
  assert.equal((await automatic).ok, true);
  assert.equal((await manual).ok, true);
  assert.equal(writes.length, 1, "manual/automatic callers must not send the same revision twice");
  assert.equal(allJobs().some(job => job.jobType === "android_snapshot"), false);
});

test("manual menu uses coordinator withdrawal lifecycle even with QR OFF", async t => {
  const { database, coordinator, stored } = await fixture(t);
  assert.equal(typeof coordinator.publishMenuNow, "function", "manual menu entry must belong to the canonical outbox owner");
  assert.equal((await coordinator.runNow()).ok, true);
  setBusinessCapability(database.databasePath, { capability: C.QR_MENU, enabled: false });
  database.queueSyncJob("menu_publish");
  assert.equal((await coordinator.publishMenuNow()).ok, true);
  assert.equal(stored("menu").enabled, false);
  assert.deepEqual(stored("menu").categories, []);
});

test("snapshot lost response survives process restart and retries the same revision/body/key idempotently", async t => {
  const f = await fixture(t);
  assert.equal((await f.coordinator.runNow()).ok, true);
  let sent;
  globalThis.fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    const response = await nativeFetch(url, init);
    if (body.action === "publish_android_snapshot") { sent = body; throw new Error("lost snapshot response"); }
    return response;
  };
  assert.equal((await f.coordinator.publishAndroidSnapshotNow()).ok, false);
  assert.equal(f.allJobs().find(job => job.jobType === "android_snapshot").sourceRevision, sent.source_revision);
  f.reopen();
  let retried;
  globalThis.fetch = (url, init) => { const body = init?.body ? JSON.parse(init.body) : {}; if (body.action === "publish_android_snapshot") retried = body; return nativeFetch(url, init); };
  const receipt = await f.coordinator.publishAndroidSnapshotNow();
  assert.equal(receipt.ok, true, receipt.message); assert.equal(receipt.deduplicated, true);
  assert.equal(retried.source_revision, sent.source_revision);
  assert.equal(retried.idempotency_key, sent.idempotency_key);
  assert.equal(retried.publication_body, sent.publication_body);
  assert.equal(f.allJobs().some(job => job.jobType === "android_snapshot"), false);
});

test("snapshot exact ack cannot complete a newer customer mutation that raced the sent revision", async t => {
  const { database, coordinator, allJobs, stored } = await fixture(t);
  assert.equal((await coordinator.runNow()).ok, true);
  let sentRevision;
  globalThis.fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    const response = await nativeFetch(url, init);
    if (body.action === "publish_android_snapshot") {
      sentRevision = body.source_revision;
      assert.equal(database.saveCustomer({ fullName: "After sent revision", phone: "", email: "", notes: "", tags: [] }).ok, true);
    }
    return response;
  };
  assert.equal((await coordinator.publishAndroidSnapshotNow()).ok, true);
  assert.ok(allJobs().find(job => job.jobType === "android_snapshot").sourceRevision > sentRevision, "only the sent revision can complete");
  globalThis.fetch = nativeFetch;
  assert.equal((await coordinator.runNow()).ok, true);
  assert.equal(stored("android_snapshot").customers.some(customer => customer.full_name === "After sent revision"), true);
});

test("snapshot mismatched ack retains the durable job until an exact receipt is received", async t => {
  const { coordinator, allJobs } = await fixture(t);
  assert.equal((await coordinator.runNow()).ok, true);
  globalThis.fetch = async (url, init) => {
    const response = await nativeFetch(url, init);
    if (init?.body && JSON.parse(init.body).action === "publish_android_snapshot") {
      const receipt = await response.json(); receipt.source_revision += 1; return Response.json(receipt);
    }
    return response;
  };
  assert.equal((await coordinator.publishAndroidSnapshotNow()).ok, false);
  assert.ok(allJobs().find(job => job.jobType === "android_snapshot"));
  globalThis.fetch = nativeFetch;
  assert.equal((await coordinator.publishAndroidSnapshotNow()).ok, true);
  assert.equal(allJobs().some(job => job.jobType === "android_snapshot"), false);
});

test("newer menu withdrawal fences a late older enabled request and remains hidden to the consumer", async t => {
  const { database, coordinator, config, stored } = await fixture(t);
  assert.equal((await coordinator.runNow()).ok, true);
  let lateEnabled;
  globalThis.fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    if (body.action === "publish_menu") { lateEnabled = body; throw new Error("enabled request held in flight"); }
    return nativeFetch(url, init);
  };
  assert.equal((await coordinator.publishMenuNow()).ok, false);
  setBusinessCapability(database.databasePath, { capability: C.QR_MENU, enabled: false });
  database.queueSyncJob("menu_publish");
  globalThis.fetch = nativeFetch;
  const tombstone = await coordinator.publishMenuNow();
  assert.equal(tombstone.ok, true); assert.ok(tombstone.source_revision > lateEnabled.source_revision);
  const late = await nativeFetch(`${config.baseUrl}/api/sync.php`, { method: "POST", headers: { "Content-Type": "application/json", "X-YA-Sync-Secret": config.syncSecret }, body: JSON.stringify(lateEnabled) });
  assert.equal(late.status, 409);
  assert.equal(stored("menu").enabled, false); assert.deepEqual(stored("menu").categories, []);
  assert.equal(stored("android_snapshot").business_capabilities.includes(C.QR_MENU), true, "test retains the older enabled manifest to isolate menu withdrawal");
  const consumer = await nativeFetch(`${config.baseUrl}/api/menu.php`);
  assert.equal(consumer.status, 404);
  assert.equal((await consumer.json()).message, "QR menü webde gizli.");
});

test("offline QR disable stays durable across restart, reconnect withdraws, and re-enable publishes a newer revision", async t => {
  const f = await fixture(t);
  assert.equal((await f.coordinator.runNow()).ok, true);
  setBusinessCapability(f.database.databasePath, { capability: C.QR_MENU, enabled: false });
  f.database.queueSyncJob("menu_publish");
  const intent = f.allJobs().find(job => job.jobType === "menu_publish");
  globalThis.fetch = async () => { throw new Error("offline withdrawal"); };
  assert.equal((await f.coordinator.publishMenuNow()).ok, false);
  assert.equal(f.allJobs().find(job => job.jobType === "menu_publish").sourceRevision, intent.sourceRevision);
  f.reopen();
  assert.equal(f.allJobs().find(job => job.jobType === "menu_publish").sourceRevision, intent.sourceRevision);
  globalThis.fetch = nativeFetch;
  // Reconnect's automatic due scan must use the same frozen disabled body.
  f.database.prepareSyncPublication("menu_publish", f.database.getQrMenuPublication(), true);
  assert.equal((await f.coordinator.runNow()).ok, true);
  assert.equal(f.stored("menu").enabled, false); assert.deepEqual(f.stored("menu").categories, []);
  setBusinessCapability(f.database.databasePath, { capability: C.QR_MENU, enabled: true });
  f.database.queueSyncJob("menu_publish");
  const enabled = await f.coordinator.publishMenuNow();
  assert.equal(enabled.ok, true); assert.ok(enabled.source_revision > intent.sourceRevision);
  assert.equal(f.stored("menu").enabled, true); assert.equal(f.stored("menu").categories.length, 1);
});

test("explicit Web visibility disable publishes an empty tombstone without deleting local menu domain data", async t => {
  const { database, coordinator, stored } = await fixture(t);
  assert.equal((await coordinator.runNow()).ok, true);
  database.setQrMenuWebPublicationEnabled(false); database.queueSyncJob("menu_publish");
  const disabled = await coordinator.publishMenuNow();
  assert.equal(disabled.ok, true);
  assert.equal(stored("menu").enabled, false); assert.deepEqual(stored("menu").categories, []);
  assert.equal(database.getPublishedMenu().categories.length, 1, "local menu domain remains available");
  database.setQrMenuWebPublicationEnabled(true); database.queueSyncJob("menu_publish");
  const enabled = await coordinator.publishMenuNow();
  assert.equal(enabled.ok, true); assert.ok(enabled.source_revision > disabled.source_revision);
  assert.equal(stored("menu").enabled, true);
});

test("canonical customer/request/reservation/task/menu/device mutations already invalidate the durable snapshot transactionally", async t => {
  const f = await fixture(t);
  const { database, drain, allJobs } = f;
  const layout = seedSmokeBusinessLayout(database.databasePath, { roomCount: 1 });
  const customer = database.saveCustomer({ fullName: "Durable guest", phone: "", email: "", notes: "", tags: [] });
  assert.equal(customer.ok, true);
  const changes = [
    ["customer", () => database.saveCustomer({ id: customer.savedId, fullName: "Updated durable guest", phone: "", email: "", notes: "", tags: [] })],
    ["request", () => database.createManualRequest({ requestType: "general_info", customerName: "Request guest", customerPhone: "+905550095501", dateText: "", startDate: "", endDate: "", time: "", guestCount: 1, adultCount: 1, childCount: 0, message: "fixture", priority: "normal" })],
    ["reservation", () => database.saveManualReservation({ customerId: customer.savedId, roomId: layout.rooms[0].id, startDate: "2035-01-01", endDate: "2035-01-03", guestCount: 1, notes: "" })],
    ["task", () => database.saveDailyTask({ title: "Durable task", taskType: "manual_pension", dueDate: "2035-01-01" })],
    ["menu", () => database.saveMenuCategory({ name: "Durable category", description: "", is_active: true, sort_order: 1 })],
    ["device", () => ({ ok: database.upsertAndroidDeviceSightings([{ device_id: "durable-phone", device_name: "Fixture", app_version: "fixture", first_seen_at: "2026-10-07T00:00:00Z", last_seen_at: "2026-10-07T00:00:00Z" }]) > 0 })]
  ];
  for (const [name, mutate] of changes) {
    drain(); const result = mutate(); assert.equal(result.ok, true, `${name}: ${result.message}`);
    assert.ok(allJobs().some(job => job.jobType === "android_snapshot"), `${name}: durable intent before any finalize/cycle`);
  }
  f.reopen();
  assert.ok(f.allJobs().some(job => job.jobType === "android_snapshot"));
  f.drain();
  assert.equal(f.database.saveCustomer({ fullName: "", phone: "", email: "", notes: "", tags: [] }).ok, false);
  assert.equal(f.allJobs().some(job => job.jobType === "android_snapshot"), false, "rejected mutation must not queue publication");
});

test("manual withdrawal arriving during an enabled in-flight publication drains the newer revision through the same owner", async t => {
  const { database, coordinator, config, stored, allJobs } = await fixture(t);
  assert.equal((await coordinator.runNow()).ok, true);
  let entered, release;
  const sending = new Promise(resolve => { entered = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  const writes = [];
  globalThis.fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    if (body.action === "publish_menu") { writes.push(body); if (writes.length === 1) { entered(); await barrier; } }
    return nativeFetch(url, init);
  };
  const enabled = coordinator.publishMenuNow(); await sending;
  setBusinessCapability(database.databasePath, { capability: C.QR_MENU, enabled: false }); database.queueSyncJob("menu_publish");
  const disabled = coordinator.publishMenuNow(); release();
  assert.equal((await enabled).ok, true);
  const withdrawal = await disabled;
  assert.equal(withdrawal.ok, true); assert.equal(writes.length, 2);
  assert.ok(withdrawal.source_revision > writes[0].source_revision);
  assert.equal(stored("menu").enabled, false);
  assert.equal(allJobs().some(job => job.jobType === "menu_publish"), false);
  const replay = await nativeFetch(`${config.baseUrl}/api/sync.php`, { method: "POST", headers: { "Content-Type": "application/json", "X-YA-Sync-Secret": config.syncSecret }, body: JSON.stringify(writes[0]) });
  assert.equal((await replay.json()).deduplicated, true);
  assert.equal(stored("menu").enabled, false, "historic receipt replay cannot reopen menu");
});

for (const [name, disable] of [
  ["QR capability", database => setBusinessCapability(database.databasePath, { capability: C.QR_MENU, enabled: false })],
  ["Web visibility", database => database.setQrMenuWebPublicationEnabled(false)]
]) {
  for (const frozenRetry of [false, true]) {
    test(`${name} OFF commits withdrawal intent atomically before callback/restart (${frozenRetry ? "frozen enabled retry" : "empty outbox"})`, async t => {
      const f = await fixture(t);
      assert.equal((await f.coordinator.runNow()).ok, true);
      let oldRevision = 0;
      if (frozenRetry) {
        f.database.queueSyncJob("menu_publish");
        const old = f.database.prepareSyncPublication("menu_publish", f.database.getQrMenuPublication());
        assert.equal(old.value.enabled, true); oldRevision = old.sourceRevision;
      }
      disable(f.database); // Deliberately no main-entry/IPC finalize queue callback.
      f.reopen();
      const job = f.allJobs().find(item => item.jobType === "menu_publish");
      assert.ok(job, "OFF commit itself must durably invalidate hosted menu");
      assert.ok(job.sourceRevision > oldRevision, "OFF must supersede the frozen enabled revision");
      const disabled = f.database.prepareSyncPublication("menu_publish", f.database.getQrMenuPublication());
      assert.equal(disabled.value.enabled, false); assert.deepEqual(disabled.value.categories, []); assert.deepEqual(disabled.value.items, []);
      assert.equal((await f.coordinator.runNow()).ok, true);
      assert.equal(f.stored("menu").enabled, false);
    });
  }
  test(`${name} OFF rolls back local visibility when durable withdrawal cannot be queued`, async t => {
    const f = await fixture(t);
    assert.equal((await f.coordinator.runNow()).ok, true);
    const raw = new DatabaseSync(f.database.databasePath);
    try {
      raw.exec("CREATE TRIGGER fail_withdrawal_intent BEFORE INSERT ON sync_outbox WHEN NEW.job_type = 'menu_publish' BEGIN SELECT RAISE(ABORT, 'withdrawal_intent_failure'); END;");
      assert.throws(() => disable(f.database), /withdrawal_intent_failure/);
      assert.equal(f.database.getQrMenuPublication().enabled, true, "state and intent must roll back together");
      assert.equal(f.allJobs().some(job => job.jobType === "menu_publish"), false);
    } finally { raw.close(); }
  });
}
