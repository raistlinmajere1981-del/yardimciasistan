import { BedDouble, CalendarCheck, ChevronDown, LogIn, LogOut, ReceiptText } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { getReservationDomain } from "@yardimci-asistan/shared";
import type { DesktopDashboardData } from "../../electron/database";
import { getRoomDisplayInfo } from "../app/operations";
import { RoomFolioWorkspace } from "../components/pension/RoomFolioWorkspace";

interface PensionPageProps {
  data: DesktopDashboardData;
  reservationsEnabled: boolean;
  staysEnabled: boolean;
  folioEnabled: boolean;
  menuEnabled: boolean;
  tasksEnabled: boolean;
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

export function PensionPage({
  data,
  reservationsEnabled,
  staysEnabled,
  folioEnabled,
  menuEnabled,
  tasksEnabled,
  reservations,
  rooms,
  stays,
  tasks
}: PensionPageProps) {
  const roomFolioDetailsRef = useRef<HTMLDetailsElement>(null);
  const today = localDateKey();
  const accommodationReservations = data.reservations.filter((reservation) => {
    const domain = getReservationDomain(reservation.reservationType, {
      roomIds: reservation.roomIds,
      tableIds: reservation.tableIds
    });
    return domain === "accommodation" || domain === "mixed" || domain === "generic";
  });
  const activeReservations = accommodationReservations.filter((reservation) => !["rejected", "cancelled", "completed"].includes(reservation.status));
  const quickStats: PensionQuickStat[] = [
    ...(reservationsEnabled ? [{
      label: "Bugün giriş",
      value: activeReservations.filter((reservation) => reservation.startDate === today).length,
      icon: LogIn,
      tone: "info" as const
    },
    {
      label: "Bugün çıkış",
      value: activeReservations.filter((reservation) => reservation.endDate === today).length,
      icon: LogOut,
      tone: "neutral" as const
    },
    {
      label: "Onay bekleyen",
      value: accommodationReservations.filter((reservation) => reservation.status === "pending").length,
      icon: CalendarCheck,
      tone: "wait" as const
    }] : []),
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

  function openRoomFolio() {
    const details = roomFolioDetailsRef.current;
    if (!details) return;
    details.open = true;
    window.requestAnimationFrame(() => {
      details.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <section className="combined-page pension-page" aria-label="Pansiyon yönetimi">
      <section className="pension-today-strip" aria-labelledby="pension-summary-title">
        <div className="pension-today-copy">
          <span className="operation-panel-eyebrow">Bugün</span>
          <h2 id="pension-summary-title">{reservationsEnabled || staysEnabled ? "Konaklama durumu" : "Oda durumu"}</h2>
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

      <div className="pension-layout pension-primary-layout">
        {reservationsEnabled && (
          <section className="operation-group-panel pension-reservations-section" aria-labelledby="pension-reservations-title">
            <header className="operation-panel-heading">
              <span className="operation-panel-eyebrow">Konaklama</span>
              <h2 id="pension-reservations-title">Rezervasyon Takibi</h2>
              <p>Onay bekleyen ve yaklaşan konaklamalar</p>
            </header>
            <div className="operation-panel-content">{reservations}</div>
          </section>
        )}
        <aside className="operation-group-panel pension-rooms-section" aria-labelledby="pension-rooms-title">
          <header className="operation-panel-heading pension-room-heading">
            <div className="pension-room-heading-copy">
              <span className="operation-panel-eyebrow">Odalar</span>
              <h2 id="pension-rooms-title">Anlık Oda Durumu</h2>
              <p>Odaların güncel kullanım durumu</p>
            </div>
            {folioEnabled && (
              <button
                className="pension-folio-shortcut"
                type="button"
                aria-controls="pension-room-folio"
                onClick={openRoomFolio}
              >
                <ReceiptText size={15} aria-hidden="true" />
                Oda Hesapları
              </button>
            )}
          </header>
          <div className="operation-panel-content">{rooms}</div>
        </aside>
        {tasksEnabled && <section className="operation-group-panel pension-tasks-section" aria-labelledby="pension-tasks-title">
          <header className="operation-panel-heading">
            <span className="operation-panel-eyebrow">Günlük İşler</span>
            <h2 id="pension-tasks-title">Günlük Konaklama İşleri</h2>
            <p>{reservationsEnabled || staysEnabled
              ? "Giriş, çıkış, temizlik, bakım ve kendi eklediğiniz işler"
              : "Temizlik, bakım ve kendi eklediğiniz işler"}</p>
          </header>
          <div className="operation-panel-content">{tasks}</div>
        </section>}
      </div>

      {folioEnabled && <details
        className="pension-archive-details pension-folio-details"
        id="pension-room-folio"
        ref={roomFolioDetailsRef}
      >
        <summary>
          <span className="pension-archive-summary-copy">
            <span className="operation-panel-eyebrow">Oda hesabı</span>
            <strong>Oda Hesabı ve Tahsilat</strong>
            <small>Konaklama tutarı, ek harcamalar ve ödeme işlemleri</small>
          </span>
          <span className="pension-archive-summary-action">Hesapları Aç <ChevronDown size={16} aria-hidden="true" /></span>
        </summary>
        <RoomFolioWorkspace refreshKey={roomFolioRefreshKey} menuEnabled={menuEnabled} />
      </details>}

      {staysEnabled && <details className="pension-archive-details">
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
      </details>}
    </section>
  );
}
