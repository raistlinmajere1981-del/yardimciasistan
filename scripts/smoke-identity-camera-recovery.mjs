import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";

let server, browser;
const errors = [];
try {
  server = await createServer({
    root: resolve("apps/desktop-app"),
    configFile: resolve("apps/desktop-app/vite.renderer.config.ts"),
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0, strictPort: false }
  });
  await server.listen();
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(8000);
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => new MediaStream();
    HTMLVideoElement.prototype.play = async function () {};
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 1280 });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 720 });
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      callback(new Blob([new Uint8Array([255, 216, 255, 1])], { type: "image/jpeg" }));
    };
  });
  await page.route("**/identity-camera-test*", async route => route.fulfill({
    contentType: "text/html",
    body: await server.transformIndexHtml("/identity-camera-test",
      `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/identity-camera-recovery.tsx")}"></script></body></html>`)
  }));
  await page.goto(`${server.resolvedUrls.local[0]}identity-camera-test`);
  const dialog = page.getByRole("dialog", { name: "Kimliği kameradan tara" });
  const capture = page.getByRole("button", { name: "Fotoğraf çek" });
  const retry = page.getByRole("button", { name: "Tekrar Dene" });
  const recapture = page.getByRole("button", { name: "Yeniden Çek" });
  const start = page.getByRole("button", { name: "Taramayı başlat" });
  const count = () => page.evaluate(() => window.__identityCalls.length);
  const responses = async items => page.evaluate(items => { window.__identityResponses = items; }, items);
  const takeBoth = async () => {
    await expect(capture).toBeEnabled();
    await capture.click();
    await expect(dialog.getByText("Kimliğin arka yüzü")).toBeVisible();
    await expect(capture).toBeEnabled();
    await capture.click();
  };

  // A permanent error must stay on a stopped screen (never recapture or retry automatically).
  await responses([{ ok: false, code: "provider_authentication_failed", message: "Anahtar kabul edilmedi." }]);
  await start.click();
  await expect(dialog).toBeVisible();
  await takeBoth();
  await expect(dialog.getByText("AI analizi tamamlanamadı")).toBeVisible();
  await expect(dialog.getByText("Anahtar kabul edilmedi.")).toBeVisible();
  await expect(retry).toHaveCount(0);
  await expect(recapture).toBeVisible();
  await expect(capture).toHaveCount(0);
  assert.equal(await count(), 1);
  const firstNames = await page.evaluate(() => window.__identityCalls[0].names);
  assert.equal(firstNames.length, 2);
  assert.ok(firstNames[0].includes("front") && firstNames[1].includes("back"));
  await page.waitForTimeout(650);
  assert.equal(await count(), 1, "Permanent failure must not cause an AI/camera loop");
  await dialog.getByRole("button", { name: "İptal" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Müşteri notu" })).toHaveValue("Önceden girilen bilgi");

  // Temporary failures allow exactly one deliberate retry using the same captured frames.
  await responses([
    { ok: false, code: "provider_unavailable", message: "Sunucu geçici olarak kapalı." },
    { ok: false, code: "provider_unavailable", message: "Sunucu halen kapalı." }
  ]);
  await start.click();
  await takeBoth();
  await expect(retry).toBeEnabled();
  assert.equal(await count(), 2);
  await retry.click();
  await expect(dialog.getByText("Sunucu halen kapalı.")).toBeVisible();
  assert.equal(await count(), 3);
  const calls = await page.evaluate(() => window.__identityCalls.slice(1, 3));
  assert.deepEqual(calls[0], calls[1], "Retry should preserve both original images");
  await expect(retry).toHaveCount(0);
  await page.waitForTimeout(650);
  assert.equal(await count(), 3, "Retry must never repeat itself");
  await expect(recapture).toBeEnabled();

  // A new capture can be deliberately requested, and success returns to the existing form.
  await responses([{ ok: true, message: "Okundu." }]);
  await recapture.click();
  await expect(capture).toBeEnabled();
  await takeBoth();
  await expect(dialog).toHaveCount(0);
  assert.equal(await count(), 4);
  await expect(page.getByRole("textbox", { name: "Müşteri notu" })).toHaveValue("Önceden girilen bilgi");
  assert.deepEqual(errors, [], "Unexpected renderer errors");
  console.log("identity-camera-recovery-smoke-ok");
} finally {
  await browser?.close();
  await server?.close();
}
