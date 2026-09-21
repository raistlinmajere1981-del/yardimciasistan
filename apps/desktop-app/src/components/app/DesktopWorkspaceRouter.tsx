import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  BUSINESS_CAPABILITIES,
  getReservationDomain,
  isReservationTypeAvailable
} from "@yardimci-asistan/shared";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type { DesktopDashboardData } from "../../../electron/database";
import { runtimeHasCapability } from "../../app/capabilities";
import { projectDesktopDashboardData } from "../../app/capability-projection";
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
import type { SettingsSaveHandle, SettingsSaveState } from "../../app/settings-save";
import { CustomersWorkspace } from "../customers/CustomersWorkspace";
import { RequestsWorkspace, getRequestStatusTone, isRequestWaitingForReply } from "../customers/RequestsWorkspace";
import { AiWorkspace, WhatsAppWorkspace } from "../messages/MessageWorkspaces";
import { MenuManager } from "../menu/MenuManager";
import { RestaurantReservationsWorkspace } from "../operations/RestaurantReservationsWorkspace";
import {
  CustomerRoomStaysWorkspace,
  DailyTasksWorkspace,
  ReservationsWorkspace,
  RoomsWorkspace,
  formatTaskDue
} from "../operations/OperationWorkspaces";
import { SettingsWorkspace } from "../settings/SettingsWorkspace";
import { CustomerWorkPage } from "../../pages/CustomerWorkPage";
import { DashboardPage } from "../../pages/DashboardPage";
import { MarketPage } from "../../pages/MarketPage";
import { MessagesPage } from "../../pages/MessagesPage";
import { OperationCalendarPage } from "../../pages/OperationCalendarPage";
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
  settingsSaveRef: MutableRefObject<SettingsSaveHandle | null>;
  onSettingsSaveStateChange: (state: SettingsSaveState, message: string) => void;
  onDashboardRefresh: () => Promise<unknown>;
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
  setUiPreferences,
  settingsSaveRef,
  onSettingsSaveStateChange,
  onDashboardRefresh
}: DesktopWorkspaceRouterProps) {
  const {
    setupData,
    setupForm,
    setSetupForm,
    aiConnectionTestState,
    aiConnectionTestMessage,
    testAiConnection: handleTestAiConnection,
    saveSetup
  } = setupController;
  const { setPasswordConfigured: handleAppPasswordConfiguredChange } = appLockController;
  const {
    dashboardData,
    setDashboardData,
    businessCapabilities,
    loadBusinessCapabilities
  } = desktopSyncController;
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
    prepareBirthdayWhatsApp,
    birthdayPreparingId,
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
    handleSaveManualReservation,
    handleSaveManualRestaurantReservation,
    handleUpdateReservationStatus,
    handleSaveDailyTask,
    handleDeleteDailyTask,
    handleUpdateDailyTaskStatus
  } = operationController;
  const {
    androidDeviceState,
    androidDeviceMessage,
    androidInstallState,
    androidInstallMessage,
    androidInstallSnapshot,
    refreshAndroidInstallDevices,
    handleInstallAndroidApp,
    handleSetAndroidDeviceRole,
    handleSetAndroidDevicePermissionGroups,
    handleSetAndroidDeviceActive,
    handleResetAndroidDevicePermissions,
    handleRevokeAndroidDevice
  } = deviceController;

  const C = BUSINESS_CAPABILITIES;
  const enabledCapabilities = businessCapabilities?.enabledCapabilities ?? [];
  const customersEnabled = runtimeHasCapability(businessCapabilities, C.CUSTOMERS);
  const requestsEnabled = runtimeHasCapability(businessCapabilities, C.REQUESTS);
  const tasksEnabled = runtimeHasCapability(businessCapabilities, C.TASKS);
  const aiEnabled = runtimeHasCapability(businessCapabilities, C.AI);
  const whatsappEnabled = runtimeHasCapability(businessCapabilities, C.WHATSAPP);
  const roomsEnabled = runtimeHasCapability(businessCapabilities, C.ACCOMMODATION_ROOMS);
  const accommodationReservationsEnabled = runtimeHasCapability(businessCapabilities, C.ACCOMMODATION_RESERVATIONS);
  const accommodationStaysEnabled = runtimeHasCapability(businessCapabilities, C.ACCOMMODATION_STAYS);
  const accommodationFolioEnabled = runtimeHasCapability(businessCapabilities, C.ACCOMMODATION_FOLIO);
  const tablesEnabled = runtimeHasCapability(businessCapabilities, C.FOOD_TABLES);
  const foodReservationsEnabled = runtimeHasCapability(businessCapabilities, C.FOOD_RESERVATIONS);
  const foodOrdersEnabled = runtimeHasCapability(businessCapabilities, C.FOOD_ORDERS);
  const foodMenuEnabled = runtimeHasCapability(businessCapabilities, C.FOOD_MENU);
  const inventoryEnabled = runtimeHasCapability(businessCapabilities, C.INVENTORY);
  const customerMessagingEnabled = customersEnabled && whatsappEnabled;
  const surfaceData = projectDesktopDashboardData(dashboardData, enabledCapabilities);
  const pensionReservations = surfaceData.reservations.filter((reservation) => {
    const domain = getReservationDomain(reservation.reservationType, {
      roomIds: reservation.roomIds,
      tableIds: reservation.tableIds
    });
    return domain === "accommodation" || domain === "mixed" || domain === "generic";
  });
  const surfaceSelectedRequest = surfaceData.requests.find((request) => request.id === selectedRequest?.id)
    ?? surfaceData.requests[0];
  const surfaceSelectedWhatsAppRequest = surfaceData.requests.find(
    (request) => request.id === selectedWhatsAppRequest?.id
  );
  const runtimeFeatures = {
    rooms: roomsEnabled,
    tables: tablesEnabled,
    qrMenu: runtimeHasCapability(businessCapabilities, C.QR_MENU),
    whatsapp: whatsappEnabled,
    android: runtimeHasCapability(businessCapabilities, C.ANDROID)
  };

  function openDashboardCustomerWork(request?: SyncedCustomerRequest) {
    if (request) {
      setSelectedRequestId(request.id);
    }
    setActivePage("customerWork");
  }

  function openDashboardReply(request: SyncedCustomerRequest) {
    if (whatsappEnabled) {
      openWhatsApp(request);
      return;
    }
    if (aiEnabled) {
      openAiTools("reply", request.id);
      return;
    }
    openDashboardCustomerWork(request);
  }

  function openRequestReservation(request: SyncedCustomerRequest) {
    const reservation = surfaceData.reservations.find((item) => item.requestId === request.id);
    if (!reservation) {
      setSyncState("error");
      setStatusMessage("Talebe bağlı rezervasyon bulunamadı.");
      return;
    }

    if (!isReservationTypeAvailable(enabledCapabilities, reservation.reservationType, {
      roomIds: reservation.roomIds,
      tableIds: reservation.tableIds
    })) {
      setSyncState("error");
      setStatusMessage("Bu rezervasyon alanı işletmenin etkin yeteneklerinde kullanılamıyor.");
      return;
    }
    const domain = getReservationDomain(reservation.reservationType, {
      roomIds: reservation.roomIds,
      tableIds: reservation.tableIds
    });
    if ((domain === "food_service" || (domain === "generic" && !accommodationReservationsEnabled))
        && foodReservationsEnabled) {
      setActivePage("restaurant");
      return;
    }
    if (accommodationReservationsEnabled) {
      setActivePage("pension");
      return;
    }
    setSyncState("error");
    setStatusMessage("Bu rezervasyon için etkin bir operasyon alanı bulunmuyor.");
  }

  function openDashboardReservation(reservation: DesktopDashboardData["reservations"][number]) {
    if (!isReservationTypeAvailable(enabledCapabilities, reservation.reservationType, {
      roomIds: reservation.roomIds,
      tableIds: reservation.tableIds
    })) {
      setSyncState("error");
      setStatusMessage("Bu rezervasyon alanı işletmenin etkin yeteneklerinde kullanılamıyor.");
      return;
    }
    const request = surfaceData.requests.find((item) => item.id === reservation.requestId);
    if (request) {
      openDashboardCustomerWork(request);
      return;
    }
    const domain = getReservationDomain(reservation.reservationType, {
      roomIds: reservation.roomIds,
      tableIds: reservation.tableIds
    });
    if ((domain === "food_service" || (domain === "generic" && !accommodationReservationsEnabled))
        && foodReservationsEnabled) {
      setActivePage("restaurant");
      return;
    }
    if (accommodationReservationsEnabled) {
      setActivePage("pension");
      return;
    }
    setSyncState("error");
    setStatusMessage("Bu rezervasyonun bağlı müşteri talebi bulunamadı.");
  }

  async function handleSaveSetup() {
    const result = await saveSetup(setDashboardData);
    await loadBusinessCapabilities();
    return result;
  }

  const persistentMessagesPage = (
    <MessagesPage
      aiEnabled={aiEnabled}
      whatsappEnabled={customerMessagingEnabled}
      automaticWebviewRequired={setupData.birthdaySettings.enabled && setupData.birthdaySettings.mode === "automatic" && customerMessagingEnabled}
      aiOpen={messagesAiOpen}
      active={activePage === "messages"}
      safeMode={(
        <WhatsAppWorkspace
          view="safe"
          preparedMessage={messagingController.preparedWhatsAppMessage}
          requests={surfaceData.requests}
          selectedRequest={surfaceSelectedWhatsAppRequest}
          selectedMessage={surfaceSelectedWhatsAppRequest || messagingController.preparedWhatsAppMessage ? selectedWhatsAppMessage : ""}
          selectedUrl={surfaceSelectedWhatsAppRequest || messagingController.preparedWhatsAppMessage ? selectedWhatsAppUrl : ""}
          aiEnabled={aiEnabled}
          aiState={aiState}
          aiMessage={aiMessage}
          getRequestStatusTone={getRequestStatusTone}
          onSelectRequest={setSelectedWhatsAppRequestId}
          onOpenExternal={openSelectedWhatsAppExternal}
          onCall={surfaceSelectedWhatsAppRequest ? () => callCustomer(surfaceSelectedWhatsAppRequest) : undefined}
          onRewrite={handleRewriteWhatsAppMessage}
          onMessageSent={handleWhatsAppMessageSent}
          onDeleteMessage={handleDeleteWhatsAppMessage}
        />
      )}
      webMode={(onReturnToSafe) => (
        <WhatsAppWorkspace
          view="web"
          preparedMessage={messagingController.preparedWhatsAppMessage}
          requests={surfaceData.requests}
          selectedRequest={surfaceSelectedWhatsAppRequest}
          selectedMessage={surfaceSelectedWhatsAppRequest || messagingController.preparedWhatsAppMessage ? selectedWhatsAppMessage : ""}
          selectedUrl={surfaceSelectedWhatsAppRequest || messagingController.preparedWhatsAppMessage ? selectedWhatsAppUrl : ""}
          aiEnabled={aiEnabled}
          aiState={aiState}
          aiMessage={aiMessage}
          getRequestStatusTone={getRequestStatusTone}
          onSelectRequest={setSelectedWhatsAppRequestId}
          onOpenExternal={openSelectedWhatsAppExternal}
          onReturnToSafe={onReturnToSafe}
          onCall={surfaceSelectedWhatsAppRequest ? () => callCustomer(surfaceSelectedWhatsAppRequest) : undefined}
          onRewrite={handleRewriteWhatsAppMessage}
          onMessageSent={handleWhatsAppMessageSent}
          onDeleteMessage={handleDeleteWhatsAppMessage}
        />
      )}
      aiTools={(
        <AiWorkspace
          dashboardData={surfaceData}
          aiEnabled={aiEnabled}
          customersEnabled={customersEnabled}
          whatsappEnabled={customerMessagingEnabled}
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
          data={surfaceData}
          features={runtimeFeatures}
          aiEnabled={aiEnabled}
          customersEnabled={customersEnabled}
          requestsEnabled={requestsEnabled}
          tasksEnabled={tasksEnabled}
          calendarEnabled={runtimeHasCapability(businessCapabilities, C.CALENDAR)}
          reservationsEnabled={accommodationReservationsEnabled || foodReservationsEnabled}
          availableRoomCount={surfaceData.rooms.filter((room) => getRoomDisplayInfo(room, surfaceData.reservations).status === "available").length}
          onReplyRequest={openDashboardReply}
          onOpenCustomerWork={openDashboardCustomerWork}
          onOpenReservation={openDashboardReservation}
          onCompleteTask={(taskId) => handleUpdateDailyTaskStatus(taskId, "done")}
          onOpenDailyAi={() => openAiTools("daily")}
          onPrepareBirthday={prepareBirthdayWhatsApp}
          birthdayPreparingId={birthdayPreparingId}
          formatRequestType={formatRequestType}
          formatRequestStatus={formatRequestStatus}
          getRequestStatusTone={getRequestStatusTone}
          isRequestWaitingForReply={isRequestWaitingForReply}
          formatTaskDue={formatTaskDue}
          formatReservationDate={formatReservationDate}
        />
      ) : activePage === "calendar" ? (
        <OperationCalendarPage
          data={surfaceData}
          accommodationReservationsEnabled={accommodationReservationsEnabled}
          foodReservationsEnabled={foodReservationsEnabled}
          tasksEnabled={tasksEnabled}
          onOpenReservation={openDashboardReservation}
          onCompleteTask={(taskId) => handleUpdateDailyTaskStatus(taskId, "done")}
        />
      ) : activePage === "customerWork" ? (
        <CustomerWorkPage
          requestsEnabled={requestsEnabled}
          requests={(
            <RequestsWorkspace
              requests={surfaceData.requests}
              selectedRequest={surfaceSelectedRequest}
              aiEnabled={aiEnabled}
              whatsappEnabled={whatsappEnabled}
              enabledCapabilities={enabledCapabilities}
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
              customers={surfaceData.customers}
              requests={surfaceData.requests}
              reservations={surfaceData.reservations}
              rooms={surfaceData.rooms}
              stays={surfaceData.customerRoomStays}
              aiEnabled={aiEnabled}
              whatsappEnabled={whatsappEnabled}
              reservationsEnabled={accommodationReservationsEnabled || foodReservationsEnabled}
              staysEnabled={accommodationStaysEnabled}
              customerCreditEnabled={runtimeHasCapability(businessCapabilities, C.CUSTOMER_CREDIT)}
              onPreparedCreditWhatsApp={messagingController.openPreparedCreditWhatsApp}
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
        />
      ) : activePage === "pension" ? (
        <PensionPage
          data={surfaceData}
          reservationsEnabled={accommodationReservationsEnabled}
          staysEnabled={accommodationStaysEnabled}
          folioEnabled={accommodationFolioEnabled}
          menuEnabled={foodMenuEnabled}
          tasksEnabled={tasksEnabled}
          reservations={accommodationReservationsEnabled ? (
            <ReservationsWorkspace
              reservations={pensionReservations}
              rooms={surfaceData.rooms}
              customers={surfaceData.customers}
              whatsappEnabled={whatsappEnabled}
              onSaveCustomer={handleSaveCustomer}
              onSaveManual={handleSaveManualReservation}
              onUpdateStatus={handleUpdateReservationStatus}
              onOpenWhatsApp={openReservationWhatsApp}
            />
          ) : null}
          rooms={(
            <RoomsWorkspace
              rooms={surfaceData.rooms}
              reservations={pensionReservations}
              customers={surfaceData.customers}
              stays={surfaceData.customerRoomStays}
              reservationsEnabled={accommodationReservationsEnabled}
              staysEnabled={accommodationStaysEnabled}
              onUpdateStatus={handleUpdateRoomStatus}
              onAssignRoom={handleAssignCustomerToRoom}
              onUpdateStayStatus={handleUpdateCustomerRoomStayStatus}
            />
          )}
          stays={accommodationStaysEnabled ? (
            <CustomerRoomStaysWorkspace
              stays={surfaceData.customerRoomStays}
              onUpdateStatus={handleUpdateCustomerRoomStayStatus}
            />
          ) : null}
          tasks={(
            <DailyTasksWorkspace
              scope="pension"
              tasks={surfaceData.dailyTasks.filter((task) => isAccommodationTask(task, surfaceData.reservations))}
              onSave={handleSaveDailyTask}
              onDelete={handleDeleteDailyTask}
              onUpdateStatus={handleUpdateDailyTaskStatus}
            />
          )}
        />
      ) : activePage === "restaurant" ? (
        <RestaurantPage
          data={surfaceData}
          accommodationReservationsEnabled={accommodationReservationsEnabled}
          reservationsEnabled={foodReservationsEnabled}
          ordersEnabled={foodOrdersEnabled}
          menuEnabled={foodMenuEnabled}
          roomFolioTransferEnabled={foodOrdersEnabled && accommodationFolioEnabled}
          tasksEnabled={tasksEnabled}
          onDashboardDataChanged={setDashboardData}
          onUpdateTableStatus={handleUpdateTableStatus}
          reservations={foodReservationsEnabled ? (
            <RestaurantReservationsWorkspace
              reservations={surfaceData.reservations}
              accommodationReservationsEnabled={accommodationReservationsEnabled}
              customers={surfaceData.customers}
              tables={surfaceData.tables}
              whatsappEnabled={whatsappEnabled}
              onSave={handleSaveManualRestaurantReservation}
              onSaveCustomer={handleSaveCustomer}
              onUpdateStatus={handleUpdateReservationStatus}
              onOpenWhatsApp={openReservationWhatsApp}
            />
          ) : null}
          tasks={(
            <DailyTasksWorkspace
              scope="restaurant"
              tasks={surfaceData.dailyTasks.filter((task) => isRestaurantTask(task, surfaceData.reservations))}
              onSave={handleSaveDailyTask}
              onDelete={handleDeleteDailyTask}
              onUpdateStatus={handleUpdateDailyTaskStatus}
            />
          )}
        />
      ) : activePage === "menu" ? (
        <MenuManager
          dashboardData={surfaceData}
          qrMenuEnabled={runtimeFeatures.qrMenu}
          inventoryEnabled={inventoryEnabled}
          stockImageImportEnabled={aiEnabled && inventoryEnabled}
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
        <ReportsPage
          aiEnabled={aiEnabled}
          financeEnabled={runtimeHasCapability(businessCapabilities, C.FINANCE)}
          reportsEnabled={runtimeHasCapability(businessCapabilities, C.REPORTS)}
          requestsEnabled={requestsEnabled}
          tasksEnabled={tasksEnabled}
          accommodationEnabled={roomsEnabled || accommodationReservationsEnabled || accommodationStaysEnabled || accommodationFolioEnabled}
          accommodationReservationsEnabled={accommodationReservationsEnabled}
          accommodationFolioEnabled={accommodationFolioEnabled}
          foodServiceEnabled={tablesEnabled || foodReservationsEnabled || foodOrdersEnabled || foodMenuEnabled}
          foodReservationsEnabled={foodReservationsEnabled}
          foodOrdersEnabled={foodOrdersEnabled}
          foodMenuEnabled={foodMenuEnabled}
          inventoryEnabled={inventoryEnabled}
        />
      ) : activePage === "market" ? (
        <MarketPage customers={dashboardData.customers} />
      ) : activePage === "messages" ? null : (
        <SettingsWorkspace
          form={setupForm}
          setupData={setupData}
          dashboardData={surfaceData}
          androidDeviceState={androidDeviceState}
          androidDeviceMessage={androidDeviceMessage}
          androidInstallState={androidInstallState}
          androidInstallMessage={androidInstallMessage}
          androidInstallSnapshot={androidInstallSnapshot}
          aiConnectionTestState={aiConnectionTestState}
          aiConnectionTestMessage={aiConnectionTestMessage}
          onFormChange={setSetupForm}
          onTestAiConnection={handleTestAiConnection}
          onRefreshAndroidInstallDevices={refreshAndroidInstallDevices}
          onInstallAndroidApp={handleInstallAndroidApp}
          onSetAndroidDeviceRole={handleSetAndroidDeviceRole}
          onSetAndroidDevicePermissionGroups={handleSetAndroidDevicePermissionGroups}
          onSetAndroidDeviceActive={handleSetAndroidDeviceActive}
          onResetAndroidDevicePermissions={handleResetAndroidDevicePermissions}
          onRevokeAndroidDevice={handleRevokeAndroidDevice}
          onSave={handleSaveSetup}
          onAppPasswordConfiguredChange={handleAppPasswordConfiguredChange}
          uiPreferences={uiPreferences}
          onUiPreferencesChange={setUiPreferences}
          settingsSaveRef={settingsSaveRef}
          onSettingsSaveStateChange={onSettingsSaveStateChange}
          onDashboardRefresh={onDashboardRefresh}
        />
      )}
      <div className={activePage === "messages" ? "persistent-messages-page" : "persistent-messages-page is-hidden"} aria-hidden={activePage !== "messages"}>
        {persistentMessagesPage}
      </div>
    </>
  );
}
