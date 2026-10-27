import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, relative, resolve} from 'node:path';
import {createServer} from 'node:net';
import {pathToFileURL} from 'node:url';
import {chromium, expect} from '@playwright/test';
import {launchChromiumForSmoke} from './test-helpers/playwright-browser.mjs';
import {exercisePublicationContracts} from './test-helpers/template-publication-contracts.mjs';
import {activateFixtureSource, publicationEnvelope} from './test-helpers/publication-protocol.mjs';

if (process.argv.includes('--contracts-only') || process.argv.includes('--access-only')) {
  const checks = await exercisePublicationContracts({accessOnly:process.argv.includes('--access-only')});
  console.log('template-publication-contracts-ok: ' + checks.join('; '));
  process.exit(0);
}

const source = resolve('web-site-template');
const root = mkdtempSync(join(tmpdir(), 'ya-site-template-'));
const site = join(root, 'independent-copy'), publicRoot = join(site, 'public');
const artifacts = resolve('artifacts/web-site-template');
const processes = [], passed = [];
let browser;
const pause = milliseconds => new Promise(done => setTimeout(done, milliseconds));
function run(command, args) {
  const result = spawnSync(command, args, {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
function files(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]);
}
async function port() {
  const probe = createServer();
  await new Promise(done => probe.listen(0, '127.0.0.1', done));
  const value = probe.address().port;
  await new Promise(done => probe.close(done));
  return value;
}
async function start(address) {
  // This fixture deliberately edits PHP config/templates between requests.
  const server = spawn('php', ['-d', 'opcache.enable=0', '-d', 'opcache.enable_cli=0', '-S', address, '-t', publicRoot], {stdio: 'ignore'});
  processes.push(server);
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://${address}/assets/site/theme.css`)).ok) return; } catch {}
    if (server.exitCode !== null) throw new Error('PHP server exited');
    await pause(30);
  }
  throw new Error('PHP server startup timed out');
}
const configuration = {api_origin: '', api_base_path: '/yardimci-asistan', base_path: '', languages: ['tr'], hidden_pages: [], effects: []};
function configure(change = {}) {
  Object.assign(configuration, change);
  writeFileSync(join(site, 'site/config.php'), `<?php return json_decode(<<<'CONFIG'\n${JSON.stringify(configuration)}\nCONFIG, true);\n`);
}
const contextOf = page => page.locator('#site-context').textContent().then(JSON.parse);
async function noEffects(page, url) {
  const requests = [];
  const listener = request => requests.push(request.url());
  page.on('request', listener);
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  assert.equal(requests.some(path => /effect-engine|core\/effects\.mjs|\.scene\.json/.test(path)), false, 'Inactive mode must not fetch adapter, engine or scene');
  assert.equal(await page.locator('canvas').count(), 0);
  assert.equal(await page.evaluate(() => window.__frameRequests), 0, 'Inactive mode must not schedule animation frames');
  page.off('request', listener);
}

