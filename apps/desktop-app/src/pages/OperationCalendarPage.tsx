import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LogIn,
  LogOut,
  UtensilsCrossed
} from "lucide-react";
import type { DesktopDashboardData } from "../../electron/database";
import { getReservationDomain } from "@yardimci-asistan/shared";
import { ActionButton } from "../components/ui/ActionButton";
import { StatusBadge, type StatusTone } from "../components/ui/StatusBadge";

type CalendarViewMode = "day" | "week";
type ReservationRecord = DesktopDashboardData["reservations"][number];
type DailyTaskRecord = DesktopDashboardData["dailyTasks"][number];

type CalendarItem =
  | {
      key: string;
      kind: "arrival" | "departure" | "restaurant";
      title: string;
      meta: string;
      detail: string;
      time: string;
      reservation: ReservationRecord;
    }
  | {
      key: string;
      kind: "task";
      title: string;
      meta: string;
      detail: string;
      time: string;
      task: DailyTaskRecord;
    };

interface OperationCalendarPageProps {
  data: DesktopDashboardData;
  accommodationReservationsEnabled: boolean;
  foodReservationsEnabled: boolean;
  tasksEnabled: boolean;
  onOpenReservation: (reservation: ReservationRecord) => void;
  onCompleteTask: (taskId: string) => void;
}

const hiddenReservationStatuses = new Set(["rejected", "cancelled"]);

