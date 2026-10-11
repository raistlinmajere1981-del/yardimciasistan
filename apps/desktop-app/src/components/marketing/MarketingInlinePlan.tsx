import { useEffect, useRef, useState } from "react";
import type { MarketingChannelRegistry, MarketingPublication, MarketingScheduleDetail } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { MarketingScheduleActions, MarketingScheduleWorkspace, scheduleDate, scheduleState } from "./MarketingScheduleWorkspace";
import { useMarketingScheduleController } from "./useMarketingScheduleController";
import { channelNames } from "./share-draft";

export function MarketingInlinePlan({detail, channels, publication, blocked, onReload, onBusy, onDirty}: {
  detail: MarketingScheduleDetail; channels: MarketingChannelRegistry; publication?: MarketingPublication; blocked: boolean;
  onReload: () => Promise<void>; onBusy: (busy: boolean) => void; onDirty: (dirty: boolean, discard: () => void, id: string) => void;
}) {
  const controller = useMarketingScheduleController({detail, onReload, onBusy});
  const {current, lifecycle, draft, setDraft, dirty, busy, message, cancel, setCancel, operation, transition, discard} = controller;
  const [editing, setEditing] = useState(false);
  const editor = useRef<HTMLDivElement>(null), launcher = useRef<HTMLDivElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {onDirty(dirty, discard, detail.schedule.id);}, [dirty, discard, onDirty, detail.schedule.id]);
  useEffect(() => {
    if (editing) editor.current?.querySelector<HTMLInputElement>('input')?.focus({preventScroll: true});
    else if (wasEditing.current) launcher.current?.querySelector<HTMLButtonElement>("button")?.focus({preventScroll: true});
    wasEditing.current = editing;
  }, [editing]);
  const {terminal, inFlight} = scheduleState(lifecycle), s = current!.schedule, rule = s.recurrenceRule;
  const available = channels.some(c => c.id === s.channel && c.enabled && c.configured);
  const recurrence = rule ? `${{daily: "Günlük", weekly: "Haftalık", monthly: "Aylık"}[rule.frequency]} · ${rule.interval} aralık${rule.frequency === "weekly" ? ` · ${rule.weekdays.map(d => ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"][d - 1]).join(", ")}` : rule.frequency === "monthly" ? ` · Ayın ${rule.dayOfMonth}. günü` : ""}` : "Tek sefer";
  return <section className="form-stack" aria-label="Seçili yayın planı" aria-busy={busy}>
    {!editing ? <><strong>{s.name}</strong><dl className="marketing-detail-meta">
      <div><dt>Kanal / durum</dt><dd>{channelNames[s.channel]} · {{active: "Planlandı", paused: "Plan duraklatıldı", completed: "Plan tamamlandı", cancelled: "Plan iptal edildi"}[s.status]}</dd></div>
      <div><dt>Tarih / saat</dt><dd>{s.startsLocal.replace("T", " · ")} · {s.timezone}</dd></div>
      {s.nextRunAt && <div><dt>Sonraki çalışma</dt><dd>{scheduleDate(s.nextRunAt, s.timezone)}</dd></div>}
      <div><dt>Plan türü / tekrar</dt><dd>{recurrence}</dd></div>
      <div><dt>Kaçırılan çalışma</dt><dd>{s.missedRunPolicy === "skip" ? "Atla" : "Devam edildiğinde bir kez çalıştır"}</dd></div>
      {s.targetRevision !== undefined && <div><dt>Dondurulmuş sürüm</dt><dd>Sürüm {s.targetRevision} · İçerik değişikliği planı otomatik değiştirmez.</dd></div>}
    </dl>
      {publication && s.targetRevision !== publication.revision && <small>Yayın değişmiş; plan eski sürümü kullanır. Güncel sürüm yalnız açık “Planı güncelle” seçimiyle bağlanır.</small>}
      {!terminal && <div ref={launcher}><ActionButton variant="secondary" disabled={blocked || busy || inFlight || !available} onClick={() => setEditing(true)}>Planı düzenle</ActionButton></div>}
    </> : <div ref={editor}><MarketingScheduleWorkspace embedded draft={draft} detail={lifecycle!} onChange={setDraft} channels={channels} {...(publication === undefined ? {} : {publication})} busy={blocked || busy || !available}/></div>}
    {!available && <p>Bu kanal şu anda kullanılamıyor. Plan bilgileri korunuyor.</p>}
    {inFlight && !editing && <p>Çalışma sürüyor. Sonuçlandıktan sonra plan düzenlenebilir.</p>}
    {message && <p role="status">{message}</p>}
    <MarketingScheduleActions draft={draft} detail={lifecycle!} editing={editing} available={available} busy={blocked || busy} onSave={() => void operation().then(saved => {if (saved) setEditing(false);})} onTransition={transition}/>
    {editing && <ActionButton variant="secondary" disabled={blocked || busy} onClick={() => {discard(); setEditing(false);}}>Vazgeç</ActionButton>}
    {cancel && <ConfirmDialog withinModal tone="danger" title="Gelecek yayın planı iptal edilsin mi?" description="Yayınlanmış içerik veya başlamış gönderimler geri alınmaz." confirmLabel="Planı iptal et" details={message && <p role="status">{message}</p>} busy={busy} onCancel={() => setCancel(false)} onConfirm={async () => {if (await operation("cancel")) setEditing(false);}}/>}
  </section>;
}
