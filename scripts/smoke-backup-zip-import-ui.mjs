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
  page.setDefaultTimeout(9000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/zip-import-ui-fixture*", async route =>
    route.fulfill({
      contentType: "text/html",
      body: await server.transformIndexHtml("/zip-import-ui-fixture",
        '<html><body><div id="root"></div><script type="module" src="/@fs/' +
        resolve("scripts/fixtures/settings-platform.tsx") + '"></script></body></html>')
    }));
  await page.goto(server.resolvedUrls.local[0] + "zip-import-ui-fixture");
  await page.getByRole("button", { name: "Veriler", exact: true }).click();
  const panel = page.locator(".settings-data-maintenance-section");
  await expect(panel.getByText("Henüz kayıtlı yedek yok.")).toBeVisible();
  await page.evaluate(() => {
    window.yardimciDesktop.importLocalBackupZip = async () => ({
      ok: true, message: "ZIP yedeği içe aktarıldı.",
      backup: {
        id: "yardimci-asistan-demo-test", createdAt: "2026-11-03T13:50:00Z",
        kind: "manual", folderName: "yardimci-asistan-demo-test", folderPath: "/tmp/fake",
        databaseFileName: "yardimci-asistan.sqlite", imageCount: 0, assetFileCount: 21, sizeBytes: 1234
      },
      backups: [{
        id: "yardimci-asistan-demo-test", createdAt: "2026-11-03T13:50:00Z",
        kind: "manual", folderName: "yardimci-asistan-demo-test", folderPath: "/tmp/fake",
        databaseFileName: "yardimci-asistan.sqlite", imageCount: 0, assetFileCount: 21, sizeBytes: 1234
      }]
    });
  });
  await panel.getByRole("button", { name: "ZIP İçe Aktar" }).click();
  await expect(panel.locator(".backup-row")).toHaveCount(1);
  await expect(panel.getByText("1 yedek")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Geri Yükle" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "ZIP İçe Aktar" })).toBeEnabled();
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("smoke-backup-zip-import-ui-ok: ZIP button visible and imported package listed for explicit restore");
} finally {
  await browser?.close();
  await server.close();
}
