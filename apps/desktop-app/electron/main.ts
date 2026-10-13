import { cleanupOrphanProductImages } from "./product-data-service";
import { MarketingAnalyticsService } from "./marketing/analytics-service";
import { registerMarketingAnalyticsIpc } from "./ipc/marketing-analytics-ipc";
import { MarketingScheduleService } from "./marketing/schedule-service";
import { MarketingSchedulerService } from "./marketing/scheduler-service";
import { MarketingScheduledTargetService } from "./marketing/scheduled-target-service";
import { registerMarketingScheduleIpc } from "./ipc/marketing-schedule-ipc";
import { InstagramPublicationService } from "./marketing/instagram-publication-service";
import { InstagramOAuthService } from "./marketing/instagram-oauth-service";
import { registerMarketingProviderIpc } from "./ipc/marketing-provider-ipc";
import { SmsMessagingService } from "./business-messaging/sms-service";
import { createMarketingProviderSecretWrites } from "./marketing/provider-secrets";
import { MarketingMediaService } from "./marketing/media-service";
import { MarketingShareService } from "./marketing/share-service";
import { MarketingStudioService } from "./marketing/service";
import { MarketingWebsitePublicationService } from "./marketing/website-publication";
import { registerMarketingIpc } from "./ipc/marketing-ipc";
import { BusinessMessagingStatusSyncService } from "./business-messaging/status-sync-service";
import { BusinessMessagingService } from "./business-messaging/service";
import { BusinessMessagingError } from "./business-messaging/provider-error";
import { CampaignDispatchService } from "./messaging-campaigns/dispatch-service";
import { MessagingCampaignService } from "./messaging-campaigns/service";
import { MessagingCampaignError } from "./messaging-campaigns/validation";
import { registerMessagingCampaignsIpc } from "./ipc/messaging-campaigns-ipc";
import { createMessagingSecretWrite } from "./business-messaging/secret-service";
import { registerBusinessMessagingIpc } from "./ipc/business-messaging-ipc";
import { ShippingProviderService } from "./shipping-provider-service";
import { registerShippingProviderIpcHandlers } from "./ipc/shipping-provider-ipc";
import { createShippingSecretWrite } from "./shipping-secret-service";
import { registerCommerceShipmentIpcHandlers } from "./ipc/commerce-shipment-ipc";
import { OnlineOrderIngressService } from "./online-order-ingress-service";
import { app, BrowserWindow, powerMonitor } from "electron";
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
  LOCAL_COMPANION_SERVICE_TYPE
} from "@yardimci-asistan/sync-core";
import type {
  PushAiSettingsResult,
  PushBusinessContextResult
} from "@yardimci-asistan/sync-core";
import {
  DesktopDatabase,
  type DesktopDashboardData,
  type DesktopSetupSaveResult,
  type SaveInitialSetupInput,
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
import { AndroidActionSyncService } from "./android-action-sync-service";
import {
  configureDesktopSessionRuntime,
  createDesktopMainWindow,
  createTrustedDesktopRendererUrlPredicate
} from "./desktop-runtime";
import {
  prepareRuntimeDataForStartup,
  resolveRuntimeDataRoot
} from "./desktop-startup-data";
import {
  registerDesktopIpcHandlers,
  type DesktopIpcRegistryHandle
} from "./desktop-ipc-registry";

configureNetworkFamilyAttemptTimeout();

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const isTrustedDesktopRendererUrl = createTrustedDesktopRendererUrlPredicate(
  isDev,
  process.env.VITE_DEV_SERVER_URL
);
const WHATSAPP_WEB_PARTITION = "persist:yardimci-whatsapp";
let desktopDatabase: DesktopDatabase | null = null;
let syncCoordinator: SyncCoordinator | null = null;
let androidActionSyncService: AndroidActionSyncService | null = null;
let maintenanceSyncSuspended = false;
let appLockService: DesktopAppLockService | null = null;
let desktopIpcRegistryHandle: DesktopIpcRegistryHandle | null = null;
let localCompanionServer: LocalCompanionServer | null = null;
let localCompanionPairingService: LocalCompanionPairingService | null = null;
let localCompanionMdnsAdvertiser: LocalCompanionMdnsAdvertiser | null = null;
const egmKbsInteractiveDriver = new EgmKbsWebviewDriver();
const egmKbsBackgroundDriver = new EgmKbsWebviewDriver();
const egmKbsBackgroundSession = new EgmKbsBackgroundSession(egmKbsBackgroundDriver);
const egmKbsProviderAdapter = new EgmKbsProviderAdapter(egmKbsBackgroundSession);
const jandarmaKbsProviderAdapter = new JandarmaKbsProviderAdapter();
const kbsDeliveryInFlight = new Map<string, Promise<DesktopKbsDeliveryMutationResult>>();
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
    ...(process.env.VITE_DEV_SERVER_URL !== undefined ? { devServerUrl: process.env.VITE_DEV_SERVER_URL } : {}),
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
      isTrustedRendererUrl: isTrustedDesktopRendererUrl,
      canCaptureAudio: () => desktopIpcRegistryHandle?.canCaptureAudio() ?? false
    });

    desktopDatabase = new DesktopDatabase({
      appPath: app.getAppPath(),
      userDataPath: runtimeDataRoot,
      backupPath: resolveProjectBackupPath(runtimeDataRoot)
    });
    desktopDatabase.initialize();
    cleanupOrphanProductImages(desktopDatabase.databasePath);
    androidActionSyncService = new AndroidActionSyncService({
      database: desktopDatabase,
      isSuspended: () => maintenanceSyncSuspended || campaignShutdownStarted,
      markLocalSnapshotDirty: () => {
        markLocalCompanionSnapshotDirty();
      },
      notifyDashboardChanged: (dashboardData) => {
        notifyDesktopDashboardChanged(dashboardData);
      }
    });
    appLockService = new DesktopAppLockService({
      database: desktopDatabase,
      getSyncStatus: () => syncCoordinator?.getStatus(),
      onUnlocked: () => {
        reconcileEgmKbsBackgroundSession();
        void reconcileOptionalBackgroundServices();
      },
      onLocked: () => {
        desktopIpcRegistryHandle?.invalidateDictation();
        egmKbsBackgroundSession.destroy();
        void reconcileOptionalBackgroundServices();
      }
    });
    reconcileEgmKbsBackgroundSession();
    syncCoordinator = new SyncCoordinator({
      androidActions: androidActionSyncService,
      onlineOrderIngress: new OnlineOrderIngressService(desktopDatabase),
      pullBusinessMessagingStatuses: (config) => businessMessagingStatusSyncService.pull(config),
      database: desktopDatabase,
      marketingWebsite: marketingWebsiteService,
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
      onCommerceOrdersChanged: notifyCommerceOrdersChanged,
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
          getDatabase().queueSyncJob("android_snapshot");
          getSyncCoordinator().scheduleSoon();
        }
        return result;
      },
      applyAction: (action) => {
        const result = getDatabase().applyAndroidAction(action);
        getDatabase().recordAndroidActionResult(action, result);
        notifyDesktopDashboardChanged(getDatabase().getDashboardData());
        getDatabase().queueSyncJob("android_snapshot");
        getSyncCoordinator().scheduleSoon();
        return result;
      }
    });

    registerIpcHandlers();
    createMainWindow();
    syncCoordinator.start();
    void reconcileOptionalBackgroundServices();
    powerMonitor.on("resume", () => marketingSchedulerService.wake());
    if (!desktopDatabase.getSetupData().setupRequired) {
      void publishBusinessAiContextFromMain();
      if (getGoogleReviewsSettings(desktopDatabase.databasePath).publicationPending) {
        void publishGoogleReviewsSettingsFromMain();
      }
    }
    void reconcileLocalCompanionRuntime();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
