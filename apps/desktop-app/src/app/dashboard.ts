import type { DesktopDashboardData } from "../../electron/database";

type DashboardRequest = DesktopDashboardData["requests"][number];
type DashboardTask = DesktopDashboardData["dailyTasks"][number];
type DashboardReservation = DesktopDashboardData["reservations"][number];

export type DashboardDateUrgency = "overdue" | "today" | "upcoming" | "undated";

export type DashboardPriorityItem =
  | {
      key: string;
      kind: "request";
      rank: number;
      sortValue: string;
      request: DashboardRequest;
    }
  | {
      key: string;
      kind: "task";
      rank: number;
      sortValue: string;
      urgency: DashboardDateUrgency;
      task: DashboardTask;
    }
  | {
      key: string;
      kind: "reservation";
      rank: number;
      sortValue: string;
      urgency: DashboardDateUrgency;
      reservation: DashboardReservation;
    };

interface DashboardView {
  today: string;
  waitingRequests: DashboardRequest[];
  pendingTasks: DashboardTask[];
  pendingReservations: DashboardReservation[];
  priorityItems: DashboardPriorityItem[];
  scheduleItems: DashboardPriorityItem[];
}

export function buildDashboardView(
  data: DesktopDashboardData,
  isRequestWaitingForReply: (status: string) => boolean,
  today = getLocalIsoDate()
): DashboardView {
  const waitingRequests = data.requests.filter((request) => isRequestWaitingForReply(request.status));
  const pendingTasks = data.dailyTasks.filter((task) => task.status === "pending");
  const pendingReservations = data.reservations.filter((reservation) => reservation.status === "pending");

  const priorityItems: DashboardPriorityItem[] = [
    ...waitingRequests.map((request): DashboardPriorityItem => ({
      key: `request:${request.id}`,
      kind: "request",
      rank: getRequestPriorityRank(request.priority, request.status),
      sortValue: request.updated_at || request.created_at || "",
      request
    })),
    ...pendingTasks.map((task): DashboardPriorityItem => {
      const urgency = getDateUrgency(task.dueDate, today);
      return {
        key: `task:${task.id}`,
        kind: "task",
        rank: urgency === "overdue" ? 3 : urgency === "today" ? 6 : 8,
        sortValue: `${task.dueDate || "9999-12-31"}T${task.dueTime || "23:59"}`,
        urgency,
        task
      };
    }),
    ...pendingReservations.map((reservation): DashboardPriorityItem => {
      const urgency = getDateUrgency(reservation.startDate, today);
      return {
        key: `reservation:${reservation.id}`,
        kind: "reservation",
        rank: urgency === "overdue" ? 3 : urgency === "today" ? 6 : 7,
        sortValue: `${reservation.startDate || "9999-12-31"}T${reservation.time || "23:59"}`,
        urgency,
        reservation
      };
    })
  ].sort(comparePriorityItems);

  const scheduleItems: DashboardPriorityItem[] = [
    ...priorityItems.filter((item) => item.kind === "task"),
    ...data.reservations
      .filter((reservation) => {
        if (["rejected", "cancelled", "completed"].includes(reservation.status)) {
          return false;
        }
        const lastDate = reservation.endDate || reservation.startDate;
        return reservation.status === "pending" || !lastDate || lastDate >= today;
      })
      .map((reservation): DashboardPriorityItem => {
        const effectiveDate = reservation.startDate && reservation.startDate < today && (!reservation.endDate || reservation.endDate >= today)
          ? today
          : reservation.startDate;
        return {
          key: `schedule-reservation:${reservation.id}`,
          kind: "reservation",
          rank: 0,
          sortValue: `${effectiveDate || "9999-12-31"}T${reservation.time || "23:59"}`,
          urgency: getDateUrgency(effectiveDate, today),
          reservation
        };
      })
  ].sort((left, right) => left.sortValue.localeCompare(right.sortValue));

  return {
    today,
    waitingRequests,
    pendingTasks,
    pendingReservations,
    priorityItems,
    scheduleItems
  };
}

export function getDateUrgency(value: string, today = getLocalIsoDate()): DashboardDateUrgency {
  if (!value) {
    return "undated";
  }
  if (value < today) {
    return "overdue";
  }
  if (value === today) {
    return "today";
  }
  return "upcoming";
}

export function formatDashboardDate(value: string, time: string, today = getLocalIsoDate()) {
  if (!value) {
    return time || "Zaman belirtilmedi";
  }

  const urgency = getDateUrgency(value, today);
  const days = differenceInCalendarDays(value, today);
  let dateLabel = formatShortTurkishDate(value);

  if (urgency === "overdue") {
    dateLabel = `${Math.abs(days)} gün gecikti`;
  } else if (urgency === "today") {
    dateLabel = "Bugün";
  } else if (days === 1) {
    dateLabel = "Yarın";
  }

  return [dateLabel, time].filter(Boolean).join(" · ");
}

export function formatLongTurkishDate(value: string) {
  const date = parseIsoDate(value);
  if (!date) {
    return "Bugün";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(date);
}

function comparePriorityItems(left: DashboardPriorityItem, right: DashboardPriorityItem) {
  if (left.rank !== right.rank) {
    return left.rank - right.rank;
  }
  if (left.kind === "request" && right.kind === "request") {
    return right.sortValue.localeCompare(left.sortValue);
  }
  return left.sortValue.localeCompare(right.sortValue);
}

function getRequestPriorityRank(priority: string, status: string) {
  if (priority === "urgent") {
    return 0;
  }
  if (priority === "high") {
    return 1;
  }
  if (status === "new") {
    return 2;
  }
  if (priority === "low") {
    return 5;
  }
  return 4;
}

function differenceInCalendarDays(value: string, today: string) {
  const date = parseIsoDate(value);
  const currentDate = parseIsoDate(today);
  if (!date || !currentDate) {
    return 0;
  }
  return Math.round((date.getTime() - currentDate.getTime()) / 86_400_000);
}

function formatShortTurkishDate(value: string) {
  const date = parseIsoDate(value);
  if (!date) {
    return value;
  }
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(date);
}

function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return undefined;
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

function getLocalIsoDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
