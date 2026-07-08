import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import http from "node:http";
import process from "node:process";

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn("npx", ["vite", "--config", "vite.renderer.config.ts", "--host", "127.0.0.1", "--port", String(port)], {
  cwd: "apps/desktop-app",
  stdio: ["ignore", "pipe", "pipe"]
});

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForUrl(baseUrl);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "QR Menü" }).click();
  await expect(page.getByRole("heading", { name: "QR Menü" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Düzenle" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kategoriyi Kaydet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ürünü Kaydet" })).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/desktop-qr-menu-manager.png", fullPage: true });

  const rows = await page.locator(".manager-row").count();
  expect(rows).toBeGreaterThanOrEqual(8);

  await page.getByRole("button", { name: "WhatsApp" }).click();
  await expect(page.getByRole("heading", { name: "WhatsApp" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Demo Misafir" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Müşteri Numarasına Git" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hazır Mesajı Kopyala" })).toBeVisible();
  await expect(page.locator(".whatsapp-webview-frame")).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/desktop-whatsapp-workspace.png", fullPage: true });

  const conversionPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await conversionPage.addInitScript(({ setupData, dashboardData }) => {
    window.yardimciDesktop = {
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
      getDashboardData: async () => dashboardData,
      getSetupData: async () => setupData,
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
        return {
          ok: true,
          message: "Manuel talep kaydedildi.",
          savedId,
          dashboardData: {
            ...dashboardData,
            summary: {
              ...dashboardData.summary,
              newRequests: dashboardData.summary.newRequests + 1
            },
            requests: [request, ...dashboardData.requests],
            customers: [
              ...dashboardData.customers,
              {
                id: request.customer_id,
                fullName: input.customerName,
                phone: request.customer_phone,
                email: "",
                source: "manual",
                notes: input.message,
                tags: ["manuel", "talep"],
                lastContactAt: "2026-07-11T10:20:00+03:00",
                requestCount: 1,
                reservationCount: 0,
                updatedAt: "2026-07-11T10:20:00+03:00"
              }
            ]
          }
        };
      },
      convertRequestToReservation: async (requestId) => ({
        ok: true,
        message: "Talep rezervasyona çevrildi ve onaylandı.",
        reservationId: "reservation_smoke_001",
        dashboardData: {
          ...dashboardData,
          summary: {
            ...dashboardData.summary,
            newRequests: 0
          },
          requests: dashboardData.requests.map((request) => request.id === requestId ? { ...request, status: "converted_to_reservation" } : request)
        }
      }),
      updateRequestStatus: async ({ requestId, status }) => ({
        ok: true,
        message: "Talep durumu güncellendi.",
        dashboardData: {
          ...dashboardData,
          requests: dashboardData.requests.map((request) => request.id === requestId ? { ...request, status } : request)
        }
      }),
      updateRoomStatus: async ({ roomId, status }) => ({
        ok: true,
        message: "Oda durumu güncellendi.",
        dashboardData: {
          ...dashboardData,
          rooms: dashboardData.rooms.map((room) => room.id === roomId ? { ...room, status } : room)
        }
      }),
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
      createManualBackup: async () => ({
        ok: true,
        message: "Yerel veritabanı yedeği oluşturuldu.",
        backupDirectory: "/tmp/yardimci-asistan/backups",
        backupFileName: "yardimci-asistan-smoke.sqlite",
        backupFilePath: "/tmp/yardimci-asistan/backups/yardimci-asistan-smoke.sqlite",
        createdAt: "2026-07-11T10:16:00+03:00",
        dashboardData
      }),
      createOwnerReplySuggestion: async (requestId) => ({
        ok: true,
        message: "AI cevap taslağı yenilendi.",
        requestId,
        summary: "Smoke Misafir için balkonlu oda talebi.",
        suggestedReply: "Merhaba Smoke Misafir, talebinizi aldık. Müsaitlik ve fiyat bilgisi işletme sahibi tarafından kontrol edilip size dönüş yapılacaktır.",
        missingFields: [],
        dashboardData: {
          ...dashboardData,
          requests: dashboardData.requests.map((request) =>
            request.id === requestId
              ? {
                  ...request,
                  ai_summary: "Smoke Misafir için balkonlu oda talebi.",
                  ai_suggested_reply: "Merhaba Smoke Misafir, talebinizi aldık. Müsaitlik ve fiyat bilgisi işletme sahibi tarafından kontrol edilip size dönüş yapılacaktır."
                }
              : request
          )
        }
      }),
      pullRequests: async () => ({ ok: true, count: 0, requests: [] }),
      markRequestsSynced: async () => ({ ok: true, count: 0 }),
      pushMenu: async () => ({ ok: true, category_count: 0, item_count: 0 }),
      pushAndroidSnapshot: async () => ({
        ok: true,
        message: "Android özeti yayınlandı.",
        published_at: "2026-07-11T10:17:00+03:00",
        updated_at: "2026-07-11T10:17:00+03:00",
        task_count: 2
      }),
      saveMenuCategory: async () => ({ ok: false, message: "smoke" }),
      saveMenuItem: async () => ({ ok: false, message: "smoke" }),
      openExternal: async () => true
    };
  }, {
    setupData: { ...createSetupFixture(), setupRequired: false, syncSecret: "smoke-secret-12345" },
    dashboardData: createDashboardConversionFixture()
  });
  await conversionPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(conversionPage.getByRole("button", { name: "Yedek Al" })).toBeVisible();
  await conversionPage.getByRole("button", { name: "Yedek Al" }).click();
  await expect(conversionPage.getByText("yardimci-asistan-smoke.sqlite")).toBeVisible();
  await expect(conversionPage.getByRole("button", { name: "Android'e Yayınla" })).toBeVisible();
  await conversionPage.getByRole("button", { name: "Android'e Yayınla" }).click();
  await expect(conversionPage.getByText("2 günlük iş ile Android özeti yayınlandı.")).toBeVisible();
  await expect(conversionPage.getByRole("button", { name: "AI Taslak Yenile" })).toBeVisible();
  await conversionPage.getByRole("button", { name: "AI Taslak Yenile" }).click();
  await expect(conversionPage.getByText("Smoke Misafir için balkonlu oda talebi.")).toBeVisible();
  await expect(conversionPage.getByText("AI cevap taslağı yenilendi.")).toBeVisible();
  await expect(conversionPage.getByRole("button", { name: "Rezervasyona Çevir" })).toBeVisible();
  await conversionPage.getByRole("button", { name: "Rezervasyona Çevir" }).click();
  await expect(conversionPage.getByText("Rezervasyona çevrildi", { exact: true })).toBeVisible();
  await expect(conversionPage.getByText("Talep rezervasyona çevrildi ve onaylandı.")).toBeVisible();
  await conversionPage.getByRole("button", { name: "Talepler", exact: true }).click();
  await expect(conversionPage.getByRole("heading", { name: "Talepler" })).toBeVisible();
  await conversionPage.getByLabel("Ad soyad").fill("Manuel Smoke");
  await conversionPage.getByLabel("Telefon").fill("0555 333 44 66");
  await conversionPage.getByLabel("Tarih notu").fill("Bu akşam");
  await conversionPage.getByLabel("Giriş tarihi").fill("2026-07-18");
  await conversionPage.getByLabel("Saat").fill("21:00");
  await conversionPage.getByLabel("Kişi").fill("3");
  await conversionPage.getByLabel("Not", { exact: true }).fill("Telefonla alınan bahçe masası talebi.");
  await conversionPage.getByRole("button", { name: "Manuel Talep Kaydet" }).click();
  await expect(conversionPage.getByLabel("Talep yönetimi").getByText("Manuel talep kaydedildi.")).toBeVisible();
  await expect(conversionPage.getByRole("heading", { name: "Manuel Smoke" })).toBeVisible();
  await conversionPage.getByRole("button", { name: "Cevaplandı İşaretle" }).click();
  await expect(conversionPage.getByText("Talep durumu güncellendi.")).toBeVisible();
  await conversionPage.getByRole("button", { name: "Müşteriler" }).click();
  await expect(conversionPage.getByRole("heading", { name: "Müşteriler" })).toBeVisible();
  await expect(conversionPage.getByRole("heading", { name: "Smoke Misafir" })).toBeVisible();
  await conversionPage.getByLabel("Ara").fill("Smoke");
  await expect(conversionPage.getByText("Balkonlu oda için bilgi almak istiyorum.")).toBeVisible();
  await conversionPage.getByRole("button", { name: "Raporlar" }).click();
  await expect(conversionPage.getByRole("heading", { name: "Raporlar" })).toBeVisible();
  await expect(conversionPage.getByText("Talep dönüşümü")).toBeVisible();
  await expect(conversionPage.getByText("Kritik İşler")).toBeVisible();
  await conversionPage.getByRole("button", { name: "Günlük İşler" }).click();
  await expect(conversionPage.getByRole("heading", { name: "Günlük İşler" })).toBeVisible();
  await expect(conversionPage.getByText("Oda 101 giriş hazırlığı")).toBeVisible();
  await conversionPage.getByRole("button", { name: "Tamamla" }).first().click();
  await expect(conversionPage.getByText("Günlük iş durumu güncellendi.")).toBeVisible();
  await conversionPage.getByRole("button", { name: "Odalar" }).click();
  await expect(conversionPage.getByRole("heading", { name: "Odalar" })).toBeVisible();
  await conversionPage.getByRole("button", { name: "Dolu" }).first().click();
  await expect(conversionPage.getByText("Oda durumu güncellendi.")).toBeVisible();
  await conversionPage.getByRole("button", { name: "Masalar" }).click();
  await expect(conversionPage.getByRole("heading", { name: "Masalar" })).toBeVisible();
  await conversionPage.getByRole("button", { name: "Hesap" }).first().click();
  await expect(conversionPage.getByText("Masa durumu güncellendi.")).toBeVisible();
  await conversionPage.getByRole("button", { name: "Rezervasyonlar" }).click();
  await expect(conversionPage.getByRole("heading", { name: "Rezervasyonlar" })).toBeVisible();
  await expect(conversionPage.getByLabel("Durum")).toBeVisible();
  await conversionPage.getByLabel("Tarih").fill("2026-07-18");
  await expect(conversionPage.getByText(/1\s*görünen kayıt/)).toBeVisible();
  await conversionPage.getByLabel("Durum").selectOption("pending");
  await expect(conversionPage.getByText(/1\s*görünen kayıt/)).toBeVisible();
  await conversionPage.getByRole("button", { name: "Onayla" }).first().click();
  await expect(conversionPage.getByText("Rezervasyon durumu güncellendi.")).toBeVisible();
  await conversionPage.getByRole("button", { name: "Filtreyi Temizle" }).click();
  await expect(conversionPage.getByRole("button", { name: "WhatsApp Onay" })).toBeVisible();

  const pullPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await pullPage.addInitScript(({ setupData, dashboardData, pulledRequest }) => {
    let currentDashboardData = dashboardData;
    window.yardimciDesktop = {
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
            newRequests: 1
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
      saveMenuItem: async () => ({ ok: false, message: "smoke" }),
      openExternal: async () => true
    };
  }, {
    setupData: { ...createSetupFixture(), setupRequired: false, syncSecret: "smoke-secret-12345" },
    dashboardData: createDashboardFixture(),
    pulledRequest: createPulledRequestFixture()
  });
  await pullPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(pullPage.getByText("Henüz yeni talep yok.")).toBeVisible();
  await pullPage.getByRole("button", { name: "Web Taleplerini Çek" }).click();
  await expect(pullPage.getByText("1 talep alındı.")).toBeVisible();
  await expect(pullPage.getByRole("heading", { name: "Web Sync Smoke" })).toBeVisible();
  await expect(pullPage.getByText("Bahçe masa için canlı web talebi.")).toBeVisible();
  await pullPage.screenshot({ path: "artifacts/screenshots/desktop-web-pull-flow.png", fullPage: true });

  const setupPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupPage.addInitScript(({ setupData, dashboardData }) => {
    window.yardimciDesktop = {
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
      getDashboardData: async () => dashboardData,
      getSetupData: async () => setupData,
      saveInitialSetup: async (input) => ({
        ok: true,
        message: "İlk kurulum ayarları kaydedildi.",
        setupData: {
          ...setupData,
          setupRequired: false,
          businessName: input.businessName,
          businessType: input.businessType,
          phone: input.phone,
          whatsapp: input.whatsapp,
          email: input.email,
          address: input.address,
          webModuleUrl: input.webModuleUrl,
          syncSecret: input.syncSecret,
          aiEnabled: input.aiEnabled,
          aiProvider: input.aiProvider,
          aiModel: input.aiModel,
          modules: input.modules,
          initialCounts: input.initialCounts
        },
        dashboardData: {
          ...dashboardData,
          webModuleUrl: input.webModuleUrl
        }
      }),
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
      saveMenuCategory: async () => ({ ok: false, message: "smoke" }),
      saveMenuItem: async () => ({ ok: false, message: "smoke" }),
      openExternal: async () => true
    };
  }, {
    setupData: createSetupFixture(),
    dashboardData: createDashboardFixture()
  });
  await setupPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(setupPage.getByRole("heading", { name: "İşletme panelini kullanıma hazırlayın." })).toBeVisible();
  await expect(setupPage.getByLabel("Firma adı")).toHaveValue("Deniz Çiçeği Pansiyon & Kafe");
  await setupPage.screenshot({ path: "artifacts/screenshots/desktop-setup-wizard.png", fullPage: true });
  await setupPage.getByLabel("Firma adı").fill("Smoke Pansiyon");
  await setupPage.getByLabel("Web modül adresi").fill("http://127.0.0.1:8080");
  await setupPage.getByRole("button", { name: "Kurulumu Kaydet" }).click();
  await expect(setupPage.getByRole("heading", { name: "Ana Ekran" })).toBeVisible();

  await browser.close();
  console.log(`desktop-renderer-ok: ${baseUrl}`);
} catch (error) {
  if (serverOutput.trim()) {
    console.error(serverOutput.trim());
  }
  throw error;
} finally {
  server.kill();
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const freePort = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(freePort));
    });
  });
}

