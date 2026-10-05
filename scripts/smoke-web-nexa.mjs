import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { nexaRuntimePaths } from "./nexa-assets.mjs";

const manifest = JSON.parse(readFileSync("assets/nexa/manifest.json", "utf8"));
const paths = nexaRuntimePaths("web");
const assetFor = (key) => {
  const rule = manifest.runtime.web[key];
  return manifest.assets.find((e) => e.usage === rule.usage && (rule.width === undefined || e.dimensions.width === rule.width) && (rule.state === undefined || e.state === rule.state)).assetPath;
};
const bundle = readFileSync("packages/web-widget/dist/widget.js", "utf8");
assert.ok(!bundle.includes("data:image/webp"), "Runtime images must remain external, not embedded in launcher JS");
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if (path === "/module/widget.js") { res.setHeader("content-type", "text/javascript; charset=utf-8"); res.end(bundle); return; }
  if (path.startsWith("/module/") && paths.includes(path.slice(8))) {
    res.setHeader("content-type", "image/webp"); res.end(readFileSync(resolve("packages/web-widget/dist", path.slice(8)))); return;
  }
  if (path.endsWith("/api/business.php")) { res.setHeader("content-type", "application/json"); res.end('{"ok":false}'); return; }
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end('<!doctype html><html><body><main>İşletme sitesi</main><script src="/module/widget.js"></script></body></html>');
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 360, height: 760 } });
  const images = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (request.url().includes('/assets/nexa/')) images.push(new URL(request.url()).pathname); });
  let release;
  let nextResult = { ok: true, answer: "İşletme yanıtı hazır." };
  await page.route("**/api/chat.php", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ message: "Bir sorum var" });
    await new Promise((done) => { release = done; });
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(nextResult) });
  });
  await page.goto(`${base}/site/`);
  await page.evaluate((base) => window.YardimciAsistanWidget.init({ apiBaseUrl: base, businessName: "Nexa Test", profileId: "pension_restaurant" }), `${base}/api-host`);
  await expect.poll(() => page.locator('[data-nexa-role="launcher"]').evaluate((im) => im.complete && im.naturalWidth > 0)).toBe(true);
  expect([...new Set(images)]).toEqual([`/module/${assetFor('launcher')}`]);
  await expect(page.locator(".ya-widget-button")).toBeInViewport();
  await page.getByRole("button", { name: "Yardımcı Asistan'ı aç" }).click();
  await expect(page.locator('[data-nexa-role="welcome"]')).toBeVisible();
  await expect.poll(() => images.includes(`/module/${assetFor('welcome')}`)).toBe(true);
  await expect.poll(() => page.locator('[data-nexa-role="welcome"]').evaluate((im) => im.complete && im.naturalWidth > 0)).toBe(true);
  mkdirSync("artifacts/nexa-integration", { recursive: true });
  await page.screenshot({ path: 'artifacts/nexa-integration/web-welcome-mobile.png' });
  await page.locator('[data-ya-view="info"]').click();
  await expect(page.locator('[data-nexa-role="header"]')).toBeVisible();
  await expect(page.locator('[data-nexa-role="welcome"]')).toHaveCount(0);
  await expect(page.locator('.ya-widget-nexa')).toHaveCount(1);
  await page.locator('.ya-widget-ai textarea').fill("Bir sorum var");
  await page.locator('.ya-widget-ai button[type="submit"]').click();
  const root = page.locator('#yardimci-asistan-widget');
  await expect(root).toHaveAttribute('data-nexa-state','thinking');
  await expect(page.locator('[data-nexa-role="header"]')).toHaveAttribute('src',`${base}/module/${assetFor('thinking')}`);
  await expect.poll(() => typeof release).toBe('function'); release();
  await expect(root).toHaveAttribute('data-nexa-state','speaking');
  await expect(page.locator('.ya-widget-ai-answer')).toContainText('İşletme yanıtı hazır.');
  await expect(page.locator('.ya-widget-nexa')).toHaveCount(1);
  await expect(page.locator('.ya-widget-answer-avatar')).toHaveCount(0);
  await expect(root).toHaveAttribute('data-nexa-state','ready');
  await page.screenshot({ path: 'artifacts/nexa-integration/web-conversation-mobile.png' });
  await page.evaluate(() => { Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => false }); window.dispatchEvent(new Event('blur')); });
  await expect(root).toHaveAttribute('data-nexa-motion-active','false');
  await expect.poll(() => page.locator('[data-nexa-role="header"]').evaluate((im) => getComputedStyle(im).animationName)).toBe('none');
  await page.evaluate(() => { Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }); window.dispatchEvent(new Event('focus')); });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  nextResult = { ok: false, message: 'Bağlantı kurulamadı', error: { code: 'test_failure', message: 'Bağlantı kurulamadı' } };
  release = undefined;
  await page.locator('.ya-widget-ai textarea').fill("Bir sorum var");
  await page.locator('.ya-widget-ai button[type="submit"]').click();
  await expect(root).toHaveAttribute('data-nexa-state','thinking');
  await expect(root).toHaveAttribute('data-nexa-motion-active','false');
  await expect.poll(() => page.locator('[data-nexa-role="header"]').evaluate((im) => getComputedStyle(im).animationName)).toBe('none');
  await expect.poll(() => typeof release).toBe('function'); release();
  await expect(root).toHaveAttribute('data-nexa-state','concerned');
  await expect(page.locator('.ya-widget-notice')).toContainText('test_failure');
  await expect(page.locator('.ya-widget-panel')).toBeInViewport();
  await page.getByRole('button',{name:'Asistanı kapat'}).click();
  await expect(root).toHaveAttribute('data-nexa-state','ready');
  await expect(root).toHaveAttribute('data-nexa-motion-active','false');
  await expect(page.locator('[data-nexa-role="launcher"]')).toHaveAttribute('src',`${base}/module/${assetFor('launcher')}`);
  expect(images.every((p) => p.startsWith('/module/assets/nexa/'))).toBe(true);
  expect(errors).toEqual([]);
  console.log('web-nexa-smoke-ok');
} finally { await browser?.close(); await new Promise((done) => server.close(done)); }
