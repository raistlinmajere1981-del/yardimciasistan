import { PageViewStateProvider } from "../../app/page-view-state";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { DesktopPage, CustomerWorkTab } from "../../app/navigation";
import type { RegisterPageLeaveGuard, RequestPageChange } from "../../app/page-navigation-guard";
import type { SyncState } from "../../app/runtime-state";
import { useMarketController } from "../../app/use-market-controller";
import { useFinanceController } from "../../app/use-finance-controller";
import type {
  AppLockController,
  CustomerController,
  DesktopSyncController,
  DeviceController,
  MenuController,
  MessagingController,
  OperationController,
  SetupController
} from "../../app/controller-types";
import type { DesktopDashboardData } from "../../../electron/database";
import {
  applyUiPreferences,
  readUiPreferences,
  saveUiPreferences,
  type UiPreferences
} from "../../ui-preferences";
import { AppLockScreen } from "../security/AppLockScreen";
import { DesktopAppFrame } from "./DesktopAppFrame";
import { DesktopWorkspaceRouter } from "./DesktopWorkspaceRouter";

interface DesktopAppViewProps {
  activePage: DesktopPage;
  pageTransitionPending: boolean;
  requestPageChange: RequestPageChange;
  customerWorkTab: CustomerWorkTab;
  setCustomerWorkTab: Dispatch<SetStateAction<CustomerWorkTab>>;
  registerPageLeaveGuard: RegisterPageLeaveGuard;
  surfaceData: DesktopDashboardData;
  syncState: SyncState;
  setSyncState: Dispatch<SetStateAction<SyncState>>;
  statusMessage: string;
  setStatusMessage: Dispatch<SetStateAction<string>>;
  setupController: SetupController;
  appLockController: AppLockController;
  desktopSyncController: DesktopSyncController;
  menuController: MenuController;
  messagingController: MessagingController;
  customerController: CustomerController;
  operationController: OperationController;
  deviceController: DeviceController;
}

export function DesktopAppView({
  activePage,
  pageTransitionPending,
  requestPageChange,
  customerWorkTab,
  setCustomerWorkTab,
  registerPageLeaveGuard,
  surfaceData,
  syncState,
  setSyncState,
  statusMessage,
  setStatusMessage,
  setupController,
  appLockController,
  desktopSyncController,
  menuController,
  messagingController,
  customerController,
  operationController,
  deviceController
}: DesktopAppViewProps) {
  const [uiPreferences, setUiPreferences] = useState<UiPreferences>(readUiPreferences);
  const {
    phase: appAccessPhase,
    status: appLockStatus,
    unlockApp,
    resetAppPassword
  } = appLockController;
  const marketController = useMarketController({
    businessCapabilities: desktopSyncController.businessCapabilities,
    active: appAccessPhase === "unlocked" && (activePage === "market" || activePage === "menu"),
    enabled: appAccessPhase === "unlocked",
    productDataEnabled: setupController.setupData.productData.enabled
  });
  const financeController = useFinanceController({
    businessCapabilities: desktopSyncController.businessCapabilities,
    active: appAccessPhase === "unlocked" && activePage === "reports",
    enabled: appAccessPhase === "unlocked"
  });

  useEffect(() => {
    applyUiPreferences(uiPreferences);
    saveUiPreferences(uiPreferences);
  }, [uiPreferences]);

  if (appAccessPhase !== "unlocked") {
    return (
      <AppLockScreen
        phase={appAccessPhase}
        passwordConfigured={appLockStatus.passwordConfigured}
        notificationCount={appLockStatus.notificationCount}
        onUnlock={unlockApp}
        onResetPassword={resetAppPassword}
      />
    );
  }

  return (
    <PageViewStateProvider key={`${desktopSyncController.businessCapabilities?.businessId ?? ""}:${surfaceData.databasePath}`}><DesktopAppFrame
      uiPreferences={uiPreferences}
      onUiPreferencesChange={setUiPreferences}
      activePage={activePage}
      pageTransitionPending={pageTransitionPending}
      requestPageChange={requestPageChange}
      setCustomerWorkTab={setCustomerWorkTab}
      surfaceData={surfaceData}
      syncState={syncState}
      statusMessage={statusMessage}
      setupController={setupController}
      appLockController={appLockController}
      desktopSyncController={desktopSyncController}
      menuController={menuController}
      messagingController={messagingController}
      customerController={customerController}
      operationController={operationController}
      marketController={marketController}
    >
      <DesktopWorkspaceRouter
        activePage={activePage}
        requestPageChange={requestPageChange}
        customerWorkTab={customerWorkTab}
        setCustomerWorkTab={setCustomerWorkTab}
        surfaceData={surfaceData}
        registerPageLeaveGuard={registerPageLeaveGuard}
        syncState={syncState}
        setSyncState={setSyncState}
        setStatusMessage={setStatusMessage}
        setupController={setupController}
        appLockController={appLockController}
        desktopSyncController={desktopSyncController}
        menuController={menuController}
        messagingController={messagingController}
        customerController={customerController}
        marketController={marketController}
        financeController={financeController}
        operationController={operationController}
        deviceController={deviceController}
        onDashboardRefresh={desktopSyncController.loadDashboardData}
      />
    </DesktopAppFrame></PageViewStateProvider>
  );
}
