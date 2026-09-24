import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { resolve } from "node:path";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { createCompactUiFixture } from "./lib/desktop-renderer-fixtures.mjs";

const dashboard = createCompactUiFixture();
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.route("**/calendar-workspace-test*", async (route) => {
    const html = await server.transformIndexHtml(
      "/calendar-workspace-test",
      `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/calendar-workspace.tsx")}"></script></body></html>`
    );
    await route.fulfill({ contentType: "text/html", body: html });
  });

  await page.addInitScript(({ dashboard }) => {
    window.__m8gInitial = { dashboard };
    window.__m8gActions = [];
  }, { dashboard });

  await page.goto(`${baseUrl}calendar-workspace-test`);
  await expect(page.locator(".operation-calendar-page")).toBeVisible();

  // Select a real fixture day and verify the calendar projection.
  await page.getByRole("button", { name: "Gün", exact: true }).click();
  const dateInput = page.getByLabel("Tarih", { exact: true });
  await dateInput.fill("2026-07-18");
  await expect(dateInput).toHaveValue("2026-07-18");
  await expect(page.locator(".operation-calendar-grid")).toHaveClass(/is-day/);
  await expect(page.locator(".operation-calendar-day")).toHaveCount(1);
  await expect(page.locator(".operation-calendar-item")).not.toHaveCount(0);

  // Calendar items remain launchers/canonical-operation callbacks.
  const reservationAction = page.locator(".operation-calendar-item").filter({ has: page.getByRole("button", { name: "Aç", exact: true }) }).first();
  await reservationAction.getByRole("button", { name: "Aç", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__m8gActions.some((item) => item.kind === "reservation"))).toBe(true);

  const taskAction = page.locator(".operation-calendar-item.item-task").filter({ has: page.getByRole("button", { name: "Tamamla", exact: true }) }).first();
  if (await taskAction.count()) {
    await taskAction.getByRole("button", { name: "Tamamla", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__m8gActions.some((item) => item.kind === "task"))).toBe(true);
  }

  // Presentation unmount/remount must not reset the user's Calendar context.
  await page.getByRole("button", { name: "Takvimi Gizle", exact: true }).click();
  await expect(page.getByTestId("outside-calendar")).toBeVisible();
  await page.getByRole("button", { name: "Takvimi Göster", exact: true }).click();
  await expect(page.locator(".operation-calendar-page")).toBeVisible();
  await expect(page.getByLabel("Tarih", { exact: true })).toHaveValue("2026-07-18");
  await expect(page.getByRole("button", { name: "Gün", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".operation-calendar-grid")).toHaveClass(/is-day/);

  expect(pageErrors).toEqual([]);
  console.log("calendar-workspace-smoke-ok");
} finally {
  await browser?.close();
  await server.close();
}
