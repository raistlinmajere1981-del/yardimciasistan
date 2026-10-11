import type { MarketingChannelRegistry, MarketingRecurrenceRule, MarketingScheduleDetail, MarketingScheduleInput, MarketingPublication } from "@yardimci-asistan/shared";
import { DatePicker, TimePicker } from "../ui/DateTimePicker";
import { ActionButton } from "../ui/ActionButton";
const scheduleStatuses={active:"Aktif",paused:"Plan duraklatıldı",completed:"Tamamlandı",cancelled:"İptal edildi"};
export const executionStatuses={pending:"Sonuç bekleniyor",claimed:"Çalışıyor",succeeded:"Başarılı",skipped:"Atlandı",failed:"Başarısız"};
export function scheduleDate(instant:string,timezone:string) {return instant?new Date(instant).toLocaleString("tr-TR",{timeZone:timezone}):"—";}
export function scheduleDraft(detail:MarketingScheduleDetail):MarketingScheduleInput {
  const s=detail.schedule;
  return {id:s.id,expectedRevision:s.revision,name:s.name,targetType:s.targetType,targetId:s.targetId,channel:s.channel,...(s.targetRevision===undefined?{}:{expectedTargetRevision:s.targetRevision}),scheduleType:s.scheduleType,timezone:s.timezone,startsLocal:s.startsLocal,...(s.recurrenceRule===undefined?{}:{recurrenceRule:s.recurrenceRule}),missedRunPolicy:s.missedRunPolicy};
}
export function scheduleState(detail?: MarketingScheduleDetail) {
  const s = detail?.schedule;
  return {s, terminal: Boolean(s && ["completed", "cancelled"].includes(s.status)),
    inFlight: Boolean(detail?.executions.some(e => ["pending", "claimed"].includes(e.status)))};
}

export function MarketingScheduleActions({draft,detail,busy,onSave,onTransition, editing = true, available = true}:{editing?:boolean;available?:boolean;draft:MarketingScheduleInput;detail?:MarketingScheduleDetail;busy:boolean;onSave:()=>void;onTransition:(action:"pause"|"resume"|"cancel")=>void}) {
  const {s, terminal, inFlight} = scheduleState(detail);
  return <div className="marketing-actions">
    {s && !terminal && <>
      <ActionButton variant="secondary" disabled={busy || s.status==="paused" && !available} onClick={()=>onTransition(s.status==="paused"?"resume":"pause")}>{s.status==="paused"?"Planı devam ettir":"Planı duraklat"}</ActionButton>
      <ActionButton variant="danger" disabled={busy} onClick={()=>onTransition("cancel")}>Planı iptal et</ActionButton>
    </>}
    {editing && <ActionButton disabled={busy || !available || terminal || inFlight || !draft.name.trim()} onClick={onSave}>{s?"Planı kaydet":"Plan oluştur"}</ActionButton>}
  </div>;
}

