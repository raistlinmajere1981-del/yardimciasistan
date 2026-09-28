import { useEffect, useRef, useState } from "react";
import type { DesktopDashboardData } from "../../../electron/database";
import { defaultRoomAssignmentForm, formatStayDateRange } from "../../app/customer-model";
import { ActionButton } from "../ui/ActionButton";
import { DatePicker, addDays } from "../ui/DateTimePicker";
import { SearchSelect } from "../ui/SearchSelect";
import type { RoomWorkspaceIntent } from "../workspace/workspace-intent";
import type { RoomWorkspaceModel } from "./room-workspace-model";
import type { RoomStayOperations } from "./use-room-stay-operations";
import { StayGuestPicker } from "./StayGuestPicker";
import { StayGuestList } from "./StayGuestList";

export function RoomStayPanel({ model, data, intent, operations, disabled, staysEnabled, quickCustomerId, onQuickCustomerHandled, onDirty }: {
  model: RoomWorkspaceModel; data: DesktopDashboardData; intent: RoomWorkspaceIntent; operations: RoomStayOperations;
  disabled: boolean; staysEnabled: boolean; quickCustomerId?: string; onQuickCustomerHandled?: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => defaultRoomAssignmentForm(intent.customerId ?? "", intent.entityId));
  const [additional, setAdditional] = useState<string[]>([]);
  const [reservationId, setReservationId] = useState(intent.reservationId ?? "");
  const request = useRef({ signature: "", id: "" });
  const quickCustomerRequest = useRef("");
  const entryDirty = useRef(false);
  function markEntry(value: boolean) { entryDirty.current = value; onDirty(value); }
  const { room, state, active, reservations } = model;
  if (!room || !state) return null;
  const eligible = reservations.filter(item => item.reservationType === "room" && item.status === "approved"
    && (!item.roomIds.length || item.roomIds.includes(room.id)) && !model.stays.some(stay => stay.reservationId === item.id && stay.status !== "cancelled"));
  const selected = eligible.find(item => item.id === reservationId);
  const primary = draft.customerId || selected?.customerId || "";
  const guestIds = [...new Set([primary, ...additional].filter(Boolean))];
  const allActive = data.roomOperations?.flatMap(item => item.stays) ?? data.customerRoomStays;
  const unavailable = allActive.flatMap(stay => (stay.guests ?? []).filter(guest => ["planned", "checked_in"].includes(guest.status)).map(guest => guest.customerId));
  const canEnter = model.canCreate && primary && guestIds.length > 0 && !guestIds.some(id => unavailable.includes(id))
    && (room.capacity <= 0 || guestIds.length <= room.capacity);

  useEffect(() => {
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
  }, [active, additional, onQuickCustomerHandled, operations, primary, quickCustomerId]);

  async function enter() {
    if (!canEnter || !room) return;
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
    if (ok) { markEntry(false); setAdditional([]); setReservationId(""); setDraft(defaultRoomAssignmentForm("", intent.entityId)); }
  }

  return <>
    {model.conflict && <p role="alert">Oda kayıtlarında çakışma var. Yeni girişten önce kayıtları kontrol edin.</p>}
    {active.map(stay => <section className="operation-section form-stack" key={stay.id}>
      <h4>{stay.status === "checked_in" ? "Konaklayan misafirler" : "Planlanan misafirler"}</h4>
      <p>{formatStayDateRange(stay)} · {stay.guestCount} kişi</p>
      {stay.reservationId && <p>Rezervasyon bağlantısı korunuyor.</p>}
      <StayGuestList stay={stay} data={data} operations={operations} disabled={disabled} onDirty={onDirty} />
    </section>)}
    {staysEnabled && !active.length && room.isActive && <form className="operation-section form-stack" aria-label="Misafir girişi"
      onSubmit={event => { event.preventDefault(); void enter(); }}>
      <h4>Misafir girişi</h4>
      <fieldset className="form-stack" disabled={disabled || !model.canCreate}>
        {eligible.length > 0 && <div className="form-field"><span>Rezervasyon</span>
          <SearchSelect ariaLabel="İlgili rezervasyon" value={reservationId} placeholder="Rezervasyonsuz giriş"
            options={eligible.map(item => ({ id: item.id, label: item.customerName || item.title, description: `${item.startDate} – ${item.endDate} · Beklenen ${item.guestCount} kişi` }))}
            onChange={id => { setReservationId(id); setDraft(current => ({ ...current, customerId: eligible.find(item => item.id === id)?.customerId || "" })); setAdditional([]); markEntry(true); }} />
        </div>}
        {selected && <p>Rezervasyon: {selected.startDate} – {selected.endDate} · Beklenen {selected.guestCount} kişi.
          Giriş yalnız aşağıda kayıtlı {guestIds.length} kişi için yapılır; sonradan gelenler aynı konaklamaya eklenir.</p>}
        <div className="form-field"><span>Ana misafir</span>
          <SearchSelect ariaLabel="Ana misafir" value={primary} placeholder="Müşteri seçin" searchPlaceholder="Ad veya telefon ara"
            options={data.customers.map(customer => ({ id: customer.id, label: customer.fullName, description: customer.phone || undefined, disabled: unavailable.includes(customer.id) }))}
            onChange={id => { setDraft(current => ({ ...current, customerId: id })); setAdditional(current => current.filter(value => value !== id)); markEntry(true); }} />
        </div>
        {guestIds.map(id => <div className="action-row" key={id}>
          <span>{data.customers.find(customer => customer.id === id)?.fullName || "Müşteri"}{id === primary ? " · Ana misafir" : " · Misafir"}</span>
          {id !== primary && <ActionButton type="button" variant="ghost" onClick={() => { setAdditional(current => current.filter(value => value !== id)); markEntry(true); }}>Listeden Çıkar</ActionButton>}
        </div>)}
        <StayGuestPicker data={data} selectedIds={guestIds} disabled={disabled || (room.capacity > 0 && guestIds.length >= room.capacity)}
          onSelect={id => { if (!primary) setDraft(current => ({ ...current, customerId: id })); else setAdditional(current => [...current, id]); markEntry(true); }} />
        <p>{guestIds.length} kayıtlı misafir · Çocuk ve bebekler dahil herkes ayrı müşteri olarak eklenir.</p>
        {!selected && <div className="operation-fields">
          <div className="form-field"><span>Giriş tarihi</span><DatePicker ariaLabel="Giriş tarihi" value={draft.checkInDate} onChange={value => { setDraft({ ...draft, checkInDate: value }); markEntry(true); }} /></div>
          <div className="form-field"><span>Çıkış tarihi</span><DatePicker ariaLabel="Çıkış tarihi" value={draft.checkOutDate} min={draft.checkInDate || undefined}
            presets={draft.checkInDate ? [1, 2, 7].map(days => ({ label: `${days} gün`, value: addDays(draft.checkInDate, days) })) : []}
            onChange={value => { setDraft({ ...draft, checkOutDate: value }); markEntry(true); }} /></div>
        </div>}
        {!selected && <details><summary>Giriş notu</summary><textarea aria-label="Giriş notu" rows={2} value={draft.notes} onChange={event => { setDraft({ ...draft, notes: event.target.value }); markEntry(true); }} /></details>}
        {model.canCreate ? <ActionButton type="submit" disabled={!canEnter}>Giriş Yap · {guestIds.length} kişi</ActionButton> : <p>Yeni giriş için oda hazır ve boş olmalı.</p>}
      </fieldset>
    </form>}
    {operations.feedback?.panel === "stay" && <p role={operations.feedback.error ? "alert" : "status"}>{operations.feedback.message}</p>}
  </>;
}
