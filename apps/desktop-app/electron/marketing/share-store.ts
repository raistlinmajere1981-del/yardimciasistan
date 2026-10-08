import type { DatabaseSync } from "node:sqlite";
import { MARKETING_CHANNELS } from "@yardimci-asistan/shared";
import type { MarketingShareDetail, MarketingShareInput, MarketingShareOptions, MarketingShareTarget, MarketingPublicationInput, MessagingCampaignInput } from "@yardimci-asistan/shared";
import { getMarketingContent, saveMarketingContent, saveMarketingPublication } from "./store";
import { createMessagingCampaign } from "../messaging-campaigns/store";
import { marketingTransaction } from "./marketing-persistence";
import { MarketingError, marketingChannel, marketingId, marketingText } from "./validation";

export function emptyShareOptions(): MarketingShareOptions {
  return { channels: [], audienceId: "", whatsapp: {templateName: "", templateLanguage: "", bindings: []}, timing: "now", startsLocal: "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
}
function options(value: MarketingShareOptions): MarketingShareOptions {
  if (!value || !Array.isArray(value.channels) || value.channels.length > 4 || new Set(value.channels).size !== value.channels.length || !["now", "scheduled"].includes(value.timing))
    throw new MarketingError("invalid_input", "Paylaşım seçeneklerini kontrol edin.");
  const w = value.whatsapp;
  if (!w || !Array.isArray(w.bindings) || w.bindings.length > 10 || w.bindings.some(g => !Array.isArray(g) || g.length > 30)) throw new MarketingError("invalid_input", "WhatsApp ayrıntılarını kontrol edin.");
  const bindings = w.bindings.map(g => g.map(b => {
    if (b?.type === "static_text") return {type: "static_text" as const, value: marketingText(b.value, 2000)};
    if (b?.type === "customer_field" && ["customer.fullName", "commercial.companyName"].includes(b.field)) return {type: "customer_field" as const, field: b.field};
    throw new MarketingError("invalid_input", "WhatsApp parametresi geçersiz.");
  }));
  return { channels: value.channels.map(marketingChannel), audienceId: value.audienceId ? marketingId(value.audienceId) : "",
    whatsapp: {templateName: marketingText(w.templateName, 512), templateLanguage: marketingText(w.templateLanguage, 40), bindings},
    timing: value.timing, startsLocal: marketingText(value.startsLocal, 16), timezone: marketingText(value.timezone, 100, true) };
}
export function getMarketingShare(db: DatabaseSync, id: string): MarketingShareDetail {
  const content = getMarketingContent(db, id);
  const row = db.prepare("SELECT options_json FROM marketing_shares WHERE content_id=?").get(id);
  const targets = db.prepare("SELECT channel,target_type,target_id FROM marketing_share_targets WHERE content_id=? ORDER BY channel").all(id)
    .map(r => ({channel: r.channel, targetType: r.target_type, targetId: r.target_id}) as MarketingShareTarget);
  return {content, options: row ? options(JSON.parse(String(row.options_json))) : emptyShareOptions(), targets};
}
export function listMarketingShares(db: DatabaseSync) {
  return db.prepare("SELECT content_id FROM marketing_shares").all().map(r => {
    const share = getMarketingShare(db, String(r.content_id));
    return {contentId: share.content.content.id, channels: share.options.channels, submitted: share.targets.length > 0};
  });
}
export function saveMarketingShare(db: DatabaseSync, input: MarketingShareInput): MarketingShareDetail {
  return marketingTransaction(db, () => {
    if (input.content.id && getMarketingShare(db, input.content.id).targets.length) throw new MarketingError("share_submitted", "Bu paylaşım işleme alındı. Yeni paylaşım oluşturun; web içeriğini yayındaki içerikler alanından düzenleyin.");
    const selected = options(input.options);
    const variants = MARKETING_CHANNELS.map(channel => input.content.variants.find(v => v.channel === channel) ?? {channel, text: "", title: "", metadata: {version: 1 as const, adaptation: "manual" as const}});
    const editorial = {...input.content, variants: variants.map(v => {
      if (v.channel !== "instagram") return v;
      const mediaAssetId = input.content.mediaAssetIds[0];
      return { ...v, ...(mediaAssetId !== undefined ? { mediaAssetId } : {}) };
    })};
    const content = saveMarketingContent(db, editorial, input.content.source === "ai" ? "ai" : "manual");
    db.prepare("INSERT INTO marketing_shares VALUES(?,?) ON CONFLICT(content_id) DO UPDATE SET options_json=excluded.options_json").run(content.content.id, JSON.stringify(selected));
    return getMarketingShare(db, content.content.id);
  });
}
/** Link every target in the same transaction as creation, before provider I/O or scheduler wakes. */
export function prepareMarketingShareTargets(db: DatabaseSync, id: string, revision: number, targets: Array<MarketingPublicationInput | MessagingCampaignInput>): MarketingShareDetail {
  return marketingTransaction(db, () => {
    const share = getMarketingShare(db, id);
    if (share.content.content.revision !== revision) throw new MarketingError("stale_revision", "Kayıt değişti. Güncel kaydı açıp tekrar deneyin.");
    if (share.targets.length) return share;
    const sms = targets.find((input): input is MessagingCampaignInput => !("placement" in input) && input.channel === "sms");
    if (sms && !share.content.variants.find(v => v.channel === "sms")?.text.trim()) db.prepare("UPDATE marketing_content_variants SET text=? WHERE content_id=? AND channel='sms'").run(sms.text!, id);
    db.prepare("UPDATE marketing_contents SET status='ready',revision=revision+1,updated_at=? WHERE id=?").run(new Date().toISOString(), id);
    const preparedRevision = getMarketingContent(db, id).content.revision;
    for (const input of targets) {
      const publication = "placement" in input;
      const target = publication ? saveMarketingPublication(db, input) : createMessagingCampaign(db, {...input, contentRevision: preparedRevision});
      db.prepare("INSERT INTO marketing_share_targets VALUES(?,?,?,?)").run(id, input.channel, publication ? "public_publication" : "audience_campaign", target.id);
    }
    return getMarketingShare(db, id);
  });
}
