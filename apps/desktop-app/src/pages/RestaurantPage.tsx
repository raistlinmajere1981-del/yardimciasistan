import { useState, type ReactNode } from "react";
import type { DesktopDashboardData, DesktopStatusUpdateResult } from "../../electron/database";
import { tableWorkspaceDefinition } from "../app/workspace-definitions";
import { OperationsBoardLayout } from "../components/operations/OperationsBoardLayout";
import { getTableStatusAction } from "../components/restaurant/table-presentation";
import { TableResourceCard } from "../components/restaurant/TableResourceCard";
import { FeatureWorkspacePage } from "../components/workspace/FeatureWorkspacePage";
import { WorkspaceHost } from "../components/workspace/WorkspaceNavigation";
import { ChoiceChips } from "../components/ui/ChoiceChips";

interface RestaurantPageProps {
  data: DesktopDashboardData;
  reservationsEnabled: boolean;
  ordersEnabled: boolean;
  menuEnabled: boolean;
  customersEnabled: boolean;
  roomFolioTransferEnabled: boolean;
  tasksEnabled: boolean;
  reservations: ReactNode;
  tasks: ReactNode;
  onUpdateTableStatus: (tableId: string, status: string) => Promise<DesktopStatusUpdateResult>;
  onDashboardDataChanged: (data: DesktopDashboardData) => void;
}

export function RestaurantPage({
  data,
  reservationsEnabled,
  ordersEnabled,
  menuEnabled,
  customersEnabled,
  roomFolioTransferEnabled,
  tasksEnabled,
  reservations,
  tasks,
  onDashboardDataChanged,
  onUpdateTableStatus
}: RestaurantPageProps) {
  const [group, setGroup] = useState("all");
  const [status, setStatus] = useState("all");
  const groups = [...new Set(data.tables.map((table) => table.area.trim() || "Genel"))];
  const summaries = new Map(data.tableOperations?.map(item => [item.tableId, item]));

  const tableToolbar = (
    <div className="hospitality-resource-toolbar" aria-label="Masa filtreleri">
      <label className="form-field">
        Masa grubu
        <select value={group} onChange={(event) => setGroup(event.target.value)}>
          <option value="all">Tüm gruplar</option>
          {groups.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <div className="form-field">
        <span>Masa filtresi</span>
        <ChoiceChips
          ariaLabel="Masa filtresi"
          value={status}
          onChange={setStatus}
          options={[
            { id: "all", label: "Tümü" },
            { id: "available", label: "Boş" },
            { id: "occupied", label: "Dolu" },
            ...(reservationsEnabled ? [{ id: "reserved", label: "Rezerve" }] : []),
            ...(ordersEnabled ? [{ id: "bill_waiting", label: "Hesap" }] : [])
          ]}
        />
      </div>
    </div>
  );

  const tableFloor = (
    <div className="restaurant-table-area-list" aria-label="Masa yönetimi">
      {data.tables.length === 0 && <p>Masa kaydı yok. Masa kategorilerini Temel Ayarlar bölümünden belirleyebilirsiniz.</p>}
      {groups.filter((name) => group === "all" || name === group).map((name) => (
        <section className="table-area-group" key={name}>
          <header className="table-area-heading">
            <h3>{name}</h3>
          </header>
          <div className="resource-grid">
            {data.tables
              .filter((table) => (table.area.trim() || "Genel") === name
                && (status === "all" || (getTableStatusAction(table.status) || table.status) === status))
              .map(table => <TableResourceCard key={table.id} table={table} summary={summaries.get(table.id)}
                capabilities={{ ordersEnabled, reservationsEnabled, menuEnabled }} onDashboard={onDashboardDataChanged}
                onUpdateTableStatus={onUpdateTableStatus} />)}
          </div>
        </section>
      ))}
    </div>
  );

  return (
    <>
      <FeatureWorkspacePage label="Restoran yönetimi" bodyLabel="Restoran operasyonları">
        <OperationsBoardLayout
          left={reservationsEnabled ? {
            title: "Rezervasyonlar",
            ariaLabel: "Restoran rezervasyonları",
            content: reservations
          } : null}
          center={{
            title: "Masalar",
            ariaLabel: "Masalar paneli",
            toolbar: tableToolbar,
            content: tableFloor
          }}
          right={tasksEnabled ? {
            title: "Günlük İşler",
            ariaLabel: "Restoran günlük işleri",
            content: tasks
          } : null}
        />
      </FeatureWorkspacePage>
      <WorkspaceHost
        definition={tableWorkspaceDefinition}
        context={{
          data,
          ordersEnabled,
          menuEnabled,
          customersEnabled,
          reservationsEnabled,
          roomFolioTransferEnabled,
          onUpdateTableStatus,
          onDashboardDataChanged
        }}
      />
    </>
  );
}
