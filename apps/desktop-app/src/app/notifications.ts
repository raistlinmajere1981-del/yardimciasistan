import type {
  DesktopAndroidActionFailure,
  DesktopDashboardData
} from "../../electron/database";
import {
  BUSINESS_CAPABILITIES,
  getReservationDomain,
  hasBusinessCapability,
  isReservationTypeAvailable,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import type { AutomaticSyncStatus } from "../../electron/sync-coordinator";
import type { DesktopPage } from "./navigation";
import { getDesktopTaskDomain, isAccommodationTask, isRestaurantTask } from "./operations";

type DesktopNotificationPriority = "high" | "medium" | "low";
type DesktopNotificationKind = "request" | "reservation" | "table" | "task" | "birthday" | "sync" | "action";

export interface DesktopNotificationItem {
  key: string;
  kind: DesktopNotificationKind;
  priority: DesktopNotificationPriority;
  title: string;
  message: string;
  occurredAt: string;
  destination: DesktopPage;
  relatedId: string;
}

export function buildDesktopNotifications(
  data: DesktopDashboardData,
  syncStatus: AutomaticSyncStatus,
  capabilities: Iterable<BusinessCapability>,
  now = new Date()
): DesktopNotificationItem[] {
  const notifications: DesktopNotificationItem[] = [];
  const today = localDateKey(now);
  const enabled = capabilities instanceof Set ? capabilities : new Set(capabilities);
  if (!enabled.has(BUSINESS_CAPABILITIES.NOTIFICATIONS)) return notifications;

  for (const request of hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.CUSTOMERS) ? data.requests : []) {
    if (request.status !== "new") continue;
    notifications.push({
      key: `request:${request.id}:new`,
      kind: "request",
      priority: "high",
      title: "Yeni müşteri talebi",
      message: `${request.customer_name}${request.message ? ` · ${compact(request.message)}` : " yeni bir talep gönderdi."}`,
      occurredAt: request.created_at || request.updated_at,
      destination: "customerWork",
      relatedId: request.id
    });
  }

  for (const reservation of data.reservations) {
    const reservationContext = { roomIds: reservation.roomIds, tableIds: reservation.tableIds };
    if (reservation.status !== "pending"
        || !isReservationTypeAvailable(enabled, reservation.reservationType, reservationContext)) continue;
    const reservationDomain = getReservationDomain(reservation.reservationType, reservationContext);
    notifications.push({
      key: `reservation:${reservation.id}:pending`,
      kind: "reservation",
      priority: "medium",
      title: "Rezervasyon onay bekliyor",
      message: [reservation.customerName || reservation.title, reservation.startDate, reservation.time].filter(Boolean).join(" · "),
      occurredAt: reservation.updatedAt,
      destination: reservationDomain === "food_service"
        || (reservationDomain === "generic" && !enabled.has(BUSINESS_CAPABILITIES.ACCOMMODATION_RESERVATIONS))
        ? "restaurant"
        : "pension",
      relatedId: reservation.id
    });
  }

  const tableById = new Map(data.tables.map((table) => [table.id, table]));
  const paymentTableIds = new Set<string>();
  for (const order of hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.FOOD_ORDERS) ? data.paymentWaitingTableOrders ?? [] : []) {
    paymentTableIds.add(order.tableId);
    notifications.push({
      key: `table:${order.tableId || order.id}:payment_waiting`,
      kind: "table",
      priority: "high",
      title: "Masa hesap bekliyor",
      message: [order.tableName || tableById.get(order.tableId)?.name || "Masa", formatMoney(order.total, order.currency)].filter(Boolean).join(" · "),
      occurredAt: order.updatedAt || order.openedAt,
      destination: "restaurant",
      relatedId: order.tableId
    });
  }
  for (const table of data.tables) {
    if (!hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.FOOD_ORDERS)
        || paymentTableIds.has(table.id)
        || !["payment", "bill_waiting"].includes(table.status)) continue;
    notifications.push({
      key: `table:${table.id}:payment_waiting`,
      kind: "table",
      priority: "high",
      title: "Masa hesap bekliyor",
      message: table.name,
      occurredAt: table.updatedAt,
      destination: "restaurant",
      relatedId: table.id
    });
  }

  for (const task of hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.TASKS) ? data.dailyTasks : []) {
    if (task.status !== "pending") continue;
    if (isAccommodationTask(task, data.reservations)
        && !hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS)) continue;
    if (isRestaurantTask(task, data.reservations)
        && !hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.FOOD_TABLES)) continue;
    const overdue = Boolean(task.dueDate && task.dueDate < today);
    const taskDomain = getDesktopTaskDomain(task, data.reservations);
    notifications.push({
      key: `task:${task.id}:pending`,
      kind: "task",
      priority: "medium",
      title: overdue ? "Günlük iş gecikti" : "Günlük iş bekliyor",
      message: [task.title, task.dueDate, task.dueTime].filter(Boolean).join(" · "),
      occurredAt: task.updatedAt,
      destination: taskDomain === "food_service" ? "restaurant"
        : taskDomain === "accommodation" || taskDomain === "mixed" ? "pension"
          : "dashboard",
      relatedId: task.id
    });
  }

  if (hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.CUSTOMERS)
      && data.birthdayOverview.enabled
      && data.birthdayOverview.dueCount
        + data.birthdayOverview.invalidPhoneCount
        + data.birthdayOverview.waitingCount
        + data.birthdayOverview.failedCount > 0) {
    notifications.push({
      key: `birthday:${data.birthdayOverview.today}`,
      kind: "birthday",
      priority: "medium",
      title: "Bugünün doğum günü mesajları",
      message: `Bugün ${data.birthdayOverview.candidates.length} müşterinin doğum günü var.`,
      occurredAt: `${data.birthdayOverview.today}T09:00:00`,
      destination: "dashboard",
      relatedId: ""
    });
  }

  if (syncStatus.enabled && syncStatus.consecutiveFailures > 0 && syncStatus.lastError) {
    notifications.push({
      key: `sync:error:${syncErrorCode(syncStatus.lastError)}`,
      kind: "sync",
      priority: "high",
      title: "Web bağlantı sorunu",
      message: compact(syncStatus.lastError, 150),
      occurredAt: syncStatus.lastAttemptAt,
      destination: "settings",
      relatedId: ""
    });
  }

  if (hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.ANDROID)) {
    for (const failure of data.androidActionFailures ?? []) {
      notifications.push(actionFailureNotification(failure));
    }
  }

  return notifications.sort((left, right) => {
    const priorityDifference = priorityRank(right.priority) - priorityRank(left.priority);
    if (priorityDifference !== 0) return priorityDifference;
    return timestamp(right.occurredAt) - timestamp(left.occurredAt) || left.key.localeCompare(right.key, "tr");
  });
}

function actionFailureNotification(failure: DesktopAndroidActionFailure): DesktopNotificationItem {
  return {
    key: `action:${failure.id}:failed`,
    kind: "action",
    priority: "high",
    title: "Android işlemi uygulanamadı",
    message: compact(failure.message, 150),
    occurredAt: failure.createdAt,
    destination: failure.targetPage,
    relatedId: failure.relatedId
  };
}

function compact(value: string, limit = 110) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`;
}

function formatMoney(value: number, currency = "TRY") {
  if (!Number.isFinite(value) || value <= 0) return "";
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency || "TRY", maximumFractionDigits: 2 }).format(value);
}

function priorityRank(priority: DesktopNotificationPriority) {
  return priority === "high" ? 3 : priority === "medium" ? 2 : 1;
}

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function syncErrorCode(message: string) {
  const normalized = message.toLocaleLowerCase("tr-TR");
  if (/anahtar|yetki|401/.test(normalized)) return "authentication";
  if (/zaman aş/.test(normalized)) return "timeout";
  if (/ulaşılamadı|internet|bağlantı/.test(normalized)) return "connection";
  if (/güncel|protokol/.test(normalized)) return "server_version";
  return "unknown";
}
