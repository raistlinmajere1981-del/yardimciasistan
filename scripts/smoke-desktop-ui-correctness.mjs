import assert from 'node:assert/strict';
import { createServer as createPortProbe } from 'node:net';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';
import { chooseSearchSelect } from './test-helpers/search-select.mjs';

// Vite treats port 0 as its default port; reserve a real ephemeral port for this fixture.
const port = await new Promise((resolvePort, reject) => {
  const probe = createPortProbe();
  probe.on('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const port = probe.address().port;
    probe.close(() => resolvePort(port));
  });
});
const server = await createServer({ root: resolve('apps/desktop-app'), configFile: resolve('apps/desktop-app/vite.renderer.config.ts'), logLevel: 'error', server: { port, host: '127.0.0.1', strictPort: true } });
await server.listen();
let browser;
const failures = [];
try {
  browser = await launchChromiumForSmoke(chromium);
  async function scenario(name, fixture, query, run) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(4000);
    page.setDefaultNavigationTimeout(30000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/ui-correctness-test*', async route => route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/ui-correctness-test', `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve(`scripts/fixtures/${fixture}.tsx`)}"></script></body></html>`) }));
    await page.route(/^https:\/\/(?:[^/]+\.)?tile\.openstreetmap\.org\//, route => route.abort());
    try {
      await page.goto(`${server.resolvedUrls.local[0]}ui-correctness-test?${query}`);
      await run(page);
      assert.deepEqual(errors, [], 'no unhandled renderer error');
      console.log(`PASS ${name}`);
    } catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.message}`); }
    finally { await page.close(); }
  }

  for (const failure of ['inspect', 'login']) {
    await scenario(`KBS ${failure} reject + retry`, 'desktop-ui-correctness', `mode=kbs&failure=${failure}`, async page => {
      await page.getByRole('button', { name: 'EGM Oturumunu Aç', exact: true }).click();
      await page.evaluate(() => {
        window.uiFixture.delay = true;
        const webview = document.querySelector('webview');
        webview.getWebContentsId = () => 1;
        webview.reload = () => webview.dispatchEvent(new Event('dom-ready'));
        webview.dispatchEvent(new Event('dom-ready'));
      });
      const session = page.locator('.kbs-operations-session');
      await expect(session).toHaveAttribute('aria-busy', 'true');
      await page.evaluate(() => { window.uiFixture.delay = false; window.uiFixture.finish(); });
      await expect(session.getByRole('alert')).toBeVisible();
      await expect(session).not.toContainText('oturumu hazırlanıyor');
      await expect(session).toHaveAttribute('aria-busy', 'false');
      await page.evaluate(() => { window.uiFixture.fail = false; });
      await session.getByRole('button', { name: 'Yeniden Yükle' }).click();
      await expect(session.getByRole('alert')).toHaveCount(0);
      await expect(session.getByRole('status')).toContainText(failure === 'login' ? 'Fixture login prepared' : 'Fixture authenticated');
      await expect(session).toHaveAttribute('aria-busy', 'false');
      assert.equal(await page.evaluate(() => window.uiFixture.calls.filter(c => c === 'inspect').length), 2);
      if (failure === 'login') assert.equal(await page.evaluate(() => window.uiFixture.calls.filter(c => c === 'login').length), 2);
    });
  }

  await scenario('KBS successful session consumes pending notification only once', 'desktop-ui-correctness', 'mode=kbs&success&retry', async page => {
    const session = page.locator('.kbs-operations-session');
    await expect(session).toBeVisible();
    await page.evaluate(() => {
      const webview = document.querySelector('webview'); webview.getWebContentsId = () => 1;
      webview.dispatchEvent(new Event('dom-ready'));
    });
    await expect(session.getByRole('status')).toContainText('Fixture notification sent');
    await expect(session).toHaveAttribute('aria-busy', 'false');
    await page.evaluate(() => document.querySelector('webview').dispatchEvent(new Event('dom-ready')));
    await expect(session.getByRole('status')).toContainText('Fixture authenticated');
    assert.equal(await page.evaluate(() => window.uiFixture.calls.filter(c => c === 'send:notification-1').length), 1);
    assert.equal(await page.evaluate(() => window.uiFixture.calls.filter(c => c === 'retry-consumed').length), 1);
  });
  await scenario('KBS OTP remains interactive without preparing credentials', 'desktop-ui-correctness', 'mode=kbs&failure=otp&success', async page => {
    await page.getByRole('button', { name: 'EGM Oturumunu Aç', exact: true }).click();
    await page.evaluate(() => document.querySelector('webview').dispatchEvent(new Event('dom-ready')));
    const session = page.locator('.kbs-operations-session');
    await expect(session.getByRole('status')).toContainText('EGMSEC');
    await expect(session).toHaveAttribute('aria-busy', 'false');
    assert.deepEqual(await page.evaluate(() => window.uiFixture.calls), ['inspect']);
    await page.evaluate(() => document.querySelector('webview').dispatchEvent(Object.assign(new Event('did-fail-load'), { errorCode: -2 })));
    await expect(session.getByRole('alert')).toContainText('yüklenemedi');
    await expect(session).toHaveAttribute('aria-busy', 'false');
  });
  await scenario('KBS already-open request never declares nonexistent pending work', 'desktop-ui-correctness', 'mode=kbs&success', async page => {
    await page.getByRole('button', { name: 'EGM Oturumunu Aç', exact: true }).click();
    await page.evaluate(() => document.querySelector('webview').dispatchEvent(new Event('dom-ready')));
    const session = page.locator('.kbs-operations-session');
    await expect(session.getByRole('status')).toContainText('Fixture authenticated');
    await expect(session).toHaveAttribute('aria-busy', 'false');
    await page.evaluate(() => window.uiFixture.requestSession());
    await expect(session.getByRole('status')).toContainText('oturumu hazırlanıyor');
    await expect(session).toHaveAttribute('aria-busy', 'false');
    assert.deepEqual(await page.evaluate(() => window.uiFixture.calls), ['inspect'], 'existing event-driven session orchestration unchanged');
  });

  await scenario('Settings stale category normalizes stored state', 'settings-platform', 'category=removed-category', async page => {
    await expect(page.getByRole('tab', { name: /^İşletme( ·|$)/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Firma adı', { exact: true })).toBeVisible();
    await page.evaluate(() => window.readStoredSettingsCategory());
    await expect(page.getByLabel('Stored settings category')).toHaveText('business');
  });
  await scenario('Settings hidden category falls back on setup reset', 'settings-platform', 'category=application', async page => {
    await expect(page.getByRole('tab', { name: /^Uygulama( ·|$)/ })).toHaveAttribute('aria-selected', 'true');
    await page.evaluate(() => window.refreshSettings({ setupRequired: true }));
    await expect(page.getByRole('tab', { name: /^İşletme( ·|$)/ })).toHaveAttribute('aria-selected', 'true');
    await page.evaluate(() => window.readStoredSettingsCategory());
    await expect(page.getByLabel('Stored settings category')).toHaveText('business');
  });

  await scenario('Room keyboard selection excludes nested actions', 'settings-platform', '', async page => {
    await page.getByRole('tab', { name: /^İşletme Düzeni( ·|$)/ }).click();
    await page.getByRole('button', { name: 'Oda Ekle', exact: true }).click();
    const rows = page.locator('.room-management-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toHaveAttribute('role', 'button');
    await rows.nth(1).focus(); await page.keyboard.press('Enter');
    await expect(rows.nth(1)).toHaveClass(/is-media-selected/);
    await rows.nth(0).focus(); await page.keyboard.press('Space');
    await expect(rows.nth(0)).toHaveClass(/is-media-selected/);
    // Native checkbox activation must update the checkbox but not select its row.
    await rows.nth(1).getByRole('checkbox').focus(); await page.keyboard.press('Space');
    await expect(rows.nth(1).getByRole('checkbox')).toBeChecked();
    await expect(rows.nth(0)).toHaveClass(/is-media-selected/);
    // An Enter on a nested control must not be prevented/replayed by the row handler.
    await page.evaluate(() => {
      window.roomDetailsClicks = 0;
      window.roomNestedKeyPrevented = null;
      const row = document.querySelectorAll('.room-management-row')[1];
      row.addEventListener('click', event => { if (event.target.closest('button')?.textContent.includes('Detaylar')) window.roomDetailsClicks++; });
      document.addEventListener('keydown', event => { if (event.key === 'Enter') window.roomNestedKeyPrevented = event.defaultPrevented; });
    });
    await rows.nth(1).getByRole('button', { name: 'Detaylar', exact: true }).focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(rows.nth(1)).toHaveClass(/is-media-selected/);
    assert.deepEqual(await page.evaluate(() => ({ clicks: window.roomDetailsClicks, prevented: window.roomNestedKeyPrevented })), { clicks: 1, prevented: false }, 'nested control has one native click and no parent key handling');
    await page.getByRole('dialog').getByRole('button', { name: /kapat/i }).click();
    assert.equal(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'layout').length), 0, 'keyboard selection never saves domain state');
  });

  await scenario('Google Reviews reject inline + global feedback', 'settings-platform', '', async page => {
    const card = page.locator('#settings-google-reviews');
    await card.getByLabel('Google Place ID').fill('fixture-place');
    await card.getByLabel('Places API anahtarı').fill('fixture-key');
    await page.evaluate(() => {
      window.yardimciDesktop.saveGoogleReviewsSettings = async () => { throw new Error('Fixture save rejection'); };
      window.yardimciDesktop.testGoogleReviewsConnection = async () => { throw new Error('Fixture test rejection'); };
    });
    await card.getByRole('button', { name: 'Google Bağlantısını Dene' }).click();
    await expect(card.getByRole('alert')).toBeVisible();
    await expect(card).toHaveAttribute('aria-busy', 'false');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(card.getByRole('alert')).toContainText('kaydedilemedi');
    await expect(page.locator('.global-message-bar')).toContainText('kaydedilemedi');
    await expect(card).toHaveAttribute('aria-busy', 'false');
  });

  await scenario('Marketing disabled page contract', 'desktop-ui-correctness', 'mode=marketing', async page => {
    const feature = page.getByRole('region', { name: 'Pazarlama', exact: true });
    await expect(feature).toBeVisible();
    await expect(feature.locator('.empty-state')).toContainText('etkin değil');
    await expect(feature.getByRole('button')).toHaveCount(0);
    assert.deepEqual(await page.evaluate(() => window.uiFixture.calls), []);
  });

  for (const configured of ['false', 'true']) {
    await scenario(`Business messaging visible states (${configured})`, 'desktop-ui-correctness', `mode=business&configured=${configured}`, async page => {
      const card = page.getByRole('region', { name: 'WhatsApp Business mesajı', exact: true });
      await expect(card).toHaveCount(0);
      await page.evaluate(() => window.uiFixture.finish());
      await expect(card.getByRole('alert')).toBeVisible();
      await expect(card).toHaveAttribute('aria-busy', 'false');
      await page.evaluate(() => { window.uiFixture.fail = false; window.uiFixture.delay = false; });
      await card.getByRole('button', { name: 'Yeniden Dene' }).click();
      await expect(card.getByRole('alert')).toHaveCount(0);
      if (configured === 'false') {
        await expect(card.locator('.empty-state')).toContainText('yapılandırılmamış');
        await expect(card.getByRole('button', { name: 'WhatsApp Business mesajı', exact: true })).toHaveCount(0);
      } else {
        await card.getByRole('button', { name: 'WhatsApp Business mesajı', exact: true }).click();
        await expect(card).toContainText('Onaylı şablon bulunamadı');
        await expect(card.getByRole('button', { name: 'Gönder', exact: true })).toBeDisabled();
      }
    });
  }
  await scenario('Business disabled shows no customer warning or tools', 'desktop-ui-correctness', 'mode=business&enabled=false&success', async page => {
    await page.waitForFunction(() => window.uiFixture.calls.includes('configuration'));
    await page.evaluate(() => window.uiFixture.finish());
    await expect(page.getByRole('region', {name:'WhatsApp Business mesajı',exact:true})).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('WhatsApp Business yapılandırılmamış');
  });
  for(const item of [{q:'mode=preferences&success&enabled=false', names:[]}, {q:'mode=preferences&success&enabled=false&sms=true',names:['SMS pazarlama']}, {q:'mode=preferences&success&enabled=true',names:['WhatsApp pazarlama']}, {q:'mode=preferences&success&enabled=true&sms=true',names:['WhatsApp pazarlama','SMS pazarlama']}]) {
    await scenario('Customer consent visible only for enabled services: '+item.q, 'desktop-ui-correctness', item.q, async page => {
      const region = page.getByRole('region',{name:'İletişim tercihleri', exact:true});
      if(!item.names.length) await expect(region).toHaveCount(0);
      else {await expect(region).toBeVisible();for(const name of item.names) await expect(region.getByRole('combobox',{name,exact:true})).toBeEnabled();}
      for(const name of ['WhatsApp pazarlama','SMS pazarlama'].filter(v=>!item.names.includes(v))) await expect(page.getByRole('combobox',{name,exact:true})).toHaveCount(0);
    });
  }
  await scenario('Business background notifications preserve parameter input and focus', 'desktop-ui-correctness', 'mode=business&configured=true&success&template', async page => {
    await page.evaluate(() => { window.uiFixture.delay = false; window.uiFixture.finish(); });
    const card = page.getByRole('region', { name: 'WhatsApp Business mesajı', exact: true });
    await card.getByRole('button', { name: 'WhatsApp Business mesajı', exact: true }).click();
    await chooseSearchSelect(page, 'Onaylı şablon', { value: 'fixture_template:tr' });
    const parameter = card.getByLabel('body 1', { exact: true });
    await parameter.fill('Fixture parameter');
    await page.evaluate(() => { window.uiFixture.delay = true; window.uiFixture.notify(); });
    await expect(card).toBeVisible();
    await expect(parameter).toBeFocused();
    await expect(parameter).toHaveValue('Fixture parameter');
    await page.evaluate(() => { window.uiFixture.fail = true; window.uiFixture.finish(); });
    await expect(card.getByRole('alert')).toBeVisible();
    await expect(parameter).toBeFocused();
    await expect(parameter).toHaveValue('Fixture parameter');
    await page.evaluate(() => { window.uiFixture.fail = false; window.uiFixture.delay = false; });
    await card.getByRole('button', { name: 'Yeniden Dene' }).click();
    await expect(card.getByRole('alert')).toHaveCount(0);
    await expect(parameter).toHaveValue('Fixture parameter');
  });
  await scenario('Business missing provider bridge leaves the customer surface usable', 'desktop-ui-correctness', 'mode=business&missing-bridge', async page => {
    const card = page.getByRole('region', { name: 'WhatsApp Business mesajı', exact: true });
    await expect(card.getByRole('alert')).toContainText('okunamadı');
    await expect(card).toHaveAttribute('aria-busy', 'false');
    await card.getByRole('button', { name: 'Yeniden Dene' }).click();
    await expect(card.getByRole('alert')).toBeVisible();
  });

  await scenario('Password submit busy and recovery semantics', 'settings-platform', '', async page => {
    await page.getByRole('tab', { name: /^Uygulama( ·|$)/ }).click();
    const card = page.locator('#settings-password');
    await card.getByLabel('Şifre belirleyin', { exact: true }).fill('fixture-password');
    await card.getByLabel('Yeni şifre tekrar', { exact: true }).fill('fixture-password');
    await page.evaluate(() => {
      const original = window.yardimciDesktop.updateAppPassword;
      window.yardimciDesktop.updateAppPassword = async input => { await new Promise(resolve => { window.finishPassword = resolve; }); return original(input); };
    });
    await card.getByRole('button', { name: 'Şifreyi Kaydet', exact: true }).click();
    await expect(card.getByRole('button', { name: 'Kaydediliyor…', exact: true })).toHaveAttribute('aria-busy', 'true');
    await expect(card.getByRole('button', { name: 'Kaydediliyor…', exact: true })).toBeDisabled();
    await page.evaluate(() => window.finishPassword());
    await expect(card).toContainText('Şifre açık');
    await expect(card.getByLabel('Yeni şifre', { exact: true })).toHaveValue('');
    await card.getByRole('button', { name: 'Şifremi Unuttum' }).click();
    await expect(card.getByRole('button', { name: 'Şifremi Unuttum' })).toHaveAttribute('aria-expanded', 'true');
    assert.equal(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'password').length), 1);
    await card.getByRole('button', { name: 'Şifremi Unuttum' }).click();
    await card.getByLabel('Mevcut şifre', { exact: true }).fill('fixture-password');
    await card.getByRole('button', { name: 'Şifreyi Kaldır', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Şifreyi Kaldır', exact: true }).click();
    await expect(card.getByRole('button', { name: 'Kaldırılıyor', exact: true })).toHaveAttribute('aria-busy', 'true');
    await page.evaluate(() => window.finishPassword());
    await expect(card).toContainText('İsteğe bağlı');
    assert.equal(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'password').length), 2);
    await page.evaluate(() => {
      window.refreshSettings({ appPasswordConfigured: true });
      window.yardimciDesktop.resetAppPassword = async key => { window.settingsCalls.push({ kind: 'password-reset', input: key }); await new Promise(resolve => { window.finishPassword = resolve; }); return { ok: true, message: 'Reset complete', status: { passwordConfigured: false } }; };
    });
    await card.getByRole('button', { name: 'Şifremi Unuttum' }).click();
    await card.getByLabel('Web güvenlik anahtarı').fill('fixture-security-key');
    await card.getByRole('button', { name: 'Şifreyi Sıfırla' }).click();
    await expect(card.getByRole('button', { name: 'Kontrol ediliyor' })).toHaveAttribute('aria-busy', 'true');
    await page.evaluate(() => window.finishPassword());
    await expect(card).toContainText('İsteğe bağlı');
    assert.equal(await page.evaluate(() => window.settingsCalls.filter(c => c.kind === 'password-reset').length), 1);
  });

  await scenario('Diagnostics refresh busy, pause, copy controls', 'desktop-ui-correctness', 'mode=diagnostics', async page => {
    await expect(page.getByRole('button', { name: 'Duraklat' })).toBeVisible();
    await page.getByRole('button', { name: 'Duraklat' }).click();
    await expect(page.getByRole('button', { name: 'Canlı Takip' })).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => { window.uiFixture.delay = true; });
    await page.getByRole('button', { name: 'Yenile', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Yenileniyor…' })).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('button', { name: 'Yenileniyor…' })).toBeDisabled();
    await page.evaluate(() => { window.uiFixture.delay = false; window.uiFixture.finish(); });
    await expect(page.getByRole('button', { name: 'Yenile', exact: true })).toBeEnabled();
    await page.getByRole('listitem').click();
    await expect(page.getByRole('button', { name: 'Bu Kaydın Bağlamını Kopyala' })).toBeEnabled();
    await page.evaluate(() => {
      window.copiedTexts = [];
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedTexts.push(text); await new Promise(resolve => { window.finishCopy = resolve; }); } } });
    });
    for (const [label, busyLabel] of [['Görünenleri Kopyala', 'Kopyalanıyor…'], ['Tüm Oturumu Kopyala', 'Tüm oturum hazırlanıyor...'], ['Bu Kaydın Bağlamını Kopyala', 'Hata bağlamı hazırlanıyor...']]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page.getByRole('button', { name: busyLabel, exact: true })).toHaveAttribute('aria-busy', 'true');
      await expect(page.getByRole('button', { name: busyLabel, exact: true })).toBeDisabled();
      await expect.poll(() => page.evaluate(() => typeof window.finishCopy)).toBe('function');
      await page.evaluate(() => { window.finishCopy(); window.finishCopy = undefined; });
      await expect(page.getByRole('button', { name: label, exact: true })).toBeEnabled();
    }
    const exports = await page.evaluate(() => window.copiedTexts);
    assert.equal(exports.length, 3); for (const text of exports) assert.match(text, /fixture.failed/);
    await page.getByRole('button', { name: 'Hata Bildir', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Hata Bildir', exact: true })).toBeVisible();
    await page.getByRole('dialog', { name: 'Hata Bildir', exact: true }).getByRole('button', { name: 'Kapat', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Uygulama Logları', exact: true })).toBeVisible();
  });

  await scenario('Credit toggle focus + WhatsApp busy contract', 'desktop-ui-correctness', 'mode=credit', async page => {
    const toggle = page.getByRole('button', { name: 'Hesabı Aç', exact: true });
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Hesabı Kapat' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Hesabı Kapat' })).toHaveAttribute('aria-expanded', 'true');
    await page.evaluate(() => { window.uiFixture.delay = true; });
    await page.getByRole('button', { name: "WhatsApp'ta Paylaş" }).click();
    await expect(page.getByRole('button', { name: "WhatsApp'ta Paylaş" })).toBeDisabled();
    await page.evaluate(() => { window.uiFixture.delay = false; window.uiFixture.finish(); });
    await expect(page.getByRole('textbox', { name: 'Veresiye paylaşım mesajı' })).toBeFocused();
    await page.evaluate(() => { window.uiFixture.delay = true; });
    await page.getByRole('button', { name: "WhatsApp'a Hazırla" }).click();
    await expect(page.getByRole('button', { name: 'Hazırlanıyor…' })).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('button', { name: 'Hazırlanıyor…' })).toBeDisabled();
    await page.evaluate(() => { window.uiFixture.delay = false; window.uiFixture.finish(); });
    await expect(page.getByRole('button', { name: "WhatsApp'a Hazırla" })).toBeEnabled();
    await page.getByRole('button', { name: 'Vazgeç', exact: true }).click();
    await expect(page.getByRole('button', { name: "WhatsApp'ta Paylaş" })).toBeFocused();
    await page.getByRole('button', { name: 'Hesabı Kapat' }).click();
    await expect(page.getByRole('button', { name: 'Hesabı Aç' })).toHaveAttribute('aria-expanded', 'false');
  });
  assert.deepEqual(failures, [], 'all focused behavior scenarios pass without skips');
} finally { await browser?.close(); await server.close(); }
