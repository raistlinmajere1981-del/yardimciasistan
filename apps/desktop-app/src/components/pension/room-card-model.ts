import type { DesktopRoom } from "../../../electron/database";
import type { DesktopRoomOperations } from "../../../electron/database-types";

export interface RoomCardCapabilities { staysEnabled: boolean; reservationsEnabled: boolean; folioEnabled: boolean }
type RoomQuickAction = { label: string; kind: "checkout"; stayId: string };

export function roomIdentity(room: Pick<DesktopRoom, "name" | "number">) {
  const number = room.number.trim();
  const name = room.name.trim();
  if (!number) return name;
  // A numbered default name is the identity itself, not a second title.
  if ([number, `oda ${number}`, `${number} oda`, `oda-${number}`].includes(name.toLocaleLowerCase("tr-TR"))) return `Oda ${number}`;
  return name.endsWith(` ${number}`) ? name : `Oda ${number} · ${name}`;
}

export function getRoomCardModel(room: DesktopRoom, summary: DesktopRoomOperations | undefined, capabilities: RoomCardCapabilities, today: string) {
  const stays = capabilities.staysEnabled ? summary?.stays ?? [] : [];
  const current = stays.filter(stay => stay.status === "checked_in");
  const planned = stays.filter(stay => stay.status === "planned" && (!stay.checkOutDate || stay.checkOutDate > today))
    .sort((a, b) => a.checkInDate.localeCompare(b.checkInDate) || a.id.localeCompare(b.id));
  const upcoming = capabilities.reservationsEnabled ? summary?.reservations
    .filter(item => ["pending", "approved"].includes(item.status) && item.startDate && (!item.endDate || item.endDate > today)
      && !stays.some(stay => stay.reservationId === item.id))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id))[0] : undefined;
  const accounts = capabilities.folioEnabled ? summary?.accounts ?? [] : [];
  const firstCurrent = current[0];
  const currentAccount = current.length === 1 ? accounts.find(item => item.stayId === firstCurrent?.id) : undefined;
  const previousAccounts = accounts.filter(item => !["planned", "checked_in"].includes(item.stayStatus) && item.remainingMinor > 0);
  const physical = !room.isActive ? "inactive" : ["cleaning", "maintenance", "out_of_service"].includes(room.status) ? room.status : "ready";

  const quickAction: RoomQuickAction | undefined = summary && physical === "ready" && current.length === 1 && firstCurrent
    ? { label: "Misafir çıkışı", kind: "checkout", stayId: firstCurrent.id }
    : undefined;

  return { current, planned, upcoming, currentAccount, previousAccounts, physical, quickAction };
}
