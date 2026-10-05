import { BUSINESS_CAPABILITIES as C, hasBusinessCapability, type MarketingChannelRegistry, type MarketingChannelDefinition } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "../database";
import { getWebSyncConfig } from "../sync-config";
function instagramStagingConfigured(web: { baseUrl: string; syncSecret: string }) {
  if (!web.syncSecret || !web.baseUrl) return false;
  try { const url = new URL(web.baseUrl); return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash; }
  catch { return false; }
}
export function createMarketingChannelRegistry(db: DesktopDatabase): MarketingChannelRegistry {
  const studio=hasBusinessCapability(db.getEnabledBusinessCapabilities(),C.MARKETING_STUDIO);
  const audience=hasBusinessCapability(db.getEnabledBusinessCapabilities(),C.MESSAGING_CAMPAIGNS)&&hasBusinessCapability(db.getEnabledBusinessCapabilities(),C.CUSTOMERS);
  const web=getWebSyncConfig(db.getSetupData()),cloud=db.getMessagingConfiguration(),sms=db.getSmsConfiguration(),instagram=db.getInstagramConfiguration();
  const define=(channel:Omit<MarketingChannelDefinition,"state"|"connectionTestAvailable">):MarketingChannelDefinition=>({...channel,connectionTestAvailable:channel.supportsConnectionTest,state:!channel.enabled?"disabled":channel.configured?"ready":"unconfigured"});
  return [
    define({id:"website",displayName:"Website",family:"public_publishing",providerId:"website",enabled:studio,configured:Boolean(web.baseUrl&&web.syncSecret),supportsText:true,supportsImages:true,maxImages:20,requiresAudience:false,requiresConsent:false,supportsDirectPublish:true,supportsUnpublish:true,supportsEditPublished:true,supportsConnectionTest:true}),
    define({id:"whatsapp",displayName:"WhatsApp Business",family:"audience_delivery",providerId:"whatsapp_cloud",enabled:studio&&audience&&cloud.enabled,configured:cloud.configured,supportsText:true,supportsImages:false,maxImages:0,requiresAudience:true,requiresConsent:true,supportsDirectPublish:false,supportsUnpublish:false,supportsEditPublished:false,supportsConnectionTest:true}),
    define({id:"sms",displayName:"SMS",family:"audience_delivery",providerId:"iletimerkezi",enabled:studio&&audience&&sms.enabled,configured:sms.configured,supportsText:true,supportsImages:false,maxImages:0,requiresAudience:true,requiresConsent:true,supportsDirectPublish:false,supportsUnpublish:false,supportsEditPublished:false,supportsConnectionTest:true}),
    define({id:"instagram",displayName:"Instagram",family:"public_publishing",providerId:"instagram_api",enabled:studio&&instagram.enabled,configured:instagram.configured&&instagramStagingConfigured(web),supportsText:true,supportsImages:true,maxImages:1,requiresAudience:false,requiresConsent:false,supportsDirectPublish:true,supportsUnpublish:false,supportsEditPublished:false,supportsConnectionTest:true})
  ];
}
