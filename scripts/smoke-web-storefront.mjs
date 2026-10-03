import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';

const root = mkdtempSync(join(tmpdir(), 'ya-storefront-'));
const hosting = join(root, 'yardimci-asistan');
cpSync('firm-template/web-module', hosting, { recursive: true });
for (const file of ['yardimci-asistan.sqlite', 'yardimci-asistan.sqlite-wal', 'yardimci-asistan.sqlite-shm']) rmSync(join(hosting, 'data', file), { force: true });
const secret = 'storefront-test-only-secret';
const config = join(hosting, 'config/business.json');
writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, 'utf8')), sync_secret: secret }));
const port = await new Promise((resolve, reject) => {
  const probe = http.createServer(); probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => resolve(port)); });
});
const base = `http://127.0.0.1:${port}/yardimci-asistan`;
const server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', root], { stdio: 'ignore' });
let browser, revision = 0;
const product = { product_id: 'p-one', name: 'Birinci ürün', description: '<script>window.injected=true</script> Güvenli açıklama',
  unit: 'piece', price: 25.5, currency: 'TRY', tax_rate: 20, image_url: 'https://images.example.com/missing.png', availability: 'available', sort_order: 0 };
const weighted = { ...product, product_id: 'p-weight', name: 'Tartılan ürün', unit: 'kg', price: 0.1, image_url: '', sort_order: 1 };
function storage(code) {
  const result = spawnSync('php', ['-r', `require $argv[1]; $db=ya_storage_open(); ${code}`, join(hosting, 'lib/storage.php')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); return result.stdout ? JSON.parse(result.stdout) : null;
}
const clearGuard = () => storage("if ($db->query(\"SELECT 1 FROM sqlite_master WHERE name='public_request_guard_events'\")->fetchColumn()) $db->exec('DELETE FROM public_request_guard_events');");
async function publish(enabled = true, products = [product, weighted]) {
  revision++;
  const result = await fetch(`${base}/api/sync.php`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-YA-Sync-Secret': secret },
    body: JSON.stringify({ action: 'publish_online_catalog', client_id: 'a4-browser', source_revision: revision, idempotency_key: `publication-${revision}`,
      online_catalog: { version: 1, enabled, updated_at: new Date().toISOString(), products: enabled ? products : [] } }) });
  assert.equal(result.status, 200, await result.text());
}
const quantityInput = (page, name = product.name) => page.getByRole('textbox', { name: `${name}: miktar`, exact: false });
const add = (page, name = product.name) => page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) }).getByRole('button', { name: 'Sepete ekle' });
async function ready(page) { await page.goto(`${base}/magaza/`); await expect(add(page)).toBeVisible(); }
async function contact(page) {
  await page.getByRole('button', { name: 'İletişim bilgilerini gir' }).click();
  await page.getByLabel('Ad / ad-soyad').fill('Guest Example');
  await page.getByLabel('Telefon', { exact: false }).fill('+1 (202) 555-0100');
  await page.getByLabel('E-posta').fill('guest@example.test');
  await page.getByLabel('Sipariş notu').fill('Test order note');
}
async function freshPage(viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', (error) => { errors.push(error.message); });
  await page.route('https://images.example.com/**', (route) => route.abort());
  return page;
}
const errors = [];
const screenshotRoot = join(process.cwd(), 'artifacts', 'storefront-smoke');
mkdirSync(screenshotRoot, { recursive: true });
try {
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(`${base}/api/catalog.php`)).ok) break; } catch { /* startup */ }
    if (attempt > 80) throw new Error('PHP startup failed');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal((await fetch(`${base}/api/order.php`)).status, 405);
  const html = await fetch(`${base}/magaza/`);
  assert.equal(html.status, 200); assert.match(html.headers.get('content-security-policy'), /script-src 'self'/);
  browser = await launchChromiumForSmoke(chromium);
  // Visual contract: a single product stays compact and its purchase controls
  // fit the initial viewport; empty-cart checkout cannot open by pointer/keyboard.
  const compactProduct = { ...product, name: 'UzunÜrünAdı'.repeat(18).slice(0, 180), description: 'Uzun açıklama '.repeat(90), image_url: '' };
  for (const viewport of [{ width: 1280, height: 768 }, { width: 375, height: 812 }, { width: 320, height: 780 }]) {
    await publish(true, [compactProduct]);
    const layoutPage = await freshPage(viewport);
    await layoutPage.goto(`${base}/magaza/`);
    const card = layoutPage.getByRole('article');
    await expect(card).toHaveCount(1);
    await expect(card.getByRole('heading', { name: compactProduct.name, exact: true })).toBeInViewport({ ratio: 1 });
    await expect(card.locator('.price')).toBeInViewport({ ratio: 1 });
    await expect(card.getByRole('button', { name: 'Sepete ekle' })).toBeInViewport({ ratio: 1 });
    assert.ok((await card.locator('.product-media').boundingBox()).height <= 160, 'bounded image/placeholder height');
    if (viewport.width >= 960) {
      assert.ok((await card.boundingBox()).width <= 320, 'single product must not fill catalog width');
      await expect(layoutPage.locator('.cart-access')).toBeHidden();
      await expect(layoutPage.locator('#cart')).toBeInViewport({ ratio: 1 });
    } else {
      await expect(layoutPage.locator('.cart-access')).toBeVisible();
    }
    const checkoutButton = layoutPage.locator('#open-checkout');
    await expect(checkoutButton).toBeDisabled();
    const disabledAppearance = await checkoutButton.evaluate((node) => ({ background: getComputedStyle(node).backgroundColor, cursor: getComputedStyle(node).cursor }));
    assert.notEqual(disabledAppearance.background, await add(layoutPage, compactProduct.name).evaluate((node) => getComputedStyle(node).backgroundColor));
    assert.equal(disabledAppearance.cursor, 'not-allowed');
    // Real pointer click on disabled button, followed by keyboard and synthetic
    // events to protect the small handler guard as well as native disabled markup.
    await checkoutButton.scrollIntoViewIfNeeded();
    const box = await checkoutButton.boundingBox();
    await layoutPage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await layoutPage.keyboard.press('Enter');
    await checkoutButton.dispatchEvent('click');
    await expect(layoutPage.locator('#checkout')).toBeHidden();
    await layoutPage.locator('.cart-access').evaluate((node) => { if (getComputedStyle(node).display !== 'none') node.click(); });
    if (viewport.width < 960) await expect(layoutPage.locator('#cart')).toBeInViewport({ ratio: 1 });
    await layoutPage.evaluate(() => window.scrollTo(0, 0));
    await layoutPage.screenshot({ path: join(screenshotRoot, `compact-${viewport.width}.png`), fullPage: true });
    assert.equal(await layoutPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `compact layout overflow ${viewport.width}`);
    await layoutPage.context().close();
  }
  // Multiple products occupy separate desktop columns; real images crop inside
  // the same bounded media surface and catalog reload keeps working.
  await publish();
  const gridPage = await freshPage({ width: 1280, height: 768 });
  await ready(gridPage);
  const cards = gridPage.getByRole('article');
  const first = await cards.nth(0).boundingBox(), second = await cards.nth(1).boundingBox();
  assert.equal(first.y, second.y); assert.ok(second.x > first.x + first.width);
  await expect(cards.nth(0).getByRole('button', { name: 'Sepete ekle' })).toBeInViewport({ ratio: 1 });
  await expect(cards.nth(1).getByRole('button', { name: 'Sepete ekle' })).toBeInViewport({ ratio: 1 });
  await gridPage.route('https://images.example.com/photo.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#0e7490"/></svg>' }));
  await publish(true, [{ ...product, image_url: 'https://images.example.com/photo.svg' }, weighted]);
  const refreshButton = gridPage.getByRole('button', { name: 'Ürünleri yenile' });
  assert.equal(await refreshButton.evaluate((node) => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)');
  await refreshButton.click();
  const image = gridPage.getByRole('img', { name: product.name });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((node) => node.naturalWidth)).toBe(800);
  assert.equal(await image.evaluate((node) => getComputedStyle(node).objectFit), 'cover');
  assert.ok((await image.boundingBox()).height <= 160);
  await gridPage.context().close();
  await publish(false);
  const page = await freshPage();
  await page.goto(`${base}/magaza/`);
  await expect(page.getByRole('status').filter({ hasText: 'online sipariş almıyor' })).toBeVisible();
  await publish(true, []); await page.getByRole('button', { name: 'Ürünleri yenile' }).click();
  await expect(page.getByText('Şu anda satışta ürün bulunmuyor.')).toBeVisible();
  await publish();
  await page.route('**/api/catalog.php', (route) => route.fulfill({ status: 503, contentType: 'text/html', body: 'unavailable' }));
  await page.getByRole('button', { name: 'Ürünleri yenile' }).click();
  await expect(page.getByText(/Ürünler şu anda yüklenemiyor/)).toBeVisible();
  await page.unroute('**/api/catalog.php');
  let releaseCatalog;
  await page.route('**/api/catalog.php', async (route) => { await new Promise((resolve) => { releaseCatalog = resolve; }); await route.continue(); });
  await page.getByRole('button', { name: 'Ürünleri yenile' }).click();
  await expect(page.getByText('Ürünler yükleniyor…')).toBeVisible();
  await expect(page.locator('#product-grid')).toHaveAttribute('aria-busy', 'true');
  releaseCatalog(); await expect(add(page)).toBeVisible(); await page.unroute('**/api/catalog.php');
  await expect(page.getByText('Görsel yok')).toHaveCount(2);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  await expect(page.getByText(product.description, { exact: true }).first()).toBeVisible();
  await add(page).click(); await add(page).click(); await expect(quantityInput(page)).toHaveValue('2');
  await expect(page.locator('#subtotal')).toContainText('51,00');
  await page.getByRole('button', { name: `${product.name}: miktarı azalt`, exact: true }).click();
  await expect(quantityInput(page)).toHaveValue('1');
  await quantityInput(page).fill('1.5'); await quantityInput(page).press('Tab');
  await expect(quantityInput(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#open-checkout')).toBeDisabled();
  await quantityInput(page).fill('3'); await quantityInput(page).press('Tab');
  await expect(page.locator('#subtotal')).toContainText('76,50');
  await page.reload(); await expect(quantityInput(page)).toHaveValue('3');
  await add(page, weighted.name).click(); await quantityInput(page, weighted.name).fill('0,125'); await quantityInput(page, weighted.name).press('Tab');
  await expect(quantityInput(page, weighted.name)).toHaveValue('0.125');
  await expect(page.locator('#subtotal')).toContainText('76,51');
  await page.screenshot({ path: join(screenshotRoot, 'desktop.png'), fullPage: true });
  for (const invalidQuantity of ['0', '1001', '0.00001']) {
    await quantityInput(page, weighted.name).fill(invalidQuantity); await quantityInput(page, weighted.name).press('Tab');
    await expect(quantityInput(page, weighted.name)).toHaveAttribute('aria-invalid', 'true');
  }
  await quantityInput(page, weighted.name).fill('0.125'); await quantityInput(page, weighted.name).press('Tab');
  await page.getByRole('button', { name: `${weighted.name}: miktarı artır`, exact: true }).click();
  await expect(quantityInput(page, weighted.name)).toHaveValue('0.225');
  await page.getByRole('button', { name: `${weighted.name}: satırı kaldır`, exact: true }).click();
  await expect(page.locator('#cart-count')).toHaveText('1');
  await publish(true, [weighted]); await page.getByRole('button', { name: 'Ürünleri yenile' }).click();
  await expect(page.getByText(/Artık satışta değil/)).toBeVisible(); await expect(page.locator('#open-checkout')).toBeDisabled();
  await page.getByRole('button', { name: 'Temizle', exact: true }).click(); await expect(page.getByText('Sepetiniz henüz boş.')).toBeVisible();
  await publish(); await page.getByRole('button', { name: 'Ürünleri yenile' }).click(); await add(page).click();
  await page.getByRole('button', { name: 'İletişim bilgilerini gir' }).click();
  await page.locator('#submit-order').click(); await expect(page.locator('#name-error')).toContainText('Adınızı yazın');
  await expect(page.locator('#phone-error')).toContainText('7–15');
  await page.getByLabel('Ad / ad-soyad').fill('Guest Example'); await page.getByLabel('Telefon', { exact: false }).fill('+44 7911 123456');
  await page.getByLabel('E-posta').fill('invalid'); await page.locator('#submit-order').click(); await expect(page.locator('#email-error')).toContainText('Geçerli');
  await page.getByLabel('E-posta').fill('guest@example.test'); await page.getByLabel('Sipariş notu').fill('Test order note');

  // Lost response AFTER actual acceptance: retry must replay the receipt, not insert again.
  const requests = [];
  await page.route('**/api/order.php', async (route) => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) { const result = await route.fetch(); assert.equal(result.status(), 201); await route.abort('failed'); }
    else await route.continue();
  });
  clearGuard(); await page.locator('#submit-order').click();
  await expect(page.locator('#submission-message')).toContainText('sonucu doğrulanamadı');
  await expect(quantityInput(page)).toHaveValue('1'); await expect(page.getByLabel('Telefon', { exact: false })).toHaveValue('+44 7911 123456');
  await expect(page.locator('#buyer-name')).toBeDisabled(); await expect(add(page)).toBeDisabled();
  assert.equal(storage("echo $db->query('SELECT COUNT(*) FROM web_orders')->fetchColumn();"), 1);
  const browserStorage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  for (const pii of ['Guest Example', '+44 7911 123456', 'guest@example.test', 'Test order note']) assert.equal(JSON.stringify(browserStorage).includes(pii), false);
  await page.locator('#submit-order').click(); await expect(page.locator('#success')).toBeVisible();
  assert.deepEqual(requests[1], requests[0]); assert.match(requests[0].idempotencyKey, /^[A-Za-z0-9_-]{16,128}$/);
  assert.deepEqual(Object.keys(requests[0]).sort(), ['buyer', 'idempotencyKey', 'items', 'note']);
  assert.deepEqual(requests[0].items, [{ productId: 'p-one', quantity: 1 }]);
  await expect(page.locator('#reference')).toHaveText(/^web_order_[a-f0-9]{32}$/);
  await expect(page.locator('#cart-count')).toHaveText('0');
  assert.equal(storage("echo $db->query('SELECT COUNT(*) FROM web_orders')->fetchColumn();"), 1);
  assert.equal(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes('storefront')).length), 0);
  assert.equal(await page.evaluate(() => sessionStorage.length), 0);
  await page.getByRole('button', { name: 'Yeni sipariş başlat' }).click(); await expect(add(page)).toBeEnabled(); await add(page).click(); await contact(page);
  // Hold one POST in flight and dispatch a second form submission.
  let releaseOrder;
  await page.unroute('**/api/order.php');
  await page.route('**/api/order.php', async (route) => { requests.push(route.request().postDataJSON()); await new Promise((resolve) => { releaseOrder = resolve; }); await route.continue(); });
  clearGuard(); await page.locator('#submit-order').click(); await expect(page.locator('#submit-order')).toHaveText('Gönderiliyor…');
  await page.locator('#checkout-form').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await expect(page.locator('#submit-order')).toBeDisabled(); assert.equal(requests.length, 3);
  releaseOrder(); await expect(page.locator('#success')).toBeVisible(); assert.notEqual(requests[2].idempotencyKey, requests[0].idempotencyKey);
  await page.context().close();

  // Explicit API errors preserve draft and use appropriate user feedback.
  for (const [status, code, text] of [[409, 'idempotency_conflict', 'eşleşmiyor'], [403, 'online_sales_disabled', 'durdurdu'],
    [422, 'product_not_published', 'artık satışta değil'], [429, 'rate_limited', 'saniye sonra'], [503, 'order_unavailable', 'sonucu doğrulanamadı']]) {
    await publish(); const errorPage = await freshPage({ width: 375, height: 812 }); await ready(errorPage); await add(errorPage).click(); await contact(errorPage);
    const attempts = [];
    await errorPage.route('**/api/order.php', async (route) => {
      attempts.push(route.request().postDataJSON());
      if (status === 422) await publish(true, [weighted]);
      await route.fulfill({ status, headers: status === 429 ? { 'Retry-After': '1' } : {}, contentType: 'application/json', body: JSON.stringify({ ok: false, code }) });
    });
    await errorPage.locator('#submit-order').click(); await expect(errorPage.locator('#submission-message')).toContainText(text);
    await expect(errorPage.getByLabel('Telefon', { exact: false })).toHaveValue('+1 (202) 555-0100');
    await expect(errorPage.locator('#cart-count')).toHaveText('1');
    if (status === 403) { await expect(errorPage.getByText('Mağazamız şu anda online sipariş almıyor.')).toBeVisible(); await expect(errorPage.locator('#submit-order')).toBeDisabled(); }
    if (status === 422) { await expect(errorPage.locator('.unavailable')).toBeVisible(); await expect(errorPage.locator('#submit-order')).toBeDisabled(); await expect(errorPage.locator('#buyer-name')).toBeEnabled(); }
    if (status === 409) { await expect(add(errorPage)).toBeDisabled(); await expect(errorPage.locator('#buyer-name')).toBeEnabled(); }
    if (status === 429) { await expect(errorPage.locator('#submit-order')).toBeDisabled(); await expect(errorPage.locator('#submit-order')).toBeEnabled({ timeout: 4000 }); }
    if ([429, 503].includes(status)) { await errorPage.locator('#submit-order').click(); await expect.poll(() => attempts.length).toBe(2); assert.deepEqual(attempts[1], attempts[0]); }
    assert.equal(await errorPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `mobile overflow ${status}`);
    await errorPage.context().close();
  }

  // Pending key survives a reload without persisting guest contact data.
  await publish(); const reload = await freshPage(); await ready(reload); await add(reload).click(); await contact(reload);
  const retryRequests = [];
  await reload.route('**/api/order.php', (route) => { retryRequests.push(route.request().postDataJSON()); return route.abort(); });
  await reload.locator('#submit-order').click(); await expect(reload.locator('#submission-message')).toContainText('sonucu doğrulanamadı');
  reload.on('dialog', (dialog) => dialog.accept()); await reload.reload();
  await expect(reload.locator('#checkout')).toBeVisible(); await expect(reload.getByLabel('Telefon', { exact: false })).toHaveValue('');
  await reload.getByLabel('Ad / ad-soyad').fill('Guest Example'); await reload.getByLabel('Telefon', { exact: false }).fill('+1 (202) 555-0100');
  await reload.getByLabel('E-posta').fill('guest@example.test'); await reload.getByLabel('Sipariş notu').fill('Test order note');
  await reload.locator('#submit-order').click(); await expect.poll(() => retryRequests.length).toBe(2); assert.deepEqual(retryRequests[1], retryRequests[0]);
  await reload.context().close();

  // Mobile keyboard checkout + actual API, long content, unsafe image, storage unavailable.
  const long = { ...product, name: 'UzunÜrünAdı'.repeat(18), description: 'Uzun açıklama '.repeat(90), image_url: 'javascript:alert(1)' };
  // Backend bounds names at 180 characters.
  long.name = long.name.slice(0, 180);
  await publish(true, [long]); const mobile = await freshPage({ width: 320, height: 780 });
  await mobile.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('storage disabled'); }; });
  await mobile.goto(`${base}/magaza/`); await expect(add(mobile, long.name)).toBeVisible(); await expect(mobile.getByText('Görsel yok')).toBeVisible();
  await add(mobile, long.name).focus(); await mobile.keyboard.press('Enter');
  await mobile.locator('#open-checkout').focus(); await mobile.keyboard.press('Enter'); await expect(mobile.getByLabel('Ad / ad-soyad')).toBeFocused();
  await mobile.keyboard.type('Mobile Guest'); await mobile.keyboard.press('Tab'); await mobile.keyboard.type('+49 151 23456789');
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile cart and checkout overflow');
  await mobile.screenshot({ path: join(screenshotRoot, 'mobile-checkout.png'), fullPage: true });
  clearGuard(); await mobile.locator('#submit-order').click(); await expect(mobile.locator('#success')).toBeVisible();
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log('web-storefront-smoke-ok: catalog/cart/guest checkout/retry/errors/desktop/mobile/real A3 API');
} finally {
  if (browser) await browser.close();
  server.kill(); await new Promise((resolve) => server.once('exit', resolve));
  rmSync(root, { recursive: true, force: true });
}
