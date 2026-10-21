import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { installDictationMock } from "./test-helpers/dictation-fixtures.mjs";

const server = await createServer({ root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"), server: { port: 0, strictPort: false } });
await server.listen();
let browser;
try {
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/nexa-desktop-test", async (route) => {
    const html = await server.transformIndexHtml("/nexa-desktop-test", `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/nexa-desktop.tsx")}"></script></body></html>`);
    await route.fulfill({ contentType: "text/html", body: html });
  });
  await page.addInitScript(() => {
    window.__nexaReply = null;
    window.yardimciDesktop = {
      generateDailyBusinessEvaluation: () => new Promise((resolve) => { window.__nexaReply = resolve; }),
      getDictationStatus: async () => ({ available: true, revision: 1, message: "Hazır" }),
      cancelDictation: async () => true,
      transcribeAudio: async () => ({ ok: true, revision: 1, text: "Deneme" }),
    };
  });
  await page.addInitScript(installDictationMock);
  await page.goto(`${server.resolvedUrls.local[0]}nexa-desktop-test`);
  const habitat = page.locator(".nexa-habitat");
  const speech = habitat.locator(".nexa-habitat-speech");
  async function assertContained() {
    await expect.poll(() => habitat.evaluate(el => {
      const sidebar = el.closest('.sidebar').getBoundingClientRect();
      const nav = document.querySelector('.sidebar-primary-nav').getBoundingClientRect();
      const footer = document.querySelector('.sidebar-footer-nav').getBoundingClientRect();
      const main = document.querySelector('main').getBoundingClientRect();
      return [...el.querySelectorAll('.nexa-character-control, .nexa-habitat-speech')].every(node => {
        const rect = node.getBoundingClientRect();
        return rect.left >= sidebar.left && rect.right <= sidebar.right && rect.right <= main.left
          && rect.top >= nav.bottom && rect.bottom <= footer.top;
      });
    })).toBe(true);
    await expect(page.getByRole('button', { name: 'Ayarlar', exact: true })).toBeInViewport();
  }
  await expect(habitat).toHaveClass(/--wide/);
  await expect(habitat).toHaveAttribute("data-nexa-state", "ready");
  const svg = habitat.locator("svg[data-nexa-rig]");
  await expect(svg).toBeVisible();
  for (const part of ["crown", "side-fin", "far-fin", "tail", "ribbon"]) {
    await expect(svg.locator(`[data-part="${part}"]`)).toHaveCount(1);
  }
  await expect(habitat.locator(".nexa-habitat-back, .nexa-habitat-speech")).toHaveCount(0);
  const idleMouth = await svg.locator("[data-mouth-line]").getAttribute("d");
  const idleBrow = await svg.locator('[data-brow="left"]').getAttribute("d");
  await expect(habitat).toHaveAttribute("data-motion-active","true");
  await expect(svg).toHaveAttribute("data-motion-active", "true");
  // Observe an entire eye-contact/glance/blink cycle, including actual clipping.
  const eyeMotion = await svg.evaluate(async (rig) => {
    const eye = rig.querySelector('[data-eye-white="left"]');
    const clip = rig.querySelector('[data-eye-clip="left"]');
    const pupil = rig.querySelector('[data-pupil="left"]');
    const shapes = new Set(), gazes = new Set();
    let matched = true;
    const start = performance.now();
    await new Promise((done) => {
      function sample(now) {
        shapes.add(eye.getAttribute("d")); gazes.add(pupil.getAttribute("transform"));
        matched &&= eye.getAttribute("d") === clip.getAttribute("d");
        if (now - start >= 6500) done(); else requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    return { shapes: shapes.size, gazes: gazes.size, matched,
      rootTransform: getComputedStyle(rig).transform, bodyTransform: rig.querySelector('[data-part="body"]').getAttribute("transform") };
  });
  expect(eyeMotion.shapes).toBeGreaterThan(1); expect(eyeMotion.gazes).toBeGreaterThan(1);
  expect(eyeMotion.matched).toBe(true); expect(eyeMotion.rootTransform).toBe("none"); expect(eyeMotion.bodyTransform).toBeNull();
  await expect(svg.locator('[data-part="presence"]')).toHaveAttribute('transform', /scale/);
  // Hover/press are local visual feedback, never synthetic work or success.
  await page.getByRole('button', { name: 'Yardımcı Asistan ile etkileş' }).click();
  await expect(habitat).toHaveAttribute('data-nexa-state', 'ready');
  await expect(speech).toHaveCount(0);
  mkdirSync("artifacts/nexa-integration", { recursive: true });
  await page.locator('.sidebar').screenshot({ path: 'artifacts/nexa-integration/desktop-wide-light.png' });
  await page.evaluate(() => { document.documentElement.dataset.colorScheme = "dark"; });
  await expect(habitat.locator('.nexa-habitat-shadow')).toHaveAttribute("src", /dark\.svg$/);
  await page.locator('.sidebar').screenshot({ path: 'artifacts/nexa-integration/desktop-wide-dark.png' });
  await page.evaluate(() => { document.documentElement.dataset.colorScheme = "light"; });
  await page.getByRole("button", { name: "AI cevabı iste" }).click();
  await expect(habitat).toHaveAttribute("data-nexa-state", "thinking");
  await expect(svg).toHaveAttribute("data-expression", "thinking");
  await expect(speech).toHaveAccessibleName("Düşünüyorum…");
  await expect(habitat.locator('.nexa-speech-dots i')).toHaveCount(3);
  await assertContained();
  // Sustained real pending promise: changing layout must neither clear the
  // thinking message nor overlap navigation, settings or the work area.
  for (const scheme of ['light', 'dark']) {
    for (const scale of [.8, .9, 1, 1.1, 1.2]) {
      await page.evaluate(({ scheme, scale }) => {
        document.documentElement.dataset.colorScheme = scheme;
        document.documentElement.style.setProperty('--ui-scale', String(scale));
      }, { scheme, scale });
      for (const viewport of [{ width: 800, height: 1000 }, { width: 1440, height: 1080 }, { width: 1000, height: 600 }]) {
        await page.setViewportSize(viewport);
        await assertContained();
        await expect(habitat).toHaveAttribute('data-nexa-state', 'thinking');
        if ((await habitat.getAttribute('class')).includes('--wide')) {
          await expect(speech).toBeVisible();
          const above = await speech.evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('.nexa-character-control').getBoundingClientRect().top);
          expect(above).toBe(true);
        }
      }
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ui-scale', '1');
    document.documentElement.dataset.colorScheme = 'light';
  });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await expect(speech).toBeVisible();
  await page.locator('.sidebar').screenshot({ path: 'artifacts/nexa-integration/desktop-thinking-light.png' });
  await page.evaluate(() => { document.documentElement.dataset.colorScheme = 'dark'; });
  await page.locator('.sidebar').screenshot({ path: 'artifacts/nexa-integration/desktop-thinking-dark.png' });
  const fin = svg.locator('[data-part="side-fin"]');
  const initialFin = await fin.getAttribute("transform");
  await expect.poll(() => fin.getAttribute("transform")).not.toBe(initialFin);
  await page.evaluate(() => window.__nexaReply({ ok: true, content: "Gerçek AI yanıtı", fallback: false, message: "Hazır" }));
  await expect(habitat).toHaveAttribute("data-nexa-state", "speaking");
  await expect(svg).toHaveAttribute("data-expression", "speaking");
  await expect(svg.locator("[data-mouth]")).not.toHaveAttribute("d", "");
  // The brief response reaction remains visibly animated before settling.
  const openMouth = await svg.locator("[data-mouth]").getAttribute("d");
  await expect.poll(() => svg.locator("[data-mouth]").getAttribute("d"), { intervals: [30], timeout: 650 }).not.toBe(openMouth);
  await expect(svg).toHaveAttribute("data-expression", "speaking");
  await expect(page.getByTestId("ai-result")).toHaveText("Gerçek AI yanıtı");
  await expect(habitat).toHaveAttribute("data-nexa-state", "ready");
  await page.getByRole("button", { name: "AI işlemini doğrula" }).click();
  await expect(habitat).toHaveAttribute("data-nexa-state", "pleased");
  await expect(svg).toHaveAttribute("data-expression", "success");
  const delightFin = await fin.getAttribute("transform");
  await expect.poll(() => fin.getAttribute("transform"), { intervals: [30], timeout: 700 }).not.toBe(delightFin);
  await expect(habitat).toHaveAttribute("data-nexa-state", "ready");
  await page.getByRole("button", { name: "AI cevabı iste" }).click();
  await page.evaluate(() => window.__nexaReply({ ok: false, message: "AI başarısız" }));
  await expect(habitat).toHaveAttribute("data-nexa-state", "concerned");
  await expect(habitat).not.toContainText("AI başarısız");
  await expect(svg).toHaveAttribute("data-expression", "concerned");
  await expect(svg.locator('[data-brow="left"]')).not.toHaveAttribute("d", idleBrow);
  await expect(svg.locator("[data-mouth-line]")).not.toHaveAttribute("d", idleMouth);
  await expect(habitat).toHaveAttribute('data-nexa-state', 'ready');
  await expect(speech).toHaveCount(0);
  // Use the actual dictation UI lifecycle. Waiting for permission is not listening;
  // recording is listening; upload/review/cancel/unmount release that signal.
  await page.getByRole('button', { name: 'Dikte editörünü aç' }).click();
  const dialog = page.getByRole('dialog', { name: 'Dikte editörü' });
  await expect(dialog).toBeVisible();
  await page.evaluate(() => { window.__dictationMock.delayPermission = true; });
  await dialog.getByRole('button', { name: 'Dikte Başlat' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__dictationMock.resolvePermission))).toBe(true);
  await expect(habitat).toHaveAttribute('data-nexa-state', 'ready');
  await page.evaluate(() => window.__dictationMock.resolvePermission());
  await expect(habitat).toHaveAttribute('data-nexa-state', 'listening');
  await expect(svg).toHaveAttribute('data-expression', 'listening');
  await expect(speech).toHaveText('Dinliyorum…');
  const modalAboveAvatar = await dialog.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2).closest('dialog') === el;
  });
  expect(modalAboveAvatar).toBe(true);
  await dialog.getByRole('button', { name: 'Durdur ve Metne Çevir' }).click();
  await expect(habitat).toHaveAttribute('data-nexa-state', 'ready');
  await expect(dialog.getByRole('textbox', { name: 'Dikte önizlemesi' })).toHaveValue('Deneme');
  await dialog.getByRole('button', { name: 'İptal', exact: true }).click();
  await page.evaluate(() => { window.__dictationMock.delayPermission = false; });
  await dialog.getByRole('button', { name: 'Dikte Başlat' }).click();
  await expect(habitat).toHaveAttribute('data-nexa-state', 'listening');
  await dialog.getByRole('button', { name: 'Formu kapat' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(habitat).toHaveAttribute('data-nexa-state', 'ready');
  expect(await page.evaluate(() => window.__dictationMock.tracks.every(track => track.stopped))).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "AI cevabı iste" }).click();
  await expect(habitat).toHaveAttribute("data-motion-active", "false");
  await expect(svg).toHaveAttribute("data-motion-active", "false");
  await expect(svg).toHaveAttribute("data-expression", "thinking");
  const paused = await svg.evaluate(el => el.outerHTML);
  await page.waitForTimeout(200);
  expect(await svg.evaluate(el => el.outerHTML)).toBe(paused);
  await page.evaluate(() => { document.documentElement.dataset.motion = "reduced"; });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(habitat).toHaveAttribute("data-motion-active", "false");
  await page.evaluate(() => { document.documentElement.dataset.motion = "system"; });
  await expect(habitat).toHaveAttribute("data-motion-active", "true");
  // Headless Chromium does not transfer OS window focus on bringToFront.
  // Supply the browser focus signal and exercise the real lifecycle listener.
  await page.evaluate(() => { Object.defineProperty(document, "hasFocus", { configurable: true, value: () => false }); window.dispatchEvent(new Event("blur")); });
  await expect(habitat).toHaveAttribute("data-motion-active", "false");
  await page.evaluate(() => { Object.defineProperty(document, "hasFocus", { configurable: true, value: () => true }); window.dispatchEvent(new Event("focus")); });
  await expect(habitat).toHaveAttribute("data-motion-active", "true");
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(habitat).toHaveAttribute("data-motion-active", "false");
  await expect(svg).toHaveAttribute("data-motion-active", "false");
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(svg).toHaveAttribute("data-motion-active", "true");
  // With eleven entries, the compact mode appears before navigation is squeezed.
  await page.setViewportSize({ width: 1280, height: 840 });
  await expect(habitat).toHaveClass(/--compact/);
  await expect(svg).toBeVisible();
  await expect(habitat.locator(".nexa-habitat-speech")).toHaveCount(0);
  await page.locator('.sidebar').screenshot({ path: 'artifacts/nexa-integration/desktop-compact-light.png' });
  await page.evaluate(() => { document.documentElement.dataset.colorScheme = "dark"; });
  await page.locator('.sidebar').screenshot({ path: 'artifacts/nexa-integration/desktop-compact-dark.png' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByRole("button", { name: "Ayarlar", exact: true })).toBeInViewport();
  await expect.poll(() => page.locator('.desktop-shell').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 360 });
  await expect(habitat).toHaveClass(/--hidden/);
  await expect(svg).toHaveCount(0);
  await expect(habitat).toHaveAttribute("data-motion-active", "false");
  const settings = page.getByRole("button", { name: "Ayarlar", exact: true });
  await expect(settings).toBeInViewport(); await settings.click();
  await expect(page.getByTestId("selected-page")).toHaveText("settings");
  await expect.poll(() => page.locator('.sidebar').evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.getByRole("button", { name: "Menüyü daralt" }).click();
  await expect(habitat).toHaveClass(/--micro/);
  await expect(settings).toBeInViewport();
  await page.evaluate(() => { document.documentElement.dataset.colorScheme = "dark"; });
  await expect(habitat.locator('.nexa-habitat-shadow')).toHaveAttribute("src", /dark\.svg$/);
  await expect(svg).toHaveAttribute("data-size", "small");
  await page.locator('.sidebar').screenshot({ path: 'artifacts/nexa-integration/desktop-micro-dark.png' });
  await page.evaluate(() => { document.documentElement.dataset.colorScheme = "light"; });
  await page.locator('.sidebar').screenshot({ path: 'artifacts/nexa-integration/desktop-micro-light.png' });
  // The shared rig remains expressive at 32/48/64/112px, IDs never collide,
  // and a sustained pleased pose performs its delight only once.
  const rigModuleUrl = `/@fs/${resolve("packages/shared/utils/nexa-rig.ts")}`;
  await page.evaluate(async (url) => {
    const { mountNexaRig } = await import(url);
    window.__rigControllers = [];
    window.__rigNodes = [];
    for (const size of [32, 48, 64, 112]) {
      const host = document.createElement("div");
      host.className = "nexa-size-proof";
      host.style.cssText = `position:fixed;top:20px;left:${300 + size * 2}px;width:${size}px;height:${size}px`;
      document.body.append(host);
      window.__rigControllers.push(mountNexaRig(host, { state: "ready", motion: true, size }));
      window.__rigNodes.push(host.querySelector("svg"));
    }
  }, rigModuleUrl);
  const proofs = page.locator(".nexa-size-proof svg");
  await expect(proofs).toHaveCount(4);
  await expect.poll(async () => proofs.evaluateAll(nodes => nodes.every(node => node.dataset.motionActive === "true"))).toBe(true);
  await page.evaluate(() => window.__rigControllers.forEach((controller, index) => controller.update({ state: "pleased", motion: true, size: [32,48,64,112][index] })));
  await expect.poll(async () => proofs.evaluateAll(nodes => nodes.every(node => node.dataset.motionActive === "false"))).toBe(true);
  const settled = await proofs.evaluateAll(nodes => nodes.map(node => node.outerHTML));
  await page.waitForTimeout(250);
  expect(await proofs.evaluateAll(nodes => nodes.map(node => node.outerHTML))).toEqual(settled);
  const ids = await page.locator("svg[data-nexa-rig] [id], svg[data-nexa-rig]").evaluateAll(nodes => nodes.map(node => node.id));
  expect(new Set(ids).size).toBe(ids.length);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const staticFaces = [];
  for (const state of ["ready", "thinking", "speaking", "pleased", "concerned"]) {
    await page.evaluate(state => window.__rigControllers.forEach((controller, index) => controller.update({ state, motion: true, size: [32,48,64,112][index] })), state);
    await expect(proofs.first()).toHaveAttribute("data-motion-active", "false");
    staticFaces.push(await proofs.first().evaluate(svg => [...svg.querySelectorAll("[data-mouth], [data-mouth-line], [data-brow], [data-eye-white]")].map(part => part.getAttribute("d")).join("|")));
  }
  expect(new Set(staticFaces).size).toBe(5);
  await page.evaluate(() => window.__rigControllers.forEach((controller, index) => controller.update({ state: "sleep", motion: true, size: [32,48,64,112][index] })));
  await expect(proofs.first()).toHaveAttribute("data-nexa-state", "sleep");
  await expect(proofs.first()).toHaveAttribute("data-motion-active", "false");
  await page.evaluate(() => window.__rigControllers.forEach((controller, index) => controller.update({ state: "listening", motion: false, size: [32,48,64,112][index] })));
  await expect(proofs.first()).toHaveAttribute("data-expression", "listening");
  await page.evaluate(() => window.__rigControllers.forEach(controller => controller.unmount()));
  await expect(proofs).toHaveCount(0);
  expect(await page.evaluate(() => window.__rigNodes.every(node => !node.isConnected && node.dataset.motionActive === "false"))).toBe(true);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => { Object.defineProperty(SVGSVGElement.prototype, "createSVGRect", { configurable: true, value: undefined }); });
  await page.setViewportSize({ width: 1280, height: 360 });
  await expect(habitat).toHaveClass(/--hidden/);
  await page.setViewportSize({ width: 1280, height: 1000 });
  const fallback = habitat.locator("img.nexa-character-fallback");
  await expect.poll(() => fallback.evaluate(im => im.complete && im.naturalWidth > 0)).toBe(true);
  await expect(fallback).toHaveAttribute("src", /assets\/nexa\/.*\.webp$/);
  expect(errors).toEqual([]);
  console.log("desktop-nexa-smoke-ok");
} finally { await browser?.close(); await server.close(); }
