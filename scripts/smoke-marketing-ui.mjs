import { chooseSearchSelect } from './test-helpers/search-select.mjs';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';
import { marketingFixture } from './test-helpers/marketing-fixtures.mjs';
const f=marketingFixture({ai:true});f.state.selected=[f.uploadPath];f.state.response='Ürün kampanyası';
let browser,server;
try {
  server=await createServer({root:resolve('apps/desktop-app'),configFile:resolve('apps/desktop-app/vite.renderer.config.ts'),logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();browser=await launchChromiumForSmoke(chromium);
  const page=await browser.newPage({viewport:{width:1440,height:1040}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/marketing-fixture',async route=>route.fulfill({contentType:'text/html',body:await server.transformIndexHtml('/marketing-fixture',`<html><body><div id="root"></div><script type="module" src="/@fs/${resolve('scripts/fixtures/marketing.tsx')}"></script></body></html>`)}));
  await page.exposeFunction('__marketingCall',async(method,args)=>{
    try {const operations={snapshot:()=>f.service.snapshot(),channels:()=>f.service.channels(),content:()=>f.service.saveContent(args[0]),upload:()=>f.service.upload(),asset:()=>f.service.manageAsset(...args),ai:()=>f.service.generate(args[0]),publication:()=>f.service.savePublication(args[0]),publish:()=>f.service.publish(...args),unpublish:()=>f.service.unpublish(...args)};
      return {ok:true,value:await operations[method]()};}catch(e){return {ok:false,code:e.code??'failed',message:e.message};}
  });
  await page.goto(`${server.resolvedUrls.local[0]}marketing-fixture`);
  await page.getByRole('button',{name:'Yeni içerik',exact:true}).click();await page.getByLabel('İçerik başlığı',{exact:true}).fill('UI D4 duyuru');
  await page.getByLabel('Ana metin',{exact:true}).fill('Kampanya amacı');
  await page.getByRole('button',{name:'Medya',exact:true}).click();await expect(page.getByLabel('Kaydedilmemiş değişiklikler',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Düzenlemeye dön',exact:true}).click();await expect(page.getByLabel('İçerik başlığı',{exact:true})).toHaveValue('UI D4 duyuru');
  await page.getByRole('button',{name:'AI ile metin oluştur',exact:true}).click();await expect(page.getByLabel('AI taslak önizlemesi')).toBeVisible();
  await expect(page.getByLabel('Ana metin',{exact:true})).toHaveValue('Kampanya amacı');assert.equal(f.db.listMarketingPublications().length,0);
  await page.getByRole('button',{name:'Taslağı uygula',exact:true}).click();await expect(page.getByLabel('Ana metin',{exact:true})).toHaveValue('Ürün kampanyası');
  await page.getByRole('button',{name:'AI kanal varyantı oluştur',exact:true}).click();await page.getByRole('button',{name:'Taslağı uygula',exact:true}).click();
  await expect(page.getByLabel('Kanal metni',{exact:true})).toHaveValue('Ürün kampanyası');
  await page.getByRole('button',{name:'WhatsApp Business',exact:true}).click();await page.getByLabel('Kanal metni',{exact:true}).fill('Bağımsız WhatsApp');
  await page.getByRole('button',{name:'Website',exact:true}).click();await expect(page.getByLabel('Kanal metni',{exact:true})).toHaveValue('Ürün kampanyası');
  await page.getByRole('button',{name:'Görsel yükle',exact:true}).click();const uploaded=f.db.listMediaAssets()[0].id;
  await chooseSearchSelect(page, 'Medya seç', { value: uploaded });
  await page.getByRole('button',{name:'AI ile görsel oluştur',exact:true}).click();await expect(page.getByLabel('AI görsel önizlemesi')).toBeVisible();
  await page.getByRole('button',{name:'İçeriğe ekle',exact:true}).click();await expect(page.getByLabel('Seçilen görseller',{exact:true})).toContainText('2 / 20');
  await page.getByRole('button',{name:'Görsel 2 yukarı',exact:true}).click();
  await page.getByRole('button',{name:'İçeriği kaydet',exact:true}).click();await expect(page.getByText('İçerik kaydedildi.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Fixture sayfa değiştir'}).click();await page.getByRole('button',{name:'Fixture sayfa değiştir'}).click();
  await expect(page.getByLabel('İçerik başlığı',{exact:true})).toHaveValue('UI D4 duyuru');
  const content=f.db.listMarketingContents()[0];assert.equal(content.content.source,'ai');assert.equal(content.variants.find(v=>v.channel==='whatsapp').text,'Bağımsız WhatsApp');
  assert.equal(content.media[1].mediaAssetId,uploaded);assert.equal(f.db.listMarketingPublications().length,0);
  await page.getByRole('button',{name:'Website önizlemesi',exact:true}).click();await expect(page.getByLabel('Website yayın önizlemesi',{exact:true})).toBeVisible();
  assert.equal(f.db.listMarketingPublications().length,0,'preview creates no publication');
  await page.getByRole('button',{name:"Website'te yayınla",exact:true}).click();await expect(page.getByLabel('Yayın çalışma alanı',{exact:true})).toBeVisible();
  let pub=f.db.listMarketingPublications()[0];assert.equal(pub.status,'publishing');assert.equal(pub.mediaAssetIds.length,2);
  f.publisher.acknowledge([pub],new Date().toISOString());await page.getByRole('button',{name:'Durumu yenile',exact:true}).click();await expect(page.getByLabel('Yayın çalışma alanı')).toContainText('Yayında');
  await page.getByLabel('Yayın metni',{exact:true}).fill('Canlı düzenleme');await page.getByRole('button',{name:'Görsel 1 çıkar',exact:true}).click();
  await page.getByRole('button',{name:'Yayını güncelle',exact:true}).click();pub=f.db.listMarketingPublications()[0];assert.equal(pub.text,'Canlı düzenleme');assert.equal(pub.mediaAssetIds.length,1);assert.ok(pub.revision>pub.publishedRevision);
  f.publisher.acknowledge([pub],new Date().toISOString());await page.getByRole('button',{name:'Durumu yenile',exact:true}).click();
  await page.getByRole('button',{name:'Yayından kaldır',exact:true}).click();await expect(page.getByLabel('Yayından kaldırma onayı')).toBeVisible();
  await page.getByRole('button',{name:'Kaldırmayı onayla',exact:true}).click();pub=f.db.listMarketingPublications()[0];assert.equal(pub.desiredPublished,false);
  f.publisher.acknowledge([pub],new Date().toISOString());await page.getByRole('button',{name:'Durumu yenile',exact:true}).click();await expect(page.getByLabel('Yayın çalışma alanı')).toContainText('Yayından kaldırıldı');
  await page.getByRole('button',{name:'Medya',exact:true}).click();await expect(page.getByLabel('Medya kütüphanesi',{exact:true})).toContainText('AI görseli');
  await expect(page.getByRole('button',{name:'Görseli sil',exact:true}).first()).toBeDisabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>localStorage.length),0);
  mkdirSync('artifacts/marketing',{recursive:true});await page.screenshot({path:'artifacts/marketing/library.png'});
  await page.getByRole('button',{name:'Fixture sayfa değiştir'}).click();await page.getByRole('button',{name:'Fixture sayfa değiştir'}).click();
  await expect(page.getByLabel('Medya kütüphanesi',{exact:true})).toBeVisible();
  for (const scheme of ['light','dark']) for (const width of [1440,1280,390]) {
    await page.setViewportSize({width,height:720});await page.evaluate(s=>document.documentElement.dataset.colorScheme=s,scheme);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`artifacts/marketing/library-${scheme}-${width}.png`});
  }
  f.state.unavailable=true;await page.getByRole('button',{name:'Durumu yenile',exact:true}).click();
  await page.getByRole('button',{name:'İçerik Stüdyosu',exact:true}).click();await page.getByRole('button',{name:'Yeni içerik',exact:true}).click();
  for(const name of ['AI ile metin oluştur','AI ile yeniden yaz','AI kanal varyantı oluştur','AI ile görsel oluştur']) await expect(page.getByRole('button',{name,exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'SMS',exact:true}).click();await expect(page.getByText('Servis yapılandırılmamış veya kapalı',{exact:true})).toBeVisible();
  assert.deepEqual(errors,[]);
  console.log('D4 user flow: draft preservation, explicit AI acceptance, independent variants, upload/generate/select/reorder, preview/publish/live update/unpublish and media usage passed.');
} finally {await browser?.close();await server?.close();f.dispose();}