let campaignShutdownDrained = false;
let campaignShutdownStarted = false;
app.on("before-quit", (event) => {
  syncCoordinator?.stop();
  localCompanionMdnsAdvertiser?.stop();
  void localCompanionServer?.stop();
  if (campaignShutdownDrained || !desktopDatabase) return;
  event.preventDefault();
  if (campaignShutdownStarted) return;
  campaignShutdownStarted = true;
  void marketingSchedulerService.suspendAndDrain().then(() => Promise.allSettled([campaignDispatchService.suspendAndDrain(), businessMessagingService.drain(), instagramPublicationService.drain(), syncCoordinator?.suspendAndDrain()])).then(() => {
    campaignShutdownDrained = true;
    desktopDatabase?.close();
    app.quit();
  });
});

const businessMessagingStatusSyncService = new BusinessMessagingStatusSyncService(getDatabase, notifyBusinessMessagingChanged);
const businessMessagingService = new BusinessMessagingService(getDatabase, { assertCanSubmit: () => {
  assertAppSessionUnlocked();
  if (maintenanceSyncSuspended || campaignShutdownStarted) throw new BusinessMessagingError("session_unavailable", "Bakım veya kapanış sırasında mesaj gönderilemez.");
} });
const smsMessagingService = new SmsMessagingService(getDatabase);
const marketingAnalyticsService = new MarketingAnalyticsService(getDatabase, { allowed: () => !maintenanceSyncSuspended && !campaignShutdownStarted && Boolean(appLockService && !appLockService.isLocked()) });
const marketingMediaService = new MarketingMediaService(getDatabase, () => getDatabase().userDataPath);
const instagramOAuthService = new InstagramOAuthService(getDatabase, fetch, assertAppSessionUnlocked);
const instagramPublicationService = new InstagramPublicationService(getDatabase, marketingMediaService, { allowed: () => !maintenanceSyncSuspended && !campaignShutdownStarted && Boolean(appLockService && !appLockService.isLocked()), refreshInstagram: () => instagramOAuthService.refreshIfNeeded() });
const marketingWebsiteService = new MarketingWebsitePublicationService(getDatabase, marketingMediaService);
function publishPendingMarketingWebsiteIntent() {
  // Explicit user publication actions work even when passive automatic sync is disabled.
  const coordinator = getSyncCoordinator();
  void coordinator.runNow().then(() => {
    // An action can arrive after the active cycle captured its outbox. Drain the new intent once.
    if (getDatabase().getPendingSyncJobs().some(job => job.jobType === "marketing_website_publish" && job.attemptCount === 0)) {
      void coordinator.runNow();
    }
  });
}
const marketingStudioService = new MarketingStudioService(getDatabase, marketingMediaService, publishPendingMarketingWebsiteIntent, instagramPublicationService);
const messagingCampaignService = new MessagingCampaignService(getDatabase, {
  assertAvailable: (channel, providerId) => {
    if (channel === "sms" && providerId === "iletimerkezi") { if (!smsMessagingService.getConfiguration().configured) throw new MessagingCampaignError("unconfigured", "SMS servis ayarlarını tamamlayın."); return; }
    if (channel !== "whatsapp" || providerId !== "whatsapp_cloud") throw new MessagingCampaignError("unavailable_provider", "Bu kanal için kullanılabilir sağlayıcı yok.");
    if (!businessMessagingService.getConfiguration().configured) throw new MessagingCampaignError("unconfigured", "WhatsApp Business servis ayarlarını tamamlayın.");
  },
  listTemplates: () => businessMessagingService.listTemplates()
}, () => { notifyMessagingCampaignsChanged(); campaignDispatchService.wake(); });
const campaignDispatchService = new CampaignDispatchService(getDatabase, {
  dispatchCampaignItem: (id, token, interval, allowed, now) => {
    const claim = getDatabase().getCampaignDispatchClaim(id, token);
    return (claim?.item.channel === "sms" ? smsMessagingService : businessMessagingService).dispatchCampaignItem(id, token, interval, allowed, now);
  }
}, {
  allowed: () => !maintenanceSyncSuspended && !campaignShutdownStarted && Boolean(appLockService && !appLockService.isLocked())
    && hasBusinessCapability(enabledBusinessCapabilities(), C.MESSAGING_CAMPAIGNS),
  onChanged: () => { notifyMessagingCampaignsChanged(); notifyBusinessMessagingChanged(); }
});
const marketingScheduledTargets = new MarketingScheduledTargetService(getDatabase, messagingCampaignService, marketingStudioService, instagramPublicationService);
const marketingSchedulerService = new MarketingSchedulerService(getDatabase, marketingScheduledTargets, {
  allowed: () => !maintenanceSyncSuspended && !campaignShutdownStarted && Boolean(appLockService && !appLockService.isLocked())
    && hasBusinessCapability(enabledBusinessCapabilities(), C.MARKETING_STUDIO),
  onChanged: notifyMarketingSchedulesChanged
});
// Startup, lock transitions and committed capability changes share one lifecycle.
// Suspend/drain preserves durable scheduled claims; disabled services have no timer.
let optionalBackgroundReconcile: Promise<void> = Promise.resolve();
export function reconcileOptionalBackgroundServices(): Promise<void> {
  const operation = optionalBackgroundReconcile.then(async () => {
    if (!desktopDatabase || campaignShutdownStarted) return;
    const enabled = new Set(enabledBusinessCapabilities());
    const allowed = !maintenanceSyncSuspended && Boolean(appLockService && !appLockService.isLocked());
    if (allowed && enabled.has(C.MARKETING_STUDIO)) marketingSchedulerService.start();
    else await marketingSchedulerService.suspendAndDrain();
    if (allowed && enabled.has(C.MESSAGING_CAMPAIGNS)) campaignDispatchService.start();
    else await campaignDispatchService.suspendAndDrain();
  });
  optionalBackgroundReconcile = operation.catch(error => {
    desktopLog.error({scope:"runtime",event:"optional-background.reconcile.failed",message:"Opsiyonel arka plan servisleri güncellenemedi.",error});
  });
  return optionalBackgroundReconcile;
}
const marketingScheduleService = new MarketingScheduleService(getDatabase, () => { notifyMarketingSchedulesChanged(); marketingSchedulerService.wake(); });
const marketingShareService = new MarketingShareService(getDatabase, marketingStudioService, messagingCampaignService, marketingScheduleService, () => businessMessagingService.listTemplates());
function notifyMarketingSchedulesChanged() {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send("marketingSchedules:changed");
  }
}
function notifyMessagingCampaignsChanged() {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send("messagingCampaigns:changed");
  }
}
function notifyBusinessMessagingChanged() {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send("businessMessaging:changed");
  }
}
const shippingProviderService = new ShippingProviderService(getDatabase);

