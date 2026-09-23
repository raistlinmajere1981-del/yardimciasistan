import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DesktopDashboardData, DesktopTableOrder, DesktopStatusUpdateResult } from "../../electron/database";
import { ActionButton } from "../components/ui/ActionButton";
import { StatusBadge } from "../components/ui/StatusBadge";
import { WorkspaceHost, useWorkspaceNavigation } from "../components/workspace/WorkspaceNavigation";
import { TableWorkspace } from "../components/restaurant/TableWorkspace";
import { formatMoney, getOrderCurrency, getOrderBadge, formatTableStatus, getResourceStatusTone, getTableStatusAction } from "../components/restaurant/table-presentation";

interface RestaurantPageProps {
  data: DesktopDashboardData;
  reservationsEnabled: boolean; ordersEnabled: boolean; menuEnabled: boolean;
  customersEnabled: boolean; roomFolioTransferEnabled: boolean; tasksEnabled: boolean;
  reservations: ReactNode; tasks: ReactNode;
  onUpdateTableStatus: (tableId: string, status: string) => Promise<DesktopStatusUpdateResult>;
  onDashboardDataChanged: (data: DesktopDashboardData) => void;
}

export function RestaurantPage({ data, reservationsEnabled, ordersEnabled, menuEnabled, customersEnabled,
  roomFolioTransferEnabled, tasksEnabled, reservations, tasks, onDashboardDataChanged, onUpdateTableStatus }: RestaurantPageProps) {
  const navigation = useWorkspaceNavigation();
  const [view, setView] = useState("floor");
  const [group, setGroup] = useState("all");
  const [status, setStatus] = useState("all");
  const [orders, setOrders] = useState<DesktopTableOrder[]>([]);
  const [message, setMessage] = useState("");
  const revision = useRef(0);
  const activeOrders = useMemo(() => new Map(orders.filter(order => ["open", "preparing", "served", "payment"].includes(order.status))
    .map(order => [order.tableId, order])), [orders]);
  const groups = [...new Set(data.tables.map(table => table.area.trim() || "Genel"))];
  useEffect(() => {
    if (!ordersEnabled) { setOrders([]); return; }
    let active = true;
    const request = ++revision.current;
    const bridge = window.yardimciDesktop;
    if (!bridge || typeof bridge.listTableOrders !== "function") return;
    void bridge.listTableOrders().then(result => {
      if (!active) return;
      setOrders(current => request === revision.current ? result : [
        ...current, ...result.filter(order => !current.some(item => item.id === order.id))
      ]);
    }).catch(() => { if (active && request === revision.current) setMessage("Adisyonlar okunamadı. Masa açıldığında yeniden kontrol edilir."); });
    return () => { active = false; };
  }, [ordersEnabled]);
  function orderChanged(order: DesktopTableOrder) {
    revision.current++;
    setOrders(current => current.some(item => item.id === order.id) ? current.map(item => item.id === order.id ? order : item) : [order, ...current]);
  }
  const views = [{ id: "floor", label: "Masalar" }, ...(reservationsEnabled ? [{ id: "reservations", label: "Rezervasyonlar" }] : []),
    ...(tasksEnabled ? [{ id: "daily-tasks", label: "Günlük İşler" }] : [])];
  const activeView = views.some(item => item.id === view) ? view : "floor";
  return <section className="restaurant-page" aria-label="Restoran yönetimi">
    <div className="page-toolbar">
      <nav className="action-row" aria-label="Restoran görünümü">{views.map(item => <ActionButton key={item.id}
        variant={activeView === item.id ? "primary" : "secondary"} aria-pressed={activeView === item.id} onClick={() => setView(item.id)}>{item.label}</ActionButton>)}</nav>
      {activeView === "floor" && <>
        <label className="form-field">Masa grubu<select value={group} onChange={event => setGroup(event.target.value)}>
          <option value="all">Tüm gruplar</option>{groups.map(name => <option key={name} value={name}>{name}</option>)}
        </select></label>
        <label className="form-field">Masa filtresi<select value={status} onChange={event => setStatus(event.target.value)}>
          <option value="all">Tüm masalar</option><option value="available">Boş</option><option value="occupied">Dolu</option>
          {reservationsEnabled && <option value="reserved">Rezerve</option>}{ordersEnabled && <option value="bill_waiting">Hesap</option>}
        </select></label>
      </>}
    </div>
    <section className="restaurant-workspace-body" aria-label={activeView === "floor" ? "Floor" : activeView === "reservations" ? "Rezervasyonlar" : "Günlük İşler"}>
      {activeView === "floor" ? <div className="restaurant-table-area-list" aria-label="Masa yönetimi">
        {message && <p role="status">{message}</p>}
        {data.tables.length === 0 && <p>Masa kaydı yok. Masa kategorilerini Temel Ayarlar bölümünden belirleyebilirsiniz.</p>}
        {groups.filter(name => group === "all" || name === group).map(name => <section className="table-area-group" key={name}>
          <header className="table-area-heading"><h3>{name}</h3></header>
          <div className="restaurant-table-grid">{data.tables.filter(table => (table.area.trim() || "Genel") === name && (status === "all" || (getTableStatusAction(table.status) || table.status) === status)).map(table => {
            const order = activeOrders.get(table.id);
            return <article className="card restaurant-table-card" data-status={table.status} key={table.id}>
              <header className="card__header restaurant-table-card__header"><h2>{table.name}</h2>
                <StatusBadge tone={getResourceStatusTone(table.status)}>{formatTableStatus(table.status)}</StatusBadge></header>
              {order && <div className="restaurant-table-card__order-state"><span>Aktif adisyon</span><StatusBadge tone={getOrderBadge(order.status).tone}>{getOrderBadge(order.status).label}</StatusBadge></div>}
              <div className="restaurant-table-card__summary"><span>{table.capacity} kişilik masa</span>
                {order && <><span>{order.itemCount} ürün</span><strong>{formatMoney(order.total, getOrderCurrency(order))}</strong></>}
                {reservationsEnabled && <span>{table.activeReservationTitle || "Rezervasyon yok"}</span>}
              </div>
              <ActionButton size="sm" aria-label={`${table.name} masasını aç`} onClick={() => navigation.openWorkspace({
                entityType: "table", entityId: table.id, returnContext: { page: "restaurant", view: "floor", entityId: table.id }
              }, { onReturn: () => setView("floor") })}>Masayı Aç</ActionButton>
            </article>;
          })}</div>
        </section>)}
      </div> : activeView === "reservations" ? reservations : tasks}
    </section>
    <WorkspaceHost renderWorkspace={intent => intent.entityType === "table" ? <TableWorkspace intent={intent} data={data} orders={orders}
      ordersEnabled={ordersEnabled} menuEnabled={menuEnabled} customersEnabled={customersEnabled} reservationsEnabled={reservationsEnabled}
      roomFolioTransferEnabled={roomFolioTransferEnabled} onUpdateTableStatus={onUpdateTableStatus} onOrderChanged={orderChanged} onDashboardDataChanged={onDashboardDataChanged} /> : null} />
  </section>;
}
