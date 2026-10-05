import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { MarketingSchedule, MarketingScheduleExecution, MarketingScheduleInput, MarketingScheduleDetail } from "@yardimci-asistan/shared";
import { marketingBusiness as business, marketingTransaction as transaction } from "./marketing-persistence";
import { MarketingError, marketingId, marketingText } from "./validation";
import { nextScheduleOccurrence, validateScheduleTiming } from "./schedule-recurrence";
import { getMessagingCampaign } from "../messaging-campaigns/store";
import { getMarketingContent, getMarketingPublication, captureMarketingPublicationRevision } from "./store";
type Row = Record<string, unknown>;
function scheduleRow(r: Row): MarketingSchedule {
  return {id:String(r.id),businessId:String(r.business_id),name:String(r.name),targetType:r.target_type as MarketingSchedule["targetType"],targetId:String(r.target_id),channel:r.channel as MarketingSchedule["channel"],
    ...(r.target_revision!=null?{targetRevision:Number(r.target_revision)}:{}),...(r.content_revision!=null?{contentRevision:Number(r.content_revision)}:{}),scheduleType:r.schedule_type as MarketingSchedule["scheduleType"],timezone:String(r.timezone),startsAt:String(r.starts_at),startsLocal:String(r.starts_local),
    ...(r.recurrence_json?{recurrenceRule:JSON.parse(String(r.recurrence_json))}:{}),status:r.status as MarketingSchedule["status"],missedRunPolicy:r.missed_run_policy as MarketingSchedule["missedRunPolicy"],nextRunAt:String(r.next_run_at),lastRunAt:String(r.last_run_at),revision:Number(r.revision),createdAt:String(r.created_at),updatedAt:String(r.updated_at)};
}
function executionRow(r: Row): MarketingScheduleExecution {
  return {id:String(r.id),scheduleId:String(r.schedule_id),occurrenceKey:String(r.occurrence_key),plannedAt:String(r.planned_at),claimedAt:String(r.claimed_at),completedAt:String(r.completed_at),status:r.status as MarketingScheduleExecution["status"],
    ...(r.result_reference?{resultReference:String(r.result_reference)}:{}),...(r.action_revision!=null?{actionRevision:Number(r.action_revision)}:{}),lastError:String(r.last_error),createdAt:String(r.created_at)};
}
export function getMarketingSchedule(db: DatabaseSync,id: string): MarketingSchedule {
  const r=db.prepare("SELECT * FROM marketing_schedules WHERE id=? AND business_id=?").get(marketingId(id),business(db));
  if (!r) throw new MarketingError("not_found","Plan bulunamadı."); return scheduleRow(r);
}
export function getMarketingScheduleExecution(db: DatabaseSync,id: string): MarketingScheduleExecution {
  const r=db.prepare("SELECT e.* FROM marketing_schedule_executions e JOIN marketing_schedules s ON s.id=e.schedule_id WHERE e.id=? AND s.business_id=?").get(marketingId(id),business(db));
  if (!r) throw new MarketingError("not_found","Plan çalışması bulunamadı."); return executionRow(r);
}
export function marketingScheduleDetail(db: DatabaseSync,id: string): MarketingScheduleDetail {
  const schedule=getMarketingSchedule(db,id);
  const frozen=schedule.targetRevision?db.prepare("SELECT snapshot_json FROM marketing_publication_revisions WHERE publication_id=? AND revision=?").get(schedule.targetId,schedule.targetRevision):undefined;
  const snapshot=frozen?JSON.parse(String(frozen.snapshot_json)):undefined;
  const targetSummary=snapshot?{name:String(snapshot.title),revision:schedule.targetRevision,mediaCount:snapshot.mediaAssetIds.length}:{name:getMessagingCampaign(db,schedule.targetId).name};
  return {schedule,targetSummary,executions:db.prepare("SELECT * FROM marketing_schedule_executions WHERE schedule_id=? ORDER BY planned_at DESC LIMIT 40").all(id).map(executionRow)};
}
export function listMarketingSchedules(db: DatabaseSync): MarketingScheduleDetail[] {
  return db.prepare("SELECT id FROM marketing_schedules WHERE business_id=? ORDER BY CASE WHEN next_run_at='' THEN 1 ELSE 0 END,next_run_at,created_at DESC").all(business(db)).map(r=>marketingScheduleDetail(db,String(r.id)));
}
function stale() { throw new MarketingError("stale_revision","Plan değişti. Güncel planı yeniden açın."); }
export function saveMarketingSchedule(db: DatabaseSync,input: MarketingScheduleInput,now: string): MarketingScheduleDetail {
  return transaction(db,()=>{
    if (!input || typeof input!=="object") throw new MarketingError("invalid_schedule","Plan alanlarını kontrol edin.");
    const old=input.id?getMarketingSchedule(db,input.id):undefined;
    if (old && old.revision!==input.expectedRevision) stale();
    if (old && !["active","paused"].includes(old.status)) throw new MarketingError("schedule_terminal","Sonuçlanmış plan değiştirilemez.");
    if (old && db.prepare("SELECT 1 FROM marketing_schedule_executions WHERE schedule_id=? AND status IN ('pending','claimed')").get(old.id)) throw new MarketingError("execution_in_flight","Çalışan plan sonuçlandıktan sonra düzenleyin.");
    if (old && (old.targetId!==input.targetId || old.targetType!==input.targetType || old.channel!==input.channel)) throw new MarketingError("invalid_target","Plan hedefi değiştirilemez. Yeni plan oluşturun.");
    const timing=validateScheduleTiming(input), targetId=marketingId(input.targetId), name=marketingText(input.name,240,true);
    if (Date.parse(timing.startsAt)<=Date.parse(now) && (!old || old.startsAt!==timing.startsAt)) throw new MarketingError("past_schedule","Başlangıç için ileri bir tarih seçin.");
    let targetRevision=old?.targetRevision,contentRevision=old?.contentRevision;
    if (input.targetType==="audience_campaign") {
      if (input.scheduleType!=="once" || !["whatsapp","sms"].includes(input.channel)) throw new MarketingError("audience_recurring_disabled","WhatsApp/SMS yalnız tek seferlik plan destekler.");
      const c=getMessagingCampaign(db,targetId);
      if (c.channel!==input.channel || c.status!=="prepared") throw new MarketingError("prepared_required","Önce kampanyayı hazırlayın. Yalnız hazırlanmış kampanya planlanabilir.");
      contentRevision=c.contentRevision;
      if(db.prepare("SELECT 1 FROM marketing_schedules WHERE target_type='audience_campaign' AND target_id=? AND status IN ('active','paused') AND id<>?").get(targetId,old?.id??"")) throw new MarketingError("already_scheduled","Bu kampanya zaten planlanmış.");
    } else if(input.targetType==="public_publication" && ["website","instagram"].includes(input.channel)) {
      const p=getMarketingPublication(db,targetId);
      if (p.channel!==input.channel) throw new MarketingError("invalid_target","Yayın kanalı eşleşmiyor.");
      if (!old || input.updateTarget) {
        if (p.revision!==input.expectedTargetRevision) throw new MarketingError("stale_revision","Yayın değişti. Güncel yayını yeniden açın.");
        const content=getMarketingContent(db,p.contentId).content;
        if(content.status!=="ready") throw new MarketingError("ready_required","Planlamak için içeriği Hazır olarak kaydedin.");
        if(input.channel==="instagram" && p.status!=="draft") throw new MarketingError("ready_required","Instagram için yeni yayın taslağı oluşturun.");
        captureMarketingPublicationRevision(db,p); targetRevision=p.revision;contentRevision=Number(db.prepare("SELECT content_revision FROM marketing_publication_revisions WHERE publication_id=? AND revision=?").get(p.id,p.revision)?.content_revision);
      }
    } else throw new MarketingError("invalid_target","Plan hedefi geçersiz.");
    const id=old?.id??`schedule_${randomUUID()}`;
    const next=old && old.startsAt===timing.startsAt && old.timezone===timing.timezone && JSON.stringify(old.recurrenceRule)===JSON.stringify(timing.recurrenceRule) ? old.nextRunAt : nextScheduleOccurrence(timing.startsAt,timing.timezone,timing.recurrenceRule,new Date(Math.max(Date.parse(now),Date.parse(timing.startsAt)-1)).toISOString());
    if(!next) throw new MarketingError("past_schedule","Başlangıç için ileri bir tarih seçin.");
    if(old) db.prepare(`UPDATE marketing_schedules SET name=?,timezone=?,starts_at=?,starts_local=?,schedule_type=?,recurrence_json=?,missed_run_policy=?,next_run_at=?,target_revision=?,content_revision=?,revision=revision+1,updated_at=? WHERE id=?`)
      .run(name,timing.timezone,timing.startsAt,input.startsLocal,input.scheduleType,timing.recurrenceRule?JSON.stringify(timing.recurrenceRule):null,input.missedRunPolicy,next,targetRevision??null,contentRevision??null,now,id);
    else db.prepare(`INSERT INTO marketing_schedules(id,business_id,name,target_type,target_id,channel,target_revision,content_revision,schedule_type,timezone,starts_at,starts_local,recurrence_json,status,missed_run_policy,next_run_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?)`)
      .run(id,business(db),name,input.targetType,targetId,input.channel,targetRevision??null,contentRevision??null,input.scheduleType,timing.timezone,timing.startsAt,input.startsLocal,timing.recurrenceRule?JSON.stringify(timing.recurrenceRule):null,input.missedRunPolicy,next,now,now);
    return marketingScheduleDetail(db,id);
  });
}
export function transitionMarketingSchedule(db: DatabaseSync,id: string,revision: number,action: "pause"|"resume"|"cancel",now: string) {
  return transaction(db,()=>{
    const s=getMarketingSchedule(db,id); if(s.revision!==revision)stale();
    if(!["pause","resume","cancel"].includes(action) || !["active","paused"].includes(s.status) || action==="pause"&&s.status!=="active" || action==="resume"&&s.status!=="paused") throw new MarketingError("invalid_transition","Plan durumu bu işlem için uygun değil.");
    // Keep the earliest unconsumed instant on resume so the durable claim applies missed-run policy.
    const next=action==="cancel"?"":s.nextRunAt || nextScheduleOccurrence(s.startsAt,s.timezone,s.recurrenceRule,s.lastRunAt||new Date(Date.parse(s.startsAt)-1).toISOString());
    db.prepare("UPDATE marketing_schedules SET status=?,next_run_at=?,revision=revision+1,updated_at=? WHERE id=?").run(action==="pause"?"paused":action==="resume"?"active":"cancelled",next,now,id);
    if(action==="cancel") db.prepare("UPDATE marketing_schedule_executions SET status='skipped',last_error='schedule_cancelled',completed_at=? WHERE schedule_id=? AND status='pending'").run(now,id);
    return marketingScheduleDetail(db,id);
  });
}
/** Only startup after the previous runtime has ended; no time-based reclaim of live actions. */
export function recoverMarketingScheduleExecutions(db: DatabaseSync) {
  return db.prepare("UPDATE marketing_schedule_executions SET status='pending',claimed_at='' WHERE status='claimed' AND schedule_id IN (SELECT id FROM marketing_schedules WHERE business_id=?)").run(business(db)).changes;
}
export function claimMarketingScheduleExecution(db: DatabaseSync,now: string,graceMs: number): {schedule: MarketingSchedule;execution: MarketingScheduleExecution}|null {
  return transaction(db,()=>{
    const pending=db.prepare(`SELECT e.id,e.schedule_id FROM marketing_schedule_executions e JOIN marketing_schedules s ON s.id=e.schedule_id WHERE s.business_id=? AND s.status='active' AND e.status='pending' AND e.claimed_at<=? ORDER BY e.planned_at LIMIT 1`).get(business(db),new Date(Date.parse(now)-15000).toISOString());
    if(pending) {
      db.prepare("UPDATE marketing_schedule_executions SET status='claimed',claimed_at=? WHERE id=? AND status='pending'").run(now,String(pending.id));
      return {schedule:getMarketingSchedule(db,String(pending.schedule_id)),execution:getMarketingScheduleExecution(db,String(pending.id))};
    }
    const row=db.prepare(`SELECT * FROM marketing_schedules s WHERE business_id=? AND status='active' AND next_run_at!='' AND next_run_at<=? AND NOT EXISTS(SELECT 1 FROM marketing_schedule_executions e WHERE e.schedule_id=s.id AND e.status IN ('pending','claimed')) ORDER BY next_run_at LIMIT 1`).get(business(db),now);
    if(!row)return null;
    const s=scheduleRow(row),planned=s.nextRunAt,id=`execution_${randomUUID()}`,key=`${s.id}:${planned}`;
    const skipped=s.missedRunPolicy==="skip" && Date.parse(now)-Date.parse(planned)>graceMs;
    const inserted=db.prepare(`INSERT INTO marketing_schedule_executions(id,schedule_id,occurrence_key,planned_at,claimed_at,completed_at,status,last_error,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(schedule_id,occurrence_key) DO NOTHING`)
      .run(id,s.id,key,planned,skipped?"":now,skipped?now:"",skipped?"skipped":"claimed",skipped?"missed_run":"",now).changes;
    // Collapse ALL missed occurrences, then seek strictly beyond both wall clock and claimed instant.
    const next=nextScheduleOccurrence(s.startsAt,s.timezone,s.recurrenceRule,new Date(Math.max(Date.parse(now),Date.parse(planned))).toISOString());
    db.prepare("UPDATE marketing_schedules SET next_run_at=?,last_run_at=?,updated_at=? WHERE id=?").run(next,planned,now,s.id);
    if(!inserted) {if(!next)db.prepare("UPDATE marketing_schedules SET status='completed',revision=revision+1 WHERE id=? AND status='active'").run(s.id);return null;}
    if(skipped && !next)db.prepare("UPDATE marketing_schedules SET status='completed',revision=revision+1 WHERE id=? AND status='active'").run(s.id);
    return {schedule:s,execution:getMarketingScheduleExecution(db,id)};
  });
}
export function finishMarketingScheduleExecution(db: DatabaseSync,id: string,status: "succeeded"|"skipped"|"failed"|"pending",now: string,error: string="") {
  return transaction(db,()=>{
    const e=getMarketingScheduleExecution(db,id);
    if(e.status!=="claimed")return e;
    db.prepare("UPDATE marketing_schedule_executions SET status=?,completed_at=?,last_error=? WHERE id=? AND status='claimed'").run(status,status==="pending"?"":now,/^[a-z0-9_-]{0,64}$/.test(error)?error:"operation_failed",id);
    if(status!=="pending") {
      const s=getMarketingSchedule(db,e.scheduleId);
      if(s.scheduleType==="recurring" && s.nextRunAt && Date.parse(s.nextRunAt)<=Date.parse(now)) {
        const next=nextScheduleOccurrence(s.startsAt,s.timezone,s.recurrenceRule,now);
        db.prepare("UPDATE marketing_schedules SET next_run_at=?,updated_at=? WHERE id=? AND status='active'").run(next,now,s.id);
      }
      db.prepare("UPDATE marketing_schedules SET status='completed',revision=revision+1,updated_at=? WHERE id=? AND status IN ('active','paused') AND next_run_at=''").run(now,e.scheduleId);
    }
    return getMarketingScheduleExecution(db,id);
  });
}