function registerIpcHandlers() {
  registerMarketingProviderIpc({ sms: smsMessagingService, instagram: instagramPublicationService, instagramOAuth: instagramOAuthService, assertUnlocked: assertAppSessionUnlocked });
  registerMarketingAnalyticsIpc({ service: marketingAnalyticsService, assertUnlocked: assertAppSessionUnlocked });
  registerMarketingScheduleIpc({ service: marketingScheduleService, assertUnlocked: assertAppSessionUnlocked });
  registerMarketingIpc({ service: marketingStudioService, shares: marketingShareService, assertUnlocked: assertAppSessionUnlocked });
  registerMessagingCampaignsIpc({ service: messagingCampaignService, assertUnlocked: assertAppSessionUnlocked });
  registerBusinessMessagingIpc({ service: businessMessagingService, assertUnlocked: assertAppSessionUnlocked, onChanged: notifyBusinessMessagingChanged });
  const notifyShipmentsChanged = (orderId: string) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send("commerce:shipmentsChanged", orderId);
    }
  };
  registerShippingProviderIpcHandlers({ service: shippingProviderService, assertUnlocked: assertAppSessionUnlocked, onChanged: notifyShipmentsChanged });
  registerCommerceShipmentIpcHandlers({
    getDatabase,
    assertUnlocked: assertAppSessionUnlocked,
    onChanged: notifyShipmentsChanged
  });
  desktopIpcRegistryHandle = registerDesktopIpcHandlers({
    getDatabase,
    getSyncCoordinator,
    getAppLockService,
    assertUnlocked: assertAppSessionUnlocked,
    assertCapability: assertDesktopCapability,
    enabledBusinessCapabilities,
    afterSuccessfulPull: async () => {
      // Request import uses the same durable database invalidation as automatic
      // pull. Keep ingress separate; publication only runs the coordinator outbox.
      markLocalCompanionSnapshotDirty();
      notifyDesktopDashboardChanged(getDatabase().getDashboardData());
      await processAndroidActionQueue(true);
      return getSyncCoordinator().publishAndroidSnapshotNow();
    },
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
    assertTaskScope: assertDesktopTaskScope
  });
}

