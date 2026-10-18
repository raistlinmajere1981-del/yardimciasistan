import { useState } from "react";
import type { useBusinessLayoutSettings } from "../../app/use-business-layout-settings";
import { reportAppStatus } from "../../app/runtime-state";
import { ModalSurface } from "../ui/ModalSurface";
import { ActionButton } from "../ui/ActionButton";
import { RoomManagementSection } from "./RoomManagementSection";
import { RoomPublicDetailsEditor } from "../operations/RoomPublicDetailsEditor";
import { TablePublicDetailsEditor } from "../operations/TablePublicDetailsEditor";
import { LayoutSettingsSection } from "./LayoutSettingsSection";

export function BusinessLayoutOverlay({ kind, controller, onClose }: {
  kind: "rooms" | "tables";
  controller: ReturnType<typeof useBusinessLayoutSettings>;
  onClose: () => void;
}) {
  const [detailKey, setDetailKey] = useState("");
  const [leave, setLeave] = useState(false);
  const [busy, setBusy] = useState(false);
  const blocked = busy || controller.loading || controller.saving;
  const selectedRoom = kind === "rooms" && detailKey ? controller.draft.rooms.find(room => room.key === detailKey) : null;
  const selectedTable = kind === "tables" && detailKey ? controller.draft.tables.find(table => table.key === detailKey) : null;
  const title = kind === "rooms" ? "Oda Yönetimi" : "Masa Yönetimi";
  function close() {
    if (blocked) return;
    if (controller.dirty) setLeave(true);
    else onClose();
  }
  async function save(closeAfter = false) {
    setBusy(true);
    try {
      const result = await controller.save();
      if (!result.ok) { reportAppStatus("error", result.message); return; }
      if (result.changed) reportAppStatus("success", result.message || `${title} kaydedildi.`);
      if (closeAfter) onClose();
      else setLeave(false);
    } finally { setBusy(false); }
  }
  async function discard(closeAfter = false) {
    setBusy(true);
    try {
      if (!await controller.discard()) return;
      if (closeAfter) onClose();
      else setLeave(false);
    } finally { setBusy(false); }
  }
  // Exclusive modal surfaces: a detail dialog temporarily replaces management.
  // The shared controller keeps staged changes until management Kaydet.
  if (selectedRoom) return <RoomPublicDetailsEditor
    open dialogClassName="settings-layout-details-modal"
    room={{
      id: selectedRoom.key, name: selectedRoom.name, number: selectedRoom.number,
      capacity: selectedRoom.capacity, bedInfo: selectedRoom.bedInfo,
      floor: selectedRoom.floor, features: selectedRoom.features,
      description: selectedRoom.description, priceNote: selectedRoom.priceNote,
      price: selectedRoom.price
    }}
    onClose={() => setDetailKey("")}
    onSave={async (input) => {
      controller.updateRoom(selectedRoom.key, {
        name: input.name, number: input.number, capacity: input.capacity,
        bedInfo: input.bedInfo, floor: input.floor, features: input.features,
        description: input.description, priceNote: input.priceNote, price: input.price
      });
      return { ok: true, message: "Oda detayları taslağa uygulandı." };
    }}
  />;
  if (selectedTable) return <TablePublicDetailsEditor
    open dialogClassName="settings-layout-details-modal"
    table={selectedTable}
    onClose={() => setDetailKey("")}
    onSave={async (input) => {
      controller.updateTable(selectedTable.key, {
        capacity: input.capacity, description: input.description,
        features: input.features, smokingPolicy: input.smokingPolicy
      });
      return { ok: true, message: "Masa detayları taslağa uygulandı." };
    }}
  />;
  return <ModalSurface labelledBy="settings-layout-title" className="settings-layout-overlay"
    dismissOnBackdrop closeBlocked={blocked} onClose={close}>
    <header className="workspace-frame__header">
      <h2 id="settings-layout-title">{title}</h2>
      <ActionButton variant="secondary" disabled={blocked} onClick={close}>Kapat</ActionButton>
    </header>
    <div className="settings-layout-body">
      {controller.message && <p role={controller.state === "error" ? "alert" : "status"}>{controller.message}</p>}
      <div hidden={leave}>
        {kind === "rooms" ? <RoomManagementSection controller={controller} onEditRoom={setDetailKey} />
          : <LayoutSettingsSection controller={controller} onEditTable={setDetailKey} />}
      </div>
      {leave && <section className="form-stack" aria-label="Kaydedilmemiş değişiklikler">
        <h3>{title} değişiklikleri bekliyor</h3>
        <p>Ayrılmadan önce değişiklikleri kaydedin veya geri alın.</p>
        <div className="action-row">
          <ActionButton disabled={blocked} onClick={() => void save(true)}>Kaydet ve geç</ActionButton>
          <ActionButton variant="secondary" disabled={blocked} onClick={() => void discard(true)}>Değişiklikleri geri al ve geç</ActionButton>
          <ActionButton variant="secondary" disabled={blocked} onClick={() => setLeave(false)}>Burada kal</ActionButton>
        </div>
      </section>}
    </div>
    {!leave && <footer className="workspace-frame__footer action-row">
      {controller.dirty && <span>Kaydedilmemiş değişiklikler</span>}
      <ActionButton disabled={blocked || !controller.dirty} onClick={() => void save()}>Kaydet</ActionButton>
      <ActionButton variant="secondary" disabled={blocked || !controller.dirty} onClick={() => void discard()}>Değişiklikleri Geri Al</ActionButton>
    </footer>}
  </ModalSurface>;
}
