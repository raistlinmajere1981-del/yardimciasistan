import "@fontsource-variable/ibm-plex-sans/wght.css";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { DesktopPage } from "../../apps/desktop-app/src/app/navigation";
import { useDashboardSnapshot } from "../../apps/desktop-app/src/app/use-dashboard-snapshot";
import { customerWorkspaceDefinition, roomWorkspaceDefinition, workspaceDefinitions } from "../../apps/desktop-app/src/app/workspace-definitions";
import { AppShell } from "../../apps/desktop-app/src/components/layout/AppShell";
import { GlobalMessageBar } from "../../apps/desktop-app/src/components/layout/GlobalMessageBar";
import { subscribeAppStatus, type AppStatusDetail } from "../../apps/desktop-app/src/app/runtime-state";
import { RoomsWorkspace } from "../../apps/desktop-app/src/components/pension/RoomsWorkspace";
import { usePensionPageController } from "../../apps/desktop-app/src/components/pension/pension-page-state";
import { ReservationsWorkspace, DailyTasksWorkspace } from "../../apps/desktop-app/src/components/operations/OperationWorkspaces";
import { CustomersWorkspace } from "../../apps/desktop-app/src/components/customers/CustomersWorkspace";
import {
  HospitalityWorkspaceHost,
  WorkspaceHost,
  WorkspaceNavigationProvider,
  useWorkspaceNavigation
} from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import { PensionPage } from "../../apps/desktop-app/src/pages/PensionPage";
import "../../apps/desktop-app/src/styles/index.css";

function FixtureStatusHost() {
  const [status, setStatus] = useState<AppStatusDetail | null>(null);
  useEffect(() => subscribeAppStatus(setStatus), []);
  return status ? (
    <GlobalMessageBar
      tone={status.state === "error" ? "error" : status.state === "success" ? "success" : "loading"}
      message={status.message}
    />
  ) : null;
}

function Fixture() {
  const [page, setPage] = useState<DesktopPage>("pension");
  const [data, setData] = useDashboardSnapshot(window.fixtureDashboard);
  window.fixturePublishDashboard = setData;
  const capabilities = window.fixtureCapabilities;
  const pension = usePensionPageController();
  window.fixtureSetPage = setPage;
  const save = async input => {
    const result = await window.yardimciDesktop.saveManualReservation(input);
    if (result.ok) setData(result.dashboardData);
    return result;
  };

  return <WorkspaceNavigationProvider definitions={workspaceDefinitions} page={page} onReturnPage={setPage}>
    <FixtureShell page={page} setPage={setPage} data={data} setData={setData} capabilities={capabilities} pension={pension} save={save} />
  </WorkspaceNavigationProvider>;
}

function FixtureShell({ page, setPage, data, setData, capabilities, pension, save }) {
  const navigation = useWorkspaceNavigation();
  const roomSessionActive = page === "pension" && Boolean(navigation.hospitalitySessions.pension);

  return <AppShell
    contentScroll={page === "pension" ? "workspace" : "page"}
    workspaceActive={roomSessionActive}
    workspaceLayer={<HospitalityWorkspaceHost
      page="pension"
      activePage={page}
      definition={roomWorkspaceDefinition}
      context={{
        data,
        onDashboard: setData,
        staysEnabled: capabilities.staysEnabled,
        reservationsEnabled: capabilities.reservationsEnabled,
        customersEnabled: true,
        aiEnabled: false,
        onSaveCustomer: async () => ({ ok: false, message: "fixture" }),
        onAnalyzeIdentity: async () => ({ ok: false, message: "fixture" }),
        onSaveReservation: save,
        folioEnabled: capabilities.folioEnabled,
        menuEnabled: capabilities.menuEnabled
      }}
    />}
    sidebar={<aside className="sidebar">
      <button onClick={() => setPage("pension")}>Pansiyon</button>
      <button onClick={() => setPage("customerWork")}>Müşteriler</button>
      <button onClick={() => setPage("dashboard")}>Ana Sayfa</button>
    </aside>}
    header={<header className="page-header"><div className="page-header__main"><div className="page-header-copy"><h1 className="page-header__title">{page === "pension" ? "Pansiyon" : page === "customerWork" ? "Müşteriler" : "Ana Sayfa"}</h1></div><div className="page-header__notice has-notice"><FixtureStatusHost /></div><div className="page-header__actions" /></div></header>}
    overlay={<>
      <Controls refresh={() => setData(current => ({ ...current, rooms: current.rooms.map(room => ({ ...room, updatedAt: String(Math.random()) })) }))} />
      <WorkspaceHost definition={customerWorkspaceDefinition} context={{
        data,
        aiEnabled: false,
        whatsappEnabled: false,
        reservationsEnabled: capabilities.reservationsEnabled,
        staysEnabled: capabilities.staysEnabled,
        customerCreditEnabled: false,
        onPreparedCreditWhatsApp: () => {},
        onWhatsApp: () => {},
        onSave: async () => ({ ok: false, message: "fixture" }),
        onAnalyzeIdentity: async () => ({ ok: false, message: "fixture" }),
        onDelete: async () => undefined
      }} />
    </>}
  >
    {page === "pension" ? <PensionPage
      controller={pension}
      reservationsEnabled={capabilities.reservationsEnabled}
      tasksEnabled
      reservations={<ReservationsWorkspace
        reservations={data.reservations}
        rooms={data.rooms}
        customers={data.customers}
        whatsappEnabled={false}
        onSaveManual={save}
        onSaveCustomer={async () => ({ ok: false, message: "fixture" })}
        onUpdateStatus={() => {}}
        onOpenWhatsApp={() => {}}
      />}
      rooms={<RoomsWorkspace data={data} onDashboard={setData} {...capabilities} />}
      tasks={<DailyTasksWorkspace
        scope="pension"
        tasks={data.dailyTasks}
        onSave={async () => ({ ok: false, message: "fixture" })}
        onDelete={async () => ({ ok: false, message: "fixture" })}
        onUpdateStatus={() => {}}
      />}
    /> : page === "customerWork" ? <CustomersWorkspace
      customers={data.customers}
      stays={data.customerRoomStays}
      reservations={data.reservations}
      notifications={data.hospitalityNotifications ?? []}
      kbsOverview={data.kbsOverview ?? { enabled: false, configured: false, provider: "egm", pendingCount: 0, failedCount: 0, sentCount: 0, checkedInGuestCount: 0, activeUnsentCount: 0, activeMissingIdentityCount: 0 }}
      aiEnabled={false}
      onSave={async () => ({ ok: false, message: "fixture" })}
      onAnalyzeIdentity={async () => ({ ok: false, message: "fixture" })}
      onDelete={async () => undefined}
      onSendKbs={async () => undefined}
    /> : <section aria-label="Ana sayfa fixture"><p>Ana sayfa</p></section>}
  </AppShell>;
}

function Controls({ refresh }) {
  const navigation = useWorkspaceNavigation();
  window.fixtureOpen = (id, intent = {}) => navigation.openWorkspace({
    entityType: "room",
    entityId: id,
    ...intent,
    returnContext: { page: "pension", view: "rooms" }
  });
  window.fixtureRefresh = refresh;
  return null;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
