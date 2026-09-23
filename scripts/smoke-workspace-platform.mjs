import ts from 'typescript';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';

const configPath = resolve('apps/desktop-app/tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve('apps/desktop-app'));
const program = ts.createProgram([...parsed.fileNames, resolve('scripts/fixtures/workspace-platform-types.ts')], { ...parsed.options, noEmit: true });
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: name => name, getCurrentDirectory: ts.sys.getCurrentDirectory, getNewLine: () => '\n'
}));

const server = await createServer({ root: resolve('apps/desktop-app'), configFile: resolve('apps/desktop-app/vite.renderer.config.ts'), server: { port: 0, strictPort: false } });
await server.listen();
const baseUrl = server.resolvedUrls.local[0];
let browser;
try {
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/workspace-platform-test*', async route => {
    const html = await server.transformIndexHtml('/workspace-platform-test', '<html><body><div id="root"></div><script type="module" src="/@fs/' + resolve('scripts/fixtures/workspace-platform.tsx') + '"></script></body></html>');
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.addInitScript(() => {
    window.reads = 0;
    window.copied = '';
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copied = text; } } });
    const session = (id, current) => ({ sessionId: id, current, startedAt: '2026-09-22T10:00:00Z', endedAt: '', appVersion: 'test', electronVersion: 'test', nodeVersion: 'test', platform: 'linux', arch: 'x64', packaged: false, eventCount: 2, warnCount: 0, errorCount: 1 });
    const events = [{ sequence: 1, timestamp: '2026-09-22T10:00:00Z', level: 'INFO', process: 'main', scope: 'app', event: 'app.started', message: 'Started' }, { sequence: 2, timestamp: '2026-09-22T10:00:01Z', level: 'ERROR', process: 'main', scope: 'sync', event: 'sync.failed', message: 'Failure detail', operationId: 'op-test', error: { name: 'Error', message: 'Failure detail', stack: 'Test stack' } }];
    window.yardimciDesktop = {
      listDiagnosticSessions: async () => [session('current', true), session('past', false)],
      readDiagnosticSession: async ({ sessionId }) => { window.reads++; return { session: session(sessionId, sessionId === 'current'), events, hasMore: false }; }
    };
  });
  await page.goto(`${baseUrl}workspace-platform-test`);
  await expect(page.getByRole('button', { name: 'Entry one' })).toBeVisible();
  expect(await page.locator('dialog').count()).toBe(0);
  // Unknown input is rejected even with no current workspace; defaults come from composition.
  expect(await page.evaluate(() => window.openUnknown())).toBe(false);
  expect(await page.locator('dialog').count()).toBe(0);
  expect(await page.evaluate(() => window.openTable())).toBe(true);
  await expect(page.getByRole('dialog', { name: 'Table 1' })).toBeVisible();
  expect(await page.evaluate(() => window.presentation)).toBe('full-canvas');
  // Generation validity applies to any completion path; unmount invalidates the last one.
  expect(await page.evaluate(() => {
    const old = window.beginGeneration();
    window.lastGeneration = window.beginGeneration();
    return [old(), window.lastGeneration()];
  })).toEqual([false, true]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.lastGeneration())).toBe(false);
  expect(await page.evaluate(() => window.returned)).toEqual({ page: 'restaurant', view: 'floor' });
  const swapped = await browser.newPage();
  await swapped.route('**/workspace-platform-test*', async route => {
    const html = await server.transformIndexHtml('/workspace-platform-test', '<html><body><div id="root"></div><script type="module" src="/@fs/' + resolve('scripts/fixtures/workspace-platform.tsx') + '"></script></body></html>');
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  await swapped.goto(`${baseUrl}workspace-platform-test?swap`);
  await swapped.getByRole('button', { name: 'Entry one' }).click();
  await expect.poll(() => swapped.evaluate(() => window.presentation)).toBe('full-canvas');
  await swapped.keyboard.press('Escape');
  await expect(swapped.getByRole('dialog')).toHaveCount(0);
  await swapped.evaluate(() => window.openTable());
  await expect.poll(() => swapped.evaluate(() => window.presentation)).toBe('centered');
  await swapped.close();
  await page.getByLabel('Feature filter').fill('preserved filter');
  await page.getByRole('button', { name: 'Entry one' }).click();
  let dialog = page.getByRole('dialog', { name: 'Room 101' });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => window.presentation)).toBe('centered');
  expect(await page.evaluate(() => window.openUnknown())).toBe(false);
  await page.evaluate(() => window.wrongMode());
  await expect(dialog.getByRole('tab', { name: 'Account', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByRole('heading', { name: 'Room 101' })).toBeFocused();
  expect(await dialog.evaluate(el => el.matches(':modal'))).toBe(true);
  const centered = await dialog.boundingBox();
  expect(centered.width).toBeLessThan(1440);
  expect(centered.x).toBeGreaterThan(0);
  const header = dialog.locator('header');
  const body = dialog.locator(':scope > div').filter({ has: page.getByLabel('Draft') });
  const footer = dialog.locator('footer');
  expect(await body.evaluate(el => getComputedStyle(el).overflowY)).toBe('auto');
  const headerBefore = await header.boundingBox();
  const footerBefore = await footer.boundingBox();
  await body.evaluate(el => el.scrollTop = 400);
  expect(await header.boundingBox()).toEqual(headerBefore);
  expect(await footer.boundingBox()).toEqual(footerBefore);
  await dialog.getByLabel('Draft').fill('persistent draft');
  const draftHandle = await dialog.getByLabel('Draft').elementHandle();
  const mounts = await page.evaluate(() => window.mounts);
  await page.evaluate(() => window.changePresentation());
  await expect(dialog.getByLabel('Draft')).toBeFocused();
  await page.evaluate(() => window.changePresentation());
  await expect(dialog.getByLabel('Draft')).toBeFocused();
  const expand = dialog.getByRole('button', { name: 'Çalışma alanını genişlet' });
  await expand.click();
  await expect(dialog.getByRole('button', { name: 'Ortalanmış görünüme dön' })).toBeFocused();
  await expect(dialog.getByLabel('Draft')).toHaveValue('persistent draft');
  expect(await draftHandle.evaluate(el => el.isConnected)).toBe(true);
  expect(await page.evaluate(() => window.mounts)).toBe(mounts);
  expect(await page.evaluate(() => window.openSame())).toBe(true);
  await expect.poll(() => page.evaluate(() => window.presentation)).toBe('full-canvas');
  await expect(dialog.getByLabel('Draft')).toHaveValue('persistent draft');
  expect(await draftHandle.evaluate(el => el.isConnected)).toBe(true);
  const canvas = await dialog.boundingBox();
  const shellHeader = await page.locator('.page-header').boundingBox();
  const content = await page.locator('main').boundingBox();
  expect(canvas.x).toBeGreaterThan(0);
  expect(canvas.y).toBeGreaterThan(0);
  expect(canvas.x + canvas.width).toBeLessThanOrEqual(1441);
  expect(canvas.y + canvas.height).toBeLessThanOrEqual(901);
  expect(canvas.x).toBeCloseTo(content.x, 0);
  expect(canvas.y).toBeCloseTo(shellHeader.y + shellHeader.height, 0);
  await dialog.getByRole('button', { name: 'Ortalanmış görünüme dön' }).click();
  expect(await dialog.boundingBox()).toEqual(centered);
  const account = dialog.getByRole('tab', { name: 'Account', exact: true });
  await account.focus();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('tab', { name: 'History', exact: true })).toBeFocused();
  await expect(dialog.getByRole('tabpanel', { name: 'History', exact: true })).toBeVisible();
  await page.keyboard.press('Home');
  await expect(dialog.getByRole('tab', { name: 'Summary', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByRole('tab', { name: 'History', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  await expect(account).toBeFocused();
  const panelId = await account.getAttribute('aria-controls');
  await expect(page.locator(`[id="${panelId}"]`)).toHaveAttribute('aria-labelledby', await account.getAttribute('id'));
  await expect(dialog.getByLabel('Draft')).toHaveValue('persistent draft');
  await dialog.getByRole('button', { name: 'Toggle payment' }).click();
  await expect(dialog.getByText('Payment subflow')).toBeVisible();
  expect(await page.locator('dialog[open]').count()).toBe(1);
  await dialog.getByRole('button', { name: 'Toggle payment' }).click();
  await expect(dialog.getByText('Payment subflow')).toHaveCount(0);
  for (const guard of ['Busy', 'Dirty']) {
    await dialog.getByLabel(guard, { exact: true }).check();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Çalışma alanını kapat', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => window.openOther())).toBe(false);
    await page.mouse.click(1, 1);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Clear guard' }).click();
  }
  // Native modality prevents programmatic focus into the background too.
  await page.getByLabel('Feature filter').evaluate(el => el.focus());
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await dialog.getByRole('button', { name: 'Clear guard' }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Çalışma alanını genişlet' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Clear guard' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Entry one' })).toBeFocused();
  await expect(page.getByLabel('Feature filter')).toHaveValue('preserved filter');
  expect(await page.evaluate(() => window.returned)).toEqual({ page: 'pension', view: 'rooms', entityId: 'selection' });

  await page.getByRole('button', { name: 'Entry two' }).click();
  await expect(dialog.getByLabel('Draft')).toHaveValue('');
  expect(await page.evaluate(() => window.openOther())).toBe(true);
  dialog = page.getByRole('dialog', { name: 'Room 102' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Draft')).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Entry two' })).toBeFocused();
  await page.getByRole('button', { name: 'Entry two' }).click();
  await page.mouse.click(1, 1);
  await expect(page.getByRole('dialog')).toHaveCount(0);


  // The opener may disappear after refreshing a feature projection.
  await page.getByRole('button', { name: 'Entry two' }).click();
  await page.getByRole('button', { name: 'Entry two', includeHidden: true }).evaluate(el => el.remove());
  await page.keyboard.press('Escape');
  await expect(page.locator('main')).toBeFocused();

  // Appearance changes reach the same live subtree through tokens, including scaled canvas bounds.
  await page.getByRole('button', { name: 'Entry one' }).click();
  dialog = page.getByRole('dialog', { name: 'Room 101' });
  const appearances = [];
  for (const [scheme, density, scale] of [['light', 'comfortable', 1], ['dark', 'compact', 1.2]]) {
    await page.evaluate(({ scheme, density, scale }) => window.appearance({ version: 2, scheme, density, scale, accent: 'green', font: 'system', motion: 'reduced' }), { scheme, density, scale });
    const button = dialog.getByRole('button', { name: 'Çalışma alanını genişlet' });
    if (appearances.length) await expect.poll(() => dialog.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(appearances[0].background);
    appearances.push(await button.evaluate(el => ({ height: getComputedStyle(el).height, background: getComputedStyle(el.closest('dialog')).backgroundColor })));
    await button.click();
    await expect.poll(async () => { const b = await dialog.boundingBox(); return b.x + b.width <= 1441 && b.y + b.height <= 901; }).toBe(true);
    await dialog.getByRole('button', { name: 'Ortalanmış görünüme dön' }).click();
  }
  expect(appearances[0].height).not.toEqual(appearances[1].height);
  expect(appearances[0].background).not.toEqual(appearances[1].background);
  // Lock overrides dirty protection by destroying the unlocked subtree, with no reopening on unlock.
  await dialog.getByLabel('Dirty', { exact: true }).check();
  await page.evaluate(() => window.lock());
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => window.appearance({ version: 2, scheme: 'light', density: 'comfortable', scale: 1, accent: 'green', font: 'system', motion: 'reduced' }));

  await page.getByRole('button', { name: 'Open form' }).click();
  await page.getByLabel('Task name').fill('task');
  await page.getByRole('button', { name: 'Save task' }).click();
  await expect(page.getByRole('button', { name: 'Open form' })).toBeFocused();
  await page.getByRole('button', { name: 'Open confirm' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vazgeç' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);

  // Real proof consumer: filters, detail, copy, live polling, session selection and geometry.
  await page.getByRole('button', { name: 'Open diagnostics' }).click();
  const diagnostics = page.getByRole('dialog', { name: 'Uygulama Logları' });
  await expect(diagnostics.getByRole('listitem')).toHaveCount(2);
  const reads = await page.evaluate(() => window.reads);
  await expect.poll(() => page.evaluate(() => window.reads)).toBeGreaterThan(reads);
  await diagnostics.getByRole('button', { name: 'Duraklat', exact: true }).click();
  const pausedReads = await page.evaluate(() => window.reads);
  await page.waitForTimeout(1100);
  expect(await page.evaluate(() => window.reads)).toBe(pausedReads);
  await diagnostics.getByLabel('Ara', { exact: true }).fill('sync.failed');
  await diagnostics.getByRole('button', { name: 'Çalışma alanını genişlet' }).click();
  await expect(diagnostics.getByLabel('Ara', { exact: true })).toHaveValue('sync.failed');
  await diagnostics.getByRole('listitem').click();
  await expect(diagnostics.getByRole('complementary', { name: 'Seçili log kaydı' }).getByText('Test stack')).toBeVisible();
  await diagnostics.getByRole('button', { name: 'Görünenleri Kopyala' }).click();
  expect(await page.evaluate(() => window.copied)).toContain('sync.failed');
  expect(await page.evaluate(() => window.copied)).not.toContain('app.started');
  await diagnostics.getByRole('button', { name: 'Tüm Oturumu Kopyala' }).click();
  await expect.poll(() => page.evaluate(() => window.copied)).toContain('app.started');
  await diagnostics.getByRole('button', { name: 'Bu Kaydın Bağlamını Kopyala' }).click();
  await expect(diagnostics.getByRole('status')).toContainText('Seçili kayıt çevresi kopyalandı');
  await diagnostics.getByRole('button', { name: 'Ortalanmış görünüme dön' }).click();
  await diagnostics.getByLabel('Ara', { exact: true }).fill('');
  await diagnostics.getByRole('button', { name: 'INFO', exact: true }).click();
  await expect(diagnostics.getByRole('listitem')).toHaveCount(1);
  await diagnostics.getByRole('combobox', { name: /Kapsam/ }).selectOption('app');
  await expect(diagnostics.getByRole('listitem')).toHaveCount(0);
  await diagnostics.getByRole('combobox', { name: /Kapsam/ }).selectOption('');
  await diagnostics.getByRole('combobox', { name: /Oturum/ }).selectOption('past');
  await expect(diagnostics.getByRole('button', { name: 'Canlı Takip' })).toHaveCount(0);
  await expect(diagnostics.getByRole('complementary', { name: 'Seçili log kaydı' })).toContainText('bir kayıt seçin');
  await page.mouse.click(1, 1);
  await expect(diagnostics).toBeVisible(); // Diagnostics preserves non-dismissable backdrop.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open diagnostics' })).toBeFocused();
  await page.getByRole('button', { name: 'Open diagnostics' }).click();
  await page.evaluate(() => window.lock());
  await expect(diagnostics).toHaveCount(0);
  const lockedReads = await page.evaluate(() => window.reads);
  await page.waitForTimeout(1100);
  expect(await page.evaluate(() => window.reads)).toBe(lockedReads);
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Test nested contract' }).click();
  await expect(page.getByRole('alert')).toContainText('cannot be nested');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  console.log('workspace-platform-ok');
} finally {
  await browser?.close();
  await server.close();
}
