import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Eye, LockKeyhole, RefreshCw, Save, UploadCloud } from "lucide-react";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type { DesktopDashboardData } from "../../../electron/database";
import { buildNavigation, getPageMeta, type DesktopPage } from "../../app/navigation";
import {
  automaticSyncTone,
  readSidebarCollapsedPreference,
  saveSidebarCollapsedPreference,
  type SyncState
} from "../../app/runtime-state";
import { buildDesktopNotifications, type DesktopNotificationItem } from "../../app/notifications";
import { getRoomDisplayInfo, getTableStatusAction, formatTableStatus, isAccommodationTask, isRestaurantTask } from "../../app/operations";
import {
  formatDateForDisplay,
  formatDateTime,
  formatRequestStatus,
  formatRequestType,
  formatReservationDate,
  formatReservationStatus,
  formatRoomStatus,
} from "../../app/record-formatters";
import {
  formatCustomerRoomStayStatus,
  formatCustomerSource,
  formatStayDateRange
} from "../../app/customer-model";
import { CustomersWorkspace } from "../customers/CustomersWorkspace";
import { RequestsWorkspace, getRequestStatusTone, isRequestWaitingForReply } from "../customers/RequestsWorkspace";
import { CustomerRoomStaysWorkspace, DailyTasksWorkspace, ReservationsWorkspace, RoomsWorkspace, formatTaskDue } from "../operations/OperationWorkspaces";
import { AppShell } from "../layout/AppShell";
import { PageHeader } from "../layout/PageHeader";
import { Sidebar } from "../layout/Sidebar";
import { NotificationCenter } from "../notifications/NotificationCenter";
import { AiWorkspace, WhatsAppWorkspace } from "../messages/MessageWorkspaces";
import { MenuManager } from "../menu/MenuManager";
import { LocalMenuPreview } from "../menu/MenuPreview";
import { AppLockScreen } from "../security/AppLockScreen";
import { SetupWizard } from "../settings/SetupWizard";
import { DashboardPage } from "../../pages/DashboardPage";
import { CustomerWorkPage } from "../../pages/CustomerWorkPage";
import { MessagesPage } from "../../pages/MessagesPage";
import { PensionPage } from "../../pages/PensionPage";
import { ReportsPage } from "../../pages/ReportsPage";
import { RestaurantPage } from "../../pages/RestaurantPage";
import {
  applyUiPreferences,
  readUiPreferences,
  saveUiPreferences,
  type UiPreferences
} from "../../ui-preferences";

