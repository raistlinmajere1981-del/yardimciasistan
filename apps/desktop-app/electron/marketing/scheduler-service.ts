import { BUSINESS_CAPABILITIES as C, hasBusinessCapability } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "../database";
import { desktopLog } from "../desktop-logger";
import type { MarketingScheduledTargetService } from "./scheduled-target-service";
/** Durable nextRunAt is authority; timer is a bounded wake hint. No provider APIs/retries here. */
export class MarketingSchedulerService {
  private timer: ReturnType<typeof setTimeout>|null=null;
  private flight: Promise<void>|null=null;
  private active=false;
  private recovered=false;
  constructor(private readonly database:()=>DesktopDatabase,private readonly targets:Pick<MarketingScheduledTargetService,"execute">,
    private readonly options:{allowed:()=>boolean;onChanged?:()=>void;now?:()=>Date}) {}
  private now() {return (this.options.now??(()=>new Date()))();}
  start() {this.active=true;this.wake();}
  wake() {if(!this.active)return;if(this.timer)clearTimeout(this.timer);this.timer=setTimeout(()=>{this.timer=null;void this.runOnce().finally(()=>this.scheduleWake());},0);}
  private scheduleWake() {
    if(!this.active || this.timer)return;
    let delay=15000;
    try {const next=this.database().listMarketingSchedules().filter(d=>d.schedule.status==="active"&&d.schedule.nextRunAt).map(d=>Date.parse(d.schedule.nextRunAt));if(next.length)delay=Math.min(delay,Math.max(1000,Math.min(...next)-this.now().getTime()));} catch { /* Startup/setup can be incomplete; the bounded wake retries read-only discovery. */ }
    this.timer=setTimeout(()=>{this.timer=null;void this.runOnce().finally(()=>this.scheduleWake());},delay);
  }
  async suspendAndDrain() {this.active=false;if(this.timer)clearTimeout(this.timer);this.timer=null;await this.flight;}
  runOnce():Promise<void> {
    if(this.flight)return this.flight;
    this.flight=this.runBatch().finally(()=>{this.flight=null;});return this.flight;
  }
  private async runBatch() {
    if(!this.active || !this.options.allowed())return;
    let operationId:string|undefined;
    try {
      const db=this.database();
      if(!hasBusinessCapability(db.getEnabledBusinessCapabilities(),C.MARKETING_STUDIO))return;
      if(!this.recovered){db.recoverMarketingScheduleExecutions();this.recovered=true;}
      for(let count=0;count<8 && this.active && this.options.allowed();count++) {
        const claim=db.claimMarketingScheduleExecution(this.now().toISOString(),60000);if(!claim)break;
        const {schedule,execution}=claim;operationId=execution.id;
        if(execution.status==="skipped") {this.log("skipped",schedule.id,execution.id,"missed_run");this.options.onChanged?.();continue;}
        this.log("claimed",schedule.id,execution.id);
        let result;
        try {result=await this.targets.execute(schedule,execution);} catch {result={status:"failed" as const,category:"target_invocation_failed"};}
        db.finishMarketingScheduleExecution(execution.id,result.status,this.now().toISOString(),result.category);
        if(result.status!=="pending")this.log(result.status,schedule.id,execution.id,result.category);
        this.options.onChanged?.();
      }
    } catch {
      desktopLog.error({scope:"marketing.schedule",event:"marketing.schedule.execution.failed",message:"Pazarlama planları işlenemedi.",operationId,meta:{category:"scheduler_storage_failed"}});
    }
  }
  private log(status:string,scheduleId:string,operationId:string,category?:string) {
    desktopLog[status==="failed"?"error":"info"]({scope:"marketing.schedule",event:`marketing.schedule.execution.${status}`,message:status==="failed"?"Pazarlama planı çalışması başarısız.":"Pazarlama planı çalışması kaydedildi.",operationId,meta:{scheduleId,...(category?{category}:{})}});
  }
}
