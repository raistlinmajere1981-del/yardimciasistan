import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawn,spawnSync} from "node:child_process";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import {createServer} from "node:net";
import {DatabaseSync} from "node:sqlite";
import {chromium,expect} from "@playwright/test";
import {installDemoSite} from "./test-helpers/demo-site.mjs";
import {launchChromiumForSmoke} from "./test-helpers/playwright-browser.mjs";
import {createSmokeSetupInput} from "./test-helpers/desktop-setup.mjs";
const require=createRequire(import.meta.url);
function syntheticUiDictionary() {
  return Object.fromEntries(Object.values(JSON.parse(readFileSync('test-site/landing/locales/tr.json','utf8')))
    .filter(value=>typeof value==='string').map(value=>[value,`fixture-en ${value}`]));
}
function assertCanonicalLanguageAdapters() {
  const code=`require $argv[1].'/core/bootstrap.php'; $source=\\YaSite\\source_catalog($argv[1]);
    $translations=[];foreach($source['entries'] as $key=>$entry)$translations[$source['id'].':'.$key]=['en'=>['text'=>'fixture-en '.$entry['text']]];
    $business=['localization'=>['version'=>1,'source_language'=>'tr','target_languages'=>['en'],
      'languages'=>[['code'=>'en','locale'=>'en-GB','direction'=>'ltr','nativeName'=>'English']],
      'site_catalog'=>$source,'translations'=>['site_text'=>$translations]]];
    $_GET['lang']='en';$language=\\YaSite\\language_context($argv[1],$business);
    echo json_encode(['language'=>$language,'sourceKeys'=>\\YaSite\\source_keys($argv[1])]);`;
  const php=spawnSync('php',['-r',code,resolve('test-site/landing/deneme')],{encoding:'utf8'});
  assert.equal(php.status,0,php.stderr);
  const context=JSON.parse(php.stdout),node={textContent:JSON.stringify(context)},window={};
  const document={getElementById:()=>node};
  runInNewContext(readFileSync('web-site-template/public/assets/core/interaction-language.js','utf8'),{document,window});
  const exports={};
  runInNewContext(ts.transpileModule(readFileSync('test-site/landing/assistant/site-language.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{document,exports});
  assert.equal(context.language.code,'en');
  for(const adapter of [window.DemoLanguage,exports])assert.equal(adapter.ui('Sepete ekle'),'fixture-en Sepete ekle');
  const source={products:[{product_id:'p',name:'Çay',price:12.5}],localization:{version:1,source_language:'tr',target_languages:['en'],translations:{catalog_product:{p:{en:{name:'Tea'}}}}}};
  const localized=window.DemoLanguage.localize(source,'online_catalog');
  assert.equal(localized.products[0].name,'Tea');assert.equal(localized.products[0].price,12.5);assert.equal(source.products[0].name,'Çay');
  console.log('canonical-language-adapters-ok: PHP source hashes → synthetic publication → interaction and widget adapters');
}
if(process.argv.includes('--language-contract-only')) { assertCanonicalLanguageAdapters(); process.exit(0); }
const {saveCheckoutSettings}=require("../apps/desktop-app/dist-electron/commerce-checkout-settings.js");
const {DesktopDatabase}=require("../apps/desktop-app/dist-electron/database.js");
const {createPublicRoomCatalog}=require("../apps/desktop-app/dist-electron/public-room-catalog-publication.js");
const {createPublicTableCatalog}=require("../apps/desktop-app/dist-electron/public-table-catalog-publication.js");
const {createCurrentBusinessWebContext}=require("../apps/desktop-app/dist-electron/business-ai-context-service.js");
const {createAndroidOperationsSnapshot}=require("../apps/desktop-app/dist-electron/android-operations-snapshot.js");
const {MarketingWebsitePublicationService}=require("../apps/desktop-app/dist-electron/marketing/website-publication.js");
const {readPublicSiteCatalog}=require("../apps/desktop-app/dist-electron/public-site-catalog.js");
const {publishDesktopProjection}=require("../apps/desktop-app/dist-electron/desktop-publication-service.js");
const core=require("../packages/sync-core/dist/index.js");
const root=mkdtempSync(join(tmpdir(),"ya-translations-web-")),site=join(root,"site"),secret="translation-fixture-secret";
const hosting=installDemoSite(site, {httpApi:true}),configPath=join(hosting,"config/business.json");
writeFileSync(configPath,JSON.stringify({...JSON.parse(readFileSync(configPath,"utf8")),sync_secret:secret}));
const listener=createServer();await new Promise(done=>listener.listen(0,"127.0.0.1",done));const port=listener.address().port;await new Promise(done=>listener.close(done));
const base=`http://127.0.0.1:${port}`,config={baseUrl:`${base}/yardimci-asistan`,syncSecret:secret};
const php=spawn("php",["-S",`127.0.0.1:${port}`,"-t",site],{env:{...process.env,PHP_CLI_SERVER_WORKERS:"4",YA_SITE_API_ORIGIN:base, YA_ACCOUNT_SITE_URL:`${base}/deneme/hesabim/`},stdio:"ignore",detached:true});
const desktop=new DesktopDatabase({appPath:resolve("apps/desktop-app"),userDataPath:join(root,"desktop")});
let raw,browser,resolveAi,translationService;
try {
  for(let n=0;n<100;n++){try{if((await fetch(`${config.baseUrl}/api/business.php`)).ok)break;}catch{}await new Promise(done=>setTimeout(done,25));}
  desktop.initialize();
  // Synthetic credential placeholders stay inside this disposable test DB; chat HTTP is intercepted.
  const setupResult=desktop.saveInitialSetup(createSmokeSetupInput({businessName:"Çeviri Test",aiEnabled:true,aiModel:"fixture-model",aiApiKey:"fixture-non-provider-key",profileId:"pension_restaurant",profileOptions:["channel.online_sales","channel.qr_menu","marketing.studio","customer.requests","service.ai","accommodation.reservations","food_service.reservations"],phone:"+905321234567",whatsapp:"+905321234567",syncSecret:secret,webModuleUrl:config.baseUrl,servicePreferences:{whatsapp:true,android:false},initialCounts:{rooms:0,tables:0},tableCategories:[]}), {mode:"replace",encryptedValue:"safe-storage:v1:fixture-ciphertext"});
  assert.equal(setupResult.ok,true,setupResult.message);
  raw=new DatabaseSync(desktop.databasePath);
  const b=raw.prepare("SELECT id FROM business").get().id;
  saveCheckoutSettings(desktop.databasePath,{version:1,enabled:true,demo:true,currency:'TRY',shippingFeeMinor:1499,
    bank:{name:'DEMO Translation Bank',accountHolder:'DEMO Translation Store',iban:'DEMO — INVALID — DO NOT PAY'},
    legal:{version:'translation-fixture-v2',preliminary:'DEMO preliminary information.',agreement:'DEMO sale agreement.'}});
  raw.exec(`UPDATE business SET publish_tables_web=1;
    UPDATE settings SET online_sales_delivery_enabled=1,online_sales_pickup_enabled=1;
    INSERT INTO rooms(id,name,description,bed_info,created_at,updated_at) VALUES ('r','Bahçe Oda','Sessiz oda','Çift yatak','t','t');
    INSERT INTO tables(id,name,public_description,created_at,updated_at) VALUES ('t','Bahçe Masa','Açık alan','t','t');
    INSERT INTO menu_categories(id,name,description,created_at,updated_at) VALUES ('mc','İçecekler','Soğuk içecekler','t','t');`);
  raw.prepare("INSERT INTO business_public_profile(business_id,about_text,created_at,updated_at) VALUES (?,'Sahil işletmesi','t','t') ON CONFLICT(business_id) DO UPDATE SET about_text='Sahil işletmesi'").run(b);
  raw.prepare("INSERT INTO catalog_categories(id,business_id,name,created_at,updated_at) VALUES ('cc',?,'Yerel ürünler','t','t')").run(b);
  raw.prepare("INSERT INTO catalog_products(id,business_id,category_id,name,description,created_at,updated_at) VALUES ('p',?,'cc','Çay','Demleme çay','t','t')").run(b);
  raw.prepare("INSERT INTO commerce_product_publications(product_id,business_id,channel,is_published,created_at,updated_at) VALUES ('p',?,'online_sales',1,'t','t')").run(b);
  raw.exec("INSERT INTO menu_product_entries(id,product_id,category_id,created_at,updated_at) VALUES ('mp','p','mc','t','t')");
  raw.prepare("INSERT INTO marketing_contents(id,business_id,title,purpose,source,master_text,status,created_at,updated_at) VALUES ('c',?,'Yaz','promotion','manual','Yaz kampanyası','ready','t','t')").run(b);
  raw.prepare("INSERT INTO marketing_publications(id,business_id,content_id,channel,status,placement,title,text,desired_published,created_at,updated_at) VALUES ('m',?,'c','website','publishing','homepage_feature','Yaz Fırsatı','Kahvaltı dahil',1,'t','t')").run(b);
  raw.exec("UPDATE rooms SET nightly_price_minor=123450 WHERE id='r'; UPDATE catalog_products SET sale_price=1234.5 WHERE id='p'");
  const galleryPath=join(desktop.userDataPath,"assets/business-gallery");mkdirSync(galleryPath,{recursive:true});
  writeFileSync(join(galleryPath,"manifest.json"),JSON.stringify({version:1,media:[{id:"g",resourceId:"gallery",kind:"photo",title:"Bahçe",storedPath:"files/g.jpg",remoteUrl:"/yardimci-asistan/media/gallery/gallery/g.jpg",mimeType:"image/jpeg",sortOrder:0,originalName:"g.jpg",contentHash:"a".repeat(64)}]}));
  const store=desktop.translations();store.saveSettings({enabled:true,sourceLanguage:"tr",targetLanguages:["en"],automatic:false});
  const dictionary=syntheticUiDictionary();
  const ui=source=>dictionary[source] ?? source;
  const sourceCatalog=await readPublicSiteCatalog(config.baseUrl);store.replaceSiteCatalog(sourceCatalog);
  for(const [key,entry] of Object.entries(sourceCatalog.entries)) {
    const translated=dictionary[entry.text];if(!translated)continue;
    const record=store.get({kind:'site_text',id:`${sourceCatalog.id}:${key}`},'en');
    store.saveManual({kind:'site_text',id:record.id,language:'en',fields:record.fields.map(field=>({field:field.field,sourceHash:field.sourceHash,text:translated}))});
  }
  const footerText="Let's get to work together.";
  const footerRecord=store.get({kind:'site_text',id:`${sourceCatalog.id}:landing.prompt`},'en');
  store.saveManual({kind:'site_text',id:footerRecord.id,language:'en',fields:footerRecord.fields.map(field=>({field:field.field,sourceHash:field.sourceHash,text:footerText}))});
  const words={"Bahçe Oda":"Garden Room","Sessiz oda":"Quiet room","Bahçe Masa":"Garden Table","İçecekler":"Drinks","Çay":"Tea","Demleme çay":"Brewed tea","Yerel ürünler":"Local products","Sahil işletmesi":"Seaside business","Bahçe":"Garden","Yaz Fırsatı":"Summer Offer","Kahvaltı dahil":"Breakfast included"};
  const records=[];
  for(let offset=0;;offset+=100){const batch=store.list({language:'en',limit:100,offset});records.push(...batch.records);if(offset+100>=batch.total)break;}
  assert.ok(records.some(r=>r.kind==='gallery'));
  for(const record of records) {
    const fields=record.fields.filter(f=>words[f.source]).map(f=>({field:f.field,sourceHash:f.sourceHash,text:words[f.source]}));
    if(fields.length)store.saveManual({...record,language:"en",fields});
  }
  const caps=()=>desktop.getEnabledBusinessCapabilities();
  const publish=async(job,value,send)=>{
    const result=await publishDesktopProjection(desktop,config,job,value,(identity,frozen)=>send({...config,...identity},frozen),{refresh:true});
    assert.equal(result?.ok,true,result?.message);return result;
  };
  const publishAll=async()=>{
    await publish('android_snapshot',createAndroidOperationsSnapshot(desktop,desktop.getDashboardData()),(o,snapshot)=>core.pushAndroidSnapshot({...o,snapshot}));
    await publish('dealer_access_publish',desktop.createDealerAccessProjection(),(o,value)=>new core.PhpHostingSyncTransport(o).publishDealerAccess({sourceRevision:o.sourceRevision,idempotencyKey:o.idempotencyKey,value}));
    await publish("menu_publish",desktop.getQrMenuPublication(),(o,menu)=>core.pushMenu({...o,menu}));
    await publish("room_catalog_publish",createPublicRoomCatalog(desktop.databasePath,caps()),(o,catalog)=>core.pushRoomCatalog({...o,catalog}));
    await publish("table_catalog_publish",createPublicTableCatalog(desktop.databasePath,caps()),(o,catalog)=>core.pushTableCatalog({...o,catalog}));
    await publish("online_catalog_publish",desktop.createCommerceOnlineCatalog(),(o,catalog)=>core.pushOnlineCatalog({...o,catalog}));
    await publish("business_context_publish",createCurrentBusinessWebContext(desktop),(o,context)=>core.pushBusinessContext({...o,context}));
    const prepared=await new MarketingWebsitePublicationService(()=>desktop,{}).prepare(config,"fixture");
    assert.equal(prepared.ok,true);await publish("marketing_website_publish",prepared.projection,(o,projection)=>new core.PhpHostingSyncTransport(o).publishMarketingWebsite({sourceRevision:o.sourceRevision,idempotencyKey:o.idempotencyKey,value:projection}));
  };
  const {PublicTranslationService}=require("../apps/desktop-app/dist-electron/public-translation-service.js");
  translationService=new PublicTranslationService(()=>desktop,{allowed:()=>true,onChanged:()=>{},translate:()=>new Promise(resolve=>{resolveAi=resolve;})});
  await translationService.start({filter:{language:"en"},selection:[{kind:"room",id:"r"}]});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(translationService.status().state,"running");
  await publishAll();
  assert.equal(translationService.status().state,"running","normal publication never waits for AI");
  resolveAi("{}");
  for(let n=0;n<100 && translationService.status().state==='running';n++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(translationService.status().failed,1,"invalid AI output is failed without interrupting publication");
  const get=async path=>{const response=await fetch(`${config.baseUrl}/api/${path}.php`);assert.equal(response.status,200);return response.json();};
  const roomResponse=await fetch(`${config.baseUrl}/api/rooms.php`),etag=roomResponse.headers.get("etag");
  const rooms=await roomResponse.json();assert.equal(rooms.rooms[0].name,"Bahçe Oda");assert.equal(rooms.localization.translations.room.r.en.name,"Garden Room");
  assert.equal((await fetch(`${config.baseUrl}/api/rooms.php`,{headers:{"If-None-Match":etag}})).status,304);
  const business=await get('business');assert.equal(business.business.about_text,'Sahil işletmesi');assert.equal(business.localization.translations.gallery.g.en.title,'Garden');
  assert.equal((await get('catalog')).localization.translations.catalog_category.cc.en.name,'Local products');
  assert.equal((await get('menu')).localization.translations.menu_product.mp.en.name,'Tea');
  assert.equal((await get('marketing')).localization.translations.marketing.m.en.title,'Summer Offer');
  browser=await launchChromiumForSmoke(chromium);const page=await browser.newPage({serviceWorkers:'block'});
  const browserErrors=[];page.on('pageerror',error=>browserErrors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.goto(`${base}/deneme/?page=rooms`);await expect(page.getByRole('heading',{name:'Bahçe Oda',exact:true})).toBeVisible();
  await Promise.all([page.waitForURL(url=>url.searchParams.get('lang')==='en', {waitUntil:'load'}), page.locator('#site-language').selectOption('en')]);
  await expect(page.getByRole('heading',{name:'Garden Room',exact:true})).toBeVisible();
  await expect(page.locator('main')).toContainText(new Intl.NumberFormat('en-GB',{style:'currency',currency:'TRY'}).format(1234.5));
  await expect(page.locator('main')).toContainText('Çift yatak');
  for(const [path,text] of [['menu','Tea'],['catalog','Tea'],['restaurant','Garden Table'],['gallery','Garden'],['announcements','Summer Offer'],['about','Seaside business']]) {
    await page.goto(`${base}/deneme/?page=${path}`);await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.locator('main')).toContainText(text);
  }
  for(const path of ['/','/kurulum/','/kullanim-kilavuzu/']) {
    await page.goto(`${base}${path}`);await expect(page.locator('html')).toHaveAttribute('lang','en');
    await expect(page.locator('.site-nav')).toContainText(ui('Ana Sayfa'));
    await expect(page.locator('.site-footer')).toContainText(footerText);
  }
  await page.goto(`${base}/deneme/?page=rooms&id=r`);
  await Promise.all([page.waitForURL(url=>url.searchParams.get('lang')==='tr', {waitUntil:'load'}), page.locator('#site-language').selectOption('tr')]);
  await expect(page).toHaveURL(/page=rooms/);
  await expect(page.locator('main')).toContainText('Bahçe Oda');
  await Promise.all([page.waitForURL(url=>url.searchParams.get('lang')==='en', {waitUntil:'load'}), page.locator('#site-language').selectOption('en')]);
  await expect(page.locator('main')).toContainText('Garden Room');
  await page.goto(`${base}/deneme/?page=catalog`);
  const commerce=page.locator('[data-commerce]');
  const products=commerce.locator('[data-commerce-products]');
  await expect(products).toContainText('Tea');
  await expect(products).toContainText('Brewed tea');
  await expect(products).toContainText(ui('Sepete ekle'));
  await products.getByRole('button',{name:ui('Sepete ekle'),exact:true}).click();
  const englishPrice=new Intl.NumberFormat('en-GB',{style:'currency',currency:'TRY'}).format(1234.5);
  await expect(products).toContainText(englishPrice);
  await expect(commerce.locator('[data-commerce-checkout],[data-commerce-lines]')).toHaveCount(0);
  const catalogLocation=page.url();await page.locator('.header-cart-link').click();
  assert.equal(page.url(),catalogLocation,'Opening the translated mini cart preserves navigation');
  const mini=page.locator('#mini-cart');await expect(mini).toBeVisible();
  await expect(mini.locator('[data-cart-lines]')).toContainText('Tea');
  await expect(mini.locator('[data-cart-total]')).toContainText(englishPrice);
  await mini.getByRole('link',{name:ui('Sepete git'),exact:true}).click();
  await expect(page).toHaveURL(/page=cart/);
  const cart=page.locator('#shopping-cart');
  await expect(cart.locator('h1')).toHaveText(ui('Sepetim'));
  await expect(cart.locator('[data-cart-lines]')).toContainText('Tea');
  await expect(cart.locator('[data-cart-total]')).toContainText(englishPrice);
  await cart.locator('[data-checkout-link]').click();
  const flow=page.locator('#checkout-flow'),checkoutBody=page.locator('#checkout-body');
  const checkoutField=name=>checkoutBody.locator(`[name="${name}"]`);
  const advance=async step=>{
    await checkoutBody.locator('button[type=submit]').click();
    await expect(page).toHaveURL(new RegExp(`page=checkout-${step}(?:&|$)`));
    await expect(flow).toHaveAttribute('data-step',step);
    await expect(page.locator('html')).toHaveAttribute('lang','en');
  };
  await expect(flow).toHaveAttribute('data-step','customer');
  await expect(checkoutBody).toContainText(ui('Üye olmadan devam edebilirsiniz.'));
  await expect(checkoutBody.locator('button[type=submit]')).toHaveText(ui('Devam et'));
  await checkoutBody.locator('button[type=submit]').click();
  assert.equal(await checkoutField('name').evaluate(node=>node.validity.valueMissing),true);
  await expect(checkoutField('name')).toBeFocused();
  await checkoutField('name').fill('English Buyer');await checkoutField('phone').fill('123');
  await checkoutBody.locator('button[type=submit]').click();
  await expect(page.locator('#checkout-message')).toContainText(ui('7–15 rakam içeren geçerli bir telefon yazın. Uluslararası numaralar kabul edilir.'));
  await checkoutField('phone').fill('+44 7911 123456');
  await checkoutField('note').fill('Sipariş notu / Original buyer note.');
  await advance('delivery');
  await expect(checkoutField('deliveryMethod').locator('option[value=pickup]')).toHaveText(ui('İşletmeden teslim'));
  await checkoutField('deliveryMethod').selectOption('pickup');await advance('payment');
  await expect(checkoutBody).toContainText(ui('Havale / EFT'));
  await expect(checkoutBody.getByLabel(ui('Kredi kartı — Yakında'))).toBeDisabled();
  const quoted=page.waitForResponse(r=>r.url()===`${config.baseUrl}/api/checkout-quote.php` && r.request().method()==='POST');
  await advance('review');const quoteResponse=await quoted;
  assert.equal(quoteResponse.status(),200,await quoteResponse.text());
  const quote=(await quoteResponse.json()).quote;
  assert.equal(quote.items[0].name,'Çay','Server acceptance retains the original authoritative product name');
  assert.equal(quote.subtotal_minor,123450);assert.equal(quote.total_minor,123450);assert.equal(quote.currency,'TRY');
  await expect(checkoutBody.locator('.shopping-summary')).toContainText('Çay × 1');
  await expect(checkoutBody.locator('.shopping-summary')).toContainText(ui('Toplam: {0}').replace('{0}',englishPrice));
  await expect(checkoutBody.locator('button[type=submit]')).toHaveText(ui('Siparişi onayla'));
  await checkoutField('preliminary').check();await checkoutField('agreement').check();
  await expect(checkoutField('marketing')).not.toBeChecked();
  const orderAccepted=page.waitForResponse(r=>r.url()===`${config.baseUrl}/api/order.php` && r.request().method()==='POST');
  await checkoutBody.locator('button[type=submit]').click();const orderReceipt=await orderAccepted;
  assert.equal(orderReceipt.status(),201,await orderReceipt.text());
  const orderPayload=orderReceipt.request().postDataJSON(),order=await orderReceipt.json();
  assert.equal(orderPayload.note,'Sipariş notu / Original buyer note.');
  assert.deepEqual(orderPayload.buyer,{name:'English Buyer',phone:'+44 7911 123456'});
  assert.deepEqual(orderPayload.items,[{productId:'p',quantity:1}]);
  assert.equal(orderPayload.quoteId,quote.quote_id);assert.equal(orderPayload.paymentMethod,'bank_transfer');
  assert.deepEqual(orderPayload.consent,{preliminary:true,agreement:true,marketing:false});
  assert.equal(order.total_minor,123450);assert.equal(order.currency,'TRY');assert.equal(order.payment_status,'unpaid');
  await expect(page).toHaveURL(/page=checkout-result/);await expect(flow).toHaveAttribute('data-step','result');
  await expect(checkoutBody.locator('h2')).toHaveText(order.order_number);
  await expect(checkoutBody).toContainText(ui('Ödeme bekleniyor. Sipariş oluşturulması ödeme onayı değildir.'));
  await expect(checkoutBody).toContainText(englishPrice);
  await expect(checkoutBody).toContainText(ui('DEMO — Banka bilgileri geçersizdir. Gerçek ödeme yapmayın.'));
  await expect(checkoutBody.getByRole('link',{name:ui('Alışverişe devam et'),exact:true})).toBeVisible();
  await expect(page.locator('#mini-cart [data-cart-lines]')).toHaveText(ui('Sepetiniz henüz boş.'));
  assert.equal(new URL(page.url()).origin,base);
  assert.match(order.order_access_token,/^[a-f0-9]{64}$/);
  assert.equal((await page.content()).includes(order.order_access_token),false,'Guest bearer stays outside DOM/navigation');
  await page.goto(`${base}/deneme/?page=menu`);await expect(page.locator('main')).toContainText('Drinks');
  assert.equal(await page.evaluate(()=>window.DemoLanguage.locale),business.localization.languages.find(language=>language.code==='en').locale);
  const localized=await page.evaluate(()=>window.DemoLanguage.localize({products:[{product_id:'x',name:'Odalar',sale_price:1234.5}],localization:{version:1,source_language:'tr',target_languages:['en'],translations:{}}},'online_catalog'));
  assert.equal(localized.products[0].name,'Odalar');assert.equal(localized.products[0].sale_price,1234.5);
  // Exercise the English widget with the real request endpoint and a single temporary failed response.
  await page.goto(`${base}/deneme/?page=rooms`);
  await expect(page.locator('main')).toContainText('Garden Room');
  assert.equal(business.business.whatsapp_enabled,true,'WhatsApp translation scenario requires its published capability');
  await expect(page.locator('script[src*="widget.js"]')).toHaveAttribute('data-whatsapp-phone',business.business.whatsapp);
  await expect(page.locator('script[src*="widget.js"]')).toHaveAttribute('data-business-name',business.business.display_name);
  assert.ok(business.business.request_types.includes('pension_reservation'),'Reservation test requires the canonical published request capability');
  const widget=page.locator('#yardimci-asistan-widget');
  await widget.locator('[data-ya-open]').click();
  await expect(widget.locator('.ya-widget-view-title')).toHaveText(ui('Merhaba, ben Nexa.'));
  await widget.locator('[data-ya-request-type="pension_reservation"]').click();
  await expect(widget.locator('.ya-widget-view-title')).toHaveText(ui('Rezervasyonunuzu hazırlayalım'));
  await widget.locator('[data-ya-open-date-picker="start_date"]').click();
  await expect(widget.locator('.ya-widget-calendar-weekdays')).toContainText(ui('Pzt'));
  await expect(widget.locator('.ya-widget-calendar-shortcuts')).toContainText(ui('Bugün'));
  await widget.locator('[data-ya-calendar-shortcut="today"]').click();
  const startDate=await widget.locator('input[name="start_date"]').inputValue();
  const expectedDate=new Intl.DateTimeFormat('en',{day:'numeric',month:'long'}).format(new Date(`${startDate}T12:00:00`));
  await expect(widget.locator('[data-ya-date-label="start_date"]')).toHaveText(expectedDate);
  await widget.locator('[data-ya-open-date-picker="end_date"]').click();
  await expect(widget.locator('.ya-widget-calendar-shortcuts')).toContainText(ui('1 gün'));
  await widget.locator('[data-ya-calendar-shortcut="day1"]').click();
  await widget.getByRole('button',{name:ui('Kişi sayısını artır'),exact:true}).click();
  await expect(widget.locator('input[name="guest_count"]')).toHaveValue('3');
  await widget.locator('input[name="customer_name"]').fill('English Guest');
  await widget.locator('input[name="customer_phone"]').fill('123');
  await widget.locator('button[type="submit"]').click();
  await expect(widget.locator('[data-ya-status]')).toContainText(ui('Telefon numarası geçerli formatta olmalı. Yurt dışı numaralarında ülke kodunu ekleyin. Örnek: +90 532 123 45 67 veya +44 7911 123456'));
  await widget.locator('input[name="customer_phone"]').fill('+44 7911 123456');
  const userNote='Sessiz oda / Please keep this note unchanged.';
  await widget.locator('textarea[name="message"]').fill(userNote);
  let firstAttempt;
  await page.route(`${config.baseUrl}/api/request.php`,async route=>{
    firstAttempt=route.request().postDataJSON();await route.fulfill({status:503,json:{ok:false,message:'Türkçe sunucu hatası'}});
  },{times:1});
  await widget.locator('button[type="submit"]').click();
  await expect(widget.locator('[data-ya-status]')).toContainText(ui('Talep işletmeye iletilemedi.'));
  await expect(widget.locator('textarea[name="message"]')).toHaveValue(userNote);
  const accepted=page.waitForResponse(r=>r.url()===`${config.baseUrl}/api/request.php` && r.request().method()==='POST');
  await widget.locator('button[type="submit"]').click();
  const receipt=await accepted;
  assert.equal(receipt.status(),201,await receipt.text());
  const sent=receipt.request().postDataJSON();
  assert.equal(sent.message,userNote);assert.equal(sent.request_type,'pension_reservation');assert.equal(sent.source,'web_form');
  assert.equal(sent.idempotency_key,firstAttempt.idempotency_key);assert.equal(sent.guest_count,3);assert.match(sent.start_date,/^\d{4}-\d{2}-\d{2}$/);
  await expect(widget.locator('.ya-widget-view-title')).toHaveText(ui('Talebiniz işletmeye iletildi'));
  await page.evaluate(()=>{window.open=url=>{window.fixtureWhatsAppUrl=String(url);return null;};});
  await widget.locator('[data-ya-request-whatsapp]').click();
  const whatsappUrl=new URL(await page.evaluate(()=>window.fixtureWhatsAppUrl));
  assert.equal(whatsappUrl.hostname,'wa.me');assert.ok(whatsappUrl.searchParams.get('text').includes(userNote));
  assert.ok(whatsappUrl.searchParams.get('text').includes(ui('Talep türü: {0}').split('{0}')[0]));
  await widget.locator('[data-ya-request-done]').click();
  await widget.locator('[data-ya-view="info"]').filter({hasText:ui('Asistana sor')}).click();
  await expect(widget.locator('.ya-widget-view-title')).toHaveText(ui('Merak ettiğiniz şeyi sorun'));
  const question='Please keep this original question: kahvaltı?';
  const aiAnswer='Original provider answer — Türkçe metin stays unchanged.';
  await page.route(`${config.baseUrl}/api/chat.php`,async route=>{
    assert.equal(route.request().postDataJSON().message,question);
    assert.equal(route.request().postDataJSON().response_language,'en','English demo asks the server to answer in English');
    await route.fulfill({json:{ok:true,answer:aiAnswer}});
  },{times:1});
  await widget.locator('textarea[name="message"]').fill(question);
  await widget.locator('button[type="submit"]').click();
  await expect(widget.locator('.ya-widget-ai-answer')).toContainText(aiAnswer);
  await page.route(`${config.baseUrl}/api/chat.php`,route=>route.fulfill({status:503,json:{ok:false,message:'Türkçe sağlayıcı hatası',error:{code:'provider_unavailable',message:'Gizli olmayan Türkçe hata'}}}),{times:1});
  await widget.locator('button[type="submit"]').click();
  await expect(widget.locator('[data-ya-status]')).not.toContainText('Türkçe sağlayıcı hatası');
  await expect(widget.locator('[data-ya-status]')).toBeVisible();
  // Both layers retain usable central language controls on narrow viewports.
  for(const width of [320,390,768]) {
    await page.setViewportSize({width,height:844});await page.goto(`${base}/?lang=en`);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`English overflow ${width}`);
    await page.locator('.flag-language__trigger').click();
    await expect(page.locator('.flag-language__choice[value="tr"]')).toBeVisible();
    await page.keyboard.press('Escape');await expect(page.locator('.flag-language__choices')).toBeHidden();
    await page.goto(`${base}/deneme/?page=restaurant`);await expect(page.locator('main')).toContainText('Garden Table');
  }
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('[data-ya-open]')).toBeVisible();
  await page.locator('[data-ya-open]').click();
  await widget.locator('[data-ya-request-type="restaurant_reservation"]').click();
  await expect(widget.locator('.ya-widget-view-title')).toHaveText(ui('Masa talebinizi hazırlayalım'));
  await widget.locator('[data-ya-open-time-picker]').click();
  await widget.locator('[data-ya-time-hour="20"]').click();
  await widget.locator('[data-ya-time-minute="30"]').click();
  await expect(widget.locator('input[name="time"]')).toHaveValue('20:30');
  await expect(widget.locator('[data-ya-time-label]')).toHaveText(new Intl.DateTimeFormat('en',{hour:'2-digit',minute:'2-digit'}).format(new Date('2026-10-25T20:30:00')));
  assert.equal(await widget.evaluate(n=>n.scrollWidth>n.clientWidth+1),false,'English mobile widget overflow');
  await page.goto(`${base}/deneme/?page=restaurant`);
  await Promise.all([page.waitForURL(url=>url.searchParams.get('lang')==='tr', {waitUntil:'load'}), page.locator('#site-language').selectOption('tr')]);await expect(page.locator('main')).toContainText('Bahçe Masa');
  await expect(page.locator('h1')).toHaveText('Restoran');
  await Promise.all([page.waitForURL(url=>url.searchParams.get('lang')==='en', {waitUntil:'load'}), page.locator('#site-language').selectOption('en')]);
  assert.deepEqual(browserErrors,[]);
  raw.exec("UPDATE rooms SET name='Yeni Oda' WHERE id='r'");
  await publish("room_catalog_publish",createPublicRoomCatalog(desktop.databasePath,caps()),(o,catalog)=>core.pushRoomCatalog({...o,catalog}));
  const changed=await fetch(`${config.baseUrl}/api/rooms.php`,{headers:{'If-None-Match':etag}});assert.equal(changed.status,200);assert.notEqual(changed.headers.get('etag'),etag);
  const stale=await changed.json();assert.equal(stale.localization.translations.room.r.en.name,undefined);
  await page.goto(`${base}/deneme/?page=rooms`);await expect(page.locator('main')).toContainText('Yeni Oda');
  store.saveSettings({...store.settings(),enabled:false});await publishAll();
  for(const [path,text] of [['/qr-menu/','Çay'],['/magaza/','Çay'],['/restoran/','Bahçe Masa'],['/galeri/','Bahçe'],['/hakkimizda/','Sahil işletmesi']]) {
    await page.goto(`${base}${path}`);await expect(page.locator('html')).toHaveAttribute('lang','tr');await expect(page.locator('main')).toContainText(text);
  }
  raw.exec("UPDATE marketing_publications SET desired_published=0 WHERE id='m'; UPDATE catalog_products SET deleted_at='deleted' WHERE id='p'");
  await publishAll();assert.deepEqual((await get('marketing')).publications,[]);assert.deepEqual((await get('catalog')).products,[]);
  assert.deepEqual((await get('rooms')).localization.target_languages,[]);
  await page.goto(`${base}/deneme/?page=rooms`);await expect(page.locator('main')).toContainText('Yeni Oda');
  for(const path of ['catalog','announcements']) {
    assert.equal((await page.goto(`${base}/deneme/?page=${path}`)).status(),404);
    await expect(page.locator('main')).not.toContainText('Summer Offer');await expect(page.locator('main')).not.toContainText('Brewed tea');
  }
  raw.exec("UPDATE rooms SET is_active=0 WHERE id='r'; UPDATE tables SET is_active=0 WHERE id='t'; UPDATE business_public_profile SET about_text='' WHERE business_id IS NOT NULL");
  writeFileSync(join(galleryPath,'manifest.json'),JSON.stringify({version:1,media:[]}));await publishAll();
  for(const path of ['rooms','restaurant','gallery','about']) {
    assert.equal((await page.goto(`${base}/deneme/?page=${path}`)).status(),404);
    await expect(page.locator('main')).toContainText('Bu sayfa şu anda kullanılamıyor.');
  }
  assert.deepEqual(browserErrors,[]);
  const payload=JSON.stringify(await get('business'));
  for(const forbidden of ['source_hash','failure_code','purchase_price',secret,'safe-storage','customer_id'])assert.ok(!payload.includes(forbidden),forbidden);
  console.log('PASS Commerce V2 translated catalog/cart/customer/delivery/payment/review/result, English money, authoritative quote and real order acceptance. TR/EN UI/navigation, mobile, dates, widget validation/request/retry, unchanged user/AI content OK. Translation web: real Desktop producers/outbox/exact receipt → PHP APIs → demo English selection, source fallback, ETag, withdrawal and OFF OK.');
} finally {resolveAi?.("{}");await translationService?.stopAndDrain();await browser?.close();raw?.close();desktop.close();try{process.kill(-php.pid,'SIGTERM');}catch{}rmSync(root,{recursive:true,force:true});}