async function saveInitialSetupFromRenderer(input: SaveInitialSetupInput): Promise<DesktopSetupSaveResult> {
  assertAppSessionUnlocked();
  const activationError = validateSetupServiceActivation(getDatabase(), input);
  if (activationError) return { ok: false, message: activationError };
  const secretUpdate = createAiApiKeyUpdate(input);
  if (!secretUpdate.ok) {
    return secretUpdate;
  }
  const profileSecretUpdates = createAiProfileApiKeyUpdates(input);
  if (!profileSecretUpdates.ok) {
    return profileSecretUpdates;
  }

  let marketingSecretWrites;
  try { marketingSecretWrites = createMarketingProviderSecretWrites(input.sms); }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Servis anahtarı kaydedilemedi." }; }
  let messagingSecretWrite;
  try { messagingSecretWrite = createMessagingSecretWrite(input.whatsappCloud); }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : "WhatsApp Business anahtarı kaydedilemedi." }; }
  let shippingSecretWrite;
  try { shippingSecretWrite = createShippingSecretWrite(input.arasShipping); }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Kargo şifresi kaydedilemedi." }; }
  const localResult = getDatabase().saveInitialSetup({
    ...input,
    aiApiKey: String(input.aiApiKey ?? "").trim() ? "__encrypted_in_main_process__" : "",
    ...(input.arasShipping ? { arasShipping: { ...input.arasShipping, password: "" } } : {}),
    ...(input.sms ? { sms: { ...input.sms, apiKey: "", apiHash: "" } } : {}),
    ...(input.whatsappCloud ? { whatsappCloud: { ...input.whatsappCloud, accessToken: "" } } : {}),
    aiProfiles: profileSecretUpdates.profiles
  }, secretUpdate.update, profileSecretUpdates.updates, shippingSecretWrite, messagingSecretWrite, marketingSecretWrites);
  if (!localResult.ok) {
    return localResult;
  }

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send("commerce:shippingConfigurationChanged");
  }
  notifyBusinessMessagingChanged();
  markLocalCompanionSnapshotDirty();
  void reconcileLocalCompanionRuntime();
  void reconcileOptionalBackgroundServices();
  scheduleAutomaticSyncSoon(true);

  const [aiWebSync, businessContextWebSync] = await Promise.all([
    publishSavedAiSettingsFromMain(),
    publishBusinessAiContextFromMain()
  ]);
  getSyncCoordinator().restart();
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

