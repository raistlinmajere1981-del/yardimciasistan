import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketingScheduleDetail, MarketingScheduleInput, MarketingStudioSnapshot } from "@yardimci-asistan/shared";
import type { RegisterPageLeaveGuard } from "../../app/page-navigation-guard";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { MarketingScheduleWorkspace, scheduleDraft } from "./MarketingScheduleWorkspace";
import { resultValue } from "./share-draft";

export function MarketingScheduleDialog({detail, initial, onClose, onReload, onMessage, registerPageLeaveGuard}: {detail?: MarketingScheduleDetail; initial?: MarketingScheduleInput; onClose: () => void; onReload: () => Promise<void>; onMessage?: (message: string) => void; registerPageLeaveGuard?: RegisterPageLeaveGuard}) {
  const [current, setCurrent] = useState(detail), [draft, setDraft] = useState(() => detail ? scheduleDraft(detail) : initial!);
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft));
  const [studio, setStudio] = useState<MarketingStudioSnapshot | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [pending, setPending] = useState<(() => void) | null>(null), [cancel, setCancel] = useState(false);
  const working = useRef(false), epoch = useRef(0);
  const invalidateEpoch = useCallback(() => { ++epoch.current; }, []);
  const dirty = JSON.stringify(draft) !== baseline;
  useEffect(() => {
    if (!detail || dirty || busy || current && detail.schedule.revision < current.schedule.revision || JSON.stringify(detail) === JSON.stringify(current)) return;
    const next = scheduleDraft(detail); setCurrent(detail); setDraft(next); setBaseline(JSON.stringify(next));
  }, [detail, dirty, busy, current]);
  useEffect(() => {let live = true; void window.yardimciDesktop!.getMarketingStudio().then(r => {if(live) setStudio(resultValue(r));}).catch(e => {if(live) setMessage(e.message);}); return () => {live = false; invalidateEpoch();};}, [invalidateEpoch]);
  useEffect(() => registerPageLeaveGuard?.((_destination, next) => {if(working.current)return false; if(!dirty)return true; setPending(() => next); return false;}), [dirty, registerPageLeaveGuard]);
  function close() {if(working.current)return; if(dirty) setPending(() => onClose); else onClose();}
  async function operation(transition?: "pause" | "resume" | "cancel") {
    if(working.current)return; working.current = true; setBusy(true); setMessage(""); const ticket = ++epoch.current;
    try {
      const next = resultValue(await (transition && current ? window.yardimciDesktop!.transitionMarketingSchedule(current.schedule.id, current.schedule.revision, transition) : window.yardimciDesktop!.saveMarketingSchedule(draft)));
      if(ticket === epoch.current) {const d = scheduleDraft(next); setCurrent(next); setDraft(d); setBaseline(JSON.stringify(d)); setCancel(false); setMessage("Plan kaydedildi."); onMessage?.("Plan kaydedildi.");}
      await onReload();
    } catch(e) {if(ticket === epoch.current) setMessage(e instanceof Error ? e.message : "Plan işlemi tamamlanamadı.");} finally {working.current = false; if(ticket === epoch.current) setBusy(false);}
  }
  return <WorkspaceFrame title={current ? current.schedule.name : "Paylaşımı planla"} context="Pazarlama planı · Ana Takvim" presentation="centered" className="marketing-management-workspace" onClose={close} closeBlocked={busy}
    overlay={pending ? <ConfirmDialog withinModal tone="warning" title="Plan değişiklikleri kaydedilmedi" confirmLabel="Değişiklikleri bırak" cancelLabel="Düzenlemeye dön" onCancel={() => setPending(null)} onConfirm={() => {const next = pending; setPending(null); next();}}/> : cancel && <ConfirmDialog withinModal tone="danger" title="Gelecek yayın planı iptal edilsin mi?" description="Yayınlanmış içerik veya başlamış gönderimler geri alınmaz." confirmLabel="Planı iptal et" busy={busy} onCancel={() => setCancel(false)} onConfirm={() => operation("cancel")}/>}>
    <p role="status">{message}</p>
    <MarketingScheduleWorkspace draft={draft} onChange={setDraft} detail={current} channels={studio?.channels || []} publication={studio?.publications.find(p => p.id === draft.targetId)} busy={busy} onSave={() => void operation()} onTransition={action => {if(dirty) {setMessage("Önce değişiklikleri kaydedin."); return;} if(action === "cancel") setCancel(true); else void operation(action);}} onClose={close}/>
  </WorkspaceFrame>;
}
