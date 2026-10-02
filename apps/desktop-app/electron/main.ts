import { app, BrowserWindow } from "electron";
import path from "node:path";
import { configureNetworkFamilyAttemptTimeout } from "./network-runtime";
import { desktopLog } from "./desktop-logger";
import { resolveProjectBackupPath } from "./data-maintenance";
import { LocalCompanionServer } from "./local-companion-server";
import { LocalCompanionPairingService } from "./local-companion-pairing-service";
import { projectLocalAndroidSnapshotForDevice } from "./local-android-device-projection";
import { LocalCompanionMdnsAdvertiser } from "./local-companion-mdns";
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
  LOCAL_COMPANION_PROTOCOL_VERSION,
  LOCAL_COMPANION_SERVICE_TYPE,
  markAndroidActionResult,
  pullAndroidActions,
  pushAndroidSnapshot
} from "@yardimci-asistan/sync-core";
import type {
  PushAiSettingsResult,
  PushAndroidSnapshotResult,
  PushBusinessContextResult
} from "@yardimci-asistan/sync-core";
import {
  DesktopDatabase,
  type DesktopDashboardData,
  type DesktopSetupData,
  type DesktopSetupSaveResult,
  type SaveInitialSetupInput,
  type SaveMenuItemInput,
  type DesktopMenuSaveResult,
  type DesktopAndroidDeviceMutationResult,
  type DesktopStatusUpdateResult,
  type DesktopStockImageApplyResult,
  type DesktopCustomerMutationResult,
  type DesktopKbsDeliveryMutationResult
} from "./database";
import {
  SyncCoordinator,
  type AutomaticSyncStatus
} from "./sync-coordinator";
import { BirthdayDeliveryService } from "./birthday-delivery-service.js";
import { BirthdayScheduler } from "./birthday-scheduler.js";
import { WhatsAppDeliveryAdapter, WhatsAppDeliveryLock } from "./whatsapp-delivery-adapter.js";
import { WhatsAppWebviewDriver } from "./whatsapp-webview-driver.js";
import { EgmKbsWebviewDriver } from "./egm-kbs-webview-driver.js";
import { EgmKbsBackgroundSession } from "./egm-kbs-background-session.js";
import { EgmKbsProviderAdapter, JandarmaKbsProviderAdapter } from "./kbs-provider-adapters.js";
import {
  createAiApiKeyUpdate,
  createAiProfileApiKeyUpdates
} from "./ai-secret-service";
import { publishSavedAiSettings } from "./ai-settings-publish-service";
import { publishBusinessAiContext } from "./business-ai-context-service";
import { createBusinessAiCatalog } from "./business-ai-catalog-service";
import { createPublicRoomCatalog } from "./public-room-catalog-publication";
import { createPublicTableCatalog } from "./public-table-catalog-publication";
import { publishPendingRoomMedia } from "./room-media-publication";
import { publishPendingTableMedia } from "./table-media-publication";
import { EGM_KBS_PARTITION, getKbsSettings } from "./kbs-settings";
import { getGoogleReviewsSettings, publishGoogleReviewsSettings } from "./google-reviews-settings";
import { getWebSyncConfig } from "./sync-config";
import { DesktopAppLockService } from "./app-lock-service";
import { isWhatsAppUrl } from "./ipc/app-ipc";
import { createAndroidOperationsSnapshot } from "./android-operations-snapshot";
import {
  configureDesktopSessionRuntime,
  createDesktopMainWindow,
  createTrustedDesktopRendererUrlPredicate
} from "./desktop-runtime";
import {
  prepareRuntimeDataForStartup,
  resolveRuntimeDataRoot
} from "./desktop-startup-data";
import { registerDesktopIpcHandlers } from "./desktop-ipc-registry";

configureNetworkFamilyAttemptTimeout();

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const isTrustedDesktopRendererUrl = createTrustedDesktopRendererUrlPredicate(
  isDev,
  process.env.VITE_DEV_SERVER_URL
);
const WHATSAPP_WEB_PARTITION = "persist:yardimci-whatsapp";
let desktopDatabase: DesktopDatabase | null = null;
let syncCoordinator: SyncCoordinator | null = null;
let androidActionSyncInFlight: Promise<AndroidActionProcessSummary> | null = null;
let maintenanceSyncSuspended = false;
let androidSnapshotPublishPending = true;
let appLockService: DesktopAppLockService | null = null;
let birthdayScheduler: BirthdayScheduler | null = null;
let localCompanionServer: LocalCompanionServer | null = null;
let localCompanionPairingService: LocalCompanionPairingService | null = null;
let localCompanionMdnsAdvertiser: LocalCompanionMdnsAdvertiser | null = null;
const birthdayWebviewDriver = new WhatsAppWebviewDriver();
const egmKbsInteractiveDriver = new EgmKbsWebviewDriver();
const egmKbsBackgroundDriver = new EgmKbsWebviewDriver();
const egmKbsBackgroundSession = new EgmKbsBackgroundSession(egmKbsBackgroundDriver);
const egmKbsProviderAdapter = new EgmKbsProviderAdapter(egmKbsBackgroundSession);
const jandarmaKbsProviderAdapter = new JandarmaKbsProviderAdapter();
const kbsDeliveryInFlight = new Map<string, Promise<DesktopKbsDeliveryMutationResult>>();
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

