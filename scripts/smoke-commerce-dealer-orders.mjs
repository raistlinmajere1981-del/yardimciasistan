import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect } from "@playwright/test";
import { createTemporaryDesktopDatabase } from "./test-helpers/desktop-database.mjs";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";

const require = createRequire(import.meta.url);
const { BUSINESS_CAPABILITIES: C } = require("../packages/shared/dist/index.js");
const { PhpHostingSyncTransport } = require("../packages/sync-core/dist/index.js");
const { SyncCoordinator } = require("../apps/desktop-app/dist-electron/sync-coordinator.js");
const { OnlineOrderIngressService } = require("../apps/desktop-app/dist-electron/online-order-ingress-service.js");
const { saveRuntimeCatalogProduct, listRuntimeOrders } = require("../apps/desktop-app/dist-electron/commerce-runtime.js");
const desktop = createTemporaryDesktopDatabase("ya-c2-desktop-");
const { database } = desktop;
const root = mkdtempSync(join(tmpdir(), "ya-c2-web-"));
const hosting = join(root, "web-module");
cpSync("firm-template/web-module", hosting, { recursive: true });
for (const suffix of ["", "-wal", "-shm"]) rmSync(join(hosting, "data", "yardimci-asistan.sqlite" + suffix), { force: true });
const secret = "dealer-c2-test-secret";
const config = join(hosting, "config/business.json");
writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), sync_secret: secret }));
const port = await new Promise((resolve, reject) => {
  const probe = http.createServer(); probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => { const port = probe.address().port; probe.close(() => resolve(port)); });
});
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", hosting], { stdio: ["ignore", "pipe", "pipe"] });
let logs = "", browser, raw;
for (const stream of [server.stdout, server.stderr]) stream.on("data", chunk => { logs += chunk; });
const transport = new PhpHostingSyncTransport({ baseUrl, syncSecret: secret, clientId: "c2-read-test" });
const coordinator = new SyncCoordinator({ database, getSyncConfig: () => ({ baseUrl, syncSecret: secret }),
  createAndroidSnapshot: () => ({}), onDashboardChanged() {}, onStatusChanged() {} });
