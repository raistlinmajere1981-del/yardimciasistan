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
  RoomMediaAsset,
  RoomPublicMediaKind
} from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";

const ROOM_MEDIA_KIND_OPTIONS: Array<{ id: RoomPublicMediaKind; label: string; chip: string }> = [
  { id: "cover", label: "Kapak görseli", chip: "Kapak" },
  { id: "photo", label: "Normal fotoğraf", chip: "Fotoğraf" },
  { id: "panorama_360", label: "360° panorama", chip: "360°" },
  { id: "panorama_180", label: "180° panorama", chip: "180°" },
  { id: "video", label: "Video", chip: "Video" }
];

interface RoomMediaPanelRoom {
  id: string;
  key: string;
  name: string;
  number: string;
}

interface RoomMediaPanelProps {
  room: RoomMediaPanelRoom | null;
  rooms: RoomMediaPanelRoom[];
  disabled?: boolean;
  onRoomChange: (key: string) => void;
}

type MediaState = "idle" | "loading" | "error";

function formatMediaSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function mediaKindOptionsForAsset(item: RoomMediaAsset) {
  if (item.mimeType.startsWith("video/")) {
    return ROOM_MEDIA_KIND_OPTIONS.filter((option) => option.id === "video");
  }
  return ROOM_MEDIA_KIND_OPTIONS.filter((option) => option.id !== "video");
}

function roomLabel(room: RoomMediaPanelRoom) {
  if (room.number) return `Oda ${room.number} · ${room.name}`;
  return room.name || "Yeni Oda";
}

function MediaKindIcon({ kind }: { kind: RoomPublicMediaKind }) {
  if (kind === "video") return <Video size={20} aria-hidden="true" />;
  if (kind === "panorama_360" || kind === "panorama_180") {
    return <ScanLine size={20} aria-hidden="true" />;
  }
  if (kind === "photo") return <Images size={20} aria-hidden="true" />;
  return <FileImage size={20} aria-hidden="true" />;
}

export function RoomMediaPanel({ room, rooms, disabled = false, onRoomChange }: RoomMediaPanelProps) {
  const [media, setMedia] = useState<RoomMediaAsset[]>([]);
  const [state, setState] = useState<MediaState>("idle");
  const [message, setMessage] = useState("");

  const mediaRoomId = room?.id ?? "";
  const mediaEnabled = Boolean(mediaRoomId) && !disabled;
  const busy = state === "loading";

  useEffect(() => {
    setMedia([]);
    setMessage("");
    setState("idle");

    if (!mediaRoomId || !window.yardimciDesktop) return;
    let cancelled = false;
    setState("loading");
    void window.yardimciDesktop.listRoomMedia(mediaRoomId)
      .then((items) => {
        if (cancelled) return;
        setMedia(items);
        setState("idle");
      })
      .catch((error) => {
        if (cancelled) return;
        setState("error");
        setMessage(error instanceof Error ? error.message : "Oda medyaları okunamadı.");
      });

    return () => {
      cancelled = true;
    };
  }, [mediaRoomId]);

  const addMedia = async () => {
    const bridge = window.yardimciDesktop;
    if (!bridge || !mediaRoomId) return;
    setState("loading");
    setMessage("");
    try {
      const result = await bridge.addRoomMedia({ roomId: mediaRoomId });
      setMedia(result.media);
      setState(result.ok ? "idle" : "error");
      setMessage(result.message.includes("iptal") ? "" : result.message);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Medya eklenemedi.");
    }
  };

  const updateMediaKind = async (item: RoomMediaAsset, kind: RoomPublicMediaKind) => {
    const bridge = window.yardimciDesktop;
    if (!bridge || !mediaRoomId || item.kind === kind) return;
    setMedia((current) => current.map((candidate) =>
      candidate.id === item.id ? { ...candidate, kind } : candidate
    ));
    setState("loading");
    setMessage("");
    try {
      const result = await bridge.updateRoomMedia({
        roomId: mediaRoomId,
        mediaId: item.id,
        kind,
        title: item.title
      });
      setMedia(result.media);
      setState(result.ok ? "idle" : "error");
      setMessage(result.message);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Medya türü güncellenemedi.");
    }
  };

  const deleteMedia = async (item: RoomMediaAsset) => {
    const bridge = window.yardimciDesktop;
    if (!bridge || !mediaRoomId) return;
    setState("loading");
    setMessage("");
    try {
      const result = await bridge.deleteRoomMedia({ roomId: mediaRoomId, mediaId: item.id });
      setMedia(result.media);
      setState(result.ok ? "idle" : "error");
      setMessage(result.message);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Medya kaldırılamadı.");
    }
  };

  return (
    <aside className="settings-panel room-media-panel" aria-label="Oda medyaları">
      <div className="settings-panel-header room-media-panel-header">
        <div>
          <h3>Oda Medyaları</h3>
          <p>Web sitesi için görsel ve videolar</p>
        </div>
        <span className="room-media-count">{media.length}</span>
      </div>

      <div className="room-media-panel-controls">
        <label className="form-field room-media-room-picker">
          <span>Oda</span>
          <select
            value={room?.key ?? ""}
            disabled={disabled || rooms.length === 0}
            onChange={(event) => onRoomChange(event.target.value)}
          >
            {rooms.length === 0 && <option value="">Oda yok</option>}
            {rooms.map((candidate) => (
              <option key={candidate.key} value={candidate.key}>
                {roomLabel(candidate)}
              </option>
            ))}
          </select>
        </label>

        <ActionButton
          type="button"
          size="sm"
          className="room-media-add-button"
          disabled={!mediaEnabled || busy}
          onClick={() => void addMedia()}
        >
          <ImagePlus size={15} aria-hidden="true" />
          Fotoğraf / video ekle
        </ActionButton>

        {!mediaRoomId && room && (
          <p className="room-media-panel-note">
            Bu oda henüz kaydedilmedi. Medya eklemek için önce Ayarları Kaydet.
          </p>
        )}
        <p className="room-media-panel-note">
          JPG · PNG · WebP · MP4 · WebM
        </p>
        {message && (
          <p className={state === "error" ? "form-status sync-error" : "form-status"}>
            {message}
          </p>
        )}
      </div>

      <div className="room-media-panel-scroll">
        {busy && media.length === 0 ? (
          <div className="room-media-panel-empty">Medyalar hazırlanıyor…</div>
        ) : media.length === 0 ? (
          <div className="room-media-panel-empty">
            <Images size={24} aria-hidden="true" />
            <strong>Henüz medya yok</strong>
            <span>Seçili odaya ilk fotoğrafı veya panoramayı ekleyin.</span>
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
                    onClick={() => void deleteMedia(item)}
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
                      onClick={() => void updateMediaKind(item, option.id)}
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
