import type { Dispatch, SetStateAction } from "react";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type { DesktopDashboardData } from "../../../electron/database";
import type { DesktopPage } from "../../app/navigation";
import { getRoomDisplayInfo, isAccommodationTask, isRestaurantTask } from "../../app/operations";
import {
  formatRequestStatus,
  formatRequestType,
  formatReservationDate
} from "../../app/record-formatters";
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
import type { UiPreferences } from "../../ui-preferences";
import { CustomersWorkspace } from "../customers/CustomersWorkspace";
import { RequestsWorkspace, getRequestStatusTone, isRequestWaitingForReply } from "../customers/RequestsWorkspace";
import { AiWorkspace, WhatsAppWorkspace } from "../messages/MessageWorkspaces";
import { MenuManager } from "../menu/MenuManager";
import {
  CustomerRoomStaysWorkspace,
  DailyTasksWorkspace,
  ReservationsWorkspace,
  RoomsWorkspace,
  formatTaskDue
} from "../operations/OperationWorkspaces";
import { SetupWizard } from "../settings/SetupWizard";
import { CustomerWorkPage } from "../../pages/CustomerWorkPage";
import { DashboardPage } from "../../pages/DashboardPage";
import { MessagesPage } from "../../pages/MessagesPage";
import { PensionPage } from "../../pages/PensionPage";
import { ReportsPage } from "../../pages/ReportsPage";
import { RestaurantPage } from "../../pages/RestaurantPage";

interface DesktopWorkspaceRouterProps {
  activePage: DesktopPage;
  setActivePage: Dispatch<SetStateAction<DesktopPage>>;
  setSyncState: Dispatch<SetStateAction<SyncState>>;
  setStatusMessage: Dispatch<SetStateAction<string>>;
  setupController: SetupController;
  appLockController: AppLockController;
  desktopSyncController: DesktopSyncController;
  menuController: MenuController;
  messagingController: MessagingController;
  customerController: CustomerController;
  operationController: OperationController;
  deviceController: DeviceController;
  uiPreferences: UiPreferences;
  setUiPreferences: Dispatch<SetStateAction<UiPreferences>>;
}

export function DesktopWorkspaceRouter({
  activePage,
  setActivePage,
  setSyncState,
  setStatusMessage,
  setupController,
  appLockController,
  desktopSyncController,
  menuController,
  messagingController,
  customerController,
  operationController,
  deviceController,
  uiPreferences,
  setUiPreferences
}: DesktopWorkspaceRouterProps) {
  const {
    setupData,
    setupForm,
    setSetupForm,
    setupSaveState,
    setupMessage,
    aiConnectionTestState,
    aiConnectionTestMessage,
    testAiConnection: handleTestAiConnection,
    saveSetup
  } = setupController;
  const { setPasswordConfigured: handleAppPasswordConfiguredChange } = appLockController;
  const { dashboardData, setDashboardData } = desktopSyncController;
  const {
    menuEditState,
    menuEditMessage,
    selectedCategoryId,
    selectedItemId,
    categoryForm,
    itemForm,
    setCategoryForm,
    setItemForm,
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

  function openDashboardCustomerWork(request?: SyncedCustomerRequest) {
    if (request) {
      setSelectedRequestId(request.id);
    }
    setActivePage("customerWork");
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
    <>
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
    </>
  );
}
