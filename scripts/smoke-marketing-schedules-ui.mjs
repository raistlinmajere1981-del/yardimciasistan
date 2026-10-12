import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {scheduleFixture} from './test-helpers/marketing-schedule-fixtures.mjs';
import {assertMarketingDialog,openMarketingWorkspaceBrowser} from './test-helpers/marketing-workspace-browser.mjs';
import {chooseDate} from './test-helpers/date-time-picker.mjs';
const f=scheduleFixture();let ui;
try {
  const web=f.publication(),sms=(await f.smsCampaign()).campaign;
  const plan=f.scheduleService.save(f.input(web,{name:'Haftalık web duyurusu',startsLocal:'2030-01-02T09:00'}));
  f.scheduleService.save({...f.input(web,{name:'SMS planı',startsLocal:'2030-01-03T09:00'}),targetType:'audience_campaign',targetId:sms.id,channel:'sms',expectedTargetRevision:undefined});
  ui=await openMarketingWorkspaceBrowser(f);const {page}=ui;
  await page.getByLabel('Son paylaşımlar',{exact:true}).getByRole('button').filter({hasText:'Web sitesi'}).click();
  await expect(page.getByRole('region',{name:'İçerik detayı',exact:true})).toContainText('Planlandı');
  await expect(page.getByRole('region',{name:'İçerik detayı',exact:true})).toContainText(`Sürüm ${plan.schedule.targetRevision}`);
  await expect(page.getByRole('region',{name:'Kayıtlar',exact:true})).toHaveCount(0);await expect(page.getByLabel('Başlık',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Düzenle',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Seçili kanal önizlemesi',exact:true}).last().click();await expect(page.getByLabel('Web sitesi önizlemesi',{exact:true})).toContainText(web.text);await page.keyboard.press('Escape');
  assert.equal(f.db.getMarketingSchedule(plan.schedule.id).targetRevision,plan.schedule.targetRevision);
  // Inline operations retain the original dialog and never enter Calendar.
  const detailDialog=page.getByRole('dialog',{name:'Paylaşım detayı',exact:true}), detailUrl=page.url();
  await detailDialog.evaluate(el=>{el.dataset.inlineIdentity='original';});
  const card=page.getByRole('region',{name:'Yayın planı',exact:true});
  await expect(card).toContainText('Kaçırılan çalışma');await expect(card).toContainText('Europe/Istanbul');
  for(const name of ['Planı aç','Sonucu aç','Paylaşım işlemini aç','Yayın sonuçlarını görüntüle'])await expect(detailDialog.getByRole('button',{name,exact:true})).toHaveCount(0);
  assert.equal(f.db.getMarketingSchedule(plan.schedule.id).revision,plan.schedule.revision,'view and preview never save a plan');
  for(const width of [1440,1280,640,390]){await page.setViewportSize({width,height:844});await assertMarketingDialog(page,detailDialog);}
  await page.setViewportSize({width:1440,height:1000});
  await card.getByRole('button',{name:'Planı düzenle',exact:true}).click();await expect(page.getByLabel('Plan adı',{exact:true})).toBeFocused();
  await page.getByLabel('Plan adı',{exact:true}).fill('Geçici plan');await page.getByRole('button',{name:'Vazgeç',exact:true}).click();await expect(card).toContainText('Haftalık web duyurusu');await expect(card.getByRole('button',{name:'Planı düzenle',exact:true})).toBeFocused();
  await card.getByRole('button',{name:'Planı düzenle',exact:true}).click();await page.getByLabel('Plan adı',{exact:true}).fill('Kaydedilmemiş inline plan');
  await page.getByRole('button',{name:'Çalışma alanını kapat',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();await expect(page.locator('dialog[open]')).toHaveCount(1);await page.getByRole('button',{name:'Düzenlemeye dön',exact:true}).click();await expect(page.getByLabel('Plan adı',{exact:true})).toHaveValue('Kaydedilmemiş inline plan');
  await page.evaluate(()=>{const b=window.yardimciDesktop,save=b.saveMarketingSchedule;b.saveMarketingSchedule=async()=>{b.saveMarketingSchedule=save;return {ok:false,code:'fixture',message:'Fixture plan save rejected'};};});
  await page.getByRole('button',{name:'Planı kaydet',exact:true}).click();await expect(card).toContainText('Fixture plan save rejected');assert.equal(f.db.getMarketingSchedule(plan.schedule.id).revision,plan.schedule.revision);
  await page.getByLabel('Plan adı',{exact:true}).fill('Haftalık web duyurusu');
  await page.evaluate(()=>{const b=window.yardimciDesktop,save=b.saveMarketingSchedule;b.saveMarketingSchedule=async input=>{await new Promise(resolve=>{window.__releaseInlinePlan=resolve;});b.saveMarketingSchedule=save;return save(input);};});
  await page.getByRole('button',{name:'Planı kaydet',exact:true}).click();await expect(page.getByLabel('Plan adı',{exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Çalışma alanını kapat',exact:true})).toBeDisabled();await page.keyboard.press('Escape');await expect(detailDialog).toBeVisible();await page.evaluate(()=>window.__releaseInlinePlan());
  await expect(card.getByRole('button',{name:'Planı düzenle',exact:true})).toBeEnabled();assert.equal(f.db.getMarketingSchedule(plan.schedule.id).targetRevision,plan.schedule.targetRevision);
  await card.getByRole('button',{name:'Planı duraklat',exact:true}).click();await expect(card.getByRole('button',{name:'Planı devam ettir',exact:true})).toBeEnabled();assert.equal(f.db.getMarketingSchedule(plan.schedule.id).status,'paused');await card.getByRole('button',{name:'Planı devam ettir',exact:true}).click();await expect(card.getByRole('button',{name:'Planı duraklat',exact:true})).toBeEnabled();
  await expect(detailDialog).toHaveAttribute('data-inline-identity','original');await expect(page.locator('dialog[open]')).toHaveCount(1);assert.equal(page.url(),detailUrl);
  await page.getByRole('button',{name:'Çalışma alanını kapat',exact:true}).click();
  await page.getByRole('button',{name:'Fixture ana Takvim',exact:true}).click();
  await chooseDate(page,'Takvim tarihi','2030-01-02');
  await page.getByRole('button',{name:'Gün',exact:true}).click();
  await expect(page.getByLabel('Operasyon takvimi',{exact:true})).toContainText('Haftalık web duyurusu');
  // A delayed studio response must not show a transient loading modal before the real detail.
  await page.evaluate(() => {
    window.__calendarDialogOpenCount = 0;
    const showModal = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function (...args) {
      window.__calendarDialogOpenCount += 1;
      return showModal.apply(this,args);
    };
    const getStudio = window.yardimciDesktop.getMarketingStudio;
    window.yardimciDesktop.getMarketingStudio = (...args) => new Promise(resolve => {
      window.__releaseCalendarStudio = () => {
        window.yardimciDesktop.getMarketingStudio = getStudio;
        resolve(getStudio(...args));
      };
    });
  });
  await page.getByRole('button',{name:'Planı aç',exact:true}).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__releaseCalendarStudio))).toBe(true);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.__calendarDialogOpenCount),0,'Calendar should not flash a loading dialog');
  await page.evaluate(() => window.__releaseCalendarStudio());
  const dialog=page.getByRole('dialog',{name:'Paylaşım detayı',exact:true});
  await expect(dialog).toBeVisible();
  assert.equal(await page.evaluate(() => window.__calendarDialogOpenCount),1,'Calendar should open one dialog lifetime');
  const planCard=dialog.getByRole('region',{name:'Yayın planı',exact:true});
  await expect(dialog.getByRole('region',{name:'İçerik',exact:true})).toContainText('PUBLICATION_PRIVATE');
  await expect(dialog.getByRole('region',{name:'Kanal durumları ve sonuçlar',exact:true})).toContainText('Planlandı');
  await expect(planCard).toContainText('Haftalık web duyurusu');
  await expect(planCard).toContainText('Sürüm 1');
  assert.equal(await page.locator('dialog[open]').count(),1,'Calendar uses exactly one shared detail dialog');
  for (const width of [1440,1280,640,390]) {
    await page.setViewportSize({width,height:844});
    await assertMarketingDialog(page,dialog);
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(async()=>{const {applyUiPreferences}=await import('/src/ui-preferences.ts');applyUiPreferences({version:2,scheme:'dark',density:'compact',scale:1.2,accent:'blue',font:'system',motion:'reduced'});});
  await assertMarketingDialog(page,dialog);
  mkdirSync('artifacts/marketing',{recursive:true});
  await page.screenshot({path:'artifacts/marketing/calendar-unified-detail.png'});
  await page.evaluate(async()=>{const {applyUiPreferences}=await import('/src/ui-preferences.ts');applyUiPreferences({version:2,scheme:'light',density:'comfortable',scale:1,accent:'coral',font:'plex',motion:'system'});});
  await page.setViewportSize({width:1440,height:1000});
  await planCard.getByRole('button',{name:'Planı düzenle',exact:true}).click();
  const editor=dialog.getByRole('region',{name:'Plan çalışma alanı',exact:true});
  await expect(page.getByLabel('Plan adı',{exact:true})).toHaveValue('Haftalık web duyurusu');
  await page.getByLabel('Plan türü',{exact:true}).selectOption('recurring');
  await page.getByLabel('Tekrar',{exact:true}).selectOption('weekly');
  await page.getByRole('button',{name:'Planı kaydet',exact:true}).click();
  await expect(planCard.getByRole('button',{name:'Planı düzenle',exact:true})).toBeEnabled();
  assert.equal(f.db.getMarketingSchedule(plan.schedule.id).recurrenceRule.frequency,'weekly');
  await planCard.getByRole('button',{name:'Planı duraklat',exact:true}).click();
  await expect(planCard.getByRole('button',{name:'Planı devam ettir',exact:true})).toBeEnabled();
  assert.equal(f.db.getMarketingSchedule(plan.schedule.id).status,'paused');
  await planCard.getByRole('button',{name:'Planı devam ettir',exact:true}).click();
  await expect(planCard.getByRole('button',{name:'Planı duraklat',exact:true})).toBeEnabled();

  // Calendar and Marketing must honor the same frozen-publication policy.
  const latest=f.db.getMarketingPublication(web.id);
  f.db.saveMarketingPublication({id:latest.id,expectedRevision:latest.revision,contentId:latest.contentId,
    channel:latest.channel,placement:latest.placement,title:latest.title,text:'Yeni yayın metni',mediaAssetIds:[]});
  await page.evaluate(()=>window.__notifyScheduleChanged());
  await planCard.getByRole('button',{name:'Planı düzenle',exact:true}).click();
  await expect(editor).toContainText('Yayın değişmiş');
  assert.equal(f.db.getMarketingSchedule(plan.schedule.id).targetRevision,plan.schedule.targetRevision);
  await editor.getByRole('button',{name:/Planı güncelle · sürüm/}).click();
  await planCard.getByRole('button',{name:'Planı kaydet',exact:true}).click();
  await expect(planCard.getByRole('button',{name:'Planı düzenle',exact:true})).toBeEnabled();
  assert.equal(f.db.getMarketingSchedule(plan.schedule.id).targetRevision,f.db.getMarketingPublication(web.id).revision);

  await planCard.getByRole('button',{name:'Planı düzenle',exact:true}).click();
  await page.getByLabel('Plan adı',{exact:true}).fill('Kaydedilmemiş plan');
  await dialog.getByRole('button',{name:'Çalışma alanını kapat',exact:true}).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button',{name:'Düzenlemeye dön',exact:true}).click();
  await expect(page.getByLabel('Plan adı',{exact:true})).toHaveValue('Kaydedilmemiş plan');
  await planCard.getByRole('button',{name:'Vazgeç',exact:true}).click();
  await dialog.getByRole('button',{name:'Çalışma alanını kapat',exact:true}).click();
  await expect(dialog).toHaveCount(0);

  // Monthly cards resolve the same shared detail, not the removed calendar editor.
  await page.getByRole('button',{name:'Ay',exact:true}).click();
  await page.getByRole('button',{name:'Haftalık web duyurusu',exact:true}).first().click();
  await expect(page.getByRole('dialog',{name:'Paylaşım detayı',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Çalışma alanını kapat',exact:true}).click();

  // Standalone campaign schedules have no submitted share, but still show their canonical plan.
  await chooseDate(page,'Takvim tarihi','2030-01-03');
  await page.getByRole('button',{name:'Gün',exact:true}).click();
  await page.getByRole('button',{name:'Planı aç',exact:true}).click();
  const smsDialog=page.getByRole('dialog',{name:'Paylaşım detayı',exact:true});
  await expect(smsDialog.getByRole('region',{name:'Yayın planı',exact:true})).toContainText('SMS planı');
  await expect(smsDialog.getByRole('region',{name:'Kanal durumları ve sonuçlar',exact:true})).toContainText('SMS');
  await expect(smsDialog.getByLabel('Plan türü',{exact:true})).toHaveCount(0);
  await smsDialog.getByRole('region',{name:'Yayın planı',exact:true}).getByRole('button',{name:'Planı düzenle',exact:true}).click();
  await expect(smsDialog.getByLabel('Plan türü',{exact:true}).locator('option[value="recurring"]')).toHaveAttribute('disabled','');
  await smsDialog.getByRole('button',{name:'Vazgeç',exact:true}).click();
  await smsDialog.getByRole('button',{name:'Çalışma alanını kapat',exact:true}).click();
  assert.equal(f.calls.filter(c=>c.url.includes('send-sms')).length,0,'Calendar never dispatches messages by opening');
  assert.deepEqual(ui.errors,[]);
  console.log('Main Calendar Marketing UI: single shared share detail, responsive layout, canonical plan editing, recurrence, frozen revision, dirty guard, month/day entry, campaign fallback and no dispatch passed.');
} finally {await ui?.close();await f.dispose();}
