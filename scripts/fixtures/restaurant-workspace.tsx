import "@fontsource-variable/ibm-plex-sans/wght.css";
import { useDashboardSnapshot } from "../../apps/desktop-app/src/app/use-dashboard-snapshot";
import { workspaceDefinitions } from "../../apps/desktop-app/src/app/workspace-definitions";
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "../../apps/desktop-app/src/components/layout/AppShell";
import { WorkspaceNavigationProvider, useWorkspaceNavigation } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import { RestaurantPage } from "../../apps/desktop-app/src/pages/RestaurantPage";
import { RestaurantReservationsWorkspace } from "../../apps/desktop-app/src/components/operations/RestaurantReservationsWorkspace";
import { DailyTasksWorkspace } from "../../apps/desktop-app/src/components/operations/OperationWorkspaces";
import "../../apps/desktop-app/src/styles/index.css";

function Fixture() {
  const [data, setData] = useDashboardSnapshot(window.fixtureDashboard);
  const [locked, setLocked] = useState(false);
  const content = useRef<HTMLElement>(null);
  window.fixturePublishDashboard = setData;
  const capabilities = window.fixtureCapabilities;
  window.fixtureLock = setLocked;
  window.fixtureRefresh = () => setData(structuredClone(window.fixtureDashboard));
  if (locked) return <p>Kilitli</p>;
  const save = async input => { const result = await window.yardimciDesktop.saveManualRestaurantReservation(input); if (result.ok) setData(result.dashboardData); return result; };
  const saveCustomer = async input => { const result = await window.yardimciDesktop.saveCustomer(input); if (result.ok) setData(result.dashboardData); return result; };
  return <WorkspaceNavigationProvider definitions={workspaceDefinitions} page="restaurant">
    <AppShell contentScroll="workspace" contentRef={content}
      sidebar={<aside className="sidebar"><button>Restoran</button></aside>}
      header={<header className="page-header"><h1>Restoran</h1></header>}>
      <Controls />
      <RestaurantPage data={data} {...capabilities} tasksEnabled tasks={<DailyTasksWorkspace scope="restaurant" tasks={data.dailyTasks} onSave={async () => ({ ok: false, message: "fixture" })} onDelete={async () => ({ ok: false, message: "fixture" })} onUpdateStatus={() => {}} />} onDashboardDataChanged={setData}
        onUpdateTableStatus={async (tableId, status) => { const result = await window.yardimciDesktop.updateTableStatus({ tableId, status }); if (result.ok) setData(result.dashboardData); return result; }}
        reservations={<RestaurantReservationsWorkspace reservations={data.reservations} customers={data.customers}
          tables={data.tables} accommodationReservationsEnabled={false} whatsappEnabled={false} customersEnabled={capabilities.customersEnabled}
          onSave={save} onSaveCustomer={saveCustomer} onUpdateStatus={() => {}} onOpenWhatsApp={() => {}} />} />
    </AppShell>
  </WorkspaceNavigationProvider>;
}
function Controls() {
  const navigation = useWorkspaceNavigation();
  window.fixtureOpen = id => navigation.openWorkspace({ entityType: "table", entityId: id, returnContext: { page: "restaurant", view: "floor" } });
  return null;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
