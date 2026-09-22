import { useState } from "react";
import type { DesktopDashboardData, DesktopStatusUpdateResult, SaveManualReservationInput } from "../../../electron/database";
import { ActionButton } from "../ui/ActionButton";
import { FormDialog } from "../ui/FormDialog";

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
    <label className="form-field form-field--long">Rezervasyon<select aria-label="Rezervasyon" required disabled={fixed === "reservation"} value={reservationId}
      onChange={event => onChange(event.target.value, roomId)}>
      <option value="">Rezervasyon seçin</option>
      {reservations.filter(item => item.reservationType === "room" && ["pending", "approved"].includes(item.status) && item.roomIds.length <= 1).map(item =>
        <option value={item.id} key={item.id}>{item.title || item.customerName} · {item.startDate} – {item.endDate}</option>)}
    </select></label>
    <label className="form-field form-field--long">Oda<select aria-label="Oda" disabled={fixed === "room"} value={roomId}
      onChange={event => onChange(reservationId, event.target.value)}>
      <option value="">Odayı daha sonra ata</option>
      {rooms.filter(room => room.isActive || room.id === roomId).map(room => <option key={room.id} value={room.id}>{room.name} · {room.capacity} kişi</option>)}
    </select></label>
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
