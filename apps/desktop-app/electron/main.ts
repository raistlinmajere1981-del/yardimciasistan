import { app, BrowserWindow, ipcMain, session, shell } from "electron";
import path from "node:path";
import { configureNetworkFamilyAttemptTimeout } from "./network-runtime";
import { desktopLogError, desktopLogInfo, desktopLogWarn } from "./desktop-logger";
import { LocalCompanionServer } from "./local-companion-server";
import { projectLocalAndroidSnapshotForDevice } from "./local-android-device-projection";
import {
  BUSINESS_CAPABILITIES,
  getOperationalTaskDomain,
  getRequestTypeRequiredCapability,
  hasBusinessCapability,
  isOperationalTaskAvailable,
  isReservationTypeAvailable,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import {
  markAndroidActionResult,
  pullAndroidActions,
  pushAndroidSnapshot
} from "@yardimci-asistan/sync-core";
import type {
  AndroidOperationsSnapshot,
  PushAiSettingsResult,
  PushAndroidSnapshotResult
} from "@yardimci-asistan/sync-core";
import {
  DesktopDatabase,
  type DesktopDashboardData,
  type DesktopSetupData,
  type DesktopSetupSaveResult,
  type SaveInitialSetupInput,
  type SaveMenuItemInput,
  type DesktopAndroidDeviceMutationResult,
  type DesktopStatusUpdateResult,
  type DesktopStockImageApplyResult,
  type DesktopCustomerMutationResult
} from "./database";
import { DesktopFinanceService } from "./finance";
import { resolveProjectBackupPath } from "./data-maintenance";
import { resolveDataRoot } from "./data-paths.js";
import { projectAndroidOperationsSnapshot } from "./android-capability-projection";
import { createAndroidMarketSnapshotSource } from "./market-android-snapshot.js";
import { DesktopRoomFolioService, type DesktopRoomFolio } from "./room-folio";
import {
  SyncCoordinator,
  type AutomaticSyncCycleResult,
  type AutomaticSyncStatus
} from "./sync-coordinator";
import { BirthdayDeliveryService } from "./birthday-delivery-service.js";
import { BirthdayScheduler } from "./birthday-scheduler.js";
import { WhatsAppDeliveryAdapter, WhatsAppDeliveryLock } from "./whatsapp-delivery-adapter.js";
import { WhatsAppWebviewDriver } from "./whatsapp-webview-driver.js";
import { registerTableOrderIpcHandlers } from "./ipc/table-order-ipc";
import { registerReservationIpcHandlers } from "./ipc/reservation-ipc";
import { registerDailyTaskIpcHandlers } from "./ipc/daily-task-ipc";
import { registerRequestIpcHandlers } from "./ipc/request-ipc";
import { registerCustomerIpcHandlers } from "./ipc/customer-ipc";
import { registerWhatsAppIpcHandlers, registerWhatsAppWebviewIpcEvents } from "./ipc/whatsapp-ipc";
import { registerMenuIpcHandlers } from "./ipc/menu-ipc";
import { registerAndroidDeviceIpcHandlers } from "./ipc/android-device-ipc";
import { registerRoomTableIpcHandlers } from "./ipc/room-table-ipc";
import { registerSetupIpcHandlers } from "./ipc/setup-ipc";
import { registerImageAnalysisIpcHandlers } from "./ipc/image-analysis-ipc";
import { createDesktopAiConfig, normalizeAiTimeoutSeconds } from "./ai-config";
import {
  createAiApiKeyUpdate,
  createAiProfileApiKeyUpdates,
  getEffectiveAiApiKey
} from "./ai-secret-service";
import { publishSavedAiSettings } from "./ai-settings-publish-service";
import { registerAiSecretIpcHandlers } from "./ipc/ai-secret-ipc";
import { registerAiConnectionIpcHandlers } from "./ipc/ai-connection-ipc";
import { registerAiWorkspaceIpcHandlers } from "./ipc/ai-workspace-ipc";
import { registerReportIpcHandlers } from "./ipc/report-ipc";
import { getWebSyncConfig } from "./sync-config";
import { registerSyncIpcHandlers } from "./ipc/sync-ipc";
import { DesktopAppLockService } from "./app-lock-service";
import { registerAppLockIpcHandlers } from "./ipc/app-lock-ipc";

configureNetworkFamilyAttemptTimeout();

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const WHATSAPP_WEB_PARTITION = "persist:yardimci-whatsapp";
let desktopDatabase: DesktopDatabase | null = null;
let syncCoordinator: SyncCoordinator | null = null;
let androidActionSyncInFlight: Promise<AndroidActionProcessSummary> | null = null;
let androidSnapshotPublishPending = true;
const marketBarcodeFastPullSenders = new Set<number>();
let appLockService: DesktopAppLockService | null = null;
let birthdayScheduler: BirthdayScheduler | null = null;
let localCompanionServer: LocalCompanionServer | null = null;
const birthdayWebviewDriver = new WhatsAppWebviewDriver();
const whatsappDeliveryLock = new WhatsAppDeliveryLock();
const birthdayDeliveryAdapter = new WhatsAppDeliveryAdapter(birthdayWebviewDriver, whatsappDeliveryLock);
const C = BUSINESS_CAPABILITIES;

function enabledBusinessCapabilities(): BusinessCapability[] {
  return getDatabase().getEnabledBusinessCapabilities();
}

function assertDesktopCapability(capability: BusinessCapability, message = "Bu işlem işletmenin etkin yeteneklerinde kullanılamıyor.") {
  if (!hasBusinessCapability(enabledBusinessCapabilities(), capability)) {
    throw new Error(message);
  }
}

function assertDesktopRequestType(requestType: string) {
  assertDesktopCapability(C.CUSTOMERS, "Müşteri talepleri bu işletmede etkin değil.");
  const requiredCapability = getRequestTypeRequiredCapability(requestType);
  if (requiredCapability) {
    assertDesktopCapability(requiredCapability, "Bu talep türü işletmenin etkin yeteneklerinde kullanılamıyor.");
  }
}

function assertMenuItemSubfeatureMutation(input: SaveMenuItemInput) {
  const capabilities = new Set(enabledBusinessCapabilities());
  const itemId = input.id?.trim();
  const existing = itemId
    ? getDatabase().getPublishedMenu().items.find((item) => item.id === itemId)
    : undefined;
  const baseline = existing ?? {
    stock_quantity: null,
    stock_min_quantity: null,
    stock_unit: "piece",
    stock_consumption_quantity: 1,
    hide_when_out_of_stock: false,
    stock_note: null
  };
  const stockChanged = !nullableNumberEqual(input.stock_quantity, baseline.stock_quantity)
    || !nullableNumberEqual(input.stock_min_quantity, baseline.stock_min_quantity)
    || input.stock_unit !== baseline.stock_unit
    || Number(input.stock_consumption_quantity) !== Number(baseline.stock_consumption_quantity)
    || String(input.stock_note ?? "").trim() !== String(baseline.stock_note ?? "").trim();
  if (stockChanged && !capabilities.has(C.INVENTORY)) {
    throw new Error("Stok alanları bu işletmede etkin değil.");
  }
  if (Boolean(input.hide_when_out_of_stock) !== Boolean(baseline.hide_when_out_of_stock)
      && (!capabilities.has(C.INVENTORY) || !capabilities.has(C.QR_MENU))) {
    throw new Error("Stokta yokken QR menüden gizleme bu işletmede etkin değil.");
  }
}

function nullableNumberEqual(left: unknown, right: unknown): boolean {
  const leftEmpty = left === null || left === undefined;
  const rightEmpty = right === null || right === undefined;
  if (leftEmpty || rightEmpty) return leftEmpty && rightEmpty;
  return Number.isFinite(Number(left)) && Number(left) === Number(right);
}

function assertDesktopReservationType(
  reservationType: string,
  roomIds: readonly unknown[] = [],
  tableIds: readonly unknown[] = []
) {
  if (!isReservationTypeAvailable(enabledBusinessCapabilities(), reservationType, { roomIds, tableIds })) {
    throw new Error("Bu rezervasyon alanı işletmenin etkin yeteneklerinde kullanılamıyor.");
  }
}

function assertDesktopTaskScope(
  taskType: string,
  relatedType = "",
  relatedReservationType = "",
  relatedReservationRoomIds: readonly unknown[] = [],
  relatedReservationTableIds: readonly unknown[] = []
) {
  const capabilities = enabledBusinessCapabilities();
  const reservationContext = { roomIds: relatedReservationRoomIds, tableIds: relatedReservationTableIds };
  if (!isOperationalTaskAvailable(capabilities, taskType, relatedType, relatedReservationType, reservationContext)) {
    const domain = getOperationalTaskDomain(taskType, relatedType, relatedReservationType, reservationContext);
    if (domain === "accommodation") {
      throw new Error("Konaklama işi bu işletmenin etkin yeteneklerinde kullanılamıyor.");
    }
    if (domain === "food_service") {
      throw new Error("Restoran işi bu işletmenin etkin yeteneklerinde kullanılamıyor.");
    }
    throw new Error("Günlük işler bu işletmenin etkin yeteneklerinde kullanılamıyor.");
  }
}

function isWhatsAppUrl(value: string) {
  try {
    const url = new URL(value);
    return ["wa.me", "www.wa.me", "web.whatsapp.com", "api.whatsapp.com"].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

interface AndroidActionProcessSummary {
  pulled: number;
  applied: number;
  failed: number;
}

function resolveRuntimeDataRoot(): string {
  return resolveDataRoot({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    defaultUserDataPath: app.getPath("userData")
  });
}

if (process.env.YA_DESKTOP_DATA_DIR) {
  app.setPath("userData", path.resolve(process.env.YA_DESKTOP_DATA_DIR));
}

// Linux Chromium native date/time popovers take their action labels from the
// process locale. Keep them Turkish alongside the renderer lang switch.
if (process.platform === "linux") {
  process.env.LANG = "tr_TR.UTF-8";
  process.env.LC_ALL = "tr_TR.UTF-8";
}
app.commandLine.appendSwitch("lang", "tr-TR");

// Some Wayland compositors advertise color-management-v1 without every sRGB
// capability Chromium expects, which otherwise produces repeated startup errors.
if (process.platform === "linux" && process.env.XDG_SESSION_TYPE?.toLowerCase() === "wayland") {
  const disabledFeatures = new Set(
    app.commandLine
      .getSwitchValue("disable-features")
      .split(",")
      .map((feature) => feature.trim())
      .filter(Boolean)
  );
  disabledFeatures.add("WaylandWpColorManagerV1");
  app.commandLine.appendSwitch("disable-features", [...disabledFeatures].join(","));
}

interface DesktopBootstrapData {
  appName: string;
  version: string;
  platform: NodeJS.Platform;
  syncSettings: {
    webModuleUrl: string;
    hasSyncSecret: boolean;
  };
  databasePath: string;
  userDataPath: string;
  backupPath: string;
  setup: DesktopSetupData;
}

function createMainWindow() {
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 720,
    title: "Yardımcı Asistan",
    icon: getAppIconPath(),
    backgroundColor: "#fff8ee",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });

  window.removeMenu();

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      if (!isWhatsAppUrl(url) || hasBusinessCapability(enabledBusinessCapabilities(), C.WHATSAPP)) {
        void shell.openExternal(url);
      }
    }

    return { action: "deny" };
  });

  window.once("ready-to-show", () => {
    window.maximize();
    window.show();
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(__dirname, "..", "dist-renderer", "index.html"));
  }
}

