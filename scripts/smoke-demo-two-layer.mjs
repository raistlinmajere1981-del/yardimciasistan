import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { installDemoSite } from './test-helpers/demo-site.mjs';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';
import { createSmokeSetupInput } from './test-helpers/desktop-setup.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require('../apps/desktop-app/dist-electron/database.js');
const { createPublicRoomCatalog } = require('../apps/desktop-app/dist-electron/public-room-catalog-publication.js');
const { createCurrentBusinessWebContext } = require('../apps/desktop-app/dist-electron/business-ai-context-service.js');
const { readPublicSiteCatalog } = require('../apps/desktop-app/dist-electron/public-site-catalog.js');
const { publishDesktopProjection } = require('../apps/desktop-app/dist-electron/desktop-publication-service.js');
const core = require('../packages/sync-core/dist/index.js');

const root = mkdtempSync(join(tmpdir(), 'ya-demo-two-layer-'));
const site = join(root, 'site');
const secret = 'two-layer-demo-secret-key';
const hosting = installDemoSite(site, {httpApi:true});
const configPath = join(hosting, 'config/business.json');
writeFileSync(configPath, JSON.stringify({ ...JSON.parse(readFileSync(configPath, 'utf8')), sync_secret: secret }));

const listener = createServer();
await new Promise(done => listener.listen(0, '127.0.0.1', done));
const port = listener.address().port;
await new Promise(done => listener.close(done));

const base = `http://127.0.0.1:${port}`;
const config = { baseUrl: `${base}/yardimci-asistan`, syncSecret: secret };
const php = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', site], {
  env: { ...process.env, PHP_CLI_SERVER_WORKERS: '4', YA_SITE_API_ORIGIN:base, YA_ACCOUNT_SITE_URL:`${base}/deneme/hesabim/` },
  stdio: 'ignore', detached:true
});
const desktop = new DesktopDatabase({ appPath: resolve('apps/desktop-app'), userDataPath: join(root, 'desktop') });

let browser;

