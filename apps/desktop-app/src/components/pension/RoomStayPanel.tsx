import { useState } from "react";
import type { DesktopDashboardData } from "../../../electron/database";
import { defaultRoomAssignmentForm, formatCustomerRoomStayStatus, formatStayDateRange } from "../../app/customer-model";
import { ActionButton } from "../ui/ActionButton";
import { DatePicker, addDays } from "../ui/DateTimePicker";
import { SearchSelect } from "../ui/SearchSelect";
import type { RoomWorkspaceIntent } from "../workspace/workspace-intent";
import type { RoomWorkspaceModel } from "./room-workspace-model";
import type { RoomStayOperations } from "./use-room-stay-operations";
import { roomConditionLabel } from "./room-presentation";

export function RoomStayPanel({ model, data, intent, operations, disabled, staysEnabled, onDirty }: {
  model: RoomWorkspaceModel; data: DesktopDashboardData; intent: RoomWorkspaceIntent; operations: RoomStayOperations;
  disabled: boolean; staysEnabled: boolean; onDirty: (dirty: boolean) => void;
}) {
  const { room, state, active, reservations, upcoming } = model;
  const [draft, setDraft] = useState(() => defaultRoomAssignmentForm(intent.customerId ?? "", intent.entityId));
  const [reservationId, setReservationId] = useState(intent.reservationId ?? "");
  if (!room || !state) return null;
  const eligible = reservations.filter(item => item.reservationType === "room" && item.status === "approved" && item.roomIds.includes(room.id)
    && !model.stays.some(stay => stay.reservationId === item.id && stay.status !== "cancelled"));
  const selected = eligible.find(item => item.id === reservationId);
  return <>
    <dl className="operation-facts">
      <div><dt>Fiziksel durum</dt><dd>{roomConditionLabel[state.operationalCondition]}{!room.isActive && " · Etkin değil"}</dd></div>
      <div><dt>Doluluk</dt><dd>{state.occupancy.status === "occupied" ? "Dolu" : "Boş"}</dd></div>
    </dl>
    {model.conflict && <p role="alert">Konaklama çakışması var. Giriş yapmadan önce kayıtları kontrol edin.</p>}
    {active.map(stay => <article className="operation-section" key={stay.id} aria-label={`${stay.customerName} konaklaması`}>
      <h4>{stay.customerName}</h4>
      <p>{formatCustomerRoomStayStatus(stay.status)} · {stay.guestCount} kişi</p>
      <p>{formatStayDateRange(stay)}</p>
      <p>{stay.reservationId ? `Rezervasyon: ${reservations.find(item => item.id === stay.reservationId)?.title || "Bağlantılı kayıt"}` : "Manuel konaklama · Rezervasyondan bağımsız"}</p>
      {stay.notes && <p>{stay.notes}</p>}
    </article>)}
    {active.length === 0 && <p className="operation-empty">Bu odada aktif konaklama yok.</p>}
    {upcoming.length > 0 && <section className="operation-section" aria-label="Sıradaki rezervasyon">
      <h4>Sıradaki rezervasyon</h4><strong>{upcoming[0].customerName || upcoming[0].title}</strong>
      <p>{upcoming[0].title} · {upcoming[0].guestCount} kişi</p><p>{upcoming[0].startDate} – {upcoming[0].endDate}</p>
    </section>}
    {staysEnabled && !active.length && room.isActive && <form className="operation-section form-stack" aria-label="Yeni konaklama" onChange={() => onDirty(true)} onSubmit={event => {
      event.preventDefault();
      if (!model.canCreate) return;
      void operations.mutate("stay", () => selected
        ? window.yardimciDesktop!.createStayFromReservation({ reservationId: selected.id, roomId: room.id })
        : window.yardimciDesktop!.assignCustomerRoom({ ...draft, roomId: room.id, guestCount: Number(draft.guestCount), status: "planned" }))
        .then(ok => { if (ok) { onDirty(false); setDraft(defaultRoomAssignmentForm(intent.customerId ?? "", intent.entityId)); setReservationId(""); } });
    }}>
      <h4>Yeni konaklama</h4>
      <fieldset className="form-stack" disabled={disabled || !model.canCreate}>
        {eligible.length > 0 && <div className="form-field form-field--fluid">
          <span>İlgili rezervasyon</span>
          <SearchSelect
            ariaLabel="İlgili rezervasyon"
            value={reservationId}
            disabled={disabled || !model.canCreate}
            placeholder="Rezervasyonsuz konaklama"
            searchPlaceholder="Rezervasyon veya misafir ara"
            onChange={value => { setReservationId(value); onDirty(true); }}
            options={eligible.map(item => ({
              id: item.id,
              label: item.title || item.customerName || "Rezervasyon",
              description: `${item.customerName || "Misafir"} · ${item.startDate} – ${item.endDate} · ${item.guestCount} kişi`,
              keywords: `${item.customerName} ${item.startDate} ${item.endDate}`
            }))}
          />
        </div>}
        {selected ? <div><p>{selected.customerName} · {selected.guestCount} kişi</p><p>{selected.startDate} – {selected.endDate}</p><p>Rezervasyon bağlantısı korunur.</p></div> : <>
          <div className="operation-fields">
            <div className="form-field">
              <span>Müşteri</span>
              <SearchSelect
                ariaLabel="Müşteri"
                value={draft.customerId}
                disabled={disabled || Boolean(intent.customerId)}
                placeholder="Müşteri seçin"
                searchPlaceholder="Müşteri adı veya telefon ara"
                onChange={customerId => { setDraft({ ...draft, customerId }); onDirty(true); }}
                options={data.customers.map(item => ({
                  id: item.id,
                  label: item.fullName,
                  description: item.phone || item.email || undefined,
                  keywords: `${item.phone || ""} ${item.email || ""}`
                }))}
              />
            </div>
            <label className="form-field">Kişi sayısı<input required type="number" min={1} max={room.capacity > 0 ? Math.min(50, room.capacity) : 50} value={draft.guestCount} onChange={event => setDraft({ ...draft, guestCount: event.target.value })} /></label>
          </div>
          <div className="operation-fields">
            <div className="form-field"><span>Giriş tarihi</span><DatePicker ariaLabel="Giriş tarihi" value={draft.checkInDate} onChange={value => { setDraft({ ...draft, checkInDate: value }); onDirty(true); }} /></div>
            <div className="form-field"><span>Çıkış tarihi</span><DatePicker ariaLabel="Çıkış tarihi" value={draft.checkOutDate} min={draft.checkInDate || undefined}
              presets={draft.checkInDate ? [1, 2, 7].map(days => ({ label: `${days} gün`, value: addDays(draft.checkInDate, days) })) : []}
              onChange={value => { setDraft({ ...draft, checkOutDate: value }); onDirty(true); }} /></div>
          </div>
          <label className="form-field">Konaklama notu<textarea rows={2} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
        </>}
        <p>Planlı konaklama oluşturulur. Misafir girişi günlük işlemlerden kaydedilir.</p>
        {model.canCreate ? <ActionButton type="submit">{selected ? "Rezervasyondan Konaklama Oluştur" : "Konaklama Oluştur"}</ActionButton> : <p>Yeni konaklama için önce oda hazırlığını tamamlayın.</p>}
      </fieldset>
    </form>}
    {operations.feedback?.panel === "stay" && <p role={operations.feedback.error ? "alert" : "status"}>{operations.feedback.message}</p>}
    <details className="operation-section"><summary>Oda bilgileri</summary>
      <p>{room.capacity} kişilik · {room.bedInfo || "Yatak bilgisi yok"} · {room.floor || "Kat bilgisi yok"}</p>
      <p>{room.description || room.features.join(", ") || "Ek oda bilgisi yok."}</p><p>Düzenleme: Ayarlar → Oda Yönetimi.</p>
    </details>
  </>;
}