export function MarketingScheduleWorkspace({draft,onChange,detail,channels,publication,busy, embedded = false}:{embedded?:boolean;draft:MarketingScheduleInput;onChange:(d:MarketingScheduleInput)=>void;detail?:MarketingScheduleDetail;channels:MarketingChannelRegistry;publication?:MarketingPublication;busy:boolean}) {
  const channel=channels.find(c=>c.id===draft.channel), {s, terminal, inFlight} = scheduleState(detail);
  const latest=detail?.executions[0];
  const rule=draft.recurrenceRule;
  const changedTarget=publication && s && publication.revision!==s.targetRevision;
  function setRule(frequency:MarketingRecurrenceRule["frequency"]) {
    const localTime=draft.startsLocal.slice(11),date=new Date(`${draft.startsLocal}:00Z`);
    onChange({...draft,scheduleType:"recurring",recurrenceRule:frequency==="weekly"?{frequency,interval:1,localTime,weekdays:[date.getUTCDay()||7]}:frequency==="monthly"?{frequency,interval:1,localTime,dayOfMonth:date.getUTCDate()}:{frequency,interval:1,localTime}});
  }
  return <section className="form-stack" aria-label="Plan çalışma alanı">
    <div className="marketing-actions"><h2>{s?draft.name:"Yeni plan"}</h2></div>
    <p>Hedef: {detail?.targetSummary.name??publication?.title??draft.name}{detail?.targetSummary.mediaCount!==undefined?` · ${detail.targetSummary.mediaCount} görsel`:""}</p>
    <p>{channel?.displayName} · {draft.targetType==="audience_campaign"?"Hazırlanmış kampanya · tek seferlik başlangıç":"Yayın · dondurulmuş sürüm"}{s?.targetRevision?` ${s.targetRevision}`:""}</p>
    {draft.targetType==="public_publication" && <p>Planlanan yayın kaydedilen sürümü kullanır. İçerik veya yayın düzenlemeleri planı otomatik değiştirmez.</p>}
    {draft.targetType==="audience_campaign" && <p>Planı duraklatmak kampanya gönderimini duraklatmaz. Kitle ve gönderim izinlerini mevcut kampanya akışı yönetir.</p>}
    {s && <p>{scheduleStatuses[s.status]} · Sonraki çalışma: {scheduleDate(s.nextRunAt,s.timezone)} · Son çalışma: {scheduleDate(s.lastRunAt,s.timezone)} · {latest?executionStatuses[latest.status]:"Henüz çalışmadı"}</p>}
    {changedTarget && <p role="status">Yayın değişmiş. Plan sürüm {s?.targetRevision} üzerinde kalır. Güncel yayını kullanmak için “Planı güncelle” seçin.</p>}
    <fieldset className="form-stack" disabled={busy||Boolean(terminal)||inFlight}>
      <label className="form-field form-field--fluid">Plan adı<input maxLength={240} value={draft.name} onChange={e=>onChange({...draft,name:e.target.value})}/></label>
      <div className="marketing-schedule-fields">
        <label className="form-field form-field--fluid">Tarih<DatePicker ariaLabel="Tarih" clearable={false} value={draft.startsLocal.slice(0,10)} onChange={value=>onChange({...draft,startsLocal:`${value}T${draft.startsLocal.slice(11)}`})}/></label>
        <label className="form-field form-field--fluid">Saat<TimePicker ariaLabel="Saat" clearable={false} value={draft.startsLocal.slice(11)} onChange={value=>onChange(rule?{...draft,startsLocal:`${draft.startsLocal.slice(0,10)}T${value}`,recurrenceRule:{...rule,localTime:value}}:{...draft,startsLocal:`${draft.startsLocal.slice(0,10)}T${value}`})}/></label>
      </div>
      <label className="form-field form-field--fluid">Saat dilimi<input aria-label="Saat dilimi" value={draft.timezone} placeholder="Europe/Istanbul" onChange={e=>onChange({...draft,timezone:e.target.value})}/><small>IANA adı · Plan kaydedilen saat dilimini korur.</small></label>
      <label className="form-field form-field--fluid">Plan türü<select aria-label="Plan türü" value={draft.scheduleType} onChange={e=>{if(e.target.value!=="once"){setRule("daily");return;} const next={...draft,scheduleType:"once" as const}; delete next.recurrenceRule; onChange(next);}}><option value="once">Tek sefer</option><option value="recurring" disabled={!channel?.supportsRecurringScheduling}>Tekrar</option></select></label>
      {!channel?.supportsRecurringScheduling && <small>WhatsApp / SMS tekrar desteklemez. Önce kampanyayı hazırlayın.</small>}
      {draft.scheduleType === "recurring" && <fieldset className="form-stack">
        <label className="form-field form-field--fluid">Tekrar<select aria-label="Tekrar" value={rule?.frequency??"daily"} onChange={e=>setRule(e.target.value as MarketingRecurrenceRule["frequency"])}><option value="daily">Günlük</option><option value="weekly">Haftalık</option><option value="monthly">Aylık</option></select></label>
        <label className="form-field form-field--fluid">Aralık<input type="number" min={1} max={365} value={rule?.interval??1} onChange={e=>{if(rule)onChange({...draft,recurrenceRule:{...rule,interval:Number(e.target.value)}});}}/></label>
        <fieldset disabled={rule?.frequency!=="weekly"}><legend>Haftanın günleri</legend><div className="marketing-actions">{["Pzt","Sal","Çar","Per","Cum","Cmt","Paz"].map((name,i)=><label key={name}><input type="checkbox" checked={rule?.frequency==="weekly"&&rule.weekdays.includes(i+1)} onChange={e=>{if(rule?.frequency==="weekly")onChange({...draft,recurrenceRule:{...rule,weekdays:e.target.checked?[...rule.weekdays,i+1].sort():rule.weekdays.filter(d=>d!==i+1)}});}}/>{name}</label>)}</div></fieldset>
        <label className="form-field form-field--fluid">Ayın günü<input type="number" min={1} max={31} disabled={rule?.frequency!=="monthly"} value={rule?.frequency==="monthly"?rule.dayOfMonth:1} onChange={e=>{if(rule?.frequency==="monthly")onChange({...draft,recurrenceRule:{...rule,dayOfMonth:Number(e.target.value)}});}}/><small>Kısa aylarda ayın son günü kullanılır.</small></label>
      </fieldset>}
      <label className="form-field form-field--fluid">Kaçırılan çalışma<select aria-label="Kaçırılan çalışma" value={draft.missedRunPolicy} onChange={e=>onChange({...draft,missedRunPolicy:e.target.value as MarketingScheduleInput["missedRunPolicy"]})}><option value="run_once_when_resumed">Devam edildiğinde bir kez çalıştır</option><option value="skip">Atla</option></select><small>Tekrarlarda kaçırılan çalışmalar toplu gönderilmez. DST’de tekrarlanan saatin ilki, atlanan saatin ileri kaydırılmış karşılığı kullanılır.</small></label>
      {draft.targetType==="public_publication" && publication && s && <ActionButton variant="secondary" onClick={()=>onChange({...draft,updateTarget:true,expectedTargetRevision:publication.revision})}>Planı güncelle · sürüm {publication.revision}</ActionButton>}
      {draft.updateTarget && <p>Kaydettiğinizde güncel yayın sürümü plana bağlanacak.</p>}
    </fieldset>
    {inFlight && <p>Çalışma sonuçlandıktan sonra plan düzenlenebilir. Planı duraklatmak devam eden işlemi zorla durdurmaz.</p>}
    <p>Planı iptal etmek yayımlanmış içeriği geri almaz veya kampanyayı iptal etmez.</p>
    {detail && !embedded && <section aria-label="Plan çalışma geçmişi"><h3>Son çalışma sonuçları</h3>{!detail.executions.length && <p>Henüz çalışma yok.</p>}{detail.executions.map(e=><p key={e.id}>{scheduleDate(e.plannedAt,s!.timezone)} · {executionStatuses[e.status]}{e.lastError?` · ${e.lastError}`:""}{e.resultReference?" · Yayın / gönderim işleme alındı":""}</p>)}</section>}
  </section>;
}
