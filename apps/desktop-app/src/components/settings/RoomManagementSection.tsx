import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  formatMinorCurrency,
  parseMoneyToMinor
} from "@yardimci-asistan/shared";
import type { useBusinessLayoutSettings } from "../../app/use-business-layout-settings";
import { useWebAvailability } from "../../app/web-availability";
import { ActionButton } from "../ui/ActionButton";
import { RoomMediaPanel } from "./RoomMediaPanel";
import { ResourceManagementWorkspace } from "./ResourceManagementWorkspace";

type BusinessLayoutController = ReturnType<typeof useBusinessLayoutSettings>;

function roomBedSummary(bedInfo: string) {
  const text = bedInfo.trim();
  if (!text) return "—";

  const counts = [...text.matchAll(/\b(\d+)\s*(?=(?:çift|tek|queen|king|ranza|yatak))/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (total > 0) return `${total} yatak`;

  const bedWordCount = (text.match(/\byatak\b/gi) ?? []).length;
  return bedWordCount > 0 ? `${bedWordCount} yatak` : "—";
}

function roomPriceSummary(price: string, currency: string) {
  const minor = parseMoneyToMinor(price);
  return minor === null ? "—" : formatMinorCurrency(minor, currency || "TRY");
}

export function RoomManagementSection({ controller, onEditRoom }: { controller: BusinessLayoutController; onEditRoom: (key: string) => void }) {
  const webAvailable = useWebAvailability();
  const [mediaRoomKey, setMediaRoomKey] = useState("");
  const { draft, loading, saving, mediaRevision, updateRoom, addRoom, removeRoom, updatePublication, reportMediaDirty } = controller;
  const rooms = draft.rooms;

  const mediaRoom = useMemo(
    () => rooms.find((room) => room.key === mediaRoomKey) ?? rooms[0] ?? null,
    [mediaRoomKey, rooms]
  );

  useEffect(() => {
    if (rooms.length === 0) {
      setMediaRoomKey("");
      return;
    }
    if (!rooms.some((room) => room.key === mediaRoomKey)) {
      const first = rooms[0];
      if (first) setMediaRoomKey(first.key);
    }
  }, [mediaRoomKey, rooms]);

  return (
      <ResourceManagementWorkspace
        id="settings-rooms"
        className="room-resource-workspace"
        title="Oda Yönetimi"
        subtitle="Pansiyon"
        publishChecked={draft.publication.rooms}
        publishAriaLabel="Oda web yayını"
        disabled={loading || saving}
        onPublishChange={(rooms) => updatePublication({ rooms })}
        actions={<ActionButton variant="secondary" size="sm" type="button" disabled={loading || saving} onClick={addRoom}><Plus size={15} aria-hidden="true" />Oda Ekle</ActionButton>}
        media={
          <RoomMediaPanel
            room={mediaRoom ? {
              id: mediaRoom.id,
              key: mediaRoom.key,
              name: mediaRoom.name,
              number: mediaRoom.number
            } : null}
            embedded
            disabled={loading || saving}
            revision={mediaRevision}
            onDirtyChange={reportMediaDirty}
          />
        }
      >
        <fieldset disabled={saving || loading} className="settings-resource-fields">


          <div className="room-management-list" aria-label="Oda özetleri">
            {loading ? (
              <div className="room-management-loading">Odalar hazırlanıyor…</div>
            ) : rooms.length === 0 ? (
              <div className="room-management-loading">Henüz oda yok. Oda Ekle ile ilk odayı oluşturabilirsiniz.</div>
            ) : (
              <>
                <div className="room-management-list-head">
                  <span>Oda / Durum</span>
                  <span>Yatak</span>
                  <span>Fiyat</span>
                  <span>Kat</span>
                  <span aria-hidden="true" />
                </div>
                {rooms.map((room) => {
                  const identity = room.number ? `Oda ${room.number}` : room.name || "Yeni Oda";
                  const selected = webAvailable && mediaRoom?.key === room.key;
                  return (
                    <div
                      className={`room-management-row${webAvailable ? " interactive-surface interactive-surface--record" : ""}${selected ? " is-media-selected is-selected" : ""}`}
                      key={room.key}
                      role={webAvailable ? "button" : undefined}
                      tabIndex={webAvailable ? (saving || loading ? -1 : 0) : undefined}
                      aria-label={webAvailable ? `${identity} medyalarını seç` : undefined}
                      aria-pressed={webAvailable ? selected : undefined}
                      aria-disabled={webAvailable ? saving || loading : undefined}
                      onClick={() => { if (webAvailable && !saving && !loading) setMediaRoomKey(room.key); }}
                      onKeyDown={(event) => {
                        if (!webAvailable || event.target !== event.currentTarget || saving || loading || event.repeat) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setMediaRoomKey(room.key);
                        }
                      }}
                    >
                      <div className="room-management-identity">
                        <strong>{identity}</strong>
                        {room.name !== identity && <span>{room.name}</span>}
                        <label
                          className="room-management-service-toggle"
                          title="Odanın kullanım durumunu değiştirir. Kaydet ile uygulanır."
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={!room.outOfService}
                            aria-label={`${identity} hizmette`}
                            onChange={(event) => updateRoom(room.key, { outOfService: !event.target.checked })}
                          />
                          <span>{room.outOfService ? "Hizmet dışı" : "Hizmette"}</span>
                        </label>
                      </div>
                      <span className="room-management-summary">{roomBedSummary(room.bedInfo)}</span>
                      <span className="room-management-summary">{roomPriceSummary(room.price, room.currency)}</span>
                      <span className="room-management-summary">{room.floor || "—"}</span>
                      <div className="room-management-row-actions" onClick={(event) => event.stopPropagation()}>
                        <ActionButton
                          variant="link"
                          size="sm"
                          type="button"
                          className="room-management-details-button"
                          onClick={() => {
                            setMediaRoomKey(room.key);
                            onEditRoom(room.key);
                          }}
                        >
                          <Pencil size={14} aria-hidden="true" />
                          Detaylar
                        </ActionButton>
                        <ActionButton
                          variant="ghost"
                          size="sm"
                          type="button"
                          className="room-management-remove"
                          disabled={!room.canRemove}
                          onClick={() => removeRoom(room.key)}
                          aria-label={`${identity} satırını kaldır`}
                          title={room.canRemove ? "Odayı kaldır" : room.removeBlockReason}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </ActionButton>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </fieldset>
      </ResourceManagementWorkspace>
  );
}
