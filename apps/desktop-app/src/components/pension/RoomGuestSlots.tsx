import { BedDouble, Plus, X, UserRound } from "lucide-react";
import { ActionButton } from "../ui/ActionButton";
import { IconButton } from "../ui/IconButton";

export interface RoomGuestSlotPerson {
  id: string;
  name: string;
  primary?: boolean;
  identityReady?: boolean;
  status?: "planned" | "checked_in" | "checked_out" | "cancelled";
}

interface BedGroup {
  label: string;
  slots: number;
}

function bedLabel(type: string) {
  const normalized = type.toLocaleLowerCase("tr-TR");
  if (normalized.includes("çift")) return "Çift kişilik yatak";
  if (normalized.includes("tek")) return "Tek kişilik yatak";
  if (normalized.includes("queen")) return "Queen yatak";
  if (normalized.includes("king")) return "King yatak";
  if (normalized.includes("ranza")) return "Ranza";
  return "Yatak";
}

function bedCapacity(type: string) {
  const normalized = type.toLocaleLowerCase("tr-TR");
  return normalized.includes("tek") ? 1 : 2;
}

export function roomBedGroups(capacity: number, bedInfo: string): BedGroup[] {
  const safeCapacity = Math.max(1, Math.trunc(capacity) || 1);
  const groups: BedGroup[] = [];
  const pattern = /(\d+)\s*(çift kişilik|tek kişilik|queen|king|ranza)(?:\s+yatak)?/gi;
  for (const match of bedInfo.matchAll(pattern)) {
    const count = Math.max(0, Number(match[1]) || 0);
    const type = match[2] ?? "";
    for (let index = 0; index < count; index += 1) {
      groups.push({ label: bedLabel(type), slots: bedCapacity(type) });
    }
  }

  if (!groups.length) {
    return [{ label: bedInfo.trim() || "Oda kapasitesi", slots: safeCapacity }];
  }

  const normalized: BedGroup[] = [];
  let remaining = safeCapacity;
  for (const group of groups) {
    if (remaining <= 0) break;
    const slots = Math.min(group.slots, remaining);
    normalized.push({ ...group, slots });
    remaining -= slots;
  }
  if (remaining > 0) normalized.push({ label: "Ek kapasite", slots: remaining });
  return normalized;
}

export function RoomGuestSlots({
  capacity,
  bedInfo,
  guests,
  extraSlots = 0,
  selectedIndex = -1,
  disabled = false,
  onSelectSlot,
  onAddSlot,
  onRemoveExtraSlot
}: {
  capacity: number;
  bedInfo: string;
  guests: RoomGuestSlotPerson[];
  extraSlots?: number;
  selectedIndex?: number;
  disabled?: boolean;
  onSelectSlot: (slotIndex: number, guest?: RoomGuestSlotPerson) => void;
  onAddSlot?: () => void;
  onRemoveExtraSlot?: (slotIndex: number) => void;
}) {
  const baseSlotCount = Math.max(1, capacity, guests.length);
  const groups = roomBedGroups(baseSlotCount, bedInfo);
  let slotIndex = 0;

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

  return <div className="room-bed-layout" aria-label="Oda misafir slotları">
    {onAddSlot && <div className="room-bed-layout__toolbar">
      <span>{guests.length} misafir · {capacity} kişilik oda</span>
      <ActionButton
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled || baseSlotCount + extraSlots >= 50}
        onClick={onAddSlot}
      >+ Slot</ActionButton>
    </div>}

    {groups.map((group, groupIndex) => <section className="room-bed-group" key={`${group.label}-${groupIndex}`}>
      <header><BedDouble size={16} aria-hidden="true" /><strong>{group.label}</strong></header>
      <div className="room-guest-slots">
        {Array.from({ length: group.slots }, () => {
          const currentIndex = slotIndex++;
          return <div className="room-guest-slot-wrap" key={currentIndex}>
            {renderSlot(currentIndex, guests[currentIndex])}
          </div>;
        })}
      </div>
    </section>)}

    {extraSlots > 0 && <section className="room-bed-group room-bed-group--manual">
      <header><Plus size={16} aria-hidden="true" /><strong>Ek slotlar</strong></header>
      <div className="room-guest-slots">
        {Array.from({ length: extraSlots }, (_, manualIndex) => {
          const currentIndex = baseSlotCount + manualIndex;
          return <div className="room-guest-slot-wrap is-manual" key={`manual-${manualIndex}`}>
            {renderSlot(currentIndex)}
            {onRemoveExtraSlot && <IconButton
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
    </section>}
  </div>;
}
