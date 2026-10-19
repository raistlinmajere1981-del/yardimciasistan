import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {cpSync,mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,relative} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {DatabaseSync} from 'node:sqlite';
import {chromium,expect} from '@playwright/test';
import {launchChromiumForSmoke} from './test-helpers/playwright-browser.mjs';
import {createSmokeSetupInput} from './test-helpers/desktop-setup.mjs';
const require=createRequire(import.meta.url);
const {DesktopDatabase}=require('../apps/desktop-app/dist-electron/database.js');
const {createCurrentBusinessWebContext}=require('../apps/desktop-app/dist-electron/business-ai-context-service.js');
const {createAndroidOperationsSnapshot}=require('../apps/desktop-app/dist-electron/android-operations-snapshot.js');
const {MarketingWebsitePublicationService}=require('../apps/desktop-app/dist-electron/marketing/website-publication.js');
const {publishDesktopProjection}=require('../apps/desktop-app/dist-electron/desktop-publication-service.js');
const core=require('../packages/sync-core/dist/index.js');
const root=mkdtempSync(join(tmpdir(),'ya-market-pilot-')),site=join(root,'site');
cpSync('test-site/market-pilot',site,{recursive:true,filter:path=>!path.endsWith('site.local.php')});
const hosting=join(site,'yardimci-asistan'),source='firm-template/web-module';
cpSync(source,hosting,{recursive:true,filter:path=>{
  const name=relative(source,path);
  return (!name.startsWith('data/') && !name.startsWith('media/') && !name.includes('.local.')) || ['data/.htaccess','media/.htaccess'].includes(name);
}});
mkdirSync(join(hosting,'data'),{recursive:true});
const secret='market-pilot-isolated-test-secret',configPath=join(hosting,'config/business.json');
writeFileSync(configPath,JSON.stringify({...JSON.parse(readFileSync(configPath,'utf8')),sync_secret:secret}));
// Old local identity is deliberately ignored; public API owns customer data.
writeFileSync(join(site,'site.local.php'),"<?php return ['name'=>'FAKE LOCAL BUSINESS','phone'=>'5555555555'];");
const probe=createServer();await new Promise(done=>probe.listen(0,'127.0.0.1',done));const port=probe.address().port;await new Promise(done=>probe.close(done));
const base=`http://127.0.0.1:${port}`,config={baseUrl:base+'/yardimci-asistan',syncSecret:secret};
const php=spawn('php',['-S',`127.0.0.1:${port}`,'-t',site],{stdio:'ignore'});
const desktop=new DesktopDatabase({appPath:resolve('apps/desktop-app'),userDataPath:join(root,'desktop')});
let raw,browser;
const publish=async(job,value,send)=>{
  const result=await publishDesktopProjection(desktop,config,job,value,(identity,frozen)=>send({...config,...identity},frozen),{refresh:true});
  assert.equal(result?.ok,true,result?.message);assert.equal(result.accepted,true);return result;
};
const publishCatalog=()=>publish('online_catalog_publish',desktop.createCommerceOnlineCatalog(),(o,catalog)=>core.pushOnlineCatalog({...o,catalog}));
const publishBusiness=()=>publish('business_context_publish',createCurrentBusinessWebContext(desktop),(o,context)=>core.pushBusinessContext({...o,context}));
const publishCapabilities=()=>publish('android_snapshot',createAndroidOperationsSnapshot(desktop,desktop.getDashboardData()),(o,snapshot)=>core.pushAndroidSnapshot({...o,snapshot}));
const publishMarketing=async()=>{
  const prepared=await new MarketingWebsitePublicationService(()=>desktop,{}).prepare(config,'market-test');
  assert.equal(prepared.ok,true);
  return publish('marketing_website_publish',prepared.projection,(o,projection)=>new core.PhpHostingSyncTransport(o).publishMarketingWebsite({sourceRevision:o.sourceRevision,idempotencyKey:o.idempotencyKey,value:projection}));
};
const get=async name=>{const response=await fetch(config.baseUrl+'/api/'+name+'.php');assert.equal(response.status,200);return response.json();};
try {
  for(let n=0;;n++) {try {if((await fetch(config.baseUrl+'/api/business.php')).ok)break;}catch{} if(n>100)throw new Error('PHP startup');await new Promise(done=>setTimeout(done,30));}
  desktop.initialize();
  assert.equal(desktop.saveInitialSetup(createSmokeSetupInput({businessName:'Pilot Gerçek Market',profileId:'market',profileOptions:['channel.online_sales','commerce.wholesale','marketing.studio'],phone:'+905321234567',whatsapp:'',address:'Yayınlanmış adres',syncSecret:secret,webModuleUrl:config.baseUrl,servicePreferences:{whatsapp:false,android:false},initialCounts:{rooms:0,tables:0},tableCategories:[]})).ok,true);
  raw=new DatabaseSync(desktop.databasePath);const b=raw.prepare('SELECT id FROM business').get().id;
  raw.prepare("INSERT INTO catalog_categories(id,business_id,name,created_at,updated_at) VALUES ('c',?,'İçecekler','t','t')").run(b);
  raw.prepare("INSERT INTO catalog_categories(id,business_id,name,created_at,updated_at) VALUES ('c2',?,'Temel ihtiyaçlar','t','t')").run(b);
  const add=raw.prepare("INSERT INTO catalog_products(id,business_id,category_id,name,description,sku,sale_price,image_source_url,created_at,updated_at) VALUES (?,?,'c',?,'Kaynak açıklama',?,1234.5,?,'t','t')");
  add.run('p',b,'Çay','TEA-001','https://images.example.com/tea.png');
  add.run('hidden',b,'Yayınlanmamış ürün','','');add.run('inactive',b,'Pasif ürün','','');
  raw.exec("UPDATE catalog_products SET is_active=0 WHERE id='inactive'");
  const pub=raw.prepare("INSERT INTO commerce_product_publications(product_id,business_id,channel,is_published,created_at,updated_at) VALUES (?,?,'online_sales',1,'t','t')");
  pub.run('p',b);pub.run('inactive',b);
  raw.prepare("INSERT INTO business_public_profile(business_id,about_text,created_at,updated_at) VALUES (?,'Mahalle işletmesi','t','t') ON CONFLICT(business_id) DO UPDATE SET about_text='Mahalle işletmesi'").run(b);
  raw.prepare("INSERT INTO marketing_contents(id,business_id,title,purpose,source,master_text,status,created_at,updated_at) VALUES ('mc',?,'Fırsat','promotion','manual','Haftanın fırsatı','ready','t','t')").run(b);
  raw.prepare("INSERT INTO marketing_publications(id,business_id,content_id,channel,status,placement,title,text,desired_published,created_at,updated_at) VALUES ('m',?,'mc','website','publishing','homepage_feature','Haftanın fırsatı','Yayınlanmış kampanya',1,'t','t')").run(b);
  const store=desktop.translations();store.saveSettings({enabled:true,sourceLanguage:'tr',targetLanguages:['en'],automatic:false});
  const words={'Çay':'Tea','İçecekler':'Drinks','Mahalle işletmesi':'Neighbourhood business','Haftanın fırsatı':'Weekly offer','Yayınlanmış kampanya':'Published offer'};
  for(const record of store.list({language:'en',limit:100}).records) {
    const fields=record.fields.filter(f=>words[f.source]).map(f=>({field:f.field,sourceHash:f.sourceHash,text:words[f.source]}));
    if(fields.length)store.saveManual({...record,language:'en',fields});
  }
  await publishCatalog();await publishBusiness();await publishCapabilities();await publishMarketing();
  const payload=await get('catalog');assert.equal(payload.enabled,true);assert.equal(payload.products.length,1);assert.equal(payload.products[0].product_id,'p');
  assert.deepEqual(payload.delivery_methods,[],'Delivery OFF still publishes catalogue');
  assert.equal(payload.localization.translations.catalog_product.p.en.name,'Tea');
  assert.equal((await get('business')).business.ai_enabled,false);
  assert.equal((await fetch(config.baseUrl+'/api/chat.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Test',response_language:'en'})})).status,403,'real API enforces AI OFF');
  for(const forbidden of [secret,'purchase_price','dealer_price','source_hash','safeStorage'])assert.ok(!JSON.stringify(payload).includes(forbidden));
  browser=await launchChromiumForSmoke(chromium);const context=await browser.newContext();const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://images.example.com/tea.png',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#17352d"/></svg>'}));
  await page.goto(base+'/');await expect(page.locator('[data-category-grid]')).toContainText('İçecekler');
  await expect(page.locator('html')).toHaveAttribute('lang','tr');await expect(page.locator('body')).not.toContainText('FAKE LOCAL BUSINESS');
  await expect(page.locator('[data-marketing-grid]')).toContainText('Haftanın fırsatı');
  await expect(page.locator('[data-chat-form]')).toBeHidden();await expect(page.locator('[data-chat-state]')).toContainText('kapalı');
  await page.locator('.flag-language__trigger').focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'English',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.locator('[data-category-grid]')).toContainText('Drinks');
  await expect(page.locator('[data-business-about]')).toHaveText('Neighbourhood business');
  await expect(page.locator('[data-marketing-grid]')).toContainText('Weekly offer');
  await page.getByRole('link',{name:'Browse the catalogue',exact:true}).click();
  await expect(page.locator('[data-product-grid] article')).toHaveCount(1);await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.locator('[data-product-grid]')).toContainText('Tea');
  await expect(page.locator('.price')).toHaveText(new Intl.NumberFormat('en-GB',{style:'currency',currency:'TRY'}).format(1234.5));
  await expect.poll(()=>page.locator('.product-media img').evaluate(n=>n.naturalWidth)).toBe(400);
  assert.equal(await page.locator('.product-media img').evaluate(n=>getComputedStyle(n).objectFit),'contain');
  await page.getByRole('searchbox',{name:'Search products'}).fill('TEA-001');
  await expect(page.locator('[data-catalog-state]')).toHaveText('1 product');
  await expect(page).toHaveURL(/q=TEA-001/);
  await page.getByRole('link',{name:'View product'}).click();
  await expect(page.getByRole('heading',{level:1})).toHaveText('Tea');
  await expect(page.locator('.product-description')).toHaveText('Kaynak açıklama','missing translation uses Turkish');
  await page.getByRole('link',{name:'Back to catalogue'}).click();
  await expect(page.getByRole('searchbox',{name:'Search products'})).toHaveValue('TEA-001');
  const cookies=await context.cookies();assert.equal(cookies.find(c=>c.name==='market_language').httpOnly,true);
  await page.goto(base+'/magaza/?lang=tr');await expect(page.locator('.price')).toHaveText(new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(1234.5));
  console.log('PASS: real Desktop → durable publication/exact receipt → PHP → TR/EN, identity, media, delivery OFF and AI OFF');
  // Stale manual translation is retained by Desktop but excluded from publication.
  const etag=(await fetch(config.baseUrl+'/api/catalog.php')).headers.get('etag');
  raw.exec("UPDATE catalog_products SET name='Taze çay' WHERE id='p'");await publishCatalog();
  const changed=await fetch(config.baseUrl+'/api/catalog.php',{headers:{'If-None-Match':etag}});assert.equal(changed.status,200);
  assert.equal((await changed.json()).localization.translations.catalog_product?.p?.en?.name,undefined);
  await page.goto(base+'/magaza/urun/?id=p&lang=en');await expect(page.getByRole('heading',{level:1})).toHaveText('Taze çay');
  // Large catalogue uses the actual producer, not a browser-only fake list.
  raw.exec('BEGIN');for(let i=0;i<10025;i++) {const id='bulk-'+i;add.run(id,b,`Ürün ${String(i).padStart(5,'0')}`,'SKU-'+i,'');pub.run(id,b);}raw.exec('COMMIT');
  raw.exec("UPDATE catalog_products SET category_id='c2' WHERE id LIKE 'bulk-%'");await publishCatalog();
  assert.equal((await get('catalog')).products.length,10026);
  await page.goto(base+'/magaza/?lang=en');await expect(page.locator('[data-product-grid] article')).toHaveCount(24);
  await expect(page.locator('[data-catalog-state]')).toHaveText('10,026 products');
  await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.locator('[data-page-number]')).toHaveText('2 / 418');
  await page.getByRole('searchbox',{name:'Search products'}).fill('SKU-10024');
  await expect(page.locator('[data-product-grid] article')).toHaveCount(1);await expect(page.locator('[data-product-grid]')).toContainText('Ürün 10024');
  await page.getByRole('searchbox',{name:'Search products'}).fill('');await page.getByLabel('Category',{exact:true}).selectOption('c');
  await expect(page.locator('[data-product-grid] article')).toHaveCount(1);await expect(page.locator('[data-product-grid]')).toContainText('Taze çay');
  await page.getByRole('link',{name:'View product'}).click();await page.getByRole('link',{name:'Back to catalogue'}).click();
  await expect(page.getByLabel('Category',{exact:true})).toHaveValue('c');
  await page.getByLabel('Category',{exact:true}).selectOption('');await expect(page.locator('[data-product-grid] article')).toHaveCount(24);
  await page.getByRole('searchbox',{name:'Search products'}).fill('no-matching-product');await expect(page.locator('[data-catalog-state]')).toContainText('No products match');
  console.log('PASS: 10,026 real published products, bounded DOM, pagination, full-list search, filters, navigation state and stale fallback');
  // Long text, image failure and keyboard/reduced-motion at phone/tablet/desktop widths.
  raw.exec("UPDATE catalog_products SET name='"+'UzunÜrünAdı'.repeat(16)+"' WHERE id='p'");await publishCatalog();
  await page.unroute('https://images.example.com/tea.png');await page.route('https://images.example.com/**',route=>route.abort());
  const screenshots=resolve('artifacts/market-pilot-smoke');mkdirSync(screenshots,{recursive:true});
  for(const width of [320,390,768,1280]) {
    await page.setViewportSize({width,height:900});
    for(const path of ['/?lang=en','/magaza/?lang=en&category=c','/magaza/urun/?id=p&lang=en']) {
      await page.goto(base+path);await expect(page.locator('html')).toHaveAttribute('lang','en');
      if(path.includes('magaza'))await expect(page.locator('.product-card')).toHaveCount(1);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`overflow ${width} ${path}`);
      await page.locator('.flag-language__trigger').focus();await page.keyboard.press('Enter');await expect(page.locator('.flag-language__choices')).toBeVisible();
      const box=await page.locator('.flag-language__menu').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);
      await page.keyboard.press('Escape');await expect(page.locator('.flag-language__trigger')).toBeFocused();
      await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.flag-language__cloth--active').evaluate(n=>getComputedStyle(n).animationName),'none');
      await page.emulateMedia({reducedMotion:'no-preference'});
      const routeName=path.startsWith('/magaza/urun')?'product':path.startsWith('/magaza')?'catalog':'home';
      await page.screenshot({path:join(screenshots,`${routeName}-${width}.png`),fullPage:true});
    }
    await expect(page.locator('.product-media span')).toBeVisible();await page.screenshot({path:join(screenshots,`product-${width}.png`),fullPage:true});
  }
  console.log('PASS: 12 responsive route/viewport combinations, long text, broken photo, flag keyboard/Escape and reduced motion');
  // AI state is real capability publication; provider responses below are explicitly HTTP fixtures.
  raw.prepare("INSERT INTO business_capabilities(business_id,capability_id,is_enabled,created_at,updated_at) VALUES (?,'service.ai',1,'t','t') ON CONFLICT(business_id,capability_id) DO UPDATE SET is_enabled=1").run(b);await publishCapabilities();
  await page.goto(base+'/magaza/?lang=en');await expect(page.locator('[data-chat-form]')).toBeVisible();
  const question='Original user question / çay?',answer='Original English answer / Türkçe preserved.';
  await page.route(config.baseUrl+'/api/chat.php',async route=>{
    const sent=route.request().postDataJSON();assert.equal(sent.response_language,'en');assert.equal(sent.message,question);
    await route.fulfill({json:{ok:true,answer,fallback:false}});
  },{times:1});
  await page.getByLabel('Your question',{exact:true}).fill(question);await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(page.locator('[data-chat-answer]')).toHaveText(answer);
  await page.route(config.baseUrl+'/api/chat.php',route=>route.fulfill({status:503,json:{ok:false,message:'provider raw detail'}}),{times:1});
  await page.getByRole('button',{name:'Send',exact:true}).click();await expect(page.locator('[data-chat-state]')).toContainText('currently unavailable');
  await expect(page.getByLabel('Your question',{exact:true})).toHaveValue(question);
  await page.route(config.baseUrl+'/api/chat.php',route=>route.fulfill({json:{ok:true,fallback:true,answer:'Sunucu fallback'}}),{times:1});
  await page.getByRole('button',{name:'Send',exact:true}).click();await expect(page.locator('[data-chat-answer]')).toBeEmpty();
  await expect(page.locator('[data-chat-state]')).toContainText('currently unavailable');
  console.log('PASS: real AI capability visibility; fixture-only English request, unchanged input/answer, localized 503/fallback and preserved draft');
  raw.exec("UPDATE commerce_product_publications SET is_published=0");await publishCatalog();
  await page.goto(base+'/magaza/?lang=en');await expect(page.locator('[data-product-grid]')).toBeEmpty();await expect(page.locator('[data-catalog-state]')).toContainText('No products have been published');
  await page.goto(base+'/magaza/urun/?id=p&lang=en');await expect(page.locator('[data-detail-state]')).toContainText('No products have been published');
  raw.exec("UPDATE business_capabilities SET is_enabled=0 WHERE capability_id IN ('channel.online_sales','commerce.wholesale','marketing.studio','service.ai')");
  await publishCatalog();await publishMarketing();await publishCapabilities();
  assert.equal((await get('catalog')).enabled,false);assert.deepEqual((await get('marketing')).publications,[]);
  await page.goto(base+'/?lang=en');await expect(page.locator('[data-catalog-link]').first()).toBeHidden();await expect(page.locator('[data-marketing-section]')).toBeHidden();await expect(page.locator('[data-chat-form]')).toBeHidden();
  assert.equal(await page.locator('a[href*="bayi"],button:has-text("Pay"),button:has-text("Order")').count(),0);
  // Language OFF removes English selection despite a saved English preference.
  store.saveSettings({...store.settings(),enabled:false});await publishBusiness();await publishCatalog();
  await page.goto(base+'/?lang=en');await expect(page.locator('html')).toHaveAttribute('lang','tr');await expect(page.locator('[data-language-picker]')).toBeHidden();
  await expect(page.locator('[data-business-about]')).toHaveText('Mahalle işletmesi');
  // API outage does not show fixture or previously cached products.
  await page.route(config.baseUrl+'/api/catalog.php',route=>route.fulfill({status:503,json:{ok:false}}));
  await page.goto(base+'/magaza/');await expect(page.locator('[data-catalog-state]')).toContainText('ulaşılamıyor');await expect(page.locator('[data-product-grid]')).toBeEmpty();
  assert.deepEqual(errors,[]);console.log('PASS: empty/withdrawn/OFF publications, no fake order/dealer/payment, language OFF and API outage');
} finally {await browser?.close();raw?.close();desktop.close();php.kill();rmSync(root,{recursive:true,force:true});}
