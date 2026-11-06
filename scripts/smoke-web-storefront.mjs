import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { installDemoSite } from './test-helpers/demo-site.mjs';
import { activateFixtureSource, publicationEnvelope } from './test-helpers/publication-protocol.mjs';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';

// Exercise the optional generic catalog.php + storefront.js renderer, not a site's
// gallery/search/refresh/quantity-button presentation. All writes stay in this copy.
const root = mkdtempSync(join(tmpdir(), 'ya-storefront-'));
const hosting = installDemoSite(root);
const secret = 'storefront-test-only-secret';
const config = join(hosting, 'config/business.json');
writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, 'utf8')), sync_secret: secret }));
const port = await new Promise((resolve, reject) => {
  const probe = http.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const port = probe.address().port;
    probe.close(() => resolve(port));
  });
});
const siteUrl = `http://127.0.0.1:${port}`;
const base = `${siteUrl}/yardimci-asistan`;
const catalogUrl = `${siteUrl}/deneme/?page=catalog`;
const catalogApi = `${base}/api/catalog.php`;
const orderApi = `${base}/api/order.php`;
const server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', root], {
  env: { ...process.env, PHP_CLI_SERVER_WORKERS: '4', YA_SITE_API_ORIGIN: siteUrl },
  stdio: 'ignore', detached: true
});
let browser, serverError, revision = 0;
server.on('error', error => { serverError = error; });
const errors = [], remoteImages = [];
const product = {
  product_id: 'p-one', name: 'Birinci ürün <em>özel</em>',
  description: '<script>window.injected=true</script> <img src="https://images.example.com/injected.png" onerror="window.injected=true"> Güvenli açıklama',
  unit: 'piece', price: 25.5, currency: 'TRY', tax_rate: 20,
  image_url: '', availability: 'available', sort_order: 0
};
const weighted = { ...product, product_id: 'p-weight', name: 'Tartılan ürün', unit: 'kg', price: 0.1, sort_order: 1 };
const buyer = { name: 'Guest Example', phone: '+1 (202) 555-0100', email: 'guest@example.test', note: 'Test order note' };
const address = {
  recipientName: 'Delivery Recipient', addressLine1: '42 Example Road', addressLine2: 'Floor 2',
  district: 'Central', city: 'London', postalCode: 'SW1A 1AA', countryCode: 'gb', note: 'Ring bell'
};
const cartKey = 'ya:storefront:/yardimci-asistan/:guest:cart:v2';
const attemptKey = 'ya:storefront:/yardimci-asistan/:guest:attempt:v2';
const csp = "script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";

