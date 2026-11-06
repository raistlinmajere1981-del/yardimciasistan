import { catalogPageFixture } from "./test-helpers/catalog-page-fixture.ts";
import { expandSettingsStructure, openSettingsService, cancelSettingsService, saveSettingsService } from "./test-helpers/settings-ui.mjs";
import { createReportFixture, createSetupFixture, createDashboardFixture, createDashboardConversionFixture, createCompactUiFixture, createPulledRequestFixture, createBusinessCapabilitySnapshotFixture } from "./lib/desktop-renderer-fixtures.mjs";
import { chromium, expect } from "@playwright/test";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { chooseDate, chooseTime } from "./test-helpers/date-time-picker.mjs";
import { chooseSearchSelect } from "./test-helpers/search-select.mjs";
import { startDesktopRendererServer } from "./test-helpers/desktop-renderer-server.mjs";
import { expectWhatsAppToFillWorkspace } from "./test-helpers/whatsapp-workspace-layout.mjs";
import { readFileSync } from "node:fs";

const {
  baseUrl,
  server,
  output: serverOutput
} = await startDesktopRendererServer();

async function expectRegisteredHospitalityNavigation(page) {
  const registered = await page.evaluate(async () => {
    const { buildNavigation } = await import("/src/app/navigation.ts");
    return buildNavigation(await window.yardimciDesktop.getBusinessCapabilitySnapshot())
      .map(({ id, label }) => ({ id, label }));
  });
  // This fixture is Pension + Restaurant, not retail. Generic commerce
  // dependencies must not resurrect the deliberately removed Sales entry.
  expect(registered.map(item => item.id)).not.toContain("market");
  await expect(page.locator("#desktop-sidebar .nav-item")).toHaveText(registered.map(item => item.label));
  await expect(page.locator("#desktop-sidebar").getByRole("button", { name: "Satış", exact: true })).toHaveCount(0);
}

