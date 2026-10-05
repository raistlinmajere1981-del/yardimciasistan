import { Panel } from "../ui/Panel";
import type { MarketingChannelRegistry, MarketingRecurrenceRule, MarketingScheduleDetail, MarketingScheduleInput, MarketingPublication } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
export const scheduleStatuses={active:"Aktif",paused:"Plan duraklatıldı",completed:"Tamamlandı",cancelled:"İptal edildi"};
export const executionStatuses={pending:"Sonuç bekleniyor",claimed:"Çalışıyor",succeeded:"Başarılı",skipped:"Atlandı",failed:"Başarısız"};
export function scheduleLocal(instant:string,timezone:string) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(instant)).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function scheduleDate(instant:string,timezone:string) {return instant?new Date(instant).toLocaleString("tr-TR",{timeZone:timezone}):"—";}
export function scheduleDraft(detail:MarketingScheduleDetail):MarketingScheduleInput {
  const s=detail.schedule;
  return {id:s.id,expectedRevision:s.revision,name:s.name,targetType:s.targetType,targetId:s.targetId,channel:s.channel,expectedTargetRevision:s.targetRevision,scheduleType:s.scheduleType,timezone:s.timezone,startsLocal:s.startsLocal,recurrenceRule:s.recurrenceRule,missedRunPolicy:s.missedRunPolicy};
}
export function MarketingScheduleWorkspace({draft,onChange,detail,channels,publication,busy,onSave,onTransition,onClose,onTarget,onResult}:{draft:MarketingScheduleInput;onChange:(d:MarketingScheduleInput)=>void;detail?:MarketingScheduleDetail;channels:MarketingChannelRegistry;publication?:MarketingPublication;busy:boolean;onSave:()=>void;onTransition:(action:"pause"|"resume"|"cancel")=>void;onClose:()=>void;onTarget?:()=>void;onResult?:(id:string)=>void}) {
  const channel=channels.find(c=>c.id===draft.channel),s=detail?.schedule,terminal=s && ["completed","cancelled"].includes(s.status);
  const latest=detail?.executions[0],inFlight=detail?.executions.some(e=>["pending","claimed"].includes(e.status));
  const rule=draft.recurrenceRule;
  const changedTarget=publication && s && publication.revision!==s.targetRevision;
  function setRule(frequency:MarketingRecurrenceRule["frequency"]) {
    const localTime=draft.startsLocal.slice(11),date=new Date(`${draft.startsLocal}:00Z`);
    onChange({...draft,scheduleType:"recurring",recurrenceRule:frequency==="weekly"?{frequency,interval:1,localTime,weekdays:[date.getUTCDay()||7]}:frequency==="monthly"?{frequency,interval:1,localTime,dayOfMonth:date.getUTCDate()}:{frequency,interval:1,localTime}});
  }
  return <Panel as="section" surfaceRole="communication" className="marketing-editor" aria-label="Plan çalışma alanı">
    <div className="marketing-actions"><h2>{s?draft.name:"Yeni plan"}</h2><ActionButton variant="secondary" disabled={busy} onClick={onClose}>Takvime dön</ActionButton></div>
    <p>Hedef: {detail?.targetSummary.name??publication?.title??draft.name}{detail?.targetSummary.mediaCount!==undefined?` · ${detail.targetSummary.mediaCount} görsel`:""}</p>
    <p>{channel?.displayName} · {draft.targetType==="audience_campaign"?"Hazırlanmış kampanya · tek seferlik başlangıç":"Yayın · dondurulmuş sürüm"}{s?.targetRevision?` ${s.targetRevision}`:""}</p>
    {draft.targetType==="public_publication" && <p>Planlanan yayın kaydedilen sürümü kullanır. İçerik veya yayın düzenlemeleri planı otomatik değiştirmez.</p>}
    {draft.targetType==="audience_campaign" && <p>Planı duraklatmak kampanya gönderimini duraklatmaz. Kitle ve gönderim izinlerini mevcut kampanya akışı yönetir.</p>}
    {s && <p>{scheduleStatuses[s.status]} · Sonraki çalışma: {scheduleDate(s.nextRunAt,s.timezone)} · Son çalışma: {scheduleDate(s.lastRunAt,s.timezone)} · {latest?executionStatuses[latest.status]:"Henüz çalışmadı"}</p>}
    {changedTarget && <p role="status">Yayın değişmiş. Plan sürüm {s?.targetRevision} üzerinde kalır. Güncel yayını kullanmak için “Planı güncelle” seçin.</p>}
    <fieldset className="form-stack" disabled={busy||Boolean(terminal)||inFlight}>
      <label className="form-field">Plan adı<input maxLength={240} value={draft.name} onChange={e=>onChange({...draft,name:e.target.value})}/></label>
      <div className="marketing-schedule-fields">
        <label className="form-field">Tarih<input type="date" lang="tr-TR" value={draft.startsLocal.slice(0,10)} onChange={e=>onChange({...draft,startsLocal:`${e.target.value}T${draft.startsLocal.slice(11)}`})}/></label>
        <label className="form-field">Saat<input type="time" lang="tr-TR" value={draft.startsLocal.slice(11)} onChange={e=>onChange({...draft,startsLocal:`${draft.startsLocal.slice(0,10)}T${e.target.value}`,recurrenceRule:rule?{...rule,localTime:e.target.value}:undefined})}/></label>
      </div>
      <label className="form-field">Saat dilimi<input aria-label="Saat dilimi" value={draft.timezone} placeholder="Europe/Istanbul" onChange={e=>onChange({...draft,timezone:e.target.value})}/><small>IANA adı · Plan kaydedilen saat dilimini korur.</small></label>
      <label className="form-field">Plan türü<select aria-label="Plan türü" value={draft.scheduleType} onChange={e=>e.target.value==="once"?onChange({...draft,scheduleType:"once",recurrenceRule:undefined}):setRule("daily")}><option value="once">Tek sefer</option><option value="recurring" disabled={!channel?.supportsRecurringScheduling}>Tekrar</option></select></label>
      {!channel?.supportsRecurringScheduling && <small>WhatsApp / SMS tekrar desteklemez. Önce kampanyayı hazırlayın.</small>}
      {rule && <>
        <label className="form-field">Tekrar<select aria-label="Tekrar" value={rule.frequency} onChange={e=>setRule(e.target.value as MarketingRecurrenceRule["frequency"])}><option value="daily">Günlük</option><option value="weekly">Haftalık</option><option value="monthly">Aylık</option></select></label>
        <label className="form-field">Aralık<input type="number" min={1} max={365} value={rule.interval} onChange={e=>onChange({...draft,recurrenceRule:{...rule,interval:Number(e.target.value)}})}/></label>
        {rule.frequency==="weekly" && <div className="marketing-actions" role="group" aria-label="Haftanın günleri">{["Pzt","Sal","Çar","Per","Cum","Cmt","Paz"].map((name,i)=><label key={name}><input type="checkbox" checked={rule.weekdays.includes(i+1)} onChange={e=>onChange({...draft,recurrenceRule:{...rule,weekdays:e.target.checked?[...rule.weekdays,i+1].sort():rule.weekdays.filter(d=>d!==i+1)}})}/>{name}</label>)}</div>}
        {rule.frequency==="monthly" && <label className="form-field">Ayın günü<input type="number" min={1} max={31} value={rule.dayOfMonth} onChange={e=>onChange({...draft,recurrenceRule:{...rule,dayOfMonth:Number(e.target.value)}})}/><small>Kısa aylarda ayın son günü kullanılır.</small></label>}
      </>}
      <label className="form-field">Kaçırılan çalışma<select aria-label="Kaçırılan çalışma" value={draft.missedRunPolicy} onChange={e=>onChange({...draft,missedRunPolicy:e.target.value as MarketingScheduleInput["missedRunPolicy"]})}><option value="run_once_when_resumed">Devam edildiğinde bir kez çalıştır</option><option value="skip">Atla</option></select><small>Tekrarlarda kaçırılan çalışmalar toplu gönderilmez. DST’de tekrarlanan saatin ilki, atlanan saatin ileri kaydırılmış karşılığı kullanılır.</small></label>
      {draft.targetType==="public_publication" && publication && s && <ActionButton variant="secondary" onClick={()=>onChange({...draft,updateTarget:true,expectedTargetRevision:publication.revision})}>Planı güncelle · sürüm {publication.revision}</ActionButton>}
      {draft.updateTarget && <p>Kaydettiğinizde güncel yayın sürümü plana bağlanacak.</p>}
      <ActionButton disabled={!draft.name.trim()} onClick={onSave}>{s?"Planı kaydet":"Plan oluştur"}</ActionButton>
    </fieldset>
    {inFlight && <p>Çalışma sonuçlandıktan sonra plan düzenlenebilir. Planı duraklatmak devam eden işlemi zorla durdurmaz.</p>}
    {s && !terminal && <div className="marketing-actions">
      <ActionButton variant="secondary" disabled={busy} onClick={()=>onTransition(s.status==="paused"?"resume":"pause")}>{s.status==="paused"?"Planı devam ettir":"Planı duraklat"}</ActionButton>
      <ActionButton variant="danger" disabled={busy} onClick={()=>onTransition("cancel")}>Planı iptal et</ActionButton>
    </div>}
    <p>Planı iptal etmek yayımlanmış içeriği geri almaz veya kampanyayı iptal etmez.</p>
    {onTarget && <ActionButton variant="secondary" disabled={busy} onClick={onTarget}>Hedefi aç</ActionButton>}
    {detail && <section aria-label="Plan çalışma geçmişi"><h3>Son çalışma sonuçları</h3>{!detail.executions.length && <p>Henüz çalışma yok.</p>}{detail.executions.map(e=><p key={e.id}>{scheduleDate(e.plannedAt,s!.timezone)} · {executionStatuses[e.status]}{e.lastError?` · ${e.lastError}`:""}{e.resultReference?" · Hedef niyeti kaydedildi":""}{e.resultReference && onResult && <ActionButton variant="secondary" disabled={busy} onClick={()=>onResult(e.resultReference!)}>Çalışma hedefini aç</ActionButton>}</p>)}</section>}
  </Panel>;
}
