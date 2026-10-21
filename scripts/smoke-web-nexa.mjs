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
const bundle = readFileSync("test-site/landing/assets/assistant/widget.js", "utf8");
assert.ok(!bundle.includes("data:image/webp"), "Runtime images must remain external, not embedded in launcher JS");
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if (path === "/module/widget.js") { res.setHeader("content-type", "text/javascript; charset=utf-8"); res.end(bundle); return; }
  if (path.startsWith("/module/") && paths.includes(path.slice(8))) {
    res.setHeader("content-type", "image/webp"); res.end(readFileSync(resolve("test-site/landing/assets/assistant", path.slice(8)))); return;
  }
  if (path.endsWith("/api/business.php")) { res.setHeader("content-type", "application/json"); res.end('{"ok":false}'); return; }
  res.setHeader("content-type", "text/html; charset=utf-8");
  if (path.startsWith("/showcase")) {
    const english = path.startsWith("/showcase-en");
    res.end(`<!doctype html><html lang="${english ? "en" : "tr"}"><body><main style="width:180px;margin:12px"><div data-showcase-avatar data-showcase-size="144"></div></main><script src="/module/widget.js"></script></body></html>`);
    return;
  }
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
  const launcher = page.locator('[data-nexa-role="launcher"] svg[data-nexa-rig]');
  await expect(launcher).toBeVisible();
  await expect(launcher).toHaveAttribute("data-expression", "idle");
  await expect(launcher).toHaveAttribute("data-motion-active", "false");
  const staticLauncher = await launcher.evaluate(el => el.outerHTML);
  await page.waitForTimeout(200);
  expect(await launcher.evaluate(el => el.outerHTML)).toBe(staticLauncher);
  expect(images).toEqual([]);
  await expect(page.locator(".ya-widget-button")).toBeInViewport();
  await page.getByRole("button", { name: "Yardımcı Asistan'ı aç" }).click();
  await expect(page.locator('[data-nexa-role="welcome"]')).toBeVisible();
  const welcome = page.locator('[data-nexa-role="welcome"] svg[data-nexa-rig]');
  await expect(welcome).toBeVisible();
  await expect(welcome).toHaveAttribute("data-motion-active", "true");
  const welcomeGround = await page.locator('.ya-widget-nexa-welcome').evaluate(host => ({ groundTop: parseFloat(getComputedStyle(host, '::after').top), characterHeight: host.querySelector('[data-nexa-role]').getBoundingClientRect().height }));
  expect(welcomeGround.groundTop).toBeGreaterThan(welcomeGround.characterHeight);
  // Capture settled appearance after the panel entrance fade, not its transparent first frame.
  await page.waitForTimeout(450);
  mkdirSync("artifacts/nexa-integration", { recursive: true });
  await page.emulateMedia({ colorScheme: "light" });
  await page.screenshot({ path: 'artifacts/nexa-integration/web-welcome-mobile-light.png' });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: 'artifacts/nexa-integration/web-welcome-mobile-dark.png' });
  await page.locator('[data-ya-view="info"]').click();
  await expect(page.locator('[data-nexa-role="header"]')).toBeVisible();
  await expect(page.locator('.ya-widget-header .ya-widget-mark')).toHaveCount(0);
  await expect(page.locator('[data-nexa-role="welcome"]')).toHaveCount(0);
  const header = page.locator('[data-nexa-role="header"] svg[data-nexa-rig]');
  await expect(header).toHaveAttribute("data-size", "small");
  await expect(header).toHaveAttribute("data-motion-active", "true");
  for (const part of ["crown", "side-fin", "far-fin", "tail", "ribbon"]) {
    await expect(header.locator(`[data-part="${part}"]`)).toHaveCount(1);
  }
  const idleMouth = await header.locator("[data-mouth-line]").getAttribute("d");
  const idleBrow = await header.locator('[data-brow="left"]').getAttribute("d");
  const blink = await header.evaluate(async (rig) => {
    const eye = rig.querySelector('[data-eye-white="left"]'), clip = rig.querySelector('[data-eye-clip="left"]');
    const shapes = new Set(); let matched = true;
    const start = performance.now();
    await new Promise(done => {
      function sample(now) {
        shapes.add(eye.getAttribute("d")); matched &&= eye.getAttribute("d") === clip.getAttribute("d");
        if (now - start >= 6500) done(); else requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    return { count: shapes.size, matched, transform: getComputedStyle(rig).transform };
  });
  expect(blink.count).toBeGreaterThan(1); expect(blink.matched).toBe(true); expect(blink.transform).toBe("none");
  await expect(page.locator('.ya-widget-nexa')).toHaveCount(1);
  await page.locator('.ya-widget-ai textarea').fill("Bir sorum var");
  await page.locator('.ya-widget-ai button[type="submit"]').click();
  const root = page.locator('#yardimci-asistan-widget');
  await expect(root).toHaveAttribute('data-nexa-state','thinking');
  await expect(header).toHaveAttribute("data-expression", "thinking");
  const speech = page.locator('[data-ya-nexa-speech]');
  await expect(speech).toBeVisible();
  await expect(speech).toHaveAttribute('aria-label', 'Düşünüyorum…');
  await expect(speech.locator('.ya-nexa-speech-dots i')).toHaveCount(3);
  const bubbleBounds = await speech.evaluate(element => {
    const bubble = element.getBoundingClientRect(), panel = element.closest('.ya-widget-panel').getBoundingClientRect();
    const character = element.closest('.ya-widget-header').querySelector('[data-nexa-role]').getBoundingClientRect();
    return { inside: bubble.left >= panel.left && bubble.right <= panel.right, above: bubble.bottom < character.top };
  });
  expect(bubbleBounds).toEqual({ inside: true, above: true });
  const fin = header.locator('[data-part="side-fin"]');
  const thinkingFin = await fin.getAttribute("transform");
  await expect.poll(() => fin.getAttribute("transform")).not.toBe(thinkingFin);
  await expect.poll(() => typeof release).toBe('function'); release();
  await expect(root).toHaveAttribute('data-nexa-state','speaking');
  await expect(header).toHaveAttribute("data-expression", "speaking");
  const openMouth = await header.locator("[data-mouth]").getAttribute("d");
  await expect.poll(() => header.locator("[data-mouth]").getAttribute("d"), { intervals: [30], timeout: 650 }).not.toBe(openMouth);
  await expect(header).toHaveAttribute("data-expression", "speaking");
  await expect(page.locator('.ya-widget-ai-answer')).toContainText('İşletme yanıtı hazır.');
  await expect(page.locator('.ya-widget-nexa')).toHaveCount(1);
  await expect(page.locator('.ya-widget-answer-avatar')).toHaveCount(0);
  await expect(root).toHaveAttribute('data-nexa-state','ready');
  await expect(speech).toBeHidden();
  await page.emulateMedia({ colorScheme: "light" });
  await page.screenshot({ path: 'artifacts/nexa-integration/web-conversation-mobile-light.png' });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: 'artifacts/nexa-integration/web-conversation-mobile-dark.png' });
  await page.evaluate(() => { Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => false }); window.dispatchEvent(new Event('blur')); });
  await expect(root).toHaveAttribute('data-nexa-motion-active','false');
  await expect(header).toHaveAttribute("data-motion-active", "false");
  const paused = await header.evaluate(el => el.outerHTML);
  await page.waitForTimeout(200);
  expect(await header.evaluate(el => el.outerHTML)).toBe(paused);
  await page.evaluate(() => { Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }); window.dispatchEvent(new Event('focus')); });
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(header).toHaveAttribute("data-motion-active", "false");
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(header).toHaveAttribute("data-motion-active", "true");
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  nextResult = { ok: false, message: 'Bağlantı kurulamadı', error: { code: 'test_failure', message: 'Bağlantı kurulamadı' } };
  release = undefined;
  await page.locator('.ya-widget-ai textarea').fill("Bir sorum var");
  await page.locator('.ya-widget-ai button[type="submit"]').click();
  await expect(root).toHaveAttribute('data-nexa-state','thinking');
  await expect(root).toHaveAttribute('data-nexa-motion-active','false');
  await expect(header).toHaveAttribute("data-motion-active", "false");
  await expect(header).toHaveAttribute("data-expression", "thinking");
  const reducedPose = await header.evaluate(el => el.outerHTML);
  await page.waitForTimeout(200);
  expect(await header.evaluate(el => el.outerHTML)).toBe(reducedPose);
  await expect.poll(() => typeof release).toBe('function'); release();
  await expect(root).toHaveAttribute('data-nexa-state','concerned');
  await expect(header).toHaveAttribute("data-expression", "concerned");
  await expect(header.locator("[data-mouth-line]")).not.toHaveAttribute("d", idleMouth);
  await expect(header.locator('[data-brow="left"]')).not.toHaveAttribute("d", idleBrow);
  await expect(page.locator('.ya-widget-notice')).toContainText('test_failure');
  await expect(speech).toHaveAttribute('aria-label', 'Bir sorun oldu.');
  await expect(page.locator('.ya-widget-panel')).toBeInViewport();
  await expect(root).toHaveAttribute('data-nexa-state', 'ready', { timeout: 4000 });
  await expect(speech).toBeHidden();
  await expect(page.locator('.ya-widget-notice')).toContainText('test_failure');
  await page.getByRole('button',{name:'Asistanı kapat'}).click();
  await expect(root).toHaveAttribute('data-nexa-state','ready');
  await expect(root).toHaveAttribute('data-nexa-motion-active','false');
  await expect(launcher).toHaveAttribute("data-motion-active", "false");
  expect(images).toEqual([]);
  // Closing also cancels an active rig immediately, during the panel exit.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Yardımcı Asistan'ı aç" }).click();
  await expect(welcome).toHaveAttribute("data-motion-active", "true");
  await page.evaluate(() => { window.__removedRig = document.querySelector('[data-nexa-role="welcome"] svg'); window.YardimciAsistanWidget.close(); });
  expect(await page.evaluate(() => window.__removedRig.dataset.motionActive)).toBe("false");
  await expect(launcher).toBeVisible();
  expect(await page.evaluate(() => window.__removedRig.isConnected)).toBe(false);
  // Hero presentation shares the real rig without manufacturing an AI activity.
  for (const language of ['tr', 'en']) {
    const heroPage = await browser.newPage({ viewport: { width: 320, height: 700 } });
    heroPage.on('pageerror', error => errors.push(error.message));
    await heroPage.goto(`${base}/${language === 'en' ? 'showcase-en' : 'showcase'}/`);
    const hero = heroPage.locator('[data-showcase-avatar]');
    const heroRig = hero.locator('svg[data-nexa-rig]');
    const greeting = hero.locator('.showcase-avatar-speech');
    await expect(heroRig).toHaveAttribute('data-nexa-state', 'ready');
    await expect(heroRig).toHaveAttribute('data-motion-active', 'true');
    await expect(greeting).toHaveText(language === 'en' ? 'Hello!' : 'Merhaba!');
    await expect(greeting).toBeVisible();
    expect(await hero.evaluate(element => {
      const bounds = element.getBoundingClientRect(), parent = element.parentElement.getBoundingClientRect();
      const bubble = element.querySelector('.showcase-avatar-speech').getBoundingClientRect();
      const stage = element.querySelector('.showcase-avatar-stage');
      const character = stage.querySelector('.showcase-avatar-character').getBoundingClientRect();
      return {
        width: bounds.width,
        inside: bounds.left >= parent.left && bounds.right <= parent.right && bubble.left >= bounds.left && bubble.right <= bounds.right,
        groundBelow: parseFloat(getComputedStyle(stage, '::after').top) > character.height,
        noPageOverflow: document.documentElement.scrollWidth <= innerWidth,
      };
    })).toEqual({ width: 144, inside: true, groundBelow: true, noPageOverflow: true });
    await heroPage.emulateMedia({ reducedMotion: 'reduce' });
    await expect(heroRig).toHaveAttribute('data-motion-active', 'false');
    const restingHero = await heroRig.evaluate(element => element.outerHTML);
    await heroPage.waitForTimeout(200);
    expect(await heroRig.evaluate(element => element.outerHTML)).toBe(restingHero);
    await expect(greeting).toBeHidden({ timeout: 4500 });
    await expect(heroRig).toHaveAttribute('data-nexa-state', 'ready');
    await heroPage.evaluate(() => { window.__heroRig = document.querySelector('[data-showcase-avatar] svg'); window.dispatchEvent(new Event('pagehide')); });
    expect(await heroPage.evaluate(() => ({ connected: window.__heroRig.isConnected, motion: window.__heroRig.dataset.motionActive }))).toEqual({ connected: false, motion: 'false' });
    await heroPage.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    await expect(heroRig).toBeVisible();
    await heroPage.close();
  }
  // A real SVG-unavailable browser uses the retained manifest URLs, resolved
  // beside widget.js even when the page and API live at different paths.
  const fallbackPage = await browser.newPage({ viewport: { width: 320, height: 700 } });
  await fallbackPage.addInitScript(() => {
    Object.defineProperty(SVGSVGElement.prototype, "createSVGRect", { configurable: true, value: undefined });
  });
  await fallbackPage.goto(`${base}/site/`);
  await fallbackPage.evaluate((base) => window.YardimciAsistanWidget.init({ apiBaseUrl: `${base}/api-host`, businessName: "Fallback Test", profileId: "pension_restaurant" }), base);
  const fallbackLauncher = fallbackPage.locator('[data-nexa-role="launcher"] img');
  await expect(fallbackLauncher).toHaveAttribute("src", `${base}/module/${assetFor("launcher")}`);
  await expect.poll(() => fallbackLauncher.evaluate(im => im.complete && im.naturalWidth > 0)).toBe(true);
  await fallbackPage.getByRole("button", { name: "Yardımcı Asistan'ı aç" }).click();
  await expect(fallbackPage.locator('[data-nexa-role="welcome"] img')).toHaveAttribute("src", `${base}/module/${assetFor("welcome")}`);
  await fallbackPage.locator('[data-ya-view="info"]').click();
  await expect(fallbackPage.locator('[data-nexa-role="header"] img')).toHaveAttribute("src", `${base}/module/${assetFor("ready")}`);
  await fallbackPage.close();
  expect(errors).toEqual([]);
  console.log('web-nexa-smoke-ok');
} finally { await browser?.close(); await new Promise((done) => server.close(done)); }
