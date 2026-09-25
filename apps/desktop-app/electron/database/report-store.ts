import type { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import type { BusinessCapability } from "@yardimci-asistan/shared";
import type { AndroidReportPresetKey, AndroidReportSnapshot } from "@yardimci-asistan/sync-core";
import type {
  DesktopReportData,
  DesktopReportRangeInput,
  DesktopReportStockMovement,
  MenuStockMovementType,
  MenuStockSourceType
} from "../database-types.js";
import {
  normalizeMenuStockUnit,
  normalizeStockPrecision,
  roundMoney
} from "./stock-utils.js";
import {
  enumerateIsoDateRange,
  formatLocalIsoDate,
  isIsoDate,
  normalizeDesktopReportRange,
  reportReservationCapabilitySqlClause,
  reportReservationDomainSql,
  reportTaskCapabilitySqlClause,
  reportStockSourceLabel,
  shiftIsoDate,
  toAndroidReportSnapshot
} from "./report-utils.js";
import { getOperationalAttention } from "./operational-attention.js";

function getScalarCount(db: DatabaseSync, sql: string, ...params: Array<string | number | null>): number {
  const row = db.prepare(sql).get(...params) as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}

export function getReportData(db: DatabaseSync, input: DesktopReportRangeInput, enabledCapabilities: ReadonlySet<BusinessCapability>): DesktopReportData {
  const period = normalizeDesktopReportRange(input);
  const { startDate, endDate } = period;
  const generatedAt = new Date().toISOString();
  const requestReportsEnabled = enabledCapabilities.has(BUSINESS_CAPABILITIES.REQUESTS)
    && enabledCapabilities.has(BUSINESS_CAPABILITIES.CUSTOMERS);
  const restaurantReportsEnabled = enabledCapabilities.has(BUSINESS_CAPABILITIES.FOOD_ORDERS);
  const stockReportsEnabled = enabledCapabilities.has(BUSINESS_CAPABILITIES.FOOD_MENU)
    && enabledCapabilities.has(BUSINESS_CAPABILITIES.INVENTORY);
  const reservationCapabilityClause = reportReservationCapabilitySqlClause(enabledCapabilities);
  const reservationDomainSql = reportReservationDomainSql();
  const taskCapabilityClause = reportTaskCapabilitySqlClause(enabledCapabilities);

  const paidSummary = db
    .prepare(`
        SELECT
          COUNT(*) AS closed_orders,
          COALESCE(ROUND(SUM(total), 2), 0) AS revenue
        FROM table_orders
        WHERE status = 'paid'
          AND closed_at != ''
          AND date(closed_at, 'localtime') BETWEEN ? AND ?
      `)
    .get(startDate, endDate) as { closed_orders?: number; revenue?: number } | undefined;
  const closedOrders = Math.max(0, Number(paidSummary?.closed_orders ?? 0));
  const restaurantRevenue = roundMoney(Number(paidSummary?.revenue ?? 0));
  const averageOrder = closedOrders > 0 ? roundMoney(restaurantRevenue / closedOrders) : 0;

  const soldItemRow = db
    .prepare(`
        SELECT COALESCE(SUM(table_order_items.quantity), 0) AS sold_item_count
        FROM table_order_items
        INNER JOIN table_orders ON table_orders.id = table_order_items.order_id
        WHERE table_orders.status = 'paid'
          AND table_orders.closed_at != ''
          AND date(table_orders.closed_at, 'localtime') BETWEEN ? AND ?
          AND table_order_items.status != 'cancelled'
      `)
    .get(startDate, endDate) as { sold_item_count?: number } | undefined;
  const soldItemCount = Math.max(0, Number(soldItemRow?.sold_item_count ?? 0));
  const cancelledOrders = getScalarCount(db, 
    `
        SELECT COUNT(*) AS count
        FROM table_orders
        WHERE status = 'cancelled'
          AND closed_at != ''
          AND date(closed_at, 'localtime') BETWEEN ? AND ?
      `,
    startDate,
    endDate
  );

  const topItems = (db
    .prepare(`
        SELECT
          table_order_items.product_name AS name,
          COALESCE(SUM(table_order_items.quantity), 0) AS quantity,
          COALESCE(ROUND(SUM(table_order_items.line_total), 2), 0) AS revenue
        FROM table_order_items
        INNER JOIN table_orders ON table_orders.id = table_order_items.order_id
        WHERE table_orders.status = 'paid'
          AND table_orders.closed_at != ''
          AND date(table_orders.closed_at, 'localtime') BETWEEN ? AND ?
          AND table_order_items.status != 'cancelled'
        GROUP BY table_order_items.product_name
        ORDER BY quantity DESC, revenue DESC, name COLLATE NOCASE ASC
        LIMIT 5
      `)
    .all(startDate, endDate) as Array<Record<string, unknown>>)
    .map((row) => ({
      name: String(row.name ?? "Ürün"),
      quantity: Math.max(0, Number(row.quantity ?? 0)),
      revenue: roundMoney(Number(row.revenue ?? 0))
    }));

  const dailyRows = db
    .prepare(`
        SELECT
          date(closed_at, 'localtime') AS report_date,
          COUNT(*) AS closed_orders,
          COALESCE(ROUND(SUM(total), 2), 0) AS revenue
        FROM table_orders
        WHERE status = 'paid'
          AND closed_at != ''
          AND date(closed_at, 'localtime') BETWEEN ? AND ?
        GROUP BY report_date
        ORDER BY report_date ASC
      `)
    .all(startDate, endDate) as Array<Record<string, unknown>>;
  const dailyByDate = new Map(dailyRows.map((row) => [
    String(row.report_date ?? ""),
    {
      revenue: roundMoney(Number(row.revenue ?? 0)),
      closedOrders: Math.max(0, Number(row.closed_orders ?? 0))
    }
  ]));
  const dailyRevenue = enumerateIsoDateRange(startDate, endDate).map((date) => ({
    date,
    revenue: dailyByDate.get(date)?.revenue ?? 0,
    closedOrders: dailyByDate.get(date)?.closedOrders ?? 0
  }));

  const reservationSummary = db
    .prepare(`
        SELECT
          COUNT(*) AS incoming,
          COALESCE(SUM(CASE WHEN status IN ('approved', 'completed') THEN 1 ELSE 0 END), 0) AS approved,
          COALESCE(SUM(CASE
            WHEN status IN ('approved', 'completed')
              AND ${reservationDomainSql.hasRooms}
              AND NOT ${reservationDomainSql.hasTables}
            THEN 1 ELSE 0
          END), 0) AS approved_accommodation,
          COALESCE(SUM(CASE
            WHEN status IN ('approved', 'completed')
              AND ${reservationDomainSql.hasTables}
              AND NOT ${reservationDomainSql.hasRooms}
            THEN 1 ELSE 0
          END), 0) AS approved_food,
          COALESCE(SUM(CASE
            WHEN status IN ('approved', 'completed')
              AND ${reservationDomainSql.hasRooms}
              AND ${reservationDomainSql.hasTables}
            THEN 1 ELSE 0
          END), 0) AS approved_mixed,
          COALESCE(SUM(CASE
            WHEN status IN ('approved', 'completed')
              AND NOT ${reservationDomainSql.hasRooms}
              AND NOT ${reservationDomainSql.hasTables}
            THEN 1 ELSE 0
          END), 0) AS approved_generic,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
          COALESCE(SUM(CASE WHEN status IN ('cancelled', 'rejected') THEN 1 ELSE 0 END), 0) AS cancelled_or_rejected,
          COALESCE(SUM(
            CASE
              WHEN reservation_type = 'room'
                AND status IN ('approved', 'completed')
                AND date(end_date) > date(start_date)
              THEN CAST(julianday(date(end_date)) - julianday(date(start_date)) AS INTEGER)
              ELSE 0
            END
          ), 0) AS accommodation_nights
        FROM reservations
        WHERE deleted_at = ''
          ${reservationCapabilityClause}
          AND date(created_at, 'localtime') BETWEEN ? AND ?
      `)
    .get(startDate, endDate) as Record<string, unknown> | undefined;

  const requestSummary = db
    .prepare(`
        SELECT
          COUNT(*) AS incoming,
          COALESCE(SUM(
            CASE WHEN status IN ('answered', 'converted_to_reservation', 'waiting_customer') THEN 1 ELSE 0 END
          ), 0) AS answered,
          COALESCE(SUM(
            CASE WHEN status IN ('new', 'seen', 'waiting_owner', 'pending', 'in_progress') THEN 1 ELSE 0 END
          ), 0) AS waiting
        FROM requests
        WHERE deleted_at = ''
          AND date(created_at, 'localtime') BETWEEN ? AND ?
      `)
    .get(startDate, endDate) as Record<string, unknown> | undefined;

  const pendingTasks = getScalarCount(db, 
    `
        SELECT COUNT(*) AS count
        FROM daily_tasks
        WHERE deleted_at = ''
          AND status NOT IN ('done', 'completed', 'cancelled', 'archived')
          ${taskCapabilityClause}
          AND (
            (due_date != '' AND date(due_date) BETWEEN ? AND ?)
            OR (due_date = '' AND date(created_at, 'localtime') BETWEEN ? AND ?)
          )
      `,
    startDate,
    endDate,
    startDate,
    endDate
  );

  const topConsumed = (db
    .prepare(`
        SELECT
          menu_items.id AS menu_item_id,
          menu_items.name AS name,
          menu_items.stock_unit AS unit,
          COALESCE(ROUND(SUM(
            CASE WHEN menu_stock_movements.quantity_change < 0
              THEN -menu_stock_movements.quantity_change
              ELSE 0
            END
          ), 3), 0) AS consumed
        FROM menu_stock_movements
        INNER JOIN menu_items ON menu_items.id = menu_stock_movements.menu_item_id
        WHERE menu_items.deleted_at = ''
          AND date(menu_stock_movements.created_at, 'localtime') BETWEEN ? AND ?
        GROUP BY menu_items.id, menu_items.name, menu_items.stock_unit
        HAVING consumed > 0
        ORDER BY consumed DESC, name COLLATE NOCASE ASC
        LIMIT 5
      `)
    .all(startDate, endDate) as Array<Record<string, unknown>>)
    .map((row) => ({
      menuItemId: String(row.menu_item_id ?? ""),
      name: String(row.name ?? "Ürün"),
      quantity: normalizeStockPrecision(Number(row.consumed ?? 0)),
      unit: normalizeMenuStockUnit(row.unit)
    }));

  const manualMovementCount = getScalarCount(db, 
    `
        SELECT COUNT(*) AS count
        FROM menu_stock_movements
        WHERE source_type IN ('desktop', 'android')
          AND date(created_at, 'localtime') BETWEEN ? AND ?
      `,
    startDate,
    endDate
  );
  const imageMovementCount = getScalarCount(db, 
    `
        SELECT COUNT(*) AS count
        FROM menu_stock_movements
        WHERE source_type = 'stock_image_import'
          AND date(created_at, 'localtime') BETWEEN ? AND ?
      `,
    startDate,
    endDate
  );
  const manualMovements = getReportStockMovements(db, startDate, endDate, "manual");
  const imageMovements = getReportStockMovements(db, startDate, endDate, "image");
  const recentMovements = getReportStockMovements(db, startDate, endDate, "all");
  const attention = getOperationalAttention(db, enabledCapabilities);
  const approvedReservations = Math.max(0, Number(reservationSummary?.approved ?? 0));
  const approvedAccommodationReservations = Math.max(0, Number(reservationSummary?.approved_accommodation ?? 0));
  const approvedFoodReservations = Math.max(0, Number(reservationSummary?.approved_food ?? 0));
  const approvedMixedReservations = Math.max(0, Number(reservationSummary?.approved_mixed ?? 0));
  const approvedGenericReservations = Math.max(0, Number(reservationSummary?.approved_generic ?? 0));
  const newRequests = requestReportsEnabled ? Math.max(0, Number(requestSummary?.incoming ?? 0)) : 0;

  return {
    period,
    generatedAt,
    summary: {
      restaurantRevenue: restaurantReportsEnabled ? restaurantRevenue : 0,
      closedOrders: restaurantReportsEnabled ? closedOrders : 0,
      averageOrder: restaurantReportsEnabled ? averageOrder : 0,
      approvedReservations,
      approvedAccommodationReservations,
      approvedFoodReservations,
      approvedMixedReservations,
      approvedGenericReservations,
      newRequests,
      pendingTasks
    },
    restaurant: {
      revenue: restaurantReportsEnabled ? restaurantRevenue : 0,
      closedOrders: restaurantReportsEnabled ? closedOrders : 0,
      averageOrder: restaurantReportsEnabled ? averageOrder : 0,
      soldItemCount: restaurantReportsEnabled ? soldItemCount : 0,
      cancelledOrders: restaurantReportsEnabled ? cancelledOrders : 0,
      dailyRevenue: restaurantReportsEnabled ? dailyRevenue : [],
      topItems: restaurantReportsEnabled ? topItems : []
    },
    pensionAndRequests: {
      incomingReservations: Math.max(0, Number(reservationSummary?.incoming ?? 0)),
      approvedReservations,
      pendingReservations: Math.max(0, Number(reservationSummary?.pending ?? 0)),
      cancelledOrRejectedReservations: Math.max(0, Number(reservationSummary?.cancelled_or_rejected ?? 0)),
      accommodationNights: Math.max(0, Number(reservationSummary?.accommodation_nights ?? 0)),
      newRequests,
      answeredRequests: requestReportsEnabled ? Math.max(0, Number(requestSummary?.answered ?? 0)) : 0,
      waitingRequests: requestReportsEnabled ? Math.max(0, Number(requestSummary?.waiting ?? 0)) : 0
    },
    stock: {
      topConsumed: stockReportsEnabled ? topConsumed : [],
      manualMovementCount: stockReportsEnabled ? manualMovementCount : 0,
      imageMovementCount: stockReportsEnabled ? imageMovementCount : 0,
      manualMovements: stockReportsEnabled ? manualMovements : [],
      imageMovements: stockReportsEnabled ? imageMovements : [],
      recentMovements: stockReportsEnabled ? recentMovements : []
    },
    attention
  };
}

export function getAndroidReportPresets(db: DatabaseSync, referenceDateInput = "", enabledCapabilities: ReadonlySet<BusinessCapability>): Record<AndroidReportPresetKey, AndroidReportSnapshot> {
  const referenceDate = isIsoDate(referenceDateInput) ? referenceDateInput : formatLocalIsoDate(new Date());
  const ranges: Array<[AndroidReportPresetKey, DesktopReportRangeInput]> = [
    ["today", { preset: "today", label: "Bugün", startDate: referenceDate, endDate: referenceDate }],
    [
      "yesterday",
      {
        preset: "yesterday",
        label: "Dün",
        startDate: shiftIsoDate(referenceDate, -1),
        endDate: shiftIsoDate(referenceDate, -1)
      }
    ],
    [
      "last7",
      {
        preset: "last7",
        label: "Son 7 Gün",
        startDate: shiftIsoDate(referenceDate, -6),
        endDate: referenceDate
      }
    ],
    [
      "last30",
      {
        preset: "last30",
        label: "Son 30 Gün",
        startDate: shiftIsoDate(referenceDate, -29),
        endDate: referenceDate
      }
    ]
  ];

  return Object.fromEntries(ranges.map(([key, range]) => {
    const report = getReportData(db, range, enabledCapabilities);
    return [key, toAndroidReportSnapshot(key, report)];
  })) as Record<AndroidReportPresetKey, AndroidReportSnapshot>;
}

function getReportStockMovements(
  db: DatabaseSync,
  startDate: string,
  endDate: string,
  mode: "manual" | "image" | "all"
): DesktopReportStockMovement[] {
  const sourceClause = mode === "manual"
    ? "AND menu_stock_movements.source_type IN ('desktop', 'android')"
    : mode === "image"
      ? "AND menu_stock_movements.source_type = 'stock_image_import'"
      : "";
  const limit = mode === "all" ? 8 : 6;
  const rows = db
    .prepare(`
        SELECT
          menu_stock_movements.*,
          menu_items.name AS item_name,
          menu_items.stock_unit AS stock_unit
        FROM menu_stock_movements
        INNER JOIN menu_items ON menu_items.id = menu_stock_movements.menu_item_id
        WHERE date(menu_stock_movements.created_at, 'localtime') BETWEEN ? AND ?
          ${sourceClause}
        ORDER BY menu_stock_movements.created_at DESC, menu_stock_movements.id DESC
        LIMIT ${limit}
      `)
    .all(startDate, endDate) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const sourceType = String(row.source_type ?? "desktop") as MenuStockSourceType;
    return {
      id: String(row.id ?? ""),
      menuItemId: String(row.menu_item_id ?? ""),
      itemName: String(row.item_name ?? "Ürün"),
      type: String(row.type ?? "adjust") as MenuStockMovementType,
      quantityChange: normalizeStockPrecision(Number(row.quantity_change ?? 0)),
      quantityAfter: normalizeStockPrecision(Number(row.quantity_after ?? 0)),
      unit: normalizeMenuStockUnit(row.stock_unit),
      sourceType,
      sourceLabel: reportStockSourceLabel(sourceType),
      note: String(row.note ?? ""),
      createdAt: String(row.created_at ?? "")
    };
  });
}
