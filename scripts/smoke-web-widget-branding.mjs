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
      logoUrl: "/assets/yardimci-asistan-symbol.png"
    });
  });

  await expect(page.locator(".ya-widget-button img.ya-widget-mark")).toHaveAttribute("src", "/assets/yardimci-asistan-symbol.png");
  await page.getByRole("button", { name: "Yardımcı Asistan'ı aç" }).click();
  await expect(page.locator(".ya-widget-header img.ya-widget-mark")).toHaveAttribute("src", "/assets/yardimci-asistan-symbol.png");
  await expect(page.locator(".ya-widget-header strong")).toHaveText("Logo Firma");

  console.log("web-widget-branding-smoke-ok");
} finally {
  await browser.close();
}
