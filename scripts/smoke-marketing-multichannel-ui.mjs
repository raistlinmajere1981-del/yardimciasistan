import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {chooseSearchSelect} from './test-helpers/search-select.mjs';
import {multichannelFixture} from './test-helpers/marketing-multichannel-fixtures.mjs';
import {openMarketingWorkspaceBrowser} from './test-helpers/marketing-workspace-browser.mjs';
import {imageBytes} from './test-helpers/marketing-fixtures.mjs';
import {createCustomer,preference} from './test-helpers/messaging-campaign-fixtures.mjs';
const f=multichannelFixture();let ui;
try {
  const a=f.media.importBytes(imageBytes,'upload'),b=f.media.importBytes(imageBytes,'upload');
  const customer=createCustomer(f.db,'PRIVATE_CUSTOMER');for(const channel of ['sms','whatsapp'])f.campaigns.savePreference(preference(customer,'opted_in',channel));
  f.campaigns.saveSegment({name:'Müşteriler',filterDefinition:{version:1,rules:[]}});
  ui=await openMarketingWorkspaceBrowser(f);const {page}=ui;
  await page.getByRole('button',{name:'Yeni paylaşım',exact:true}).click();await page.getByLabel('Başlık',{exact:true}).fill('Dört kanallı duyuru');await page.getByLabel('Paylaşım metni',{exact:true}).fill('Ortak kısa duyuru');
  for(const name of ['Web sitesi','WhatsApp Business','SMS','Instagram'])await page.getByLabel(name,{exact:true}).check();
  const before=await page.getByRole('region',{name:'Paylaşım formu',exact:true}).locator('input,textarea,select').count();await page.getByLabel('SMS',{exact:true}).uncheck();assert.equal(await page.getByRole('region',{name:'Paylaşım formu',exact:true}).locator('input,textarea,select').count(),before,'channel selection does not add/remove form controls');await page.getByLabel('SMS',{exact:true}).check();
  await page.getByRole('button',{name:'Görsel seç / yükle',exact:true}).click();await chooseSearchSelect(page,'Görsel ekle',{value:a.id});await chooseSearchSelect(page,'Görsel ekle',{value:b.id});await page.getByRole('button',{name:'Görsel 2 yukarı',exact:true}).click();await page.getByRole('button',{name:'Paylaşıma dön',exact:true}).click();
  await page.getByRole('button',{name:'Hedef kitle seç',exact:true}).click();await chooseSearchSelect(page,'Kayıtlı hedef kitle',{label:'Müşteriler'});await page.getByRole('button',{name:'Uygun alıcıları kontrol et',exact:true}).click();await expect(page.getByLabel('Hedef kitle önizlemesi')).toContainText('SMS');await page.getByRole('button',{name:'Paylaşıma dön',exact:true}).click();
  await page.getByRole('button',{name:'Kanal / gönderim ayrıntıları',exact:true}).click();await page.getByLabel('SMS metni',{exact:true}).fill('SMS’e özel');await page.getByLabel('Instagram metni',{exact:true}).fill('Instagram açıklaması');
  await chooseSearchSelect(page,'Onaylı WhatsApp şablonu',{value:'fixture_template:tr'});await page.getByLabel('Mesaj 1 kaynağı',{exact:true}).selectOption('customer.fullName');await expect(page.getByLabel('1 metni',{exact:true})).toBeVisible();await expect(page.getByLabel('1 metni',{exact:true})).toBeDisabled();await page.getByRole('button',{name:'Paylaşıma dön',exact:true}).click();
  await page.getByRole('button',{name:'Önizle',exact:true}).click();assert.equal(f.db.listMessagingCampaigns().length,0);assert.equal(f.db.listMarketingPublications().length,0);await expect(page.getByLabel('Kanal önizlemesi')).toContainText('SMS’e özel');await page.getByRole('button',{name:'Paylaşıma dön',exact:true}).click();
  await page.getByRole('button',{name:'Yayınla',exact:true}).click();await expect(page.getByRole('region',{name:'Paylaşım sonucu',exact:true})).toContainText('WhatsApp Business');await expect(page.getByRole('region',{name:'Paylaşım sonucu',exact:true})).not.toContainText('Kontrol gerekiyor');
  assert.equal(f.db.listMessagingCampaigns().length,2);assert(f.db.listMessagingCampaigns().every(c=>c.status==='running'));assert.equal(f.calls.filter(c=>c.url.includes('send-sms')).length,0,'dispatch remains owned by D3');
  const publications=f.db.listMarketingPublications();assert.equal(publications.length,2);assert.deepEqual(publications.find(p=>p.channel==='website').mediaAssetIds,[b.id,a.id]);assert.deepEqual(publications.find(p=>p.channel==='instagram').mediaAssetIds,[b.id]);assert.equal(publications.find(p=>p.channel==='instagram').status,'published');
  const posts=f.calls.filter(c=>c.method==='POST'&&c.url.includes('graph.instagram.com')).length;await page.getByRole('button',{name:'Sonucu yeniden kontrol et',exact:true}).click();assert.equal(f.calls.filter(c=>c.method==='POST'&&c.url.includes('graph.instagram.com')).length,posts,'no duplicate Instagram post');assert.equal(f.db.listMessagingCampaigns().length,2);
  await page.getByRole('button',{name:'Çalışma alanını kapat',exact:true}).click();await page.getByLabel('Son paylaşımlar',{exact:true}).getByRole('button').filter({hasText:'SMS'}).click();await expect(page.getByRole('region',{name:'Gönderim ayrıntıları',exact:true})).toContainText('Gönderim sürüyor');await page.getByRole('button',{name:'Gönderimi duraklat',exact:true}).click();await expect(page.getByRole('button',{name:'Gönderimi devam ettir',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Gönderimi devam ettir',exact:true}).click();
  assert.deepEqual(ui.errors,[]);console.log('Marketing four-channel UI: stable fields, approved WhatsApp parameters, SMS variant, ordered website/single Instagram images, same-target replay and dispatch pause/resume passed.');
} finally {await ui?.close();await f.dispose();}
