import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";

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
    window.yardimciDesktop = { generateDailyBusinessEvaluation: () => new Promise((resolve) => { window.__nexaReply = resolve; }) };
  });
  await page.goto(`${server.resolvedUrls.local[0]}nexa-desktop-test`);
  const habitat = page.locator(".nexa-habitat");
  await expect(habitat).toHaveClass(/--wide/);
  await expect(habitat).toHaveAttribute("data-nexa-state", "ready");
  await expect.poll(() => habitat.locator('.nexa-character').evaluate((im) => im.complete && im.naturalWidth > 0)).toBe(true);
  mkdirSync("artifacts/nexa-integration", { recursive: true });
  await page.locator('.sidebar').screenshot({ path: 'artifacts/nexa-integration/desktop-wide.png' });
  await page.getByRole("button", { name: "AI cevabı iste" }).click();
  await expect(habitat).toHaveAttribute("data-nexa-state", "thinking");
  await page.evaluate(() => window.__nexaReply({ ok: true, content: "Gerçek AI yanıtı", fallback: false, message: "Hazır" }));
  await expect(habitat).toHaveAttribute("data-nexa-state", "speaking");
  await expect(page.getByTestId("ai-result")).toHaveText("Gerçek AI yanıtı");
  await expect(habitat).toHaveAttribute("data-nexa-state", "ready");
  await page.getByRole("button", { name: "AI işlemini doğrula" }).click();
  await expect(habitat).toHaveAttribute("data-nexa-state", "pleased");
  await expect(habitat).toHaveAttribute("data-nexa-state", "ready");
  await page.getByRole("button", { name: "AI cevabı iste" }).click();
  await page.evaluate(() => window.__nexaReply({ ok: false, message: "AI başarısız" }));
  await expect(habitat).toHaveAttribute("data-nexa-state", "concerned");
  await expect(habitat).not.toContainText("AI başarısız");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "AI cevabı iste" }).click();
  await expect(habitat).toHaveAttribute("data-motion-active", "false");
  await expect.poll(() => habitat.locator('.nexa-character').evaluate((im) => getComputedStyle(im).animationName)).toBe("none");
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
  // With eleven entries, the compact mode appears before navigation is squeezed.
  await page.setViewportSize({ width: 1280, height: 740 });
  await expect(habitat).toHaveClass(/--compact/);
  await page.setViewportSize({ width: 1280, height: 360 });
  await expect(habitat).toHaveClass(/--hidden/);
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
  await page.locator('.sidebar').screenshot({ path: 'artifacts/nexa-integration/desktop-micro.png' });
  expect(errors).toEqual([]);
  console.log("desktop-nexa-smoke-ok");
} finally { await browser?.close(); await server.close(); }
