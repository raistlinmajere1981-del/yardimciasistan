/** Shared user interactions for the single-page Settings surface. */
export async function expandSettingsStructure(page) {
  const toggle = page.getByRole('button', { name: /^İşletme Yapısı ve Özellikler/ });
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
}
export async function openSettingsService(page, id) {
  await expandSettingsStructure(page);
  await page.locator(`#${id}`).getByRole('button').click();
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
