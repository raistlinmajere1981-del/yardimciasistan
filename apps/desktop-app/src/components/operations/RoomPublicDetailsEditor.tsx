import { useEffect, useMemo, useState } from "react";
import { Save, X } from "lucide-react";
import {
  ROOM_PUBLIC_DETAIL_LIMITS,
  ROOM_PUBLIC_FEATURE_CATALOG,
  normalizeRoomPublicFeatures,
  type RoomPublicFeatureId,
  type SaveRoomPublicDetailsInput
} from "@yardimci-asistan/shared";
import type { DesktopDashboardData } from "../../../electron/database";
import { ActionButton } from "../ui/ActionButton";

type EditorState = "idle" | "loading" | "error";

type RoomRecord = DesktopDashboardData["rooms"][number];

export interface RoomPublicDetailsSaveResult {
  ok: boolean;
  message: string;
}

interface RoomPublicDetailsEditorProps {
  open: boolean;
  room: RoomRecord | null;
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

function toForm(room: RoomRecord | null): RoomPublicDetailsFormState {
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
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(toForm(room));
    setState("idle");
    setMessage("");
  }, [open, room]);

  const capacity = useMemo(() => Number.parseInt(form.capacity, 10), [form.capacity]);
  const validCapacity = Number.isInteger(capacity) && capacity > 0 && capacity <= 100;
  const canSave = Boolean(room && form.name.trim() && validCapacity && state !== "loading");

  if (!open || !room) {
    return null;
  }

  return (
    <div
      className="manual-request-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && state !== "loading") onClose();
      }}
    >
      <aside className="manual-request-drawer" role="dialog" aria-modal="true" aria-labelledby="room-public-details-editor-title">
        <header className="manual-request-drawer-header">
          <div className="manual-request-heading">
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
          className="manager-form manual-request-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!canSave) return;

            setState("loading");
            setMessage("Oda bilgileri kaydediliyor...");
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
              setMessage(result.message);
              return;
            }

            onClose();
          }}
        >
          <div className="manual-request-core-grid">
            <label>
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
            <label>
              Oda numarası
              <input
                maxLength={ROOM_PUBLIC_DETAIL_LIMITS.number}
                value={form.number}
                onChange={(event) => setForm((current) => ({ ...current, number: event.target.value }))}
                placeholder="Örn. 4"
              />
            </label>
            <label>
              Kapasite
              <input
                type="number"
                min={1}
                max={100}
                required
                value={form.capacity}
                onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))}
              />
            </label>
            <label>
              Kat / konum
              <input
                maxLength={ROOM_PUBLIC_DETAIL_LIMITS.floor}
                value={form.floor}
                onChange={(event) => setForm((current) => ({ ...current, floor: event.target.value }))}
                placeholder="Örn. 1. kat"
              />
            </label>
            <label className="manual-request-note-field">
              Yatak bilgisi
              <input
                maxLength={ROOM_PUBLIC_DETAIL_LIMITS.bedInfo}
                value={form.bedInfo}
                onChange={(event) => setForm((current) => ({ ...current, bedInfo: event.target.value }))}
                placeholder="Örn. 1 çift kişilik + 1 tek kişilik yatak"
              />
            </label>
          </div>

          <fieldset className="manual-request-note-field">
            <legend>Oda özellikleri</legend>
            <div className="operation-filter-summary">
              {ROOM_PUBLIC_FEATURE_CATALOG.map((feature) => (
                <label key={feature.id}>
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

          <div className="manual-request-core-grid">
            <label className="manual-request-note-field">
              Açıklama
              <textarea
                maxLength={ROOM_PUBLIC_DETAIL_LIMITS.description}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Müşteriye gösterilebilecek kısa oda açıklaması."
              />
            </label>
            <label className="manual-request-note-field">
              Fiyat notu
              <textarea
                maxLength={ROOM_PUBLIC_DETAIL_LIMITS.priceNote}
                value={form.priceNote}
                onChange={(event) => setForm((current) => ({ ...current, priceNote: event.target.value }))}
                placeholder="Örn. Sezona ve kişi sayısına göre değişebilir."
              />
            </label>
          </div>

          {!validCapacity && <p className="form-status sync-error">Kapasite 1 ile 100 arasında olmalı.</p>}
          {message && <p className={`form-status sync-${state}`}>{message}</p>}

          <div className="manual-request-actions">
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