try {
  // Wait for PHP server
  for (let n = 0; n < 100; n++) {
    try {
      const res = await fetch(`${config.baseUrl}/api/business.php`);
      if (res.ok) break;
    } catch {}
    await new Promise(done => setTimeout(done, 25));
  }

  desktop.initialize();
  assert.equal(
    desktop.saveInitialSetup(createSmokeSetupInput({
      businessName: 'İki Katmanlı Demo Test',
      profileId: 'pension_restaurant',
      profileOptions: ['channel.online_sales', 'channel.qr_menu', 'customer.requests'],
      phone: '+905321234567',
      whatsapp: '+905321234567',
      syncSecret: secret,
      webModuleUrl: config.baseUrl,
      servicePreferences: { whatsapp: true, android: false },
      commerceCheckout: {
        version: 1, enabled: true, demo: true, currency: 'TRY', shippingFeeMinor: null,
        bank: { name: 'DEMO Banka', accountHolder: 'DEMO İki Katman', iban: 'DEMO — GEÇERSİZ — ÖDEME YAPMAYIN' },
        legal: { version: 'demo-v2', preliminary: 'DEMO ön bilgilendirme.', agreement: 'DEMO satış sözleşmesi.' }
      },
      initialCounts: { rooms: 0, tables: 0 },
      tableCategories: []
    })).ok,
    true
  );

  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());

  console.log('1. Checking Source Discovery (Desktop Catalog Contract)...');
  const rootCatalogRes = await fetch(`${base}/?resource=translation-source`);
  assert.equal(rootCatalogRes.status, 200);
  const rootCatalog = await rootCatalogRes.json();
  assert.equal(rootCatalog.version, 1);
  assert.ok(typeof rootCatalog.revision === 'string' && rootCatalog.revision.length === 64);
  assert.ok(rootCatalog.entries['landing.brand'] !== undefined);

  const denemeCatalogRes = await fetch(`${base}/deneme/?resource=translation-source`);
  assert.equal(denemeCatalogRes.status, 200);
  const denemeCatalog = await denemeCatalogRes.json();
  assert.equal(denemeCatalog.revision, rootCatalog.revision, 'Catalog revision must be shared across upper and lower layers');

  console.log('2. Verifying Upper Layer Skeleton (/, /kullanim-kilavuzu/, /kurulum/)...');
  // Root page
  await page.goto(`${base}/`);
  await expect(page.locator('h1')).toContainText('Her işe yalnız');
  await expect(page.locator('#demo-sync-secret')).toHaveValue(secret);
  await expect(page.locator('.hero-actions a[href="/deneme/"]')).toBeVisible();
  await expect(page.locator('.hero-actions a[href="/kurulum/"]')).toBeVisible();

  // Guide page
  await page.goto(`${base}/kullanim-kilavuzu/`);
  await expect(page.locator('h1')).toHaveText('Kullanım Kılavuzu');
  await expect(page.locator('.guide-article')).toHaveCount(6);

  // Install page
  await page.goto(`${base}/kurulum/`);
  await expect(page.locator('h1')).toHaveText('Kurulum ve Demo Bağlantısı');
  await expect(page.locator('#demo-sync-secret')).toHaveValue(secret);
  await expect(page.locator('.download-card')).toHaveCount(5);

  console.log('3. Verifying Lower Layer Initial Empty State (/deneme/)...');
  await page.goto(`${base}/deneme/`);
  await expect(page.locator('.site-header')).toBeVisible();
  await expect(page.locator('.main-navigation a')).toHaveCount(1);
  await expect(page.locator('.page-grid .page-link')).toHaveCount(0);
  await expect(page.locator('.empty-state')).toBeVisible();
  // Site-owned decorative photos exist even when no business gallery/product
  // publication exists. They do not carry scene or runtime data yet.
  await expect(page.locator('.lab-scene-media img')).toHaveCount(3);
  for (const img of await page.locator('.lab-scene-media img').all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate(node => node.complete && node.naturalWidth >= 600)).toBe(true);
    assert.match(await img.getAttribute('src'), /^\/deneme\/assets\/site\/img\//);
  }
  assert.deepEqual(JSON.parse(await page.locator('#site-context').textContent()).effects, []);
  await expect(page.locator('canvas.canvas-overlay')).toHaveCount(0);
  await page.goto(`${base}/deneme/?view=visitor`);
  await expect(page.locator('.lab-visitor-landscape img')).toBeVisible();
  await page.goto(`${base}/deneme/`);
  // The launcher is a demo surface, not conditional on published product/room records.
  await expect(page.locator('script[src*="widget.js"]')).toHaveAttribute('data-api-base-url','/yardimci-asistan');
  await expect(page.locator('[data-ya-open]')).toBeVisible();
  // With no rooms published yet, rooms route returns missing state gracefully
  await page.goto(`${base}/deneme/?page=rooms`);
  await expect(page.locator('h1')).toHaveText('Bu sayfa şu anda kullanılamıyor.');

  console.log('4. Publishing Business Entities from Desktop...');
  const caps = () => desktop.getEnabledBusinessCapabilities();
  const store = desktop.translations();
  store.saveSettings({ enabled: true, sourceLanguage: 'tr', targetLanguages: ['en', 'de', 'fr', 'ar'], automatic: false });
  store.replaceSiteCatalog(await readPublicSiteCatalog(config.baseUrl));
  for (const [language, home] of [['en','Home'],['de','Startseite'],['fr','Accueil'],['ar','الرئيسية']]) {
    const record = store.get({kind:'site_text', id:`${rootCatalog.id}:page.home`}, language);
    store.saveManual({kind:'site_text',id:record.id,language,fields:record.fields.map(field=>({field:field.field,sourceHash:field.sourceHash,text:home}))});
  }
  // New presentation and guide copy travels through the same per-key published catalog.
  for (const language of ['en','de','fr','ar']) {
    for (const [key,text] of [
      ['tree.count', `fixture-${language}: {count}`],
      ['intro.message_ai', `fixture-${language} scripted tour`],
      ['guide.count', `fixture-${language}: {count}`],
      ['guide.ai.title', `fixture-${language} provider setup`]
    ]) {
      const record=store.get({kind:'site_text',id:`${rootCatalog.id}:${key}`},language);
      store.saveManual({kind:'site_text',id:record.id,language,fields:record.fields.map(field=>({field:field.field,sourceHash:field.sourceHash,text}))});
    }
  }
  const { DatabaseSync } = require('node:sqlite');
  const raw = new DatabaseSync(desktop.databasePath);
  const b = raw.prepare('SELECT id FROM business').get().id;

  raw.exec(`
    UPDATE business SET publish_rooms_web=1;
    UPDATE settings SET online_sales_delivery_enabled=1, online_sales_pickup_enabled=1;
    INSERT INTO rooms(id, name, description, bed_info, nightly_price_minor, is_active, created_at, updated_at)
    VALUES ('r1', 'Panoramik Deniz Süiti', 'Geniş balkonlu lüks süit', 'King boy çift kişilik yatak', 350000, 1, 't', 't');
    INSERT INTO catalog_categories(id, business_id, name, created_at, updated_at) VALUES ('c1', '${b}', 'Gurme Ürünler', 't', 't');
    INSERT INTO catalog_products(id, business_id, category_id, name, description, sale_price, is_active, created_at, updated_at)
    VALUES ('p1', '${b}', 'c1', 'Doğal Karadeniz Balı', 'Kestane ve yayla çiçek balı', 450.0, 1, 't', 't');
    INSERT INTO commerce_product_publications(product_id, business_id, channel, is_published, created_at, updated_at)
    VALUES ('p1', '${b}', 'online_sales', 1, 't', 't');
  `);
  raw.prepare("INSERT INTO business_public_profile(business_id, about_text, created_at, updated_at) VALUES (?, 'Karadeniz dağ eteklerinde geleneksel lezzetler ve huzurlu konaklama.', 't', 't') ON CONFLICT(business_id) DO UPDATE SET about_text='Karadeniz dağ eteklerinde geleneksel lezzetler ve huzurlu konaklama.'").run(b);

  const publish = async (job, value, send) => {
    const result = await publishDesktopProjection(desktop, config, job, value, (identity, frozen) => send({ ...config, ...identity }, frozen), { refresh: true });
    assert.equal(result?.ok, true, result?.message);
    return result;
  };

  raw.close();
  await publish('room_catalog_publish', createPublicRoomCatalog(desktop.databasePath, caps()), (o, c) => core.pushRoomCatalog({ ...o, catalog: c }));
  await publish('online_catalog_publish', desktop.createCommerceOnlineCatalog(), (o, c) => core.pushOnlineCatalog({ ...o, catalog: c }));
  await publish('dealer_access_publish', desktop.createDealerAccessProjection(), (o, value) => new core.PhpHostingSyncTransport(o).publishDealerAccess({ sourceRevision: o.sourceRevision, idempotencyKey: o.idempotencyKey, value }));
  await publish('business_context_publish', createCurrentBusinessWebContext(desktop), (o, c) => core.pushBusinessContext({ ...o, context: c }));

  const roomsCheck = await (await fetch(`${config.baseUrl}/api/rooms.php`)).json();
  const bizCheck = await (await fetch(`${config.baseUrl}/api/business.php`)).json();
  console.log('roomsCheck ok:', roomsCheck.ok, 'rooms count:', roomsCheck.rooms?.length);
  console.log('bizCheck public_surfaces:', bizCheck.business?.public_surfaces);

  console.log('5. Asserting Upper Layer Data Isolation (Principle 3)...');
  await page.goto(`${base}/`);
  const rootText = await page.locator('main').innerText();
  assert.ok(!rootText.includes('Panoramik Deniz Süiti'), 'Upper layer must NOT read published rooms');
  assert.ok(!rootText.includes('Doğal Karadeniz Balı'), 'Upper layer must NOT read published products');
  assert.ok(!rootText.includes('Karadeniz dağ eteklerinde'), 'Upper layer must NOT read published about text');
  assert.ok(!rootText.includes('3500'), 'Upper layer must NOT show business prices');

  console.log('6. Asserting Lower Layer Reflects Live Publications (Principle 4)...');
  // Lower layer rooms
  await page.goto(`${base}/deneme/?page=rooms`);
  await expect(page.locator('.main-navigation a[href*="page=rooms"]')).toBeVisible();
  await expect(page.locator('.main-navigation a[href*="page=catalog"]')).toBeVisible();
  await expect(page.locator('.main-navigation a[href*="page=restaurant"]')).toHaveCount(0);
  await expect(page.locator('.content-card')).toContainText('Panoramik Deniz Süiti');
  await expect(page.locator('.content-card')).toContainText('3.500');

  // Lower layer products (storefront with cart)
  await page.goto(`${base}/deneme/?page=catalog`);
  await expect(page.locator('main')).toContainText('Doğal Karadeniz Balı');
  await expect(page.locator('main')).toContainText('450,00');
  await expect(page.locator('button:has-text("Sepete ekle")')).toBeVisible();

  // Lower layer about
  await page.goto(`${base}/deneme/?page=about`);
  await expect(page.locator('main')).toContainText('Karadeniz dağ eteklerinde geleneksel lezzetler');
  await expect(page.locator('.lab-page-photo img')).toHaveCount(1);
  await expect.poll(() => page.locator('.lab-page-photo img').evaluate(node => node.complete && node.naturalWidth >= 600)).toBe(true);

  // Real retail transaction through the shared storefront, including an uncertain response retry.
  await page.goto(`${base}/deneme/?page=catalog`);
  await page.locator('[data-commerce-products]').getByRole('button',{name:'Sepete ekle',exact:true}).click();
  await expect(page.locator('#header-cart-count')).toHaveText('1');
  await page.goto(`${base}/deneme/?page=cart`);
  await expect(page.locator('#shopping-cart [data-cart-lines]')).toContainText('Doğal Karadeniz Balı');
  await expect(page.locator('#shopping-cart input[type=number]')).toHaveCount(1);
  await expect(page.locator('#shopping-cart input[type=number]')).toHaveValue('1');
  await page.locator('#shopping-cart [data-checkout-link]').click();
  await expect(page).toHaveURL(/page=checkout-customer/);
  await page.locator('input[name=name]').fill('Demo Buyer');
  await page.locator('input[name=phone]').fill('+905321234567');
  await page.locator('input[name=note]').fill('Original demo order note');
  await page.getByRole('button',{name:'Devam et',exact:true}).click();
  await expect(page).toHaveURL(/page=checkout-delivery/);
  await page.getByRole('link',{name:'Geri',exact:true}).click();
  await expect(page.locator('input[name=note]')).toHaveValue('Original demo order note');
  await page.getByRole('button',{name:'Devam et',exact:true}).click();
  await page.locator('select[name=deliveryMethod]').selectOption('pickup');
  await page.getByRole('button',{name:'Devam et',exact:true}).click();
  await expect(page).toHaveURL(/page=checkout-payment/);
  await expect(page.getByLabel('Havale / EFT',{exact:true})).toBeChecked();
  await expect(page.getByLabel('Kredi kartı — Yakında')).toBeDisabled();
  const quoted=page.waitForResponse(r=>r.url()===`${config.baseUrl}/api/checkout-quote.php`&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Devam et',exact:true}).click();
  const quoteResponse=await quoted;assert.equal(quoteResponse.status(),200,await quoteResponse.text());
  const {quote}=await quoteResponse.json();assert.equal(quote.total_minor,45000);assert.equal(quote.delivery_method,'pickup');
  await expect(page).toHaveURL(/page=checkout-review/);
  await expect(page.locator('.shopping-summary')).toContainText('450,00');
  await page.getByLabel('Ön bilgilendirmeyi okudum ve kabul ediyorum.').check();
  await page.getByLabel('Satış sözleşmesini kabul ediyorum.',{exact:true}).check();
  let attempt;
  await page.route(`${config.baseUrl}/api/order.php`,async route=>{attempt=route.request().postData();await route.fulfill({status:503,json:{ok:false}});},{times:1});
  await page.getByRole('button',{name:'Siparişi onayla',exact:true}).click();
  await expect(page.locator('#checkout-message')).toContainText('doğrulanamadı');
  await expect(page).toHaveURL(/page=checkout-review/);
  const intent=JSON.parse(attempt);
  assert.equal(intent.note,'Original demo order note');
  assert.equal(intent.quoteId,quote.quote_id);
  assert.equal(intent.paymentMethod,'bank_transfer');
  assert.deepEqual(intent.consent,{preliminary:true,agreement:true,marketing:false});
  // Capture the actual PHP response before checkout navigation destroys its CDP body.
  let acceptedResult;
  await page.route(`${config.baseUrl}/api/order.php`,async route=>{
    const response=await route.fetch();
    acceptedResult={status:response.status(),body:await response.json(),requestBody:route.request().postData()};
    await route.fulfill({response});
  },{times:1});
  await page.getByRole('button',{name:'Siparişi onayla',exact:true}).click();
  await expect(page).toHaveURL(/page=checkout-result/);
  assert.equal(acceptedResult?.status,201,JSON.stringify(acceptedResult?.body));
  assert.equal(acceptedResult.requestBody,attempt,'Retry must preserve the exact order body and identity');
  const order=acceptedResult.body;assert.equal(order.ok,true);assert.ok(order.order_id);
  assert.equal(order.total_minor,45000);assert.equal(order.payment_status,'unpaid');
  assert.equal(order.checkout.quote_id,quote.quote_id);assert.deepEqual(order.checkout.consent,intent.consent);
  assert.match(order.order_number,/^YA-\d{8}-[A-F0-9]{10}$/);
  await expect(page).toHaveURL(/page=checkout-result/);
  await expect(page.locator('#checkout-body h2')).toHaveText(order.order_number);
  await expect(page.locator('#checkout-body')).toContainText('DEMO — GEÇERSİZ');
  console.log('PASS shared Commerce V2 guest checkout: server quote, consent, uncertain 503, exact retry and accepted reference');

  console.log('7. Verifying Account Portal and Redirects...');
  await page.goto(`${base}/deneme/?page=account`);
  await expect(page.locator('#account-login')).toBeVisible();
  await expect(page.locator('#portal-message')).toContainText('E-posta hizmeti hazırlanıyor');
  await expect(page.locator('#account-register')).toBeHidden();

  // Test legacy path redirects
  await page.goto(`${base}/deneme/hesabim/`);
  await expect(page).toHaveURL(/page=account/);

  await page.goto(`${base}/deneme/bayi/`);
  await expect(page).toHaveURL(/page=account/);

  console.log('8. Verifying Dynamic Language Switching on Both Layers...');
  for (const [language, label, direction] of [['en','Home','ltr'],['de','Startseite','ltr'],['fr','Accueil','ltr'],['ar','الرئيسية','rtl']]) {
    for (const path of ['/', '/kurulum/', '/kullanim-kilavuzu/', '/deneme/']) {
      await page.goto(`${base}${path}?lang=${language}`);
      await expect(page.locator('html')).toHaveAttribute('lang',language);
      await expect(page.locator('html')).toHaveAttribute('dir',direction);
      await expect(page.locator('.site-header')).toContainText(label);
      if(path==='/') {
        await expect(page.locator('[data-tree-count]')).toContainText(`fixture-${language}:`);
        await page.locator('[data-nexa-message]').first().click();
        await expect(page.locator('.showcase-avatar-speech')).toHaveText(`fixture-${language} scripted tour`);
        await page.locator('[data-sector="market"]').click();
        await expect(page.locator('[data-tree-count]')).toContainText(`fixture-${language}:`);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`localized tree overflow ${language}`);
        await page.setViewportSize({width:320,height:900});
        await page.evaluate(()=>scrollTo(0,0));
        await page.locator('.flag-language__trigger').click();
        await expect(page.locator('.flag-language__choice')).toHaveCount(5);
        for(const choice of await page.locator('.flag-language__choice').all()) await expect(choice).toBeVisible();
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`open language picker overflow ${language}`);
        if(language==='ar') {
          mkdirSync('artifacts/landing-3b',{recursive:true});
          await page.locator('.flag-language__menu').evaluate(element=>Promise.all(element.getAnimations().map(animation=>animation.finished)));
          await page.screenshot({path:'artifacts/landing-3b/languages-ar-320.png'});
        }
        await page.keyboard.press('Escape');await expect(page.locator('.flag-language__trigger')).toBeFocused();
        await page.setViewportSize({width:1280,height:900});
      }
      if(path==='/kullanim-kilavuzu/') {
        await page.locator('#guide-search').fill(`fixture-${language} provider setup`);
        await expect(page.locator('[data-guide-topic]:visible')).toHaveCount(1);
        await expect(page.locator('[data-guide-count]')).toHaveText(`fixture-${language}: 1`);
      }
    }
    await page.goto(`${base}/`);
    await expect(page.locator('html')).toHaveAttribute('lang',language);
  }
  // Per-key source changes invalidate only that translation on both layers.
  const catalogPath=join(site,'locales/tr.json'), lowerCatalogPath=join(site,'deneme/locales/tr.json');
  const catalogText=readFileSync(catalogPath,'utf8'), changedCatalog=JSON.parse(catalogText);
  changedCatalog['page.home']='Güncel ana sayfa';
  for(const path of [catalogPath,lowerCatalogPath])writeFileSync(path,JSON.stringify(changedCatalog));
  for(const path of ['/', '/deneme/']) {
    await page.goto(`${base}${path}?lang=de`);
    await expect(page.locator('.site-header')).toContainText('Güncel ana sayfa');
    await expect(page.locator('.site-header')).not.toContainText('Startseite');
  }
  for(const path of [catalogPath,lowerCatalogPath])writeFileSync(path,catalogText);
  store.saveSettings({...store.settings(),targetLanguages:['de']});
  await publish('business_context_publish', createCurrentBusinessWebContext(desktop), (o,c)=>core.pushBusinessContext({...o,context:c}));
  for(const path of ['/', '/deneme/']) {
    await page.goto(`${base}${path}?lang=en`);await expect(page.locator('html')).toHaveAttribute('lang','tr');
  }
  store.saveSettings({...store.settings(),enabled:false});
  await publish('business_context_publish', createCurrentBusinessWebContext(desktop), (o,c)=>core.pushBusinessContext({...o,context:c}));
  for(const path of ['/', '/deneme/']) {
    await page.goto(`${base}${path}?lang=de`);await expect(page.locator('html')).toHaveAttribute('lang','tr');
    await expect(page.locator('.flag-language,.language-picker')).toHaveCount(0);
  }

  console.log('9. Checking Mobile Layout and Responsiveness...');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${base}/`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `Upper layer mobile overflow at width ${width}`);

    await page.goto(`${base}/deneme/`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `Lower layer mobile overflow at width ${width}`);
  }

  console.log('10. Checking Widget Launcher Script Configuration...');
  await page.goto(`${base}/`);
  await expect(page.locator('script[src*="widget.js"]')).toHaveCount(0);
  await expect(page.locator('[data-showcase-avatar] svg')).toBeVisible();
  await page.goto(`${base}/deneme/`);
  await expect(page.locator('script[src*="widget.js"]')).toHaveAttribute('data-api-base-url','/yardimci-asistan');
  await expect(page.locator('[data-ya-open]')).toBeVisible();

  // Disable both published AI and customer requests without removing the
  // launcher. This must not invent a live AI or bypass the service gates.
  const guestDb = new (require('node:sqlite').DatabaseSync)(join(hosting, 'data/yardimci-asistan.sqlite'));
  guestDb.prepare(`INSERT INTO publications
    (name,source_client_id,source_epoch,source_revision,payload_hash,server_revision,payload_json,updated_at)
    VALUES ('android_snapshot','fixture',1,1,'test',1,?,?)
    ON CONFLICT(name) DO UPDATE SET payload_json=excluded.payload_json`
  ).run(JSON.stringify({business_capabilities:[]}), new Date().toISOString());
  guestDb.close();
  const disabled = (await (await fetch(`${config.baseUrl}/api/business.php`)).json()).business;
  assert.equal(disabled.ai_enabled,false);
  assert.equal(disabled.requests_enabled,false);
  await page.goto(`${base}/deneme/`);
  const disabledFeatures = await page.evaluate(() => JSON.parse(document.querySelector('#site-context').textContent).features);
  assert.equal(disabledFeatures.chat,false);
  assert.equal(disabledFeatures.requests,false);
  await expect(page.locator('[data-ya-open]')).toBeVisible();

  assert.deepEqual(pageErrors, [], 'No uncaught browser errors should occur');
  console.log('✓ All Two-Layer Architecture checks PASSED successfully!');
} finally {
  await browser?.close();
  desktop.close();
  try{process.kill(-php.pid,'SIGTERM');}catch{}
  rmSync(root, { recursive: true, force: true });
}
