import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Eye, LockKeyhole, RefreshCw, ScrollText, UploadCloud } from "lucide-react";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import { runtimeHasCapability } from "../../app/capabilities";
import type { DesktopPage } from "../../app/navigation";
import { buildNavigation, getPageMeta } from "../../app/navigation";
import { buildDesktopNotifications, type DesktopNotificationItem } from "../../app/notifications";
import {
  automaticSyncTone,
  readSidebarCollapsedPreference,
  saveSidebarCollapsedPreference,
  type SyncState
} from "../../app/runtime-state";
import type {
  AppLockController,
  CustomerController,
  DesktopSyncController,
  MenuController,
  MessagingController,
  SetupController
} from "../../app/controller-types";
import { AppShell } from "../layout/AppShell";
import { PageHeader } from "../layout/PageHeader";
import { Sidebar } from "../layout/Sidebar";
import { LocalMenuPreview } from "../menu/MenuPreview";
import { NotificationCenter } from "../notifications/NotificationCenter";
import { DiagnosticsViewer } from "../diagnostics/DiagnosticsViewer";
import { roomWorkspaceDefinition, workspaceDefinitions } from "../../app/workspace-definitions";
import { projectDesktopDashboardData } from "../../app/capability-projection";
import { WorkspaceHost, WorkspaceNavigationProvider } from "../workspace/WorkspaceNavigation";

interface DesktopAppFrameProps {
  activePage: DesktopPage;
  setActivePage: Dispatch<SetStateAction<DesktopPage>>;
  syncState: SyncState;
  statusMessage: string;
  setupController: SetupController;
  appLockController: AppLockController;
  desktopSyncController: DesktopSyncController;
  menuController: MenuController;
  messagingController: MessagingController;
  customerController: CustomerController;
  children: ReactNode;
}

const OFFLINE_SYNC_MESSAGE = "İnternet bağlantısı yok. Yerel işlemler devam ediyor; eşitleme bağlantı gelince yapılacak.";

export function DesktopAppFrame(props: DesktopAppFrameProps) {
  return <WorkspaceNavigationProvider definitions={workspaceDefinitions} page={props.activePage} onReturnPage={props.setActivePage}>
    <DesktopAppFrameContent {...props} />
  </WorkspaceNavigationProvider>;
}

function DesktopAppFrameContent({
  activePage,
  setActivePage,
  syncState,
  statusMessage,
  setupController,
  appLockController,
  desktopSyncController,
  menuController,
  messagingController,
  customerController,
  children
}: DesktopAppFrameProps) {
  const contentRef = useRef<HTMLElement>(null);
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
  const { selectedWhatsAppRequest } = messagingController;
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
  const customerMessagingEnabled = whatsappEnabled && customersEnabled;
  const menuEnabled = runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.FOOD_MENU);
  const notificationsEnabled = runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.NOTIFICATIONS);
  const qrMenuEnabled = runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.QR_MENU);
  const inventoryEnabled = runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.INVENTORY);
  const syncDisplayMessage = automaticSyncStatus.phase === "offline"
    ? OFFLINE_SYNC_MESSAGE
    : syncState === "idle" ? automaticSyncStatus.message : statusMessage;

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
  }, [activePage, navigationItems, setActivePage]);

  function handleLockApp() {
    setDiagnosticsOpen(false);
    closeMenuPreview();
    void lockApp();
  }

  function openDiagnostics() {
    closeMenuPreview();
    setDiagnosticsOpen(true);
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


  return (
    <AppShell
      contentScroll={["pension", "restaurant", "settings"].includes(activePage) ? "workspace" : "page"}
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
                  <span role="status" aria-live="polite">
                    {qrMenuEnabled ? menuStatusMessage : "Menü içeriği yerel olarak düzenleniyor."}
                  </span>
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
                </div>
              ) : activePage === "messages" ? (
                <div className="sync-pill sync-idle">
                  <span>{customerMessagingEnabled
                    ? (selectedWhatsAppRequest ? `${selectedWhatsAppRequest.customer_name} için hazır cevap` : "Mesaj için talep seçin")
                    : (aiEnabled ? "AI araçları kullanıma hazır." : "Mesaj araçları bu işletmede etkin değil.")}</span>
                </div>
              ) : activePage === "settings" ? null : (
                <div className={`sync-pill sync-${syncState === "idle" ? automaticSyncTone(automaticSyncStatus) : syncState}`}>
                  <span role="status" aria-live="polite">
                    {syncDisplayMessage}
                    {automaticSyncStatus.pendingJobs > 0 ? ` · ${automaticSyncStatus.pendingJobs} eşitleme bekliyor` : ""}
                  </span>
                  <button
                    className="action-button action-button-sm"
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
      overlay={(
        <>
          <WorkspaceHost definition={roomWorkspaceDefinition} context={{
            data: projectDesktopDashboardData(dashboardData, businessCapabilities?.enabledCapabilities ?? []),
            onDashboard: desktopSyncController.setDashboardData,
            staysEnabled: runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.ACCOMMODATION_STAYS),
            reservationsEnabled: runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.ACCOMMODATION_RESERVATIONS),
            folioEnabled: runtimeHasCapability(businessCapabilities, BUSINESS_CAPABILITIES.ACCOMMODATION_FOLIO), menuEnabled
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
