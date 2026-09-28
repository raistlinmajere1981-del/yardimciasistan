import { useState } from "react";
import type { DesktopDashboardData } from "../../../electron/database";
import type { DesktopCustomerRoomStay } from "../../../electron/database-types";
import { ActionButton } from "../ui/ActionButton";
import { SearchSelect } from "../ui/SearchSelect";
import { useConfirmDialog } from "../ui/useConfirmDialog";
import { StayGuestPicker } from "./StayGuestPicker";
import { RoomCheckoutConfirmationDetails } from "./RoomCheckoutConfirmation";
import type { RoomStayOperations } from "./use-room-stay-operations";
import { useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";

export function StayGuestList({ stay, data, operations, disabled, onDirty }: {
  stay: DesktopCustomerRoomStay; data: DesktopDashboardData; operations: RoomStayOperations; disabled: boolean; onDirty: (dirty: boolean) => void;
}) {
  const { confirm, confirmDialog } = useConfirmDialog();
  const navigation = useWorkspaceNavigation();
  const [nextRoom, setNextRoom] = useState("");
  const guests = (stay.guests ?? []).filter(guest => ["planned", "checked_in"].includes(guest.status));
  const [nextPrimary, setNextPrimary] = useState("");
  async function depart(customerId: string) {
    const lastGuest = guests.length === 1;
    const account = data.roomOperations?.find(room => room.roomId === stay.roomId)?.accounts.find(item => item.stayId === stay.id);
    const openOrders = (data.tableOperations ?? []).filter(table => table.order
      && data.tables.some(resource => resource.id === table.tableId && resource.currentCustomerId === customerId));
    if (!await confirm({ title: "Misafir çıkışı", confirmLabel: "Çıkışı Tamamla", tone: "warning",
      description: lastGuest ? "Son misafir çıkıyor. Oda temizlik bekleyecek; varsa borç ortak hesapta kalacak."
        : "Yalnız bu misafir çıkacak. Konaklama ve ortak hesap kalan misafirlerle devam edecek.",
      details: <>{lastGuest && <RoomCheckoutConfirmationDetails
        roomLabel={stay.roomNumber ? `Oda ${stay.roomNumber}` : stay.roomName} stay={stay} account={account} />}
        {openOrders.length > 0 && <p role="alert">Bu misafire bağlı {openOrders.length} açık restoran adisyonu var. Bunlar oda hesabına dahil değil; aktarımı çıkıştan önce tamamlayın.</p>}</>
    })) return;
    await operations.mutate("stay", () => window.yardimciDesktop!.checkoutStayGuest({ stayId: stay.id, customerId, nextPrimaryCustomerId: nextPrimary || undefined }));
  }
  return <>
    {guests.map(guest => <article key={guest.id} className="operation-section">
      <strong>{guest.customerName}{guest.customerId === stay.customerId && " · Ana misafir"}</strong>
      <p>{guest.status === "checked_in" ? `Giriş: ${new Date(guest.checkedInAt).toLocaleString("tr-TR")}` : "Girişi bekleniyor"}</p>
      {!guest.identityReady && <p role="status">Kimlik bilgileri eksik; müşteri kartında kimlik türü, numarası, doğum tarihi ve uyruğu tamamlayın.</p>}
      <div className="action-row">
        <ActionButton variant="ghost" disabled={disabled} onClick={() => navigation.openWorkspace({ entityType: "customer", entityId: guest.customerId,
          mode: "details", returnContext: { page: "pension", view: "rooms", entityId: stay.roomId } })}>Müşteri Kartı</ActionButton>
        {guest.customerId !== stay.customerId && <ActionButton variant="secondary" disabled={disabled}
          onClick={() => void operations.mutate("stay", () => window.yardimciDesktop!.changeStayPrimary({ stayId: stay.id, customerId: guest.customerId }))}>Ana Misafir Yap</ActionButton>}
        {guest.status === "checked_in" && <ActionButton variant="secondary" disabled={disabled || (guest.customerId === stay.customerId && guests.length > 1 && !guests.some(item => item.customerId === nextPrimary && item.customerId !== stay.customerId))}
          onClick={() => void depart(guest.customerId)}>Misafir Çıkışı</ActionButton>}
      </div>
    </article>)}
    {stay.status === "checked_in" && guests.length > 1 && <div className="form-field"><span>Ana misafir ayrılacaksa yerine kalacak kişi</span>
      <SearchSelect ariaLabel="Yeni ana misafir" value={nextPrimary} disabled={disabled} onChange={setNextPrimary}
        options={guests.filter(guest => guest.customerId !== stay.customerId).map(guest => ({ id: guest.customerId, label: guest.customerName }))} /></div>}
    <p>Hesap konaklamanın ortak hesabıdır. Ana misafirin değişmesi hesap sahibini veya geçmiş borçları değiştirmez.</p>
    <div className="stay-secondary-controls">
    <div className="form-stack"><StayGuestPicker data={data} selectedIds={guests.map(guest => guest.customerId)} disabled={disabled}
      onSelect={id => void operations.mutate("stay", () => window.yardimciDesktop!.addStayGuest({ stayId: stay.id, customerId: id }))} /></div>
    {stay.status === "checked_in" && <div className="form-stack">
      <div className="form-field"><span>Odayı değiştir</span><SearchSelect ariaLabel="Yeni oda" value={nextRoom} disabled={disabled} onChange={id => { setNextRoom(id); onDirty(Boolean(id)); }}
        options={data.rooms.filter(room => room.id !== stay.roomId && room.isActive && !["cleaning", "maintenance", "out_of_service", "occupied"].includes(room.status))
          .map(room => ({ id: room.id, label: room.number ? `Oda ${room.number}` : room.name, description: `${room.capacity} kişilik` }))} /></div>
      <ActionButton variant="secondary" disabled={disabled || !nextRoom} onClick={async () => {
        if (!await confirm({ title: "Odayı değiştir", description: "Ortak hesap ve anlaşılmış fiyat korunur. Eski oda temizlik bekler.", confirmLabel: "Odayı Değiştir", tone: "warning" })) return;
        if (await operations.mutate("stay", () => window.yardimciDesktop!.moveStayRoom({ stayId: stay.id, roomId: nextRoom }))) { setNextRoom(""); onDirty(false); }
      }}>Odayı Değiştir</ActionButton>
    </div>}
    </div>
    {(stay.guests ?? []).some(guest => guest.status === "checked_out") && <details><summary>Ayrılan misafirler</summary>
      {stay.guests.filter(guest => guest.status === "checked_out").map(guest => <p key={guest.id}>{guest.customerName} · {new Date(guest.checkedOutAt).toLocaleString("tr-TR")}</p>)}
    </details>}
    <p role="status">Kimlik bildirimi: {stay.pendingNotificationCount ?? 0} bekleyen kayıt. Otomatik EGM/Jandarma gönderimi bağlı değil; bildirimleri resmî sistem üzerinden tamamlayın.</p>
    {confirmDialog}
  </>;
}
