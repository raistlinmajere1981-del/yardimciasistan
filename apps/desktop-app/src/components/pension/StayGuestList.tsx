import { useMemo, useState } from "react";
import type { DesktopDashboardData } from "../../../electron/database";
import type { DesktopCustomerRoomStay } from "../../../electron/database-types";
import { ActionButton } from "../ui/ActionButton";
import { SearchSelect } from "../ui/SearchSelect";
import { useConfirmDialog } from "../ui/useConfirmDialog";
import { StayGuestPicker } from "./StayGuestPicker";
import { RoomCheckoutConfirmationDetails } from "./RoomCheckoutConfirmation";
import type { RoomStayOperations } from "./use-room-stay-operations";
import { useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import { RoomGuestSlots, type RoomGuestSlotPerson } from "./RoomGuestSlots";

export function StayGuestList({ stay, data, operations, disabled, onDirty, onCreateCustomer }: {
  stay: DesktopCustomerRoomStay;
  data: DesktopDashboardData;
  operations: RoomStayOperations;
  disabled: boolean;
  onDirty: (dirty: boolean) => void;
  onCreateCustomer?: () => void;
}) {
  const { confirm, confirmDialog } = useConfirmDialog();
  const navigation = useWorkspaceNavigation();
  const [nextRoom, setNextRoom] = useState("");
  const [nextPrimary, setNextPrimary] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(-1);
  const [addingGuest, setAddingGuest] = useState(false);
  const guests = (stay.guests ?? []).filter(guest => ["planned", "checked_in"].includes(guest.status));
  const room = data.rooms.find(item => item.id === stay.roomId);
  const slotGuests = useMemo<RoomGuestSlotPerson[]>(() => guests.map(guest => ({
    id: guest.customerId,
    name: guest.customerName,
    primary: guest.customerId === stay.customerId,
    identityReady: guest.identityReady,
    status: guest.status
  })), [guests, stay.customerId]);
  const selectedGuest = selectedSlot >= 0 ? guests[selectedSlot] : undefined;

  async function depart(customerId: string) {
    const lastGuest = guests.length === 1;
    const account = data.roomOperations?.find(item => item.roomId === stay.roomId)?.accounts.find(item => item.stayId === stay.id);
    const openOrders = (data.tableOperations ?? []).filter(table => table.order
      && data.tables.some(resource => resource.id === table.tableId && resource.currentCustomerId === customerId));
    if (!await confirm({
      title: "Misafir çıkışı",
      confirmLabel: "Çıkışı Tamamla",
      tone: "warning",
      description: lastGuest
        ? "Son misafir çıkıyor. Oda temizlik bekleyecek; varsa borç ortak hesapta kalacak."
        : "Yalnız bu misafir çıkacak. Konaklama ve ortak hesap kalan misafirlerle devam edecek.",
      details: <>{lastGuest && <RoomCheckoutConfirmationDetails
        roomLabel={stay.roomNumber ? `Oda ${stay.roomNumber}` : stay.roomName}
        stay={stay}
        account={account}
      />}
        {openOrders.length > 0 && <p role="alert">Bu misafire bağlı {openOrders.length} açık restoran adisyonu var. Aktarımı çıkıştan önce tamamlayın.</p>}</>
    })) return;
    const ok = await operations.mutate("stay", () => window.yardimciDesktop!.checkoutStayGuest({
      stayId: stay.id,
      customerId,
      nextPrimaryCustomerId: nextPrimary || undefined
    }));
    if (ok) {
      setSelectedSlot(-1);
      setNextPrimary("");
    }
  }

  return <>
    <RoomGuestSlots
      capacity={room?.capacity ?? Math.max(1, guests.length)}
      bedInfo={room?.bedInfo ?? ""}
      guests={slotGuests}
      selectedIndex={selectedSlot}
      disabled={disabled}
      onSelectSlot={(index, guest) => {
        setSelectedSlot(index);
        setAddingGuest(!guest);
        if (!guest) setNextPrimary("");
      }}
    />

    {addingGuest && <section className="room-slot-editor form-stack" aria-label="Boş slota misafir ata">
      <div className="room-inline-action-row">
        <StayGuestPicker
          data={data}
          selectedIds={guests.map(guest => guest.customerId)}
          disabled={disabled || Boolean(room && room.capacity > 0 && guests.length >= room.capacity)}
          onSelect={id => {
            void operations.mutate("stay", () => window.yardimciDesktop!.addStayGuest({ stayId: stay.id, customerId: id }))
              .then(ok => {
                if (ok) {
                  setAddingGuest(false);
                  setSelectedSlot(-1);
                }
              });
          }}
        />
        {onCreateCustomer && <ActionButton variant="secondary" disabled={disabled} onClick={onCreateCustomer}>+ Yeni müşteri</ActionButton>}
      </div>
    </section>}

    {selectedGuest && !addingGuest && <section className="room-slot-editor form-stack" aria-label="Misafir işlemleri">
      <div className="room-slot-editor__heading">
        <strong>{selectedGuest.customerName}</strong>
        <span>{selectedGuest.customerId === stay.customerId ? "Ana misafir" : selectedGuest.identityReady ? "Kimlik hazır" : "Kimlik eksik"}</span>
      </div>
      {selectedGuest.customerId === stay.customerId && guests.length > 1 && <div className="form-field">
        <span>Çıkışta yeni ana misafir</span>
        <SearchSelect
          ariaLabel="Yeni ana misafir"
          value={nextPrimary}
          disabled={disabled}
          onChange={setNextPrimary}
          placeholder="Kalacak kişiyi seçin"
          options={guests.filter(guest => guest.customerId !== stay.customerId).map(guest => ({
            id: guest.customerId,
            label: guest.customerName
          }))}
        />
      </div>}
      <div className="action-row">
        <ActionButton variant="ghost" disabled={disabled} onClick={() => navigation.openWorkspace({
          entityType: "customer",
          entityId: selectedGuest.customerId,
          mode: "main",
          returnContext: { page: "pension", view: "rooms", entityId: stay.roomId }
        })}>Müşteri Kartı</ActionButton>
        {selectedGuest.customerId !== stay.customerId && <ActionButton variant="secondary" disabled={disabled}
          onClick={() => void operations.mutate("stay", () => window.yardimciDesktop!.changeStayPrimary({
            stayId: stay.id,
            customerId: selectedGuest.customerId
          }))}>Ana Misafir Yap</ActionButton>}
        {selectedGuest.status === "checked_in" && <ActionButton variant="secondary"
          disabled={disabled || (selectedGuest.customerId === stay.customerId && guests.length > 1 && !nextPrimary)}
          onClick={() => void depart(selectedGuest.customerId)}>Misafir Çıkışı</ActionButton>}
      </div>
    </section>}

    {stay.status === "checked_in" && <details className="stay-management-details">
      <summary>Konaklama işlemleri</summary>
      <div className="form-stack">
        <div className="room-inline-action-row">
          <div className="form-field">
            <span>Odayı değiştir</span>
            <SearchSelect
              ariaLabel="Yeni oda"
              value={nextRoom}
              disabled={disabled}
              onChange={id => {
                setNextRoom(id);
                onDirty(Boolean(id));
              }}
              options={data.rooms
                .filter(candidate => candidate.id !== stay.roomId && candidate.isActive && !["cleaning", "maintenance", "out_of_service", "occupied"].includes(candidate.status))
                .map(candidate => ({
                  id: candidate.id,
                  label: candidate.number ? `Oda ${candidate.number}` : candidate.name,
                  description: `${candidate.capacity} kişilik`
                }))}
            />
          </div>
          <ActionButton variant="secondary" disabled={disabled || !nextRoom} onClick={async () => {
          if (!await confirm({
            title: "Odayı değiştir",
            description: "Ortak hesap ve anlaşılmış fiyat korunur. Eski oda temizlik bekler.",
            confirmLabel: "Odayı Değiştir",
            tone: "warning"
          })) return;
          if (await operations.mutate("stay", () => window.yardimciDesktop!.moveStayRoom({ stayId: stay.id, roomId: nextRoom }))) {
            setNextRoom("");
            onDirty(false);
          }
          }}>Odayı Değiştir</ActionButton>
        </div>
      </div>
    </details>}

    {(stay.guests ?? []).some(guest => guest.status === "checked_out") && <details>
      <summary>Ayrılan misafirler</summary>
      {stay.guests.filter(guest => guest.status === "checked_out")
        .map(guest => <p key={guest.id}>{guest.customerName} · {new Date(guest.checkedOutAt).toLocaleString("tr-TR")}</p>)}
    </details>}

    <p className="room-kbs-summary" role="status">
      Kimlik bildirimi · {stay.pendingNotificationCount ?? 0} bekleyen
    </p>
    {confirmDialog}
  </>;
}
