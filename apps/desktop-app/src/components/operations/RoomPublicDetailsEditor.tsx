import { useEffect, useMemo, useState } from "react";
import { ImagePlus, Save, Trash2 } from "lucide-react";
import {
  ROOM_PUBLIC_DETAIL_LIMITS,
  ROOM_PUBLIC_FEATURE_CATALOG,
  normalizeRoomPublicFeatures,
  type RoomMediaAsset,
  type RoomPublicFeatureId,
  type RoomPublicMediaKind,
  type SaveRoomPublicDetailsInput
} from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { FormDialog } from "../ui/FormDialog";

type EditorState = "idle" | "loading" | "error";
type MediaState = "idle" | "loading" | "error";

const ROOM_MEDIA_KIND_OPTIONS: Array<{ id: RoomPublicMediaKind; label: string }> = [
  { id: "cover", label: "Kapak görseli" },
  { id: "photo", label: "Fotoğraf" },
  { id: "panorama_360", label: "360° panorama" },
  { id: "panorama_180", label: "180° panorama" },
  { id: "video", label: "Video" }
];

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

function mediaKindLabel(kind: RoomPublicMediaKind) {
  return ROOM_MEDIA_KIND_OPTIONS.find((option) => option.id === kind)?.label ?? kind;
}

function formatMediaSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function RoomPublicDetailsEditor({ open, room, onClose, onSave }: RoomPublicDetailsEditorProps) {
  const [form, setForm] = useState<RoomPublicDetailsFormState>(() => toForm(room));
  const [state, setState] = useState<EditorState>("idle");
  const [media, setMedia] = useState<RoomMediaAsset[]>([]);
  const [mediaKind, setMediaKind] = useState<RoomPublicMediaKind>("photo");
  const [mediaState, setMediaState] = useState<MediaState>("idle");
  const [mediaMessage, setMediaMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(toForm(room));
    setState("idle");
    setMedia([]);
    setMediaKind("photo");
    setMediaState("idle");
    setMediaMessage("");

    if (!room?.id || !window.yardimciDesktop) return;
    let cancelled = false;
    setMediaState("loading");
    void window.yardimciDesktop.listRoomMedia(room.id)
      .then((items) => {
        if (cancelled) return;
        setMedia(items);
        setMediaState("idle");
      })
      .catch((error) => {
        if (cancelled) return;
        setMediaState("error");
        setMediaMessage(error instanceof Error ? error.message : "Oda medyaları okunamadı.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, room]);

  const capacity = useMemo(() => Number.parseInt(form.capacity, 10), [form.capacity]);
  const validCapacity = Number.isInteger(capacity) && capacity > 0 && capacity <= 100;
  const canSave = Boolean(room && form.name.trim() && validCapacity && state !== "loading");
  const mediaBusy = mediaState === "loading";

  if (!open || !room) {
    return null;
  }

  const addMedia = async () => {
    const bridge = window.yardimciDesktop;
    if (!bridge) return;
    setMediaState("loading");
    setMediaMessage("");
    try {
      const result = await bridge.addRoomMedia({ roomId: room.id, kind: mediaKind });
      setMedia(result.media);
      setMediaState(result.ok ? "idle" : "error");
      setMediaMessage(result.message);
    } catch (error) {
      setMediaState("error");
      setMediaMessage(error instanceof Error ? error.message : "Medya eklenemedi.");
    }
  };

  const updateMedia = async (item: RoomMediaAsset, changes: Partial<Pick<RoomMediaAsset, "kind" | "title">>) => {
    const bridge = window.yardimciDesktop;
    if (!bridge) return;
    const next = { ...item, ...changes };
    setMedia((current) => current.map((candidate) => candidate.id === item.id ? next : candidate));
    setMediaState("loading");
    setMediaMessage("");
    try {
      const result = await bridge.updateRoomMedia({
        roomId: room.id,
        mediaId: item.id,
        kind: next.kind,
        title: next.title
      });
      setMedia(result.media);
      setMediaState(result.ok ? "idle" : "error");
      setMediaMessage(result.message);
    } catch (error) {
      setMediaState("error");
      setMediaMessage(error instanceof Error ? error.message : "Medya güncellenemedi.");
    }
  };

  const deleteMedia = async (item: RoomMediaAsset) => {
    const bridge = window.yardimciDesktop;
    if (!bridge) return;
    setMediaState("loading");
    setMediaMessage("");
    try {
      const result = await bridge.deleteRoomMedia({ roomId: room.id, mediaId: item.id });
      setMedia(result.media);
      setMediaState(result.ok ? "idle" : "error");
      setMediaMessage(result.message);
    } catch (error) {
      setMediaState("error");
      setMediaMessage(error instanceof Error ? error.message : "Medya kaldırılamadı.");
    }
  };

  return (
    <FormDialog
      title="Oda bilgilerini düzenle"
      onClose={() => {
        if (state !== "loading" && !mediaBusy) onClose();
      }}
      closeBlocked={state === "loading" || mediaBusy}
      dismissOnBackdrop
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
      footer={(
        <>
          {!validCapacity && (
            <p id="room-capacity-error" role="alert" className="form-status sync-error">
              Kapasite 1 ile 100 arasında olmalı.
            </p>
          )}
          <div className="action-row room-public-details-actions">
            <ActionButton variant="secondary" type="button" onClick={onClose} disabled={state === "loading" || mediaBusy}>
              Vazgeç
            </ActionButton>
            <ActionButton type="submit" disabled={!canSave || mediaBusy}>
              <Save size={16} aria-hidden="true" />
              {state === "loading" ? "Kaydediliyor" : "Kaydet"}
            </ActionButton>
          </div>
        </>
      )}
    >
      <div className="form-stack customer-create-form room-public-details-form">
        <section className="panel form-stack">
          <div className="page-toolbar">
            <div className="page-toolbar__copy">
              <strong>Temel bilgiler</strong>
              <small>Oda kimliği, kapasite ve yatak düzeni</small>
            </div>
          </div>

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
        </section>

        <section className="panel form-stack">
          <div className="page-toolbar">
            <div className="page-toolbar__copy">
              <strong>Müşteriye açık bilgiler</strong>
              <small>Oda özellikleri ve açıklamalar</small>
            </div>
          </div>

          <fieldset className="room-public-features">
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
        </section>

        <section className="panel form-stack room-media-editor">
          <div className="page-toolbar">
            <div className="page-toolbar__copy">
              <strong>Web medyaları</strong>
              <small>Fotoğraf, panorama ve videolar siteye otomatik yayınlanır</small>
            </div>
          </div>

          <div className="room-media-add-row">
            <label className="form-field form-field--medium">
              Eklenecek medya türü
              <select
                value={mediaKind}
                disabled={mediaBusy}
                onChange={(event) => setMediaKind(event.target.value as RoomPublicMediaKind)}
              >
                {ROOM_MEDIA_KIND_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <ActionButton type="button" onClick={() => void addMedia()} disabled={mediaBusy}>
              <ImagePlus size={16} aria-hidden="true" />
              {mediaBusy ? "İşleniyor" : "Dosya ekle"}
            </ActionButton>
          </div>

          <p className="room-media-help">
            360° ve 180° için panoramik JPG/PNG/WebP; video için MP4/WebM kullanın. Kapak, panorama ve video türlerinde son eklenen dosya aktif kayıt olur.
          </p>

          {mediaMessage && (
            <p className={mediaState === "error" ? "form-status sync-error" : "form-status"}>
              {mediaMessage}
            </p>
          )}

          {media.length === 0 ? (
            <div className="room-media-empty">Bu oda için henüz medya eklenmedi.</div>
          ) : (
            <div className="room-media-list">
              {media.map((item) => (
                <div className="room-media-row" key={item.id}>
                  <div className="room-media-file">
                    <strong>{item.originalName}</strong>
                    <small>{formatMediaSize(item.sizeBytes)} · {item.remoteUrl ? "Web'e hazır" : "Yayın bekliyor"}</small>
                  </div>

                  <label className="form-field room-media-kind">
                    Tür
                    <select
                      value={item.kind}
                      disabled={mediaBusy}
                      onChange={(event) => void updateMedia(item, {
                        kind: event.target.value as RoomPublicMediaKind
                      })}
                    >
                      {ROOM_MEDIA_KIND_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="form-field room-media-title">
                    Başlık
                    <input
                      value={item.title}
                      maxLength={240}
                      disabled={mediaBusy}
                      placeholder={mediaKindLabel(item.kind)}
                      onChange={(event) => {
                        const title = event.target.value;
                        setMedia((current) => current.map((candidate) =>
                          candidate.id === item.id ? { ...candidate, title } : candidate
                        ));
                      }}
                      onBlur={(event) => void updateMedia(
                        { ...item, title: event.currentTarget.value },
                        { title: event.currentTarget.value }
                      )}
                    />
                  </label>

                  <ActionButton
                    variant="secondary"
                    type="button"
                    disabled={mediaBusy}
                    onClick={() => void deleteMedia(item)}
                    title="Medyayı kaldır"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    Kaldır
                  </ActionButton>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </FormDialog>
  );
}
