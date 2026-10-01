import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Eye, LockKeyhole, ScrollText, UploadCloud } from "lucide-react";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import { runtimeHasCapability } from "../../app/capabilities";
import type { DesktopPage, CustomerWorkTab } from "../../app/navigation";
import type { RequestPageChange } from "../../app/page-navigation-guard";
import { buildNavigation, getPageContentScroll, getPageMeta } from "../../app/navigation";
import { buildDesktopNotifications, type DesktopNotificationItem } from "../../app/notifications";
import {
  readSidebarCollapsedPreference,
  saveSidebarCollapsedPreference,
  type SyncState
} from "../../app/runtime-state";
import type {
  AppLockController,
  CustomerController,
  DesktopSyncController,
  MenuController,
  MarketController,
  MessagingController,
  OperationController,
  SetupController
} from "../../app/controller-types";
import type { DesktopDashboardData } from "../../../electron/database";
import { AppShell } from "../layout/AppShell";
import { PageHeader } from "../layout/PageHeader";
import { GlobalMessageBar, type GlobalMessageTone } from "../layout/GlobalMessageBar";
import { SyncStatusIndicator } from "../layout/SyncStatusIndicator";
import { Sidebar } from "../layout/Sidebar";
import { LocalMenuPreview } from "../menu/MenuPreview";
import { NotificationCenter } from "../notifications/NotificationCenter";
import { DiagnosticsViewer } from "../diagnostics/DiagnosticsViewer";
import { customerWorkspaceDefinition, menuItemWorkspaceDefinition, productWorkspaceDefinition, roomWorkspaceDefinition, tableWorkspaceDefinition, workspaceDefinitions } from "../../app/workspace-definitions";
import { HospitalityWorkspaceHost, WorkspaceHost, WorkspaceNavigationProvider, useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";

interface DesktopAppFrameProps {
  activePage: DesktopPage;
  requestPageChange: RequestPageChange;
  setCustomerWorkTab: Dispatch<SetStateAction<CustomerWorkTab>>;
  surfaceData: DesktopDashboardData;
  syncState: SyncState;
  statusMessage: string;
  setupController: SetupController;
  appLockController: AppLockController;
  desktopSyncController: DesktopSyncController;
  menuController: MenuController;
  messagingController: MessagingController;
  customerController: CustomerController;
  operationController: OperationController;
  marketController: MarketController;
  children: ReactNode;
}

const OFFLINE_SYNC_MESSAGE = "İnternet bağlantısı yok. Yerel işlemler devam ediyor; eşitleme bağlantı gelince yapılacak.";

export function DesktopAppFrame(props: DesktopAppFrameProps) {
  return <WorkspaceNavigationProvider definitions={workspaceDefinitions} page={props.activePage} onReturnPage={props.requestPageChange}>
    <DesktopAppFrameContent {...props} />
  </WorkspaceNavigationProvider>;
}

function DesktopAppFrameContent({
  activePage,
  requestPageChange,
  setCustomerWorkTab,
  surfaceData,
  syncState,
  statusMessage,
  setupController,
  appLockController,
  desktopSyncController,
  menuController,
  messagingController,
  customerController,
  operationController,
  marketController,
  children
}: DesktopAppFrameProps) {
  const contentRef = useRef<HTMLElement>(null);
  const { hospitalitySessions } = useWorkspaceNavigation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsedPreference);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const { setupData } = setupController;
  const { lockApp } = appLockController;
  const {
    dashboardData,
    businessCapabilities,
    automaticSyncStatus,
    pullRequests: handlePullRequests
  } = desktopSyncController;
  const {
    menuPublishState,
    menuStatusMessage,
    menuPreviewOpen,
    menuPreviewData,
    publishMenu: handlePublishMenu,
    openMenuPreview,
    closeMenuPreview
  } = menuController;
  const { setSelectedRequestId } = customerController;
  const navigationItems = useMemo(() => buildNavigation(businessCapabilities), [businessCapabilities]);
  const pageMeta = getPageMeta(activePage, businessCapabilities);
  const desktopNotifications = useMemo(
    () => buildDesktopNotifications(
      dashboardData,
      automaticSyncStatus,
      businessCapabilities?.enabledCapabilities ?? []
    ),
    [automaticSyncStatus, businessCapabilities, dashboardData]
  );
  const whatsappEnabled = runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.WHATSAPP);
  const customersEnabled = runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.CUSTOMERS);
  const aiEnabled = runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.AI);
  const menuEnabled = runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.FOOD_MENU);
  const notificationsEnabled = runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.NOTIFICATIONS);
  const qrMenuEnabled = runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.QR_MENU);
  const inventoryEnabled = runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.INVENTORY);
  const accommodationStaysEnabled = runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.ACCOMMODATION_STAYS);
  const accommodationReservationsEnabled = runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.ACCOMMODATION_RESERVATIONS);
  const accommodationFolioEnabled = runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.ACCOMMODATION_FOLIO);
  const foodReservationsEnabled = runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.FOOD_RESERVATIONS);
  const foodOrdersEnabled = runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.FOOD_ORDERS);
  const hospitalityWorkspaceActive = activePage === "pension"
    ? Boolean(hospitalitySessions.pension)
    : activePage === "restaurant"
      ? Boolean(hospitalitySessions.restaurant)
      : false;
  const automaticSyncNeedsAttention = automaticSyncStatus.phase === "offline" || automaticSyncStatus.phase === "error";
  const operationNotice = syncState !== "idle" && statusMessage.trim()
    ? {
        tone: syncState === "error"
          ? "error" as GlobalMessageTone
          : syncState === "success"
            ? "success" as GlobalMessageTone
            : "loading" as GlobalMessageTone,
        message: statusMessage.trim()
      }
    : null;
  const menuNotice = activePage === "menu" && menuPublishState !== "idle" && menuStatusMessage.trim()
    ? {
        tone: menuPublishState === "error"
          ? "error" as GlobalMessageTone
          : menuPublishState === "success"
            ? "success" as GlobalMessageTone
            : "loading" as GlobalMessageTone,
        message: menuStatusMessage.trim()
      }
    : null;
  const automaticSyncNotice = automaticSyncNeedsAttention
    ? {
        tone: "error" as GlobalMessageTone,
        message: automaticSyncStatus.phase === "offline"
          ? OFFLINE_SYNC_MESSAGE
          : automaticSyncStatus.message || "Web eşitleme işlemi tamamlanamadı. Bağlantı ayarlarını kontrol edin."
      }
    : null;
  const centralNotice = operationNotice?.tone === "error"
    ? operationNotice
    : menuNotice?.tone === "error"
      ? menuNotice
      : automaticSyncNotice
        ?? operationNotice
        ?? menuNotice;

  useEffect(() => {
    saveSidebarCollapsedPreference(sidebarCollapsed);
  }, [sidebarCollapsed]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    window.scrollTo(0, 0);
  }, [activePage]);

  useEffect(() => {
    if (!navigationItems.some((item) => item.id === activePage)) {
      requestPageChange("dashboard");
    }
  }, [activePage, navigationItems, requestPageChange]);

  function handleLockApp() {
    setDiagnosticsOpen(false);
    closeMenuPreview();
    void lockApp();
  }

  function openDiagnostics() {
    closeMenuPreview();
    setDiagnosticsOpen(true);
  }

  function handleSidebarNavigate(destination: DesktopPage) {
    if (destination === "customerWork") {
      setCustomerWorkTab("customers");
    }
    requestPageChange(destination);
  }

  function openDesktopNotification(item: DesktopNotificationItem) {
    if (item.kind === "request" && item.relatedId) {
      setSelectedRequestId(item.relatedId);
      setCustomerWorkTab("requests");
    }
    const destination = navigationItems.some((navigationItem) => navigationItem.id === item.destination)
      ? item.destination
      : "dashboard";
    requestPageChange(destination);
  }


  return (
    <AppShell
      contentScroll={getPageContentScroll(activePage)}
      contentRef={contentRef}
      sidebarCollapsed={sidebarCollapsed}
      sidebar={(
        <Sidebar
          items={navigationItems}
          activePage={activePage}
          businessName={setupData.businessName}
          collapsed={sidebarCollapsed}
          onNavigate={handleSidebarNavigate}
          onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
        />
      )}
      header={(
        <PageHeader
          eyebrow={pageMeta.eyebrow}
          title={pageMeta.title}
          description={pageMeta.description}
          notice={centralNotice ? (
            <GlobalMessageBar
              tone={centralNotice.tone}
              message={centralNotice.message}
            />
          ) : undefined}
          action={(
            <div className="page-header-tools">
              {activePage === "menu" && (
                <>
                  <button className="action-button action-button-secondary action-button-sm secondary-sync-action" type="button" onClick={openMenuPreview}>
                    <Eye size={16} aria-hidden="true" />
                    Önizle
                  </button>
                  {qrMenuEnabled && (
                    <button className="action-button action-button-sm" type="button" onClick={handlePublishMenu} disabled={menuPublishState === "loading"}>
                      <UploadCloud size={16} aria-hidden="true" />
                      Web'e Yayınla
                    </button>
                  )}
                </>
              )}
              <SyncStatusIndicator
                automaticSyncStatus={automaticSyncStatus}
                onSync={() => void handlePullRequests()}
              />
              {notificationsEnabled && <NotificationCenter items={desktopNotifications} onOpen={openDesktopNotification} />}
              <button
                className="diagnostics-trigger"
                type="button"
                aria-label="Uygulama loglarını aç"
                title="Uygulama logları"
                aria-pressed={diagnosticsOpen}
                onClick={openDiagnostics}
              >
                <ScrollText size={18} aria-hidden="true" />
              </button>
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
      workspaceActive={hospitalityWorkspaceActive}
      workspaceLayer={(
        <>
          <HospitalityWorkspaceHost
            page="pension"
            activePage={activePage}
            definition={roomWorkspaceDefinition}
            context={{
              data: surfaceData,
              onDashboard: desktopSyncController.setDashboardData,
              staysEnabled: accommodationStaysEnabled,
              reservationsEnabled: accommodationReservationsEnabled,
              customersEnabled,
              aiEnabled,
              onSaveCustomer: customerController.handleSaveCustomer,
              onAnalyzeIdentity: customerController.handleAnalyzeIdentityImage,
              folioEnabled: accommodationFolioEnabled,
              menuEnabled,
              inventoryEnabled
            }}
          />
          <HospitalityWorkspaceHost
            page="restaurant"
            activePage={activePage}
            definition={tableWorkspaceDefinition}
            context={{
              data: surfaceData,
              ordersEnabled: foodOrdersEnabled,
              menuEnabled,
              inventoryEnabled,
              customersEnabled,
              reservationsEnabled: foodReservationsEnabled,
              roomFolioTransferEnabled: foodOrdersEnabled && accommodationFolioEnabled,
              onUpdateTableStatus: operationController.handleUpdateTableStatus,
              aiEnabled,
              onSaveCustomer: customerController.handleSaveCustomer,
              onAnalyzeIdentity: customerController.handleAnalyzeIdentityImage,
              onSaveReservation: operationController.handleSaveManualRestaurantReservation,
              onDashboardDataChanged: desktopSyncController.setDashboardData
            }}
          />
        </>
      )}
      overlay={(
        <>
          <WorkspaceHost definition={customerWorkspaceDefinition} context={{
            data: surfaceData,
            aiEnabled,
            whatsappEnabled,
            reservationsEnabled: runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.ACCOMMODATION_RESERVATIONS) || runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.FOOD_RESERVATIONS),
            staysEnabled: runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.ACCOMMODATION_STAYS),
            accommodationFolioEnabled,
            customerCreditEnabled: runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.CUSTOMER_CREDIT),
            onPreparedCreditWhatsApp: messagingController.openPreparedCreditWhatsApp,
            onWhatsApp: messagingController.openCustomerWhatsApp,
            onSave: customerController.handleSaveCustomer,
            onAnalyzeIdentity: customerController.handleAnalyzeIdentityImage,
            onDelete: customerController.handleDeleteCustomer
          }} />
          <WorkspaceHost definition={menuItemWorkspaceDefinition} context={{
            data: surfaceData,
            qrMenuEnabled,
            inventoryEnabled,
            onSave: menuController.saveItemForm,
            onDelete: menuController.deleteItemById
          }} />
          <WorkspaceHost definition={productWorkspaceDefinition} context={{
            products: marketController.products,
            categories: marketController.categories,
            inventoryEnabled,
            productDataEnabled: marketController.productDataEnabled,
            busy: marketController.dataState === "loading",
            onReload: marketController.reloadCatalog,
            onProductSaved: marketController.upsertProduct,
            onStateChange: marketController.handleStateChange
          }} />
          {diagnosticsOpen ? (
            <DiagnosticsViewer onClose={() => setDiagnosticsOpen(false)} />
          ) : menuEnabled && menuPreviewOpen ? (
            <LocalMenuPreview
              menu={menuPreviewData}
              setupData={setupData}
              webModuleUrl={dashboardData.webModuleUrl}
              whatsappEnabled={whatsappEnabled}
              qrMenuEnabled={qrMenuEnabled}
              inventoryEnabled={inventoryEnabled}
              onClose={closeMenuPreview}
            />
          ) : undefined}
        </>
      )}
    >
      {children}
    </AppShell>
  );
}
