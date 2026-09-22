/** Independent facts for the Room Workspace; no persistence or presentation side effects. */
export interface RoomStateProjection {
  persistedStatus: string;
  isActive: boolean;
  operationalCondition: "ready" | "cleaning" | "maintenance" | "out_of_service";
  occupancy: { status: "vacant" | "occupied"; stayIds: string[] };
  planning: { reservationIds: string[]; plannedStayIds: string[] };
}

export function projectRoomState(
  room: { id: string; status: string; isActive: boolean },
  stays: readonly { id: string; roomId: string; status: string; checkInDate: string; checkOutDate: string }[],
  reservations: readonly { id: string; roomIds: readonly string[]; status: string; startDate: string; endDate: string }[],
  asOfDate: string
): RoomStateProjection {
  const roomStays = stays.filter(stay => stay.roomId === room.id);
  const checkedIn = roomStays.filter(stay => stay.status === "checked_in");
  return {
    persistedStatus: room.status,
    isActive: room.isActive,
    operationalCondition: room.status === "cleaning" || room.status === "maintenance" || room.status === "out_of_service" ? room.status : "ready",
    occupancy: { status: checkedIn.length ? "occupied" : "vacant", stayIds: checkedIn.map(stay => stay.id) },
    planning: {
      reservationIds: reservations.filter(reservation => reservation.roomIds.includes(room.id)
        && ["pending", "approved"].includes(reservation.status)
        && Boolean(reservation.startDate) && (!reservation.endDate || reservation.endDate > asOfDate)).map(reservation => reservation.id),
      plannedStayIds: roomStays.filter(stay => stay.status === "planned"
        && (!stay.checkOutDate || stay.checkOutDate > asOfDate)).map(stay => stay.id)
    }
  };
}
