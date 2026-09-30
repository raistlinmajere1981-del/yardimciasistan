import type { DatabaseSync } from "node:sqlite";
import type {
  DesktopPaymentWaitingTableOrder,
  DesktopTableOrder,
  DesktopTableOrderItem,
  DesktopTableOrderResult,
  TableOrderItemStatus,
  TableOrderStatus
} from "../database-types.js";
import type { AndroidActionMutationResult } from "./android-utils.js";
import { androidPayloadString } from "./android-utils.js";
import { mutateMenuStockInTransaction } from "./menu-stock-store.js";
import { nextMutationTimestamp } from "./android-utils.js";
import { normalizeStockPrecision, normalizeTableOrderCurrency, roundMoney } from "./stock-utils.js";

export function listTableOrders(db: DatabaseSync): DesktopTableOrder[] {
  const rows = db
    .prepare(`
        SELECT
          table_orders.*,
          tables.name AS table_name,
          COALESCE(SUM(
            CASE
              WHEN table_order_items.status != 'cancelled' THEN table_order_items.quantity
              ELSE 0
            END
          ), 0) AS item_count
        FROM table_orders
        INNER JOIN tables ON tables.id = table_orders.table_id
        LEFT JOIN table_order_items ON table_order_items.order_id = table_orders.id
        GROUP BY table_orders.id
        ORDER BY table_orders.opened_at DESC, table_orders.created_at DESC
      `)
    .all() as Array<Record<string, unknown>>;

  return rows.map((row) => mapTableOrderRow(db, row));
}

export function listPaymentWaitingTableOrders(db: DatabaseSync): DesktopPaymentWaitingTableOrder[] {
  const rows = db
    .prepare(`
        SELECT
          table_orders.id,
          table_orders.table_id,
          tables.name AS table_name,
          table_orders.total,
          table_orders.opened_at,
          table_orders.updated_at,
          COALESCE(MAX(
            CASE
              WHEN table_order_items.status != 'cancelled' THEN table_order_items.currency
              ELSE NULL
            END
          ), 'TRY') AS currency
        FROM table_orders
        INNER JOIN tables ON tables.id = table_orders.table_id
        LEFT JOIN table_order_items ON table_order_items.order_id = table_orders.id
        WHERE table_orders.status = 'payment'
        GROUP BY table_orders.id
        ORDER BY table_orders.updated_at DESC, table_orders.opened_at DESC
        LIMIT 100
      `)
    .all() as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id ?? ""),
    tableId: String(row.table_id ?? ""),
    tableName: String(row.table_name ?? "Masa"),
    total: roundMoney(Number(row.total ?? 0)),
    currency: normalizeTableOrderCurrency(row.currency),
    openedAt: String(row.opened_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  }));
}

export function getActiveTableOrder(db: DatabaseSync, tableId: string): DesktopTableOrder | null {
  const normalizedTableId = tableId.trim();
  if (!normalizedTableId) {
    return null;
  }

  const row = db
    .prepare(`
        SELECT
          table_orders.*,
          tables.name AS table_name,
          COALESCE(SUM(
            CASE
              WHEN table_order_items.status != 'cancelled' THEN table_order_items.quantity
              ELSE 0
            END
          ), 0) AS item_count
        FROM table_orders
        INNER JOIN tables ON tables.id = table_orders.table_id
        LEFT JOIN table_order_items ON table_order_items.order_id = table_orders.id
        WHERE table_orders.table_id = ?
          AND table_orders.status IN ('open', 'preparing', 'served', 'payment')
        GROUP BY table_orders.id
        LIMIT 1
      `)
    .get(normalizedTableId) as Record<string, unknown> | undefined;

  return row ? mapTableOrderRow(db, row) : null;
}

