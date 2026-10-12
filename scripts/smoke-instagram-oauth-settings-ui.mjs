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
    logLevel: "error", server: { host: "127.0.0.1", port: 0, strictPort: false }
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
  const section=page.getByRole("region",{name:"Instagram"});
  const toggle=section.getByRole("checkbox",{name:"Instagram servisi"});
  const save=page.getByRole("button",{name:"Kaydet",exact:true});
  const revert=page.getByRole("button",{name:"Değişiklikleri Geri Al"});
  await expect(section).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await expect(section.locator("fieldset")).toHaveCount(0);
  await expect(save).toBeDisabled();
  await expect(revert).toBeDisabled();
  await toggle.check();
  await expect(toggle).toBeChecked();
  await expect(section.getByRole("button",{name:"Instagram ile bağlan"})).toBeVisible();
  assert.equal(await page.evaluate(()=>window.__igSettingsState.beginCount),0,"toggle must not launch OAuth");
  await expect(save).toBeEnabled();
  await revert.click();
  await expect(toggle).not.toBeChecked();
  await expect(section.locator("fieldset")).toHaveCount(0);
  await expect(save).toBeDisabled();
  await toggle.check();
  await save.click();
  await expect(page.getByRole("status")).toContainText("bağlantıyı başarıyla test edin");
  assert.equal(await page.evaluate(()=>window.__igSettingsState.savedEnabled),false);
  await section.getByRole("button",{name:"Instagram ile bağlan"}).click();
  await expect(section).toContainText("Instagram girişini tarayıcıda tamamlayın");
  assert.equal(await page.evaluate(()=>window.__igSettingsState.beginCount),1);
  await page.evaluate(()=>{window.__igSettingsState.stage="denied";});
  await expect(section).toContainText("Giriş tamamlanamadı.",{timeout:9000});
  await expect(toggle).toBeChecked();
  await expect(save).toBeEnabled();
  await save.click();
  assert.equal(await page.evaluate(()=>window.__igSettingsState.savedEnabled),false);
  await section.getByRole("button",{name:"Instagram ile bağlan"}).click();
  assert.equal(await page.evaluate(()=>window.__igSettingsState.beginCount),2);
  await page.evaluate(()=>{window.__igSettingsState.stage="complete";});
  await expect(section).toContainText("@ornek_hesap",{timeout:9000});
  assert.equal(await page.evaluate(()=>window.__igSettingsState.savedEnabled),false,"OAuth alone must not commit desired enable state");
  await expect(section).toContainText("Paylaşım izni etkin");
  await section.getByRole("button",{name:"Bağlantıyı test et"}).click();
  await expect(section).toContainText("Instagram bağlantısı doğrulandı");
  await save.click();
  await expect(page.getByText("Servisler kaydedildi.",{exact:true})).toBeVisible();
  assert.equal(await page.evaluate(()=>window.__igSettingsState.savedEnabled),true);
  await expect(save).toBeDisabled();
  await toggle.uncheck();
  await expect(section.locator("fieldset")).toHaveCount(0);
  assert.equal(await page.evaluate(()=>window.__igSettingsState.savedEnabled),true,"off must remain staged");
  await revert.click();
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await save.click();
  assert.equal(await page.evaluate(()=>window.__igSettingsState.savedEnabled),false);
  await toggle.check();
  assert.equal(await page.evaluate(()=>window.__igSettingsState.beginCount),2,"resuming linked account must not start OAuth");
  await save.click();
  assert.equal(await page.evaluate(()=>window.__igSettingsState.savedEnabled),true);
  await section.getByRole("button",{name:"Bağlantıyı kes",exact:true}).click();
  await expect(section).toContainText("Bağlantıyı keserseniz");
  assert.equal(await page.evaluate(()=>window.__igSettingsState.disconnectCount),0);
  await section.getByRole("button",{name:"Bağlantıyı kesmeyi onayla"}).click();
  await expect(toggle).not.toBeChecked();
  assert.equal(await page.evaluate(()=>window.__igSettingsState.disconnectCount),1);
  assert.deepEqual(errors,[]);
  console.log("instagram-oauth-settings-ui-ok: draft toggle, save/revert, test gate, OAuth separate, no auto-login, disconnect");
} finally {
  await browser?.close();
  await server?.close();
}
