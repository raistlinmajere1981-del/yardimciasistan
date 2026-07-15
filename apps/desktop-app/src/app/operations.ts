import type { DesktopDailyTask, DesktopReservation, DesktopRoom } from "../../electron/database";

const activeReservationStatuses = new Set(["pending", "approved"]);
const restaurantTaskTypes = new Set(["table_reservation", "service", "restaurant", "table_check", "payment"]);
const accommodationTaskTypes = new Set(["check_in", "check_out", "room_cleaning", "room_maintenance", "reservation"]);

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
    reservationTitle: "Aktif rezervasyon yok",
    status: room.status === "reserved" ? "available" : room.status
  };
}

function relatedReservation(task: DesktopDailyTask, reservations: DesktopReservation[]) {
  if (task.relatedType !== "reservation") {
    return undefined;
  }
  return reservations.find((reservation) => reservation.id === task.relatedId);
}

export function isRestaurantTask(task: DesktopDailyTask, reservations: DesktopReservation[]) {
  if (restaurantTaskTypes.has(task.taskType)) {
    return true;
  }
  if (accommodationTaskTypes.has(task.taskType)) {
    return false;
  }
  if (task.relatedType === "table") {
    return true;
  }
  if (task.relatedType === "room") {
    return false;
  }

  const reservation = relatedReservation(task, reservations);
  return reservation?.reservationType === "table" || reservation?.reservationType === "breakfast";
}

export function isAccommodationTask(task: DesktopDailyTask, reservations: DesktopReservation[]) {
  if (accommodationTaskTypes.has(task.taskType)) {
    return true;
  }
  if (restaurantTaskTypes.has(task.taskType)) {
    return false;
  }
  if (task.relatedType === "room") {
    return true;
  }
  if (task.relatedType === "table") {
    return false;
  }

  const reservation = relatedReservation(task, reservations);
  if (reservation) {
    return reservation.reservationType === "room" || reservation.reservationType === "mixed";
  }
  return task.relatedType === "reservation";
}
