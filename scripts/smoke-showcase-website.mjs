import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createServer} from 'node:net';
import {chromium, expect} from '@playwright/test';
import {installDemoSite} from './test-helpers/demo-site.mjs';
import {launchChromiumForSmoke} from './test-helpers/playwright-browser.mjs';
import {checkDemoTemplate} from './sync-demo-template.mjs';
import {stageDemoDeployment, retiredDemoPaths} from './lib/demo-deployment.mjs';

const root = mkdtempSync(join(tmpdir(), 'ya-showcase-3a-')), site = join(root, 'site');
const evidenceDir = 'artifacts/site-redesign-plan/ortak-kaynak-demo';
const widget = readFileSync('test-site/landing/assets/assistant/widget.js');
const templateWidget = readFileSync('web-site-template/public/assets/core/widget.js');
const manifest = JSON.parse(readFileSync('web-site-template/template-manifest.json', 'utf8'));
assert.deepEqual(widget, templateWidget, 'Generated widget must match the template release');
assert.equal(createHash('sha256').update(widget).digest('hex'), manifest.common['public/assets/core/widget.js'], 'Widget fingerprint must match the template release manifest');
installDemoSite(join(root,'api-fixture'));
stageDemoDeployment(resolve('test-site/landing'),site);
// Copy only the isolated backend into the actual deployment tree.
const hosting=join(site,'yardimci-asistan');
const {cpSync}=await import('node:fs');cpSync(join(root,'api-fixture/yardimci-asistan'),hosting,{recursive:true});
const secret = 'showcase-only-test-key<&"';
writeFileSync(join(hosting,'config/business.json'), JSON.stringify({sync_secret:secret}));
const probe = createServer(); await new Promise(done => probe.listen(0,'127.0.0.1',done));
const port = probe.address().port; await new Promise(done => probe.close(done));
const base = `http://127.0.0.1:${port}`;
const php = spawn('php',['-S',`127.0.0.1:${port}`,'-t',site], {env:{...process.env,PHP_CLI_SERVER_WORKERS:'4',YA_SITE_API_ORIGIN:base},stdio:'ignore',detached:true});
let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(base+'/yardimci-asistan/api/business.php')).ok)break;}catch{}await new Promise(done=>setTimeout(done,30));}
  checkDemoTemplate();
  assert.deepEqual(readFileSync('web-site-template/public/assets/core/widget.js'),readFileSync('test-site/landing/assets/assistant/widget.js'),'Shared widget bundle must match its maintained source build');
  const plan = stageDemoDeployment(resolve('test-site/landing'), join(root,'package'));
  for(const path of ['index.php','kurulum/index.php','kullanim-kilavuzu/index.php','deneme/entry.php','deneme/core/i18n.php','deneme/core/.htaccess','deneme/site/.htaccess','deneme/assets/core/widget.js','deneme/assets/core/portal.js','deneme/assets/core/storefront.js','hesabim/index.php','locales/tr.json','assets/assistant/showcase.js']) assert.ok(plan.files[path],path);
  assert.ok(!Object.keys(plan.files).some(path=>/^(yardimci-asistan|downloads|updates)\//.test(path)));
  for(const path of ['assets/js/site.js','inc/site.php','assets/css/showcase.css','assets/i18n/en.json']) assert.equal(plan.files[path],undefined);
  assert.ok(retiredDemoPaths.includes('assets/js/site.js'));
  const installedCore=join(site,'deneme/core/i18n.php'), originalCore=readFileSync(installedCore);
  writeFileSync(installedCore,Buffer.concat([originalCore,Buffer.from('\n// Local core fork\n')]));
  assert.throws(()=>checkDemoTemplate(site,true),/Local demo core conflict/);
  assert.ok(readFileSync(installedCore,'utf8').includes('Local core fork'),'Updater must not overwrite local edits');
  writeFileSync(installedCore,originalCore);
  for(const path of ['/?resource=translation-source','/deneme/?resource=translation-source']) assert.equal((await fetch(base+path,{method:'POST'})).status,405);
  console.log('PASS complete allowlisted deployment, private source rules, shared-core integrity and controlled retirement plan');

  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage(), errors = [], assets = [];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400&&new URL(response.url()).pathname.startsWith('/assets/'))assets.push(response.url());});
  for(const path of ['/','/kurulum/','/kullanim-kilavuzu/']) {
    await page.goto(base+path+'?lang=en');
    await expect(page.locator('html')).toHaveAttribute('lang','tr');
    await expect(page.locator('.flag-language')).toHaveCount(0);
    await expect(page.locator('#yardimci-asistan-widget')).toHaveCount(0);
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('[data-site-nav] a[href="/kurulum/"]')).toHaveCount(1);
    await expect(page.locator('[data-site-nav] a[href="/kullanim-kilavuzu/"]')).toHaveCount(1);
  }
  await page.goto(base+'/');
  const headerBackground = await page.locator('.top-header').evaluate(node => getComputedStyle(node).backgroundColor);
  const headerAlpha = headerBackground.match(/rgba\([^)]*,\s*([\d.]+)\)$/)?.[1] ?? '1';
  assert.equal(Number(headerAlpha),1,'Sticky header must fully cover content beneath it');
  await expect(page.locator('[data-showcase-avatar] svg[data-nexa-rig]')).toBeVisible();
  assert.equal(await page.evaluate(()=>typeof window.YardimciAsistanWidget),'undefined','Presentation avatar must not initialize the AI widget');
  assert.equal(await page.locator('main form, main .product-card, main [data-room-list]').count(),0);
  console.log('PASS two-layer upper navigation, Turkish-only source fallback and presentation-only Nexa');
  // Canonical graph coverage: no independently maintained profile/dependency list on the site.
  const shared = createRequire(import.meta.url)('../packages/shared/dist/index.js');
  const projection = JSON.parse(readFileSync(join(site,'assets/assistant/capability-projection.json'),'utf8'));
  assert.deepEqual(projection.nodes.filter(node=>!node.id.startsWith('integration.')).map(node=>node.id),Object.values(shared.BUSINESS_CAPABILITIES));
  for (const node of projection.nodes) {
    if (node.id.startsWith('integration.')) assert.deepEqual(node.owners,[...shared.BUSINESS_SERVICE_CAPABILITY_OWNERS[node.id.slice(12)]]);
    else assert.deepEqual(node.dependencies,[...shared.getBusinessCapabilityDependencies(node.id)]);
  }
  await expect(page.locator('[data-explanation="simple"]')).toHaveAttribute('aria-current','true');
  await expect(page.locator('[data-capability][open]')).toHaveCount(0);
  const renderedIds = await page.locator('[data-capability]').evaluateAll(cards=>cards.map(card=>card.dataset.capability));
  assert.deepEqual([...renderedIds].sort(),projection.nodes.map(node=>node.id).sort(),'Benefit groups must include each canonical node exactly once');
  await expect(page.locator('[data-tree-group]')).toHaveCount(4);
  for (const benefit of await page.locator('[data-capability]:visible .capability-benefit').all()) {
    await expect(benefit).toBeVisible();assert.ok((await benefit.innerText()).length>20);
  }
  assert.ok(!(await page.locator('[data-capability-tree]').innerText()).includes('discovery.'));
  await page.locator('[data-explanation="detailed"]').focus();await page.keyboard.press('Enter');
  await expect(page.locator('[data-explanation="detailed"]')).toHaveAttribute('aria-current','true');
  await expect(page.locator('[data-capability][open]')).toHaveCount(projection.nodes.length);
  await expect(page.locator('.capability-card[open] .capability-benefit:visible')).toHaveCount(0);
  await expect(page.locator('[data-capability="core.finance"] dl')).toContainText('Nerede kullanılır?');
  await expect(page.locator('[data-capability="core.finance"] dl')).toContainText('Gereken modüller');
  await page.locator('[data-sector="market"]').click();
  await expect(page.locator('[data-explanation="detailed"]')).toHaveAttribute('aria-current','true');
  await page.reload();await expect(page.locator('[data-capability][open]')).toHaveCount(projection.nodes.length);
  await page.locator('[data-explanation="simple"]').click();
  await expect(page.locator('[data-capability][open]')).toHaveCount(0);
  await expect(page.locator('.capability-benefit:visible')).toHaveCount(await page.locator('[data-capability]:visible').count());
  await page.goBack();await expect(page.locator('[data-explanation="detailed"]')).toHaveAttribute('aria-current','true');
  await page.goForward();await expect(page.locator('[data-explanation="simple"]')).toHaveAttribute('aria-current','true');
  console.log('PASS simple default, benefit groups, detailed mode, keyboard selector, reload and mode history');
  for (const sector of ['pension','pension_restaurant','restaurant','market','all']) {
    await page.locator(`[data-sector="${sector}"]`).click();
    await expect(page.locator(`[data-sector="${sector}"]`)).toHaveAttribute('aria-current','true');
    const expected = projection.nodes.filter(node=>node.levels[sector]);
    await expect(page.locator('[data-capability]:visible')).toHaveCount(expected.length);
    for (const core of shared.CORE_BUSINESS_CAPABILITIES) await expect(page.locator(`[data-capability="${core}"]`)).toBeVisible();
    for (const node of projection.nodes.filter(node=>!node.id.startsWith('integration.'))) {
      const allowed = sector === 'all' || shared.businessProfileSupportsCapability(sector,node.id);
      assert.equal(Boolean(node.levels[sector]),allowed,`${sector}: ${node.id}`);
    }
    const allowedCapabilities=Object.values(shared.BUSINESS_CAPABILITIES).filter(capability=>sector==='all'||shared.businessProfileSupportsCapability(sector,capability));
    for(const node of projection.nodes.filter(node=>node.id.startsWith('integration.'))) {
      assert.equal(Boolean(node.levels[sector]),shared.isBusinessServiceAvailable(node.id.slice(12),allowedCapabilities),`${sector}: service ${node.id}`);
    }
    for (const node of expected) await expect(page.locator(`[data-capability="${node.id}"]`)).toBeVisible();
    for (const group of await page.locator('[data-tree-group]').all()) {
      assert.equal(await group.isVisible(),await group.locator('[data-capability]:visible').count()>0);
    }
  }
  const financeCard = page.locator('[data-capability="core.finance"]');
  await financeCard.locator('summary').focus();await page.keyboard.press('Enter');
  await expect(financeCard).toHaveAttribute('open','');
  await expect(financeCard.locator('.capability-benefit')).toBeHidden();
  await expect(financeCard.locator('dl')).toContainText('AI desteği');
  await financeCard.locator('summary').press('Enter');
  await expect(financeCard).not.toHaveAttribute('open','');
  await expect(financeCard.locator('.capability-benefit')).toBeVisible();
  const creditCard=page.locator('[data-capability="commerce.customer_credit"]');
  await creditCard.locator('summary').click();await creditCard.locator('a[href="#cap-core.customers"]').click();
  await expect(page.locator('[data-capability="core.customers"]')).toHaveAttribute('open','');
  await page.goBack();
  await page.locator('[data-sector="pension"]').click();await page.locator('[data-sector="market"]').click();
  await page.goBack();await expect(page.locator('[data-sector="pension"]')).toHaveAttribute('aria-current','true');
  await page.goto(base+'/');
  for (const button of await page.locator('[data-nexa-message]').all()) {
    await button.click();await expect(button).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('.showcase-avatar-speech')).toHaveText(await button.getAttribute('data-nexa-message'));
  }
  const nexa=page.locator('[data-showcase-avatar] svg[data-nexa-rig]');
  await expect(nexa).toHaveAttribute('data-motion-active','true');
  await page.locator('#yetenekler').scrollIntoViewIfNeeded();await expect(nexa).toHaveAttribute('data-motion-active','false');
  await page.locator('.hero-section').scrollIntoViewIfNeeded();await page.evaluate(()=>scrollTo(0,0));await expect(nexa).toHaveAttribute('data-motion-active','true');
  await page.emulateMedia({reducedMotion:'reduce'});await expect(nexa).toHaveAttribute('data-motion-active','false');
  const frozen=await nexa.evaluate(node=>node.outerHTML);await page.waitForTimeout(150);assert.equal(await nexa.evaluate(node=>node.outerHTML),frozen);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'}));
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect(nexa).toHaveAttribute('data-motion-active','false');
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));});
  const lowPower=await browser.newContext();await lowPower.addInitScript(()=>Object.defineProperty(navigator,'hardwareConcurrency',{value:2}));
  const lowPage=await lowPower.newPage();await lowPage.goto(base+'/');await expect(lowPage.locator('[data-showcase-avatar] svg')).toHaveAttribute('data-motion-active','false');await lowPower.close();
  for(const connection of ['local','internet','cloud']) {
    await page.locator(`[data-connection="${connection}"]`).click();
    await expect(page.locator(`button[data-connection="${connection}"]`)).toHaveAttribute('aria-pressed','true');
    await expect(page.locator(`[data-connection-note="${connection}"]`)).toHaveClass(/is-highlighted/);
    await expect(page.locator('.ecosystem')).toHaveAttribute('data-connection',connection);
  }
  console.log('PASS canonical sector graph, dependencies, keyboard details, filter history, scripted Nexa, offscreen/reduced-motion/low-power suspension');

  await page.goto(base+'/kullanim-kilavuzu/');
  await page.locator('#guide-search').fill('barkod');await expect(page.locator('[data-guide-topic]:visible')).toHaveCount(1);
  await expect(page.locator('#satis')).toBeVisible();
  await page.locator('#guide-search').fill('no-such-topic');await expect(page.locator('[data-guide-empty]')).toBeVisible();
  await page.locator('[data-guide-reset]').click();await expect(page.locator('[data-guide-topic]:visible')).toHaveCount(6);
  await page.locator('[data-guide-link="android"]').click();await expect(page.locator('#android')).toBeFocused();
  await page.locator('#android [data-guide-image]').click();await expect(page.locator('[data-image-dialog]')).toBeVisible();
  await expect(page.locator('[data-image-dialog] img')).toHaveAttribute('alt',/Android/);
  await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.querySelector('dialog').contains(document.activeElement)));
  await page.keyboard.press('Escape');await expect(page.locator('[data-image-dialog]')).toBeHidden();await expect(page.locator('#android [data-guide-image]')).toBeFocused();
  await page.locator('#android [data-guide-image]').click();await page.locator('[data-image-close]').click();await expect(page.locator('#android [data-guide-image]')).toBeFocused();
  console.log('PASS guide search, empty/reset, quick navigation, image zoom, native focus containment, Escape and return focus');

  mkdirSync('artifacts/landing-3b',{recursive:true});
  for (const width of [1440,768,390,320]) {
    await page.setViewportSize({width,height:width===1440?1000:900});
    for (const [path,name] of [['/','home'],['/kullanim-kilavuzu/','guide']]) {
      await page.goto(base+path);await page.evaluate(()=>document.fonts.ready);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} overflow ${width}`);
      // Expanded text must fit, too; capture the clean collapsed overview afterwards.
      if(name==='home') {
        await page.locator('[data-sector="all"]').click();
        await page.locator('[data-capability]:visible').evaluateAll(nodes=>nodes.forEach(node=>node.open=true));
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`expanded capability overflow ${width}`);
        await page.locator('[data-capability]').evaluateAll(nodes=>nodes.forEach(node=>node.open=false));
        await page.locator('[data-sector="pension_restaurant"]').click();await page.evaluate(()=>scrollTo(0,0));
      }
      for(const image of await page.locator('main img:visible').all()) {
        await image.scrollIntoViewIfNeeded();await expect(image).toBeVisible();
        await expect.poll(()=>image.evaluate(node=>node.complete&&node.naturalWidth>0)).toBe(true);
      }
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:`artifacts/landing-3b/${name}-${width}.png`,fullPage:true});
      await page.screenshot({path:`artifacts/landing-3b/${name}-${width}-viewport.png`});
      assert.ok(await page.locator('main img:visible').evaluateAll(nodes=>nodes.every(node=>node.complete&&node.naturalWidth>0)),`unloaded ${name} image ${width}`);
    }
  }


  await page.goto(base+'/kurulum/');
  await expect(page.locator('#demo-sync-secret')).toHaveValue(secret);
  await expect(page.locator('.download-card')).toHaveCount(5);
  await expect(page.locator('a.download-card')).toHaveCount(0);
  const release = JSON.parse(readFileSync(join(site,'release.json'),'utf8'));
  const packages = [`YardimciAsistan-Setup-${release.desktopVersion}.exe`,`YardimciAsistan-Setup-${release.desktopVersion}-x86.exe`,`YardimciAsistan-Android-${release.androidVersion}.apk`,`YardimciAsistan-Bayi-Android-${release.dealerAndroidVersion}.apk`];
  mkdirSync(join(site,'downloads'));
  for(const file of packages)writeFileSync(join(site,'downloads',file),'isolated-test-artifact');
  await page.reload(); await expect(page.locator('a.download-card')).toHaveCount(4);
  for(const url of await page.locator('a.download-card').evaluateAll(nodes=>nodes.map(node=>node.href)))assert.equal((await fetch(url)).status,200);
  writeFileSync(join(site,'downloads',packages[2]),'');
  await page.reload();await expect(page.locator('a.download-card')).toHaveCount(3);
  await expect(page.locator('.download-card-unavailable').filter({hasText:'Linux'})).toHaveCount(1);
  await expect(page.locator('.download-card-unavailable').filter({hasText:'Linux'})).toHaveText('Linux AppImage Sonra yayınlanacak');
  console.log('PASS release versions, escaped demo key, only nonempty published download artifacts and truthful Linux state');

  for(const [path,target] of [['odalar','rooms'],['odalar/oda','rooms'],['restoran','restaurant'],['restoran/masa','restaurant'],['qr-menu','menu'],['magaza','catalog'],['hakkimizda','about'],['galeri','gallery'],['duyurular','announcements'],['yorumlar','reviews'],['iletisim','contact'],['hesabim','account'],['bayi','account'],['deneme/hesabim','account'],['deneme/bayi','account']]) {
    const res=await fetch(`${base}/${path}/?id=r&lang=de&page=home&action=verify`,{redirect:'manual'});
    assert.equal(res.status,308,path);const url=new URL(res.headers.get('location'),base);
    assert.equal(url.pathname,'/deneme/');assert.equal(url.searchParams.get('page'),target);
    assert.equal(url.searchParams.get('id'),'r');assert.equal(url.searchParams.get('lang'),'de');assert.equal(url.searchParams.get('action'),'verify');
    assert.equal((await res.text()).includes('<html'),false,'Retired routes cannot serve the old design');
  }
  for(const path of ['/deneme/core/bootstrap.php','/deneme/core/views/layout.php','/deneme/site/config.php','/deneme/entry.php']) assert.equal((await fetch(base+path)).status,404,path);
  console.log('PASS legacy retirement redirects preserve language/resource/account action and private PHP denies direct HTTP access');

  await page.setViewportSize({width:1440,height:900});await page.goto(base+'/');
  await expect(page.locator('[data-site-nav] a[href="/deneme/"]')).toHaveCount(1);
  await expect(page.locator('[data-site-nav] a[href^="/deneme/?page="]')).toHaveCount(0);
  await expect(page.locator('.footer-navs a[href^="/deneme/?page="]')).toHaveCount(0);
  const [demoTab] = await Promise.all([
    page.waitForEvent('popup'), page.locator('[data-site-nav] a[href="/deneme/"]').click()
  ]);
  await demoTab.waitForURL(/\/deneme\//, {timeout:12000});
  assert.equal(new URL(demoTab.url()).pathname,'/deneme/');
  assert.equal(new URL(page.url()).pathname,'/');
  await demoTab.close();
  for(const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:900});await page.goto(base+'/');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`upper overflow ${width}`);
    if(width<768) {
      await page.locator('[data-menu-toggle]').click();await expect(page.locator('[data-site-nav]')).toBeVisible();
      await expect(page.locator('[data-site-nav] a[href="/deneme/"]')).toHaveAttribute('target','_blank');
      await expect(page.locator('[data-site-nav] details')).toHaveCount(0);
      await page.keyboard.press('Escape');await expect(page.locator('[data-menu-toggle]')).toBeFocused();
    }
  }
  mkdirSync(evidenceDir,{recursive:true});
  for (const width of [1440,768,390,320]) {
    await page.setViewportSize({width,height:1000});
    for (const mode of ['simple','detailed']) {
      await page.goto(`${base}/?sector=pension_restaurant&explanation=${mode}#yetenekler`);
      await expect(page.locator(`[data-explanation="${mode}"]`)).toHaveAttribute('aria-current','true');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${mode} overflow ${width}`);
      await page.evaluate(()=>window.scrollTo(0,document.querySelector('[data-sector-filters]').getBoundingClientRect().top+window.scrollY-105));
      await page.screenshot({path:`${evidenceDir}/demo-moduller-${mode}-${width}.png`});
      if (width===1440) {
        await page.locator('[data-capability="core.finance"]').screenshot({path:`${evidenceDir}/demo-kasa-${mode}.png`});
        if (mode==='simple') await page.locator('[data-tree-group="sales"]').screenshot({path:`${evidenceDir}/demo-satis-ve-para.png`});
      }
    }
  }
  // Browser-validated, self-contained presentation reference; no backend or customer data.
  await page.goto(`${base}/?sector=pension_restaurant#yetenekler`);
  writeFileSync(`${evidenceDir}/demo-moduller-section.html`,await page.locator('#yetenekler').evaluate(node=>node.outerHTML));
  const nojs=await browser.newContext({javaScriptEnabled:false});const staticPage=await nojs.newPage();
  await staticPage.goto(base+'/kullanim-kilavuzu/');await expect(staticPage.locator('.guide-article')).toHaveCount(6);
  for(const sector of projection.sectors) {
    await staticPage.goto(base+'/?sector='+sector);
    await expect(staticPage.locator('[data-capability]:visible')).toHaveCount(projection.nodes.filter(node=>node.levels[sector]).length);
    await staticPage.locator('[data-capability="core.customers"] summary').click();
    await expect(staticPage.locator('[data-capability="core.customers"]')).toHaveAttribute('open','');
  }
  await staticPage.goto(base+'/?sector=market');
  await expect(staticPage.locator('[data-capability][open]')).toHaveCount(0);
  await staticPage.locator('[data-explanation="detailed"]').click();
  await expect(staticPage.locator('[data-capability][open]')).toHaveCount(projection.nodes.length);
  await staticPage.locator('[data-sector="pension"]').click();
  await expect(staticPage.locator('[data-explanation="detailed"]')).toHaveAttribute('aria-current','true');
  await staticPage.locator('[data-explanation="simple"]').click();
  await expect(staticPage.locator('[data-capability][open]')).toHaveCount(0);
  await staticPage.setViewportSize({width:320,height:900});await staticPage.goto(base+'/');
  await expect(staticPage.locator('[data-site-nav] a[href="/kullanim-kilavuzu/"]')).toBeVisible();
  await expect(staticPage.locator('[data-showcase-avatar] img')).toBeVisible();
  await nojs.close();assert.deepEqual(errors,[]);assert.deepEqual(assets,[]);
  console.log('PASS responsive navigation, keyboard focus, no-JS guide and all loaded assets');
} finally {await browser?.close();try{process.kill(-php.pid,'SIGTERM');}catch{}rmSync(root,{recursive:true,force:true});}