function getAppIconPath() {
  const iconFile = process.platform === "win32" ? "app-icon.ico" : "app-icon.png";
  return path.join(app.getAppPath(), "assets", iconFile);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) {
      return;
    }
    if (window.isMinimized()) {
      window.restore();
    }
    window.show();
    window.focus();
  });

  void app.whenReady().then(() => {
    session.fromPartition(WHATSAPP_WEB_PARTITION).setUserAgent(createChromeUserAgent(), "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7");
    configureDesktopMediaPermissions();

    desktopDatabase = new DesktopDatabase({
      appPath: app.getAppPath(),
      userDataPath: resolveRuntimeDataRoot(),
      backupPath: resolveProjectBackupPath()
    });
    desktopDatabase.initialize();
    appLockService = new DesktopAppLockService({
      database: desktopDatabase,
      getSyncStatus: () => syncCoordinator?.getStatus(),
      onUnlocked: () => {
        void birthdayScheduler?.evaluateNow();
      }
    });
    syncCoordinator = new SyncCoordinator({
      database: desktopDatabase,
      getSyncConfig: () => getWebSyncConfig(getDatabase().getSetupData()),
      createAndroidSnapshot: () => createAndroidOperationsSnapshot(getDatabase().getDashboardData()),
      onDashboardChanged: () => notifyDesktopDashboardChanged(getDatabase().getDashboardData()),
      onStatusChanged: notifySyncStatusChanged
    });
    localCompanionServer = new LocalCompanionServer({
      desktopId: () => getDatabase().getSyncRuntimeStatus().clientId,
      createSummary: (deviceId) => projectLocalAndroidSnapshotForDevice(
        createAndroidOperationsSnapshot(getDatabase().getDashboardData()),
        deviceId
      ),
      // Faz 4 local pairing store'u gelene kadar summary/action bilinçli olarak kapalı.
      authorize: () => false,
      applyAction: (action) => {
        const result = getDatabase().applyAndroidAction(action);
        getDatabase().recordAndroidActionResult(action, result);
        markLocalCompanionSnapshotDirty();
        notifyDesktopDashboardChanged(getDatabase().getDashboardData());
        androidSnapshotPublishPending = true;
        getSyncCoordinator().scheduleSoon();
        return result;
      },
      logInfo: (message) => desktopLogInfo("local-companion", message),
      logWarn: (message, error) => desktopLogWarn("local-companion", message, error),
      logError: (message, error) => desktopLogError("local-companion", message, error)
    });

    const birthdayDeliveryService = new BirthdayDeliveryService(desktopDatabase, birthdayDeliveryAdapter);
    birthdayScheduler = new BirthdayScheduler({
      database: desktopDatabase,
      deliveryService: birthdayDeliveryService,
      isWhatsAppEnabled: () => {
        if (getAppLockService().isLocked()) return false;
        const capabilities = enabledBusinessCapabilities();
        return hasBusinessCapability(capabilities, C.CUSTOMERS) && hasBusinessCapability(capabilities, C.WHATSAPP);
      },
      onDashboardChanged: () => notifyDesktopDashboardChanged(getDatabase().getDashboardData())
    });
    registerIpcHandlers();
    createMainWindow();
    syncCoordinator.start();
    birthdayScheduler.start();
    void localCompanionServer.start().catch((error) => {
      desktopLogError("local-companion", "Local companion server could not start.", error);
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });
}

function configureDesktopMediaPermissions() {
  session.defaultSession.setPermissionCheckHandler((webContents, permission, _origin) => {
    const trustedRenderer = webContents?.getType() === "window"
      && isTrustedDesktopRendererUrl(webContents.getURL());
    return Boolean(trustedRenderer && (permission === "media" || permission === "clipboard-sanitized-write"));
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const mediaTypes = "mediaTypes" in details ? details.mediaTypes : undefined;
    const trustedRenderer = webContents.getType() === "window"
      && isTrustedDesktopRendererUrl(webContents.getURL());
    if (trustedRenderer && permission === "clipboard-sanitized-write") {
      callback(true);
      return;
    }
    callback(
      trustedRenderer
      && permission === "media"
      && Array.isArray(mediaTypes)
      && mediaTypes.includes("video")
      && !mediaTypes.includes("audio")
    );
  });
}

function isTrustedDesktopRendererUrl(value: string): boolean {
  try {
    const candidate = new URL(value);
    if (candidate.protocol === "file:") {
      return true;
    }
    if (!isDev || !process.env.VITE_DEV_SERVER_URL) {
      return false;
    }
    return candidate.origin === new URL(process.env.VITE_DEV_SERVER_URL).origin;
  } catch {
    return false;
  }
}

function createChromeUserAgent() {
  const chromeMajorVersion = process.versions.chrome.split(".")[0] || "144";
  const platform =
    process.platform === "win32"
      ? "Windows NT 10.0; Win64; x64"
      : process.platform === "darwin"
        ? "Macintosh; Intel Mac OS X 10_15_7"
        : "X11; Linux x86_64";

  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajorVersion}.0.0.0 Safari/537.36`;
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    syncCoordinator?.stop();
    birthdayScheduler?.stop();
    void localCompanionServer?.stop();
    desktopDatabase?.close();
    app.quit();
  }
});

app.on("before-quit", () => {
  syncCoordinator?.stop();
  birthdayScheduler?.stop();
  void localCompanionServer?.stop();
});

function registerIpcHandlers() {
  registerAppLockIpcHandlers(getAppLockService());

  ipcMain.handle("app:getBootstrapData", (): DesktopBootstrapData => {
    assertAppSessionUnlocked();
    return {
      appName: "Yardımcı Asistan",
      version: app.getVersion(),
      platform: process.platform,
      syncSettings: {
        webModuleUrl: getDatabase().getSetupData().webModuleUrl,
        hasSyncSecret: Boolean(getDatabase().getSetupData().syncSecret)
      },
      databasePath: getDatabase().databasePath,
      userDataPath: getDatabase().userDataPath,
      backupPath: getDatabase().backupPath,
      setup: getDatabase().getSetupData()
    };
  });

  registerSyncIpcHandlers({
    getDatabase,
    getCoordinator: getSyncCoordinator,
    assertCapability: assertDesktopCapability,
    afterSuccessfulPull: () => processAndroidActionQueue(true),
    publishAndroidSnapshot: publishCurrentAndroidSnapshot,
    publishAiSettings: publishSavedAiSettingsFromMain
  });

  registerReportIpcHandlers({
    getDatabase,
    assertUnlocked: assertAppSessionUnlocked,
    assertCapability: assertDesktopCapability
  });

  ipcMain.handle("sync:setMarketBarcodeFastPull", (event, enabled: unknown) => {
    assertAppSessionUnlocked();
    const shouldEnable = enabled === true;
    const senderId = event.sender.id;
    if (shouldEnable) {
      assertDesktopCapability(C.CATALOG, "Telefon barkod modu için ürün kataloğu etkin olmalı.");
      assertDesktopCapability(C.SALES, "Telefon barkod modu için satış yeteneği etkin olmalı.");
      assertDesktopCapability(C.RETAIL_BARCODE, "Telefon barkod modu için barkod yeteneği etkin olmalı.");
      if (!marketBarcodeFastPullSenders.has(senderId)) {
        marketBarcodeFastPullSenders.add(senderId);
        event.sender.once("destroyed", () => {
          marketBarcodeFastPullSenders.delete(senderId);
          syncCoordinator?.setMarketBarcodeFastPullEnabled(marketBarcodeFastPullSenders.size > 0);
        });
      }
    } else {
      marketBarcodeFastPullSenders.delete(senderId);
    }
    return getSyncCoordinator().setMarketBarcodeFastPullEnabled(marketBarcodeFastPullSenders.size > 0);
  });

  registerMenuIpcHandlers({
    getDatabase,
    assertCapability: assertDesktopCapability,
    assertMenuItemSubfeatureMutation: assertMenuItemSubfeatureMutation,
    finalizeRecordDeletion: finalizeDesktopRecordDeletion
  });

  registerImageAnalysisIpcHandlers({
    getDatabase,
    assertCapability: assertDesktopCapability,
    finalizeStockImageApply: finalizeStockImageApply
  });

  registerSetupIpcHandlers({
    assertUnlocked: assertAppSessionUnlocked,
    getSetupData: () => getDatabase().getSetupData(),
    saveInitial: saveInitialSetupFromRenderer
  });

  registerAiSecretIpcHandlers({
    getDatabase,
    assertUnlocked: assertAppSessionUnlocked
  });

  registerAndroidDeviceIpcHandlers({
    getDatabase,
    assertCapability: assertDesktopCapability,
    finalizeDeviceMutation: finalizeAndroidDeviceMutation
  });

  registerAiConnectionIpcHandlers({
    getDatabase
  });

  registerRequestIpcHandlers({
    getDatabase,
    assertCapability: assertDesktopCapability,
    assertRequestType: assertDesktopRequestType,
    finalizeRecordDeletion: finalizeDesktopRecordDeletion
  });

  registerCustomerIpcHandlers({
    getDatabase,
    assertCapability: assertDesktopCapability,
    finalizeRecordDeletion: finalizeDesktopRecordDeletion,
    finalizeCustomerMutation: finalizeDesktopCustomerMutation
  });

  registerWhatsAppWebviewIpcEvents({
    isTrustedRendererUrl: isTrustedDesktopRendererUrl,
    attachWebview: (id) => birthdayWebviewDriver.attach(id),
    detachWebview: (id) => birthdayWebviewDriver.detach(id),
    setUserBusy: (busy) => whatsappDeliveryLock.setUserBusy(busy),
    evaluateBirthdayNow: () => {
      void birthdayScheduler?.evaluateNow();
    }
  });

  registerWhatsAppIpcHandlers({
    getDatabase,
    assertCapability: assertDesktopCapability,
    finalizeRecordDeletion: finalizeDesktopRecordDeletion
  });

  registerRoomTableIpcHandlers({
    getDatabase,
    assertCapability: assertDesktopCapability
  });

  registerTableOrderIpcHandlers({
    getDatabase,
    assertCapability: assertDesktopCapability
  });

  registerReservationIpcHandlers({
    getDatabase,
    assertCapability: assertDesktopCapability,
    assertReservationType: assertDesktopReservationType,
    finalizeOperationMutation: finalizeDesktopOperationMutation
  });

  registerDailyTaskIpcHandlers({
    getDatabase,
    assertTaskScope: assertDesktopTaskScope,
    finalizeOperationMutation: finalizeDesktopOperationMutation
  });

  registerAiWorkspaceIpcHandlers({
    getDatabase,
    assertCapability: assertDesktopCapability
  });

  ipcMain.handle("shell:openExternal", async (_event, url: string) => {
    if (!/^https?:\/\//.test(url) && !/^tel:/.test(url)) {
      return false;
    }
    if (isWhatsAppUrl(url)) {
      assertDesktopCapability(C.WHATSAPP, "WhatsApp bu işletmede etkin değil.");
    }

    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle("dashboard:getData", (): DesktopDashboardData => {
    assertAppSessionUnlocked();
    return getDatabase().getDashboardData();
  });
}

async function saveInitialSetupFromRenderer(input: SaveInitialSetupInput): Promise<DesktopSetupSaveResult> {
  assertAppSessionUnlocked();
  const secretUpdate = createAiApiKeyUpdate(input);
  if (!secretUpdate.ok) {
    return secretUpdate;
  }
  const profileSecretUpdates = createAiProfileApiKeyUpdates(input);
  if (!profileSecretUpdates.ok) {
    return profileSecretUpdates;
  }

  const localResult = getDatabase().saveInitialSetup({
    ...input,
    aiApiKey: String(input.aiApiKey ?? "").trim() ? "__encrypted_in_main_process__" : "",
    aiProfiles: profileSecretUpdates.profiles
  }, secretUpdate.update, profileSecretUpdates.updates);
  if (!localResult.ok) {
    return localResult;
  }

  const aiWebSync = await publishSavedAiSettingsFromMain();
  getSyncCoordinator().restart();
  void birthdayScheduler?.evaluateNow();
  const setupData = getDatabase().getSetupData();
  const dashboardData = getDatabase().getDashboardData();

  if (!aiWebSync.ok) {
    return {
      ...localResult,
      message: `Ayarlar bu bilgisayarda kaydedildi. Web sitesine uygulanamadı: ${aiWebSync.message}`,
      setupData,
      dashboardData,
      aiWebSync
    };
  }

  return {
    ...localResult,
    message: "Ayarlar kaydedildi ve AI bağlantısı web sitesinde güncellendi.",
    setupData,
    dashboardData,
    aiWebSync
  };
}

export function markLocalCompanionSnapshotDirty(): number {
  return localCompanionServer?.markSnapshotDirty() ?? 0;
}

function finalizeAndroidDeviceMutation(result: DesktopAndroidDeviceMutationResult): DesktopAndroidDeviceMutationResult {
  if (result.ok) {
    markLocalCompanionSnapshotDirty();
    androidSnapshotPublishPending = true;
    notifyDesktopDashboardChanged(getDatabase().getDashboardData());
    getSyncCoordinator().scheduleSoon();
  }
  return result;
}

function finalizeDesktopOperationMutation(result: DesktopStatusUpdateResult): DesktopStatusUpdateResult {
  if (result.ok) {
    markLocalCompanionSnapshotDirty();
    androidSnapshotPublishPending = true;
    notifyDesktopDashboardChanged(result.dashboardData);
    getSyncCoordinator().scheduleSoon();
  }
  return result;
}

function finalizeDesktopRecordDeletion(result: DesktopStatusUpdateResult): DesktopStatusUpdateResult {
  if (result.ok) {
    markLocalCompanionSnapshotDirty();
    androidSnapshotPublishPending = true;
    notifyDesktopDashboardChanged(result.dashboardData);
    getSyncCoordinator().scheduleSoon();
  }
  return result;
}

function finalizeDesktopCustomerMutation(result: DesktopCustomerMutationResult): DesktopCustomerMutationResult {
  if (result.ok) {
    markLocalCompanionSnapshotDirty();
    androidSnapshotPublishPending = true;
    notifyDesktopDashboardChanged(result.dashboardData);
    getSyncCoordinator().scheduleSoon();
  }
  return result;
}

function finalizeStockImageApply(result: DesktopStockImageApplyResult): DesktopStockImageApplyResult {
  if (result.ok) {
    markLocalCompanionSnapshotDirty();
    notifyDesktopDashboardChanged(result.dashboardData);
    androidSnapshotPublishPending = true;
    getSyncCoordinator().scheduleSoon();
  }
  return result;
}

function toUnknownRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getDatabase() {
  if (!desktopDatabase) {
    throw new Error("Desktop database is not initialized.");
  }

  return desktopDatabase;
}

function getAppLockService(): DesktopAppLockService {
  if (!appLockService) {
    throw new Error("App lock service is not initialized.");
  }
  return appLockService;
}

export function assertAppSessionUnlocked() {
  getAppLockService().assertUnlocked();
}

function getSyncCoordinator() {
  if (!syncCoordinator) {
    throw new Error("Sync coordinator is not initialized.");
  }
  return syncCoordinator;
}

function canUseAndroidSync(setup: DesktopSetupData, allowPlaceholderSecret: boolean) {
  const { baseUrl, syncSecret } = getWebSyncConfig(setup);
  return hasBusinessCapability(enabledBusinessCapabilities(), C.ANDROID)
    && Boolean(baseUrl.trim())
    && Boolean(syncSecret.trim())
    && (allowPlaceholderSecret || syncSecret.trim() !== "change-this-secret");
}

function processAndroidActionQueue(allowPlaceholderSecret: boolean): Promise<AndroidActionProcessSummary> {
  if (androidActionSyncInFlight) {
    return androidActionSyncInFlight;
  }

  androidActionSyncInFlight = processAndroidActionQueueOnce(allowPlaceholderSecret)
    .finally(() => {
      androidActionSyncInFlight = null;
    });
  return androidActionSyncInFlight;
}

async function processAndroidActionQueueOnce(allowPlaceholderSecret: boolean): Promise<AndroidActionProcessSummary> {
  const summary: AndroidActionProcessSummary = { pulled: 0, applied: 0, failed: 0 };
  const setup = getDatabase().getSetupData();
  if (!canUseAndroidSync(setup, allowPlaceholderSecret)) {
    return summary;
  }

  const syncConfig = getWebSyncConfig(setup);
  const pullResult = await pullAndroidActions({ ...syncConfig, limit: 100 });
  if (!pullResult.ok) {
    getDatabase().recordSyncEvent({
      direction: "pull",
      entityType: "android_action",
      ok: false,
      message: pullResult.message,
      status: pullResult.status
    });
    return summary;
  }

  const androidDevicesChanged = getDatabase().upsertAndroidDeviceSightings(pullResult.devices ?? []);
  summary.pulled = pullResult.count;
  for (const action of pullResult.actions) {
    const applyResult = getDatabase().applyAndroidAction(action);
    getDatabase().recordAndroidActionResult(action, applyResult);
    const actionStatus = applyResult.ok ? "applied" : "failed";
    const markResult = await markAndroidActionResult({
      ...syncConfig,
      actionId: action.id,
      status: actionStatus,
      errorMessage: applyResult.ok ? "" : applyResult.message
    });

    if (applyResult.ok) {
      summary.applied += 1;
    } else {
      summary.failed += 1;
    }
    if (!markResult.ok) {
      getDatabase().recordSyncEvent({
        direction: "push",
        entityType: "android_action_result",
        ok: false,
        message: markResult.message,
        status: markResult.status
      });
    }
  }

  getDatabase().recordSyncEvent({
    direction: "pull",
    entityType: "android_action",
    ok: true,
    recordCount: summary.pulled,
    message: `${summary.applied} telefon işlemi uygulandı, ${summary.failed} işlem uygulanamadı.`
  });
  if (summary.applied > 0 || summary.failed > 0 || androidDevicesChanged > 0) {
    markLocalCompanionSnapshotDirty();
    notifyDesktopDashboardChanged(getDatabase().getDashboardData());
    androidSnapshotPublishPending = true;
  }
  if (androidSnapshotPublishPending) {
    await publishCurrentAndroidSnapshot();
  }
  return summary;
}

function notifyDesktopDashboardChanged(dashboardData: DesktopDashboardData) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send("dashboard:dataChanged", dashboardData);
    }
  }
}

function notifySyncStatusChanged(status: AutomaticSyncStatus) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send("sync:statusChanged", status);
    }
  }
}

async function publishCurrentAndroidSnapshot(): Promise<PushAndroidSnapshotResult> {
  const setup = getDatabase().getSetupData();
  const snapshot = createAndroidOperationsSnapshot(getDatabase().getDashboardData());
  const result = await pushAndroidSnapshot({
    ...getWebSyncConfig(setup),
    clientId: getDatabase().getSyncRuntimeStatus().clientId,
    snapshot
  });

  getDatabase().recordSyncEvent({
    direction: "push",
    entityType: "android_snapshot",
    ok: result.ok,
    recordCount: result.ok ? result.task_count + snapshot.requests.length + snapshot.rooms.length + snapshot.tables.length : 0,
    message: result.message,
    status: result.ok ? undefined : result.status
  });
  androidSnapshotPublishPending = !result.ok;
  return result;
}

function createAndroidOperationsSnapshot(dashboardData: DesktopDashboardData): AndroidOperationsSnapshot {
  const updatedAt = new Date().toISOString();
  const today = formatLocalDateKey(new Date());
  const activeTableOrders = getDatabase()
    .listTableOrders()
    .filter((order) => ["open", "preparing", "served", "payment"].includes(order.status));
  const activeMenuCategories = dashboardData.menu.categories.filter((category) => category.is_active);
  const activeMenuCategoryIds = new Set(activeMenuCategories.map((category) => category.id));
  const menuCategoryNames = new Map(dashboardData.menu.categories.map((category) => [category.id, category.name]));
  const androidMenu = {
    categories: activeMenuCategories,
    items: dashboardData.menu.items.filter((item) => item.is_available && activeMenuCategoryIds.has(item.category_id)),
    updated_at: dashboardData.menu.updated_at
  };
  const financeData = new DesktopFinanceService(getDatabase().databasePath).getData(20);
  const roomFolioData = new DesktopRoomFolioService(getDatabase().databasePath).getData();
  const messages = getDatabase().getAndroidPreparedMessages().map((message) => ({
    id: message.id,
    request_id: message.requestId,
    customer_name: message.customerName,
    customer_phone: message.customerPhone,
    message: message.message,
    status: message.status,
    updated_at: message.updatedAt
  }));

  const source: AndroidOperationsSnapshot = {
    business_capabilities: [],
    summary: {
      pending_daily_tasks: dashboardData.summary.pendingDailyTasks,
      today_tasks: dashboardData.dailyTasks.filter((task) => task.dueDate === today && task.status !== "archived").length,
      available_rooms: dashboardData.summary.availableRooms,
      total_rooms: dashboardData.summary.totalRooms,
      available_tables: dashboardData.summary.availableTables,
      occupied_tables: dashboardData.tables.filter((table) => table.status === "occupied").length,
      bill_waiting_tables: dashboardData.tables.filter((table) => table.status === "bill_waiting").length,
      active_table_orders: activeTableOrders.length,
      pending_reservations: dashboardData.summary.pendingReservations,
      prepared_whatsapp_messages: messages.length,
      waiting_responses: dashboardData.requests.filter((request) => ["new", "seen", "waiting_owner"].includes(request.status)).length,
      active_menu_categories: dashboardData.summary.activeMenuCategories,
      available_menu_items: dashboardData.summary.availableMenuItems,
      customer_count: dashboardData.customers.length
    },
    daily_tasks: dashboardData.dailyTasks
      .filter((task) => task.status !== "archived")
      .slice(0, 200)
      .map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        task_type: task.taskType,
        status: task.status,
        due_date: task.dueDate,
        due_time: task.dueTime,
        related_type: task.relatedType,
        related_id: task.relatedId,
        related_reservation_type: task.relatedType === "reservation"
          ? dashboardData.reservations.find((reservation) => reservation.id === task.relatedId)?.reservationType ?? ""
          : "",
        updated_at: task.updatedAt
      })),
    requests: dashboardData.requests.slice(0, 300).map((request) => ({
      id: request.id,
      customer_id: request.customer_id,
      request_type: request.request_type,
      status: request.status,
      customer_name: request.customer_name,
      customer_phone: request.customer_phone,
      date_text: request.date_text,
      start_date: request.start_date,
      end_date: request.end_date,
      time: request.time,
      guest_count: request.guest_count,
      message: request.message,
      ai_summary: request.ai_summary,
      ai_suggested_reply: request.ai_suggested_reply,
      whatsapp_message: request.whatsapp_message,
      priority: request.priority,
      created_at: request.created_at,
      updated_at: request.updated_at
    })),
    customers: dashboardData.customers.slice(0, 300).map((customer) => ({
      id: customer.id,
      full_name: customer.fullName,
      phone: customer.phone,
      email: customer.email,
      notes: customer.notes,
      tags: customer.tags,
      identity_type: customer.identityType,
      identity_number: customer.identityNumber,
      nationality: customer.nationality,
      birth_date: customer.birthDate,
      gender: customer.gender,
      document_serial_number: customer.documentSerialNumber,
      document_expiry_date: customer.documentExpiryDate,
      birth_place: customer.birthPlace,
      mother_name: customer.motherName,
      father_name: customer.fatherName,
      issuing_authority: customer.issuingAuthority,
      address: customer.address,
      request_count: customer.requestCount,
      reservation_count: customer.reservationCount,
      stay_count: customer.stayCount,
      updated_at: customer.updatedAt
    })),
    customer_room_stays: dashboardData.customerRoomStays.slice(0, 500).map((stay) => ({
      id: stay.id,
      customer_id: stay.customerId,
      customer_name: stay.customerName,
      customer_phone: stay.customerPhone,
      room_id: stay.roomId,
      room_name: stay.roomName,
      room_number: stay.roomNumber,
      reservation_id: stay.reservationId,
      status: stay.status,
      check_in_date: stay.checkInDate,
      check_out_date: stay.checkOutDate,
      guest_count: stay.guestCount,
      notes: stay.notes,
      source: stay.source,
      checked_in_at: stay.checkedInAt,
      checked_out_at: stay.checkedOutAt,
      created_at: stay.createdAt,
      updated_at: stay.updatedAt
    })),
    room_folios: roomFolioData.folios
      .filter((folio): folio is DesktopRoomFolio & { status: "open" } => folio.status === "open")
      .slice(0, 100)
      .map((folio) => ({
        id: folio.id,
        stay_id: folio.stayId,
        room_id: folio.roomId,
        room_name: folio.roomName,
        room_number: folio.roomNumber,
        customer_id: folio.customerId,
        customer_name: folio.customerName,
        status: folio.status,
        guest_count: folio.guestCount,
        check_in_date: folio.checkInDate,
        planned_check_out_date: folio.plannedCheckOutDate,
        nights: folio.nights,
        nightly_price_minor: folio.nightlyPriceMinor,
        currency: folio.currency,
        lodging_total_minor: folio.lodgingTotalMinor,
        extras_total_minor: folio.extrasTotalMinor,
        charge_total_minor: folio.chargeTotalMinor,
        paid_total_minor: folio.paidTotalMinor,
        remaining_minor: folio.remainingMinor,
        opened_at: folio.openedAt
      })),
    reservations: dashboardData.reservations.slice(0, 300).map((reservation) => ({
      id: reservation.id,
      request_id: reservation.requestId,
      customer_id: reservation.customerId,
      customer_name: reservation.customerName,
      customer_phone: reservation.customerPhone,
      reservation_type: reservation.reservationType,
      status: reservation.status,
      title: reservation.title,
      start_date: reservation.startDate,
      end_date: reservation.endDate,
      time: reservation.time,
      guest_count: reservation.guestCount,
      room_ids: reservation.roomIds,
      table_ids: reservation.tableIds,
      notes: reservation.notes,
      payment_status: reservation.paymentStatus,
      updated_at: reservation.updatedAt
    })),
    rooms: dashboardData.rooms.filter((room) => room.isActive).map((room) => ({
      id: room.id,
      name: room.name,
      number: room.number,
      capacity: room.capacity,
      status: room.status,
      active_reservation_title: room.activeReservationTitle,
      updated_at: room.updatedAt
    })),
    tables: dashboardData.tables.filter((table) => table.isActive).map((table) => ({
      id: table.id,
      name: table.name,
      area: table.area,
      capacity: table.capacity,
      status: table.status,
      active_reservation_title: table.activeReservationTitle,
      updated_at: table.updatedAt
    })),
    menu: androidMenu,
    admin_menu: dashboardData.menu,
    deleted_request_ids: getDatabase().getDeletedRequestIds(),
    trackedStockItems: dashboardData.menu.items
      .filter((item) => item.stock_quantity !== null)
      .map((item) => ({
        menu_item_id: item.id,
        name: item.name,
        category: menuCategoryNames.get(item.category_id) ?? "Menü",
        price: item.price,
        stock_quantity: item.stock_quantity ?? 0,
        stock_min_quantity: item.stock_min_quantity,
        stock_unit: item.stock_unit,
        stock_consumption_quantity: item.stock_consumption_quantity,
        hide_when_out_of_stock: item.hide_when_out_of_stock,
        stock_status: getMenuStockStatus(item.stock_quantity ?? 0, item.stock_min_quantity, item.stock_consumption_quantity)
      })),
    appliedStockImageHashes: getDatabase().getAppliedStockImageHashes(100),
    table_orders: activeTableOrders.map((order) => ({
      id: order.id,
      table_id: order.tableId,
      table_name: order.tableName,
      status: order.status,
      opened_at: order.openedAt,
      total: order.total,
      item_count: order.itemCount,
      items: order.items.map((item) => ({
        id: item.id,
        order_id: item.orderId,
        menu_item_id: item.menuItemId,
        product_name: item.productName,
        unit_price: item.unitPrice,
        currency: item.currency,
        quantity: item.quantity,
        line_total: item.lineTotal,
        status: item.status,
        updated_at: item.updatedAt
      })),
      updated_at: order.updatedAt
    })),
    messages: messages.slice(0, 300),
    androidPermissions: getDatabase().getAndroidPermissionSnapshot(),
    finance: {
      generated_at: financeData.generatedAt,
      currency: "TRY",
      today_income_minor: financeData.todayIncomeMinor,
      today_expense_minor: financeData.todayExpenseMinor,
      today_net_minor: financeData.todayNetMinor,
      outstanding_pension_minor: financeData.outstandingPensionMinor,
      recent_entries: financeData.recentEntries.slice(0, 20).map((entry) => ({
        id: entry.id,
        direction: entry.direction,
        amount_minor: entry.amountMinor,
        currency: entry.currency,
        payment_method: entry.paymentMethod,
        category: entry.category,
        description: entry.description,
        occurred_at: entry.occurredAt,
        source_type: entry.sourceType,
        source_id: entry.sourceId,
        note: entry.note,
        created_at: entry.createdAt
      }))
    },
    reports: getDatabase().getAndroidReportPresets(today),
    market: createAndroidMarketSnapshotSource(getDatabase().databasePath, today),
    updated_at: updatedAt
  };
  return projectAndroidOperationsSnapshot(source, enabledBusinessCapabilities(), today);
}

function getMenuStockStatus(quantity: number, minimum: number | null, consumptionQuantity = 1): "out_of_stock" | "low_stock" | "in_stock" {
  if (quantity < consumptionQuantity) {
    return "out_of_stock";
  }
  if (minimum !== null && quantity <= minimum) {
    return "low_stock";
  }
  return "in_stock";
}

function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function publishSavedAiSettingsFromMain(): Promise<PushAiSettingsResult> {
  const database = getDatabase();
  return publishSavedAiSettings(
    database,
    getWebSyncConfig(database.getSetupData())
  );
}
