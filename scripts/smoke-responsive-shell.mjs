import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
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
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 }, locale: "tr-TR" });
  page.setDefaultTimeout(12000);
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.route("**/responsive-shell-test", async route => route.fulfill({
    contentType: "text/html",
    body: await server.transformIndexHtml("/responsive-shell-test",
      `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/responsive-shell.tsx")}"></script></body></html>`)
  }));
  await page.goto(server.resolvedUrls.local[0] + "responsive-shell-test");

  for (const [scheme, density, scale] of [
    ["light", "comfortable", 1], ["dark", "compact", 1], ["light", "comfortable", 1.15]
  ]) {
    await page.evaluate(values => window.setAppearance(...values), [scheme, density, scale]);
    for (const width of [1440, 1100, 1000, 900, 760, 700, 600]) {
      await page.setViewportSize({ width, height: 650 });
      const geometry = await page.locator(".page-header").evaluate(header => {
        const frame = header.querySelector(".page-header__message-frame").getBoundingClientRect();
        const tools = header.querySelector(".page-header__actions").getBoundingClientRect();
        const title = header.querySelector(".page-header-copy").getBoundingClientRect();
        const h = header.getBoundingClientRect();
        const buttons = Array.from(header.querySelectorAll("button.topbar-control"), b => b.getBoundingClientRect());
        return {
          sameRow: Math.abs(frame.top - tools.top) < 22,
          expectedRow: window.innerWidth > 980,
          frame, tools, title, h,
          buttonsFit: buttons.every(b => b.left >= h.left - 1 && b.right <= h.right + 1),
          noHeaderOverflow: header.scrollWidth <= header.clientWidth + 1,
          messageVisible: frame.width >= 44
        };
      });
      assert.equal(geometry.sameRow, geometry.expectedRow, `${scheme}/${density}/${scale}/${width}: header row`);
      assert.ok(geometry.buttonsFit && geometry.noHeaderOverflow && geometry.messageVisible,
        `${scheme}/${density}/${scale}/${width}: ${JSON.stringify(geometry)}`);
    }
  }
  await page.evaluate(() => window.setAppearance("light", "comfortable", 1));
  for (const [label, name] of [
    ["Galeriyi aç", "Galeri Yönetimi"],
    ["Oda yönetimini aç", "Oda Yönetimi"],
    ["Oda detayını aç", "Oda bilgilerini düzenle"],
    ["Onayı aç", "Onay"]
  ]) {
    for (const [width, height] of [[1100, 650], [900, 500], [700, 430]]) {
      await page.setViewportSize({ width, height });
      await page.getByRole("button", { name: label }).click();
      const dialog = page.getByRole("dialog", { name });
      await expect(dialog).toBeVisible();
      const result = await dialog.evaluate(node => {
        const h = document.querySelector(".page-header").getBoundingClientRect();
        const rect = node.getBoundingClientRect();
        return { dialogTop: rect.top, dialogBottom: rect.bottom, headerBottom: h.bottom, viewportHeight: innerHeight };
      });
      assert.ok(result.dialogTop >= result.headerBottom - 1, `${label}/${width}x${height} overlaps topbar: ${JSON.stringify(result)}`);
      assert.ok(result.dialogBottom <= result.viewportHeight + 1, `${label}/${width}x${height} clips bottom: ${JSON.stringify(result)}`);
      await dialog.getByRole("button", { name: "Kapat", exact: true }).click();
    }
  }
  assert.deepEqual(pageErrors, []);
  console.log("responsive-shell-smoke-ok: header rows, action targets, color/density/scale, four modal classes and short viewports");
} finally {
  await browser?.close();
  await server.close();
}
