import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
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
const { WEBSITE_PAGES, defaultWebsiteNavigation, normalizeWebsiteNavigation } = require('../packages/shared/dist');
const root = mkdtempSync(join(tmpdir(), 'ya-showcase-')), f = marketingFixture();
cpSync('test-site/landing', root, { recursive: true });
const moduleRoot = join(root, 'yardimci-asistan'); cpSync('firm-template/web-module', moduleRoot, { recursive: true });
const secret = 'showcase-only-test-key<&"';
writeFileSync(join(moduleRoot, 'config/business.json'), JSON.stringify({ sync_secret: secret, allowed_origins: [] }));
assert.deepEqual(JSON.parse(readFileSync(join(moduleRoot, 'config/website-pages.json'))), WEBSITE_PAGES);
assert.throws(() => normalizeWebsiteNavigation([{ pageId: 'evil', visible: true, order: 0 }]));
assert.throws(() => normalizeWebsiteNavigation([{ pageId: 'home', visible: true, order: 0, path: 'https://evil.example' }]));
assert.equal(existsSync('test-site/landing/demo'), false);
const port = await new Promise(resolvePort => { const server = http.createServer(); server.listen(0, '127.0.0.1', () => { const p = server.address().port; server.close(() => resolvePort(p)); }); });
const base = `http://127.0.0.1:${port}`, config = { baseUrl: `${base}/yardimci-asistan`, syncSecret: secret };
const php = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', root], { stdio: 'ignore' });
const clientId = f.db.getSyncRuntimeStatus().clientId, transport = new PhpHostingSyncTransport({ ...config, clientId });
const coordinator = new SyncCoordinator({ database: f.db, marketingWebsite: f.publisher, getSyncConfig: () => config, createAndroidSnapshot: () => ({}), onDashboardChanged: () => {}, onStatusChanged: () => {} });
let browser;
const clearOthers = () => { for (const job of f.db.getPendingSyncJobs()) if (!['website_navigation_publish', 'marketing_website_publish'].includes(job.jobType)) f.db.completeSyncJob(job.jobKey, job.sourceRevision); };
const push = async () => { clearOthers(); const result = await coordinator.publishOutbox(transport); assert.deepEqual(result.errors, []); };
const post = payload => fetch(`${config.baseUrl}/api/sync.php`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-YA-Sync-Secret': secret }, body: JSON.stringify(payload) });
// Real storage publications, isolated from a customer's runtime. Leaf endpoint regressions have their own registered smokes.
const seed = (name, value, revision = 1) => {
  const file = join(root, 'seed.json'); writeFileSync(file, JSON.stringify(value));
  const result = spawnSync('php', ['-r', 'require $argv[1]; ya_storage_publish($argv[2], json_decode(file_get_contents($argv[3]),true), "showcase-seed", (int)$argv[4], $argv[2].":".$argv[4], date(DATE_ATOM));', join(moduleRoot, 'lib/storage.php'), name, file, String(revision)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
};
try {
  for (let n = 0; n < 50; n++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  assert.ok((await transport.getCapabilities()).features.includes('website_navigation'));
  await push(); assert.equal(f.db.getSyncRuntimeStatus().enabled, false);
  const navJobRevision = Number(f.db.getSetupData().websiteNavigation.length); assert.equal(navJobRevision, 10);
  const defaults = { revision: 1, items: defaultWebsiteNavigation() };
  const navRequest = { sourceRevision: 1, idempotencyKey: 'nav-dedupe', value: defaults };
  // Separate client namespace exercises replay without colliding with desktop's revision ledger.
  const probe = new PhpHostingSyncTransport({ ...config, clientId: 'nav-probe' });
  assert.equal((await probe.publishWebsiteNavigation(navRequest)).ok, true);
  assert.equal((await probe.publishWebsiteNavigation(navRequest)).deduplicated, true);
  assert.equal((await post({ action: 'publish_website_navigation', client_id: clientId, source_revision: 9, idempotency_key: 'bad-route', navigation: { revision: 9, items: [{ pageId: 'rooms', visible: true, order: 0, path: '/evil/' }] } })).status, 422);
  browser = await launchChromiumForSmoke(chromium); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base); await expect(page.locator('#demo-sync-secret')).toHaveValue(secret);
  assert.equal(await page.locator('script[type="module"]').count(), 0);
  assert.ok(!/Canlı Sistem|fixture|public API referansı|Canlı referans site/.test(await page.locator('body').innerText()));
  await expect(page.locator('[data-site-nav] a[href="/odalar/"]')).toHaveCount(0);
  await expect(page.locator('[data-marketing-wrapper]')).toBeHidden();
  await expect(page.locator('.download-card')).toHaveCount(3);
  mkdirSync(join(root, 'downloads')); for (const link of await page.locator('.download-card').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')))) { writeFileSync(join(root, link), 'test-download'); assert.equal((await fetch(base + link)).status, 200); }
  seed('room_catalog', { enabled: true, rooms: [{ id: 'showcase-room', name: 'Örnek oda', capacity: 2, media: [], features: [] }] });
  seed('table_catalog', { enabled: true, tables: [{ id: 'showcase-table', name: 'Örnek masa', capacity: 4, area: 'Salon', media: [], features: [] }] });
  seed('menu', { enabled: true, categories: [{ id: 'drinks', name: 'İçecekler' }], items: [{ id: 'tea', name: 'Çay', category_id: 'drinks', price: 25, currency: 'TRY', is_active: true }] });
  seed('online_catalog', { enabled: true, version: 1, delivery_methods: ['pickup'], products: [{ product_id: 'showcase-product', name: 'Örnek ürün', unit: 'piece', price: 50, currency: 'TRY', tax_rate: 20, availability: 'available' }] });
  seed('business_context', { business_name: 'Örnek işletme', phone: '+90 555 000 0000', address: 'Örnek adres', latitude: 41, longitude: 29, social_links: [{ platform: 'instagram', url: 'https://instagram.com/example' }] });
  await page.goto(base + '/odalar/'); await expect(page.locator('.room-card')).toContainText('Örnek oda');
  await page.goto(base + '/odalar/oda/?id=showcase-room'); await expect(page.locator('[data-room-name]')).toContainText('Örnek oda');
  await page.goto(base + '/restoran/'); await expect(page.locator('.table-card')).toContainText('Örnek masa');
  await page.goto(base + '/restoran/masa/?id=showcase-table'); await expect(page.locator('[data-table-name]')).toContainText('Örnek masa');
  await page.goto(base + '/qr-menu/'); await expect(page.locator('.qr-menu-item')).toContainText('Çay');
  await page.goto(base + '/yardimci-asistan/magaza/'); await expect(page.getByRole('article')).toContainText('Örnek ürün');
  await page.goto(base + '/iletisim/'); await expect(page.locator('[data-business-phone]').first()).toContainText('+90 555'); await expect(page.locator('[data-business-map-frame]')).toBeVisible();
  await page.goto(base);
  await page.reload(); for (const path of ['/odalar/', '/restoran/', '/qr-menu/', '/yardimci-asistan/magaza/']) await expect(page.locator(`[data-site-nav] a[href="${path}"]`)).toHaveCount(1);
  const items = defaultWebsiteNavigation().map(item => ({ ...item, visible: item.pageId !== 'rooms', order: item.pageId === 'qr_menu' ? 0 : item.order + 10 }));
  assert.equal(f.db.saveInitialSetup({ ...f.setup, profileOptions: f.db.getSetupData().profileOptions, websiteNavigation: items }).ok, true); await push();
  await page.reload(); await expect(page.locator('[data-site-nav] a[href="/odalar/"]')).toHaveCount(0); assert.equal(await page.locator('[data-site-nav] a').first().getAttribute('href'), '/qr-menu/');
  seed('menu', { enabled: false, categories: [], items: [] }, 2); await page.reload(); await expect(page.locator('[data-site-nav] a[href="/qr-menu/"]')).toHaveCount(0);
  const a = f.media.importBytes(imageBytes, 'upload'), b = f.media.importBytes(imageBytes, 'upload'), c = f.media.importBytes(imageBytes, 'upload');
  const content = f.service.saveContent(editorialInput());
  let publication = f.service.savePublication({ contentId: content.content.id, channel: 'website', placement: 'homepage_feature', title: 'Demo kampanya', text: 'İlk paylaşım', mediaAssetIds: [a.id, b.id] });
  publication = f.service.publish(publication.id, publication.revision); await push();
  for (const route of ['/', '/duyurular/']) { await page.goto(base + route); await expect(page.locator('.ya-marketing-card')).toHaveCount(1); await expect(page.locator('.ya-marketing-gallery img')).toHaveCount(2); }
  publication = f.db.listMarketingPublications()[0]; publication = f.service.savePublication({ ...publication, expectedRevision: publication.revision, text: 'Yeni metin', mediaAssetIds: [b.id, c.id] }); await push();
  for (const route of ['/', '/duyurular/']) { await page.goto(base + route); await expect(page.locator('.ya-marketing-text')).toHaveText('Yeni metin'); const urls = await page.locator('.ya-marketing-gallery img').evaluateAll(nodes => nodes.map(n => n.src)); assert.ok(urls[0].includes(b.id)); assert.ok(urls[1].includes(c.id)); }
  publication = f.db.listMarketingPublications()[0]; f.service.unpublish(publication.id, publication.revision); await push();
  for (const route of ['/', '/duyurular/']) { await page.goto(base + route); await expect(page.locator('[data-marketing-surface]')).toBeHidden(); await expect(page.locator('.ya-marketing-card')).toHaveCount(0); }
  for (const route of ['/odalar/', '/odalar/oda/', '/restoran/', '/restoran/masa/', '/yorumlar/', '/iletisim/', '/kullanim-kilavuzu/', '/yardimci-asistan/magaza/', '/yardimci-asistan/duyurular/']) { const response = await page.goto(base + route); assert.equal(response.status(), 200); await expect(page.locator('#demo-sync-secret')).toHaveCount(0); assert.ok(!(await response.text()).includes(secret)); }
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
  f.db.queueSyncJob('website_navigation_publish'); clearOthers();
  const pending = f.db.getPendingSyncJobs().find(job => job.jobType === 'website_navigation_publish');
  const wrongAck = Object.create(transport); wrongAck.publishWebsiteNavigation = async () => ({ ok: true, source_revision: pending.sourceRevision + 1 });
  await coordinator.publishOutbox(wrongAck); assert.ok(f.db.getPendingSyncJobs('9999').some(job => job.jobType === 'website_navigation_publish'), 'wrong revision ack retains intent');
  f.db.queueSyncJob('website_navigation_publish'); await push();
  mkdirSync('artifacts/showcase', { recursive: true }); await page.screenshot({ path: 'artifacts/showcase/mobile.png', fullPage: true }); await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: 'artifacts/showcase/desktop.png', fullPage: true });
  assert.deepEqual(errors, []);
  assert.ok(!readFileSync('firm-template/web-module/lib/website-navigation.php', 'utf8').includes('sync_secret'));
  console.log('Showcase routes, demo-only secret, downloads, typed menu/availability/order, real publication multi-image/edit/reorder/remove/add/unpublish, mobile menu and reduced motion passed.');
} finally { await browser?.close(); coordinator.stop(); php.kill(); await new Promise(r => php.once('exit', r)); f.dispose(); rmSync(root, { recursive: true, force: true }); }
