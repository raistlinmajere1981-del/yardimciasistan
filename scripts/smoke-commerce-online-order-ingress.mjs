import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { OnlineOrderIngressService } = require("../apps/desktop-app/dist-electron/online-order-ingress-service.js");
const { SyncCoordinator } = require("../apps/desktop-app/dist-electron/sync-coordinator.js");
const { setBusinessCapability } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const { saveRuntimeCatalogProduct, getRuntimeOrder } = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
const root = mkdtempSync(join(tmpdir(), "ya-online-order-"));
const hosting = join(root, "web-module");
cpSync(join(process.cwd(), "firm-template/web-module"), hosting, { recursive: true });
for (const file of ["yardimci-asistan.sqlite", "yardimci-asistan.sqlite-wal", "yardimci-asistan.sqlite-shm"]) {
  rmSync(join(hosting, "data", file), { force: true });
}
const configPath = join(hosting, "config/business.json");
const secret = "online-orders-smoke-secret";
const config = JSON.parse(readFileSync(configPath, "utf8"));
writeFileSync(configPath, JSON.stringify({ ...config, sync_secret: secret }));
let database = new DesktopDatabase({ appPath: join(process.cwd(), "apps/desktop-app"), userDataPath: join(root, "desktop") });
const originalFetch = globalThis.fetch;
function php(code, args = []) {
  const result = spawnSync("php", ["-r", code, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
function syncApi(payload, authorized = true) {
  return php(`
    ob_start();
    register_shutdown_function(function () {
      $body = ob_get_clean();
      echo json_encode(['status' => http_response_code(), 'payload' => json_decode($body, true)]);
    });
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $_SERVER['HTTP_X_YA_SYNC_SECRET'] = $argv[3];
    $_POST = json_decode(base64_decode($argv[2]), true);
    require $argv[1];
  `, [join(hosting, "api/sync.php"), Buffer.from(JSON.stringify(payload)).toString("base64"), authorized ? secret : "wrong"]);
}
function enqueue(envelope) {
  return php("require $argv[1]; echo json_encode(ya_storage_enqueue_web_order(json_decode(base64_decode($argv[2]), true)));", [
    join(hosting, "lib/storage.php"), Buffer.from(JSON.stringify(envelope)).toString("base64")
  ]);
}
const calls = [];
let supported = true;
let rejectAck = false;
let overridePull = null;
globalThis.fetch = async (url, init) => {
  if (!String(url).endsWith("/api/sync.php")) return new Response("{}", { status: 404 });
  const body = JSON.parse(init.body);
  calls.push(body);
  if (body.action === "capabilities") {
    const result = syncApi(body);
    if (!supported) result.payload.features = result.payload.features.filter((feature) => feature !== "web_orders_v1");
    return new Response(JSON.stringify(result.payload), { status: result.status });
  }
  if (body.action === "publish_online_catalog" || body.action === "pull_web_orders" || body.action === "acknowledge_web_orders") {
    if (body.action === "acknowledge_web_orders" && rejectAck) {
      return new Response(JSON.stringify({ ok: false, message: "ack retry" }), { status: 503 });
    }
    if (body.action === "pull_web_orders" && overridePull) return Response.json(overridePull);
    const result = syncApi(body);
    return new Response(JSON.stringify(result.payload), { status: result.status });
  }
  if (body.action === "pull_requests") {
    return Response.json({ ok: true, requests: [], next_cursor: body.after_seq, has_more: false });
  }
  // Unrelated publishing capabilities are intentionally absent from this fixture.
  return new Response("{}", { status: 404 });
};
function coordinator() {
  return new SyncCoordinator({
    database,
    onlineOrderIngress: new OnlineOrderIngressService(database),
    getSyncConfig: () => ({ baseUrl: "https://orders.example.test/module", syncSecret: secret }),
    createAndroidSnapshot: () => ({}),
    onDashboardChanged: () => {}, onStatusChanged: () => {}
  });
}
const webCalls = () => calls.filter((call) => /web_orders/.test(call.action));
try {
  database.initialize();
  const setup = database.saveInitialSetup({
    businessName: "Online Orders A1", profileId: "market", phone: "", whatsapp: "", email: "", address: "",
    webModuleUrl: "https://orders.example.test/module", syncSecret: secret, autoSyncEnabled: false,
    aiEnabled: false, aiProvider: "openai_compatible", aiService: "openai", aiProjectName: "", aiModel: "",
    aiModelOptions: [], aiBaseUrl: "https://api.openai.com/v1", aiTimeoutSeconds: 30, aiApiKey: "", clearAiApiKey: false,
    servicePreferences: { whatsapp: false, android: false }, initialCounts: { rooms: 0, tables: 0 }, tableCategories: []
  });
  assert.equal(setup.ok, true);
  const product = saveRuntimeCatalogProduct(database.databasePath, {
    name: "Order product", salePrice: 25, purchasePrice: 10, unit: "piece", currency: "TRY", taxRate: 20,
    trackInventory: true, isActive: true
  });
  const envelope = { id: "web-1", items: [{ productId: product.id, quantity: 2, unitPrice: 0.01 }], buyer: { name: "Guest contact", phone: "+44 7911 123456", email: "guest@example.test" }, note: "Guest order note", createdAt: new Date().toISOString() };
  const first = enqueue(envelope);
  assert.equal(syncApi({ action: "pull_web_orders", client_id: "desktop-test", after_seq: 0 }, false).status, 401);
  assert.equal(syncApi({ action: "acknowledge_web_orders", client_id: "desktop-test", through_seq: 1 }, false).status, 401);
  assert.equal(syncApi({ action: "pull_web_orders", after_seq: 0 }).status, 422);
  assert.equal(syncApi({ action: "pull_web_orders", client_id: "desktop-test", after_seq: -1 }).status, 422);

  await coordinator().runNow();
  assert.equal(webCalls().length, 0, "disabled channel does not consume queue");
  assert.throws(() => setBusinessCapability(database.databasePath, { capability: "channel.online_sales", enabled: true }), /commerce.orders/);
  setBusinessCapability(database.databasePath, { capability: "commerce.orders", enabled: true });
  setBusinessCapability(database.databasePath, { capability: "channel.online_sales", enabled: true });
  supported = false;
  await coordinator().runNow();
  assert.equal(webCalls().length, 0, "unsupported protocol does not pull or ack");
  supported = true;
  const ingress = new OnlineOrderIngressService(database);
  const created = ingress.importOrder({ ...first, items: envelope.items });
  assert.equal(created.order.source, "web-online-sales");
  assert.equal(created.order.sourceReference, "web-1");
  assert.equal(created.order.customerId, "");
  assert.deepEqual(created.order.buyerSnapshot, envelope.buyer);
  assert.equal(created.order.note, envelope.note);
  assert.deepEqual(getRuntimeOrder(database.databasePath, created.order.id).order.buyerSnapshot, envelope.buyer);
  assert.equal(created.items[0].unitPrice, 25, "canonical price ignores payload unitPrice");
  assert.equal(created.items[0].taxRate, 20);
  assert.equal(created.order.discountTotal, 0);
  assert.equal(created.order.total, 50);
  assert.equal(ingress.importOrder(first).order.id, created.order.id);
  const normalized = ingress.importOrder({ ...first, id: "normalized", items: [{ productId: ` ${product.id} `, quantity: "1.23456" }] });
  assert.equal(normalized.items[0].quantity, 1.2346);
  for (const bad of [null, { ...first, id: "" }, { ...first, createdAt: "invalid" }, { ...first, syncSeq: 0 },
    { ...first, buyer: undefined }, { ...first, buyer: { name: "Guest", phone: "123" } }, { ...first, note: "x".repeat(2001) },
    { ...first, items: [] }, { ...first, items: [{ productId: product.id, quantity: true }] },
    { ...first, items: [{ productId: product.id, quantity: 0 }] }]) {
    assert.throws(() => ingress.importOrder(bad), /geçersiz/);
  }
  assert.throws(() => ingress.importOrder(first, first.syncSeq), /geçersiz/);
  const unavailable = saveRuntimeCatalogProduct(database.databasePath, {
    name: "Product active when published", salePrice: 30, purchasePrice: 10, unit: "piece", currency: "TRY", taxRate: 20,
    trackInventory: true, isActive: true
  });
  database.saveCommerceProductPublication({ productId: unavailable.id, isPublished: true });
  assert.ok(database.createCommerceOnlineCatalog().products.some((entry) => entry.productId === unavailable.id));
  const fixtureDb = new DatabaseSync(database.databasePath);
  fixtureDb.prepare("UPDATE catalog_products SET is_active = 0 WHERE id = ?").run(unavailable.id);
  fixtureDb.close();
  assert.throws(() => ingress.importOrder({ ...first, id: "inactive", items: [{ productId: unavailable.id, quantity: 1 }] }), /aktif değil/);
  const broken = enqueue({ ...envelope, id: "web-broken", items: [{ productId: unavailable.id, quantity: 1 }] });
  const later = enqueue({ ...envelope, id: "web-later" });
  let result = await coordinator().runNow();
  assert.equal(result.ok, false);
  assert.equal(database.getSyncRuntimeStatus().webOrderCursor, first.syncSeq);
  assert.equal(database.getSyncRuntimeStatus().webOrderAcknowledgedCursor, first.syncSeq);
  assert.equal(webCalls().filter((call) => call.action === "acknowledge_web_orders").at(-1).through_seq, first.syncSeq);
  const raw = new DatabaseSync(database.databasePath);
  try {
    assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM commerce_orders WHERE source_reference = 'web-later'").get().n, 0);
    assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM commerce_orders WHERE source_reference = 'web-1'").get().n, 1);
    // Simulate crash after canonical commit, before cursor persistence.
    raw.exec("UPDATE sync_runtime SET web_order_cursor = 0, web_order_acknowledged_cursor = 0");
    await coordinator().runNow();
    assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM commerce_orders WHERE source_reference = 'web-1'").get().n, 1);
    const ackCount = webCalls().filter((call) => call.action === "acknowledge_web_orders").length;
    await coordinator().runNow();
    assert.equal(webCalls().filter((call) => call.action === "acknowledge_web_orders").length, ackCount, "failed first record is never acked");
    const pending = syncApi({ action: "pull_web_orders", client_id: "desktop-test", after_seq: first.syncSeq }).payload;
    assert.deepEqual(pending.orders.map((order) => order.id), ["web-broken", "web-later"]);
    // Repair fixture input, then verify pending ack retry without duplicate import.
    php("require $argv[1]; $db = ya_storage_open(); $stmt = $db->prepare('UPDATE web_orders SET payload_json = ? WHERE id = ?'); $stmt->execute([$argv[2], 'web-broken']); echo 'true';", [
      join(hosting, "lib/storage.php"), JSON.stringify({ ...envelope, id: "web-broken" })
    ]);
    rejectAck = true;
    result = await coordinator().runNow();
    assert.equal(result.ok, false);
    assert.equal(database.getSyncRuntimeStatus().webOrderCursor, later.syncSeq);
    assert.equal(database.getSyncRuntimeStatus().webOrderAcknowledgedCursor, first.syncSeq);
    rejectAck = false;
    result = await coordinator().runNow();
    assert.equal(result.ok, true);
    assert.equal(database.getSyncRuntimeStatus().webOrderAcknowledgedCursor, later.syncSeq);
    assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM commerce_orders").get().n, 4);
    assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM commerce_sales").get().n, 0);
    assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM inventory_movements").get().n, 0);
    assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM finance_entries").get().n, 0);
    assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM commerce_order_fulfillments").get().n, 0);
    assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM customers").get().n, 0);
    assert.equal(database.getSyncRuntimeStatus().requestCursor, 0);
    assert.equal(database.getSyncRuntimeStatus().acknowledgedCursor, 0);
    // Invalid protocol ordering must reject the whole page before any import/ack.
    overridePull = { ok: true, count: 2, orders: [{ ...first, syncSeq: later.syncSeq + 2 }, { ...broken, syncSeq: later.syncSeq + 1 }], next_cursor: later.syncSeq + 2, has_more: false };
    const beforeCalls = webCalls().filter((call) => call.action === "acknowledge_web_orders").length;
    assert.equal((await coordinator().runNow()).ok, false);
    assert.equal(webCalls().filter((call) => call.action === "acknowledge_web_orders").length, beforeCalls);
    assert.equal(database.getSyncRuntimeStatus().webOrderCursor, later.syncSeq);
    overridePull = null;
    setBusinessCapability(database.databasePath, { capability: "channel.online_sales", enabled: false });
    assert.throws(() => ingress.importOrder(first), /etkin değil/);
  } finally { raw.close(); }
  database.close();
  database = new DesktopDatabase({ appPath: join(process.cwd(), "apps/desktop-app"), userDataPath: join(root, "desktop") });
  database.initialize();
  assert.equal(database.getSyncRuntimeStatus().webOrderCursor, later.syncSeq, "cursor survives restart");
  assert.deepEqual(getRuntimeOrder(database.databasePath, created.order.id).order.buyerSnapshot, envelope.buyer, "buyer survives ack and restart");
  console.log("commerce-online-order-ingress-smoke-ok");
} finally {
  globalThis.fetch = originalFetch;
  database.close();
  rmSync(root, { recursive: true, force: true });
}
