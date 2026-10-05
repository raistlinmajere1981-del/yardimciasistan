import { chooseSearchSelect } from './test-helpers/search-select.mjs';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';
import { multichannelFixture } from './test-helpers/marketing-multichannel-fixtures.mjs';
import { editorialInput, imageBytes } from './test-helpers/marketing-fixtures.mjs';
const f=multichannelFixture(),a=f.media.importBytes(imageBytes,'upload'),b=f.media.importBytes(imageBytes,'upload');
f.campaigns.saveSegment({name:'Stüdyo kitlesi',filterDefinition:{version:1,rules:[]}});
const initial=f.service.saveContent(editorialInput({title:'D5 tanıtım',mediaAssetIds:[a.id,b.id],variants:['website','whatsapp','sms','instagram'].map(channel=>({channel,text:channel==='sms'?'SMS kısa taslak':'Kanal taslağı',metadata:{version:1},...(channel==='instagram'?{mediaAssetId:a.id}:{})}))}));
let browser,server;
try {
  server=await createServer({root:resolve('apps/desktop-app'),configFile:resolve('apps/desktop-app/vite.renderer.config.ts'),logLevel:'error',server:{port:5188,host:'127.0.0.1'}});await server.listen();browser=await launchChromiumForSmoke(chromium);
  const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/d5-fixture',async route=>route.fulfill({contentType:'text/html',body:await server.transformIndexHtml('/d5-fixture',`<html><body><div id="root"></div><script type="module" src="/@fs/${resolve('scripts/fixtures/marketing-multichannel.tsx')}"></script></body></html>`)}));
  await page.addInitScript(setup=>{window.__d5Setup=setup;},f.db.getSetupData());
  await page.exposeFunction('__d5Call',async(method,args)=>{
    const raw=['whatsappConfiguration','smsConfiguration','instagramConfiguration','testSms','testInstagram'];
    try {const operations={snapshot:()=>f.service.snapshot(),channels:()=>f.service.channels(),content:()=>f.service.saveContent(args[0]),publication:()=>f.service.savePublication(args[0]),publish:()=>f.db.getMarketingPublication(args[0]).channel==='instagram'?f.instagram.publish(...args):f.service.publish(...args),
      whatsappConfiguration:()=>f.single.getConfiguration(),smsConfiguration:()=>f.sms.getConfiguration(),instagramConfiguration:()=>f.instagram.getConfiguration(),
      templates:()=>f.single.listTemplates(),campaigns:()=>f.campaigns.listCampaigns(),segments:()=>f.campaigns.listSegments(),createCampaign:()=>f.campaigns.createCampaign(args[0]),campaign:()=>f.campaigns.getCampaign(args[0]),previewSegment:()=>f.campaigns.previewSegment(...args),prepareCampaign:()=>f.campaigns.prepareCampaign(args[0]),startCampaign:()=>f.campaigns.startCampaign(args[0]),
      testSms:()=>f.sms.testConnection(args[0]),smsSenders:()=>f.sms.listSenderIds(args[0]),testInstagram:()=>f.instagram.testConnection(args[0])};const value=await operations[method]();return raw.includes(method)?value:{ok:true,value};}catch(e){return {ok:false,code:e.code,message:e.message};}
  });
  await page.goto(`${server.resolvedUrls.local[0]}d5-fixture`);await page.getByRole('button',{name:'D5 tanıtım',exact:false}).click();
  for(const name of ['Website','WhatsApp Business','SMS','Instagram'])await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
  await expect(page.getByLabel('Seçilen görseller',{exact:true})).toContainText('2 / 20');
  await page.getByRole('button',{name:'SMS',exact:true}).click();await expect(page.getByText('15/160 karakter',{exact:false})).toBeVisible();await expect(page.getByLabel('Seçilen görseller',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Kampanya oluştur / hazırla',exact:true}).click();await expect(page.getByLabel('Yeni kampanya',{exact:true})).toBeVisible();await expect(page.getByLabel('SMS metni',{exact:true})).toHaveValue('SMS kısa taslak');await chooseSearchSelect(page, 'Segment', {label:'Stüdyo kitlesi'});
  await page.getByRole('button',{name:'Taslağı kaydet',exact:true}).click();await expect(page.getByLabel('Kampanya çalışma alanı',{exact:true})).toContainText('SMS / İleti Merkezi');
  assert.equal(f.calls.some(c=>c.url.includes('send-sms')),false);const sms=f.campaigns.listCampaigns()[0];assert.equal(sms.contentId,initial.content.id);
  await page.getByRole('button',{name:'Hazırla',exact:true}).click();await page.getByRole('button',{name:'Gönderimi Başlat',exact:true}).click();assert.equal(f.campaigns.getCampaign(sms.id).campaign.status,'running');assert.equal(f.calls.some(c=>c.url.includes('send-sms')),false);
  await page.getByRole('button',{name:'İçerik Stüdyosu',exact:true}).click();await page.getByRole('button',{name:'D5 tanıtım',exact:false}).click();await page.getByRole('button',{name:'WhatsApp Business',exact:true}).click();await expect(page.getByText('Gerçek WhatsApp marketing gönderimi',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Kampanya oluştur / hazırla',exact:true}).click();await chooseSearchSelect(page, 'Segment', {label:'Stüdyo kitlesi'});await expect(page.getByRole('button',{name:'Taslağı kaydet',exact:true})).toBeDisabled();await chooseSearchSelect(page, 'Onaylı şablon', {value:'fixture_template'});await page.getByLabel('body 1 bağlantısı',{exact:false}).selectOption('customer.fullName');await page.getByRole('button',{name:'Taslağı kaydet',exact:true}).click();assert.equal(f.campaigns.listCampaigns().length,2);assert.equal(f.calls.some(c=>c.url.includes('/messages')),false);
  await page.getByRole('button',{name:'İçerik Stüdyosu',exact:true}).click();await page.getByRole('button',{name:'D5 tanıtım',exact:false}).click();await page.getByRole('button',{name:'Instagram',exact:true}).click();await expect(page.getByLabel('Seçilen görseller',{exact:true})).toContainText('1 / 1');
  await page.getByRole('button',{name:'Görsel 1 çıkar',exact:true}).click();await expect(page.getByRole('button',{name:'Instagram önizlemesi',exact:true})).toBeDisabled();await chooseSearchSelect(page, 'Medya seç', { value: b.id });
  mkdirSync('artifacts/marketing',{recursive:true});await page.screenshot({path:'artifacts/marketing/d5-studio.png'});
  await page.getByRole('button',{name:'Instagram önizlemesi',exact:true}).click();await page.getByRole('button',{name:'Instagram’da yayınla',exact:true}).click();await expect(page.getByLabel('Yayın çalışma alanı',{exact:true})).toContainText('Instagram yayını değiştirilemez');assert.equal(f.db.listMarketingPublications().filter(p=>p.channel==='instagram').length,1);assert.equal(f.db.listMarketingContents()[0].media.length,2);assert.equal(f.db.listMarketingContents()[0].variants.find(v=>v.channel==='instagram').mediaAssetId,b.id);
  await page.getByRole('button',{name:'Durumu yenile',exact:true}).click();await expect(page.getByLabel('Yayınlar',{exact:true}).getByRole('button')).toHaveCount(3);await page.screenshot({path:'artifacts/marketing/d5-publications.png'});assert.equal(f.campaigns.listCampaigns().length,2);
  await page.getByRole('button',{name:'Kanallar / Ayarlar',exact:true}).click();const smsCard=page.getByRole('region',{name:'SMS / İleti Merkezi',exact:true}),igCard=page.getByRole('region',{name:'Instagram',exact:true});
  await expect(smsCard.getByLabel('SMS API Key',{exact:true})).toHaveValue('');await expect(igCard.getByLabel('Instagram Access Token',{exact:true})).toHaveValue('');
  await smsCard.getByRole('button',{name:'Bağlantıyı test et',exact:true}).click();await expect(smsCard.getByRole('status')).toContainText('Başarılı');await igCard.getByRole('button',{name:'Bağlantıyı test et',exact:true}).click();await expect(igCard.getByRole('status')).toContainText('fixture_account');
  await smsCard.getByLabel('SMS / İleti Merkezi servisi',{exact:true}).uncheck();await expect(smsCard.getByLabel('SMS API Key',{exact:true})).toHaveCount(0);await igCard.getByLabel('Instagram servisi',{exact:true}).uncheck();await expect(igCard.getByLabel('Instagram Access Token',{exact:true})).toHaveCount(0);
  assert.deepEqual(errors,[]);await expect(page.getByRole('dialog')).toHaveCount(0);mkdirSync('artifacts/marketing',{recursive:true});await page.screenshot({path:'artifacts/marketing/d5-services.png'});
  console.log('D5 UI: four channels, independent image selection, SMS and approved-template Campaign reuse, explicit Instagram post, unified records and staged provider cards passed.');
} finally {await browser?.close();await server?.close();await f.dispose();}
