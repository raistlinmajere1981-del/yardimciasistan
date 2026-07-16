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
      <div className="operation-summary-grid">
        {metrics.map((metric) => <MetricCard {...metric} key={metric.title} />)}
      </div>
      <div className="restaurant-layout">
        <section className="combined-section">
          <div className="combined-section-heading"><span>Masalar</span><strong>Salon ve alan durumu</strong></div>
          {tables}
        </section>
        <section className="combined-section">
          <div className="combined-section-heading"><span>Günlük işler</span><strong>Bekleyen ve tamamlanan işler</strong></div>
          {tasks}
        </section>
      </div>
    </section>
  );
}
