import type { InstagramPublicationService } from "./instagram-publication-service";
import { BUSINESS_CAPABILITIES as C, hasBusinessCapability, type MarketingContentInput, type MarketingPublicationInput, type MarketingAiInput } from "@yardimci-asistan/shared";
import { getSyncCapabilities } from "@yardimci-asistan/sync-core";
import type { DesktopDatabase } from "../database";
import { getWebSyncConfig } from "../sync-config";
import { desktopLog } from "../desktop-logger";
import { createMarketingChannelRegistry } from "./channel-registry";
import { MarketingAiService } from "./ai-service";
import type { MarketingMediaService } from "./media-service";
import { MarketingError } from "./validation";
export class MarketingStudioService {
  private readonly ai:MarketingAiService;
  constructor(private readonly database:()=>DesktopDatabase,private readonly media:MarketingMediaService,private readonly scheduleSync:()=>void, private readonly instagram?: InstagramPublicationService) {this.ai=new MarketingAiService(database);}
  private gate() {
    if (!hasBusinessCapability(this.database().getEnabledBusinessCapabilities(),C.MARKETING_STUDIO)) throw new MarketingError("capability_disabled","Pazarlama bu işletmede etkin değil.");
  }
  private websiteGate() {
    this.gate();const channel=createMarketingChannelRegistry(this.database()).find(c=>c.id==="website")!;
    if (!channel.enabled || !channel.configured) throw new MarketingError("channel_unconfigured","Website servisi yapılandırılmamış.");
  }
  channels() {this.gate();return createMarketingChannelRegistry(this.database());}
  snapshot() {this.gate();return {contents:this.database().listMarketingContents(),assets:this.media.list(),publications:this.database().listMarketingPublications(),campaigns:hasBusinessCapability(this.database().getEnabledBusinessCapabilities(),C.MESSAGING_CAMPAIGNS)&&hasBusinessCapability(this.database().getEnabledBusinessCapabilities(),C.CUSTOMERS)?this.database().listMessagingCampaigns().map(c=>this.database().getMessagingCampaignDetail(c.id)):[],channels:createMarketingChannelRegistry(this.database()),aiCapabilities:this.ai.capabilities()};}
  saveContent(input:MarketingContentInput) {
    this.gate();const value=this.database().saveMarketingContent(input,input.source==="ai"?"ai":"manual");
    if (!input.id) desktopLog.info({scope:"marketing",event:"marketing.content.created",message:"Pazarlama içeriği oluşturuldu.",meta:{contentId:value.content.id}});
    return value;
  }
  upload() {this.gate();return this.media.upload();}
  manageAsset(id:string,action:"archive"|"delete",altText?:string) {this.gate();this.media.manage(id,action,altText);}
  async generate(input:MarketingAiInput) {
    this.gate();const output=await this.ai.generate(input);this.gate();
    if (output.image) return {asset:this.media.generated(output.image)};
    desktopLog.info({scope:"marketing",event:"marketing.content.ai_generated",message:"Pazarlama AI taslağı hazırlandı.",meta:{capability:input.capability,channel:input.channel??"master"}});
    return {text:output.text};
  }
  savePublication(input:MarketingPublicationInput) {
    this.gate();if(input.id && input.channel === "website") this.websiteGate();
    const value=this.database().saveMarketingPublication(input);
    if(!input.id) desktopLog.info({scope:"marketing",event:"marketing.publication.created",message:"Yayın taslağı oluşturuldu.",meta:{publicationId:value.id,channel:value.channel}});
    if(value.channel === "website" && value.desiredPublished) this.scheduleSync();return value;
  }
  publish(id:string,revision:number) {this.gate();if(this.database().getMarketingPublication(id).channel === "instagram") {if(!this.instagram)throw new MarketingError("channel_unavailable","Instagram yapılandırılmamış.");return this.instagram.publish(id,revision);}this.websiteGate();const value=this.database().requestMarketingPublication(id,revision,true);desktopLog.info({scope:"marketing",event:"marketing.publish.started",message:"Website yayın niyeti kaydedildi.",operationId:id,meta:{channel:"website"}});this.scheduleSync();return value;}
  /** Record Website's existing durable publication intent and sync job in the execution transaction. */
  publishScheduledWebsite(executionId: string) {
    this.websiteGate(); const value=this.database().prepareScheduledPublication(executionId);
    this.scheduleSync(); return value;
  }
  unpublish(id:string,revision:number) {this.gate();if(this.database().getMarketingPublication(id).channel === "instagram") throw new MarketingError("channel_unavailable","Instagram yayınını kaldırma desteklenmiyor.");this.websiteGate();const value=this.database().requestMarketingPublication(id,revision,false);this.scheduleSync();return value;}
  async testWebsite() {
    this.websiteGate();const result=await getSyncCapabilities(getWebSyncConfig(this.database().getSetupData()));
    const connected=result.ok && result.features.includes("marketing_website_publications");
    desktopLog.info({scope:"marketing",event:"marketing.channel.connection_test",message:"Website pazarlama bağlantısı denendi.",meta:{channel:"website",connected}});
    return {connected,message:connected?"Website pazarlama yayını için hazır.":"Web bağlantısını ve web modülü sürümünü kontrol edin."};
  }
}
