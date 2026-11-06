import { expect } from '@playwright/test';

/** Shared user interactions for the single-page Settings surface. */
export async function expandSettingsStructure(page) {
  // Structure and services are always rendered; there is no disclosure toggle.
  await expect(page.getByRole('heading', { name: 'İşletme Yapısı ve Özellikler', exact: true })).toBeVisible();
  await expect(page.locator('#settings-structure-content')).toBeVisible();
}
export async function openSettingsService(page, id) {
  await expandSettingsStructure(page);
  await page.locator(`#${id}`).click();
  return page.locator('.settings-service-overlay');
}
export async function cancelSettingsService(page) {
  const decision = page.locator('.settings-service-overlay').getByRole('alertdialog');
  if (await decision.count()) {
    await decision.getByRole('button', { name: 'Değişiklikleri geri al ve kapat', exact: true }).click();
    return;
  }
  const overlay = page.locator('.settings-service-overlay');
  if (await overlay.count()) await overlay.getByRole('button', { name: 'İptal', exact: true }).click();
}
export async function saveSettingsService(page) {
  const decision = page.locator('.settings-service-overlay').getByRole('alertdialog');
  if (await decision.count()) await decision.getByRole('button', { name: 'Kaydet ve kapat', exact: true }).click();
  else await page.locator('.settings-service-overlay').getByRole('button', { name: 'Kaydet', exact: true }).click();
}
