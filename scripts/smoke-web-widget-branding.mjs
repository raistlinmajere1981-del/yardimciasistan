import { chromium, expect } from "@playwright/test";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const widgetBundlePath = join(repoRoot, "packages", "web-widget", "dist", "widget.js");

const browser = await launchChromiumForSmoke(chromium);

try {
  const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
  await page.setContent(`<!doctype html><html><head><base href="https://demo.test/"></head><body><main>Firma sitesi</main></body></html>`, {
    waitUntil: "domcontentloaded"
  });
  await page.route("**/api/business.php", route => route.fulfill({ contentType: "application/json", body: '{"ok":false}' }));
  await page.route("https://demo.test/assets/yardimci-asistan-symbol.png", route => route.fulfill({ contentType: "image/png", body: readFileSync("firm-template/web-module/assets/yardimci-asistan-symbol.png") }));
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
  await expect(page.locator('.ya-widget-button [data-nexa-role="launcher"] svg')).toHaveAttribute("data-expression", "idle");
  await expect(page.locator('.ya-widget-button [data-nexa-role="launcher"] svg')).toHaveAttribute("data-motion-active", "false");
  await expect(page.locator('.ya-widget-launcher-copy strong')).toHaveText("Yardımcı");
  await expect(page.locator('.ya-widget-launcher-copy small')).toHaveText("Asistan");

  await page.evaluate(() => {
    window.YardimciAsistanWidget?.init({
      businessName: "Logo Firma",
      profileId: "pension_restaurant",
      logoUrl: "/assets/yardimci-asistan-symbol.png",
      apiBaseUrl: "https://demo.test/yardimci-asistan"
    });
  });

  await expect(page.locator('.ya-widget-button [data-nexa-role="launcher"] svg')).toHaveAttribute("data-expression", "idle");
  await expect(page.locator('.ya-widget-button [data-nexa-role="launcher"] svg')).toHaveAttribute("data-motion-active", "false");
  await page.getByRole("button", { name: "Yardımcı Asistan'ı aç" }).click();
  await expect(page.locator(".ya-widget-header img.ya-widget-mark")).toHaveCount(1);
  await expect(page.locator(".ya-widget-header img.ya-widget-mark")).toHaveAttribute("src", "/assets/yardimci-asistan-symbol.png");
  await expect(page.locator(".ya-widget-header [data-nexa-role=header]")).toHaveCount(0);
  await expect(page.locator(".ya-widget-header strong")).toHaveText("Logo Firma AI Asistanı");
  await page.locator('[data-ya-view="info"]').click();
  await expect(page.locator(".ya-widget-header img.ya-widget-mark")).toHaveCount(0);
  await expect(page.locator(".ya-widget-header [data-nexa-role=header]")).toHaveCount(1);
  await expect(page.locator(".ya-widget-header svg[data-nexa-rig]")).toHaveCount(1);
  await expect(page.locator(".ya-widget-nexa")).toHaveCount(1);
  await page.locator(".ya-widget-ai textarea").fill("Bu akşam 4 kişilik masa var mı?");
  await page.locator('.ya-widget-ai button[type="submit"]').click();
  await expect(page.locator(".ya-widget-ai-answer")).toContainText("Müsaitlik ve fiyat");
  await expect(page.locator(".ya-widget-notice")).toBeVisible();
  await expect(page.locator(".ya-widget-notice")).toContainText("istek sınırına ulaştı");
  await expect(page.locator(".ya-widget-notice")).toContainText("provider_rate_limited (HTTP 429)");

  // The same identity rule holds for forms at the narrow responsive limit.
  await page.locator('[data-ya-view="home"]').click();
  await page.locator('[data-ya-request-type="restaurant_reservation"]').click();
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(page.locator(".ya-widget-header img.ya-widget-mark")).toHaveCount(0);
  await expect(page.locator(".ya-widget-header svg[data-nexa-rig]")).toHaveCount(1);
  await expect(page.locator(".ya-widget-nexa")).toHaveCount(1);
  await expect(page.locator(".ya-widget-panel")).toBeInViewport();
  await expect.poll(() => page.locator(".ya-widget-panel").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.locator('[data-ya-open-date-picker="start_date"]').click();
  await page.locator('[data-ya-calendar-shortcut="tomorrow"]').click();
  await page.locator('[data-ya-open-time-picker]').click();
  await page.locator('[data-ya-time-hour="20"]').click();
  await page.locator('[data-ya-time-minute="30"]').click();
  await page.locator(".ya-widget-form input[name=customer_phone]").fill("+44 7911 123456");
  await page.locator(".ya-widget-form input[name=customer_name]").fill("Test Misafir");
  await expect(page.locator(".ya-widget-form input[name=customer_name]")).toHaveValue("Test Misafir");
  mkdirSync("artifacts/nexa-integration", { recursive: true });
  for (const colorScheme of ["light", "dark"]) {
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme });
    await page.screenshot({ path: `artifacts/nexa-integration/web-form-small-${colorScheme}.png` });
  }
  let releaseRequest;
  await page.route("https://demo.test/yardimci-asistan/api/request.php", async route => {
    expect(route.request().postDataJSON()).toMatchObject({ request_type: "restaurant_reservation", customer_name: "Test Misafir" });
    await new Promise(done => { releaseRequest = done; });
    await route.fulfill({ contentType: "application/json", body: '{"ok":true,"request_id":"smoke-confirmed"}' });
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator('.ya-widget-form button[type="submit"]').click();
  const root = page.locator("#yardimci-asistan-widget");
  const rig = page.locator('.ya-widget-header svg[data-nexa-rig]');
  await expect(root).toHaveAttribute("data-nexa-state", "thinking");
  await expect(rig).toHaveAttribute("data-expression", "thinking");
  await expect.poll(() => typeof releaseRequest).toBe("function");
  releaseRequest();
  await expect(root).toHaveAttribute("data-nexa-state", "pleased");
  await expect(rig).toHaveAttribute("data-expression", "success");
  await expect(page.locator('.ya-widget-request-success')).toBeVisible();
  await expect(root).toHaveAttribute("data-nexa-state", "ready");
  await expect(page.locator('.ya-widget-header .ya-widget-mark')).toHaveCount(0);
  await page.getByRole("button", { name: "Asistanı kapat" }).click();
  await expect(page.locator('.ya-widget-button svg[data-nexa-rig]')).toHaveAttribute("data-motion-active", "false");
  console.log("web-widget-branding-smoke-ok");
} finally {
  await browser.close();
}
