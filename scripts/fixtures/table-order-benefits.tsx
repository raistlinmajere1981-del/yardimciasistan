import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { DesktopDashboardData } from "../../apps/desktop-app/electron/database";
import type { TableWorkspaceIntent } from "../../apps/desktop-app/src/components/workspace/workspace-intent";
import { TableWorkspace } from "../../apps/desktop-app/src/components/restaurant/TableWorkspace";
import { WorkspaceNavigationProvider, useWorkspaceNavigation } from "../../apps/desktop-app/src/components/workspace/WorkspaceNavigation";
import { subscribeAppStatus } from "../../apps/desktop-app/src/app/runtime-state";
import "../../apps/desktop-app/src/styles/index.css";

const testWindow = window as typeof window & {
  __tableBenefitsDashboard: DesktopDashboardData;
  __tableBenefitsControls: { refresh(): Promise<void>; attemptClose(): boolean; open(id: string): boolean; hide(): void; remountAccount(): void };
};
const definitions = [{ entityType: "table" as const, sessionPage: "restaurant" as const, defaultPresentation: "full-canvas" as const }];
function Fixture() {
  return <WorkspaceNavigationProvider page="restaurant" definitions={definitions}><Surface /></WorkspaceNavigationProvider>;
}
function Surface() {
  const navigation = useWorkspaceNavigation();
  const [data, setData] = useState(testWindow.__tableBenefitsDashboard);
  const [hidden, setHidden] = useState(false);
  const [ordersEnabled, setOrdersEnabled] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => subscribeAppStatus(detail => setMessage(detail.message)), []);
  const intent = navigation.hospitalitySessions.restaurant?.intent as TableWorkspaceIntent | undefined;
  testWindow.__tableBenefitsControls = {
    refresh: async () => setData(await window.yardimciDesktop!.getDashboardData()),
    attemptClose: () => navigation.closeWorkspace(intent && { entityType: "table", entityId: intent.entityId }),
    open: id => navigation.openWorkspace({ entityType: "table", entityId: id, mode: "account" }),
    hide: () => setHidden(value => !value),
    remountAccount: () => setOrdersEnabled(value => !value)
  };
  return <>
    <nav>
      <output data-testid="table-status">{message}</output>
      <button onClick={() => setHidden(value => !value)}>Görünümü değiştir</button>
      <button onClick={() => void testWindow.__tableBenefitsControls.refresh()}>Masaları yeniden oku</button>
      {data.tables.map(table => <button key={table.id} onClick={() => testWindow.__tableBenefitsControls.open(table.id)}>{table.name} aç</button>)}
    </nav>
    <main hidden={hidden} style={{ height: "calc(100vh - 70px)" }}>
      {intent && <TableWorkspace key={intent.entityId} intent={intent} data={data}
        ordersEnabled={ordersEnabled} menuEnabled inventoryEnabled customersEnabled reservationsEnabled={false} roomFolioTransferEnabled
        aiEnabled={false} onDashboardDataChanged={setData}
        onUpdateTableStatus={async (tableId, status) => {
          const result = await window.yardimciDesktop!.updateTableStatus({ tableId, status });
          if (result.ok) setData(result.dashboardData); return result;
        }}
        onSaveCustomer={async () => ({ ok: false, message: "fixture" })}
        onSaveReservation={async () => ({ ok: false, message: "fixture" })}
        onAnalyzeIdentity={async () => ({ ok: false, message: "fixture" })} />}
    </main>
  </>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
