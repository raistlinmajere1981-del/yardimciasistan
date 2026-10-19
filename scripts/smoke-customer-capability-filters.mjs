import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { resolve } from "node:path";
import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";
import { createCompactUiFixture } from "./lib/desktop-renderer-fixtures.mjs";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";

const data = createCompactUiFixture();
data.customers = data.customers.slice(0, 2);
data.customers[1].lastContactAt = "";
data.customerRoomStays = [{ id: "old-stay", customerId: data.customers[0].id, roomId: data.rooms[0].id, roomName: "Eski oda", roomNumber: "101", status: "checked_in", guests: [] }];
data.reservations = [{ ...data.reservations[0], id: "old-booking", customerId: data.customers[0].id, reservationType: "room", status: "approved" }];
data.kbsOverview = { ...data.kbsOverview, enabled: false };
const server = await createServer({ root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"), server: { port: 0, strictPort: false } });
await server.listen();
let browser;
try {
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/customer-capability-test", async route => {
    const html = await server.transformIndexHtml("/customer-capability-test", `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/customer-capability-filters.tsx")}"></script></body></html>`);
    await route.fulfill({ contentType: "text/html", body: html });
  });
  await page.addInitScript(({ data, capabilities }) => {
    window.customerFilterData = data;
    window.customerFilterCapabilities = capabilities;
  }, { data, capabilities: [C.CUSTOMERS, C.ACCOMMODATION_STAYS, C.ACCOMMODATION_RESERVATIONS] });
  await page.goto(`${server.resolvedUrls.local[0]}customer-capability-test`);
  const activityDates = page.locator(".customer-record-row__date time");
  await expect(activityDates).toHaveCount(2);
  const expectedDate = await page.evaluate(value => new Intl.DateTimeFormat("tr-TR", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(new Date(value)), data.customers[0].lastContactAt);
  await expect(activityDates.first()).toHaveText(expectedDate);
  await expect(page.locator(".customer-record-row__date").first()).toContainText("Son temas");
  await expect(page.locator(".customer-record-row__date").nth(1)).toContainText("Son güncelleme");
  const filters = page.getByRole("group", { name: "Müşteri filtresi", exact: true });
  const staying = filters.getByRole("button", { name: "Konaklayanlar", exact: true });
  const reserved = filters.getByRole("button", { name: "Rezervasyonu Olanlar", exact: true });
  const toggle = capabilities => page.evaluate(capabilities => window.setCustomerFilterCapabilities(capabilities), capabilities);
  await expect(staying).toBeVisible();
  await expect(reserved).toBeVisible();
  await staying.click();
  await expect(page.locator(".customer-record-row")).toHaveCount(1);
  await toggle([C.CUSTOMERS, C.ACCOMMODATION_RESERVATIONS]);
  await expect(staying).toHaveCount(0);
  await expect(filters.getByRole("button", { name: "Tümü", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".customer-record-row")).toHaveCount(2);
  await reserved.click();
  await toggle([C.CUSTOMERS]);
  await expect(reserved).toHaveCount(0);
  await expect(filters.getByRole("button", { name: "Tümü", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".customer-record-row")).toHaveCount(2);
  await toggle([C.CUSTOMERS, C.ACCOMMODATION_STAYS, C.ACCOMMODATION_RESERVATIONS]);
  await expect(staying).toBeVisible();
  await expect(reserved).toBeVisible();

  // The lock-screen consumer uses raw dashboard records, unlike operational surfaces.
  const notifications = await page.evaluate(async ({ data, C }) => {
    const { buildDesktopNotifications } = await import("/src/app/notifications.ts");
    const { projectDesktopDashboardData } = await import("/src/app/capability-projection.ts");
    data.requests = [{ ...data.requests[0], id: "closed-request", status: "new" }];
    const sync = { enabled: false, consecutiveFailures: 0 };
    const caps = [C.CUSTOMERS, C.NOTIFICATIONS];
    const kinds = capabilities => buildDesktopNotifications(data, sync, capabilities).filter(item => item.kind === "request").map(item => item.relatedId);
    const projected = projectDesktopDashboardData(data, caps);
    return { off: kinds(caps), on: kinds([...caps, C.REQUESTS]), projected: { requests: projected.requests.length, stays: projected.customerRoomStays.length, reservations: projected.reservations.length, rooms: projected.rooms.length, tables: projected.tables.length } };
  }, { data, C });
  expect(notifications.off).toEqual([]);
  expect(notifications.on).toEqual(["closed-request"]);
  expect(notifications.projected).toEqual({ requests: 0, stays: 0, reservations: 0, rooms: 0, tables: 0 });

  // Restaurant-only reservations are also a supported customer reservation lens.
  await page.evaluate(() => { window.customerFilterData.reservations[0].reservationType = "table"; });
  await toggle([C.CUSTOMERS, C.FOOD_RESERVATIONS]);
  await expect(reserved).toBeVisible();
  await reserved.click();
  await expect(page.locator(".customer-record-row")).toHaveCount(1);
  await toggle([C.CUSTOMERS, C.ACCOMMODATION_STAYS, C.ACCOMMODATION_RESERVATIONS]);
  for (const label of ["Bildirim Bekleyen", "Bildirim Hatalı"]) {
    await page.evaluate(() => window.setCustomerFilterKbsEnabled(true));
    await filters.getByRole("button", { name: label, exact: true }).click();
    await page.evaluate(() => window.setCustomerFilterKbsEnabled(false));
    await expect(filters.getByRole("button", { name: label, exact: true })).toHaveCount(0);
    await expect(filters.getByRole("button", { name: "Tümü", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".customer-record-row")).toHaveCount(2);
  }
  expect(errors).toEqual([]);
  console.log("customer-capability-filters-ok: retained old data, OFF/ON transitions, restaurant reservations, raw notification gate");
} finally { await browser?.close(); await server.close(); }
