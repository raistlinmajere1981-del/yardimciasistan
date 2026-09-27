import { useState } from "react";
import { ActionButton } from "../ui/ActionButton";
import { assignReservationRoom } from "./ReservationRoomAssignment";
import type { RoomWorkspaceModel } from "./room-workspace-model";
import type { RoomStayOperations } from "./use-room-stay-operations";

export function RoomReservationControl({ model, operations, disabled, initialReservationId, onDirty }: {
  model: RoomWorkspaceModel; operations: RoomStayOperations; disabled: boolean; initialReservationId?: string;
  onDirty: (key: string, dirty: boolean) => void;
}) {
  const [reservationId, setReservationId] = useState(initialReservationId ?? "");
  const { room, state, active } = model;
  if (!room?.isActive || !state || state.operationalCondition === "maintenance") return null;
  const assignable = model.reservations.filter(item => item.reservationType === "room" && ["pending", "approved"].includes(item.status) && item.roomIds.length <= 1 && item.guestCount <= room.capacity
    && !model.stays.some(stay => stay.reservationId === item.id && ["planned", "checked_in"].includes(stay.status))
    && !active.some(stay => stay.checkInDate < item.endDate && item.startDate < (stay.checkOutDate || "9999-12-31"))
    && !model.reservations.some(other => other.id !== item.id && other.roomIds.includes(room.id) && ["pending", "approved"].includes(other.status)
      && other.startDate < item.endDate && item.startDate < other.endDate));
  return <form className="operation-section form-stack" onSubmit={event => { event.preventDefault();
      const reservation = assignable.find(item => item.id === reservationId);
      if (reservation) void operations.mutate("operations", () => assignReservationRoom(reservation, room.id)).then(ok => { if (ok) onDirty("assignment", false); });
    }}>
      <h4>Rezervasyon ataması</h4>
      <fieldset className="form-stack" disabled={disabled}>
        <label className="form-field">Atanacak rezervasyon<select aria-label="Atanacak rezervasyon" required value={reservationId} onChange={event => { setReservationId(event.target.value); onDirty("assignment", true); }}>
          <option value="">Rezervasyon seçin</option>{assignable.map(item => <option value={item.id} key={item.id}>{item.title || item.customerName} · {item.startDate}</option>)}
        </select></label>
        <ActionButton variant="secondary" type="submit" disabled={!assignable.some(item => item.id === reservationId)}>Rezervasyonu Ata</ActionButton>
      </fieldset><p>Yalnız oda ataması kaydedilir; konaklama oluşturulmaz.</p>
    </form>;
}
