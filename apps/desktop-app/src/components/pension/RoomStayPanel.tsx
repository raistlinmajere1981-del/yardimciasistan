import { useEffect, useRef, useState } from "react";
import type { DesktopDashboardData } from "../../../electron/database";
import { defaultRoomAssignmentForm } from "../../app/customer-model";
import { ActionButton } from "../ui/ActionButton";
import { useConfirmDialog } from "../ui/useConfirmDialog";
import { DatePicker, addDays } from "../ui/DateTimePicker";
import { SearchSelect } from "../ui/SearchSelect";
import type { RoomWorkspaceIntent } from "../workspace/workspace-intent";
import type { RoomWorkspaceModel } from "./room-workspace-model";
import type { RoomStayOperations } from "./use-room-stay-operations";
import { StayGuestPicker } from "./StayGuestPicker";
import { StayGuestList } from "./StayGuestList";
import { RoomGuestSlots, type RoomGuestSlotPerson } from "./RoomGuestSlots";

export function RoomStayPanel({ model, data, intent, operations, disabled, staysEnabled, quickCustomerId, onQuickCustomerHandled, onCreateCustomer, onDirty }: {
  model: RoomWorkspaceModel; data: DesktopDashboardData; intent: RoomWorkspaceIntent; operations: RoomStayOperations;
  disabled: boolean; staysEnabled: boolean; quickCustomerId?: string; onQuickCustomerHandled?: () => void;
  onCreateCustomer?: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const { confirm, confirmDialog } = useConfirmDialog();
  const [draft, setDraft] = useState(() => defaultRoomAssignmentForm(intent.customerId ?? "", intent.entityId));
  const [additional, setAdditional] = useState<string[]>([]);
  const [reservationId, setReservationId] = useState(intent.reservationId ?? "");
  const [selectedSlot, setSelectedSlot] = useState(-1);
  const request = useRef({ signature: "", id: "" });
  const quickCustomerRequest = useRef("");
  const entryDirty = useRef(false);
  function markEntry(value: boolean) { entryDirty.current = value; onDirty(value); }
  const { room, state, active, reservations } = model;
  const eligible = room ? reservations.filter(item => item.reservationType === "room" && item.status === "approved"
    && (!item.roomIds.length || item.roomIds.includes(room.id)) && !model.stays.some(stay => stay.reservationId === item.id && stay.status !== "cancelled")) : [];
  const selected = eligible.find(item => item.id === reservationId);
  const primary = draft.customerId || selected?.customerId || "";
  const guestIds = [...new Set([primary, ...additional].filter(Boolean))];
  const allActive = data.roomOperations?.flatMap(item => item.stays) ?? data.customerRoomStays;
  const unavailable = allActive.flatMap(stay => (stay.guests ?? []).filter(guest => ["planned", "checked_in"].includes(guest.status)).map(guest => guest.customerId));
  const draftGuests: RoomGuestSlotPerson[] = guestIds.map(id => ({
    id,
    name: data.customers.find(customer => customer.id === id)?.fullName || "Müşteri",
    primary: id === primary
  }));
  const selectedDraftGuestId = selectedSlot >= 0 ? guestIds[selectedSlot] : undefined;
  const canEnter = Boolean(room) && model.canCreate && primary && guestIds.length > 0 && !guestIds.some(id => unavailable.includes(id))
    && (!room || room.capacity <= 0 || guestIds.length <= room.capacity);

  function removeDraftGuest(customerId: string) {
    if (customerId === primary) {
      const replacement = additional.find(id => id !== customerId) || "";
      setDraft(current => ({ ...current, customerId: replacement }));
      setAdditional(current => current.filter(id => id !== customerId && id !== replacement));
    } else {
      setAdditional(current => current.filter(id => id !== customerId));
    }
    setSelectedSlot(-1);
    markEntry(true);
  }

  useEffect(() => {
    if (!room || !state) return;
    const customerId = quickCustomerId?.trim();
    if (!customerId || quickCustomerRequest.current === customerId) return;
    if (active.length > 1) {
      onQuickCustomerHandled?.();
      return;
    }

    if (active.length === 1) {
      const stay = active[0];
      if ((stay.guests ?? []).some(guest => guest.customerId === customerId && ["planned", "checked_in"].includes(guest.status))) {
        onQuickCustomerHandled?.();
        return;
      }
      quickCustomerRequest.current = customerId;
      void operations.mutate("stay", () => window.yardimciDesktop!.addStayGuest({ stayId: stay.id, customerId }))
        .finally(() => {
          quickCustomerRequest.current = "";
          onQuickCustomerHandled?.();
        });
      return;
    }

    if (!primary) {
      setDraft(current => ({ ...current, customerId }));
    } else if (customerId !== primary && !additional.includes(customerId)) {
      setAdditional(current => [...current, customerId]);
    }
    markEntry(true);
    onQuickCustomerHandled?.();
  }, [active, additional, onQuickCustomerHandled, operations, primary, quickCustomerId, room, state]);

  if (!room || !state) return null;

  async function enter() {
    if (!canEnter || !room) return;

    if (data.kbsOverview.enabled) {
      const selectedCustomers = guestIds
        .map(id => data.customers.find(customer => customer.id === id))
        .filter((customer): customer is DesktopDashboardData["customers"][number] => Boolean(customer));
      const missingIdentity = selectedCustomers.filter(customer =>
        !customer.identityType || (!customer.identityNumber && !customer.documentSerialNumber) || !customer.nationality || !customer.birthDate
      );
      const kbsReady = data.kbsOverview.configured && missingIdentity.length === 0;
      const approved = await confirm({
        eyebrow: "Kimlik Bildirim Sistemi",
        title: "Misafir girişini onaylayın",
        tone: kbsReady ? "info" : "warning",
        confirmLabel: kbsReady ? "Giriş Yap ve Bildirimi Hazırla" : "Giriş Yap, Bildirimi Beklet",
        description: !data.kbsOverview.configured
          ? "Oda girişi kaydedilecek. KBS bağlantı ayarları tamamlanmadığı için bildirimler bekleyecek."
          : missingIdentity.length > 0
            ? "Oda girişi kaydedilecek. Kimlik bilgileri eksik misafirlerin KBS bildirimi bekleyecek; bilgiler tamamlandıktan sonra Müşteriler → Kimlik Bildirimleri bölümünden gönderilebilecek."
            : "Oda girişi kaydedilecek ve her misafir için KBS giriş bildirimi oluşturulacak.",
        details: <dl className="info-list">
          <div><dt>Oda</dt><dd>{room.number ? "Oda " + room.number : room.name}</dd></div>
          <div><dt>Misafir</dt><dd>{guestIds.length} kişi</dd></div>
          <div><dt>Kurum</dt><dd>{data.kbsOverview.provider === "jandarma" ? "Jandarma KBS" : "Emniyet KBS"}</dd></div>
          <div><dt>Bağlantı</dt><dd>{data.kbsOverview.configured ? "Ayarlar hazır" : "Ayarlar eksik"}</dd></div>
          <div><dt>Kimlik durumu</dt><dd>{missingIdentity.length > 0 ? String(missingIdentity.length) + " misafirde eksik" : "Tüm misafirlerde hazır"}</dd></div>
          {missingIdentity.length > 0 && <div><dt>Eksik kayıtlar</dt><dd>{missingIdentity.map(customer => customer.fullName).join(", ")}</dd></div>}
        </dl>
      });
      if (!approved) return;
    }

    const input = selected ? { reservationId: selected.id, roomId: room.id, primaryCustomerId: primary, guestCustomerIds: guestIds }
      : { customerId: primary, roomId: room.id, checkInDate: draft.checkInDate, checkOutDate: draft.checkOutDate,
        guestCount: guestIds.length, guestCustomerIds: guestIds, notes: draft.notes };
    const signature = JSON.stringify(input);
    if (request.current.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    const ok = selected
      ? await operations.checkInReservation({ reservationId: selected.id, roomId: room.id, primaryCustomerId: primary,
        guestCustomerIds: guestIds, requestId: request.current.id })
      : await operations.checkInCustomer({ customerId: primary, roomId: room.id, checkInDate: draft.checkInDate, checkOutDate: draft.checkOutDate,
        guestCount: guestIds.length, guestCustomerIds: guestIds, notes: draft.notes, requestId: request.current.id });
    if (ok) { markEntry(false); setAdditional([]); setReservationId(""); setSelectedSlot(-1); setDraft(defaultRoomAssignmentForm("", intent.entityId)); }
  }

  return <>
    {confirmDialog}
    {model.conflict && <p role="alert">Oda kayıtlarında çakışma var. Yeni girişten önce kayıtları kontrol edin.</p>}
    {active.map(stay => <section className="operation-section form-stack" key={stay.id}>
      <div className="room-section-heading">
        <h4>Misafirler</h4>
        <span>{stay.guestCount}/{room.capacity} dolu</span>
      </div>
      <StayGuestList stay={stay} data={data} operations={operations} disabled={disabled} onDirty={onDirty} onCreateCustomer={onCreateCustomer} />
    </section>)}
    {staysEnabled && !active.length && room.isActive && <form className="operation-section form-stack" aria-label="Misafir girişi"
      onSubmit={event => { event.preventDefault(); void enter(); }}>
      <h4>Konaklama başlangıcı</h4>
      <fieldset className="form-stack" disabled={disabled || !model.canCreate}>
        {eligible.length > 0 && <div className="form-field"><span>Rezervasyon</span>
          <SearchSelect ariaLabel="İlgili rezervasyon" value={reservationId} placeholder="Rezervasyonsuz giriş"
            options={eligible.map(item => ({ id: item.id, label: item.customerName || item.title, description: `${item.startDate} – ${item.endDate} · Beklenen ${item.guestCount} kişi` }))}
            onChange={id => { setReservationId(id); setDraft(current => ({ ...current, customerId: eligible.find(item => item.id === id)?.customerId || "" })); setAdditional([]); markEntry(true); }} />
        </div>}
        {selected && <p>Rezervasyon · {selected.startDate} – {selected.endDate} · Beklenen {selected.guestCount} kişi</p>}
        {!selected && <div className="operation-fields room-entry-dates">
          <div className="form-field"><span>Giriş tarihi</span><DatePicker ariaLabel="Giriş tarihi" value={draft.checkInDate}
            onChange={value => { setDraft({ ...draft, checkInDate: value }); markEntry(true); }} /></div>
          <div className="form-field"><span>Çıkış tarihi</span><DatePicker ariaLabel="Çıkış tarihi" value={draft.checkOutDate} min={draft.checkInDate || undefined}
            presets={draft.checkInDate ? [1, 2, 7].map(days => ({ label: `${days} gün`, value: addDays(draft.checkInDate, days) })) : []}
            onChange={value => { setDraft({ ...draft, checkOutDate: value }); markEntry(true); }} /></div>
        </div>}
        <RoomGuestSlots
          capacity={room.capacity}
          bedInfo={room.bedInfo}
          guests={draftGuests}
          selectedIndex={selectedSlot}
          disabled={disabled}
          onSelectSlot={(index) => setSelectedSlot(index)}
        />
        {selectedSlot >= guestIds.length && <section className="room-slot-editor form-stack" aria-label="Boş slota misafir ata">
          <StayGuestPicker
            data={data}
            selectedIds={guestIds}
            disabled={disabled || (room.capacity > 0 && guestIds.length >= room.capacity)}
            onSelect={id => {
              if (!primary) setDraft(current => ({ ...current, customerId: id }));
              else setAdditional(current => [...current, id]);
              setSelectedSlot(-1);
              markEntry(true);
            }}
          />
          {onCreateCustomer && <ActionButton type="button" variant="secondary" disabled={disabled} onClick={onCreateCustomer}>+ Yeni müşteri</ActionButton>}
        </section>}
        {selectedDraftGuestId && <section className="room-slot-editor">
          <div className="room-slot-editor__heading">
            <strong>{data.customers.find(customer => customer.id === selectedDraftGuestId)?.fullName || "Müşteri"}</strong>
            <span>{selectedDraftGuestId === primary ? "Ana misafir" : "Misafir"}</span>
          </div>
          <ActionButton type="button" variant="ghost" disabled={disabled} onClick={() => removeDraftGuest(selectedDraftGuestId)}>Listeden Çıkar</ActionButton>
        </section>}
        {!selected && <details><summary>Giriş notu</summary><textarea aria-label="Giriş notu" rows={2} value={draft.notes} onChange={event => { setDraft({ ...draft, notes: event.target.value }); markEntry(true); }} /></details>}
        {model.canCreate ? <ActionButton type="submit" disabled={!canEnter}>Giriş Yap · {guestIds.length} kişi</ActionButton> : <p>Yeni giriş için oda hazır ve boş olmalı.</p>}
      </fieldset>
    </form>}
  </>;
}
