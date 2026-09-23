import { workspaceDefinitions } from "../../apps/desktop-app/src/app/workspace-definitions";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "../../apps/desktop-app/src/components/layout/AppShell";
import { WorkspaceHost, WorkspaceNavigationProvider, useWorkspaceNavigation } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import { usePensionPageController } from "../../apps/desktop-app/src/components/pension/pension-page-state";
import { PensionPage } from "../../apps/desktop-app/src/pages/PensionPage";
import { roomWorkspaceDefinition } from "../../apps/desktop-app/src/app/workspace-definitions";
import { RoomsWorkspace, ReservationsWorkspace, DailyTasksWorkspace } from "../../apps/desktop-app/src/components/operations/OperationWorkspaces";
import { CustomersWorkspace } from "../../apps/desktop-app/src/components/customers/CustomersWorkspace";
import "../../apps/desktop-app/src/styles/index.css";

function Fixture() {
  const [page, setPage] = useState("pension");
  const [data, setData] = useState(window.fixtureDashboard);
  const capabilities = window.fixtureCapabilities;
  const pension = usePensionPageController();
  window.fixtureSetPage = setPage;
  const save = async input => { const result = await window.yardimciDesktop.saveManualReservation(input); if (result.ok) setData(result.dashboardData); return result; };
  return <WorkspaceNavigationProvider definitions={workspaceDefinitions} page={page} onReturnPage={setPage}>
    <AppShell contentScroll={page === "pension" ? "workspace" : "page"}
      sidebar={<aside className="sidebar"><button onClick={() => setPage("pension")}>Pansiyon</button><button onClick={() => setPage("customerWork")}>Müşteriler</button></aside>}
      header={<header className="page-header"><h1>{page === "pension" ? "Pansiyon" : "Müşteriler"}</h1></header>}
      overlay={<><Controls refresh={() => setData(current => ({ ...current, rooms: current.rooms.map(room => ({ ...room, updatedAt: String(Math.random()) })) }))} />
        <WorkspaceHost definition={roomWorkspaceDefinition} context={{ data, onDashboard: setData, ...capabilities }} /></>}>
      {page === "pension" ? <PensionPage controller={pension} reservationsEnabled={capabilities.reservationsEnabled} tasksEnabled reservations={
        <ReservationsWorkspace reservations={data.reservations} rooms={data.rooms} customers={data.customers} whatsappEnabled={false}
          onSaveManual={save} onSaveCustomer={async () => ({ ok: false, message: "fixture" })} onUpdateStatus={() => {}} onOpenWhatsApp={() => {}} />
      } rooms={<RoomsWorkspace rooms={data.rooms} stays={data.customerRoomStays} reservations={data.reservations} {...capabilities} />}
        tasks={<DailyTasksWorkspace scope="pension" tasks={data.dailyTasks} onSave={async () => ({ ok: false, message: "fixture" })} onDelete={async () => ({ ok: false, message: "fixture" })} onUpdateStatus={() => {}} />} />
        : <CustomersWorkspace customers={data.customers} rooms={data.rooms} stays={data.customerRoomStays} reservations={data.reservations} requests={[]}
          aiEnabled={false} whatsappEnabled={false} reservationsEnabled={capabilities.reservationsEnabled} staysEnabled={capabilities.staysEnabled}
          onCall={() => {}} onWhatsApp={() => {}} onSummarize={() => {}} onSave={async () => ({ ok: false, message: "fixture" })}
          onAnalyzeIdentity={async () => ({ ok: false, message: "fixture" })} onDelete={async () => undefined} />}
    </AppShell>
  </WorkspaceNavigationProvider>;
}
function Controls({ refresh }) {
  const navigation = useWorkspaceNavigation();
  window.fixtureOpen = id => navigation.openWorkspace({ entityType: "room", entityId: id, returnContext: { page: "pension", view: "rooms" } });
  window.fixtureRefresh = refresh;
  return null;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
