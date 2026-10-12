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
  await expect(section).toContainText("Kapalı");
  const activeToggle=section.getByRole("checkbox", {name:"Instagram servisi"});
  await expect(activeToggle).not.toBeChecked();
  await expect(activeToggle).toBeEnabled();
  await expect(section.locator("fieldset")).toHaveCount(0);
  await expect(section.getByRole("button", {name:"Instagram ile bağlan"})).toHaveCount(0);
  await expect(page.getByRole("textbox", {name:"Instagram User ID"})).toHaveCount(0);
  await expect(page.getByRole("textbox", {name:"Instagram Access Token"})).toHaveCount(0);
  await activeToggle.click();
  await expect(section.locator("fieldset")).toBeVisible();
  await expect(activeToggle).not.toBeChecked();
  await expect(section).toContainText("Instagram girişini tarayıcıda tamamlayın");
  assert.equal(await page.evaluate(() => window.__igSettingsState.beginCount),1);
  assert.equal(await page.evaluate(() => window.__igSettingsState.toggleCount),0,"unauthorized attempt must not enable the provider");
  await page.evaluate(() => {window.__igSettingsState.stage = "denied";});
  await expect(section).toContainText("Giriş tamamlanamadı.", {timeout:9000});
  await expect(activeToggle).not.toBeChecked();
  await expect(section.getByRole("button", {name:"Instagram ile bağlan"})).toBeVisible();
  await section.getByRole("button", {name:"Instagram ile bağlan"}).click();
  assert.equal(await page.evaluate(() => window.__igSettingsState.beginCount),2,"retry requires explicit user action");
  await page.evaluate(() => {window.__igSettingsState.stage = "complete";});
  await expect(section).toContainText("@ornek_hesap", {timeout: 9000});
  await expect(section).toContainText("Paylaşım izni etkin");
  await expect(activeToggle).toBeChecked();
  await activeToggle.uncheck();
  await expect(activeToggle).not.toBeChecked();
  await expect(section).toContainText("Kapalı");
  await expect(section).not.toContainText("Paylaşımlar duraklatıldı");
  await expect(section.locator("fieldset")).toHaveCount(0);
  await expect(section.getByRole("button", {name:"Hesabı yeniden bağla"})).toHaveCount(0);
  await expect(section.getByRole("button", {name:"Bağlantıyı test et"})).toHaveCount(0);
  await activeToggle.check();
  await expect(activeToggle).toBeChecked();
  await expect(section.locator("fieldset")).toBeVisible();
  await expect(section).toContainText("Paylaşım izni etkin");
  assert.equal(await page.evaluate(() => window.__igSettingsState.toggleCount),2);
  await expect(section).not.toContainText("Instagram Business veya Creator hesabınızı");
  await expect(section).not.toContainText("Instagram @ornek_hesap bağlandı.");
  await expect(section).not.toContainText("Görsel yayınlamak için HTTPS Web Modülü");
  await section.getByRole("button", {name:"Bağlantıyı test et"}).click();
  await expect(section).toContainText("Instagram bağlantısı doğrulandı");
  await section.getByRole("button", {name:"Bağlantıyı kes",exact:true}).click();
  await expect(section).toContainText("Bağlantıyı keserseniz");
  assert.equal(await page.evaluate(() => window.__igSettingsState.disconnectCount),0);
  await section.getByRole("button", {name:"Bağlantıyı kesmeyi onayla"}).click();
  await expect(section).toContainText("Kapalı");
  await expect(activeToggle).not.toBeChecked();
  await expect(activeToggle).toBeEnabled();
  await expect(section.locator("fieldset")).toHaveCount(0);
  await expect(section.getByRole("button", {name:"Instagram ile bağlan"})).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.__igSettingsState.disconnectCount),1);
  assert.deepEqual(errors, []);
  console.log("instagram-oauth-settings-ui-ok: collapsed-off, clickable toggle, require login, verified account, pause/resume, double-confirm disconnect");
} finally {
  await browser?.close();
  await server?.close();
}
