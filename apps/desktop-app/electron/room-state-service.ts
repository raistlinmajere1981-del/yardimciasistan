import type { DatabaseSync } from "node:sqlite";

/** Persisted room status still carries occupancy/planning while operational condition is projected separately. */
export function refreshRoomStatusFromStays(db: DatabaseSync, roomId: string, now: string, checkoutToCleaning: boolean, activeOnly = false) {
  const active = db.prepare(`
    SELECT status FROM customer_room_stays
    WHERE room_id = ? AND status IN ('checked_in', 'planned') AND deleted_at = ''
    ORDER BY CASE status WHEN 'checked_in' THEN 0 ELSE 1 END, check_in_date ASC LIMIT 1
  `).get(roomId) as { status?: string } | undefined;
  if (activeOnly && !active) return;
  const room = db.prepare("SELECT status FROM rooms WHERE id = ? AND deleted_at = ''").get(roomId) as { status: string } | undefined;
  if (!room) return;
  let next = room.status;
  const operational = ["cleaning", "maintenance", "out_of_service"].includes(room.status);
  if (checkoutToCleaning && active?.status !== "checked_in") {
    next = "cleaning";
  } else if (active) {
    // Planning/occupancy must not erase a persisted operational restriction.
    if (!operational) next = active.status === "checked_in" ? "occupied" : "reserved";
  } else if (["occupied", "reserved"].includes(room.status)) {
    const reservation = db.prepare(`
      SELECT 1 FROM reservations, json_each(reservations.room_ids_json) AS assigned
      WHERE reservations.deleted_at = '' AND reservations.status IN ('pending', 'approved') AND assigned.value = ? LIMIT 1
    `).get(roomId);
    next = reservation ? "reserved" : "available";
  }
  if (next !== room.status) db.prepare("UPDATE rooms SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?").run(next, now, roomId);
}

export function enforceActiveStayRoomStatus(db: DatabaseSync, roomId: string, now: string) {
  refreshRoomStatusFromStays(db, roomId, now, false, true);
}
