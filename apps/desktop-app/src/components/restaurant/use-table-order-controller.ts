import { useEffect, useRef, useState } from "react";
import type { DesktopDashboardData, DesktopTableOrder, DesktopTableOrderResult } from "../../../electron/database";
import { useRequestGeneration } from "../workspace/use-request-generation";

/** Entity lifetime only. The page owns the order projection; SQLite owns persisted orders. */
export function useTableOrderController(tableId: string, enabled: boolean,
  onOrder: (order: DesktopTableOrder) => void, onDashboard: (data: DesktopDashboardData) => void) {
  const [order, setOrder] = useState<DesktopTableOrder | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [loaded, setLoaded] = useState(!enabled);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [dirty, setDirty] = useState(false);
  const alive = useRef(true);
  const running = useRef(false);
  const orderRef = useRef<DesktopTableOrder | null>(null);
  const drafts = useRef<Record<string, string>>({});
  const dirtyIds = useRef(new Set<string>());
  const notePromise = useRef<Promise<boolean> | null>(null);
  const beginRead = useRequestGeneration();
  const callbacks = useRef({ onOrder, onDashboard });
  callbacks.current = { onOrder, onDashboard };
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  function feedback(text: string, failed = false) {
    if (!alive.current) return;
    setMessage(text); setError(failed);
  }
  function apply(next: DesktopTableOrder, dashboard?: DesktopDashboardData) {
    if (!alive.current || next.tableId !== tableId) return false;
    callbacks.current.onOrder(next);
    if (dashboard) callbacks.current.onDashboard(dashboard);
    orderRef.current = next;
    setOrder(next);
    const ids = new Set(next.items.map(item => item.id));
    for (const id of dirtyIds.current) if (!ids.has(id)) dirtyIds.current.delete(id);
    drafts.current = Object.fromEntries(next.items.map(item => [item.id,
      dirtyIds.current.has(item.id) ? drafts.current[item.id] ?? item.note : item.note]));
    setNotes(drafts.current); setDirty(dirtyIds.current.size > 0);
    return true;
  }
  useEffect(() => {
    if (!enabled) return;
    const current = beginRead();
    setLoading(true); setLoaded(false);
    void (async () => {
      try {
        const bridge = window.yardimciDesktop;
        if (!bridge) throw new Error("bridge unavailable");
        const next = await bridge.getActiveTableOrder(tableId);
        if (!current()) return;
        if (next && !apply(next)) throw new Error("table mismatch");
        if (!next) { orderRef.current = null; setOrder(null); }
        setLoaded(true);
      } catch {
        if (current()) feedback("Aktif adisyon okunamadı. Masayı kapatıp yeniden açın.", true);
      } finally { if (current()) setLoading(false); }
    })();
    return () => { beginRead(); };
    // Identity is keyed by WorkspaceHost; callbacks are kept fresh without restarting reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, enabled, beginRead]);

  function editNote(id: string, text: string) {
    drafts.current = { ...drafts.current, [id]: text };
    dirtyIds.current.add(id); setNotes(drafts.current); setDirty(true);
  }

  /** Serialize full-order note responses, including edits made while a save is pending. */
  async function flushNotes(): Promise<boolean> {
    if (notePromise.current) return notePromise.current;
    const save = (async () => {
      while (dirtyIds.current.size > 0 && alive.current) {
        const id = dirtyIds.current.values().next().value!;
        const owner = orderRef.current;
        if (!owner || !window.yardimciDesktop) return false;
        const draft = drafts.current[id] ?? "";
        try {
          const result = await window.yardimciDesktop.updateTableOrderItemNote(id, draft);
          if (!alive.current) return false;
          if (!result.ok) { feedback(result.message, true); return false; }
          if (result.order.id !== owner.id || result.order.tableId !== tableId) {
            feedback("Adisyon yanıtı seçili masayla eşleşmedi; işlem yenilenmeli.", true); return false;
          }
          if (drafts.current[id] === draft) dirtyIds.current.delete(id);
          apply(result.order, result.dashboardData);
          feedback(result.message);
        } catch { feedback("Ürün notu kaydedilemedi.", true); return false; }
      }
      return alive.current;
    })();
    notePromise.current = save;
    try { return await save; } finally { if (notePromise.current === save) notePromise.current = null; }
  }

  /** Every mutation and close/return shares the same flush and synchronous busy gate. */
  async function run(operation: (isCurrent: () => boolean) => Promise<boolean>): Promise<boolean> {
    if (running.current || loading || !loaded || !alive.current) return false;
    running.current = true; setBusy(true); setError(false);
    try {
      if (!await flushNotes() || !alive.current) return false;
      return await operation(() => alive.current);
    } catch { feedback("İşlem sonucu doğrulanamadı. Yenilemeden yeniden göndermeyin.", true); return false; }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  function mutate(operation: () => Promise<DesktopTableOrderResult>) {
    return run(async () => {
      const result = await operation();
      if (!alive.current) return false;
      feedback(result.message, !result.ok);
      if (!result.ok) return false;
      if (!apply(result.order, result.dashboardData)) {
        feedback("Adisyon yanıtı seçili masayla eşleşmedi; işlem yenilenmeli.", true); return false;
      }
      return true;
    });
  }
  const bridge = () => {
    if (!window.yardimciDesktop) throw new Error("Desktop bridge unavailable");
    return window.yardimciDesktop;
  };
  const active = order && ["open", "preparing", "served", "payment"].includes(order.status) ? order : null;
  return { order, active, notes, dirty, busy, loading, loaded, message, error, editNote, flushNotes, run, feedback,
    startTableOrder: () => mutate(() => bridge().openTableOrder(tableId)),
    addItem: (id: string) => mutate(() => bridge().addTableOrderItem(orderRef.current!.id, id, 1, "")),
    quantity: (id: string, value: number) => mutate(() => bridge().updateTableOrderItemQuantity(id, value)),
    removeItem: (id: string) => mutate(() => bridge().removeTableOrderItem(id)),
    status: (status: "preparing" | "served" | "payment") => mutate(() => bridge().updateTableOrderStatus(orderRef.current!.id, status)),
    closeTableOrder: (status: "paid" | "cancelled") => mutate(() => bridge().closeTableOrder(orderRef.current!.id, status))
  };
}
