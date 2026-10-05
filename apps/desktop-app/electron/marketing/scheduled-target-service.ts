import type { MarketingSchedule, MarketingScheduleExecution } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "../database";
import type { MessagingCampaignService } from "../messaging-campaigns/service";
import type { MarketingStudioService } from "./service";
import type { InstagramPublicationService } from "./instagram-publication-service";
import { createMarketingChannelRegistry } from "./channel-registry";
export type MarketingScheduledTargetResult = {status: "succeeded"|"skipped"|"failed"|"pending"; category?: string};
/** Application boundary between neutral time claims and existing canonical operations. */
export class MarketingScheduledTargetService {
  constructor(private readonly database:()=>DesktopDatabase,private readonly campaigns:MessagingCampaignService,
    private readonly studio:MarketingStudioService,private readonly instagram:InstagramPublicationService) {}
  async execute(schedule:MarketingSchedule,execution:MarketingScheduleExecution):Promise<MarketingScheduledTargetResult> {
    const db=this.database(),channel=createMarketingChannelRegistry(db).find(c=>c.id===schedule.channel);
    if(schedule.targetType==="audience_campaign") {
      // Atomic D3 transition + execution reference proves accepted start, including a crash after commit.
      if(execution.resultReference===schedule.targetId)return {status:"succeeded"};
      const c=db.getMessagingCampaign(schedule.targetId);
      if(c.status!=="prepared")return {status:"skipped",category:c.status==="cancelled"?"target_cancelled":c.status==="paused"?"target_paused":"target_not_prepared"};
      if(!channel?.enabled || !channel.configured)return {status:"failed",category:"channel_unconfigured"};
      try { await this.campaigns.startCampaign(c.id,false,execution.id);return {status:"succeeded"}; }
      catch(error) {
        const current=db.getMessagingCampaign(c.id);
        if(current.status==="cancelled" || current.status==="paused")return {status:"skipped",category:current.status==="cancelled"?"target_cancelled":"target_paused"};
        throw error;
      }
    }
    if(execution.resultReference) {
      const accepted=db.getMarketingPublication(execution.resultReference);
      if(schedule.channel==="website") {
        if(channel?.enabled && channel.configured)this.studio.publishScheduledWebsite(execution.id);
        return {status:"succeeded"};
      }
      if(accepted.status==="published")return {status:"succeeded"};
      if(accepted.status==="failed")return {status:"failed",category:accepted.providerSummary?.failureCode??"publication_failed"};
    }
    if(!channel?.enabled || !channel.configured)return {status:"failed",category:"channel_unconfigured"};
    if(schedule.channel==="website") {
      this.studio.publishScheduledWebsite(execution.id); return {status:"succeeded"};
    }
    const p=db.prepareScheduledPublication(execution.id),state=db.getInstagramPublicationState(p.id);
    if(p.status==="published")return {status:"succeeded"};
    // D5 owns rejection/unknown-response recovery. No automatic provider-level retry.
    if(p.status==="failed")return {status:"failed",category:state?.failureCode??"publication_failed"};
    const saved=await this.instagram.publish(p.id,p.revision);
    return saved.status==="published"?{status:"succeeded"}:saved.status==="failed"?{status:"failed",category:saved.providerSummary?.failureCode??"publication_failed"}:{status:"pending"};
  }
}
