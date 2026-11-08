import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {chromium,expect} from '@playwright/test';
import {accountFixture,accountPassword} from './test-helpers/customer-accounts.mjs';
import {launchChromiumForSmoke} from './test-helpers/playwright-browser.mjs';
const require=createRequire(import.meta.url);
const {BUSINESS_CAPABILITIES:C}=require('../packages/shared/dist/index.js');
const {WebSyncIngress}=require('../apps/desktop-app/dist-electron/web-sync-ingress.js');
const {saveRuntimeCatalogProduct}=require('../apps/desktop-app/dist-electron/commerce-runtime.js');
const {publishBusinessAiContext}=require('../apps/desktop-app/dist-electron/business-ai-context-service.js');
const {publishDesktopProjection}=require('../apps/desktop-app/dist-electron/desktop-publication-service.js');
const f=await accountFixture({siteSource:'test-site/landing'});let browser,raw;
try {
  // Exercise real HTTP endpoints in this multi-worker fixture. The production same-host
  // CLI adapter correctly requires HTTPS account URLs outside PHP's local HTTP server.
  const fixtureSiteConfig=join(f.root,'deneme/site/config.php');
  writeFileSync(fixtureSiteConfig,readFileSync(fixtureSiteConfig,'utf8').replace("'local_api_root' => dirname(__DIR__, 2) . '/yardimci-asistan',","'local_api_root' => null,"));
  const setup=f.database.saveInitialSetup({...f.database.getSetupData(),aiApiKey:'',clearAiApiKey:false,
    initialCounts:{rooms:0,tables:0},tableCategories:[],onlineSalesDelivery:{pickupEnabled:true,shippingEnabled:false},
    commerceCheckout:{version:1,enabled:true,demo:true,currency:'TRY',shippingFeeMinor:null,
      bank:{name:'DEMO Banka',accountHolder:'DEMO Bayi',iban:'DEMO — GEÇERSİZ — ÖDEME YAPMAYIN'},
      legal:{version:'demo-v2',preliminary:'DEMO ön bilgilendirme.',agreement:'DEMO satış sözleşmesi.'}}});
  assert.equal(setup.ok,true,setup.message);
  const publishPublicSurfaces=async()=>{
    const config={baseUrl:f.baseUrl,syncSecret:f.secret};
    const business=await publishBusinessAiContext(f.database,config);assert.equal(business?.ok,true,business?.message);
    const catalog=await publishDesktopProjection(f.database,config,'online_catalog_publish',f.database.createCommerceOnlineCatalog(),
      (identity,value)=>f.transport.publishOnlineCatalog({sourceRevision:identity.sourceRevision,idempotencyKey:identity.idempotencyKey,value}));
    assert.equal(catalog?.ok,true,catalog?.message);
  };
  await f.publish();await f.register('browser@example.test','Browser Customer');
  await new WebSyncIngress({database:f.database},()=>'',()=>{}).pullCustomerAccountPages(f.transport);
  const customer=f.database.listCustomers({}).items.find(x=>x.email==='browser@example.test');
  f.database.saveCustomer({...customer,commercialProfile:{companyName:'Browser Company',dealerStatus:'active',priceGroup:'dealer_a'}});
  saveRuntimeCatalogProduct(f.database.databasePath,{name:'Browser Product',sku:'WEB-ACCOUNT',brand:'',categoryId:'',salePrice:100,dealerPriceA:80,dealerPriceB:null,purchasePrice:20,currency:'TRY',unit:'piece',taxRate:20,trackInventory:false,isActive:true});
  await f.publish();await publishPublicSurfaces();
  browser=await launchChromiumForSmoke(chromium);const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  await page.route('**/*',route=>new URL(route.request().url()).origin===f.siteUrl?route.continue():route.abort());
  page.on('pageerror',error=>errors.push(error.message));await page.goto(f.siteUrl+'/deneme/?page=account');
  await expect(page.locator('#account-login')).toBeVisible();await expect(page.getByRole('button',{name:'Google ile giriş'})).toHaveCount(0);
  // Register and choose a password through actual browser forms and the TLS SMTP mailbox proof.
  await expect(page.locator('#account-register input[type=password]')).toHaveCount(0);
  await page.locator('[data-account-mode="register"]').click();
  await expect(page.locator('#account-register')).toBeVisible();
  await page.locator('#account-register [name=fullName]').fill('Browser Registration');
  await page.locator('#account-register [name=email]').fill('registered-ui@example.test');
  const registered=page.waitForResponse(response=>response.url().endsWith('/api/account/register.php'));
  await page.locator('#account-register button').click();assert.equal((await registered).status(),200);
  // Registration queues a secure outbox message; fixture SMTP delivery is explicit.
  await f.runCommerceMail();
  const verification=f.emails.at(-1).match(/https?:\/\/[^\s]+/)[0];
  await page.goto(verification);await expect(page.locator('#account-token')).toBeVisible();
  await page.locator('#account-token [name=password]').fill(accountPassword);
  const verified=page.waitForResponse(response=>response.url().endsWith('/api/account/verify.php'));
  await page.locator('#account-token button').click();const verificationResponse=await verified;assert.equal(verificationResponse.status(),200,'Browser verification should accept delivered one-time token');
  await expect(page).toHaveURL(/page=account/);await expect(page.locator('#account-login')).toBeVisible();
  assert.equal((await f.call('account/login',{email:'registered-ui@example.test',password:accountPassword})).status,200);
  await page.locator('#account-login [name=email]').fill('browser@example.test');await page.locator('#account-login [name=password]').fill(accountPassword);
  const loginResponse=page.waitForResponse(response=>response.url().endsWith('/api/account/login.php')&&response.request().method()==='POST');
  await page.locator('#account-login button').click();
  assert.equal((await loginResponse).status(),200,'browser sign-in must succeed before checking the dealer view');
  await expect.poll(()=>page.evaluate(()=>window.YaAccount?.state.status)).toBe('authenticated');
  await expect(page.getByRole('heading',{name:'Hesabım',exact:true})).toBeVisible();
  await expect(page.locator('#account-dealer-badge')).toBeVisible();
  await expect(page.locator('#account-dealer-badge')).toHaveText('Bayi');
  await expect(page.locator('#account-profile')).toBeVisible();
  await page.goto(f.siteUrl+'/deneme/?page=catalog');
  await expect(page.getByRole('heading',{name:'Browser Product'})).toBeVisible();await expect(page.locator('[data-commerce-products] article').getByRole('paragraph').last()).toContainText('80');
  const cookies=await context.cookies();assert.ok(cookies.find(x=>x.name==='ya_account_session').httpOnly);assert.ok(cookies.find(x=>x.name==='ya_account_refresh').httpOnly);
  await page.getByRole('button',{name:'Sepete ekle',exact:true}).click();
  await expect(page.locator('#header-cart-count')).toHaveText('1');
  await page.goto(f.siteUrl+'/deneme/?page=cart');
  await expect(page.locator('#shopping-cart [data-cart-lines]')).toContainText('Browser Product');
  await expect(page.locator('#shopping-cart input[type=number]')).toHaveValue('1');
  await expect(page.locator('#shopping-cart .shopping-line-total')).toContainText('80,00');
  await page.locator('#shopping-cart [data-checkout-link]').click();
  await expect(page).toHaveURL(/page=checkout-customer/);
  await expect(page.locator('input[name=name]')).toHaveValue('Browser Customer');
  await expect(page.locator('input[name=email]')).toHaveValue('browser@example.test');
  await expect(page.locator('input[name=name]')).toHaveAttribute('readonly','');
  await expect(page.locator('input[name=email]')).toHaveAttribute('readonly','');
  await page.locator('input[name=phone]').fill('+90 555 123 45 67');
  await page.locator('input[name=note]').fill('Dealer UI original note');
  await page.getByRole('button',{name:'Devam et',exact:true}).click();
  await expect(page).toHaveURL(/page=checkout-delivery/);
  await page.getByRole('link',{name:'Geri',exact:true}).click();
  await expect(page.locator('input[name=note]')).toHaveValue('Dealer UI original note');
  await page.getByRole('button',{name:'Devam et',exact:true}).click();
  await expect(page.locator('select[name=deliveryMethod]')).toHaveValue('pickup');
  await page.getByRole('button',{name:'Devam et',exact:true}).click();
  await expect(page).toHaveURL(/page=checkout-payment/);
  await expect(page.getByLabel('Havale / EFT',{exact:true})).toBeChecked();
  await expect(page.getByLabel('Kredi kartı — Yakında')).toBeDisabled();
  const quoted=page.waitForResponse(response=>response.url()===f.baseUrl+'/api/dealer/checkout-quote.php'&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Devam et',exact:true}).click();
  const quoteResponse=await quoted;assert.equal(quoteResponse.status(),200,await quoteResponse.text());
  const {quote}=await quoteResponse.json();assert.equal(quote.total_minor,8000);assert.equal(quote.delivery_method,'pickup');
  await expect(page).toHaveURL(/page=checkout-review/);
  await expect(page.locator('.shopping-summary')).toContainText('80,00');
  await page.getByLabel('Ön bilgilendirmeyi okudum ve kabul ediyorum.').check();
  await page.getByLabel('Satış sözleşmesini kabul ediyorum.',{exact:true}).check();
  let pending;
  await page.route(f.baseUrl+'/api/dealer/order.php',async route=>{pending=route.request().postData();await route.fulfill({status:503,json:{ok:false}});},{times:1});
  await page.getByRole('button',{name:'Siparişi onayla',exact:true}).click();await expect(page.locator('#checkout-message')).toContainText('doğrulanamadı');
  await expect(page).toHaveURL(/page=checkout-review/);
  const intent=JSON.parse(pending);
  assert.equal(intent.note,'Dealer UI original note');
  assert.equal(intent.quoteId,quote.quote_id);
  assert.equal(intent.paymentMethod,'bank_transfer');
  assert.deepEqual(intent.consent,{preliminary:true,agreement:true,marketing:false});
  assert.equal(f.storage("echo $db->query('SELECT count(*) FROM web_orders')->fetchColumn();"),0);
  // Capture real backend acceptance before client-side navigation invalidates CDP response bodies.
  let acceptedResult;
  await page.route(f.baseUrl+'/api/dealer/order.php',async route=>{
    const response=await route.fetch();
    acceptedResult={status:response.status(),body:await response.json(),requestBody:route.request().postData()};
    await route.fulfill({response});
  },{times:1});
  await page.getByRole('button',{name:'Siparişi onayla',exact:true}).click();
  await expect(page).toHaveURL(/page=checkout-result/);
  assert.equal(acceptedResult?.status,201,JSON.stringify(acceptedResult?.body));
  assert.equal(acceptedResult.requestBody,pending,'Retry must preserve the exact dealer order body and identity');
  const order=acceptedResult.body;assert.equal(order.ok,true);assert.ok(order.order_id);
  assert.equal(order.total_minor,8000);assert.equal(order.payment_status,'unpaid');
  assert.equal(order.checkout.quote_id,quote.quote_id);assert.deepEqual(order.checkout.consent,intent.consent);
  assert.match(order.order_number,/^YA-\d{8}-[A-F0-9]{10}$/);
  await expect(page).toHaveURL(/page=checkout-result/);
  await expect(page.locator('#checkout-body h2')).toHaveText(order.order_number);
  await expect(page.locator('#checkout-body')).toContainText('80,00');
  await expect(page.locator('#checkout-body')).toContainText('DEMO — GEÇERSİZ');
  assert.equal(f.storage("echo $db->query('SELECT count(*) FROM web_orders')->fetchColumn();"),1);
  await page.goto(f.siteUrl+'/deneme/?page=account');await expect(page.locator('#account-order-list')).toContainText(order.order_number);
  await page.locator('#account-profile [name=fullName]').fill('Updated Browser Customer');
  const saved=page.waitForResponse(response=>response.url().endsWith('/api/account/profile.php'));
  await page.locator('#account-profile button').click();assert.equal((await saved).status(),200);
  assert.equal((await f.call('account/session',undefined,cookies.filter(x=>x.name.startsWith('ya_account_')).map(x=>x.name+'='+x.value).join('; '))).body.account.fullName,'Updated Browser Customer');
  const csrf=await page.evaluate(async()=>{const response=await fetch('/yardimci-asistan/api/account/profile.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fullName:'Forged'})});return response.status;});assert.equal(csrf,403);
  raw=new DatabaseSync(f.database.databasePath);
  raw.prepare("UPDATE customer_commercial_profiles SET dealer_status='inactive' WHERE customer_id=?").run(customer.id);await f.publish();await page.reload();
  await expect(page.getByRole('heading',{name:'Hesabım',exact:true})).toBeVisible();
  await expect(page.locator('#account-dealer-badge')).toBeHidden();await expect(page.locator('#account-profile')).toBeVisible();
  await expect(page.locator('#account-order-list')).toContainText(order.order_number);
  const demotedOrder=await page.evaluate(async body=>{
    const response=await fetch('/yardimci-asistan/api/dealer/order.php',{method:'POST',headers:{'Content-Type':'application/json','X-YA-Dealer':'1'},body});
    return response.status;
  },pending);
  assert.ok([401,403].includes(demotedOrder),'An active customer session cannot retain dealer order authority after demotion');
  assert.equal(f.storage("echo $db->query('SELECT count(*) FROM web_orders')->fetchColumn();"),1);
  raw.prepare('UPDATE business_capabilities SET is_enabled=0 WHERE capability_id=?').run(C.ONLINE_SALES);await f.publish();await publishPublicSurfaces();
  const capabilityOff=await page.reload();assert.equal(capabilityOff.status(),404);
  await expect(page.locator('#account-profile')).toHaveCount(0);
  await expect(page.getByRole('navigation').getByRole('link',{name:'Hesabım',exact:true})).toHaveCount(0);
  const blocked=await page.evaluate(async()=>{const response=await fetch('/yardimci-asistan/api/account/session.php');return {status:response.status,body:await response.json()};});
  assert.equal(blocked.status,403);assert.equal(blocked.body.code,'online_sales_disabled');
  // Revocation remains available after the SSR account surface is capability-gated.
  const logout=await page.evaluate(async()=>{const response=await fetch('/yardimci-asistan/api/account/logout.php',{method:'POST',headers:{'Content-Type':'application/json','X-YA-Account':'1'},body:'{}'});return response.status;});assert.equal(logout,200);
  raw.prepare('UPDATE business_capabilities SET is_enabled=1 WHERE capability_id=?').run(C.ONLINE_SALES);await f.publish();await publishPublicSurfaces();await page.reload();
  await expect(page.locator('#account-login')).toBeVisible();assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  console.log('web-dealer-portal-ok: real browser unified account/catalog, mailbox activation, cookie security, private pricing, exact order retry, shared history/profile, CSRF, demotion, Online Sales and logout');
} finally{await browser?.close();raw?.close();await f.cleanup();}
