import { useState } from "react";
import type { DesktopRoomFolio } from "../../../electron/room-folio";
import { ActionButton } from "../ui/ActionButton";
import { DatePicker } from "../ui/DateTimePicker";
import type { RoomFolioController } from "./use-room-folio-controller";

export function RoomStayDates({ folio, controller, disabled, onDirty }: {
  folio: DesktopRoomFolio;
  controller: RoomFolioController;
  disabled: boolean;
  onDirty: (dirty: boolean) => void;
}) {
  const baseline = { start: folio.checkInDate, end: folio.plannedCheckOutDate };
  const [edits, setEdits] = useState<typeof baseline | null>(null);
  const draft = edits ?? baseline;
  const dirty = draft.start !== baseline.start || draft.end !== baseline.end;

  function update(next: typeof baseline) {
    setEdits(next);
    onDirty(next.start !== baseline.start || next.end !== baseline.end);
  }

  async function save() {
    if (!dirty) return;
    const result = await controller.mutate(() => window.yardimciDesktop!.updateRoomFolioDetails({
      folioId: folio.id,
      guestCount: folio.guestCount,
      checkInDate: draft.start,
      plannedCheckOutDate: draft.end,
      nightlyPriceMinor: folio.nightlyPriceMinor,
      lodgingManualOverride: folio.lodgingManualOverride,
      lodgingTotalMinor: folio.lodgingManualOverride ? folio.lodgingTotalMinor : undefined
    }), "details");
    if (result?.ok) {
      setEdits(null);
      onDirty(false);
    }
  }

  return <section className="room-stay-dates" aria-label="Konaklama tarihleri">
    <div className="form-field room-stay-date-field">
      <span>Giriş</span>
      <DatePicker
        ariaLabel="Giriş tarihi"
        value={draft.start}
        disabled={disabled}
        clearable={false}
        onChange={start => update({ ...draft, start })}
      />
    </div>
    <div className="form-field room-stay-date-field">
      <span>Çıkış</span>
      <DatePicker
        ariaLabel="Çıkış tarihi"
        value={draft.end}
        min={draft.start || undefined}
        disabled={disabled}
        onChange={end => update({ ...draft, end })}
      />
    </div>
    {dirty && <ActionButton size="sm" disabled={disabled} onClick={() => void save()}>Tarihleri Kaydet</ActionButton>}
  </section>;
}
