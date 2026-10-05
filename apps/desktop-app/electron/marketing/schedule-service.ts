import { BUSINESS_CAPABILITIES as C, hasBusinessCapability, type MarketingScheduleInput } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "../database";
import { desktopLog } from "../desktop-logger";
import { MarketingError } from "./validation";
import { nextScheduleOccurrence } from "./schedule-recurrence";
import { createMarketingChannelRegistry } from "./channel-registry";
export class MarketingScheduleService {
  constructor(private readonly database:()=>DesktopDatabase,private readonly changed:()=>void=()=>{},private readonly now:()=>Date=()=>new Date()) {}
  private gate() { if(!hasBusinessCapability(this.database().getEnabledBusinessCapabilities(),C.MARKETING_STUDIO)) throw new MarketingError("capability_disabled","Pazarlama bu işletmede etkin değil."); }
  snapshot(month?: string) {
    this.gate(); const schedules=this.database().listMarketingSchedules(), defaultTimezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
    const selected=month ?? this.now().toISOString().slice(0,7);
    if(!/^(20\d{2}|21\d{2})-(0[1-9]|1[0-2])$/.test(selected))throw new MarketingError("invalid_schedule","Takvim ayı geçersiz.");
    const from=Date.parse(`${selected}-01T00:00:00Z`)-2*86400000, until=new Date(`${selected}-01T00:00:00Z`);until.setUTCMonth(until.getUTCMonth()+1);
    const occurrences:Array<{scheduleId:string;plannedAt:string}>=[];
    for(const {schedule:s} of schedules) {
      if(!["active","paused"].includes(s.status) || !s.nextRunAt)continue;
      let next=Date.parse(s.nextRunAt)>=from?s.nextRunAt:nextScheduleOccurrence(s.startsAt,s.timezone,s.recurrenceRule,new Date(Math.max(from,Date.parse(s.nextRunAt)-1)).toISOString());
      for(let i=0;next && Date.parse(next)<until.getTime()+2*86400000 && i<40;i++) {
        occurrences.push({scheduleId:s.id,plannedAt:next});next=nextScheduleOccurrence(s.startsAt,s.timezone,s.recurrenceRule,next);
      }
    }
    return {schedules,defaultTimezone,occurrences};
  }
  save(input:MarketingScheduleInput) {
    this.gate();const c=createMarketingChannelRegistry(this.database()).find(c=>c.id===input?.channel);
    if(!c?.enabled || !c.supportsScheduling || input.scheduleType==="recurring"&&!c.supportsRecurringScheduling) throw new MarketingError("channel_unavailable","Bu kanal plan türünü desteklemiyor veya kapalı.");
    const result=this.database().saveMarketingSchedule(input,this.now().toISOString());
    desktopLog.info({scope:"marketing.schedule",event:input.id?"marketing.schedule.updated":"marketing.schedule.created",message:"Pazarlama planı kaydedildi.",operationId:result.schedule.id,meta:{channel:result.schedule.channel,targetType:result.schedule.targetType,targetRevision:result.schedule.targetRevision??0}});
    this.changed();return result;
  }
  transition(id:string,revision:number,action:"pause"|"resume"|"cancel") {
    this.gate();const result=this.database().transitionMarketingSchedule(id,revision,action,this.now().toISOString());
    desktopLog.info({scope:"marketing.schedule",event:`marketing.schedule.${action==="pause"?"paused":action==="resume"?"resumed":"cancelled"}`,message:"Pazarlama planı durumu kaydedildi.",operationId:id,meta:{channel:result.schedule.channel}});
    if(action==="cancel")for(const e of result.executions.filter(e=>e.status==="skipped"&&e.lastError==="schedule_cancelled"))desktopLog.info({scope:"marketing.schedule",event:"marketing.schedule.execution.skipped",message:"Gelecek plan çalışması iptal edildi.",operationId:e.id,meta:{scheduleId:id,category:"schedule_cancelled"}});
    this.changed();return result;
  }
}
