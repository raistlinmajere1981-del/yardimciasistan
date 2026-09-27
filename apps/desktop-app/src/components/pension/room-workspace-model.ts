import { projectRoomState } from "@yardimci-asistan/shared";
import type { DesktopDashboardData } from "../../../electron/database";
import { roomToday } from "./room-presentation";

export function getRoomWorkspaceModel(data: DesktopDashboardData, roomId: string, staysEnabled: boolean, reservationsEnabled: boolean) {
  const room = data.rooms.find(item => item.id === roomId);
  const operations = data.roomOperations?.find(item => item.roomId === roomId);
  const stays = staysEnabled ? [...(operations?.stays ?? []), ...data.customerRoomStays.filter(stay => stay.roomId === roomId && !operations?.stays.some(active => active.id === stay.id))] : [];
  const reservations = reservationsEnabled ? [...(operations?.reservations ?? []), ...data.reservations.filter(item => !operations?.reservations.some(active => active.id === item.id))] : [];
  const active = stays.filter(stay => ["planned", "checked_in"].includes(stay.status));
  const occupied = active.filter(stay => stay.status === "checked_in");
  const currentStay = occupied.length === 1 ? occupied[0] : undefined;
  const state = room ? projectRoomState(room, stays, reservations, roomToday()) : undefined;
  const planned = active.filter(stay => stay.status === "planned").sort((a, b) => a.checkInDate.localeCompare(b.checkInDate));
  const upcoming = reservations.filter(item => state?.planning.reservationIds.includes(item.id) && !active.some(stay => stay.reservationId === item.id))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const overlaps = (a: typeof active[number], b: typeof active[number]) => a.checkInDate < (b.checkOutDate || "9999-12-31") && b.checkInDate < (a.checkOutDate || "9999-12-31");
  const conflict = occupied.length > 1 || active.some((stay, index) => active.slice(index + 1).some(other => overlaps(stay, other)));
  const canCheckIn = (stayId: string) => Boolean(room?.isActive && state?.operationalCondition === "ready" && room.status !== "occupied" && !conflict && !occupied.length
    && planned.some(stay => stay.id === stayId));
  return { room, operations, stays, reservations, active, currentStay, planned, upcoming, state, conflict, canCheckIn,
    canCreate: Boolean(room?.isActive && state?.operationalCondition === "ready" && !active.length && room.status !== "occupied"),
    canSetCondition: Boolean(room?.isActive && !active.length),
    refreshKey: `${data.revision}|${stays.map(stay => `${stay.id}:${stay.status}:${stay.updatedAt}`).join("|")}|${room?.updatedAt}` };
}
export type RoomWorkspaceModel = ReturnType<typeof getRoomWorkspaceModel>;