export function scheduleAutomaticSyncSoon(capabilitiesChanged = false) {
  if (!maintenanceSyncSuspended) {
    if (capabilitiesChanged && getDatabase().getPendingSyncJobs().some(job => job.jobType === "marketing_website_publish" && job.attemptCount === 0)) {
      // Capability withdrawal/reactivation is an explicit visibility mutation,
      // even when the operator disabled passive automatic sync.
      publishPendingMarketingWebsiteIntent();
    }
    syncCoordinator?.scheduleSoon();
  }
}

export async function suspendAutomaticSyncForMaintenance() {
  maintenanceSyncSuspended = true;
  desktopIpcRegistryHandle?.clearMarketBarcodeFastPull();
  await marketingSchedulerService.suspendAndDrain();
  await campaignDispatchService.suspendAndDrain();
  await businessMessagingService.drain();
  await instagramPublicationService.drain();
  await syncCoordinator?.suspendAndDrain();
}

export function resumeAutomaticSyncAfterMaintenanceAbort() {
  maintenanceSyncSuspended = false;
  syncCoordinator?.restart();
  void reconcileOptionalBackgroundServices();
}

function finalizeAndroidDeviceMutation(result: DesktopAndroidDeviceMutationResult): DesktopAndroidDeviceMutationResult {
  if (result.ok) {
    markLocalCompanionSnapshotDirty();
    getDatabase().queueSyncJob("android_snapshot");
    notifyDesktopDashboardChanged(getDatabase().getDashboardData());
    getSyncCoordinator().scheduleSoon();
  }
  return result;
}

