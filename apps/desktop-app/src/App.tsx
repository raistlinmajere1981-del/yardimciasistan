import { useEffect, useState } from "react";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import { BusinessCapabilityRuntimeProvider } from "./app/business-capability-context";
import { runtimeHasCapability } from "./app/capabilities";
import { buildDesktopNotifications } from "./app/notifications";
import type { DesktopPage } from "./app/navigation";
import { subscribeAppStatus, type SyncState } from "./app/runtime-state";
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

  useEffect(() => subscribeAppStatus(({ state, message }) => {
    setSyncState(state);
    setStatusMessage(message);
  }), []);

  const setupController = useSetupController({
    onInitialSetupRequired: () => setActivePage("settings"),
    onInitialSetupReady: () => setActivePage("dashboard")
  });
  const appLockController = useAppLock({
    passwordConfigured: setupController.setupData.appPasswordConfigured,
    getNotificationCount: () => buildDesktopNotifications(
      desktopSyncController.dashboardData,
      desktopSyncController.automaticSyncStatus,
      desktopSyncController.businessCapabilities?.enabledCapabilities ?? []
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
    customersEnabled: runtimeHasCapability(desktopSyncController.businessCapabilities, BUSINESS_CAPABILITIES.CUSTOMERS),
    whatsappEnabled: runtimeHasCapability(desktopSyncController.businessCapabilities, BUSINESS_CAPABILITIES.WHATSAPP),
    customerCreditEnabled: runtimeHasCapability(desktopSyncController.businessCapabilities, BUSINESS_CAPABILITIES.CUSTOMER_CREDIT),
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
    <BusinessCapabilityRuntimeProvider
      value={{
        snapshot: desktopSyncController.businessCapabilities,
        state: desktopSyncController.businessCapabilityState,
        message: desktopSyncController.businessCapabilityMessage,
        setCapability: desktopSyncController.setRuntimeBusinessCapability,
        clearOverride: desktopSyncController.clearRuntimeBusinessCapabilityOverride
      }}
    >
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
    </BusinessCapabilityRuntimeProvider>
  );
}

export default App;
