import { useEffect, useId, useState, type KeyboardEvent } from "react";
import type { BusinessMessageTemplate, MarketingChannel, MarketingChannelRegistry, MarketingShareInput, MessagingTemplateBinding } from "@yardimci-asistan/shared";
import { SearchSelect } from "../ui/SearchSelect";
import { ActionButton } from "../ui/ActionButton";
import { channelNames, resultValue } from "./share-draft";

export function MarketingChannelDetails({draft, onChange, channels, onAi, aiAvailable}: {
  draft: MarketingShareInput; onChange: (d: MarketingShareInput) => void; channels: MarketingChannelRegistry;
  aiAvailable: boolean; onAi: (channel: "website" | "instagram" | "sms") => void;
}) {
  const tabId = useId();
  const [active, setActive] = useState<MarketingChannel>(channels[0]?.id ?? "website");
  const channel = channels.find(c => c.id === active) ?? channels[0];
  const [templates, setTemplates] = useState<BusinessMessageTemplate[]>([]), [error, setError] = useState("");
  const hasWhatsappChannel = channels.some(c => c.id === "whatsapp");
  useEffect(() => {
    let live = true;
    if(hasWhatsappChannel) void window.yardimciDesktop!.listBusinessMessagingTemplates()
      .then(r => {if(live) setTemplates(resultValue(r));})
      .catch((e: unknown) => {if(live) setError(e instanceof Error ? e.message : "Şablonlar alınamadı.");});
    return () => {live = false;};
  }, [hasWhatsappChannel]);

  const w = draft.options.whatsapp;
  const selected = templates.find(t => t.name === w.templateName && t.language === w.templateLanguage);
  const patchWhatsapp = (patch: Partial<typeof w>) => onChange({...draft, options: {...draft.options, whatsapp: {...w, ...patch}}});
  const setBinding = (ci: number, pi: number, binding: MessagingTemplateBinding) => patchWhatsapp({
    bindings: w.bindings.map((group, i) => group.map((value, j) => i === ci && j === pi ? binding : value))
  });
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: MarketingChannel) {
    const from = channels.findIndex(c => c.id === current);
    const to = event.key === "Home" ? 0 : event.key === "End" ? channels.length - 1
      : event.key === "ArrowRight" ? (from + 1) % channels.length
      : event.key === "ArrowLeft" ? (from - 1 + channels.length) % channels.length : -1;
    if(to < 0) return;
    const next = channels[to];
    if(!next) return;
    event.preventDefault();
    setActive(next.id);
    document.getElementById(tabId + "-tab-" + next.id)?.focus({preventScroll: true});
  }
  const variant = channel && draft.content.variants.find(v => v.channel === channel.id);
  const updateVariant = (patch: {title?: string; text?: string}) => {
    if(!channel || channel.id === "whatsapp") return;
    onChange({...draft, content: {...draft.content, variants: draft.content.variants.map(v => v.channel === channel.id
      ? {...v, ...patch, metadata: {...v.metadata, version: 1 as const, adaptation: "manual" as const}} : v)}});
  };

  return <section className="marketing-channel-details" aria-label="Kanal ayrıntıları">
    <p className="muted marketing-channel-intro">Kanala özel değişiklikler yalnız bu kanalda kullanılır. Boş alanlarda ortak içerik geçerlidir.</p>
    {channels.length > 1 && <div className="marketing-channel-tabs" role="tablist" aria-label="Düzenlenecek kanal">
      {channels.map(c => <button type="button" role="tab" id={tabId + "-tab-" + c.id} key={c.id}
        aria-selected={channel?.id === c.id} aria-controls={tabId + "-panel"} tabIndex={channel?.id === c.id ? 0 : -1}
        onClick={() => setActive(c.id)} onKeyDown={event => onTabKeyDown(event, c.id)}>
        {channelNames[c.id]}
      </button>)}
    </div>}
    {channel && <section className="marketing-channel-editor form-stack" role="tabpanel" id={tabId + "-panel"}
      aria-labelledby={channels.length > 1 ? tabId + "-tab-" + channel.id : undefined}
      aria-label={channelNames[channel.id] + " ayrıntıları"} key={channel.id}>
      <header className="marketing-channel-editor-header">
        <div><h3>{channelNames[channel.id]}</h3><small>{channel.id === "whatsapp" ? "Onaylı mesaj şablonu" : "Kanala özel metin ve başlık"}</small></div>
        {channel.id !== "whatsapp" && <ActionButton variant="secondary" disabled={!aiAvailable}
          onClick={() => onAi(channel.id as "website" | "instagram" | "sms")}>AI ile uyarla</ActionButton>}
      </header>
      {channel.id === "whatsapp" ? <>
        <p className="muted">WhatsApp gönderimi onaylı şablonla yapılır; ortak paylaşım metni şablon yerine geçmez.</p>
        <label className="form-field form-field--fluid">Onaylı WhatsApp şablonu
          <SearchSelect ariaLabel="Onaylı WhatsApp şablonu" value={selected ? selected.name + ":" + selected.language : ""}
            placeholder="Şablon ve dil seçin"
            options={templates.filter(t => t.supported && t.status === "APPROVED").map(t => ({id: t.name + ":" + t.language, label: t.name, description: t.language}))}
            onChange={id => {
              const template = templates.find(t => t.name + ":" + t.language === id);
              patchWhatsapp({templateName: template?.name || "", templateLanguage: template?.language || "",
                bindings: template?.components.map(c => c.parameters.map(() => ({type: "static_text", value: ""}))) || []});
            }}/>
        </label>
        <p className="muted marketing-channel-template">{selected?.components.map(c => c.text).join("\n") || "Şablon içeriği seçiminizden sonra burada görünür."}</p>
        {selected?.components.map((c, ci) => c.parameters.map((parameter, pi) => {
          const binding = w.bindings[ci]?.[pi], heading = c.type === "header" ? "Başlık" : "Mesaj";
          return <div className="marketing-binding" key={ci + ":" + pi}>
            <label className="form-field form-field--fluid">{heading + " " + parameter + " kaynağı"}
              <select aria-label={heading + " " + parameter + " kaynağı"}
                value={binding?.type === "customer_field" ? binding.field : "static_text"}
                onChange={e => setBinding(ci, pi, e.target.value === "static_text"
                  ? {type: "static_text", value: ""} : {type: "customer_field", field: e.target.value as "customer.fullName" | "commercial.companyName"})}>
                <option value="static_text">Yazdığım metin</option>
                <option value="customer.fullName">Müşterinin adı</option>
                <option value="commercial.companyName">Ticari unvan</option>
              </select>
            </label>
            <label className="form-field form-field--fluid">{parameter + " metni"}
              <input value={binding?.type === "static_text" ? binding.value : ""} disabled={binding?.type !== "static_text"} maxLength={2000}
                placeholder={binding?.type === "customer_field" ? "Gönderimde müşteriden alınır" : "Parametre metni"}
                onChange={e => setBinding(ci, pi, {type: "static_text", value: e.target.value})}/>
            </label>
          </div>;
        }))}
        <p role="status">{error || (!templates.length ? "Onaylı şablon bulunamadı." : "Şablon ve parametreler gönderim öncesinde yeniden kontrol edilir.")}</p>
      </> : <>
        {channel.id !== "sms" && <label className="form-field form-field--fluid">{channelNames[channel.id] + " başlığı"}
          <input maxLength={240} value={variant?.title || ""} placeholder="Boş bırakırsanız ortak başlık kullanılır."
            onChange={e => updateVariant({title: e.target.value})}/>
        </label>}
        <label className="form-field form-field--fluid">{channelNames[channel.id] + " metni"}
          <textarea rows={6} maxLength={channel.id === "sms" ? 160 : channel.id === "instagram" ? 2200 : 12000}
            value={variant?.text || ""} placeholder="Boş bırakırsanız ortak paylaşım metni kullanılır."
            onChange={e => updateVariant({text: e.target.value})}/>
        </label>
        <small className="marketing-channel-helper">
          {channel.id === "sms"
            ? (variant?.text.length || 0) + "/160 karakter · yalnız düz metin · SMS’e görsel eklenmez."
            : channel.id === "instagram"
            ? "En fazla 2200 karakter · ilk görsel kullanılır. Instagram yayını sonradan düzenlenemez veya kaldırılamaz."
            : "Web sitesinde seçilen görseller belirlediğiniz sırayla gösterilir."}
        </small>
      </>}
    </section>}
    {!channel && <p>Önce paylaşım kanalı seçin.</p>}
  </section>;
}
