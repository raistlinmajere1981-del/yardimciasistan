import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';
let server, browser;
try {
  server = await createServer({ root: resolve('apps/desktop-app'), configFile: resolve('apps/desktop-app/vite.renderer.config.ts'), logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
  await server.listen(); browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/ux-fixture', async route => route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/ux-fixture', `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve('scripts/fixtures/ux-primitives.tsx')}"></script></body></html>`) }));
  await page.goto(`${server.resolvedUrls.local[0]}ux-fixture`);
  const picker = page.getByRole('dialog', { name: 'Kayıt seçici' });
  const trigger = page.getByRole('button', { name: 'Kayıt', exact: true });
  await trigger.click(); const search = picker.getByRole('combobox'); await expect(search).toBeFocused();
  await expect(picker.getByRole('option', { name: /^Kayıt 0 / })).toHaveAttribute('aria-selected', 'true');
  await search.press('ArrowDown'); await search.press('Enter'); await expect(trigger).toContainText('Kayıt 2');
  await trigger.press('ArrowDown'); await search.fill('000 0249'); await expect(picker.getByRole('option')).toHaveCount(1);
  await search.press('Enter'); await expect(trigger).toContainText('Kayıt 249'); await expect(trigger).toBeFocused();
  await trigger.click(); await search.fill('bulunamaz'); await expect(picker.getByRole('status')).toHaveText('Eşleşen kayıt yok.');
  await search.press('Escape'); await expect(picker).toHaveCount(0); await expect(trigger).toBeFocused();
  await expect(page.getByTestId('scroll-owner').locator('p')).toHaveCount(100);
  await page.getByTestId('scroll-owner').evaluate(element => element.scrollTop = 400);
  await page.getByLabel('Sayfa araması').fill('korunan bağlam'); await page.getByRole('button', { name: 'Sayfa değiştir' }).click(); await page.getByRole('button', { name: 'Sayfa değiştir' }).click();
  await expect(page.getByLabel('Sayfa araması')).toHaveValue('korunan bağlam');
  await expect.poll(() => page.getByTestId('scroll-owner').evaluate(element => element.scrollTop)).toBe(400);
  await page.getByRole('button', { name: 'İşletme değiştir' }).click(); await expect(page.getByLabel('Sayfa araması')).toHaveValue('');
  await page.getByRole('button', { name: 'Form aç' }).click(); const form = page.getByRole('dialog', { name: 'Kayıt formu' });
  await form.getByRole('button', { name: 'Kayıt', exact: true }).click(); await expect(search).toBeFocused();
  assert.equal(await page.locator('dialog[open]').count(), 1);
  await search.press('Escape'); await expect(form).toBeVisible(); await expect(picker).toHaveCount(0);
  await form.getByRole('button', { name: 'Kayıt', exact: true }).press('Escape'); await expect(form).toHaveCount(0);
  await page.getByRole('button', { name: 'Mevcut işlem formunu aç' }).click();
  const legacy = page.getByRole('dialog', { name: 'Mevcut işlem formu', exact: true });
  await legacy.getByRole('button', { name: 'Kayıt', exact: true }).click(); await expect(search).toBeFocused();
  assert.equal(await page.locator('[aria-modal="true"]').count(), 1);
  await search.press('Escape'); await expect(legacy).toBeVisible(); await expect(picker).toHaveCount(0);
  await legacy.getByRole('button', { name: 'Kayıt', exact: true }).press('Escape'); await expect(legacy).toHaveCount(0);
  for (const width of [1280, 390]) for (const scheme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 720 }); await page.evaluate(s => document.documentElement.dataset.colorScheme = s, scheme);
    await trigger.click(); const box = await picker.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 720);
    assert.ok((await trigger.boundingBox()).height >= 44); await search.press('Escape');
  }
  await trigger.click(); await picker.getByRole('button', { name: 'Yeni ekle' }).click(); await expect(picker).toHaveCount(0); await expect(page.getByRole('status')).toHaveText('Yeni kayıt işlemi');
  assert.deepEqual(errors, []); assert.equal(await page.evaluate(() => localStorage.length), 0);
  console.log('UX primitives: keyboard, focus/escape inside one modal, phone filtering, empty/create slots, viewport/themes/44px, route remount and business reset passed.');
} finally { await browser?.close(); await server?.close(); }
