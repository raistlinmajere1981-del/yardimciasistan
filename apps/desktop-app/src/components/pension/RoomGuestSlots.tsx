import { Plus, X, UserRound } from "lucide-react";
import { ActionButton } from "../ui/ActionButton";
import { IconButton } from "../ui/IconButton";

export interface RoomGuestSlotPerson {
  id: string;
  name: string;
  primary?: boolean;
  identityReady?: boolean;
  status?: "planned" | "checked_in" | "checked_out" | "cancelled";
}

export function RoomGuestSlots({
  capacity,
  guests,
  extraSlots = 0,
  selectedIndex = -1,
  disabled = false,
  onAddSlot,
  onSelectSlot,
  onRemoveExtraSlot
}: {
  capacity: number;
  guests: RoomGuestSlotPerson[];
  extraSlots?: number;
  selectedIndex?: number;
  disabled?: boolean;
  onAddSlot?: () => void;
  onSelectSlot: (slotIndex: number, guest?: RoomGuestSlotPerson) => void;
  onRemoveExtraSlot?: (slotIndex: number) => void;
}) {
  const nominalCapacity = Math.max(1, Math.trunc(capacity) || 1);
  const baseSlotCount = Math.max(nominalCapacity, guests.length);
  const totalSlots = baseSlotCount + extraSlots;

  function renderSlot(currentIndex: number, guest?: RoomGuestSlotPerson) {
    const selected = currentIndex === selectedIndex;
    return <button
      type="button"
      className={`room-guest-slot${guest ? " is-occupied" : " is-empty"}${selected ? " is-selected" : ""}`}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={guest ? `${guest.name} misafir slotu` : `${currentIndex + 1}. boş misafir slotu`}
      onClick={() => onSelectSlot(currentIndex, guest)}
    >
      {guest ? <>
        <UserRound size={18} aria-hidden="true" />
        <span className="room-guest-slot__copy">
          <strong>{guest.name}</strong>
          <small>{guest.primary ? "Ana misafir" : guest.identityReady === false ? "Kimlik eksik" : guest.status === "planned" ? "Giriş bekliyor" : "Misafir"}</small>
        </span>
      </> : <>
        <Plus size={18} aria-hidden="true" />
        <span className="room-guest-slot__copy"><strong>Misafir ekle</strong><small>Boş slot</small></span>
      </>}
    </button>;
  }

  return <section className="room-bed-layout" aria-label="Oda misafir slotları">
    <div className="room-bed-group">
      <header>
        <strong>Yatak : {guests.length}/{nominalCapacity} dolu</strong>
        {onAddSlot && <ActionButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || totalSlots >= 50}
          onClick={onAddSlot}
        >Ekle</ActionButton>}
      </header>
      <div className="room-guest-slots">
        {Array.from({ length: totalSlots }, (_, currentIndex) => {
          const manualIndex = currentIndex - baseSlotCount;
          const manual = manualIndex >= 0;
          return <div className={`room-guest-slot-wrap${manual ? " is-manual" : ""}`} key={manual ? `manual-${manualIndex}` : currentIndex}>
            {renderSlot(currentIndex, guests[currentIndex])}
            {manual && onRemoveExtraSlot && <IconButton
              type="button"
              variant="danger"
              size="sm"
              disabled={disabled}
              aria-label={`${manualIndex + 1}. ek slotu kaldır`}
              onClick={() => onRemoveExtraSlot(currentIndex)}
            ><X size={14} aria-hidden="true" /></IconButton>}
          </div>;
        })}
      </div>
    </div>
  </section>;
}
