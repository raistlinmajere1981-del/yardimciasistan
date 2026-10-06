import type { DatabaseSync } from "node:sqlite";
import type { PublicRoomAvailabilityInput } from "../public-room-availability-publication";
import { parseStoredStringArray } from "./string-array-utils";

/** The public contract accepts arbitrary date ranges: no implicit horizon or
 * presentation limit. Read only blockers of publishable rooms, without PII.
 * One statement gives rooms and blockers the same SQLite read snapshot.
 */
export function getPublicRoomAvailabilityInput(db: DatabaseSync): PublicRoomAvailabilityInput {
  const rows = db.prepare(`
    WITH public_rooms AS (
      SELECT id, name, number, capacity, status, sort_order FROM rooms
      WHERE deleted_at = '' AND is_active = 1
    )
    SELECT 'room' AS kind, id, name, number, capacity, status,
      '' AS start_date, '' AS end_date, '' AS room_ids_json, sort_order
    FROM public_rooms
    UNION ALL
    SELECT 'reservation', '', '', '', 0, status, start_date, end_date, room_ids_json, 0
    FROM reservations
    WHERE deleted_at = '' AND status IN ('pending', 'approved')
      AND EXISTS (SELECT 1 FROM json_each(reservations.room_ids_json) assigned
        JOIN public_rooms room ON room.id = assigned.value)
    UNION ALL
    SELECT 'stay', room_id, '', '', 0, status, check_in_date, check_out_date, '', 0
    FROM customer_room_stays
    WHERE deleted_at = '' AND status IN ('planned', 'checked_in')
      AND room_id IN (SELECT id FROM public_rooms)
    ORDER BY kind, sort_order, number, name, id, start_date, end_date, room_ids_json
  `).all() as Array<Record<string, unknown>>;
  const input: PublicRoomAvailabilityInput = { rooms: [], reservations: [], customerRoomStays: [] };
  for (const row of rows) {
    if (row.kind === "room") input.rooms.push({ id: String(row.id), name: String(row.name), number: String(row.number),
      capacity: Number(row.capacity), status: String(row.status), isActive: true });
    else if (row.kind === "reservation") input.reservations.push({ status: String(row.status) as "pending" | "approved",
      startDate: String(row.start_date), endDate: String(row.end_date), roomIds: parseStoredStringArray(row.room_ids_json) });
    else input.customerRoomStays.push({ roomId: String(row.id), status: String(row.status) as "planned" | "checked_in",
      checkInDate: String(row.start_date), checkOutDate: String(row.end_date) });
  }
  return input;
}
