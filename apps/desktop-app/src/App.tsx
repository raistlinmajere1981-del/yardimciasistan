import { useState } from "react";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import { runtimeHasCapability } from "./app/capabilities";
import { buildDesktopNotifications } from "./app/notifications";
import type { DesktopPage } from "./app/navigation";
import type { SyncState } from "./app/runtime-state";
import { useAppLock } from "./app/use-app-lock";
import { useCustomerController } from "./app/use-customer-controller";
import { useDesktopSync } from "./app/use-desktop-sync";
import { useDeviceController } from "./app/use-device-controller";
import { useMenuController } from "./app/use-menu-controller";
import { useMessagingController } from "./app/use-messaging-controller";
import { useOperationController } from "./app/use-operation-controller";
import { useSetupController } from "./app/use-setup-controller";
import { DesktopAppView } from "./components/app/DesktopAppView";

function App() {
  const [activePage, setActivePage] = useState<DesktopPage>("dashboard");
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [statusMessage, setStatusMessage] = useState("Webden yeni talep yok.");

  const setupController = useSetupController({
    onInitialSetupReady: () => setActivePage("dashboard")
  });
  const appLockController = useAppLock({
    passwordConfigured: setupController.setupData.appPasswordConfigured,
    getNotificationCount: () => buildDesktopNotifications(
      desktopSyncController.dashboardData,
      desktopSyncController.automaticSyncStatus
    ).length,
    onPasswordConfiguredChange: setupController.setPasswordConfigured
  });
  const desktopSyncController = useDesktopSync({
    accessPhase: appLockController.phase,
    setSyncState,
    setStatusMessage,
    onBootstrapSetup: setupController.applyBootstrapSetup
  });
  const menuController = useMenuController({
    dashboardData: desktopSyncController.dashboardData,
    setDashboardData: desktopSyncController.setDashboardData,
    loadDashboardData: desktopSyncController.loadDashboardData
  });
  const messagingController = useMessagingController({
    dashboardData: desktopSyncController.dashboardData,
    setDashboardData: desktopSyncController.setDashboardData,
    setSyncState,
    setStatusMessage,
    messagesActive: activePage === "messages",
    aiEnabled: runtimeHasCapability(desktopSyncController.businessCapabilities, BUSINESS_CAPABILITIES.AI),
    whatsappEnabled: runtimeHasCapability(desktopSyncController.businessCapabilities, BUSINESS_CAPABILITIES.WHATSAPP),
    onOpenMessages: () => setActivePage("messages")
  });
  const customerController = useCustomerController({
    dashboardData: desktopSyncController.dashboardData,
    setDashboardData: desktopSyncController.setDashboardData,
    setSyncState,
    setStatusMessage,
    selectedWhatsAppRequestId: messagingController.selectedWhatsAppRequestId,
    setSelectedWhatsAppRequestId: messagingController.setSelectedWhatsAppRequestId
  });
  const operationController = useOperationController({
    setDashboardData: desktopSyncController.setDashboardData,
    setSyncState,
    setStatusMessage
  });
  const deviceController = useDeviceController({
    setDashboardData: desktopSyncController.setDashboardData
  });

  return (
    <DesktopAppView
      activePage={activePage}
      setActivePage={setActivePage}
      syncState={syncState}
      setSyncState={setSyncState}
      statusMessage={statusMessage}
      setStatusMessage={setStatusMessage}
      setupController={setupController}
      appLockController={appLockController}
      desktopSyncController={desktopSyncController}
      menuController={menuController}
      messagingController={messagingController}
      customerController={customerController}
      operationController={operationController}
      deviceController={deviceController}
    />
  );
}

export default App;
