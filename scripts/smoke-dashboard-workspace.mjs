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
  webModuleUrl: "https://dashboard.test/module",
  syncSecret: "dashboard-workspace-secret",
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
    if (location.search.includes("crowded")) {
      dashboard.attention = {
        ...dashboard.attention,
        items: Array.from({ length: 24 }, (_, index) => ({
          kind: "low_stock", title: `Stok uyarısı ${index + 1}`,
          detail: index === 23 ? "Son süreç notu korunuyor." : "Sayım bekliyor."
        }))
      };
    }
    window.__m8fActions = [];
    window.__m8fTrafficCalls = [];
    window.yardimciDesktop = {
      getSiteTrafficSnapshot: async (days, fresh = false) => {
        window.__m8fTrafficCalls.push({ days, fresh });
        return { ok: true, stale: false, fetchedAt: "2026-11-02T15:00:00+03:00", value: {
          enabled: true, has_data: true, days,
          totals: { sessions: 22, views: 48, intents: 3 },
          daily: [{ date: "2026-11-02", sessions: 22, views: 48, intents: 3 }],
          top_pages: [{ page: "catalog:part-1", count: 15 }],
          sources: [{ source: "search", count: 17 }],
          conversions: { requests: 1, orders: 2 },
          last_collected_at: "2026-11-02T15:00:00+03:00"
        } };
      }
    };
  }, { dashboard, setup, syncStatus });

  await page.goto(`${baseUrl}dashboard-workspace-test`);

  // Dashboard and health are projections: supplied controller state is enough; no preload bridge is required.
  await expect(page.locator(".dashboard-page")).toBeVisible();
  await expect(page.locator(".system-health-panel")).toBeVisible();
  const trafficButton = page.getByRole("button", { name: /Site trafiği/ });
  await expect(trafficButton).toBeVisible();
  await expect(trafficButton).toContainText("22 bugün");
  await trafficButton.hover();
  const trafficDialog = page.getByRole("dialog", { name: "Site trafiği ayrıntıları" });
  await expect(trafficDialog).toBeVisible();
  await expect(trafficDialog).toContainText("Onaylı web siparişi");
  await expect(trafficDialog).toContainText("Katalog · part-1");
  await trafficDialog.getByRole("button", { name: "30 gün" }).click();
  await expect.poll(() => page.evaluate(() => window.__m8fTrafficCalls.some(call => call.days === 30))).toBe(true);
  await trafficDialog.getByRole("button", { name: "Raporu yenile" }).click();
  await expect.poll(() => page.evaluate(() => window.__m8fTrafficCalls.some(call => call.days === 30 && call.fresh))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trafficDialog).toHaveCount(0);
  await expect(page.locator(".system-health-item")).toHaveCount(6);
  await expect(page.locator(".system-health-item").filter({ hasText: "Web bağlantısı" })).toContainText("Web eşitlemeye hazır");
  await expect(page.locator(".system-health-item").filter({ hasText: "Ağ sinyali" })).toContainText("İnternet ve servis erişimi doğrulanmadı");
  await expect(page.locator(".system-health-item").filter({ hasText: "AI" })).toContainText("Yapılandırıldı");
  await expect(page.locator(".system-health-item").filter({ hasText: "Uygulama kilidi" })).toContainText("Etkin");

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

  // A crowded side pane must keep the final process note and its launchers reachable.
  for (const scheme of ["light", "dark"]) {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`${baseUrl}dashboard-workspace-test?crowded`);
    await page.evaluate(scheme => {
      document.documentElement.dataset.colorScheme = scheme;
      document.documentElement.dataset.density = "compact";
    }, scheme);
    const priorityScroll = await page.locator(".dashboard-priority-list").evaluate(el => el.scrollTop);
    const finalNote = page.getByText("Son süreç notu korunuyor.", { exact: true });
    await finalNote.scrollIntoViewIfNeeded();
    await expect(finalNote).toBeInViewport();
    await page.getByRole("button", { name: "Günü değerlendir", exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Günü değerlendir", exact: true })).toBeInViewport();
    expect(await page.locator(".dashboard-priority-list").evaluate(el => el.scrollTop)).toBe(priorityScroll);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  }
  await page.goto(`${baseUrl}dashboard-workspace-test?noSide`);
  await expect(page.getByRole("complementary", { name: "Takvim ve işletme durumu" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Şimdi yapılacaklar" })).toBeVisible();

  expect(pageErrors).toEqual([]);
  console.log("dashboard-workspace-smoke-ok");
} finally {
  await browser?.close();
  await server.close();
}
