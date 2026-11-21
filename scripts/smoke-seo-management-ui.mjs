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
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/seo-management-test*", async route => route.fulfill({
    contentType: "text/html",
    body: await server.transformIndexHtml("/seo-management-test",
      '<html><body><div id="root"></div><script type="module" src="/@fs/' +
        resolve("scripts/fixtures/seo-management.tsx") + '"></script></body></html>')
  }));
  await page.goto(server.resolvedUrls.local[0] + "seo-management-test");
  const dialog = page.getByRole("dialog", { name: "SEO Yönetimi" });
  await expect(dialog).toBeVisible();
  if (process.argv.includes("--screenshot")) await page.screenshot({ path: "/tmp/seo-management-review.png" });
  if (process.argv.includes("--dark-screenshot")) {
    await page.evaluate(() => { document.documentElement.dataset.colorScheme = "dark"; });
    await page.waitForTimeout(300); // Screenshot after the appearance transition.
    await page.screenshot({ path: "/tmp/seo-management-dark-review.png" });
  }
  await expect(dialog.getByRole("navigation", { name: "SEO sayfaları" }).getByRole("button")).toHaveCount(3);
  await expect(dialog.getByRole("complementary", { name: "SEO önizleme ve yayın kuralları" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Kaydet", exact: true })).toBeDisabled();
  const title = dialog.getByRole("textbox", { name: /Sayfa başlığı/ });
  await title.fill("Yeni arama başlığım");
  await expect(dialog.locator(".seo-management__search-preview strong")).toHaveText("Yeni arama başlığım");
  await expect(dialog.getByRole("button", { name: "SEO Yönetimini kapat" })).toBeDisabled();
  await expect(dialog.getByRole("navigation").getByRole("button", { name: /Odalar/ })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Değişiklikleri geri al" }).click();
  await expect(title).toHaveValue("Örnek İşletme");

  await dialog.getByRole("navigation").getByRole("button", { name: /Odalar/ }).click();
  await expect(dialog.getByRole("heading", { name: "Odalar", exact: true })).toBeVisible();
  await title.fill("Yeni oda sayfası başlığı");
  await dialog.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Kaydet", exact: true })).toBeDisabled();
  await expect(title).toHaveValue("Yeni oda sayfası başlığı");
  const sourceCalls = await page.evaluate(() => window.__seoCalls.filter(item => item.kind === "source"));
  expect(sourceCalls).toHaveLength(1);
  expect(sourceCalls[0].fields.title).toBe("Yeni oda sayfası başlığı");

  await dialog.getByRole("navigation").getByRole("button", { name: /Ana Sayfa/ }).click();
  await dialog.getByRole("combobox", { name: /Yayın dili/ }).selectOption("en");
  await expect(title).toHaveValue("Example Business");
  await expect(dialog.locator(".seo-management__source-status")).toContainText("alan güncel değil");
  await expect(dialog.locator(".seo-management__social-preview")).toContainText("Social headline");
  await dialog.getByRole("button", { name: /AI önerisi oluştur/ }).click();
  await expect(dialog.getByRole("region", { name: "AI SEO önerisi" })).toContainText("AI başlık önerisi");
  await expect(title).toHaveValue("Example Business");
  await dialog.getByRole("button", { name: "Taslağa uygula" }).click();
  await expect(title).toHaveValue("AI başlık önerisi");
  await expect(dialog.getByRole("button", { name: "Kaydet", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Kaydet", exact: true })).toBeDisabled();
  const translationCalls = await page.evaluate(() => window.__seoCalls.filter(item => item.kind === "translation"));
  expect(translationCalls).toHaveLength(1);

  for (const width of [1440, 960, 600]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(dialog).toBeVisible();
    const layout = await dialog.evaluate(element => {
      const dialogBox = element.getBoundingClientRect();
      const nav = element.querySelector(".seo-management__pages").getBoundingClientRect();
      const editor = element.querySelector(".seo-management__editor").getBoundingClientRect();
      const preview = element.querySelector(".seo-management__preview").getBoundingClientRect();
      return { dialogBox: { left: dialogBox.left, right: dialogBox.right },
        nav: { x: nav.x, y: nav.y }, editor: { x: editor.x, y: editor.y },
        preview: { x: preview.x, y: preview.y } };
    });
    expect(layout.dialogBox.left).toBeGreaterThanOrEqual(-1);
    expect(layout.dialogBox.right).toBeLessThanOrEqual(width + 1);
    if (width === 1440) {
      expect(layout.nav.x).toBeLessThan(layout.editor.x);
      expect(layout.editor.x).toBeLessThan(layout.preview.x);
    } else {
      expect(layout.preview.y).toBeGreaterThan(layout.editor.y);
    }
  }
  await dialog.getByRole("button", { name: "SEO Yönetimini kapat" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "SEO Yönetimini aç" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: /Sayfa başlığı/ })).toHaveValue("Örnek İşletme");
  expect(errors).toEqual([]);
  console.log("SEO UI smoke: sayfa/dil seçimi, önizleme, kirli kapanış, geri al, kaynak/çeviri kaydı, AI taslak ve üç ekran genişliği geçti.");
} finally {
  await browser?.close();
  await server.close();
}
