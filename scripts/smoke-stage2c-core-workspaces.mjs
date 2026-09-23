import { chromium, expect } from "@playwright/test";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { spawn } from "node:child_process";
import { getLocalViteExecutable } from "./test-helpers/local-vite.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import process from "node:process";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import { createCompactUiFixture, createReportFixture, createSetupFixture } from "./lib/desktop-renderer-fixtures.mjs";

const visualPass = process.env.VISUAL_PASS || "final";
const output = `artifacts/design-system/stage2c/${visualPass}`;
const preferencesKey = "yardimci-asistan.ui-preferences";
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(
  getLocalViteExecutable(),
  ["--config", "vite.renderer.config.ts", "--host", "127.0.0.1", "--port", String(port)],
  { cwd: "apps/desktop-app", stdio: "ignore" }
);
const observations = [];

mkdirSync(output, { recursive: true });

let browser;
try {
  await waitForServer(baseUrl);
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ locale: "tr-TR", viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.addInitScript(({ dashboard, setup, report, enabledCapabilities, preferenceStorageKey }) => {
    if (!localStorage.getItem(preferenceStorageKey)) {
      localStorage.setItem(preferenceStorageKey, JSON.stringify({ version: 2, scheme: "light", density: "compact", scale: 1, accent: "coral", font: "plex", motion: "system" }));
    }

    const financeData = {
      generatedAt: "2026-09-15T10:00:00Z",
      currency: "TRY",
      todayIncomeMinor: 150000,
      todayExpenseMinor: 45000,
      todayNetMinor: 105000,
      outstandingPensionMinor: 25000,
      recentEntries: [
        {
          id: "entry-1",
          entryType: "income",
          category: "sales",
          amountMinor: 150000,
          currency: "TRY",
          paymentMethod: "cash",
          note: "Günlük satış hasılatı",
          source: "manual",
          occurredAt: "2026-09-15T09:30:00Z",
          createdAt: "2026-09-15T09:30:00Z"
        },
        {
          id: "entry-2",
          entryType: "expense",
          category: "supplies",
          amountMinor: 45000,
          currency: "TRY",
          paymentMethod: "bank_transfer",
          note: "Mutfak toptan alışverişi",
          source: "manual",
          occurredAt: "2026-09-15T09:45:00Z",
          createdAt: "2026-09-15T09:45:00Z"
        }
      ],
      pensionBalances: [
        {
          customerId: "compact_customer_1",
          customerName: "Deniz Yılmaz",
          roomNumber: "101",
          balanceMinor: 25000,
          currency: "TRY"
        }
      ]
    };

    const marketProducts = [
      {
        id: "prod-1",
        name: "Doğal Zeytinyağı 1L",
        barcode: "8690001001",
        salePrice: 350,
        stockQuantity: 24,
        status: "active",
        trackInventory: true,
        isActive: true,
        categoryId: "cat-1",
        categoryName: "Zeytin & Yağ",
        taxRate: 1,
        unit: "piece",
        minStockLevel: 5,
        targetStockLevel: 30,
        createdAt: "2026-09-15T08:00:00Z",
        updatedAt: "2026-09-15T08:00:00Z"
      },
      {
        id: "prod-2",
        name: "Köy Peyniri 500g",
        barcode: "8690001002",
        salePrice: 180,
        stockQuantity: 3,
        status: "active",
        trackInventory: true,
        isActive: true,
        categoryId: "cat-2",
        categoryName: "Süt Ürünleri",
        taxRate: 1,
        unit: "piece",
        minStockLevel: 5,
        targetStockLevel: 20,
        createdAt: "2026-09-15T08:00:00Z",
        updatedAt: "2026-09-15T08:00:00Z"
      },
      {
        id: "prod-3",
        name: "Ev Yapımı İncir Reçeli",
        barcode: "8690001003",
        salePrice: 95,
        stockQuantity: 0,
        status: "active",
        trackInventory: true,
        isActive: true,
        categoryId: "cat-3",
        categoryName: "Kahvaltılık",
        taxRate: 1,
        unit: "piece",
        minStockLevel: 2,
        targetStockLevel: 15,
        createdAt: "2026-09-15T08:00:00Z",
        updatedAt: "2026-09-15T08:00:00Z"
      }
    ];

    const marketCategories = [
      { id: "cat-1", name: "Zeytin & Yağ", sortOrder: 1, isActive: true },
      { id: "cat-2", name: "Süt Ürünleri", sortOrder: 2, isActive: true },
      { id: "cat-3", name: "Kahvaltılık", sortOrder: 3, isActive: true }
    ];

    const marketMovements = [
      {
        id: "mov-1",
        productId: "prod-1",
        productName: "Doğal Zeytinyağı 1L",
        movementType: "in",
        quantity: 12,
        unitPrice: 280,
        note: "Hasat sevkiyatı",
        createdAt: "2026-09-15T08:30:00Z"
      },
      {
        id: "mov-2",
        productId: "prod-2",
        productName: "Köy Peyniri 500g",
        movementType: "out",
        quantity: 2,
        unitPrice: 180,
        note: "Satış",
        createdAt: "2026-09-15T09:15:00Z"
      }
    ];

    window.yardimciDesktop = {
      getBootstrapData: async () => ({
        appName: "Yardımcı Asistan",
        version: "0.1.2",
        platform: "linux",
        syncSettings: { webModuleUrl: setup.webModuleUrl, hasSyncSecret: true },
        databasePath: "/tmp/stage2c.sqlite",
        userDataPath: "/tmp/stage2c",
        backupPath: "/tmp/stage2c/backups",
        setup
      }),
      getDashboardData: async () => dashboard,
      getSetupData: async () => setup,
      getBusinessCapabilitySnapshot: async () => ({
        businessId: "stage2c-fixture",
        profileId: setup.profileId,
        enabledCapabilities,
        capabilities: enabledCapabilities.map((capability) => ({ capability, enabled: true, source: "profile" }))
      }),
      getFinanceData: async () => financeData,
      recordFinanceManualEntry: async (entry) => {
        const id = `entry-${Date.now()}`;
        financeData.recentEntries.unshift({
          ...entry,
          id,
          currency: "TRY",
          source: "manual",
          createdAt: new Date().toISOString()
        });
        return { ok: true, message: "Kasa hareketi kaydedildi." };
      },
      deleteFinanceManualEntry: async (entryId) => {
        financeData.recentEntries = financeData.recentEntries.filter((e) => e.id !== entryId);
        return { ok: true, message: "Kayıt silindi." };
      },
      getReportData: async () => report,
      generateReportAiComment: async ({ mode }) => ({
        ok: true,
        content: `İşletme AI Yorumu (${mode}): Ciro ve adisyon trendi sağlıklı görünüyor. Stok devir hızı iyi durumda.`
      }),
      getRoomFolioData: async () => ({
        generatedAt: "2026-09-15T10:00:00Z",
        rooms: dashboard.rooms,
        activeStays: dashboard.customerRoomStays,
        folios: [
          {
            id: "folio-101",
            status: "open",
            roomNumber: "101",
            roomName: "Deniz Manzaralı Oda",
            customerName: "Deniz Yılmaz"
          }
        ],
        menuCategories: dashboard.menu.categories,
        menuItems: dashboard.menu.items
      }),
      commerce: {
        listProducts: async () => marketProducts,
        listCategories: async () => marketCategories,
        saveProduct: async (p) => ({ ok: true, product: p }),
        saveCategory: async (c) => ({ ok: true, category: c }),
        deleteCategory: async () => ({ ok: true }),
        getInventoryBalance: async () => ({
          totalValue: 12500,
          lowStockCount: 1,
          outOfStockCount: 1
        }),
        listInventoryMovements: async () => marketMovements,
        setInventoryCount: async () => ({ ok: true }),
        listSuppliers: async () => [{ id: "sup-1", name: "Ege Çiftliği", phone: "05320000000" }],
        saveSupplier: async (s) => ({ ok: true, supplier: s }),
        listPurchaseOrders: async () => [],
        receivePurchase: async () => ({ ok: true }),
        listCustomerCreditAccounts: async () => [],
        getCustomerCreditAccount: async () => ({ balances: [], entries: [] }),
        listCompanionProductDrafts: async () => [],
        listCompanionCartDrafts: async () => [],
        setBarcodeScanMode: async () => true,
        consumePendingBarcodeScans: async () => []
      },
      getAiWorkspaceHistory: async () => [],
      getSyncStatus: async () => ({
        enabled: false,
        phase: "idle",
        pendingJobs: 0,
        consecutiveFailures: 0,
        message: "",
        lastError: ""
      }),
      onSyncStatusChanged: () => () => {},
      onAppLockStateChanged: () => () => {},
      openExternal: async () => true
    };
  }, {
    dashboard: createCompactUiFixture(),
    setup: { ...createSetupFixture(), setupRequired: false },
    report: createReportFixture(),
    enabledCapabilities: Object.values(BUSINESS_CAPABILITIES),
    preferenceStorageKey: preferencesKey
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Ana Ekran", exact: true })).toBeVisible();

  const capture = async (name) => {
    await page.evaluate(() => document.fonts.ready);
    const viewport = page.viewportSize();
    const metrics = await page.evaluate(() => {
      const content = document.querySelector(".content");
      const surfaceOverflow = [...document.querySelectorAll(".page-toolbar, .panel, .data-records, .form-row, .dialog, .drawer, .daily-revenue-chart, .market-tabs")]
        .filter((element) => element.clientWidth && element.scrollWidth > element.clientWidth + 1)
        .map((element) => element.className);
      return {
        documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        contentOverflow: Boolean(content && content.scrollWidth > content.clientWidth + 1),
        surfaceOverflow
      };
    });
    observations.push({
      name,
      width: viewport.width,
      height: viewport.height,
      scheme: await page.locator("html").getAttribute("data-color-scheme"),
      density: await page.locator("html").getAttribute("data-density"),
      ...metrics
    });
    writeFileSync(`${output}/viewports.json`, `${JSON.stringify(observations, null, 2)}\n`);
    expect(metrics.documentOverflow, `${name}: document overflow`).toBe(false);
    expect(metrics.contentOverflow, `${name}: content overflow`).toBe(false);
    expect(metrics.surfaceOverflow, `${name}: shared surface overflow`).toEqual([]);
    await page.screenshot({ animations: "disabled", path: `${output}/${viewport.width}x${viewport.height}-${name}.png` });
  };

  const navigate = async (name, heading) => {
    await page.locator(".sidebar").getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, level: 1, exact: true })).toBeVisible();
    await page.locator(".content").evaluate((element) => { element.scrollTop = 0; });
  };

  const viewports = [
    [1440, 1000],
    [1366, 768],
    [1024, 768],
    [900, 768],
    [600, 800]
  ];

  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });

    // 1. Ana Ekran / Dashboard
    await navigate("Ana Ekran", "Bugün ne var?");
    await expect(page.locator(".dashboard-briefing")).toBeVisible();
    await capture("dashboard-light-compact");

    // 2. Kasa / Finans
    await navigate("Kasa", "Kasa");
    await expect(page.locator(".finance-workspace")).toBeVisible();
    await capture("finance-light-compact");

    // 3. Raporlar (Expand details from Kasa page)
    const toggle = page.locator(".cash-details-toggle");
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.locator(".report-filter-panel")).toBeVisible();
    await expect(page.locator(".report-summary-metrics")).toBeVisible();
    await capture("reports-expanded-light-compact");
    // Collapse back
    await toggle.click();

    // 4. Takvim (Calendar)
    await navigate("Takvim", "Takvim");
    await expect(page.locator(".operation-calendar-page")).toBeVisible();
    // Test day/week mode toggle
    await page.locator(".operation-calendar-view-switch button").filter({ hasText: "Gün" }).click();
    await expect(page.locator(".operation-calendar-grid.is-day")).toBeVisible();
    await capture("calendar-day-light-compact");
    await page.locator(".operation-calendar-view-switch button").filter({ hasText: "Hafta" }).click();
    await expect(page.locator(".operation-calendar-grid.is-week")).toBeVisible();
    await capture("calendar-week-light-compact");

    // 5. Market Workspace
    await navigate("Market", "Market");
    await expect(page.locator(".market-page")).toBeVisible();
    await capture("market-products-light-compact");

    // Switch to Stok tab in Market
    const inventoryTab = page.locator(".market-tabs button").filter({ hasText: "Fiziksel sayım" });
    if (await inventoryTab.isVisible()) {
      await inventoryTab.click();
      await expect(page.getByRole("heading", { name: "Fiziksel Sayım", level: 2 })).toBeVisible();
      await capture("market-inventory-light-compact");
    }
  }

  // 6. Theme & density switches
  async function setAppearance(scheme, density) {
    await page.evaluate(({ nextScheme, nextDensity, storageKey }) => {
      localStorage.setItem(storageKey, JSON.stringify({ version: 2, scheme: nextScheme, density: nextDensity, scale: 1, accent: "coral", font: "plex", motion: "system" }));
    }, { nextScheme: scheme, nextDensity: density, storageKey: preferencesKey });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", scheme);
    await expect(page.locator("html")).toHaveAttribute("data-density", density);
  }

  await page.setViewportSize({ width: 1440, height: 1000 });

  // Dark / Pro
  await setAppearance("dark", "compact");
  await navigate("Ana Ekran", "Bugün ne var?");
  await capture("dashboard-dark-compact");
  await navigate("Kasa", "Kasa");
  await capture("finance-dark-compact");
  await navigate("Market", "Market");
  await capture("market-dark-compact");
  await navigate("Takvim", "Takvim");
  await capture("calendar-dark-compact");

  // Light / Easy
  await setAppearance("light", "comfortable");
  await navigate("Ana Ekran", "Bugün ne var?");
  await capture("dashboard-light-comfortable");
  await navigate("Kasa", "Kasa");
  await capture("finance-light-comfortable");
  await navigate("Market", "Market");
  await capture("market-light-comfortable");
  await navigate("Takvim", "Takvim");
  await capture("calendar-light-comfortable");

  expect(pageErrors).toEqual([]);
  console.log(`stage2c-core-workspaces-ok: ${observations.length} surfaces verified -> ${output}`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

async function getFreePort() {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(url) {
  for (let index = 0; index < 100; index += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Renderer did not start at ${url}`);
}
