import type { BusinessMessageTemplate, BusinessMessagingProviderId, MessagingCampaignInput, MessagingChannel,
  SaveMessagingPreferenceInput, SaveMessagingSegmentInput } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "../database";
import { desktopLog } from "../desktop-logger";
import { invalid, validateCampaignTemplate } from "./validation";

/** Read-only provider metadata seam. Deliberately has no send/claim method. */
export interface CampaignTemplateCatalog {
  assertAvailable(channel: MessagingChannel, providerId: BusinessMessagingProviderId): void;
  listTemplates(providerId: BusinessMessagingProviderId): Promise<BusinessMessageTemplate[]>;
}
export class MessagingCampaignService {
  constructor(private readonly getDatabase: () => DesktopDatabase, private readonly catalog: CampaignTemplateCatalog, private readonly onChanged: () => void = () => {}) {}
  private log(event: string, meta: Record<string, string | number>, operationId?: string) {
    desktopLog.info({ scope: "messaging", event: `messaging.${event}`, message: "Pazarlama niyeti işlemi kaydedildi.", operationId, meta });
  }
  getPreference(customerId: string, channel: MessagingChannel, purpose: "marketing") { return this.getDatabase().getCustomerMessagingPreference(customerId, channel, purpose); }
  savePreference(input: SaveMessagingPreferenceInput) {
    const value = this.getDatabase().saveCustomerMessagingPreference(input);
    this.log("consent.updated", { channel: value.channel, purpose: value.purpose, status: value.status }); this.onChanged(); return value;
  }
  listSegments() { return this.getDatabase().listMessagingSegments(); }
  saveSegment(input: SaveMessagingSegmentInput) { return this.getDatabase().saveMessagingSegment(input); }
  previewSegment(id: string, channel: MessagingChannel) {
    const value = this.getDatabase().previewMessagingSegment(id, channel);
    this.log("segment.preview", { segmentId: id, ...value }); return value;
  }
  listCampaigns() { return this.getDatabase().listMessagingCampaigns(); }
  createCampaign(input: MessagingCampaignInput) {
    // Drafts may be authored while a provider is unconfigured. Approval is re-read on prepare.
    const value = this.getDatabase().createMessagingCampaign(input);
    this.log("campaign.created", { campaignId: value.id, channel: value.channel }, value.id); return value;
  }
  getCampaign(id: string) { return this.getDatabase().getMessagingCampaignDetail(id); }
  previewCampaign(id: string) {
    const value = this.getDatabase().previewMessagingCampaign(id);
    const campaign = this.getCampaign(id).campaign;
    this.log("segment.preview", { segmentId: campaign.segmentId, campaignId: id, ...value }, id); return value;
  }
  async prepareCampaign(id: string) {
    const db = this.getDatabase(), value = db.getMessagingCampaign(id);
    if (value.status === "prepared") return db.getMessagingCampaignDetail(id); // Durable replay, even offline.
    if (value.status !== "draft") invalid("not_draft", "Yalnız taslak kampanya hazırlanabilir.");
    if (!value.providerId) invalid("missing_provider", "Hazırlamak için sağlayıcı seçin.");
    this.catalog.assertAvailable(value.channel, value.providerId);
    const template = (await this.catalog.listTemplates(value.providerId)).find((item) => item.name === value.templateName && item.language === value.templateLanguage);
    if (!template) invalid("missing_template", "Onaylı şablon artık kullanılamıyor.");
    validateCampaignTemplate(value, template);
    this.catalog.assertAvailable(value.channel, value.providerId);
    // After catalog I/O: backend re-reads campaign, segment, current contact and consent under one transaction.
    const detail = db.prepareMessagingCampaign(id, template);
    this.log("campaign.prepared", { campaignId: id, matchedCount: detail.matchedCount, eligibleCount: detail.eligibleCount, skippedCount: detail.skippedCount }, id);
    this.log("outbox.prepared", { campaignId: id, pendingCount: detail.pendingOutboxCount }, id);
    return detail;
  }
  async startCampaign(id: string, resume = false) {
    const value = this.getDatabase().getMessagingCampaign(id);
    if (!value.providerId) invalid("missing_provider", "Gönderim için sağlayıcı seçin.");
    this.catalog.assertAvailable(value.channel, value.providerId);
    const template = (await this.catalog.listTemplates(value.providerId)).find((item) => item.name === value.templateName && item.language === value.templateLanguage);
    if (!template) invalid("missing_template", "Onaylı şablon artık kullanılamıyor.");
    validateCampaignTemplate(value, template);
    this.catalog.assertAvailable(value.channel, value.providerId);
    const detail = this.getDatabase().transitionCampaignDispatch(id, resume ? "resume" : "start");
    this.log("dispatch.campaign.started", { campaignId: id }, id); this.onChanged(); return detail;
  }
  pauseCampaign(id: string) {
    const detail = this.getDatabase().transitionCampaignDispatch(id, "pause");
    this.log("dispatch.campaign.paused", { campaignId: id }, id); this.onChanged(); return detail;
  }
  cancelCampaign(id: string) {
    const detail = this.getDatabase().cancelMessagingCampaign(id);
    this.log("campaign.cancelled", { campaignId: id }, id); this.onChanged(); return detail;
  }
}
