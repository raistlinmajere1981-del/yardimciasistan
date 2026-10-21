import assert from 'node:assert/strict';
import { installDemoSite } from './test-helpers/demo-site.mjs';
import { DatabaseSync } from 'node:sqlite';
import { activateFixtureSource } from './test-helpers/publication-protocol.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import http from 'node:http';
import { chromium, expect } from '@playwright/test';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';
import { marketingFixture, imageBytes, editorialInput } from './test-helpers/marketing-fixtures.mjs';
import { checkShowcaseStoreImages } from './test-helpers/showcase-store-images.mjs';
// Full-page screenshots do not trigger loading="lazy" below the viewport.
// Visit every viewport, wait for actual image decoding, then return to the top.
async function loadPreviewImages(page) {
  await page.evaluate(() => document.fonts.ready);
  let reachedBottom = false;
  for (let step = 0; step < 200; step++) {
    reachedBottom = await page.evaluate(async step => {
      const offset = step * Math.max(1, Math.floor(innerHeight * .75));
      scrollTo({ top: offset, behavior: 'instant' });
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      return scrollY + innerHeight >= document.documentElement.scrollHeight - 1;
    }, step);
    const inView = page.locator('img:visible');
    for (const img of await inView.all()) {
      const intersects = await img.evaluate(node => { const r = node.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
      if (!intersects) continue;
      const src = await img.getAttribute('src');
      await expect.poll(() => img.evaluate(node => node.complete && node.naturalWidth > 0), { message: `Image failed to load: ${src}`, timeout: 10000 }).toBe(true);
      await img.evaluate(node => node.decode());
    }
    if (reachedBottom) break;
  }
  assert.ok(reachedBottom, 'Preview scroll must reach the end of the page');
  await expect.poll(() => page.locator('img:visible').evaluateAll(nodes => nodes.filter(node => !node.complete || node.naturalWidth === 0).map(node => node.getAttribute('src'))), { message: 'All rendered images must be loaded before capture' }).toEqual([]);
  const images = await page.locator('img:visible').evaluateAll(nodes => nodes.map(node => ({ src: new URL(node.currentSrc).pathname, width: node.naturalWidth, height: node.naturalHeight })));
  await page.evaluate(async () => {
    scrollTo({ top: 0, behavior: 'instant' });
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
  return images;
}

// Preview-only labels: fixtures and the live site's publication path stay intact.
async function labelPreviewFixtures(page, language) {
  await page.evaluate(english => {
    const notice = document.createElement('aside');
    notice.dataset.previewNotice = '';
    notice.textContent = english
      ? 'DEMO PREVIEW · Download files are isolated test fixtures, not installable packages. Homepage examples are static presentation content.'
      : 'DEMO ÖNİZLEME · İndirme dosyaları izole test verileridir; kurulum paketi değildir. Ana sayfa örnekleri sabit tanıtım içeriğidir.';
    notice.style.cssText = 'padding:12px 20px;background:var(--cream);color:var(--navy);border-bottom:1px solid var(--line);font:600 12px/1.6 var(--sans);text-align:center';
    document.body.prepend(notice);
  }, language === 'en');
  await expect(page.locator('[data-preview-notice]')).toBeVisible();
}

const require = createRequire(import.meta.url);
const { PhpHostingSyncTransport } = require('../packages/sync-core/dist');
const { SyncCoordinator } = require('../apps/desktop-app/dist-electron/sync-coordinator.js');
const { SyncOutboxPublisher } = require('../apps/desktop-app/dist-electron/sync-outbox-publisher.js');
const { setBusinessCapability } = require('../apps/desktop-app/dist-electron/business-capability-store.js');
const { saveRuntimeCatalogProduct } = require('../apps/desktop-app/dist-electron/commerce-runtime.js');
const root = mkdtempSync(join(tmpdir(), 'ya-showcase-')), f = marketingFixture();
const moduleRoot = installDemoSite(root);
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
const outbox = new SyncOutboxPublisher({database:f.db,marketingWebsite:f.publisher,getSyncConfig:()=>config,createAndroidSnapshot:()=>({}),onDashboardChanged:()=>{}},()=>false,()=>'',()=>{});
const push = async () => { clearOthers(); const result = await outbox.publishOutbox(transport); assert.deepEqual(result.errors, []); };
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
  browser = await launchChromiumForSmoke(chromium);
  await checkShowcaseStoreImages(browser);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], assetErrors = [], consoleErrors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && new URL(response.url()).pathname.startsWith('/assets/')) assetErrors.push(response.url()); });
  page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) consoleErrors.push(message.text()); });
  await page.goto(base); await expect(page.locator('#demo-sync-secret')).toHaveValue(secret);
  assert.equal(await page.locator('script[type="module"]').count(), 0);
  assert.ok(!/Canlı Sistem|fixture|public API referansı|Canlı referans site/.test(await page.locator('body').innerText()));
  await expect(page.locator('[data-site-nav] a[href="/odalar/"]')).toHaveCount(0);
  await expect(page.locator('[data-marketing-wrapper], [data-marketing-surface], [data-google-reviews], [data-room-list]')).toHaveCount(0);
  await expect(page.locator('[data-showcase-section]')).toHaveCount(6);
  await expect(page.locator('[data-site-nav]>a')).toHaveCount(3);
  await expect(page.locator('[data-site-nav] a[href="/kullanim-kilavuzu/"]')).toHaveCount(0);
  await expect(page.locator('.download-card')).toHaveCount(5);
  await expect(page.locator('a.download-card')).toHaveCount(0);
  const release = JSON.parse(readFileSync(join(root, 'release.json'), 'utf8'));
  const packageFiles = [`YardimciAsistan-Setup-${release.desktopVersion}.exe`, `YardimciAsistan-Setup-${release.desktopVersion}-x86.exe`, `YardimciAsistan-Android-${release.androidVersion}.apk`, `YardimciAsistan-Bayi-Android-${release.dealerAndroidVersion}-pilot.apk`];
  mkdirSync(join(root, 'downloads'), { recursive: true });
  for (const file of packageFiles) writeFileSync(join(root, 'downloads', file), 'test-download');
  await page.reload();
  await expect(page.locator('a.download-card')).toHaveCount(4);
  await expect(page.locator('.download-card-unavailable')).toHaveCount(1);
  await expect(page.locator('.download-card-unavailable')).toContainText('Linux');
  for (const link of await page.locator('a.download-card').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')))) assert.equal((await fetch(base + link)).status, 200);
  writeFileSync(join(root, 'downloads', packageFiles[2]), '');
  await page.reload(); await expect(page.locator('a.download-card')).toHaveCount(3);
  writeFileSync(join(root, 'downloads', packageFiles[2]), 'test-download');
  // Profiles open real screen galleries; native dialog owns focus and keyboard navigation.
  for (const id of ['pension_restaurant', 'pension', 'restaurant', 'market']) {
    const profile = page.locator(`[data-profile="${id}"]`);
    await profile.click(); await expect(profile).toHaveAttribute('aria-expanded', 'true');
    const panel = page.locator(`[data-profile-panel="${id}"]`);
    await expect(panel).toBeVisible();
    const opener = panel.locator('a[data-gallery-image]').first();
    await opener.click();
    const gallery = page.locator('dialog.showcase-gallery');
    await expect(gallery).toBeVisible();
    await expect(gallery.locator('img')).toBeVisible();
    const before = await gallery.locator('img').getAttribute('src');
    await page.keyboard.press('ArrowRight'); await expect(gallery.locator('img')).not.toHaveAttribute('src', before);
    await page.keyboard.press('Escape'); await expect(gallery).not.toBeVisible(); await expect(opener).toBeFocused();
    await page.locator('[data-profile-close]').click(); await expect(profile).toBeFocused();
  }
  await page.locator('[data-feature-filter="mobile"]').click();
  await expect(page.locator('[data-feature-group]:visible')).toHaveCount(2);
  await page.locator('[data-feature-filter="all"]').click(); await expect(page.locator('[data-feature-group]:visible')).toHaveCount(13);
  const provenance = JSON.parse(readFileSync('test-site/landing/assets/showcase/sources.json', 'utf8'));
  for (const image of provenance.images) {
    const bytes = readFileSync(join('test-site/landing/assets/showcase', image.file));
    assert.equal(bytes.length, image.bytes, `Missing or changed showcase asset: ${image.file}`);
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', image.file);
  }
  assert.ok(provenance.images.every(image => image.bytes < 100000));
  // Repository includes four responsive/language store variants; each page uses one.
  assert.ok(provenance.images.reduce((sum, image) => sum + image.bytes, 0) < 750000);
  assert.ok(provenance.images.filter(image => image.file.startsWith('web-store')).every(image => image.bytes < 60000));
  // Compare the server-rendered introduction, excluding header availability,
  // installation metadata/secret and the real chat. No runtime publication is written.
  const introduction = async () => {
    const html = await (await fetch(base)).text();
    const start = html.indexOf('<div class="showcase-v2">');
    const end = html.indexOf('<section class="section installation-section"', start);
    assert.ok(start >= 0 && end > start);
    return html.slice(start, end);
  };
  const staticIntroduction = await introduction();
  await expect(page.locator('[data-showcase-product]')).toHaveCount(18);
  await expect(page.locator('[data-showcase-catalog] button, [data-showcase-catalog] form')).toHaveCount(0);
  await expect(page.locator('.service-grid')).toContainText('Teslimat ve kargo');
  await expect(page.locator('.service-grid')).toContainText('AI çeviri ve Dil Yönetimi');
  await expect(page.locator('.feature-grid')).toContainText('Bayi Android');
  await expect(page.locator('[data-profile="market"]')).toContainText('Toptan');
  await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' }));
  await page.reload();
  await expect(page.locator('[data-showcase-product]')).toHaveCount(18);
  await expect(page.locator('[data-feature-group]')).toHaveCount(13);
  await expect(page.locator('#demo-sync-secret')).toHaveValue(secret);
  await expect(page.locator('a.download-card')).toHaveCount(4);
  assert.equal(await introduction(), staticIntroduction, 'API outage must not change the introduction');
  await page.unroute('**/api/**');
  const surfaces = [
    ['room_catalog', 'rooms', '/odalar/'], ['table_catalog', 'restaurant', '/restoran/'],
    ['menu', 'qr_menu', '/qr-menu/'], ['online_catalog', 'store', '/magaza/']
  ];
  const assertSurfaces = async (visible) => {
    await page.goto(base);
    await expect(page.locator('[data-showcase-catalog]')).toBeVisible();
    await expect(page.locator('[data-showcase-product]:visible')).toHaveCount(18);
    const business = (await (await page.request.get(base + '/yardimci-asistan/api/business.php')).json()).business;
    for (const [, surface, path] of surfaces) {
      await expect(page.locator(`[data-site-nav] a[href="${path}"]`)).toHaveCount(visible ? 1 : 0);
      await expect(page.locator(`.demo-surface-card a[href="${path}"]`)).toHaveCount(1);
      assert.equal(await introduction(), staticIntroduction, `Publication availability must not change the introduction: ${surface}`);
      assert.equal(business.public_surfaces.includes(surface), visible, surface);
    }
  };
  await assertSurfaces(false);
  await page.goto(base + '/magaza/');
  await expect(page.locator('#catalog-state')).toContainText('online sipariş almıyor');
  await expect(page.locator('.product-card, [data-showcase-product]')).toHaveCount(0);
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
    await page.locator('link[href="/assets/css/storefront.css"]').evaluate(node => { node.sheet.disabled = true; });
    assert.deepEqual(await chromeStyles(), styled, `store CSS must not change host/widget ${width}`);
    await page.locator('link[href="/assets/css/storefront.css"]').evaluate(node => { node.sheet.disabled = false; });
    assert.equal(await page.locator('#products-title').evaluate(node => getComputedStyle(node).fontSize), '24px');
    assert.equal(await page.locator('.product-card').evaluate(node => getComputedStyle(node).paddingTop), '0px');
    if (width < 960) {
      await expect(page.locator('[data-site-nav]')).toBeHidden();
      await page.locator('[data-menu-toggle]').click();
      await page.locator('[data-live-menu]>summary').click();
      await expect(page.locator('[data-site-nav] a[href="/magaza/"]')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-live-menu]')).not.toHaveAttribute('open', '');
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
  // The site owns its cart; the API service exposes no standalone shop or renderer.
  await page.getByRole('button', { name: 'Yeni sipariş başlat' }).click();
  await page.getByRole('button', { name: 'Sepete ekle', exact: true }).click();
  await page.reload();
  await expect(page.locator('#cart-lines')).toContainText('Örnek ürün');
  for (const path of ['/magaza/', '/duyurular/', '/bayi/', '/widget.js', '/assets/business-map.js']) {
    assert.equal((await page.request.get(base + '/yardimci-asistan' + path)).status(), 404, path);
  }
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
  saveRuntimeCatalogProduct(f.db.databasePath, { id: product.id, name: 'Updated live product', salePrice: 75, trackInventory: false });
  const pickupPublish = await transport.publishOnlineCatalog({ value: f.db.createCommerceOnlineCatalog(), sourceRevision: 5, idempotencyKey: 'showcase-pickup-on-5' });
  assert.equal(pickupPublish.ok, true, pickupPublish.message);
  await page.reload();
  await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page.locator('.product-card')).toContainText('Updated live product');
  await expect(page.locator('.product-card')).not.toContainText('Canonical showcase product');
  await expect(page.locator('[data-showcase-product]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sepete ekle' })).toBeEnabled();
  await assertSurfaces(true);
  setBusinessCapability(f.db.databasePath, { capability: 'channel.online_sales', enabled: false });
  const onlineWithdrawal = await transport.publishOnlineCatalog({ value: f.db.createCommerceOnlineCatalog(), sourceRevision: 6, idempotencyKey: 'showcase-store-off-6' });
  assert.equal(onlineWithdrawal.ok, true, onlineWithdrawal.message);
  await page.goto(base);
  await expect(page.locator('[data-site-nav] a[href="/magaza/"]')).toHaveCount(0);
  await expect(page.locator('.demo-surface-card a[href="/magaza/"]')).toHaveCount(1);
  assert.equal(await introduction(), staticIntroduction);
  await page.goto(base + '/magaza/');
  await expect(page.locator('.product-card, [data-showcase-product]')).toHaveCount(0);
  assert.equal((await (await page.request.get(base + '/yardimci-asistan/api/business.php')).json()).business.public_surfaces.includes('store'), false);
  const a = f.media.importBytes(imageBytes, 'upload'), b = f.media.importBytes(imageBytes, 'upload'), c = f.media.importBytes(imageBytes, 'upload');
  const content = f.service.saveContent(editorialInput());
  let publication = f.service.savePublication({ contentId: content.content.id, channel: 'website', placement: 'homepage_feature', title: 'Demo kampanya', text: 'İlk paylaşım', mediaAssetIds: [a.id, b.id] });
  publication = f.service.publish(publication.id, publication.revision); await push();
  for (const route of ['/duyurular/']) { await page.goto(base + route); await expect(page.locator('.ya-marketing-card')).toHaveCount(1); await expect(page.locator('.ya-marketing-gallery img')).toHaveCount(2); }
  assert.equal(await introduction(), staticIntroduction, 'Published campaign must not enter the introduction');
  publication = f.db.listMarketingPublications()[0]; publication = f.service.savePublication({ ...publication, expectedRevision: publication.revision, text: 'Yeni metin', mediaAssetIds: [b.id, c.id] }); await push();
  for (const route of ['/duyurular/']) { await page.goto(base + route); await expect(page.locator('.ya-marketing-text')).toHaveText('Yeni metin'); const urls = await page.locator('.ya-marketing-gallery img').evaluateAll(nodes => nodes.map(n => n.src)); assert.ok(urls[0].includes(b.id)); assert.ok(urls[1].includes(c.id)); }
  assert.equal(await introduction(), staticIntroduction, 'Campaign edit must not change the introduction');
  publication = f.db.listMarketingPublications()[0]; f.service.unpublish(publication.id, publication.revision); await push();
  for (const route of ['/duyurular/']) { await page.goto(base + route); await expect(page.locator('[data-marketing-surface]')).toBeHidden(); await expect(page.locator('.ya-marketing-card')).toHaveCount(0); }
  assert.equal(await introduction(), staticIntroduction, 'Withdrawal must not change the introduction');
  for (const route of ['/odalar/', '/odalar/oda/', '/restoran/', '/restoran/masa/', '/yorumlar/', '/iletisim/', '/kullanim-kilavuzu/', '/magaza/', '/duyurular/', '/bayi/']) { const response = await page.goto(base + route); assert.equal(response.status(), 200); await expect(page.locator('#demo-sync-secret')).toHaveCount(0); assert.ok(!(await response.text()).includes(secret)); }
  const redirect = await page.request.get(base + '/kurulum/?lang=en', { maxRedirects: 0 });
  assert.equal(redirect.status(), 301); assert.equal(redirect.headers().location, '/?lang=en#kurulum');
  await page.goto(base + '/kurulum/'); await expect(page).toHaveURL(/\?lang=en#kurulum$/); await expect(page.locator('#demo-sync-secret')).toHaveValue(secret);
  await page.goto(base + '/?lang=tr');
  await page.goto(base + '/kullanim-kilavuzu/');
  for (const id of ['baslangic', 'desktop', 'web', 'rezervasyon', 'stok', 'android', 'musteri']) await expect(page.locator(`#${id}`)).toBeAttached();
  await page.locator('.guide-task a[data-gallery-image]').first().click();
  await expect(page.locator('dialog.showcase-gallery')).toBeVisible();
  await page.keyboard.press('Escape');
  // Existing Google normalizer remains the source of visitor data; provider calls stay mocked.
  const reviewsRaw = { rating: 4.8, userRatingCount: 42, googleMapsUri: 'https://maps.google.com/', googleMapsLinks: { reviewsUri: 'https://www.google.com/maps/place/example/data=!9m1!1b1' }, reviews: Array.from({ length: 4 }, (_, i) => ({ rating: 5, text: { text: `Örnek yorum ${i}` }, authorAttribution: { displayName: `Ziyaretçi ${i}` } })) };
  const normalized = spawnSync('php', ['-r', 'require $argv[1]; echo json_encode(ya_google_reviews_normalize_place(json_decode($argv[2],true),5));', resolve('firm-template/web-module/lib/google-reviews.php'), JSON.stringify(reviewsRaw)], { encoding: 'utf8' }); assert.equal(normalized.status, 0); assert.equal(JSON.parse(normalized.stdout).reviews_uri, reviewsRaw.googleMapsLinks.reviewsUri);
  await page.route('**/api/google-reviews.php', route => route.fulfill({ contentType: 'application/json', body: normalized.stdout }));
  await page.goto(base + '/yorumlar/'); await expect(page.locator('[data-google-rating]')).toContainText('4,8'); await expect(page.locator('[data-google-review-list] blockquote')).toHaveCount(4);
  await page.goto(base + '/yorumlar/?lang=en'); await expect(page.locator('[data-google-rating]')).toContainText('4.8');
  await expect(page.locator('[data-google-rating]')).toContainText('42 reviews');
  await expect(page.locator('[data-google-review-list] blockquote').first()).toContainText('Örnek yorum 0');
  await page.goto(base + '/?lang=tr');
  await page.goto(base + '/yorumlar/'); await expect(page.locator('[data-google-review-list] blockquote')).toHaveCount(4);
  const previews = [];
  for (const language of ['tr', 'en']) {
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto(`${base}/?lang=${language}`);
      await expect(page.locator('[data-google-review-list], [data-marketing-surface], [data-room-list]')).toHaveCount(0);
      await expect(page.locator('[data-showcase-product]')).toHaveCount(18);
      const cards = page.locator('[data-feature-group]:visible');
      await expect(cards).toHaveCount(width <= 540 ? 5 : 13);
      await expect(page.locator('[data-feature-filter][aria-pressed="true"]')).toHaveAttribute('data-feature-filter', width <= 540 ? 'featured' : 'all');
      if (width <= 540) {
        assert.deepEqual(new Set(await cards.evaluateAll(nodes => nodes.map(node => node.dataset.featureGroup))), new Set(['daily', 'hospitality', 'sales', 'mobile']));
        await expect(page.locator('[data-feature-filter="featured"]')).toHaveText(language === 'en' ? 'Highlights' : 'Öne çıkanlar');
      }
      // Use the keyboard for menus, filters, profiles and gallery controls.
      if (width < 1100) {
        await page.locator('[data-menu-toggle]').focus(); await page.keyboard.press('Enter');
      }
      const live = page.locator('[data-live-menu]>summary');
      await live.focus(); await page.keyboard.press('Space');
      await expect(page.locator('[data-live-menu] a').first()).toBeVisible();
      await page.keyboard.press('Escape'); await expect(page.locator('[data-live-menu]')).not.toHaveAttribute('open', '');
      if (width < 1100) { await page.keyboard.press('Escape'); await expect(page.locator('[data-site-nav]')).toBeHidden(); }
      for (const [filter, count] of [['daily', 5], ['hospitality', 2], ['sales', 4], ['mobile', 2], ['all', 13]]) {
        const button = page.locator(`[data-feature-filter="${filter}"]`);
        await button.focus(); await page.keyboard.press('Enter'); await expect(cards).toHaveCount(count);
        await expect(button).toHaveAttribute('aria-pressed', 'true');
      }
      if (width <= 540) {
        await page.locator('[data-feature-filter="featured"]').focus(); await page.keyboard.press('Enter');
        await expect(cards).toHaveCount(5);
      }
      for (const profile of await page.locator('[data-profile]').all()) {
        await profile.focus(); await page.keyboard.press('Enter');
        const opener = page.locator('[data-profile-panel]:visible a[data-gallery-image]').first();
        await opener.focus(); await page.keyboard.press('Enter');
        const gallery = page.locator('dialog.showcase-gallery');
        await expect(gallery).toBeVisible();
        await expect.poll(() => gallery.locator('img').evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
        assert.ok(await gallery.evaluate(node => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), `gallery bounds ${width} ${language}`);
        await page.keyboard.press('Escape'); await expect(gallery).not.toBeVisible(); await expect(opener).toBeFocused();
        // Let the browser finish native dialog focus restoration before Tab.
        await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
        await page.keyboard.press('Shift+Tab');
        await expect(page.locator('[data-profile-close]'), `Close profile: ${width}/${language}/${await profile.getAttribute('data-profile')}`).toBeFocused();
        await page.keyboard.press('Enter'); await expect(profile).toHaveAttribute('aria-expanded', 'false'); await expect(profile).toBeFocused();
      }
      // Restore the initial selection for the visual review, including lazy images.
      await page.reload();
      await expect(page.locator('[data-google-review-list], [data-marketing-surface], [data-room-list]')).toHaveCount(0);
      await expect(page.locator('[data-showcase-product]')).toHaveCount(18);
      await labelPreviewFixtures(page, language);
      await page.locator('[data-showcase-avatar]').scrollIntoViewIfNeeded();
      const heroRig = page.locator('[data-showcase-avatar] svg[data-nexa-rig]');
      await expect(heroRig).toHaveAttribute('data-nexa-state', 'ready');
      await expect(heroRig).toHaveAttribute('data-motion-active', 'true');
      assert.ok(await page.locator('[data-showcase-avatar]').evaluate(node => {
        const r = node.getBoundingClientRect(), p = node.parentElement.getBoundingClientRect();
        const bubble = node.querySelector('.showcase-avatar-speech-slot').getBoundingClientRect();
        const stage = node.querySelector('.showcase-avatar-stage');
        return r.left >= p.left && r.right <= p.right && bubble.left >= r.left && bubble.right <= r.right && parseFloat(getComputedStyle(stage, '::after').top) > stage.querySelector('.showcase-avatar-character').getBoundingClientRect().height;
      }), `hero bounds and ground ${width} ${language}`);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(heroRig).toHaveAttribute('data-motion-active', 'false');
      const store = page.locator('.web-story [data-gallery-responsive]');
      await store.scrollIntoViewIfNeeded();
      await expect.poll(() => store.locator('img').evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
      const storeSource = await store.locator('img').evaluate(node => node.currentSrc);
      const storeFile = `web-store${language === 'en' ? '-en' : ''}${width <= 540 ? '-mobile' : ''}.webp`;
      assert.equal(new URL(storeSource).pathname, `/assets/showcase/${storeFile}`);
      const storeMetadata = provenance.images.find(image => image.file === storeFile);
      assert.deepEqual(await store.locator('img').evaluate(node => ({ width: node.naturalWidth, height: node.naturalHeight })), { width: storeMetadata.width, height: storeMetadata.height });
      assert.ok(await store.evaluate(node => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), `Store illustration ${width}/${language}`);
      await store.focus(); await page.keyboard.press('Enter');
      const storeGallery = page.locator('dialog.showcase-gallery');
      await expect(storeGallery).toBeVisible();
      await expect(storeGallery.locator('img')).toHaveAttribute('src', storeSource);
      await expect(storeGallery.locator('[data-showcase-caption]')).toContainText(language === 'en' ? 'Illustrative products and prices' : 'Temsili ürün ve fiyatlar');
      await page.keyboard.press('Escape'); await expect(storeGallery).not.toBeVisible(); await expect(store).toBeFocused();
      const images = await loadPreviewImages(page);
      const displayedFiles = new Set(images.map(image => image.src.split('/').at(-1)));
      assert.ok(provenance.images.filter(image => displayedFiles.has(image.file)).reduce((sum, image) => sum + image.bytes, 0) < 600000, 'Displayed showcase images retain their page byte budget');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `homepage overflow ${width} ${language}`);
      await expect(page.locator('a.download-card')).toHaveCount(4);
      const suffix = language === 'tr' ? '' : '-en';
      const name = width === 1440 ? `desktop${suffix}` : width === 375 ? `mobile${suffix}` : `home-${width}${suffix}`;
      await page.screenshot({ path: `artifacts/showcase/${name}.png`, fullPage: true });
      await page.screenshot({ path: `artifacts/showcase/hero-${width}${suffix}.png` });
      // Sticky chrome belongs in the full-page preview, not across a tall section crop.
      await page.locator('#ozellikler').screenshot({ path: `artifacts/showcase/features-${width}${suffix}.png`, style: '.site-header,.skip-link,#yardimci-asistan-widget{visibility:hidden!important}' });
      await page.locator('.web-story').screenshot({ path: `artifacts/showcase/web-story-${width}${suffix}.png`, style: '.site-header,.skip-link,#yardimci-asistan-widget{visibility:hidden!important}' });
      await page.locator('[data-showcase-catalog]').screenshot({ path: `artifacts/showcase/catalog-${width}${suffix}.png`, style: '.site-header,.skip-link,#yardimci-asistan-widget{visibility:hidden!important}' });
      previews.push({ language, width, images });
      if (width === 375) {
        await page.locator('[data-feature-filter="all"]').click();
        const expanded = await loadPreviewImages(page);
        assert.equal(await page.locator('[data-feature-group]:visible').count(), 13);
        await page.screenshot({ path: `artifacts/showcase/mobile-all${suffix}.png`, fullPage: true });
        previews.push({ language, width, selection: 'all', images: expanded });
        // Resizing respects an explicit choice rather than resetting the list.
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.setViewportSize({ width: 375, height: 900 });
        await expect(cards).toHaveCount(13);
      }
    }
  }
  writeFileSync('artifacts/showcase/image-checks.json', JSON.stringify(previews, null, 2) + '\n');
  assert.deepEqual(errors, []);
  assert.deepEqual(assetErrors, []);
  assert.deepEqual(consoleErrors, []);
  console.log('Static homepage / live publication independence, 18 homepage-only sample products, TR/EN previews at 320/375/768/1440, decoded lazy images, mobile highlights, keyboard galleries, avatar bounds, showcase routes, host-owned availability navigation, demo-only secret, downloads, real publication multi-image/edit/reorder/remove/add/unpublish, mobile menu and reduced motion passed.');
} finally { await browser?.close(); coordinator.stop(); php.kill(); await new Promise(r => php.once('exit', r)); f.dispose(); rmSync(root, { recursive: true, force: true }); }
