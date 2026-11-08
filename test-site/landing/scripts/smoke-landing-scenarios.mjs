import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {chromium, expect} from '@playwright/test';
import {installDemoSite} from '../../../scripts/test-helpers/demo-site.mjs';
import {launchChromiumForSmoke} from '../../../scripts/test-helpers/playwright-browser.mjs';
// This narrow smoke intentionally bypasses the parallel common-template sync gate.

const root = mkdtempSync(join(tmpdir(), 'ya-landing-scenarios-'));
const site = join(root, 'site');
installDemoSite(join(root, 'api'));
cpSync(resolve('test-site/landing'), site, {recursive:true});
cpSync(join(root, 'api/yardimci-asistan'), join(site, 'yardimci-asistan'), {recursive:true});
writeFileSync(join(site, 'yardimci-asistan/config/business.json'), JSON.stringify({sync_secret:'scenario-test-key'}));
const probe = createServer();
await new Promise(resolveListen => probe.listen(0, '127.0.0.1', resolveListen));
const port = probe.address().port;
await new Promise(resolveClose => probe.close(resolveClose));
const base = 'http://127.0.0.1:' + port;
const php = spawn('php', ['-S', '127.0.0.1:' + port, '-t', site], {
  env: {...process.env, PHP_CLI_SERVER_WORKERS: '4', YA_SITE_API_ORIGIN: base},
  stdio: 'ignore', detached: true,
});
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/yardimci-asistan/api/business.php')).ok) break; } catch {}
    await new Promise(wait => setTimeout(wait, 30));
  }
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/', {waitUntil:'domcontentloaded'});
  await expect(page.locator('#release-title')).toBeVisible();
  const release = JSON.parse(readFileSync(resolve('test-site/landing/release.json'), 'utf8'));
  await expect(page.locator('.release-section .eyebrow')).toHaveText(`${release.desktopVersion} / Günlük iş akışları`);
  await expect(page.locator('[data-scenario-pane]:visible')).toHaveCount(1);
  await expect(page.locator('[data-scenario-pane="pension_restaurant"]')).toBeVisible();
  await expect(page.locator('[data-scenario-pane="pension_restaurant"] .scenario-card')).toHaveCount(5);
  await expect(page.locator('[data-capability]:visible')).toHaveCount(40);
  await expect(page.locator('[data-capability="commerce.benefits"] .capability-badges')).toContainText('Android Companion');
  await page.locator('[data-scenario-sector="market"]').click();
  await expect(page.locator('[data-scenario-pane="market"]')).toBeVisible();
  await expect(page.locator('[data-sector="market"]')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[data-scenario-sector="market"]')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[data-scenario-pane="market"] .scenario-card')).toHaveCount(5);
  const webOrder = page.locator('[data-scenario-pane="market"] [data-scenario-id="market_online"]');
  await expect(webOrder).toContainText('yerel test');
  await expect(webOrder).toContainText('kısmi iade yoktur');
  await page.locator('[data-scenario-pane="market"] [data-scenario-id="market_credit"] [data-scenario-step="commerce.customer_credit"]').click();
  await expect(page.locator('[id="cap-commerce.customer_credit"]')).toHaveAttribute('open','');
  await page.goBack(); // scenario-step fragment
  await expect(page.locator('[data-scenario-sector="market"]')).toHaveAttribute('aria-current','true');
  await page.goBack(); // sector selection
  await expect(page.locator('[data-scenario-sector="pension_restaurant"]')).toHaveAttribute('aria-current','true');
  await expect(page.locator('[data-scenario-pane="pension_restaurant"]')).toBeVisible();
  await page.locator('[data-sector="pension"]').click();
  await expect(page.locator('[data-scenario-pane="pension"]')).toBeVisible();
  await page.locator('[data-scenario-sector="all"]').click();
  await expect(page.locator('[data-scenario-pane="all"] .scenario-card')).toHaveCount(4);
  await page.reload();
  await expect(page.locator('[data-scenario-pane="all"]')).toBeVisible();

  for (const width of [1440,768,390,320]) {
    await page.setViewportSize({width, height:960});
    await page.goto(base + '/?sector=restaurant');
    await expect(page.locator('[data-scenario-pane="restaurant"]')).toBeVisible();
    if (width === 1440 || width === 390) {
      mkdirSync('artifacts/demo-landing-refresh', {recursive:true});
      await page.locator('#is-akislari').screenshot({path:'artifacts/demo-landing-refresh/scenarios-' + width + '.png'});
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'overflow width ' + width);
    await page.locator('[data-explanation="detailed"]').click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'details overflow width ' + width);
  }
  assert.deepEqual(errors, [], 'Unexpected JavaScript errors');
  console.log('PASS landing scenarios, canonical sector synchronization, version, capability links, history, mobile widths and JS errors');
} finally {
  await browser?.close();
  if (php.pid) { try { process.kill(-php.pid, 'SIGTERM'); } catch {} }
  rmSync(root, {recursive:true, force:true});
}
