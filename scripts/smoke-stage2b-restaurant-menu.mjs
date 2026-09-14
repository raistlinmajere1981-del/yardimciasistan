import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import process from "node:process";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import { createCompactUiFixture, createSetupFixture } from "./lib/desktop-renderer-fixtures.mjs";

const visualPass = process.env.VISUAL_PASS || "final";
const output = `artifacts/design-system/stage2b/${visualPass}`;
const preferencesKey = "yardimci-asistan.ui-preferences";
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vite", "--config", "vite.renderer.config.ts", "--host", "127.0.0.1", "--port", String(port)],
  { cwd: "apps/desktop-app", stdio: "ignore" }
);
const observations = [];

mkdirSync(output, { recursive: true });

let browser;
try {
  await waitForServer(baseUrl);
  browser = await chromium.launch();
  const page = await browser.newPage({ locale: "tr-TR", viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.addInitScript(({ dashboard, setup, enabledCapabilities, preferenceStorageKey }) => {
    if (!localStorage.getItem(preferenceStorageKey)) {
      localStorage.setItem(preferenceStorageKey, JSON.stringify({ theme: "light", mode: "pro", scale: 1 }));
    }

    const emptyCategory = {
      id: "stage2b-empty-category",
      name: "Boş Kategori",
      description: "Boş durum doğrulaması için örnek kategori.",
      is_active: true,
      sort_order: 999,
      created_at: "2026-09-15T09:00:00Z",
      updated_at: "2026-09-15T09:00:00Z"
    };
    let currentDashboardData = {
      ...dashboard,
      tables: dashboard.tables.map((table) => {
        if (table.id === "compact_table_2") return { ...table, status: "occupied" };
        if (table.id === "compact_table_4") return { ...table, status: "bill_waiting" };
        return table;
      }),
      menu: {
        ...dashboard.menu,
        categories: [...dashboard.menu.categories, emptyCategory]
      }
    };
    const now = "2026-09-15T10:00:00Z";
    let tableOrders = [
      {
        id: "stage2b-open-order",
        tableId: "compact_table_2",
        tableName: "Salon Masası 2",
        status: "open",
        openedAt: now,
        closedAt: "",
        subtotal: 255,
        discountTotal: 0,
        total: 255,
        note: "",
        itemCount: 3,
        items: [
          {
            id: "stage2b-open-line-1",
            orderId: "stage2b-open-order",
            menuItemId: "compact_item_1",
            productName: "Menü Ürünü 1",
            unitPrice: 90,
            currency: "TRY",
            quantity: 2,
            lineTotal: 180,
            note: "Az şekerli",
            status: "open",
            createdAt: now,
            updatedAt: now
          },
          {
            id: "stage2b-open-line-2",
            orderId: "stage2b-open-order",
            menuItemId: "compact_item_2",
            productName: "Menü Ürünü 2",
            unitPrice: 75,
            currency: "TRY",
            quantity: 1,
            lineTotal: 75,
            note: "",
            status: "open",
            createdAt: now,
            updatedAt: now
          }
        ],
        createdAt: now,
        updatedAt: now
      },
      {
        id: "stage2b-payment-order",
        tableId: "compact_table_4",
        tableName: "Salon Masası 4",
        status: "payment",
        openedAt: now,
        closedAt: "",
        subtotal: 220,
        discountTotal: 0,
        total: 220,
        note: "Oda hesabına aktarılacak.",
        itemCount: 2,
        items: [
          {
            id: "stage2b-payment-line",
            orderId: "stage2b-payment-order",
            menuItemId: "compact_item_3",
            productName: "Menü Ürünü 3",
            unitPrice: 110,
            currency: "TRY",
            quantity: 2,
            lineTotal: 220,
            note: "",
            status: "open",
            createdAt: now,
            updatedAt: now
          }
        ],
        createdAt: now,
        updatedAt: now
      }
    ];
    const folioData = {
      generatedAt: now,
      rooms: [],
      activeStays: [],
      folios: [{
        id: "stage2b-folio",
        status: "open",
        roomNumber: "101",
        roomName: "Aile Odası",
        customerName: "Deniz Yılmaz"
      }],
      menuCategories: [],
      menuItems: []
    };

    window.__stage2bTransfers = [];

    const refreshTableStatus = (tableId, status) => {
      const tables = currentDashboardData.tables.map((table) => table.id === tableId
        ? { ...table, status, updatedAt: new Date().toISOString() }
        : table);
      currentDashboardData = {
        ...currentDashboardData,
        tables,
        summary: {
          ...currentDashboardData.summary,
          availableTables: tables.filter((table) => table.isActive && table.status === "available").length
        }
      };
    };
    const saveOrder = (order, message, tableStatus) => {
      const subtotal = order.items.reduce((sum, item) => sum + item.lineTotal, 0);
      const saved = {
        ...order,
        subtotal,
        total: subtotal,
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        updatedAt: new Date().toISOString()
      };
      tableOrders = tableOrders.some((candidate) => candidate.id === saved.id)
        ? tableOrders.map((candidate) => candidate.id === saved.id ? saved : candidate)
        : [saved, ...tableOrders];
      if (tableStatus) refreshTableStatus(saved.tableId, tableStatus);
      return { ok: true, message, order: saved, dashboardData: currentDashboardData };
    };
    const newOrder = (tableId) => {
      const table = currentDashboardData.tables.find((candidate) => candidate.id === tableId);
      const createdAt = new Date().toISOString();
      return {
        id: `stage2b-order-${tableId}`,
        tableId,
        tableName: table?.name || "Masa",
        status: "open",
        openedAt: createdAt,
        closedAt: "",
        subtotal: 0,
        discountTotal: 0,
        total: 0,
        note: "",
        itemCount: 0,
        items: [],
        createdAt,
        updatedAt: createdAt
      };
    };

    window.yardimciDesktop = {
      getBootstrapData: async () => ({
        appName: "Yardımcı Asistan",
        version: "0.1.0",
        platform: "linux",
        syncSettings: { webModuleUrl: setup.webModuleUrl, hasSyncSecret: true },
        databasePath: "/tmp/stage2b.sqlite",
        userDataPath: "/tmp/stage2b",
        backupPath: "/tmp/stage2b/backups",
        setup
      }),
      getDashboardData: async () => currentDashboardData,
      getSetupData: async () => setup,
      getBusinessCapabilitySnapshot: async () => ({
        businessId: "stage2b-fixture",
        profileId: setup.profileId,
        enabledCapabilities,
        capabilities: enabledCapabilities.map((capability) => ({ capability, enabled: true, source: "profile" }))
      }),
      listTableOrders: async () => tableOrders,
      getActiveTableOrder: async (tableId) => tableOrders.find((order) => order.tableId === tableId && ["open", "preparing", "served", "payment"].includes(order.status)) ?? null,
      openTableOrder: async (tableId) => {
        const active = tableOrders.find((order) => order.tableId === tableId && ["open", "preparing", "served", "payment"].includes(order.status));
        return active
          ? { ok: true, message: "Aktif adisyon yüklendi.", order: active, dashboardData: currentDashboardData }
          : saveOrder(newOrder(tableId), "Adisyon açıldı.", "occupied");
      },
      addTableOrderItem: async (orderId, menuItemId, quantity, note) => {
        const order = tableOrders.find((candidate) => candidate.id === orderId);
        const item = currentDashboardData.menu.items.find((candidate) => candidate.id === menuItemId);
        const createdAt = new Date().toISOString();
        return saveOrder({
          ...order,
          items: [...order.items, {
            id: `stage2b-line-${order.items.length + 1}`,
            orderId,
            menuItemId,
            productName: item.name,
            unitPrice: item.price,
            currency: item.currency,
            quantity,
            lineTotal: item.price * quantity,
            note,
            status: "open",
            createdAt,
            updatedAt: createdAt
          }]
        }, "Ürün adisyona eklendi.", "occupied");
      },
      updateTableOrderItemQuantity: async (itemId, quantity) => {
        const order = tableOrders.find((candidate) => candidate.items.some((item) => item.id === itemId));
        return saveOrder({
          ...order,
          items: order.items.map((item) => item.id === itemId ? { ...item, quantity, lineTotal: item.unitPrice * quantity } : item)
        }, "Ürün adedi güncellendi.", order.status === "payment" ? "bill_waiting" : "occupied");
      },
      updateTableOrderItemNote: async (itemId, note) => {
        const order = tableOrders.find((candidate) => candidate.items.some((item) => item.id === itemId));
        return saveOrder({ ...order, items: order.items.map((item) => item.id === itemId ? { ...item, note } : item) }, "Ürün notu kaydedildi.");
      },
      removeTableOrderItem: async (itemId) => {
        const order = tableOrders.find((candidate) => candidate.items.some((item) => item.id === itemId));
        return saveOrder({ ...order, items: order.items.filter((item) => item.id !== itemId) }, "Ürün adisyondan çıkarıldı.");
      },
      updateTableOrderStatus: async (orderId, status) => {
        const order = tableOrders.find((candidate) => candidate.id === orderId);
        return saveOrder({ ...order, status }, "Adisyon durumu güncellendi.", status === "payment" ? "bill_waiting" : "occupied");
      },
      closeTableOrder: async (orderId, status) => {
        const order = tableOrders.find((candidate) => candidate.id === orderId);
        return saveOrder({ ...order, status, closedAt: new Date().toISOString() }, "Adisyon kapatıldı.", "available");
      },
      updateTableStatus: async (tableId, status) => {
        refreshTableStatus(tableId, status);
        return { ok: true, message: "Masa durumu güncellendi.", dashboardData: currentDashboardData };
      },
      getRoomFolioData: async () => folioData,
      addRoomFolioManualItem: async (input) => {
        window.__stage2bTransfers.push(input);
        tableOrders = tableOrders.map((order) => order.id === input.sourceTableOrderId
          ? { ...order, status: "paid", closedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
          : order);
        const transferred = tableOrders.find((order) => order.id === input.sourceTableOrderId);
        if (transferred) refreshTableStatus(transferred.tableId, "available");
        return { ok: true, message: "Adisyon oda hesabına aktarıldı.", data: folioData };
      },
      getAiWorkspaceHistory: async () => [],
      getSyncStatus: async () => ({ enabled: false, phase: "idle", pendingJobs: 0, consecutiveFailures: 0, message: "", lastError: "" }),
      onSyncStatusChanged: () => () => {},
      onAppLockStateChanged: () => () => {},
      openExternal: async () => true
    };
  }, {
    dashboard: createCompactUiFixture(),
    setup: { ...createSetupFixture(), setupRequired: false, syncSecret: "stage2b-smoke-secret" },
    enabledCapabilities: Object.values(BUSINESS_CAPABILITIES),
    preferenceStorageKey: preferencesKey
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Restoran", exact: true })).toBeVisible();

  const capture = async (name) => {
    await page.evaluate(() => document.fonts.ready);
    const viewport = page.viewportSize();
    const metrics = await page.evaluate(() => {
      const content = document.querySelector(".content");
      const surfaceOverflow = [...document.querySelectorAll(".page-toolbar, .panel, .restaurant-table-card, .data-records, .form-row, .dialog, .drawer")]
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
      theme: await page.locator("html").getAttribute("data-theme"),
      mode: await page.locator("html").getAttribute("data-mode"),
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

  const closeDialog = async (dialog, closeButtonName) => {
    await dialog.getByRole("button", { name: closeButtonName, exact: true }).click();
    await expect(dialog).toHaveCount(0);
  };

  for (const [width, height] of [[1440, 1000], [1366, 768], [1024, 768], [900, 768], [600, 800]]) {
    await page.setViewportSize({ width, height });
    await navigate("Restoran", "Restoran");
    await page.locator(".restaurant-tables-section").scrollIntoViewIfNeeded();
    await capture(`restaurant-tables-light-pro`);

    const activeTable = page.locator(".restaurant-table-card").filter({ hasText: "Salon Masası 2" });
    await activeTable.getByRole("button", { name: "Siparişi Aç", exact: true }).click();
    const orderDrawer = page.getByRole("dialog", { name: "Masa Siparişi — Salon Masası 2" });
    await expect(orderDrawer).toBeVisible();
    const categoryTabs = orderDrawer.getByRole("tablist", { name: "Menü kategorileri" });
    await expect(categoryTabs).toBeVisible();
    await expect(categoryTabs.getByRole("tab", { name: "Tümü", exact: true })).toBeVisible();
    await capture(`restaurant-order-light-pro`);
    await closeDialog(orderDrawer, "Sipariş drawer'ını kapat");

    if (width === 1440 || width === 600) {
      await page.locator(".restaurant-room-transfer").scrollIntoViewIfNeeded();
      await page.getByRole("button", { name: "Odaya Yaz", exact: true }).click();
      const transferDialog = page.getByRole("dialog", { name: "Aktarımı onaylayın" });
      await expect(transferDialog).toBeVisible();
      await capture(`restaurant-room-transfer-light-pro`);
      await closeDialog(transferDialog, "Vazgeç");
    }

    await navigate("Menü", "Menü");
    await page.locator(".menu-category-panel .menu-record").filter({ hasText: "Kahvaltı" }).click();
    await page.locator(".menu-product-panel .menu-record").filter({ hasText: "Menü Ürünü 1" }).click();
    await expect(page.getByRole("button", { name: "Ürünü Sil", exact: true })).toBeVisible();
    await capture(`menu-editor-light-pro`);

    if (width === 1440 || width === 600) {
      await page.getByRole("button", { name: "Ürünü Sil", exact: true }).click();
      const deleteDialog = page.getByRole("dialog", { name: "Ürünü sil" });
      await expect(deleteDialog).toBeVisible();
      await capture(`menu-delete-dialog-light-pro`);
      await closeDialog(deleteDialog, "Vazgeç");

      await page.getByRole("button", { name: "Ürün ekle", exact: true }).click();
      await capture(`menu-new-item-light-pro`);
      await page.locator(".menu-category-panel .menu-record").filter({ hasText: "Boş Kategori" }).click();
      await expect(page.getByText("Bu kategoride henüz ürün yok.", { exact: true })).toBeVisible();
      await capture(`menu-empty-light-pro`);
      await page.getByRole("button", { name: "Önizle", exact: true }).click();
      const preview = page.getByRole("dialog", { name: "Yerel Menü Önizlemesi" });
      await expect(preview).toBeVisible();
      await capture(`menu-preview-light-pro`);
      await closeDialog(preview, "Önizlemeyi kapat");
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigate("Restoran", "Restoran");
  await page.locator(".restaurant-room-transfer").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Odaya Yaz", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Aktarımı onaylayın" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Aktarımı Onayla", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__stage2bTransfers.at(-1))).toMatchObject({
    folioId: "stage2b-folio",
    kind: "manual_charge",
    label: "Restoran · Salon Masası 4",
    amountMinor: 22000,
    note: "Masa adisyonu · stage2b-payment-order",
    sourceTableOrderId: "stage2b-payment-order"
  });

  async function setAppearance(theme, mode) {
    await page.evaluate(({ nextTheme, nextMode, storageKey }) => {
      localStorage.setItem(storageKey, JSON.stringify({ theme: nextTheme, mode: nextMode, scale: 1 }));
    }, { nextTheme: theme, nextMode: mode, storageKey: preferencesKey });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
  }

  await setAppearance("dark", "pro");
  await navigate("Restoran", "Restoran");
  await page.locator(".restaurant-tables-section").scrollIntoViewIfNeeded();
  await capture("restaurant-tables-dark-pro");
  await navigate("Menü", "Menü");
  await capture("menu-editor-dark-pro");

  await setAppearance("light", "easy");
  await navigate("Restoran", "Restoran");
  await page.locator(".restaurant-tables-section").scrollIntoViewIfNeeded();
  await capture("restaurant-tables-light-easy");
  await navigate("Menü", "Menü");
  await capture("menu-editor-light-easy");

  expect(pageErrors).toEqual([]);
  console.log(`stage2b-restaurant-menu-ok: ${observations.length} surfaces -> ${output}`);
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
