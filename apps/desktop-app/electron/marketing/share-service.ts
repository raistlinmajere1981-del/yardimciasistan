import type { BusinessMessageTemplate, MarketingShareInput, MarketingShareOutcome, MarketingPublicationInput, MessagingCampaignInput } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "../database";
import type { MessagingCampaignService } from "../messaging-campaigns/service";
import { validateCampaignInput, validateCampaignTemplate, MessagingCampaignError } from "../messaging-campaigns/validation";
import { desktopLog } from "../desktop-logger";
import type { MarketingStudioService } from "./service";
import type { MarketingScheduleService } from "./schedule-service";
import { resolveScheduleLocal, scheduleTimezone } from "./schedule-recurrence";
import { MarketingError } from "./validation";

/** Explicit share coordination. Canonical services retain publication, delivery and scheduling. */
export class MarketingShareService {
  private readonly active = new Set<string>();
  constructor(private readonly database: () => DesktopDatabase, private readonly studio: MarketingStudioService,
    private readonly campaigns: MessagingCampaignService, private readonly schedules: MarketingScheduleService,
    private readonly templates: () => Promise<BusinessMessageTemplate[]>) {}
  get(id: string) { this.studio.channels(); return this.database().getMarketingShare(id); }
  save(input: MarketingShareInput) {
    this.studio.channels(); const share = this.database().saveMarketingShare(input);
    if (!input.content.id) desktopLog.info({scope: "marketing.share", event: "marketing.share.draft.created", message: "Paylaşım taslağı oluşturuldu.", operationId: share.content.content.id});
    return share;
  }
  async submit(id: string, revision: number): Promise<MarketingShareOutcome[]> {
    if (this.active.has(id)) throw new MarketingError("operation_busy", "Paylaşım işleme alınıyor.");
    this.active.add(id);
    try {
      let share = this.get(id);
      if (share.content.content.revision !== revision) throw new MarketingError("stale_revision", "Kayıt değişti. Güncel kaydı açıp tekrar deneyin.");
      const {options, content} = share;
      if (!options.channels.length) throw new MarketingError("missing_channel", "En az bir aktif kanal seçin.");
      for (const channel of options.channels) if (!share.targets.length && !this.studio.channels().some(c => c.id === channel && c.enabled && c.configured))
        throw new MarketingError("channel_unconfigured", "Seçilen kanallardan biri artık kullanılamıyor.");
      if (options.timing === "scheduled") {
        const start = resolveScheduleLocal(options.startsLocal, scheduleTimezone(options.timezone));
        if (!share.targets.length && Date.parse(start) <= Date.now()) throw new MarketingError("invalid_schedule", "Gelecekte bir yayın zamanı seçin.");
      }
      if (!share.targets.length) {
        const targets: Array<MarketingPublicationInput | MessagingCampaignInput> = [];
        const catalog = options.channels.includes("whatsapp") ? await this.templates() : [];
        for (const channel of options.channels) {
          const variant = content.variants.find(v => v.channel === channel);
          const text = variant?.text.trim() || content.content.masterText;
          if (channel === "website" || channel === "instagram") {
            if (!text.trim()) throw new MarketingError("missing_text", "Paylaşım metnini yazın.");
            targets.push({contentId: id, channel, placement: "homepage_feature", title: variant?.title || content.content.title, text,
              mediaAssetIds: channel === "instagram" ? [variant?.mediaAssetId || content.media[0]?.mediaAssetId].filter((v): v is string => Boolean(v)) : content.media.map(m => m.mediaAssetId)});
          } else {
            const campaign: MessagingCampaignInput = {name: content.content.title.slice(0,120), purpose: "marketing", channel,
              providerId: channel === "sms" ? "iletimerkezi" : "whatsapp_cloud", contentId: id, contentRevision: revision,
              segmentId: options.audienceId, templateName: channel === "whatsapp" ? options.whatsapp.templateName : "",
              templateLanguage: channel === "whatsapp" ? options.whatsapp.templateLanguage : "", bindings: channel === "whatsapp" ? options.whatsapp.bindings : [],
              ...(channel === "sms" ? {text} : {})};
            validateCampaignInput(campaign);
            if (channel === "whatsapp") {
              const template = catalog.find(t => t.name === campaign.templateName && t.language === campaign.templateLanguage);
              if (!template) throw new MarketingError("missing_template", "WhatsApp için onaylı bir şablon seçin.");
              validateCampaignTemplate(campaign, template);
            }
            this.campaigns.previewSegment(options.audienceId, channel);
            targets.push(campaign);
          }
        }
        for (const channel of options.channels) if (!this.studio.channels().some(c => c.id === channel && c.enabled && c.configured)) throw new MarketingError("channel_unconfigured", "Kanal artık kullanılamıyor.");
        share = this.database().prepareMarketingShareTargets(id, revision, targets);
        desktopLog.info({scope: "marketing.share", event: "marketing.share.targets.prepared", message: "Paylaşım hedefleri kaydedildi.", operationId: id, meta: {channels: options.channels, timing: options.timing}});
      }
      // Preparation does not send. Finish all audience preparation before starting any channel.
      const preparationErrors = new Map<string, unknown>();
      for (const target of share.targets) if (target.targetType === "audience_campaign") {
        try {
          if (!this.studio.channels().some(c => c.id === target.channel && c.enabled && c.configured)) throw new MarketingError("channel_unconfigured", "Kanal şu anda kullanılamıyor. Aynı gönderim kaydı korunuyor.");
          if (this.campaigns.getCampaign(target.targetId).campaign.status === "draft") await this.campaigns.prepareCampaign(target.targetId);
        } catch (error) { preparationErrors.set(target.targetId, error); }
      }
      const outcomes: MarketingShareOutcome[] = [];
      for (const target of share.targets) {
        try {
          if (!this.studio.channels().some(c => c.id === target.channel && c.enabled && c.configured)) throw new MarketingError("channel_unconfigured", "Kanal şu anda kullanılamıyor. Aynı paylaşım kaydı korunuyor.");
          if (preparationErrors.has(target.targetId)) throw preparationErrors.get(target.targetId);
          if (options.timing === "scheduled") {
            const existing = this.database().listMarketingSchedules().find(d => d.schedule.targetId === target.targetId);
            const plan = existing ?? this.schedules.save({name: content.content.title, targetType: target.targetType, targetId: target.targetId, channel: target.channel,
              ...(target.targetType === "public_publication" ? { expectedTargetRevision: this.database().getMarketingPublication(target.targetId).revision } : {}),
              scheduleType: "once", timezone: options.timezone, startsLocal: options.startsLocal, missedRunPolicy: "run_once_when_resumed"});
            if (plan.schedule.status !== "active") throw new MarketingError("schedule_stopped", plan.schedule.status === "completed" ? "Plan tamamlandı. Çalışma sonucunu ana Takvim’de inceleyin." : "Plan duraklatılmış veya iptal edilmiş. Ana Takvim’deki planı inceleyin.");
            outcomes.push({...target, state: "scheduled", scheduleId: plan.schedule.id, message: "Plan ana Takvim’e kaydedildi."});
          } else if (target.targetType === "public_publication") {
            let publication = this.database().getMarketingPublication(target.targetId);
            if (publication.channel === "website" && !publication.desiredPublished && publication.status !== "draft") throw new MarketingError("publication_stopped", "Yayın kaldırılmış veya kaldırma işlemi başlatılmış. Web içerikleri yönetiminden inceleyin.");
            if (publication.status !== "published" && (publication.channel === "instagram" || !publication.desiredPublished)) publication = await this.studio.publish(publication.id, publication.revision);
            outcomes.push({...target, state: publication.status === "failed" ? "failed" : "accepted", message: publication.status === "failed" ? "Yayın sonucu kontrol edilmeli; aynı kayıt korunuyor." : publication.status === "published" ? "Yayında." : "Yayın onayı bekleniyor."});
          } else {
            const campaign = this.campaigns.getCampaign(target.targetId).campaign;
            if (campaign.status === "prepared") await this.campaigns.startCampaign(campaign.id);
            if (["paused", "cancelled"].includes(campaign.status)) throw new MarketingError("campaign_stopped", "Gönderim durdurulmuş. Gönderim ayrıntılarını açın.");
            outcomes.push({...target, state: "accepted", message: "Gönderim işleme alındı; teslim durumu ayrıca izlenir."});
          }
        } catch (error) {
          desktopLog.warn({scope: "marketing.share", event: "marketing.share.channel.failed", message: "Paylaşım kanalı tamamlanamadı.", operationId: id, error,
            meta: {channel: target.channel, targetId: target.targetId}});
          outcomes.push({...target, state: "failed", message: error instanceof MarketingError || error instanceof MessagingCampaignError ? error.message : "Kanal işlemi tamamlanamadı. Aynı kayıt üzerinden yeniden deneyin."});
        }
      }
      return outcomes;
    } finally { this.active.delete(id); }
  }
}