function finalizeDesktopOperationMutation(result: DesktopStatusUpdateResult): DesktopStatusUpdateResult {
  if (result.ok) {
    markLocalCompanionSnapshotDirty();
    getDatabase().queueSyncJob("android_snapshot");
    notifyDesktopDashboardChanged(result.dashboardData);
    getSyncCoordinator().scheduleSoon();
  }
  return result;
}

function finalizeDesktopRecordDeletion(result: DesktopStatusUpdateResult): DesktopStatusUpdateResult {
  if (result.ok) {
    markLocalCompanionSnapshotDirty();
    getDatabase().queueSyncJob("android_snapshot");
    notifyDesktopDashboardChanged(result.dashboardData);
    getSyncCoordinator().scheduleSoon();
  }
  return result;
}

function finalizeDesktopMenuMutation<T extends DesktopMenuSaveResult | DesktopStatusUpdateResult>(result: T): T {
  if (result.ok) {
    markLocalCompanionSnapshotDirty();
    getDatabase().queueSyncJob("android_snapshot");
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
    getDatabase().queueSyncJob("android_snapshot");
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
      && (notification.status === "pending" || notification.status === "failed")
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
    getDatabase().queueSyncJob("android_snapshot");
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

function getAndroidActionSyncService() {
  if (!androidActionSyncService) {
    throw new Error("Android action sync service is not initialized.");
  }
  return androidActionSyncService;
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

// The local HTTP listener is not opened for businesses without Android/local LAN.
let localCompanionReconcile: Promise<void> = Promise.resolve();
export function reconcileLocalCompanionRuntime(): Promise<void> {
  const operation = localCompanionReconcile.then(async () => {
    if (!localCompanionServer || campaignShutdownStarted) return;
    if (!localCompanionEnabled()) {
      localCompanionMdnsAdvertiser?.stop();
      localCompanionMdnsAdvertiser = null;
      await localCompanionServer.stop();
      return;
    }
    await localCompanionServer.start();
    reconcileLocalCompanionAdvertisement();
  });
  localCompanionReconcile = operation.catch(error => {
    desktopLog.error({scope:"local-companion",event:"local-companion.reconcile.failed",message:"Yerel Companion servis durumu güncellenemedi.",error});
  });
  return localCompanionReconcile;
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

function processAndroidActionQueue(
  allowPlaceholderSecret: boolean
) {
  return getAndroidActionSyncService().processQueue(allowPlaceholderSecret);
}

function notifyCommerceOrdersChanged() {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send("commerce:ordersChanged");
    }
  }
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

function publishCurrentAndroidSnapshot() {
  return getSyncCoordinator().publishAndroidSnapshotNow();
}

async function publishSavedAiSettingsFromMain(): Promise<PushAiSettingsResult> {
  const database = getDatabase();
  return await publishSavedAiSettings(
    database,
    getWebSyncConfig(database.getSetupData())
  ) ?? { ok: false, message: "AI ayar yayın niyeti hazırlanamadı." };
}

async function publishGoogleReviewsSettingsFromMain() {
  const database = getDatabase();
  return publishGoogleReviewsSettings(
    database,
    getWebSyncConfig(database.getSetupData()),
    database.getSyncRuntimeStatus().clientId
  );
}

async function publishBusinessAiContextFromMain(): Promise<PushBusinessContextResult> {
  const database = getDatabase();
  return await publishBusinessAiContext(
    database,
    getWebSyncConfig(database.getSetupData())
  ) ?? { ok: false, message: "İşletme bağlam yayın niyeti hazırlanamadı." };
}
import { validateSetupServiceActivation } from "./setup-service-activation";
