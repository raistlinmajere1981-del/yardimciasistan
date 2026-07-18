import type {
  DesktopAndroidActionFailure,
  DesktopDashboardData
} from "../../electron/database";
import type { AutomaticSyncStatus } from "../../electron/sync-coordinator";
import type { DesktopPage } from "./navigation";

export type DesktopNotificationPriority = "high" | "medium" | "low";
export type DesktopNotificationKind = "request" | "reservation" | "table" | "task" | "sync" | "action";

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
  now = new Date()
): DesktopNotificationItem[] {
  const notifications: DesktopNotificationItem[] = [];
  const today = localDateKey(now);

  for (const request of data.requests) {
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
    if (reservation.status !== "pending") continue;
    notifications.push({
      key: `reservation:${reservation.id}:pending`,
      kind: "reservation",
      priority: "medium",
      title: "Rezervasyon onay bekliyor",
      message: [reservation.customerName || reservation.title, reservation.startDate, reservation.time].filter(Boolean).join(" · "),
      occurredAt: reservation.updatedAt,
      destination: ["table", "breakfast"].includes(reservation.reservationType) ? "restaurant" : "pension",
      relatedId: reservation.id
    });
  }

  const tableById = new Map(data.tables.map((table) => [table.id, table]));
  const paymentTableIds = new Set<string>();
  for (const order of data.paymentWaitingTableOrders ?? []) {
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
    if (paymentTableIds.has(table.id) || !["payment", "bill_waiting"].includes(table.status)) continue;
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

  for (const task of data.dailyTasks) {
    if (task.status !== "pending") continue;
    const overdue = Boolean(task.dueDate && task.dueDate < today);
    notifications.push({
      key: `task:${task.id}:pending`,
      kind: "task",
      priority: "medium",
      title: overdue ? "Günlük iş gecikti" : "Günlük iş bekliyor",
      message: [task.title, task.dueDate, task.dueTime].filter(Boolean).join(" · "),
      occurredAt: task.updatedAt,
      destination: isRestaurantTask(task.taskType, task.relatedType) ? "restaurant" : "pension",
      relatedId: task.id
    });
  }

  if (syncStatus.enabled && syncStatus.consecutiveFailures > 0 && syncStatus.lastError) {
    notifications.push({
      key: `sync:error:${syncErrorCode(syncStatus.lastError)}`,
      kind: "sync",
      priority: "high",
      title: "Sync bağlantı sorunu",
      message: compact(syncStatus.lastError, 150),
      occurredAt: syncStatus.lastAttemptAt,
      destination: "settings",
      relatedId: ""
    });
  }

  for (const failure of data.androidActionFailures ?? []) {
    notifications.push(actionFailureNotification(failure));
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

function isRestaurantTask(taskType: string, relatedType: string) {
  return ["table_reservation", "breakfast", "restaurant", "service"].includes(taskType)
    || relatedType === "table";
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
