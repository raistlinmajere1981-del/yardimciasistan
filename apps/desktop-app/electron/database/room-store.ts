import { parseStoredStringArray } from "./string-array-utils.js";
import type { DatabaseSync } from "node:sqlite";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import type { DesktopRoom } from "../database-types.js";
import { insertDatabaseEvent } from "./event-store.js";

export function getRooms(db: DatabaseSync, reservationTitles: Map<string, string>): DesktopRoom[] {
  const rows = db
    .prepare(`
        SELECT
          id,
          name,
          number,
          capacity,
          bed_info,
          floor,
          status,
          features_json,
          description,
          price_note,
          is_active,
          sort_order,
          updated_at
        FROM rooms
        WHERE deleted_at = ''
        ORDER BY sort_order ASC, number ASC, name ASC
      `)
    .all() as Array<Record<string, unknown>>;

  return rows.map((row) => mapRoomRow(row, reservationTitles));
}

function mapRoomRow(row: Record<string, unknown>, reservationTitles: Map<string, string>): DesktopRoom {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    number: String(row.number ?? ""),
    capacity: Number(row.capacity ?? 0),
    bedInfo: String(row.bed_info ?? ""),
    floor: String(row.floor ?? ""),
    status: String(row.status ?? "available"),
    features: parseStoredStringArray(row.features_json),
    description: String(row.description ?? ""),
    priceNote: String(row.price_note ?? ""),
    isActive: Number(row.is_active ?? 0) === 1,
    sortOrder: Number(row.sort_order ?? 0),
    activeReservationTitle: reservationTitles.get(String(row.id ?? "")) ?? "",
    updatedAt: String(row.updated_at ?? "")
  };
}

export function updateRoomStatus(
  db: DatabaseSync,
  roomId: string,
  status: string,
  oldStatus: string,
  now: string,
  androidAction?: AndroidSyncAction
): { ok: true; message: string } | { ok: false; message: string } {
  db.exec("SAVEPOINT room_status");
  try {
    db.prepare("UPDATE rooms SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?").run(status, now, roomId);
    insertDatabaseEvent(db, {
      type: "room.status_changed",
      ...(androidAction !== undefined ? { androidAction } : {}),
      entityType: "room",
      entityId: roomId,
      payload: {
        old_status: oldStatus,
        new_status: status
      },
      now
    });
    db.exec("RELEASE room_status");
  } catch (error) {
    db.exec("ROLLBACK TO room_status; RELEASE room_status");
    throw error;
  }

  return {
    ok: true,
    message: "Oda durumu güncellendi."
  };
}