function reconcileEgmKbsBackgroundSession() {
  if (appLockService?.isLocked()) {
    egmKbsBackgroundSession.destroy();
    return;
  }
  const settings = getKbsSettings(getDatabase().databasePath);
  if (settings.enabled && settings.provider === "egm") {
    void egmKbsBackgroundSession.refresh();
  } else {
    egmKbsBackgroundSession.destroy();
  }
}

function deliverKbsNotificationOnce(notificationIdInput: string): Promise<DesktopKbsDeliveryMutationResult> {
  const notificationId = notificationIdInput.trim();
  const existing = kbsDeliveryInFlight.get(notificationId);
  if (existing) return existing;

  const delivery = getDatabase().deliverKbsNotification(
    notificationId,
    [egmKbsProviderAdapter, jandarmaKbsProviderAdapter]
  ).finally(() => {
    if (kbsDeliveryInFlight.get(notificationId) === delivery) {
      kbsDeliveryInFlight.delete(notificationId);
    }
  });
  kbsDeliveryInFlight.set(notificationId, delivery);
  return delivery;
}

function assertDesktopRequestType(requestType: string) {
  assertDesktopCapability(C.REQUESTS, "Müşteri talepleri bu işletmede etkin değil.");
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

interface AndroidActionProcessSummary {
  pulled: number;
  applied: number;
  failed: number;
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

function createMainWindow() {
  return createDesktopMainWindow({
    isDev,
    devServerUrl: process.env.VITE_DEV_SERVER_URL,
    allowExternalUrl: (url) =>
      !isWhatsAppUrl(url)
      || hasBusinessCapability(enabledBusinessCapabilities(), C.WHATSAPP),
    onClosed: () => {
      egmKbsBackgroundSession.destroy();
    }
  });
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

  void app.whenReady().then(async () => {
    const runtimeDataRoot = resolveRuntimeDataRoot();
    if (!await prepareRuntimeDataForStartup(runtimeDataRoot, {
      whatsappPartition: WHATSAPP_WEB_PARTITION,
      kbsPartition: EGM_KBS_PARTITION
    })) {
      app.quit();
      return;
    }

    configureDesktopSessionRuntime({
      whatsappPartition: WHATSAPP_WEB_PARTITION,
      kbsPartition: EGM_KBS_PARTITION,
      isTrustedRendererUrl: isTrustedDesktopRendererUrl
    });

    desktopDatabase = new DesktopDatabase({
      appPath: app.getAppPath(),
      userDataPath: runtimeDataRoot,
      backupPath: resolveProjectBackupPath(runtimeDataRoot)
    });
    desktopDatabase.initialize();
    appLockService = new DesktopAppLockService({
      database: desktopDatabase,
      getSyncStatus: () => syncCoordinator?.getStatus(),
      onUnlocked: () => {
        void birthdayScheduler?.evaluateNow();
        reconcileEgmKbsBackgroundSession();
      },
      onLocked: () => {
        egmKbsBackgroundSession.destroy();
      }
    });
    reconcileEgmKbsBackgroundSession();
    syncCoordinator = new SyncCoordinator({
      database: desktopDatabase,
      getSyncConfig: () => getWebSyncConfig(getDatabase().getSetupData()),
      createAndroidSnapshot: () => createAndroidOperationsSnapshot(getDatabase(), getDatabase().getDashboardData()),
      createAiCatalog: () => createBusinessAiCatalog(getDatabase()),
      createRoomCatalog: () => createPublicRoomCatalog(
        getDatabase().databasePath,
        getDatabase().getEnabledBusinessCapabilities(),
        getDatabase().userDataPath
      ),
      prepareRoomCatalog: (config, clientId) => publishPendingRoomMedia(
        getDatabase().userDataPath,
        config,
        clientId
      ),
      createTableCatalog: () => createPublicTableCatalog(
        getDatabase().databasePath,
        getDatabase().getEnabledBusinessCapabilities(),
        getDatabase().userDataPath
      ),
      prepareTableCatalog: (config, clientId) => publishPendingTableMedia(
        getDatabase().userDataPath,
        config,
        clientId
      ),
      onDashboardChanged: () => {
        markLocalCompanionSnapshotDirty();
        notifyDesktopDashboardChanged(getDatabase().getDashboardData());
      },
      onStatusChanged: (status) => {
        notifySyncStatusChanged(status);
        reconcileLocalCompanionAdvertisement();
      }
    });
    localCompanionPairingService = new LocalCompanionPairingService(getDatabase(), {
      desktopId: () => getDatabase().getSyncRuntimeStatus().clientId,
      syncSecret: () => getWebSyncConfig(getDatabase().getSetupData()).syncSecret,
      localNetworkEnabled: () => localCompanionEnabled()
    });
    localCompanionServer = new LocalCompanionServer({
      desktopId: () => getDatabase().getSyncRuntimeStatus().clientId,
      businessInfo: () => {
        const setup = getDatabase().getSetupData();
        return {
          displayName: setup.businessName,
          phone: setup.phone,
          whatsapp: setup.whatsapp
        };
      },
      createSummary: (deviceId) => projectLocalAndroidSnapshotForDevice(
        createAndroidOperationsSnapshot(getDatabase(), getDatabase().getDashboardData()),
        deviceId
      ),
      authorize: ({ deviceId, token }) =>
        getDatabase().authorizeAndroidLocalCredential(deviceId, token),
      enabled: () => localCompanionEnabled(),
      pair: ({ pairingTicket, deviceId, deviceName, appVersion }) => {
        if (!hasBusinessCapability(enabledBusinessCapabilities(), C.ANDROID)) {
          return {
            ok: false,
            code: "android_capability_disabled",
            message: "Android bağlantısı bu işletmede etkin değil.",
            statusCode: 403
          };
        }
        const service = getLocalCompanionPairingService();
        const result = service.pair({
          pairingTicket,
          deviceId,
          deviceName,
          appVersion
        });
        if (result.ok) {
          notifyDesktopDashboardChanged(getDatabase().getDashboardData());
          androidSnapshotPublishPending = true;
          getSyncCoordinator().scheduleSoon();
        }
        return result;
      },
      applyAction: (action) => {
        const result = getDatabase().applyAndroidAction(action);
        getDatabase().recordAndroidActionResult(action, result);
        notifyDesktopDashboardChanged(getDatabase().getDashboardData());
        androidSnapshotPublishPending = true;
        getSyncCoordinator().scheduleSoon();
        return result;
      }
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
    if (!desktopDatabase.getSetupData().setupRequired) {
      void publishBusinessAiContextFromMain();
      if (getGoogleReviewsSettings(desktopDatabase.databasePath).publicationPending) {
        void publishGoogleReviewsSettingsFromMain();
      }
    }
    void localCompanionServer.start()
      .then(() => {
        reconcileLocalCompanionAdvertisement();
      })
      .catch((error) => {
        desktopLog.error({
          scope: "local-companion",
          event: "local-companion.server.start.failed",
          message: "Yerel companion sunucusu başlatılamadı.",
          error
        });
      });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    syncCoordinator?.stop();
    birthdayScheduler?.stop();
    localCompanionMdnsAdvertiser?.stop();
    void localCompanionServer?.stop();
    desktopDatabase?.close();
    app.quit();
  }
});

app.on("before-quit", () => {
  syncCoordinator?.stop();
  birthdayScheduler?.stop();
  localCompanionMdnsAdvertiser?.stop();
  void localCompanionServer?.stop();
});

function registerIpcHandlers() {
  registerDesktopIpcHandlers({
    getDatabase,
    getSyncCoordinator,
    getAppLockService,
    assertUnlocked: assertAppSessionUnlocked,
    assertCapability: assertDesktopCapability,
    enabledBusinessCapabilities,
    afterSuccessfulPull: () => processAndroidActionQueue(true),
    publishAndroidSnapshot: publishCurrentAndroidSnapshot,
    publishAiSettings: publishSavedAiSettingsFromMain,
    publishBusinessAiContext: () => {
      void publishBusinessAiContextFromMain();
    },
    deliverKbsNotification: deliverKbsNotificationOnce,
    onKbsSettingsSaved: reconcileEgmKbsBackgroundSession,
    isTrustedRendererUrl: isTrustedDesktopRendererUrl,
    kbsInteractiveDriver: egmKbsInteractiveDriver,
    kbsBackgroundSession: egmKbsBackgroundSession,
    assertMenuItemSubfeatureMutation,
    finalizeMenuMutation: finalizeDesktopMenuMutation,
    finalizeStockImageApply,
    saveInitial: saveInitialSetupFromRenderer,
    finalizeDeviceMutation: finalizeAndroidDeviceMutation,
    assertRequestType: assertDesktopRequestType,
    finalizeRecordDeletion: finalizeDesktopRecordDeletion,
    finalizeCustomerMutation: finalizeDesktopCustomerMutation,
    finalizeCheckInMutation: finalizeDesktopCheckInMutation,
    finalizeCheckoutMutation: finalizeDesktopCheckoutMutation,
    finalizeRoomChangeMutation: finalizeDesktopRoomChangeMutation,
    assertReservationType: assertDesktopReservationType,
    finalizeOperationMutation: finalizeDesktopOperationMutation,
    assertTaskScope: assertDesktopTaskScope,
    birthdayWebviewDriver,
    whatsappDeliveryLock,
    birthdayDeliveryAdapter,
    evaluateBirthdayNow: () => {
      void birthdayScheduler?.evaluateNow();
    }
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

  markLocalCompanionSnapshotDirty();
  androidSnapshotPublishPending = true;
  reconcileLocalCompanionAdvertisement();
  getSyncCoordinator().scheduleSoon();

  const [aiWebSync, businessContextWebSync] = await Promise.all([
    publishSavedAiSettingsFromMain(),
    publishBusinessAiContextFromMain()
  ]);
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
      aiWebSync,
      businessContextWebSync
    };
  }

  return {
    ...localResult,
    message: businessContextWebSync.ok
      ? "Ayarlar kaydedildi; AI bağlantısı ve işletme bağlamı web sitesinde güncellendi."
      : `Ayarlar bu bilgisayarda kaydedildi. İşletme AI bağlamı web sitesine uygulanamadı: ${businessContextWebSync.message}`,
    setupData,
    dashboardData,
    aiWebSync,
    businessContextWebSync
  };
}

export function markLocalCompanionSnapshotDirty(): number {
  return localCompanionServer?.markSnapshotDirty() ?? 0;
}

export function scheduleAutomaticSyncSoon() {
  if (!maintenanceSyncSuspended) {
    syncCoordinator?.scheduleSoon();
  }
}

export async function suspendAutomaticSyncForMaintenance() {
  maintenanceSyncSuspended = true;
  marketBarcodeFastPullSenders.clear();
  await syncCoordinator?.suspendAndDrain();
  const androidPull = androidActionSyncInFlight;
  if (androidPull) {
    try {
      await androidPull;
    } catch {
      // The normal Android sync path records its own failure state.
    }
  }
  // Draining the Android path can itself attempt to schedule a follow-up.
  await syncCoordinator?.suspendAndDrain();
}

export function resumeAutomaticSyncAfterMaintenanceAbort() {
  maintenanceSyncSuspended = false;
  syncCoordinator?.restart();
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

function finalizeDesktopMenuMutation<T extends DesktopMenuSaveResult | DesktopStatusUpdateResult>(result: T): T {
  if (result.ok) {
    markLocalCompanionSnapshotDirty();
    androidSnapshotPublishPending = true;
    notifyDesktopDashboardChanged(result.dashboardData);
    if (hasBusinessCapability(enabledBusinessCapabilities(), C.QR_MENU)) {
      getDatabase().queueSyncJob("menu_publish");
    }
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

function finalizeDesktopHospitalityMutation(
  result: DesktopCustomerMutationResult,
  kinds: readonly ("arrival" | "departure" | "room_change")[]
): DesktopCustomerMutationResult {
  if (!result.ok) return result;

  const overview = result.dashboardData.kbsOverview;
  const savedId = result.savedId;
  if (overview.enabled && overview.configured) {
    const relevant = result.dashboardData.hospitalityNotifications.filter((notification) =>
      notification.stayId === savedId
      && kinds.includes(notification.kind)
      && notification.status !== "sent"
    );
    const ready = relevant.filter((notification) => notification.identityReady);
    const missingIdentityCount = relevant.length - ready.length;
    const notes = [
      ready.length > 0 ? `KBS: ${ready.length} bildirim arka planda işleniyor.` : "",
      missingIdentityCount > 0 ? `KBS: ${missingIdentityCount} misafirde kimlik bilgisi eksik.` : ""
    ].filter(Boolean);

    if (notes.length) {
      result = { ...result, message: `${result.message} ${notes.join(" ")}` };
    }

    if (ready.length > 0) {
      void (async () => {
        for (const notification of ready) {
          await deliverKbsNotificationOnce(notification.id);
        }
        notifyDesktopDashboardChanged(getDatabase().getDashboardData());
      })().catch((error) => {
        desktopLog.error({
          scope: "kbs",
          event: "kbs.background-delivery.failed",
          message: "KBS arka plan gönderim akışı tamamlanamadı.",
          error
        });
        notifyDesktopDashboardChanged(getDatabase().getDashboardData());
      });
    }
  }

  return finalizeDesktopCustomerMutation(result);
}

async function finalizeDesktopCheckInMutation(result: DesktopCustomerMutationResult) {
  return finalizeDesktopHospitalityMutation(result, ["arrival"]);
}

async function finalizeDesktopCheckoutMutation(result: DesktopCustomerMutationResult) {
  return finalizeDesktopHospitalityMutation(result, ["departure"]);
}

async function finalizeDesktopRoomChangeMutation(result: DesktopCustomerMutationResult) {
  return finalizeDesktopHospitalityMutation(result, ["room_change"]);
}

function finalizeStockImageApply(result: DesktopStockImageApplyResult): DesktopStockImageApplyResult {
  if (result.ok) {
    markLocalCompanionSnapshotDirty();
    notifyDesktopDashboardChanged(result.dashboardData);
    androidSnapshotPublishPending = true;
    if (hasBusinessCapability(enabledBusinessCapabilities(), C.QR_MENU)) {
      getDatabase().queueSyncJob("menu_publish");
    }
    getSyncCoordinator().scheduleSoon();
  }
  return result;
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

function getLocalCompanionPairingService(): LocalCompanionPairingService {
  if (!localCompanionPairingService) {
    throw new Error("Local companion pairing service is not initialized.");
  }
  return localCompanionPairingService;
}

function localCompanionEnabled(): boolean {
  const setup = getDatabase().getSetupData();
  return setup.localNetworkEnabled !== false
    && hasBusinessCapability(enabledBusinessCapabilities(), C.ANDROID);
}

function reconcileLocalCompanionAdvertisement() {
  const serverAddress = localCompanionServer?.address;
  if (!serverAddress || !localCompanionEnabled()) {
    localCompanionMdnsAdvertiser?.stop();
    localCompanionMdnsAdvertiser = null;
    return;
  }
  if (!localCompanionMdnsAdvertiser) {
    localCompanionMdnsAdvertiser = new LocalCompanionMdnsAdvertiser({
      desktopId: () => getDatabase().getSyncRuntimeStatus().clientId,
      protocolVersion: LOCAL_COMPANION_PROTOCOL_VERSION,
      serviceType: LOCAL_COMPANION_SERVICE_TYPE
    });
  }
  localCompanionMdnsAdvertiser.start(serverAddress.port);
}

function canUseAndroidSync(setup: DesktopSetupData, allowPlaceholderSecret: boolean) {
  const { baseUrl, syncSecret } = getWebSyncConfig(setup);
  return hasBusinessCapability(enabledBusinessCapabilities(), C.ANDROID)
    && Boolean(baseUrl.trim())
    && Boolean(syncSecret.trim())
    && (allowPlaceholderSecret || syncSecret.trim() !== "change-this-secret");
}

function processAndroidActionQueue(allowPlaceholderSecret: boolean): Promise<AndroidActionProcessSummary> {
  if (maintenanceSyncSuspended) {
    return Promise.resolve({ pulled: 0, applied: 0, failed: 0 });
  }
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
  const snapshot = createAndroidOperationsSnapshot(getDatabase(), getDatabase().getDashboardData());
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

async function publishSavedAiSettingsFromMain(): Promise<PushAiSettingsResult> {
  const database = getDatabase();
  return publishSavedAiSettings(
    database,
    getWebSyncConfig(database.getSetupData())
  );
}

async function publishGoogleReviewsSettingsFromMain() {
  const database = getDatabase();
  return publishGoogleReviewsSettings(
    database.databasePath,
    getWebSyncConfig(database.getSetupData()),
    database.getSyncRuntimeStatus().clientId
  );
}

async function publishBusinessAiContextFromMain(): Promise<PushBusinessContextResult> {
  const database = getDatabase();
  return publishBusinessAiContext(
    database,
    getWebSyncConfig(database.getSetupData())
  );
}
