import { useEffect, useMemo, useState } from "react";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import { useBusinessCapabilityRuntime } from "../../app/business-capability-context";
import { runtimeHasCapability } from "../../app/capabilities";

interface RoomDraftData {
  id: string;
  name: string;
  number: string;
  nightlyPriceMinor: number;
}

interface RoomDraftState {
  id: string;
  name: string;
  number: string;
  price: string;
}

interface RoomManagementSectionProps {
  roomCount: string;
  dashboardRoomCount: number;
  onRoomCountChange: (value: string) => void;
}

export function RoomManagementSection({ roomCount, dashboardRoomCount, onRoomCountChange }: RoomManagementSectionProps) {
  const capabilityRuntime = useBusinessCapabilityRuntime();
  const roomsEnabled = runtimeHasCapability(
    capabilityRuntime.snapshot,
    BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS
  );
  const [rooms, setRooms] = useState<RoomDraftState[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    if (!roomsEnabled) {
      setRooms([]);
      setLoading(false);
      setSaveState("idle");
      setMessage("");
      return () => { active = false; };
    }

    const load = async () => {
      const bridge = window.yardimciDesktop;
      if (!bridge?.getRoomFolioData) {
        if (active) {
          setLoading(false);
          setSaveState("error");
          setMessage("Oda bilgileri bu ortamda kullanılamıyor.");
        }
        return;
      }
      setLoading(true);
      try {
        const data = await bridge.getRoomFolioData();
        if (!active) return;
        setRooms(data.rooms.map(toDraft));
        setSaveState("idle");
        setMessage("");
      } catch {
        if (!active) return;
        setSaveState("error");
        setMessage("Oda bilgileri yüklenemedi.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [dashboardRoomCount, roomsEnabled]);

  const invalidMessage = useMemo(() => {
    const invalid = rooms.find((room) => !room.id || !room.name.trim() || parseMoneyToMinor(room.price) < 0);
    if (!invalid) return "";
    return !invalid.name.trim() ? "Oda adı boş bırakılamaz." : "Fiyatları kontrol edin.";
  }, [rooms]);

  const updateRoom = (id: string, patch: Partial<Pick<RoomDraftState, "name" | "price">>) => {
    setRooms((current) => current.map((room) => room.id === id ? { ...room, ...patch } : room));
    if (saveState !== "idle") {
      setSaveState("idle");
      setMessage("");
    }
  };

  const saveRooms = async () => {
    const bridge = window.yardimciDesktop;
    if (!roomsEnabled || !bridge?.setRoomNightlyPrice || !bridge.getRoomFolioData) return;
    if (invalidMessage) {
      setSaveState("error");
      setMessage(invalidMessage);
      return;
    }

    setSaveState("saving");
    setMessage("Kaydediliyor…");
    try {
      for (const room of rooms) {
        const input = {
          roomId: room.id,
          amountMinor: parseMoneyToMinor(room.price),
          currency: "TRY",
          name: room.name.trim()
        } as Parameters<typeof bridge.setRoomNightlyPrice>[0] & { name: string };
        const result = await bridge.setRoomNightlyPrice(input);
        if (!result.ok) throw new Error(result.message);
      }
      const fresh = await bridge.getRoomFolioData();
      setRooms(fresh.rooms.map(toDraft));
      setSaveState("success");
      setMessage("Oda bilgileri kaydedildi.");
    } catch (error) {
      setSaveState("error");
      setMessage(error instanceof Error && error.message ? error.message : "Oda bilgileri kaydedilemedi.");
    }
  };

  if (!roomsEnabled) {
    return null;
  }

  return (
    <section className="setup-section room-management-settings">
      <div className="setup-section-title room-management-heading">
        <div>
          <p>Pansiyon</p>
          <h2>Oda Yönetimi</h2>
        </div>
        <div className="room-management-toolbar">
          <label className="room-management-count-control">
            <span>Oda sayısı</span>
            <input
              className="room-management-count-input"
              inputMode="numeric"
              min="0"
              step="1"
              type="number"
              value={roomCount}
              onChange={(event) => onRoomCountChange(event.target.value)}
            />
          </label>
          <span className={`room-management-save-state${saveState === "success" ? " is-success" : saveState === "error" ? " is-error" : ""}`} role="status">
            {message}
          </span>
        </div>
      </div>
      <p className="setup-section-description">Oda adlarını ve yeni konaklamalarda kullanılacak gecelik fiyatları tek yerden yönetin.</p>

      <div className="room-management-list" aria-label="Oda adı ve fiyatları">
        {loading ? (
          <div className="room-management-loading">Odalar hazırlanıyor…</div>
        ) : rooms.length === 0 ? (
          <div className="room-management-loading">Henüz oda kaydı yok. Oda sayısını belirleyip ayarları kaydedin.</div>
        ) : (
          <>
            <div className="room-management-list-head"><span>Oda</span><span>Oda adı</span><span>Gecelik fiyat</span></div>
            {rooms.map((room) => (
              <div className="room-management-row" key={room.id}>
                <div className="room-management-identity"><strong>{room.number ? `Oda ${room.number}` : "Oda"}</strong></div>
                <input
                  className="room-management-name"
                  value={room.name}
                  maxLength={120}
                  placeholder="Örn. Bahçe Katı Standart Oda"
                  aria-label={`${room.number ? `Oda ${room.number}` : "Oda"} adı`}
                  onChange={(event) => updateRoom(room.id, { name: event.target.value })}
                />
                <div className="room-management-price-wrap">
                  <input
                    className="room-management-price"
                    inputMode="decimal"
                    value={room.price}
                    placeholder="0,00"
                    aria-label={`${room.number ? `Oda ${room.number}` : "Oda"} gecelik fiyatı`}
                    onChange={(event) => updateRoom(room.id, { price: event.target.value })}
                  />
                  <span>₺ / gece</span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="room-management-footer">
        <span>Oda sayısı değişikliği üstteki “Ayarları Kaydet” düğmesiyle uygulanır. Fiyat değişikliği açık oda adisyonlarını etkilemez.</span>
        <button className="setup-primary room-management-save" type="button" onClick={() => void saveRooms()} disabled={loading || saveState === "saving"}>
          {saveState === "saving" ? "Kaydediliyor" : "Oda Bilgilerini Kaydet"}
        </button>
      </div>
    </section>
  );
}

function toDraft(room: RoomDraftData): RoomDraftState {
  return {
    id: room.id,
    name: room.name,
    number: room.number,
    price: minorToInput(room.nightlyPriceMinor)
  };
}

function minorToInput(value: number) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.max(0, value) / 100);
}

function parseMoneyToMinor(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!normalized) return 0;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : -1;
}
