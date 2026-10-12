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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(8000);
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/ig-oauth-settings-fixture*", async route => route.fulfill({
    contentType: "text/html",
    body: await server.transformIndexHtml("/ig-oauth-settings-fixture",
      `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/instagram-oauth-settings.tsx")}"></script></body></html>`)
  }));
  await page.goto(`${server.resolvedUrls.local[0]}ig-oauth-settings-fixture`);
  const section = page.getByRole("region", {name:"Instagram"});
  await expect(section).toBeVisible();
  await expect(section).toContainText("Bağlı değil");
  await expect(page.getByRole("textbox", {name:"Instagram User ID"})).toHaveCount(0);
  await expect(page.getByRole("textbox", {name:"Instagram Access Token"})).toHaveCount(0);
  await section.getByRole("button", {name:"Instagram ile bağlan"}).click();
  await expect(section).toContainText("Instagram girişini tarayıcıda tamamlayın");
  assert.equal(await page.evaluate(() => window.__igSettingsState.beginCount),1);
  await page.evaluate(() => {window.__igSettingsState.stage = "complete";});
  await expect(section).toContainText("@ornek_hesap", {timeout: 9000});
  await section.getByRole("button", {name:"Bağlantıyı test et"}).click();
  await expect(section).toContainText("Instagram bağlantısı doğrulandı");
  await section.getByRole("button", {name:"Bağlantıyı kes",exact:true}).click();
  await expect(section).toContainText("Bağlantıyı keserseniz");
  assert.equal(await page.evaluate(() => window.__igSettingsState.disconnectCount),0);
  await section.getByRole("button", {name:"Bağlantıyı kesmeyi onayla"}).click();
  await expect(section).toContainText("Bağlı değil");
  assert.equal(await page.evaluate(() => window.__igSettingsState.disconnectCount),1);
  assert.deepEqual(errors, []);
  console.log("instagram-oauth-settings-ui-ok: no manual fields, connect, one-time poll, verified account, double-confirm disconnect");
} finally {
  await browser?.close();
  await server?.close();
}
