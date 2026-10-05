import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,expect} from '@playwright/test';
import {createServer} from 'vite';
import {launchChromiumForSmoke} from './test-helpers/playwright-browser.mjs';
import {scheduleFixture} from './test-helpers/marketing-schedule-fixtures.mjs';
import {campaignInput,createCustomer,preference} from './test-helpers/messaging-campaign-fixtures.mjs';
const f=scheduleFixture(),web=f.publication(),ig=f.publication('instagram'),sms=(await f.smsCampaign()).campaign;
const customer=createCustomer(f.db,'UI_CUSTOMER_PRIVATE');f.campaigns.savePreference(preference(customer,'opted_in'));
const segment=f.campaigns.saveSegment({name:'WA',filterDefinition:{version:1,rules:[]}}),wa=f.campaigns.createCampaign(campaignInput(segment.id));await f.campaigns.prepareCampaign(wa.id);
let browser,server;
try {
  server=await createServer({root:resolve('apps/desktop-app'),configFile:resolve('apps/desktop-app/vite.renderer.config.ts'),logLevel:'error',server:{port:5190,host:'127.0.0.1'}});await server.listen();browser=await launchChromiumForSmoke(chromium);
  const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/schedule-fixture',async route=>route.fulfill({contentType:'text/html',body:await server.transformIndexHtml('/schedule-fixture',`<html><body><div id="root"></div><script type="module" src="/@fs/${resolve('scripts/fixtures/marketing-schedules.tsx')}"></script></body></html>`)}));
  await page.exposeFunction('__scheduleCall',async(method,args)=>{
    try {const operations={snapshot:()=>f.service.snapshot(),channels:()=>f.service.channels(),content:()=>f.service.saveContent(args[0]),publication:()=>f.service.savePublication(args[0]),publish:()=>f.service.publish(...args),
      schedules:()=>f.scheduleService.snapshot(...args),saveSchedule:()=>f.scheduleService.save(args[0]),transitionSchedule:()=>f.scheduleService.transition(...args),
      whatsappConfiguration:()=>f.single.getConfiguration(),smsConfiguration:()=>f.sms.getConfiguration(),templates:()=>f.single.listTemplates(),campaigns:()=>f.campaigns.listCampaigns(),segments:()=>f.campaigns.listSegments(),campaign:()=>f.campaigns.getCampaign(args[0])};
      const value=await operations[method]();return ['whatsappConfiguration','smsConfiguration'].includes(method)?value:{ok:true,value};
    }catch(e){return {ok:false,code:e.code,message:e.message};}
  });
  await page.goto(`${server.resolvedUrls.local[0]}schedule-fixture`);
  await page.getByRole('button',{name:'Yayınlar',exact:true}).click();await page.getByLabel('Yayınlar',{exact:true}).getByRole('button',{name:'PUBLICATION_PRIVATE',exact:false}).click();await page.getByRole('button',{name:'Planla',exact:true}).click();
  await expect(page.getByLabel('Plan çalışma alanı',{exact:true})).toBeVisible();await page.getByLabel('Plan adı',{exact:true}).fill('Haftalık Website');await page.getByLabel('Tarih',{exact:true}).fill('2030-01-02');await page.getByLabel('Saat',{exact:true}).fill('09:00');await page.getByLabel('Saat dilimi',{exact:true}).fill('Europe/Istanbul');await page.getByLabel('Plan türü',{exact:true}).selectOption('recurring');await page.getByLabel('Tekrar',{exact:true}).selectOption('weekly');
  await page.getByRole('button',{name:'Plan oluştur',exact:true}).click();await expect(page.getByText('Plan kaydedildi.',{exact:true})).toBeVisible();let s=f.db.listMarketingSchedules()[0].schedule;assert.equal(s.channel,'website');assert.equal(s.recurrenceRule.frequency,'weekly');assert.equal(f.calls.length,0);
  await page.getByRole('button',{name:'Planı duraklat',exact:true}).click();await expect(page.getByRole('button',{name:'Planı devam ettir',exact:true})).toBeVisible();await page.getByRole('button',{name:'Planı devam ettir',exact:true}).click();await expect(page.getByRole('button',{name:'Planı duraklat',exact:true})).toBeVisible();
  await page.getByLabel('Plan adı',{exact:true}).fill('Düzenlenmiş Website');await page.getByRole('button',{name:'Planı kaydet',exact:true}).click();
  let p=f.db.getMarketingPublication(web.id);p=f.db.saveMarketingPublication({id:p.id,expectedRevision:p.revision,contentId:p.contentId,channel:p.channel,placement:p.placement,title:p.title,text:'Changed frozen draft',mediaAssetIds:[]});
  await page.getByRole('button',{name:'Durumu yenile',exact:true}).click();await expect(page.getByText('Yayın değişmiş.',{exact:false})).toBeVisible();await page.getByRole('button',{name:'Planı güncelle · sürüm',exact:false}).click();await page.getByRole('button',{name:'Planı kaydet',exact:true}).click();assert.equal(f.db.getMarketingSchedule(s.id).targetRevision,p.revision);
  await page.getByRole('button',{name:'Takvime dön',exact:true}).click();await expect(page.getByLabel('Yaklaşan planlar',{exact:true})).toContainText('Düzenlenmiş Website');await page.getByRole('button',{name:'Ay',exact:true}).click();await expect(page.getByLabel('Ay takvimi',{exact:true})).toBeVisible();await page.getByLabel('Takvim ayı',{exact:true}).fill('2030-01');await expect(page.getByLabel('Ay takvimi',{exact:true})).toContainText('Düzenlenmiş Website');await page.getByRole('button',{name:'Liste / Yaklaşan',exact:true}).click();
  await page.getByLabel('Yaklaşan planlar',{exact:true}).getByRole('button').click();await page.getByRole('button',{name:'Planı iptal et',exact:true}).click();await expect(page.getByText('İptal edildi · Sonraki çalışma:',{exact:false})).toBeVisible();assert.equal(f.db.getMarketingPublication(web.id).desiredPublished,false);
  await page.getByRole('button',{name:'Takvime dön',exact:true}).click();await page.getByRole('button',{name:'Yayınlar',exact:true}).click();await page.getByLabel('Yayınlar',{exact:true}).getByRole('button',{name:'IG Fixture',exact:false}).click();await page.getByRole('button',{name:'Planla',exact:true}).click();await page.getByLabel('Tarih',{exact:true}).fill('2030-01-03');await page.getByLabel('Plan türü',{exact:true}).selectOption('recurring');await page.getByRole('button',{name:'Plan oluştur',exact:true}).click();assert(f.db.listMarketingSchedules().some(d=>d.schedule.targetId===ig.id&&d.schedule.scheduleType==='recurring'));
  for(const [target,name] of [[sms,'SMS Fixture'],[wa,'Fixture campaign']]) {
    await page.getByRole('button',{name:'Takvime dön',exact:true}).click();await page.getByRole('button',{name:'Yayınlar',exact:true}).click();await page.getByLabel('Yayınlar',{exact:true}).getByRole('button',{name,exact:false}).click();await page.getByRole('button',{name:'Planla',exact:true}).click();await expect(page.getByLabel('Plan türü',{exact:true}).locator('option[value="recurring"]')).toHaveJSProperty('disabled',true);await page.getByLabel('Tarih',{exact:true}).fill('2030-01-04');await page.getByRole('button',{name:'Plan oluştur',exact:true}).click();assert.equal(f.db.listMarketingSchedules().find(d=>d.schedule.targetId===target.id).schedule.scheduleType,'once');
  }
  await page.getByLabel('Plan adı',{exact:true}).fill('Dirty plan');await page.getByRole('button',{name:'İçerik Stüdyosu',exact:true}).click();await expect(page.getByLabel('Kaydedilmemiş değişiklikler',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Düzenlemeye dön',exact:true}).click();await expect(page.getByLabel('Plan adı',{exact:true})).toHaveValue('Dirty plan');
  f.scheduleService.save(f.input(ig,{startsLocal:'2030-01-01T05:00'}));f.state.instagram='lost-create';f.setTime('2030-01-01T03:00:00Z');await f.tick();
  await page.evaluate(()=>window.__notifyScheduleChanged());await expect(page.getByLabel('Global plan durumu',{exact:true})).toContainText('Pazarlama planı çalışması başarısız');
  await expect(page.getByRole('button',{name:'Başarısız pazarlama planları · Takvimi aç',exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);assert.deepEqual(errors,[]);mkdirSync('artifacts/marketing',{recursive:true});await page.screenshot({path:'artifacts/marketing/d6-plan.png'});
  console.log('D6 UI: calendar/upcoming, canonical create/edit/pause/resume/cancel, explicit frozen revision update, four channel labels and audience recurring disabled passed.');
} finally {await browser?.close();await server?.close();await f.dispose();}
