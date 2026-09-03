import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
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
import { MarketPage } from "../../pages/MarketPage";
import { AppLockScreen } from "../security/AppLockScreen";
import { SetupWizard } from "../settings/SetupWizard";
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
    setupData,
    setupForm,
    setSetupForm,
    setupMode,
    setSetupMode,
    setupSaveState,
    setupMessage,
    aiConnectionTestState,
    aiConnectionTestMessage,
    testAiConnection: handleTestAiConnection,
    saveSetup
  } = setupController;
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

  async function handleSaveSetup() {
    await saveSetup(desktopSyncController.setDashboardData);
    await desktopSyncController.loadBusinessCapabilities();
  }

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

  if (setupMode) {
    return (
      <SetupWizard
        form={setupForm}
        setupData={setupData}
        saveState={setupSaveState}
        message={setupMessage}
        aiConnectionTestState={aiConnectionTestState}
        aiConnectionTestMessage={aiConnectionTestMessage}
        onFormChange={setSetupForm}
        onTestAiConnection={handleTestAiConnection}
        onSave={handleSaveSetup}
        onSkip={() => setSetupMode(false)}
        uiPreferences={uiPreferences}
        onUiPreferencesChange={setUiPreferences}
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
    >
      {activePage === "market" ? (
        <MarketPage />
      ) : (
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
        />
      )}
    </DesktopAppFrame>
  );
}