try {
  const browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  await page.addInitScript({ content: `window.__catalogPageFixture = ${catalogPageFixture.toString()};` });
  await page.addInitScript(({ setupData, dashboardData, reportData, capabilitySnapshot }) => {
    const uiPreferencesKey = "yardimci-asistan.ui-preferences";
    if (window.localStorage.getItem(uiPreferencesKey) === null) {
      window.localStorage.setItem(uiPreferencesKey, JSON.stringify({ version: 2, scheme: "dark", density: "compact", scale: 1, accent: "coral", font: "plex", motion: "system" }));
    }
    let currentDashboardData = dashboardData;
    const previewProduct = currentDashboardData.menu.items.find(item => item.product_id === "product_local_preview");
    previewProduct.image_url = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="90"><rect width="180" height="90" fill="green"/></svg>')}`;
    let products = currentDashboardData.menu.items.map(item => ({
      id: item.product_id, businessId: "fixture-business", categoryId: "", name: item.name, description: item.description,
      brand: "", sku: "", barcode: "", salePrice: item.price, purchasePrice: 0, dealerPriceA: null, dealerPriceB: null,
      currency: item.currency, unit: item.stock_unit, taxRate: 0, trackInventory: item.stock_quantity !== null,
      minimumQuantity: item.stock_min_quantity ?? 0, isActive: true, quickAccessEnabled: false,
      imageAssetPath: item.product_id === "product_local_preview" ? "assets/products/product_local_preview/fixture.svg" : "", imageSourceUrl: item.image_url,
      dataSource: "", sourceProductUrl: "", dataLicense: "", imageLicense: "", sourceFetchedAt: "", updatedAt: item.updated_at,
      createdAt: item.created_at, sortOrder: item.sort_order
    }));
    const balances = new Map(currentDashboardData.menu.items.map(item => [item.product_id, item.stock_quantity ?? 0]));
    const projectProducts = () => {
      currentDashboardData.menu.items = currentDashboardData.menu.items.map(entry => {
        const product = products.find(product => product.id === entry.product_id);
        return { ...entry, name: product.name, description: product.description, price: entry.price_override ?? product.salePrice,
          currency: product.currency, image_url: product.imageSourceUrl, stock_unit: product.unit,
          stock_quantity: product.trackInventory ? balances.get(product.id) ?? 0 : null, stock_min_quantity: product.minimumQuantity };
      });
    };
    const mutateDevice = (deviceId, mutation, message) => {
      const devices = currentDashboardData.androidDevices.map((device) => device.deviceId === deviceId ? mutation(device) : device);
      currentDashboardData = { ...currentDashboardData, androidDevices: devices };
      return { ok: true, message, devices };
    };
    window.__openedExternalUrls = [];
    window.__stockImageAnalysisCalls = [];
    window.__stockImageApplyCalls = [];
    window.__stockProductLookups = [];
    window.__reportRanges = [];
    window.__reportAiCalls = [];
    window.__androidLegacyCalls = [];
    window.__qrMenuWebPublicationChanges = [];
    window.__menuReorderCalls = [];
    let qrMenuWebEnabled = true;
    let businessProfile = {
      description: "Smoke işletme açıklaması",
      latitude: null,
      longitude: null,
      directionsNote: "",
      checkInTime: "14:00",
      checkOutTime: "11:00",
      breakfastStartTime: "08:00",
      breakfastEndTime: "10:00",
      features: [],
      policyNote: "",
      paymentNote: "",
      languages: ["Türkçe"],
      socialLinks: []
    };
    let businessLayout = {
      capabilities: {
        rooms: capabilitySnapshot.enabledCapabilities.includes("accommodation.rooms"),
        tables: capabilitySnapshot.enabledCapabilities.includes("food_service.tables")
      },
      rooms: currentDashboardData.rooms.map((room, index) => ({
        id: room.id,
        name: room.name,
        number: room.number ?? "",
        capacity: room.capacity ?? 2,
        bedInfo: room.bedInfo ?? "",
        floor: room.floor ?? "",
        features: room.features ?? [],
        description: room.description ?? "",
        priceNote: room.priceNote ?? "",
        nightlyPriceMinor: room.nightlyPriceMinor ?? 0,
        currency: room.currency ?? "TRY",
        sortOrder: index + 1,
        outOfService: room.status === "out_of_service",
        canRemove: true,
        removeBlockReason: ""
      })),
      tableCategories: [
        { name: "Bahçe", tableCount: 1 },
        { name: "Salon", tableCount: 1 }
      ],
      tables: [
        { id: "table-1", name: "Bahçe 1", area: "Bahçe", capacity: 4, description: "", features: [], smokingPolicy: "unspecified", sortOrder: 1 },
        { id: "table-2", name: "Salon 1", area: "Salon", capacity: 4, description: "", features: [], smokingPolicy: "unspecified", sortOrder: 2 }
      ],
      publication: { rooms: false, tables: false }
    };
    window.yardimciDesktop = {
      commerce: {
        listProducts: async options => {
          if (options?.productId) window.__stockProductLookups.push(structuredClone(options));
          return window.__catalogPageFixture(structuredClone(products), options);
        }, listCategories: async () => [],
        saveProduct: async input => {
          const existing = products.find(product => product.id === input.id);
          const saved = { ...existing, ...input, imageSourceUrl: input.clearImage ? "" : input.manualImageDataUrl ?? existing.imageSourceUrl,
            imageAssetPath: input.clearImage ? "" : input.manualImageDataUrl ? `assets/products/${input.id}/fixture.png` : existing.imageAssetPath };
          products = products.map(product => product.id === saved.id ? saved : product);
          projectProducts(); return structuredClone(saved);
        },
        saveProductDetails: async draft => {
          const saved = await window.yardimciDesktop.commerce.saveProduct(draft.product);
          if (draft.stock?.operation === "count") balances.set(saved.id, draft.stock.quantity);
          const photos = await window.yardimciDesktop.commerce.listProductPhotos(saved.id);
          return { product: saved, photos, publication: { productId: saved.id, isPublished: draft.isPublished ?? false },
            balance: await window.yardimciDesktop.commerce.getInventoryBalance(saved.id), stock: draft.stock ? { movement: null } : null };
        },
        getInventoryBalance: async productId => ({ productId, locationId: "fixture-primary", quantity: balances.get(productId) ?? 0,
          minimumQuantity: products.find(product => product.id === productId)?.minimumQuantity ?? 0, updatedAt: "fixture-count" }),
        listInventoryMovements: async () => [],
        getProductImageDataUrl: async id => products.find(product => product.id === id)?.imageSourceUrl ?? "",
        // The product workspace loads the staged multi-photo collection before enabling editing.
        listProductPhotos: async id => ({ productId: id, revision: "fixture", photos: [], sourceUrl: products.find(product => product.id === id)?.imageSourceUrl ?? "", sourceLicense: "" }),
        setInventoryCount: async input => {
          balances.set(input.productId, input.countedQuantity); projectProducts();
          return { balance: await window.yardimciDesktop.commerce.getInventoryBalance(input.productId), movement: null };
        }
      },
      getBusinessCapabilitySnapshot: async () => capabilitySnapshot,
      getQrMenuWebPublication: async () => ({ enabled: qrMenuWebEnabled }),
      setQrMenuWebPublication: async (enabled) => {
        qrMenuWebEnabled = enabled === true;
        window.__qrMenuWebPublicationChanges.push(qrMenuWebEnabled);
        return {
          ok: true,
          message: qrMenuWebEnabled ? "QR Menü webde görünür." : "QR Menü webde gizlendi.",
          enabled: qrMenuWebEnabled
        };
      },
      getBootstrapData: async () => ({
        appName: "Yardımcı Asistan",
        version: "0.1.0",
        platform: "linux",
        syncSettings: { webModuleUrl: setupData.webModuleUrl, hasSyncSecret: true },
        databasePath: dashboardData.databasePath,
        userDataPath: "/tmp/yardimci-asistan",
        backupPath: dashboardData.backupPath,
        setup: setupData
      }),
      getDashboardData: async () => currentDashboardData,
      getSetupData: async () => setupData,
      getKbsSettings: async () => ({ enabled: false, provider: "egm", facilityCode: "", username: "", authorizedIdentityNumber: "", passwordConfigured: false }),
      saveKbsSettings: async (input) => ({ ok: true, message: "KBS smoke ayarları kaydedildi.", settings: { enabled: input.enabled, provider: input.provider, facilityCode: input.facilityCode, username: input.username, authorizedIdentityNumber: input.authorizedIdentityNumber, passwordConfigured: Boolean(input.password) } }),
      testKbsConnection: async () => ({ ok: true, message: "KBS smoke bağlantısı hazır.", provider: "egm", credentialsVerified: false, requiresWebLogin: true, portalUrl: "https://kbs.egm.gov.tr" }),
      getGoogleReviewsSettings: async () => ({ enabled: false, placeId: "", apiKeyConfigured: false, lastPublishedAt: "", publicationPending: false }),
      saveGoogleReviewsSettings: async (input) => ({
        ok: true,
        message: "Google yorumları ayarları kaydedildi.",
        settings: { enabled: input.enabled, placeId: input.placeId, apiKeyConfigured: Boolean(input.apiKey), lastPublishedAt: "", publicationPending: false }
      }),
      testGoogleReviewsConnection: async () => ({ ok: true, message: "Google Places bağlantısı doğrulandı.", name: "Smoke İşletme", rating: 4.8, userRatingCount: 12 }),
      getBusinessPublicProfile: async () => structuredClone(businessProfile),
      saveBusinessPublicProfile: async (input) => {
        businessProfile = structuredClone(input);
        return { ok: true, message: "Müşteri bilgileri kaydedildi.", profile: structuredClone(businessProfile) };
      },
      getBusinessLayout: async () => structuredClone(businessLayout),
      listRoomMedia: async () => [],
      addRoomMedia: async () => ({ ok: true, message: "Medya eklendi.", media: [] }),
      updateRoomMedia: async () => ({ ok: true, message: "Medya güncellendi.", media: [] }),
      deleteRoomMedia: async () => ({ ok: true, message: "Medya kaldırıldı.", media: [] }),
      saveBusinessLayout: async (input) => {
        if (input.rooms) {
          businessLayout = {
            ...businessLayout,
            rooms: input.rooms.map((room, index) => ({
              id: room.id || `renderer-room-${index + 1}`,
              name: room.name,
              number: room.number,
              capacity: room.capacity,
              bedInfo: room.bedInfo,
              floor: room.floor,
              features: [...room.features],
              description: room.description,
              priceNote: room.priceNote,
              nightlyPriceMinor: room.nightlyPriceMinor,
              currency: room.currency,
              sortOrder: index + 1,
              outOfService: room.outOfService === true,
              canRemove: true,
              removeBlockReason: ""
            }))
          };
        }
        if (input.tableCategories) {
          businessLayout = {
            ...businessLayout,
            tableCategories: input.tableCategories.map(({ name, tableCount }) => ({ name, tableCount }))
          };
        }
        return { ok: true, message: "İşletme düzeni kaydedildi.", layout: structuredClone(businessLayout) };
      },
      onSyncStatusChanged: () => () => {},
      getReportData: async (range) => {
        window.__reportRanges.push(range);
        return {
          ok: true,
          data: {
            ...reportData,
            period: {
              preset: range.preset,
              label: range.label,
              startDate: range.startDate,
              endDate: range.endDate
            }
          }
        };
      },
      generateReportAiComment: async (input) => {
        window.__reportAiCalls.push(input);
        return {
          ok: true,
          content: "Seçilen dönemde 8 adisyon kapatıldı ve restoran cirosu ₺6.400 oldu."
        };
      },
      getSyncStatus: async () => ({
        enabled: true,
        clientId: "desktop-smoke",
        requestCursor: 1,
        acknowledgedCursor: 1,
        lastAttemptAt: "2026-07-18T12:35:00+03:00",
        lastSuccessAt: "2026-07-18T12:00:00+03:00",
        lastError: "Smoke sync bağlantısına ulaşılamadı.",
        consecutiveFailures: 2,
        pendingJobs: 0,
        nextRetryAt: "",
        phase: "offline",
        message: "Smoke sync bağlantısına ulaşılamadı."
      }),
      analyzeStockImage: async (input) => {
        window.__stockImageAnalysisCalls.push({
          importId: input.importId,
          fileName: input.fileName,
          mimeType: input.mimeType,
          byteLength: input.bytes.byteLength
        });
        return {
          ok: true,
          message: "Görsel analiz edildi. Stoklar değişmeden önce satırları kontrol edin.",
          importId: input.importId,
          imageHash: "a".repeat(64),
          duplicateWarning: true,
          analysis: {
            document: {
              supplier_name: "Smoke Tedarikçi",
              invoice_number: "FTR-2026-42",
              invoice_date: "2026-07-22",
              document_confidence: "high"
            },
            lines: [
              {
                raw_text: "12 adet Yerel Serpme Kahvaltı",
                matched_product_id: "product_local_preview",
                matched_product_name: "Yerel Serpme Kahvaltı",
                suggested_quantity: 12,
                source_quantity_text: "12 adet",
                confidence: "high",
                needs_review_reason: null
              },
              {
                raw_text: "1 koli bilinmeyen ürün",
                matched_product_id: null,
                matched_product_name: null,
                suggested_quantity: null,
                source_quantity_text: "1 koli",
                confidence: "low",
                needs_review_reason: "Koli adede çevrilemedi."
              },
              {
                raw_text: "Kaşarlı Köfte 3 KG",
                matched_product_id: "product_gram_preview",
                matched_product_name: "Kaşarlı Köfte",
                suggested_quantity: 3000,
                source_quantity_text: "3 KG",
                confidence: "high",
                needs_review_reason: null
              }
            ]
          }
        };
      },
      cancelStockImageAnalysis: async () => true,
      saveMenuCategory: async (input) => {
        const savedId = input.id || "menu-category-smoke-created";
        const existing = currentDashboardData.menu.categories.find((category) => category.id === savedId);
        const savedCategory = {
          ...(existing || currentDashboardData.menu.categories[0]),
          ...input,
          id: savedId,
          created_at: existing?.created_at || "2026-07-18T09:00:00Z",
          updated_at: "2026-07-18T12:00:00Z"
        };
        currentDashboardData = {
          ...currentDashboardData,
          menu: {
            ...currentDashboardData.menu,
            categories: existing
              ? currentDashboardData.menu.categories.map((category) => category.id === savedId ? savedCategory : category)
              : [...currentDashboardData.menu.categories, savedCategory]
          }
        };
        return { ok: true, message: "Kategori kaydedildi.", savedId, dashboardData: currentDashboardData };
      },
      saveMenuProductEntry: async (input) => {
        const savedId = input.id || "menu-entry-smoke-created";
        const existing = currentDashboardData.menu.items.find((item) => item.id === savedId);
        const productId = existing?.product_id ?? input.product_id ?? "product-smoke-created";
        if (input.product) products.push({ ...products[0], ...input.product, id: productId, trackInventory: input.product.trackInventory ?? false,
          minimumQuantity: input.product.minimumQuantity ?? 0, imageSourceUrl: input.product.manualImageDataUrl ?? "", imageAssetPath: "" });
        const savedItem = {
          ...(existing || currentDashboardData.menu.items[0]),
          ...input,
          product_id: productId,
          id: savedId,
          created_at: existing?.created_at || "2026-07-18T09:00:00Z",
          updated_at: "2026-07-18T12:00:00Z"
        };
        currentDashboardData = {
          ...currentDashboardData,
          menu: {
            ...currentDashboardData.menu,
            items: existing
              ? currentDashboardData.menu.items.map((item) => item.id === savedId ? savedItem : item)
              : [...currentDashboardData.menu.items, savedItem]
          }
        };
        projectProducts();
        return { ok: true, message: "Ürün kaydedildi.", savedId, dashboardData: currentDashboardData };
      },
      reorderMenuRecords: async input => {
        const rows = input.kind === "categories" ? currentDashboardData.menu.categories
          : currentDashboardData.menu.items.filter(item => item.category_id === input.categoryId);
        if (rows.length !== input.orderedIds.length || rows.some(row => !input.orderedIds.includes(row.id)))
          return { ok: false, message: "Sıralama listesi değişti." };
        window.__menuReorderCalls.push(structuredClone(input));
        const order = new Map(input.orderedIds.map((id, index) => [id, (index + 1) * 10]));
        currentDashboardData = { ...currentDashboardData, menu: {
          ...currentDashboardData.menu,
          categories: input.kind === "categories" ? currentDashboardData.menu.categories.map(row => ({ ...row, sort_order: order.get(row.id) ?? row.sort_order })) : currentDashboardData.menu.categories,
          items: input.kind === "items" ? currentDashboardData.menu.items.map(row => ({ ...row, sort_order: order.get(row.id) ?? row.sort_order })) : currentDashboardData.menu.items
        } };
        return { ok: true, message: "Sıralama güncellendi.", dashboardData: currentDashboardData };
      },
      deleteMenuProductEntry: async (itemId) => {
        currentDashboardData = {
          ...currentDashboardData,
          menu: {
            ...currentDashboardData.menu,
            items: currentDashboardData.menu.items.filter((item) => item.id !== itemId)
          }
        };
        return { ok: true, message: "Ürün menüden kaldırıldı.", dashboardData: currentDashboardData };
      },
      applyStockImageImport: async (input) => {
        window.__stockImageApplyCalls.push(input);
        const additions = new Map();
        for (const line of input.lines) {
          additions.set(line.product_id, (additions.get(line.product_id) || 0) + line.quantity);
          balances.set(line.product_id, (balances.get(line.product_id) ?? 0) + line.quantity);
        }
        currentDashboardData = {
          ...currentDashboardData,
          menu: {
            ...currentDashboardData.menu,
            items: currentDashboardData.menu.items.map((item) => additions.has(item.product_id)
              ? { ...item, stock_quantity: item.stock_quantity + additions.get(item.product_id) }
              : item)
          }
        };
        return {
          ok: true,
          message: "2 stok satırı güncellendi.",
          importId: input.importId,
          appliedLineCount: input.lines.length,
          totalQuantity: input.lines.reduce((total, line) => total + line.quantity, 0),
          dashboardData: currentDashboardData
        };
      },
      setAndroidDeviceRole: async (deviceId, role) => mutateDevice(deviceId, (device) => ({
        ...device,
        role,
        permissions: role === "admin"
          ? [...new Set([...device.permissions, "table_order.close_paid", "settings.view", "settings.edit", "android_devices.view", "android_devices.manage"])]
          : device.permissions.filter((permission) => !["table_order.close_paid", "settings.view", "settings.edit", "android_devices.view", "android_devices.manage"].includes(permission))
      }), role === "admin" ? "Telefon yönetici yapıldı." : "Telefon personel yapıldı."),
      setAndroidDevicePermissionGroupsBatch: async (updates) => {
        let devices = currentDashboardData.androidDevices;
        for (const update of updates ?? []) {
          devices = devices.map((device) => device.deviceId === update?.deviceId ? {
            ...device,
            permissionGroups: update.groups,
            permissions: update.groups.cashier
              ? [...new Set([...device.permissions, "table_order.close_paid"])]
              : device.permissions.filter((permission) => permission !== "table_order.close_paid")
          } : device);
        }
        currentDashboardData = { ...currentDashboardData, androidDevices: devices };
        return { ok: true, message: "Telefon görev alanları kaydedildi.", devices };
      },
      setAndroidDeviceActive: async (deviceId, active) => mutateDevice(deviceId, (device) => ({ ...device, isActive: active, revokedAt: active ? "" : device.revokedAt }), active ? "Telefon yeniden aktif edildi." : "Telefon pasifleştirildi."),
      resetAndroidDevicePermissions: async (deviceId) => mutateDevice(deviceId, (device) => ({
        ...device,
        permissionGroups: { service_orders: true, cashier: false, rooms_tasks: true, customer_reservation: false }
      }), "Telefon görev alanları varsayılana döndürüldü."),
      revokeAndroidDevice: async (deviceId) => mutateDevice(deviceId, (device) => ({ ...device, isActive: false, revokedAt: new Date().toISOString() }), "Telefon kaldırıldı ve erişimi kapatıldı."),
      // Fail if a retired bridge is read, including an automatic inventory scan.
      get listAndroidInstallDevices() { window.__androidLegacyCalls.push("scan"); throw new Error("Retired consumer ADB bridge"); },
      get installAndroidApp() { window.__androidLegacyCalls.push("install"); throw new Error("Retired consumer ADB bridge"); },
      get provisionAndroidApp() { window.__androidLegacyCalls.push("provision"); throw new Error("Retired consumer ADB bridge"); },
      markWhatsAppMessageSent: async () => ({ ok: true, message: "Mesaj gönderildi olarak işaretlendi." }),
      openExternal: async (url) => {
        window.__openedExternalUrls.push(url);
        return true;
      }
    };
  }, {
    setupData: { ...createSetupFixture(), setupRequired: false, syncSecret: "smoke-secret-12345", aiApiKeyConfigured: false },
    dashboardData: createDashboardConversionFixture(),
    reportData: createReportFixture(),
    capabilitySnapshot: createBusinessCapabilitySnapshotFixture({ ...createSetupFixture(), setupRequired: false, syncSecret: "smoke-secret-12345", aiApiKeyConfigured: false })
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("yardimci-asistan.ui-preferences")))).toEqual({
    version: 2,
    scheme: "dark",
    density: "compact",
    scale: 1,
    accent: "coral",
    font: "plex",
    motion: "system"
  });
  const notificationBell = page.getByRole("button", { name: /Bildirimler, \d+ uyarı/ });
  await expect(notificationBell).toBeVisible();
  await notificationBell.click();
  const notificationCenter = page.getByRole("dialog", { name: "Bildirim merkezi" });
  await expect(notificationCenter.getByText("Yeni müşteri talebi", { exact: true })).toBeVisible();
  await expect(notificationCenter.getByText("Rezervasyon onay bekliyor", { exact: true })).toBeVisible();
  await expect(notificationCenter.getByText("Masa hesap bekliyor", { exact: true })).toBeVisible();
  await expect(notificationCenter.getByText(/Günlük iş (?:bekliyor|gecikti)/)).toHaveCount(2);
  await expect(notificationCenter.getByText("Web bağlantı sorunu", { exact: true })).toBeVisible();
  await expect(notificationCenter.getByText("Android işlemi uygulanamadı", { exact: true })).toBeVisible();
  await notificationCenter.locator(".notification-item", { hasText: "Yeni müşteri talebi" }).getByRole("button", { name: /ilgili sayfaya git/ }).click();
  await expect(page.getByRole("heading", { name: "Müşteri İşleri", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ayarlar" }).click();
  const settings = page.locator(".setup-capabilities");
  await expect(settings.getByRole("tablist", { name: "Ayar kategorileri" })).toHaveCount(0);
  await expandSettingsStructure(page);
  await expect(settings.locator("#settings-public-profile")).toBeVisible();
  await expect(settings.getByLabel("İşletme açıklaması")).toBeVisible();
  await expect(settings.getByRole("group", { name: "Ek özellikler", exact: true })).toBeVisible();
  await expect(settings.getByText("Ek özellikler")).toBeVisible();
  await expect(settings.getByRole("checkbox", { name: "Online Satış", exact: true })).not.toBeChecked();
  await expect(settings.getByText("WhatsApp / SMS Kampanyaları", { exact: true })).toBeVisible();
  await expect(settings.getByText("Pazarlama", { exact: true })).toBeVisible();
  await expect(settings.getByText(/accommodation\.reservations|commerce\.inventory|retail\.barcode|messaging\.campaigns|marketing\.studio/)).toHaveCount(0);
  expect(await settings.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.locator("#settings-tables-button").click();
  const tableWorkspace = page.locator("#settings-operations");
  await expect(tableWorkspace.getByRole("heading", { name: "Masa Yönetimi", exact: true })).toBeVisible();
  await expect(tableWorkspace).toContainText("Restoran · 2 masa");
  const tableCategoryList = tableWorkspace.locator(".table-category-list");
  await expect(tableCategoryList.locator(".table-category-row")).toHaveCount(2);
  await expect(tableCategoryList.locator(".table-category-row").nth(0).getByLabel("Kategori adı")).toHaveValue("Bahçe");
  await expect(tableCategoryList.locator(".table-category-row").nth(1).getByLabel("Kategori adı")).toHaveValue("Salon");
  // Ekleme eylemi web yayını kontrolüyle birlikte yönetim başlığında yer alır.
  const tableManagementHeader = tableWorkspace.locator(".resource-management-pane-header");
  const addTableCategory = tableManagementHeader.getByRole("button", { name: "Kategori Ekle", exact: true });
  await expect(tableManagementHeader.getByRole("checkbox", { name: "Masa web yayını", exact: true })).toBeVisible();
  await expect(addTableCategory).toBeVisible();
  await expect(tableCategoryList.getByRole("button", { name: "Kategori Ekle", exact: true })).toHaveCount(0);
  await addTableCategory.click();
  await expect(tableCategoryList.locator(".table-category-row")).toHaveCount(3);
  await tableCategoryList.locator(".table-category-row").nth(2).getByLabel("Kategori adı").fill("Teras");
  await expect(tableWorkspace).toContainText("Restoran · 3 masa");
  await tableCategoryList.getByRole("button", { name: "Teras satırını kaldır" }).click();
  await expect(tableCategoryList.locator(".table-category-row")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await openSettingsService(page, "settings-android");
  const androidDeviceSection = page.locator(".settings-android-devices-section");
  await expect(androidDeviceSection.getByRole("heading", { name: "Telefonlar" })).toBeVisible();
  await expect(androidDeviceSection.getByRole("button", { name: "Yenile", exact: true })).toBeVisible();
  await expect(androidDeviceSection.locator(".android-device-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Telefon eşleştir · QR göster", exact: true })).toBeVisible();
  await expect(androidDeviceSection).toContainText("Web bağlantısı isteğe bağlıdır");
  await expect(androidDeviceSection.getByText("USB hata ayıklaması", { exact: false })).toHaveCount(0);
  await expect(androidDeviceSection.getByRole("button", { name: "Uygulamayı Kur", exact: true })).toHaveCount(0);
  await expect(androidDeviceSection.getByRole("button", { name: "Kurulumu Tamamla", exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__androidLegacyCalls)).toEqual([]);
  await expect(androidDeviceSection.getByText("Smoke Personel Telefonu", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.getByText("Personel", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.getByText("Servis + Oda işleri", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.getByText(/izin ·|Hesap kapatamaz|table_order\.close_paid/)).toHaveCount(0);
  const cashierGroup = androidDeviceSection.getByRole("checkbox", { name: /Kasa \/ Hesap/ });
  await expect(cashierGroup).not.toBeChecked();
  await cashierGroup.check();
  // The checkbox stages into the Services draft: the summary follows the
  // draft, but nothing is persisted before the category save.
  await expect(androidDeviceSection.getByText("Servis + Kasa + Oda işleri", { exact: true })).toBeVisible();
  await expect(page.locator("#settings-android").getByRole("img")).toHaveAttribute("aria-label", /Bekliyor/);
  await expect(androidDeviceSection.getByText("Telefon görev alanları kaydedildi.", { exact: true })).toHaveCount(0);
  await page.locator(".settings-service-overlay").getByRole("button", { name: "Kaydet", exact: true }).click();
  await openSettingsService(page, "settings-android");
  await expect(page.locator("#settings-android").getByRole("img")).not.toHaveAttribute("aria-label", /Bekliyor/);
  await androidDeviceSection.getByRole("button", { name: "Yönetici Yap" }).click();
  await expect(androidDeviceSection.getByText("Yönetici", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.getByText("Etkin yeteneklerde tüm izinler", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.getByRole("checkbox")).toHaveCount(0);
  await androidDeviceSection.getByRole("button", { name: "Personel Yap" }).click();
  await expect(androidDeviceSection.getByText("Personel", { exact: true }).first()).toBeVisible();
  await expect(androidDeviceSection.getByRole("checkbox", { name: /Kasa \/ Hesap/ })).toBeChecked();
  await androidDeviceSection.getByRole("button", { name: "Yetkileri Sıfırla" }).click();
  await expect(androidDeviceSection.getByText("Servis + Oda işleri", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.getByRole("checkbox", { name: /Kasa \/ Hesap/ })).not.toBeChecked();
  await androidDeviceSection.getByRole("button", { name: "Yönetici Yap" }).click();
  await expect(androidDeviceSection.getByText("Yönetici", { exact: true })).toBeVisible();
  await androidDeviceSection.getByRole("button", { name: "Kaldır" }).click();
  await expect(page.locator(".confirm-dialog")).toContainText("android-smok…ce-001");
  await page.locator(".confirm-dialog").getByRole("button", { name: "Sil", exact: true }).click();
  await openSettingsService(page, "settings-android");
  const androidDeviceList = androidDeviceSection.locator(".android-device-list");
  await expect(androidDeviceList.locator(".android-device-card")).toHaveCount(0);
  await expect(androidDeviceList.getByText("Smoke Personel Telefonu", { exact: true })).toHaveCount(0);
  await expect(androidDeviceSection.getByText("0 kayıtlı", { exact: true })).toBeVisible();
  const removedDevices = androidDeviceSection.locator(".android-removed-devices");
  await expect(removedDevices.getByText("Kaldırılan cihazlar", { exact: true })).toBeVisible();
  await removedDevices.locator("summary").click();
  await expect(removedDevices.locator(".android-removed-device-row").getByText("Smoke Personel Telefonu", { exact: true })).toBeVisible();
  await expect(removedDevices.getByText("Yönetici", { exact: true })).toBeVisible();
  await removedDevices.getByRole("button", { name: /Smoke Personel Telefonu.*cihazını geri yükle/ }).click();
  await expect(page.locator(".confirm-dialog")).toContainText("android-smok…ce-001");
  await expect(page.locator(".confirm-dialog")).toContainText("Yönetici rolü");
  await page.locator(".confirm-dialog").getByRole("button", { name: "Geri Yükle", exact: true }).click();
  await expect(androidDeviceList.getByText("Smoke Personel Telefonu", { exact: true })).toBeVisible();
  await expect(androidDeviceList.getByText("Yönetici", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.getByText("Etkin yeteneklerde tüm izinler", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.getByText("1 kayıtlı", { exact: true })).toBeVisible();
  await expect(androidDeviceSection.locator(".android-removed-devices")).toHaveCount(0);
  await cancelSettingsService(page);
  await expect(page.getByRole("button", { name: "Kaydet", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Güncelleme Ayarlarını Kaydet", exact: true })).toHaveCount(0);
  await expect(page.locator(".setup-footer")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Panele Dön" })).toHaveCount(0);
  await cancelSettingsService(page);
  await expect(page.locator("#settings-appearance")).toHaveCount(0);
  await page.getByRole("button", { name: "Görünüm", exact: true }).click();
  await expect(page.getByText("Firma Bilgileri", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Modüller", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Kapasite ve Yardımcı", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Büyük ve Sade Görünüm", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Kompakt ve Gelişmiş Görünüm", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Rahat", exact: true })).not.toBeChecked();
  await expect(page.getByRole("radio", { name: "Kompakt", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Koyu", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Mercan", exact: true })).toBeChecked();
  await expect(page.getByLabel("Arayüz ölçeği")).toHaveValue("1");
  await page.getByLabel("Arayüz ölçeği").selectOption("1.1");
  await expect(page.getByRole("tab", { name: /^Uygulama/ })).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).zoom)).toBe("1.1");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("yardimci-asistan.ui-preferences")))).toEqual({ version: 2, scheme: "dark", density: "compact", scale: 1.1, accent: "coral", font: "plex", motion: "system" });
  await page.getByRole("radio", { name: "Mavi", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "blue");
  await expect(page.getByRole("radio", { name: "Mercan", exact: true })).not.toBeChecked();
  await page.getByRole("radio", { name: "Mercan", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "coral");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Ayarlar" }).click();
  await expect(page.getByRole("tab", { name: "Uygulama", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Görünüm", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Kompakt", exact: true })).toBeChecked();
  await expect(page.getByLabel("Arayüz ölçeği")).toHaveValue("1.1");
  await expect(page.getByRole("radio", { name: "Koyu", exact: true })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await page.screenshot({ path: "artifacts/screenshots/desktop-settings-dark.png", fullPage: true });
  await page.getByLabel("Arayüz ölçeği").selectOption("1");
  await page.getByRole("radio", { name: "Açık", exact: true }).check();
  await expect(page.getByRole("radio", { name: "Açık", exact: true })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("yardimci-asistan.ui-preferences")))).toEqual({ version: 2, scheme: "light", density: "compact", scale: 1, accent: "coral", font: "plex", motion: "system" });
  await page.getByRole("radio", { name: "Koyu", exact: true }).check();
  await expect(page.getByRole("radio", { name: "Koyu", exact: true })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dark");
  await page.getByRole("radio", { name: "Açık", exact: true }).check();
  await expect(page.getByRole("radio", { name: "Açık", exact: true })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "light");
  await page.getByRole("radio", { name: "Rahat", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");
  await page.getByRole("radio", { name: "Kompakt", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await page.getByRole("button", { name: "Ayarlar" }).click();
  await openSettingsService(page, "settings-ai");
  await page.locator('.settings-service-overlay').getByRole('switch').check();
  await expect(page.getByLabel("Servis sağlayıcı")).toBeEnabled();
  await page.locator('.settings-service-overlay').getByRole('switch').uncheck();
  await expect(page.getByLabel("Servis sağlayıcı")).toBeDisabled();
  await page.locator('.settings-service-overlay').getByRole('switch').check();
  await expect(page.locator("#settings-web")).toBeVisible();
  await expect(page.locator(".settings-workspace #settings-web")).toHaveCount(1);
  await expect(page.getByLabel("Web eşitleme adresi", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Web güvenlik anahtarı", { exact: true })).toBeVisible();
  await expect(page.locator("#settings-web-panel")).toHaveCount(0);
  await expect(page.locator("#settings-web").getByRole("button", { name: "Anahtarı göster", exact: true })).toBeVisible();
  await expect(page.getByText("AI Bağlantısı", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Bu Bilgisayar", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Demo sitenin kurulu web modülü kullanılır; sonuna api/sync.php eklemeyin.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Seçtiğiniz bağlantı masaüstündeki cevap taslaklarında kullanılır ve kaydettiğinizde web modülüne güvenli biçimde uygulanır.", { exact: true })).toHaveCount(0);
  await page.getByLabel("Servis sağlayıcı").selectOption("gemini");
  await expect(page.getByText("Google AI Studio hızlı kurulum", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Google AI Studio'yu Aç" })).toBeVisible();
  await expect(page.getByLabel("Google AI Studio API anahtarı veya cURL")).toBeVisible();
  await expect(page.getByLabel("Model adı")).toHaveAttribute("placeholder", "Bağlantı kontrolünden sonra listelenir");
  await expect(page.getByLabel("Model adı")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Bağlantıyı Dene" })).toBeDisabled();
  await expect(page.locator(".setup-ai-section").getByRole("button", { name: "Google AI Studio'yu Aç" })).toBeEnabled();
  await expect(page.locator(".setup-ai-section").getByRole("button", { name: "Göster" })).toBeEnabled();
  await expect(page.locator(".setup-ai-section").getByRole("button", { name: "Bağlantıyı Dene" })).toBeDisabled();
  await page.getByLabel("Google AI Studio API anahtarı veya cURL").fill("curl https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent -H 'X-goog-api-key: AQ.smoke-key'");
  await expect(page.getByRole("button", { name: "Bağlantıyı Dene" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.locator('.settings-service-overlay')).toBeVisible();
  await cancelSettingsService(page);
  await page.getByLabel('Firma adı', { exact: true }).fill('Unsaved business');
  await page.getByRole("button", { name: "Ana Ekran", exact: true }).click();
  const settingsLeaveGuard = page.getByRole("dialog", { name: /değişiklikleri bekliyor/i });
  await expect(settingsLeaveGuard).toBeVisible();
  await expect(settingsLeaveGuard.getByText("Bu ayar alanından ayrılmadan önce değişikliklerle ne yapılacağını seçin.", { exact: true })).toBeVisible();
  await settingsLeaveGuard.getByRole("button", { name: "Değişiklikleri geri al ve geç", exact: true }).click();
  await expect(settingsLeaveGuard).toHaveCount(0);
  expect(await page.locator(".content").evaluate((element) => element.scrollTop)).toBe(0);
  await expectRegisteredHospitalityNavigation(page);
  await expect(page.getByRole("button", { name: "AI Yardımcı", exact: true })).toHaveCount(0);
  await expect(page.getByText("Web eşitleme adresi")).toHaveCount(0);
  await expect(page.getByText("Yerel kayıt dosyası")).toHaveCount(0);
  await expect(page.getByText("Yedek klasörü")).toHaveCount(0);
  await page.getByRole("button", { name: "Kasa", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Kasa", exact: true, level: 1 })).toBeVisible();
  await expect(page.getByText("Bugün Gelen", { exact: true })).toBeVisible();
  await expect(page.getByText("Bugün Çıkan", { exact: true })).toBeVisible();
  await expect(page.getByText("Bugünkü Fark", { exact: true })).toBeVisible();
  await expect(page.getByText("Bekleyen Alacak", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gelir Ekle", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gider Ekle", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Menü", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Menü", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", {name:"Menü",level:1,exact:true})).toBeVisible();
  await expect(page.locator(".page-header-copy > p")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Kategoriler", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ürünler", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ürün ekle", exact: true })).toBeVisible();
  const categoryRows = page.locator(".menu-category-row.menu-sortable-record");
  await expect(categoryRows).toHaveCount(2);
  await categoryRows.first().locator(".menu-drag-handle-hitbox").dragTo(categoryRows.nth(1), {
    targetPosition: {x: 115, y: 54}, steps: 12
  });
  await expect.poll(() => page.evaluate(() => window.__menuReorderCalls.length), {timeout: 5000}).toBe(1);
  await expect(categoryRows.first()).toContainText("Pasif Kategori");
  await categoryRows.first().getByRole("button", {name: "Pasif Kategori sırasını değiştir"}).press("ArrowDown");
  await expect.poll(() => page.evaluate(() => window.__menuReorderCalls.length)).toBe(2);
  await expect(categoryRows.first()).toContainText("Yerel Kahvaltı");
  await categoryRows.first().getByRole("button", {name: "Yerel Kahvaltı", exact: true}).click();
  const itemRows = page.locator(".menu-product-panel .menu-record.menu-sortable-record");
  await expect(itemRows).toHaveCount(3);
  await itemRows.first().locator(".menu-drag-handle-hitbox").dragTo(itemRows.nth(1), {
    targetPosition: {x: 145, y: 50}, steps: 12
  });
  await expect.poll(() => page.evaluate(() => window.__menuReorderCalls.length), {timeout: 5000}).toBe(3);
  await expect(itemRows.first()).toContainText("Kaşarlı Köfte");
  const stockImageTrigger = page.getByRole("button", { name: "AI ile Stok Ekle", exact: true });
  await expect(stockImageTrigger).toBeVisible();
  await stockImageTrigger.click();
  const stockImageDialog = page.getByRole("dialog", { name: "AI ile Stok Ekle" });
  await expect(stockImageDialog).toBeVisible();
  await expect(stockImageDialog.getByText(/uygulama görseli kalıcı saklamaz/)).toBeVisible();
  await expect(stockImageDialog.getByRole("button", { name: "Analiz Et" })).toBeDisabled();
  await stockImageDialog.locator(".stock-image-file-input").setInputFiles({
    name: "smoke-fatura.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")
  });
  const stockImagePreview = stockImageDialog.getByAltText("Seçilen fatura veya fiş önizlemesi");
  await expect(stockImagePreview).toBeVisible();
  await expect.poll(() => stockImagePreview.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  await stockImageDialog.getByRole("button", { name: "Analiz Et" }).click();
  await expect(stockImageDialog.getByText("Smoke Tedarikçi", { exact: true })).toBeVisible();
  await expect(stockImageDialog.locator(".stock-image-row")).toHaveCount(3);
  await expect(stockImageDialog.getByRole("spinbutton", { name: "Eklenecek miktar (g)", exact: true })).toHaveValue("3000");
  await expect.poll(() => page.evaluate(() => window.__stockProductLookups)).toContainEqual({
    productId: "product_gram_preview", activeOnly: true, inventoryOnly: true, limit: 1
  });
  await expect(stockImageDialog.getByRole("button", { name: "Stokları Güncelle" })).toBeDisabled();
  await stockImageDialog.locator(".stock-image-row").nth(1).getByRole("button", { name: "Yok say" }).click();
  await stockImageDialog.getByRole("button", { name: "Manuel satır ekle" }).click();
  const manualStockLine = stockImageDialog.locator(".stock-image-row").last();
  await chooseSearchSelect(manualStockLine, "Ürün karşılığı Manuel eklenen satır", { value: "product_local_preview" });
  await manualStockLine.locator("input[type='number']").fill("4");
  await stockImageDialog.getByRole("checkbox").check();
  await expect(stockImageDialog.getByRole("button", { name: "Stokları Güncelle" })).toBeEnabled();
  await page.screenshot({ path: "artifacts/screenshots/desktop-stock-image-review.png", fullPage: true });
  await stockImageDialog.getByRole("button", { name: "Stokları Güncelle" }).click();
  await expect(stockImageDialog.getByRole("heading", { name: "Stok girişi tamamlandı" })).toBeVisible();
  await expect(stockImageDialog.getByText("3 satırda 16 adet + 3.000 g stok eklendi.", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__stockImageAnalysisCalls.at(-1)?.mimeType)).toBe("image/jpeg");
  await expect.poll(() => page.evaluate(() => window.__stockImageApplyCalls.at(-1))).toMatchObject({
    imageHash: "a".repeat(64),
    duplicateWarningAcknowledged: true,
    lines: [
      { product_id: "product_local_preview", quantity: 12 },
      { product_id: "product_gram_preview", quantity: 3000 },
      { product_id: "product_local_preview", quantity: 4 }
    ]
  });
  await stockImageDialog.getByRole("button", { name: "Kapat", exact: true }).click();
  await expect(stockImageDialog).toHaveCount(0);
  await expect(stockImageTrigger).toBeFocused();
  await stockImageTrigger.click();
  await expect(stockImageDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(stockImageDialog).toHaveCount(0);
  await expect(stockImageTrigger).toBeFocused();
  await expect(page.locator(".menu-category-panel .menu-panel-heading .status-badge")).toHaveText(/\d+ kayıt/);
  await expect(page.locator(".menu-product-panel .menu-panel-heading .status-badge")).toHaveText(/\d+ kayıt/);
  await expect(page.getByText("Menüdeki ürün gruplarını yönetin. Sıralamak için kayıtları sürükleyin.", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Sıralamak için sürükleyin/, { exact: false })).toHaveCount(0);
  await expect(page.locator(".page-toolbar__start .status-badge")).toHaveCount(0);
  const categoryCreateForm = page.locator(".menu-category-create-form");
  await expect(categoryCreateForm.getByLabel("Kategori adı", { exact: true })).toBeVisible();
  await expect(categoryCreateForm.getByLabel("Açıklama", { exact: true })).toBeVisible();
  await expect(categoryCreateForm.getByRole("button", { name: "Kategori ekle", exact: true })).toBeVisible();
  const breakfastCategory = page.locator(".menu-category-row").filter({ hasText: "Yerel Kahvaltı" }).first();
  await expect(breakfastCategory.locator(".menu-category-row__description")).toBeVisible();
  await expect(breakfastCategory.getByText(/Yayında|Gizli|Aktif|Pasif/)).toBeVisible();
  await expect(breakfastCategory.getByRole("button", { name: "Düzenle", exact: true })).toBeVisible();
  await expect(breakfastCategory.getByRole("button", { name: "Sil", exact: true })).toBeVisible();
  await breakfastCategory.getByRole("button", { name: "Düzenle", exact: true }).click();
  const categoryEditor = page.locator(".menu-category-row--editing").filter({ hasText: "Kategori adı" }).first();
  await expect(categoryEditor.getByLabel("Kategori adı", { exact: true })).toHaveValue("Yerel Kahvaltı");
  await categoryEditor.getByLabel("Açıklama", { exact: true }).fill("Günün kahvaltı seçenekleri");
  await categoryEditor.getByRole("button", { name: "Kaydet", exact: true }).click();
  const savedBreakfastCategory = page.locator(".menu-category-row").filter({ hasText: "Yerel Kahvaltı" }).first();
  await expect(savedBreakfastCategory).toContainText("Günün kahvaltı seçenekleri");
  await savedBreakfastCategory.locator(".menu-category-row__description").click();
  await expect(savedBreakfastCategory).toHaveClass(/is-selected/);
  await expect(page.locator(".menu-product-panel .menu-record").filter({ hasText: "Yerel Serpme Kahvaltı" }).first()).toBeVisible();
  const productHeading = page.locator(".menu-product-panel .menu-panel-heading");
  await expect(productHeading.getByRole("button", { name: "Ürün ekle", exact: true })).toBeVisible();
  await expect(page.locator(".page-toolbar__actions").getByRole("button", { name: "Ürün ekle", exact: true })).toHaveCount(1);
  await page.locator(".menu-product-panel .menu-record").filter({ hasText: "Yerel Serpme Kahvaltı" }).first().click();
  const menuItemWorkspace = page.getByRole("dialog", { name: "Yerel Serpme Kahvaltı" });
  await expect(menuItemWorkspace).toBeVisible();
  const productImagePreview = menuItemWorkspace.locator(".market-product-image-card img");
  await expect(productImagePreview).toBeVisible();
  await expect(productImagePreview).toHaveCSS("object-fit", "contain");
  await expect.poll(() => productImagePreview.evaluate(image => image.naturalWidth / image.naturalHeight)).toBe(2);
  await expect(menuItemWorkspace.getByLabel("Menü sunumu", { exact: true })).toBeVisible();
  await expect(menuItemWorkspace.getByLabel("Stok işlemi", { exact: true })).toBeVisible();
  await menuItemWorkspace.getByRole("button", { name: "Menüden kaldır", exact: true }).click();
  await expect(menuItemWorkspace.getByText(/Yalnız menü ilişkisi kaldırılır/)).toBeVisible();
  await menuItemWorkspace.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await menuItemWorkspace.getByLabel("Ürün adı", { exact: true }).fill("Canlı Serpme Kahvaltı");
  await expect(menuItemWorkspace.getByRole("button", { name: "Çalışma alanını kapat", exact: true })).toBeDisabled();
  await page.evaluate(() => {
    const save = window.yardimciDesktop.commerce.saveProductDetails;
    window.yardimciDesktop.commerce.saveProductDetails = async input => {
      await new Promise(resolve => { window.__releaseProductSave = resolve; });
      window.yardimciDesktop.commerce.saveProductDetails = save;
      return save(input);
    };
  });
  await menuItemWorkspace.getByRole("button", { name: "Ürünü Kaydet", exact: true }).click();
  await expect(menuItemWorkspace.getByLabel("Ürün adı", { exact: true })).toBeDisabled();
  await expect(menuItemWorkspace.getByLabel("Menü fiyatı", { exact: true })).toBeDisabled();
  await expect(menuItemWorkspace.getByRole("button", { name: "Menüden kaldır", exact: true })).toBeDisabled();
  await expect(menuItemWorkspace.getByLabel("Stok işlem miktarı", { exact: true })).toBeDisabled();
  await page.evaluate(() => window.__releaseProductSave());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator(".menu-product-panel .menu-record").filter({ hasText: "Canlı Serpme Kahvaltı" }).first().click();
  const savedMenuItemWorkspace = page.getByRole("dialog", { name: "Canlı Serpme Kahvaltı" });
  await expect(savedMenuItemWorkspace.getByRole("button", { name: "Ürünü Kaydet", exact: true })).toBeDisabled();
  await expect(savedMenuItemWorkspace.getByRole("heading", { name: "Canlı Serpme Kahvaltı", exact: true })).toBeVisible();
  await expect(savedMenuItemWorkspace.getByRole("button", { name: "Menü Sunumunu Kaydet", exact: true })).toBeDisabled();
  await savedMenuItemWorkspace.getByRole("button", { name: "Menüden kaldır", exact: true }).click();
  const embeddedConfirm = savedMenuItemWorkspace.getByRole("region", { name: "Menüden kaldır" });
  await expect(embeddedConfirm).toBeVisible();
  await expect(embeddedConfirm.locator(".action-button-danger")).toHaveText("Menüden kaldır");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await embeddedConfirm.getByRole("button", { name: "Vazgeç" }).click();
  await savedMenuItemWorkspace.getByLabel("Stok işlemi", { exact: true }).selectOption("count");
  await savedMenuItemWorkspace.getByLabel("Stok işlem miktarı", { exact: true }).fill("21");
  await expect(savedMenuItemWorkspace.getByRole("button", { name: "Çalışma alanını kapat", exact: true })).toBeDisabled();
  await expect(savedMenuItemWorkspace.getByRole("status").filter({ hasText: "Kaydet sonrası stok: 21" })).toBeVisible();
  await savedMenuItemWorkspace.getByRole("button", { name: "Ürünü Kaydet", exact: true }).click();
  await expect(savedMenuItemWorkspace).toHaveCount(0);
  await page.locator(".menu-product-panel .menu-record").filter({ hasText: "Canlı Serpme Kahvaltı" }).first().click();
  await expect(savedMenuItemWorkspace.getByLabel("Stok işlem miktarı", { exact: true })).toHaveValue("");
  await savedMenuItemWorkspace.getByLabel("Menü fiyatı", { exact: true }).fill("600");
  await expect(savedMenuItemWorkspace.getByRole("button", { name: "Çalışma alanını kapat", exact: true })).toBeDisabled();
  await page.evaluate(() => {
    const save = window.yardimciDesktop.saveMenuProductEntry;
    window.yardimciDesktop.saveMenuProductEntry = async input => {
      await new Promise(resolve => { window.__releaseMenuSave = resolve; });
      window.yardimciDesktop.saveMenuProductEntry = save;
      return save(input);
    };
  });
  await savedMenuItemWorkspace.getByRole("button", { name: "Menü Sunumunu Kaydet", exact: true }).click();
  await expect(savedMenuItemWorkspace.getByLabel("Ürün adı", { exact: true })).toBeDisabled();
  await expect(savedMenuItemWorkspace.getByLabel("Menü fiyatı", { exact: true })).toBeDisabled();
  await expect(savedMenuItemWorkspace.getByLabel("Stok işlem miktarı", { exact: true })).toBeDisabled();
  await expect(savedMenuItemWorkspace.getByRole("button", { name: "Menüden kaldır", exact: true })).toBeDisabled();
  await page.evaluate(() => window.__releaseMenuSave());
  await expect(savedMenuItemWorkspace.getByRole("button", { name: "Menü Sunumunu Kaydet", exact: true })).toBeDisabled();
  await expect(savedMenuItemWorkspace.getByLabel("Menü fiyatı", { exact: true })).toBeEnabled();
  await savedMenuItemWorkspace.getByLabel("Menü fiyatı", { exact: true }).fill("");
  await savedMenuItemWorkspace.getByRole("button", { name: "Menü Sunumunu Kaydet", exact: true }).click();
  await expect(savedMenuItemWorkspace.getByRole("button", { name: "Çalışma alanını kapat", exact: true })).toBeEnabled();
  await savedMenuItemWorkspace.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  const qrMenuPanel = page.getByRole("region", { name: "QR Menü", exact: true });
  await expect(qrMenuPanel).toBeVisible();
  const qrMenuWebToggle = qrMenuPanel.getByLabel("QR Menü webde aktif", { exact: true });
  await expect(qrMenuWebToggle).toBeChecked();
  await expect(qrMenuPanel.getByRole("button", { name: "Önizle", exact: true })).toBeVisible();
  await expect(qrMenuPanel.getByRole("button", { name: "QR Kod", exact: true })).toBeEnabled();
  await qrMenuWebToggle.click();
  await expect(qrMenuWebToggle).not.toBeChecked();
  await expect(qrMenuPanel).toContainText("Web QR menüsü gizli");
  await expect(qrMenuPanel.getByRole("button", { name: "QR Kod", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Menü", exact: true })).toHaveAttribute("aria-current", "page");
  await expect.poll(() => page.evaluate(() => window.__qrMenuWebPublicationChanges)).toEqual([false]);
  await qrMenuWebToggle.click();
  await expect(qrMenuWebToggle).toBeChecked();
  await expect(qrMenuPanel.getByRole("button", { name: "QR Kod", exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.__qrMenuWebPublicationChanges)).toEqual([false, true]);
  await qrMenuPanel.getByRole("button", { name: "Önizle", exact: true }).click();
  const localMenuPreview = page.getByRole("dialog", { name: "Yerel Menü Önizlemesi" });
  await expect(localMenuPreview).toBeVisible();
  await expect(localMenuPreview.getByText("Canlı Serpme Kahvaltı", { exact: true })).toBeVisible();
  await expect(localMenuPreview.getByText("Gizli Menü Ürünü", { exact: true })).toHaveCount(0);
  await localMenuPreview.getByRole("button", { name: "Tüm Ürünler" }).click();
  await expect(localMenuPreview.getByRole("button", { name: "Tüm Ürünler" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => window.__openedExternalUrls)).toEqual([]);
  await page.screenshot({ path: "artifacts/screenshots/desktop-local-menu-preview.png", fullPage: true });
  await localMenuPreview.getByRole("button", { name: "Önizlemeyi kapat" }).click();
  await expect(localMenuPreview).toHaveCount(0);
  await expect(qrMenuPanel.getByRole("button", { name: "Önizle", exact: true })).toBeFocused();
  await qrMenuPanel.getByRole("button", { name: "Önizle", exact: true }).click();
  await expect(localMenuPreview).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(localMenuPreview).toHaveCount(0);
  await expect(qrMenuPanel.getByRole("button", { name: "Önizle", exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: "Web'e Yayınla", exact: true })).toHaveCount(0);
  await qrMenuPanel.getByRole("button", { name: "QR Kod", exact: true }).click();
  const qrTools = page.getByRole("dialog", { name: "QR Menü", exact: true });
  await expect(qrTools).toBeVisible();
  await expect(qrTools.locator(".qr-menu-tools__code svg")).toBeVisible();
  await expect(qrTools.getByRole("button", { name: "Sayfayı Aç", exact: true })).toBeVisible();
  await expect(qrTools.getByRole("button", { name: "Bağlantıyı Kopyala", exact: true })).toBeVisible();
  await expect(qrTools.getByRole("button", { name: "QR Kodu İndir", exact: true })).toBeVisible();
  await qrTools.getByRole("button", { name: "QR Menü araçlarını kapat", exact: true }).click();
  await expect(qrTools).toHaveCount(0);
  // Manual sort inputs were removed from the menu UI; the category panel itself is the anchor here.
  await expect(page.locator(".menu-category-panel")).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/desktop-qr-menu-manager.png", fullPage: true });

  await expect(page.locator(".menu-management-grid")).toBeVisible();

  // Menu quick-create is one natural task and lands in Product Workspace.
  const countProducts = () => page.evaluate(async () => (await window.yardimciDesktop.commerce.listProducts()).total);
  const countMenuEntries = () => page.evaluate(async () => (await window.yardimciDesktop.getDashboardData()).menu.items.length);
  const productsBeforeCreate = await countProducts();
  const entriesBeforeCreate = await countMenuEntries();
  const selectedMenuCategoryId = await page.locator(".menu-category-row.is-selected").getAttribute("data-sort-id");
  const selectedMenuCategoryName = await page.locator(".menu-category-row.is-selected .menu-category-row__main strong").textContent();
  await productHeading.getByRole("button", { name: "Ürün ekle", exact: true }).click();
  const createMenuProduct = page.getByRole("dialog", { name: "Yeni ürün", exact: true });
  await expect(createMenuProduct).toBeVisible();
  await expect(createMenuProduct.getByLabel("Menü kategorisi", { exact: true })).toContainText(selectedMenuCategoryName);
  await expect(createMenuProduct.getByLabel("Ürün kaynağı")).toHaveCount(0);
  await expect(createMenuProduct.getByLabel("Mevcut ürün", { exact: true })).toHaveCount(0);
  await expect(createMenuProduct.getByText("Menüde mevcut", { exact: true })).toHaveCount(0);
  await expect(createMenuProduct).not.toContainText(/canonical|shared|ortak ürün|Mevcut ürünü menüye ekle|Yeni ortak ürün oluştur/i);
  const createPrice = createMenuProduct.getByLabel("Satış fiyatı", { exact: true });
  const createPriceError = createMenuProduct.getByRole("alert").filter({ hasText: "Satış fiyatı için geçerli bir tutar girin" });
  await expect(createPriceError).toHaveCount(0);
  await createPrice.focus();
  await createMenuProduct.getByLabel("Ürün adı", { exact: true }).focus();
  await expect(createPriceError).toBeVisible();
  await createMenuProduct.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await productHeading.getByRole("button", { name: "Ürün ekle", exact: true }).click();
  await expect(createPriceError).toHaveCount(0);
  await createMenuProduct.getByRole("button", { name: "Ürünü Kaydet", exact: true }).click();
  await expect(createPriceError).toBeVisible();
  expect(await countProducts()).toBe(productsBeforeCreate);
  expect(await countMenuEntries()).toBe(entriesBeforeCreate);
  await createMenuProduct.getByLabel("Ürün adı", { exact: true }).fill("UI ortak ürün");
  await createPrice.fill("42");
  await expect(createPriceError).toHaveCount(0);
  await expect(createMenuProduct.getByLabel("Menü fiyatı", { exact: true })).toHaveValue("");
  await page.evaluate(() => {
    const save = window.yardimciDesktop.saveMenuProductEntry;
    window.__failMenuCreate = true;
    window.yardimciDesktop.saveMenuProductEntry = async input => {
      window.__menuCreateInput = structuredClone(input);
      if (window.__failMenuCreate) return { ok: false, message: "Test kayıt hatası" };
      return save(input);
    };
  });
  await createMenuProduct.getByRole("button", { name: "Ürünü Kaydet", exact: true }).click();
  await expect(createMenuProduct).toBeVisible();
  expect(await countProducts()).toBe(productsBeforeCreate);
  expect(await countMenuEntries()).toBe(entriesBeforeCreate);
  await page.evaluate(() => { window.__failMenuCreate = false; });
  await createMenuProduct.getByRole("button", { name: "Ürünü Kaydet", exact: true }).click();
  await expect(createMenuProduct).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const createdMenuRow = page.locator(".menu-product-panel .menu-record").filter({ hasText: "UI ortak ürün" });
  await expect(createdMenuRow).toBeVisible();
  expect(await countProducts()).toBe(productsBeforeCreate + 1);
  expect(await countMenuEntries()).toBe(entriesBeforeCreate + 1);
  const createInput = await page.evaluate(() => window.__menuCreateInput);
  expect(createInput.category_id).toBe(selectedMenuCategoryId);
  expect(createInput.product.salePrice).toBe(42);
  expect(createInput.product_id).toBeUndefined();
  expect(createInput.price_override).toBeNull();
  expect(createInput.is_available).toBe(true);
  await createdMenuRow.click();
  const createdProductWorkspace = page.getByRole("dialog", { name: "UI ortak ürün", exact: true });
  await expect(createdProductWorkspace.getByLabel("Menü sunumu", { exact: true })).toBeVisible();
  await expect(createdProductWorkspace.getByLabel("Ürün adı", { exact: true })).toHaveValue("UI ortak ürün");
  await expect(createdProductWorkspace.getByText("Menüde mevcut", { exact: true })).toBeVisible();
  await createdProductWorkspace.getByRole("button", { name: "Menüden kaldır", exact: true }).click();
  await createdProductWorkspace.getByRole("region", { name: "Menüden kaldır", exact: true })
    .getByRole("button", { name: "Menüden kaldır", exact: true }).click();
  await expect(createdProductWorkspace.getByLabel("Menü sunumu", { exact: true })).toHaveCount(0);
  expect(await countProducts()).toBe(productsBeforeCreate + 1);
  expect(await countMenuEntries()).toBe(entriesBeforeCreate);
  await createdProductWorkspace.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  await productHeading.getByRole("button", { name: "Ürün ekle", exact: true }).click();
  await expect(createMenuProduct).toBeVisible();
  await expect(createPrice).toHaveValue("");
  await expect(createPriceError).toHaveCount(0);
  await createMenuProduct.getByRole("button", { name: "Vazgeç", exact: true }).click();
  expect(await countProducts()).toBe(productsBeforeCreate + 1);

  await page.getByRole("button", { name: "Müşteri İşleri", exact: true }).click();
  expect(await page.locator(".content").evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.getByRole("heading", { name: "Müşteri İşleri", exact: true })).toBeVisible();
  const customerWorkViews = page.getByRole("navigation", { name: "Müşteri işleri görünümü" });
  await expect(customerWorkViews.getByRole("button", { name: "Talepler" })).toBeVisible();
  await expect(customerWorkViews.getByRole("button", { name: "Müşteriler" })).toBeVisible();
  await expect(customerWorkViews.getByRole("button", { name: "Hazır Mesajlar" })).toBeVisible();
  await expect(customerWorkViews.getByRole("button")).toHaveText(["Müşteriler", "Talepler", "Hazır Mesajlar"]);
  await customerWorkViews.getByRole("button", { name: "Hazır Mesajlar" }).click();
  await expect(page.getByText("İletişim", { exact: true })).toHaveCount(0);
  await expect(page.locator(".message-mode-content:not(.is-hidden) .whatsapp-request-panel .panel-heading")).toContainText("Hazır Mesajlar");
  await expect(page.locator(".message-mode-content:not(.is-hidden) .whatsapp-request-panel .panel-heading .status-badge")).toHaveText(/\d+ kayıt/);
  await expect(page.locator(".message-mode-content:not(.is-hidden) .whatsapp-request-panel .panel-heading p")).toHaveCount(0);
  await expect(page.locator(".whatsapp-copy-panel").getByRole("heading", { name: "Smoke Misafir" })).toBeVisible();
  await expect(page.locator(".whatsapp-copy-panel .message-detail-category-label")).toHaveText("Hazır yanıt");
  await expect(page.locator(".whatsapp-copy-panel .panel-heading p")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hazır Mesajı Kopyala" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mesajı Sil" })).toBeVisible();
  await expect(page.getByRole("button", { name: "AI Cevap Hazırla", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Daha Kısa", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Yeniden hazırla", exact: true })).toHaveCount(0);
  await expect(page.locator(".message-mode-content:not(.is-hidden) .whatsapp-webview-frame")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Hazır Mesaj" })).toHaveAttribute("aria-selected", "true");
  expect(await page.getByLabel("Hazır WhatsApp mesajı").evaluate((field) => getComputedStyle(field).overflowY)).toBe("auto");
  await page.screenshot({ path: "artifacts/screenshots/desktop-messages-safe-mode.png", fullPage: true });
  await page.getByRole("tab", { name: "WhatsApp", exact: true }).click();
  await expect(page.locator(".whatsapp-send-status")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Smoke Misafir" })).toBeVisible();
  const webControlBar = page.locator(".whatsapp-web-control-bar");
  await expect(webControlBar).toContainText("+90 532 123 45 67");
  await expect(webControlBar.getByText("Hazır mesaj var", { exact: true })).toBeVisible();
  await expect(webControlBar.getByRole("button", { name: "Hazır Mesajı Kopyala" })).toBeVisible();
  await expect(webControlBar.getByRole("button", { name: "Müşteri Numarasına Git" })).toBeVisible();
  await expect(webControlBar.getByRole("button", { name: "Dışarıda Aç" })).toBeVisible();
  await expect(webControlBar.getByRole("button", { name: "Güvenli Moda Dön" })).toBeVisible();
  await expect(webControlBar.getByRole("button", { name: "Gönderildi Olarak İşaretle" })).toBeVisible();
  await expect(page.locator(".whatsapp-webview-frame")).toBeVisible();
  await expect(page.locator(".whatsapp-webview")).toHaveAttribute("src", "https://web.whatsapp.com/");
  await expect(page.locator(".whatsapp-webview")).toHaveAttribute("partition", "persist:yardimci-whatsapp");
  expect(readFileSync("apps/desktop-app/src/components/messages/MessageWorkspaces.tsx", "utf8")).toContain("allowpopups");
  await expect(page.locator(".whatsapp-webview")).toHaveAttribute("webpreferences", "contextIsolation=yes,nodeIntegration=no");
  await page.locator(".whatsapp-webview").evaluate((element) => { element.dataset.persistenceMarker = "webview-kept-alive"; });
  await webControlBar.getByRole("button", { name: "Güvenli Moda Dön" }).click();
  await expect(page.getByRole("tab", { name: "Hazır Mesaj" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".message-mode-content.is-hidden .whatsapp-webview")).toHaveCount(1);
  await page.getByRole("tab", { name: "WhatsApp", exact: true }).click();
  await expect(page.locator(".whatsapp-webview")).toHaveAttribute("data-persistence-marker", "webview-kept-alive");
  await page.getByRole("button", { name: "Ana Ekran", exact: true }).click();
  // Page navigation commits in a React transition. Finish leaving Customer Work
  // before clicking its sidebar entry; otherwise the pending exit can win later.
  await expect(page.getByRole("button", { name: "Ana Ekran", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Müşteri İşleri", exact: true }).click();
  await expect(page.getByRole("button", { name: "Müşteri İşleri", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Müşteri İşleri", exact: true })).toBeVisible();
  await expect(customerWorkViews.getByRole("button", { name: "Müşteriler", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".whatsapp-webview")).toBeHidden();
  // This click swaps the customer page for the persistent WhatsApp page, unmounting
  // the source navigation in the same React commit. Dispatch the click once rather
  // than retrying Playwright's actionability sequence against a detached button.
  await customerWorkViews.getByRole("button", { name: "Hazır Mesajlar", exact: true }).dispatchEvent("click");
  await expect(customerWorkViews.getByRole("button", { name: "Hazır Mesajlar", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".persistent-customer-messages-page.is-active .whatsapp-webview")).toBeVisible();
  await expect(page.getByRole("tab", { name: "WhatsApp" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".whatsapp-webview:visible")).toHaveAttribute("data-persistence-marker", "webview-kept-alive");

  expect(await page.locator(".whatsapp-webview:visible").evaluate((element) => getComputedStyle(element).display)).toBe("flex");
  await expectWhatsAppToFillWorkspace(page);
  await page.screenshot({ path: "artifacts/screenshots/desktop-whatsapp-workspace.png", fullPage: true });
  await page.getByRole("button", { name: "Müşteri Numarasına Git" }).click();
  await expect(page.locator(".whatsapp-webview")).toHaveAttribute(
    "src",
    /^https:\/\/web\.whatsapp\.com\/send\?phone=905321234567&text=/
  );
  await page.getByRole("button", { name: "Gönderildi Olarak İşaretle" }).click();
  await expect(page.locator(".confirm-dialog")).toContainText("Bu işlem WhatsApp'a mesaj göndermez.");
  await expect(page.locator(".confirm-dialog")).toContainText("yalnızca yerel kaydı tamamlandı olarak işaretler");
  await page.locator(".confirm-dialog").getByRole("button", { name: "Gönderildi", exact: true }).click();


  const conversionPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await conversionPage.addInitScript(({ setupData, dashboardData, capabilitySnapshot }) => {
    const uiPreferencesKey = "yardimci-asistan.ui-preferences";
    if (window.localStorage.getItem(uiPreferencesKey) === null) {
      window.localStorage.setItem(uiPreferencesKey, JSON.stringify({ version: 2, scheme: "light", density: "compact", scale: 1, accent: "coral", font: "plex", motion: "system" }));
    }
    let currentDashboardData = dashboardData;
    window.__identityAnalysisCalls = [];
    window.yardimciDesktop = {
      getBusinessCapabilitySnapshot: async () => capabilitySnapshot,
      getBootstrapData: async () => ({
        appName: "Yardımcı Asistan",
        version: "0.1.0",
        platform: "linux",
        syncSettings: {
          webModuleUrl: setupData.webModuleUrl,
          hasSyncSecret: true
        },
        databasePath: "/tmp/yardimci-asistan.sqlite",
        userDataPath: "/tmp/yardimci-asistan",
        backupPath: "/tmp/yardimci-asistan/backups",
        setup: setupData
      }),
      getDashboardData: async () => currentDashboardData,
      getSetupData: async () => setupData,
      getKbsSettings: async () => ({ enabled: false, provider: "egm", facilityCode: "", username: "", authorizedIdentityNumber: "", passwordConfigured: false }),
      saveKbsSettings: async (input) => ({ ok: true, message: "KBS smoke ayarları kaydedildi.", settings: { enabled: input.enabled, provider: input.provider, facilityCode: input.facilityCode, username: input.username, authorizedIdentityNumber: input.authorizedIdentityNumber, passwordConfigured: Boolean(input.password) } }),
      testKbsConnection: async () => ({ ok: true, message: "KBS smoke bağlantısı hazır.", provider: "egm", credentialsVerified: false, requiresWebLogin: true, portalUrl: "https://kbs.egm.gov.tr" }),
      getGoogleReviewsSettings: async () => ({ enabled: false, placeId: "", apiKeyConfigured: false, lastPublishedAt: "", publicationPending: false }),
      saveGoogleReviewsSettings: async (input) => ({
        ok: true,
        message: "Google yorumları ayarları kaydedildi.",
        settings: { enabled: input.enabled, placeId: input.placeId, apiKeyConfigured: Boolean(input.apiKey), lastPublishedAt: "", publicationPending: false }
      }),
      testGoogleReviewsConnection: async () => ({ ok: true, message: "Google Places bağlantısı doğrulandı.", name: "Smoke İşletme", rating: 4.8, userRatingCount: 12 }),
      getSyncStatus: async () => ({
        enabled: true,
        clientId: "renderer-smoke",
        requestCursor: 0,
        acknowledgedCursor: 0,
        lastAttemptAt: "2026-07-18T12:35:00+03:00",
        lastSuccessAt: "2026-07-18T12:00:00+03:00",
        lastError: "",
        consecutiveFailures: 0,
        pendingJobs: 0,
        nextRetryAt: "",
        phase: "idle",
        message: "Senkron hazır."
      }),
      onSyncStatusChanged: () => () => {},
      saveInitialSetup: async () => ({ ok: false, message: "smoke" }),
      createManualRequest: async (input) => {
        const savedId = "request_manual_smoke_001";
        const request = {
          id: savedId,
          customer_id: "customer_manual_smoke_001",
          source: "manual",
          request_type: input.requestType,
          status: "new",
          customer_name: input.customerName,
          customer_phone: "+905553334466",
          date_text: input.dateText,
          start_date: input.startDate,
          end_date: input.endDate,
          time: input.time,
          guest_count: input.guestCount,
          adult_count: 0,
          child_count: 0,
          message: input.message,
          ai_summary: "",
          ai_suggested_reply: "",
          whatsapp_message: "Merhaba, talebinizi aldık. Detayları kontrol edip size dönüş yapacağız.",
          assigned_to: "",
          priority: input.priority,
          sync_status: "local_only",
          created_at: "2026-07-11T10:20:00+03:00",
          updated_at: "2026-07-11T10:20:00+03:00"
        };
        currentDashboardData = {
          ...currentDashboardData,
          summary: {
            ...currentDashboardData.summary,
            newRequests: currentDashboardData.summary.newRequests + 1,
            waitingRequests: currentDashboardData.summary.waitingRequests + 1
          },
          requests: [request, ...currentDashboardData.requests],
          customers: [
            ...currentDashboardData.customers,
            {
              id: request.customer_id,
              fullName: input.customerName,
              phone: request.customer_phone,
              email: "",
              source: "manual",
              notes: input.message,
              tags: ["manuel", "talep"],
              lastContactAt: "2026-07-11T10:20:00+03:00",
              identityType: "",
              identityNumber: "",
              nationality: "",
              birthDate: "",
              gender: "",
              documentSerialNumber: "",
              documentExpiryDate: "",
              birthPlace: "",
              motherName: "",
              fatherName: "",
              issuingAuthority: "",
              address: "",
              requestCount: 1,
              reservationCount: 0,
              stayCount: 0,
              updatedAt: "2026-07-11T10:20:00+03:00"
            }
          ]
        };
        return {
          ok: true,
          message: "Manuel talep kaydedildi.",
          savedId,
          dashboardData: currentDashboardData
        };
      },
      analyzeIdentityImage: async (input) => {
        window.__identityAnalysisCalls.push({
          fileName: input.fileName,
          mimeType: input.mimeType,
          byteLength: input.bytes.byteLength
        });
        return {
          ok: true,
          message: "Kimlik bilgileri okundu. Kaydetmeden önce kontrol edin.",
          analysis: {
            document_type: "passport",
            document_side: "front",
            confidence: "high",
            fields: {
              full_name: "Kimlik Smoke",
              identity_type: "passport",
              identity_number: "U12345678",
              nationality: "Türkiye",
              birth_date: "1991-04-23",
              gender: "female",
              document_serial_number: "PASS-7788",
              document_expiry_date: "2031-04-23",
              birth_place: "Muğla",
              mother_name: "",
              father_name: "",
              issuing_authority: "Türkiye Cumhuriyeti",
              address: ""
            },
            warnings: []
          }
        };
      },
      saveCustomer: async (input) => {
        const savedId = input.id || "customer_manual_card_smoke_001";
        const now = "2026-07-28T12:00:00+03:00";
        const previous = currentDashboardData.customers.find((customer) => customer.id === savedId);
        const savedCustomer = {
          id: savedId,
          fullName: input.fullName,
          phone: input.phone,
          email: input.email,
          source: previous?.source || "manual",
          notes: input.notes,
          tags: input.tags,
          lastContactAt: previous?.lastContactAt || now,
          identityType: input.identityType,
          identityNumber: input.identityNumber,
          nationality: input.nationality,
          birthDate: input.birthDate,
          gender: input.gender,
          documentSerialNumber: input.documentSerialNumber,
          documentExpiryDate: input.documentExpiryDate,
          birthPlace: input.birthPlace,
          motherName: input.motherName,
          fatherName: input.fatherName,
          issuingAuthority: input.issuingAuthority,
          address: input.address,
          requestCount: previous?.requestCount || 0,
          reservationCount: previous?.reservationCount || 0,
          stayCount: previous?.stayCount || 0,
          updatedAt: now
        };
        currentDashboardData = {
          ...currentDashboardData,
          customers: previous
            ? currentDashboardData.customers.map((customer) => customer.id === savedId ? savedCustomer : customer)
            : [savedCustomer, ...currentDashboardData.customers]
        };
        return {
          ok: true,
          message: previous ? "Müşteri kartı güncellendi." : "Müşteri kartı oluşturuldu.",
          savedId,
          dashboardData: currentDashboardData
        };
      },
      assignCustomerRoom: async (input) => {
        const savedId = "customer_room_stay_smoke_001";
        const customer = currentDashboardData.customers.find((item) => item.id === input.customerId);
        const room = currentDashboardData.rooms.find((item) => item.id === input.roomId);
        const now = "2026-07-28T12:10:00+03:00";
        const guestIds = Array.isArray(input.guestCustomerIds) && input.guestCustomerIds.length ? input.guestCustomerIds : [customer.id];
        const stay = {
          id: savedId,
          customerId: guestIds[0],
          customerName: customer.fullName,
          customerPhone: customer.phone,
          roomId: room.id,
          roomName: room.name,
          roomNumber: room.number,
          reservationId: "",
          status: input.status,
          checkInDate: input.checkInDate,
          checkOutDate: input.checkOutDate,
          guestCount: guestIds.length,
          notes: input.notes,
          source: "desktop_manual",
          checkedInAt: input.status === "checked_in" ? now : "",
          checkedOutAt: "",
          createdAt: now,
          updatedAt: now,
          guests: guestIds.map((customerId, index) => ({ id: `guest-smoke-${index}`, customerId, customerName: customer.fullName,
            status: input.status, checkedInAt: input.status === "checked_in" ? now : "", checkedOutAt: "", identityReady: true })),
          pendingNotificationCount: 0
        };
        currentDashboardData = {
          ...currentDashboardData,
          customerRoomStays: [stay, ...currentDashboardData.customerRoomStays],
          customers: currentDashboardData.customers.map((item) => item.id === customer.id
            ? { ...item, stayCount: item.stayCount + 1, updatedAt: now }
            : item),
          rooms: currentDashboardData.rooms.map((item) => item.id === room.id
            ? { ...item, status: input.status === "checked_in" ? "occupied" : "reserved", updatedAt: now }
            : item)
        };
        return {
          ok: true,
          message: "Misafir girişi tamamlandı.",
          savedId,
          dashboardData: currentDashboardData
        };
      },
      checkInStay: async stayId => window.yardimciDesktop.updateCustomerRoomStayStatus({ stayId, status: "checked_in" }),
      checkoutStay: async stayId => window.yardimciDesktop.updateCustomerRoomStayStatus({ stayId, status: "checked_out" }),
      checkoutStayWithSettlement: async ({ stayId, roomId, settleCurrent, previousFolioIds }) => {
        const stay = currentDashboardData.customerRoomStays.find(item => item.id === stayId);
        if (stay?.roomId !== roomId || settleCurrent || previousFolioIds.length) {
          throw new Error("This no-folio fixture only supports departure in the persisted room.");
        }
        const result = await window.yardimciDesktop.updateCustomerRoomStayStatus({ stayId, status: "checked_out" });
        return result.ok ? { ...result, settlements: [] } : result;
      },
      updateCustomerRoomStayStatus: async ({ stayId, status }) => {
        const stay = currentDashboardData.customerRoomStays.find((item) => item.id === stayId);
        const now = "2026-07-28T12:20:00+03:00";
        const roomStatus = status === "checked_in"
          ? "occupied"
          : status === "planned"
            ? "reserved"
            : status === "checked_out"
              ? "cleaning"
              : "available";
        currentDashboardData = {
          ...currentDashboardData,
          customerRoomStays: currentDashboardData.customerRoomStays.map((item) => item.id === stayId
            ? {
                ...item,
                status,
                checkedInAt: status === "checked_in" ? (item.checkedInAt || now) : item.checkedInAt,
                checkedOutAt: status === "checked_out" ? now : "",
                updatedAt: now
              }
            : item),
          rooms: currentDashboardData.rooms.map((room) => room.id === stay.roomId
            ? { ...room, status: roomStatus, updatedAt: now }
            : room)
        };
        return {
          ok: true,
          message: "Konaklama durumu güncellendi.",
          savedId: stayId,
          dashboardData: currentDashboardData
        };
      },
      convertRequestToReservation: async (requestId) => {
        currentDashboardData = {
          ...currentDashboardData,
          summary: {
            ...currentDashboardData.summary,
            newRequests: 0,
            waitingRequests: 0
          },
          requests: currentDashboardData.requests.map((request) => request.id === requestId ? { ...request, status: "converted_to_reservation" } : request)
        };
        return {
          ok: true,
          message: "Talep rezervasyona çevrildi ve onaylandı.",
          reservationId: "reservation_smoke_001",
          dashboardData: currentDashboardData
        };
      },
      updateRequestStatus: async ({ requestId, status }) => {
        currentDashboardData = {
          ...currentDashboardData,
          requests: currentDashboardData.requests.map((request) => request.id === requestId ? { ...request, status } : request)
        };
        return { ok: true, message: "Talep durumu güncellendi.", dashboardData: currentDashboardData };
      },
      updateRoomStatus: async ({ roomId, status }) => ({
        ok: true,
        message: "Oda durumu güncellendi.",
        dashboardData: {
          ...dashboardData,
          rooms: dashboardData.rooms.map((room) => room.id === roomId ? { ...room, status } : room)
        }
      }),
      listTableOrders: async () => [],
      getActiveTableOrder: async () => null,
      updateTableStatus: async ({ tableId, status }) => ({
        ok: true,
        message: "Masa durumu güncellendi.",
        dashboardData: {
          ...dashboardData,
          tables: dashboardData.tables.map((table) => table.id === tableId ? { ...table, status } : table)
        }
      }),
      updateReservationStatus: async ({ reservationId, status }) => ({
        ok: true,
        message: "Rezervasyon durumu güncellendi.",
        dashboardData: {
          ...dashboardData,
          reservations: dashboardData.reservations.map((reservation) => reservation.id === reservationId ? { ...reservation, status } : reservation)
        }
      }),
      updateDailyTaskStatus: async ({ taskId, status }) => ({
        ok: true,
        message: "Günlük iş durumu güncellendi.",
        dashboardData: {
          ...dashboardData,
          dailyTasks: dashboardData.dailyTasks.map((task) => task.id === taskId ? { ...task, status } : task)
        }
      }),
      createManualBackup: async () => {
        const backup = {
          id: "backup-smoke-001",
          createdAt: "2026-07-11T10:16:00+03:00",
          kind: "manual",
          folderName: "yardimci-asistan-smoke",
          folderPath: "/tmp/yardimci-asistan/backups/yardimci-asistan-smoke",
          databaseFileName: "yardimci-asistan.sqlite",
          imageCount: 0,
          sizeBytes: 4096
        };
        return {
          ok: true,
          message: "Yerel veritabanı yedeği oluşturuldu.",
          backupDirectory: "/tmp/yardimci-asistan/backups",
          backup,
          backups: [backup]
        };
      },
      createOwnerReplySuggestion: async (requestId) => {
        const suggestedReply = "Merhaba Smoke Misafir, talebinizi aldık. Müsaitlik ve fiyat bilgisi işletme sahibi tarafından kontrol edilip size dönüş yapılacaktır.";
        currentDashboardData = {
          ...currentDashboardData,
          requests: currentDashboardData.requests.map((request) =>
            request.id === requestId
              ? {
                  ...request,
                  ai_summary: "Smoke Misafir için balkonlu oda talebi.",
                  ai_suggested_reply: suggestedReply
                }
              : request
          ),
          preparedWhatsAppMessages: [
            ...(currentDashboardData.preparedWhatsAppMessages || []).filter((message) => message.requestId !== requestId),
            {
              id: `whatsapp_${requestId}`,
              requestId,
              customerName: "Smoke Misafir",
              customerPhone: "+905321234567",
              message: suggestedReply,
              status: "prepared",
              updatedAt: "2026-07-11T10:15:00+03:00"
            }
          ],
          summary: {
            ...currentDashboardData.summary,
            preparedWhatsAppMessages: (currentDashboardData.preparedWhatsAppMessages || []).some((message) => message.requestId === requestId)
              ? currentDashboardData.summary.preparedWhatsAppMessages
              : currentDashboardData.summary.preparedWhatsAppMessages + 1
          }
        };
        return {
          ok: true,
          message: "AI cevap taslağı yenilendi.",
          requestId,
          summary: "Smoke Misafir için balkonlu oda talebi.",
          suggestedReply,
          missingFields: [],
          dashboardData: currentDashboardData
        };
      },
      rewriteOwnerReplySuggestion: async ({ requestId, instructions }) => {
        const suggestedReply = `Merhaba Smoke Misafir, talebiniz düzenlendi (${instructions || "yeniden hazırla"}). Müsaitlik ve fiyat bilgisi kontrol edilip size dönüş yapılacaktır.`;
        currentDashboardData = {
          ...currentDashboardData,
          requests: currentDashboardData.requests.map((request) =>
            request.id === requestId
              ? { ...request, ai_suggested_reply: suggestedReply }
              : request
          ),
          preparedWhatsAppMessages: (currentDashboardData.preparedWhatsAppMessages || []).map((message) =>
            message.requestId === requestId ? { ...message, message: suggestedReply } : message
          )
        };
        return {
          ok: true,
          message: "Cevap taslağı yenilendi.",
          requestId,
          summary: "Smoke Misafir için balkonlu oda talebi.",
          suggestedReply,
          missingFields: [],
          dashboardData: currentDashboardData
        };
      },
      pullRequests: async () => ({ ok: true, count: 0, requests: [] }),
      markRequestsSynced: async () => ({ ok: true, count: 0 }),
      getRoomFolioData: async () => ({
        generatedAt: "",
        rooms: [],
        activeStays: [],
        folios: [],
        menuCategories: [],
        menuItems: []
      }),
      pushMenu: async () => ({ ok: true, category_count: 0, item_count: 0 }),
      pushAndroidSnapshot: async () => ({
        ok: true,
        message: "Android özeti yayınlandı.",
        published_at: "2026-07-11T10:17:00+03:00",
        updated_at: "2026-07-11T10:17:00+03:00",
        task_count: 2
      }),
      saveMenuCategory: async () => ({ ok: false, message: "smoke" }),
      saveMenuProductEntry: async () => ({ ok: false, message: "smoke" }),
      openExternal: async () => true
    };
  }, {
    setupData: { ...createSetupFixture(), setupRequired: false, syncSecret: "smoke-secret-12345" },
    dashboardData: createDashboardConversionFixture(),
    capabilitySnapshot: createBusinessCapabilitySnapshotFixture({ ...createSetupFixture(), setupRequired: false, syncSecret: "smoke-secret-12345" })
  });
  await conversionPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(conversionPage.locator("html")).toHaveAttribute("data-density", "compact");
  await conversionPage.getByRole("button", { name: "Ayarlar" }).click();
  await conversionPage.getByRole("button", { name: "Veriler", exact: true }).click();
  await expect(conversionPage.getByRole("button", { name: "Yedek Al" })).toBeVisible();
  await conversionPage.getByRole("button", { name: "Yedek Al" }).click();
  await expect(conversionPage.locator(".settings-data-maintenance-section .backup-row")).toHaveCount(1);
  await expect(conversionPage.locator(".settings-data-maintenance-section").getByText("yardimci-asistan-smoke", { exact: true })).toHaveCount(0);
  await conversionPage.keyboard.press("Escape");
  await expect(conversionPage.locator("#settings-data-button-panel")).toHaveCount(0);
  await openSettingsService(conversionPage, "settings-android");
  await expect(conversionPage.getByRole("heading", { name: "Telefonlar" })).toBeVisible();
  await expect(conversionPage.getByRole("button", { name: "Yenile", exact: true })).toBeVisible();
  await expect(conversionPage.getByRole("button", { name: "Android'e Yayınla" })).toHaveCount(0);
  await cancelSettingsService(conversionPage);
  await conversionPage.getByRole("button", { name: "Ana Ekran", exact: true }).click();
  await expect(conversionPage.getByRole("button", { name: "Rezervasyona Çevir" })).toHaveCount(0);
  await conversionPage.getByRole("button", { name: "Müşteri İşleri", exact: true }).click();
  await conversionPage.getByRole("navigation", { name: "Müşteri işleri görünümü" }).getByRole("button", { name: "Talepler", exact: true }).click();
  await expect(conversionPage.getByRole("button", { name: "AI Cevap Hazırla" })).toBeVisible();
  await expect(conversionPage.locator(".request-detail-panel").getByRole("button", { name: "WhatsApp'tan Yaz" })).toHaveCount(1);
  await expect(conversionPage.locator(".request-detail-panel").getByRole("button", { name: "WhatsApp'a Hazırla" })).toHaveCount(0);
  await expect(conversionPage.locator(".request-detail-panel").getByRole("button", { name: "Müşteriyi Ara" })).toHaveCount(0);
  await conversionPage.getByRole("button", { name: "AI Cevap Hazırla" }).click();
  await expect(conversionPage.getByLabel("AI cevap taslağı")).toHaveValue(/Merhaba Smoke Misafir, talebinizi aldık/);
  await conversionPage.getByRole("button", { name: "Yeniden hazırla" }).click();
  await expect(conversionPage.getByText("Cevap taslağı yenilendi. Göndermeden önce kontrol edin.")).toBeVisible();
  await expect(conversionPage.getByLabel("AI cevap taslağı")).toHaveValue(/talebiniz düzenlendi/);
  await conversionPage.getByRole("button", { name: "WhatsApp'tan Yaz" }).click();
  await expect(conversionPage.getByLabel("Hazır WhatsApp mesajı")).toHaveValue(/talebiniz düzenlendi/);
  await expect(conversionPage.getByRole("navigation", { name: "Müşteri işleri görünümü" }).getByRole("button", { name: "Hazır Mesajlar" })).toBeVisible();
  await expect(conversionPage.getByRole("button", { name: "Daha Kısa", exact: true })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Yeniden hazırla", exact: true })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "AI Cevap Hazırla", exact: true })).toHaveCount(0);
  await conversionPage.getByRole("navigation", { name: "Müşteri işleri görünümü" }).getByRole("button", { name: "Talepler" }).click();
  await conversionPage.getByRole("button", { name: /Smoke Misafir Pansiyon rezervasyonu/ }).click();
  await expect(conversionPage.getByRole("button", { name: "Rezervasyona Çevir" })).toBeVisible();
  await conversionPage.getByRole("button", { name: "Rezervasyona Çevir" }).click();
  await expect(conversionPage.getByLabel("Talep yönetimi").getByText("Rezervasyona çevrildi", { exact: true })).toBeVisible();
  await expect(conversionPage.getByText("Talep rezervasyona çevrildi ve onaylandı.")).toBeVisible();
  await conversionPage.getByRole("button", { name: "Müşteri İşleri", exact: true }).click();
  await expect(conversionPage.getByRole("heading", { name: "Müşteri İşleri" })).toBeVisible();
  await conversionPage.getByRole("navigation", { name: "Müşteri işleri görünümü" }).getByRole("button", { name: "Talepler", exact: true }).click();
  await expect(conversionPage.getByRole("button", { name: "Rezervasyonu Aç" })).toBeVisible();
  await expect(conversionPage.getByRole("button", { name: "Rezervasyona Çevir" })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Cevaplandı İşaretle" })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Reddet", exact: true })).toHaveCount(0);
  await expect(conversionPage.getByRole("dialog", { name: "Yeni talimat" })).toHaveCount(0);
  await conversionPage.getByRole("button", { name: "Talimat Ekle" }).click();
  const manualRequestDrawer = conversionPage.getByRole("dialog", { name: "Yeni talimat" });
  await expect(manualRequestDrawer).toBeVisible();
  await manualRequestDrawer.getByLabel("Ad soyad").fill("Manuel Smoke");
  await manualRequestDrawer.getByLabel("Telefon").fill("0555 333 44 66");
  await manualRequestDrawer.getByLabel("Tarih notu").fill("Bu akşam");
  await manualRequestDrawer.getByLabel("Kişi sayısı").fill("3");
  await manualRequestDrawer.getByLabel("Not", { exact: true }).fill("Telefonla alınan bahçe masası talebi.");
  await expect(manualRequestDrawer.locator("details")).toHaveCount(0);
  await expect(manualRequestDrawer.getByText("Telefonla veya yüz yüze gelen talebi kaydedin.", { exact: true })).toHaveCount(0);
  await chooseDate(manualRequestDrawer, "Giriş tarihi", "2026-07-18");
  await chooseTime(manualRequestDrawer, "Saat", "21:00");
  await manualRequestDrawer.getByRole("button", { name: "Talimatı Kaydet" }).click();
  await expect(manualRequestDrawer).toHaveCount(0);
  await expect(conversionPage.getByRole("heading", { name: "Manuel Smoke" })).toBeVisible();
  await conversionPage.getByRole("button", { name: "Reddet", exact: true }).click();
  await expect(conversionPage.getByRole("button", { name: "Rezervasyona Çevir" })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Cevaplandı İşaretle" })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Reddet", exact: true })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Yeniden Aç" })).toBeVisible();
  await expect(conversionPage.getByRole("button", { name: "Talebi Sil" })).toBeVisible();
  await expect(conversionPage.locator(".request-more-actions")).toHaveCount(0);
  await expect(conversionPage.locator(".request-detail-header-actions")).toBeVisible();
  await conversionPage.getByRole("button", { name: "Yeniden Aç" }).click();
  await conversionPage.getByRole("button", { name: "Cevaplandı İşaretle" }).click();
  await expect(conversionPage.getByRole("button", { name: "Cevaplandı İşaretle" })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Reddet", exact: true })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Rezervasyona Çevir" })).toHaveCount(0);
  await expect(conversionPage.getByRole("button", { name: "Yeniden Aç" })).toBeVisible();
  await conversionPage.getByRole("navigation", { name: "Müşteri işleri görünümü" }).getByRole("button", { name: "Müşteriler" }).click();
  await expect(conversionPage.getByLabel("Müşteri yönetimi", { exact: true })).toBeVisible();
  await conversionPage.locator(".customer-record-row").first().click();
  const smokeCustomerWorkspace = conversionPage.getByRole("dialog", { name: "Smoke Misafir" });
  await expect(smokeCustomerWorkspace).toBeVisible();
  await expect(smokeCustomerWorkspace.getByRole("button", { name: "Müşteriyi Sil" })).toBeVisible();
  await smokeCustomerWorkspace.getByRole("button", { name: "Geçmiş", exact: true }).click();
  await expect(smokeCustomerWorkspace.getByRole("group", { name: "Müşteri geçmişi filtresi" })).toBeVisible();
  await expect(smokeCustomerWorkspace.getByText("Balkonlu oda için bilgi almak istiyorum.")).toBeVisible();
  await expect(smokeCustomerWorkspace.getByRole("button", { name: "Odayı Aç", exact: true })).toHaveCount(0);
  await smokeCustomerWorkspace.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  await conversionPage.getByLabel("Ara", { exact: true }).fill("Smoke");
  await conversionPage.getByRole("button", { name: "Restoran" }).click();
  await expect(conversionPage.getByRole("heading", { name: "Restoran" })).toBeVisible();
  await expect(conversionPage.getByRole("region", { name: "Restoran operasyonları", exact: true })).toBeVisible();
  await expect(conversionPage.getByRole("region", { name: "Restoran günlük işleri", exact: true })).toBeVisible();
  await expect(conversionPage.getByText("Oda 101 giriş hazırlığı")).toHaveCount(0);
  const restaurantTasks = conversionPage.getByRole("region", { name: "Restoran günlük işleri", exact: true });
  const gardenTask = restaurantTasks.locator(".task-record-row").filter({ hasText: "Bahçe masası kontrolü" });
  await expect(gardenTask).toBeVisible();
  await gardenTask.getByRole("button", { name: "Tamamla", exact: true }).click();
  await expect(gardenTask).toHaveCount(0);
  await conversionPage.getByRole("button", { name: "Smoke Bahçe Masası masasını aç" }).click();
  const smokeTableWorkspace = conversionPage.locator(".workspace-page-frame");
  await expect(smokeTableWorkspace).toBeVisible();
  const smokeTableStatus = smokeTableWorkspace.getByRole("group", { name: "Smoke Bahçe Masası durumunu değiştir", exact: true });
  await expect(smokeTableStatus.getByRole("button", { name: "Boş", exact: true })).toHaveAttribute("aria-pressed", "true");
  await smokeTableStatus.getByRole("button", { name: "Hesap", exact: true }).click();
  await expect(smokeTableStatus.getByRole("button", { name: "Hesap", exact: true })).toHaveAttribute("aria-pressed", "true");
  await smokeTableWorkspace.getByRole("button", { name: "Masa çalışma alanını kapat", exact: true }).click();
  await expect(smokeTableWorkspace).toHaveCount(0);
  await conversionPage.getByRole("button", { name: "Pansiyon" }).click();
  await expect(conversionPage.getByRole("heading", { name: "Pansiyon" })).toBeVisible();
  const roomCard = conversionPage.getByRole("button", { name: "Smoke Balkonlu Oda odasını aç" });
  await expect(roomCard).toBeVisible();
  await expect(roomCard.getByRole("combobox")).toHaveCount(0);
  await roomCard.click();
  const roomWorkspace = conversionPage.locator(".workspace-page-frame");
  await expect(roomWorkspace).toBeVisible();
  const roomStatus = roomWorkspace.getByRole("group", { name: "Fiziksel oda durumu", exact: true });
  await roomStatus.getByRole("button", { name: "Bakımda", exact: true }).click();
  await expect(roomStatus.getByRole("button", { name: "Bakımda", exact: true })).toHaveAttribute("aria-pressed", "true");
  await roomWorkspace.getByRole("button", { name: "Çalışma alanını kapat" }).click();
  await expect(roomWorkspace).toHaveCount(0);
  await expect(conversionPage.getByRole("article").filter({ has: roomCard })).toContainText("Bakımda");
  await expect(conversionPage.getByText("Oda 101 giriş hazırlığı")).toBeVisible();
  const reservationWorkspace = conversionPage.getByLabel("Rezervasyon yönetimi");
  await expect(reservationWorkspace.getByLabel("Durum")).toBeVisible();
  await expect(reservationWorkspace.getByText("GG.AA.YYYY", { exact: true })).toBeVisible();
  await expect(reservationWorkspace.locator(".localized-date-display")).toHaveCount(0);
  await chooseDate(reservationWorkspace, "Tarih", "2026-07-18");
  await expect(reservationWorkspace.getByRole("button", { name: "Tarih", exact: true })).toHaveAttribute("data-picker-value", "2026-07-18");
  await expect(conversionPage.getByText(/1\s*görünen kayıt/)).toBeVisible();
  await reservationWorkspace.getByRole("group", { name: "Durum", exact: true })
    .getByRole("button", { name: "Onay bekleyen", exact: true }).click();
  await expect(conversionPage.getByText(/1\s*görünen kayıt/)).toBeVisible();
  await reservationWorkspace.getByRole("button", { name: "Onayla", exact: true }).click();
  await expect(conversionPage.getByText(/0\s*görünen kayıt/)).toBeVisible();
  await expect(reservationWorkspace.getByText("Filtreye uygun rezervasyon yok.", { exact: true })).toBeVisible();
  await conversionPage.getByRole("button", { name: "Filtreyi Temizle" }).click();
  await expect(conversionPage.getByRole("button", { name: "WhatsApp'a Hazırla", exact: true }).first()).toBeVisible();
  await conversionPage.getByRole("button", { name: "Müşteri İşleri", exact: true }).click();
  await conversionPage.getByRole("navigation", { name: "Müşteri işleri görünümü" }).getByRole("button", { name: "Müşteriler" }).click();
  await conversionPage.getByRole("button", { name: "Yeni Müşteri" }).click();
  const customerEditor = conversionPage.getByRole("dialog", { name: "Yeni müşteri ekle" });
  await expect(customerEditor).toBeVisible();
  await customerEditor.locator('input[type="file"]').setInputFiles({
    name: "smoke-identity.png",
    mimeType: "image/png",
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  });
  await expect(customerEditor.getByLabel("Ad soyad")).toHaveValue("Kimlik Smoke");
  await expect(customerEditor.getByLabel("Kimlik / pasaport no")).toHaveValue("U12345678");
  await expect(customerEditor.getByRole("button", { name: "Doğum tarihi", exact: true })).toHaveAttribute("data-picker-value", "1991-04-23");
  await customerEditor.getByLabel("Telefon").fill("+905551112244");
  await customerEditor.getByLabel("Not", { exact: true }).fill("Resepsiyondan manuel oluşturulan müşteri kartı.");
  await customerEditor.getByRole("button", { name: "Müşteri Kartını Kaydet", exact: true }).click();
  await expect(customerEditor).toHaveCount(0);
  await expect(conversionPage.getByRole("dialog")).toHaveCount(0);
  const createdCustomerRow = conversionPage.locator(".customer-record-row").filter({ hasText: "Kimlik Smoke" });
  await expect(createdCustomerRow).toBeVisible();
  await expect.poll(() => conversionPage.evaluate(() => window.__identityAnalysisCalls.length)).toBe(1);

  await conversionPage.getByRole("button", { name: "Pansiyon", exact: true }).click();
  await expect(conversionPage.getByRole("heading", { name: "Pansiyon" })).toBeVisible();
  await expect(conversionPage.getByRole("region", { name: "Pansiyon operasyonları", exact: true })).toBeVisible();
  const assignableRoomCard = conversionPage.getByRole("button", { name: "Smoke Aile Odası odasını aç" });
  await assignableRoomCard.click();
  const stayWorkspace = conversionPage.locator(".workspace-page-frame");
  await expect(stayWorkspace).toBeVisible();
  await chooseDate(stayWorkspace, "Giriş tarihi", "2026-08-01");
  await chooseDate(stayWorkspace, "Çıkış tarihi", "2026-08-03");
  await stayWorkspace.getByRole("button", { name: /boş yatak/ }).first().click();
  await chooseSearchSelect(stayWorkspace, "Misafir ekle", /^Kimlik Smoke(?:\s|$)/);
  await stayWorkspace.getByText("Giriş notu", { exact: true }).click();
  await stayWorkspace.getByLabel("Giriş notu").fill("Manuel resepsiyon ataması.");
  const directEntryForm = stayWorkspace.getByRole("form", { name: "Misafir girişi", exact: true });
  await directEntryForm.getByRole("button", { name: /Giriş Yap/, exact: false }).click();
  await expect(stayWorkspace.getByText("Kimlik Smoke").first()).toBeVisible();
  await stayWorkspace.getByRole("button", { name: "Çıkışı Tamamla", exact: true }).click();
  await conversionPage.getByRole("dialog", { name: "Misafir çıkışı", exact: true })
    .getByRole("button", { name: "Tüm Misafirlerin Çıkışını Yap", exact: true }).click();
  await stayWorkspace.getByRole("button", { name: "Geçmiş", exact: true }).click();
  await expect(stayWorkspace.getByRole("region", { name: "Oda geçmişi" })).toContainText("Çıkış yaptı");
  await stayWorkspace.getByRole("button", { name: "Çalışma alanını kapat" }).click();
  await expect(conversionPage.getByRole("article").filter({ has: assignableRoomCard })
    .getByRole("group", { name: /fiziksel durumunu değiştir$/ })
    .getByRole("button", { name: "Temizlik", exact: true })).toHaveAttribute("aria-pressed", "true");

  const compactPage = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await compactPage.addInitScript({ content: `window.__catalogPageFixture = ${catalogPageFixture.toString()};` });
  await compactPage.addInitScript(({ setupData, dashboardData, capabilitySnapshot }) => {
    const uiPreferencesKey = "yardimci-asistan.ui-preferences";
    if (window.localStorage.getItem(uiPreferencesKey) === null) {
      window.localStorage.setItem(uiPreferencesKey, JSON.stringify({ version: 2, scheme: "light", density: "compact", scale: 1, accent: "coral", font: "plex", motion: "system" }));
    }
    let tableOrders = [];
    let currentDashboardData = dashboardData;
    const products = currentDashboardData.menu.items.map(item => ({ id: item.product_id, name: item.name, description: item.description,
      categoryId: "", salePrice: item.price, purchasePrice: 0, currency: item.currency, unit: item.stock_unit, trackInventory: false,
      minimumQuantity: 0, isActive: true, sku: "", barcode: "", brand: "", taxRate: 0, quickAccessEnabled: false,
      dealerPriceA: null, dealerPriceB: null, imageSourceUrl: "", imageAssetPath: "" }));
    const snapshot = () => ({ ...currentDashboardData, revision: ++currentDashboardData.revision,
      tableOperations: currentDashboardData.tables.map(table => ({ tableId: table.id,
        order: tableOrders.find(order => order.tableId === table.id && ["open", "preparing", "served", "payment"].includes(order.status)) ?? null,
        reservations: currentDashboardData.reservations.filter(item => item.tableIds.includes(table.id) && ["pending", "approved"].includes(item.status))
      })) });
    window.__tableOrderAdds = [];
    window.__tableOrderNoteSaves = [];
    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const saveOrder = (order, message) => {
      const subtotal = order.items.reduce((sum, item) => sum + item.lineTotal, 0);
      const saved = {
        ...order,
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        subtotal,
        total: subtotal,
        updatedAt: new Date().toISOString()
      };
      tableOrders = tableOrders.some((item) => item.id === saved.id)
        ? tableOrders.map((item) => item.id === saved.id ? saved : item)
        : [saved, ...tableOrders];
      return { ok: true, message, order: saved, dashboardData: snapshot() };
    };
    const withTableStatus = (result, tableId, status) => {
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
      return { ...result, dashboardData: snapshot() };
    };
    const createOrder = (tableId) => {
      const table = currentDashboardData.tables.find((item) => item.id === tableId);
      const now = new Date().toISOString();
      return {
        id: `order_${tableId}`,
        tableId,
        tableName: table.name,
        status: "open",
        openedAt: now,
        closedAt: "",
        subtotal: 0,
        discountTotal: 0,
        total: 0,
        note: "",
        itemCount: 0,
        items: [],
        createdAt: now,
        updatedAt: now
      };
    };
    let compactProfile = {
      description: "Kompakt smoke açıklaması",
      latitude: null,
      longitude: null,
      directionsNote: "",
      checkInTime: "14:00",
      checkOutTime: "11:00",
      breakfastStartTime: "08:00",
      breakfastEndTime: "10:00",
      features: [],
      policyNote: "",
      paymentNote: "",
      languages: ["Türkçe"],
      socialLinks: []
    };
    let compactLayout = {
      capabilities: {
        rooms: capabilitySnapshot.enabledCapabilities.includes("accommodation.rooms"),
        tables: capabilitySnapshot.enabledCapabilities.includes("food_service.tables")
      },
      rooms: currentDashboardData.rooms.map((room, index) => ({
        id: room.id,
        name: room.name,
        number: room.number ?? "",
        capacity: room.capacity ?? 2,
        bedInfo: room.bedInfo ?? "",
        floor: room.floor ?? "",
        features: room.features ?? [],
        description: room.description ?? "",
        priceNote: room.priceNote ?? "",
        nightlyPriceMinor: room.nightlyPriceMinor ?? 0,
        currency: room.currency ?? "TRY",
        sortOrder: index + 1,
        outOfService: room.status === "out_of_service",
        canRemove: true,
        removeBlockReason: ""
      })),
      tableCategories: [...new Set(currentDashboardData.tables.map((table) => table.area || "Genel"))].map((name) => ({
        name,
        tableCount: currentDashboardData.tables.filter((table) => (table.area || "Genel") === name).length
      })),
      tables: currentDashboardData.tables.map((table, index) => ({
        id: table.id,
        name: table.name,
        area: table.area || "Genel",
        capacity: table.capacity ?? 4,
        description: "",
        features: [],
        smokingPolicy: "unspecified",
        sortOrder: index + 1
      })),
      publication: { rooms: false, tables: false }
    };
    window.yardimciDesktop = {
      commerce: {
        listProducts: async options => window.__catalogPageFixture(products, options),
        listCategories: async () => [],
        listProductPhotos: async productId => ({ productId, revision: "compact-fixture", photos: [], sourceUrl: "", sourceLicense: "" }),
        getProductImageDataUrl: async id => products.find(product => product.id === id)?.imageSourceUrl ?? ""
      },
      getBusinessCapabilitySnapshot: async () => capabilitySnapshot,
      getBootstrapData: async () => ({
        appName: "Yardımcı Asistan",
        version: "0.1.0",
        platform: "linux",
        syncSettings: { webModuleUrl: setupData.webModuleUrl, hasSyncSecret: true },
        databasePath: dashboardData.databasePath,
        userDataPath: "/tmp/yardimci-asistan",
        backupPath: dashboardData.backupPath,
        setup: setupData
      }),
      getDashboardData: async () => snapshot(),
      getSetupData: async () => setupData,
      getKbsSettings: async () => ({ enabled: false, provider: "egm", facilityCode: "", username: "", authorizedIdentityNumber: "", passwordConfigured: false }),
      saveKbsSettings: async (input) => ({ ok: true, message: "KBS smoke ayarları kaydedildi.", settings: { enabled: input.enabled, provider: input.provider, facilityCode: input.facilityCode, username: input.username, authorizedIdentityNumber: input.authorizedIdentityNumber, passwordConfigured: Boolean(input.password) } }),
      testKbsConnection: async () => ({ ok: true, message: "KBS smoke bağlantısı hazır.", provider: "egm", credentialsVerified: false, requiresWebLogin: true, portalUrl: "https://kbs.egm.gov.tr" }),
      getGoogleReviewsSettings: async () => ({ enabled: false, placeId: "", apiKeyConfigured: false, lastPublishedAt: "", publicationPending: false }),
      saveGoogleReviewsSettings: async (input) => ({
        ok: true,
        message: "Google yorumları ayarları kaydedildi.",
        settings: { enabled: input.enabled, placeId: input.placeId, apiKeyConfigured: Boolean(input.apiKey), lastPublishedAt: "", publicationPending: false }
      }),
      testGoogleReviewsConnection: async () => ({ ok: true, message: "Google Places bağlantısı doğrulandı.", name: "Smoke İşletme", rating: 4.8, userRatingCount: 12 }),
      getBusinessPublicProfile: async () => structuredClone(compactProfile),
      saveBusinessPublicProfile: async (input) => {
        compactProfile = structuredClone(input);
        return { ok: true, message: "Müşteri bilgileri kaydedildi.", profile: structuredClone(compactProfile) };
      },
      getBusinessLayout: async () => structuredClone(compactLayout),
      listRoomMedia: async () => [],
      addRoomMedia: async () => ({ ok: true, message: "Medya eklendi.", media: [] }),
      updateRoomMedia: async () => ({ ok: true, message: "Medya güncellendi.", media: [] }),
      deleteRoomMedia: async () => ({ ok: true, message: "Medya kaldırıldı.", media: [] }),
      saveBusinessLayout: async (input) => {
        if (input.rooms) {
          compactLayout = {
            ...compactLayout,
            rooms: input.rooms.map((room, index) => ({
              id: room.id || `compact-layout-room-${index + 1}`,
              name: room.name,
              number: room.number,
              capacity: room.capacity,
              bedInfo: room.bedInfo,
              floor: room.floor,
              features: [...room.features],
              description: room.description,
              priceNote: room.priceNote,
              nightlyPriceMinor: room.nightlyPriceMinor,
              currency: room.currency,
              sortOrder: index + 1,
              outOfService: room.outOfService === true,
              canRemove: true,
              removeBlockReason: ""
            }))
          };
        }
        if (input.tableCategories) {
          compactLayout = {
            ...compactLayout,
            tableCategories: input.tableCategories.map(({ name, tableCount }) => ({ name, tableCount }))
          };
        }
        return { ok: true, message: "İşletme düzeni kaydedildi.", layout: structuredClone(compactLayout) };
      },
      getSyncStatus: async () => ({
        enabled: true,
        clientId: "renderer-smoke",
        requestCursor: 0,
        acknowledgedCursor: 0,
        lastAttemptAt: "2026-07-18T12:35:00+03:00",
        lastSuccessAt: "2026-07-18T12:00:00+03:00",
        lastError: "",
        consecutiveFailures: 0,
        pendingJobs: 0,
        nextRetryAt: "",
        phase: "idle",
        message: "Senkron hazır."
      }),
      onSyncStatusChanged: () => () => {},
      getRoomFolioData: async () => ({
        generatedAt: "",
        rooms: [],
        activeStays: [],
        folios: [],
        menuCategories: [],
        menuItems: []
      }),
      listTableOrders: async () => tableOrders,
      getActiveTableOrder: async (tableId) => tableOrders.find((order) => order.tableId === tableId && ["open", "preparing", "served", "payment"].includes(order.status)) ?? null,
      openTableOrder: async (tableId) => {
        await wait(tableId === "compact_table_1" ? 180 : 10);
        const existing = tableOrders.find((order) => order.tableId === tableId && ["open", "preparing", "served", "payment"].includes(order.status));
        const result = existing
          ? { ok: true, message: "Aktif adisyon yüklendi.", order: existing }
          : saveOrder(createOrder(tableId), "Adisyon açıldı.");
        return withTableStatus(result, tableId, existing?.status === "payment" ? "bill_waiting" : "occupied");
      },
      addTableOrderItem: async (orderId, menuItemId, quantity, note) => {
        const order = tableOrders.find((item) => item.id === orderId);
        const menuItem = currentDashboardData.menu.items.find((item) => item.id === menuItemId);
        const now = new Date().toISOString();
        window.__tableOrderAdds.push({ orderId, tableId: order.tableId, menuItemId });
        return saveOrder({
          ...order,
          items: [...order.items, {
            id: `line_${order.tableId}_${order.items.length + 1}`,
            orderId,
            productId: menuItem.product_id,
            menuEntryId: menuItemId,
            productName: menuItem.name,
            unitPrice: menuItem.price,
            currency: menuItem.currency,
            quantity,
            lineTotal: menuItem.price * quantity,
            note,
            status: "open",
            createdAt: now,
            updatedAt: now
          }]
        }, "Ürün adisyona eklendi.");
      },
      updateTableOrderItemNote: async (itemId, note) => {
        await wait(40);
        const order = tableOrders.find((item) => item.items.some((line) => line.id === itemId));
        window.__tableOrderNoteSaves.push({ itemId, note, tableId: order.tableId });
        return saveOrder({
          ...order,
          items: order.items.map((item) => item.id === itemId ? { ...item, note } : item)
        }, "Ürün notu kaydedildi.");
      },
      updateTableOrderStatus: async (orderId, status) => {
        const order = tableOrders.find((item) => item.id === orderId);
        return withTableStatus(
          saveOrder({ ...order, status }, "Adisyon durumu güncellendi."),
          order.tableId,
          status === "payment" ? "bill_waiting" : "occupied"
        );
      },
      closeTableOrder: async (orderId, status) => {
        const order = tableOrders.find((item) => item.id === orderId);
        return withTableStatus(
          saveOrder({ ...order, status, closedAt: new Date().toISOString() }, "Adisyon kapatıldı."),
          order.tableId,
          "available"
        );
      },
      markWhatsAppMessageSent: async () => ({ ok: false, message: "smoke" }),
      openExternal: async () => true
    };
  }, {
    setupData: { ...createSetupFixture(), setupRequired: false, syncSecret: "compact-smoke-secret" },
    dashboardData: createCompactUiFixture(),
    capabilitySnapshot: createBusinessCapabilitySnapshotFixture({ ...createSetupFixture(), setupRequired: false, syncSecret: "compact-smoke-secret" })
  });
  await compactPage.goto(baseUrl, { waitUntil: "domcontentloaded" });

  await expect(compactPage.locator("html")).toHaveAttribute("data-color-scheme", "light");
  await expect(compactPage.locator("html")).toHaveAttribute("data-density", "compact");
  expect(await compactPage.evaluate(() => getComputedStyle(document.documentElement).zoom)).toBe("1");

  await compactPage.getByRole("button", { name: "Menüyü daralt" }).click();
  await expect(compactPage.locator(".desktop-shell")).toHaveClass(/is-sidebar-collapsed/);
  await expect(compactPage.locator(".sidebar")).toHaveClass(/is-collapsed/);
  await expect(compactPage.locator(".brand-copy")).toBeHidden();
  await expect(compactPage.getByRole("button", { name: "Pansiyon", exact: true })).toBeVisible();
  await expect.poll(() => compactPage.evaluate(() => localStorage.getItem("yardimci-asistan.sidebar-collapsed"))).toBe("true");
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-sidebar-collapsed-1366x768.png" });

  await compactPage.reload({ waitUntil: "domcontentloaded" });
  await expect(compactPage.getByRole("button", { name: "Menüyü genişlet" })).toBeVisible();
  await compactPage.getByRole("button", { name: "Menüyü genişlet" }).click();
  await expect(compactPage.locator(".desktop-shell")).not.toHaveClass(/is-sidebar-collapsed/);
  await expect.poll(() => compactPage.evaluate(() => localStorage.getItem("yardimci-asistan.sidebar-collapsed"))).toBe("false");

  const dashboardPriorityRows = compactPage.locator(".dashboard-priority-item");
  // Compact fixture yields 4 waiting requests + 5 pending tasks + 2 pending reservations.
  await expect(dashboardPriorityRows).toHaveCount(11);
  await expect(compactPage.getByRole("heading", { name: "11 konu ilgi bekliyor." })).toBeVisible();
  expect(await dashboardPriorityRows.evaluateAll((rows) => rows.every((row) => row.querySelectorAll("button").length === 1))).toBe(true);
  const firstPriorityDescription = dashboardPriorityRows.first().locator(".dashboard-priority-description");
  await expect(firstPriorityDescription).toBeVisible();
  expect(await firstPriorityDescription.evaluate((note) => getComputedStyle(note).whiteSpace)).toBe("nowrap");
  // Timeline shows the 5 pending tasks plus the 2 pending reservations.
  await expect(compactPage.locator(".dashboard-timeline-list li")).toHaveCount(7);
  await expect(compactPage.locator(".dashboard-capacity-list > div")).toHaveCount(3);
  expect(await compactPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(dashboardPriorityRows.first().getByRole("heading")).toHaveText("Kompakt Misafir 1");
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-dashboard-1366x768.png" });
  await compactPage.evaluate(() => document.documentElement.setAttribute("data-color-scheme", "light"));
  await expect(compactPage.locator("html")).toHaveAttribute("data-color-scheme", "light");
  expect(await compactPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-dashboard-light-1366x768.png" });
  await compactPage.evaluate(() => document.documentElement.setAttribute("data-color-scheme", "dark"));

  await compactPage.getByRole("button", { name: "Kompakt Misafir 1 rezervasyonunu incele" }).click();
  const compactReservationWorkspace = compactPage.locator(".workspace-page-frame");
  await expect(compactReservationWorkspace).toBeVisible();
  await expect(compactReservationWorkspace.getByRole("heading", { name: "Oda 101 · Balkonlu Standart Oda", exact: true })).toBeVisible();
  await expect(compactReservationWorkspace.getByRole("region", { name: "Misafirler ve Konaklama", exact: true })).toBeVisible();
  await compactReservationWorkspace.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  await expect(compactReservationWorkspace).toHaveCount(0);
  await expect(compactPage.getByRole("heading", { name: "Bugün ne var?", exact: true })).toBeVisible();
  await expect(compactPage.getByRole("button", { name: "Ana Ekran", exact: true })).toHaveAttribute("aria-current", "page");

  const aiOnlyPage = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await aiOnlyPage.addInitScript(({ setupData, dashboardData, capabilitySnapshot }) => {
    const uiPreferencesKey = "yardimci-asistan.ui-preferences";
    if (window.localStorage.getItem(uiPreferencesKey) === null) {
      window.localStorage.setItem(uiPreferencesKey, JSON.stringify({ version: 2, scheme: "light", density: "compact", scale: 1, accent: "coral", font: "plex", motion: "system" }));
    }
    window.yardimciDesktop = {
      getBusinessCapabilitySnapshot: async () => capabilitySnapshot,
      getBootstrapData: async () => ({
        appName: "Yardımcı Asistan",
        version: "0.1.0",
        platform: "linux",
        syncSettings: { webModuleUrl: setupData.webModuleUrl, hasSyncSecret: true },
        databasePath: dashboardData.databasePath,
        userDataPath: "/tmp/yardimci-asistan",
        backupPath: dashboardData.backupPath,
        setup: setupData
      }),
      getDashboardData: async () => dashboardData,
      getSetupData: async () => setupData,
      getKbsSettings: async () => ({ enabled: false, provider: "egm", facilityCode: "", username: "", authorizedIdentityNumber: "", passwordConfigured: false }),
      saveKbsSettings: async (input) => ({ ok: true, message: "KBS smoke ayarları kaydedildi.", settings: { enabled: input.enabled, provider: input.provider, facilityCode: input.facilityCode, username: input.username, authorizedIdentityNumber: input.authorizedIdentityNumber, passwordConfigured: Boolean(input.password) } }),
      testKbsConnection: async () => ({ ok: true, message: "KBS smoke bağlantısı hazır.", provider: "egm", credentialsVerified: false, requiresWebLogin: true, portalUrl: "https://kbs.egm.gov.tr" }),
      getGoogleReviewsSettings: async () => ({ enabled: false, placeId: "", apiKeyConfigured: false, lastPublishedAt: "", publicationPending: false }),
      saveGoogleReviewsSettings: async (input) => ({
        ok: true,
        message: "Google yorumları ayarları kaydedildi.",
        settings: { enabled: input.enabled, placeId: input.placeId, apiKeyConfigured: Boolean(input.apiKey), lastPublishedAt: "", publicationPending: false }
      }),
      testGoogleReviewsConnection: async () => ({ ok: true, message: "Google Places bağlantısı doğrulandı.", name: "Smoke İşletme", rating: 4.8, userRatingCount: 12 }),
      getSyncStatus: async () => ({
        enabled: true,
        clientId: "ai-only-smoke",
        requestCursor: 0,
        acknowledgedCursor: 0,
        lastAttemptAt: "2026-07-18T12:35:00+03:00",
        lastSuccessAt: "2026-07-18T12:00:00+03:00",
        lastError: "",
        consecutiveFailures: 0,
        pendingJobs: 0,
        nextRetryAt: "",
        phase: "idle",
        message: "Senkron hazır."
      }),
      onSyncStatusChanged: () => () => {}
    };
  }, {
    setupData: {
      ...createSetupFixture(),
      setupRequired: false,
      syncSecret: "ai-only-smoke-secret",
      servicePreferences: { ...createSetupFixture().servicePreferences, whatsapp: false }
    },
    dashboardData: createCompactUiFixture(),
    capabilitySnapshot: createBusinessCapabilitySnapshotFixture({
      ...createSetupFixture(),
      setupRequired: false,
      syncSecret: "ai-only-smoke-secret",
      servicePreferences: { ...createSetupFixture().servicePreferences, whatsapp: false }
    })
  });
  await aiOnlyPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(aiOnlyPage.locator("html")).toHaveAttribute("data-density", "compact");
  const aiOnlyRequestPriority = aiOnlyPage.locator(".dashboard-priority-item.priority-request").filter({ hasText: "Kompakt Misafir 1" });
  await aiOnlyRequestPriority.getByRole("button").click();
  await expect(aiOnlyPage.getByRole("heading", { name: "Müşteri İşleri", exact: true })).toBeVisible();
  await expect(aiOnlyPage.locator(".request-detail-panel").getByRole("heading", { name: "Kompakt Misafir 1" })).toBeVisible();
  await expect(aiOnlyPage.getByRole("navigation", { name: "Müşteri işleri görünümü" }).getByRole("button", { name: "Hazır Mesajlar" })).toHaveCount(0);
  await expect(aiOnlyPage.getByRole("navigation", { name: "Müşteri işleri görünümü" }).getByRole("button", { name: "Talepler" })).toBeVisible();

  await compactPage.getByRole("button", { name: "Müşteri İşleri", exact: true }).click();
  await compactPage.getByRole("navigation", { name: "Müşteri işleri görünümü" }).getByRole("button", { name: "Talepler", exact: true }).click();
  await compactPage.getByRole("button", { name: /Kompakt Misafir 4/ }).click();
  const customerRequestRows = compactPage.locator(".requests-workspace .list-row--button");
  await expect(customerRequestRows).toHaveCount(8);
  await expect(compactPage.getByRole("button", { name: "Yeniden Aç" })).toBeVisible();
  await expect(compactPage.getByRole("button", { name: "Talebi Sil" })).toBeVisible();
  await expect(compactPage.locator(".request-more-actions")).toHaveCount(0);
  await expect(compactPage.locator(".request-detail-header-actions")).toBeVisible();
  await expect(compactPage.getByRole("dialog", { name: "Yeni talimat" })).toHaveCount(0);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-customer-work-1366x768.png" });

  await compactPage.getByRole("navigation", { name: "Müşteri işleri görünümü" }).getByRole("button", { name: "Müşteriler" }).click();
  const compactCustomerRows = compactPage.locator(".customers-workspace .customer-record-row");
  await expect(compactCustomerRows).toHaveCount(8);
  const customerSearch = compactPage.locator(".customer-search input");
  await customerSearch.fill("Kompakt Misafir 4");
  await expect(compactCustomerRows).toHaveCount(1);
  await compactPage.getByRole("button", { name: "Ana Ekran", exact: true }).click();
  await compactPage.getByRole("button", { name: "Müşteri İşleri", exact: true }).click();
  await expect(customerSearch).toHaveValue("Kompakt Misafir 4");
  await expect(compactCustomerRows).toHaveCount(1);
  await customerSearch.fill("");

  await compactPage.getByRole("button", { name: "Pansiyon", exact: true }).click();
  const pensionBoard = compactPage.getByRole("region", { name: "Pansiyon operasyonları", exact: true });
  await expect(pensionBoard.locator(".operations-board__pane")).toHaveCount(3);
  const compactRoomCards = compactPage.getByLabel("Oda yönetimi").getByRole("article");
  const compactCleaningRoom = compactRoomCards.filter({ has: compactPage.getByRole("heading", { name: "Oda 104 · Aile Odası", exact: true }) });
  await expect(compactCleaningRoom.getByRole("group", { name: "Oda 104 · Aile Odası fiziksel durumunu değiştir", exact: true })
    .getByRole("button", { name: "Temizlik", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(compactPage.getByLabel("Oda yönetimi").getByRole("combobox")).toHaveCount(0);
  const reservationRows = compactPage.locator(".reservation-record-row");
  await expect(reservationRows).toHaveCount(3);
  await expect(reservationRows.first().locator("summary")).toHaveCount(0);
  await expect(reservationRows.first().getByRole("button", { name: "Reddet" })).toBeVisible();
  await expect(reservationRows.first().getByRole("button", { name: "İptal Et" })).toBeVisible();
  await reservationRows.first().getByRole("button", { name: "WhatsApp'a Hazırla" }).click();
  await expect(compactPage.getByRole("heading", { name: "Müşteri İşleri", exact: true })).toBeVisible();
  await expect(compactPage.getByRole("navigation", { name: "Müşteri işleri görünümü" }).getByRole("button", { name: "Hazır Mesajlar" })).toHaveAttribute("aria-pressed", "true");
  await expect(compactPage.getByText("Pansiyon rezervasyonu", { exact: true }).first()).toBeVisible();
  await expect(compactPage.getByRole("button", { name: "WhatsApp'a Geç", exact: true })).toBeVisible();
  await compactPage.getByRole("button", { name: "Pansiyon", exact: true }).click();
  await expect(compactPage.locator(".task-record-row")).toHaveCount(2);
  await expect(compactPage.getByLabel("Oda yönetimi")).toBeVisible();
  await expect(compactPage.getByLabel("Rezervasyon yönetimi")).toBeVisible();
  await expect(compactPage.getByLabel("Günlük işler", { exact: true })).toBeVisible();
  await expect(compactPage.locator(".task-record-row").first().locator("summary")).toHaveCount(0);
  await compactPage.waitForTimeout(50);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-pension-1366x768.png" });

  await compactPage.getByRole("button", { name: "Restoran", exact: true }).click();
  const restaurantBoard = compactPage.getByRole("region", { name: "Restoran operasyonları", exact: true });
  await expect(restaurantBoard.locator(".operations-board__pane")).toHaveCount(3);
  await expect(compactPage.locator(".table-area-heading strong")).toHaveText(["Bahçe", "Salon"]);
  await expect(compactPage.getByLabel("Restoran günlük işleri", { exact: true })).toBeVisible();
  await expect(compactPage.locator(".task-record-row").first().getByRole("button", { name: "İptal Et" })).toBeVisible();
  await expect(compactPage.locator(".task-record-row").first().locator("summary")).toHaveCount(0);
  expect(await compactPage.locator(".operations-board__pane--center .operations-board__pane-body").evaluate(element => getComputedStyle(element).overflowY)).toBe("auto");
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-restaurant-1366x768.png" });

  const tableManagement = compactPage.locator(".restaurant-table-area-list");
  const firstOrderCard = tableManagement.locator(".resource-card").filter({ hasText: "Bahçe Masası 1" });
  const secondOrderCard = tableManagement.locator(".resource-card").filter({ hasText: "Salon Masası 2" });
  const reservedOrderCard = tableManagement.locator(".resource-card").filter({ hasText: "Bahçe Masası 3" });
  await firstOrderCard.getByRole("button", { name: /masasını aç/ }).click();
  const firstOrderDrawer = compactPage.locator(".workspace-page-frame");
  await expect(firstOrderDrawer).toBeVisible();
  await firstOrderDrawer.getByRole("button", { name: "Masa çalışma alanını kapat", exact: true }).click();
  await expect(firstOrderDrawer).toHaveCount(0);

  await secondOrderCard.getByRole("button", { name: /masasını aç/ }).click();
  const secondOrderDrawer = compactPage.locator(".workspace-page-frame");
  await expect(secondOrderDrawer).toBeVisible();
  await secondOrderDrawer.getByRole("button", { name: "Menü Ürünü 1 ürününü siparişe ekle" }).click();
  await expect.poll(() => compactPage.evaluate(() => window.__tableOrderAdds.at(-1)?.tableId)).toBe("compact_table_2");
  await secondOrderDrawer.getByRole("button", { name: "Menü Ürünü 1 için not ekle" }).click();
  const smokeOrderNote = secondOrderDrawer.getByLabel("Menü Ürünü 1 notu");
  await smokeOrderNote.fill("Escape öncesi kalıcı not");
  await smokeOrderNote.press("Escape");
  await expect(secondOrderDrawer).toBeVisible();
  await expect(smokeOrderNote).toHaveValue("Escape öncesi kalıcı not");
  await smokeOrderNote.press("Tab");
  await expect.poll(() => compactPage.evaluate(() => window.__tableOrderNoteSaves.at(-1))).toMatchObject({
    tableId: "compact_table_2",
    note: "Escape öncesi kalıcı not"
  });
  await secondOrderDrawer.getByRole("button", { name: "Masa çalışma alanını kapat", exact: true }).click();
  await expect(secondOrderDrawer).toHaveCount(0);

  const secondOrderCardStatus = secondOrderCard.getByRole("group", { name: "Salon Masası 2 sipariş durumu", exact: true });
  await expect(secondOrderCardStatus.getByRole("button", { name: "Açık", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(secondOrderCard.locator(".resource-card__facts")).toContainText("1 ürün");
  await expect(secondOrderCard.locator(".resource-card__facts")).toContainText("90");
  await expect(secondOrderCard.getByRole("button", { name: /masasını aç/ })).toBeVisible();
  await expect(secondOrderCard.getByRole("button", { name: "Hesap İste", exact: true })).toHaveCount(0);
  await expect(secondOrderCard.getByRole("button", { name: "Ödendi / Kapat", exact: true })).toHaveCount(0);

  await secondOrderCard.getByRole("button", { name: /masasını aç/ }).click();
  const polishedOrderDrawer = compactPage.locator(".workspace-page-frame");
  await expect(polishedOrderDrawer).toBeVisible();
  const polishedOrderStatus = polishedOrderDrawer.getByRole("group", { name: "Sipariş durumu", exact: true });
  await expect(polishedOrderStatus).toBeVisible();
  await expect(polishedOrderDrawer.getByRole("button", { name: "Ödendi / Kapat" })).toBeVisible();
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-table-order-workspace-1366x768.png" });
  await polishedOrderStatus.getByRole("button", { name: "Hazırlanıyor", exact: true }).click();
  await expect(polishedOrderStatus.getByRole("button", { name: "Hazırlanıyor", exact: true })).toHaveAttribute("aria-pressed", "true");
  await polishedOrderDrawer.getByRole("button", { name: "Masa çalışma alanını kapat", exact: true }).click();
  await expect(polishedOrderDrawer).toHaveCount(0);
  await expect(secondOrderCard.getByRole("group", { name: "Salon Masası 2 sipariş durumu", exact: true })
    .getByRole("button", { name: "Hazırlanıyor", exact: true })).toHaveAttribute("aria-pressed", "true");

  await secondOrderCard.getByRole("button", { name: /masasını aç/ }).click();
  const paymentOrderDrawer = compactPage.locator(".workspace-page-frame");
  await expect(paymentOrderDrawer).toBeVisible();
  const paymentOrderStatus = paymentOrderDrawer.getByRole("group", { name: "Sipariş durumu", exact: true });
  await paymentOrderStatus.getByRole("button", { name: "Hesap bekliyor", exact: true }).click();
  await expect(paymentOrderStatus.getByRole("button", { name: "Hesap bekliyor", exact: true })).toHaveAttribute("aria-pressed", "true");
  await paymentOrderDrawer.getByRole("button", { name: "Masa çalışma alanını kapat", exact: true }).click();
  await expect(paymentOrderDrawer).toHaveCount(0);
  await expect(secondOrderCard.getByRole("group", { name: "Salon Masası 2 sipariş durumu", exact: true })
    .getByRole("button", { name: "Hesap bekliyor", exact: true })).toHaveAttribute("aria-pressed", "true");
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-table-order-polish-1366x768.png" });

  await secondOrderCard.getByRole("button", { name: /masasını aç/ }).click();
  const paidOrderDrawer = compactPage.locator(".workspace-page-frame");
  await expect(paidOrderDrawer).toBeVisible();
  await paidOrderDrawer.getByRole("button", { name: "Ödendi / Kapat", exact: true }).click();
  await compactPage.getByRole("dialog", { name: "Hesabı kapat", exact: true })
    .getByRole("button", { name: "Ödendi / Kapat", exact: true }).click();
  await expect(paidOrderDrawer).toHaveCount(0);
  await expect(secondOrderCard.locator(".resource-card__balance")).toHaveCount(0);
  await expect(secondOrderCard.getByRole("button", { name: /masasını aç/ })).toBeVisible();
  await expect(secondOrderCard.getByRole("group", { name: "Salon Masası 2 durumunu değiştir", exact: true })
    .getByRole("button", { name: "Boş", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(secondOrderCard.getByRole("combobox")).toHaveCount(0);

  await expect(reservedOrderCard.getByRole("group", { name: "Bahçe Masası 3 durumunu değiştir", exact: true })
    .getByRole("button", { name: "Rezerve", exact: true })).toHaveAttribute("aria-pressed", "true");
  await reservedOrderCard.getByRole("button", { name: /masasını aç/ }).click();
  const reservedOrderDrawer = compactPage.locator(".workspace-page-frame");
  await expect(reservedOrderDrawer).toBeVisible();
  await reservedOrderDrawer.getByRole("button", { name: /ürününü siparişe ekle/ }).first().click();
  const reservedOrderStatus = reservedOrderDrawer.getByRole("group", { name: "Sipariş durumu", exact: true });
  await reservedOrderStatus.getByRole("button", { name: "Hazırlanıyor", exact: true }).click();
  await reservedOrderDrawer.getByRole("button", { name: "Masa çalışma alanını kapat", exact: true }).click();
  await expect(reservedOrderDrawer).toHaveCount(0);
  await expect(reservedOrderCard.getByRole("group", { name: "Bahçe Masası 3 sipariş durumu", exact: true })
    .getByRole("button", { name: "Hazırlanıyor", exact: true })).toHaveAttribute("aria-pressed", "true");

  await reservedOrderCard.getByRole("button", { name: /masasını aç/ }).click();
  const reservedPaymentDrawer = compactPage.locator(".workspace-page-frame");
  await expect(reservedPaymentDrawer).toBeVisible();
  await reservedPaymentDrawer.getByRole("group", { name: "Sipariş durumu", exact: true })
    .getByRole("button", { name: "Hesap bekliyor", exact: true }).click();
  await reservedPaymentDrawer.getByRole("button", { name: "Masa çalışma alanını kapat", exact: true }).click();
  await expect(reservedPaymentDrawer).toHaveCount(0);
  await expect(reservedOrderCard.getByRole("group", { name: "Bahçe Masası 3 sipariş durumu", exact: true })
    .getByRole("button", { name: "Hesap bekliyor", exact: true })).toHaveAttribute("aria-pressed", "true");

  await reservedOrderCard.getByRole("button", { name: /masasını aç/ }).click();
  const reservedPaidDrawer = compactPage.locator(".workspace-page-frame");
  await expect(reservedPaidDrawer).toBeVisible();
  await reservedPaidDrawer.getByRole("button", { name: "Ödendi / Kapat", exact: true }).click();
  await compactPage.getByRole("dialog", { name: "Hesabı kapat", exact: true })
    .getByRole("button", { name: "Ödendi / Kapat", exact: true }).click();
  await expect(reservedPaidDrawer).toHaveCount(0);
  await expect(reservedOrderCard.locator(".resource-card__balance")).toHaveCount(0);
  await expect(reservedOrderCard.getByRole("group", { name: "Bahçe Masası 3 durumunu değiştir", exact: true })
    .getByRole("button", { name: "Boş", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(reservedOrderCard.getByRole("combobox")).toHaveCount(0);

  await expect(firstOrderCard.getByRole("group", { name: "Bahçe Masası 1 durumunu değiştir", exact: true })
    .getByRole("button", { name: "Boş", exact: true })).toHaveAttribute("aria-pressed", "true");
  await firstOrderCard.getByRole("button", { name: /masasını aç/ }).click();
  const cancelledOrderDrawer = compactPage.locator(".workspace-page-frame");
  await expect(cancelledOrderDrawer).toBeVisible();
  await cancelledOrderDrawer.getByRole("button", { name: /ürününü siparişe ekle/ }).first().click();
  await cancelledOrderDrawer.getByRole("button", { name: "Adisyonu İptal Et", exact: true }).click();
  await compactPage.getByRole("dialog", { name: "Adisyonu iptal et", exact: true })
    .getByRole("button", { name: "Adisyonu İptal Et", exact: true }).click();
  await expect(cancelledOrderDrawer).toHaveCount(0);
  await expect(firstOrderCard.locator(".resource-card__balance")).toHaveCount(0);
  await expect(firstOrderCard.getByRole("group", { name: "Bahçe Masası 1 durumunu değiştir", exact: true })
    .getByRole("button", { name: "Boş", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(firstOrderCard.getByRole("combobox")).toHaveCount(0);

  await compactPage.getByRole("button", { name: "Menü", exact: true }).click();
  await expect(compactPage.getByRole("button", { name: "Menü", exact: true })).toHaveAttribute("aria-current", "page");
  await compactPage.locator(".menu-category-row").filter({ hasText: "Sıcaklar" }).getByRole("button", { name: "Sıcaklar", exact: true }).click();
  await expect(compactPage.locator(".menu-category-row.is-selected")).toContainText("Sıcaklar");
  await compactPage.getByRole("button", { name: "Önizle", exact: true }).click();
  const compactMenuPreview = compactPage.getByRole("dialog", { name: "Yerel Menü Önizlemesi" });
  await expect(compactMenuPreview).toBeVisible();
  await compactMenuPreview.getByRole("button", { name: "Sıcaklar", exact: true }).click();
  await expect(compactMenuPreview.getByRole("button", { name: "Sıcaklar", exact: true })).toHaveAttribute("aria-pressed", "true");
  await compactMenuPreview.getByRole("button", { name: "Tüm Ürünler" }).click();
  await expect(compactMenuPreview.getByRole("button", { name: "Tüm Ürünler" })).toHaveAttribute("aria-pressed", "true");
  await compactMenuPreview.getByRole("button", { name: "Önizlemeyi kapat" }).click();
  await expect(compactMenuPreview).toHaveCount(0);
  await compactPage.locator(".menu-category-row").filter({ hasText: "Kahvaltı" }).getByRole("button", { name: "Kahvaltı", exact: true }).click();
  await expect(compactPage.locator(".menu-category-row.is-selected")).toContainText("Kahvaltı");
  await expect(compactPage.locator(".menu-category-create-form")).toBeVisible();
  await compactPage.locator(".menu-product-panel .menu-record").first().click();
  const compactMenuItemWorkspace = compactPage.getByRole("dialog");
  await expect(compactMenuItemWorkspace).toBeVisible();
  await expect(compactMenuItemWorkspace.locator(".market-product-image-card")).toBeVisible();
  await expect(compactMenuItemWorkspace.getByLabel("Menü sunumu", { exact: true })).toBeVisible();
  await compactMenuItemWorkspace.getByRole("button", { name: "Çalışma alanını kapat", exact: true }).click();
  await expect(compactPage.locator(".menu-management-grid .menu-record[aria-pressed='true']")).toHaveCount(1);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-menu-1366x768.png" });

  await compactPage.getByRole("button", { name: "Müşteri İşleri", exact: true }).click();
  await compactPage.getByRole("navigation", { name: "Müşteri işleri görünümü" }).getByRole("button", { name: "Hazır Mesajlar" }).click();
  const compactMessageRows = compactPage.locator(".message-mode-content:not(.is-hidden) .whatsapp-request-list button.message-request-row");
  await expect(compactMessageRows).toHaveCount(5);
  await expect(compactPage.locator(".whatsapp-copy-panel").getByRole("heading", { name: "Kompakt Misafir 1" })).toBeVisible();
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-messages-1366x768.png" });

  await compactPage.getByRole("tab", { name: "WhatsApp", exact: true }).click();
  const compactWebControlBar = compactPage.locator(".whatsapp-web-control-bar");
  await expect(compactWebControlBar).toContainText("Kompakt Misafir 1");
  await expect(compactWebControlBar).toContainText("+90 532 123 00 01");
  await expect(compactWebControlBar.getByRole("button", { name: "Hazır Mesajı Kopyala" })).toBeVisible();
  await expect(compactWebControlBar.getByRole("button", { name: "Müşteri Numarasına Git" })).toBeVisible();
  await expect(compactWebControlBar.getByRole("button", { name: "Dışarıda Aç" })).toBeVisible();
  await expect(compactWebControlBar.getByRole("button", { name: "Güvenli Moda Dön" })).toBeVisible();
  await expectWhatsAppToFillWorkspace(compactPage);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-whatsapp-web-1366x768.png" });
  await compactWebControlBar.getByRole("button", { name: "Güvenli Moda Dön" }).click();
  await expect(compactPage.getByRole("tab", { name: "Hazır Mesaj" })).toHaveAttribute("aria-selected", "true");

  await compactPage.reload({ waitUntil: "domcontentloaded" });
  await expectRegisteredHospitalityNavigation(compactPage);
  await compactPage.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await expect(compactPage.getByRole("button", { name: "Ayarlar", exact: true })).toHaveAttribute("aria-current", "page");
  expect(await compactPage.locator(".content").evaluate((element) => element.scrollTop)).toBe(0);
  await expect(compactPage.getByRole("button", { name: "Kaydet", exact: true })).toHaveCount(1);
  await expect(compactPage.locator(".setup-footer")).toHaveCount(0);
  await expect(compactPage.getByRole("tablist", { name: "Ayar kategorileri" })).toHaveCount(0);
  await expandSettingsStructure(compactPage);
  await expect(compactPage.locator("#settings-business")).toBeVisible();
  await expect(compactPage.locator("#settings-public-profile")).toBeVisible();
  await expect(compactPage.getByLabel("İşletme açıklaması")).toBeVisible();
  await compactPage.locator("#settings-tables-button").click();
  await expect(compactPage.locator("#settings-operations")).toBeVisible();
  await compactPage.keyboard.press("Escape");
  await compactPage.getByRole("button", { name: "Güvenlik", exact: true }).click();
  await expect(compactPage.getByRole("heading", { name: "Uygulama Şifresi" })).toBeVisible();
  await compactPage.keyboard.press("Escape");
  await expect(compactPage.locator("#settings-security-button-panel")).toHaveCount(0);
  await expandSettingsStructure(compactPage);
  await expect(compactPage.locator("#settings-android")).toBeVisible();
  await compactPage.getByRole("button", { name: "Ana Ekran", exact: true }).click();
  await expect(compactPage.getByRole("button", { name: "Ana Ekran", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(compactPage.getByRole("heading", { name: "Bugün ne var?" })).toBeVisible();
  await compactPage.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await expect(compactPage.getByRole("button", { name: "Ayarlar", exact: true })).toHaveAttribute("aria-current", "page");
  await expandSettingsStructure(compactPage);
  // Revisiting Settings can remount its tab bar during the deferred page switch.
  // Dispatch once after the route is active, then assert the rendered section.
  await expect(compactPage.getByRole("tab", { name: "Uygulama", exact: true })).toHaveCount(0);
  await expect(compactPage.locator("#settings-appearance")).toHaveCount(0);
  await compactPage.getByRole("button", { name: "Görünüm", exact: true }).click();
  await expect(compactPage.getByRole("dialog", { name: "Görünüm", exact: true })).toBeVisible();
  expect(await compactPage.locator(".setup-capabilities").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-settings-1366x768.png" });
  await compactPage.keyboard.press("Escape");
  await expandSettingsStructure(compactPage);
  await expect(compactPage.locator("#settings-web")).toBeVisible();
  await expect(compactPage.getByLabel("Web eşitleme adresi")).toBeVisible();
  await expect(compactPage.getByLabel("Web güvenlik anahtarı")).toBeVisible();
  await openSettingsService(compactPage, "settings-ai");
  await expect(compactPage.getByLabel("Servis sağlayıcı")).toBeVisible();
  await cancelSettingsService(compactPage);
  expect(await compactPage.locator(".content").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-compact-settings-advanced-1366x768.png" });
  await compactPage.setViewportSize({ width: 900, height: 768 });
  await compactPage.getByRole("button", { name: "Veriler", exact: true }).click();
  await expect(compactPage.locator("#settings-data-button-panel")).toBeInViewport();
  expect(await compactPage.locator(".content").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await compactPage.screenshot({ path: "artifacts/screenshots/desktop-settings-900x768.png" });
  await compactPage.keyboard.press("Escape");
  await compactPage.getByRole("button", { name: "Menüyü daralt", exact: true }).click();
  await expect(compactPage.locator(".sidebar")).toHaveClass(/is-collapsed/);
  await expect(compactPage.locator(".page-header-tools > #header-updates + .appearance-menu")).toHaveCount(1);
  await expect(compactPage.locator("#desktop-sidebar #header-updates")).toHaveCount(0);
  await compactPage.locator("#header-updates").click();
  await expect(compactPage.locator("#header-updates-panel")).toBeInViewport();
  const updateBounds = await compactPage.locator("#header-updates-panel").boundingBox();
  expect(updateBounds.x + updateBounds.width).toBeLessThanOrEqual(901);
  expect(updateBounds.y + updateBounds.height).toBeLessThanOrEqual(769);
  await compactPage.keyboard.press("Escape");
  await compactPage.getByRole("button", { name: "Ana Ekran", exact: true }).click();
  await compactPage.locator("#header-updates").click();
  await expect(compactPage.getByLabel("Güncelleme sunucusu")).toBeVisible();
  await compactPage.close();

  const pullPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await pullPage.addInitScript(({ setupData, dashboardData, pulledRequest, capabilitySnapshot }) => {
    const uiPreferencesKey = "yardimci-asistan.ui-preferences";
    if (window.localStorage.getItem(uiPreferencesKey) === null) {
      window.localStorage.setItem(uiPreferencesKey, JSON.stringify({ version: 2, scheme: "light", density: "compact", scale: 1, accent: "coral", font: "plex", motion: "system" }));
    }
    let currentDashboardData = dashboardData;
    let syncStatusListener = null;
    window.__emitAutomaticSyncStatus = (status) => syncStatusListener?.(status);
    window.yardimciDesktop = {
      getBusinessCapabilitySnapshot: async () => capabilitySnapshot,
      getBootstrapData: async () => ({
        appName: "Yardımcı Asistan",
        version: "0.1.0",
        platform: "linux",
        syncSettings: {
          webModuleUrl: setupData.webModuleUrl,
          hasSyncSecret: true
        },
        databasePath: "/tmp/yardimci-asistan.sqlite",
        userDataPath: "/tmp/yardimci-asistan",
        backupPath: "/tmp/yardimci-asistan/backups",
        setup: setupData
      }),
      getDashboardData: async () => currentDashboardData,
      getSetupData: async () => setupData,
      getKbsSettings: async () => ({ enabled: false, provider: "egm", facilityCode: "", username: "", authorizedIdentityNumber: "", passwordConfigured: false }),
      saveKbsSettings: async (input) => ({ ok: true, message: "KBS smoke ayarları kaydedildi.", settings: { enabled: input.enabled, provider: input.provider, facilityCode: input.facilityCode, username: input.username, authorizedIdentityNumber: input.authorizedIdentityNumber, passwordConfigured: Boolean(input.password) } }),
      testKbsConnection: async () => ({ ok: true, message: "KBS smoke bağlantısı hazır.", provider: "egm", credentialsVerified: false, requiresWebLogin: true, portalUrl: "https://kbs.egm.gov.tr" }),
      getGoogleReviewsSettings: async () => ({ enabled: false, placeId: "", apiKeyConfigured: false, lastPublishedAt: "", publicationPending: false }),
      saveGoogleReviewsSettings: async (input) => ({
        ok: true,
        message: "Google yorumları ayarları kaydedildi.",
        settings: { enabled: input.enabled, placeId: input.placeId, apiKeyConfigured: Boolean(input.apiKey), lastPublishedAt: "", publicationPending: false }
      }),
      testGoogleReviewsConnection: async () => ({ ok: true, message: "Google Places bağlantısı doğrulandı.", name: "Smoke İşletme", rating: 4.8, userRatingCount: 12 }),
      getSyncStatus: async () => ({
        enabled: true,
        clientId: "renderer-smoke",
        requestCursor: 0,
        acknowledgedCursor: 0,
        lastAttemptAt: "2026-07-18T12:35:00+03:00",
        lastSuccessAt: "2026-07-18T12:00:00+03:00",
        lastError: "",
        consecutiveFailures: 0,
        pendingJobs: 0,
        nextRetryAt: "",
        phase: "idle",
        message: "Senkron hazır."
      }),
      onSyncStatusChanged: (listener) => {
        syncStatusListener = listener;
        return () => {
          if (syncStatusListener === listener) syncStatusListener = null;
        };
      },
      saveInitialSetup: async () => ({ ok: false, message: "smoke" }),
      createManualBackup: async () => ({ ok: false, message: "smoke" }),
      createManualRequest: async () => ({ ok: false, message: "smoke" }),
      convertRequestToReservation: async () => ({ ok: false, message: "smoke" }),
      updateRequestStatus: async () => ({ ok: false, message: "smoke" }),
      updateRoomStatus: async () => ({ ok: false, message: "smoke" }),
      updateTableStatus: async () => ({ ok: false, message: "smoke" }),
      updateReservationStatus: async () => ({ ok: false, message: "smoke" }),
      updateDailyTaskStatus: async () => ({ ok: false, message: "smoke" }),
      createOwnerReplySuggestion: async () => ({ ok: false, message: "smoke" }),
      pullRequests: async () => {
        currentDashboardData = {
          ...dashboardData,
          summary: {
            ...dashboardData.summary,
            newRequests: 1,
            waitingRequests: 1
          },
          requests: [pulledRequest],
          customers: [
            ...dashboardData.customers,
            {
              id: pulledRequest.customer_id,
              fullName: pulledRequest.customer_name,
              phone: pulledRequest.customer_phone,
              email: "",
              source: "web_form",
              notes: pulledRequest.message,
              tags: ["web", "sync"],
              lastContactAt: pulledRequest.created_at,
              requestCount: 1,
              reservationCount: 0,
              updatedAt: pulledRequest.updated_at
            }
          ]
        };
        return {
          ok: true,
          message: "Talepler alındı.",
          requests: [pulledRequest],
          count: 1,
          pulled_at: "2026-07-11T10:45:00+03:00"
        };
      },
      markRequestsSynced: async () => ({ ok: true, count: 1 }),
      pushMenu: async () => ({ ok: false, message: "smoke" }),
      pushAndroidSnapshot: async () => ({ ok: false, message: "smoke" }),
      saveMenuCategory: async () => ({ ok: false, message: "smoke" }),
      saveMenuProductEntry: async () => ({ ok: false, message: "smoke" }),
      openExternal: async () => true
    };
  }, {
    setupData: { ...createSetupFixture(), setupRequired: false, syncSecret: "smoke-secret-12345" },
    dashboardData: createDashboardFixture(),
    pulledRequest: createPulledRequestFixture(),
    capabilitySnapshot: createBusinessCapabilitySnapshotFixture({ ...createSetupFixture(), setupRequired: false, syncSecret: "smoke-secret-12345" })
  });
  await pullPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(pullPage.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(pullPage.locator(".dashboard-attention-card").first().locator("strong")).toHaveText("0");
  const shellSync = pullPage.getByRole("button", { name: /^Web eşitleme durumu:/ });
  await expect(shellSync).toHaveAttribute("aria-label", /Web eşitlemeye hazır/);
  await pullPage.evaluate(() => window.__emitAutomaticSyncStatus?.({
    enabled: true,
    clientId: "renderer-smoke",
    requestCursor: 0,
    acknowledgedCursor: 0,
    lastAttemptAt: "2026-07-18T12:35:15+03:00",
    lastSuccessAt: "2026-07-18T12:00:00+03:00",
    lastError: "",
    consecutiveFailures: 0,
    pendingJobs: 0,
    nextRetryAt: "",
    phase: "syncing",
    message: "Web, masaüstü ve Android verileri eşitleniyor..."
  }));
  await expect(shellSync).toHaveAttribute("aria-label", /Web eşitleniyor/);
  await expect(shellSync).toBeDisabled();
  await pullPage.evaluate(() => window.__emitAutomaticSyncStatus?.({
    enabled: true,
    clientId: "renderer-smoke",
    requestCursor: 0,
    acknowledgedCursor: 0,
    lastAttemptAt: "2026-07-18T12:35:15+03:00",
    lastSuccessAt: "2026-07-18T12:35:16+03:00",
    lastError: "",
    consecutiveFailures: 0,
    pendingJobs: 0,
    nextRetryAt: "",
    phase: "success",
    message: "0 talep, 0 telefon işlemi ve 1 yayın eşitlendi."
  }));
  await expect(shellSync).toHaveAttribute("aria-label", /Web eşitlemeye hazır/);
  await pullPage.evaluate(() => window.__emitAutomaticSyncStatus?.({
    enabled: true,
    clientId: "renderer-smoke",
    requestCursor: 0,
    acknowledgedCursor: 0,
    lastAttemptAt: "2026-07-18T12:35:30+03:00",
    lastSuccessAt: "2026-07-18T12:35:16+03:00",
    lastError: "Web modülüne ulaşılamadı.",
    consecutiveFailures: 1,
    pendingJobs: 1,
    nextRetryAt: "2026-07-18T12:35:35+03:00",
    phase: "error",
    message: "Web modülüne ulaşılamadı."
  }));
  await expect(shellSync).toHaveAttribute("aria-label", /Web eşitleme hatası/);
  await pullPage.evaluate(() => window.__emitAutomaticSyncStatus?.({
    enabled: true,
    clientId: "renderer-smoke",
    requestCursor: 0,
    acknowledgedCursor: 0,
    lastAttemptAt: "2026-07-18T12:35:45+03:00",
    lastSuccessAt: "2026-07-18T12:35:46+03:00",
    lastError: "",
    consecutiveFailures: 0,
    pendingJobs: 0,
    nextRetryAt: "",
    phase: "success",
    message: "Tüm veriler güncel."
  }));
  await expect(shellSync).toHaveAttribute("aria-label", /Web eşitlemeye hazır/);
  await shellSync.click();
  await expect(pullPage.getByRole("heading", { name: "Web Sync Smoke" })).toBeVisible();
  await expect(pullPage.getByText("Bahçe masa için canlı web talebi.")).toBeVisible();
  await pullPage.screenshot({ path: "artifacts/screenshots/desktop-web-pull-flow.png", fullPage: true });

  // First-run local setup must not inherit the shared fixture's partial Web connection.
  // Connecting Web during setup requires its own successful connection test.
  const initialSetup = { ...createSetupFixture(), webModuleUrl: "", syncSecret: "", autoSyncEnabled: false };
  const setupPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupPage.addInitScript(({ setupData, dashboardData, capabilitySnapshot }) => {
    const uiPreferencesKey = "yardimci-asistan.ui-preferences";
    if (window.localStorage.getItem(uiPreferencesKey) === null) {
      window.localStorage.setItem(uiPreferencesKey, JSON.stringify({ version: 2, scheme: "light", density: "compact", scale: 1, accent: "coral", font: "plex", motion: "system" }));
    }
    window.__aiConnectionTestCount = 0;
    const storedAiApiKeys = {
      openai: "sk-openai-stored-smoke"
    };
    window.yardimciDesktop = {
      getBusinessLayout: async () => ({ capabilities: { rooms: true, tables: true }, rooms: [], tables: [], tableCategories: [],
        publication: { rooms: false, tables: false }, updatedAt: "2026-07-18T12:00:00+03:00" }),
      getBusinessCapabilitySnapshot: async () => capabilitySnapshot,
      getBootstrapData: async () => ({
        appName: "Yardımcı Asistan",
        version: "0.1.0",
        platform: "linux",
        syncSettings: {
          webModuleUrl: setupData.webModuleUrl,
          hasSyncSecret: Boolean(setupData.syncSecret)
        },
        databasePath: "/tmp/yardimci-asistan.sqlite",
        userDataPath: "/tmp/yardimci-asistan",
        backupPath: "/tmp/yardimci-asistan/backups",
        setup: setupData
      }),
      getDashboardData: async () => dashboardData,
      getSetupData: async () => setupData,
      getKbsSettings: async () => ({ enabled: false, provider: "egm", facilityCode: "", username: "", authorizedIdentityNumber: "", passwordConfigured: false }),
      saveKbsSettings: async (input) => ({ ok: true, message: "KBS smoke ayarları kaydedildi.", settings: { enabled: input.enabled, provider: input.provider, facilityCode: input.facilityCode, username: input.username, authorizedIdentityNumber: input.authorizedIdentityNumber, passwordConfigured: Boolean(input.password) } }),
      testKbsConnection: async () => ({ ok: true, message: "KBS smoke bağlantısı hazır.", provider: "egm", credentialsVerified: false, requiresWebLogin: true, portalUrl: "https://kbs.egm.gov.tr" }),
      getGoogleReviewsSettings: async () => ({ enabled: false, placeId: "", apiKeyConfigured: false, lastPublishedAt: "", publicationPending: false }),
      saveGoogleReviewsSettings: async (input) => ({
        ok: true,
        message: "Google yorumları ayarları kaydedildi.",
        settings: { enabled: input.enabled, placeId: input.placeId, apiKeyConfigured: Boolean(input.apiKey), lastPublishedAt: "", publicationPending: false }
      }),
      testGoogleReviewsConnection: async () => ({ ok: true, message: "Google Places bağlantısı doğrulandı.", name: "Smoke İşletme", rating: 4.8, userRatingCount: 12 }),
      getSyncStatus: async () => ({
        enabled: setupData.autoSyncEnabled,
        clientId: "renderer-smoke",
        requestCursor: 0,
        acknowledgedCursor: 0,
        lastAttemptAt: "2026-07-18T12:35:00+03:00",
        lastSuccessAt: "2026-07-18T12:00:00+03:00",
        lastError: "",
        consecutiveFailures: 0,
        pendingJobs: 0,
        nextRetryAt: "",
        phase: "idle",
        message: "Senkron hazır."
      }),
      onSyncStatusChanged: () => () => {},
      saveInitialSetup: async (input) => {
        for (const profile of input.aiProfiles || []) {
          if (profile.clearApiKey) {
            delete storedAiApiKeys[profile.service];
          } else if (profile.apiKey) {
            storedAiApiKeys[profile.service] = profile.apiKey;
          }
        }
        const savedProfiles = (input.aiProfiles || []).map((profile) => ({
          service: profile.service,
          projectName: profile.projectName,
          baseUrl: profile.baseUrl,
          model: profile.model,
          modelOptions: profile.modelOptions || [],
          timeoutSeconds: profile.timeoutSeconds,
          apiKeyConfigured: Boolean(profile.apiKey)
            || Boolean(setupData.aiProfiles?.find((saved) => saved.service === profile.service)?.apiKeyConfigured)
            || (profile.service === setupData.aiService && setupData.aiApiKeyConfigured),
          updatedAt: "2026-07-12T10:00:00.000Z"
        }));
        // Read-after-write consistency like the real backend: later getSetupData
        // calls must observe previously saved canonical values.
        setupData = {
          ...setupData,
          setupRequired: false,
          businessName: input.businessName,
          profileId: input.profileId,
          profileOptions: input.profileOptions ?? setupData.profileOptions,
          phone: input.phone,
          whatsapp: input.whatsapp,
          email: input.email,
          address: input.address,
          webModuleUrl: input.webModuleUrl,
          syncSecret: input.syncSecret,
          autoSyncEnabled: input.autoSyncEnabled ?? setupData.autoSyncEnabled,
          localNetworkEnabled: input.localNetworkEnabled ?? setupData.localNetworkEnabled,
          arasShipping: input.arasShipping ?? setupData.arasShipping,
          dealerPortalEnabled: input.dealerPortalEnabled ?? setupData.dealerPortalEnabled,
          onlineSalesDelivery: input.onlineSalesDelivery ?? setupData.onlineSalesDelivery,
          productData: input.productData ?? setupData.productData,
          birthdaySettings: input.birthdaySettings ?? setupData.birthdaySettings,
          aiEnabled: input.aiEnabled,
          aiProvider: input.aiProvider,
          aiService: input.aiService,
          aiProjectName: input.aiProjectName,
          aiBaseUrl: input.aiBaseUrl,
          aiModel: input.aiModel,
          aiTimeoutSeconds: input.aiTimeoutSeconds,
          aiApiKeyConfigured: Boolean(input.aiApiKey) || setupData.aiApiKeyConfigured,
          aiLastPublishedAt: "2026-07-12T10:00:00.000Z",
          aiProfiles: savedProfiles,
          servicePreferences: input.servicePreferences,
          initialCounts: input.initialCounts
        };
        return {
          ok: true,
          message: "Ayarlar kaydedildi ve AI bağlantısı web sitesinde güncellendi.",
          setupData,
          dashboardData: {
            ...dashboardData,
            webModuleUrl: input.webModuleUrl
          },
          aiWebSync: {
            ok: true,
            message: "AI ayarları web modülüne uygulandı.",
            published_at: "2026-07-12T10:00:00.000Z"
          }
        };
      },
      revealAiApiKey: async (service) => storedAiApiKeys[service]
        ? { ok: true, apiKey: storedAiApiKeys[service] }
        : { ok: false, message: "Bu sağlayıcı için kayıtlı bir API anahtarı bulunamadı." },
      testAiConnection: async (input) => {
        window.__aiConnectionTestCount += 1;
        if (input.service === "gemini") {
          return {
            ok: true,
            message: "Google AI Studio bağlantısında gemini-3.5-flash modeliyle görsel girişi doğrulandı; 2 uygun Gemini modeli bulundu. Kullanmak için ayarları kaydedin.",
            model: "gemini-3.5-flash",
            models: [
              { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
              { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" }
            ]
          };
        }
        return {
          ok: true,
          message: `${input.service === "openrouter" ? "OpenRouter" : "AI servisi"} bağlantısı çalışıyor.`,
          model: input.model,
          models: []
        };
      },
      createManualBackup: async () => ({
        ok: true,
        message: "Yerel veritabanı yedeği oluşturuldu.",
        backupDirectory: "/tmp/yardimci-asistan/backups",
        backupFileName: "yardimci-asistan-setup-smoke.sqlite",
        backupFilePath: "/tmp/yardimci-asistan/backups/yardimci-asistan-setup-smoke.sqlite",
        createdAt: "2026-07-11T10:16:00+03:00",
        dashboardData
      }),
      createManualRequest: async () => ({ ok: false, message: "smoke" }),
      pullRequests: async () => ({ ok: true, count: 0, requests: [] }),
      markRequestsSynced: async () => ({ ok: true, count: 0 }),
      convertRequestToReservation: async () => ({ ok: false, message: "smoke" }),
      updateRequestStatus: async () => ({ ok: false, message: "smoke" }),
      updateRoomStatus: async () => ({ ok: false, message: "smoke" }),
      updateTableStatus: async () => ({ ok: false, message: "smoke" }),
      updateReservationStatus: async () => ({ ok: false, message: "smoke" }),
      updateDailyTaskStatus: async () => ({ ok: false, message: "smoke" }),
      pushMenu: async () => ({ ok: true, category_count: 0, item_count: 0 }),
      pushAndroidSnapshot: async () => ({ ok: false, message: "smoke" }),
      pushAiSettings: async () => ({ ok: false, message: "smoke" }),
      saveMenuCategory: async () => ({ ok: false, message: "smoke" }),
      saveMenuProductEntry: async () => ({ ok: false, message: "smoke" }),
      openExternal: async () => true
    };
  }, {
    setupData: initialSetup,
    dashboardData: { ...createDashboardFixture(), webModuleUrl: "" },
    capabilitySnapshot: createBusinessCapabilitySnapshotFixture(initialSetup)
  });
  await setupPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(setupPage.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(setupPage.getByRole("heading", { name: "Ayarlar", exact: true, level: 1 })).toBeVisible();
  await expect(setupPage.getByRole("button", { name: "Ayarlar", exact: true })).toBeVisible();
  await expect(setupPage.locator(".settings-page-workspace")).toHaveCount(1);
  await expect(setupPage.getByLabel("Firma adı")).toHaveValue("");
  await setupPage.getByLabel("Firma adı").fill("Smoke Pansiyon");
  await setupPage.getByRole("textbox", { name: "WhatsApp", exact: true }).fill("+905550000000");
  await setupPage.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(setupPage.locator(".settings-page-actions")).not.toContainText("Kaydedilmemiş");
  expect(await setupPage.evaluate(() => window.yardimciDesktop.getSetupData())).toMatchObject({
    setupRequired: false,
    businessName: "Smoke Pansiyon",
    whatsapp: "+905550000000",
    webModuleUrl: "",
    syncSecret: "",
    autoSyncEnabled: false
  });
  await expect(setupPage.locator(".settings-page-actions").getByRole("button", { name: "Kaydet", exact: true })).toBeDisabled();
  await expect(setupPage.getByRole("button", { name: "Değişiklikleri Geri Al", exact: true })).toBeDisabled();
  await expect(setupPage.getByLabel("Firma adı")).toHaveValue("Smoke Pansiyon");
  await setupPage.locator("#settings-rooms-button").click();
  await expect(setupPage.getByRole("heading", { name: "Oda Yönetimi", exact: true }).first()).toBeVisible();
  await setupPage.keyboard.press("Escape");
  await setupPage.locator("#settings-tables-button").click();
  await expect(setupPage.getByRole("heading", { name: "Masa Yönetimi", exact: true }).first()).toBeVisible();
  await setupPage.keyboard.press("Escape");
  await expect(setupPage.getByLabel("Oda sayısı")).toHaveCount(0);
  await expect(setupPage.getByLabel("Masa sayısı")).toHaveCount(0);
  await openSettingsService(setupPage, "settings-ai");
  const storedOpenAiKeyInput = setupPage.getByLabel("AI güvenlik anahtarı");
  await expect(storedOpenAiKeyInput).toHaveValue("********************");
  await expect(setupPage.getByText("Kayıtlı bağlantı anahtarı maskelenir; Göster ile görüntüleyebilirsiniz.")).toBeVisible();
  await setupPage.getByRole("button", { name: "Göster", exact: true }).click();
  await expect(storedOpenAiKeyInput).toHaveValue("sk-openai-stored-smoke");
  await setupPage.getByRole("button", { name: "Gizle", exact: true }).click();
  await expect(storedOpenAiKeyInput).toHaveValue("********************");
  await setupPage.getByLabel("Servis sağlayıcı").selectOption("openrouter");
  await expect(setupPage.getByLabel("Bağlantı adresi")).toHaveValue("https://openrouter.ai/api/v1");
  await setupPage.getByLabel("Model adı").fill("smoke/provider-model");
  await setupPage.getByLabel("AI güvenlik anahtarı").fill("openrouter-smoke-secret");
  await setupPage.getByRole("button", { name: "Bağlantıyı Dene" }).click();
  const aiDialog = setupPage.getByRole("dialog", { name: "AI Yardımcı", exact: true });
  const aiTopbar = setupPage.locator(".page-header .global-message-bar");
  await expect(aiTopbar).toHaveRole("status");
  await expect(aiTopbar).toContainText("OpenRouter bağlantısı çalışıyor.");
  await expect(aiTopbar).toBeVisible();
  await expect(setupPage.getByText("OpenRouter bağlantısı çalışıyor.", { exact: true })).toHaveCount(1);
  await expect(aiDialog.locator(".settings-service-feedback-result")).toHaveCount(0);
  await expect(aiDialog.getByLabel("Canlı kontrol durumu")).toHaveText("Hazır");
  await setupPage.getByLabel("Servis sağlayıcı").selectOption("gemini");
  await setupPage.getByLabel("Google AI Studio API anahtarı veya cURL").fill("curl https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent -H 'X-goog-api-key: AQ.smoke-key'");
  await setupPage.getByRole("button", { name: "Bağlantıyı Dene" }).click();
  const geminiTestMessage = /görsel girişi doğrulandı; 2 uygun Gemini modeli bulundu/;
  await expect(aiTopbar).toContainText(geminiTestMessage);
  await expect(aiTopbar).toBeVisible();
  await expect(setupPage.getByText(geminiTestMessage)).toHaveCount(1);
  await expect(aiDialog.getByText(geminiTestMessage)).toHaveCount(0);
  await expect(aiDialog.locator(".settings-service-feedback-result")).toHaveCount(0);
  await expect(aiDialog.getByLabel("Canlı kontrol durumu")).toHaveText("Hazır");
  await expect(aiDialog.getByText("2 katalog modeli hazır. Model seçimini yaptıktan sonra tekrar bağlantı testi yapın.")).toBeVisible();
  await expect(aiDialog.getByLabel("Model adı").locator("option")).toHaveText(["Gemini 3.5 Flash", "Gemini 3.1 Flash Lite"]);
  await expect(setupPage.getByLabel("Model adı")).toHaveValue("gemini-3.5-flash");
  expect(await setupPage.evaluate(() => window.__aiConnectionTestCount)).toBe(2);
  await setupPage.getByLabel("Model adı").selectOption("gemini-3.1-flash-lite");
  await setupPage.waitForTimeout(100);
  expect(await setupPage.evaluate(() => window.__aiConnectionTestCount)).toBe(2);
  await setupPage.getByLabel("Servis sağlayıcı").selectOption("openrouter");
  await expect(setupPage.getByLabel("Model adı")).toHaveValue("smoke/provider-model");
  await expect(setupPage.getByLabel("AI güvenlik anahtarı")).toHaveValue("openrouter-smoke-secret");
  await setupPage.getByLabel("Servis sağlayıcı").selectOption("gemini");
  await expect(setupPage.getByLabel("Model adı")).toHaveValue("gemini-3.1-flash-lite");
  await expect(aiDialog.getByText("2 katalog modeli hazır. Model seçimini yaptıktan sonra tekrar bağlantı testi yapın.")).toBeVisible();
  await setupPage.screenshot({ path: "artifacts/screenshots/desktop-first-run-settings.png", fullPage: true });
  await expect(setupPage.locator("#settings-web")).toBeVisible();
  await setupPage.keyboard.press("Escape");
  await expect(setupPage.locator('.settings-service-overlay')).toBeVisible();
  await saveSettingsService(setupPage);
  await expect(setupPage.getByLabel("Firma adı")).toHaveValue("Smoke Pansiyon");
  await expect(setupPage.getByRole("textbox", { name: "WhatsApp", exact: true })).toHaveValue("+905550000000");
  await openSettingsService(setupPage, "settings-ai");
  await expect(setupPage.getByRole("heading", { name: "Ayarlar", exact: true, level: 1 })).toBeVisible();
  await expect(setupPage.locator(".settings-page-workspace")).toHaveCount(1);
  await expect(setupPage.getByLabel("Servis sağlayıcı")).toHaveValue("gemini");
  await expect(setupPage.getByLabel("Model adı")).toHaveValue("gemini-3.1-flash-lite");
  await expect(aiDialog.getByText("2 katalog modeli hazır. Model seçimini yaptıktan sonra tekrar bağlantı testi yapın.")).toBeVisible();
  const storedGeminiKeyInput = setupPage.getByLabel("Google AI Studio API anahtarı veya cURL");
  await expect(storedGeminiKeyInput).toHaveValue("********************");
  await expect(setupPage.getByText("Kayıtlı anahtar maskelenir; Göster ile görüntüleyebilir veya yeni anahtar yapıştırabilirsiniz.")).toHaveCount(0);
  await expect(setupPage.getByRole("button", { name: "Kayıtlı Anahtarı Sil", exact: true })).toBeVisible();
  await setupPage.getByRole("button", { name: "Göster", exact: true }).click();
  await expect(storedGeminiKeyInput).toHaveValue("AQ.smoke-key");
  await setupPage.getByRole("button", { name: "Gizle", exact: true }).click();
  await expect(storedGeminiKeyInput).toHaveValue("********************");
  await setupPage.getByLabel("Servis sağlayıcı").selectOption("openrouter");
  await expect(setupPage.getByLabel("Model adı")).toHaveValue("smoke/provider-model");
  const storedOpenRouterKeyInput = setupPage.getByLabel("AI güvenlik anahtarı");
  await expect(storedOpenRouterKeyInput).toHaveValue("********************");
  await setupPage.getByRole("button", { name: "Göster", exact: true }).click();
  await expect(storedOpenRouterKeyInput).toHaveValue("openrouter-smoke-secret");
  await setupPage.getByRole("button", { name: "Gizle", exact: true }).click();
  await expect(storedOpenRouterKeyInput).toHaveValue("********************");

  await browser.close();
  console.log(`desktop-renderer-ok: ${baseUrl}`);
} catch (error) {
  if (serverOutput().trim()) {
    console.error(serverOutput().trim());
  }
  throw error;
} finally {
  server.kill();
}
