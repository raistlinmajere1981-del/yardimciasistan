import type { DesktopRoom } from "../../../electron/database";
import type { DesktopRoomOperations } from "../../../electron/database-types";
import type { RoomWorkspaceIntent } from "../workspace/workspace-intent";

export interface RoomCardCapabilities { staysEnabled: boolean; reservationsEnabled: boolean; folioEnabled: boolean }
type RoomAction = { label: string; intent: Omit<RoomWorkspaceIntent, "entityType" | "entityId">; disabledReason?: string }
  | { label: string; clean: true; disabledReason?: string };

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
  const currentAccount = current.length === 1 ? accounts.find(item => item.stayId === current[0].id) : undefined;
  const previousAccounts = accounts.filter(item => !["planned", "checked_in"].includes(item.stayStatus) && item.remainingMinor > 0);
  const physical = !room.isActive ? "inactive" : ["cleaning", "maintenance", "out_of_service"].includes(room.status) ? room.status : "ready";
  const overlaps = (start: string, end: string, excludedId = "") => stays.some(stay => stay.id !== excludedId
    && stay.checkInDate < (end || "9999-12-31") && start < (stay.checkOutDate || "9999-12-31"));
  let action: RoomAction | undefined;
  // Physical constraint > occupied stay > due planned arrival > booking > old debt > manual plan.
  if (summary && physical === "cleaning") action = { label: "Temizliği tamamla", clean: true,
    ...(stays.length ? { disabledReason: "Aktif konaklama varken fiziksel durum değiştirilemez." } : {}) };
  else if (physical !== "ready") action = { label: "Durumu düzenle", intent: { action: "room-status", mode: "stay" } };
  else if (summary && current.length === 1) {
    const stay = current[0];
    action = currentAccount && (!stay.checkOutDate || stay.checkOutDate > today)
      ? { label: "Hesap", intent: { mode: "account", stayId: stay.id, folioId: currentAccount.folioId } }
      : { label: "Misafir çıkışı", intent: { mode: "stay", action: "checkout", stayId: stay.id } };
  } else if (summary && current.length > 1) action = { label: "Konaklamaları kontrol et", intent: { mode: "stay" } };
  else if (summary && planned[0]?.checkInDate <= today && !overlaps(planned[0].checkInDate, planned[0].checkOutDate, planned[0].id)) {
    action = { label: "Giriş yap", intent: { mode: "stay", action: "check-in", stayId: planned[0].id } };
  } else if (summary && upcoming?.status === "approved" && capabilities.staysEnabled && upcoming.guestCount <= room.capacity
    && !overlaps(upcoming.startDate, upcoming.endDate) && !summary.reservations.some(other => other.id !== upcoming.id
      && other.startDate < (upcoming.endDate || "9999-12-31") && upcoming.startDate < (other.endDate || "9999-12-31"))) {
    action = { label: "Konaklama oluştur", intent: { mode: "stay", action: "linked-stay", reservationId: upcoming.id } };
  } else if (summary && previousAccounts[0]) {
    const account = previousAccounts[0];
    action = { label: "Önceki hesabı tahsil et", intent: { mode: "account", action: "payment", stayId: account.stayId, folioId: account.folioId } };
  } else if (summary && !stays.length && !upcoming && capabilities.staysEnabled && !["occupied", "reserved"].includes(room.status)) {
    action = { label: "Konaklama oluştur", intent: { mode: "stay", action: "create-stay" } };
  }
  return { current, planned, upcoming, currentAccount, previousAccounts, physical, action };
}
