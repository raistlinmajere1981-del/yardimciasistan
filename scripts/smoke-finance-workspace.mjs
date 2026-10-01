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
    let categorySequence = 1;
    const defaultCategories = [
      { id: "other_income", direction: "income", name: "Diğer gelir", isSystem: false, isActive: true, sortOrder: 10 },
      { id: "pension", direction: "income", name: "Pansiyon", isSystem: true, isActive: true, sortOrder: 90 },
      { id: "restaurant", direction: "income", name: "Restoran", isSystem: true, isActive: true, sortOrder: 100 },
      { id: "stock", direction: "expense", name: "Market / Stok", isSystem: false, isActive: true, sortOrder: 10 },
      { id: "utilities", direction: "expense", name: "Elektrik - Su", isSystem: false, isActive: true, sortOrder: 20 },
      { id: "rent", direction: "expense", name: "Kira", isSystem: false, isActive: true, sortOrder: 30 },
      { id: "staff", direction: "expense", name: "Personel", isSystem: false, isActive: true, sortOrder: 40 },
      { id: "maintenance", direction: "expense", name: "Bakım", isSystem: false, isActive: true, sortOrder: 50 },
      { id: "transport", direction: "expense", name: "Yakıt - Ulaşım", isSystem: false, isActive: true, sortOrder: 60 },
      { id: "official", direction: "expense", name: "Vergi / Resmi", isSystem: false, isActive: true, sortOrder: 70 },
      { id: "other_expense", direction: "expense", name: "Diğer gider", isSystem: false, isActive: true, sortOrder: 80 }
    ];
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
      pensionBalances: [],
      categories: clone(defaultCategories)
    };
    let roomData = {
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
      deleteWaits: 0,
      paymentCalls: 0,
      folioCloseCalls: 0
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
      addRoomFolioPayment: async (input) => {
        window.__financeStats.paymentCalls += 1;
        const folio = roomData.folios.find(item => item.id === input.folioId);
        if (!folio || folio.status !== "open") return { ok: false, message: "Oda adisyonu kapalı." };
        if (input.amountMinor <= 0 || input.amountMinor > folio.remainingMinor) return { ok: false, message: "Ödeme tutarı geçersiz." };
        folio.paidTotalMinor += input.amountMinor;
        folio.remainingMinor -= input.amountMinor;
        folio.payments.push({
          id: `payment-${window.__financeStats.paymentCalls}`,
          folioId: folio.id,
          amountMinor: input.amountMinor,
          currency: folio.currency,
          paymentMethod: input.paymentMethod,
          paidAt: new Date().toISOString(),
          note: "",
          origin: "direct",
          createdAt: new Date().toISOString()
        });
        financeData = {
          ...financeData,
          todayIncomeMinor: financeData.todayIncomeMinor + input.amountMinor,
          todayNetMinor: financeData.todayNetMinor + input.amountMinor,
          outstandingPensionMinor: Math.max(0, financeData.outstandingPensionMinor - input.amountMinor),
          recentEntries: [{
            id: `folio-payment-${window.__financeStats.paymentCalls}`,
            direction: "income",
            amountMinor: input.amountMinor,
            currency: folio.currency,
            paymentMethod: input.paymentMethod,
            category: "pension",
            description: "Oda tahsilatı",
            occurredAt: new Date().toISOString(),
            sourceType: "room_folio_payment",
            sourceId: folio.id,
            note: "",
            createdAt: new Date().toISOString()
          }, ...financeData.recentEntries]
        };
        return { ok: true, message: "Ödeme alındı ve kasaya işlendi.", data: clone(roomData), folioId: folio.id };
      },
      checkoutRoomFolio: async ({ folioId }) => {
        window.__financeStats.folioCloseCalls += 1;
        const folio = roomData.folios.find(item => item.id === folioId);
        if (!folio || folio.status !== "open") return { ok: false, message: "Açık oda adisyonu bulunamadı." };
        if (folio.remainingMinor === 0) {
          folio.status = "closed";
          folio.closedAt = new Date().toISOString();
        }
        return { ok: true, message: "Oda hesabı kapatıldı.", data: clone(roomData), folioId };
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
      },
      saveFinanceCategory: async (input) => {
        const name = String(input?.name ?? "").trim().slice(0, 80);
        const direction = input?.direction === "income" || input?.direction === "expense" ? input.direction : null;
        if (!direction || !name) return { ok: false, message: "Tür adı gerekli." };
        const created = {
          id: `custom-${direction}-${categorySequence++}`,
          direction,
          name,
          isSystem: false,
          isActive: true,
          sortOrder: 200 + categorySequence
        };
        financeData = {
          ...financeData,
          generatedAt: new Date().toISOString(),
          categories: [...financeData.categories, created]
        };
        return { ok: true, message: "Yeni tür eklendi.", data: clone(financeData) };
      },
      deleteFinanceCategory: async (categoryId) => {
        financeData = {
          ...financeData,
          generatedAt: new Date().toISOString(),
          categories: financeData.categories.map((category) => (
            category.id === categoryId ? { ...category, isActive: false } : category
          ))
        };
        return { ok: true, message: "Tür listeden kaldırıldı.", data: clone(financeData) };
      }
    };
  }, { capabilities: BUSINESS_CAPABILITIES });

  await page.goto(`${baseUrl}finance-workspace-test`);

  const nav = page.getByRole("navigation", { name: "Finance test navigation" });
  const finance = () => page.locator(".finance-workspace");
  const entryDialog = () => page.locator("dialog.form-dialog");
  const incomeDialog = () => page.getByRole("dialog", { name: "Gelir ekle" });
  const expenseDialog = () => page.getByRole("dialog", { name: "Gider ekle" });
  const tutarIn = (dialog) => dialog.locator("label:has(span:text-is('Tutar')) input");
  const turSelect = (dialog) => dialog.locator("label:has(span:text-is('Tür')) select");
  const aciklamaIn = (dialog) => dialog.locator("label:has(span:text-is('Açıklama')) input");
  const odemeSelect = (dialog) => dialog.locator("label:has(span:text-is('Ödeme şekli')) select");

  await expect(finance()).toBeVisible();
  await expect(finance().getByText("Günlük kasa", { exact: true })).toHaveCount(0);
  await expect(finance().getByRole("heading", { name: "Kasa", exact: true })).toHaveCount(0);
  await expect(finance().getByText(/Bugünün para hareketlerini/)).toHaveCount(0);
  const recentToolbar = finance().locator(".finance-recent-panel .finance-section-heading");
  await expect(recentToolbar.getByRole("heading", { name: "Son Hareketler", exact: true })).toBeVisible();
  await expect(recentToolbar.getByRole("button", { name: "Gelir Ekle", exact: true })).toBeVisible();
  await expect(recentToolbar.getByRole("button", { name: "Gider Ekle", exact: true })).toBeVisible();
  await expect(page.getByText("Otomatik restoran geliri", { exact: true })).toBeVisible();
  const automaticRow = page.locator(".finance-entry-item").filter({ hasText: "Otomatik restoran geliri" });
  await expect(automaticRow.getByRole("button", { name: "Kasa hareketini kaldır" })).toHaveCount(0);

  // Outstanding room debt can be collected directly from Cash without reopening the room.
  const outstanding = finance().getByRole("article").filter({ hasText: "Test Misafiri" });
  await expect(outstanding.getByRole("button", { name: "Test Misafiri", exact: true })).toBeVisible();
  await outstanding.getByRole("button", { name: "Tahsil Et", exact: true }).click();
  const receivableDialog = page.getByRole("dialog", { name: "Tahsilat al", exact: true });
  await expect(receivableDialog).toContainText("₺250,00");
  await receivableDialog.getByLabel("Tahsilat ödeme yöntemi").selectOption("bank");
  await receivableDialog.getByRole("button", { name: "Tahsilatı Kaydet", exact: true }).click();
  await expect(receivableDialog).toHaveCount(0);
  await expect(finance().getByText("Test Misafiri", { exact: true })).toHaveCount(0);
  await expect(finance().getByText("Oda tahsilatı", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__financeStats.paymentCalls)).toBe(1);
  expect(await page.evaluate(() => window.__financeStats.folioCloseCalls)).toBe(1);

  // Draft survives page unmount/remount.
  await finance().getByRole("button", { name: "Gelir Ekle", exact: true }).click();
  await expect(incomeDialog()).toBeVisible();
  await tutarIn(incomeDialog()).fill("123,45");
  await turSelect(incomeDialog()).selectOption("pension");
  await aciklamaIn(incomeDialog()).fill("Navigation draft");
  await odemeSelect(incomeDialog()).selectOption("card");
  // Entry dialog is a modal surface and intentionally intercepts pointer navigation.
  // Simulate an external/router page transition to exercise draft lifetime across unmount/remount.
  await page.evaluate(() => window.__financeHarness.setPage("other"));
  await expect(page.getByRole("heading", { name: "Diğer" })).toBeVisible();
  await page.evaluate(() => window.__financeHarness.setPage("finance"));
  await expect(tutarIn(incomeDialog())).toHaveValue("123,45");
  await expect(turSelect(incomeDialog())).toHaveValue("pension");
  await expect(aciklamaIn(incomeDialog())).toHaveValue("Navigation draft");
  await expect(odemeSelect(incomeDialog())).toHaveValue("card");

  // Synchronous controller lock survives navigation; one manual insert only.
  await page.evaluate(() => { window.__financeDeferSave = true; });
  await page.evaluate(() => {
    const controller = window.__financeHarness.controller;
    void controller.saveEntry();
    void controller.saveEntry();
  });
  await expect.poll(() => page.evaluate(() => window.__financeStats.saveWaits)).toBe(1);
  expect(await page.evaluate(() => window.__financeStats.saveCalls)).toBe(1);
  await page.evaluate(() => window.__financeHarness.setPage("other"));
  await page.evaluate(() => window.__financeResolveSave?.());
  await expect.poll(() => page.evaluate(() => window.__financeHarness.controller.saving)).toBe(false);
  await page.evaluate(() => window.__financeHarness.setPage("finance"));
  await expect(page.getByText("Navigation draft", { exact: true })).toBeVisible();
  await expect(entryDialog()).toHaveCount(0);
  expect(await page.evaluate(() => window.__financeStats.saveCalls)).toBe(1);

  // A stale Finance load cannot overwrite a newer committed mutation; Folio refresh failure is non-fatal.
  // Entry buttons are disabled while a load is in flight, so open the draft first and then start the stale load.
  await finance().getByRole("button", { name: "Gider Ekle", exact: true }).click();
  await expect(expenseDialog()).toBeVisible();
  await tutarIn(expenseDialog()).fill("50");
  await aciklamaIn(expenseDialog()).fill("Stale korumalı gider");
  await page.evaluate(() => {
    window.__financeDeferLoad = true;
    void window.__financeHarness.controller.refreshFinanceData();
  });
  await expect.poll(() => page.evaluate(() => window.__financeStats.loadWaits)).toBe(1);
  await page.evaluate(() => { window.__financeFailRoom = true; });
  await expenseDialog().getByRole("button", { name: "Gideri Kaydet", exact: true }).click();
  await expect(page.getByText("Stale korumalı gider", { exact: true })).toBeVisible();
  await expect(entryDialog()).toHaveCount(0);
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
  await expect(incomeDialog()).toBeVisible();
  await tutarIn(incomeDialog()).fill("77");
  await turSelect(incomeDialog()).selectOption("pension");
  await page.evaluate((capability) => window.__financeHarness.setCapability(capability, false), BUSINESS_CAPABILITIES.ACCOMMODATION_FOLIO);
  await expect(tutarIn(incomeDialog())).toHaveValue("77");
  await expect(turSelect(incomeDialog())).toHaveValue("other_income");
  await expect(page.getByText("Bekleyen Alacak", { exact: true })).toHaveCount(0);
  await page.evaluate((capability) => window.__financeHarness.setCapability(capability, true), BUSINESS_CAPABILITIES.ACCOMMODATION_FOLIO);
  await expect(tutarIn(incomeDialog())).toHaveValue("77");
  await incomeDialog().getByRole("button", { name: "Vazgeç", exact: true }).click();
  await expect(entryDialog()).toHaveCount(0);

  // Finance capability epoch invalidates old presentation result without unlocking duplicate save.
  await finance().getByRole("button", { name: "Gelir Ekle", exact: true }).click();
  await expect(incomeDialog()).toBeVisible();
  await tutarIn(incomeDialog()).fill("88");
  await aciklamaIn(incomeDialog()).fill("Capability save");
  const savesBeforeCapabilityTest = await page.evaluate(() => window.__financeStats.saveCalls);
  await page.evaluate(() => { window.__financeDeferSave = true; });
  await incomeDialog().getByRole("button", { name: "Geliri Kaydet", exact: true }).click();
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
