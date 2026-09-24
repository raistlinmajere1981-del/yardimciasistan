import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { SaveRoomPublicDetailsInput } from "@yardimci-asistan/shared";
import type { useBusinessLayoutSettings } from "../../app/use-business-layout-settings";
import { RoomPublicDetailsEditor } from "../operations/RoomPublicDetailsEditor";
import { ActionButton } from "../ui/ActionButton";

type BusinessLayoutController = ReturnType<typeof useBusinessLayoutSettings>;

export function RoomManagementSection({ controller }: { controller: BusinessLayoutController }) {
  const [editingKey, setEditingKey] = useState("");
  const { draft, loading, saving, updateRoom, addRoom, removeRoom } = controller;
  const rooms = draft.rooms;
  const roomsEnabled = draft.capabilities.rooms;
  const editingRoom = useMemo(
    () => rooms.find((room) => room.key === editingKey) ?? null,
    [editingKey, rooms]
  );

  if (!roomsEnabled) return null;

  return (
    <section id="settings-rooms" tabIndex={-1} className="setup-section room-management-settings">
      <div className="setup-section-title room-management-heading">
        <div>
          <p>Pansiyon</p>
          <h2>Oda Yönetimi</h2>
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

      <fieldset disabled={saving || loading} className="settings-resource-fields">
        <div className="room-management-list" aria-label="Oda adı ve fiyatları">
          {loading ? (
            <div className="room-management-loading">Odalar hazırlanıyor…</div>
          ) : rooms.length === 0 ? (
            <div className="room-management-loading">Henüz oda yok. Oda Ekle ile ilk odayı oluşturabilirsiniz.</div>
          ) : (
            <>
              <div className="room-management-list-head">
                <span>Oda</span>
                <span>Oda adı</span>
                <span>Gecelik fiyat</span>
                <span aria-hidden="true" />
              </div>
              {rooms.map((room) => {
                const identity = room.number ? `Oda ${room.number}` : room.name || "Yeni Oda";
                return (
                  <div className="room-management-row" key={room.key}>
                    <div className="room-management-identity">
                      <strong>{identity}</strong>
                      <button
                        className="room-management-details-button"
                        type="button"
                        onClick={() => setEditingKey(room.key)}
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
                      onChange={(event) => updateRoom(room.key, { name: event.target.value })}
                    />
                    <div className="room-management-price-wrap">
                      <input
                        className="room-management-price"
                        inputMode="decimal"
                        value={room.price}
                        placeholder="0,00"
                        aria-label={`${identity} gecelik fiyatı`}
                        onChange={(event) => updateRoom(room.key, { price: event.target.value })}
                      />
                      <span>₺ / gece</span>
                    </div>
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
                );
              })}
            </>
          )}
        </div>
      </fieldset>

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
