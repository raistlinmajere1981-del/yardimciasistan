import { useDialogFocus } from "../ui/useDialogFocus";
import { useEffect, useMemo, useState } from "react";
import { Save, X } from "lucide-react";
import {
  ROOM_PUBLIC_DETAIL_LIMITS,
  ROOM_PUBLIC_FEATURE_CATALOG,
  normalizeRoomPublicFeatures,
  type RoomPublicFeatureId,
  type SaveRoomPublicDetailsInput
} from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";

type EditorState = "idle" | "loading" | "error";

interface RoomPublicDetailsEditorRoom {
  id: string;
  name: string;
  number: string;
  capacity: number;
  bedInfo: string;
  floor: string;
  features: RoomPublicFeatureId[];
  description: string;
  priceNote: string;
}

interface RoomPublicDetailsSaveResult {
  ok: boolean;
  message: string;
}

interface RoomPublicDetailsEditorProps {
  open: boolean;
  room: RoomPublicDetailsEditorRoom | null;
  onClose: () => void;
  onSave: (input: SaveRoomPublicDetailsInput) => Promise<RoomPublicDetailsSaveResult>;
}

interface RoomPublicDetailsFormState {
  name: string;
  number: string;
  capacity: string;
  bedInfo: string;
  floor: string;
  features: RoomPublicFeatureId[];
  description: string;
  priceNote: string;
}

function toForm(room: RoomPublicDetailsEditorRoom | null): RoomPublicDetailsFormState {
  return {
    name: room?.name ?? "",
    number: room?.number ?? "",
    capacity: String(room?.capacity ?? 1),
    bedInfo: room?.bedInfo ?? "",
    floor: room?.floor ?? "",
    features: normalizeRoomPublicFeatures(room?.features ?? []),
    description: room?.description ?? "",
    priceNote: room?.priceNote ?? ""
  };
}

function toggleFeature(features: RoomPublicFeatureId[], featureId: RoomPublicFeatureId) {
  return features.includes(featureId)
    ? features.filter((value) => value !== featureId)
    : [...features, featureId];
}

export function RoomPublicDetailsEditor({ open, room, onClose, onSave }: RoomPublicDetailsEditorProps) {
  const [form, setForm] = useState<RoomPublicDetailsFormState>(() => toForm(room));
  const [state, setState] = useState<EditorState>("idle");

  useEffect(() => {
    if (!open) return;
    setForm(toForm(room));
    setState("idle");
  }, [open, room]);

  const capacity = useMemo(() => Number.parseInt(form.capacity, 10), [form.capacity]);
  const validCapacity = Number.isInteger(capacity) && capacity > 0 && capacity <= 100;
  const canSave = Boolean(room && form.name.trim() && validCapacity && state !== "loading");

  const dialogRef = useDialogFocus(open);

  if (!open || !room) {
    return null;
  }

  return (
    <div
      className="manual-request-backdrop overlay overlay--drawer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && state !== "loading") onClose();
      }}
    >
      <aside ref={dialogRef} className="drawer drawer--form drawer--scroll" role="dialog" aria-modal="true" aria-labelledby="room-public-details-editor-title">
        <header className="overlay-header overlay-header--sticky">
          <div className="overlay-heading">
            <p>Müşteriye açık oda bilgileri</p>
            <h2 id="room-public-details-editor-title">Oda bilgilerini düzenle</h2>
          </div>
          <button
            className="drawer-close-button"
            type="button"
            aria-label="Oda bilgileri formunu kapat"
            onClick={onClose}
            disabled={state === "loading"}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <form
          className="form-stack overlay-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!canSave) return;

            setState("loading");
            const result = await onSave({
              roomId: room.id,
              name: form.name.trim(),
              number: form.number.trim(),
              capacity,
              bedInfo: form.bedInfo.trim(),
              floor: form.floor.trim(),
              features: normalizeRoomPublicFeatures(form.features),
              description: form.description.trim(),
              priceNote: form.priceNote.trim()
            });

            if (!result.ok) {
              setState("error");
              return;
            }

            onClose();
          }}
        >
          <div className="form-grid">
            <label className="form-field form-field--medium">
              Oda adı
              <input
                autoFocus
                required
                maxLength={ROOM_PUBLIC_DETAIL_LIMITS.name}
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Örn. Deniz Manzaralı Oda"
              />
            </label>
            <label className="form-field form-field--short">
              Oda numarası
              <input
                maxLength={ROOM_PUBLIC_DETAIL_LIMITS.number}
                value={form.number}
                onChange={(event) => setForm((current) => ({ ...current, number: event.target.value }))}
                placeholder="Örn. 4"
              />
            </label>
            <label className="form-field form-field--xs">
              Kapasite
              <input
                type="number"
                min={1}
                max={100}
                required
                aria-invalid={!validCapacity}
                aria-describedby={!validCapacity ? "room-capacity-error" : undefined}
                value={form.capacity}
                onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))}
              />
            </label>
            <label className="form-field form-field--short">
              Kat / konum
              <input
                maxLength={ROOM_PUBLIC_DETAIL_LIMITS.floor}
                value={form.floor}
                onChange={(event) => setForm((current) => ({ ...current, floor: event.target.value }))}
                placeholder="Örn. 1. kat"
              />
            </label>
            <label className="form-field--span form-field form-field--long">
              Yatak bilgisi
              <input
                maxLength={ROOM_PUBLIC_DETAIL_LIMITS.bedInfo}
                value={form.bedInfo}
                onChange={(event) => setForm((current) => ({ ...current, bedInfo: event.target.value }))}
                placeholder="Örn. 1 çift kişilik + 1 tek kişilik yatak"
              />
            </label>
          </div>

          <fieldset className="form-field--span">
            <legend>Oda özellikleri</legend>
            <div className="page-toolbar__start">
              {ROOM_PUBLIC_FEATURE_CATALOG.map((feature) => (
                <label className="form-check" key={feature.id}>
                  <input
                    type="checkbox"
                    checked={form.features.includes(feature.id)}
                    onChange={() => setForm((current) => ({
                      ...current,
                      features: toggleFeature(current.features, feature.id)
                    }))}
                  />
                  {feature.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="form-grid">
            <label className="form-field--span form-field form-field--fluid">
              Açıklama
              <textarea
                maxLength={ROOM_PUBLIC_DETAIL_LIMITS.description}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Müşteriye gösterilebilecek kısa oda açıklaması."
              />
            </label>
            <label className="form-field--span form-field form-field--fluid">
              Fiyat notu
              <textarea
                maxLength={ROOM_PUBLIC_DETAIL_LIMITS.priceNote}
                value={form.priceNote}
                onChange={(event) => setForm((current) => ({ ...current, priceNote: event.target.value }))}
                placeholder="Örn. Sezona ve kişi sayısına göre değişebilir."
              />
            </label>
          </div>

          {!validCapacity && <p id="room-capacity-error" role="alert" className="form-status sync-error">Kapasite 1 ile 100 arasında olmalı.</p>}

          <div className="overlay-footer overlay-footer--inset form-actions">
            <ActionButton variant="secondary" type="button" onClick={onClose} disabled={state === "loading"}>
              Vazgeç
            </ActionButton>
            <ActionButton type="submit" disabled={!canSave}>
              <Save size={16} aria-hidden="true" />
              {state === "loading" ? "Kaydediliyor" : "Kaydet"}
            </ActionButton>
          </div>
        </form>
      </aside>
    </div>
  );
}
