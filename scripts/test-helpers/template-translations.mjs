import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {expect} from '@playwright/test';
import {createSmokeSetupInput} from './desktop-setup.mjs';

const require = createRequire(import.meta.url);
const {DesktopDatabase} = require('../../apps/desktop-app/dist-electron/database.js');
const {PublicTranslationService, validateTranslationAnswer} = require('../../apps/desktop-app/dist-electron/public-translation-service.js');
const {readPublicSiteCatalog, validateSiteCatalog} = require('../../apps/desktop-app/dist-electron/public-site-catalog.js');
const {createCurrentBusinessWebContext} = require('../../apps/desktop-app/dist-electron/business-ai-context-service.js');
const {SyncCoordinator} = require('../../apps/desktop-app/dist-electron/sync-coordinator.js');
const {PUBLIC_LANGUAGES} = require('../../packages/shared/dist/index.js');

export async function exerciseTemplateTranslations({page, base, api, publish, site, root, publishedContext}) {
  const desktop = new DesktopDatabase({appPath:resolve('apps/desktop-app'), userDataPath:join(root, 'translations-desktop')});
  desktop.initialize();
  const result = desktop.saveInitialSetup(createSmokeSetupInput({businessName:'Dil Testi',phone:'',whatsapp:'',profileId:'market',profileOptions:[],
    syncSecret:'isolated-language-secret',webModuleUrl:api,initialCounts:{rooms:0,tables:0},tableCategories:[],servicePreferences:{whatsapp:false,android:false}}));
  assert.equal(result.ok, true);
  const raw = new DatabaseSync(desktop.databasePath), store = desktop.translations();
  const catalogFile = join(site, 'locales/tr.json'), original = readFileSync(catalogFile, 'utf8');
  const calls = [];
  let fail = false;
  const service = new PublicTranslationService(() => desktop, {allowed:()=>true,onChanged:()=>{},catalogTarget:()=>api,translate:async (source, language) => {
    calls.push({source,language});
    if (fail && source === 'Yeni tema metni') return '{}';
    const titles = {de:'Startseite',fr:'Accueil',ar:'الرئيسية'};
    return JSON.stringify({faithful:true,translation: source === 'Ana Sayfa' ? titles[language] : `${language} ${source}`});
  }});
  const until = async predicate => {
    for (let n=0;n<1000;n++) { if (predicate()) return; await new Promise(done=>setTimeout(done,10)); }
    throw Error('Automatic translation timeout: ' + JSON.stringify(service.status()));
  };
  const ready = language => store.list({language,state:'missing',limit:1}).total === 0;
  const settings = languages => store.saveSettings({enabled:true,automatic:true,sourceLanguage:'tr',targetLanguages:languages});
  const project = async () => {
    const context = createCurrentBusinessWebContext(desktop);
    await publish({action:'publish_business_context',business_context:{...publishedContext,aboutText:'İşletme kaynak açıklaması',localization:context.localization}});
    return context.localization;
  };
  try {
    assert.equal(store.settings().enabled,false);
    assert.equal(raw.prepare('SELECT count(*) AS n FROM public_translations').get().n,0);
    raw.prepare("INSERT INTO business_public_profile(business_id,about_text,created_at,updated_at) VALUES (?,'İşletme kaynak açıklaması','t','t') ON CONFLICT(business_id) DO UPDATE SET about_text=excluded.about_text").run(store.businessId());
    raw.exec("INSERT INTO customers(id,full_name,phone,notes,created_at,updated_at) VALUES ('secret','PRIVATE_NAME','PRIVATE_PHONE','PRIVATE_NOTE','t','t')");
    const catalog = await readPublicSiteCatalog(api);
    assert.ok(catalog?.entries['page.home']);
    assert.throws(()=>validateSiteCatalog({...catalog,revision:'0'.repeat(64)}),/revision/);
    assert.equal(store.siteCatalog(),undefined);
    settings(['de']); service.reconcile(); await until(()=>ready('de'));
    assert.ok(calls.some(c=>c.language==='de'));
    assert.equal(store.siteCatalog().revision,catalog.revision,'Service discovers and stores the real template source automatically');
    assert.ok(service.status()?.state!=='unavailable');
    const before = calls.length;
    service.reconcile(); await new Promise(done=>setTimeout(done,30));
    assert.equal(calls.length,before,'Unchanged sources incur no provider calls');
    settings(['de','fr']); service.reconcile(); await until(()=>ready('fr'));
    const meta = await project();
    assert.equal(meta.business_id,store.businessId());
    assert.deepEqual(meta.languages.map(l=>l.code),PUBLIC_LANGUAGES.filter(l=>['tr','de','fr'].includes(l.code)).map(l=>l.code));
    await page.goto(base+'/?page=about&lang=de');
    await expect(page.locator('html')).toHaveAttribute('lang','de');
    await expect(page.locator('#main-navigation')).toContainText('Startseite');
    await expect(page.locator('main')).toContainText('de İşletme kaynak açıklaması');
    assert.deepEqual(await page.locator('#site-language option').evaluateAll(options=>options.map(o=>o.value)),['tr','de','fr']);
    for (const href of await page.locator('#main-navigation a').evaluateAll(links=>links.map(a=>a.href))) assert.equal(new URL(href).searchParams.get('lang'),'de');
    await page.locator('#site-language').selectOption('fr');
    await expect(page.locator('html')).toHaveAttribute('lang','fr');
    await page.goto(base+'/?page=contact');
    await expect(page.locator('html')).toHaveAttribute('lang','fr');
    await expect(page.locator('#main-navigation')).toContainText('Accueil');

    // A live catalog change falls back per key even before Desktop discovers the new revision.
    const source = JSON.parse(original); source['page.home']='Yeni ana sayfa'; source['theme.welcome']='Yeni tema metni';
    writeFileSync(catalogFile,JSON.stringify(source));
    await page.goto(base+'/?lang=de');
    await expect(page.locator('#main-navigation')).toContainText('Yeni ana sayfa');
    const changed = await readPublicSiteCatalog(api);
    store.replaceSiteCatalog(changed);
    const home = {kind:'site_text',id:`${catalog.id}:page.home`};
    let record = store.get(home,'de');
    assert.equal(record.stale,1);
    store.saveManual({...home,language:'de',fields:record.fields.map(f=>({field:f.field,sourceHash:f.sourceHash,text:'Manueller Start'}))});
    const afterChange = calls.length; fail=true;
    service.reconcile();
    await until(()=>['de','fr'].every(language=>store.get({kind:'site_text',id:`${catalog.id}:theme.welcome`},language).failed===1)
      && store.get(home,'fr').ready===1 && service.status()?.state!=='running');
    assert.equal(store.get(home,'de').fields[0].text,'Manueller Start');
    assert.ok(calls.slice(afterChange).every(c=>['Yeni ana sayfa','Yeni tema metni'].includes(c.source)),'Only changed/new fields are translated');
    const afterFailure = calls.length;
    service.reconcile(); await new Promise(done=>setTimeout(done,40));
    assert.equal(calls.length,afterFailure,'Failed sources are not retried automatically');
    await project();
    await page.goto(base+'/?lang=de');
    await expect(page.locator('#main-navigation')).toContainText('Manueller Start');
    assert.equal((await page.locator('#site-context').textContent().then(JSON.parse)).language.messages['theme.welcome'],'Yeni tema metni');
    assert.match(service.status().message,/hazırlanamadı/,'A successful later batch cannot hide earlier failed fields');
    fail=false;
    await service.start({filter:{language:'de',state:'failed'}}); await until(()=>service.status()?.state!=='running');
    assert.equal(store.get({kind:'site_text',id:`${catalog.id}:theme.welcome`},'de').ready,1);
    source['page.home']='Son ana sayfa';writeFileSync(catalogFile,JSON.stringify(source));
    store.replaceSiteCatalog(await readPublicSiteCatalog(api));service.reconcile();
    await until(()=>service.status()?.state!=='running');
    record=store.get(home,'de');assert.equal(record.stale,1);assert.equal(record.fields[0].text,'Manueller Start','Stale manual translations remain protected');
    assert.throws(()=>validateTranslationAnswer('{"translation":"Gäste","faithful":true}','Misafir: {count}'));

    settings(['de','fr','ar']); service.reconcile(); await until(()=>ready('ar'));
    await project();
    for (const width of [320,390,1440]) {
      await page.setViewportSize({width,height:900}); await page.goto(base+'/?page=about&lang=ar');
      await expect(page.locator('html')).toHaveAttribute('dir','rtl');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`RTL width ${width}`);
      const context=await page.locator('#site-context').textContent().then(JSON.parse);
      assert.equal(context.language.code,'ar');assert.equal(context.language.direction,'rtl');
      if (width===390) await page.screenshot({path:resolve('artifacts/web-site-template/rtl-mobile.png'),fullPage:true});
    }
    const formatted=await page.evaluate(async () => {
      const {createLanguage}=await import('/assets/core/language.mjs');
      const language=createLanguage(JSON.parse(document.getElementById('site-context').textContent).language);
      return {number:language.number(1234.5),currency:language.currency(1234.5,'TRY'),date:language.date('2026-10-25T12:00:00Z',{timeZone:'UTC'}),request:language.requestContext};
    });
    assert.equal(formatted.number,new Intl.NumberFormat('ar').format(1234.5));
    assert.equal(formatted.currency,new Intl.NumberFormat('ar',{style:'currency',currency:'TRY'}).format(1234.5));
    assert.equal(formatted.date,new Intl.DateTimeFormat('ar',{timeZone:'UTC'}).format(new Date('2026-10-25T12:00:00Z')));
    assert.deepEqual(formatted.request,{version:1,language:'ar',locale:'ar',direction:'rtl'});
    await page.screenshot({path:resolve('artifacts/web-site-template/rtl.png'),fullPage:true});
    settings(['de']);await project();
    await page.goto(base+'/?lang=fr');await expect(page.locator('html')).toHaveAttribute('lang','tr');
    assert.deepEqual(await page.locator('#site-language option').evaluateAll(options=>options.map(o=>o.value)),['tr','de']);
    store.saveSettings({...store.settings(),enabled:false});service.reconcile();await project();
    await page.goto(base+'/?lang=de');await expect(page.locator('html')).toHaveAttribute('lang','tr');
    await expect(page.locator('.language-picker')).toHaveCount(0);
    assert.ok(raw.prepare('SELECT count(*) AS n FROM public_translations').get().n>0);
    assert.equal(raw.prepare("SELECT full_name FROM customers WHERE id='secret'").get().full_name,'PRIVATE_NAME');
    assert.ok(!JSON.stringify(calls).includes('PRIVATE_'));
    settings(['de']);
    const unavailable=new PublicTranslationService(()=>desktop,{allowed:()=>true,onChanged:()=>{}});
    unavailable.reconcile();
    await until(()=>unavailable.status()?.state==='unavailable');
    assert.match(unavailable.status().message,/AI yapılandırılmamış/);
    await unavailable.stopAndDrain();
    let attempts=0;
    const coordinator=new SyncCoordinator({database:desktop,
      getSyncConfig:()=>{attempts++;return {baseUrl:'http://127.0.0.1:1/yardimci-asistan',syncSecret:'isolated-language-secret'};},
      createAndroidSnapshot:()=>{throw Error('Android is disabled in this fixture');},onDashboardChanged:()=>{},onStatusChanged:()=>{}});
    assert.equal(desktop.getSyncRuntimeStatus().enabled,false);
    coordinator.scheduleSoon(0);
    await new Promise(done=>setTimeout(done,30));
    assert.equal(attempts,0,'Passive sync stays OFF');
    coordinator.scheduleSoon(0,true);
    await until(()=>attempts>0);
    await coordinator.suspendAndDrain();
    assert.equal(desktop.getSyncRuntimeStatus().enabled,false,'Explicit language publication does not change passive-sync preference');
    assert.ok(desktop.getPendingSyncJobs().length>0,'Offline publication remains in the durable outbox');
    const beforeTargetChange = store.siteCatalog(); assert.ok(beforeTargetChange);
    raw.prepare("UPDATE settings SET web_module_url='https://other.invalid/yardimci-asistan'").run();
    assert.equal(desktop.translations().siteCatalog(),undefined,'Catalog is scoped to the configured publication target');
  } finally { await service.stopAndDrain(); raw.close(); desktop.close(); writeFileSync(catalogFile,original); }
}
