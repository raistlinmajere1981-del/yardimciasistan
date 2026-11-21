import type { DatabaseSync } from "node:sqlite";

export const DEFAULT_TABLE_RESERVATION_MINUTES = 120;
export const MIN_TABLE_RESERVATION_MINUTES = 30;
export const MAX_TABLE_RESERVATION_MINUTES = 480;

/** Local wall-clock booking minutes; Date.UTC is only for calendar arithmetic
 * and does not depend on the Electron host's local time zone. */
function slotStart(date: string, time: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (year! < 2000 || year! > 2200 || month! < 1 || month! > 12 || day! < 1 || day! > 31
      || hour! > 23 || minute! > 59) return null;
  const epoch = Date.UTC(year!, month! - 1, day, hour, minute);
  const parsed = new Date(epoch);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month! - 1 || parsed.getUTCDate() !== day) return null;
  return epoch / 60_000;
}

export function normalizeTableReservationDuration(value: unknown): number | null {
  const duration = Number(value);
  return Number.isSafeInteger(duration) && duration >= MIN_TABLE_RESERVATION_MINUTES
    && duration <= MAX_TABLE_RESERVATION_MINUTES ? duration : null;
}

export function tableReservationSlot(date: string, time: string, durationMinutes: number) {
  const start = slotStart(date, time);
  return start !== null && normalizeTableReservationDuration(durationMinutes) !== null
    ? { start, end: start + durationMinutes } : null;
}

export function findTableReservationConflict(
  db: DatabaseSync,
  tableId: string,
  date: string,
  time: string,
  durationMinutes = DEFAULT_TABLE_RESERVATION_MINUTES,
  excludedReservationId = ""
): { id: string; title: string } | null {
  const candidate = tableReservationSlot(date, time, durationMinutes);
  if (!tableId || !candidate) throw new Error("Rezervasyon tarihi, saati veya süresi geçersiz.");
  const day = new Date(candidate.start * 60_000);
  const previousDay = new Date(day.getTime() - 24 * 60 * 60_000).toISOString().slice(0, 10);
  const nextDay = new Date(day.getTime() + 24 * 60 * 60_000).toISOString().slice(0, 10);
  const rows = db.prepare(
    "SELECT id, title, start_date, time, duration_minutes, table_ids_json FROM reservations " +
    "WHERE deleted_at='' AND status IN ('pending','approved') AND reservation_type IN ('table','breakfast') " +
    "AND start_date BETWEEN ? AND ? AND id <> ? ORDER BY start_date, time, id"
  ).all(previousDay, nextDay, excludedReservationId) as Array<Record<string, unknown>>;
  for (const row of rows) {
    let tableIds: unknown = [];
    try { tableIds = JSON.parse(String(row.table_ids_json ?? "[]")); } catch { continue; }
    if (!Array.isArray(tableIds) || !tableIds.includes(tableId)) continue;
    const slot = tableReservationSlot(String(row.start_date ?? ""), String(row.time ?? ""),
      normalizeTableReservationDuration(row.duration_minutes) ?? DEFAULT_TABLE_RESERVATION_MINUTES);
    if (slot && candidate.start < slot.end && slot.start < candidate.end) {
      return { id: String(row.id), title: String(row.title ?? "") };
    }
  }
  return null;
}

/** Deterministic capacity-aware local assignment, never a public live-availability claim. */
export function findAvailableRestaurantTable(
  db: DatabaseSync,
  date: string,
  time: string,
  guestCount: number,
  durationMinutes = DEFAULT_TABLE_RESERVATION_MINUTES,
  excludedReservationId = ""
): { id: string; name: string; capacity: number } | null {
  if (!tableReservationSlot(date, time, durationMinutes) || !Number.isSafeInteger(guestCount) || guestCount < 1 || guestCount > 99) {
    return null;
  }
  const tables = db.prepare(
    "SELECT id, name, capacity FROM tables WHERE is_active=1 AND deleted_at='' " +
    "AND status <> 'maintenance' AND capacity >= ? ORDER BY capacity ASC, sort_order ASC, id ASC"
  ).all(guestCount) as Array<{ id: string; name: string; capacity: number }>;
  return tables.find(table => !findTableReservationConflict(db, table.id, date, time, durationMinutes, excludedReservationId)) ?? null;
}
