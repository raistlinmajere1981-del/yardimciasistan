import { useCallback, useEffect, useRef, useState } from "react";
import type { DesktopRoomFolioData, DesktopRoomFolioMutationResult } from "../../../electron/room-folio";
import { useRequestGeneration } from "../workspace/use-request-generation";
import { reportAppStatus } from "../../app/runtime-state";

const empty: DesktopRoomFolioData = { generatedAt: "", rooms: [], activeStays: [], folios: [], menuCategories: [], menuItems: [] };

export function useRoomFolioController(roomId: string, enabled: boolean, refreshKey: string, target: { folioId?: string; stayId?: string } = {}) {
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const mutating = useRef(false);
  const refreshQueued = useRef(false);
  const begin = useRequestGeneration();
  const refresh = useCallback(async () => {
    if (!enabled || mutating.current) return;
    const current = begin();
    setLoading(true); setError(false);
    try {
      const next = await window.yardimciDesktop!.getRoomFolioData(roomId);
      if (current()) { setData(next); setError(false); return next; }
    } catch {
      if (current()) {
        setError(true);
        reportAppStatus("error", "Oda hesapları hazırlanamadı. Yeniden deneyin.");
      }
    } finally { if (current()) setLoading(false); }
  }, [begin, enabled, roomId]);
  useEffect(() => {
    if (mutating.current) { refreshQueued.current = true; return; }
    void refresh();
  }, [refresh, refreshKey]);

  async function mutate(operation: () => Promise<DesktopRoomFolioMutationResult>, scope: "account" | "adjustments" | "details" = "account") {
    if (!enabled || mutating.current) return null;
    mutating.current = true;
    const current = begin();
    setBusy(true); setLoading(false); setError(false);
    try {
      const result = await operation();
      if (!current()) return null;
      setError(!result.ok);
      reportAppStatus(result.ok ? "success" : "error", result.message);
      if (result.ok) {
        // Mutation payloads also serve other consumers and may contain bounded history.
        // Refresh this room, preserving the exact account even in a large property.
        refreshQueued.current = false;
        try {
          const snapshot = await window.yardimciDesktop!.getRoomFolioData(roomId);
          if (current() && !refreshQueued.current) setData(snapshot);
        } catch {
          if (current()) {
            setData(empty);
            setError(true);
            reportAppStatus("error", "İşlem kaydedildi; hesap yenilenemedi. Yenile ile kontrol edin.");
          }
        }
      }
      return result;
    } catch {
      if (current()) {
        setError(true);
        reportAppStatus("error", "İşlem tamamlanamadı. Hesabı yenileyip kontrol edin.");
      }
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
  const selected = target.folioId ? folios.find(folio => folio.id === target.folioId && (!target.stayId || folio.stayId === target.stayId))
    : target.stayId ? folios.find(folio => folio.stayId === target.stayId) : undefined;
  return { data, folios, selected, loading, busy, error, refresh, mutate };
}
export type RoomFolioController = ReturnType<typeof useRoomFolioController>;
