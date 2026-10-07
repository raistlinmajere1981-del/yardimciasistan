import type { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES, type BusinessCapability } from "@yardimci-asistan/shared";
import type { DesktopReportAttentionItem, DesktopReportData } from "../database-types.js";
import {
  normalizeMenuStockUnit,
  normalizePositiveStockNumber,
  nullableNumber
} from "./stock-utils.js";
import {
  formatLocalIsoDate,
  formatReportStockQuantity,
  reportReservationCapabilitySqlClause,
  reportTaskCapabilitySqlClause
} from "./report-utils.js";

function getScalarCount(db: DatabaseSync, sql: string, ...params: Array<string | number | null>): number {
  const row = db.prepare(sql).get(...params) as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}

/**
 * Current operational attention is deliberately independent from report periods.
 * Dashboard and AI both consume this projection so "what needs attention now"
 * has one canonical owner.
 */
export function getOperationalAttention(
  db: DatabaseSync,
  enabledCapabilities: ReadonlySet<BusinessCapability>
): DesktopReportData["attention"] {
  const today = formatLocalIsoDate(new Date());
  const requestReportsEnabled = enabledCapabilities.has(BUSINESS_CAPABILITIES.REQUESTS)
    && enabledCapabilities.has(BUSINESS_CAPABILITIES.CUSTOMERS);
  const restaurantReportsEnabled = enabledCapabilities.has(BUSINESS_CAPABILITIES.FOOD_ORDERS);
  const stockReportsEnabled = enabledCapabilities.has(BUSINESS_CAPABILITIES.FOOD_MENU)
    && enabledCapabilities.has(BUSINESS_CAPABILITIES.INVENTORY);
  const reservationCapabilityClause = reportReservationCapabilitySqlClause(enabledCapabilities);
  const taskCapabilityClause = reportTaskCapabilitySqlClause(enabledCapabilities);

  const pendingRequests = requestReportsEnabled ? getScalarCount(db, `
      SELECT COUNT(*) AS count
      FROM requests
      WHERE deleted_at = ''
        AND status IN ('new', 'seen', 'waiting_owner', 'pending', 'in_progress')
    `) : 0;

  const pendingReservations = getScalarCount(db, `
      SELECT COUNT(*) AS count
      FROM reservations
      WHERE deleted_at = ''
        AND status = 'pending'
        ${reservationCapabilityClause}
    `);

  const paymentWaitingRows = restaurantReportsEnabled
    ? db
      .prepare(`
          SELECT DISTINCT tables.id, tables.name
          FROM tables
          LEFT JOIN table_orders
            ON table_orders.table_id = tables.id
            AND table_orders.status = 'payment'
          WHERE tables.deleted_at = ''
            AND tables.is_active = 1
            AND (tables.status = 'bill_waiting' OR table_orders.id IS NOT NULL)
          ORDER BY tables.sort_order ASC, tables.name COLLATE NOCASE ASC
        `)
      .all() as Array<Record<string, unknown>>
    : [];
  const paymentWaitingTables = paymentWaitingRows.length;

  const incompleteTasks = enabledCapabilities.has(BUSINESS_CAPABILITIES.TASKS) ? getScalarCount(db, `
      SELECT COUNT(*) AS count
      FROM daily_tasks
      WHERE deleted_at = ''
        AND status NOT IN ('done', 'completed', 'cancelled', 'archived')
        ${taskCapabilityClause}
    `) : 0;

  const overdueTasks = enabledCapabilities.has(BUSINESS_CAPABILITIES.TASKS) ? getScalarCount(
    db,
    `
      SELECT COUNT(*) AS count
      FROM daily_tasks
      WHERE deleted_at = ''
        AND status NOT IN ('done', 'completed', 'cancelled', 'archived')
        ${taskCapabilityClause}
        AND due_date != ''
        AND date(due_date) < ?
    `,
    today
  ) : 0;

  const openTaskRows = incompleteTasks > 0
    ? db
      .prepare(`
          SELECT title, due_date
          FROM daily_tasks
          WHERE deleted_at = ''
            AND status NOT IN ('done', 'completed', 'cancelled', 'archived')
            ${taskCapabilityClause}
          ORDER BY
            CASE WHEN due_date != '' AND date(due_date) < ? THEN 0 ELSE 1 END,
            CASE WHEN due_date = '' THEN 1 ELSE 0 END,
            due_date ASC,
            created_at ASC
          LIMIT 3
        `)
      .all(today) as Array<Record<string, unknown>>
    : [];

  const stockRows = stockReportsEnabled
    ? db
      .prepare(`
          SELECT
            p.name, COALESCE(b.quantity, 0) AS stock_quantity, p.minimum_quantity AS stock_min_quantity,
            COALESCE(e.stock_consumption_quantity, 1) AS stock_consumption_quantity, p.unit AS stock_unit
          FROM catalog_products p
          LEFT JOIN menu_product_entries e ON e.product_id = p.id AND e.deleted_at = ''
          LEFT JOIN inventory_locations l ON l.business_id = p.business_id AND l.is_primary = 1 AND l.deleted_at = ''
          LEFT JOIN inventory_balances b ON b.product_id = p.id AND b.location_id = l.id
          WHERE p.deleted_at = '' AND p.is_active = 1 AND p.track_inventory = 1
          ORDER BY p.name COLLATE NOCASE ASC
        `)
      .all() as Array<Record<string, unknown>>
    : [];

  const outOfStockRows = stockRows.filter((row) =>
    Number(row.stock_quantity ?? 0) < (normalizePositiveStockNumber(row.stock_consumption_quantity) ?? 1)
  );
  const lowStockRows = stockRows.filter((row) => {
    const quantity = Number(row.stock_quantity ?? 0);
    const consumption = normalizePositiveStockNumber(row.stock_consumption_quantity) ?? 1;
    const minimum = nullableNumber(row.stock_min_quantity);
    return quantity >= consumption && minimum !== null && quantity <= minimum;
  });
  const outOfStockItems = outOfStockRows.length;
  const lowStockItems = lowStockRows.length;
  const items: DesktopReportAttentionItem[] = [];

  if (pendingRequests > 0) {
    items.push({
      kind: "pending_request",
      title: `${pendingRequests} müşteri talebi cevap bekliyor`,
      detail: "Yanıt bekleyen talepleri öncelik sırasıyla sonuçlandırın."
    });
  }
  if (pendingReservations > 0) {
    items.push({
      kind: "pending_reservation",
      title: `${pendingReservations} rezervasyon onay bekliyor`,
      detail: "Bekleyen rezervasyonları onaylayın veya reddedin."
    });
  }
  if (paymentWaitingTables > 0) {
    const tableNames = paymentWaitingRows.slice(0, 3).map((row) => String(row.name ?? "Masa")).join(", ");
    items.push({
      kind: "payment_waiting",
      title: `${paymentWaitingTables} masa hesap bekliyor`,
      detail: tableNames
    });
  }
  if (overdueTasks > 0) {
    const titles = openTaskRows
      .filter((row) => String(row.due_date ?? "") && String(row.due_date ?? "") < today)
      .map((row) => String(row.title ?? "Günlük iş"))
      .join(", ");
    items.push({
      kind: "overdue_task",
      title: `${overdueTasks} günlük iş gecikti`,
      detail: titles || "Geciken günlük işleri kontrol edin."
    });
  }
  const remainingOpenTasks = Math.max(0, incompleteTasks - overdueTasks);
  if (remainingOpenTasks > 0) {
    items.push({
      kind: "open_task",
      title: `${remainingOpenTasks} günlük iş tamamlanmadı`,
      detail: "Açık günlük işleri planlanan sırayla tamamlayın."
    });
  }
  for (const row of outOfStockRows.slice(0, 4)) {
    items.push({
      kind: "out_of_stock",
      title: `${String(row.name ?? "Ürün")} stokta yok`,
      detail: "Satış için gereken en az birim stok bulunmuyor."
    });
  }
  if (outOfStockRows.length > 4) {
    items.push({
      kind: "out_of_stock",
      title: `${outOfStockRows.length - 4} ürün daha stokta yok`,
      detail: "Stok listesindeki diğer tükenen ürünleri kontrol edin."
    });
  }
  for (const row of lowStockRows.slice(0, 4)) {
    const unit = normalizeMenuStockUnit(row.stock_unit);
    items.push({
      kind: "low_stock",
      title: `${String(row.name ?? "Ürün")} minimum stok seviyesinde`,
      detail: `${formatReportStockQuantity(Number(row.stock_quantity ?? 0), unit)} kaldı.`
    });
  }
  if (lowStockRows.length > 4) {
    items.push({
      kind: "low_stock",
      title: `${lowStockRows.length - 4} ürün daha minimum stok seviyesinde`,
      detail: "Stok listesindeki diğer azalan ürünleri kontrol edin."
    });
  }

  return {
    pendingRequests,
    pendingReservations,
    paymentWaitingTables,
    overdueTasks,
    incompleteTasks,
    outOfStockItems,
    lowStockItems,
    totalCount: pendingRequests
      + pendingReservations
      + paymentWaitingTables
      + incompleteTasks
      + outOfStockItems
      + lowStockItems,
    items
  };
}
