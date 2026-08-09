import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BedDouble,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Copy,
  CreditCard,
  Eye,
  ExternalLink,
  LockKeyhole,
  MessageCircle,
  Pencil,
  Phone,
  RefreshCw,
  Save,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  UploadCloud,
  Users,
  UtensilsCrossed,
  X
} from "lucide-react";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type { DesktopDashboardData } from "../electron/database";
import { buildNavigation, getPageMeta, type DesktopPage } from "./app/navigation";
import { defaultDashboardData } from "./app/bootstrap-defaults";
import {
  automaticSyncTone,
  readSidebarCollapsedPreference,
  saveSidebarCollapsedPreference,
  type SyncState
} from "./app/runtime-state";
import { useAppLock } from "./app/use-app-lock";
import { useDesktopSync } from "./app/use-desktop-sync";
import { useMenuController } from "./app/use-menu-controller";
import { useSetupController } from "./app/use-setup-controller";
import { useMessagingController } from "./app/use-messaging-controller";
import { useCustomerController } from "./app/use-customer-controller";
import { useOperationController } from "./app/use-operation-controller";
import { useDeviceController } from "./app/use-device-controller";
import { buildDesktopNotifications, type DesktopNotificationItem } from "./app/notifications";
import { getRoomDisplayInfo, getTableStatusAction, formatTableStatus, isAccommodationTask, isRestaurantTask } from "./app/operations";
import {
  formatDateForDisplay,
  formatDateTime,
  formatRequestStatus,
  formatRequestType,
  formatReservationDate,
  formatReservationStatus,
  formatRoomStatus,
} from "./app/record-formatters";
import {
  formatCustomerRoomStayStatus,
  formatCustomerSource,
  formatStayDateRange
} from "./app/customer-model";
import { CustomersWorkspace } from "./components/customers/CustomersWorkspace";
import { RequestsWorkspace, getRequestStatusTone, isRequestWaitingForReply } from "./components/customers/RequestsWorkspace";
import { CustomerRoomStaysWorkspace, DailyTasksWorkspace, ReservationsWorkspace, RoomsWorkspace, formatTaskDue } from "./components/operations/OperationWorkspaces";
import { AppShell } from "./components/layout/AppShell";
import { PageHeader } from "./components/layout/PageHeader";
import { Sidebar } from "./components/layout/Sidebar";
import { NotificationCenter } from "./components/notifications/NotificationCenter";
import { AiWorkspace, WhatsAppWorkspace } from "./components/messages/MessageWorkspaces";
import { MenuManager } from "./components/menu/MenuManager";
import { LocalMenuPreview } from "./components/menu/MenuPreview";
import { AppLockScreen } from "./components/security/AppLockScreen";
import { SetupWizard } from "./components/settings/SetupWizard";
import { ActionButton } from "./components/ui/ActionButton";
import { CompactList } from "./components/ui/CompactList";
import { CompactListButton, CompactListItem } from "./components/ui/CompactListItem";
import { StatusBadge, type StatusTone } from "./components/ui/StatusBadge";
import { CustomerWorkPage } from "./pages/CustomerWorkPage";
import { DashboardPage } from "./pages/DashboardPage";
import { MessagesPage } from "./pages/MessagesPage";
import { PensionPage } from "./pages/PensionPage";
import { ReportsPage } from "./pages/ReportsPage";
import { RestaurantPage } from "./pages/RestaurantPage";
import {
  applyUiPreferences,
  readUiPreferences,
  saveUiPreferences,
  type UiPreferences
} from "./ui-preferences";

function App() {
  const contentRef = useRef<HTMLElement>(null);
  const [uiPreferences, setUiPreferences] = useState<UiPreferences>(readUiPreferences);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsedPreference);
  const [activePage, setActivePage] = useState<DesktopPage>("dashboard");
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [statusMessage, setStatusMessage] = useState("Webden yeni talep yok.");
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
    applyBootstrapSetup,
    testAiConnection: handleTestAiConnection,
    saveSetup,
    setPasswordConfigured: updateSetupPasswordConfigured
  } = useSetupController({
    onInitialSetupReady: () => setActivePage("dashboard")
  });
  const {
    phase: appAccessPhase,
    status: appLockStatus,
    lockApp,
    unlockApp,
    resetAppPassword,
    setPasswordConfigured: handleAppPasswordConfiguredChange
  } = useAppLock({
    passwordConfigured: setupData.appPasswordConfigured,
    getNotificationCount: () => buildDesktopNotifications(dashboardData, automaticSyncStatus).length,
    onPasswordConfiguredChange: updateSetupPasswordConfigured
  });
  const {
    dashboardData,
    setDashboardData,
    automaticSyncStatus,
    loadDashboardData,
    pullRequests: handlePullRequests
  } = useDesktopSync({
    accessPhase: appAccessPhase,
    setSyncState,
    setStatusMessage,
    onBootstrapSetup: applyBootstrapSetup,
  });
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
  } = useMenuController({ dashboardData, setDashboardData, loadDashboardData });
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
  } = useMessagingController({
    dashboardData,
    setDashboardData,
    setSyncState,
    setStatusMessage,
    messagesActive: activePage === "messages",
    aiEnabled: setupData.aiEnabled,
    whatsappEnabled: setupData.modules.whatsapp,
    onOpenMessages: () => setActivePage("messages")
  });
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
  } = useCustomerController({
    dashboardData,
    setDashboardData,
    setSyncState,
    setStatusMessage,
    selectedWhatsAppRequestId,
    setSelectedWhatsAppRequestId
  });
  const {
    handleUpdateRoomStatus,
    handleUpdateTableStatus,
    handleUpdateReservationStatus,
    handleUpdateDailyTaskStatus
  } = useOperationController({ setDashboardData, setSyncState, setStatusMessage });
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
  } = useDeviceController({ setDashboardData });
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





export default App;