async function waitForUrl(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Renderer server is still starting.
    }

    await delay(100);
  }

  throw new Error(`Desktop renderer did not become ready: ${url}`);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createSetupFixture() {
  return {
    setupRequired: true,
    businessName: "Deniz Çiçeği Pansiyon & Kafe",
    businessType: "pension_restaurant",
    phone: "+905321234567",
    whatsapp: "+905321234567",
    email: "merhaba@denizcicegi.example",
    address: "Sahil Yolu No: 18, Akyaka / Muğla",
    webModuleUrl: "http://127.0.0.1:8080",
    syncSecret: "change-this-secret",
    aiEnabled: false,
    aiProvider: "openai_compatible",
    aiModel: "",
    modules: {
      rooms: true,
      tables: true,
      qrMenu: true,
      whatsapp: true,
      android: true
    },
    initialCounts: {
      rooms: 2,
      tables: 2
    }
  };
}

function createDashboardFixture() {
  return {
    databasePath: "/tmp/yardimci-asistan.sqlite",
    backupPath: "/tmp/yardimci-asistan/backups",
    webModuleUrl: "http://127.0.0.1:8080",
    requests: [],
    rooms: [
      {
        id: "room_smoke_101",
        name: "Smoke Balkonlu Oda",
        number: "101",
        capacity: 2,
        bedInfo: "1 çift kişilik yatak",
        floor: "1. Kat",
        status: "available",
        features: ["Klima", "Balkon"],
        description: "Renderer smoke oda kaydı.",
        priceNote: "",
        isActive: true,
        sortOrder: 1,
        activeReservationTitle: "Smoke Misafir - 2 gece",
        updatedAt: "2026-07-11T10:00:00+03:00"
      }
    ],
    tables: [
      {
        id: "table_smoke_001",
        name: "Smoke Bahçe Masası",
        area: "Bahçe",
        capacity: 4,
        status: "available",
        currentCustomerId: "",
        currentReservationId: "reservation_smoke_001",
        activeReservationTitle: "Smoke Misafir - akşam",
        notes: "",
        isActive: true,
        sortOrder: 1,
        updatedAt: "2026-07-11T10:00:00+03:00"
      }
    ],
    reservations: [
      {
        id: "reservation_smoke_001",
        requestId: "request_smoke_001",
        customerId: "customer_smoke_001",
        customerName: "Smoke Misafir",
        customerPhone: "+905321234567",
        reservationType: "room",
        status: "pending",
        title: "Smoke Misafir - 2 gece",
        startDate: "2026-07-18",
        endDate: "2026-07-20",
        time: "",
        guestCount: 2,
        adultCount: 2,
        childCount: 0,
        roomIds: ["room_smoke_101"],
        tableIds: [],
        notes: "Balkonlu oda istedi.",
        priceNote: "Fiyat işletme sahibi tarafından verilecek.",
        paymentStatus: "not_required",
        updatedAt: "2026-07-11T10:15:00+03:00"
      }
    ],
    dailyTasks: [
      {
        id: "task_smoke_001",
        title: "Oda 101 giriş hazırlığı",
        description: "Smoke Misafir için giriş hazırlığı.",
        taskType: "check_in",
        status: "pending",
        dueDate: "2026-07-18",
        dueTime: "14:00",
        relatedType: "reservation",
        relatedId: "reservation_smoke_001",
        updatedAt: "2026-07-11T10:15:00+03:00"
      },
      {
        id: "task_smoke_002",
        title: "Bahçe masası kontrolü",
        description: "Akşam servisi öncesi masa kontrolü.",
        taskType: "table_reservation",
        status: "pending",
        dueDate: "2026-07-18",
        dueTime: "18:00",
        relatedType: "table",
        relatedId: "table_smoke_001",
        updatedAt: "2026-07-11T10:15:00+03:00"
      }
    ],
    customers: [
      {
        id: "customer_smoke_001",
        fullName: "Smoke Misafir",
        phone: "+905321234567",
        email: "",
        source: "web_form",
        notes: "Balkonlu oda için bilgi almak istiyor.",
        tags: ["smoke", "pansiyon"],
        lastContactAt: "2026-07-11T10:15:00+03:00",
        requestCount: 1,
        reservationCount: 1,
        updatedAt: "2026-07-11T10:15:00+03:00"
      }
    ],
    menu: {
      categories: [],
      items: [],
      updated_at: "2026-07-10T10:00:00+03:00"
    },
    summary: {
      newRequests: 0,
      pendingDailyTasks: 0,
      availableRooms: 0,
      totalRooms: 0,
      availableTables: 0,
      pendingReservations: 0,
      preparedWhatsAppMessages: 0,
      activeMenuCategories: 0,
      availableMenuItems: 0
    }
  };
}