export function recalculateTableOrderTotal(db: DatabaseSync, orderId: string): DesktopTableOrderResult {
  const normalizedOrderId = orderId.trim();
  if (!normalizedOrderId) {
    return { ok: false, message: "Toplamı hesaplanacak adisyon bulunamadı." };
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    const exists = db.prepare("SELECT id FROM table_orders WHERE id = ?").get(normalizedOrderId);
    if (!exists) {
      db.exec("ROLLBACK");
      return { ok: false, message: "Toplamı hesaplanacak adisyon bulunamadı." };
    }
    recalculateTableOrderTotalInTransaction(db, normalizedOrderId, new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getTableOrderMutationResult(db, normalizedOrderId, "Adisyon toplamı güncellendi.");
}

export function restoreCancelledOrderStockInTransaction(db: DatabaseSync, orderId: string, actorDeviceId: string, now: string): AndroidActionMutationResult {
  const balances = db
    .prepare(`
        SELECT menu_item_id, COALESCE(SUM(quantity_change), 0) AS quantity_balance
        FROM menu_stock_movements
        WHERE source_type = 'table_order'
          AND source_id = ?
          AND type IN ('order_add', 'order_update', 'order_remove')
        GROUP BY menu_item_id
      `)
    .all(orderId) as Array<{ menu_item_id?: string; quantity_balance?: number }>;
  for (const balance of balances) {
    const outstandingQuantity = normalizeStockPrecision(-Number(balance.quantity_balance ?? 0));
    if (outstandingQuantity <= 0) {
      continue;
    }
    const result = mutateMenuStockInTransaction(db, {
      menuItemId: String(balance.menu_item_id ?? ""),
      type: "order_cancel",
      quantityChange: outstandingQuantity,
      sourceType: "table_order",
      sourceId: orderId,
      actorDeviceId,
      note: "Adisyon iptal edildi; ayrılan stok geri eklendi.",
      now
    });
    if (!result.ok) {
      return result;
    }
  }
  return { ok: true, message: "İptal edilen adisyonun stoku geri eklendi." };
}

export function resolveAndroidActiveOrderId(db: DatabaseSync, payload: Record<string, unknown>): string {
  const orderId = androidPayloadString(payload, "order_id");
  if (orderId) {
    return isActiveTableOrder(db, orderId) ? orderId : "";
  }
  const tableId = androidPayloadString(payload, "table_id");
  if (!tableId) {
    return "";
  }
  const order = db
    .prepare("SELECT id FROM table_orders WHERE table_id = ? AND status IN ('open', 'preparing', 'served', 'payment') LIMIT 1")
    .get(tableId) as { id?: string } | undefined;
  return String(order?.id ?? "");
}

export function getTableOrderById(db: DatabaseSync, orderId: string): DesktopTableOrder | null {
  const row = db
    .prepare(`
        SELECT
          table_orders.*,
          tables.name AS table_name,
          COALESCE(SUM(
            CASE
              WHEN table_order_items.status != 'cancelled' THEN table_order_items.quantity
              ELSE 0
            END
          ), 0) AS item_count
        FROM table_orders
        INNER JOIN tables ON tables.id = table_orders.table_id
        LEFT JOIN table_order_items ON table_order_items.order_id = table_orders.id
        WHERE table_orders.id = ?
        GROUP BY table_orders.id
        LIMIT 1
      `)
    .get(orderId) as Record<string, unknown> | undefined;

  return row ? mapTableOrderRow(db, row) : null;
}

function mapTableOrderRow(db: DatabaseSync, row: Record<string, unknown>): DesktopTableOrder {
  const id = String(row.id ?? "");
  return {
    id,
    tableId: String(row.table_id ?? ""),
    tableName: String(row.table_name ?? "Masa"),
    status: String(row.status ?? "open") as TableOrderStatus,
    openedAt: String(row.opened_at ?? ""),
    closedAt: String(row.closed_at ?? ""),
    subtotal: roundMoney(Number(row.subtotal ?? 0)),
    discountTotal: roundMoney(Number(row.discount_total ?? 0)),
    total: roundMoney(Number(row.total ?? 0)),
    note: String(row.note ?? ""),
    itemCount: Number(row.item_count ?? 0),
    items: getTableOrderItems(db, id),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function getTableOrderItems(db: DatabaseSync, orderId: string): DesktopTableOrderItem[] {
  const rows = db
    .prepare(`
        SELECT *
        FROM table_order_items
        WHERE order_id = ?
          AND status != 'cancelled'
        ORDER BY created_at ASC, id ASC
      `)
    .all(orderId) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id ?? ""),
    orderId: String(row.order_id ?? ""),
    menuItemId: String(row.menu_item_id ?? ""),
    productName: String(row.product_name ?? "Ürün"),
    unitPrice: roundMoney(Number(row.unit_price ?? 0)),
    currency: normalizeTableOrderCurrency(row.currency),
    quantity: Number(row.quantity ?? 0),
    lineTotal: roundMoney(Number(row.line_total ?? 0)),
    note: String(row.note ?? ""),
    status: String(row.status ?? "open") as TableOrderItemStatus,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  }));
}

