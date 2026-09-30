import { useEffect, useState } from "react";
import {
  FileImage,
  ImagePlus,
  Images,
  ScanLine,
  Trash2,
  Video
} from "lucide-react";
import type {
  PublicResourceMediaAssetFields,
  PublicResourceMediaKind
} from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { reportAppStatus } from "../../app/runtime-state";

const MEDIA_KIND_OPTIONS: Array<{ id: PublicResourceMediaKind; label: string; chip: string }> = [
  { id: "cover", label: "Kapak görseli", chip: "Kapak" },
  { id: "photo", label: "Normal fotoğraf", chip: "Fotoğraf" },
  { id: "panorama_360", label: "360° panorama", chip: "360°" },
  { id: "panorama_180", label: "180° panorama", chip: "180°" },
  { id: "video", label: "Video", chip: "Video" }
];

export interface PublicResourceMediaPanelResource {
  id: string;
  key: string;
  label: string;
}

interface MediaMutationResult {
  ok: boolean;
  message: string;
  media: PublicResourceMediaAssetFields[];
  dirty?: boolean;
}

interface PublicResourceMediaPanelProps {
  title: string;
  subtitle: string;
  resourceLabel: string;
  ariaLabel: string;
  emptyHint: string;
  resource: PublicResourceMediaPanelResource | null;
  resources?: PublicResourceMediaPanelResource[];
  showResourcePicker?: boolean;
  embedded?: boolean;
  disabled?: boolean;
  revision: number;
  onResourceChange?: (key: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  listMedia: (resourceId: string) => Promise<PublicResourceMediaAssetFields[]>;
  addMedia: (resourceId: string) => Promise<MediaMutationResult>;
  updateMedia: (
    resourceId: string,
    item: PublicResourceMediaAssetFields,
    kind: PublicResourceMediaKind
  ) => Promise<MediaMutationResult>;
  deleteMedia: (
    resourceId: string,
    item: PublicResourceMediaAssetFields
  ) => Promise<MediaMutationResult>;
}

type MediaState = "idle" | "loading" | "error";

function formatMediaSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function mediaKindOptionsForAsset(item: PublicResourceMediaAssetFields) {
  if (item.mimeType.startsWith("video/")) {
    return MEDIA_KIND_OPTIONS.filter((option) => option.id === "video");
  }
  return MEDIA_KIND_OPTIONS.filter((option) => option.id !== "video");
}

function MediaKindIcon({ kind }: { kind: PublicResourceMediaKind }) {
  if (kind === "video") return <Video size={20} aria-hidden="true" />;
  if (kind === "panorama_360" || kind === "panorama_180") {
    return <ScanLine size={20} aria-hidden="true" />;
  }
  if (kind === "photo") return <Images size={20} aria-hidden="true" />;
  return <FileImage size={20} aria-hidden="true" />;
}

export function PublicResourceMediaPanel({
  title,
  subtitle,
  resourceLabel,
  ariaLabel,
  emptyHint,
  resource,
  resources = [],
  showResourcePicker = true,
  embedded = false,
  disabled = false,
  revision,
  onResourceChange,
  onDirtyChange,
  listMedia,
  addMedia,
  updateMedia,
  deleteMedia
}: PublicResourceMediaPanelProps) {
  const [media, setMedia] = useState<PublicResourceMediaAssetFields[]>([]);
  const [state, setState] = useState<MediaState>("idle");

  const resourceId = resource?.id ?? "";
  const mediaEnabled = Boolean(resourceId) && !disabled;
  const busy = state === "loading";

  useEffect(() => {
    setMedia([]);
    setState("idle");

    if (!resourceId) return;
    let cancelled = false;
    setState("loading");
    void listMedia(resourceId)
      .then((items) => {
        if (cancelled) return;
        setMedia(items);
        setState("idle");
      })
      .catch((error) => {
        if (cancelled) return;
        setState("error");
        reportAppStatus("error", error instanceof Error ? error.message : `${resourceLabel} medyaları okunamadı.`);
      });

    return () => {
      cancelled = true;
    };
  }, [listMedia, resourceId, resourceLabel, revision]);

  const add = async () => {
    if (!resourceId) return;
    setState("loading");
    setMessage("");
    try {
      const result = await addMedia(resourceId);
      setMedia(result.media);
      setState(result.ok ? "idle" : "error");
      if (!result.message.toLocaleLowerCase("tr-TR").includes("iptal")) {
        reportAppStatus(result.ok ? "success" : "error", result.message);
      }
      if (typeof result.dirty === "boolean") onDirtyChange(result.dirty);
    } catch (error) {
      setState("error");
      reportAppStatus("error", error instanceof Error ? error.message : "Medya eklenemedi.");
    }
  };

  const updateKind = async (item: PublicResourceMediaAssetFields, kind: PublicResourceMediaKind) => {
    if (!resourceId || item.kind === kind) return;
    setMedia((current) => current.map((candidate) =>
      candidate.id === item.id ? { ...candidate, kind } : candidate
    ));
    setState("loading");
    setMessage("");
    try {
      const result = await updateMedia(resourceId, item, kind);
      setMedia(result.media);
      setState(result.ok ? "idle" : "error");
      reportAppStatus(result.ok ? "success" : "error", result.message);
      if (typeof result.dirty === "boolean") onDirtyChange(result.dirty);
    } catch (error) {
      setState("error");
      reportAppStatus("error", error instanceof Error ? error.message : "Medya türü güncellenemedi.");
    }
  };

  const remove = async (item: PublicResourceMediaAssetFields) => {
    if (!resourceId) return;
    setState("loading");
    setMessage("");
    try {
      const result = await deleteMedia(resourceId, item);
      setMedia(result.media);
      setState(result.ok ? "idle" : "error");
      reportAppStatus(result.ok ? "success" : "error", result.message);
      if (typeof result.dirty === "boolean") onDirtyChange(result.dirty);
    } catch (error) {
      setState("error");
      reportAppStatus("error", error instanceof Error ? error.message : "Medya kaldırılamadı.");
    }
  };

  return (
    <aside
      className={`${embedded ? "resource-media-panel--embedded " : "settings-panel "}room-media-panel`}
      aria-label={ariaLabel}
    >
      <div className="settings-panel-header room-media-panel-header">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <span className="room-media-count">{media.length}</span>
      </div>

      <div className="room-media-panel-controls">
        {showResourcePicker ? (
          <label className="form-field room-media-room-picker">
            <span>{resourceLabel}</span>
            <select
              value={resource?.key ?? ""}
              disabled={disabled || resources.length === 0}
              onChange={(event) => onResourceChange?.(event.target.value)}
            >
              {resources.length === 0 && <option value="">{resourceLabel} yok</option>}
              {resources.map((candidate) => (
                <option key={candidate.key} value={candidate.key}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="room-media-selected-resource" aria-live="polite">
            <span>Seçili {resourceLabel.toLocaleLowerCase("tr-TR")}</span>
            <strong>{resource?.label ?? `${resourceLabel} seçin`}</strong>
          </div>
        )}

        <ActionButton
          type="button"
          size="sm"
          className="room-media-add-button"
          disabled={!mediaEnabled || busy}
          onClick={() => void add()}
        >
          <ImagePlus size={15} aria-hidden="true" />
          Fotoğraf / video ekle
        </ActionButton>

        {!resourceId && resource && (
          <p className="room-media-panel-note">
            Bu {resourceLabel.toLocaleLowerCase("tr-TR")} henüz kaydedilmedi. Medya eklemek için önce Ayarları Kaydet.
          </p>
        )}
        <p className="room-media-panel-note">
          JPG · PNG · WebP · MP4 · WebM · Değişiklikler Kaydet'e kadar web'e gönderilmez.
        </p>
      </div>

      <div className="room-media-panel-scroll">
        {busy && media.length === 0 ? (
          <div className="room-media-panel-empty">Medyalar hazırlanıyor…</div>
        ) : media.length === 0 ? (
          <div className="room-media-panel-empty">
            <Images size={24} aria-hidden="true" />
            <strong>Henüz medya yok</strong>
            <span>{emptyHint}</span>
          </div>
        ) : (
          <div className="room-media-card-list">
            {media.map((item) => (
              <article className="room-media-card" key={item.id}>
                <div className="room-media-card-top">
                  <div className="room-media-card-preview" aria-hidden="true">
                    {item.previewDataUrl ? (
                      <img src={item.previewDataUrl} alt="" />
                    ) : (
                      <MediaKindIcon kind={item.kind} />
                    )}
                  </div>
                  <div className="room-media-card-copy">
                    <strong title={item.originalName}>{item.originalName}</strong>
                    <span>
                      {formatMediaSize(item.sizeBytes)}
                      {" · "}
                      {item.remoteUrl ? "Web'e hazır" : "Yayın bekliyor"}
                    </span>
                  </div>
                  <ActionButton
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="room-media-card-remove"
                    disabled={!mediaEnabled || busy}
                    onClick={() => void remove(item)}
                    aria-label={`${item.originalName} medyasını kaldır`}
                    title="Medyayı kaldır"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </ActionButton>
                </div>

                <div className="room-media-kind-chips" aria-label="Medya kullanım türü">
                  {mediaKindOptionsForAsset(item).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`room-media-kind-chip${item.kind === option.id ? " is-selected" : ""}`}
                      disabled={!mediaEnabled || busy}
                      aria-pressed={item.kind === option.id}
                      title={option.label}
                      onClick={() => void updateKind(item, option.id)}
                    >
                      {option.chip}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
