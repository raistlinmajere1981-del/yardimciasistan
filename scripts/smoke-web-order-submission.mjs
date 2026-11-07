import assert from "node:assert/strict";
import { activateFixtureSource, publicationEnvelope } from "./test-helpers/publication-protocol.mjs";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "ya-web-order-submission-"));
const hosting = join(root, "web-module");
cpSync(join(process.cwd(), "firm-template/web-module"), hosting, { recursive: true });
for (const file of ["yardimci-asistan.sqlite", "yardimci-asistan.sqlite-wal", "yardimci-asistan.sqlite-shm"]) rmSync(join(hosting, "data", file), { force: true });
const secret = "web-order-submission-test-secret";
const config = join(hosting, "config/business.json");
writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), sync_secret: secret }));
const port = await new Promise((resolve, reject) => {
  const server = http.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", hosting], { stdio: ["ignore", "pipe", "pipe"] });
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk; });
server.stderr.on("data", (chunk) => { serverOutput += chunk; });
function storage(code) {
  const result = spawnSync("php", ["-r", `require $argv[1]; $db = ya_storage_open(); ${code}`, join(hosting, "lib/storage.php")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout) : null;
}
const clearGuard = () => storage("if ($db->query(\"SELECT 1 FROM sqlite_master WHERE name = 'public_request_guard_events'\")->fetchColumn()) $db->exec('DELETE FROM public_request_guard_events');");
async function sync(payload) {
  payload = publicationEnvelope(payload);
  const response = await fetch(`${baseUrl}/api/sync.php`, { method: "POST", headers: { "Content-Type": "application/json", "X-YA-Sync-Secret": secret }, body: JSON.stringify(payload) });
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
let revision = 0;
const checkout = { version: 1, enabled: true, demo: true, currency: "TRY", shippingFeeMinor: 1500,
  bank: { name: "DEMO Banka", accountHolder: "DEMO İşletme", iban: "DEMO — GEÇERSİZ — ÖDEME YAPMAYIN" },
  legal: { version: "demo-v2", preliminary: "DEMO ön bilgilendirme. Ticari kullanıma hazır değildir.", agreement: "DEMO satış sözleşmesi. Ticari kullanıma hazır değildir." } };
const publishedProduct = { product_id: "published-product", name: "Published product", description: "", sku: "", unit: "piece", price: 25,
  currency: "TRY", tax_rate: 20, image_url: "", availability: "available", sort_order: 0 };
async function publish(enabled, extraProducts = [], methods = ["pickup"]) {
  revision += 1;
  if (revision === 1) await activateFixtureSource(baseUrl, secret, "desktop-a3");
  return sync({ action: "publish_online_catalog", client_id: "desktop-a3", source_revision: revision, idempotency_key: `catalog-${revision}`,
    online_catalog: { version: 1, checkout, enabled, delivery_methods: enabled ? methods : [], updated_at: new Date().toISOString(), products: enabled ? [publishedProduct, ...extraProducts] : [] } });
}
const buyer = { name: "Guest buyer", phone: "+1 (202) 555-0100", email: "guest@example.test" };
const input = { idempotencyKey: "guest-order-key-0001", items: [{ productId: "published-product", quantity: 2 }], buyer, delivery: { method: "pickup" }, note: "Guest note" };
const quoteCache = new Map();
async function submit(payload, options = {}) {
  // Simulate the review page: fetch a server quote once, preserve it on uncertain retry.
  if (!quoteCache.has(payload?.idempotencyKey)) {
    clearGuard();
    const response = await fetch(`${baseUrl}/api/checkout-quote.php`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({items: payload?.items, delivery: payload?.delivery}) });
    const result = await response.json();
    if (result.ok) quoteCache.set(payload.idempotencyKey, result.quote.quote_id);
  }
  payload = { ...payload, paymentMethod: "bank_transfer", consent: {preliminary: true, agreement: true, marketing: false}, quoteId: quoteCache.get(payload?.idempotencyKey) || "0".repeat(64), ...options.checkoutFields };
  if (options.clear !== false) clearGuard();
  const response = await fetch(`${baseUrl}/api/order.php`, { method: options.method ?? "POST",
    headers: { "Content-Type": options.contentType ?? "application/json" },
    ...((options.method ?? "POST") === "POST" ? { body: options.raw ?? JSON.stringify(payload) } : {}) });
  return { status: response.status, payload: await response.json(), headers: response.headers };
}
try {
  for (let attempt = 0; ; attempt += 1) {
    try { if ((await fetch(`${baseUrl}/api/catalog.php`)).ok) break; } catch { /* server startup */ }
    if (attempt > 100) throw new Error("PHP server did not start");
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  assert.equal((await submit(input, { method: "GET" })).status, 405);
  assert.equal((await submit(input, { method: "PUT" })).status, 405);
  assert.equal((await submit(input, { contentType: "text/plain" })).status, 415);
  assert.equal((await submit(input, { raw: "{" })).status, 400);
  assert.equal((await submit(input, { raw: "[]" })).status, 400);
  assert.equal((await submit(input, { raw: JSON.stringify({ padding: "x".repeat(16384) }) })).status, 413);
  const chunkedStatus = await new Promise((resolve, reject) => {
    const request = http.request(`${baseUrl}/api/order.php`, { method: "POST", headers: { "Content-Type": "application/json" } }, (response) => {
      response.resume(); response.once("end", () => resolve(response.statusCode));
    });
    request.once("error", reject);
    request.write(JSON.stringify({ padding: "x".repeat(16384) })); request.end();
  });
  assert.equal(chunkedStatus, 413, "actual body bound also protects chunked requests");
  assert.equal((await submit(input)).payload.code, "online_sales_disabled");
  await publish(false);
  assert.equal((await submit(input)).status, 403);
  await publish(true, [], []);
  const browseOnly = await (await fetch(`${baseUrl}/api/catalog.php`)).json();
  assert.equal(browseOnly.enabled, true);
  assert.deepEqual(browseOnly.delivery_methods, []);
  assert.equal(browseOnly.products[0].product_id, publishedProduct.product_id);
  const closedOrder = await submit(input);
  assert.equal(closedOrder.status, 403);
  assert.equal(closedOrder.payload.code, "online_ordering_disabled");
  assert.equal(storage("echo $db->query('SELECT COUNT(*) FROM web_orders')->fetchColumn();"), 0);
  await publish(true);
  assert.equal((await submit({ ...input, items: [{ productId: "unpublished-product", quantity: 1 }] })).payload.code, "product_not_published");
  for (const quantity of [0, -1, 1001, true, "2", 0.00001, null]) {
    assert.equal((await submit({ ...input, items: [{ productId: "published-product", quantity }] })).status, 422);
  }
  for (const invalid of [
    { items: [] }, { items: Array(51).fill(input.items[0]) }, { items: [input.items[0], input.items[0]] },
    { buyer: { ...buyer, name: "x".repeat(161) } }, { buyer: { ...buyer, phone: "123" } },
    { buyer: { ...buyer, phone: "+90 invalid" } }, { buyer: { ...buyer, email: "invalid" } },
    { buyer: { ...buyer, email: "x".repeat(255) } }, { note: "x".repeat(2001) }, { buyer: null }, { idempotencyKey: "short" }
  ]) assert.equal((await submit({ ...input, ...invalid })).status, 422);
  // Cumulative quantity is bounded even with individually valid rows.
  assert.equal((await submit({ ...input, items: Array.from({ length: 11 }, (_, index) => ({ productId: `p${index}`, quantity: 1000 })) })).status, 422);
  assert.equal(storage("echo $db->query('SELECT COUNT(*) FROM web_orders')->fetchColumn();"), 0);
  assert.equal((await submit({ ...input, items: [{ productId: "published-product", quantity: 0.5 }] })).payload.code, "invalid_quantity");
  assert.equal((await submit(input,{checkoutFields:{paymentMethod:'card'}})).payload.code,'payment_method_unavailable');
  assert.equal((await submit(input,{checkoutFields:{consent:{preliminary:true,agreement:false,marketing:false}}})).payload.code,'consent_required');
  assert.equal((await submit(input,{checkoutFields:{quoteId:'f'.repeat(64)}})).payload.code,'quote_changed');
  const injected = { ...input, customerId: "fake-customer", discountTotal: 999, price: 0.01, stock: 99, fulfillment: "done",
    items: [{ ...input.items[0], unitPrice: 0.01, taxRate: 0 }], buyer: { ...buyer, customerId: "fake-customer" } };
  const accepted = await submit(injected);
  assert.equal(accepted.status, 201);
  assert.match(accepted.payload.order_number, /^YA-\d{8}-[A-F0-9]{10}$/);
  assert.equal(accepted.payload.total_minor, 5000);
  assert.equal(accepted.payload.payment_status, "unpaid");
  assert.equal(accepted.payload.quoted_total, 50);
  assert.equal(accepted.payload.currency, "TRY");
  assert.match(accepted.payload.order_id, /^web_order_[a-f0-9]{32}$/);
  assert.deepEqual((await submit(input)).payload, accepted.payload, "price/private injection does not affect semantic identity");
  const concurrent = await Promise.all(Array.from({ length: 3 }, () => submit(input, { clear: false })));
  for (const retry of concurrent) assert.deepEqual(retry.payload, accepted.payload);
  assert.equal((await submit({ ...input, note: "Different order intent" })).status, 409);
  assert.equal((await submit({ ...input, buyer: { ...buyer, phone: "+44 7911 123456" } })).status, 409);
  assert.equal(storage("echo $db->query('SELECT COUNT(*) FROM web_orders')->fetchColumn();"), 1);
  assert.deepEqual((await submit({ ...input, delivery: { method: "pickup", address: { arbitrary: "discarded" }, shippingPrice: 999 } })).payload, accepted.payload);
  const pulled = await sync({ action: "pull_web_orders", client_id: "desktop-a3", after_seq: 0 });
  assert.deepEqual(pulled.orders[0].buyer, buyer);
  assert.deepEqual(pulled.orders[0].delivery, { method: "pickup", address: null });
  assert.equal(pulled.orders[0].note, input.note);
  assert.deepEqual(pulled.orders[0].items, input.items);
  assert.equal(pulled.orders[0].quote.subtotal_minor, 5000);
  assert.equal(pulled.orders[0].quote.items[0].unit_price_minor, 2500);
  assert.equal(JSON.stringify(pulled.orders[0]).includes("fake-customer"), false);
  const receipt = storage("echo json_encode($db->query('SELECT * FROM web_order_submission_receipts')->fetch());");
  const receiptText = JSON.stringify(receipt);
  for (const privateValue of [buyer.name, buyer.phone, buyer.email, input.note, input.idempotencyKey]) assert.equal(receiptText.includes(privateValue), false);
  await sync({ action: "acknowledge_web_orders", client_id: "desktop-a3", through_seq: pulled.next_cursor });
  for (const clientId of ["desktop-a3", "desktop-after-reset"]) {
    const inbox = await sync({ action: "pull_web_orders", client_id: clientId, after_seq: 0 });
    assert.deepEqual(inbox.orders, [], "acknowledged order is absent even for a new zero-cursor client");
    assert.equal(inbox.next_cursor, 0);
    assert.equal(inbox.has_more, false);
  }
  await publish(true, [], []);
  assert.deepEqual((await submit(input)).payload, accepted.payload, "accepted receipt survives delivery OFF");
  assert.equal((await submit({ ...input, idempotencyKey: "guest-order-closed-2" })).payload.code, "online_ordering_disabled");
  await publish(false);
  assert.deepEqual((await submit(input)).payload, accepted.payload, "receipt replay survives publication disable and ack");
  assert.equal((await submit({ ...input, idempotencyKey: "guest-order-key-new-2" })).status, 403);
  await publish(true);
  // Receipt write failure rolls back queue insertion as well; the same key can safely retry.
  storage("$db->exec(\"CREATE TRIGGER reject_receipt BEFORE INSERT ON web_order_submission_receipts BEGIN SELECT RAISE(ABORT, 'fixture_failure'); END\");");
  const newInput = { ...input, idempotencyKey: "guest-order-key-new-2" };
  assert.equal((await submit(newInput)).status, 503);
  assert.equal(storage("echo $db->query('SELECT COUNT(*) FROM web_orders')->fetchColumn();"), 1);
  storage("$db->exec('DROP TRIGGER reject_receipt');");
  assert.equal((await submit(newInput)).status, 201);
  await publish(true, [{ ...publishedProduct, product_id: "second-product", unit: "kg", name: "Second published product" }]);
  const multiItem = { ...input, idempotencyKey: "guest-order-key-multi", items: [...input.items, { productId: "second-product", quantity: 0.125 }] };
  const multiAccepted = await submit(multiItem);
  assert.equal(multiAccepted.status, 201);
  assert.equal(multiAccepted.payload.quoted_total, 53.13, "fractional weight rounds half-up to minor units");
  assert.deepEqual((await submit({ ...multiItem, items: [...multiItem.items].reverse(), note: ` ${input.note} ` })).payload,
    multiAccepted.payload, "normalized row order and trimmed fields preserve semantic identity");
  const address = { recipientName: "Delivery Recipient", addressLine1: "42 Example Road", addressLine2: "Floor 2", district: "Central", city: "London", postalCode: "SW1A 1AA", countryCode: "gb", note: "Ring bell" };
  const shipping = { ...input, idempotencyKey: "guest-order-key-shipping", delivery: { method: "shipping", address } };
  assert.equal((await submit(shipping)).payload.code, "delivery_method_unavailable");
  checkout.shippingFeeMinor=null;
  await publish(true, [], ["pickup", "shipping"]);
  assert.equal((await submit({...shipping,idempotencyKey:'shipping-fee-unconfigured'})).payload.code,'shipping_fee_unconfigured');
  checkout.shippingFeeMinor=1500;
  await publish(true, [], ["pickup", "shipping"]);
  for (const delivery of [undefined, null, { method: "carrier" }, { method: "shipping" }, { method: "shipping", address: {} },
    ...[{ recipientName: "" }, { addressLine1: "x".repeat(301) }, { addressLine2: "x".repeat(301) }, { district: "" }, { city: "x".repeat(121) },
      { postalCode: "x".repeat(33) }, { countryCode: "TUR" }, { countryCode: "1X" }, { countryCode: "ß" }, { note: "x".repeat(501) }, { recipientName: "unsafe\u0000name" }]
      .map((patch) => ({ method: "shipping", address: { ...address, ...patch } }))]) {
    assert.equal((await submit({ ...shipping, delivery })).status, 422);
  }
  const shipped = await submit({ ...shipping, delivery: { ...shipping.delivery, carrier: "fake", shippingPrice: 999, trackingNumber: "fake", address: { ...address, secret: "private-field" } } });
  assert.equal(shipped.status, 201);
  assert.deepEqual((await submit({ ...shipping, delivery: { method: "shipping", address: { ...address, countryCode: "GB" } } })).payload, shipped.payload);
  assert.equal((await submit({ ...shipping, delivery: { method: "pickup" } })).status, 409);
  assert.equal((await submit({ ...shipping, delivery: { method: "shipping", address: { ...address, addressLine1: "Other road" } } })).status, 409);
  const shippingPulled = (await sync({ action: "pull_web_orders", client_id: "desktop-a3", after_seq: 0 })).orders.find((order) => order.id === shipped.payload.order_id);
  assert.deepEqual(shippingPulled.delivery, { method: "shipping", address: { ...address, countryCode: "GB" } });
  assert.deepEqual(shippingPulled.buyer, buyer);
  assert.equal(JSON.stringify(shippingPulled).includes("private-field"), false);
  await publish(true); // Accepted shipping replay survives a later method configuration change.
  assert.deepEqual((await submit(shipping)).payload, shipped.payload);
  clearGuard();
  for (let index = 0; index < 8; index += 1) assert.equal((await submit(input, { clear: false })).status, 201);
  const limited = await submit(input, { clear: false });
  assert.equal(limited.status, 429);
  assert.equal(limited.payload.code, "rate_limited");
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  const mailCount = storage("echo $db->query('SELECT COUNT(*) FROM commerce_mail_outbox')->fetchColumn();");
  assert.equal(mailCount, storage("echo $db->query('SELECT COUNT(*) FROM web_orders')->fetchColumn();"), "each accepted guest order has exactly one durable customer event despite replays");
  storage("$db->exec(\"CREATE TRIGGER reject_mail BEFORE INSERT ON commerce_mail_outbox BEGIN SELECT RAISE(ABORT, 'fixture_mail_failure'); END\");");
  const beforeFailure = storage("echo $db->query('SELECT COUNT(*) FROM web_orders')->fetchColumn();");
  assert.equal((await submit({ ...input, idempotencyKey: "atomic-mail-order-1" })).status, 503);
  assert.equal(storage("echo $db->query('SELECT COUNT(*) FROM web_orders')->fetchColumn();"), beforeFailure, "outbox failure cannot leave an accepted order without its durable event");
  storage("$db->exec('DROP TRIGGER reject_mail');");
  assert.equal((await submit({ ...input, idempotencyKey: "atomic-mail-order-1" })).status, 201);
  await publish(true, [{ ...publishedProduct, product_id: "usd-product", currency: "USD" }]);
  assert.equal((await submit({ ...input, idempotencyKey: "mixed-currency-order", items: [...input.items, { productId: "usd-product", quantity: 1 }] })).payload.code, "mixed_currency");
  publishedProduct.price = 0.1;
  await publish(true);
  assert.deepEqual((await submit(input)).payload, accepted.payload, "accepted money snapshot survives later catalog repricing");
  assert.equal((await submit({ ...input, idempotencyKey: "decimal-rounding-order", items: [{ productId: "published-product", quantity: 3 }] })).payload.quoted_total, 0.3);
  publishedProduct.currency = "JPY";
  await publish(true);
  assert.equal((await submit({ ...input, idempotencyKey: "unsupported-currency-order" })).payload.code, "unsupported_currency");
  publishedProduct.currency = "TRY";
  publishedProduct.price = 1e15;
  await publish(true);
  assert.equal((await submit({ ...input, idempotencyKey: "unsafe-price-order" })).payload.code, "invalid_price");
  const reset = await sync({ action: "reset_runtime" });
  assert.equal(reset.ok, true);
  assert.equal(storage("echo $db->query('SELECT COUNT(*) FROM web_order_submission_receipts')->fetchColumn();"), 0);
  assert.equal(storage("echo $db->query('SELECT COUNT(*) FROM web_orders')->fetchColumn();"), 0);
  assert.equal((await fetch(`${baseUrl}/api/catalog.php`)).status, 200, "read-only deployment health remains clean after reset");
  assert.equal((await submit(input)).status, 403);
  for (const privateValue of [buyer.name, buyer.phone, buyer.email, input.idempotencyKey, address.recipientName, address.addressLine1, address.note]) assert.equal(serverOutput.includes(privateValue), false);
  console.log("web-order-submission-smoke-ok");
} finally {
  server.kill();
  await new Promise((resolve) => server.once("exit", resolve));
  rmSync(root, { recursive: true, force: true });
}
