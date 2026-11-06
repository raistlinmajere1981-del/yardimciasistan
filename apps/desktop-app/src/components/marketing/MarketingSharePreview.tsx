import { useEffect, useState } from "react";
import type { BusinessMessageTemplate, MarketingShareInput, MarketingStudioSnapshot, MessagingAudienceCounts } from "@yardimci-asistan/shared";
import { Panel } from "../ui/Panel";
import { channelNames, resultValue } from "./share-draft";

/** Read projection only: provider validation and sending remain with the share service. */
export function MarketingSharePreview({draft, snapshot, publication = false}: {draft: MarketingShareInput; snapshot: MarketingStudioSnapshot; publication?: boolean}) {
  const [templates, setTemplates] = useState<BusinessMessageTemplate[]>([]);
  const [counts, setCounts] = useState<Partial<Record<"sms" | "whatsapp", MessagingAudienceCounts>>>({});
  const [error, setError] = useState("");
  const {audienceId, channels} = draft.options;
  useEffect(() => {
    let live = true;
    if (channels.includes("whatsapp")) void window.yardimciDesktop!.listBusinessMessagingTemplates().then(r => {if(live) setTemplates(resultValue(r));}).catch(e => {if(live) setError(e instanceof Error ? e.message : "Şablon alınamadı.");});
    if(audienceId) for(const channel of channels) if(channel === "sms" || channel === "whatsapp") {
      void window.yardimciDesktop!.previewMessagingSegment(audienceId, channel).then(r => {if(live) setCounts(previous => ({...previous, [channel]: resultValue(r)}));}).catch(e => {if(live) setError(e instanceof Error ? e.message : "Alıcılar kontrol edilemedi.");});
    }
    return () => {live = false;};
  }, [audienceId, channels]);
  const w = draft.options.whatsapp, template = templates.find(t => t.name === w.templateName && t.language === w.templateLanguage && t.supported && t.status === "APPROVED");
  return <section className="form-stack" aria-label="Canlı kanal önizlemesi">
    <p className="muted">Önizleme gönderim yapmaz. Kanal koşulları ve alıcı izinleri gönderim sırasında yeniden kontrol edilir.</p>
    {error && <p role="status">{error}</p>}
    <div className="marketing-preview-grid">{channels.map(channel => {
      const variant = publication ? undefined : draft.content.variants.find(v => v.channel === channel);
      const text = variant?.text.trim() || draft.content.masterText;
      const ids = channel === "website" ? draft.content.mediaAssetIds : channel === "instagram" ? [variant?.mediaAssetId || draft.content.mediaAssetIds[0]].filter((id): id is string => Boolean(id)) : [];
      return <Panel as="article" key={channel} className="marketing-channel-preview form-stack" aria-label={`${channelNames[channel]} önizlemesi`}>
        <h3>{channelNames[channel]}</h3>
        {(variant?.title || draft.content.title) && <strong>{variant?.title || draft.content.title}</strong>}
        {channel === "instagram" && <div className="marketing-preview-gallery">{ids.map(id => {const asset = snapshot.assets.find(a => a.id === id); return asset && <img key={id} src={asset.previewUrl} alt={asset.altText || "Instagram görseli"}/>;})}{!ids.length && <p>Instagram için bir görsel seçin.</p>}</div>}
        {channel === "whatsapp" ? <><small>Onaylı şablon: {w.templateName || "Henüz seçilmedi"} · {w.templateLanguage}</small><p>{template ? template.components.map((component, ci) => component.text.replace(/\{\{(\d+)\}\}/g, (placeholder, number: string) => {
          const binding = w.bindings[ci]?.[Number(number) - 1];
          return binding?.type === "static_text" ? binding.value || placeholder : binding?.type === "customer_field" ? binding.field === "customer.fullName" ? "[Müşterinin adı]" : "[Ticari unvan]" : placeholder;
        })).join("\n") : "Desteklenen onaylı şablon seçilmeden gönderim hazırlanamaz."}</p></> : (text || channel === "sms") && <p>{text || "SMS için metin gerekli."}</p>}
        {channel === "website" && <div className="marketing-preview-gallery">{ids.map((id, index) => {const asset = snapshot.assets.find(a => a.id === id); return asset && <img key={id} src={asset.previewUrl} alt={asset.altText || `Web görseli ${index + 1}`}/>;})}</div>}
        {channel === "sms" && <small>{text.length}/160 karakter · Yalnız düz metin{ text.length > 160 ? " · Metni kısaltın" : ""}</small>}
        {(channel === "sms" || channel === "whatsapp") && <small>{counts[channel] ? `${counts[channel].eligibleCount} uygun / ${counts[channel].matchedCount} alıcı · İzni bilinmeyen: ${counts[channel].unknownConsentCount} · İzin vermeyen: ${counts[channel].optedOutCount} · Geçersiz telefon: ${counts[channel].missingRecipientCount}` : audienceId ? "Alıcı uygunluğu kontrol ediliyor…" : "Hedef kitle seçilmedi."}</small>}
      </Panel>;
    })}</div>
    {!channels.length && <p>Önizleme için bir kanal seçin.</p>}
  </section>;
}
