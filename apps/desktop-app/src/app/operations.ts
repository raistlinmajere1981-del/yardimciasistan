import type { DesktopDailyTask, DesktopReservation, DesktopRoom } from "../../electron/database";
import { getOperationalTaskDomain, type OperationalTaskDomain } from "@yardimci-asistan/shared";

const activeReservationStatuses = new Set(["pending", "approved"]);

function localDateKey() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function reservationDateRank(reservation: DesktopReservation, today: string) {
  const startDate = reservation.startDate || reservation.endDate;
  const endDate = reservation.endDate || reservation.startDate;

  if (startDate && endDate && startDate <= today && today <= endDate) {
    return 0;
  }
  if (!startDate || startDate >= today) {
    return 1;
  }
  return 2;
}

export function findActiveRoomReservation(roomId: string, reservations: DesktopReservation[]) {
  const today = localDateKey();
  return reservations
    .filter((reservation) => activeReservationStatuses.has(reservation.status) && reservation.roomIds.includes(roomId))
    .sort((left, right) => {
      const rankDifference = reservationDateRank(left, today) - reservationDateRank(right, today);
      if (rankDifference !== 0) {
        return rankDifference;
      }
      return (left.startDate || left.endDate || "9999-12-31").localeCompare(right.startDate || right.endDate || "9999-12-31");
    })[0];
}

export function getRoomDisplayInfo(room: DesktopRoom, reservations: DesktopReservation[]) {
  const reservation = findActiveRoomReservation(room.id, reservations);
  if (reservation) {
    return {
      reservation,
      reservationTitle: reservation.title || reservation.customerName || "Aktif rezervasyon",
      status: room.status === "occupied" ? "occupied" : "reserved"
    };
  }

  return {
    reservation: undefined,
    reservationTitle: room.status === "reserved" ? "Manuel rezerve" : "Aktif rezervasyon yok",
    status: room.status
  };
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

export function formatTableStatus(value: string) {
  const labels: Record<string, string> = {
    available: "Boş",
    reserved: "Rezerve",
    occupied: "Dolu",
    bill_waiting: "Hesap bekliyor",
    waiting_bill: "Hesap bekliyor",
    checkout: "Hesap bekliyor",
    payment: "Hesap bekliyor",
    cleaning: "Temizlik"
  };
  return labels[value] ?? "Boş";
}

export function getTableStatusAction(value: string) {
  if (["bill_waiting", "waiting_bill", "checkout", "payment"].includes(value)) return "bill_waiting";
  return ["available", "occupied", "reserved"].includes(value) ? value : "";
}
