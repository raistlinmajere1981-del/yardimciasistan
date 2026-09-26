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

const ROOM_MEDIA_KIND_OPTIONS: Array<{ id: RoomPublicMediaKind; label: string }> = [
  { id: "cover", label: "Kapak görseli" },
  { id: "photo", label: "Normal fotoğraf" },
  { id: "panorama_360", label: "360° panorama" },
  { id: "panorama_180", label: "180° panorama" },
  { id: "video", label: "Video" }
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

function mediaKindLabel(kind: RoomPublicMediaKind) {
  return ROOM_MEDIA_KIND_OPTIONS.find((option) => option.id === kind)?.label ?? kind;
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
  const [mediaKind, setMediaKind] = useState<RoomPublicMediaKind>("photo");
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
      const result = await bridge.addRoomMedia({ roomId: mediaRoomId, kind: mediaKind });
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
        <label className="form-field">
          Oda
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

        <div className="room-media-panel-add">
          <label className="form-field">
            Medya türü
            <select
              value={mediaKind}
              disabled={!mediaEnabled || busy}
              onChange={(event) => setMediaKind(event.target.value as RoomPublicMediaKind)}
            >
              {ROOM_MEDIA_KIND_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <ActionButton
            type="button"
            size="sm"
            disabled={!mediaEnabled || busy}
            onClick={() => void addMedia()}
          >
            <ImagePlus size={15} aria-hidden="true" />
            Dosya ekle
          </ActionButton>
        </div>

        {!mediaRoomId && room && (
          <p className="room-media-panel-note">
            Bu oda henüz kaydedilmedi. Medya eklemek için önce Ayarları Kaydet.
          </p>
        )}
        <p className="room-media-panel-note">
          Kapak, fotoğraf, 360°/180° panorama ve video türleri daha sonra önizleme ve düzenleme araçlarıyla genişletilebilir.
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
                  <span className="room-media-card-icon">
                    <MediaKindIcon kind={item.kind} />
                  </span>
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

                <label className="form-field room-media-card-kind">
                  Kullanım
                  <select
                    value={item.kind}
                    disabled={!mediaEnabled || busy}
                    onChange={(event) => void updateMediaKind(
                      item,
                      event.target.value as RoomPublicMediaKind
                    )}
                  >
                    {mediaKindOptionsForAsset(item).map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <div className="room-media-card-footer">
                  <span>{mediaKindLabel(item.kind)}</span>
                  <span className={item.remoteUrl ? "is-ready" : "is-pending"}>
                    {item.remoteUrl ? "Yayınlandı" : "Senkron bekliyor"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
