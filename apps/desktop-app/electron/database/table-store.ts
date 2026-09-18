import type { DatabaseSync } from "node:sqlite";
import type {
  DesktopTable,
  DesktopTableCategory,
  UpdateTableStatusInput
} from "../database-types.js";
import { insertDatabaseEvent } from "./event-store.js";
import { normalizeStatus } from "./request-utils.js";
import {
  normalizeTableCategoryName,
  tableCategoryKey
} from "./table-category-utils.js";

export function getTables(db: DatabaseSync, reservationTitles: Map<string, string>): DesktopTable[] {
  const rows = db
    .prepare(`
        SELECT
          id,
          name,
          area,
          capacity,
          status,
          current_customer_id,
          current_reservation_id,
          notes,
          is_active,
          sort_order,
          updated_at
        FROM tables
        WHERE deleted_at = ''
        ORDER BY sort_order ASC, area ASC, name ASC
      `)
    .all() as Array<Record<string, unknown>>;

  return rows.map((row) => mapTableRow(row, reservationTitles));
}

export function mapTableRow(row: Record<string, unknown>, reservationTitles: Map<string, string>): DesktopTable {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    area: String(row.area ?? ""),
    capacity: Number(row.capacity ?? 0),
    status: String(row.status ?? "available"),
    currentCustomerId: String(row.current_customer_id ?? ""),
    currentReservationId: String(row.current_reservation_id ?? ""),
    activeReservationTitle: reservationTitles.get(String(row.id ?? "")) ?? "",
    notes: String(row.notes ?? ""),
    isActive: Number(row.is_active ?? 0) === 1,
    sortOrder: Number(row.sort_order ?? 0),
    updatedAt: String(row.updated_at ?? "")
  };
}

export function getTableCategories(db: DatabaseSync): DesktopTableCategory[] {
  const rows = db
    .prepare(`
        SELECT area, sort_order
        FROM tables
        WHERE deleted_at = ''
        ORDER BY sort_order ASC, name ASC
      `)
    .all() as Array<Record<string, unknown>>;
  const categories = new Map<string, DesktopTableCategory>();

  for (const row of rows) {
    const name = normalizeTableCategoryName(row.area);
    const key = tableCategoryKey(name);
    const existing = categories.get(key);
    if (existing) {
      existing.tableCount += 1;
    } else {
      categories.set(key, { name, tableCount: 1 });
    }
  }

  return [...categories.values()];
}

export function updateTableStatus(db: DatabaseSync, input: UpdateTableStatusInput): { ok: true; message: string } | { ok: false; message: string } {
  const tableId = input.tableId.trim();
  const status = normalizeStatus(input.status, ["available", "reserved", "occupied", "bill_waiting", "cleaning"]);
  if (!tableId || !status) {
    return {
      ok: false,
      message: "Masa durumu için geçerli kayıt ve durum seçilmeli."
    };
  }

  const table = db.prepare("SELECT status FROM tables WHERE id = ? AND deleted_at = ''").get(tableId) as { status?: string } | undefined;
  if (!table) {
    return {
      ok: false,
      message: "Masa bulunamadı."
    };
  }

  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE tables SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?").run(status, now, tableId);
    insertDatabaseEvent(db, {
      type: "table.status_changed",
      entityType: "table",
      entityId: tableId,
      payload: {
        old_status: String(table.status ?? ""),
        new_status: status
      },
      now
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    ok: true,
    message: "Masa durumu güncellendi."
  };
}
