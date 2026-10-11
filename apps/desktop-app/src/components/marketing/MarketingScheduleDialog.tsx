import { useEffect, useState } from "react";
import type { MarketingScheduleDetail, MarketingScheduleInput, MarketingStudioSnapshot } from "@yardimci-asistan/shared";
import type { RegisterPageLeaveGuard } from "../../app/page-navigation-guard";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { MarketingScheduleActions, MarketingScheduleWorkspace } from "./MarketingScheduleWorkspace";
import { useMarketingScheduleController } from "./useMarketingScheduleController";
import { resultValue } from "./share-draft";

export function MarketingScheduleDialog({detail, initial, onClose, onReload, onMessage, registerPageLeaveGuard}: {detail?: MarketingScheduleDetail; initial?: MarketingScheduleInput; onClose: () => void; onReload: () => Promise<void>; onMessage?: (message: string) => void; registerPageLeaveGuard?: RegisterPageLeaveGuard}) {
  const {current, lifecycle, draft, setDraft, dirty, busy, message: planMessage, cancel, setCancel, working, operation, transition} = useMarketingScheduleController({
    ...(detail === undefined ? {} : {detail}), ...(initial === undefined ? {} : {initial}), onReload, ...(onMessage === undefined ? {} : {onMessage})
  });
  const [studio, setStudio] = useState<MarketingStudioSnapshot | null>(null), [message, setMessage] = useState("");
  const [pending, setPending] = useState<(() => void) | null>(null);
  useEffect(() => {let live = true; void window.yardimciDesktop!.getMarketingStudio().then(r => {if(live) setStudio(resultValue(r));}).catch((e: unknown) => {if(live) setMessage(e instanceof Error ? e.message : "Plan işlemi tamamlanamadı.");}); return () => {live = false;};}, []);
  useEffect(() => registerPageLeaveGuard?.((_destination, next) => {if(working.current)return false; if(!dirty)return true; setPending(() => next); return false;}), [dirty, registerPageLeaveGuard, working]);
  function close() {if(working.current)return; if(dirty) setPending(() => onClose); else onClose();}
  const publication = studio?.publications.find(p => p.id === draft.targetId);
  return <WorkspaceFrame title={current ? current.schedule.name : "Paylaşımı planla"} context="Pazarlama planı · Ana Takvim" presentation="centered" className="marketing-workspace-frame" onClose={close} closeBlocked={busy}
    footer={<><span className="muted">{busy ? "İşlem sürüyor…" : dirty ? "Kaydedilmemiş değişiklikler" : ""}</span><MarketingScheduleActions draft={draft} {...(lifecycle === undefined ? {} : { detail: lifecycle })} busy={busy} onSave={() => void operation()} onTransition={transition}/></>}
    overlay={pending ? <ConfirmDialog withinModal tone="warning" title="Plan değişiklikleri kaydedilmedi" confirmLabel="Değişiklikleri bırak" cancelLabel="Düzenlemeye dön" onCancel={() => setPending(null)} onConfirm={() => {const next = pending; setPending(null); next();}}/> : cancel && <ConfirmDialog withinModal tone="danger" title="Gelecek yayın planı iptal edilsin mi?" description="Yayınlanmış içerik veya başlamış gönderimler geri alınmaz." confirmLabel="Planı iptal et" busy={busy} onCancel={() => setCancel(false)} onConfirm={async () => {await operation("cancel");}}/>}>
    <p role="status">{planMessage || message}</p>
    <MarketingScheduleWorkspace draft={draft} onChange={setDraft} {...(lifecycle === undefined ? {} : { detail: lifecycle })} channels={studio?.channels || []} {...(publication === undefined ? {} : { publication })} busy={busy}/>
  </WorkspaceFrame>;
}
