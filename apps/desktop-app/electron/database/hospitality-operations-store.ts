import type { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES as C, type BusinessCapability } from "@yardimci-asistan/shared";
import type { DesktopRoom, DesktopTable, DesktopRoomOperations, DesktopTableOperations } from "../database-types.js";
import { getCustomerRoomStays } from "./customer-room-stay-store.js";
import { getReservations } from "./reservation-store.js";

/** Bulk dashboard projections. Never read active work from bounded history queries. */
export function getHospitalityOperations(db: DatabaseSync, rooms: DesktopRoom[], tables: DesktopTable[], enabled: Set<BusinessCapability>) {
  const stays = enabled.has(C.ACCOMMODATION_STAYS) ? getCustomerRoomStays(db, "active") : [];
  const reservations = enabled.has(C.ACCOMMODATION_RESERVATIONS) || enabled.has(C.FOOD_RESERVATIONS)
    ? getReservations(db, "active") : [];
  const accounts = enabled.has(C.ACCOMMODATION_FOLIO) ? db.prepare(`
    SELECT f.id AS folioId, f.room_id AS roomId, f.stay_id AS stayId, s.status AS stayStatus,
      c.full_name AS customerName, t.remaining_minor AS remainingMinor, f.currency
    FROM room_folios f
    JOIN customer_room_stays s ON s.id = f.stay_id
    JOIN customers c ON c.id = f.customer_id
    JOIN room_folio_totals t ON t.folio_id = f.id
    WHERE f.deleted_at = '' AND f.status = 'open'
    ORDER BY f.opened_at, f.id
  `).all() as unknown as Array<DesktopRoomOperations["accounts"][number] & { roomId: string }> : [];
  const orders = enabled.has(C.FOOD_ORDERS) ? db.prepare(`
    SELECT o.id, o.table_id AS tableId, o.status, o.total, o.opened_at AS openedAt, o.updated_at AS updatedAt,
      COALESCE(SUM(CASE WHEN i.status != 'cancelled' THEN i.quantity ELSE 0 END), 0) AS itemCount,
      COALESCE(MAX(CASE WHEN i.status != 'cancelled' THEN i.currency END), 'TRY') AS currency
    FROM table_orders o LEFT JOIN table_order_items i ON i.order_id = o.id
    WHERE o.status IN ('open', 'preparing', 'served', 'payment')
    GROUP BY o.id
  `).all() as Array<NonNullable<DesktopTableOperations["order"]> & { tableId: string }> : [];
  const roomOperations: DesktopRoomOperations[] = enabled.has(C.ACCOMMODATION_ROOMS) ? rooms.map(room => ({
    roomId: room.id,
    stays: stays.filter(stay => stay.roomId === room.id),
    reservations: enabled.has(C.ACCOMMODATION_RESERVATIONS) ? reservations.filter(item => item.roomIds.includes(room.id)) : [],
    accounts: accounts.filter(account => account.roomId === room.id)
  })) : [];
  const tableOperations: DesktopTableOperations[] = enabled.has(C.FOOD_TABLES) ? tables.map(table => ({
    tableId: table.id,
    order: orders.find(order => order.tableId === table.id) ?? null,
    reservations: enabled.has(C.FOOD_RESERVATIONS) ? reservations.filter(item => item.tableIds.includes(table.id)) : []
  })) : [];
  return { roomOperations, tableOperations };
}