function createDashboardConversionFixture() {
  return {
    ...createDashboardFixture(),
    requests: [
      {
        id: "request_smoke_001",
        customer_id: "",
        source: "web_form",
        request_type: "pension_reservation",
        status: "new",
        customer_name: "Smoke Misafir",
        customer_phone: "+905321234567",
        date_text: "18-20 Temmuz",
        start_date: "2026-07-18",
        end_date: "2026-07-20",
        time: "",
        guest_count: 2,
        adult_count: 2,
        child_count: 0,
        message: "Balkonlu oda için bilgi almak istiyorum.",
        ai_summary: "2 kişilik balkonlu oda talebi.",
        ai_suggested_reply: "Merhaba, müsaitliği kontrol edip dönüş yapacağız.",
        whatsapp_message: "Merhaba, müsaitliği kontrol edip dönüş yapacağız.",
        assigned_to: "",
        priority: "normal",
        sync_status: "synced",
        created_at: "2026-07-11T10:15:00+03:00",
        updated_at: "2026-07-11T10:15:00+03:00"
      }
    ],
    summary: {
      ...createDashboardFixture().summary,
      newRequests: 1
    }
  };
}

function createPulledRequestFixture() {
  return {
    id: "request_web_pull_smoke_001",
    customer_id: "customer_web_pull_smoke_001",
    source: "web_form",
    request_type: "restaurant_reservation",
    status: "new",
    customer_name: "Web Sync Smoke",
    customer_phone: "+905551112233",
    date_text: "Bu akşam",
    start_date: "2026-07-18",
    end_date: "",
    time: "20:30",
    guest_count: 4,
    adult_count: 4,
    child_count: 0,
    message: "Bahçe masa için canlı web talebi.",
    ai_summary: "",
    ai_suggested_reply: "",
    whatsapp_message: "Merhaba, masa talebinizi aldık. Uygunluğu kontrol edip size dönüş yapacağız.",
    assigned_to: "",
    priority: "normal",
    sync_status: "synced",
    synced_at: "2026-07-11T10:45:00+03:00",
    created_at: "2026-07-11T10:44:00+03:00",
    updated_at: "2026-07-11T10:45:00+03:00"
  };
}
