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
const hosting = installDemoSite(root, { httpApi: true });
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
const quoteApi = `${base}/api/checkout-quote.php`;
const paymentApi = `${base}/api/order-payment.php`;
const orderApi = `${base}/api/order.php`;
const server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', root], {
  env: { ...process.env, PHP_CLI_SERVER_WORKERS: '4', YA_SITE_API_ORIGIN: siteUrl, YA_ACCOUNT_SITE_URL: `${siteUrl}/deneme/hesabim/` },
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
  district: 'Central', city: 'London', postalCode: 'SW1A 1AA', countryCode: 'gb'
};
const cartKey = 'ya:storefront:/yardimci-asistan/:guest:cart:v2';
const attemptKey = 'ya:storefront:/yardimci-asistan/:guest:attempt:v2';
const checkoutKey = 'ya:checkout:/yardimci-asistan/:guest:v2';
const checkout = {
  version: 1, enabled: true, demo: true, currency: 'TRY', shippingFeeMinor: 1499,
  bank: { name: 'DEMO Bank <img onerror=window.injected=true>', accountHolder: 'DEMO Store', iban: 'DEMO — INVALID — DO NOT PAY' },
  legal: { version: 'fixture-v2', preliminary: 'DEMO <script>window.injected=true</script>', agreement: 'DEMO agreement — not for commerce.' }
};
const csp = "script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";

