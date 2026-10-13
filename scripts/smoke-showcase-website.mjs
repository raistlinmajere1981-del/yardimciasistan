import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { activateFixtureSource } from './test-helpers/publication-protocol.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import http from 'node:http';
import { chromium, expect } from '@playwright/test';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';
import { marketingFixture, imageBytes, editorialInput } from './test-helpers/marketing-fixtures.mjs';
const require = createRequire(import.meta.url);
const { PhpHostingSyncTransport } = require('../packages/sync-core/dist');
const { SyncCoordinator } = require('../apps/desktop-app/dist-electron/sync-coordinator.js');
const { setBusinessCapability } = require('../apps/desktop-app/dist-electron/business-capability-store.js');
const { saveRuntimeCatalogProduct } = require('../apps/desktop-app/dist-electron/commerce-runtime.js');
const root = mkdtempSync(join(tmpdir(), 'ya-showcase-')), f = marketingFixture();
cpSync('test-site/landing', root, { recursive: true });
const moduleRoot = join(root, 'yardimci-asistan'); cpSync('firm-template/web-module', moduleRoot, { recursive: true });
const secret = 'showcase-only-test-key<&"';
writeFileSync(join(moduleRoot, 'config/business.json'), JSON.stringify({ sync_secret: secret, allowed_origins: [] }));
assert.equal(existsSync('test-site/landing/demo'), false);
const port = await new Promise(resolvePort => { const server = http.createServer(); server.listen(0, '127.0.0.1', () => { const p = server.address().port; server.close(() => resolvePort(p)); }); });
const base = `http://127.0.0.1:${port}`, config = { baseUrl: `${base}/yardimci-asistan`, syncSecret: secret };
const php = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', root], { stdio: 'ignore' });
const clientId = f.db.getSyncRuntimeStatus().clientId, transport = new PhpHostingSyncTransport({ ...config, clientId, sourceEpoch: 1 });
const coordinator = new SyncCoordinator({ database: f.db, marketingWebsite: f.publisher, getSyncConfig: () => config, createAndroidSnapshot: () => ({}), onDashboardChanged: () => {}, onStatusChanged: () => {} });
let browser;
const clearOthers = () => { for (const job of f.db.getPendingSyncJobs()) if (job.jobType !== 'marketing_website_publish') f.db.completeSyncJob(job.jobKey, job.sourceRevision); };
const push = async () => { clearOthers(); const result = await coordinator.publishOutbox(transport); assert.deepEqual(result.errors, []); };
// Real storage publications, isolated from a customer's runtime. Leaf endpoint regressions have their own registered smokes.
const seed = (name, value, revision = 1) => {
  const file = join(root, 'seed.json'); writeFileSync(file, JSON.stringify(value));
  const result = spawnSync('php', ['-r', 'require $argv[1]; $json=file_get_contents($argv[3]); $previous=ya_storage_get_publication($argv[2],[]); $rev=max((int)$argv[4],(int)($previous["_publication"]["source_revision"]??0)+1); ya_storage_publish($argv[2], json_decode($json,true), $argv[5], $rev, $argv[2].":".$rev, date(DATE_ATOM), 1, hash("sha256",$json));', join(moduleRoot, 'lib/storage.php'), name, file, String(revision), clientId], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
};
try {
  for (let n = 0; n < 50; n++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  const capabilities = await transport.getCapabilities();
  await activateFixtureSource(config.baseUrl, secret, clientId);
  f.db.savePublicationSourceEpoch(config.baseUrl, 1);
  f.db.ensurePublicationTarget(config.baseUrl);
  assert.ok(!capabilities.features.includes('website_navigation'));
  await push(); assert.equal(f.db.getSyncRuntimeStatus().enabled, false);
  browser = await launchChromiumForSmoke(chromium); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base); await expect(page.locator('#demo-sync-secret')).toHaveValue(secret);
  assert.equal(await page.locator('script[type="module"]').count(), 0);
  assert.ok(!/Canlı Sistem|fixture|public API referansı|Canlı referans site/.test(await page.locator('body').innerText()));
  await expect(page.locator('[data-site-nav] a[href="/odalar/"]')).toHaveCount(0);
  await expect(page.locator('[data-marketing-wrapper]')).toBeHidden();
  await expect(page.locator('.download-card')).toHaveCount(3);
  mkdirSync(join(root, 'downloads')); for (const link of await page.locator('.download-card').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')))) { writeFileSync(join(root, link), 'test-download'); assert.equal((await fetch(base + link)).status, 200); }
  const surfaces = [
    ['room_catalog', 'rooms', '/odalar/'], ['table_catalog', 'restaurant', '/restoran/'],
    ['menu', 'qr_menu', '/qr-menu/'], ['online_catalog', 'store', '/magaza/']
  ];
  const assertSurfaces = async (visible) => {
    await page.goto(base);
    const business = (await (await page.request.get(base + '/yardimci-asistan/api/business.php')).json()).business;
    for (const [, surface, path] of surfaces) {
      await expect(page.locator(`[data-site-nav] a[href="${path}"]`)).toHaveCount(visible ? 1 : 0);
      await expect(page.locator(`.demo-surface-card a[href="${path}"]`)).toHaveCount(visible ? 1 : 0);
      assert.equal(business.public_surfaces.includes(surface), visible, surface);
    }
  };
  await assertSurfaces(false);
  await page.goto(base + '/magaza/');
  await expect(page.locator('#catalog-state')).toContainText('online sipariş almıyor');
  await expect(page.locator('.site-header')).toBeVisible();
  // Android disabled/empty capabilities cannot hide independently enabled Web publications.
  seed('android_snapshot', { enabled: false, business_capabilities: [] });
  seed('room_catalog', { enabled: true, rooms: [{ id: 'showcase-room', name: 'Örnek oda', capacity: 2, media: [], features: [] }] });
  seed('table_catalog', { enabled: true, tables: [{ id: 'showcase-table', name: 'Örnek masa', capacity: 4, area: 'Salon', media: [], features: [] }] });
  seed('menu', { enabled: true, categories: [{ id: 'drinks', name: 'İçecekler' }], items: [{ id: 'tea', name: 'Çay', category_id: 'drinks', price: 25, currency: 'TRY', is_active: true }] });
  seed('online_catalog', { enabled: true, version: 1, delivery_methods: ['pickup'], products: [{ product_id: 'showcase-product', name: 'Örnek ürün', unit: 'piece', price: 50, currency: 'TRY', tax_rate: 20, availability: 'available' }] });
  await assertSurfaces(true);
  seed('business_context', { business_name: 'Örnek işletme', phone: '+90 555 000 0000', address: 'Örnek adres', latitude: 41, longitude: 29, social_links: [{ platform: 'instagram', url: 'https://instagram.com/example' }] });
  await page.goto(base + '/odalar/'); await expect(page.locator('.room-card')).toContainText('Örnek oda');
  await expect(page.locator('.room-card')).not.toContainText('Oda detaylarını inceleyebilirsiniz.');
  await page.goto(base + '/odalar/oda/?id=showcase-room'); await expect(page.locator('.breadcrumb [data-room-name]')).toContainText('Örnek oda');
  await expect(page.locator('.room-detail-copy h2')).toHaveText('Örnek oda');
  await expect(page.locator('[data-room-price-note]')).toBeHidden();
  await expect(page.locator('[data-room-reserve]')).toBeVisible();
  await expect(page.locator('[data-room-media-section] h2')).toHaveText('Fotoğraflar ve videolar');
  await page.goto(base + '/restoran/'); await expect(page.locator('.table-card')).toContainText('Örnek masa');
  await expect(page.locator('.table-card')).not.toContainText('Masa detaylarını inceleyebilirsiniz.');
  await expect(page.locator('[data-table-count]')).toHaveText('1 masa');
  await expect(page.getByRole('heading', { name: 'Yayınlanmış masalar' })).toHaveCount(0);
  await page.goto(base + '/restoran/masa/?id=showcase-table'); await expect(page.locator('[data-table-name]')).toContainText('Örnek masa');
  await expect(page.locator('.room-detail-copy h2')).toHaveCount(0);
  await page.goto(base + '/qr-menu/'); await expect(page.locator('.qr-menu-item')).toContainText('Çay');
  const commerceRequests = [];
  page.on('request', request => {
    if (/\/api\/(catalog|order)\.php/.test(request.url())) commerceRequests.push(new URL(request.url()).pathname);
  });
  await page.goto(base + '/magaza/'); await expect(page.getByRole('article')).toContainText('Örnek ürün');
  await expect(page.locator('.site-header')).toBeVisible();
  await expect(page.locator('.site-footer')).toBeAttached();
  await expect(page.locator('[data-site-nav] a[href="/magaza/"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('#yardimci-asistan-widget [data-ya-open]')).toBeVisible();
  mkdirSync('artifacts/showcase', { recursive: true });
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `store overflow ${width}`);
    // Adding/removing storefront CSS must leave host chrome and widget styles intact.
    const chromeStyles = () => page.evaluate(() => Array.from(document.querySelectorAll('.site-header, .site-header *, .site-footer, .site-footer *, #yardimci-asistan-widget, #yardimci-asistan-widget *')).map(node => {
      const style = getComputedStyle(node);
      return ['display', 'position', 'color', 'backgroundColor', 'font', 'padding', 'borderRadius', 'width', '--ocean', '--radius'].map(key => style.getPropertyValue(key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)));
    }));
    const styled = await chromeStyles();
    await page.locator('link[href="/yardimci-asistan/magaza/storefront.css"]').evaluate(node => { node.sheet.disabled = true; });
    assert.deepEqual(await chromeStyles(), styled, `store CSS must not change host/widget ${width}`);
    await page.locator('link[href="/yardimci-asistan/magaza/storefront.css"]').evaluate(node => { node.sheet.disabled = false; });
    assert.equal(await page.locator('#products-title').evaluate(node => getComputedStyle(node).fontSize), '24px');
    assert.equal(await page.locator('.product-card').evaluate(node => getComputedStyle(node).paddingTop), '0px');
    if (width < 960) {
      await expect(page.locator('[data-site-nav]')).toBeHidden();
      await page.locator('[data-menu-toggle]').click();
      await expect(page.locator('[data-site-nav] a[href="/magaza/"]')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-site-nav]')).toBeHidden();
      await expect(page.locator('.cart-access')).toBeVisible();
    }
    await page.screenshot({ path: `artifacts/showcase/store-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Sepete ekle', exact: true }).click();
  await page.getByRole('button', { name: 'İletişim bilgilerini gir' }).click();
  await page.getByLabel('Ad / ad-soyad').fill('Showcase Guest');
  await page.getByLabel('Telefon', { exact: false }).fill('+90 555 123 4567');
  const orderResponse = page.waitForResponse(response => response.url() === base + '/yardimci-asistan/api/order.php' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Siparişi gönder', exact: true }).click();
  assert.equal((await orderResponse).status(), 201);
  await expect(page.locator('#success')).toBeVisible();
  assert.ok(commerceRequests.includes('/yardimci-asistan/api/catalog.php'));
  assert.ok(commerceRequests.includes('/yardimci-asistan/api/order.php'));
  assert.ok(commerceRequests.every(path => path.startsWith('/yardimci-asistan/api/')));
  // Both routes share the same module-scoped cart, while generic hosting keeps its own shell.
  await page.getByRole('button', { name: 'Yeni sipariş başlat' }).click();
  await page.getByRole('button', { name: 'Sepete ekle', exact: true }).click();
  await page.goto(base + '/yardimci-asistan/magaza/');
  await expect(page.getByRole('article')).toContainText('Örnek ürün');
  await expect(page.locator('#cart-lines')).toContainText('Örnek ürün');
  await expect(page.locator('.site-header, .site-footer, #yardimci-asistan-widget')).toHaveCount(0);
  await page.getByRole('button', { name: 'Temizle', exact: true }).click();
  await page.goto(base + '/iletisim/'); await expect(page.locator('[data-business-phone]').first()).toContainText('+90 555'); await expect(page.locator('[data-business-map-frame]')).toBeVisible();
  const mapFrame = page.locator('[data-business-map-frame]');
  await expect(mapFrame).toHaveAttribute('src', /openstreetmap.org\/export\/embed/);
  const canonical = { business_name: 'Örnek işletme', phone: '+90 555 000 0000', address: 'Örnek adres', latitude: 41, longitude: 29 };
  const embedUrl = 'https://www.google.com/maps/embed?pb=!1m18!2m3';
  let mapRevision = 2;
  for (const [mode, url, google] of [
    ['google_maps_embed', embedUrl, true],
    ['manual', embedUrl, false],
    ['google_maps_embed', 'https://evil.test/maps/embed?pb=x', false],
    ['google_maps_embed', '', false]
  ]) {
    seed('business_context', { ...canonical, mapDisplayMode: mode, googleMapsEmbedUrl: url }, ++mapRevision);
    await page.reload();
    const invalidGoogleSelection = mode === 'google_maps_embed' && !google;
    if (invalidGoogleSelection) {
      await expect(mapFrame).toBeHidden();
      await expect(page.locator('[data-business-map-placeholder]')).toBeVisible();
    } else {
      await expect(mapFrame).toHaveAttribute('src', google ? embedUrl : /openstreetmap.org\/export\/embed/);
    }
    await expect(mapFrame).toHaveAttribute('loading', 'lazy');
    await expect(mapFrame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    await expect(mapFrame).toHaveAttribute('title', 'İşletme konumu');
    if (google) await expect(page.locator('[data-business-map-attribution]')).toBeHidden(); else if (mode === 'manual') await expect(page.locator('[data-business-map-attribution]')).toBeVisible(); else await expect(page.locator('[data-business-map-attribution]')).toBeHidden();
    const publicBusiness = (await (await page.request.get(base + '/yardimci-asistan/api/business.php')).json()).business;
    assert.equal(publicBusiness.latitude, 41); assert.equal(publicBusiness.longitude, 29);
    assert.equal(publicBusiness.mapDisplayMode, mode);
    assert.equal(publicBusiness.googleMapsEmbedUrl, url === embedUrl ? embedUrl : '');
    if (invalidGoogleSelection) continue;
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const bounds = await mapFrame.boundingBox(); assert.ok(bounds.width > 0 && bounds.width <= width);
    }
  }
  seed('business_context', { ...canonical, mapDisplayMode: 'google_maps_embed', googleMapsEmbedUrl: embedUrl, latitude: null, longitude: null }, ++mapRevision);
  await page.reload(); await expect(mapFrame).toHaveAttribute('src', embedUrl);
  seed('business_context', { ...canonical, latitude: null, longitude: null }, ++mapRevision);
  await page.reload(); await expect(mapFrame).toBeHidden();
  await expect(page.locator('[data-business-map-placeholder]')).toBeVisible();
  seed('business_context', canonical, ++mapRevision);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base);
  await page.reload(); for (const path of ['/odalar/', '/restoran/', '/qr-menu/', '/magaza/']) await expect(page.locator(`[data-site-nav] a[href="${path}"]`)).toHaveCount(1);
  assert.equal(await page.locator('[data-site-nav] a').first().getAttribute('href'), '/');
  // A stale snapshot claiming all capabilities cannot reopen withdrawn Web surfaces.
  seed('android_snapshot', { enabled: true, business_capabilities: ['service.android', 'accommodation.rooms', 'food_service.tables', 'channel.qr_menu', 'channel.online_sales'] }, 2);
  for (const [publication] of surfaces) seed(publication, { enabled: false }, 2);
  await assertSurfaces(false);
  const withdrawnMenu = await page.request.get(base + '/yardimci-asistan/api/menu.php');
  assert.equal(withdrawnMenu.status(), 404);
  for (const [publication] of surfaces) seed(publication, { enabled: true }, 3);
  await assertSurfaces(true);
  seed('android_snapshot', { enabled: false, business_capabilities: [] }, 3);
  await assertSurfaces(true);
  assert.equal((await page.request.get(base + '/yardimci-asistan/api/menu.php')).status(), 200);
  // Real Desktop channel intent projects through the existing online publication owner/transport.
  const settingsFixture = new DatabaseSync(f.db.databasePath);
  try { settingsFixture.exec('UPDATE settings SET online_sales_delivery_enabled = 0'); } finally { settingsFixture.close(); }
  setBusinessCapability(f.db.databasePath, { capability: 'channel.online_sales', enabled: true });
  const product = saveRuntimeCatalogProduct(f.db.databasePath, { name: 'Canonical showcase product', salePrice: 50, trackInventory: false });
  const onlineCatalog = f.db.createCommerceOnlineCatalog();
  assert.equal(f.db.getSetupData().onlineSalesDeliveryEnabled, false, 'capability ON does not activate delivery');
  assert.equal(onlineCatalog.enabled, true);
  assert.deepEqual(onlineCatalog.deliveryMethods, []);
  assert.ok(onlineCatalog.products.some(item => item.productId === product.id));
  const onlinePublish = await transport.publishOnlineCatalog({ value: onlineCatalog, sourceRevision: 4, idempotencyKey: 'showcase-store-on-4' });
  assert.equal(onlinePublish.ok, true, onlinePublish.message);
  await assertSurfaces(true);
  await page.goto(base + '/magaza/');
  await expect(page.getByRole('article')).toContainText('Canonical showcase product');
  await expect(page.getByRole('status').filter({ hasText: 'online sipariş almıyor' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sepete ekle' })).toBeDisabled();
  const pickupFixture = new DatabaseSync(f.db.databasePath);
  try { pickupFixture.exec('UPDATE settings SET online_sales_delivery_enabled = 1, online_sales_pickup_enabled = 1, online_sales_shipping_enabled = 0'); } finally { pickupFixture.close(); }
  const pickupPublish = await transport.publishOnlineCatalog({ value: f.db.createCommerceOnlineCatalog(), sourceRevision: 5, idempotencyKey: 'showcase-pickup-on-5' });
  assert.equal(pickupPublish.ok, true, pickupPublish.message);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sepete ekle' })).toBeEnabled();
  await assertSurfaces(true);
  setBusinessCapability(f.db.databasePath, { capability: 'channel.online_sales', enabled: false });
  const onlineWithdrawal = await transport.publishOnlineCatalog({ value: f.db.createCommerceOnlineCatalog(), sourceRevision: 6, idempotencyKey: 'showcase-store-off-6' });
  assert.equal(onlineWithdrawal.ok, true, onlineWithdrawal.message);
  await page.goto(base);
  await expect(page.locator('[data-site-nav] a[href="/magaza/"]')).toHaveCount(0);
  await expect(page.locator('.demo-surface-card a[href="/magaza/"]')).toHaveCount(0);
  assert.equal((await (await page.request.get(base + '/yardimci-asistan/api/business.php')).json()).business.public_surfaces.includes('store'), false);
  const a = f.media.importBytes(imageBytes, 'upload'), b = f.media.importBytes(imageBytes, 'upload'), c = f.media.importBytes(imageBytes, 'upload');
  const content = f.service.saveContent(editorialInput());
  let publication = f.service.savePublication({ contentId: content.content.id, channel: 'website', placement: 'homepage_feature', title: 'Demo kampanya', text: 'İlk paylaşım', mediaAssetIds: [a.id, b.id] });
  publication = f.service.publish(publication.id, publication.revision); await push();
  for (const route of ['/', '/duyurular/']) { await page.goto(base + route); await expect(page.locator('.ya-marketing-card')).toHaveCount(1); await expect(page.locator('.ya-marketing-gallery img')).toHaveCount(2); }
  publication = f.db.listMarketingPublications()[0]; publication = f.service.savePublication({ ...publication, expectedRevision: publication.revision, text: 'Yeni metin', mediaAssetIds: [b.id, c.id] }); await push();
  for (const route of ['/', '/duyurular/']) { await page.goto(base + route); await expect(page.locator('.ya-marketing-text')).toHaveText('Yeni metin'); const urls = await page.locator('.ya-marketing-gallery img').evaluateAll(nodes => nodes.map(n => n.src)); assert.ok(urls[0].includes(b.id)); assert.ok(urls[1].includes(c.id)); }
  publication = f.db.listMarketingPublications()[0]; f.service.unpublish(publication.id, publication.revision); await push();
  for (const route of ['/', '/duyurular/']) { await page.goto(base + route); await expect(page.locator('[data-marketing-surface]')).toBeHidden(); await expect(page.locator('.ya-marketing-card')).toHaveCount(0); }
  for (const route of ['/odalar/', '/odalar/oda/', '/restoran/', '/restoran/masa/', '/yorumlar/', '/iletisim/', '/kullanim-kilavuzu/', '/magaza/', '/yardimci-asistan/magaza/', '/yardimci-asistan/duyurular/']) { const response = await page.goto(base + route); assert.equal(response.status(), 200); await expect(page.locator('#demo-sync-secret')).toHaveCount(0); assert.ok(!(await response.text()).includes(secret)); }
  await page.goto(base + '/kurulum/'); await expect(page.locator('#demo-sync-secret')).toHaveValue(secret);
  await page.goto(base); for (const width of [375, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${width}`); }
  await page.setViewportSize({ width: 375, height: 900 }); await page.locator('[data-menu-toggle]').click(); await expect(page.locator('[data-site-nav]')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.locator('[data-site-nav]')).toBeHidden();
  await page.emulateMedia({ reducedMotion: 'reduce' }); assert.equal(await page.locator('.showcase-hero-image').evaluate(node => getComputedStyle(node).animationName), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' }); assert.equal(await page.locator('.showcase-hero-image').evaluate(node => getComputedStyle(node).animationName), 'showcase-pan');
  // Existing Google normalizer remains the source of visitor data; provider calls stay mocked.
  const reviewsRaw = { rating: 4.8, userRatingCount: 42, googleMapsUri: 'https://maps.google.com/', reviews: Array.from({ length: 4 }, (_, i) => ({ rating: 5, text: { text: `Örnek yorum ${i}` }, authorAttribution: { displayName: `Ziyaretçi ${i}` } })) };
  const normalized = spawnSync('php', ['-r', 'require $argv[1]; echo json_encode(ya_google_reviews_normalize_place(json_decode($argv[2],true),5));', resolve('firm-template/web-module/lib/google-reviews.php'), JSON.stringify(reviewsRaw)], { encoding: 'utf8' }); assert.equal(normalized.status, 0);
  await page.route('**/api/google-reviews.php', route => route.fulfill({ contentType: 'application/json', body: normalized.stdout }));
  await page.reload(); await expect(page.locator('[data-google-rating]')).toContainText('4.8'); await expect(page.locator('[data-google-review-list] blockquote')).toHaveCount(3);
  await page.goto(base + '/yorumlar/'); await expect(page.locator('[data-google-review-list] blockquote')).toHaveCount(4);
  await page.goto(base);
  mkdirSync('artifacts/showcase', { recursive: true }); await page.screenshot({ path: 'artifacts/showcase/mobile.png', fullPage: true }); await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: 'artifacts/showcase/desktop.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Showcase routes, host-owned availability navigation, demo-only secret, downloads, real publication multi-image/edit/reorder/remove/add/unpublish, mobile menu and reduced motion passed.');
} finally { await browser?.close(); coordinator.stop(); php.kill(); await new Promise(r => php.once('exit', r)); f.dispose(); rmSync(root, { recursive: true, force: true }); }
