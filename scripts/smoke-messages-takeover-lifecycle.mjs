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
const baseUrl = server.resolvedUrls.local[0];
let browser;

try {
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.route("**/messages-takeover-lifecycle-test*", async (route) => {
    const html = await server.transformIndexHtml(
      "/messages-takeover-lifecycle-test",
      `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/messages-takeover-lifecycle.tsx")}"></script></body></html>`
    );
    await route.fulfill({ contentType: "text/html", body: html });
  });

  await page.addInitScript(() => {
    window.__m8eTakeoverCalls = 0;
    window.__m8eActivity = [];
    window.yardimciDesktop = {
      setWhatsAppUserActivity: (active) => {
        window.__m8eActivity.push(active === true);
      },
      takeoverWhatsAppWebview: async () => {
        window.__m8eTakeoverCalls += 1;
        if (window.__m8eTakeoverCalls === 1) {
          return { ok: false, message: "WhatsApp Web henüz hazır değil." };
        }
        return { ok: true, message: "WhatsApp Web kullanıcı kontrolüne hazır." };
      }
    };
  });

  await page.goto(`${baseUrl}messages-takeover-lifecycle-test`);
  await expect(page.getByTestId("web-surface")).toHaveCount(1);
  await expect(page.getByTestId("web-surface")).toBeHidden();

  await page.getByRole("tab", { name: "WhatsApp", exact: true }).click();
  await expect(page.getByTestId("web-surface")).toBeVisible();
  await expect(page.getByText("WhatsApp Web kullanıcı kontrolüne hazırlanıyor...", { exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__m8eTakeoverCalls)).toBe(1);

  // Leave while the failed takeover is sleeping before retry. A stale loop must not call main again.
  await page.getByRole("tab", { name: "Hazır Mesaj", exact: true }).click();
  await page.waitForTimeout(180);
  expect(await page.evaluate(() => window.__m8eTakeoverCalls)).toBe(1);
  expect(await page.evaluate(() => window.__m8eActivity.at(-1))).toBe(false);
  await expect(page.getByTestId("web-surface")).toBeHidden();

  // A fresh Web entry is visible immediately; takeover remains background coordination only.
  await page.getByRole("tab", { name: "WhatsApp", exact: true }).click();
  await expect(page.getByTestId("web-surface")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__m8eTakeoverCalls)).toBe(2);

  // Navigation away releases userBusy without unmounting the warmed web surface.
  await page.evaluate(() => window.__m8eTakeoverSetActive(false));
  await expect(page.getByTestId("web-surface")).toHaveCount(1);
  await expect(page.getByTestId("web-surface")).toBeVisible();
  expect(await page.evaluate(() => window.__m8eActivity.at(-1))).toBe(false);

  expect(pageErrors).toEqual([]);
  console.log("messages-takeover-lifecycle-smoke-ok");
} finally {
  await browser?.close();
  await server.close();
}
