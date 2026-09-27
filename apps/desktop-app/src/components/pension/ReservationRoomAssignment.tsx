import { useState } from "react";
import type { DesktopDashboardData, DesktopStatusUpdateResult, SaveManualReservationInput } from "../../../electron/database";
import { ActionButton } from "../ui/ActionButton";
import { FormDialog } from "../ui/FormDialog";
import { SearchSelect } from "../ui/SearchSelect";

type Reservation = DesktopDashboardData["reservations"][number];
// Both entry points preserve booking metadata and call the existing assignment mutation.
export function assignReservationRoom(reservation: Reservation, roomId: string,
  save: (input: SaveManualReservationInput) => Promise<DesktopStatusUpdateResult> = input => window.yardimciDesktop!.saveManualReservation(input)
): Promise<DesktopStatusUpdateResult> {
  return save({ reservationId: reservation.id, customerId: reservation.customerId, roomId: roomId || undefined,
    startDate: reservation.startDate, endDate: reservation.endDate, guestCount: reservation.guestCount, notes: reservation.notes });
}

export function ReservationRoomAssignment({ reservations, rooms, reservationId, roomId, fixed, onChange }: {
  reservations: Reservation[]; rooms: DesktopDashboardData["rooms"];
  reservationId: string; roomId: string; fixed: "room" | "reservation";
  onChange: (reservationId: string, roomId: string) => void;
}) {
  return <div className="form-stack">
    <p>Yalnız rezervasyonun oda ataması kaydedilir. Konaklama oluşturulmaz.</p>
    <div className="form-field form-field--long">
      <span>Rezervasyon</span>
      <SearchSelect
        ariaLabel="Rezervasyon"
        disabled={fixed === "reservation"}
        value={reservationId}
        onChange={value => onChange(value, roomId)}
        placeholder="Rezervasyon seçin"
        searchPlaceholder="Rezervasyon, misafir veya tarih ara"
        options={reservations
          .filter(item => item.reservationType === "room" && ["pending", "approved"].includes(item.status) && item.roomIds.length <= 1)
          .map(item => ({
            id: item.id,
            label: item.title || item.customerName || "Rezervasyon",
            description: `${item.customerName || "Misafir"} · ${item.startDate} – ${item.endDate} · ${item.guestCount} kişi`,
            keywords: `${item.customerName} ${item.startDate} ${item.endDate}`
          }))}
      />
    </div>
    <div className="form-field form-field--long">
      <span>Oda</span>
      <SearchSelect
        ariaLabel="Oda"
        disabled={fixed === "room"}
        value={roomId}
        onChange={value => onChange(reservationId, value)}
        placeholder="Odayı daha sonra ata"
        searchPlaceholder="Oda adı veya numarası ara"
        options={rooms.filter(room => room.isActive || room.id === roomId).map(room => ({
          id: room.id,
          label: room.name,
          description: `${room.capacity} kişi${room.floor ? ` · ${room.floor}` : ""}`,
          keywords: `${room.number || ""} ${room.floor || ""}`
        }))}
      />
    </div>
  </div>;
}

export function ReservationAssignmentDialog({ reservation, rooms, onSave, onClose }: {
  reservation: Reservation; rooms: DesktopDashboardData["rooms"];
  onSave: (input: SaveManualReservationInput) => Promise<DesktopStatusUpdateResult>; onClose: () => void;
}) {
  const [roomId, setRoomId] = useState(reservation.roomIds[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const dirty = roomId !== (reservation.roomIds[0] ?? "");
  return <FormDialog title="Rezervasyona oda ata" onClose={onClose} closeBlocked={busy || dirty}
    onSubmit={async event => {
      event.preventDefault(); setBusy(true);
      try { const result = await assignReservationRoom(reservation, roomId, onSave);
        if (result.ok) onClose(); else setMessage(result.message);
      } catch { setMessage("Oda ataması kaydedilemedi."); } finally { setBusy(false); }
    }} footer={<><ActionButton variant="secondary" disabled={busy} onClick={onClose}>{dirty ? "Değişiklikleri Bırak" : "Vazgeç"}</ActionButton>
      <ActionButton type="submit" disabled={busy}>Atamayı Kaydet</ActionButton></>}>
    <fieldset disabled={busy}><ReservationRoomAssignment reservations={[reservation]} rooms={rooms} fixed="reservation"
      reservationId={reservation.id} roomId={roomId} onChange={(_, value) => setRoomId(value)} /></fieldset>
    {message && <p role="alert">{message}</p>}
  </FormDialog>;
}
