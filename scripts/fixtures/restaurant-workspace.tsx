import "@fontsource-variable/ibm-plex-sans/wght.css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { DesktopPage } from "../../apps/desktop-app/src/app/navigation";
import { useDashboardSnapshot } from "../../apps/desktop-app/src/app/use-dashboard-snapshot";
import { roomWorkspaceDefinition, tableWorkspaceDefinition, workspaceDefinitions } from "../../apps/desktop-app/src/app/workspace-definitions";
import { AppShell } from "../../apps/desktop-app/src/components/layout/AppShell";
import { GlobalMessageBar } from "../../apps/desktop-app/src/components/layout/GlobalMessageBar";
import { subscribeAppStatus, type AppStatusDetail } from "../../apps/desktop-app/src/app/runtime-state";
import {
  HospitalityWorkspaceHost,
  WorkspaceNavigationProvider,
  useWorkspaceNavigation
} from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import { useRestaurantPageController } from "../../apps/desktop-app/src/components/restaurant/restaurant-page-state";
import { RestaurantPage } from "../../apps/desktop-app/src/pages/RestaurantPage";
import { RestaurantReservationsWorkspace } from "../../apps/desktop-app/src/components/operations/RestaurantReservationsWorkspace";
import { DailyTasksWorkspace } from "../../apps/desktop-app/src/components/operations/OperationWorkspaces";
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
  const [page, setPage] = useState<DesktopPage>("restaurant");
  const [data, setData] = useDashboardSnapshot(window.fixtureDashboard);
  const [locked, setLocked] = useState(false);
  const content = useRef<HTMLElement>(null);
  const restaurant = useRestaurantPageController();
  window.fixturePublishDashboard = setData;
  const capabilities = window.fixtureCapabilities;
  window.fixtureLock = setLocked;
  window.fixtureSetPage = setPage;
  window.fixtureRefresh = () => setData(structuredClone(window.fixtureDashboard));
  if (locked) return <p>Kilitli</p>;

  const save = async input => {
    const result = await window.yardimciDesktop.saveManualRestaurantReservation(input);
    if (result.ok) setData(result.dashboardData);
    return result;
  };
  const saveCustomer = async input => {
    const result = await window.yardimciDesktop.saveCustomer(input);
    if (result.ok) setData(result.dashboardData);
    return result;
  };

  return <WorkspaceNavigationProvider definitions={workspaceDefinitions} page={page} onReturnPage={setPage}>
    <FixtureShell
      page={page}
      setPage={setPage}
      data={data}
      setData={setData}
      capabilities={capabilities}
      content={content}
      restaurant={restaurant}
      save={save}
      saveCustomer={saveCustomer}
    />
  </WorkspaceNavigationProvider>;
}

function FixtureShell({ page, setPage, data, setData, capabilities, content, restaurant, save, saveCustomer }) {
  const navigation = useWorkspaceNavigation();
  const workspaceActive = page === "restaurant"
    ? Boolean(navigation.hospitalitySessions.restaurant)
    : page === "pension"
      ? Boolean(navigation.hospitalitySessions.pension)
      : false;

  return <AppShell
    contentScroll="workspace"
    contentRef={content}
    workspaceActive={workspaceActive}
    workspaceLayer={<>
      <HospitalityWorkspaceHost
        page="restaurant"
        activePage={page}
        definition={tableWorkspaceDefinition}
        context={{
          data,
          ordersEnabled: capabilities.ordersEnabled,
          menuEnabled: capabilities.menuEnabled,
          customersEnabled: capabilities.customersEnabled,
          reservationsEnabled: capabilities.reservationsEnabled,
          roomFolioTransferEnabled: capabilities.roomFolioTransferEnabled,
          onUpdateTableStatus: async (tableId, status) => {
            const result = await window.yardimciDesktop.updateTableStatus({ tableId, status });
            if (result.ok) setData(result.dashboardData);
            return result;
          },
          aiEnabled: false,
          onSaveCustomer: saveCustomer,
          onAnalyzeIdentity: async () => ({ ok: false, message: "fixture" }),
          onSaveReservation: save,
          onDashboardDataChanged: setData
        }}
      />
      <HospitalityWorkspaceHost
        page="pension"
        activePage={page}
        definition={roomWorkspaceDefinition}
        context={{
          data,
          onDashboard: setData,
          staysEnabled: true,
          reservationsEnabled: false,
          customersEnabled: capabilities.customersEnabled,
          aiEnabled: false,
          onSaveCustomer: saveCustomer,
          onAnalyzeIdentity: async () => ({ ok: false, message: "fixture" }),
          onSaveReservation: async () => ({ ok: false, message: "fixture" }),
          folioEnabled: true,
          menuEnabled: capabilities.menuEnabled
        }}
      />
    </>}
    sidebar={<aside className="sidebar">
      <button onClick={() => setPage("restaurant")}>Restoran</button>
      <button onClick={() => setPage("pension")}>Pansiyon</button>
      <button onClick={() => setPage("dashboard")}>Ana Sayfa</button>
    </aside>}
    header={<header className="page-header"><h1>{page === "restaurant" ? "Restoran" : page === "pension" ? "Pansiyon" : "Ana Sayfa"}</h1><FixtureStatusHost /></header>}
  >
    <Controls />
    {page === "restaurant" ? <RestaurantPage
      controller={restaurant}
      data={data}
      reservationsEnabled={capabilities.reservationsEnabled}
      ordersEnabled={capabilities.ordersEnabled}
      menuEnabled={capabilities.menuEnabled}
      tasksEnabled
      tasks={<DailyTasksWorkspace
        scope="restaurant"
        tasks={data.dailyTasks}
        onSave={async () => ({ ok: false, message: "fixture" })}
        onDelete={async () => ({ ok: false, message: "fixture" })}
        onUpdateStatus={() => {}}
      />}
      onDashboardDataChanged={setData}
      onUpdateTableStatus={async (tableId, status) => {
        const result = await window.yardimciDesktop.updateTableStatus({ tableId, status });
        if (result.ok) setData(result.dashboardData);
        return result;
      }}
      reservations={<RestaurantReservationsWorkspace
        reservations={data.reservations}
        customers={data.customers}
        tables={data.tables}
        accommodationReservationsEnabled={false}
        whatsappEnabled={false}
        customersEnabled={capabilities.customersEnabled}
        onSave={save}
        onSaveCustomer={saveCustomer}
        onUpdateStatus={() => {}}
        onOpenWhatsApp={() => {}}
      />}
    /> : <section aria-label={page === "pension" ? "Pansiyon fixture" : "Ana sayfa fixture"}>
      <p>{page === "pension" ? "Pansiyon" : "Ana Sayfa"}</p>
    </section>}
  </AppShell>;
}

function Controls() {
  const navigation = useWorkspaceNavigation();
  window.fixtureOpen = id => navigation.openWorkspace({
    entityType: "table",
    entityId: id,
    returnContext: { page: "restaurant", view: "floor" }
  });
  return null;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
