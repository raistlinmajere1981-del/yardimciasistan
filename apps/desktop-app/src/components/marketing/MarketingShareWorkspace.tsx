import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Image, Send, Sparkles, Users } from "lucide-react";
import type { MarketingChannel, MarketingPublication, MarketingShareInput, MarketingShareDetail, MarketingShareOutcome, MarketingStudioSnapshot } from "@yardimci-asistan/shared";
import type { RegisterPageLeaveGuard } from "../../app/page-navigation-guard";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";
import { ActionButton } from "../ui/ActionButton";
import { DatePicker, TimePicker } from "../ui/DateTimePicker";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Panel } from "../ui/Panel";
import { StatusBadge } from "../ui/StatusBadge";
import { MarketingTextAssistant } from "./MarketingTextAssistant";
import { MarketingImages } from "./MarketingImages";
import { MarketingAudience } from "./MarketingAudience";
import { MarketingChannelDetails } from "./MarketingChannelDetails";
import { channelNames, contentDraft, newShare, resultValue } from "./share-draft";

type Step = "content" | "ai" | "images" | "audience" | "channels" | "preview" | "results";
const titles: Record<Step, string> = {content: "Yeni paylaşım oluştur", ai: "Metin asistanı", images: "Paylaşım görselleri", audience: "Hedef kitle", channels: "Kanal ayrıntıları", preview: "Paylaşım önizlemesi", results: "Paylaşım sonucu"};
export function MarketingShareWorkspace({snapshot, initial, publication, onClose, onReload, onMessage, registerPageLeaveGuard, onCalendar}: {
  snapshot: MarketingStudioSnapshot; initial?: MarketingShareDetail; publication?: MarketingPublication;
  onClose: () => void; onReload: () => Promise<void>; onMessage?: (message: string) => void;
  registerPageLeaveGuard?: RegisterPageLeaveGuard; onCalendar?: () => void;
}) {
  const channels = snapshot.channels.filter(c => c.enabled && c.configured);
  const [draft, setDraft] = useState<MarketingShareInput>(() => {
    const input = initial ? {content: contentDraft(initial.content), options: initial.options} : newShare(channels.filter(c => c.id === "website").map(c => c.id));
    if(publication) return {...input, content: {...input.content, title: publication.title, masterText: publication.text, mediaAssetIds: publication.mediaAssetIds}, options: {...input.options, channels: [publication.channel]}};
    return initial?.targets.length ? input : {...input, options: {...input.options, channels: input.options.channels.filter(id => channels.some(c => c.id === id))}};
  });
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft));
  const [submitted, setSubmitted] = useState(Boolean(initial?.targets.length));
  const [step, setStep] = useState<Step>("content"), [aiChannel, setAiChannel] = useState<MarketingChannel>();
  const [generateImage, setGenerateImage] = useState(false), [audienceName, setAudienceName] = useState(initial?.options.audienceId ? "Kayıtlı hedef kitle" : "Hedef kitle seçilmedi");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [outcomes, setOutcomes] = useState<MarketingShareOutcome[]>([]);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [pub, setPub] = useState(publication);
  const working = useRef(false), mounted = useRef(true), lastSaved = useRef(initial);
  const dirty = JSON.stringify(draft) !== baseline;
  const readOnly = submitted && !pub;
  const locked = busy || readOnly;
  const audienceChannels = draft.options.channels.filter((c): c is "sms" | "whatsapp" => c === "sms" || c === "whatsapp");
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  useEffect(() => registerPageLeaveGuard?.((_destination, continuation) => {
    if(working.current) return false;
    if(!dirty) return true;
    setPending(() => continuation); return false;
  }), [dirty, registerPageLeaveGuard]);
  function close(next = onClose) {if(working.current)return; if(dirty) setPending(() => next); else next();}
  function change(input: MarketingShareInput) {if(!locked) setDraft(input);}
  function childBusy(value: boolean) {working.current = value; setBusy(value);}
  async function action(work: () => Promise<void>) {
    if(working.current)return;
    working.current = true; setBusy(true); setMessage("");
    try {await work();} catch(e) {if(mounted.current) setMessage(e instanceof Error ? e.message : "Paylaşım işlemi tamamlanamadı.");}
    finally {working.current = false; if(mounted.current) setBusy(false);}
  }
  async function save(): Promise<MarketingShareDetail> {
    const saved = resultValue(await window.yardimciDesktop!.saveMarketingShare(draft));
    lastSaved.current = saved;
    const next = {content: contentDraft(saved.content), options: saved.options};
    if(mounted.current) {setDraft(next); setBaseline(JSON.stringify(next));}
    return saved;
  }
  async function saveDraft() {await action(async () => {
    if(pub) {
      const saved = resultValue(await window.yardimciDesktop!.saveMarketingPublication({id: pub.id, expectedRevision: pub.revision, contentId: pub.contentId, channel: pub.channel, placement: pub.placement, title: draft.content.title, text: draft.content.masterText, mediaAssetIds: draft.content.mediaAssetIds}));
      if(mounted.current) {setPub(saved); setBaseline(JSON.stringify(draft)); setMessage("Web içeriği kaydedildi. Eşitleme onayı bekleniyor.");} onMessage?.("Web içeriği kaydedildi. Eşitleme onayı bekleniyor.");
    } else {await save(); if(mounted.current) setMessage("Taslak kaydedildi."); onMessage?.("Taslak kaydedildi.");}
    await onReload();
  });}
  async function submit() {await action(async () => {
    if(pub) {
      const saved = resultValue(await window.yardimciDesktop!.publishMarketingPublication(pub.id, pub.revision)); setPub(saved); setMessage("Yayın onayı bekleniyor."); await onReload(); return;
    }
    const saved = submitted ? lastSaved.current! : await save();
    try {
      const result = resultValue(await window.yardimciDesktop!.submitMarketingShare(saved.content.content.id, saved.content.content.revision));
      if(mounted.current) {setOutcomes(result); setStep("results"); setSubmitted(true);}
      onMessage?.(result.some(r => r.state === "failed") ? "Bazı kanallar tamamlanamadı. Paylaşım sonucunu kontrol edin." : draft.options.timing === "scheduled" ? "Paylaşım planları ana Takvim’e kaydedildi." : "Paylaşım işleme alındı.");
    } finally {
      const current = resultValue(await window.yardimciDesktop!.getMarketingShare(saved.content.content.id));
      lastSaved.current = current;
      if(mounted.current) setSubmitted(Boolean(current.targets.length));
      await onReload();
    }
  });}
  const primary = pub ? pub.desiredPublished ? "Yayını güncelle" : "Web sitesinde yayınla" : draft.options.timing === "scheduled" ? "Paylaşımı planla" : "Yayınla";
  return <WorkspaceFrame presentation="centered" className="marketing-share-workspace" title={step === "content" ? pub ? "Web içeriğini düzenle" : initial ? "Paylaşımı düzenle" : titles.content : titles[step]}
    context={pub ? "Web sitesindeki içerik" : "İçeriği oluştur → kanalları seç → yayınla"} onClose={() => close()} closeBlocked={busy}
    actions={step !== "content" && <ActionButton variant="quiet" disabled={busy} onClick={() => setStep("content")}><ArrowLeft size={16}/>Paylaşıma dön</ActionButton>}
    footer={<><span className="muted">{busy ? "İşlem sürüyor…" : readOnly ? "İşleme alınan paylaşım" : dirty ? "Kaydedilmemiş değişiklikler" : ""}</span><div className="marketing-actions">
      <ActionButton variant="secondary" disabled={locked || !draft.content.title.trim()} onClick={() => void saveDraft()}>{pub ? "Değişiklikleri kaydet" : "Taslak kaydet"}</ActionButton>
      <ActionButton disabled={busy || (!submitted && (!draft.content.title.trim() || !draft.options.channels.length)) || Boolean(pub && !pub.desiredPublished && dirty)} onClick={() => void (pub?.desiredPublished ? saveDraft() : submit())}><Send size={16}/>{readOnly ? "Sonucu yeniden kontrol et" : primary}</ActionButton>
    </div></>}
    overlay={pending && <ConfirmDialog withinModal tone="warning" title="Değişiklikler kaydedilmedi" description="Paylaşımı kaydetmeden çıkmak istiyor musunuz?" confirmLabel="Değişiklikleri bırak" cancelLabel="Düzenlemeye dön" onCancel={() => setPending(null)} onConfirm={() => {const next = pending; setPending(null); next();}}/>}>
    {message && <p className="marketing-workspace-message" role="status">{message}</p>}
    {step === "content" && <section className="form-stack marketing-share-form" aria-label="Paylaşım formu">
      <Panel as="section" surfaceRole="communication" className="form-stack marketing-share-section" aria-label="Paylaşım içeriği">
      <h3>Paylaşım içeriği</h3>
      <label className="form-field form-field--fluid"><span>Başlık *</span><input aria-label="Başlık" required value={draft.content.title} maxLength={240} disabled={locked} onChange={e => change({...draft, content: {...draft.content, title: e.target.value}})}/></label>
      <label className="form-field form-field--fluid"><span>Paylaşım metni *</span><textarea aria-label="Paylaşım metni" value={draft.content.masterText} rows={4} maxLength={12000} disabled={locked} onChange={e => change({...draft, content: {...draft.content, masterText: e.target.value}})}/><small>{draft.content.masterText.length}/12000 karakter</small></label>
      <div className="marketing-actions"><ActionButton variant="secondary" disabled={locked} onClick={() => {setAiChannel(undefined); setStep("ai");}}><Sparkles size={16}/>AI ile metin oluştur / yeniden yaz</ActionButton></div>
      <section className="marketing-image-summary" aria-label="Seçilen paylaşım görselleri">
        <div className="marketing-image-cover">{snapshot.assets.find(a => a.id === draft.content.mediaAssetIds[0]) ? <img src={snapshot.assets.find(a => a.id === draft.content.mediaAssetIds[0])!.previewUrl} alt="Paylaşım kapak görseli"/> : <Image size={30} aria-hidden="true"/>}</div>
        <div><strong>Görsel</strong><div className="marketing-actions"><ActionButton variant="secondary" disabled={locked} onClick={() => {setGenerateImage(false); setStep("images");}}>Görsel seç / yükle</ActionButton><ActionButton variant="secondary" disabled={locked || !snapshot.aiCapabilities.includes("image_generation")} onClick={() => {setGenerateImage(true); setStep("images");}}><Sparkles size={15}/>AI ile görsel oluştur</ActionButton></div><small>{draft.content.mediaAssetIds.length} görsel · İlk görsel kapak ve Instagram görselidir.</small></div>
      </section>
      </Panel>
      <Panel as="section" surfaceRole="configuration" className="form-stack marketing-share-section" aria-label="Kanallar ve hedef kitle">
      <h3>Kanallar ve hedef kitle</h3>
      <fieldset className="marketing-channel-picks" disabled={locked || Boolean(pub)}><legend>Aktif paylaşım kanalları</legend>
        {(pub ? snapshot.channels.filter(c => c.id === pub.channel) : channels).map(c => <label key={c.id}><input type="checkbox" checked={draft.options.channels.includes(c.id)} onChange={e => change({...draft, options: {...draft.options, channels: e.target.checked ? [...draft.options.channels, c.id] : draft.options.channels.filter(id => id !== c.id)}})}/>{channelNames[c.id]}</label>)}
        {!channels.length && <p>Şu anda kullanılabilir paylaşım kanalı yok. İçeriğinizi taslak olarak kaydedebilirsiniz.</p>}
      </fieldset>
      <div className="marketing-options-row"><div><strong>Hedef kitle</strong><small>{audienceChannels.length ? audienceName : "Web sitesi / Instagram için gerekmez"}</small></div><ActionButton variant="secondary" disabled={locked || Boolean(pub) || !audienceChannels.length} onClick={() => setStep("audience")}><Users size={16}/>Hedef kitle seç</ActionButton></div>
      <div className="marketing-actions"><ActionButton variant="secondary" disabled={locked || Boolean(pub) || !channels.length} onClick={() => setStep("channels")}>Kanal / gönderim ayrıntıları</ActionButton><ActionButton variant="quiet" disabled={busy} onClick={() => setStep("preview")}>Önizle</ActionButton></div>
      </Panel>
      <Panel as="section" surfaceRole="configuration" className="form-stack marketing-share-section" aria-label="Yayın planı">
      <fieldset className="marketing-timing" disabled={locked || Boolean(pub)}><legend>Yayın zamanı</legend><div className="marketing-actions"><label><input type="radio" name="share-timing" checked={draft.options.timing === "now"} onChange={() => change({...draft, options: {...draft.options, timing: "now"}})}/>Hemen yayınla</label><label><input type="radio" name="share-timing" checked={draft.options.timing === "scheduled"} onChange={() => change({...draft, options: {...draft.options, timing: "scheduled"}})}/>Planla</label></div>
        <div className="marketing-schedule-fields"><label className="form-field form-field--fluid">Yayın tarihi<DatePicker ariaLabel="Yayın tarihi" clearable={false} value={draft.options.startsLocal.slice(0,10)} disabled={draft.options.timing !== "scheduled"} onChange={value => change({...draft, options: {...draft.options, startsLocal: `${value}T${draft.options.startsLocal.slice(11)}`}})}/></label><label className="form-field form-field--fluid">Yayın saati<TimePicker ariaLabel="Yayın saati" clearable={false} value={draft.options.startsLocal.slice(11)} disabled={draft.options.timing !== "scheduled"} onChange={value => change({...draft, options: {...draft.options, startsLocal: `${draft.options.startsLocal.slice(0,10)}T${value}`}})}/></label></div>
        <label className="form-field form-field--fluid">Saat dilimi<input value={draft.options.timezone} disabled={draft.options.timing !== "scheduled"} onChange={e => change({...draft, options: {...draft.options, timezone: e.target.value}})}/></label><small>Planlı paylaşımlar ana Takvim’de görünür.</small>
      </fieldset>
      </Panel>
    </section>}
    {step === "ai" && <MarketingTextAssistant text={aiChannel ? draft.content.variants.find(v => v.channel === aiChannel)?.text || draft.content.masterText : draft.content.masterText} {...(aiChannel === undefined ? {} : { channel: aiChannel })} capabilities={snapshot.aiCapabilities} onBusy={childBusy} onApply={text => {change({...draft, content: aiChannel ? {...draft.content, variants: draft.content.variants.map(v => v.channel === aiChannel ? {...v, text, metadata: {version: 1, adaptation: "ai"}} : v)} : {...draft.content, masterText: text, source: "ai"}}); setStep(aiChannel ? "channels" : "content");}}/>}
    {step === "images" && <MarketingImages assets={snapshot.assets} selected={draft.content.mediaAssetIds} onChange={mediaAssetIds => change({...draft, content: {...draft.content, mediaAssetIds}})} onReload={onReload} aiAvailable={snapshot.aiCapabilities.includes("image_generation")} generateFirst={generateImage} onBusy={childBusy}/>}
    {step === "audience" && <MarketingAudience value={draft.options.audienceId} channels={audienceChannels} onChange={(audienceId,name) => {change({...draft, options: {...draft.options, audienceId}}); setAudienceName(name);}} onBusy={childBusy}/>}
    {step === "channels" && <MarketingChannelDetails draft={draft} onChange={change} channels={channels} onAi={channel => {setAiChannel(channel); setStep("ai");}}/>}
    {step === "preview" && <section className="form-stack" aria-label="Kanal önizlemesi"><p>Bu önizleme gönderim yapmaz. Gönderim izinleri ve kanal koşulları yayın sırasında yeniden kontrol edilir.</p>{draft.options.channels.map(channel => <article key={channel} className="marketing-channel-preview"><h3>{channelNames[channel]}</h3><strong>{pub ? draft.content.title : draft.content.variants.find(v => v.channel === channel)?.title || draft.content.title}</strong>{channel === "whatsapp" ? <p>Onaylı şablon: {draft.options.whatsapp.templateName || "Henüz seçilmedi"} · {draft.options.whatsapp.templateLanguage}<br/>Şablon parametreleri gönderim ayrıntılarında tanımlanır.</p> : <p>{pub ? draft.content.masterText : draft.content.variants.find(v => v.channel === channel)?.text || draft.content.masterText}</p>}<div className="marketing-preview-gallery">{(channel === "website" ? draft.content.mediaAssetIds : channel === "instagram" ? draft.content.mediaAssetIds.slice(0,1) : []).map(id => {const a = snapshot.assets.find(a => a.id === id); return a && <img key={id} src={a.previewUrl} alt={a.altText || "Paylaşım görseli"}/>;})}</div></article>)}</section>}
    {step === "results" && <section className="form-stack" aria-label="Paylaşım sonucu"><p>Her kanalın sonucu ayrı izlenir. Kabul edilen gönderim, teslim edildiği anlamına gelmez.</p>{outcomes.map(o => <article className="marketing-options-row" key={o.channel}><div><strong>{channelNames[o.channel]}</strong><p>{o.message}</p></div><StatusBadge tone={o.state === "failed" ? "danger" : o.state === "scheduled" ? "info" : "success"}>{o.state === "failed" ? "Kontrol gerekiyor" : o.state === "scheduled" ? "Planlandı" : "İşleme alındı"}</StatusBadge></article>)}<ActionButton variant="secondary" disabled={busy || !onCalendar} onClick={() => close(onCalendar)}>Ana Takvim’i aç</ActionButton></section>}
  </WorkspaceFrame>;
}
