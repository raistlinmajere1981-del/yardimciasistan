import type { PublicResourceMediaKind, RoomMediaAsset } from "@yardimci-asistan/shared";
import {
  PublicResourceMediaPanel,
  type PublicResourceMediaPanelResource
} from "./PublicResourceMediaPanel";

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
  revision: number;
  onRoomChange: (key: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}

function roomLabel(room: RoomMediaPanelRoom) {
  if (room.number) return `Oda ${room.number} · ${room.name}`;
  return room.name || "Yeni Oda";
}

function toResource(room: RoomMediaPanelRoom): PublicResourceMediaPanelResource {
  return { id: room.id, key: room.key, label: roomLabel(room) };
}

export function RoomMediaPanel({
  room,
  rooms,
  disabled = false,
  revision,
  onRoomChange,
  onDirtyChange
}: RoomMediaPanelProps) {
  return (
    <PublicResourceMediaPanel
      title="Oda Medyaları"
      subtitle="Web sitesi için görsel ve videolar"
      resourceLabel="Oda"
      ariaLabel="Oda medyaları"
      emptyHint="Seçili odaya ilk fotoğrafı veya panoramayı ekleyin."
      resource={room ? toResource(room) : null}
      resources={rooms.map(toResource)}
      disabled={disabled}
      revision={revision}
      onResourceChange={onRoomChange}
      onDirtyChange={onDirtyChange}
      listMedia={async (roomId) => window.yardimciDesktop?.listRoomMedia(roomId) ?? []}
      addMedia={async (roomId) => {
        const bridge = window.yardimciDesktop;
        if (!bridge) return unavailable([]);
        return bridge.addRoomMedia({ roomId });
      }}
      updateMedia={async (roomId, item, kind: PublicResourceMediaKind) => {
        const bridge = window.yardimciDesktop;
        if (!bridge) return unavailable([]);
        return bridge.updateRoomMedia({
          roomId,
          mediaId: item.id,
          kind,
          title: item.title
        });
      }}
      deleteMedia={async (roomId, item) => {
        const bridge = window.yardimciDesktop;
        if (!bridge) return unavailable([]);
        return bridge.deleteRoomMedia({ roomId, mediaId: item.id });
      }}
    />
  );
}

function unavailable(media: RoomMediaAsset[]) {
  return { ok: false, message: "Oda medyası bu ortamda kullanılamıyor.", media, dirty: false };
}
