import { CalendarCheck, LogIn, LogOut, BedDouble } from "lucide-react";
import type { ReactNode } from "react";
import type { DesktopDashboardData } from "../../electron/database";
import { getRoomDisplayInfo } from "../app/operations";

interface PensionPageProps {
  data: DesktopDashboardData;
  reservations: ReactNode;
  rooms: ReactNode;
  tasks: ReactNode;
}

function localDateKey() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function PensionPage({ data, reservations, rooms, tasks }: PensionPageProps) {
  const today = localDateKey();
  const activeReservations = data.reservations.filter((reservation) => !["rejected", "cancelled", "completed"].includes(reservation.status));
  const metrics = [
    { label: "Bugünkü girişler", value: activeReservations.filter((reservation) => reservation.startDate === today).length, icon: LogIn },
    { label: "Bugünkü çıkışlar", value: activeReservations.filter((reservation) => reservation.endDate === today).length, icon: LogOut },
    { label: "Onay bekleyen", value: data.reservations.filter((reservation) => reservation.status === "pending").length, icon: CalendarCheck },
    { label: "Boş odalar", value: data.rooms.filter((room) => getRoomDisplayInfo(room, data.reservations).status === "available").length, icon: BedDouble }
  ];

  return (
    <section className="combined-page" aria-label="Pansiyon yönetimi">
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
      <div className="pension-layout">
        <section className="combined-section">
          <div className="combined-section-heading"><span>Rezervasyonlar</span><strong>Konaklama takibi</strong></div>
          {reservations}
        </section>
        <aside className="combined-section">
          <div className="combined-section-heading"><span>Odalar</span><strong>Anlık oda durumu</strong></div>
          {rooms}
        </aside>
      </div>
      <section className="combined-section pension-tasks-section">
        <div className="combined-section-heading"><span>Günlük işler</span><strong>Giriş, çıkış, temizlik ve bakım</strong></div>
        {tasks}
      </section>
    </section>
  );
}