export function getMutableTableOrderItem(db: DatabaseSync, itemId: string): Record<string, unknown> | null {
  if (!itemId) {
    return null;
  }

  const row = db
    .prepare(`
        SELECT
          table_order_items.order_id,
          table_order_items.menu_item_id,
          table_order_items.unit_price,
          table_order_items.quantity,
          table_order_items.updated_at
        FROM table_order_items
        INNER JOIN table_orders ON table_orders.id = table_order_items.order_id
        WHERE table_order_items.id = ?
          AND table_order_items.status != 'cancelled'
          AND table_orders.status IN ('open', 'preparing', 'served', 'payment')
        LIMIT 1
      `)
    .get(itemId) as Record<string, unknown> | undefined;

  return row ?? null;
}

export function findActiveOrderForTables(db: DatabaseSync, tableIds: string[]): { id: string; tableId: string } | null {
  const statement = db.prepare(`
      SELECT id, table_id
      FROM table_orders
      WHERE table_id = ?
        AND status IN ('open', 'preparing', 'served', 'payment')
      LIMIT 1
    `);
  for (const tableId of tableIds) {
    const row = statement.get(tableId) as { id?: string; table_id?: string } | undefined;
    if (row?.id) {
      return { id: row.id, tableId: String(row.table_id ?? tableId) };
    }
  }
  return null;
}

export function isActiveTableOrder(db: DatabaseSync, orderId: string): boolean {
  return Boolean(
    db
      .prepare("SELECT id FROM table_orders WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')")
      .get(orderId)
  );
}

export function recalculateTableOrderTotalInTransaction(db: DatabaseSync, orderId: string, now: string) {
  const row = db
    .prepare(`
        SELECT
          COALESCE(SUM(
            CASE
              WHEN table_order_items.status != 'cancelled' THEN table_order_items.line_total
              ELSE 0
            END
          ), 0) AS subtotal,
          table_orders.discount_total AS discount_total,
          table_orders.updated_at AS updated_at
        FROM table_orders
        LEFT JOIN table_order_items ON table_order_items.order_id = table_orders.id
        WHERE table_orders.id = ?
        GROUP BY table_orders.id
      `)
    .get(orderId) as { subtotal?: number; discount_total?: number; updated_at?: string } | undefined;
  if (!row) {
    throw new Error("Table order not found while recalculating totals.");
  }

  const subtotal = roundMoney(Number(row.subtotal ?? 0));
  const discountTotal = roundMoney(Math.min(subtotal, Math.max(0, Number(row.discount_total ?? 0))));
  const total = roundMoney(Math.max(0, subtotal - discountTotal));
  const updatedAt = nextMutationTimestamp(row.updated_at, now);
  db
    .prepare("UPDATE table_orders SET subtotal = ?, discount_total = ?, total = ?, updated_at = ? WHERE id = ?")
    .run(subtotal, discountTotal, total, updatedAt, orderId);
}

export function getTableOrderMutationResult(db: DatabaseSync, orderId: string, message: string): DesktopTableOrderResult {
  const order = getTableOrderById(db, orderId);
  return order
    ? {
        ok: true,
        message,
        order
      }
    : { ok: false, message: "Adisyon güncellendi ancak yeniden yüklenemedi." };
}
