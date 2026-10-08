import { createHash, randomBytes } from "node:crypto";
import { BUSINESS_CAPABILITIES as C, hasBusinessCapability, type InstagramConfigurationInput, type MarketingProviderConnectionResult, type MarketingPublication } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "../database";
import { decryptMessagingSecret } from "../business-messaging/secret-service";
import { getWebSyncConfig } from "../sync-config";
import { desktopLog } from "../desktop-logger";
import { InstagramPublishingProviderAdapter, type InstagramCredentials } from "./instagram-provider";
import { InstagramMediaStaging } from "./instagram-media-staging";
import { MarketingProviderError } from "./provider-http";
import { validateInstagramConfiguration } from "./provider-configuration-store";
import { MarketingError } from "./validation";
import type { MarketingMediaService } from "./media-service";
export class InstagramPublicationService {
  private readonly flights = new Map<string, Promise<MarketingPublication>>();
  private readonly staging: InstagramMediaStaging;
  constructor(private readonly database: () => DesktopDatabase, private readonly media: MarketingMediaService,
    private readonly options: { fetchImpl?: typeof fetch; timeoutMs?: number; allowed?: () => boolean } = {}) { this.staging = new InstagramMediaStaging(options); }
  getConfiguration() { return this.database().getInstagramConfiguration(); }
  private credentials(input?: InstagramConfigurationInput): InstagramCredentials {
    if (input) validateInstagramConfiguration(input);
    const config = input ?? this.getConfiguration(), stored = this.database().getStoredMarketingProvider("instagram_api");
    if (!config.enabled) throw new MarketingProviderError("unconfigured");
    return { accountId: config.accountId, accessToken: input?.clearAccessToken ? "" : input?.accessToken || decryptMessagingSecret(String(stored?.secret_one_encrypted ?? "")) };
  }
  async testConnection(input?: InstagramConfigurationInput): Promise<MarketingProviderConnectionResult> {
    let result: MarketingProviderConnectionResult;
    try { const credentials = this.credentials(input);
      const profile = await new InstagramPublishingProviderAdapter(credentials,this.options).testConnection();
      this.database().recordServiceSettingsVerification("instagram", { ...credentials });
      result = { ok:true, ...profile, testedAt:new Date().toISOString(), message:`Instagram @${profile.username} profesyonel hesabı doğrulandı.` }; }
    catch (error) { result = { ok:false, testedAt:new Date().toISOString(), message:error instanceof MarketingProviderError ? error.message : "Instagram ayarlarını kontrol edin." }; }
    desktopLog.info({ scope:"marketing", event:"marketing.channel.connection_test", message:"Instagram bağlantısı denendi.", meta:{channel:"instagram",connected:result.ok} });return result;
  }
  private gate(credentials: InstagramCredentials) {
    if (this.options.allowed && !this.options.allowed()) throw new MarketingError("session_locked","Oturum kilitli; yayın duraklatıldı.");
    if (!hasBusinessCapability(this.database().getEnabledBusinessCapabilities(),C.MARKETING_STUDIO)) throw new MarketingError("capability_disabled","Pazarlama etkin değil.");
    const current = this.credentials();
    if (current.accountId !== credentials.accountId || current.accessToken !== credentials.accessToken) throw new MarketingError("account_changed","Instagram servis ayarları değişmiş.");
  }
  private stagingGate(web: { baseUrl: string; syncSecret: string }, stageBaseUrl: string) {
    const current = getWebSyncConfig(this.database().getSetupData());
    if (web.baseUrl.replace(/\/$/, "") !== stageBaseUrl.replace(/\/$/, "") || current.baseUrl !== web.baseUrl || current.syncSecret !== web.syncSecret)
      throw new MarketingError("staging_changed", "Web Modülü ayarları değişmiş; yayın aktarımı durduruldu.");
  }
  publish(id:string,revision:number):Promise<MarketingPublication> {
    const flight=this.flights.get(id);if(flight)return flight;
    const next=this.run(id,revision).finally(()=>this.flights.delete(id));this.flights.set(id,next);return next;
  }
  async drain() { await Promise.allSettled(this.flights.values()); }
  private async cleanup(id:string) {
    const db=this.database(),state=db.getInstagramPublicationState(id);if(!state?.stageToken)return;
    const web=getWebSyncConfig(db.getSetupData());
    try {
      if (web.baseUrl.replace(/\/$/,"") !== state.stageBaseUrl.replace(/\/$/,"")) throw new MarketingProviderError("staging_unconfigured");
      await this.staging.cleanup(web,state.stageToken);db.clearInstagramStage(id);
      desktopLog.info({scope:"instagram",event:"instagram.media.cleaned",message:"Geçici Instagram medyası temizlendi.",operationId:id});
    } catch {
      // Durable token remains for an explicit retry; public reads stop at server-side expiration regardless.
      desktopLog.warn({scope:"instagram",event:"instagram.media.cleanup_failed",message:"Geçici medya temizliği tamamlanamadı; süre sonu koruması etkin.",operationId:id});
    }
  }
  private async run(id:string,revision:number):Promise<MarketingPublication> {
    const db=this.database(),credentials=this.credentials(),adapter=new InstagramPublishingProviderAdapter(credentials,this.options);
    this.gate(credentials);
    const original=db.getMarketingPublication(id);
    if(original.channel!=="instagram" || original.revision!==revision)throw new MarketingError("stale_revision","Güncel Instagram yayınını açın.");
    if(original.status==="published"){await this.cleanup(id);return db.getMarketingPublication(id);}
    const web=getWebSyncConfig(db.getSetupData());
    if(!web.baseUrl || !web.syncSecret || new URL(web.baseUrl).protocol!=="https:")throw new MarketingError("staging_unconfigured","Instagram görsel aktarımı için HTTPS Web Modülü yapılandırın.");
    const accountKey=createHash("sha256").update(credentials.accountId).digest("hex");
    let state=db.beginInstagramPublication(id,revision,accountKey,{token:randomBytes(32).toString("hex"),expiresAt:new Date(Date.now()+1190_000).toISOString(),baseUrl:web.baseUrl});
    let phase:"create"|"publish"|undefined;
    desktopLog.info({scope:"marketing",event:"marketing.publish.started",message:"Instagram yayın işlemi başladı.",operationId:id,meta:{channel:"instagram"}});
    try {
      if(!state.containerId) {
        if(state.createSubmitted)throw new MarketingProviderError("submission_uncertain");
        this.stagingGate(web,state.stageBaseUrl);
        const bytes=this.media.instagramJpeg(original.mediaAssetIds[0] ?? "");
        const url=await this.staging.upload({...web,baseUrl:state.stageBaseUrl},{token:state.stageToken,expiresAt:state.stageExpiresAt},bytes);
        desktopLog.info({scope:"instagram",event:"instagram.media.staged",message:"Instagram görsel aktarımı hazır.",operationId:id});
        await adapter.getAccountProfile();this.gate(credentials);this.stagingGate(web,state.stageBaseUrl);
        if(!db.claimInstagramSubmission(id,"create"))throw new MarketingProviderError("submission_uncertain");
        phase="create";
        const created=await adapter.createImageContainer({imageUrl:url,caption:original.text});
        db.recordInstagramContainer(id,created.containerId);phase=undefined;
        desktopLog.info({scope:"instagram",event:"instagram.container.created",message:"Instagram container kimliği kaydedildi.",operationId:id});
        state=db.getInstagramPublicationState(id)!;
      }
      const status=await adapter.getContainerStatus(state.containerId);this.gate(credentials);
      if(status.status==="PUBLISHED") {
        const saved=db.finishInstagramPublication(id,{});desktopLog.info({scope:"instagram",event:"instagram.publish.succeeded",message:"Instagram yayını container durumundan doğrulandı.",operationId:id});desktopLog.info({scope:"marketing",event:"marketing.publish.succeeded",message:"Instagram yayını doğrulandı.",operationId:id,meta:{channel:"instagram"}});await this.cleanup(id);return saved;
      }
      if(status.status==="ERROR" || status.status==="EXPIRED")throw new MarketingProviderError("container_failed");
      if(state.publishSubmitted)throw new MarketingProviderError("submission_uncertain");
      if(status.status!=="FINISHED")return db.getMarketingPublication(id); // Continue by explicit user status action, no scheduler.
      this.gate(credentials);
      this.stagingGate(web,state.stageBaseUrl);
      if(!db.claimInstagramSubmission(id,"publish"))throw new MarketingProviderError("submission_uncertain");
      phase="publish";
      const receipt=await adapter.publishContainer(state.containerId);
      let saved=db.finishInstagramPublication(id,{mediaId:receipt.providerMediaId});phase=undefined;
      // Receipt commits before optional permalink I/O and staging cleanup.
      try { const permalink=await adapter.getMediaPermalink(receipt.providerMediaId);saved=db.finishInstagramPublication(id,{mediaId:receipt.providerMediaId,permalink}); }catch{/* Optional provider metadata cannot downgrade a confirmed publication. */}
      desktopLog.info({scope:"instagram",event:"instagram.publish.succeeded",message:"Instagram yayını doğrulandı.",operationId:id});
      desktopLog.info({scope:"marketing",event:"marketing.publish.succeeded",message:"Instagram yayını tamamlandı.",operationId:id,meta:{channel:"instagram"}});
      await this.cleanup(id);return saved;
    } catch(error) {
      const provider=error instanceof MarketingProviderError?error:null;
      const code=phase && !provider?.rejected ? "submission_uncertain" : error instanceof MarketingError || provider ? (error as MarketingError|MarketingProviderError).code : "operation_failed";
      const saved=db.finishInstagramPublication(id,{failureCode:code,...(phase && provider?.rejected?{rejectedPhase:phase}:{})});
      desktopLog.error({scope:"instagram",event:"instagram.publish.failed",message:"Instagram yayını tamamlanamadı.",operationId:id,meta:{category:code}});
      desktopLog.error({scope:"marketing",event:"marketing.publish.failed",message:"Instagram yayını tamamlanamadı.",operationId:id,meta:{channel:"instagram",category:code}});
      if(code!=="submission_uncertain" && (!state.containerId || code==="container_failed"))await this.cleanup(id);
      return saved;
    }
  }
}
