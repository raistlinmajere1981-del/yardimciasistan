import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { marketingFixture, imageBytes } from './test-helpers/marketing-fixtures.mjs';
import { openMarketingWorkspaceBrowser } from './test-helpers/marketing-workspace-browser.mjs';
import { chooseSearchSelect } from './test-helpers/search-select.mjs';

const f = marketingFixture();
const image = f.media.importBytes(imageBytes, 'upload');
let ui;
try {
  ui = await openMarketingWorkspaceBrowser(f);
  const {page, errors} = ui;
  await page.getByRole('button', {name:'Yeni paylaşım',exact:true}).click();
  const dialog = page.getByRole('dialog', {name:'Yeni paylaşım oluştur',exact:true});
  await expect(dialog.getByLabel('Başlık',{exact:true})).toHaveValue('');
  await expect(dialog.getByLabel('Başlık',{exact:true})).not.toHaveAttribute('required');
  await expect(dialog.getByRole('button',{name:'Taslak kaydet',exact:true})).toBeEnabled();
  await expect(dialog.getByRole('button',{name:'Yayınla',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Görsel seç / yükle',exact:true}).click();
  await chooseSearchSelect(page,'Görsel ekle',{value:image.id});
  await page.getByRole('button',{name:'Uygula',exact:true}).click();
  await expect(dialog.getByLabel('Seçilen paylaşım görselleri')).toContainText('1 görsel seçili');
  await expect(dialog.getByRole('region',{name:'Yayın kontrolü',exact:true})).toContainText('Paylaşım içeriği');
  await expect(dialog.getByRole('button',{name:'Yayınla',exact:true})).toBeEnabled();
  await dialog.getByRole('button',{name:'Çoklu kanal önizlemesi',exact:true}).click();
  const preview = page.getByLabel('Web sitesi önizlemesi',{exact:true});
  await expect(preview.locator('img')).toHaveCount(1);
  await expect(preview).not.toContainText('Metin girilmedi.');
  await expect(preview.locator('strong')).toHaveCount(0);
  await page.getByRole('button',{name:'Paylaşıma dön',exact:true}).click();
  await dialog.getByRole('button',{name:'Yayınla',exact:true}).click();
  const detail = page.getByRole('dialog',{name:'Paylaşım detayı',exact:true});
  await expect(detail.getByRole('region',{name:'Kanal durumları ve sonuçlar',exact:true})).toContainText('Yayın onayı bekleniyor');
  const publication = f.db.listMarketingPublications()[0];
  assert.equal(publication.title,'');
  assert.equal(publication.text,'');
  assert.deepEqual(Array.from(publication.mediaAssetIds),[image.id]);
  await detail.getByRole('button',{name:'Çalışma alanını kapat',exact:true}).click();
  await expect(page.getByLabel('Aktif web içerikleri')).toContainText('Görsel paylaşımı');
  assert.deepEqual(errors,[]);
  console.log('Marketing image-only UI: blank title/text, ready checks, preview, single image publishing and management fallback PASS.');
} finally {
  await ui?.close();
  f.dispose();
}
