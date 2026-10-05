import type { DatabaseSync } from "node:sqlite";
import type { MarketingPublicationInput } from "@yardimci-asistan/shared";
import { marketingTransaction as transaction } from "./marketing-persistence";
import { getMarketingSchedule, getMarketingScheduleExecution } from "./schedule-store";
import { getMarketingPublication, requestMarketingPublication, saveMarketingPublication } from "./store";
import { transitionCampaignDispatch } from "../messaging-campaigns/dispatch-store";
import { MarketingError } from "./validation";
/** Atomic canonical intent + execution linkage. Target services still own all remote effects. */
export function prepareScheduledPublication(db: DatabaseSync,executionId: string) {
  return transaction(db,()=>{
    const e=getMarketingScheduleExecution(db,executionId),s=getMarketingSchedule(db,e.scheduleId);
    if(s.targetType!=="public_publication" || e.status!=="claimed") throw new MarketingError("invalid_target","Plan yayın çalışması uygun değil.");
    if(e.resultReference) return getMarketingPublication(db,e.resultReference);
    const r=db.prepare("SELECT snapshot_json FROM marketing_publication_revisions WHERE publication_id=? AND revision=?").get(s.targetId,s.targetRevision!);
    if(!r) throw new MarketingError("revision_unavailable","Planlanan yayın sürümü bulunamadı.");
    const input=JSON.parse(String(r.snapshot_json)) as MarketingPublicationInput;
    if(s.channel==="website") {const current=getMarketingPublication(db,s.targetId); input.id=current.id;input.expectedRevision=current.revision;}
    // Instagram occurrences are explicit new canonical publication intents, each attached once.
    let p=saveMarketingPublication(db,input,input.mediaAssetIds);
    if(s.channel==="website")p=requestMarketingPublication(db,p.id,p.revision,true);
    db.prepare("UPDATE marketing_schedule_executions SET result_reference=?,action_revision=? WHERE id=? AND status='claimed'").run(p.id,p.revision,e.id);
    return p;
  });
}
export function transitionScheduledCampaignDispatch(db: DatabaseSync,campaignId: string,executionId: string) {
  // D3 owns BEGIN/COMMIT. Attach acceptance within its transaction, never nest BEGIN.
  return transitionCampaignDispatch(db,campaignId,"start",()=>{
    const e=getMarketingScheduleExecution(db,executionId),s=getMarketingSchedule(db,e.scheduleId);
    if(e.status!=="claimed" || s.targetType!=="audience_campaign" || s.targetId!==campaignId) throw new MarketingError("invalid_target","Plan kampanya çalışması uygun değil.");
    db.prepare("UPDATE marketing_schedule_executions SET result_reference=? WHERE id=? AND status='claimed'").run(campaignId,e.id);
  });
}
