import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { _electron, expect } from '@playwright/test';
import { createServer } from 'vite';
import { getLocalElectronExecutable } from './local-electron.mjs';

export async function verifyCheckoutDesktop(f, order) {
  let server, app;
  try {
    server = await createServer({ root: resolve('apps/desktop-app'), configFile: resolve('apps/desktop-app/vite.renderer.config.ts'), logLevel: 'error',
      server: { host: '127.0.0.1', port: 0, strictPort: false } });
    await server.listen();
    const env = { ...process.env, YA_CHECKOUT_TEST_PROFILE: join(f.root, 'electron-profile'), YA_DESKTOP_DATA_DIR: join(f.root, 'electron-profile'),
      YA_CHECKOUT_TEST_DATABASE: f.database.databasePath, VITE_DEV_SERVER_URL: server.resolvedUrls.local[0] };
    for (const key of ['ELECTRON_RUN_AS_NODE', 'WAYLAND_DISPLAY', 'WAYLAND_SOCKET', 'ELECTRON_OZONE_PLATFORM_HINT']) delete env[key];
    mkdirSync(env.YA_CHECKOUT_TEST_PROFILE, { recursive: true });
    app = await _electron.launch({ executablePath: getLocalElectronExecutable(), args: ['--no-sandbox', '--ozone-platform=x11', resolve('scripts/fixtures/commerce-checkout-electron.cjs')], env, timeout: 30000 });
    const page = await app.firstWindow(); page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/checkout-desktop-test', async route => route.fulfill({contentType:'text/html',body:
      await server.transformIndexHtml('/checkout-desktop-test', `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve('scripts/fixtures/commerce-checkout-desktop.tsx')}"></script></body></html>`)}));
    await page.goto(server.resolvedUrls.local[0] + 'checkout-desktop-test');
    await page.getByRole('textbox', { name: 'Sipariş ara', exact: true }).fill(order.orderNumber);
    await page.locator('.market-order-card').click();
    const detail = page.getByRole('region', { name: 'Sipariş detayı', exact: true });
    await expect(detail).toContainText('Havale bildirildi');
    await app.evaluate(() => { global.__checkoutTest.locked = true; });
    await detail.getByRole('button', { name: 'Havaleyi Doğrula', exact: true }).click();
    await expect(page.getByTestId('checkout-status')).not.toBeEmpty();
    await expect(detail).toContainText('Havale bildirildi');
    await app.evaluate(() => { global.__checkoutTest.locked = false; });
    await detail.getByRole('button', { name: 'Havaleyi Doğrula', exact: true }).click();
    await expect(detail).toContainText('Ödeme: Doğrulandı');
    await detail.getByRole('button', { name: 'Siparişi Onayla', exact: true }).click();
    await detail.getByRole('button', { name: 'Hazırlamaya Başla', exact: true }).click();
    await expect(detail).toContainText('Teslimat: Hazırlanıyor');
    await detail.getByRole('button', { name: 'Siparişi Tamamla', exact: true }).click();
    await expect(detail).toContainText('Teslimat: Teslim edildi');
    await detail.getByRole('button', { name: 'Tam İadeyi İncele', exact: true }).click();
    const submit = detail.getByRole('button', { name: 'Tam İadeyi Kaydet', exact: true });
    await expect(submit).toBeDisabled();
    await detail.getByRole('textbox', { name: 'İade gerekçesi', exact: true }).fill('Ürünler teslim alındı; banka iadesi tamamlandı.');
    await expect(submit).toBeDisabled();
    await detail.getByRole('checkbox', { name: /Ürünleri geri aldım/ }).check();
    await app.evaluate(() => { global.__checkoutTest.loseResponse = true; });
    await submit.click();
    await expect(detail.getByRole('button', { name: 'İade Sonucunu Sorgula', exact: true })).toBeVisible();
    // A committed mutation with a lost response survives workspace unmount and refresh.
    await page.getByRole('button', { name: 'Görünümü değiştir' }).click();
    await page.getByRole('button', { name: 'Görünümü değiştir' }).click();
    await page.getByRole('button', { name: 'Siparişleri yeniden oku' }).click();
    await expect(detail.getByRole('button', { name: 'İade Sonucunu Sorgula', exact: true })).toBeVisible();
    await detail.getByRole('button', { name: 'İade Sonucunu Sorgula', exact: true }).click();
    await expect(detail).toContainText('Ödeme: İade kaydedildi');
    await expect(detail).toContainText('Teslimat: İade alındı');
    await expect(detail.getByRole('button', { name: 'Tam İadeyi İncele', exact: true })).toHaveCount(0);
    await detail.locator('details summary').last().click();
    await expect(detail).toContainText('Tam iade kaydedildi');
    assert.deepEqual(errors, []);
    const artifacts = resolve('artifacts/commerce-checkout'); mkdirSync(artifacts, { recursive: true });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
    await page.screenshot({ path: join(artifacts, 'desktop-refunded.png'), fullPage: true });
    console.log('PASS actual Electron IPC/preload/UI: locked approval blocked, bank verified, prepared, delivered, full refund and lost-response retry after unmount');
  } finally { await app?.close(); await server?.close(); }
}
