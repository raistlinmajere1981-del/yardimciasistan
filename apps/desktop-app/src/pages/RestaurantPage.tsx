import { CalendarCheck, ClipboardList, ReceiptText, UtensilsCrossed } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { DesktopDashboardData, DesktopTableOrder } from "../../electron/database";
import { isRestaurantTask } from "../app/operations";
import { TableOrdersWorkspace } from "../components/restaurant/TableOrdersWorkspace";
import { MetricCard, type MetricCardProps } from "../components/ui/MetricCard";

interface RestaurantPageProps {
  data: DesktopDashboardData;
  reservations: ReactNode;
  tasks: ReactNode;
  onDashboardDataChanged: (data: DesktopDashboardData) => void;
  onUpdateTableStatus: (tableId: string, status: string) => void;
}

export function RestaurantPage({ data, reservations, tasks, onDashboardDataChanged, onUpdateTableStatus }: RestaurantPageProps) {
  const [tableOrders, setTableOrders] = useState<DesktopTableOrder[]>([]);
  const restaurantTasks = data.dailyTasks.filter((task) => isRestaurantTask(task, data.reservations));
  const pendingRestaurantTasks = restaurantTasks.filter((task) => task.status === "pending");
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
    { title: "Rezerve", value: String(data.tables.filter((table) => table.status === "reserved").length), tone: "wait", icon: CalendarCheck, compact: true },
    { title: "Hesap bekleyen", value: String(billWaitingTableIds.size), tone: "info", icon: ReceiptText, compact: true },
    { title: "Yapılacak işler", value: String(pendingRestaurantTasks.length), tone: "neutral", icon: ClipboardList, compact: true }
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
          <h2 id="restaurant-summary-title">Bugün</h2>
          <p>Masaların durumunu tek bakışta görün.</p>
        </header>
        <div className="operation-summary-grid">
          {metrics.map((metric) => <MetricCard {...metric} key={metric.title} />)}
        </div>
      </section>
      <section className="operation-group-panel restaurant-reservations-section" aria-labelledby="restaurant-reservations-title">
        <header className="operation-panel-heading">
          <span className="operation-panel-eyebrow">Rezervasyon</span>
          <h2 id="restaurant-reservations-title">Masa Rezervasyonları</h2>
          <p>Telefonla, yüz yüze veya web üzerinden gelen restoran rezervasyonlarını takip edin.</p>
        </header>
        <div className="operation-panel-content">{reservations}</div>
      </section>
      <div className="restaurant-layout">
        <section className="operation-group-panel restaurant-tables-section" aria-labelledby="restaurant-tables-title">
          <header className="operation-panel-heading">
            <span className="operation-panel-eyebrow">Servis</span>
            <h2 id="restaurant-tables-title">Masalar</h2>
            <p>Masaya dokunun; sipariş ve hesap işlemleri seçtiğiniz masa üzerinden açılır.</p>
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
            <span className="operation-panel-eyebrow">Günlük İşler</span>
            <h2 id="restaurant-tasks-title">Yapılacak İşler</h2>
            <p>Servis işleri ve kendi eklediğiniz günlük notlar</p>
          </header>
          <div className="operation-panel-content">{tasks}</div>
        </section>
      </div>
    </section>
  );
}