type AppLockController = ReturnType<(typeof import("../../app/use-app-lock"))["useAppLock"]>;
type DesktopSyncController = ReturnType<(typeof import("../../app/use-desktop-sync"))["useDesktopSync"]>;
type MenuController = ReturnType<(typeof import("../../app/use-menu-controller"))["useMenuController"]>;
type SetupController = ReturnType<(typeof import("../../app/use-setup-controller"))["useSetupController"]>;
type MessagingController = ReturnType<(typeof import("../../app/use-messaging-controller"))["useMessagingController"]>;
type CustomerController = ReturnType<(typeof import("../../app/use-customer-controller"))["useCustomerController"]>;
type OperationController = ReturnType<(typeof import("../../app/use-operation-controller"))["useOperationController"]>;
type DeviceController = ReturnType<(typeof import("../../app/use-device-controller"))["useDeviceController"]>;

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
  const contentRef = useRef<HTMLElement>(null);
  const [uiPreferences, setUiPreferences] = useState<UiPreferences>(readUiPreferences);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsedPreference);
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
    lockApp,
    unlockApp,
    resetAppPassword,
    setPasswordConfigured: handleAppPasswordConfiguredChange
  } = appLockController;
  const {
    dashboardData,
    setDashboardData,
    automaticSyncStatus,
    pullRequests: handlePullRequests
  } = desktopSyncController;
  const {
    menuPublishState,
    menuStatusMessage,
    menuEditState,
    menuEditMessage,
    menuPreviewOpen,
    menuPreviewData,
    selectedCategoryId,
    selectedItemId,
    categoryForm,
    itemForm,
    setCategoryForm,
    setItemForm,
    publishMenu: handlePublishMenu,
    openMenuPreview,
    closeMenuPreview,
    selectCategory,
    selectItem,
    startNewCategory,
    startNewItem,
    saveCategory: handleSaveCategory,
    saveItem: handleSaveItem,
    deleteCategory: handleDeleteMenuCategory,
    deleteItem: handleDeleteMenuItem
  } = menuController;
  const {
    selectedWhatsAppRequestId,
    setSelectedWhatsAppRequestId,
    selectedWhatsAppRequest,
    selectedWhatsAppMessage,
    selectedWhatsAppUrl,
    suggestingRequestId,
    aiState,
    aiMessage,
    aiWorkspaceMode,
    aiWorkspaceRequestId,
    aiWorkspaceInstructions,
    setAiWorkspaceInstructions,
    aiWorkspaceEntry,
    aiWorkspaceContent,
    setAiWorkspaceContent,
    aiWorkspaceHistory,
    aiWorkspaceState,
    aiWorkspaceMessage,
    messagesAiOpen,
    openWhatsApp,
    callCustomer,
    callCustomerRecord,
    openCustomerWhatsApp,
    openReservationWhatsApp,
    openSelectedWhatsAppExternal,
    handleWhatsAppMessageSent,
    handleDeleteWhatsAppMessage,
    handleCreateOwnerReplySuggestion,
    handleGenerateAiWorkspace,
    handleSaveAiWorkspace,
    handleCopyAiWorkspace,
    handlePrepareAiWorkspaceWhatsApp,
    openAiTools,
    handleRewriteWhatsAppMessage,
    selectAiWorkspaceHistoryEntry,
    changeAiWorkspaceMode,
    changeAiWorkspaceRequest
  } = messagingController;
  const {
    manualRequestForm,
    setManualRequestForm,
    manualRequestState,
    manualRequestMessage,
    selectedRequestId,
    setSelectedRequestId,
    selectedRequest,
    convertingRequestId,
    handleCreateManualRequest,
    handleConvertRequestToReservation,
    handleUpdateRequestStatus,
    handleDeleteRequest,
    handleDeleteCustomer,
    handleSaveCustomer,
    handleAssignCustomerToRoom,
    handleUpdateCustomerRoomStayStatus,
    handleAnalyzeIdentityImage
  } = customerController;
  const {
    handleUpdateRoomStatus,
    handleUpdateTableStatus,
    handleUpdateReservationStatus,
    handleUpdateDailyTaskStatus
  } = operationController;
  const {
    backupState,
    backupMessage,
    androidPublishState,
    androidPublishMessage,
    androidDeviceState,
    androidDeviceMessage,
    handlePublishAndroidSnapshot,
    handleSetAndroidDeviceRole,
    handleSetAndroidDevicePermissionGroups,
    handleSetAndroidDeviceActive,
    handleResetAndroidDevicePermissions,
    handleRevokeAndroidDevice,
    handleCreateManualBackup
  } = deviceController;
  const modules = useMemo(
    () => ({
      rooms: setupData.modules.rooms,
      tables: setupData.modules.tables,
      qrMenu: setupData.modules.qrMenu,
      whatsapp: setupData.modules.whatsapp,
      ai: setupData.aiEnabled
    }),
    [setupData]
  );
  const navigationItems = useMemo(() => buildNavigation(setupData), [setupData]);

  useEffect(() => {
    applyUiPreferences(uiPreferences);
    saveUiPreferences(uiPreferences);
  }, [uiPreferences]);

  useEffect(() => {
    saveSidebarCollapsedPreference(sidebarCollapsed);
  }, [sidebarCollapsed]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    window.scrollTo(0, 0);
  }, [activePage]);

  useEffect(() => {
    if (!navigationItems.some((item) => item.id === activePage)) {
      setActivePage("dashboard");
    }
  }, [activePage, navigationItems]);

  const pageMeta = getPageMeta(activePage);
  const desktopNotifications = useMemo(
    () => buildDesktopNotifications(dashboardData, automaticSyncStatus),
    [automaticSyncStatus, dashboardData]
  );
  function handleLockApp() {
    closeMenuPreview();
    void lockApp();
  }

  function openDashboardReply(request: SyncedCustomerRequest) {
    if (setupData.modules.whatsapp) {
      openWhatsApp(request);
      return;
    }
    if (setupData.aiEnabled) {
      openAiTools("reply", request.id);
      return;
    }
    openDashboardCustomerWork(request);
  }

  function openRequestReservation(request: SyncedCustomerRequest) {
    const reservation = dashboardData.reservations.find((item) => item.requestId === request.id);
    if (!reservation) {
      setSyncState("error");
      setStatusMessage("Talebe bağlı rezervasyon bulunamadı.");
      return;
    }

    if (["table", "breakfast"].includes(reservation.reservationType) && setupData.modules.tables) {
      setActivePage("restaurant");
      return;
    }
    setActivePage("pension");
  }

  function openDashboardCustomerWork(request?: SyncedCustomerRequest) {
    if (request) {
      setSelectedRequestId(request.id);
    }
    setActivePage("customerWork");
  }

  function openDesktopNotification(item: DesktopNotificationItem) {
    if (item.kind === "request" && item.relatedId) {
      setSelectedRequestId(item.relatedId);
    }
    const destination = navigationItems.some((navigationItem) => navigationItem.id === item.destination)
      ? item.destination
      : "dashboard";
    setActivePage(destination);
  }

  function openDashboardReservation(reservation: DesktopDashboardData["reservations"][number]) {
    const request = dashboardData.requests.find((item) => item.id === reservation.requestId);
    if (request) {
      openDashboardCustomerWork(request);
      return;
    }
    if (!["table", "breakfast"].includes(reservation.reservationType) && setupData.modules.rooms) {
      setActivePage("pension");
      return;
    }
    setSyncState("error");
    setStatusMessage("Bu rezervasyonun bağlı müşteri talebi bulunamadı.");
  }

  async function handleSaveSetup() {
    await saveSetup(setDashboardData);
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

  const persistentMessagesPage = (
    <MessagesPage
      aiEnabled={setupData.aiEnabled}
      whatsappEnabled={setupData.modules.whatsapp}
      aiOpen={messagesAiOpen}
      active={activePage === "messages"}
      safeMode={(
        <WhatsAppWorkspace
          view="safe"
          requests={dashboardData.requests}
          selectedRequest={selectedWhatsAppRequest}
          selectedMessage={selectedWhatsAppMessage}
          selectedUrl={selectedWhatsAppUrl}
          aiEnabled={setupData.aiEnabled}
          aiState={aiState}
          aiMessage={aiMessage}
          getRequestStatusTone={getRequestStatusTone}
          onSelectRequest={setSelectedWhatsAppRequestId}
          onOpenExternal={openSelectedWhatsAppExternal}
          onCall={selectedWhatsAppRequest ? () => callCustomer(selectedWhatsAppRequest) : undefined}
          onRewrite={handleRewriteWhatsAppMessage}
          onMessageSent={handleWhatsAppMessageSent}
          onDeleteMessage={handleDeleteWhatsAppMessage}
        />
      )}
      webMode={(onReturnToSafe) => (
        <WhatsAppWorkspace
          view="web"
          requests={dashboardData.requests}
          selectedRequest={selectedWhatsAppRequest}
          selectedMessage={selectedWhatsAppMessage}
          selectedUrl={selectedWhatsAppUrl}
          aiEnabled={setupData.aiEnabled}
          aiState={aiState}
          aiMessage={aiMessage}
          getRequestStatusTone={getRequestStatusTone}
          onSelectRequest={setSelectedWhatsAppRequestId}
          onOpenExternal={openSelectedWhatsAppExternal}
          onReturnToSafe={onReturnToSafe}
          onCall={selectedWhatsAppRequest ? () => callCustomer(selectedWhatsAppRequest) : undefined}
          onRewrite={handleRewriteWhatsAppMessage}
          onMessageSent={handleWhatsAppMessageSent}
          onDeleteMessage={handleDeleteWhatsAppMessage}
        />
      )}
      aiTools={(
        <AiWorkspace
          setupData={setupData}
          dashboardData={dashboardData}
          mode={aiWorkspaceMode}
          selectedRequestId={aiWorkspaceRequestId}
          instructions={aiWorkspaceInstructions}
          entry={aiWorkspaceEntry}
          content={aiWorkspaceContent}
          history={aiWorkspaceHistory}
          state={aiWorkspaceState}
          message={aiWorkspaceMessage}
          onModeChange={changeAiWorkspaceMode}
          onRequestChange={changeAiWorkspaceRequest}
          onInstructionsChange={setAiWorkspaceInstructions}
          onContentChange={setAiWorkspaceContent}
          onGenerate={handleGenerateAiWorkspace}
          onSave={handleSaveAiWorkspace}
          onCopy={handleCopyAiWorkspace}
          onWhatsApp={handlePrepareAiWorkspaceWhatsApp}
          onSelectHistory={selectAiWorkspaceHistoryEntry}
        />
      )}
    />
  );

  return (
    <AppShell
      contentRef={contentRef}
      sidebarCollapsed={sidebarCollapsed}
      sidebar={(
        <Sidebar
          items={navigationItems}
          activePage={activePage}
          businessName={setupData.businessName}
          collapsed={sidebarCollapsed}
          onNavigate={setActivePage}
          onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
        />
      )}
      header={(
        <PageHeader
          eyebrow={pageMeta.eyebrow}
          title={pageMeta.title}
          description={pageMeta.description}
          action={(
            <div className="page-header-tools">
              {activePage === "menu" ? (
            <div className={`sync-pill sync-${menuPublishState}`}>
              <span role="status" aria-live="polite">{menuStatusMessage}</span>
              <button className="secondary-sync-action" type="button" onClick={openMenuPreview}>
                <Eye size={16} aria-hidden="true" />
                Önizle
              </button>
              <button type="button" onClick={handlePublishMenu} disabled={menuPublishState === "loading"}>
                <UploadCloud size={16} aria-hidden="true" />
                Web'e Yayınla
              </button>
            </div>
          ) : activePage === "messages" ? (
            <div className="sync-pill sync-idle">
              <span>{setupData.modules.whatsapp ? (selectedWhatsAppRequest ? `${selectedWhatsAppRequest.customer_name} için hazır cevap` : "Mesaj için talep seçin") : "AI araçları kullanıma hazır."}</span>
            </div>
          ) : activePage === "settings" ? (
            <div className={`sync-pill sync-${setupSaveState}`}>
              <span>{setupMessage}</span>
              <button type="button" onClick={handleSaveSetup} disabled={setupSaveState === "loading"}>
                <Save size={16} aria-hidden="true" />
                Ayarları Kaydet
              </button>
            </div>
          ) : (
            <div className={`sync-pill sync-${syncState === "idle" ? automaticSyncTone(automaticSyncStatus) : syncState}`}>
              <span role="status" aria-live="polite">
                {syncState === "idle" ? automaticSyncStatus.message : statusMessage}
                {automaticSyncStatus.pendingJobs > 0 ? ` · ${automaticSyncStatus.pendingJobs} eşitleme bekliyor` : ""}
              </span>
              <button
                type="button"
                title={automaticSyncStatus.message}
                onClick={handlePullRequests}
                disabled={automaticSyncStatus.phase === "syncing" || syncState === "loading"}
              >
                <RefreshCw size={16} aria-hidden="true" />
                {automaticSyncStatus.phase === "syncing" ? "Eşitleniyor" : "Şimdi Eşitle"}
              </button>
            </div>
              )}
              <NotificationCenter items={desktopNotifications} onOpen={openDesktopNotification} />
              <button
                className="app-lock-trigger"
                type="button"
                aria-label="Uygulamayı kilitle"
                title="Ekranı kilitle"
                onClick={() => void handleLockApp()}
              >
                <LockKeyhole size={18} aria-hidden="true" />
              </button>
            </div>
          )}
        />
      )}
      overlay={menuPreviewOpen ? (
        <LocalMenuPreview
          menu={menuPreviewData}
          setupData={setupData}
          webModuleUrl={dashboardData.webModuleUrl}
          onClose={closeMenuPreview}
        />
      ) : undefined}
    >

        {activePage === "dashboard" ? (
          <DashboardPage
            data={dashboardData}
            modules={setupData.modules}
            aiEnabled={setupData.aiEnabled}
            availableRoomCount={dashboardData.rooms.filter((room) => getRoomDisplayInfo(room, dashboardData.reservations).status === "available").length}
            onReplyRequest={openDashboardReply}
            onOpenCustomerWork={openDashboardCustomerWork}
            onOpenReservation={openDashboardReservation}
            onCompleteTask={(taskId) => handleUpdateDailyTaskStatus(taskId, "done")}
            onOpenDailyAi={() => openAiTools("daily")}
            formatRequestType={formatRequestType}
            formatRequestStatus={formatRequestStatus}
            getRequestStatusTone={getRequestStatusTone}
            isRequestWaitingForReply={isRequestWaitingForReply}
            formatTaskDue={formatTaskDue}
            formatReservationDate={formatReservationDate}
          />
        ) : activePage === "customerWork" ? (
          <CustomerWorkPage
            requests={(
              <RequestsWorkspace
                requests={dashboardData.requests}
                selectedRequest={selectedRequest}
                aiEnabled={setupData.aiEnabled}
                convertingRequestId={convertingRequestId}
                suggestingRequestId={suggestingRequestId}
                manualRequestForm={manualRequestForm}
                manualRequestState={manualRequestState}
                manualRequestMessage={manualRequestMessage}
                onSelectRequest={setSelectedRequestId}
                onManualRequestFormChange={setManualRequestForm}
                onCreateManualRequest={handleCreateManualRequest}
                onCall={callCustomer}
                onWhatsApp={openWhatsApp}
                onConvert={handleConvertRequestToReservation}
                onSuggest={handleCreateOwnerReplySuggestion}
                onUpdateStatus={handleUpdateRequestStatus}
                onOpenReservation={openRequestReservation}
                onDelete={handleDeleteRequest}
              />
            )}
            customers={(
              <CustomersWorkspace
                customers={dashboardData.customers}
                requests={dashboardData.requests}
                reservations={dashboardData.reservations}
                rooms={dashboardData.rooms}
                stays={dashboardData.customerRoomStays}
                aiEnabled={setupData.aiEnabled}
                onCall={callCustomerRecord}
                onWhatsApp={openCustomerWhatsApp}
                onSummarize={(requestId) => openAiTools("summary", requestId)}
                onSave={handleSaveCustomer}
                onAnalyzeIdentity={handleAnalyzeIdentityImage}
                onAssignRoom={handleAssignCustomerToRoom}
                onUpdateStayStatus={handleUpdateCustomerRoomStayStatus}
                onDelete={handleDeleteCustomer}
              />
            )}
            waiting={(
              <RequestsWorkspace
                requests={dashboardData.requests.filter((request) => isRequestWaitingForReply(request.status))}
                selectedRequest={dashboardData.requests.filter((request) => isRequestWaitingForReply(request.status)).find((request) => request.id === selectedRequestId) ?? dashboardData.requests.find((request) => isRequestWaitingForReply(request.status))}
                aiEnabled={setupData.aiEnabled}
                convertingRequestId={convertingRequestId}
                suggestingRequestId={suggestingRequestId}
                manualRequestForm={manualRequestForm}
                manualRequestState={manualRequestState}
                manualRequestMessage={manualRequestMessage}
                showManualForm={false}
                onSelectRequest={setSelectedRequestId}
                onManualRequestFormChange={setManualRequestForm}
                onCreateManualRequest={handleCreateManualRequest}
                onCall={callCustomer}
                onWhatsApp={openWhatsApp}
                onConvert={handleConvertRequestToReservation}
                onSuggest={handleCreateOwnerReplySuggestion}
                onUpdateStatus={handleUpdateRequestStatus}
                onOpenReservation={openRequestReservation}
                onDelete={handleDeleteRequest}
              />
            )}
          />
        ) : activePage === "pension" ? (
          <PensionPage
            data={dashboardData}
            reservations={(
              <ReservationsWorkspace
                reservations={dashboardData.reservations}
                rooms={dashboardData.rooms}
                onUpdateStatus={handleUpdateReservationStatus}
                onOpenWhatsApp={openReservationWhatsApp}
              />
            )}
            rooms={(
              <RoomsWorkspace
                rooms={dashboardData.rooms}
                reservations={dashboardData.reservations}
                customers={dashboardData.customers}
                stays={dashboardData.customerRoomStays}
                onUpdateStatus={handleUpdateRoomStatus}
                onAssignRoom={handleAssignCustomerToRoom}
                onUpdateStayStatus={handleUpdateCustomerRoomStayStatus}
              />
            )}
            stays={(
              <CustomerRoomStaysWorkspace
                stays={dashboardData.customerRoomStays}
                onUpdateStatus={handleUpdateCustomerRoomStayStatus}
              />
            )}
            tasks={(
              <DailyTasksWorkspace
                tasks={dashboardData.dailyTasks.filter((task) => isAccommodationTask(task, dashboardData.reservations))}
                onUpdateStatus={handleUpdateDailyTaskStatus}
              />
            )}
          />
        ) : activePage === "restaurant" ? (
          <RestaurantPage
            data={dashboardData}
            onDashboardDataChanged={setDashboardData}
            onUpdateTableStatus={handleUpdateTableStatus}
            tasks={(
              <DailyTasksWorkspace
                tasks={dashboardData.dailyTasks.filter((task) => isRestaurantTask(task, dashboardData.reservations))}
                onUpdateStatus={handleUpdateDailyTaskStatus}
              />
            )}
          />
        ) : activePage === "menu" ? (
          <MenuManager
            dashboardData={dashboardData}
            categoryForm={categoryForm}
            itemForm={itemForm}
            selectedCategoryId={selectedCategoryId}
            selectedItemId={selectedItemId}
            menuEditState={menuEditState}
            menuEditMessage={menuEditMessage}
            onCategoryFormChange={setCategoryForm}
            onItemFormChange={setItemForm}
            onSelectCategory={selectCategory}
            onSelectItem={selectItem}
            onNewCategory={startNewCategory}
            onNewItem={startNewItem}
            onSaveCategory={handleSaveCategory}
            onSaveItem={handleSaveItem}
            onDeleteCategory={handleDeleteMenuCategory}
            onDeleteItem={handleDeleteMenuItem}
            onDashboardDataChanged={setDashboardData}
          />
        ) : activePage === "reports" ? (
          <ReportsPage aiEnabled={setupData.aiEnabled} />
        ) : activePage === "messages" ? null : (
          <SetupWizard
            embedded
            form={setupForm}
            setupData={setupData}
            dashboardData={dashboardData}
            saveState={setupSaveState}
            message={setupMessage}
            backupState={backupState}
            backupMessage={backupMessage}
            androidPublishState={androidPublishState}
            androidPublishMessage={androidPublishMessage}
            androidDeviceState={androidDeviceState}
            androidDeviceMessage={androidDeviceMessage}
            aiConnectionTestState={aiConnectionTestState}
            aiConnectionTestMessage={aiConnectionTestMessage}
            onFormChange={setSetupForm}
            onTestAiConnection={handleTestAiConnection}
            onCreateBackup={handleCreateManualBackup}
            onPublishAndroid={handlePublishAndroidSnapshot}
            onSetAndroidDeviceRole={handleSetAndroidDeviceRole}
            onSetAndroidDevicePermissionGroups={handleSetAndroidDevicePermissionGroups}
            onSetAndroidDeviceActive={handleSetAndroidDeviceActive}
            onResetAndroidDevicePermissions={handleResetAndroidDevicePermissions}
            onRevokeAndroidDevice={handleRevokeAndroidDevice}
            onSave={handleSaveSetup}
            onSkip={() => setActivePage("dashboard")}
            onAppPasswordConfiguredChange={handleAppPasswordConfiguredChange}
            uiPreferences={uiPreferences}
            onUiPreferencesChange={setUiPreferences}
          />
        )}
      <div className={activePage === "messages" ? "persistent-messages-page" : "persistent-messages-page is-hidden"} aria-hidden={activePage !== "messages"}>
        {persistentMessagesPage}
      </div>
    </AppShell>
  );
}
