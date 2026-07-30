import { CalendarCheck, ClipboardList, ReceiptText, UtensilsCrossed } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { DesktopDashboardData, DesktopTableOrder } from "../../electron/database";
import { isRestaurantTask } from "../app/operations";
import { TableOrdersWorkspace } from "../components/restaurant/TableOrdersWorkspace";
import { MetricCard, type MetricCardProps } from "../components/ui/MetricCard";

interface RestaurantPageProps {
  data: DesktopDashboardData;
  tasks: ReactNode;
  onDashboardDataChanged: (data: DesktopDashboardData) => void;
  onUpdateTableStatus: (tableId: string, status: string) => void;
}

export function RestaurantPage({ data, tasks, onDashboardDataChanged, onUpdateTableStatus }: RestaurantPageProps) {
  const [tableOrders, setTableOrders] = useState<DesktopTableOrder[]>([]);
  const restaurantTasks = data.dailyTasks.filter((task) => isRestaurantTask(task, data.reservations));
  const activeOrders = useMemo(
    () => tableOrders.filter((order) => ["open", "preparing", "served", "payment"].includes(order.status)),
    [tableOrders]
  );
  const activeOrderTableIds = useMemo(() => new Set(activeOrders.map((order) => order.tableId)), [activeOrders]);
  const paymentTableIds = useMemo(
    () => new Set(activeOrders.filter((order) => order.status === "payment").map((order) => order.tableId)),
    [activeOrders]
  );
  const billWaitingTableIds = useMemo(() => {
    const ids = new Set(paymentTableIds);
    for (const table of data.tables) {
      if (["bill_waiting", "waiting_bill", "checkout", "payment"].includes(table.status)) {
        ids.add(table.id);
      }
    }
    return ids;
  }, [data.tables, paymentTableIds]);
  const metrics: MetricCardProps[] = [
    { title: "Boş masalar", value: String(data.tables.filter((table) => table.status === "available" && !activeOrderTableIds.has(table.id)).length), tone: "ok", icon: UtensilsCrossed, compact: true },
    { title: "Rezerve masalar", value: String(data.tables.filter((table) => table.status === "reserved").length), tone: "wait", icon: CalendarCheck, compact: true },
    { title: "Hesap bekleyen", value: String(billWaitingTableIds.size), tone: "info", icon: ReceiptText, compact: true },
    { title: "Bekleyen işler", value: String(restaurantTasks.filter((task) => task.status === "pending").length), tone: "neutral", icon: ClipboardList, compact: true }
  ];

  useEffect(() => {
    const bridge = window.yardimciDesktop;
    if (!bridge || typeof bridge.listTableOrders !== "function") {
      return;
    }

    let mounted = true;
    void bridge.listTableOrders()
      .then((orders) => {
        if (mounted) {
          setTableOrders(orders);
        }
      })
      .catch(() => {
        // Restoranın mevcut masa yönetimi sipariş verisi yüklenemese de çalışmaya devam eder.
      });
    return () => {
      mounted = false;
    };
  }, []);

  function handleOrderChanged(order: DesktopTableOrder) {
    setTableOrders((current) => {
      if (current.some((item) => item.id === order.id)) {
        return current.map((item) => item.id === order.id ? order : item);
      }
      return [order, ...current];
    });
  }

  return (
    <section className="combined-page restaurant-page" aria-label="Restoran yönetimi">
      <section className="operation-group-panel operation-summary-panel restaurant-summary-panel" aria-labelledby="restaurant-summary-title">
        <header className="operation-panel-heading">
          <span className="operation-panel-eyebrow">Servis</span>
          <h2 id="restaurant-summary-title">Bugünkü Servis Özeti</h2>
          <p>Masa doluluğu ve bekleyen servis işlerine hızlı bakış</p>
        </header>
        <div className="operation-summary-grid">
          {metrics.map((metric) => <MetricCard {...metric} key={metric.title} />)}
        </div>
      </section>
      <div className="restaurant-layout">
        <section className="operation-group-panel restaurant-tables-section" aria-labelledby="restaurant-tables-title">
          <header className="operation-panel-heading">
            <span className="operation-panel-eyebrow">Servis</span>
            <h2 id="restaurant-tables-title">Masa Durumu</h2>
            <p>Tanımladığınız kategorilerdeki masaların güncel durumu</p>
          </header>
          <div className="operation-panel-content">
            <TableOrdersWorkspace
              tables={data.tables}
              menu={data.menu}
              orders={tableOrders}
              onOrderChanged={handleOrderChanged}
              onDashboardDataChanged={onDashboardDataChanged}
              onUpdateStatus={onUpdateTableStatus}
            />
          </div>
        </section>
        <section className="operation-group-panel restaurant-tasks-section" aria-labelledby="restaurant-tasks-title">
          <header className="operation-panel-heading">
            <span className="operation-panel-eyebrow">Servis</span>
            <h2 id="restaurant-tasks-title">Servis İşleri</h2>
            <p>Bekleyen ve tamamlanan servis görevleri</p>
          </header>
          <div className="operation-panel-content">{tasks}</div>
        </section>
      </div>
    </section>
  );
}
