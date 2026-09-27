import type { DatabaseSync } from "node:sqlite";
import type { DesktopCustomerRoomStay } from "../database-types.js";

export function getCustomerRoomStays(db: DatabaseSync, scope: "recent" | "active" = "recent"): DesktopCustomerRoomStay[] {
  const rows = db
    .prepare(`
        SELECT
          customer_room_stays.id,
          customer_room_stays.customer_id,
          customers.full_name AS customer_name,
          customers.phone AS customer_phone,
          customer_room_stays.room_id,
          rooms.name AS room_name,
          rooms.number AS room_number,
          customer_room_stays.reservation_id,
          customer_room_stays.status,
          customer_room_stays.check_in_date,
          customer_room_stays.check_out_date,
          customer_room_stays.guest_count,
          customer_room_stays.notes,
          customer_room_stays.source,
          customer_room_stays.checked_in_at,
          customer_room_stays.checked_out_at,
          customer_room_stays.created_at,
          customer_room_stays.updated_at
        FROM customer_room_stays
        JOIN customers ON customers.id = customer_room_stays.customer_id
        JOIN rooms ON rooms.id = customer_room_stays.room_id
        WHERE customer_room_stays.deleted_at = ''
        ${scope === "active" ? "AND customer_room_stays.status IN ('planned', 'checked_in')" : ""}
        ORDER BY
          CASE customer_room_stays.status
            WHEN 'checked_in' THEN 0
            WHEN 'planned' THEN 1
            WHEN 'checked_out' THEN 2
            ELSE 3
          END,
          customer_room_stays.check_in_date DESC,
          customer_room_stays.created_at DESC
        ${scope === "recent" ? "LIMIT 500" : ""}
      `)
    .all() as Array<Record<string, unknown>>;

  return rows.map((row) => mapCustomerRoomStayRow(row));
}

function mapCustomerRoomStayRow(row: Record<string, unknown>): DesktopCustomerRoomStay {
  return {
    id: String(row.id ?? ""),
    customerId: String(row.customer_id ?? ""),
    customerName: String(row.customer_name ?? ""),
    customerPhone: String(row.customer_phone ?? ""),
    roomId: String(row.room_id ?? ""),
    roomName: String(row.room_name ?? ""),
    roomNumber: String(row.room_number ?? ""),
    reservationId: String(row.reservation_id ?? ""),
    status: String(row.status ?? "planned"),
    checkInDate: String(row.check_in_date ?? ""),
    checkOutDate: String(row.check_out_date ?? ""),
    guestCount: Number(row.guest_count ?? 1),
    notes: String(row.notes ?? ""),
    source: String(row.source ?? "manual"),
    checkedInAt: String(row.checked_in_at ?? ""),
    checkedOutAt: String(row.checked_out_at ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

interface ActiveCustomerRoomStayReference {
  id: string;
  roomId: string;
  roomName: string;
  roomNumber: string;
  status: string;
}

export function findActiveCustomerRoomStay(
  db: DatabaseSync,
  customerId: string,
  excludedStayId = ""
): ActiveCustomerRoomStayReference | null {
  if (!customerId) return null;
  const row = db.prepare(`
      SELECT
        customer_room_stays.id,
        customer_room_stays.room_id,
        customer_room_stays.status,
        rooms.name AS room_name,
        rooms.number AS room_number
      FROM customer_room_stays
      JOIN rooms ON rooms.id = customer_room_stays.room_id
      WHERE customer_room_stays.customer_id = ?
        AND customer_room_stays.id != ?
        AND customer_room_stays.status IN ('planned', 'checked_in')
        AND customer_room_stays.deleted_at = ''
      ORDER BY CASE customer_room_stays.status WHEN 'checked_in' THEN 0 ELSE 1 END,
        customer_room_stays.created_at DESC
      LIMIT 1
    `).get(customerId, excludedStayId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id ?? ""),
    roomId: String(row.room_id ?? ""),
    roomName: String(row.room_name ?? ""),
    roomNumber: String(row.room_number ?? ""),
    status: String(row.status ?? "")
  };
}

export function hasOverlappingCustomerRoomStay(
  db: DatabaseSync,
  roomId: string,
  checkInDate: string,
  checkOutDate: string,
  excludedStayId = ""
): boolean {
  const rows = db
    .prepare(`
        SELECT id, check_in_date, check_out_date
        FROM customer_room_stays
        WHERE room_id = ?
          AND id != ?
          AND status IN ('planned', 'checked_in')
          AND deleted_at = ''
      `)
    .all(roomId, excludedStayId) as Array<Record<string, unknown>>;
  const candidateEnd = checkOutDate || "9999-12-31";
  return rows.some((row) => {
    const existingStart = String(row.check_in_date ?? "");
    const existingEnd = String(row.check_out_date ?? "") || "9999-12-31";
    return existingStart < candidateEnd && checkInDate < existingEnd;
  });
}
