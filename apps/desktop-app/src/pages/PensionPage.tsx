import { CalendarCheck, LogIn, LogOut, BedDouble } from "lucide-react";
import type { ReactNode } from "react";
import type { DesktopDashboardData } from "../../electron/database";
import { getRoomDisplayInfo } from "../app/operations";
import { MetricCard, type MetricCardProps } from "../components/ui/MetricCard";

interface PensionPageProps {
  data: DesktopDashboardData;
  reservations: ReactNode;
  rooms: ReactNode;
  stays: ReactNode;
  tasks: ReactNode;
}

function localDateKey() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function PensionPage({ data, reservations, rooms, stays, tasks }: PensionPageProps) {
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
      <section className="operation-group-panel operation-summary-panel pension-summary-panel" aria-labelledby="pension-summary-title">
        <header className="operation-panel-heading">
          <span className="operation-panel-eyebrow">Konaklama</span>
          <h2 id="pension-summary-title">Bugünkü Konaklama Özeti</h2>
          <p>Giriş, çıkış, onay ve oda uygunluğuna hızlı bakış</p>
        </header>
        <div className="operation-summary-grid">
          {metrics.map((metric) => <MetricCard {...metric} key={metric.title} />)}
        </div>
      </section>
      <div className="pension-layout">
        <section className="operation-group-panel pension-reservations-section" aria-labelledby="pension-reservations-title">
          <header className="operation-panel-heading">
            <span className="operation-panel-eyebrow">Konaklama</span>
            <h2 id="pension-reservations-title">Rezervasyon Takibi</h2>
            <p>Onay bekleyen ve yaklaşan konaklamalar</p>
          </header>
          <div className="operation-panel-content">{reservations}</div>
        </section>
        <aside className="operation-group-panel pension-rooms-section" aria-labelledby="pension-rooms-title">
          <header className="operation-panel-heading">
            <span className="operation-panel-eyebrow">Odalar</span>
            <h2 id="pension-rooms-title">Anlık Oda Durumu</h2>
            <p>Odaların güncel kullanım durumu</p>
          </header>
          <div className="operation-panel-content">{rooms}</div>
        </aside>
        <section className="operation-group-panel pension-stays-section" aria-labelledby="pension-stays-title">
          <header className="operation-panel-heading">
            <span className="operation-panel-eyebrow">Müşteri · Oda</span>
            <h2 id="pension-stays-title">Konaklama Arşivi</h2>
            <p>Planlanan, devam eden ve tamamlanan oda ilişkileri</p>
          </header>
          <div className="operation-panel-content">{stays}</div>
        </section>
        <section className="operation-group-panel pension-tasks-section" aria-labelledby="pension-tasks-title">
          <header className="operation-panel-heading">
            <span className="operation-panel-eyebrow">Günlük İşler</span>
            <h2 id="pension-tasks-title">Günlük Konaklama İşleri</h2>
            <p>Giriş, çıkış, temizlik ve bakım görevleri</p>
          </header>
          <div className="operation-panel-content">{tasks}</div>
        </section>
      </div>
    </section>
  );
}
