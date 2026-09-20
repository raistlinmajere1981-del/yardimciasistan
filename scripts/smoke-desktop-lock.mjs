import { chromium, expect } from "@playwright/test";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import http from "node:http";
import { createCapabilitySnapshotFixture } from "./capability-smoke-fixture.mjs";

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(
  "npx",
  ["vite", "--config", "vite.renderer.config.ts", "--host", "127.0.0.1", "--port", String(port)],
  {
    cwd: "apps/desktop-app",
    stdio: ["ignore", "pipe", "pipe"]
  }
);

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForUrl(baseUrl);
  const browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

  await page.addInitScript(({ capabilitySnapshot, setupData, dashboardData }) => {
    let locked = true;
    let passwordConfigured = true;
    let password = "başlangıç-şifresi";
    const webSecurityKey = "web-security-key-123";
    let publicProfile = {
      description: "Kilit smoke işletmesi",
      latitude: 37.05,
      longitude: 28.32,
      directionsNote: "",
      checkInTime: "14:00",
      checkOutTime: "11:00",
      breakfastStartTime: "08:00",
      breakfastEndTime: "10:00",
      features: [],
      policyNote: "",
      paymentNote: "",
      languages: ["Türkçe"]
    };
    const status = () => ({
      locked,
      passwordConfigured,
      notificationCount: 7
    });
    const result = (ok, message) => ({ ok, message, status: status() });
    window.__appLockBootstrapCalls = 0;
    window.yardimciDesktop = {
      getBusinessCapabilitySnapshot: async () => capabilitySnapshot,
      setUiScale: () => undefined,
      getAppLockStatus: async () => status(),
      lockApp: async () => {
        locked = true;
        return result(true, "Uygulama kilitlendi.");
      },
      unlockApp: async (candidate) => {
        if (passwordConfigured && candidate !== password) {
          return result(false, "Şifre doğru değil.");
        }
        locked = false;
        return result(true, "Kilit açıldı.");
      },
      updateAppPassword: async ({ currentPassword, newPassword }) => {
        if (passwordConfigured && currentPassword !== password) {
          return result(false, "Mevcut şifre doğru değil.");
        }
        if (!newPassword) {
          passwordConfigured = false;
          password = "";
          return result(true, "Uygulama açılış şifresi kaldırıldı.");
        }
        const changingExistingPassword = passwordConfigured;
        passwordConfigured = true;
        password = newPassword;
        return result(
          true,
          changingExistingPassword
            ? "Uygulama açılış şifresi değiştirildi."
            : "Uygulama açılış şifresi belirlendi."
        );
      },
      resetAppPassword: async (candidate) => {
        if (candidate !== webSecurityKey) {
          return result(false, "Web güvenlik anahtarı doğru değil.");
        }
        passwordConfigured = false;
        password = "";
        locked = false;
        return result(true, "Uygulama şifresi sıfırlandı ve kilit açıldı.");
      },
      getBootstrapData: async () => {
        window.__appLockBootstrapCalls += 1;
        if (locked) {
          throw new Error("Locked bootstrap access");
        }
        return {
          appName: "Yardımcı Asistan",
          version: "0.1.1",
          platform: "linux",
          syncSettings: {
            webModuleUrl: setupData.webModuleUrl,
            hasSyncSecret: true
          },
          databasePath: dashboardData.databasePath,
          userDataPath: "/tmp/yardimci-asistan-lock-smoke",
          backupPath: dashboardData.backupPath,
          setup: {
            ...setupData,
            appPasswordConfigured: passwordConfigured
          }
        };
      },
      getDashboardData: async () => dashboardData,
      getBusinessPublicProfile: async () => publicProfile,
      saveBusinessPublicProfile: async (input) => {
        publicProfile = input;
        return { ok: true, message: "Bilgiler kaydedildi.", profile: publicProfile };
      },
      getSyncStatus: async () => ({
        enabled: true,
        clientId: "lock-smoke",
        requestCursor: 0,
        acknowledgedCursor: 0,
        lastAttemptAt: "",
        lastSuccessAt: "",
        lastError: "",
        consecutiveFailures: 0,
        pendingJobs: 0,
        nextRetryAt: "",
        phase: "idle",
        message: "Otomatik senkron hazır."
      }),
      onDashboardDataChanged: () => () => undefined,
      onSyncStatusChanged: () => () => undefined,
      getSetupData: async () => ({ ...setupData, appPasswordConfigured: passwordConfigured }),
      saveInitialSetup: async () => ({
        ok: true,
        message: "Ayarlar kaydedildi.",
        setupData: { ...setupData, appPasswordConfigured: passwordConfigured },
        dashboardData
      })
    };
  }, {
    capabilitySnapshot: createCapabilitySnapshotFixture(createSetupData(), "lock-smoke-business"),
    setupData: createSetupData(),
    dashboardData: createDashboardData()
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  const lockDialog = page.getByRole("dialog", { name: "Yardımcı Asistan kilit ekranı" });
  await expect(lockDialog).toBeVisible();
  await expect(lockDialog.getByRole("img", { name: "Yardımcı Asistan" })).toBeVisible();
  await expect(lockDialog.getByLabel("7 bildirim")).toBeVisible();
  await expect(lockDialog.getByLabel("Uygulama şifresi")).toBeFocused();
  await expect(page.locator(".desktop-shell")).toHaveCount(0);
  expect(await page.evaluate(() => window.__appLockBootstrapCalls)).toBe(0);

  await lockDialog.getByLabel("Uygulama şifresi").fill("yanlış-şifre");
  await lockDialog.getByRole("button", { name: "Kilidi Aç" }).click();
  await expect(lockDialog.getByText("Şifre doğru değil.", { exact: true })).toBeVisible();

  await lockDialog.getByRole("button", { name: "Şifremi Unuttum" }).click();
  await lockDialog.getByLabel("Web güvenlik anahtarı").fill("yanlış-web-anahtarı");
  await lockDialog.getByRole("button", { name: "Şifreyi Sıfırla ve Aç" }).click();
  await expect(lockDialog.getByText("Web güvenlik anahtarı doğru değil.", { exact: true })).toBeVisible();
  await lockDialog.getByLabel("Web güvenlik anahtarı").fill("web-security-key-123");
  await lockDialog.getByRole("button", { name: "Şifreyi Sıfırla ve Aç" }).click();

  await expect(page.getByRole("heading", { name: "Bugün ne var?" })).toBeVisible();
  await expect(page.locator(".desktop-shell")).toBeVisible();
  expect(await page.evaluate(() => window.__appLockBootstrapCalls)).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Uygulamayı kilitle" }).click();
  await expect(lockDialog).toBeVisible();
  await expect(lockDialog.getByLabel("Uygulama şifresi")).toHaveCount(0);
  await expect(lockDialog.getByText(/şifresi belirlenmemiş/i)).toBeVisible();
  await lockDialog.getByRole("button", { name: "Kilidi Aç" }).click();
  await expect(page.getByRole("heading", { name: "Bugün ne var?" })).toBeVisible();

  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Uygulama Şifresi" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bilgileri Kaydet", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Oda Bilgilerini Kaydet", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Şifreyi (Belirle|Değiştir)/, exact: true })).toHaveCount(0);
  await page.getByLabel("Şifre belirleyin").fill("yeni-şifre-42");
  await page.getByLabel("Yeni şifre tekrar").fill("yeni-şifre-42");
  await page.getByRole("button", { name: "Ayarları Kaydet", exact: true }).click();
  await expect(page.getByText("Uygulama açılış şifresi belirlendi.", { exact: true })).toBeVisible();
  await expect(page.getByText("Şifre açık", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Uygulamayı kilitle" }).click();
  await expect(lockDialog.getByLabel("Uygulama şifresi")).toBeVisible();
  await lockDialog.getByLabel("Uygulama şifresi").fill("yeni-şifre-42");
  await lockDialog.getByRole("button", { name: "Kilidi Aç" }).click();
  await expect(page.getByRole("heading", { name: "Ayarlar" })).toBeVisible();

  mkdirSync("artifacts/screenshots", { recursive: true });
  await page.getByRole("button", { name: "Uygulamayı kilitle" }).click();
  await expect(lockDialog).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: "artifacts/screenshots/desktop-app-lock.png" });

  await lockDialog.getByLabel("Uygulama şifresi").fill("yeni-şifre-42");
  await lockDialog.getByRole("button", { name: "Kilidi Aç" }).click();
  await expect(page.getByRole("heading", { name: "Ayarlar" })).toBeVisible();
  await page.getByLabel("Mevcut şifre").fill("yeni-şifre-42");
  await page.getByLabel("Yeni şifre", { exact: true }).fill("değişen-şifre-84");
  await page.getByLabel("Yeni şifre tekrar").fill("değişen-şifre-84");
  await page.getByRole("button", { name: "Ayarları Kaydet", exact: true }).click();
  await expect(page.getByText("Uygulama açılış şifresi değiştirildi.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Uygulamayı kilitle" }).click();
  await lockDialog.getByLabel("Uygulama şifresi").fill("yeni-şifre-42");
  await lockDialog.getByRole("button", { name: "Kilidi Aç" }).click();
  await expect(lockDialog.getByText("Şifre doğru değil.", { exact: true })).toBeVisible();
  await lockDialog.getByLabel("Uygulama şifresi").fill("değişen-şifre-84");
  await lockDialog.getByRole("button", { name: "Kilidi Aç" }).click();
  await expect(page.getByRole("heading", { name: "Ayarlar" })).toBeVisible();

  await page.getByLabel("Mevcut şifre").fill("değişen-şifre-84");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Şifreyi Kaldır" }).click();
  await expect(page.getByText("Uygulama açılış şifresi kaldırıldı.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Uygulamayı kilitle" }).click();
  await expect(lockDialog.getByLabel("Uygulama şifresi")).toHaveCount(0);
  await lockDialog.getByRole("button", { name: "Kilidi Aç" }).click();
  await expect(page.getByRole("heading", { name: "Ayarlar" })).toBeVisible();

  await browser.close();
  console.log(`desktop-lock-smoke-ok: ${baseUrl}`);
} catch (error) {
  if (serverOutput.trim()) {
    console.error(serverOutput.trim());
  }
  throw error;
} finally {
  server.kill();
}

function createSetupData() {
  return {
    setupRequired: false,
    appPasswordConfigured: true,
    businessName: "Kilit Smoke İşletmesi",
    profileId: "market",
    phone: "+905321234567",
    whatsapp: "+905321234567",
    email: "",
    address: "",
    webModuleUrl: "https://example.test/yardimci-asistan",
    syncSecret: "web-security-key-123",
    autoSyncEnabled: true,
    aiEnabled: false,
    aiProvider: "openai_compatible",
    aiService: "openai",
    aiProjectName: "",
    aiModel: "",
    aiBaseUrl: "https://api.openai.com/v1",
    aiTimeoutSeconds: 30,
    aiApiKeyConfigured: false,
    aiLastPublishedAt: "",
    aiProfiles: [],
    servicePreferences: {
      whatsapp: false,
      android: false
    },
    initialCounts: {
      rooms: 0,
      tables: 0
    },
    tableCategories: [],
    birthdaySettings: {
      enabled: true,
      mode: "manual",
      sendTime: "10:00",
      messageTemplate: "Doğum gününüz kutlu olsun {ad}! {işletme}"
    }
  };
}

function createDashboardData() {
  return {
    databasePath: "/tmp/yardimci-asistan-lock-smoke.sqlite",
    backupPath: "/tmp/yardimci-asistan-lock-smoke/backups",
    webModuleUrl: "https://example.test/yardimci-asistan",
    requests: [],
    rooms: [],
    tables: [],
    reservations: [],
    dailyTasks: [],
    customers: [],
    customerRoomStays: [],
    androidDevices: [],
    paymentWaitingTableOrders: [],
    androidActionFailures: [],
    birthdayOverview: {
      enabled: true,
      mode: "manual",
      today: "2026-07-23",
      candidates: [],
      dueCount: 0,
      preparedCount: 0,
      sentCount: 0,
      invalidPhoneCount: 0,
      waitingCount: 0,
      failedCount: 0
    },
    menu: {
      categories: [],
      items: [],
      updated_at: "2026-07-23T10:00:00+03:00"
    },
    summary: {
      newRequests: 0,
      waitingRequests: 0,
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
      if (response.ok) return;
    } catch {
      // Renderer server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Desktop lock renderer did not become ready: ${url}`);
}
