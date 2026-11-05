import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { resolve } from "node:path";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";

const server = await createServer({
  root: resolve("apps/desktop-app"),
  configFile: resolve("apps/desktop-app/vite.renderer.config.ts"),
  server: { port: 0, strictPort: false }
});
await server.listen();
let browser;
try {
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "tr-TR" });
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => { throw error; });
  await page.route("**/settings-cancel-fixture*", async route =>
    route.fulfill({
      contentType: "text/html",
      body: await server.transformIndexHtml("/settings-cancel-fixture",
        '<html><body><div id="root"></div><script type="module" src="/@fs/' +
        resolve("scripts/fixtures/settings-platform.tsx") + '"></script></body></html>')
    }));
  await page.goto(server.resolvedUrls.local[0] + "settings-cancel-fixture?profile=market");
  const expand = page.getByRole("button", { name: /^İşletme Yapısı ve Özellikler/ });
  if (await expand.getAttribute("aria-expanded") === "false") await expand.click();
  await page.getByRole("button", { name: "AI Yardımcı ayarları" }).click();
  const dialog = page.getByRole("dialog", { name: "AI Yardımcı" });
  await expect(dialog).toBeVisible();

  // This settings fixture has no Nexa component; the real CSS polygon is
  // pixel-tested separately in Chromium with a mock sidebar and habitat.
  const backdropClip = await page.evaluate(() =>
    getComputedStyle(document.querySelector("dialog.settings-service-overlay"), "::backdrop").clipPath);
  if (!backdropClip.startsWith("polygon(evenodd")) {
    throw Error("Native modal backdrop does not preserve the Nexa cutout");
  }

  await page.evaluate(() => {
    window.cancelledConnectionTests = [];
    window.pendingConnectionTest = null;
    window.yardimciDesktop.testAiConnection = (_input, id) => {
      window.lastConnectionTestId = id;
      return new Promise(resolve => { window.pendingConnectionTest = resolve; });
    };
    window.yardimciDesktop.cancelAiConnectionTest = async id => {
      window.cancelledConnectionTests.push(id);
      return true;
    };
  });
  const enabled = dialog.getByRole("switch", { name: "AI Yardımcı servisi" });
  if (!await enabled.isChecked()) await enabled.check();

  const start = dialog.getByRole("button", { name: "Bağlantıyı Dene" });
  await expect(start).toBeEnabled();
  await start.click();
  const cancel = dialog.getByRole("button", { name: "Testi İptal Et" });
  await expect(cancel).toBeEnabled();
  await expect(dialog.locator(".form-grid[inert]")).toHaveCount(1);
  await cancel.click();
  // AI feedback is delivered once in the shell topbar, never duplicated inside the modal.
  await expect(dialog.locator(".settings-service-feedback-result")).toHaveCount(0);
  await expect(page.locator(".global-message-bar")).toContainText("Bağlantı testi iptal edildi.");
  await expect(start).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.cancelledConnectionTests.length)).toBe(1);
  await page.evaluate(() => {
    window.pendingConnectionTest({ ok: true, message: "Geç kalmış test sonucu", model: "fixture-model", models: [] });
  });
  await expect(dialog.getByText("Geç kalmış test sonucu")).toHaveCount(0);
  await expect(dialog.locator(".settings-service-feedback-result")).toHaveCount(0);
  await expect(page.locator(".global-message-bar")).toContainText("Bağlantı testi iptal edildi.");

  // The official Cloudflare catalog lists two Image-to-Text models. Both must
  // remain selectable, reach the test input, and report only in the topbar.
  const visionModels = [
    "@cf/llava-hf/llava-1.5-7b-hf",
    "@cf/moondream/moondream3.1-9B-A2B"
  ];
  await page.evaluate(() => {
    window.visionTests = [];
    window.yardimciDesktop.testAiConnection = async input => {
      window.visionTests.push(input.visionModel);
      return { ok: true, model: input.model || "@cf/meta/llama-3.2-1b-instruct",
        message: input.visionModel ? `Görsel analiz doğrulandı: ${input.visionModel}` : "Cloudflare katalog hazır",
        models: [
          { id: "@cf/meta/llama-3.2-1b-instruct", label: "Metin", task: "text" },
          { id: "@cf/llava-hf/llava-1.5-7b-hf", label: "LLaVA", task: "vision" },
          { id: "@cf/moondream/moondream3.1-9B-A2B", label: "Moondream", task: "vision" }
        ] };
    };
  });
  await dialog.locator(".setup-ai-service-field select").selectOption("cloudflare");
  await dialog.getByLabel("Cloudflare Account ID").fill("a".repeat(32));
  await dialog.getByLabel("Cloudflare API Token").fill("test-cloudflare-token");
  await start.click();
  await expect(dialog.locator("#settings-ai-test")).toHaveClass(/sync-success/);
  const visionSelect = dialog.getByLabel("Görsel analiz modeli");
  for (const model of visionModels) {
    await visionSelect.selectOption(model);
    await expect(visionSelect).toHaveValue(model);
    await start.click();
    await expect(dialog.locator("#settings-ai-test")).toHaveClass(/sync-success/);
    await expect(page.locator(".global-message-bar")).toContainText(`Görsel analiz doğrulandı: ${model}`);
    await expect(dialog.locator(".settings-service-feedback-result")).toHaveCount(0);
  }
  await expect.poll(() => page.evaluate(() => window.visionTests.slice(-2))).toEqual(visionModels);
  await dialog.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "AI Yardımcı ayarları" }).click();
  await expect(dialog.getByLabel("Görsel analiz modeli")).toHaveValue(visionModels[1]);
  await expect(dialog.locator(".settings-service-feedback-result")).toHaveCount(0);
  console.log("smoke-ai-connection-cancel-ui-ok: cancel, stale reply, Cloudflare vision selection/save/reopen, topbar-only feedback");
} finally {
  await browser?.close();
  await server.close();
}
