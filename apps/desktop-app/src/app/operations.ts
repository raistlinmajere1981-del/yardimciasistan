import type { DesktopDailyTask, DesktopReservation, DesktopRoom, DesktopDashboardData } from "../../electron/database";
import { projectRoomState, getOperationalTaskDomain, type OperationalTaskDomain } from "@yardimci-asistan/shared";

export function getRoomDisplayInfo(room: DesktopRoom, reservations: DesktopReservation[], stays: DesktopDashboardData["customerRoomStays"] = []) {
  const now = new Date();
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const state = projectRoomState(room, stays, reservations, today);
  const reservation = reservations.find(item => state.planning.reservationIds.includes(item.id));
  return { reservation, reservationTitle: reservation?.title || reservation?.customerName || "Aktif rezervasyon yok",
    status: state.operationalCondition !== "ready" ? state.operationalCondition : state.occupancy.status === "occupied" ? "occupied"
      : state.planning.reservationIds.length || state.planning.plannedStayIds.length ? "reserved" : "available" };
}

function relatedReservation(task: DesktopDailyTask, reservations: DesktopReservation[]) {
  if (task.relatedType !== "reservation") {
    return undefined;
  }
  return reservations.find((reservation) => reservation.id === task.relatedId);
}

export function getDesktopTaskDomain(
  task: DesktopDailyTask,
  reservations: DesktopReservation[]
): OperationalTaskDomain {
  const reservation = relatedReservation(task, reservations);
  return getOperationalTaskDomain(
    task.taskType,
    task.relatedType,
    reservation?.reservationType,
    {
      roomIds: reservation?.roomIds,
      tableIds: reservation?.tableIds
    }
  );
}

export function isRestaurantTask(task: DesktopDailyTask, reservations: DesktopReservation[]) {
  const domain = getDesktopTaskDomain(task, reservations);
  return domain === "food_service" || domain === "mixed";
}

export function isAccommodationTask(task: DesktopDailyTask, reservations: DesktopReservation[]) {
  const domain = getDesktopTaskDomain(task, reservations);
  return domain === "accommodation" || domain === "mixed";
}
