import { chromium, expect } from "@playwright/test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const widgetBundlePath = join(repoRoot, "packages", "web-widget", "dist", "widget.js");

const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
  await page.setContent("<!doctype html><html><head></head><body><main>Firma sitesi</main></body></html>", {
    waitUntil: "domcontentloaded"
  });
  await page.route("https://demo.test/yardimci-asistan/api/chat.php", async (route) => {
    const payload = route.request().postDataJSON();
    if (payload.message !== "Bu akşam 4 kişilik masa var mı?") {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, message: "unexpected_message" })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        answer: "AI servisi istek sınırına ulaştı. Müsaitlik ve fiyat için işletme sahibi kontrol edip size dönüş yapacaktır.",
        fallback: true,
        error: {
          code: "provider_rate_limited",
          message: "AI servisi istek sınırına ulaştı. Lütfen birkaç dakika sonra yeniden deneyin.",
          retryable: true,
          provider_status: 429
        }
      })
    });
  });
  await page.addScriptTag({ path: widgetBundlePath });

  await page.evaluate(() => {
    window.YardimciAsistanWidget?.init({
      businessName: "Fallback Firma",
      logoUrl: ""
    });
  });
  await expect(page.locator(".ya-widget-button .ya-widget-mark-fallback")).toHaveText("YA");

  await page.evaluate(() => {
    window.YardimciAsistanWidget?.init({
      businessName: "Logo Firma",
      logoUrl: "/assets/yardimci-asistan-symbol.png",
      apiBaseUrl: "https://demo.test/yardimci-asistan"
    });
  });

  await expect(page.locator(".ya-widget-button img.ya-widget-mark")).toHaveAttribute("src", "/assets/yardimci-asistan-symbol.png");
  await page.getByRole("button", { name: "Yardımcı Asistan'ı aç" }).click();
  await expect(page.locator(".ya-widget-header img.ya-widget-mark")).toHaveAttribute("src", "/assets/yardimci-asistan-symbol.png");
  await expect(page.locator(".ya-widget-header strong")).toHaveText("Logo Firma");
  await page.locator('[data-ya-view="info"]').click();
  await page.locator(".ya-widget-ai textarea").fill("Bu akşam 4 kişilik masa var mı?");
  await page.locator('.ya-widget-ai button[type="submit"]').click();
  await expect(page.locator(".ya-widget-ai-answer")).toContainText("Müsaitlik ve fiyat");
  await expect(page.locator(".ya-widget-status")).toContainText("istek sınırına ulaştı");
  await expect(page.locator(".ya-widget-status")).toContainText("provider_rate_limited (HTTP 429)");

  console.log("web-widget-branding-smoke-ok");
} finally {
  await browser.close();
}
