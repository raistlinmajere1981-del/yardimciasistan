import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { DesktopPage } from "../../app/navigation";
import type { SyncState } from "../../app/runtime-state";
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
import type { SettingsSaveHandle, SettingsSaveState } from "../../app/settings-save";
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
  const settingsSaveRef = useRef<SettingsSaveHandle | null>(null);
  const [settingsSaveState, setSettingsSaveState] = useState<SettingsSaveState>("idle");
  const [settingsSaveMessage, setSettingsSaveMessage] = useState("Ayarlar düzenlenebilir.");
  const {
    phase: appAccessPhase,
    status: appLockStatus,
    unlockApp,
    resetAppPassword
  } = appLockController;

  useEffect(() => {
    applyUiPreferences(uiPreferences);
    saveUiPreferences(uiPreferences);
  }, [uiPreferences]);

  const handleSettingsSaveStateChange = useCallback((state: SettingsSaveState, message: string) => {
    setSettingsSaveState(state);
    setSettingsSaveMessage(message);
  }, []);

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
      settingsSaveRef={settingsSaveRef}
      settingsSaveState={settingsSaveState}
      settingsSaveMessage={settingsSaveMessage}
      appLockController={appLockController}
      desktopSyncController={desktopSyncController}
      menuController={menuController}
      messagingController={messagingController}
      customerController={customerController}
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
        operationController={operationController}
        deviceController={deviceController}
        uiPreferences={uiPreferences}
        setUiPreferences={setUiPreferences}
        settingsSaveRef={settingsSaveRef}
        onSettingsSaveStateChange={handleSettingsSaveStateChange}
        onDashboardRefresh={desktopSyncController.loadDashboardData}
      />
    </DesktopAppFrame>
  );
}
