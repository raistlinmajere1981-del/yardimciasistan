import { BedDouble, CalendarCheck, ChevronDown, LogIn, LogOut } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { DesktopDashboardData } from "../../electron/database";
import { getRoomDisplayInfo } from "../app/operations";
import { RoomFolioWorkspace } from "../components/pension/RoomFolioWorkspace";

interface PensionPageProps {
  data: DesktopDashboardData;
  reservations: ReactNode;
  rooms: ReactNode;
  stays: ReactNode;
  tasks: ReactNode;
}

interface PensionQuickStat {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: "info" | "wait" | "ok" | "neutral";
}

function localDateKey() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function PensionPage({ data, reservations, rooms, stays, tasks }: PensionPageProps) {
  const today = localDateKey();
  const activeReservations = data.reservations.filter((reservation) => !["rejected", "cancelled", "completed"].includes(reservation.status));
  const quickStats: PensionQuickStat[] = [
    {
      label: "Bugün giriş",
      value: activeReservations.filter((reservation) => reservation.startDate === today).length,
      icon: LogIn,
      tone: "info"
    },
    {
      label: "Bugün çıkış",
      value: activeReservations.filter((reservation) => reservation.endDate === today).length,
      icon: LogOut,
      tone: "neutral"
    },
    {
      label: "Onay bekleyen",
      value: data.reservations.filter((reservation) => reservation.status === "pending").length,
      icon: CalendarCheck,
      tone: "wait"
    },
    {
      label: "Boş oda",
      value: data.rooms.filter((room) => getRoomDisplayInfo(room, data.reservations).status === "available").length,
      icon: BedDouble,
      tone: "ok"
    }
  ];
  const roomFolioRefreshKey = [
    ...data.customerRoomStays.map((stay) => `${stay.id}:${stay.status}:${stay.updatedAt}`),
    ...data.rooms.map((room) => `${room.id}:${room.status}:${room.updatedAt}`)
  ].join("|");

  return (
    <section className="combined-page pension-page" aria-label="Pansiyon yönetimi">
      <section className="pension-today-strip" aria-labelledby="pension-summary-title">
        <div className="pension-today-copy">
          <span className="operation-panel-eyebrow">Bugün</span>
          <h2 id="pension-summary-title">Konaklama durumu</h2>
        </div>
        <div className="pension-today-stats">
          {quickStats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div className={`pension-today-stat tone-${stat.tone}`} key={stat.label}>
                <Icon size={17} aria-hidden="true" />
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            );
          })}
        </div>
      </section>

      <RoomFolioWorkspace refreshKey={roomFolioRefreshKey} />

      <div className="pension-layout pension-primary-layout">
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
        <section className="operation-group-panel pension-tasks-section" aria-labelledby="pension-tasks-title">
          <header className="operation-panel-heading">
            <span className="operation-panel-eyebrow">Günlük İşler</span>
            <h2 id="pension-tasks-title">Günlük Konaklama İşleri</h2>
            <p>Giriş, çıkış, temizlik, bakım ve kendi eklediğiniz işler</p>
          </header>
          <div className="operation-panel-content">{tasks}</div>
        </section>
      </div>

      <details className="pension-archive-details">
        <summary>
          <span className="pension-archive-summary-copy">
            <span className="operation-panel-eyebrow">Geçmiş kayıtlar</span>
            <strong>Konaklama Geçmişini Göster</strong>
            <small>Planlanan, devam eden ve tamamlanan eski oda kayıtları</small>
          </span>
          <span className="pension-archive-summary-action">Aç <ChevronDown size={16} aria-hidden="true" /></span>
        </summary>
        <section className="operation-group-panel pension-stays-section" aria-labelledby="pension-stays-title">
          <header className="operation-panel-heading">
            <span className="operation-panel-eyebrow">Müşteri · Oda</span>
            <h2 id="pension-stays-title">Konaklama Arşivi</h2>
            <p>Planlanan, devam eden ve tamamlanan oda ilişkileri</p>
          </header>
          <div className="operation-panel-content">{stays}</div>
        </section>
      </details>
    </section>
  );
}