try {
  passed.push(...await exercisePublicationContracts());
  // All runtime assertions use this disposable copy, outside every site's source directory.
  cpSync(source, site, {recursive: true});
  mkdirSync(artifacts, {recursive: true});
  for (const file of files(site)) {
    if (file.endsWith('.php')) run('php', ['-l', file]);
    if (file.endsWith('.mjs')) run(process.execPath, ['--check', file]);
  }
  run(process.execPath, [join(source, 'tools/manifest.mjs')]);
  run('php', ['scripts/test-helpers/web-site-template-projection.php', site]);
  const provenance = JSON.parse(readFileSync(join(site, 'public/assets/vendor/effect-engine/provenance.json'), 'utf8'));
  assert.equal(provenance.version, '1.1.0');
  for (const [path, hash] of Object.entries(provenance.files)) assert.equal(createHash('sha256').update(readFileSync(join(site, 'public/assets/vendor/effect-engine', path))).digest('hex'), hash);
  // Update plans never overwrite customer-owned design/catalog files and detect core edits.
  writeFileSync(join(site, 'public/assets/site/theme.css'), readFileSync(join(site, 'public/assets/site/theme.css'), 'utf8') + '\n/* local design */\n');
  let plan = JSON.parse(run(process.execPath, [join(source, 'tools/update-plan.mjs'), source, site]));
  assert.deepEqual(plan.changes, []); assert.deepEqual(plan.conflicts, []); assert.equal(plan.writes, false);
  const coreFile = join(site, 'public/assets/core/site.css'), originalCore = readFileSync(coreFile, 'utf8');
  writeFileSync(coreFile, originalCore + '\n/* local core edit */\n');
  const conflict = spawnSync(process.execPath, [join(source, 'tools/update-plan.mjs'), source, site], {encoding: 'utf8'});
  assert.equal(conflict.status, 1); plan = JSON.parse(conflict.stdout);
  assert.deepEqual(plan.conflicts, ['public/assets/core/site.css']);
  assert.ok(readFileSync(coreFile, 'utf8').includes('local core edit'));
  writeFileSync(coreFile, originalCore);
  passed.push('syntax, projection, vendor integrity and read-only update conflicts');

  const module = join(publicRoot, 'yardimci-asistan'), moduleSource = resolve('firm-template/web-module');
  cpSync(moduleSource, module, {recursive: true, filter: path => {
    const name = relative(moduleSource, path).replaceAll('\\', '/');
    return (!name.startsWith('data/') && !name.startsWith('media/') && !name.includes('.local.')) || ['data/.htaccess', 'media/.htaccess'].includes(name);
  }});
  mkdirSync(join(module, 'data'), {recursive: true});
  const secret = 'isolated-template-fixture-secret';
  writeFileSync(join(module, 'config/business.json'), JSON.stringify({id: 'b', name: '', display_name: '', profile_id: 'market', sync_secret: secret, public_surfaces: [], allowed_origins: []}));
  writeFileSync(join(site, 'site.local.php'), "<?php return ['name'=>'LOCAL FAKE IDENTITY', 'phone'=>'5555555555'];");
  const apiPort = await port(), sitePort = await port();
  const base = `http://127.0.0.1:${sitePort}`, api = `http://127.0.0.1:${apiPort}/yardimci-asistan`;
  configure({api_origin: `http://127.0.0.1:${apiPort}`});
  await start(`127.0.0.1:${apiPort}`); await start(`127.0.0.1:${sitePort}`);
  browser = await launchChromiumForSmoke(chromium);
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.__frameRequests = 0;
    const frame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => { window.__frameRequests++; return frame(callback); };
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({width: 1440, height: 960});
  await noEffects(page, base + '/');
  await expect(page.getByRole('status')).toContainText('Henüz yayınlanmış içerik');
  assert.equal(await page.locator('#main-navigation a').count(), 1);
  assert.ok(!(await page.content()).includes('LOCAL FAKE IDENTITY'));
  assert.ok(!(await page.content()).includes(secret));
  assert.equal((await page.goto(base + '/?page=rooms')).status(), 404);
  await expect(page.locator('main')).toContainText('Bu sayfa şu anda kullanılamıyor.');
  await page.goto(base + '/?lang=en');
  assert.equal(await page.locator('html').getAttribute('lang'), 'tr');
  assert.equal(await page.locator('.language-picker').count(), 0, 'Only Turkish is shipped');
  await page.screenshot({path: join(artifacts, 'empty-desktop.png'), fullPage: true});
  await page.setViewportSize({width: 390, height: 844});
  await noEffects(page, base + '/');
  await expect(page.locator('#main-navigation')).toBeHidden();
  await page.getByRole('button', {name: 'Menüyü aç'}).click();
  await expect(page.locator('#main-navigation')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', {name: 'Menüyü aç'})).toBeFocused();
  await expect(page.locator('#main-navigation')).toBeHidden();
  await page.screenshot({path: join(artifacts, 'empty-mobile.png'), fullPage: true});
  passed.push('real API with no publications, no fake content, direct-route 404, Turkish and mobile navigation');

  await activateFixtureSource(api, secret, 'template-fixture');
  const publish = async body => {
    const response = await fetch(api + '/api/sync.php', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-YA-Sync-Secret': secret}, body: JSON.stringify(publicationEnvelope(body, 'template-fixture'))});
    assert.equal(response.status, 200, await response.text());
  };
  const publishedContext = {profile_id: 'market', business_name: 'Yayınlanan İşletme', description: 'Yayınlanan açıklama', phone: '+90 532 123 45 67', email: 'contact@example.com', address: 'Yayınlanan adres',
    mapDisplayMode: 'manual', latitude: 40.16296, longitude: 32.783079,
    aboutText: 'Yayınlanan işletme metni <script>window.injected=true</script>', gallery: [{id: 'g', url: '/yardimci-asistan/media/gallery/gallery/published.png', title: 'Yayınlanan fotoğraf', kind: 'cover', sort_order: 0}]};
  await publish({action: 'publish_business_context', business_context: publishedContext});
  await publish({action: 'publish_room_catalog', room_catalog: {version: 1, enabled: true, rooms: [{id: 'r', name: 'Yayınlanan oda', capacity: 2, nightly_price_minor: 125050, currency: 'TRY', media: []}]}});
  await publish({action: 'publish_table_catalog', table_catalog: {version: 1, enabled: true, tables: [{id: 't', name: 'Yayınlanan masa', capacity: 4, media: []}]}});
  await publish({action: 'publish_menu', menu: {enabled: true, categories: [{id: 'c', name: 'Yayınlanan menü', is_active: true}], items: [
    {id: 'm', name: 'Yayınlanan yemek', category_id: 'c', price: 12.5, currency: 'TRY', is_available: true},
    {id: 'off', name: 'GİZLİ MENÜ ÜRÜNÜ', category_id: 'c', is_available: false},
  ]}});
  await publish({action: 'publish_online_catalog', online_catalog: {version: 1, enabled: true, delivery_methods: [], categories: [], products: [
    {product_id: 'p', name: 'Yayınlanan ürün', description: 'Yayınlanan ürün açıklaması', price: 0, tax_rate: 0, currency: 'TRY', unit: 'piece', availability: 'available', image_url: ''},
  ]}});
  await publish({action: 'publish_marketing_website', marketing: {version: 1, enabled: true, publications: [
    {id: 'm', channel: 'website', placement: 'homepage_feature', revision: 1, published: true, title: 'Yayınlanan duyuru', text: 'Yayınlanan duyuru metni', images: []},
    {id: 'off', channel: 'website', placement: 'homepage_feature', revision: 1, published: false, title: 'GİZLİ DUYURU', text: 'Kapalı', images: []},
  ]}});
  await page.goto(base + '/');
  assert.equal(await page.locator('#main-navigation a').count(), 9, 'Published hybrid surfaces work even with the market profile');
  assert.equal((await contextOf(page)).features.orders, false, 'Delivery OFF leaves the public catalog visible');
  await context.route('https://www.openstreetmap.org/export/embed.html**', async route => route.fulfill({status: 200, contentType: 'text/html', body: '<title>Map fixture</title>'}));
  for (const [id, content] of [['about', 'Yayınlanan işletme metni'], ['rooms', 'Yayınlanan oda'], ['restaurant', 'Yayınlanan masa'], ['menu', 'Yayınlanan yemek'], ['catalog', 'Yayınlanan ürün'], ['gallery', 'Yayınlanan fotoğraf'], ['announcements', 'Yayınlanan duyuru'], ['contact', 'Yayınlanan adres']]) {
    assert.equal((await page.goto(base + '/?page=' + id)).status(), 200);
    await expect(page.locator('main')).toContainText(content);
    assert.equal(await page.evaluate(() => window.injected), undefined, 'Public text must remain escaped text');
    assert.ok(!(await page.content()).includes('GİZLİ MENÜ ÜRÜNÜ'));
    assert.ok(!(await page.content()).includes('GİZLİ DUYURU'));
  }
  await page.goto(base + '/?page=contact');
  const mapFrame = page.locator('.contact-map iframe');
  await expect(mapFrame).toBeVisible();
  assert.match(await mapFrame.getAttribute('src'), /^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?/);
  assert.match(await mapFrame.getAttribute('src'), /marker=40\.16296%2C32\.783079/);
  await expect(page.locator('.contact-map-attribution')).toContainText('OpenStreetMap');
  assert.match(await page.locator('main a[href*="maps/dir/"]').getAttribute('href'), /destination=40\.16296%2C32\.783079/);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({width,height: 844});
    await page.goto(base + '/?page=contact');
    await expect(page.locator('.contact-map iframe')).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No contact map horizontal overflow at '+width);
  }
  passed.push('manual coordinates render external directions + embedded map responsively');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({width, height: 960});
    await page.goto(base + '/');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No horizontal overflow at ${width}`);
    if (width >= 768) await expect(page.locator('#main-navigation')).toBeVisible();
    await page.screenshot({path: join(artifacts, `published-${width}.png`), fullPage: true});
  }
  const withoutJs = await browser.newContext({javaScriptEnabled: false, viewport: {width: 390, height: 844}});
  const staticPage = await withoutJs.newPage(); await staticPage.goto(base + '/?page=rooms');
  await expect(staticPage.locator('#main-navigation')).toBeVisible(); await expect(staticPage.locator('main')).toContainText('Yayınlanan oda');
  await withoutJs.close();
  assert.equal((await page.goto(base + '/?page=rooms&id=r')).status(), 200);
  await expect(page.locator('main h1')).toHaveText('Yayınlanan oda');
  assert.equal((await page.goto(base + '/?page=rooms&id=missing')).status(), 404);
  passed.push('published PHP pages, capability projection, escaped text, catalog without delivery, 320/390/768/1440 px and no-JS');

  const {exerciseTemplateTranslations} = await import('./test-helpers/template-translations.mjs');
  await exerciseTemplateTranslations({page, base, api, publish, site, root, publishedContext});
  passed.push('Desktop automatic de/fr/ar, catalog hashes, manual priority, failures, per-key fallback, RTL and language withdrawal');

  await publish({action: 'publish_room_catalog', room_catalog: {enabled: false, rooms: [{id: 'r', name: 'ESKİ ODA'}]}});
  await publish({action: 'publish_menu', menu: {enabled: false, categories: [], items: []}});
  await publish({action: 'publish_online_catalog', online_catalog: {enabled: false, products: []}});
  await publish({action: 'publish_marketing_website', marketing: {version: 1, enabled: false, publications: []}});
  await page.goto(base + '/');
  for (const id of ['rooms', 'menu', 'catalog', 'announcements']) {
    assert.equal(await page.locator(`#main-navigation a[href*="page=${id}&"]`).count(), 0);
    assert.equal((await page.goto(base + '/?page=' + id)).status(), 404);
    assert.ok(!(await page.content()).includes('ESKİ ODA'));
  }
  configure({api_origin: 'http://127.0.0.1:1'});
  await page.goto(base + '/'); await expect(page.getByRole('status')).toContainText('İçerik şu anda görüntülenemiyor.');
  assert.equal(await page.locator('#main-navigation a').count(), 1);
  assert.ok(!(await page.content()).includes('Yayınlanan İşletme'), 'No stale fallback on API outage');
  configure({api_origin: `http://127.0.0.1:${apiPort}`});
  passed.push('withdrawn publication, hidden direct routes and API outage without stale business content');

  // Site-owned static visual fixture; no business data, samples or scenes ship in the template.
  mkdirSync(join(site, 'site/views/components'), {recursive: true});
  writeFileSync(join(publicRoot, 'assets/site/media/static.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
  writeFileSync(join(site, 'site/views/components/hero.php'), `<?php namespace YaSite; ?><section class="hero"><h1><?= e($view['publication']['name']) ?></h1><figure style="width:280px"><img data-effect-slot="hero" src="<?= e(asset($site, 'site/media/static.png')) ?>" width="280" height="280" alt=""></figure></section>`);
  configure({effects: {hero: 'missing.scene.json'}});
  await noEffects(page, base + '/');
  assert.ok(await page.locator('img[data-effect-slot]').evaluate(image => image.complete && image.naturalWidth > 0));
  assert.deepEqual((await contextOf(page)).effects, []);
  const {defaultParams} = await import(pathToFileURL(join(site, 'public/assets/vendor/effect-engine/src/registry/effects.mjs')));
  const scene = {format: 'efekt-atolyesi', version: 1, name: 'Test scene', seed: 'test', photo: {src: 'assets/static.png', width: 1, height: 1, name: 'Test static raster'},
    zones: [{id: 'zone', name: 'Test zone', visible: true, points: [[0, 0], [1, 0], [1, 1], [0, 1]]}],
    effects: [{id: 'effect', type: 'sunlight', zoneId: 'zone', seed: 'test', enabled: true, params: {...defaultParams('sunlight'), count: 10}}]};
  const sceneFile = join(publicRoot, 'assets/site/scenes/hero.scene.json');
  writeFileSync(sceneFile, '{malformed'); configure({effects: {hero: 'hero.scene.json'}});
  await noEffects(page, base + '/');
  writeFileSync(sceneFile, JSON.stringify(scene));
  const constrained = await browser.newContext({reducedMotion: 'reduce'});
  await constrained.addInitScript(() => { window.__frameRequests = 0; const frame = requestAnimationFrame; window.requestAnimationFrame = callback => { window.__frameRequests++; return frame(callback); }; });
  const reducedPage = await constrained.newPage(), reducedRequests = [];
  reducedPage.on('request', request => reducedRequests.push(request.url()));
  await reducedPage.goto(base + '/'); await reducedPage.waitForLoadState('networkidle');
  assert.equal(reducedRequests.some(url => url.includes('effect-engine') || url.endsWith('.scene.json')), false);
  assert.equal(await reducedPage.locator('canvas').count(), 0);
  assert.equal(await reducedPage.evaluate(() => window.__frameRequests), 0);
  await constrained.close();
  const activeContext = await browser.newContext({reducedMotion: 'no-preference', viewport: {width: 1440, height: 960}});
  await activeContext.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', {get: () => 8});
    Object.defineProperty(navigator, 'deviceMemory', {get: () => 8});
    Object.defineProperty(navigator, 'connection', {value: {saveData: false, addEventListener() {}, removeEventListener() {}}});
  });
  const activePage = await activeContext.newPage();
  await activePage.goto(base + '/');
  await expect(activePage.locator('canvas.canvas-overlay')).toHaveCount(1);
  await expect.poll(() => activePage.evaluate(async () => {
    const {ticker} = await import('/assets/vendor/effect-engine/src/runtime/ticker.mjs');
    return ticker.activeCount;
  })).toBe(1);
  await activePage.emulateMedia({reducedMotion: 'reduce'});
  await expect(activePage.locator('canvas')).toHaveCount(0);
  assert.deepEqual(await activePage.evaluate(async () => {
    const {ticker} = await import('/assets/vendor/effect-engine/src/runtime/ticker.mjs');
    return {active: ticker.activeCount, scheduled: ticker.scheduled};
  }), {active: 0, scheduled: false});
  await activePage.emulateMedia({reducedMotion: 'no-preference'});
  await expect(activePage.locator('canvas')).toHaveCount(1);
  await activePage.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect(activePage.locator('canvas')).toHaveCount(0);
  await activePage.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true})));
  await expect(activePage.locator('canvas')).toHaveCount(1);
  await activeContext.close();
  scene.effects[0].enabled = false; writeFileSync(sceneFile, JSON.stringify(scene));
  const inactiveRequests = []; page.on('request', request => inactiveRequests.push(request.url()));
  await page.goto(base + '/'); await page.waitForLoadState('networkidle');
  assert.equal(inactiveRequests.some(url => url.includes('effect-engine')), false, 'No active layer means no engine import');
  assert.equal(await page.evaluate(() => window.__frameRequests), 0);
  assert.equal(await page.locator('canvas').count(), 0);
  passed.push('static visual, missing/malformed scene, reduced motion, inactive layers, engine activation and scheduler teardown');
  assert.deepEqual(errors, []);
  await context.close();
  console.log(`web-site-template-smoke-ok: ${passed.length} groups\n${passed.map(value => '  ' + value).join('\n')}`);
} finally {
  await browser?.close();
  for (const server of processes) {
    server.kill();
    await new Promise(done => server.exitCode !== null ? done() : server.once('exit', done));
  }
  rmSync(root, {recursive: true, force: true});
}
