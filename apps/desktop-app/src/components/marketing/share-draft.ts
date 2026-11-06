import { MARKETING_CHANNELS, type MarketingContentDetail, type MarketingContentInput, type MarketingShareInput, type MarketingShareOptions } from "@yardimci-asistan/shared";

export const channelNames = {website: "Web sitesi", instagram: "Instagram", whatsapp: "WhatsApp Business", sms: "SMS"};
/** Management label only. Never insert a synthetic title into the published content. */
export function marketingDisplayTitle(title: string, text: string, imageCount: number): string {
  return title.trim() || text.trim().slice(0, 80) || (imageCount ? "Görsel paylaşımı" : "Başlıksız taslak");
}
export function newShare(channels: MarketingShareOptions["channels"] = []): MarketingShareInput {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const later = new Date(Date.now() + 3600000);
  const local = new Date(later.getTime() - later.getTimezoneOffset() * 60000).toISOString().slice(0,16);
  return {content: {title: "", purpose: "announcement", masterText: "", status: "draft", source: "manual", mediaAssetIds: [],
    variants: MARKETING_CHANNELS.map(channel => ({channel, title: "", text: "", metadata: {version: 1, adaptation: "manual"}}))},
    options: {channels, audienceId: "", whatsapp: {templateName: "", templateLanguage: "", bindings: []}, timing: "now", startsLocal: local, timezone}};
}
export function contentDraft(detail: MarketingContentDetail): MarketingContentInput {
  return {id: detail.content.id, expectedRevision: detail.content.revision, title: detail.content.title, purpose: detail.content.purpose,
    masterText: detail.content.masterText, status: detail.content.status, source: detail.content.source,
    variants: MARKETING_CHANNELS.map(channel => {const v = detail.variants.find(v => v.channel === channel);
      return {channel, title: v?.title || "", text: v?.text || "", metadata: v?.metadata || {version: 1, adaptation: "manual"}, ...(v?.mediaAssetId ? { mediaAssetId: v.mediaAssetId } : {})};}),
    mediaAssetIds: detail.media.map(m => m.mediaAssetId)};
}
export function resultValue<T>(result: {ok: true; value: T} | {ok: false; message: string}): T {
  if (!result.ok) throw new Error(result.message);
  return result.value;
}