export function OperationCalendarPage({
  data,
  accommodationReservationsEnabled,
  foodReservationsEnabled,
  tasksEnabled,
  onOpenReservation,
  onCompleteTask
}: OperationCalendarPageProps) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateKey(new Date()));

  const visibleDates = useMemo(
    () => (viewMode === "day" ? [selectedDate] : buildWeekDates(selectedDate)),
    [selectedDate, viewMode]
  );
  const dayEntries = useMemo(
    () => visibleDates.map((date) => ({
      date,
      items: buildCalendarItems(
        date,
        data,
        accommodationReservationsEnabled,
        foodReservationsEnabled
      )
    })),
    [accommodationReservationsEnabled, data, foodReservationsEnabled, visibleDates]
  );
  const summary = useMemo(() => {
    const items = dayEntries.flatMap((entry) => entry.items);
    return {
      arrivals: items.filter((item) => item.kind === "arrival").length,
      departures: items.filter((item) => item.kind === "departure").length,
      restaurant: items.filter((item) => item.kind === "restaurant").length,
      pendingTasks: items.filter((item) => item.kind === "task" && item.task.status === "pending").length
    };
  }, [dayEntries]);

  const moveRange = (direction: -1 | 1) => {
    setSelectedDate((current) => addDays(current, direction * (viewMode === "week" ? 7 : 1)));
  };

  return (
    <section className="operation-calendar-page" aria-label="Operasyon takvimi">
      <div className="operation-calendar-toolbar page-toolbar panel">
        <div className="operation-calendar-title-block">
          <div className="operation-calendar-title-icon" aria-hidden="true">
            <CalendarDays size={22} />
          </div>
          <div>
            <strong>{formatRangeTitle(visibleDates)}</strong>
            <span>{(accommodationReservationsEnabled || foodReservationsEnabled) && tasksEnabled
              ? "Etkin rezervasyon alanları ve günlük işler tek görünümde."
              : accommodationReservationsEnabled || foodReservationsEnabled
                ? "Etkin rezervasyon alanları tek görünümde."
                : tasksEnabled ? "Günlük işler tek görünümde." : "Etkin takvim alanı bulunmuyor."}</span>
          </div>
        </div>

        <div className="operation-calendar-controls">
          <div className="operation-calendar-view-switch" aria-label="Takvim görünümü">
            <button
              className={viewMode === "day" ? "is-active" : ""}
              type="button"
              aria-pressed={viewMode === "day"}
              onClick={() => setViewMode("day")}
            >
              Gün
            </button>
            <button
              className={viewMode === "week" ? "is-active" : ""}
              type="button"
              aria-pressed={viewMode === "week"}
              onClick={() => setViewMode("week")}
            >
              Hafta
            </button>
          </div>
          <div className="operation-calendar-range-controls">
            <ActionButton variant="secondary" size="sm" type="button" aria-label="Önceki dönem" onClick={() => moveRange(-1)}>
              <ChevronLeft size={16} aria-hidden="true" />
            </ActionButton>
            <ActionButton variant="secondary" size="sm" type="button" onClick={() => setSelectedDate(toLocalDateKey(new Date()))}>
              Bugün
            </ActionButton>
            <ActionButton variant="secondary" size="sm" type="button" aria-label="Sonraki dönem" onClick={() => moveRange(1)}>
              <ChevronRight size={16} aria-hidden="true" />
            </ActionButton>
            <label className="operation-calendar-date-picker">
              <span>Tarih</span>
              <input type="date" lang="tr" value={selectedDate} onChange={(event) => event.target.value && setSelectedDate(event.target.value)} />
            </label>
          </div>
        </div>
      </div>

      <div className="operation-calendar-summary" aria-label="Takvim özeti">
        {accommodationReservationsEnabled && <StatusBadge tone="info">{summary.arrivals} giriş</StatusBadge>}
        {accommodationReservationsEnabled && <StatusBadge tone="neutral">{summary.departures} çıkış</StatusBadge>}
        {foodReservationsEnabled && <StatusBadge tone="ok">{summary.restaurant} restoran rezervasyonu</StatusBadge>}
        {tasksEnabled && <StatusBadge tone="wait">{summary.pendingTasks} bekleyen iş</StatusBadge>}
      </div>

      <div className={`operation-calendar-grid ${viewMode === "day" ? "is-day" : "is-week"}`}>
        {dayEntries.map(({ date, items }) => {
          const isToday = date === toLocalDateKey(new Date());
          return (
            <article className={`operation-calendar-day panel ${isToday ? "is-today" : ""}`} key={date}>
              <header className="operation-calendar-day-header">
                <div>
                  <span>{formatWeekday(date)}</span>
                  <strong>{formatCalendarDate(date)}</strong>
                </div>
                <StatusBadge tone={isToday ? "ok" : "neutral"}>{isToday ? "Bugün" : `${items.length} kayıt`}</StatusBadge>
              </header>

              <div className="operation-calendar-day-body">
                {items.length === 0 ? (
                  <div className="operation-calendar-empty">Planlanan kayıt yok.</div>
                ) : (
                  items.map((item) => (
                    <CalendarItemRow
                      key={item.key}
                      item={item}
                      rooms={data.rooms}
                      tables={data.tables}
                      onOpenReservation={onOpenReservation}
                      onCompleteTask={onCompleteTask}
                    />
                  ))
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CalendarItemRow({
  item,
  rooms,
  tables,
  onOpenReservation,
  onCompleteTask
}: {
  item: CalendarItem;
  rooms: DesktopDashboardData["rooms"];
  tables: DesktopDashboardData["tables"];
  onOpenReservation: (reservation: ReservationRecord) => void;
  onCompleteTask: (taskId: string) => void;
}) {
  const tone = getCalendarItemTone(item);
  const icon = getCalendarItemIcon(item);
  const label = getCalendarItemLabel(item);

  return (
    <div className={`operation-calendar-item item-${item.kind}`}>
      <div className="operation-calendar-item-topline">
        <span className="operation-calendar-item-icon" aria-hidden="true">{icon}</span>
        <StatusBadge tone={tone}>{label}</StatusBadge>
        {item.time && <span className="operation-calendar-item-time">{item.time}</span>}
      </div>
      <strong className="operation-calendar-item-title">{item.title}</strong>
      <span className="operation-calendar-item-meta">
        {item.kind === "task"
          ? item.meta
          : [
              item.meta,
              item.kind === "restaurant"
                ? formatReservationTables(item.reservation, tables)
                : formatReservationRooms(item.reservation, rooms)
            ].filter(Boolean).join(" · ")}
      </span>
      {item.detail && <p>{item.detail}</p>}
      <div className="operation-calendar-item-actions">
        {item.kind === "task" ? (
          item.task.status === "pending" && (
            <ActionButton size="sm" type="button" onClick={() => onCompleteTask(item.task.id)}>
              <CheckCircle2 size={14} aria-hidden="true" />
              Tamamla
            </ActionButton>
          )
        ) : (
          <ActionButton variant="secondary" size="sm" type="button" onClick={() => onOpenReservation(item.reservation)}>
            Aç
          </ActionButton>
        )}
      </div>
    </div>
  );
}

function buildCalendarItems(
  date: string,
  data: DesktopDashboardData,
  accommodationReservationsEnabled: boolean,
  foodReservationsEnabled: boolean
): CalendarItem[] {
  const items: CalendarItem[] = [];

  for (const reservation of data.reservations) {
    if (hiddenReservationStatuses.has(reservation.status)) continue;
    const domain = getReservationDomain(reservation.reservationType, {
      roomIds: reservation.roomIds,
      tableIds: reservation.tableIds
    });
    const isRestaurant = domain === "food_service"
      || (domain === "generic" && foodReservationsEnabled && !accommodationReservationsEnabled);
    if (isRestaurant) {
      const eventDate = reservation.startDate || reservation.endDate;
      if (eventDate === date) {
        items.push({
          key: `restaurant:${reservation.id}`,
          kind: "restaurant",
          title: reservation.title || reservation.customerName || "Restoran rezervasyonu",
          meta: `${Math.max(1, reservation.guestCount)} kişi`,
          detail: reservation.notes || reservation.priceNote || "",
          time: reservation.time || "",
          reservation
        });
      }
      continue;
    }

    if (reservation.startDate === date) {
      items.push({
        key: `arrival:${reservation.id}`,
        kind: "arrival",
        title: reservation.title || reservation.customerName || "Konaklama rezervasyonu",
        meta: `${Math.max(1, reservation.guestCount)} kişi`,
        detail: reservation.notes || reservation.priceNote || "",
        time: reservation.time || "",
        reservation
      });
    }
    if (reservation.endDate === date && reservation.endDate !== reservation.startDate) {
      items.push({
        key: `departure:${reservation.id}`,
        kind: "departure",
        title: reservation.title || reservation.customerName || "Konaklama rezervasyonu",
        meta: `${Math.max(1, reservation.guestCount)} kişi`,
        detail: reservation.notes || reservation.priceNote || "",
        time: reservation.time || "",
        reservation
      });
    }
  }

  for (const task of data.dailyTasks) {
    if (task.dueDate !== date || ["archived", "cancelled"].includes(task.status)) continue;
    items.push({
      key: `task:${task.id}`,
      kind: "task",
      title: task.title,
      meta: task.status === "done" ? "Tamamlandı" : "Bekliyor",
      detail: task.description || "",
      time: task.dueTime || "",
      task
    });
  }

  return items.sort((left, right) => {
    const leftTime = left.time || "99:99";
    const rightTime = right.time || "99:99";
    if (leftTime !== rightTime) return leftTime.localeCompare(rightTime);
    return calendarItemOrder(left.kind) - calendarItemOrder(right.kind);
  });
}

function getCalendarItemTone(item: CalendarItem): StatusTone {
  if (item.kind === "task") return item.task.status === "done" ? "ok" : "wait";
  if (item.kind === "arrival") return "info";
  if (item.kind === "departure") return "neutral";
  return "ok";
}

function getCalendarItemLabel(item: CalendarItem) {
  if (item.kind === "task") return item.task.status === "done" ? "İş tamamlandı" : "Günlük iş";
  if (item.kind === "arrival") return "Giriş";
  if (item.kind === "departure") return "Çıkış";
  return "Restoran";
}

function getCalendarItemIcon(item: CalendarItem) {
  if (item.kind === "arrival") return <LogIn size={15} />;
  if (item.kind === "departure") return <LogOut size={15} />;
  if (item.kind === "restaurant") return <UtensilsCrossed size={15} />;
  return <ClipboardList size={15} />;
}

function calendarItemOrder(kind: CalendarItem["kind"]) {
  const order: Record<CalendarItem["kind"], number> = { departure: 0, arrival: 1, restaurant: 2, task: 3 };
  return order[kind];
}

function formatReservationRooms(reservation: ReservationRecord, rooms: DesktopDashboardData["rooms"]) {
  if (reservation.roomIds.length === 0) return "Oda atanmadı";
  const roomNames = reservation.roomIds
    .map((roomId) => rooms.find((room) => room.id === roomId)?.name)
    .filter((name): name is string => Boolean(name));
  return roomNames.length > 0 ? roomNames.join(", ") : "Oda atanmadı";
}

function formatReservationTables(reservation: ReservationRecord, tables: DesktopDashboardData["tables"]) {
  if (reservation.tableIds.length === 0) return "Masa atanmadı";
  const tableNames = reservation.tableIds
    .map((tableId) => tables.find((table) => table.id === tableId)?.name)
    .filter((name): name is string => Boolean(name));
  return tableNames.length > 0 ? tableNames.join(", ") : "Masa atanmadı";
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, Math.max(0, month - 1), day, 12, 0, 0, 0);
}

function addDays(dateKey: string, amount: number) {
  const date = parseLocalDate(dateKey);
  date.setDate(date.getDate() + amount);
  return toLocalDateKey(date);
}

function buildWeekDates(dateKey: string) {
  const selected = parseLocalDate(dateKey);
  const weekday = selected.getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = addDays(dateKey, mondayOffset);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

function formatRangeTitle(dates: string[]) {
  if (dates.length === 1) return formatLongDate(dates[0]);
  return `${formatShortRangeDate(dates[0])} – ${formatLongDate(dates[dates.length - 1])}`;
}

function formatWeekday(dateKey: string) {
  return new Intl.DateTimeFormat("tr-TR", { weekday: "long" }).format(parseLocalDate(dateKey));
}

function formatCalendarDate(dateKey: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long" }).format(parseLocalDate(dateKey));
}

function formatLongDate(dateKey: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(parseLocalDate(dateKey));
}

function formatShortRangeDate(dateKey: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(parseLocalDate(dateKey));
}
