import { useState, type ReactNode } from "react";
import type {
  DesktopCustomerMutationResult,
  DesktopDashboardData,
  DesktopIdentityImageAnalyzeResult,
  DesktopStatusUpdateResult,
  SaveCustomerInput,
  SaveManualRestaurantReservationInput
} from "../../electron/database";
import { tableWorkspaceDefinition } from "../app/workspace-definitions";
import { OperationsBoardLayout } from "../components/operations/OperationsBoardLayout";
import { getTableStatusAction } from "../components/restaurant/table-presentation";
import { TableResourceCard } from "../components/restaurant/TableResourceCard";
import { FeatureWorkspacePage } from "../components/workspace/FeatureWorkspacePage";
import { WorkspaceHost } from "../components/workspace/WorkspaceNavigation";
import { ChoiceChips } from "../components/ui/ChoiceChips";
import { ActionButton } from "../components/ui/ActionButton";

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
  aiEnabled: boolean;
  onSaveCustomer: (input: SaveCustomerInput) => Promise<DesktopCustomerMutationResult>;
  onAnalyzeIdentity: (file: File) => Promise<DesktopIdentityImageAnalyzeResult>;
  onSaveReservation: (input: SaveManualRestaurantReservationInput) => Promise<DesktopStatusUpdateResult>;
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
  onUpdateTableStatus,
  aiEnabled,
  onSaveCustomer,
  onAnalyzeIdentity,
  onSaveReservation
}: RestaurantPageProps) {
  const [group, setGroup] = useState("all");
  const [status, setStatus] = useState("all");
  const groups = [...new Set(data.tables.map((table) => table.area.trim() || "Genel"))];
  const summaries = new Map(data.tableOperations?.map(item => [item.tableId, item]));
  const groupTables = data.tables.filter(table => group === "all" || (table.area.trim() || "Genel") === group);
  const matchesStatus = (table: DesktopDashboardData["tables"][number], value: string) => value === "all"
    || (getTableStatusAction(table.status) || table.status) === value;
  const visibleTables = groupTables.filter(table => matchesStatus(table, status));
  const statusOptions = [
    { id: "all", label: "Tümü" }, { id: "available", label: "Boş" }, { id: "occupied", label: "Dolu" },
    ...(reservationsEnabled ? [{ id: "reserved", label: "Rezerve" }] : []),
    ...(ordersEnabled ? [{ id: "bill_waiting", label: "Hesap" }] : []),
    { id: "cleaning", label: "Temizlik" }
  ];

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
          options={statusOptions.map(option => ({ ...option,
            label: `${option.label} (${groupTables.filter(table => matchesStatus(table, option.id)).length})` }))}
        />
      </div>
    </div>
  );

  const tableFloor = (
    <div className="restaurant-table-area-list" aria-label="Masa yönetimi">
      {data.tables.length === 0 && <p>Masa kaydı yok. Masa kategorilerini Temel Ayarlar bölümünden belirleyebilirsiniz.</p>}
      {data.tables.length > 0 && visibleTables.length === 0 && <div className="form-stack" role="status"><p>Bu filtrelere uyan masa yok.</p>
        <ActionButton variant="secondary" onClick={() => { setGroup("all"); setStatus("all"); }}>Masa Filtrelerini Temizle</ActionButton>
      </div>}
      {groups.filter(name => visibleTables.some(table => (table.area.trim() || "Genel") === name)).map((name) => (
        <details className="table-area-group" key={name} open>
          <summary className="table-area-heading">
            <strong>{name}</strong><span>{visibleTables.filter(table => (table.area.trim() || "Genel") === name).length} masa</span>
          </summary>
          <div className="resource-grid">
            {visibleTables
              .filter((table) => (table.area.trim() || "Genel") === name)
              .map(table => <TableResourceCard key={table.id} table={table} summary={summaries.get(table.id)}
                capabilities={{ ordersEnabled, reservationsEnabled, menuEnabled }} onDashboard={onDashboardDataChanged}
                onUpdateTableStatus={onUpdateTableStatus} />)}
          </div>
        </details>
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
          aiEnabled,
          onSaveCustomer,
          onAnalyzeIdentity,
          onSaveReservation,
          onDashboardDataChanged
        }}
      />
    </>
  );
}
