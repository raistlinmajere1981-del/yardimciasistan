import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { DesktopPage } from "../../app/navigation";
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
  setActivePage: Dispatch<SetStateAction<DesktopPage>>;
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
  setActivePage,
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
    active: appAccessPhase === "unlocked" && activePage === "market",
    enabled: appAccessPhase === "unlocked"
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
    <DesktopAppFrame
      activePage={activePage}
      setActivePage={setActivePage}
      syncState={syncState}
      statusMessage={statusMessage}
      setupController={setupController}
      appLockController={appLockController}
      desktopSyncController={desktopSyncController}
      menuController={menuController}
      messagingController={messagingController}
      customerController={customerController}
      marketController={marketController}
    >
      <DesktopWorkspaceRouter
        activePage={activePage}
        setActivePage={setActivePage}
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
        uiPreferences={uiPreferences}
        setUiPreferences={setUiPreferences}
        onDashboardRefresh={desktopSyncController.loadDashboardData}
      />
    </DesktopAppFrame>
  );
}
