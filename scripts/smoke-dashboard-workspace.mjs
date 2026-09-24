import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { resolve } from "node:path";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { createDashboardConversionFixture, createSetupFixture } from "./lib/desktop-renderer-fixtures.mjs";

const source = createDashboardConversionFixture();
const dashboard = {
  ...source,
  summary: {
    ...source.summary,
    waitingRequests: 1,
    pendingDailyTasks: source.dailyTasks.filter((task) => task.status === "pending").length,
    pendingReservations: source.reservations.filter((reservation) => reservation.status === "pending").length,
    availableRooms: 1,
    totalRooms: source.rooms.length,
    availableTables: source.tables.filter((table) => table.status === "available").length,
    preparedWhatsAppMessages: 1
  }
};
const setup = {
  ...createSetupFixture(),
  setupRequired: false,
  appPasswordConfigured: true,
  autoSyncEnabled: true,
  aiEnabled: true,
  aiApiKeyConfigured: true
};
const syncStatus = {
  enabled: true,
  clientId: "dashboard-workspace-smoke",
  requestCursor: 2,
  acknowledgedCursor: 2,
  lastAttemptAt: "2026-09-24T09:55:00+03:00",
  lastSuccessAt: "2026-09-24T09:50:00+03:00",
  lastError: "",
  consecutiveFailures: 0,
  pendingJobs: 0,
  nextRetryAt: "",
  phase: "idle",
  message: "Otomatik eşitleme hazır."
};

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

  await page.route("**/dashboard-workspace-test*", async (route) => {
    const html = await server.transformIndexHtml(
      "/dashboard-workspace-test",
      `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/dashboard-workspace.tsx")}"></script></body></html>`
    );
    await route.fulfill({ contentType: "text/html", body: html });
  });

  await page.addInitScript(({ dashboard, setup, syncStatus }) => {
    window.__m8fInitial = { dashboard, setup, syncStatus };
    window.__m8fActions = [];
    delete window.yardimciDesktop;
  }, { dashboard, setup, syncStatus });

  await page.goto(`${baseUrl}dashboard-workspace-test`);

  // Dashboard and health are projections: supplied controller state is enough; no preload bridge is required.
  await expect(page.locator(".dashboard-page")).toBeVisible();
  await expect(page.locator(".system-health-panel")).toBeVisible();
  await expect(page.locator(".system-health-item")).toHaveCount(5);
  await expect(page.locator(".system-health-item").filter({ hasText: "Web bağlantısı" })).toContainText("Hazır");
  await expect(page.locator(".system-health-item").filter({ hasText: "AI" })).toContainText("Hazır");
  await expect(page.locator(".system-health-item").filter({ hasText: "Uygulama kilidi" })).toContainText("Etkin");

  // System-health sync delegates to the app-level operation rather than starting its own IPC lifecycle.
  await page.getByRole("button", { name: "Şimdi eşitle", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__m8fActions.filter((item) => item.kind === "sync").length)).toBe(1);
  await expect(page.getByRole("button", { name: "Şimdi eşitle", exact: true })).toBeEnabled();

  // Dashboard actions remain launchers/canonical operation callbacks.
  const requestRow = page.locator(".dashboard-priority-item.priority-request").first();
  await requestRow.getByRole("button", { name: /talebini yanıtla$/ }).click();
  await expect.poll(() => page.evaluate(() => window.__m8fActions.some((item) => item.kind === "reply"))).toBe(true);

  const taskRow = page.locator(".dashboard-priority-item.priority-task").first();
  await taskRow.getByRole("button", { name: /işini tamamla$/ }).click();
  await expect.poll(() => page.evaluate(() => window.__m8fActions.some((item) => item.kind === "task-complete"))).toBe(true);

  const reservationRow = page.locator(".dashboard-priority-item.priority-reservation").first();
  await reservationRow.getByRole("button", { name: /rezervasyonunu incele$/ }).click();
  await expect.poll(() => page.evaluate(() => window.__m8fActions.some((item) => item.kind === "reservation"))).toBe(true);

  await page.getByRole("button", { name: "Tüm talepler", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__m8fActions.some((item) => item.kind === "customer-work"))).toBe(true);

  await page.getByRole("button", { name: "Günü değerlendir", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__m8fActions.some((item) => item.kind === "daily-ai"))).toBe(true);

  expect(pageErrors).toEqual([]);
  console.log("dashboard-workspace-smoke-ok");
} finally {
  await browser?.close();
  await server.close();
}
