import { CalendarCheck, ClipboardList, ReceiptText, UtensilsCrossed } from "lucide-react";
import type { ReactNode } from "react";
import type { DesktopDashboardData } from "../../electron/database";
import { isRestaurantTask } from "../app/operations";
import { MetricCard, type MetricCardProps } from "../components/ui/MetricCard";

interface RestaurantPageProps {
  data: DesktopDashboardData;
  tables: ReactNode;
  tasks: ReactNode;
}

export function RestaurantPage({ data, tables, tasks }: RestaurantPageProps) {
  const restaurantTasks = data.dailyTasks.filter((task) => isRestaurantTask(task, data.reservations));
  const metrics: MetricCardProps[] = [
    { title: "Boş masalar", value: String(data.tables.filter((table) => table.status === "available").length), tone: "ok", icon: UtensilsCrossed, compact: true },
    { title: "Rezerve masalar", value: String(data.tables.filter((table) => table.status === "reserved").length), tone: "wait", icon: CalendarCheck, compact: true },
    { title: "Hesap bekleyen", value: String(data.tables.filter((table) => ["bill_waiting", "waiting_bill", "checkout", "payment"].includes(table.status)).length), tone: "info", icon: ReceiptText, compact: true },
    { title: "Bekleyen işler", value: String(restaurantTasks.filter((task) => task.status === "pending").length), tone: "neutral", icon: ClipboardList, compact: true }
  ];

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
            <p>Salon ve bahçe masalarının güncel durumu</p>
          </header>
          <div className="operation-panel-content">{tables}</div>
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
