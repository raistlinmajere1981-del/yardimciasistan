import { registerDealerAccessIpcHandlers } from "./ipc/dealer-access-ipc";
import { registerCommerceProductPublicationIpcHandlers } from "./ipc/commerce-product-publication-ipc";
import { app, ipcMain, type WebContents } from "electron";
import {
  BUSINESS_CAPABILITIES,
  hasBusinessCapability,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "./database";
import type { SyncCoordinator } from "./sync-coordinator";
import type { DesktopAppLockService } from "./app-lock-service";
import { AndroidInstallationService } from "./android-installation-service";
import type { EgmKbsWebviewDriver } from "./egm-kbs-webview-driver";
import type { EgmKbsBackgroundSession } from "./egm-kbs-background-session";
import { getKbsSettings } from "./kbs-settings";
import { getWebSyncConfig } from "./sync-config";
import { registerAppLockIpcHandlers } from "./ipc/app-lock-ipc";
import { registerAppIpcHandlers } from "./ipc/app-ipc";
import { registerSyncIpcHandlers } from "./ipc/sync-ipc";
import { registerReportIpcHandlers } from "./ipc/report-ipc";
import { registerBusinessPublicProfileIpcHandlers } from "./business-public-profile-ipc";
import { registerGoogleReviewsSettingsIpcHandlers } from "./google-reviews-settings-ipc";
import { registerKbsSettingsIpcHandlers } from "./kbs-settings-ipc";
import { registerKbsWebviewIpcEvents } from "./kbs-webview-ipc";
import { registerMenuIpcHandlers } from "./ipc/menu-ipc";
import { registerImageAnalysisIpcHandlers } from "./ipc/image-analysis-ipc";
import { registerDesktopDictationIpcHandlers } from "./ipc/desktop-dictation-ipc";
import { createDesktopDictationService } from "./desktop-dictation-service";
import { registerSetupIpcHandlers } from "./ipc/setup-ipc";
import { registerAiSecretIpcHandlers } from "./ipc/ai-secret-ipc";
import { registerAndroidDeviceIpcHandlers } from "./ipc/android-device-ipc";
import { registerAiConnectionIpcHandlers } from "./ipc/ai-connection-ipc";
import { registerWebConnectionIpcHandlers } from "./web-connection-ipc";
import { registerRequestIpcHandlers } from "./ipc/request-ipc";
import { registerWhatsAppIpcHandlers } from "./ipc/whatsapp-ipc";
import { registerRoomTableIpcHandlers } from "./ipc/room-table-ipc";
import { registerRoomMediaIpcHandlers } from "./room-media-ipc";
import { registerTableMediaIpcHandlers } from "./table-media-ipc";
import { registerTableOrderIpcHandlers } from "./ipc/table-order-ipc";
import { registerReservationIpcHandlers } from "./ipc/reservation-ipc";
import { registerDailyTaskIpcHandlers } from "./ipc/daily-task-ipc";
import { registerBusinessAiIpcHandlers } from "./ipc/business-ai-ipc";
import { registerCustomerIpcHandlers } from "./ipc/customer-ipc";

type MenuIpcOptions = Parameters<typeof registerMenuIpcHandlers>[0];
type ImageAnalysisIpcOptions = Parameters<typeof registerImageAnalysisIpcHandlers>[0];
type SetupIpcOptions = Parameters<typeof registerSetupIpcHandlers>[0];
type AndroidDeviceIpcOptions = Parameters<typeof registerAndroidDeviceIpcHandlers>[0];
type RequestIpcOptions = Parameters<typeof registerRequestIpcHandlers>[0];
type CustomerIpcOptions = Parameters<typeof registerCustomerIpcHandlers>[0];
type ReservationIpcOptions = Parameters<typeof registerReservationIpcHandlers>[0];
type DailyTaskIpcOptions = Parameters<typeof registerDailyTaskIpcHandlers>[0];
type KbsSettingsIpcOptions = Parameters<typeof registerKbsSettingsIpcHandlers>[0];
type SyncIpcOptions = Parameters<typeof registerSyncIpcHandlers>[0];

export type DesktopIpcRegistryDependencies = {
  getDatabase: () => DesktopDatabase;
  getSyncCoordinator: () => SyncCoordinator;
  getAppLockService: () => DesktopAppLockService;
  assertUnlocked: () => void;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
  enabledBusinessCapabilities: () => BusinessCapability[];
  afterSuccessfulPull: SyncIpcOptions["afterSuccessfulPull"];
  publishAndroidSnapshot: SyncIpcOptions["publishAndroidSnapshot"];
  publishAiSettings: SyncIpcOptions["publishAiSettings"];
  publishBusinessAiContext: () => void;
  deliverKbsNotification: KbsSettingsIpcOptions["deliverNotification"];
  onKbsSettingsSaved: () => void;
  onKbsNotificationsChanged: () => void;
  isTrustedRendererUrl: (url: string) => boolean;
  kbsInteractiveDriver: EgmKbsWebviewDriver;
  kbsBackgroundSession: EgmKbsBackgroundSession;
  finalizeMenuMutation: MenuIpcOptions["finalizeMutation"];
  finalizeStockImageApply:
    ImageAnalysisIpcOptions["finalizeStockImageApply"];
  saveInitial: SetupIpcOptions["saveInitial"];
  finalizeDeviceMutation:
    AndroidDeviceIpcOptions["finalizeDeviceMutation"];
  assertRequestType: RequestIpcOptions["assertRequestType"];
  finalizeRecordDeletion:
    RequestIpcOptions["finalizeRecordDeletion"];
  finalizeCustomerMutation:
    CustomerIpcOptions["finalizeCustomerMutation"];
  finalizeCheckInMutation:
    CustomerIpcOptions["finalizeCheckInMutation"];
  finalizeCheckoutMutation:
    CustomerIpcOptions["finalizeCheckoutMutation"];
  finalizeRoomChangeMutation:
    CustomerIpcOptions["finalizeRoomChangeMutation"];
  assertReservationType:
    ReservationIpcOptions["assertReservationType"];
  finalizeOperationMutation:
    ReservationIpcOptions["finalizeOperationMutation"];
  assertTaskScope: DailyTaskIpcOptions["assertTaskScope"];
};

export type DesktopIpcRegistryHandle = {
  clearMarketBarcodeFastPull: () => void;
  invalidateDictation: () => void;
  canCaptureAudio: () => boolean;
};

export function registerDesktopIpcHandlers(
  dependencies: DesktopIpcRegistryDependencies
): DesktopIpcRegistryHandle {
  const {
    getDatabase,
    getSyncCoordinator,
    getAppLockService,
    assertUnlocked,
    assertCapability,
    enabledBusinessCapabilities,
    afterSuccessfulPull,
    publishAndroidSnapshot,
    publishAiSettings,
    publishBusinessAiContext,
    deliverKbsNotification,
    onKbsSettingsSaved,
    onKbsNotificationsChanged,
    isTrustedRendererUrl,
    kbsInteractiveDriver,
    kbsBackgroundSession,
    finalizeMenuMutation,
    finalizeStockImageApply,
    saveInitial,
    finalizeDeviceMutation,
    assertRequestType,
    finalizeRecordDeletion,
    finalizeCustomerMutation,
    finalizeCheckInMutation,
    finalizeCheckoutMutation,
    finalizeRoomChangeMutation,
    assertReservationType,
    finalizeOperationMutation,
    assertTaskScope
  } = dependencies;
  registerWebConnectionIpcHandlers({ getDatabase, assertUnlocked });
  const dictation = createDesktopDictationService({ getDatabase, assertUnlocked, assertCapability });
  registerDesktopDictationIpcHandlers(dictation);

  registerAppLockIpcHandlers(getAppLockService());

  registerAppIpcHandlers({
    assertUnlocked,
    assertCapability,
    getBootstrapData: () => ({
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
    }),
    getDashboardData: () => getDatabase().getDashboardData()
  });

  registerSyncIpcHandlers({
    assertUnlocked,
    getDatabase,
    getCoordinator: getSyncCoordinator,
    assertCapability,
    afterSuccessfulPull,
    publishAndroidSnapshot,
    publishAiSettings
  });

  registerDealerAccessIpcHandlers({ getDatabase, assertUnlocked, onCommit: () => getSyncCoordinator().scheduleSoon() });

  registerCommerceProductPublicationIpcHandlers({
    getDatabase, assertUnlocked, onCommit: () => getSyncCoordinator().scheduleSoon()
  });

  registerReportIpcHandlers({
    getDatabase,
    assertUnlocked,
    assertCapability
  });

  registerBusinessPublicProfileIpcHandlers({
    databasePath: () => getDatabase().databasePath,
    assertUnlocked,
    onMutation: publishBusinessAiContext
  });

  registerGoogleReviewsSettingsIpcHandlers({
    getDatabase,
    assertUnlocked
  });

  registerKbsSettingsIpcHandlers({
    getDatabase,
    assertUnlocked,
    assertCapability,
    deliverNotification: deliverKbsNotification,
    onSettingsSaved: onKbsSettingsSaved,
    onNotificationsChanged: onKbsNotificationsChanged
  });

  registerKbsWebviewIpcEvents({
    getDatabase,
    assertUnlocked,
    assertCapability,
    isTrustedRendererUrl,
    attachWebview: (id) => kbsInteractiveDriver.attach(id),
    detachWebview: (id) => kbsInteractiveDriver.detach(id),
    inspect: async () => {
      const result = await kbsInteractiveDriver.inspect();
      if (result.state === "authenticated") {
        const settings = getKbsSettings(getDatabase().databasePath);
        if (settings.enabled && settings.provider === "egm") {
          await kbsBackgroundSession.refresh();
        }
      }
      return result;
    },
    prepareLogin: (credentials) =>
      kbsInteractiveDriver.prepareLogin(credentials)
  });

  const marketBarcodeFastPull = registerMarketBarcodeFastPullHandler(
    getSyncCoordinator,
    assertUnlocked,
    assertCapability
  );

  registerMenuIpcHandlers({
    assertUnlocked,
    getDatabase,
    assertCapability,
    finalizeMutation: finalizeMenuMutation,
    scheduleSync: () => getSyncCoordinator().scheduleSoon()
  });

  registerImageAnalysisIpcHandlers({
    assertUnlocked,
    getDatabase,
    assertCapability,
    finalizeStockImageApply
  });

  registerSetupIpcHandlers({
    assertUnlocked,
    getSetupData: () => getDatabase().getSetupData(),
    saveInitial: (input) => {
      dictation.invalidate();
      return saveInitial(input);
    }
  });

  registerAiSecretIpcHandlers({
    getDatabase,
    assertUnlocked
  });

  const androidInstallationService = new AndroidInstallationService({
    getConnection: () => getWebSyncConfig(getDatabase().getSetupData()),
    getDesktopId: () => getDatabase().getSyncRuntimeStatus().clientId
  });

  registerAndroidDeviceIpcHandlers({
    assertUnlocked,
    getDatabase,
    assertCapability,
    finalizeDeviceMutation,
    listInstallDevices: () => androidInstallationService.listDevices(),
    installOnDevice: async (serial) => {
      const publication = await publishAndroidSnapshot();
      if (!publication.ok) {
        return {
          ok: false,
          message:
            `Android kurulumu için web bağlantısı hazırlanamadı. ${publication.message}`
        };
      }
      const result = await androidInstallationService.install(serial);
      if (result.ok) getSyncCoordinator().scheduleSoon(2_500);
      return result;
    },
    provisionOnDevice: async (serial) => {
      const publication = await publishAndroidSnapshot();
      if (!publication.ok) {
        return {
          ok: false,
          message:
            `Android bağlantısı için web yayını hazırlanamadı. ${publication.message}`
        };
      }
      const result = await androidInstallationService.provision(serial);
      if (result.ok) getSyncCoordinator().scheduleSoon(2_500);
      return result;
    }
  });

  registerAiConnectionIpcHandlers({ getDatabase, assertUnlocked });

  registerRequestIpcHandlers({
    assertUnlocked,
    getDatabase,
    assertCapability,
    assertRequestType,
    finalizeRecordDeletion
  });

  registerCustomerIpcHandlers({
    getDatabase,
    assertUnlocked,
    assertCapability,
    finalizeRecordDeletion,
    finalizeCustomerMutation,
    finalizeCheckInMutation,
    finalizeCheckoutMutation,
    finalizeRoomChangeMutation
  });


  registerWhatsAppIpcHandlers({
    assertUnlocked,
    getDatabase,
    assertCapability,
    finalizeRecordDeletion
  });

  registerRoomTableIpcHandlers({
    getDatabase,
    assertUnlocked,
    assertCapability
  });

  registerRoomMediaIpcHandlers({
    userDataPath: () => getDatabase().userDataPath,
    assertUnlocked,
    assertCapability,
    onCommit: () => getSyncCoordinator().scheduleSoon()
  });

  registerTableMediaIpcHandlers({
    userDataPath: () => getDatabase().userDataPath,
    assertUnlocked,
    assertCapability,
    onCommit: () => getSyncCoordinator().scheduleSoon()
  });

  registerTableOrderIpcHandlers({
    assertUnlocked,
    getDatabase,
    assertCapability,
    hasCapability: (capability) =>
      hasBusinessCapability(enabledBusinessCapabilities(), capability)
  });

  registerReservationIpcHandlers({
    assertUnlocked,
    getDatabase,
    assertCapability,
    assertReservationType,
    finalizeOperationMutation
  });

  registerDailyTaskIpcHandlers({
    assertUnlocked,
    getDatabase,
    assertTaskScope,
    finalizeOperationMutation
  });

  registerBusinessAiIpcHandlers({
    assertUnlocked,
    getDatabase,
    assertCapability
  });

  return {
    clearMarketBarcodeFastPull: marketBarcodeFastPull.clear,
    invalidateDictation: dictation.invalidate,
    canCaptureAudio: () => dictation.getStatus().available
  };
}

function registerMarketBarcodeFastPullHandler(
  getSyncCoordinator: () => SyncCoordinator,
  assertUnlocked: () => void,
  assertCapability: (
    capability: BusinessCapability,
    message?: string
  ) => void
) {
  const senders = new Map<number, { sender: WebContents; onDestroyed: () => void }>();
  const removeSender = (senderId: number) => {
    const registration = senders.get(senderId);
    if (!registration) return;
    registration.sender.removeListener("destroyed", registration.onDestroyed);
    senders.delete(senderId);
  };

  ipcMain.handle(
    "sync:setMarketBarcodeFastPull",
    (event, enabled: unknown) => {
      assertUnlocked();
      const shouldEnable = enabled === true;
      const senderId = event.sender.id;

      if (shouldEnable) {
        assertCapability(
          BUSINESS_CAPABILITIES.CATALOG,
          "Telefon barkod modu için ürün kataloğu etkin olmalı."
        );
        assertCapability(
          BUSINESS_CAPABILITIES.SALES,
          "Telefon barkod modu için satış yeteneği etkin olmalı."
        );
        assertCapability(
          BUSINESS_CAPABILITIES.RETAIL_BARCODE,
          "Telefon barkod modu için barkod yeteneği etkin olmalı."
        );

        if (!senders.has(senderId)) {
          const onDestroyed = () => {
            if (senders.get(senderId)?.onDestroyed !== onDestroyed) return;
            removeSender(senderId);
            getSyncCoordinator().setMarketBarcodeFastPullEnabled(
              senders.size > 0
            );
          };
          senders.set(senderId, { sender: event.sender, onDestroyed });
          event.sender.once("destroyed", onDestroyed);
        }
      } else {
        removeSender(senderId);
      }

      return getSyncCoordinator().setMarketBarcodeFastPullEnabled(
        senders.size > 0
      );
    }
  );

  return {
    clear: () => {
      for (const senderId of senders.keys()) removeSender(senderId);
      getSyncCoordinator().setMarketBarcodeFastPullEnabled(false);
    }
  };
}