function storage(code, args = []) {
  const result = spawnSync('php', ['-r', `require $argv[1]; $db=ya_storage_open(); ${code}`, join(hosting, 'lib/storage.php'), ...args], {
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
async function publish(enabled = true, products = [product, weighted], methods = ['pickup'], terms = checkout) {
  revision++;
  if (revision === 1) await activateFixtureSource(base, secret, 'a4-browser');
  const response = await request(`${base}/api/sync.php`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-YA-Sync-Secret': secret },
    body: JSON.stringify(publicationEnvelope({
      action: 'publish_online_catalog', client_id: 'a4-browser', source_revision: revision, idempotency_key: `publication-${revision}`,
      online_catalog: { version: 1, enabled, checkout: terms, delivery_methods: enabled ? methods : [], updated_at: new Date().toISOString(), products: enabled ? products : [] }
    }))
  });
  assert.equal(response.status, 200, await response.text());
}
async function publishAccounts(dealers = [], catalogs = []) {
  const response = await request(`${base}/api/sync.php`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-YA-Sync-Secret': secret },
    body: JSON.stringify(publicationEnvelope({ action: 'publish_dealer_access', client_id: 'a4-browser',
      dealer_access: { version: 3, online_sales_enabled: true, enabled: true, dealers, catalogs } }))
  });
  assert.equal(response.status, 200, await response.text());
}
const shop = page => page.locator('[data-commerce]');
const ui = (page, name) => shop(page).locator(`[data-commerce-${name}]`);
const cards = page => ui(page, 'products').locator('article');
const card = (page, name = product.name) => cards(page).filter({ has: page.getByRole('heading', { name, exact: true }) });
const add = (page, name = product.name) => card(page, name).getByRole('button', { name: 'Sepete ekle', exact: true });
const cart = page => page.locator(new URL(page.url()).searchParams.get('page') === 'cart' ? '#shopping-cart' : '#mini-cart');
const quantityInput = (page, name = product.name) => cart(page).getByRole('spinbutton', { name: `${name}: miktar`, exact: true });
const line = (page, name = product.name) => cart(page).locator('article').filter({ has: page.getByRole('spinbutton', { name: `${name}: miktar`, exact: true }) });
const flow = page => page.locator('#checkout-flow');
const body = page => page.locator('#checkout-body');
const form = page => body(page).locator('form');
const field = (page, name) => form(page).locator(`[name="${name}"]`);
const submit = page => form(page).locator('button[type=submit]');
const message = page => page.locator('#checkout-message');
async function setQuantity(page, name, value) {
  await quantityInput(page, name).fill(value);
  await quantityInput(page, name).dispatchEvent('change');
}
async function fillBuyer(page, values = buyer) {
  for (const [key, value] of Object.entries(values)) await field(page, key).fill(value);
}
async function fillAddress(page) {
  for (const [key, value] of Object.entries(address)) await field(page, `address.${key}`).fill(value);
}
async function atStep(page, step) {
  await expect(page).toHaveURL(new RegExp(`page=checkout-${step}(?:&|$)`));
  await expect(flow(page)).toHaveAttribute('data-step', step);
  await expect(flow(page).locator('[aria-current=step]')).toHaveCount(1);
  if (['customer', 'delivery', 'payment'].includes(step)) await expect(form(page)).toBeVisible();
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
  assert.equal(new URL(page.url()).origin, siteUrl);
}
async function next(page, step) {
  await submit(page).click(); await atStep(page, step);
}
async function openCart(page) {
  const previous = page.url();
  await page.locator('.header-cart-link').click();
  await expect(page.locator('#mini-cart')).toBeVisible();
  assert.equal(page.url(), previous, 'Mini cart must preserve the catalog route');
  await cart(page).getByRole('link', { name: 'Sepete git', exact: true }).click();
  await expect(page).toHaveURL(/page=cart(?:&|$)/);
  await expect(cart(page)).toBeVisible();
}
async function contact(page, values = buyer) {
  await openCart(page);
  await expect(cart(page).locator('[data-checkout-link]')).toHaveAttribute('aria-disabled','false');
  await cart(page).locator('[data-checkout-link]').click(); await atStep(page, 'customer');
  await expect(form(page)).toBeVisible();
  assert.equal(await form(page).evaluate(node => Boolean(node.closest('dialog,[role="dialog"]'))), false);
  await fillBuyer(page, values);
}
async function review(page, method = 'pickup') {
  await next(page, 'delivery');
  await field(page, 'deliveryMethod').selectOption(method);
  if (method === 'shipping') await fillAddress(page);
  await next(page, 'payment');
  await expect(form(page).getByLabel('Kredi kartı — Yakında')).toBeDisabled();
  await next(page, 'review');
  await expect(submit(page)).toBeVisible();
  await field(page, 'preliminary').check(); await field(page, 'agreement').check();
  await expect(field(page, 'marketing')).not.toBeChecked();
}
async function prepare(page, method = 'pickup', name = product.name) {
  await ready(page, false, name); await add(page, name).click(); await contact(page); await review(page, method);
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
  // V2 keeps contact/address in a per-tab, owner-scoped checkout draft between
  // documents. Persistent cart and uncertain-attempt metadata remain ID-only.
  for (const value of [...Object.values(buyer), ...Object.values(address).filter(value => value !== 'gb'), 'Mobile Guest', '+49 151 23456789']) {
    assert.equal(JSON.stringify(saved.local).includes(value), false, 'Contact/address must not enter persistent storage');
    assert.equal((saved.session[attemptKey] || '').includes(value), false, 'Retry metadata must not contain contact/address');
    assert.equal(page.url().includes(encodeURIComponent(value)), false, 'Contact/address must not enter navigation URLs');
  }
  for (const [key, value] of Object.entries(saved.local).filter(([key]) => key.endsWith(':cart:v2'))) {
    assert.ok(key.startsWith('ya:storefront:/yardimci-asistan/:'));
    const draft = JSON.parse(value);
    assert.deepEqual(Object.keys(draft).sort(), ['items', 'version']); assert.equal(draft.version, 2);
    for (const item of draft.items) assert.deepEqual(Object.keys(item).sort(), ['productId', 'quantity']);
  }
  return saved;
}
async function pendingMetadata(page, payload) {
  const saved = await privateStorage(page);
  assert.ok(saved.session[attemptKey], 'An uncertain submission needs a durable retry marker');
  const marker = JSON.parse(saved.session[attemptKey]);
  assert.deepEqual(Object.keys(marker).sort(), ['catalogRevision', 'endpoint', 'fingerprint', 'items', 'key', 'method', 'version']);
  assert.equal(marker.version, 2); assert.equal(marker.key, payload.idempotencyKey);
  assert.match(marker.key, /^[A-Za-z0-9_-]{16,128}$/); assert.match(marker.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(marker.endpoint, 'order.php'); assert.equal(marker.method, payload.delivery.method);
  assert.deepEqual(marker.items, payload.items);
  return marker;
}
async function accepted(page, count, receipt, owner = 'guest') {
  await atStep(page, 'result');
  await expect(body(page).locator('h2')).toHaveText(receipt.order_number);
  await expect(body(page)).toContainText('Ödeme bekleniyor. Sipariş oluşturulması ödeme onayı değildir.');
  await expect(body(page)).toContainText('DEMO — Banka bilgileri geçersizdir. Gerçek ödeme yapmayın.');
  await expect(body(page)).toContainText(checkout.bank.iban);
  await expect(body(page).locator('script,img,iframe,form')).toHaveCount(0);
  assert.match(receipt.order_id, /^web_(?:dealer_)?order_[a-f0-9]{32}$/);
  assert.match(receipt.order_number, /^YA-\d{8}-[A-F0-9]{10}$/);
  assert.equal(receipt.payment_status, 'unpaid'); assert.equal(receipt.checkout.version, 2);
  assert.equal(orderCount(), count);
  const saved = await privateStorage(page);
  const storageOwner = owner === 'guest' ? owner : `account:${owner}`;
  assert.equal(saved.local[`ya:storefront:/yardimci-asistan/:${encodeURIComponent(storageOwner)}:cart:v2`], undefined);
  assert.equal(saved.session[`ya:storefront:/yardimci-asistan/:${encodeURIComponent(storageOwner)}:attempt:v2`], undefined);
  assert.deepEqual(JSON.parse(saved.session[`ya:checkout:/yardimci-asistan/:${owner}:v2`]).draft, {});
  assert.equal(new URL(page.url()).searchParams.has('orderAccessToken'), false);
  if (receipt.order_access_token) {
    assert.match(receipt.order_access_token, /^[a-f0-9]{64}$/);
    assert.equal((await page.content()).includes(receipt.order_access_token), false, 'Guest token must not enter markup/links');
  }
  assert.equal(await page.evaluate(() => window.injected), undefined);
}
async function newOrder(page) {
  await body(page).getByRole('link', { name: 'Alışverişe devam et', exact: true }).click();
  await expect(add(page)).toBeEnabled(); await add(page).click(); await contact(page); await review(page);
}
function observeOrders(page, endpoint = orderApi) {
  const requests = [], raw = [], responses = [];
  let mode = 'accept', release;
  return { requests, raw, responses, setMode(value) { mode = value; }, release() { release?.(); },
    async install() {
      await page.route(endpoint, async route => {
        requests.push(route.request().postDataJSON()); raw.push(route.request().postData());
        if (mode === 'hold') await new Promise(resolve => { release = resolve; });
        const response = await route.fetch({ timeout: 8000 });
        responses.push({ status: response.status(), body: await response.json() });
        if (mode === 'lose') await route.abort('failed'); else await route.fulfill({ response });
      });
    }
  };
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
  await expect(ui(page, 'checkout')).toHaveCount(0);
  await expect(ui(page, 'form')).toHaveCount(0);
  await expect(page.locator('#mini-cart [data-checkout-link]')).toHaveAttribute('aria-disabled', 'true');
  await publishAccounts();

  // Publication gates and async failures must fail closed, including stale SSR.
  await publish(false); assert.equal((await page.reload()).status(), 404);
  await expect(page.locator('main')).toContainText('Bu sayfa şu anda kullanılamıyor.');
  const disabled = await (await request(catalogApi)).json();
  assert.equal(disabled.enabled, false); assert.deepEqual(disabled.products, []);
  await publish(true, [product, weighted], []); await load(page, true);
  await expect(cards(page)).toHaveCount(2); await expect(ui(page, 'status')).toContainText('online sipariş almıyor');
  await expect(add(page)).toBeDisabled(); await add(page).dispatchEvent('click');
  assert.equal((await privateStorage(page)).local[cartKey], undefined);
  await expect(page.locator('#mini-cart [data-checkout-link]')).toHaveAttribute('aria-disabled', 'true');
  await publish(); await ready(page, true);
  let releaseCatalog;
  const catalogGate = new Promise(resolve => { releaseCatalog = resolve; });
  await page.route(catalogApi, async route => { await catalogGate; await route.continue(); }, { times: 1 });
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(ui(page, 'products')).toHaveAttribute('aria-busy', 'true');
    await expect(ui(page, 'status')).toHaveText('Ürünler yükleniyor…'); await publish(true, []);
  } finally { releaseCatalog(); }
  await expect(ui(page, 'products')).toHaveAttribute('aria-busy', 'false');
  await expect(ui(page, 'status')).toHaveText('Şu anda satışta ürün bulunmuyor.');
  await expect(cards(page)).toHaveCount(0);
  await publish();
  await page.route(catalogApi, route => route.fulfill({ status: 503, contentType: 'text/html', body: 'unavailable' }), { times: 1 });
  assert.equal((await load(page, true)).response.status(), 503);
  await expect(ui(page, 'status')).toContainText('Ürünler şu anda yüklenemiyor');
  await expect(cards(page)).toHaveCount(0); await ready(page, true);
  console.log('PASS storefront: publication gates, SSR/XSS and enforced CSP');

  await add(page).click(); await add(page).click(); await openCart(page);
  await expect(quantityInput(page)).toHaveValue('2'); await expect(cart(page).locator('[data-cart-total]')).toContainText('51,00');
  await setQuantity(page, product.name, '1.5');
  assert.equal(await quantityInput(page).evaluate(node => node.checkValidity()), false);
  await expect(cart(page).locator('[data-cart-total]')).toContainText('51,00');
  assert.deepEqual(JSON.parse((await privateStorage(page)).local[cartKey]).items, [{ productId: product.product_id, quantity: 2 }]);
  // V2 discards an invalid DOM edit on navigation and quotes the last valid
  // ID/quantity draft. The server independently rejects fractional piece counts.
  const invalidQuote = await request(quoteApi, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-YA-Account': '1' },
    body: JSON.stringify({ items: [{ productId: product.product_id, quantity: 1.5 }], delivery: { method: 'pickup' } }) });
  assert.equal(invalidQuote.status, 422); assert.equal((await invalidQuote.json()).code, 'invalid_quantity');
  await setQuantity(page, product.name, '3');
  await page.reload(); await expect(quantityInput(page)).toHaveValue('3');
  await ready(page); await add(page, weighted.name).click(); await openCart(page);
  await setQuantity(page, weighted.name, '0.125');
  await expect(cart(page).locator('[data-cart-total]')).toContainText('76,51');
  for (const value of ['0', '1001', '0.00001']) {
    await setQuantity(page, weighted.name, value);
    assert.equal(await quantityInput(page, weighted.name).evaluate(node => node.checkValidity()), false);
    await expect(cart(page).locator('[data-cart-total]')).toContainText('76,51');
  }
  await setQuantity(page, weighted.name, '0.125');
  const fractionalQuote = await request(quoteApi, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-YA-Account': '1' },
    body: JSON.stringify({ items: [{ productId: product.product_id, quantity: 3 }, { productId: weighted.product_id, quantity: 0.125 }], delivery: { method: 'pickup' } }) });
  assert.equal(fractionalQuote.status, 200);
  const fractional = (await fractionalQuote.json()).quote;
  assert.equal(fractional.total_minor, 7651); assert.equal(fractional.items[1].quantity, 0.125);
  assert.equal(fractional.items[1].line_total_minor, 1);
  const cached = await request(catalogApi), oldTag = cached.headers.get('etag');
  assert.ok(oldTag); await cached.arrayBuffer();
  assert.equal((await request(catalogApi, { headers: { 'If-None-Match': oldTag } })).status, 304);
  await publish(true, [{ ...product, price: 26.5 }, weighted]);
  const changed = await request(catalogApi, { headers: { 'If-None-Match': oldTag } });
  assert.equal(changed.status, 200); assert.notEqual(changed.headers.get('etag'), oldTag);
  assert.equal((await changed.json()).products[0].price, 26.5);
  await page.reload(); await expect(quantityInput(page)).toHaveValue('3');
  await expect(quantityInput(page, weighted.name)).toHaveValue('0.125');
  await expect(cart(page).locator('[data-cart-total]')).toContainText('79,51');
  for (const name of [weighted.name, product.name]) await line(page, name).getByRole('button', { name: `${name}: satırı kaldır`, exact: true }).click();
  await expect(cart(page).locator('[data-cart-lines]')).toHaveText('Sepetiniz henüz boş.');
  await expect(cart(page).locator('[data-cart-total]')).toBeEmpty();
  await cart(page).locator('[data-checkout-link]').click({ force: true });
  await expect(page).toHaveURL(/page=cart(?:&|$)/);
  console.log('PASS storefront: cart persistence, quantities, prices, ETag and empty-cart navigation');

  await publish(); await ready(page); await add(page).click(); await contact(page, {});
  await submit(page).click();
  assert.equal(await field(page, 'name').evaluate(node => node.validity.valueMissing), true);
  await expect(field(page, 'name')).toBeFocused();
  await fillBuyer(page, { ...buyer, phone: '123' }); await submit(page).click();
  await expect(message(page)).toContainText('7–15'); await atStep(page, 'customer');
  await fillBuyer(page, { ...buyer, email: 'invalid' }); await submit(page).click();
  assert.equal(await field(page, 'email').evaluate(node => node.validity.typeMismatch), true);
  await expect(field(page, 'email')).toBeFocused(); assert.equal(orderCount(), 0);
  await fillBuyer(page); await next(page, 'delivery');
  assert.deepEqual(await field(page, 'deliveryMethod').locator('option').evaluateAll(nodes => nodes.map(node => node.value)), ['pickup']);
  await expect(form(page).locator('fieldset')).toBeHidden();
  await form(page).getByRole('link', { name: 'Geri', exact: true }).click(); await atStep(page, 'customer');
  await expect(field(page, 'name')).toHaveValue(buyer.name); await review(page);
  await field(page, 'agreement').uncheck();
  await submit(page).click(); await atStep(page, 'review'); assert.equal(orderCount(), 0);
  assert.equal(await field(page, 'agreement').evaluate(node => node.validity.valueMissing), true);
  await field(page, 'agreement').check();
  await expect(body(page).locator('details p').first()).toHaveText(checkout.legal.preliminary);
  await expect(body(page).locator('script,img,iframe')).toHaveCount(0);
  const orders = observeOrders(page); await orders.install();
  clearGuard(); await submit(page).click(); await expect.poll(() => orders.responses.length).toBe(1);
  await accepted(page, 1, orders.responses[0].body);
  assert.equal(orders.responses[0].status, 201);
  const first = orders.requests[0];
  assert.deepEqual(Object.keys(first).sort(), ['buyer','consent','delivery','idempotencyKey','items','note','paymentMethod','quoteId']);
  assert.deepEqual(first.buyer, { name: buyer.name, phone: buyer.phone, email: buyer.email });
  assert.deepEqual(first.delivery, { method: 'pickup' }); assert.deepEqual(first.items, [{ productId: product.product_id, quantity: 1 }]);
  assert.deepEqual(first.consent, { preliminary: true, agreement: true, marketing: false });
  assert.equal(first.paymentMethod, 'bank_transfer'); assert.match(first.quoteId, /^[a-f0-9]{64}$/);
  assert.equal(orders.responses[0].body.total_minor, 2550);

  // PHP accepts, but the network loses its response. Retry is the exact same
  // bytes/key, with one queue row and the original unpaid receipt.
  await newOrder(page); orders.setMode('lose'); await submit(page).click();
  await expect(message(page)).toContainText('sonucu doğrulanamadı');
  assert.equal(orders.responses[1].status, 201); assert.equal(orderCount(), 2);
  await pendingMetadata(page, orders.requests[1]);
  await page.locator('.header-cart-link').click(); await expect(quantityInput(page)).toBeDisabled();
  await page.locator('#mini-cart [data-cart-close]').click();
  orders.setMode('accept'); await submit(page).click();
  await expect.poll(() => orders.responses.length).toBe(3); await accepted(page, 2, orders.responses[2].body);
  assert.equal(orders.raw[2], orders.raw[1]); assert.deepEqual(orders.responses[2], orders.responses[1]);
  assert.notEqual(orders.requests[1].idempotencyKey, first.idempotencyKey);
  await newOrder(page); orders.setMode('hold');
  try {
    await submit(page).click(); await expect.poll(() => orders.requests.length).toBe(4);
    await expect(submit(page)).toBeDisabled(); await form(page).dispatchEvent('submit');
    assert.equal(orders.requests.length, 4, 'Double submit must not issue a second request');
  } finally { orders.release(); }
  await expect.poll(() => orders.responses.length).toBe(4); await accepted(page, 3, orders.responses[3].body);
  assert.notEqual(orders.requests[3].idempotencyKey, orders.requests[1].idempotencyKey);
  const resultUrl = page.url(); await page.reload(); await expect(body(page)).toContainText(orders.responses[3].body.order_number);
  assert.equal(page.url(), resultUrl); assert.equal(orderCount(), 3);
  const denied = await request(paymentApi, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-YA-Account': '1' },
    body: JSON.stringify({ action: 'read', orderId: orders.responses[3].body.order_id, orderAccessToken: 'a'.repeat(64) }) });
  assert.equal(denied.status, 404);
  const stranger = await freshPage(); await stranger.goto(resultUrl);
  await expect(body(stranger)).toContainText('Bu oturumda sipariş sonucu bulunamadı.');
  await expect(body(stranger)).not.toContainText(orders.responses[3].body.order_number);
  await stranger.context().close(); await page.context().close();
  console.log('PASS storefront: V2 validation/consent, real acceptance, exact retry, double-submit and protected result');

  // All rejection/status codes below are real PHP except the bounded 429 timer.
  for (const [status, code, text] of [
    [403,'online_sales_disabled','durdurdu'], [422,'product_not_published','artık satışta değil'],
    [409,'idempotency_conflict','eşleşmiyor'], [429,'rate_limited','2 saniye sonra'],
    [503,'order_unavailable','sonucu doğrulanamadı']
  ]) {
    await publish(); clearGuard(); const target = await freshPage({ width: 375, height: 812 }); await prepare(target);
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
        const seeded = await route.fetch({ postData: JSON.stringify({ ...payload, note: 'Different accepted intent' }), timeout: 8000 });
        assert.equal(seeded.status(), 201);
      }
      const response = await route.fetch({ timeout: 8000 }); responses.push({ status: response.status(), body: await response.json() });
      await route.fulfill({ response });
    });
    await submit(target).click(); await expect(message(target)).toContainText(text);
    assert.equal(responses[0].status, status); assert.equal(responses[0].body.code, code);
    await atStep(target, 'review'); assert.equal(orderCount(), before + (status === 409 ? 1 : 0));
    assert.equal(JSON.parse((await privateStorage(target)).session[checkoutKey]).draft.phone, buyer.phone);
    if ([403,422].includes(status)) {
      assert.equal((await privateStorage(target)).session[attemptKey], undefined);
      await submit(target).click(); assert.equal(attempts.length, 1, 'Withdrawn catalog/product must prevent another POST');
      await target.goto(`${siteUrl}/deneme/?page=cart`);
      const withdrawnLine = cart(target).locator('.shopping-line');
      await expect(withdrawnLine).toHaveCount(1);
      await expect(withdrawnLine.locator('input[type=number]')).toHaveValue('1');
      await expect(cart(target).locator('[data-checkout-link]')).toHaveAttribute('aria-disabled', 'true');
      await expect(withdrawnLine).toContainText('Ürün artık satışta değil');
      const remove = withdrawnLine.getByRole('button', { name: /satırı kaldır/, exact: false });
      if (status === 403) await expect(remove).toBeDisabled();
      else { await remove.click(); await expect(quantityInput(target)).toHaveCount(0); }
    } else {
      await pendingMetadata(target, attempts[0]);
      if (status === 409) {
        await submit(target).click(); await expect.poll(() => responses.length).toBe(2);
        assert.equal(responses[1].status, 409); assert.deepEqual(attempts[1], attempts[0]);
        await target.goto(`${siteUrl}/deneme/?page=checkout-customer`); await field(target, 'note').fill('Changed intent');
        await review(target); await submit(target).click(); await expect(message(target)).toContainText('eşleşmiyor');
        assert.equal(attempts.length, 2, 'Changed recovery data must be blocked before HTTP');
        assert.equal(orderCount(), before + 1);
      } else {
        if (status === 429) {
          await form(target).dispatchEvent('submit'); assert.equal(attempts.length, 1);
          await expect.poll(() => target.evaluate(() => Date.now() >= window.YaCommerce.shared().state.retryUntil), { timeout: 4000 }).toBe(true);
        } else {
          assert.equal(JSON.stringify(responses[0].body).includes('fixture-storage-failure'), false);
          storage("$db->exec('DROP TRIGGER smoke_order_failure');");
        }
        await submit(target).click(); await expect.poll(() => responses.length).toBe(2);
        assert.deepEqual(attempts[1], attempts[0]); assert.equal(responses[1].status, 201);
        await accepted(target, before + 1, responses[1].body);
      }
    }
    await noOverflow(target, `error ${status} at 375px`); await target.context().close();
    console.log(`PASS storefront: ${status} ${code}`);
  }

  // Review is an authorized server quote. Changed price/terms require a new
  // explicit submission, and injected client money cannot change the snapshot.
  await publish(); clearGuard(); const repriced = await freshPage(); await prepare(repriced);
  const priceOrders = observeOrders(repriced); await priceOrders.install(); const beforePrice = orderCount();
  await publish(true, [{ ...product, price: 30.5 }, weighted]); await submit(repriced).click();
  await expect.poll(() => priceOrders.responses.length).toBe(1);
  assert.equal(priceOrders.responses[0].status, 409); assert.equal(priceOrders.responses[0].body.code, 'quote_changed');
  await expect(message(repriced)).toContainText('Fiyat veya satış koşulları değişti');
  assert.equal(orderCount(), beforePrice);
  // Reopen review explicitly; fetch a fresh quote before confirming again.
  await repriced.reload();
  await expect(body(repriced).locator('.shopping-summary')).toContainText('30,50');
  assert.equal(orderCount(), beforePrice); assert.equal((await privateStorage(repriced)).session[attemptKey], undefined);
  await submit(repriced).click(); await expect.poll(() => priceOrders.responses.length).toBe(2);
  await accepted(repriced, beforePrice + 1, priceOrders.responses[1].body);
  assert.notEqual(priceOrders.requests[1].quoteId, priceOrders.requests[0].quoteId);
  assert.notEqual(priceOrders.requests[1].idempotencyKey, priceOrders.requests[0].idempotencyKey);
  assert.equal(priceOrders.responses[1].body.total_minor, 3050); await repriced.context().close();

  for (const [methods, width] of [[['shipping'],375], [['pickup','shipping'],320]]) {
    await publish(true, [product], methods); clearGuard(); const target = await freshPage({ width, height: 812 });
    await ready(target); await add(target).click(); await contact(target); await next(target, 'delivery');
    assert.deepEqual(await field(target, 'deliveryMethod').locator('option').evaluateAll(nodes => nodes.map(node => node.value)), methods);
    if (methods.length === 2) {
      await expect(form(target).locator('fieldset')).toBeHidden(); await field(target, 'deliveryMethod').selectOption('shipping');
      await expect(form(target).locator('fieldset')).toBeVisible(); await field(target, 'deliveryMethod').selectOption('pickup');
      await expect(form(target).locator('fieldset')).toBeHidden(); await field(target, 'deliveryMethod').selectOption('shipping');
    }
    await submit(target).click(); await expect(field(target, 'address.recipientName')).toBeFocused();
    for (const key of ['recipientName','addressLine1','district','city']) assert.equal(await field(target, `address.${key}`).evaluate(node => node.validity.valueMissing), true);
    await fillAddress(target); await field(target, 'address.countryCode').fill('1X'); await submit(target).click();
    await expect(message(target)).toContainText('İki harfli'); await atStep(target, 'delivery');
    await fillAddress(target); await noOverflow(target, `shipping at ${width}px`);
    await next(target, 'payment'); await next(target, 'review'); await field(target, 'preliminary').check(); await field(target, 'agreement').check();
    const records = observeOrders(target); await records.install(); const before = orderCount();
    if (methods.length === 2) records.setMode('lose');
    await submit(target).click(); await expect.poll(() => records.responses.length).toBe(1);
    if (methods.length === 2) {
      await expect(message(target)).toContainText('sonucu doğrulanamadı'); await pendingMetadata(target, records.requests[0]);
      await publish(true, [product], ['pickup']);
      await target.reload(); await expect(submit(target)).toBeVisible();
      // The tab-scoped V2 draft restores the original address/quote. Reloading
      // cannot manufacture a new key or reprice an already accepted attempt.
      assert.deepEqual(JSON.parse((await privateStorage(target)).session[checkoutKey]).draft.address, address);
      records.setMode('accept'); await submit(target).click(); await expect.poll(() => records.responses.length).toBe(2);
      assert.equal(records.raw[1], records.raw[0]); assert.deepEqual(records.responses[1], records.responses[0]);
    }
    const receipt = records.responses.at(-1).body;
    await accepted(target, before + 1, receipt);
    assert.equal(receipt.total_minor, 4049); assert.equal(receipt.delivery_fee_minor, 1499);
    assert.deepEqual(records.requests[0].delivery, { method: 'shipping', address: { ...address, countryCode: 'GB' } });
    const queued = storage("echo $db->query('SELECT payload_json FROM web_orders ORDER BY seq DESC LIMIT 1')->fetchColumn();");
    assert.deepEqual(queued.delivery, records.requests[0].delivery); assert.equal(queued.buyer.name, buyer.name);
    assert.equal(queued.checkout.total_minor, 4049); assert.equal(queued.checkout.items[0].unit_price_minor, 2550);
    await noOverflow(target, `shipping result at ${width}px`); await target.context().close();
  }
  console.log('PASS storefront: quote changes, shipping validation/fee/address, reload and withdrawn-method replay');

  // Withdrawal after review is definitive; unconfigured quote never presents
  // an order-confirmation form or sends an order to PHP.
  for (const methods of [[], ['pickup']]) {
    await publish(true, [product], ['shipping']); clearGuard(); const target = await freshPage(); await prepare(target, 'shipping');
    const records = observeOrders(target); await records.install(); const before = orderCount(); await publish(true, [product], methods);
    await submit(target).click(); await expect.poll(() => records.responses.length).toBe(1);
    assert.equal(records.responses[0].status, methods.length ? 422 : 403);
    assert.equal(records.responses[0].body.code, methods.length ? 'delivery_method_unavailable' : 'online_ordering_disabled');
    await expect(message(target)).toContainText(methods.length ? 'teslimat yöntemi artık sunulmuyor' : 'online sipariş almıyor');
    assert.equal((await privateStorage(target)).session[attemptKey], undefined); assert.equal(orderCount(), before);
    const draft = JSON.parse((await privateStorage(target)).session[checkoutKey]).draft;
    assert.equal(draft.phone, buyer.phone); assert.deepEqual(draft.address, address);
    await target.goto(`${siteUrl}/deneme/?page=checkout-customer`);
    if (methods.length) await expect(field(target, 'phone')).toHaveValue(buyer.phone);
    else {
      await expect(body(target)).toContainText('Sepeti ve güncel ürünleri kontrol edin.');
      await expect(form(target)).toHaveCount(0);
    }
    await target.context().close();
  }
  for (const [terms, method, code] of [[{...checkout,enabled:false},'pickup','checkout_unconfigured'], [{...checkout,shippingFeeMinor:null},'shipping','shipping_fee_unconfigured']]) {
    await publish(true, [product], [method], terms); const target = await freshPage();
    await ready(target); await add(target).click(); await contact(target); await next(target, 'delivery');
    if (method === 'shipping') await fillAddress(target);
    await next(target, 'payment');
    const quoteResponse = target.waitForResponse(response => response.url() === quoteApi); await next(target, 'review');
    const response = await quoteResponse; assert.equal(response.status(), 409); assert.equal((await response.json()).code, code);
    await expect(message(target)).not.toBeEmpty(); await expect(form(target)).toHaveCount(0);
    await expect(body(target).getByRole('link', { name: 'Teslimata dön', exact: true })).toBeVisible(); await target.context().close();
  }

  // Long names/unsafe image URLs, keyboard operation and both V2 storage gates.
  const long = { ...product, name: 'UzunÜrünAdı'.repeat(18).slice(0,180), description: 'Uzun açıklama '.repeat(90), image_url: 'javascript:window.injected=true' };
  await publish(true, [long]); clearGuard();
  const projected = (await (await request(catalogApi)).json()).products[0];
  assert.equal(projected.image_url, ''); assert.deepEqual(projected.image_urls, []);
  const mobile = await freshPage({ width: 320, height: 780 }); await ready(mobile, false, long.name);
  await expect(card(mobile, long.name).locator('img')).toHaveCount(0);
  await add(mobile, long.name).focus(); await mobile.keyboard.press('Enter'); await contact(mobile, { ...buyer, name: 'Mobile Guest', phone: '+49 151 23456789' });
  await mobile.evaluate(() => { window.fixtureStorageSetItem = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new Error('storage disabled'); }; });
  await submit(mobile).focus(); await mobile.keyboard.press('Enter');
  await expect(message(mobile)).toContainText('Tarayıcı depolamasını açıp'); await atStep(mobile, 'customer');
  await mobile.evaluate(() => { Storage.prototype.setItem = window.fixtureStorageSetItem; }); await review(mobile);
  await noOverflow(mobile, 'keyboard checkout at 320px');
  const beforeBlocked = orderCount(), mobileOrders = observeOrders(mobile); await mobileOrders.install();
  // Each checkout step navigates to a new document; keep this document's native
  // storage setter before installing an attempt-only failure guard.
  await mobile.evaluate(() => { window.fixtureStorageSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(key,value) { if(key.endsWith(':attempt:v2'))throw new Error('storage disabled'); return window.fixtureStorageSetItem.call(this,key,value); }; });
  await submit(mobile).click(); await expect(message(mobile)).toContainText('Tekrar deneme bilgileri saklanamadı');
  assert.equal(mobileOrders.requests.length, 0); assert.equal(orderCount(), beforeBlocked);
  await mobile.evaluate(() => { Storage.prototype.setItem = window.fixtureStorageSetItem; sessionStorage.setItem('smoke-storage-restored','ok'); });
  await expect(submit(mobile)).toBeEnabled();
  await submit(mobile).click();
  await expect.poll(() => mobileOrders.responses.length).toBe(1); await accepted(mobile, beforeBlocked + 1, mobileOrders.responses[0].body);
  await noOverflow(mobile, 'mobile result at 320px'); await mobile.context().close();
  console.log('PASS storefront: closed checkout, mobile/keyboard, unsafe images and draft/attempt storage gates');

  // Verified customer and dealer ownership comes from real PHP sessions. Seed
  // credentials only in the disposable SQLite fixture; no mail/provider is used.
  await publish(); clearGuard();
  const customerId = '11111111-1111-4111-8111-111111111111', dealerId = '22222222-2222-4222-8222-222222222222';
  const accessId = '33333333-3333-4333-8333-333333333333';
  for (const [id,name,email] of [[customerId,'Verified Customer','customer@example.test'],[dealerId,'Verified Dealer','dealer@example.test']]) {
    storage(`require_once dirname($argv[1]).'/customer-account-store.php'; ya_account_create_schema($db);
      $value=json_decode($argv[2],true); $db->prepare('INSERT INTO customer_accounts(id,email,full_name,password_hash,email_verified,created_at) VALUES (?,?,?,?,1,?)')->execute([$value[0],$value[2],$value[1],password_hash('Fixture-password-249!',PASSWORD_ARGON2ID),time()]);`, [JSON.stringify([id,name,email])]);
  }
  const dealerProduct = { ...product, name: 'Private dealer product', price: 7.5 };
  const anonymousPrivate = await request(`${base}/api/dealer/catalog.php`);
  assert.equal(anonymousPrivate.status, 401);
  await publishAccounts([{access_id:accessId,customer_ref:'44444444-4444-4444-8444-444444444444',account_id:dealerId,display_name:'Fixture dealer',access_revision:1,session_revision:1,enabled:true}],
    [{access_id:accessId,access_revision:1,catalog_revision:'a'.repeat(64),delivery_methods:['pickup'],products:[dealerProduct]}]);
  for (const [id,name,email,isDealer] of [[customerId,'Verified Customer','customer@example.test',false],[dealerId,'Verified Dealer','dealer@example.test',true]]) {
    const target = await freshPage(); await ready(target); await add(target).click();
    const login = await target.context().request.post(`${base}/api/account/login.php`, {headers:{'X-YA-Account':'1'},data:{email,password:'Fixture-password-249!'}});
    assert.equal(login.status(),200,await login.text()); await target.reload();
    await expect.poll(() => target.evaluate(() => window.YaAccount.state.account?.id)).toBe(id);
    await expect(add(target,isDealer?dealerProduct.name:product.name)).toBeEnabled();
    const privateCatalog = await target.context().request.get(`${base}/api/dealer/catalog.php`);
    assert.equal(privateCatalog.status(), isDealer ? 200 : 403);
    if (!isDealer) assert.equal((await privateCatalog.text()).includes(dealerProduct.name), false);
    assert.equal((await privateStorage(target)).local[cartKey],undefined,'Guest cart cannot become an authenticated cart');
    await add(target,isDealer?dealerProduct.name:product.name).click(); await openCart(target);
    await expect(cart(target).locator('[data-checkout-link]')).toHaveAttribute('aria-disabled','false');
    await cart(target).locator('[data-checkout-link]').click(); await atStep(target,'customer');
    for (const [key,value] of [['name',name],['email',email]]) {await expect(field(target,key)).toHaveValue(value);await expect(field(target,key)).toHaveAttribute('readonly','');}
    await field(target,'phone').fill(buyer.phone); await field(target,'note').fill(buyer.note); await review(target);
    const endpoint=isDealer?`${base}/api/dealer/order.php`:orderApi, records=observeOrders(target,endpoint); await records.install();
    const before=orderCount(); await submit(target).click(); await expect.poll(()=>records.responses.length).toBe(1);
    assert.equal(records.responses[0].status,201); await accepted(target,before+1,records.responses[0].body,id);
    assert.equal(records.responses[0].body.total_minor,isDealer?750:2550);
    const queued=storage("echo $db->query('SELECT payload_json FROM web_orders ORDER BY seq DESC LIMIT 1')->fetchColumn();");
    if(isDealer){assert.equal(queued.kind,'dealer');assert.equal(queued.dealerAccessId,accessId);assert.equal(records.requests[0].buyer,undefined);assert.equal(records.requests[0].catalogRevision,'a'.repeat(64));}
    else {assert.equal(queued.kind,'customer');assert.equal(queued.accountId,id);assert.equal(queued.buyer.name,name);assert.equal(queued.buyer.email,email);}
    const forged={...records.requests[0],idempotencyKey:'forged-identity-fixture-01',buyer:{name:'Forged',phone:buyer.phone,email:'forged@example.test'},price:0,total:0};
    const checked=await target.context().request.post(endpoint,{headers:{'X-YA-Account':'1','X-YA-Dealer':'1'},data:forged});
    assert.equal(checked.status(),isDealer?422:201);
    if(!isDealer){const row=storage("echo $db->query('SELECT payload_json FROM web_orders ORDER BY seq DESC LIMIT 1')->fetchColumn();");assert.equal(row.buyer.name,name);assert.equal(row.buyer.email,email);assert.equal(row.checkout.total_minor,2550);}
    assert.equal(orderCount(),before+(isDealer?1:2));
    await target.evaluate(()=>window.YaAccount.logout());
    await expect.poll(()=>target.evaluate(()=>window.YaAccount.state.status)).toBe('guest');
    assert.equal((await privateStorage(target)).session[`ya:checkout:/yardimci-asistan/:${id}:v2`],undefined,'Logout erases private checkout receipt');
    await target.context().close();
  }
  assert.deepEqual(remoteImages,[], 'Unsafe product images must not trigger remote image requests'); assert.deepEqual(errors,[]);
  console.log('PASS storefront: real customer/dealer sessions, private prices, authoritative identity and logout fencing');
  console.log('web-storefront-smoke-ok: Commerce V2 catalog → cart → customer → delivery → payment → review → result; PHP/SQLite, stock eligibility, prices, XSS/CSP, ownership, idempotency/retry, withdrawal, mobile and secure navigation');

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
