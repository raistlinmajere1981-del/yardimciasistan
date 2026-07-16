import { CalendarCheck, LogIn, LogOut, BedDouble } from "lucide-react";
import type { ReactNode } from "react";
import type { DesktopDashboardData } from "../../electron/database";
import { getRoomDisplayInfo } from "../app/operations";
import { MetricCard, type MetricCardProps } from "../components/ui/MetricCard";

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
  const metrics: MetricCardProps[] = [
    { title: "Bugünkü girişler", value: String(activeReservations.filter((reservation) => reservation.startDate === today).length), tone: "info", icon: LogIn, compact: true },
    { title: "Bugünkü çıkışlar", value: String(activeReservations.filter((reservation) => reservation.endDate === today).length), tone: "neutral", icon: LogOut, compact: true },
    { title: "Onay bekleyen", value: String(data.reservations.filter((reservation) => reservation.status === "pending").length), tone: "wait", icon: CalendarCheck, compact: true },
    { title: "Boş odalar", value: String(data.rooms.filter((room) => getRoomDisplayInfo(room, data.reservations).status === "available").length), tone: "ok", icon: BedDouble, compact: true }
  ];

  return (
    <section className="combined-page pension-page" aria-label="Pansiyon yönetimi">
      <div className="operation-summary-grid">
        {metrics.map((metric) => <MetricCard {...metric} key={metric.title} />)}
      </div>
      <div className="pension-layout">
        <section className="combined-section pension-reservations-section">
          <div className="combined-section-heading"><span>Rezervasyonlar</span><strong>Konaklama takibi</strong></div>
          {reservations}
        </section>
        <aside className="combined-section pension-rooms-section">
          <div className="combined-section-heading"><span>Odalar</span><strong>Anlık oda durumu</strong></div>
          {rooms}
        </aside>
        <section className="combined-section pension-tasks-section">
          <div className="combined-section-heading"><span>Günlük işler</span><strong>Giriş, çıkış, temizlik ve bakım</strong></div>
          {tasks}
        </section>
      </div>
    </section>
  );
}
