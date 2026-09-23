import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BUSINESS_CAPABILITIES, type SaveRoomPublicDetailsInput } from "@yardimci-asistan/shared";
import type { DesktopDashboardData } from "../../../electron/database";
import { useBusinessCapabilityRuntime } from "../../app/business-capability-context";
import { runtimeHasCapability } from "../../app/capabilities";
import type { SettingsOperationResult } from "../../app/settings-save";
import { RoomPublicDetailsEditor } from "../operations/RoomPublicDetailsEditor";

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
  dashboardRoomCount: number;
  onDashboardRefresh?: () => Promise<unknown>;

}

export function useRoomManagementSettings({
  dashboardRoomCount,
  onDashboardRefresh,
}: RoomManagementSectionProps) {
  const capabilityRuntime = useBusinessCapabilityRuntime();
  const roomsEnabled = runtimeHasCapability(
    capabilityRuntime.snapshot,
    BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS
  );
  const [rooms, setRooms] = useState<RoomDraftState[]>([]);
  const [loading, setLoading] = useState(true);
  const saveInFlight = useRef(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const reportRoomStatus = (state: "loading" | "success" | "error", text: string) => {
    setSaveState(state === "loading" ? "saving" : state);
    setMessage(text);
  };
  const [editingRoom, setEditingRoom] = useState<DesktopDashboardData["rooms"][number] | null>(null);
  const savedRoomsRef = useRef<RoomDraftState[]>([]);
  const roomDraftRef = useRef<RoomDraftState[]>([]);
  const roomsLoadedRef = useRef(false);
  const roomLoadPromiseRef = useRef<Promise<void> | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const firstRoomNameRef = useRef<HTMLInputElement>(null);

  const applyServerRooms = useCallback((serverRooms: RoomDraftState[], preservePendingDrafts = true) => {
    const pendingDrafts = preservePendingDrafts
      ? new Map(
          roomDraftRef.current
            .filter((draft) => {
              const saved = savedRoomsRef.current.find((room) => room.id === draft.id);
              return saved && JSON.stringify(saved) !== JSON.stringify(draft);
            })
            .map((draft) => [draft.id, draft] as const)
        )
      : new Map<string, RoomDraftState>();
    const nextRooms = serverRooms.map((room) => pendingDrafts.get(room.id) ?? room);
    savedRoomsRef.current = serverRooms;
    roomDraftRef.current = nextRooms;
    setRooms(nextRooms);
    return nextRooms;
  }, []);

  useEffect(() => {
    let active = true;
    if (!roomsEnabled) {
      roomsLoadedRef.current = true;
      roomLoadPromiseRef.current = null;
      savedRoomsRef.current = [];
      roomDraftRef.current = [];
      setRooms([]);
      setLoading(false);
      setSaveState("idle");
      setMessage("");
      setEditingRoom(null);
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
      roomsLoadedRef.current = false;
      try {
        const data = await bridge.getRoomFolioData();
        if (!active) return;
        const serverRooms = data.rooms.map(toDraft);
        applyServerRooms(serverRooms);
        setSaveState("idle");
        setMessage("");
      } catch {
        if (!active) return;
        setSaveState("error");
        setMessage("Oda bilgileri yüklenemedi.");
      } finally {
        if (active) {
          roomsLoadedRef.current = true;
          setLoading(false);
        }
      }
    };
    roomLoadPromiseRef.current = load();
    void roomLoadPromiseRef.current;
    return () => { active = false; };
  }, [applyServerRooms, dashboardRoomCount, roomsEnabled]);

  const invalidMessage = useMemo(() => {
    return getInvalidRoomMessage(rooms);
  }, [rooms]);

  const updateRoom = (id: string, patch: Partial<Pick<RoomDraftState, "name" | "price">>) => {
    setRooms((current) => {
      const nextRooms = current.map((room) => room.id === id ? { ...room, ...patch } : room);
      roomDraftRef.current = nextRooms;
      return nextRooms;
    });
    if (saveState !== "idle") {
      setSaveState("idle");
      setMessage("");
    }
  };

  const validateRooms = useCallback(() => {
    if (loading) return "Oda bilgileri yükleniyor.";
    return invalidMessage || null;
  }, [invalidMessage, loading]);

  const saveRooms = useCallback(async (): Promise<SettingsOperationResult> => {
    const bridge = window.yardimciDesktop;
    if (!roomsEnabled) return { ok: true, changed: false };

    if (roomLoadPromiseRef.current && !roomsLoadedRef.current) {
      await roomLoadPromiseRef.current;
    }
    const currentRooms = roomDraftRef.current;
    const validationMessage = roomsLoadedRef.current
      ? getInvalidRoomMessage(currentRooms) || null
      : validateRooms();
    if (validationMessage) {
      setSaveState("error");
      setMessage(validationMessage);
      return { ok: false, message: validationMessage };
    }
    const hasCurrentRoomChanges = JSON.stringify(savedRoomsRef.current) !== JSON.stringify(currentRooms);
    if (!hasCurrentRoomChanges) return { ok: true, changed: false };
    if (!bridge?.setRoomNightlyPrice || !bridge.getRoomFolioData) {
      const message = "Oda bilgileri bu ortamda kullanılamıyor.";
      setSaveState("error");
      setMessage(message);
      return { ok: false, message };
    }

    if (saveInFlight.current) return { ok: false, message: "Oda bilgileri kaydediliyor." };
    saveInFlight.current = true;
    setSaveState("saving");
    setMessage("Kaydediliyor…");
    try {
      for (const room of currentRooms) {
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
      applyServerRooms(fresh.rooms.map(toDraft), false);
      await onDashboardRefresh?.();
      setSaveState("success");
      setMessage("Oda bilgileri kaydedildi.");
      return { ok: true, changed: true, message: "Oda bilgileri kaydedildi." };
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "Oda bilgileri kaydedilemedi.";
      setSaveState("error");
      setMessage(message);
      return { ok: false, message };
    } finally {
      saveInFlight.current = false;
    }
  }, [applyServerRooms, dashboardRoomCount, onDashboardRefresh, roomsEnabled, validateRooms]);


  const openRoomDetails = async (roomId: string) => {
    const bridge = window.yardimciDesktop;
    if (!bridge?.getDashboardData) {
      reportRoomStatus("error", "Oda detayları bu ortamda kullanılamıyor.");
      return;
    }

    try {
      const dashboard = await bridge.getDashboardData();
      const room = dashboard.rooms.find((item) => item.id === roomId) ?? null;
      if (!room) {
        reportRoomStatus("error", "Oda bulunamadı.");
        return;
      }
      setEditingRoom(room);
    } catch {
      reportRoomStatus("error", "Oda detayları yüklenemedi.");
    }
  };

  const saveRoomPublicDetails = async (input: SaveRoomPublicDetailsInput) => {
    const bridge = window.yardimciDesktop;
    if (!bridge?.setRoomNightlyPrice || !bridge.getRoomFolioData) {
      const result = { ok: false, message: "Oda bilgileri bu ortamda kullanılamıyor." };
      reportRoomStatus("error", result.message);
      return result;
    }

    reportRoomStatus("loading", "Oda bilgileri kaydediliyor...");
    try {
      const fresh = await bridge.getRoomFolioData();
      const profile = fresh.rooms.find((room) => room.id === input.roomId);
      if (!profile) {
        const result = { ok: false, message: "Oda bulunamadı." };
        reportRoomStatus("error", result.message);
        return result;
      }

      const result = await bridge.setRoomNightlyPrice({
        roomId: input.roomId,
        amountMinor: profile.nightlyPriceMinor,
        currency: profile.currency,
        name: input.name,
        publicDetails: input
      } as Parameters<typeof bridge.setRoomNightlyPrice>[0] & {
        name: string;
        publicDetails: SaveRoomPublicDetailsInput;
      });

      if (!result.ok) {
        reportRoomStatus("error", result.message);
        return { ok: false, message: result.message };
      }

      const nextRooms = rooms.map((room) => room.id === input.roomId
        ? { ...room, name: input.name, number: input.number }
        : room);
      savedRoomsRef.current = savedRoomsRef.current.map((room) => room.id === input.roomId
        ? { ...room, name: input.name, number: input.number }
        : room);
      roomDraftRef.current = nextRooms;
      setRooms(nextRooms);
      reportRoomStatus("success", result.message);
      return { ok: true, message: result.message };
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : "Oda bilgileri kaydedilemedi.";
      reportRoomStatus("error", message);
      return { ok: false, message };
    }
  };

  const dirty = JSON.stringify(rooms) !== JSON.stringify(savedRoomsRef.current);
  function discard() {
    if (saveInFlight.current) return;
    applyServerRooms(savedRoomsRef.current, false);
    setSaveState("idle");
    setMessage("Oda değişiklikleri geri alındı.");
  }
  return { roomsEnabled, rooms, loading, saveState, message, editingRoom, setEditingRoom, sectionRef, firstRoomNameRef, updateRoom, saveRooms, openRoomDetails, saveRoomPublicDetails, dirty, discard };
}

export function RoomManagementSection({ controller }: { controller: ReturnType<typeof useRoomManagementSettings> }) {
  const { roomsEnabled, rooms, loading, saveState, message, editingRoom, setEditingRoom, sectionRef, firstRoomNameRef, updateRoom, saveRooms, openRoomDetails, saveRoomPublicDetails, dirty, discard } = controller;
  if (!roomsEnabled) {
    return null;
  }

  return (
    <section ref={sectionRef} id="settings-rooms" tabIndex={-1} className="setup-section room-management-settings">
      <div className="setup-section-title room-management-heading">
        <div>
          <p>Pansiyon</p>
          <h2>Oda Yönetimi</h2>
        </div>
        <div className="room-management-toolbar">
          <button className="action-button" type="button" disabled={!dirty || loading || saveState === "saving"} onClick={() => void saveRooms()}>Oda Bilgilerini Kaydet</button>
          <button className="action-button action-button-secondary" type="button" disabled={!dirty || saveState === "saving"} onClick={discard}>Oda Değişikliklerini Geri Al</button>
          {dirty && <span>Kaydedilmemiş değişiklikler</span>}
          <span className={`room-management-save-state${saveState === "success" ? " is-success" : saveState === "error" ? " is-error" : ""}`} role={saveState === "error" ? "alert" : "status"}>
            {message}
          </span>
        </div>
      </div>
      <fieldset disabled={saveState === "saving"} className="settings-resource-fields">
      <div className="room-management-list" aria-label="Oda adı ve fiyatları">
        {loading ? (
          <div className="room-management-loading">Odalar hazırlanıyor…</div>
        ) : rooms.length === 0 ? (
          <div className="room-management-loading">Henüz oda kaydı yok. Oda sayısını belirleyip ayarları kaydedin.</div>
        ) : (
          <>
            <div className="room-management-list-head"><span>Oda</span><span>Oda adı</span><span>Gecelik fiyat</span></div>
            {rooms.map((room, index) => (
              <div className="room-management-row" key={room.id}>
                <div className="room-management-identity">
                  <strong>{room.number ? `Oda ${room.number}` : "Oda"}</strong>
                  <button
                    className="room-management-details-button"
                    type="button"
                    onClick={() => void openRoomDetails(room.id)}
                  >
                    Detaylar
                  </button>
                </div>
                <input
                  ref={index === 0 ? firstRoomNameRef : undefined}
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

      </fieldset>
      <RoomPublicDetailsEditor
        open={Boolean(editingRoom)}
        room={editingRoom}
        onClose={() => setEditingRoom(null)}
        onSave={saveRoomPublicDetails}
      />
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

function getInvalidRoomMessage(roomList: RoomDraftState[]) {
  const invalid = roomList.find((room) => !room.id || !room.name.trim() || parseMoneyToMinor(room.price) < 0);
  if (!invalid) return "";
  return !invalid.name.trim() ? "Oda adı boş bırakılamaz." : "Fiyatları kontrol edin.";
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