function storage(code) {
  const result = spawnSync("php", ["-r", `require $argv[1]; $db = ya_storage_open(); ${code}`, join(hosting, "lib/storage.php")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr); return result.stdout ? JSON.parse(result.stdout) : null;
}
const clearGuard = () => storage("if ($db->query(\"SELECT 1 FROM sqlite_master WHERE name = 'public_request_guard_events'\")->fetchColumn()) $db->exec('DELETE FROM public_request_guard_events');");
async function post(file, body, cookie = "", clear = true) {
  if (clear) clearGuard();
  const response = await fetch(`${baseUrl}/api/dealer/${file}.php`, { method: "POST", headers: { "Content-Type": "application/json", "X-YA-Dealer": "1", Cookie: cookie }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie") };
}
async function catalog(cookie = "", query = "") {
  const response = await fetch(`${baseUrl}/api/dealer/catalog.php${query}`, { headers: { Cookie: cookie } });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
async function sync() { const result = await coordinator.runNow(); assert.equal(result.ok, true, result.message); }
const address = { recipientName: "C2 Teslimat", addressLine1: "Örnek Cadde 10", district: "Cide", city: "Kastamonu", countryCode: "tr", postalCode: "37600" };
const tokens = [];
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${baseUrl}/api/dealer/session.php`)).status === 401) break; } catch { /* startup */ }
    if (i > 100) throw new Error("PHP startup failed"); await new Promise(resolve => setTimeout(resolve, 30));
  }
  database.initialize();
  assert.equal(database.saveInitialSetup({ businessName: "C2", profileId: "market", profileOptions: [C.WHOLESALE], dealerPortalEnabled: true,
    arasShipping: { enabled: true, environment: "test", customerCode: "fixture", username: "fixture", password: "" },
    onlineSalesDelivery: { pickupEnabled: true, shippingEnabled: true }, phone: "", whatsapp: "", email: "", address: "", webModuleUrl: "https://example.test/module",
    syncSecret: secret, autoSyncEnabled: false, aiEnabled: false, aiProvider: "openai_compatible", aiService: "openai", aiProjectName: "", aiModel: "",
    aiModelOptions: [], aiBaseUrl: "https://api.openai.com/v1", aiTimeoutSeconds: 30, aiApiKey: "", clearAiApiKey: false,
    servicePreferences: { whatsapp: false, android: false }, initialCounts: { rooms: 0, tables: 0 }, tableCategories: [] }, undefined, undefined,
    { mode: "replace", encryptedValue: "safe-storage:v1:fixture-ciphertext" }).ok, true);
  assert.equal(database.getEnabledBusinessCapabilities().includes(C.ONLINE_SALES), false, "dealer portal operates independently of Online Sales");
  raw = new DatabaseSync(database.databasePath);
  const input = { name: "C2 Bayi Ürünü", sku: "C2-SKU", salePrice: 100, dealerPriceA: 80, dealerPriceB: 60,
    purchasePrice: 50, currency: "TRY", unit: "piece", taxRate: 20, trackInventory: false, isActive: true };
  const product = saveRuntimeCatalogProduct(database.databasePath, input);
  const fallback = saveRuntimeCatalogProduct(database.databasePath, { ...input, name: "C2 Fallback", sku: "C2-FALLBACK", salePrice: 25, dealerPriceA: null, dealerPriceB: null });
  const inactive = saveRuntimeCatalogProduct(database.databasePath, { ...input, name: "Inactive", sku: "C2-INACTIVE", isActive: false });
  const dealers = ["retail", "dealer_a", "dealer_b"].map((priceGroup, index) => {
    const result = database.saveCustomer({ fullName: `Canonical dealer ${index}`, phone: `0555000100${index}`, email: `private${index}@example.test`, notes: "PRIVATE_C2_NOTES", tags: [],
      commercialProfile: { companyName: `C2 Company ${index}`, dealerStatus: "active", priceGroup, taxNumber: `PRIVATE_C2_TAX_${index}` } });
    assert.equal(result.ok, true, result.message); database.changeDealerWebAccess(result.savedId, "enable");
    const invite = database.changeDealerWebAccess(result.savedId, "invite"); const token = new URL(invite.inviteUrl).hash.slice(8); tokens.push(token);
    return { customerId: result.savedId, access: invite.access, token };
  });
  const projection = database.createDealerAccessProjection();
  assert.equal(projection.catalogs.length, 3);
  for (const [index, expected] of [100, 80, 60].entries()) {
    const projected = projection.catalogs.find(row => row.access_id === dealers[index].access.accessId);
    assert.equal(projected.products.find(row => row.product_id === product.id).price, expected);
    assert.equal(projected.products.find(row => row.product_id === fallback.id).price, 25);
    assert.equal(projected.products.some(row => row.product_id === inactive.id), false);
    assert.deepEqual(projected.delivery_methods, ["pickup", "shipping"]);
  }
  const serialized = JSON.stringify(projection);
  for (const sentinel of ["PRIVATE_C2_NOTES", "PRIVATE_C2_TAX", ...dealers.flatMap((dealer, i) => [dealer.customerId, `0555000100${i}`, `private${i}@example.test`]), ...tokens]) assert.equal(serialized.includes(sentinel), false);
  await sync();
  assert.equal((await catalog()).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/dealer/order.php`)).status, 405);
  assert.equal((await fetch(`${baseUrl}/bayi/`)).status, 200);
  for (const dealer of dealers) {
    const claimed = await post("claim", { invite_token: dealer.token }); assert.equal(claimed.status, 200); dealer.cookie = claimed.cookie.split(";")[0];
  }
  const a = dealers[1], b = dealers[2];
  const own = await catalog(a.cookie, `?dealerAccessId=${b.access.accessId}&customerId=${b.customerId}`);
  assert.equal(own.status, 200); assert.equal(own.body.catalog.access_id, a.access.accessId);
  assert.equal(own.body.catalog.products.find(row => row.product_id === product.id).price, 80);
  assert.match(own.headers.get("cache-control"), /no-store/);
  const publicCatalog = await (await fetch(`${baseUrl}/api/catalog.php`)).text();
  assert.equal(publicCatalog.includes(a.access.accessId), false); assert.equal(publicCatalog.includes("C2 Bayi Ürünü"), false);
  const payload = { idempotencyKey: "dealer-order-pickup-01", items: [{ productId: product.id, quantity: 2 }], delivery: { method: "pickup" }, note: "C2 Note" };
  assert.equal((await post("order", payload)).status, 401);
  for (const injected of [{ customerId: b.customerId }, { dealerAccessId: b.access.accessId }, { priceGroup: "dealer_b" }, { buyer: { name: "fake" } }]) {
    assert.equal((await post("order", { ...payload, ...injected }, a.cookie)).status, 422);
  }
  const accepted = await post("order", { ...payload, total: 1, unitPrice: 1, items: [{ ...payload.items[0], unitPrice: 1 }] }, a.cookie);
  assert.equal(accepted.status, 201);
  assert.deepEqual((await post("order", payload, a.cookie)).body, accepted.body);
  assert.equal((await post("order", { ...payload, note: "Different" }, a.cookie)).status, 409);
  assert.equal((await post("order", { ...payload, delivery: { method: "shipping", address } }, a.cookie)).status, 409);
  assert.deepEqual((await post("order", { ...payload, catalogRevision: "f".repeat(64) }, a.cookie)).body, accepted.body);
  clearGuard();
  for (let i = 0; i < 8; i++) assert.equal((await post("order", payload, a.cookie, false)).status, 201);
  assert.equal((await post("order", payload, a.cookie, false)).status, 429);
  assert.equal((await post("order", { ...payload, delivery: { method: "shipping", address: {} } }, a.cookie)).status, 422);
  const queue = await transport.pullWebOrders({ afterSeq: 0 }); assert.equal(queue.ok, true); assert.equal(queue.orders.length, 1);
  const envelope = queue.orders[0]; assert.equal(envelope.kind, "dealer"); assert.equal(envelope.dealerAccessId, a.access.accessId);
  assert.equal("buyer" in envelope, false); assert.equal("customerId" in envelope, false); assert.equal("unitPrice" in envelope.items[0], false);
  const beforeCatalog = database.createDealerAccessProjection().catalogs.find(row => row.access_id === a.access.accessId);
  saveRuntimeCatalogProduct(database.databasePath, { ...input, id: product.id, dealerPriceA: 75 });
  const afterCatalog = database.createDealerAccessProjection().catalogs.find(row => row.access_id === a.access.accessId);
  assert.notEqual(afterCatalog.catalog_revision, beforeCatalog.catalog_revision);
  assert.ok(database.getPendingSyncJobs().some(job => job.jobType === "dealer_access_publish"));
  const ingress = new OnlineOrderIngressService(database);
  const canonical = ingress.importOrder(envelope);
  assert.equal(canonical.order.customerId, a.customerId); assert.equal(canonical.order.customerName, "Canonical dealer 1");
  assert.equal(canonical.order.source, "web-dealer"); assert.equal(canonical.order.sourceReference, accepted.body.order_id);
  assert.equal(canonical.order.buyerSnapshot, null); assert.equal(canonical.items[0].unitPrice, 75); assert.equal(canonical.order.total, 150);
  assert.equal(ingress.importOrder(envelope).order.id, canonical.order.id);
  await sync(); assert.equal((await transport.pullWebOrders({ afterSeq: 0 })).orders.length, 0);
  assert.equal((await catalog(a.cookie)).body.catalog.products.find(row => row.product_id === product.id).price, 75);
  // Customer price-group changes invalidate without invalidating its login session.
  const jobBefore = raw.prepare("SELECT source_revision FROM sync_outbox_revisions WHERE job_key = 'dealer_access'").get().source_revision;
  raw.prepare("UPDATE customer_commercial_profiles SET price_group = 'dealer_b' WHERE customer_id = ?").run(a.customerId);
  assert.ok(raw.prepare("SELECT source_revision FROM sync_outbox_revisions WHERE job_key = 'dealer_access'").get().source_revision > jobBefore);
  await sync(); assert.equal((await catalog(a.cookie)).body.catalog.products.find(row => row.product_id === product.id).price, 60);
  const profileRevision = database.createDealerAccessProjection().catalogs.find(row => row.access_id === a.access.accessId).catalog_revision;
  raw.prepare("UPDATE customer_commercial_profiles SET company_name = 'C2 renamed company' WHERE customer_id = ?").run(a.customerId);
  assert.notEqual(database.createDealerAccessProjection().catalogs.find(row => row.access_id === a.access.accessId).catalog_revision, profileRevision, "profile changes renew the catalog even with identical prices");
  // Product creation, active state and public publication changes all invalidate the private outbox.
  const created = saveRuntimeCatalogProduct(database.databasePath, { ...input, name: "New dealer product", sku: "NEW" });
  assert.ok(database.createDealerAccessProjection().catalogs[0].products.some(row => row.product_id === created.id));
  raw.prepare("UPDATE catalog_products SET is_active = 0 WHERE id = ?").run(created.id);
  assert.equal(database.createDealerAccessProjection().catalogs[0].products.some(row => row.product_id === created.id), false);
  const publicationJob = raw.prepare("SELECT source_revision FROM sync_outbox_revisions WHERE job_key = 'dealer_access'").get().source_revision;
  const now = new Date().toISOString();
  raw.prepare("INSERT INTO commerce_product_publications (business_id, product_id, channel, is_published, created_at, updated_at) VALUES (?, ?, 'online_sales', 0, ?, ?)")
    .run(canonical.order.businessId, product.id, now, now);
  assert.ok(raw.prepare("SELECT source_revision FROM sync_outbox_revisions WHERE job_key = 'dealer_access'").get().source_revision > publicationJob);
  assert.ok(database.createDealerAccessProjection().catalogs[0].products.some(row => row.product_id === product.id), "public opt-out does not hide dealer product");
  await sync();
  const shipped = await post("order", { ...payload, idempotencyKey: payload.idempotencyKey, delivery: { method: "shipping", address }, note: "" }, b.cookie);
  assert.equal(shipped.status, 201); assert.notEqual(shipped.body.order_id, accepted.body.order_id); await sync();
  const shippingOrder = listRuntimeOrders(database.databasePath).find(order => order.sourceReference === shipped.body.order_id);
  assert.equal(shippingOrder.deliverySnapshot.method, "shipping"); assert.equal(shippingOrder.deliverySnapshot.address.countryCode, "TR");
  assert.deepEqual(database.listShipmentsForOrder(shippingOrder.id), []);
  const shipment = database.createShipmentForOrder(shippingOrder.id); assert.equal(shipment.status, "draft");
  assert.equal(database.getCommerceOrder(shippingOrder.id).order.status, "placed");
  // Invalid current access is rechecked inside canonical creation, even after hosting acceptance.
  const blocked = await post("order", { ...payload, idempotencyKey: "dealer-order-revoked-03" }, b.cookie); assert.equal(blocked.status, 201);
  const blockedQueue = await transport.pullWebOrders({ afterSeq: database.getSyncRuntimeStatus().webOrderCursor });
  database.changeDealerWebAccess(b.customerId, "revoke_sessions");
  assert.throws(() => ingress.importOrder(blockedQueue.orders[0]), /Bayi web erişimi/);
  assert.equal(listRuntimeOrders(database.databasePath).some(order => order.sourceReference === blocked.body.order_id), false);
  const later = await post("order", { ...payload, idempotencyKey: "dealer-after-revoked-04" }, a.cookie);
  assert.equal(later.status, 201);
  await sync();
  assert.ok(listRuntimeOrders(database.databasePath).some(order => order.sourceReference === later.body.order_id), "terminal rejection does not block a later valid order");
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM commerce_dealer_order_rejections WHERE web_order_id = ?").get(blocked.body.order_id).n, 1);
  assert.equal((await transport.pullWebOrders({ afterSeq: 0 })).orders.length, 0);
  assert.equal((await catalog(b.cookie)).status, 401); assert.equal((await post("order", payload, b.cookie)).status, 401);
  clearGuard();
  browser = await launchChromiumForSmoke(chromium);
  const context = await browser.newContext({ locale: "tr-TR", viewport: { width: 375, height: 812 } });
  const page = await context.newPage(); const errors = []; page.on("pageerror", error => errors.push(error.message));
  const replacement = database.changeDealerWebAccess(a.customerId, "invite"); const uiToken = new URL(replacement.inviteUrl).hash.slice(8); tokens.push(uiToken);
  await sync(); await page.goto(`${baseUrl}/bayi/#invite=${uiToken}`);
  await page.getByRole("button", { name: "Daveti kullan" }).click();
  await expect(page.getByRole("heading", { name: "Bayi paneli" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "C2 Bayi Ürünü", exact: true })).toBeVisible();
  await expect(page.locator(".product-card").filter({ hasText: "C2 Bayi Ürünü" }).locator(".price")).toContainText("60");
  await expect(page.locator("#buyer-name, #buyer-phone")).toHaveCount(0);
  for (const width of [320, 375, 1440]) { await page.setViewportSize({ width, height: 900 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
  await page.locator(".product-card").filter({ hasText: "C2 Bayi Ürünü" }).getByRole("button", { name: "Sepete ekle" }).click();
  await page.getByRole("button", { name: "C2 Bayi Ürünü miktarını artır" }).click(); await expect(page.locator("#subtotal")).toContainText("120");
  await page.reload(); await expect(page.getByLabel("C2 Bayi Ürünü miktarı", { exact: true })).toHaveValue("2");
  await page.getByLabel("Teslimat yöntemi").selectOption("shipping");
  for (const [key, value] of Object.entries(address)) await page.locator(`#delivery-${key}`).fill(value);
  await page.locator("#order-note").fill("PRIVATE_UI_ORDER_NOTE");
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  assert.equal(stored.includes("PRIVATE_UI_ORDER_NOTE"), false); assert.equal(stored.includes(address.recipientName), false); assert.equal(stored.includes(uiToken), false);
  let first = true; const attempts = [];
  await page.route("**/api/dealer/order.php", async route => {
    attempts.push(JSON.parse(route.request().postData()));
    if (first) { first = false; await route.fetch(); await route.abort(); } else await route.continue();
  });
  await page.getByRole("button", { name: "Siparişi gönder", exact: true }).click();
  await expect(page.getByRole("button", { name: "Aynı siparişi tekrar dene" })).toBeEnabled();
  await expect(page.locator("#order-note")).toBeDisabled();
  await page.getByRole("button", { name: "Aynı siparişi tekrar dene" }).click();
  await expect(page.getByRole("heading", { name: "Siparişiniz alındı" })).toBeVisible(); assert.deepEqual(attempts[0], attempts[1]);
  assert.equal("customerId" in attempts[0], false); assert.equal("price" in attempts[0].items[0], false);
  await sync();
  await page.getByRole("button", { name: "Yeni sipariş başlat" }).click();
  await page.getByRole("button", { name: "Oturumu kapat" }).click(); await expect(page.getByRole("heading", { name: "Bayi erişimi gerekli" })).toBeVisible();
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0); assert.deepEqual(errors, []);
  // Current delivery allowlist is also enforced at Desktop create, independently of hosting.
  database.changeDealerWebAccess(a.customerId, "enable"); const active = database.getDealerWebAccess(a.customerId);
  raw.exec("UPDATE settings SET online_sales_shipping_enabled = 0");
  assert.throws(() => database.createDealerWebOrder(active.accessId, active.accessRevision, { sourceReference: "bad-delivery", items: payload.items, deliverySnapshot: { method: "shipping", address } }), /teslimat yöntemi/);
  assert.equal(storage("echo json_encode($db->query('SELECT COUNT(*) FROM web_order_submission_receipts')->fetchColumn());") >= 3, true);
  assert.equal(tokens.some(token => logs.includes(token)), false); assert.equal(logs.includes("PRIVATE_UI_ORDER_NOTE"), false);
  console.log("commerce-dealer-orders-smoke-ok: private prices, session identity, idempotency, canonical ingress, delivery, revocation, responsive cart and retry");
} finally {
  await browser?.close(); raw?.close(); desktop.cleanup(); server.kill(); await new Promise(resolve => server.once("exit", resolve)); rmSync(root, { recursive: true, force: true });
}
