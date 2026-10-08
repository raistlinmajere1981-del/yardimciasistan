import assert from "node:assert/strict";
import { publicationEnvelope } from "./test-helpers/publication-protocol.mjs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { SyncCoordinator } = require("../apps/desktop-app/dist-electron/sync-coordinator.js");
const { applyBusinessProfileCapabilities, setBusinessCapability } = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const { saveRuntimeCatalogProduct } = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
const root = mkdtempSync(join(tmpdir(), "ya-online-catalog-"));
const hosting = join(root, "web-module");
cpSync(join(process.cwd(), "firm-template/web-module"), hosting, { recursive: true });
for (const file of ["yardimci-asistan.sqlite", "yardimci-asistan.sqlite-wal", "yardimci-asistan.sqlite-shm"]) rmSync(join(hosting, "data", file), { force: true });
const secret = "online-catalog-test-secret";
const configPath = join(hosting, "config/business.json");
writeFileSync(configPath, JSON.stringify({ ...JSON.parse(readFileSync(configPath, "utf8")), sync_secret: secret }));
const database = new DesktopDatabase({ appPath: join(process.cwd(), "apps/desktop-app"), userDataPath: join(root, "desktop") });
const originalFetch = globalThis.fetch;
function endpoint(file, payload = {}, method = "POST", authorized = true, etag = "") {
  const result = spawnSync("php", ["-r", `
    ob_start(); register_shutdown_function(function () { $body = ob_get_clean(); echo json_encode(['status' => http_response_code(), 'payload' => json_decode($body, true)]); });
    $_SERVER['REQUEST_METHOD'] = $argv[3]; $_SERVER['HTTP_X_YA_SYNC_SECRET'] = $argv[4]; $_SERVER['HTTP_IF_NONE_MATCH'] = $argv[5];
    $_POST = json_decode(base64_decode($argv[2]), true); require $argv[1];
  `, join(hosting, "api", file), Buffer.from(JSON.stringify(payload)).toString("base64"), method, authorized ? secret : "", etag], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
const readCatalog = () => endpoint("catalog.php", {}, "GET", false);
const calls = [];
let failPublication = false;
let supportsCatalog = true;
globalThis.fetch = async (url, init) => {
  if (!String(url).endsWith("/api/sync.php")) return new Response("{}", { status: 404 });
  const body = JSON.parse(init.body);
  calls.push(body);
  if (["capabilities", "activate_publication_source", "pull_web_orders", "pull_requests", "acknowledge_requests"].includes(body.action) || body.action.startsWith("publish_")) {
    if (body.action === "publish_online_catalog" && failPublication) return Response.json({ ok: false, message: "retry" }, { status: 503 });
    const result = endpoint("sync.php", body);
    if (body.action === "capabilities" && !supportsCatalog) result.payload.features = result.payload.features.filter((feature) => feature !== "online_catalog_v1");
    return Response.json(result.payload, { status: result.status });
  }
  return new Response("{}", { status: 404 });
};
const coordinator = new SyncCoordinator({ database, getSyncConfig: () => ({ baseUrl: "https://catalog.example.test", syncSecret: secret }),
  createAndroidSnapshot: () => ({}), onDashboardChanged: () => {}, onStatusChanged: () => {} });
let raw;
try {
  database.initialize();
  assert.equal(database.saveInitialSetup({
    businessName: "Online Catalog A2", profileId: "market", profileOptions: ["channel.online_sales", "commerce.wholesale"],
    phone: "", whatsapp: "", email: "", address: "", webModuleUrl: "https://catalog.example.test", syncSecret: secret,
    autoSyncEnabled: false, aiEnabled: false, aiProvider: "openai_compatible", aiService: "openai", aiProjectName: "", aiModel: "", aiModelOptions: [],
    aiBaseUrl: "https://api.openai.com/v1", aiTimeoutSeconds: 30, aiApiKey: "", clearAiApiKey: false,
    servicePreferences: { whatsapp: false, android: false }, initialCounts: { rooms: 0, tables: 0 }, tableCategories: []
  }).ok, true);
  raw = new DatabaseSync(database.databasePath);
  raw.exec("PRAGMA foreign_keys = ON");
  const input = { name: "Catalog product", description: "Public description", salePrice: 25, purchasePrice: 9, dealerPriceA: 15, dealerPriceB: 12,
    unit: "piece", currency: "TRY", taxRate: 20, trackInventory: false, isActive: true, barcode: "8690000000115", sku: "PUBLIC-SKU" };
  const product = saveRuntimeCatalogProduct(database.databasePath, input);
  const inactive = saveRuntimeCatalogProduct(database.databasePath, { ...input, name: "Inactive product", barcode: "", sku: "", isActive: false });
  const unpublished = saveRuntimeCatalogProduct(database.databasePath, { ...input, name: "Unpublished product", barcode: "", sku: "" });
  assert.equal(database.getCommerceProductPublication(product.id).isPublished, true);
  assert.deepEqual(database.createCommerceOnlineCatalog().products.map((entry) => entry.productId).sort(), [product.id, unpublished.id].sort());
  assert.ok(raw.prepare("SELECT source_revision FROM sync_outbox WHERE job_key = 'online_catalog'").get().source_revision > 0);
  database.saveCommerceProductPublication({ productId: unpublished.id, isPublished: false });
  saveRuntimeCatalogProduct(database.databasePath, { ...input, id: unpublished.id, name: "Edited unpublished", barcode: "", sku: "" });
  assert.equal(database.getCommerceProductPublication(unpublished.id).isPublished, false, "edits retain publication state");
  setBusinessCapability(database.databasePath, { capability: "channel.online_sales", enabled: false });
  const offline = saveRuntimeCatalogProduct(database.databasePath, { ...input, name: "Offline product", barcode: "", sku: "", onlineSalesPublished: true });
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM commerce_product_publications WHERE product_id = ?").get(offline.id).n, 0, "disabled channel cannot auto-publish even with client intent");
  setBusinessCapability(database.databasePath, { capability: "channel.online_sales", enabled: true });
  assert.equal(database.getCommerceProductPublication(offline.id), null, "enable does not bulk publish");
  saveRuntimeCatalogProduct(database.databasePath, { ...input, id: offline.id, name: "Offline edited", barcode: "", sku: "" });
  assert.equal(database.getCommerceProductPublication(offline.id), null, "edit does not publish an old product without a publication");
  const optedOut = saveRuntimeCatalogProduct(database.databasePath, { ...input, name: "Opted out", barcode: "", sku: "", onlineSalesPublished: false });
  assert.equal(database.getCommerceProductPublication(optedOut.id).isPublished, false);
  const revisionBeforeFailure = raw.prepare("SELECT source_revision FROM sync_outbox WHERE job_key = 'online_catalog'").get().source_revision;
  raw.exec("CREATE TRIGGER reject_auto_publication BEFORE INSERT ON commerce_product_publications BEGIN SELECT RAISE(ABORT, 'fixture_publication_failure'); END");
  assert.throws(() => saveRuntimeCatalogProduct(database.databasePath, { ...input, name: "Atomic failure", barcode: "", sku: "" }), /fixture_publication_failure/);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM catalog_products WHERE name = 'Atomic failure'").get().n, 0);
  assert.equal(raw.prepare("SELECT source_revision FROM sync_outbox WHERE job_key = 'online_catalog'").get().source_revision, revisionBeforeFailure);
  raw.exec("DROP TRIGGER reject_auto_publication");
  const publication = database.saveCommerceProductPublication({ productId: product.id, isPublished: true, titleOverride: "Public title", sortOrder: 2 });
  const updated = database.saveCommerceProductPublication({ productId: product.id, isPublished: true, descriptionOverride: "Public override" });
  assert.equal(updated.titleOverride, publication.titleOverride);
  assert.equal(updated.createdAt, publication.createdAt);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM commerce_product_publications WHERE product_id = ?").get(product.id).n, 1);
  assert.throws(() => raw.prepare("INSERT INTO commerce_product_publications SELECT * FROM commerce_product_publications WHERE product_id = ?").run(product.id), /UNIQUE/);
  assert.throws(() => database.saveCommerceProductPublication({ productId: "missing", isPublished: true }), /bulunamadı/);
  assert.throws(() => database.saveCommerceProductPublication({ productId: product.id, channel: "dealer", isPublished: true }), /geçersiz/);
  database.saveCommerceProductPublication({ productId: inactive.id, isPublished: true });
  database.saveCommerceProductPublication({ productId: unpublished.id, isPublished: false });
  raw.prepare("UPDATE catalog_products SET image_asset_path = '/private/local.jpg', image_source_url = 'https://images.example.com/product.jpg' WHERE id = ?").run(product.id);
  const catalog = database.createCommerceOnlineCatalog();
  assert.deepEqual(catalog.deliveryMethods, ["pickup"]);
  assert.deepEqual(catalog.products.map((p) => p.productId), [product.id]);
  assert.deepEqual(Object.keys(catalog.products[0]).sort(), ["productId", "name", "description", "sku", "unit", "price", "currency", "taxRate", "imageUrl", "availability", "sortOrder"].sort());
  assert.equal(catalog.products[0].price, 25, "resolved retail price, never dealer/cost");
  assert.equal(catalog.products[0].name, "Public title");
  assert.equal(catalog.products[0].description, "Public override");
  assert.equal(catalog.products[0].imageUrl, "https://images.example.com/product.jpg");
  assert.deepEqual(database.createCommerceOnlineCatalog(), catalog, "stable projection timestamps");
  for (const imageUrl of ["/private/local.jpg", "https://127.0.0.1/local.jpg", "https://user:secret@images.example.com/product.jpg", "https://images.example.com/product.jpg?token=secret"]) {
    raw.prepare("UPDATE catalog_products SET image_source_url = ? WHERE id = ?").run(imageUrl, product.id);
    assert.equal(database.createCommerceOnlineCatalog().products[0].imageUrl, "");
  }
  raw.prepare("UPDATE catalog_products SET image_source_url = ? WHERE id = ?").run("https://images.example.com/product.jpg", product.id);
  assert.equal(readCatalog().payload.enabled, false);
  assert.deepEqual(readCatalog().payload.products, []);
  assert.equal(endpoint("catalog.php").status, 405, "no public POST");
  assert.equal(endpoint("sync.php", { action: "publish_online_catalog" }, "POST", false).status, 401);
  assert.equal((await coordinator.runNow()).ok, true);
  let published = readCatalog().payload;
  assert.equal(published.enabled, true);
  assert.deepEqual(published.delivery_methods, ["pickup"]);
  assert.equal(published.products.length, 1);
  assert.equal(published.products[0].price, 25);
  assert.equal(published.products[0].product_id, product.id);
  const request = calls.find((call) => call.action === "publish_online_catalog");
  assert.ok(request.source_revision > 0);
  assert.equal(request.idempotency_key, `${database.getSyncRuntimeStatus().clientId}:${request.source_epoch}:online_catalog:${request.source_revision}`);
  assert.equal(endpoint("sync.php", request).payload.deduplicated, true);
  assert.equal(endpoint("catalog.php", {}, "GET", false, `"ya-online-catalog-${published.server_revision}"`).status, 304);
  assert.equal(endpoint("sync.php", { ...request, source_revision: request.source_revision - 1, idempotency_key: "stale-publication" }).status, request.source_revision > 1 ? 409 : 422);

  const setupBeforeDelivery = database.getSetupData();
  assert.equal(database.saveInitialSetup({ ...setupBeforeDelivery, onlineSalesDelivery: { pickupEnabled: false, shippingEnabled: true } }).ok, false,
    "shipping requires a ready provider before activation");
  const saveDelivery = (onlineSalesDelivery) => database.saveInitialSetup({ ...setupBeforeDelivery, onlineSalesDelivery,
    arasShipping: { enabled: true, environment: "test", customerCode: "fixture", username: "fixture", password: "" } },
    undefined, undefined, { mode: "replace", encryptedValue: "safe-storage:v1:fixture-ciphertext" });
  assert.deepEqual(setupBeforeDelivery.onlineSalesDelivery, { pickupEnabled: true, shippingEnabled: false });
  assert.throws(() => raw.exec("UPDATE settings SET online_sales_pickup_enabled = 0, online_sales_shipping_enabled = 0"), /CHECK/);
  assert.equal(saveDelivery({ pickupEnabled: false, shippingEnabled: false }).ok, false);
  assert.deepEqual(database.getSetupData().onlineSalesDelivery, setupBeforeDelivery.onlineSalesDelivery);
  assert.equal(saveDelivery({ pickupEnabled: true, shippingEnabled: true }).ok, true);
  assert.deepEqual(database.createCommerceOnlineCatalog().deliveryMethods, ["pickup", "shipping"]);
  assert.equal((await coordinator.runNow()).ok, true);
  assert.deepEqual(readCatalog().payload.delivery_methods, ["pickup", "shipping"]);
  assert.equal(saveDelivery({ pickupEnabled: false, shippingEnabled: true }).ok, true);
  assert.equal((await coordinator.runNow()).ok, true);
  assert.deepEqual(readCatalog().payload.delivery_methods, ["shipping"]);
  assert.equal(saveDelivery({ pickupEnabled: true, shippingEnabled: false }).ok, true);
  assert.equal((await coordinator.runNow()).ok, true);

  for (const methods of [[], ["pickup", "pickup"], ["pickup", "carrier"], [null], undefined]) {
    assert.equal(endpoint("sync.php", { ...request, source_revision: 999, idempotency_key: "invalid-methods", online_catalog: { ...request.online_catalog, delivery_methods: methods } }).status, 422);
  }

  // Defense in depth: injected private fields never enter hosting storage or public output.
  database.queueSyncJob("online_catalog_publish");
  const probeRevision = database.getPendingSyncJobs().find((job) => job.jobKey === "online_catalog").sourceRevision;
  const dirty = publicationEnvelope({ ...request, source_revision: probeRevision, idempotency_key: "public-allowlist-test",
    online_catalog: { ...request.online_catalog, internal_notes: "secret", delivery_settings: { carrier: "secret" }, products: request.online_catalog.products.map((p) => ({ ...p, barcode: "secret", purchase_price: 9, dealer_price: 12, supplier: "secret" })) } });
  assert.equal(endpoint("sync.php", dirty).status, 200);
  published = readCatalog().payload;
  assert.equal(JSON.stringify(published).includes("secret"), false);
  assert.deepEqual(Object.keys(published.products[0]).sort(), Object.keys(request.online_catalog.products[0]).sort());
  assert.equal(endpoint("sync.php", { ...dirty, client_id: "desktop-test-injection", source_revision: 1, idempotency_key: "injection-source" }).status, 409,
    "an arbitrary source cannot replace the activated Desktop");
  database.saveCommerceProductPublication({ productId: product.id, isPublished: false });
  assert.deepEqual(database.createCommerceOnlineCatalog().products, []);
  assert.equal((await coordinator.runNow()).ok, true);
  assert.deepEqual(readCatalog().payload.products, []);
  database.saveCommerceProductPublication({ productId: product.id, isPublished: true });
  assert.equal((await coordinator.runNow()).ok, true);
  const beforePriceRevision = readCatalog().payload.source_revision;
  saveRuntimeCatalogProduct(database.databasePath, { ...input, id: product.id, salePrice: 31 });
  assert.equal(database.createCommerceOnlineCatalog().products[0].price, 31);
  failPublication = true;
  assert.equal((await coordinator.runNow()).ok, false);
  const pending = raw.prepare("SELECT * FROM sync_outbox WHERE job_key = 'online_catalog'").get();
  assert.equal(pending.attempt_count, 1, "one failed POST increments retry bookkeeping exactly once");
  assert.ok(pending.source_revision > beforePriceRevision, "revision remains monotonic after completed jobs");
  failPublication = false;
  raw.exec("UPDATE sync_outbox SET next_attempt_at = '' WHERE job_key = 'online_catalog'");
  assert.equal((await coordinator.runNow()).ok, true);
  assert.equal(readCatalog().payload.products[0].price, 31);
  setBusinessCapability(database.databasePath, { capability: "channel.online_sales", enabled: false });
  assert.deepEqual(database.createCommerceOnlineCatalog(), { version: 1, enabled: false, deliveryMethods: [], updatedAt: "", products: [] });
  assert.throws(() => database.saveCommerceProductPublication({ productId: product.id, isPublished: false }), /etkin değil/);
  assert.equal((await coordinator.runNow()).ok, true);
  assert.equal(readCatalog().payload.enabled, false);
  assert.deepEqual(readCatalog().payload.products, []);
  assert.deepEqual(readCatalog().payload.delivery_methods, []);
  setBusinessCapability(database.databasePath, { capability: "channel.online_sales", enabled: true });
  assert.equal(database.getCommerceProductPublication(product.id).isPublished, true, "disabled channel preserves settings");
  assert.equal((await coordinator.runNow()).ok, true);
  raw.prepare("UPDATE catalog_products SET is_active = 0 WHERE id = ?").run(product.id);
  assert.deepEqual(database.createCommerceOnlineCatalog().products, []);
  assert.equal((await coordinator.runNow()).ok, true);
  assert.deepEqual(readCatalog().payload.products, []);
  supportsCatalog = false;
  database.queueSyncJob("online_catalog_publish");
  const unsupported = new SyncCoordinator({ database, getSyncConfig: () => ({ baseUrl: "https://catalog.example.test", syncSecret: secret }),
    createAndroidSnapshot: () => ({}), onDashboardChanged: () => {}, onStatusChanged: () => {} });
  const beforeUnsupported = calls.filter((call) => call.action === "publish_online_catalog").length;
  await unsupported.runNow();
  assert.equal(calls.filter((call) => call.action === "publish_online_catalog").length, beforeUnsupported);
  assert.ok(raw.prepare("SELECT next_attempt_at FROM sync_outbox WHERE job_key = 'online_catalog'").get().next_attempt_at > new Date().toISOString(), "unsupported publication stays queued with bounded retry");
  supportsCatalog = true;
  database.deleteCommerceProductPublication(product.id);
  assert.equal(database.getCommerceProductPublication(product.id), null);
  assert.equal(database.listCommerceProductPublications().length, 3);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM commerce_orders").get().n, 0);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM commerce_sales").get().n, 0);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM inventory_movements").get().n, 0);
  // Food-service channels publish and withdraw through the same canonical owners.
  for (const profileId of ["restaurant", "pension_restaurant"]) {
    applyBusinessProfileCapabilities(database.databasePath, profileId, { preserveUserOverrides: false });
    assert.equal(database.getEnabledBusinessCapabilities().includes("channel.online_sales"), false);
    setBusinessCapability(database.databasePath, { capability: "commerce.orders", enabled: true });
    setBusinessCapability(database.databasePath, { capability: "channel.online_sales", enabled: true });
    // Profile transitions reset delivery activation; this fixture explicitly offers pickup.
    raw.exec("UPDATE settings SET online_sales_delivery_enabled = 1, online_sales_pickup_enabled = 1, online_sales_shipping_enabled = 0");
    const category = database.saveMenuCategory({ name: `${profileId} menu`, description: "", is_active: true, sort_order: 0 });
    assert.equal(category.ok, true, category.message);
    const before = raw.prepare("SELECT COUNT(*) AS n FROM catalog_products").get().n;
    const menuResult = database.saveMenuProductEntry({ product: { name: `${profileId} menu product`, salePrice: 42, trackInventory: false, onlineSalesPublished: false },
      category_id: category.savedId, price_override: null, is_available: true, is_featured: false,
      allergens: [], tags: [], stock_consumption_quantity: 1, hide_when_out_of_stock: false, sort_order: 0 });
    assert.equal(menuResult.ok, true, menuResult.message);
    const menuProductId = database.getPublishedMenu().items.find(item => item.id === menuResult.savedId).product_id;
    database.saveCommerceProductPublication({ productId: menuProductId, isPublished: true });
    assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM catalog_products").get().n, before + 1, "publication must not duplicate a menu product");
    const syncResult = await coordinator.runNow();
    assert.equal(syncResult.ok, true, syncResult.message);
    assert.ok(readCatalog().payload.products.some(product => product.product_id === menuProductId), "Web catalog preserves canonical menu product_id");
    const revision = readCatalog().payload.source_revision;
    setBusinessCapability(database.databasePath, { capability: "channel.online_sales", enabled: false });
    assert.equal(database.createCommerceOnlineCatalog().enabled, false);
    const withdrawal = database.getPendingSyncJobs().find(job => job.jobKey === "online_catalog");
    assert.ok(withdrawal.sourceRevision > revision, "capability OFF queues canonical withdrawal");
    assert.equal((await coordinator.runNow()).ok, true);
    assert.equal(readCatalog().payload.enabled, false);
    assert.deepEqual(readCatalog().payload.products, []);
    assert.equal(raw.prepare("SELECT is_published FROM commerce_product_publications WHERE product_id = ?").get(menuProductId).is_published, 1, "withdrawal preserves publication preference");
    assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM catalog_products").get().n, before + 1);
  }
  assert.equal(endpoint("sync.php", { action: "reset_runtime" }).status, 200);
  assert.equal(readCatalog().payload.enabled, false);
  assert.deepEqual(readCatalog().payload.products, []);
  console.log("commerce-online-catalog-smoke-ok");
} finally {
  globalThis.fetch = originalFetch;
  raw?.close(); database.close(); rmSync(root, { recursive: true, force: true });
}
