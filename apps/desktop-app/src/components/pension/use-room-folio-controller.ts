import { useCallback, useEffect, useRef, useState } from "react";
import type { DesktopRoomFolioData, DesktopRoomFolioMutationResult } from "../../../electron/room-folio";
import { useRequestGeneration } from "../workspace/use-request-generation";

const empty: DesktopRoomFolioData = { generatedAt: "", rooms: [], activeStays: [], folios: [], menuCategories: [], menuItems: [] };

export function useRoomFolioController(roomId: string, enabled: boolean, refreshKey: string) {
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const mutating = useRef(false);
  const begin = useRequestGeneration();
  const refresh = useCallback(async () => {
    if (!enabled || mutating.current) return;
    const current = begin();
    setLoading(true); setMessage(""); setError(false);
    try {
      const next = await window.yardimciDesktop!.getRoomFolioData();
      if (current()) { setData(next); setError(false); return next; }
    } catch {
      if (current()) { setMessage("Oda hesapları hazırlanamadı. Yeniden deneyin."); setError(true); }
    } finally { if (current()) setLoading(false); }
  }, [begin, enabled]);
  useEffect(() => { void refresh(); }, [refresh, refreshKey]);

  async function mutate(operation: () => Promise<DesktopRoomFolioMutationResult>) {
    if (!enabled || mutating.current) return null;
    mutating.current = true;
    const current = begin();
    setBusy(true); setLoading(false); setMessage(""); setError(false);
    try {
      const result = await operation();
      if (!current()) return null;
      setMessage(result.message); setError(!result.ok);
      if (result.ok) { setData(result.data); if (result.folioId) setSelectedId(result.folioId); }
      return result;
    } catch {
      if (current()) { setMessage("İşlem tamamlanamadı. Hesabı yenileyip kontrol edin."); setError(true); }
      return null;
    } finally { mutating.current = false; if (current()) setBusy(false); }
  }
  const folios = enabled ? data.folios.filter(folio => folio.roomId === roomId) : [];
  const selected = folios.find(folio => folio.id === selectedId) ?? folios.find(folio => folio.status === "open") ?? folios[0];
  function applySnapshot(snapshot: DesktopRoomFolioData) {
    setData(snapshot);
    setError(false);
  }
  return { data, folios, selected, select: setSelectedId, loading, busy, message, error, refresh, mutate, applySnapshot };
}
export type RoomFolioController = ReturnType<typeof useRoomFolioController>;
