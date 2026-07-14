import { CalendarCheck, ClipboardList, ReceiptText, UtensilsCrossed } from "lucide-react";
import type { ReactNode } from "react";
import type { DesktopDashboardData } from "../../electron/database";

interface RestaurantPageProps {
  data: DesktopDashboardData;
  tables: ReactNode;
  tasks: ReactNode;
}

export function RestaurantPage({ data, tables, tasks }: RestaurantPageProps) {
  const metrics = [
    { label: "Boş masalar", value: data.tables.filter((table) => table.status === "available").length, icon: UtensilsCrossed },
    { label: "Rezerve masalar", value: data.tables.filter((table) => table.status === "reserved").length, icon: CalendarCheck },
    { label: "Hesap bekleyen", value: data.tables.filter((table) => table.status === "bill_waiting").length, icon: ReceiptText },
    { label: "Bekleyen işler", value: data.dailyTasks.filter((task) => task.status === "pending").length, icon: ClipboardList }
  ];

  return (
    <section className="combined-page" aria-label="Restoran yönetimi">
      <div className="operation-summary-grid">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label}>
              <Icon size={19} aria-hidden="true" />
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </article>
          );
        })}
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
