import { useCallback, useEffect, useRef, useState } from "react";
import type { DesktopRoomFolioData, DesktopRoomFolioMutationResult } from "../../../electron/room-folio";
import { useRequestGeneration } from "../workspace/use-request-generation";

const empty: DesktopRoomFolioData = { generatedAt: "", rooms: [], activeStays: [], folios: [], menuCategories: [], menuItems: [] };

export function useRoomFolioController(roomId: string, enabled: boolean, refreshKey: string, target: { folioId?: string; stayId?: string } = {}) {
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState(target.folioId ?? "");
  const mutating = useRef(false);
  const refreshQueued = useRef(false);
  const begin = useRequestGeneration();
  const refresh = useCallback(async () => {
    if (!enabled || mutating.current) return;
    const current = begin();
    setLoading(true); setMessage(""); setError(false);
    try {
      const next = await window.yardimciDesktop!.getRoomFolioData(roomId);
      if (current()) { setData(next); setError(false); return next; }
    } catch {
      if (current()) { setMessage("Oda hesapları hazırlanamadı. Yeniden deneyin."); setError(true); }
    } finally { if (current()) setLoading(false); }
  }, [begin, enabled, roomId]);
  useEffect(() => {
    if (mutating.current) { refreshQueued.current = true; return; }
    void refresh();
  }, [refresh, refreshKey]);

  async function mutate(operation: () => Promise<DesktopRoomFolioMutationResult>) {
    if (!enabled || mutating.current) return null;
    mutating.current = true;
    const current = begin();
    setBusy(true); setLoading(false); setMessage(""); setError(false);
    try {
      const result = await operation();
      if (!current()) return null;
      setMessage(result.message); setError(!result.ok);
      if (result.ok) {
        if (result.folioId) setSelectedId(result.folioId);
        // Mutation payloads also serve other consumers and may contain bounded history.
        // Refresh this room, preserving the exact account even in a large property.
        refreshQueued.current = false;
        try {
          const snapshot = await window.yardimciDesktop!.getRoomFolioData(roomId);
          if (current() && !refreshQueued.current) setData(snapshot);
        } catch {
          if (current()) { setData(empty); setMessage("İşlem kaydedildi; hesap yenilenemedi. Yenile ile kontrol edin."); setError(true); }
        }
      }
      return result;
    } catch {
      if (current()) { setMessage("İşlem tamamlanamadı. Hesabı yenileyip kontrol edin."); setError(true); }
      return null;
    } finally {
      mutating.current = false;
      if (current()) {
        setBusy(false);
        // A dashboard push during the scoped read must not leave an older account on screen.
        if (refreshQueued.current) { refreshQueued.current = false; void refresh(); }
      }
    }
  }
  const folios = enabled ? data.folios.filter(folio => folio.roomId === roomId) : [];
  const selected = selectedId ? folios.find(folio => folio.id === selectedId)
    : target.stayId ? folios.find(folio => folio.stayId === target.stayId) : undefined;
  function applySnapshot(snapshot: DesktopRoomFolioData) {
    begin();
    setLoading(false);
    setData(snapshot);
    setError(false);
  }
  return { data, folios, selected, select: setSelectedId, loading, busy, message, error, refresh, mutate, applySnapshot };
}
export type RoomFolioController = ReturnType<typeof useRoomFolioController>;
