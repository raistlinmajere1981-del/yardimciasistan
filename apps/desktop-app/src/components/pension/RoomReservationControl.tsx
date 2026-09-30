import { useState } from "react";
import { ActionButton } from "../ui/ActionButton";
import { SearchSelect } from "../ui/SearchSelect";
import { assignReservationRoom } from "./ReservationRoomAssignment";
import type { RoomWorkspaceModel } from "./room-workspace-model";
import type { RoomStayOperations } from "./use-room-stay-operations";

export function RoomReservationControl({ model, operations, disabled, initialReservationId, onCreateReservation, onDirty }: {
  model: RoomWorkspaceModel; operations: RoomStayOperations; disabled: boolean; initialReservationId?: string;
  onCreateReservation?: () => void;
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
      <div className="room-section-heading">
        <h4>Rezervasyon</h4>
        {onCreateReservation && <ActionButton type="button" variant="ghost" size="sm" disabled={disabled} onClick={onCreateReservation}>+ Yeni rezervasyon</ActionButton>}
      </div>
      <fieldset className="form-stack" disabled={disabled}>
        <div className="room-inline-action-row">
          <div className="form-field form-field--fluid">
            <span>Atanacak rezervasyon</span>
            <SearchSelect
              ariaLabel="Atanacak rezervasyon"
              value={reservationId}
              disabled={disabled}
              onChange={value => { setReservationId(value); onDirty("assignment", true); }}
              placeholder="Rezervasyon seçin"
              searchPlaceholder="Rezervasyon, misafir veya tarih ara"
              options={assignable.map(item => ({
                id: item.id,
                label: item.title || item.customerName || "Rezervasyon",
                description: `${item.customerName || "Misafir"} · ${item.startDate} – ${item.endDate} · ${item.guestCount} kişi`,
                keywords: `${item.customerName} ${item.startDate} ${item.endDate}`
              }))}
            />
          </div>
          <ActionButton variant="secondary" type="submit" disabled={!assignable.some(item => item.id === reservationId)}>Rezervasyonu Ata</ActionButton>
        </div>
      </fieldset>
    </form>;
}
