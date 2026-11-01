import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import { BusinessCapabilityRuntimeProvider } from "./app/business-capability-context";
import { isWebAvailable, WebAvailabilityProvider } from "./app/web-availability";
import { NetworkSignalProvider } from "./app/network-signal";
import { runtimeHasCapability } from "./app/capabilities";
import { createDesktopDashboardProjector } from "./app/capability-projection";
import { buildDesktopNotifications } from "./app/notifications";
import type { DesktopPage, CustomerWorkTab } from "./app/navigation";
import type { PageLeaveGuard } from "./app/page-navigation-guard";
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
import { writeRendererDiagnostic } from "./app/diagnostics-client";

function App() {
  const [activePage, setActivePage] = useState<DesktopPage>("dashboard");
  const [, startPageTransition] = useTransition();
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [customerWorkTab, setCustomerWorkTab] = useState<CustomerWorkTab>("customers");
  const pageLeaveGuardRef = useRef<PageLeaveGuard | null>(null);
  const lastNavigationDiagnosticRef = useRef("");

  const registerPageLeaveGuard = useCallback((guard: PageLeaveGuard) => {
    pageLeaveGuardRef.current = guard;
    return () => {
      if (pageLeaveGuardRef.current === guard) {
        pageLeaveGuardRef.current = null;
      }
    };
  }, []);

  const requestPageChange = useCallback((destination: DesktopPage) => {
    if (destination === activePage) return;
    const guard = pageLeaveGuardRef.current;
    if (guard && !guard(destination, () => startPageTransition(() => setActivePage(destination)))) {
      return;
    }
    startPageTransition(() => setActivePage(destination));
  }, [activePage]);

  useEffect(() => subscribeAppStatus(({ state, message }) => {
    setSyncState(state);
    setStatusMessage(message);
  }), []);

  useEffect(() => {
    if (syncState !== "success" || !statusMessage) return;
    const timer = window.setTimeout(() => {
      setSyncState("idle");
      setStatusMessage("");
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [statusMessage, syncState]);

  useEffect(() => {
    const key = `${activePage}:${activePage === "customerWork" ? customerWorkTab : ""}`;
    if (lastNavigationDiagnosticRef.current === key) return;
    lastNavigationDiagnosticRef.current = key;
    writeRendererDiagnostic({
      level: "INFO",
      scope: "navigation",
      event: "navigation.page.changed",
      message: "Kullanıcı uygulama görünümünü değiştirdi.",
      meta: {
        page: activePage,
        ...(activePage === "customerWork" ? { customerWorkTab } : {})
      }
    });
  }, [activePage, customerWorkTab]);

  const setupController = useSetupController({
    onInitialSetupRequired: () => setActivePage("settings"),
    onInitialSetupReady: () => setActivePage("dashboard")
  });
  const appLockController = useAppLock({
    passwordConfigured: setupController.setupData.appPasswordConfigured,
    getNotificationCount: () => buildDesktopNotifications(
      desktopSyncController.dashboardData,
      desktopSyncController.automaticSyncStatus,
      desktopSyncController.businessCapabilities?.enabledCapabilities ?? [],
      undefined,
      isWebAvailable(setupController.setupData)
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
    setDashboardData: desktopSyncController.setDashboardData
  });
  const [projectDashboard] = useState(createDesktopDashboardProjector);
  const surfaceData = useMemo(
    () => projectDashboard(
      desktopSyncController.dashboardData,
      desktopSyncController.businessCapabilities?.enabledCapabilities ?? []
    ),
    [desktopSyncController.dashboardData, desktopSyncController.businessCapabilities, projectDashboard]
  );
  const messagingController = useMessagingController({
    surfaceData,
    setDashboardData: desktopSyncController.setDashboardData,
    setSyncState,
    setStatusMessage,
    aiEnabled: runtimeHasCapability(desktopSyncController.businessCapabilities, BUSINESS_CAPABILITIES.AI),
    customersEnabled: runtimeHasCapability(desktopSyncController.businessCapabilities, BUSINESS_CAPABILITIES.CUSTOMERS),
    whatsappEnabled: runtimeHasCapability(desktopSyncController.businessCapabilities, BUSINESS_CAPABILITIES.WHATSAPP),
    customerCreditEnabled: runtimeHasCapability(desktopSyncController.businessCapabilities, BUSINESS_CAPABILITIES.CUSTOMER_CREDIT),
    onOpenPreparedMessages: () => {
      setCustomerWorkTab("prepared");
      requestPageChange("customerWork");
    }
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
    setDashboardData: desktopSyncController.setDashboardData,
    androidEnabled: runtimeHasCapability(
      desktopSyncController.businessCapabilities,
      BUSINESS_CAPABILITIES.ANDROID
    )
  });

  return (
    <WebAvailabilityProvider available={isWebAvailable(setupController.setupData)}>
    <NetworkSignalProvider>
    <BusinessCapabilityRuntimeProvider
      value={{
        snapshot: desktopSyncController.businessCapabilities
      }}
    >
      {customerController.confirmDialog}
      {deviceController.confirmDialog}
      {menuController.confirmDialog}
      {messagingController.confirmDialog}
      <DesktopAppView
        activePage={activePage}
        requestPageChange={requestPageChange}
        customerWorkTab={customerWorkTab}
        setCustomerWorkTab={setCustomerWorkTab}
        registerPageLeaveGuard={registerPageLeaveGuard}
        surfaceData={surfaceData}
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
    </NetworkSignalProvider>
    </WebAvailabilityProvider>
  );
}

export default App;
