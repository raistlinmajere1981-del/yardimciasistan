import type { ReactNode } from "react";
import type { DesktopDashboardData, DesktopStatusUpdateResult } from "../../electron/database";
import { OperationsBoardLayout } from "../components/operations/OperationsBoardLayout";
import { useResourceCoverPreviews } from "../components/operations/use-resource-cover-previews";
import { getTableStatusAction } from "../components/restaurant/table-presentation";
import type { useRestaurantPageController } from "../components/restaurant/restaurant-page-state";
import { TableResourceCard } from "../components/restaurant/TableResourceCard";
import { FeatureWorkspacePage } from "../components/workspace/FeatureWorkspacePage";
import { ChoiceChips } from "../components/ui/ChoiceChips";
import { ActionButton } from "../components/ui/ActionButton";

interface RestaurantPageProps {
  controller: ReturnType<typeof useRestaurantPageController>;
  data: DesktopDashboardData;
  reservationsEnabled: boolean;
  ordersEnabled: boolean;
  menuEnabled: boolean;
  tasksEnabled: boolean;
  reservations: ReactNode;
  tasks: ReactNode;
  onUpdateTableStatus: (tableId: string, status: string) => Promise<DesktopStatusUpdateResult>;
  onDashboardDataChanged: (data: DesktopDashboardData) => void;
}

export function RestaurantPage({
  controller,
  data,
  reservationsEnabled,
  ordersEnabled,
  menuEnabled,
  tasksEnabled,
  reservations,
  tasks,
  onDashboardDataChanged,
  onUpdateTableStatus
}: RestaurantPageProps) {
  const { filters, setFilters } = controller;
  const { group, status } = filters;
  const coverPreviews = useResourceCoverPreviews("table", data.revision);
  const setGroup = (value: string) => setFilters((current) => ({ ...current, group: value }));
  const setStatus = (value: string) => setFilters((current) => ({ ...current, status: value }));
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
      <select
        className="hospitality-resource-toolbar__select"
        aria-label="Masa grubu"
        value={group}
        onChange={(event) => setGroup(event.target.value)}
      >
        <option value="all">Tüm gruplar</option>
        {groups.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      <ChoiceChips
        ariaLabel="Masa filtresi"
        value={status}
        onChange={setStatus}
        options={statusOptions.map(option => ({
          ...option,
          label: `${option.label} (${groupTables.filter(table => matchesStatus(table, option.id)).length})`
        }))}
      />
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
                onUpdateTableStatus={onUpdateTableStatus} imageSrc={coverPreviews[table.id]} />)}
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

    </>
  );
}
