import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import type { BusinessCapability, MenuStockUnit } from "@yardimci-asistan/shared";
import type { AndroidReportPresetKey, AndroidReportSnapshot } from "@yardimci-asistan/sync-core";
import type {
  DesktopReportData,
  DesktopReportPeriod,
  DesktopReportPreset,
  DesktopReportRangeInput,
  MenuStockSourceType
} from "../database-types.js";
import { normalizeStockPrecision } from "./stock-utils.js";

export function normalizeDesktopReportRange(input: DesktopReportRangeInput): DesktopReportPeriod {
  const preset = String(input?.preset ?? "") as DesktopReportPreset;
  const supportedPresets = new Set<DesktopReportPreset>(["today", "yesterday", "last7", "last30", "custom"]);
  const startDate = String(input?.startDate ?? "").trim();
  const endDate = String(input?.endDate ?? "").trim();
  if (!supportedPresets.has(preset) || !isIsoDate(startDate) || !isIsoDate(endDate)) {
    throw new Error("Rapor için geçerli bir tarih aralığı seçin.");
  }
  const dayCount = isoDateDifference(startDate, endDate);
  if (dayCount < 0) {
    throw new Error("Rapor başlangıç tarihi bitiş tarihinden sonra olamaz.");
  }
  if (dayCount > 3659) {
    throw new Error("Rapor tarih aralığı en fazla 10 yıl olabilir.");
  }
  const label = String(input?.label ?? "").trim().replace(/\s+/g, " ").slice(0, 80)
    || (startDate === endDate ? startDate : `${startDate} – ${endDate}`);
  return { preset, label, startDate, endDate };
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function isoDateDifference(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  return Math.round((end - start) / 86_400_000);
}

export function enumerateIsoDateRange(startDate: string, endDate: string): string[] {
  const dayCount = isoDateDifference(startDate, endDate);
  return Array.from({ length: dayCount + 1 }, (_value, index) => shiftIsoDate(startDate, index));
}

export function reportReservationCapabilitySqlClause(
  enabledCapabilities: ReadonlySet<BusinessCapability>
): string {
  const accommodation = enabledCapabilities.has(BUSINESS_CAPABILITIES.ACCOMMODATION_RESERVATIONS);
  const foodService = enabledCapabilities.has(BUSINESS_CAPABILITIES.FOOD_RESERVATIONS);
  if (accommodation && foodService) {
    return "";
  }
  const domain = reportReservationDomainSql();
  if (accommodation) {
    return `AND NOT ${domain.hasTables}`;
  }
  if (foodService) {
    return `AND NOT ${domain.hasRooms}`;
  }
  return "AND 1 = 0";
}

export function reportReservationDomainSql(alias = ""): { hasRooms: string; hasTables: string } {
  const column = (name: string) => alias ? `${alias}.${name}` : name;
  const hasJsonItems = (name: string) => `json_array_length(CASE
    WHEN json_valid(${column(name)}) THEN ${column(name)}
    ELSE '[]'
  END) > 0`;
  return {
    hasRooms: `(${column("reservation_type")} IN ('room', 'room_and_table', 'mixed') OR ${hasJsonItems("room_ids_json")})`,
    hasTables: `(${column("reservation_type")} IN ('table', 'breakfast', 'room_and_table', 'mixed') OR ${hasJsonItems("table_ids_json")})`
  };
}

export function reportTaskCapabilitySqlClause(
  enabledCapabilities: ReadonlySet<BusinessCapability>
): string {
  if (!enabledCapabilities.has(BUSINESS_CAPABILITIES.TASKS)) {
    return "AND 1 = 0";
  }
  const accommodation = enabledCapabilities.has(BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS) ? 1 : 0;
  const foodService = enabledCapabilities.has(BUSINESS_CAPABILITIES.FOOD_TABLES) ? 1 : 0;
  if (accommodation === 1 && foodService === 1) return "";
  const reservationDomain = reportReservationDomainSql("task_reservation");

  // Reservation-linked tasks use the reservation's actual domain before the
  // generic task_type fallback, matching the shared/Android classifiers.
  return `AND CASE
    WHEN related_type = 'reservation' AND EXISTS (
      SELECT 1 FROM reservations AS task_reservation
      WHERE task_reservation.id = daily_tasks.related_id
        AND task_reservation.deleted_at = ''
        AND ${reservationDomain.hasRooms}
        AND ${reservationDomain.hasTables}
    ) THEN ${accommodation === 1 && foodService === 1 ? 1 : 0}
    WHEN related_type = 'reservation' AND EXISTS (
      SELECT 1 FROM reservations AS task_reservation
      WHERE task_reservation.id = daily_tasks.related_id
        AND task_reservation.deleted_at = ''
        AND ${reservationDomain.hasRooms}
        AND NOT ${reservationDomain.hasTables}
    ) THEN ${accommodation}
    WHEN related_type = 'reservation' AND EXISTS (
      SELECT 1 FROM reservations AS task_reservation
      WHERE task_reservation.id = daily_tasks.related_id
        AND task_reservation.deleted_at = ''
        AND ${reservationDomain.hasTables}
        AND NOT ${reservationDomain.hasRooms}
    ) THEN ${foodService}
    WHEN task_type IN ('check_in', 'check_out', 'room_cleaning', 'room_maintenance', 'reservation', 'manual_pension')
      OR related_type = 'room' THEN ${accommodation}
    WHEN task_type IN ('table_reservation', 'breakfast', 'service', 'table_service', 'restaurant', 'table_check', 'payment', 'manual_restaurant')
      OR related_type = 'table' THEN ${foodService}
    ELSE 1
  END = 1`;
}

export function shiftIsoDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatLocalIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function reportStockSourceLabel(sourceType: MenuStockSourceType): string {
  if (sourceType === "room_folio") return "Oda hesabı";
  if (sourceType === "android") {
    return "Android manuel";
  }
  if (sourceType === "stock_image_import") {
    return "Görsel / fatura";
  }
  if (sourceType === "table_order") {
    return "Adisyon";
  }
  return "Masaüstü manuel";
}

export function formatReportStockQuantity(value: number, unit: MenuStockUnit): string {
  const amount = normalizeStockPrecision(value).toLocaleString("tr-TR", { maximumFractionDigits: 3 });
  return unit === "gram" ? `${amount} g` : `${amount} adet`;
}

export function toAndroidReportSnapshot(
  key: AndroidReportPresetKey,
  report: DesktopReportData
): AndroidReportSnapshot {
  return {
    period: {
      key,
      label: report.period.label,
      start: report.period.startDate,
      end: report.period.endDate
    },
    summary: {
      restaurant_revenue: report.summary.restaurantRevenue,
      closed_orders: report.summary.closedOrders,
      average_order: report.summary.averageOrder,
      approved_reservations: report.summary.approvedReservations,
      approved_accommodation_reservations: report.summary.approvedAccommodationReservations,
      approved_food_reservations: report.summary.approvedFoodReservations,
      approved_mixed_reservations: report.summary.approvedMixedReservations,
      approved_generic_reservations: report.summary.approvedGenericReservations,
      new_requests: report.summary.newRequests,
      attention_count: report.attention.totalCount
    },
    restaurant: {
      sold_item_count: report.restaurant.soldItemCount,
      cancelled_orders: report.restaurant.cancelledOrders,
      top_items: report.restaurant.topItems.slice(0, 3).map((item) => ({
        name: item.name,
        quantity: item.quantity,
        revenue: item.revenue
      })),
      daily_revenue: report.restaurant.dailyRevenue.map((day) => ({
        date: day.date,
        revenue: day.revenue,
        closed_orders: day.closedOrders
      }))
    },
    attention: {
      pending_requests: report.attention.pendingRequests,
      pending_reservations: report.attention.pendingReservations,
      payment_waiting_tables: report.attention.paymentWaitingTables,
      overdue_tasks: report.attention.overdueTasks,
      incomplete_tasks: report.attention.incompleteTasks,
      out_of_stock_items: report.attention.outOfStockItems,
      low_stock_items: report.attention.lowStockItems,
      items: report.attention.items.map((item) => ({
        kind: item.kind,
        title: item.title,
        detail: item.detail
      }))
    }
  };
}
