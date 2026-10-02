import { RoomCategoryControl, RoomFiltersToolbar, RoomsWorkspace } from "../pension/RoomsWorkspace";
import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  BUSINESS_CAPABILITIES,
  getReservationDomain,
  isReservationTypeAvailable
} from "@yardimci-asistan/shared";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type { DesktopDashboardData } from "../../../electron/database";
import { runtimeHasCapability } from "../../app/capabilities";
import { useDashboardAi } from "../../app/use-dashboard-ai";
import { useKbsNotificationController } from "../../app/use-kbs-notification-controller";
import type { DesktopPage, CustomerWorkTab } from "../../app/navigation";
import type { RegisterPageLeaveGuard, RequestPageChange } from "../../app/page-navigation-guard";
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
  FinanceController,
  MenuController,
  MarketController,
  MessagingController,
  OperationController,
  SetupController
} from "../../app/controller-types";
import type { UiPreferences } from "../../ui-preferences";
import { CustomerMessagesWorkspace } from "../customers/CustomerMessagesWorkspace";
import { CustomersWorkspace } from "../customers/CustomersWorkspace";
import { KbsAutomationWorkspace } from "../customers/KbsAutomationWorkspace";
import { RequestsWorkspace, getRequestStatusTone, isRequestWaitingForReply } from "../customers/RequestsWorkspace";
import { WhatsAppWorkspace } from "../messages/MessageWorkspaces";
import { MenuManager } from "../menu/MenuManager";
import { RestaurantReservationsWorkspace } from "../operations/RestaurantReservationsWorkspace";
import {
  DailyTasksWorkspace,
  ReservationsWorkspace,
  formatTaskDue
} from "../operations/OperationWorkspaces";
import { SettingsWorkspace } from "../settings/SettingsWorkspace";
import { CustomerWorkPage } from "../../pages/CustomerWorkPage";
import { DashboardPage } from "../../pages/DashboardPage";
import { MarketPage } from "../../pages/MarketPage";
import { OperationCalendarPage } from "../../pages/OperationCalendarPage";
import { useCalendarPageController } from "../calendar/calendar-page-state";
import { usePensionPageController } from "../pension/pension-page-state";
import { useRestaurantPageController } from "../restaurant/restaurant-page-state";
import { PensionPage } from "../../pages/PensionPage";
import { ReportsPage } from "../../pages/ReportsPage";
import { RestaurantPage } from "../../pages/RestaurantPage";
import { useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";

interface DesktopWorkspaceRouterProps {
  activePage: DesktopPage;
  requestPageChange: RequestPageChange;
  customerWorkTab: CustomerWorkTab;
  setCustomerWorkTab: Dispatch<SetStateAction<CustomerWorkTab>>;
  registerPageLeaveGuard: RegisterPageLeaveGuard;
  syncState: SyncState;
  setSyncState: Dispatch<SetStateAction<SyncState>>;
  setStatusMessage: Dispatch<SetStateAction<string>>;
  setupController: SetupController;
  appLockController: AppLockController;
  desktopSyncController: DesktopSyncController;
  menuController: MenuController;
  messagingController: MessagingController;
  customerController: CustomerController;
  marketController: MarketController;
  financeController: FinanceController;
  operationController: OperationController;
  deviceController: DeviceController;
  uiPreferences: UiPreferences;
  setUiPreferences: Dispatch<SetStateAction<UiPreferences>>;
  surfaceData: DesktopDashboardData;
  onDashboardRefresh: () => Promise<unknown>;
}

export function DesktopWorkspaceRouter({
  activePage,
  requestPageChange,
  customerWorkTab,
  setCustomerWorkTab,
  registerPageLeaveGuard,
  syncState,
  setSyncState,
  setStatusMessage,
  setupController,
  appLockController,
  desktopSyncController,
  menuController,
  messagingController,
  customerController,
  marketController,
  financeController,
  operationController,
  deviceController,
  uiPreferences,
  setUiPreferences,
  surfaceData,
  onDashboardRefresh
}: DesktopWorkspaceRouterProps) {
  const {
    setupData,
    saveSetup
  } = setupController;
  const { setPasswordConfigured: handleAppPasswordConfiguredChange } = appLockController;
  const {
    dashboardData,
    setDashboardData,
    businessCapabilities,
    loadBusinessCapabilities,
    automaticSyncStatus,
    pullRequests
  } = desktopSyncController;
  const {
    menuEditState,
    menuEditMessage,
    selectedCategoryId,
    selectedItemId,
    itemForm,
    setItemForm,
    selectCategory,
    selectItem,
    startNewItem,
    saveCategoryForm: handleSaveCategoryForm,
    saveItem: handleSaveItem,
    reorderCategories: handleReorderMenuCategories,
    reorderItems: handleReorderMenuItems,
    deleteCategoryById: handleDeleteMenuCategoryById,
    openMenuPreview
  } = menuController;
  const {
    setSelectedWhatsAppRequestId,
    readyWhatsAppRequests,
    selectedWhatsAppRequest,
    selectedWhatsAppMessage,
    selectedWhatsAppUrl,
    suggestingRequestId,
    aiState,
    aiMessage,
    openWhatsApp,
    openReservationWhatsApp,
    prepareBirthdayWhatsApp,
    birthdayPreparingId,
    openSelectedWhatsAppExternal,
    handleWhatsAppMessageSent,
    handleDeleteWhatsAppMessage,
    handleCreateOwnerReplySuggestion,
    handleRewriteRequestReply,
  } = messagingController;
  const {
    manualRequestForm,
    setManualRequestForm,
    manualRequestState,
    setSelectedRequestId,
    selectedRequest,
    convertingRequestId,
    handleCreateManualRequest,
    handleConvertRequestToReservation,
    handleUpdateRequestStatus,
    handleDeleteRequest,
    handleDeleteCustomer,
    handleSaveCustomer,
    handleAnalyzeIdentityImage
  } = customerController;
  const {
    handleSaveManualReservation,
    handleSaveManualRestaurantReservation,
    handleUpdateTableStatus,
    handleUpdateReservationStatus,
    handleSaveDailyTask,
    handleDeleteDailyTask,
    handleUpdateDailyTaskStatus
  } = operationController;
  const {
    androidDeviceState,
    androidInstallState,
    androidInstallSnapshot,
    refreshAndroidInstallDevices,
    handleInstallAndroidApp,
    handleProvisionAndroidApp,
    handleSetAndroidDeviceRole,
    handleSetAndroidDeviceActive,
    handleResetAndroidDevicePermissions,
    handleRevokeAndroidDevice
  } = deviceController;

  const pensionController = usePensionPageController();
  const restaurantController = useRestaurantPageController();
  const calendarController = useCalendarPageController();
  const workspaceNavigation = useWorkspaceNavigation();
  const C = BUSINESS_CAPABILITIES;
  const enabledCapabilities = businessCapabilities?.enabledCapabilities ?? [];
  const customersEnabled = runtimeHasCapability(businessCapabilities, C.CUSTOMERS);
  const requestsEnabled = runtimeHasCapability(businessCapabilities, C.REQUESTS);
  const tasksEnabled = runtimeHasCapability(businessCapabilities, C.TASKS);
  const aiEnabled = runtimeHasCapability(businessCapabilities, C.AI);
  const whatsappEnabled = runtimeHasCapability(businessCapabilities, C.WHATSAPP);
  const dashboardAi = useDashboardAi(aiEnabled);
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
  const pensionReservations = surfaceData.reservations.filter((reservation) => {
    const domain = getReservationDomain(reservation.reservationType, {
      roomIds: reservation.roomIds,
      tableIds: reservation.tableIds
    });
    return domain === "accommodation" || domain === "mixed" || domain === "generic";
  });
  const [selectedKbsCustomerId, setSelectedKbsCustomerId] = useState("");
  const [kbsEgmSessionRequest, setKbsEgmSessionRequest] = useState(0);
  const [kbsSessionRetryNotificationId, setKbsSessionRetryNotificationId] = useState("");
  const kbsController = useKbsNotificationController({
    setDashboardData,
    setSyncState,
    setStatusMessage
  });

  const surfaceSelectedRequest = surfaceData.requests.find((request) => request.id === selectedRequest?.id)
    ?? surfaceData.requests[0];
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
    setCustomerWorkTab(requestsEnabled ? "requests" : "customers");
    requestPageChange("customerWork");
  }

  function openDashboardReply(request: SyncedCustomerRequest) {
    openDashboardCustomerWork(request);
  }

  async function handleCustomerRowKbs(notificationId: string, customerId: string) {
    const result = await kbsController.send(notificationId);
    if (!result || result.state !== "interaction_required") return;

    setSelectedKbsCustomerId(customerId);
    setCustomerWorkTab("kbs");
    if (surfaceData.kbsOverview.provider === "egm") {
      setKbsSessionRetryNotificationId(notificationId);
      setKbsEgmSessionRequest((value) => value + 1);
    }
  }

  function openAssignedReservationWorkspace(
    reservation: DesktopDashboardData["reservations"][number],
    returnPage: DesktopPage
  ) {
    const domain = getReservationDomain(reservation.reservationType, {
      roomIds: reservation.roomIds,
      tableIds: reservation.tableIds
    });
    const roomId = reservation.roomIds.length === 1 ? reservation.roomIds[0] : "";
    if (
      roomId
      && roomsEnabled
      && (domain === "accommodation" || domain === "mixed" || domain === "generic")
      && surfaceData.rooms.some((room) => room.id === roomId)
    ) {
      return workspaceNavigation.openWorkspace({
        entityType: "room",
        entityId: roomId,
        mode: "stay",
        reservationId: reservation.id,
        customerId: reservation.customerId,
        returnContext: { page: returnPage, entityId: reservation.id }
      });
    }

    const tableId = reservation.tableIds.length === 1 ? reservation.tableIds[0] : "";
    if (
      tableId
      && tablesEnabled
      && (domain === "food_service" || domain === "mixed" || domain === "generic")
      && surfaceData.tables.some((table) => table.id === tableId)
    ) {
      return workspaceNavigation.openWorkspace({
        entityType: "table",
        entityId: tableId,
        mode: "customer",
        returnContext: { page: returnPage, entityId: reservation.id }
      });
    }
    return false;
  }

  function openReservationList(reservation: DesktopDashboardData["reservations"][number]) {
    const domain = getReservationDomain(reservation.reservationType, {
      roomIds: reservation.roomIds,
      tableIds: reservation.tableIds
    });
    if ((domain === "food_service" || (domain === "generic" && !accommodationReservationsEnabled))
        && foodReservationsEnabled) {
      requestPageChange("restaurant");
      return;
    }
    if (accommodationReservationsEnabled) {
      requestPageChange("pension");
      return;
    }
    setSyncState("error");
    setStatusMessage("Bu rezervasyon için etkin bir operasyon alanı bulunmuyor.");
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
    if (openAssignedReservationWorkspace(reservation, activePage)) return;
    openReservationList(reservation);
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
    if (openAssignedReservationWorkspace(reservation, "dashboard")) return;
    openReservationList(reservation);
  }

  async function handleSaveSetup(input: import("../../../electron/database").SaveInitialSetupInput) {
    const result = await saveSetup(input, setDashboardData);
    if (result.ok) {
      try {
        await loadBusinessCapabilities();
      } catch {
        return { ...result, refreshWarning: "Ayarlar kaydedildi; işletme yetenekleri yenilenemedi. Sayfayı yeniden açın." };
      }
    }
    return result;
  }

  return (
    <>
      {activePage === "dashboard" ? (
        <DashboardPage
          data={surfaceData}
          setupData={setupData}
          automaticSyncStatus={automaticSyncStatus}
          features={runtimeFeatures}
          aiEnabled={aiEnabled}
          customersEnabled={customersEnabled}
          requestsEnabled={requestsEnabled}
          tasksEnabled={tasksEnabled}
          calendarEnabled={runtimeHasCapability(businessCapabilities, C.CALENDAR)}
          reservationsEnabled={accommodationReservationsEnabled || foodReservationsEnabled}
          availableRoomCount={surfaceData.rooms.filter((room) => getRoomDisplayInfo(room, surfaceData.reservations, surfaceData.customerRoomStays).status === "available").length}
          onReplyRequest={openDashboardReply}
          onOpenCustomerWork={openDashboardCustomerWork}
          onOpenKbs={() => {
            setSelectedKbsCustomerId("");
            setCustomerWorkTab("kbs");
            requestPageChange("customerWork");
          }}
          onOpenReservation={openDashboardReservation}
          onCompleteTask={(taskId) => handleUpdateDailyTaskStatus(taskId, "done")}
          dailyAiState={dashboardAi.state}
          dailyAiMessage={dashboardAi.message}
          dailyAiContent={dashboardAi.content}
          dailyAiFallback={dashboardAi.fallback}
          onGenerateDailyAi={() => void dashboardAi.generateDailyEvaluation()}
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
          controller={calendarController}
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
          whatsappEnabled={customerMessagingEnabled}
          kbsEnabled={surfaceData.kbsOverview.enabled}
          activeTab={customerWorkTab}
          onTabChange={setCustomerWorkTab}
          requests={(
            <RequestsWorkspace
              requests={surfaceData.requests}
              selectedRequest={surfaceSelectedRequest}
              aiEnabled={aiEnabled}
              whatsappEnabled={whatsappEnabled}
              enabledCapabilities={enabledCapabilities}
              convertingRequestId={convertingRequestId}
              suggestingRequestId={suggestingRequestId}
              aiState={aiState}
              aiMessage={aiMessage}
              manualRequestForm={manualRequestForm}
              manualRequestState={manualRequestState}
                  onSelectRequest={setSelectedRequestId}
              onManualRequestFormChange={setManualRequestForm}
              onCreateManualRequest={handleCreateManualRequest}
              onWhatsApp={openWhatsApp}
              onConvert={handleConvertRequestToReservation}
              onSuggest={handleCreateOwnerReplySuggestion}
              onRewrite={handleRewriteRequestReply}
              onUpdateStatus={handleUpdateRequestStatus}
              onOpenReservation={openRequestReservation}
              onDelete={handleDeleteRequest}
            />
          )}
          customers={(
            <CustomersWorkspace
              customers={surfaceData.customers}
              stays={surfaceData.customerRoomStays}
              reservations={surfaceData.reservations}
              notifications={surfaceData.hospitalityNotifications}
              kbsOverview={surfaceData.kbsOverview}
              aiEnabled={aiEnabled}
              onSave={handleSaveCustomer}
              onAnalyzeIdentity={handleAnalyzeIdentityImage}
              onDelete={handleDeleteCustomer}
              onSendKbs={handleCustomerRowKbs}
            />
          )}
          kbs={(
            <KbsAutomationWorkspace
              data={surfaceData}
              selectedCustomerId={selectedKbsCustomerId}
              controller={kbsController}
              egmSessionRequest={kbsEgmSessionRequest}
              sessionRetryNotificationId={kbsSessionRetryNotificationId}
              onSessionRetryConsumed={() => setKbsSessionRetryNotificationId("")}
            />
          )}
          messages={(
            <CustomerMessagesWorkspace
              whatsappEnabled={customerMessagingEnabled}
              prewarmWebview={setupData.birthdaySettings.enabled && setupData.birthdaySettings.mode === "automatic" && customerMessagingEnabled}
              active={activePage === "customerWork" && customerWorkTab === "prepared"}
              safeMode={(onOpenWeb) => (
                <WhatsAppWorkspace
                  view="safe"
                  preparedMessage={messagingController.preparedWhatsAppMessage}
                  requests={readyWhatsAppRequests}
                  selectedRequest={selectedWhatsAppRequest}
                  selectedMessage={selectedWhatsAppRequest || messagingController.preparedWhatsAppMessage ? selectedWhatsAppMessage : ""}
                  selectedUrl={selectedWhatsAppRequest || messagingController.preparedWhatsAppMessage ? selectedWhatsAppUrl : ""}
                  getRequestStatusTone={getRequestStatusTone}
                  onSelectRequest={setSelectedWhatsAppRequestId}
                  onOpenExternal={openSelectedWhatsAppExternal}
                  onOpenWeb={onOpenWeb}
                  onMessageSent={handleWhatsAppMessageSent}
                  onDeleteMessage={handleDeleteWhatsAppMessage}
                />
              )}
              webMode={(onReturnToSafe) => (
                <WhatsAppWorkspace
                  view="web"
                  preparedMessage={messagingController.preparedWhatsAppMessage}
                  requests={readyWhatsAppRequests}
                  selectedRequest={selectedWhatsAppRequest}
                  selectedMessage={selectedWhatsAppRequest || messagingController.preparedWhatsAppMessage ? selectedWhatsAppMessage : ""}
                  selectedUrl={selectedWhatsAppRequest || messagingController.preparedWhatsAppMessage ? selectedWhatsAppUrl : ""}
                  getRequestStatusTone={getRequestStatusTone}
                  onSelectRequest={setSelectedWhatsAppRequestId}
                  onOpenExternal={openSelectedWhatsAppExternal}
                  onReturnToSafe={onReturnToSafe}
                  onMessageSent={handleWhatsAppMessageSent}
                  onDeleteMessage={handleDeleteWhatsAppMessage}
                />
              )}
            />
          )}
        />
      ) : activePage === "pension" ? (
        <PensionPage
          controller={pensionController}
          reservationsEnabled={accommodationReservationsEnabled}
          tasksEnabled={tasksEnabled}
          reservations={accommodationReservationsEnabled ? (
            <ReservationsWorkspace
              reservations={pensionReservations}
              rooms={surfaceData.rooms}
              customers={surfaceData.customers}
              whatsappEnabled={customerMessagingEnabled}
              onSaveCustomer={handleSaveCustomer}
              onSaveManual={handleSaveManualReservation}
              onUpdateStatus={handleUpdateReservationStatus}
              onOpenWhatsApp={openReservationWhatsApp}
            />
          ) : null}
          roomTitleControl={<RoomCategoryControl data={surfaceData} />}
          roomToolbar={(
            <RoomFiltersToolbar
              data={surfaceData}
              folioEnabled={accommodationFolioEnabled}
              reservationsEnabled={accommodationReservationsEnabled}
              staysEnabled={accommodationStaysEnabled}
            />
          )}
          rooms={(
            <RoomsWorkspace
              data={surfaceData}
              onDashboard={setDashboardData}
              folioEnabled={accommodationFolioEnabled}
              reservationsEnabled={accommodationReservationsEnabled}
              staysEnabled={accommodationStaysEnabled}
            />
          )}
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
          controller={restaurantController}
          data={surfaceData}
          reservationsEnabled={foodReservationsEnabled}
          onUpdateTableStatus={handleUpdateTableStatus}
          ordersEnabled={foodOrdersEnabled}
          menuEnabled={foodMenuEnabled}
          tasksEnabled={tasksEnabled}
          onDashboardDataChanged={setDashboardData}
          reservations={foodReservationsEnabled ? (
            <RestaurantReservationsWorkspace
              customersEnabled={customersEnabled}
              reservations={surfaceData.reservations}
              accommodationReservationsEnabled={accommodationReservationsEnabled}
              customers={surfaceData.customers}
              tables={surfaceData.tables}
              whatsappEnabled={customerMessagingEnabled}
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
          itemForm={itemForm}
          selectedCategoryId={selectedCategoryId}
          selectedItemId={selectedItemId}
          menuEditState={menuEditState}
          menuEditMessage={menuEditMessage}
          onItemFormChange={setItemForm}
          onSelectCategory={selectCategory}
          onSelectItem={selectItem}
          onNewItem={startNewItem}
          onSaveCategoryForm={handleSaveCategoryForm}
          onSaveItem={handleSaveItem}
          onReorderCategories={handleReorderMenuCategories}
          onReorderItems={handleReorderMenuItems}
          onDeleteCategoryById={handleDeleteMenuCategoryById}
          onPreview={openMenuPreview}
        />
      ) : activePage === "reports" ? (
        <ReportsPage
          aiEnabled={aiEnabled}
          financeEnabled={runtimeHasCapability(businessCapabilities, C.FINANCE)}
          financeController={financeController}
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
        <MarketPage customers={dashboardData.customers} controller={marketController} />
      ) : (
        <SettingsWorkspace
          setupData={setupData}
          dashboardData={surfaceData}
          androidDeviceState={androidDeviceState}
          androidInstallState={androidInstallState}
          androidInstallSnapshot={androidInstallSnapshot}
          onRefreshAndroidInstallDevices={refreshAndroidInstallDevices}
          onInstallAndroidApp={handleInstallAndroidApp}
          onProvisionAndroidApp={handleProvisionAndroidApp}
          onSetAndroidDeviceRole={handleSetAndroidDeviceRole}
          onSetAndroidDeviceActive={handleSetAndroidDeviceActive}
          onResetAndroidDevicePermissions={handleResetAndroidDevicePermissions}
          onRevokeAndroidDevice={handleRevokeAndroidDevice}
          onSave={handleSaveSetup}
          onAppPasswordConfiguredChange={handleAppPasswordConfiguredChange}
          uiPreferences={uiPreferences}
          onUiPreferencesChange={setUiPreferences}
          onDashboardRefresh={onDashboardRefresh}
          registerPageLeaveGuard={registerPageLeaveGuard}
        />
      )}
    </>
  );
}
