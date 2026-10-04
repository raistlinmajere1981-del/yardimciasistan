import { BUSINESS_CAPABILITIES as C, hasBusinessCapability, type MarketingChannelRegistry } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "../database";
import { getWebSyncConfig } from "../sync-config";
export function createMarketingChannelRegistry(db: DesktopDatabase): MarketingChannelRegistry {
  const enabled=hasBusinessCapability(db.getEnabledBusinessCapabilities(),C.MARKETING_STUDIO);
  const web=getWebSyncConfig(db.getSetupData()), cloud=db.getMessagingConfiguration();
  const websiteConfigured=Boolean(web.baseUrl && web.syncSecret);
  const whatsappConfigured=cloud.configured;
  return [
    {id:"website",displayName:"Website",enabled,configured:websiteConfigured,supportsText:true,supportsImages:true,maxImages:20,
      supportsDirectPublish:true,supportsUnpublish:true,supportsEditPublished:true,connectionTestAvailable:true,state:!enabled?"disabled":websiteConfigured?"ready":"unconfigured"},
    {id:"whatsapp",displayName:"WhatsApp",enabled:cloud.enabled,configured:whatsappConfigured,supportsText:true,supportsImages:false,maxImages:0,
      supportsDirectPublish:false,supportsUnpublish:false,supportsEditPublished:false,connectionTestAvailable:true,state:whatsappConfigured?"planned":"unconfigured"},
    {id:"sms",displayName:"SMS",enabled:false,configured:false,supportsText:true,supportsImages:false,maxImages:0,
      supportsDirectPublish:false,supportsUnpublish:false,supportsEditPublished:false,connectionTestAvailable:false,state:"planned"},
    {id:"instagram",displayName:"Instagram",enabled:false,configured:false,supportsText:true,supportsImages:false,maxImages:0,
      supportsDirectPublish:false,supportsUnpublish:false,supportsEditPublished:false,connectionTestAvailable:false,state:"planned"}
  ];
}
