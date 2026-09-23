import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { resolve } from "node:path";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.route("**/finance-workspace-test*", async (route) => {
    const html = await server.transformIndexHtml(
      "/finance-workspace-test",
      `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/finance-workspace.tsx")}"></script></body></html>`
    );
    await route.fulfill({ contentType: "text/html", body: html });
  });

  await page.addInitScript(({ capabilities }) => {
    const now = "2026-09-23T18:00:00.000Z";
    const clone = (value) => JSON.parse(JSON.stringify(value));
    let sequence = 1;
    let financeData = {
      generatedAt: now,
      currency: "TRY",
      todayIncomeMinor: 10000,
      todayExpenseMinor: 0,
      todayNetMinor: 10000,
      outstandingPensionMinor: 25000,
      recentEntries: [
        {
          id: "auto-restaurant-1",
          direction: "income",
          amountMinor: 10000,
          currency: "TRY",
          paymentMethod: "card",
          category: "restaurant",
          description: "Otomatik restoran geliri",
          occurredAt: now,
          sourceType: "restaurant_order",
          sourceId: "order-1",
          note: "",
          createdAt: now
        },
        {
          id: "manual-existing-1",
          direction: "expense",
          amountMinor: 2000,
          currency: "TRY",
          paymentMethod: "cash",
          category: "other_expense",
          description: "Eski manuel gider",
          occurredAt: now,
          sourceType: "manual",
          sourceId: "",
          note: "",
          createdAt: now
        }
      ],
      pensionBalances: []
    };
    const roomData = {
      generatedAt: now,
      rooms: [],
      activeStays: [],
      folios: [{
        id: "folio-1",
        stayId: "stay-1",
        roomId: "room-1",
        roomName: "Deniz Oda",
        roomNumber: "101",
        customerId: "customer-1",
        customerName: "Test Misafiri",
        reservationId: "reservation-1",
        status: "open",
        guestCount: 2,
        checkInDate: "2026-09-23",
        plannedCheckOutDate: "2026-09-25",
        nights: 2,
        nightlyPriceMinor: 50000,
        currency: "TRY",
        lodgingTotalMinor: 100000,
        lodgingManualOverride: false,
        extrasTotalMinor: 0,
        chargeTotalMinor: 100000,
        paidTotalMinor: 75000,
        remainingMinor: 25000,
        creditMinor: 0,
        openedAt: now,
        closedAt: "",
        note: "",
        items: [],
        payments: []
      }],
      menuCategories: [],
      menuItems: []
    };

    window.__financeInitial = {
      snapshot: {
        businessId: "finance-smoke",
        profileId: "pension",
        enabledCapabilities: [capabilities.FINANCE, capabilities.ACCOMMODATION_FOLIO],
        capabilities: [capabilities.FINANCE, capabilities.ACCOMMODATION_FOLIO].map((capability) => ({
          capability,
          enabled: true,
          source: "profile",
          updatedAt: now
        }))
      }
    };
    window.__financeStats = {
      loadCalls: 0,
      loadWaits: 0,
      roomCalls: 0,
      saveCalls: 0,
      saveWaits: 0,
      deleteCalls: 0,
      deleteWaits: 0
    };
    window.__financeDeferLoad = false;
    window.__financeDeferSave = false;
    window.__financeDeferDelete = false;
    window.__financeFailRoom = false;
    window.__financeResolveLoad = null;
    window.__financeResolveSave = null;
    window.__financeResolveDelete = null;

    const applySave = (input) => {
      const entry = {
        id: `manual-created-${sequence++}`,
        direction: input.direction,
        amountMinor: input.amountMinor,
        currency: "TRY",
        paymentMethod: input.paymentMethod,
        category: input.category,
        description: input.description,
        occurredAt: input.occurredAt,
        sourceType: "manual",
        sourceId: "",
        note: "",
        createdAt: new Date().toISOString()
      };
      const incomeDelta = input.direction === "income" ? input.amountMinor : 0;
      const expenseDelta = input.direction === "expense" ? input.amountMinor : 0;
      financeData = {
        ...financeData,
        generatedAt: new Date().toISOString(),
        todayIncomeMinor: financeData.todayIncomeMinor + incomeDelta,
        todayExpenseMinor: financeData.todayExpenseMinor + expenseDelta,
        todayNetMinor: financeData.todayNetMinor + incomeDelta - expenseDelta,
        recentEntries: [entry, ...financeData.recentEntries]
      };
      return {
        ok: true,
        message: input.direction === "income" ? "Gelir kasaya eklendi." : "Gider kasaya eklendi.",
        data: clone(financeData)
      };
    };

    const applyDelete = (entryId) => {
      const entry = financeData.recentEntries.find((item) => item.id === entryId);
      if (!entry || entry.sourceType !== "manual") {
        return { ok: false, message: "Otomatik oluşan hareketi kaynak işlem üzerinden düzeltin." };
      }
      const incomeDelta = entry.direction === "income" ? entry.amountMinor : 0;
      const expenseDelta = entry.direction === "expense" ? entry.amountMinor : 0;
      financeData = {
        ...financeData,
        generatedAt: new Date().toISOString(),
        todayIncomeMinor: financeData.todayIncomeMinor - incomeDelta,
        todayExpenseMinor: financeData.todayExpenseMinor - expenseDelta,
        todayNetMinor: financeData.todayNetMinor - incomeDelta + expenseDelta,
        recentEntries: financeData.recentEntries.filter((item) => item.id !== entryId)
      };
      return { ok: true, message: "Kasa hareketi kaldırıldı.", data: clone(financeData) };
    };

    window.yardimciDesktop = {
      getFinanceData: async () => {
        window.__financeStats.loadCalls += 1;
        const snapshot = clone(financeData);
        if (!window.__financeDeferLoad) return snapshot;
        window.__financeStats.loadWaits += 1;
        return new Promise((resolveLoad) => {
          window.__financeResolveLoad = () => {
            window.__financeDeferLoad = false;
            window.__financeResolveLoad = null;
            resolveLoad(snapshot);
          };
        });
      },
      getRoomFolioData: async () => {
        window.__financeStats.roomCalls += 1;
        if (window.__financeFailRoom) throw new Error("injected room projection failure");
        return clone(roomData);
      },
      saveManualFinanceEntry: async (input) => {
        window.__financeStats.saveCalls += 1;
        if (!window.__financeDeferSave) return applySave(input);
        window.__financeStats.saveWaits += 1;
        return new Promise((resolveSave) => {
          window.__financeResolveSave = () => {
            window.__financeDeferSave = false;
            window.__financeResolveSave = null;
            resolveSave(applySave(input));
          };
        });
      },
      deleteManualFinanceEntry: async (entryId) => {
        window.__financeStats.deleteCalls += 1;
        if (!window.__financeDeferDelete) return applyDelete(entryId);
        window.__financeStats.deleteWaits += 1;
        return new Promise((resolveDelete) => {
          window.__financeResolveDelete = () => {
            window.__financeDeferDelete = false;
            window.__financeResolveDelete = null;
            resolveDelete(applyDelete(entryId));
          };
        });
      }
    };
  }, { capabilities: BUSINESS_CAPABILITIES });

  await page.goto(`${baseUrl}finance-workspace-test`);

  const nav = page.getByRole("navigation", { name: "Finance test navigation" });
  const finance = () => page.locator(".finance-workspace");
  const entryPanel = () => page.locator(".finance-entry-panel");

  await expect(finance()).toBeVisible();
  await expect(page.getByText("Otomatik restoran geliri", { exact: true })).toBeVisible();
  const automaticRow = page.locator(".finance-entry-item").filter({ hasText: "Otomatik restoran geliri" });
  await expect(automaticRow.getByRole("button", { name: "Kasa hareketini kaldır" })).toHaveCount(0);

  // Draft survives page unmount/remount.
  await finance().getByRole("button", { name: "Gelir Ekle", exact: true }).click();
  await entryPanel().getByLabel("Tutar").fill("123,45");
  await entryPanel().getByLabel("Tür").selectOption("pension");
  await entryPanel().getByLabel("Açıklama").fill("Navigation draft");
  await entryPanel().getByText("Ödeme şekli ve tarih", { exact: true }).click();
  await entryPanel().getByLabel("Ödeme şekli").selectOption("card");
  await nav.getByRole("button", { name: "Diğer" }).click();
  await expect(page.getByRole("heading", { name: "Diğer" })).toBeVisible();
  await nav.getByRole("button", { name: "Kasa" }).click();
  await expect(entryPanel().getByLabel("Tutar")).toHaveValue("123,45");
  await expect(entryPanel().getByLabel("Tür")).toHaveValue("pension");
  await expect(entryPanel().getByLabel("Açıklama")).toHaveValue("Navigation draft");
  await expect(entryPanel().getByLabel("Ödeme şekli")).toHaveValue("card");

  // Synchronous controller lock survives navigation; one manual insert only.
  await page.evaluate(() => { window.__financeDeferSave = true; });
  await page.evaluate(() => {
    const controller = window.__financeHarness.controller;
    void controller.saveEntry();
    void controller.saveEntry();
  });
  await expect.poll(() => page.evaluate(() => window.__financeStats.saveWaits)).toBe(1);
  expect(await page.evaluate(() => window.__financeStats.saveCalls)).toBe(1);
  await nav.getByRole("button", { name: "Diğer" }).click();
  await page.evaluate(() => window.__financeResolveSave?.());
  await expect.poll(() => page.evaluate(() => window.__financeHarness.controller.saving)).toBe(false);
  await nav.getByRole("button", { name: "Kasa" }).click();
  await expect(page.getByText("Navigation draft", { exact: true })).toBeVisible();
  await expect(entryPanel()).toHaveCount(0);
  await expect(page.getByText("Gelir kasaya eklendi.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__financeStats.saveCalls)).toBe(1);

  // A stale Finance load cannot overwrite a newer committed mutation; Folio refresh failure is non-fatal.
  await page.evaluate(() => {
    window.__financeDeferLoad = true;
    void window.__financeHarness.controller.refreshFinanceData();
  });
  await expect.poll(() => page.evaluate(() => window.__financeStats.loadWaits)).toBe(1);
  await finance().getByRole("button", { name: "Gider Ekle", exact: true }).click();
  await entryPanel().getByLabel("Tutar").fill("50");
  await entryPanel().getByLabel("Açıklama").fill("Stale korumalı gider");
  await page.evaluate(() => { window.__financeFailRoom = true; });
  await entryPanel().getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByText("Stale korumalı gider", { exact: true })).toBeVisible();
  await expect(page.getByText("Gider kasaya eklendi.", { exact: true })).toBeVisible();
  await page.evaluate(() => window.__financeResolveLoad?.());
  await page.waitForTimeout(50);
  await expect(page.getByText("Stale korumalı gider", { exact: true })).toBeVisible();
  await page.evaluate(() => { window.__financeFailRoom = false; });

  // Delete uses the same persistent mutation lock and can complete while hidden.
  const expenseRow = page.locator(".finance-entry-item").filter({ hasText: "Stale korumalı gider" });
  await page.evaluate(() => { window.__financeDeferDelete = true; });
  await expenseRow.getByRole("button", { name: "Kasa hareketini kaldır" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Bu hareket kaldırılsın mı?" });
  await deleteDialog.getByRole("button", { name: "Kaydı Kaldır" }).click();
  await expect.poll(() => page.evaluate(() => window.__financeStats.deleteWaits)).toBe(1);
  const deleteCallsBeforeRepeat = await page.evaluate(() => window.__financeStats.deleteCalls);
  // The confirmation overlay intentionally intercepts pointer navigation while it is mounted.
  // Simulate an external/router page transition to exercise controller lifetime across unmount/remount.
  await page.evaluate(() => window.__financeHarness.setPage("other"));
  await expect(page.getByRole("heading", { name: "Diğer" })).toBeVisible();
  await page.evaluate(() => window.__financeHarness.setPage("finance"));
  await expect(finance().getByRole("button", { name: "Gelir Ekle", exact: true })).toBeDisabled();
  await page.evaluate(() => {
    const controller = window.__financeHarness.controller;
    const entry = controller.data.recentEntries.find((item) => item.description === "Stale korumalı gider");
    if (entry) void controller.deleteManualEntry(entry);
  });
  await page.waitForTimeout(25);
  expect(await page.evaluate(() => window.__financeStats.deleteCalls)).toBe(deleteCallsBeforeRepeat);
  await nav.getByRole("button", { name: "Diğer" }).click();
  await page.evaluate(() => window.__financeResolveDelete?.());
  await expect.poll(() => page.evaluate(() => window.__financeHarness.controller.saving)).toBe(false);
  await nav.getByRole("button", { name: "Kasa" }).click();
  await expect(page.getByText("Stale korumalı gider", { exact: true })).toHaveCount(0);

  // Folio capability changes only its projection; Finance draft survives and invalid category normalizes.
  await finance().getByRole("button", { name: "Gelir Ekle", exact: true }).click();
  await entryPanel().getByLabel("Tutar").fill("77");
  await entryPanel().getByLabel("Tür").selectOption("pension");
  await page.evaluate((capability) => window.__financeHarness.setCapability(capability, false), BUSINESS_CAPABILITIES.ACCOMMODATION_FOLIO);
  await expect(entryPanel().getByLabel("Tutar")).toHaveValue("77");
  await expect(entryPanel().getByLabel("Tür")).toHaveValue("other_income");
  await expect(page.getByText("Bekleyen Alacak", { exact: true })).toHaveCount(0);
  await page.evaluate((capability) => window.__financeHarness.setCapability(capability, true), BUSINESS_CAPABILITIES.ACCOMMODATION_FOLIO);
  await expect(entryPanel().getByLabel("Tutar")).toHaveValue("77");
  await entryPanel().getByRole("button", { name: "Vazgeç", exact: true }).click();

  // Finance capability epoch invalidates old presentation result without unlocking duplicate save.
  await finance().getByRole("button", { name: "Gelir Ekle", exact: true }).click();
  await entryPanel().getByLabel("Tutar").fill("88");
  await entryPanel().getByLabel("Açıklama").fill("Capability save");
  const savesBeforeCapabilityTest = await page.evaluate(() => window.__financeStats.saveCalls);
  await page.evaluate(() => { window.__financeDeferSave = true; });
  await entryPanel().getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__financeStats.saveCalls)).toBe(savesBeforeCapabilityTest + 1);
  await page.evaluate((capability) => window.__financeHarness.setCapability(capability, false), BUSINESS_CAPABILITIES.FINANCE);
  await expect(page.getByRole("heading", { name: "Kasa kapalı" })).toBeVisible();
  await page.evaluate((capability) => window.__financeHarness.setCapability(capability, true), BUSINESS_CAPABILITIES.FINANCE);
  await expect(finance()).toBeVisible();
  await expect(finance().getByRole("button", { name: "Gelir Ekle", exact: true })).toBeDisabled();
  await page.evaluate(() => window.__financeResolveSave?.());
  await expect.poll(() => page.evaluate(() => window.__financeHarness.controller.saving)).toBe(false);
  await expect(page.getByText("Capability save", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__financeStats.saveCalls)).toBe(savesBeforeCapabilityTest + 1);

  expect(pageErrors).toEqual([]);
  console.log("finance-workspace-smoke-ok");
} finally {
  await browser?.close();
  await server.close();
}
