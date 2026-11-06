import { expandSettingsStructure } from "./test-helpers/settings-ui.mjs";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { resolve } from "node:path";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";

// Reproduce a Teknikel backup restored before any web secret was saved.
const server = await createServer({
  root: resolve("apps/desktop-app"),
  configFile: resolve("apps/desktop-app/vite.renderer.config.ts"),
  server: { port: 0, strictPort: false }, logLevel: "error"
});
let browser;
try {
  await server.listen();
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "tr-TR" });
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/shipping-repair-test*", async route => route.fulfill({
    contentType: "text/html",
    body: await server.transformIndexHtml("/shipping-repair-test",
      '<html><body><div id="root"></div><script type="module" src="/@fs/' +
      resolve("scripts/fixtures/settings-platform.tsx") + '"></script></body></html>')
  }));
  await page.route(/^https:\/\/(?:[^/]+\.)?tile\.openstreetmap\.org\//, route => route.abort());
  await page.goto(server.resolvedUrls.local[0] + "shipping-repair-test?profile=market&wholesale=on&web=off");
  await expandSettingsStructure(page);
  const card = page.locator("#settings-online-delivery");
  await expect(card).toHaveCount(0);
  await page.evaluate(() => window.refreshSettings({
    onlineSalesDeliveryEnabled: true,
    onlineSalesDelivery: { pickupEnabled: true, shippingEnabled: true }
  }));
  await expect(card).toBeVisible();
  await expect(page.locator("#settings-dealer-portal")).toHaveCount(0);
  await card.click();
  const dialog = page.getByRole("dialog", { name: "Teslimat ve Gönderim" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Kargo ile gönderim", { exact: true }).uncheck();
  await expect(dialog).toBeVisible(); // Keep editor mounted until Save.
  await dialog.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.persistedSettings().onlineSalesDelivery.shippingEnabled)).toBe(false);
  await expect(card).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.persistedSettings().webModuleUrl), "");
  assert.deepEqual(errors, []);
  console.log("teknikel-shipping-repair-ui-ok: offline card reachable, shipping disabled and saved, other web services hidden");
} finally {
  await browser?.close();
  await server.close();
}
