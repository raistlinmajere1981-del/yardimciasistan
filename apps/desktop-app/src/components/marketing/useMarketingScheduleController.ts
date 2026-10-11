import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketingScheduleDetail, MarketingScheduleInput } from "@yardimci-asistan/shared";
import { scheduleDraft } from "./MarketingScheduleWorkspace";
import { resultValue } from "./share-draft";

/** Shared schedule lifecycle for Calendar and the embedded publication plan. */
export function useMarketingScheduleController({detail, initial, onReload, onMessage, onBusy}: {
  detail?: MarketingScheduleDetail; initial?: MarketingScheduleInput; onReload: () => Promise<void>;
  onMessage?: (message: string) => void; onBusy?: (busy: boolean) => void;
}) {
  const [current, setCurrent] = useState(detail), [draft, setDraft] = useState(() => detail ? scheduleDraft(detail) : initial!);
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [cancel, setCancel] = useState(false);
  const working = useRef(false), mounted = useRef(true);
  const dirty = JSON.stringify(draft) !== baseline;
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  useEffect(() => {
    if (!detail || dirty || busy || current && detail.schedule.revision < current.schedule.revision || JSON.stringify(detail) === JSON.stringify(current)) return;
    const next = scheduleDraft(detail); setCurrent(detail); setDraft(next); setBaseline(JSON.stringify(next));
  }, [detail, dirty, busy, current]);
  // Lifecycle changes remain visible even while the optimistic edit draft is dirty.
  const lifecycle = current && detail && detail.schedule.revision >= current.schedule.revision
    ? {...current, schedule: {...current.schedule, status: detail.schedule.status}, executions: detail.executions} : current;
  const discard = useCallback(() => {if (!working.current) {setDraft(JSON.parse(baseline) as MarketingScheduleInput); setMessage("");}}, [baseline]);
  async function operation(transition?: "pause" | "resume" | "cancel") {
    if (working.current) return false;
    if (transition && dirty) {setMessage("Önce değişiklikleri kaydedin."); return false;}
    if (lifecycle && ["completed", "cancelled"].includes(lifecycle.schedule.status)) return false;
    if (!transition && lifecycle?.executions.some(e => ["pending", "claimed"].includes(e.status))) return false;
    working.current = true; setBusy(true); onBusy?.(true); setMessage("");
    try {
      const next = resultValue(await (transition && current ? window.yardimciDesktop!.transitionMarketingSchedule(current.schedule.id, current.schedule.revision, transition) : window.yardimciDesktop!.saveMarketingSchedule(draft)));
      if (mounted.current) {const d = scheduleDraft(next); setCurrent(next); setDraft(d); setBaseline(JSON.stringify(d)); setCancel(false); setMessage("Plan kaydedildi."); onMessage?.("Plan kaydedildi.");}
      await onReload(); return true;
    } catch (e) {if (mounted.current) setMessage(e instanceof Error ? e.message : "Plan işlemi tamamlanamadı."); return false;}
    finally {working.current = false; if (mounted.current) {setBusy(false); onBusy?.(false);}}
  }
  function transition(action: "pause" | "resume" | "cancel") {
    if (working.current) return;
    if (dirty) {setMessage("Önce değişiklikleri kaydedin."); return;}
    if (action === "cancel") setCancel(true); else void operation(action);
  }
  return {current, lifecycle, draft, setDraft, dirty, busy, message, cancel, setCancel, working, operation, transition, discard};
}