function storage(code) {
  const result = spawnSync('php', ['-r', `require $argv[1]; $db=ya_storage_open(); ${code}`, join(hosting, 'lib/storage.php')], {
    encoding: 'utf8', timeout: 8000
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout ? JSON.parse(result.stdout) : null;
}
const orderCount = () => storage("echo $db->query('SELECT COUNT(*) FROM web_orders')->fetchColumn();");
const clearGuard = () => storage("if ($db->query(\"SELECT 1 FROM sqlite_master WHERE name='public_request_guard_events'\")->fetchColumn()) $db->exec('DELETE FROM public_request_guard_events');");
async function request(url, init = {}) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
}
async function publish(enabled = true, products = [product, weighted], methods = ['pickup']) {
  revision++;
  if (revision === 1) await activateFixtureSource(base, secret, 'a4-browser');
  const response = await request(`${base}/api/sync.php`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-YA-Sync-Secret': secret },
    body: JSON.stringify(publicationEnvelope({
      action: 'publish_online_catalog', client_id: 'a4-browser', source_revision: revision, idempotency_key: `publication-${revision}`,
      online_catalog: { version: 1, enabled, delivery_methods: enabled ? methods : [], updated_at: new Date().toISOString(), products: enabled ? products : [] }
    }))
  });
  assert.equal(response.status, 200, await response.text());
}
const shop = page => page.locator('[data-commerce]');
const ui = (page, name) => shop(page).locator(`[data-commerce-${name}]`);
const cards = page => ui(page, 'products').locator('article');
const card = (page, name = product.name) => cards(page).filter({ has: page.getByRole('heading', { name, exact: true }) });
const add = (page, name = product.name) => card(page, name).getByRole('button', { name: 'Sepete ekle', exact: true });
const quantityInput = (page, name = product.name) => ui(page, 'lines').getByRole('textbox', { name: `${name}: miktar`, exact: false });
const line = (page, name = product.name) => ui(page, 'lines').locator('li').filter({ has: page.getByRole('textbox', { name: `${name}: miktar`, exact: false }) });
const field = (page, key) => shop(page).locator(`#commerce-${key}`);
const fieldError = (page, key) => shop(page).locator(`[data-commerce-error="${key}"]`);
async function setQuantity(page, name, value) {
  await quantityInput(page, name).fill(value);
  await quantityInput(page, name).dispatchEvent('change');
}
async function fillBuyer(page, values = buyer) {
  for (const [key, value] of Object.entries(values)) await field(page, key).fill(value);
}
async function fillAddress(page) {
  for (const [key, value] of Object.entries(address)) await field(page, `delivery-${key}`).fill(value);
}
async function contact(page) {
  await ui(page, 'checkout').click();
  await expect(ui(page, 'form')).toBeVisible();
  await expect(field(page, 'name')).toBeFocused();
  assert.equal(await ui(page, 'form').evaluate(form => Boolean(form.closest('dialog,[role="dialog"]'))), false);
  await fillBuyer(page);
}
async function load(page, reload = false) {
  const [response, document] = await Promise.all([
    page.waitForResponse(response => response.url() === catalogApi),
    reload ? page.reload({ waitUntil: 'domcontentloaded' }) : page.goto(catalogUrl, { waitUntil: 'domcontentloaded' })
  ]);
  assert.equal(document.status(), 200);
  await expect(ui(page, 'products')).toHaveAttribute('aria-busy', 'false');
  return { document, response };
}
async function ready(page, reload = false, name = product.name) {
  const result = await load(page, reload);
  assert.equal(result.response.status(), 200);
  await expect(add(page, name)).toBeEnabled();
  return result;
}
async function freshPage(viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  context.setDefaultTimeout(6000);
  context.setDefaultNavigationTimeout(10000);
  // No test makes an Internet request. Record attempted remote images even if
  // they would be aborted, so escaping/URL regressions cannot silently pass.
  await context.route('**/*', async route => {
    if (new URL(route.request().url()).origin !== siteUrl) {
      if (route.request().resourceType() === 'image') remoteImages.push(route.request().url());
      await route.abort();
    } else await route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => {
    if (dialog.type() === 'beforeunload') await dialog.accept();
    else { errors.push(`Unexpected ${dialog.type()} dialog`); await dialog.dismiss(); }
  });
  await page.addInitScript(() => {
    window.storefrontCspViolations = [];
    window.addEventListener('securitypolicyviolation', event => window.storefrontCspViolations.push(event.effectiveDirective));
  });
  // PHP's development server supplies no deployment CSP. Enforce a fixture
  // response policy to test compatibility; this is not a shipped-header claim.
  await page.route(`${siteUrl}/deneme/**`, async route => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch({ timeout: 8000 });
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
  });
  return page;
}
async function noOverflow(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label}: horizontal overflow`);
}
async function privateStorage(page) {
  const saved = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  for (const value of [...Object.values(buyer), ...Object.values(address).filter(value => value !== 'gb'), 'Mobile Guest', '+49 151 23456789']) {
    assert.equal(JSON.stringify(saved).includes(value), false, 'Guest contact/address must remain in memory');
  }
  if (saved.local[cartKey]) {
    const draft = JSON.parse(saved.local[cartKey]);
    assert.deepEqual(Object.keys(draft).sort(), ['items', 'version']);
    assert.equal(draft.version, 2);
    for (const item of draft.items) assert.deepEqual(Object.keys(item).sort(), ['productId', 'quantity']);
  }
  return saved;
}
async function pendingMetadata(page, payload) {
  const saved = await privateStorage(page);
  assert.ok(saved.session[attemptKey], 'An uncertain submission needs a durable retry marker');
  const marker = JSON.parse(saved.session[attemptKey]);
  assert.deepEqual(Object.keys(marker).sort(), ['catalogRevision', 'endpoint', 'fingerprint', 'items', 'key', 'method', 'version']);
  assert.equal(marker.version, 2);
  assert.equal(marker.key, payload.idempotencyKey);
  assert.match(marker.key, /^[A-Za-z0-9_-]{16,128}$/);
  assert.match(marker.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(marker.endpoint, 'order.php');
  assert.equal(marker.method, payload.delivery.method);
  assert.deepEqual(marker.items, payload.items);
  return marker;
}
async function accepted(page, count, receipt) {
  await expect(ui(page, 'success')).toBeVisible();
  await expect(ui(page, 'success')).toBeFocused();
  await expect(ui(page, 'form')).toBeHidden();
  await expect(ui(page, 'reference')).toHaveText(receipt.order_id);
  assert.match(receipt.order_id, /^web_order_[a-f0-9]{32}$/);
  await expect(ui(page, 'lines')).toHaveText('Sepetiniz henüz boş.');
  await expect(ui(page, 'checkout')).toBeDisabled();
  assert.equal(orderCount(), count);
  const saved = await privateStorage(page);
  assert.equal(saved.local[cartKey], undefined);
  assert.equal(saved.session[attemptKey], undefined);
}
async function newOrder(page) {
  await ui(page, 'new').click();
  await expect(ui(page, 'success')).toBeHidden();
  await expect(add(page)).toBeEnabled();
  await add(page).click();
  await contact(page);
}

try {
  for (let attempt = 0; ; attempt++) {
    if (serverError) throw serverError;
    try { if ((await request(catalogApi)).ok) break; } catch { /* PHP startup */ }
    if (attempt >= 80) throw new Error('PHP startup failed');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const unpublished = await (await request(catalogApi)).json();
  assert.equal(unpublished.enabled, false);
  assert.deepEqual(unpublished.products, []);
  assert.deepEqual(unpublished.delivery_methods, []);
  assert.equal((await request(orderApi)).status, 405);
  const missing = await request(catalogUrl);
  assert.equal(missing.status, 404);
  assert.ok((await missing.text()).includes('Bu sayfa şu anda kullanılamıyor.'));

  browser = await launchChromiumForSmoke(chromium);
  await publish();
  const page = await freshPage();
  const firstLoad = await ready(page);
  assert.equal(firstLoad.document.headers()['content-security-policy'], csp);
  await expect(shop(page)).toHaveCount(1);
  await expect(cards(page)).toHaveCount(2);
  await expect(ui(page, 'products').getByRole('button')).toHaveText(['Sepete ekle', 'Sepete ekle']);
  await expect(card(page).getByRole('heading')).toHaveText(product.name);
  await expect(card(page).locator('p').first()).toHaveText(product.description);
  await expect(ui(page, 'products').locator('h2 > *, p > *, script, img, iframe')).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  const ssr = await (await request(catalogUrl)).text();
  assert.ok(ssr.includes('Birinci ürün &lt;em&gt;özel&lt;/em&gt;'), 'SSR must escape product names too');
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'window.storefrontCspProbe = true'; document.head.append(script);
  });
  await expect.poll(() => page.evaluate(() => window.storefrontCspViolations)).toContain('script-src-elem');
  assert.equal(await page.evaluate(() => window.storefrontCspProbe), undefined);
  await expect(ui(page, 'checkout')).toBeDisabled();
  await ui(page, 'checkout').dispatchEvent('click');
  await expect(ui(page, 'form')).toBeHidden();

  // Reloads re-read the publication and prices; there is no generic refresh button.
  await publish(false);
  assert.equal((await page.reload()).status(), 404);
  await expect(page.locator('main')).toContainText('Bu sayfa şu anda kullanılamıyor.');
  const disabled = await (await request(catalogApi)).json();
  assert.equal(disabled.enabled, false); assert.deepEqual(disabled.products, []);
  await publish(true, [product, weighted], []);
  await load(page, true);
  await expect(cards(page)).toHaveCount(2);
  await expect(ui(page, 'status')).toContainText('online sipariş almıyor');
  await expect(add(page)).toBeDisabled();
  await add(page).dispatchEvent('click');
  await expect(ui(page, 'lines').locator('input[data-commerce-quantity]')).toHaveCount(0);
  await expect(ui(page, 'checkout')).toBeDisabled();
  await publish(); await ready(page, true);
  await expect(ui(page, 'status')).toHaveText('');

  // Hold only the async catalog GET: SSR starts with a published product, then
  // the real API returns an empty publication. A new empty page itself is gated.
  let releaseCatalog;
  const catalogGate = new Promise(resolve => { releaseCatalog = resolve; });
  await page.route(catalogApi, async route => { await catalogGate; await route.continue(); }, { times: 1 });
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(ui(page, 'products')).toHaveAttribute('aria-busy', 'true');
    await expect(ui(page, 'status')).toHaveText('Ürünler yükleniyor…');
    await publish(true, []);
  } finally { releaseCatalog(); }
  await expect(ui(page, 'products')).toHaveAttribute('aria-busy', 'false');
  await expect(ui(page, 'status')).toHaveText('Şu anda satışta ürün bulunmuyor.');
  await expect(cards(page)).toHaveCount(0);
  await expect(ui(page, 'checkout')).toBeDisabled();
  assert.deepEqual((await (await request(catalogApi)).json()).products, []);
  await publish();
  await page.route(catalogApi, route => route.fulfill({ status: 503, contentType: 'text/html', body: 'unavailable' }), { times: 1 });
  const unavailable = await load(page, true);
  assert.equal(unavailable.response.status(), 503);
  await expect(ui(page, 'status')).toContainText('Ürünler şu anda yüklenemiyor');
  await expect(cards(page)).toHaveCount(0);
  await expect(ui(page, 'checkout')).toBeDisabled();
  await ready(page, true);

  await add(page).click(); await add(page).click();
  await expect(ui(page, 'cart-message')).toHaveText(`${product.name} sepetinizde.`);
  await expect(quantityInput(page)).toHaveAttribute('data-commerce-quantity', product.product_id);
  await expect(quantityInput(page)).toHaveValue('2');
  await expect(ui(page, 'totals')).toContainText('51,00');
  await setQuantity(page, product.name, '1.5');
  await expect(quantityInput(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(ui(page, 'totals')).toContainText('51,00');
  assert.deepEqual(JSON.parse((await privateStorage(page)).local[cartKey]).items, [{ productId: product.product_id, quantity: 2 }]);
  // The generic form guards invalid quantity DOM even though the controller
  // still holds the last valid amount. Do not assume custom checkout styling.
  await contact(page);
  const blockedPosts = [];
  await page.route(orderApi, route => { blockedPosts.push(route.request().postDataJSON()); return route.abort(); });
  await ui(page, 'submit').click();
  assert.equal(blockedPosts.length, 0);
  assert.equal((await privateStorage(page)).session[attemptKey], undefined);
  await page.unroute(orderApi);
  await setQuantity(page, product.name, '3');
  await expect(ui(page, 'totals')).toContainText('76,50');
  await ready(page, true);
  await expect(quantityInput(page)).toHaveValue('3');
  for (const key of Object.keys(buyer)) await expect(field(page, key)).toHaveValue('');
  await add(page, weighted.name).click(); await setQuantity(page, weighted.name, '0,125');
  await expect(quantityInput(page, weighted.name)).toHaveValue('0.125');
  await expect(ui(page, 'totals')).toContainText('76,51');
  for (const value of ['0', '1001', '0.00001']) {
    await setQuantity(page, weighted.name, value);
    await expect(quantityInput(page, weighted.name)).toHaveAttribute('aria-invalid', 'true');
    await expect(ui(page, 'totals')).toContainText('76,51');
  }
  await setQuantity(page, weighted.name, '0.125');
  const cached = await request(catalogApi), oldTag = cached.headers.get('etag');
  assert.ok(oldTag); await cached.arrayBuffer();
  assert.equal((await request(catalogApi, { headers: { 'If-None-Match': oldTag } })).status, 304);
  await publish(true, [{ ...product, price: 26.5 }, weighted]);
  const changed = await request(catalogApi, { headers: { 'If-None-Match': oldTag } });
  assert.equal(changed.status, 200); assert.notEqual(changed.headers.get('etag'), oldTag);
  assert.equal((await changed.json()).products[0].price, 26.5);
  await ready(page, true);
  await expect(quantityInput(page)).toHaveValue('3');
  await expect(quantityInput(page, weighted.name)).toHaveValue('0.125');
  await expect(ui(page, 'totals')).toContainText('79,51');
  await line(page, weighted.name).getByRole('button', { name: 'Kaldır', exact: true }).click();
  await expect(quantityInput(page, weighted.name)).toHaveCount(0);
  await line(page).getByRole('button', { name: 'Kaldır', exact: true }).click();
  await expect(ui(page, 'lines')).toHaveText('Sepetiniz henüz boş.');
  await expect(ui(page, 'totals')).toBeEmpty();
  await expect(ui(page, 'checkout')).toBeDisabled();

  await publish(); await ready(page, true); await add(page).click();
  await ui(page, 'checkout').click();
  await expect(field(page, 'name')).toBeFocused();
  await expect(ui(page, 'address')).toBeHidden();
  assert.deepEqual(await ui(page, 'method').evaluate(select => [...select.options].filter(option => !option.hidden).map(option => option.value)), ['pickup']);
  await ui(page, 'submit').click();
  for (const [key, text] of [['name', 'Adınızı yazın'], ['phone', '7–15']]) {
    await expect(fieldError(page, key)).toHaveAttribute('id', `commerce-${key}-error`);
    await expect(fieldError(page, key)).toContainText(text);
    await expect(field(page, key)).toHaveAttribute('aria-invalid', 'true');
  }
  await expect(field(page, 'name')).toBeFocused();
  await fillBuyer(page, { ...buyer, email: 'invalid' }); await ui(page, 'submit').click();
  await expect(fieldError(page, 'email')).toContainText('Geçerli');
  await expect(field(page, 'email')).toBeFocused();
  assert.equal(orderCount(), 0);
  await fillBuyer(page); await privateStorage(page);

  const requests = [], rawRequests = [], receipts = [];
  let mode = 'accept', releaseOrder;
  await page.route(orderApi, async route => {
    requests.push(route.request().postDataJSON());
    rawRequests.push(route.request().postData());
    if (mode === 'hold') await new Promise(resolve => { releaseOrder = resolve; });
    const response = await route.fetch({ timeout: 8000 });
    receipts.push({ status: response.status(), body: await response.json() });
    if (mode === 'lose') await route.abort('failed');
    else await route.fulfill({ response });
  });
  clearGuard(); await ui(page, 'submit').click();
  await expect(ui(page, 'success')).toBeVisible();
  assert.equal(receipts[0].status, 201); assert.equal(receipts[0].body.ok, true);
  assert.deepEqual(Object.keys(requests[0]).sort(), ['buyer', 'delivery', 'idempotencyKey', 'items', 'note']);
  assert.deepEqual(requests[0].buyer, { name: buyer.name, phone: buyer.phone, email: buyer.email });
  assert.deepEqual(requests[0].delivery, { method: 'pickup' });
  assert.deepEqual(requests[0].items, [{ productId: product.product_id, quantity: 1 }]);
  await accepted(page, 1, receipts[0].body);

  // The second actual POST is accepted by PHP, then its response is lost.
  // Retry must send byte-for-byte equivalent JSON/key and replay the receipt.
  await newOrder(page); mode = 'lose';
  await ui(page, 'submit').click();
  await expect(ui(page, 'message')).toContainText('sonucu doğrulanamadı');
  assert.equal(receipts[1].status, 201); assert.equal(orderCount(), 2);
  await expect(quantityInput(page)).toHaveValue('1');
  await expect(field(page, 'phone')).toHaveValue(buyer.phone);
  await expect(field(page, 'name')).toBeDisabled();
  await expect(add(page)).toBeDisabled();
  await expect(quantityInput(page)).toBeDisabled();
  await pendingMetadata(page, requests[1]);
  mode = 'accept'; await ui(page, 'submit').click();
  await expect(ui(page, 'success')).toBeVisible();
  assert.deepEqual(requests[2], requests[1]); assert.deepEqual(receipts[2], receipts[1]);
  assert.equal(rawRequests[2], rawRequests[1]);
  assert.notEqual(requests[1].idempotencyKey, requests[0].idempotencyKey);
  await accepted(page, 2, receipts[2].body);

  await newOrder(page); mode = 'hold';
  try {
    await ui(page, 'submit').click();
    await expect(ui(page, 'submit')).toHaveText('Gönderiliyor…');
    await expect.poll(() => Boolean(releaseOrder)).toBe(true);
    await expect(ui(page, 'submit')).toBeDisabled();
    await expect(field(page, 'name')).toBeDisabled();
    await ui(page, 'form').dispatchEvent('submit');
    assert.equal(requests.length, 4, 'Double submit must not create another HTTP request');
  } finally { releaseOrder?.(); }
  await expect(ui(page, 'success')).toBeVisible();
  assert.equal(receipts[3].status, 201);
  assert.notEqual(requests[3].idempotencyKey, requests[1].idempotencyKey);
  await accepted(page, 3, receipts[3].body);
  await page.context().close();

  // Publication rejections, conflict and storage failure come from real PHP.
  // Only 429 is injected, to exercise Retry-After without its real 120s wait.
  for (const [status, code, text] of [
    [403, 'online_sales_disabled', 'durdurdu'], [422, 'product_not_published', 'artık satışta değil'],
    [409, 'idempotency_conflict', 'eşleşmiyor'], [429, 'rate_limited', '2 saniye sonra'],
    [503, 'order_unavailable', 'sonucu doğrulanamadı']
  ]) {
    await publish(); clearGuard();
    const target = await freshPage({ width: 375, height: 812 });
    await ready(target); await add(target).click(); await contact(target);
    const before = orderCount(), attempts = [], responses = [];
    if (status === 403) await publish(false);
    if (status === 422) await publish(true, [weighted]);
    if (status === 503) storage("$db->exec(\"CREATE TRIGGER smoke_order_failure BEFORE INSERT ON web_orders BEGIN SELECT RAISE(FAIL, 'fixture-storage-failure'); END\");");
    await target.route(orderApi, async route => {
      const payload = route.request().postDataJSON(); attempts.push(payload);
      if (status === 429 && attempts.length === 1) {
        responses.push({ status, body: { ok: false, code } });
        return route.fulfill({ status, headers: { 'Retry-After': '2' }, json: { ok: false, code, retry_after_seconds: 99 } });
      }
      if (status === 409 && attempts.length === 1) {
        // Seed a different accepted intent under this key, then forward the
        // original request. PHP must detect the conflict without a second row.
        const seeded = await route.fetch({ postData: JSON.stringify({ ...payload, note: 'Different accepted intent' }), timeout: 8000 });
        assert.equal(seeded.status(), 201);
      }
      const response = await route.fetch({ timeout: 8000 });
      responses.push({ status: response.status(), body: await response.json() });
      await route.fulfill({ response });
    });
    await ui(target, 'submit').click();
    await expect(ui(target, 'message')).toContainText(text);
    assert.equal(responses[0].status, status); assert.equal(responses[0].body.code, code);
    await expect(ui(target, 'success')).toBeHidden();
    await expect(field(target, 'phone')).toHaveValue(buyer.phone);
    await expect(quantityInput(target)).toHaveValue('1');
    assert.equal(orderCount(), before + (status === 409 ? 1 : 0));
    if ([403, 422].includes(status)) {
      assert.equal((await privateStorage(target)).session[attemptKey], undefined);
      await expect(field(target, 'name')).toBeEnabled();
      await expect(ui(target, 'submit')).toBeDisabled();
      if (status === 403) {
        await expect(ui(target, 'status')).toContainText('online sipariş almıyor');
        await expect(cards(target)).toHaveCount(0);
      } else {
        await expect(cards(target)).toHaveCount(1);
        await expect(add(target, weighted.name)).toBeEnabled();
        await expect(add(target)).toHaveCount(0);
        await line(target).getByRole('button', { name: 'Kaldır', exact: true }).click();
        await expect(quantityInput(target)).toHaveCount(0);
      }
    } else {
      await pendingMetadata(target, attempts[0]);
      await expect(add(target)).toBeDisabled();
      await expect(quantityInput(target)).toBeDisabled();
      if (status === 409) {
        await expect(field(target, 'name')).toBeEnabled();
        await ui(target, 'submit').click();
        await expect.poll(() => responses.length).toBe(2);
        assert.equal(responses[1].status, 409); assert.deepEqual(attempts[1], attempts[0]);
        await expect(ui(target, 'submit')).toBeEnabled();
        await field(target, 'note').fill('Changed intent'); await ui(target, 'submit').click();
        await expect(ui(target, 'message')).toContainText('eşleşmiyor');
        await expect(ui(target, 'submit')).toBeEnabled();
        assert.equal(attempts.length, 2, 'A changed retry must be blocked before HTTP');
        assert.equal(orderCount(), before + 1);
      } else {
        await expect(field(target, 'name')).toBeDisabled();
        if (status === 429) {
          await expect(ui(target, 'submit')).toBeDisabled();
          await ui(target, 'form').dispatchEvent('submit'); assert.equal(attempts.length, 1);
          await expect(ui(target, 'submit')).toBeEnabled({ timeout: 4000 });
        } else {
          assert.equal(JSON.stringify(responses[0].body).includes('fixture-storage-failure'), false);
          storage("$db->exec('DROP TRIGGER smoke_order_failure');");
        }
        await ui(target, 'submit').click();
        await expect(ui(target, 'success')).toBeVisible();
        assert.deepEqual(attempts[1], attempts[0]); assert.equal(responses[1].status, 201);
        await accepted(target, before + 1, responses[1].body);
      }
    }
    await noOverflow(target, `error ${status} at 375px`);
    await target.context().close();
  }

  // The select keeps its generic layout even with one eligible method; only
  // published options are offered. Shipping contact is independent of buyer.
  for (const [methods, width] of [[['shipping'], 375], [['pickup', 'shipping'], 320]]) {
    await publish(true, [product], methods); clearGuard();
    const target = await freshPage({ width, height: 812 });
    await ready(target); await add(target).click(); await contact(target);
    await expect(ui(target, 'method')).toBeVisible();
    assert.deepEqual(await ui(target, 'method').evaluate(select => [...select.options].filter(option => !option.hidden).map(option => option.value)), methods);
    if (methods.length === 2) {
      await expect(ui(target, 'address')).toBeHidden();
      await ui(target, 'method').selectOption('shipping'); await expect(ui(target, 'address')).toBeVisible();
      await ui(target, 'method').selectOption('pickup'); await expect(ui(target, 'address')).toBeHidden();
      await ui(target, 'method').selectOption('shipping');
    }
    await expect(ui(target, 'address')).toBeVisible();
    const attempts = [], responses = [], before = orderCount();
    await target.route(orderApi, async route => {
      attempts.push(route.request().postDataJSON());
      const response = await route.fetch({ timeout: 8000 });
      responses.push({ status: response.status(), body: await response.json() });
      if (methods.length === 2 && attempts.length === 1) await route.abort('failed');
      else await route.fulfill({ response });
    });
    await ui(target, 'submit').click();
    await expect(field(target, 'delivery-recipientName')).toBeFocused();
    for (const key of ['recipientName', 'addressLine1', 'district', 'city']) {
      await expect(fieldError(target, `delivery-${key}`)).not.toBeEmpty();
    }
    assert.equal(attempts.length, 0);
    await fillAddress(target); await field(target, 'delivery-countryCode').fill('GBR');
    await ui(target, 'submit').click();
    await expect(fieldError(target, 'delivery-countryCode')).toContainText('İki harfli');
    await expect(field(target, 'delivery-countryCode')).toBeFocused();
    assert.equal(attempts.length, 0);
    await fillAddress(target); await noOverflow(target, `shipping form at ${width}px`);
    await privateStorage(target); await ui(target, 'submit').click();
    if (methods.length === 2) {
      await expect(ui(target, 'message')).toContainText('sonucu doğrulanamadı');
      assert.equal(responses[0].status, 201); assert.equal(orderCount(), before + 1);
      await expect(field(target, 'delivery-recipientName')).toBeDisabled();
      const marker = await pendingMetadata(target, attempts[0]);
      // Acceptance replay precedes the current eligibility gate. Reload must
      // preserve the old method/key while erasing all guest contact/address.
      await publish(true, [product], ['pickup']);
      await load(target, true);
      await expect(ui(target, 'form')).toBeVisible();
      await expect(ui(target, 'address')).toBeVisible();
      await expect(ui(target, 'method')).toHaveValue('shipping');
      await expect(ui(target, 'method')).toBeDisabled();
      await expect(field(target, 'name')).toBeEnabled();
      for (const key of Object.keys(buyer)) await expect(field(target, key)).toHaveValue('');
      for (const key of Object.keys(address).filter(key => key !== 'countryCode')) await expect(field(target, `delivery-${key}`)).toHaveValue('');
      assert.deepEqual(await pendingMetadata(target, attempts[0]), marker);
      await fillBuyer(target); await fillAddress(target);
      await field(target, 'delivery-addressLine1').fill('Changed road');
      await ui(target, 'submit').click();
      await expect(ui(target, 'message')).toContainText('eşleşmiyor');
      assert.equal(attempts.length, 1);
      await fillAddress(target); await ui(target, 'submit').click();
      await expect(ui(target, 'success')).toBeVisible();
      assert.deepEqual(attempts[1], attempts[0]); assert.deepEqual(responses[1], responses[0]);
    }
    await expect(ui(target, 'success')).toBeVisible();
    assert.equal(responses[0].status, 201);
    assert.deepEqual(attempts[0].delivery, { method: 'shipping', address: { ...address, countryCode: 'GB' } });
    assert.deepEqual(Object.keys(attempts[0]).sort(), ['buyer', 'delivery', 'idempotencyKey', 'items', 'note']);
    await accepted(target, before + 1, responses[0].body);
    const queued = storage("echo $db->query('SELECT payload_json FROM web_orders ORDER BY seq DESC LIMIT 1')->fetchColumn();");
    assert.deepEqual(queued.delivery, attempts[0].delivery);
    assert.equal(queued.buyer.name, buyer.name); assert.equal(queued.delivery.address.recipientName, address.recipientName);
    await noOverflow(target, `shipping receipt at ${width}px`);
    await target.context().close();
  }

  // Definitive ordering/method withdrawal refreshes eligibility and preserves
  // editable in-memory contact; no obsolete delivery-summary widget is required.
  for (const methods of [[], ['pickup']]) {
    await publish(true, [product], ['shipping']); clearGuard();
    const target = await freshPage(); await ready(target); await add(target).click(); await contact(target); await fillAddress(target);
    await publish(true, [product], methods);
    const responsePromise = target.waitForResponse(response => response.url() === orderApi);
    const before = orderCount(); await ui(target, 'submit').click();
    const response = await responsePromise;
    assert.equal(response.status(), methods.length ? 422 : 403);
    assert.equal((await response.json()).code, methods.length ? 'delivery_method_unavailable' : 'online_ordering_disabled');
    await expect(ui(target, 'message')).toContainText(methods.length ? 'teslimat yöntemi artık sunulmuyor' : 'online sipariş almıyor');
    await expect(cards(target)).toHaveCount(1);
    await expect(field(target, 'name')).toHaveValue(buyer.name);
    await expect(field(target, 'delivery-recipientName')).toHaveValue(address.recipientName);
    await expect(field(target, 'name')).toBeEnabled();
    assert.equal((await privateStorage(target)).session[attemptKey], undefined);
    assert.equal(orderCount(), before);
    if (methods.length) {
      await expect(ui(target, 'method')).toHaveValue('pickup');
      await expect(ui(target, 'address')).toBeHidden();
      await expect(ui(target, 'submit')).toBeEnabled();
    } else {
      await expect(add(target)).toBeDisabled();
      await expect(ui(target, 'checkout')).toBeDisabled();
      await expect(ui(target, 'submit')).toBeDisabled();
    }
    await target.context().close();
  }

  // Long text/unsafe URLs, keyboard checkout and storage failure at 320px.
  const long = { ...product, name: 'UzunÜrünAdı'.repeat(18).slice(0, 180), description: 'Uzun açıklama '.repeat(90), image_url: 'javascript:window.injected=true' };
  await publish(true, [long]); clearGuard();
  const projected = (await (await request(catalogApi)).json()).products[0];
  assert.equal(projected.image_url, ''); assert.deepEqual(projected.image_urls, []);
  const mobile = await freshPage({ width: 320, height: 780 });
  await mobile.addInitScript(() => {
    window.fixtureStorageSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('storage disabled'); };
  });
  await ready(mobile, false, long.name);
  await expect(card(mobile, long.name).locator('img')).toHaveCount(0);
  assert.equal(await mobile.evaluate(() => window.injected), undefined);
  await add(mobile, long.name).focus(); await mobile.keyboard.press('Enter');
  await ui(mobile, 'checkout').focus(); await mobile.keyboard.press('Enter');
  await expect(field(mobile, 'name')).toBeFocused();
  await mobile.keyboard.type('Mobile Guest'); await mobile.keyboard.press('Tab'); await mobile.keyboard.type('+49 151 23456789');
  await noOverflow(mobile, 'long product and keyboard checkout at 320px');
  const beforeBlocked = orderCount(), mobilePosts = [];
  mobile.on('request', req => { if (req.url() === orderApi && req.method() === 'POST') mobilePosts.push(req.postDataJSON()); });
  await ui(mobile, 'submit').click();
  await expect(ui(mobile, 'message')).toContainText('Tekrar deneme bilgileri saklanamadı');
  await expect(ui(mobile, 'success')).toBeHidden();
  await expect(field(mobile, 'phone')).toHaveValue('+49 151 23456789');
  assert.equal(orderCount(), beforeBlocked); assert.equal(mobilePosts.length, 0);
  await mobile.evaluate(() => { Storage.prototype.setItem = window.fixtureStorageSetItem; });
  const finalResponse = mobile.waitForResponse(response => response.url() === orderApi);
  await ui(mobile, 'submit').click();
  const response = await finalResponse; assert.equal(response.status(), 201);
  await accepted(mobile, beforeBlocked + 1, await response.json());
  await noOverflow(mobile, 'mobile receipt at 320px');
  await mobile.context().close();
  assert.deepEqual(remoteImages, [], 'Unconfigured/unsafe product images must not trigger remote image requests');
  assert.deepEqual(errors, []);
  console.log('web-storefront-smoke-ok: generic DOM/publication/cart/validation/real PHP orders/idempotency/retry/privacy/CSP/375px/320px');
} finally {
  try { if (browser) await browser.close(); }
  finally {
    const stopped = server.exitCode !== null || server.signalCode !== null || !server.pid
      ? Promise.resolve() : new Promise(resolve => server.once('exit', resolve));
    try { if (server.pid) process.kill(-server.pid, 'SIGTERM'); } catch { /* Already stopped. */ }
    await stopped;
    rmSync(root, { recursive: true, force: true });
  }
}
