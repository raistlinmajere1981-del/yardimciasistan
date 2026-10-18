import { usePageViewState } from "../../app/page-view-state";
import { Suspense, lazy, useState, type Dispatch, type SetStateAction } from "react";
import {
  BUSINESS_CAPABILITIES as C,
  getReservationDomain,
  isReservationTypeAvailable,
} from "@yardimci-asistan/shared";
import type { SyncedCustomerRequest } from "@yardimci-asistan/sync-core";
import type { DesktopDashboardData } from "../../../electron/database";
import { projectDesktopWorkspaceFeatures } from "../../app/desktop-workspace-features";
import { useMarketingScheduleStatus } from "../../app/use-marketing-schedule-status";
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
import { getRequestStatusTone, isRequestWaitingForReply } from "../customers/RequestsWorkspace";
import { formatTaskDue } from "../operations/task-due-format";
import { useCalendarPageController } from "../calendar/calendar-page-state";
import { usePensionPageController } from "../pension/pension-page-state";
import { useRestaurantPageController } from "../restaurant/restaurant-page-state";
import { useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import type { MarketView } from "../workspace/workspace-intent";
import { CustomerWorkRoute } from "./routes/CustomerWorkRoute";
import { PageLoadingFallback } from "./PageLoadingFallback";

const RoomCategoryControl = lazy(() => import("../pension/RoomsWorkspace").then(module => ({default: module.RoomCategoryControl})));
const RoomFiltersToolbar = lazy(() => import("../pension/RoomsWorkspace").then(module => ({default: module.RoomFiltersToolbar})));
const RoomsWorkspace = lazy(() => import("../pension/RoomsWorkspace").then(module => ({default: module.RoomsWorkspace})));
const MenuManager = lazy(() => import("../menu/MenuManager").then(module => ({default: module.MenuManager})));
const RestaurantReservationsWorkspace = lazy(() => import("../operations/RestaurantReservationsWorkspace").then(module => ({default: module.RestaurantReservationsWorkspace})));
const DailyTasksWorkspace = lazy(() => import("../operations/OperationWorkspaces").then(module => ({default: module.DailyTasksWorkspace})));
const ReservationsWorkspace = lazy(() => import("../operations/OperationWorkspaces").then(module => ({default: module.ReservationsWorkspace})));
const SettingsWorkspace = lazy(() => import("../settings/SettingsWorkspace").then(module => ({default: module.SettingsWorkspace})));
const DashboardPage = lazy(() => import("../../pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const MarketPage = lazy(() => import("../../pages/MarketPage").then((module) => ({ default: module.MarketPage })));
const MarketingPage = lazy(() => import("../../pages/MarketingPage").then((module) => ({ default: module.MarketingPage })));
const OperationCalendarPage = lazy(() => import("../../pages/OperationCalendarPage").then((module) => ({ default: module.OperationCalendarPage })));
const PensionPage = lazy(() => import("../../pages/PensionPage").then((module) => ({ default: module.PensionPage })));
const ReportsPage = lazy(() => import("../../pages/ReportsPage").then((module) => ({ default: module.ReportsPage })));
const RestaurantPage = lazy(() => import("../../pages/RestaurantPage").then((module) => ({ default: module.RestaurantPage })));

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
  surfaceData: DesktopDashboardData;
  onDashboardRefresh: () => Promise<unknown>;
}

export function DesktopWorkspaceRouter({
  activePage,
  requestPageChange,
  customerWorkTab,
  setCustomerWorkTab,
  registerPageLeaveGuard,
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
    saveSetupWithCapabilityRefresh,
    automaticSyncStatus
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
    openReservationWhatsApp,
    prepareBirthdayWhatsApp,
    birthdayPreparingId
  } = messagingController;
  const {
    setSelectedRequestId,
    handleSaveCustomer
  } = customerController;
  const {
    handleSaveManualReservation,
    handleAssignReservationRoom,
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
  const enabledCapabilities = businessCapabilities?.enabledCapabilities ?? [];
  const features = projectDesktopWorkspaceFeatures(businessCapabilities);
  const customersEnabled = features.customers;
  const requestsEnabled = features.requests;
  const tasksEnabled = features.tasks;
  const aiEnabled = features.ai;
  const whatsappEnabled = features.whatsapp;
  const roomsEnabled = features.accommodation.rooms;
  const accommodationReservationsEnabled = features.accommodation.reservations;
  const accommodationStaysEnabled = features.accommodation.stays;
  const accommodationFolioEnabled = features.accommodation.folio;
  const tablesEnabled = features.food.tables;
  const foodReservationsEnabled = features.food.reservations;
  const foodOrdersEnabled = features.food.orders;
  const foodMenuEnabled = features.food.menu;
  const inventoryEnabled = features.inventory;
  const customerMessagingEnabled = features.customerMessaging;
  const dashboardAi = useDashboardAi(aiEnabled);
  const pensionReservations = surfaceData.reservations.filter((reservation) => {
    const domain = getReservationDomain(reservation.reservationType, {
      roomIds: reservation.roomIds,
      tableIds: reservation.tableIds
    });
    return domain === "accommodation" || domain === "mixed" || domain === "generic";
  });
  const [selectedKbsCustomerId, setSelectedKbsCustomerId] = useState("");
  useMarketingScheduleStatus(enabledCapabilities.includes(C.MARKETING_STUDIO),setStatusMessage);
  const [marketView, setMarketView] = usePageViewState<MarketView>("market.view", "quickSale");
  const [kbsEgmSessionRequest, setKbsEgmSessionRequest] = useState(0);
  const [kbsSessionRetryNotificationId, setKbsSessionRetryNotificationId] = useState("");
  const kbsController = useKbsNotificationController({
    setDashboardData,
    setSyncState,
    setStatusMessage
  });

  const runtimeFeatures = {
    rooms: roomsEnabled,
    tables: tablesEnabled,
    qrMenu: features.qrMenu,
    whatsapp: whatsappEnabled,
    android: features.android
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
    return saveSetupWithCapabilityRefresh(() => saveSetup(input, setDashboardData));
  }

  return (
    <>
      <Suspense fallback={<PageLoadingFallback />}>
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
          calendarEnabled={features.calendar}
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
          onCompleteTask={(taskId) => void handleUpdateDailyTaskStatus(taskId, "done")}
          dailyAiState={dashboardAi.state}
          dailyAiMessage={dashboardAi.message}
          dailyAiContent={dashboardAi.content}
          dailyAiFallback={dashboardAi.fallback}
          onGenerateDailyAi={() => void dashboardAi.generateDailyEvaluation()}
          onPrepareBirthday={(customerId) => void prepareBirthdayWhatsApp(customerId)}
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
          marketingEnabled={enabledCapabilities.includes(C.MARKETING_STUDIO)}
          onMessage={setStatusMessage}
          registerPageLeaveGuard={registerPageLeaveGuard}
          controller={calendarController}
          data={surfaceData}
          accommodationReservationsEnabled={accommodationReservationsEnabled}
          foodReservationsEnabled={foodReservationsEnabled}
          tasksEnabled={tasksEnabled}
          onOpenReservation={openDashboardReservation}
          onCompleteTask={(taskId) => void handleUpdateDailyTaskStatus(taskId, "done")}
        />
      ) : activePage === "customerWork" ? null : activePage === "pension" ? (
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
              onAssignRoom={handleAssignReservationRoom}
              onUpdateStatus={(reservationId, status) => void handleUpdateReservationStatus(reservationId, status)}
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
              onUpdateStatus={(taskId, status) => void handleUpdateDailyTaskStatus(taskId, status)}
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
              onUpdateStatus={(reservationId, status) => void handleUpdateReservationStatus(reservationId, status)}
              onOpenWhatsApp={openReservationWhatsApp}
            />
          ) : null}
          tasks={(
            <DailyTasksWorkspace
              scope="restaurant"
              tasks={surfaceData.dailyTasks.filter((task) => isRestaurantTask(task, surfaceData.reservations))}
              onSave={handleSaveDailyTask}
              onDelete={handleDeleteDailyTask}
              onUpdateStatus={(taskId, status) => void handleUpdateDailyTaskStatus(taskId, status)}
            />
          )}
        />
      ) : activePage === "menu" ? (
        <MenuManager
          products={marketController.products}
          catalogCategories={marketController.categories}
          onCatalogReload={marketController.reloadCatalog}
          dashboardData={surfaceData}
          qrMenuEnabled={runtimeFeatures.qrMenu}
          inventoryEnabled={inventoryEnabled}
          stockImageImportEnabled={aiEnabled && inventoryEnabled}
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
          onDashboardDataChanged={setDashboardData}
          onPreview={() => void openMenuPreview()}
        />
      ) : activePage === "reports" ? (
        <ReportsPage
          aiEnabled={aiEnabled}
          financeEnabled={features.finance}
          financeController={financeController}
          reportsEnabled={features.reports}
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
      ) : activePage === "marketing" ? (
        <MarketingPage enabled={enabledCapabilities.includes(C.MARKETING_STUDIO)} registerPageLeaveGuard={registerPageLeaveGuard} onMessage={setStatusMessage} onCalendar={() => requestPageChange("calendar")} />

      ) : activePage === "market" ? (
        <MarketPage
          customers={dashboardData.customers}
          controller={marketController}
          activeView={marketView}
          onViewChange={setMarketView}
          onDashboardDataChanged={setDashboardData}
        />
      ) : (
        <SettingsWorkspace
          setupData={setupData}
          dashboardData={surfaceData}
          androidDeviceState={androidDeviceState}
          androidInstallState={androidInstallState}
          androidInstallSnapshot={androidInstallSnapshot}
          onRefreshAndroidInstallDevices={() => void refreshAndroidInstallDevices()}
          onInstallAndroidApp={(serial) => void handleInstallAndroidApp(serial)}
          onProvisionAndroidApp={(serial) => void handleProvisionAndroidApp(serial)}
          onSetAndroidDeviceRole={handleSetAndroidDeviceRole}
          onSetAndroidDeviceActive={handleSetAndroidDeviceActive}
          onResetAndroidDevicePermissions={handleResetAndroidDevicePermissions}
          onRevokeAndroidDevice={(device) => void handleRevokeAndroidDevice(device)}
          onSave={handleSaveSetup}
          onAppPasswordConfiguredChange={handleAppPasswordConfiguredChange}
          onDashboardRefresh={onDashboardRefresh}
          registerPageLeaveGuard={registerPageLeaveGuard}
        />
      )}
      </Suspense>
      <CustomerWorkRoute
        activePage={activePage}
        activeTab={customerWorkTab}
        onTabChange={setCustomerWorkTab}
        surfaceData={surfaceData}
        enabledCapabilities={enabledCapabilities}
        features={features}
        customerController={customerController}
        messagingController={messagingController}
        selectedKbsCustomerId={selectedKbsCustomerId}
        kbsEgmSessionRequest={kbsEgmSessionRequest}
        kbsSessionRetryNotificationId={kbsSessionRetryNotificationId}
        onSessionRetryConsumed={() => setKbsSessionRetryNotificationId("")}
        kbsController={kbsController}
        onSendKbs={handleCustomerRowKbs}
        onOpenRequestReservation={openRequestReservation}
      />
    </>
  );
}
