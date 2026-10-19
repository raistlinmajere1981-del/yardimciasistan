import type { MarketingPublication, MarketingWebsiteProjection } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "../database";
import type { MarketingMediaService } from "./media-service";
import { uploadPublicResourceMediaFile } from "../public-resource-media-publication";
import { desktopLog } from "../desktop-logger";
import { BUSINESS_CAPABILITIES, hasBusinessCapability } from "@yardimci-asistan/shared";

export class MarketingWebsitePublicationService {
  constructor(private readonly database:()=>DesktopDatabase,private readonly media:MarketingMediaService) {}
  async prepare(config:{baseUrl:string;syncSecret:string},clientId:string): Promise<{ok:true;projection:MarketingWebsiteProjection;sent:MarketingPublication[]} | {ok:false;message:string;status?:number;sent?:MarketingPublication[]}> {
    const db=this.database();
    if (!hasBusinessCapability(db.getEnabledBusinessCapabilities(), BUSINESS_CAPABILITIES.MARKETING_STUDIO)) {
      return {ok:true,sent:[],projection:{version:1,enabled:false,publications:[]}};
    }
    const sent=db.listMarketingPublications().filter(p=>p.channel==="website" && p.status!=="draft");
    const assets=new Map(sent.filter(p=>p.desiredPublished).flatMap(p=>p.mediaAssetIds).map(id=>[id,db.getMediaAsset(id)]));
    const urls=new Map<string,string>();
    for (const asset of assets.values()) {
      let result;
      try { result=await uploadPublicResourceMediaFile(config,clientId,"/api/marketing-media.php","business_id",this.media.absolutePath(asset),
        {id:asset.id,resourceId:asset.businessId,kind:"image",mimeType:asset.mimeType,originalName:`${asset.id}.png`,contentHash:asset.contentHash},
        {success:"Görsel yüklendi.",httpFailure:()=>"Website görseli yüklenemedi.",connectionFailure:"Website medya bağlantısı kurulamadı.",readFailure:"Görsel dosyası okunamadı.",fallbackFileName:"image.png"}); }
      catch { return {ok:false,message:"Website görseli okunamadı.",sent}; }
      if (!result.ok) return {...result,sent};
      // Never trust a provider/server-supplied URL: publish only deterministic module-owned paths.
      const base=new URL(config.baseUrl).pathname.replace(/\/$/,"");
      const expected=`${base}/media/marketing/${asset.businessId}/${asset.id}.${asset.contentHash}.png`;
      if (result.url!==expected) return {ok:false,message:"Website medya yolu doğrulanamadı.",sent};
      urls.set(asset.id,expected);
    }
    return {ok:true,sent,projection:{version:1,enabled:true,
      localization:db.translations().localization(sent.filter(p=>p.desiredPublished).map(p=>({kind:"marketing",id:p.id,fields:{title:p.title,text:p.text}}))),publications:sent.map(p=>({
      id:p.id,channel:"website",placement:p.placement,revision:p.revision,published:p.desiredPublished,title:p.title,text:p.text,
      images:p.desiredPublished?p.mediaAssetIds.map((id,sortOrder)=>{const asset=assets.get(id)!;return {assetId:id,url:urls.get(id)!,altText:asset.altText,width:asset.width,height:asset.height,sortOrder};}):[]
    }))}};
  }
  acknowledge(sent:MarketingPublication[],timestamp:string,operationId?:string) {
    this.database().acknowledgeMarketingPublications(sent,timestamp);
    for (const p of sent.filter(p=>p.desiredPublished)) desktopLog.info({scope:"marketing",event:"marketing.publish.succeeded",message:"Website yayını doğrulandı.",operationId:p.id,meta:{channel:"website",revision:p.revision}});
    for (const p of sent) desktopLog.info({scope:"marketing",event:!p.desiredPublished?"marketing.publication.unpublished":p.publishedRevision?"marketing.publication.updated":"marketing.publication.published",
      message:"Website yayın revision onayı alındı.",...(operationId !== undefined ? {operationId} : {}),meta:{publicationId:p.id,channel:p.channel,revision:p.revision,imageCount:p.mediaAssetIds.length}});
  }
  fail(sent:MarketingPublication[]) { this.database().failMarketingPublications(sent);for(const p of sent)desktopLog.error({scope:"marketing",event:"marketing.publish.failed",message:"Website yayın eşitlemesi tamamlanamadı.",operationId:p.id,meta:{channel:"website"}}); }
}
