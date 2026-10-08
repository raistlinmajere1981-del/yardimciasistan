import { useEffect, useState } from "react";
import type { BusinessMessageTemplate, MarketingChannelRegistry, MarketingShareInput, MessagingTemplateBinding } from "@yardimci-asistan/shared";
import { SearchSelect } from "../ui/SearchSelect";
import { ActionButton } from "../ui/ActionButton";
import { channelNames, resultValue } from "./share-draft";

export function MarketingChannelDetails({draft, onChange, channels, onAi}: {draft: MarketingShareInput; onChange: (d: MarketingShareInput) => void; channels: MarketingChannelRegistry; onAi: (channel: "website" | "instagram" | "sms") => void}) {
  const [templates, setTemplates] = useState<BusinessMessageTemplate[]>([]), [error, setError] = useState("");
  const hasWhatsappChannel = channels.some((channel) => channel.id === "whatsapp");
  useEffect(() => {let live = true; if(hasWhatsappChannel) void window.yardimciDesktop!.listBusinessMessagingTemplates().then(r => {if(live) setTemplates(resultValue(r));}).catch((e: unknown) => {if(live) setError(e instanceof Error ? e.message : "Şablonlar alınamadı.");}); return () => {live = false;};}, [hasWhatsappChannel]);
  const w = draft.options.whatsapp;
  const selected = templates.find(t => t.name === w.templateName && t.language === w.templateLanguage);
  const patchWhatsapp = (patch: Partial<typeof w>) => onChange({...draft, options: {...draft.options, whatsapp: {...w, ...patch}}});
  const setBinding = (ci: number, pi: number, binding: MessagingTemplateBinding) => patchWhatsapp({bindings: w.bindings.map((g,i) => g.map((b,j) => i === ci && j === pi ? binding : b))});
  return <section className="form-stack" aria-label="Kanal ayrıntıları"><p>Ortak metin tüm kanallarda kullanılır. Gerektiğinde kanala özel bir metin yazabilirsiniz.</p>
    {channels.map(channel => channel.id === "whatsapp" ? <section className="marketing-section form-stack" key={channel.id} aria-label="WhatsApp gönderim ayrıntıları"><h3>WhatsApp Business</h3>
      <p>WhatsApp gönderimi onaylı şablonla yapılır. Ortak paylaşım metni şablonun yerini almaz.</p>
      <label className="form-field form-field--fluid">Onaylı WhatsApp şablonu<SearchSelect ariaLabel="Onaylı WhatsApp şablonu" value={selected ? `${selected.name}:${selected.language}` : ""} placeholder="Şablon ve dil seçin"
        options={templates.filter(t => t.supported && t.status === "APPROVED").map(t => ({id: `${t.name}:${t.language}`, label: t.name, description: t.language}))}
        onChange={id => {const t = templates.find(t => `${t.name}:${t.language}` === id); patchWhatsapp({templateName: t?.name || "", templateLanguage: t?.language || "", bindings: t?.components.map(c => c.parameters.map(() => ({type: "static_text", value: ""}))) || []});}}/></label>
      <p className="muted">{selected?.components.map(c => c.text).join("\n") || "Şablon içeriği seçiminizden sonra burada görünür."}</p>
      {selected?.components.map((c, ci) => c.parameters.map((parameter, pi) => {const b = w.bindings[ci]?.[pi]; return <div className="marketing-binding" key={`${ci}:${pi}`}>
        <label className="form-field form-field--fluid">{`${c.type === "header" ? "Başlık" : "Mesaj"} ${parameter} kaynağı`}<select aria-label={`${c.type === "header" ? "Başlık" : "Mesaj"} ${parameter} kaynağı`} value={b?.type === "customer_field" ? b.field : "static_text"} onChange={e => setBinding(ci, pi, e.target.value === "static_text" ? {type: "static_text", value: ""} : {type: "customer_field", field: e.target.value as "customer.fullName" | "commercial.companyName"})}><option value="static_text">Yazdığım metin</option><option value="customer.fullName">Müşterinin adı</option><option value="commercial.companyName">Ticari unvan</option></select></label>
        <label className="form-field form-field--fluid">{`${parameter} metni`}<input value={b?.type === "static_text" ? b.value : ""} disabled={b?.type !== "static_text"} maxLength={2000} placeholder={b?.type === "customer_field" ? "Gönderimde müşteriden alınır" : "Parametre metni"} onChange={e => setBinding(ci, pi, {type: "static_text", value: e.target.value})}/></label>
      </div>;}))}
      <p role="status">{error || (!templates.length ? "Onaylı şablon bulunamadı." : "Şablon ve parametreler gönderim öncesinde yeniden kontrol edilir.")}</p>
    </section> : <section className="marketing-section form-stack" key={channel.id} aria-label={`${channelNames[channel.id]} ayrıntıları`}>
      <div className="marketing-actions"><h3>{channelNames[channel.id]}</h3><ActionButton variant="quiet" onClick={() => onAi(channel.id as "website" | "instagram" | "sms")}>AI ile uyarla</ActionButton></div>
      {channel.id !== "sms" && <label className="form-field form-field--fluid">{`${channelNames[channel.id]} başlığı`}<input maxLength={240} value={draft.content.variants.find(v => v.channel === channel.id)?.title || ""} placeholder="Boş bırakırsanız ortak başlık kullanılır." onChange={e => onChange({...draft, content: {...draft.content, variants: draft.content.variants.map(v => v.channel === channel.id ? {...v, title: e.target.value} : v)}})}/></label>}
      <label className="form-field form-field--fluid">{`${channelNames[channel.id]} metni`}<textarea rows={4} maxLength={channel.id === "sms" ? 160 : channel.id === "instagram" ? 2200 : 12000} value={draft.content.variants.find(v => v.channel === channel.id)?.text || ""} placeholder="Boş bırakırsanız ortak paylaşım metni kullanılır." onChange={e => onChange({...draft, content: {...draft.content, variants: draft.content.variants.map(v => v.channel === channel.id ? {...v, text: e.target.value, metadata: {version: 1, adaptation: "manual"}} : v)}})}/></label>
      <small>{channel.id === "sms" ? "En fazla 160 karakter · yalnız düz metin · SMS’e görsel eklenmez." : channel.id === "instagram" ? "En fazla 2200 karakter · seçili ilk görsel kullanılır. Instagram yayını sonradan düzenlenemez veya kaldırılamaz." : "Sitede seçtiğiniz görseller sırayla gösterilir."}</small>
    </section>)}
  </section>;
}
