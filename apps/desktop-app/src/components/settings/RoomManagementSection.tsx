import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { SaveRoomPublicDetailsInput } from "@yardimci-asistan/shared";
import type { useBusinessLayoutSettings } from "../../app/use-business-layout-settings";
import { RoomPublicDetailsEditor } from "../operations/RoomPublicDetailsEditor";
import { ActionButton } from "../ui/ActionButton";
import { MoneyInput } from "../ui/MoneyInput";
import { RoomMediaPanel } from "./RoomMediaPanel";

type BusinessLayoutController = ReturnType<typeof useBusinessLayoutSettings>;

export function RoomManagementSection({ controller }: { controller: BusinessLayoutController }) {
  const [editingKey, setEditingKey] = useState("");
  const [mediaRoomKey, setMediaRoomKey] = useState("");
  const { draft, loading, saving, mediaRevision, updateRoom, addRoom, removeRoom, updatePublication, reportMediaDirty } = controller;
  const rooms = draft.rooms;
  const roomsEnabled = draft.capabilities.rooms;

  const editingRoom = useMemo(
    () => rooms.find((room) => room.key === editingKey) ?? null,
    [editingKey, rooms]
  );
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
      setMediaRoomKey(rooms[0].key);
    }
  }, [mediaRoomKey, rooms]);

  if (!roomsEnabled) return null;

  return (
    <section id="settings-rooms" tabIndex={-1} className="room-management-workspace">
      <div className="settings-panel room-management-settings">
        <div className="settings-panel-header room-management-heading">
          <div>
            <h2>Oda Yönetimi</h2>
            <p>Pansiyon</p>
          </div>
          <ActionButton
            variant="secondary"
            size="sm"
            type="button"
            disabled={loading || saving}
            onClick={addRoom}
          >
            <Plus size={15} aria-hidden="true" />
            Oda Ekle
          </ActionButton>
        </div>

        <fieldset disabled={saving || loading} className="settings-resource-fields settings-panel-body room-management-panel-body">
          <div className="settings-publication-control">
            <label className="form-check setup-checkline">
              <input
                type="checkbox"
                checked={draft.publication.rooms}
                onChange={(event) => updatePublication({ rooms: event.target.checked })}
              />
              <span>
                <strong>Odaları web sitesinde yayınla</strong>
                <small>Kapalıysa oda kataloğu ve oda detayları web sitesinden kaldırılır.</small>
              </span>
            </label>
          </div>
          <div className="room-management-list" aria-label="Oda adı ve fiyatları">
            {loading ? (
              <div className="room-management-loading">Odalar hazırlanıyor…</div>
            ) : rooms.length === 0 ? (
              <div className="room-management-loading">Henüz oda yok. Oda Ekle ile ilk odayı oluşturabilirsiniz.</div>
            ) : (
              <>
                <div className="room-management-list-head">
                  <span aria-hidden="true" />
                  <span>Oda</span>
                  <span>Oda adı</span>
                  <span>Gecelik fiyat</span>
                  <span aria-hidden="true" />
                </div>
                {rooms.map((room) => {
                  const identity = room.number ? `Oda ${room.number}` : room.name || "Yeni Oda";
                  const selected = mediaRoom?.key === room.key;
                  return (
                    <div
                      className={`room-management-row${selected ? " is-media-selected" : ""}`}
                      key={room.key}
                      onClick={() => setMediaRoomKey(room.key)}
                    >
                      <input
                        className="room-management-out-of-service"
                        type="checkbox"
                        checked={room.outOfService}
                        aria-label={`${identity} hizmet dışı`}
                        title="Hizmet dışı"
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => updateRoom(room.key, { outOfService: event.target.checked })}
                      />
                      <div className="room-management-identity">
                        <strong>{identity}</strong>
                        <button
                          className="room-management-details-button"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setMediaRoomKey(room.key);
                            setEditingKey(room.key);
                          }}
                        >
                          Detaylar
                        </button>
                      </div>
                      <input
                        className="room-management-name"
                        value={room.name}
                        maxLength={120}
                        placeholder="Örn. Bahçe Katı Standart Oda"
                        aria-label={`${identity} adı`}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => updateRoom(room.key, { name: event.target.value })}
                      />
                      <div className="room-management-price-wrap" onClick={(event) => event.stopPropagation()}>
                        <MoneyInput
                          className="room-management-price"
                          value={room.price}
                          placeholder="Örn. 1.250,00"
                          aria-label={`${identity} gecelik fiyatı`}
                          onChange={(price) => updateRoom(room.key, { price })}
                        />
                        <span>₺ / gece</span>
                      </div>
                      <ActionButton
                        variant="ghost"
                        size="sm"
                        type="button"
                        className="room-management-remove"
                        disabled={!room.canRemove}
                        onClick={(event) => {
                          event.stopPropagation();
                          removeRoom(room.key);
                        }}
                        aria-label={`${identity} satırını kaldır`}
                        title={room.canRemove ? "Odayı kaldır" : room.removeBlockReason}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </ActionButton>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </fieldset>
      </div>

      <RoomMediaPanel
        room={mediaRoom ? {
          id: mediaRoom.id,
          key: mediaRoom.key,
          name: mediaRoom.name,
          number: mediaRoom.number
        } : null}
        rooms={rooms.map((room) => ({
          id: room.id,
          key: room.key,
          name: room.name,
          number: room.number
        }))}
        disabled={loading || saving}
        revision={mediaRevision}
        onRoomChange={setMediaRoomKey}
        onDirtyChange={reportMediaDirty}
      />

      <RoomPublicDetailsEditor
        open={Boolean(editingRoom)}
        room={editingRoom ? {
          id: editingRoom.key,
          name: editingRoom.name,
          number: editingRoom.number,
          capacity: editingRoom.capacity,
          bedInfo: editingRoom.bedInfo,
          floor: editingRoom.floor,
          features: editingRoom.features,
          description: editingRoom.description,
          priceNote: editingRoom.priceNote
        } : null}
        onClose={() => setEditingKey("")}
        onSave={async (input: SaveRoomPublicDetailsInput) => {
          const room = rooms.find((candidate) => candidate.key === input.roomId);
          if (!room) return { ok: false, message: "Oda bulunamadı." };
          updateRoom(room.key, {
            name: input.name,
            number: input.number,
            capacity: input.capacity,
            bedInfo: input.bedInfo,
            floor: input.floor,
            features: input.features,
            description: input.description,
            priceNote: input.priceNote
          });
          return { ok: true, message: "Oda detayları taslağa uygulandı." };
        }}
      />
    </section>
  );
}
