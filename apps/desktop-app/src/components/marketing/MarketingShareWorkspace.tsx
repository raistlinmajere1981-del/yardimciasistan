import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Image, Send, Sparkles, Users, Eye } from "lucide-react";
import type { MarketingChannel, MarketingPublication, MarketingShareInput, MarketingShareDetail, MarketingShareOutcome, MarketingStudioSnapshot, MarketingShareTarget, MarketingScheduleInput, MarketingScheduleSnapshot } from "@yardimci-asistan/shared";
import type { RegisterPageLeaveGuard } from "../../app/page-navigation-guard";
import { WorkspaceSubflowOverlay } from "../workspace/WorkspaceSubflowOverlay";
import { MarketingSharePreview } from "./MarketingSharePreview";
import { MarketingInlinePlan } from "./MarketingInlinePlan";
import { MarketingInlineScheduleCreate } from "./MarketingInlineScheduleCreate";
import { executionStatuses, scheduleDate } from "./MarketingScheduleWorkspace";
import { StatusChip } from "../ui/StatusChip";
import { MarketingEntityAnalytics } from "./MarketingEntityAnalytics";
import { publicationLabel } from "./MarketingRecordManager";
import { deliveryIssues, deliveryStatuses } from "./MarketingDeliveryWorkspace";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";
import { ActionButton } from "../ui/ActionButton";
import { DatePicker, TimePicker } from "../ui/DateTimePicker";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Panel } from "../ui/Panel";
import { StatusBadge } from "../ui/StatusBadge";
import { MarketingTextAssistant } from "./MarketingTextAssistant";
import { ReadAloudButton, SpeechTextField } from "../speech/SpeechTextField";
import { MarketingImages } from "./MarketingImages";
import { MarketingAudience } from "./MarketingAudience";
import { MarketingChannelDetails } from "./MarketingChannelDetails";
import { channelNames, contentDraft, newShare, resultValue } from "./share-draft";

type Pane = "ai" | "images" | "audience" | "channels" | "preview" | null;
const planLabels = {active: "Planlandı", paused: "Plan duraklatıldı", cancelled: "Plan iptal edildi", completed: "Plan tamamlandı"};
const toolTitles = {ai: "AI ile metin oluştur", images: "Medya arşivi", audience: "Hedef kitle", channels: "Kanal ayrıntıları", preview: "Çoklu kanal önizlemesi"};
export function MarketingShareWorkspace({snapshot, initial, publication, onClose, onReload, onMessage, registerPageLeaveGuard, onOpenTarget, schedules, initialChannel, focusScheduleId, createScheduleInput, returnFocusRef}: {
  returnFocusRef?: RefObject<HTMLElement | null>; snapshot: MarketingStudioSnapshot; initial?: MarketingShareDetail; publication?: MarketingPublication;
  onClose: () => void; onReload: () => Promise<void>; onMessage?: (message: string) => void;
  registerPageLeaveGuard?: RegisterPageLeaveGuard; schedules?: MarketingScheduleSnapshot; initialChannel?: MarketingChannel;
  focusScheduleId?: string; createScheduleInput?: MarketingScheduleInput;
  onOpenTarget?: (target: MarketingShareTarget) => void;
}) {
  const channels = snapshot.channels.filter(c => c.enabled && c.configured);
  const [draft, setDraft] = useState<MarketingShareInput>(() => {
    const input = initial ? {content: contentDraft(initial.content), options: initial.options} : newShare(channels.filter(c => c.id === "website").map(c => c.id));
    if(publication && !initial?.targets.length) return {...input, content: {...input.content, title: publication.title, masterText: publication.text, mediaAssetIds: publication.mediaAssetIds}, options: {...input.options, channels: [publication.channel]}};
    return initial?.targets.length ? input : {...input, options: {...input.options, channels: input.options.channels.filter(id => channels.some(c => c.id === id))}};
  });
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft));
  const [submitted, setSubmitted] = useState(Boolean(initial?.targets.length || focusScheduleId || createScheduleInput));
  const [pane, setPane] = useState<Pane>(null), [aiChannel, setAiChannel] = useState<MarketingChannel>();
  const [aiFromChannels, setAiFromChannels] = useState(false);
  const [staged, setStaged] = useState<MarketingShareInput>(draft);
  const toolLauncher = useRef<HTMLElement | null>(null), formRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if(pane) formRef.current?.closest("dialog")?.querySelector<HTMLElement>("[data-workspace-subflow] [data-modal-initial-focus]")?.focus({preventScroll: true});
    else if(toolLauncher.current) {toolLauncher.current.focus({preventScroll: true}); toolLauncher.current = null;}
  }, [pane]);
  const [stagedAudience, setStagedAudience] = useState("");
  const [editingPublication, setEditingPublication] = useState(false), [removal, setRemoval] = useState(false);
  const [generateImage, setGenerateImage] = useState(false), [audienceName, setAudienceName] = useState(initial?.options.audienceId ? "Kayıtlı hedef kitle" : "Hedef kitle seçilmedi");
  const [audienceSummary, setAudienceSummary] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [outcomes, setOutcomes] = useState<MarketingShareOutcome[]>([]);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const working = useRef(false), mounted = useRef(true), lastSaved = useRef(initial);
  const [selectedChannel, setSelectedChannel] = useState<MarketingChannel>(initialChannel || publication?.channel || draft.options.channels[0] || "website");
  const [selectedPlanId, setSelectedPlanId] = useState(focusScheduleId || "");
  const [planDirty, setPlanDirty] = useState(false);
  const discardPlan = useRef<() => void>(() => {});
  const planChanged = useCallback((value: boolean, discard: () => void, id: string) => {setPlanDirty(value); discardPlan.current = discard; if (value) setSelectedPlanId(id);}, []);
  const [savedPublication, setPub] = useState(publication);
  const targets = lastSaved.current?.targets || [];
  // A calendar entry may refer to an older plan without a persisted share record.
  // Use the canonical schedule target rather than treating that share as a new draft.
  const focusedSchedule = schedules?.schedules.find(p => p.schedule.id === focusScheduleId)?.schedule;
  const selectedTarget = targets.find(t => t.channel === selectedChannel) ||
    (focusedSchedule?.channel === selectedChannel ? {channel: focusedSchedule.channel, targetType: focusedSchedule.targetType, targetId: focusedSchedule.targetId} : undefined) ||
    (createScheduleInput?.channel === selectedChannel ? {channel: createScheduleInput.channel, targetType: createScheduleInput.targetType, targetId: createScheduleInput.targetId} : undefined);
  const latestPublication = snapshot.publications.find(p => selectedTarget ? p.id === selectedTarget.targetId : p.id === savedPublication?.id && p.channel === selectedChannel);
  const pub = editingPublication ? savedPublication : latestPublication && (latestPublication.id !== savedPublication?.id || latestPublication.revision >= savedPublication.revision) ? latestPublication : savedPublication?.channel === selectedChannel ? savedPublication : undefined;
  const dirty = JSON.stringify(draft) !== baseline;
  const readOnly = pub ? !editingPublication : submitted;
  const locked = busy || readOnly || Boolean(pane);
  const sharePlans = schedules?.schedules.filter(p => targets.some(t => t.targetId === p.schedule.targetId) || p.schedule.targetId === publication?.id || p.schedule.id === focusScheduleId || p.schedule.targetId === createScheduleInput?.targetId) || [];
  const selectedPlan = sharePlans.find(p => p.schedule.id === selectedPlanId) || sharePlans.find(p => p.schedule.channel === selectedChannel && ["active", "paused"].includes(p.schedule.status)) || sharePlans.find(p => p.schedule.channel === selectedChannel) || sharePlans[0];
  const activePlan = sharePlans.some(p => p.schedule.targetId === pub?.id && ["active", "paused"].includes(p.schedule.status));
  const inFlight = sharePlans.some(p => p.schedule.targetId === pub?.id && p.executions.some(e => ["pending", "claimed"].includes(e.status)));
  const campaignDetail = snapshot.campaigns?.find(c => c.campaign.id === selectedTarget?.targetId);
  const resultChannels = [...new Set<MarketingChannel>([...targets.map(t => t.channel), ...(publication ? [publication.channel] : []), ...(focusedSchedule ? [focusedSchedule.channel] : []), ...(createScheduleInput ? [createScheduleInput.channel] : [])])];
  const outcome = outcomes.find(o => o.channel === selectedChannel);
  function statusFor(channel: MarketingChannel) {
    const target = targets.find(t => t.channel === channel) || (selectedTarget?.channel === channel ? selectedTarget : undefined), p = pub?.channel === channel ? pub : snapshot.publications.find(p => p.id === target?.targetId);
    const campaign = snapshot.campaigns?.find(c => c.campaign.id === target?.targetId)?.campaign;
    const plan = sharePlans.find(p => p.schedule.channel === channel && ["active", "paused"].includes(p.schedule.status)) || sharePlans.find(p => p.schedule.channel === channel);
    if (outcomes.some(o => o.channel === channel && o.state === "failed")) return "Kontrol gerekiyor";
    return p && p.status !== "draft" ? publicationLabel(p)
      : plan && ["active", "paused"].includes(plan.schedule.status) ? planLabels[plan.schedule.status]
      : campaign ? deliveryStatuses[campaign.status]
      : plan ? plan.schedule.status === "completed" && plan.executions[0]?.status === "failed" ? "Çalışma başarısız" : planLabels[plan.schedule.status]
      : p ? publicationLabel(p) : "Durum alınamadı";
  }
  function statusTone(channel: MarketingChannel) {
    const status = statusFor(channel);
    return ["Başarısız", "Çalışma başarısız", "Kontrol gerekiyor"].includes(status) ? "danger" : ["Yayında", "Tamamlandı"].includes(status) ? "success" : "info";
  }
  const canEditPublication = pub?.channel === "website" && !inFlight && (!activePlan || pub.desiredPublished || Boolean(pub.publishedAt)) && snapshot.channels.some(c => c.id === "website" && c.enabled && c.configured && c.supportsEditPublished);
  const audienceChannels = draft.options.channels.filter((c): c is "sms" | "whatsapp" => c === "sms" || c === "whatsapp");
  const audienceId = draft.options.audienceId, usesSms = draft.options.channels.includes("sms"), usesWhatsapp = draft.options.channels.includes("whatsapp");
  useEffect(() => {
    let active = true;
    setAudienceSummary("");
    if(!audienceId) {setAudienceName("Hedef kitle seçilmedi"); return;}
    if(!usesSms && !usesWhatsapp) return;
    const bridge = window.yardimciDesktop!;
    void bridge.listMessagingSegments().then(r => {if(active) setAudienceName(resultValue(r).find(a => a.id === audienceId)?.name || "Kayıtlı hedef kitle bulunamadı");}).catch(() => {if(active) setAudienceSummary("Hedef kitle bilgisi alınamadı.");});
    const channels = ([usesSms ? "sms" : null, usesWhatsapp ? "whatsapp" : null] as const).filter((c): c is "sms" | "whatsapp" => Boolean(c));
    void Promise.all(channels.map(async channel => {const counts = resultValue(await bridge.previewMessagingSegment(audienceId, channel)); return `${channelNames[channel]}: ${counts.eligibleCount} uygun / ${counts.matchedCount} alıcı`;})).then(values => {if(active) setAudienceSummary(values.join(" · "));}).catch(() => {if(active) setAudienceSummary("Alıcı uygunluğunu hedef kitle aracında kontrol edin.");});
    return () => {active = false;};
  }, [audienceId, usesSms, usesWhatsapp]);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  useEffect(() => registerPageLeaveGuard?.((_destination, continuation) => {
    if(working.current || pane) return false;
    if(!dirty && !planDirty) return true;
    setPending(() => continuation); return false;
  }), [dirty, planDirty, pane, registerPageLeaveGuard]);
  function close(next = onClose) {if(working.current)return; if(pane && next === onClose) {setPane(null); return;} if(dirty || planDirty) setPending(() => next); else next();}
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
      if(mounted.current) {setPub(saved); setBaseline(JSON.stringify(draft)); setMessage("Web içeriği kaydedildi. Eşitleme onayı bekleniyor."); setEditingPublication(false);} onMessage?.("Web içeriği kaydedildi. Eşitleme onayı bekleniyor.");
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
      if(mounted.current) {setOutcomes(result); setSubmitted(true);}
      onMessage?.(result.some(r => r.state === "failed") ? "Bazı kanallar tamamlanamadı. Paylaşım sonucunu kontrol edin." : draft.options.timing === "scheduled" ? "Paylaşım planları ana Takvim’e kaydedildi." : "Paylaşım işleme alındı.");
    } finally {
      const current = resultValue(await window.yardimciDesktop!.getMarketingShare(saved.content.content.id));
      lastSaved.current = current;
      if(mounted.current) {setSubmitted(Boolean(current.targets.length)); setSelectedChannel(channel => current.targets.some(t => t.channel === channel) ? channel : current.targets[0]?.channel || channel);}
      await onReload();
    }
  });}
  function openTool(next: Exclude<Pane, null>, generateFirst = false) {
    if(busy || pane) return;
    toolLauncher.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setStaged(structuredClone(draft)); setStagedAudience(audienceName); setAiChannel(undefined); setAiFromChannels(false); setGenerateImage(generateFirst); setPane(next);
  }
  function dismissTool() {if(!working.current) setPane(null);}
  function applyTool() {
    if(working.current) return;
    setDraft(staged); if(pane === "audience") setAudienceName(stagedAudience); setPane(null);
  }
  function applyText(text: string) {
    const next = {...staged, content: aiChannel ? {...staged.content, variants: staged.content.variants.map(v => v.channel === aiChannel ? {...v, text, metadata: {version: 1 as const, adaptation: "ai" as const}} : v)} : {...staged.content, masterText: text, source: "ai" as const}};
    if(aiFromChannels) {setStaged(next); setAiChannel(undefined); setPane("channels");}
    else {setDraft(next); setPane(null);}
  }
  async function publicationAction(remove: boolean) {await action(async () => {
    if(!pub) return;
    const value = resultValue(await (remove ? window.yardimciDesktop!.unpublishMarketingPublication(pub.id, pub.revision) : window.yardimciDesktop!.publishMarketingPublication(pub.id, pub.revision)));
    if(mounted.current) {setPub(value); setOutcomes(previous => previous.filter(o => o.channel !== value.channel)); setRemoval(false); setMessage(remove ? "Yayından kaldırma onayı bekleniyor." : publicationLabel(value));}
    await onReload();
  });}
  const textFor = (channel: MarketingChannel) => editingPublication ? draft.content.masterText : draft.content.variants.find(v => v.channel === channel)?.text.trim() || draft.content.masterText;
  const readiness = [
    {label: "Başlık ve metin", ready: Boolean(draft.content.title.trim()) && draft.options.channels.every(c => c === "whatsapp" || Boolean(textFor(c).trim()))},
    {label: "Kanal seçimi", ready: draft.options.channels.length > 0 && draft.options.channels.every(id => channels.some(c => c.id === id))},
    {label: "Instagram görseli / metni", ready: !draft.options.channels.includes("instagram") || Boolean(draft.content.variants.find(v => v.channel === "instagram")?.mediaAssetId || draft.content.mediaAssetIds[0]) && textFor("instagram").length <= 2200},
    {label: "SMS metni · 160 karakter", ready: !draft.options.channels.includes("sms") || Boolean(textFor("sms").trim()) && textFor("sms").length <= 160},
    {label: "Hedef kitle / WhatsApp şablonu", ready: (!audienceChannels.length || Boolean(draft.options.audienceId)) && (!draft.options.channels.includes("whatsapp") || Boolean(draft.options.whatsapp.templateName))},
    {label: "Yayın zamanı", ready: draft.options.timing === "now" || Boolean(draft.options.timezone.trim()) && Number.isFinite(Date.parse(draft.options.startsLocal))}
  ];
  const primary = pub ? pub.desiredPublished ? "Yayını güncelle" : "Web sitesinde yayınla" : draft.options.timing === "scheduled" ? "Paylaşımı planla" : "Yayınla";
  const displayedDraft = readOnly ? {...draft, content: {...draft.content, title: pub?.title || campaignDetail?.campaign.name || draft.content.title, masterText: pub?.text ?? (campaignDetail?.campaign.channel === "sms" ? campaignDetail.campaign.text || "" : textFor(selectedChannel)), mediaAssetIds: pub?.mediaAssetIds || draft.content.mediaAssetIds}, options: {...draft.options, channels: [selectedChannel]}} : draft;
  function displayedPublicationDraft() {return {...draft, content: {...draft.content, title: pub!.title, masterText: pub!.text, mediaAssetIds: pub!.mediaAssetIds}};}
  const selectedPlanPublication = snapshot.publications.find(p => p.id === selectedPlan?.schedule.targetId);
  const previewButton = <ActionButton variant="secondary" disabled={busy || Boolean(pane)} onClick={() => openTool("preview")}><Eye size={16}/>Çoklu kanal önizlemesi</ActionButton>;

  return <WorkspaceFrame {...(returnFocusRef === undefined ? {} : {returnFocusRef})} presentation="centered" className="marketing-workspace-frame detail-workspace-frame marketing-share-workspace" title={pub ? editingPublication ? "Web içeriğini düzenle" : "Paylaşım detayı" : readOnly ? "Paylaşım detayı" : initial ? "Paylaşımı düzenle" : "Yeni paylaşım oluştur"}
    context={readOnly ? <span className="marketing-actions">{channelNames[selectedChannel]}<StatusBadge tone={statusTone(selectedChannel)}>{statusFor(selectedChannel)}</StatusBadge></span> : pub ? "Web içeriğini düzenle" : "İçeriği hazırlayın · araçlar gerektiğinde açılır"} onClose={() => close()} closeBlocked={busy}
    footer={<><span className="muted">{busy ? "İşlem sürüyor…" : planDirty ? "Kaydedilmemiş plan değişiklikleri" : readOnly ? "Salt okunur" : dirty ? "Kaydedilmemiş değişiklikler" : "Taslak"}</span><div className="marketing-actions">
      {!readOnly && <ActionButton variant="secondary" disabled={locked || !draft.content.title.trim()} onClick={() => void saveDraft()}>{pub ? "Değişiklikleri kaydet" : "Taslak kaydet"}</ActionButton>}
      {!readOnly && <ActionButton disabled={busy || Boolean(pane) || (!submitted && !readiness.every(r => r.ready)) || Boolean(pub && !pub.desiredPublished && dirty)} onClick={() => void (pub?.desiredPublished ? saveDraft() : submit())}><Send size={16}/>{primary}</ActionButton>}
      {editingPublication && <ActionButton variant="secondary" disabled={busy || Boolean(pane)} onClick={() => close(() => {setDraft(displayedPublicationDraft()); setBaseline(JSON.stringify(displayedPublicationDraft())); setEditingPublication(false);})}>Vazgeç</ActionButton>}
      {readOnly && <ActionButton variant="secondary" disabled={busy || Boolean(pane)} onClick={() => close()}>Kapat</ActionButton>}
    </div></>}
    overlay={<>
      {pending && <ConfirmDialog withinModal tone="warning" title="Değişiklikler kaydedilmedi" description={planDirty ? "Plan değişikliklerini kaydetmeden çıkmak istiyor musunuz?" : "Paylaşımı kaydetmeden çıkmak istiyor musunuz?"} confirmLabel="Değişiklikleri bırak" cancelLabel="Düzenlemeye dön" onCancel={() => setPending(null)} onConfirm={() => {const next = pending; discardPlan.current(); setPending(null); next();}}/>}
      {removal && <ConfirmDialog withinModal tone="danger" title="Web içeriği yayından kaldırılsın mı?" description="İçerik web eşitlemesi tamamlanınca sitenizden kaldırılır." confirmLabel="Yayından kaldırmayı onayla" details={message && <p role="status">{message}</p>} busy={busy} onCancel={() => setRemoval(false)} onConfirm={() => publicationAction(true)}/>}
      {pane && <WorkspaceSubflowOverlay title={pane === "preview" && readOnly ? "Seçili kanal önizlemesi" : toolTitles[pane]} onClose={dismissTool} closeBlocked={busy} className={`marketing-tool marketing-tool--${pane}`} footer={<div className="marketing-actions"><ActionButton variant="secondary" disabled={busy} onClick={dismissTool}>{pane === "preview" ? "Paylaşıma dön" : "Vazgeç"}</ActionButton>{pane !== "ai" && pane !== "preview" && <ActionButton disabled={busy} onClick={applyTool}>Uygula</ActionButton>}</div>}>
        {pane === "ai" && <>
          <label className="form-field form-field--fluid">Uygulama hedefi<select disabled={busy} value={aiChannel || "shared"} onChange={e => setAiChannel(e.target.value === "shared" ? undefined : e.target.value as MarketingChannel)}><option value="shared">Ortak paylaşım metni</option>{!pub && staged.options.channels.filter(c => c !== "whatsapp").map(c => <option key={c} value={c}>{channelNames[c]} metni</option>)}</select></label>
          <MarketingTextAssistant key={aiChannel || "shared"} text={aiChannel ? staged.content.variants.find(v => v.channel === aiChannel)?.text || staged.content.masterText : staged.content.masterText} {...(aiChannel === undefined ? {} : {channel: aiChannel})} capabilities={snapshot.aiCapabilities} onBusy={childBusy} onApply={applyText}/>
        </>}
        {pane === "images" && <><p className="muted">Seçim ve sıralama Uygula ile paylaşıma aktarılır. Yüklenen ve üretilen görseller Vazgeç sonrasında da arşivde kalır.</p><MarketingImages assets={snapshot.assets} selected={staged.content.mediaAssetIds} onChange={mediaAssetIds => setStaged({...staged, content: {...staged.content, mediaAssetIds}})} onReload={onReload} aiAvailable={snapshot.aiCapabilities.includes("image_generation")} generateFirst={generateImage} onBusy={childBusy}/></>}
        {pane === "audience" && <><p className="muted">Yeni hedef kitle kaydı kalıcıdır. Paylaşım seçimi yalnız Uygula ile değişir.</p><MarketingAudience value={staged.options.audienceId} channels={audienceChannels} onChange={(audienceId, name) => {setStaged({...staged, options: {...staged.options, audienceId}}); setStagedAudience(name);}} onBusy={childBusy}/></>}
        {pane === "channels" && <MarketingChannelDetails draft={staged} onChange={setStaged} channels={channels.filter(c => staged.options.channels.includes(c.id))} aiAvailable={snapshot.aiCapabilities.includes("channel_adaptation")} onAi={channel => {setAiFromChannels(true); setAiChannel(channel); setPane("ai");}}/>}
        {pane === "preview" && <MarketingSharePreview draft={displayedDraft} snapshot={snapshot} publication={Boolean(pub)}/>}

      </WorkspaceSubflowOverlay>}
    </>}>
    <section ref={formRef} className="marketing-share-form" aria-label={readOnly ? "İçerik detayı" : "Paylaşım formu"} inert={Boolean(pane || pending || removal)}>
      {!readOnly && message && <p className="marketing-workspace-message" role="status">{message}</p>}
      <div className="marketing-share-columns">
      <div className="form-stack">
        {readOnly ? <>
          <Panel as="section" className="form-stack marketing-share-section" aria-label="İçerik"><h3>İçerik</h3><div className="marketing-detail-overview"><div className="marketing-detail-cover"><MarketingCover snapshot={snapshot} ids={displayedDraft.content.mediaAssetIds}/></div><div className="marketing-detail-identity"><strong className="marketing-detail-title">{displayedDraft.content.title}</strong><small>{channelNames[selectedChannel]}</small></div></div>
            {displayedDraft.content.mediaAssetIds.length > 1 && <div className="marketing-detail-gallery" aria-label="Paylaşım görsel galerisi">{displayedDraft.content.mediaAssetIds.slice(1).map(id => {const asset = snapshot.assets.find(a => a.id === id); return asset && <img key={id} src={asset.previewUrl} alt={asset.altText || "Paylaşım görseli"}/>;})}</div>}
            <p className="marketing-detail-text">{selectedChannel === "whatsapp" && campaignDetail ? `Onaylı şablon: ${campaignDetail.campaign.templateName} · ${campaignDetail.campaign.templateLanguage}` : displayedDraft.content.masterText || "Metin girilmedi."}</p>
            <ReadAloudButton key={selectedChannel} text={displayedDraft.content.masterText} disabled={busy || Boolean(pane)} />
            <ActionButton variant="secondary" disabled={busy || Boolean(pane)} onClick={() => openTool("preview")}><Eye size={16}/>Seçili kanal önizlemesi</ActionButton>
          </Panel>
        </> : <>
          <Panel as="section" surfaceRole="communication" className="form-stack marketing-share-section" aria-label="Paylaşım içeriği"><div className="marketing-options-row"><h3>Paylaşılacak içerik</h3><ActionButton variant="secondary" disabled={locked || !snapshot.aiCapabilities.some(c => c === "text_generation" || c === "rewrite" || c === "channel_adaptation")} onClick={() => openTool("ai")}><Sparkles size={16}/>AI ile metin oluştur / yeniden yaz</ActionButton></div>
            <label className="form-field form-field--fluid"><span>Başlık *</span><input aria-label="Başlık" required value={draft.content.title} maxLength={240} disabled={locked} onChange={e => change({...draft, content: {...draft.content, title: e.target.value}})}/></label>
            <SpeechTextField label="Paylaşım metni" value={draft.content.masterText} rows={6} maxLength={12000} disabled={locked} onChange={text => change({...draft, content: {...draft.content, masterText: text}})} />
            <small>{draft.content.masterText.length}/12000 karakter · Kanala özel metinler ayrıntılarda düzenlenir.</small>
          </Panel>
          <Panel as="section" className="form-stack marketing-share-section" aria-label="Seçilen paylaşım görselleri"><h3>Paylaşım görselleri</h3><div className="marketing-image-summary"><div className="marketing-image-cover"><MarketingCover snapshot={snapshot} ids={draft.content.mediaAssetIds}/></div><div><strong>{draft.content.mediaAssetIds.length} görsel seçili</strong><small>İlk görsel kapak ve Instagram görselidir.</small><div className="marketing-actions"><ActionButton variant="secondary" disabled={locked} onClick={() => openTool("images")}>Görsel seç / yükle</ActionButton><ActionButton variant="secondary" disabled={locked || !snapshot.aiCapabilities.includes("image_generation")} onClick={() => openTool("images", true)}><Sparkles size={15}/>AI ile görsel oluştur</ActionButton></div></div></div></Panel>
          <Panel as="section" surfaceRole="configuration" className="form-stack marketing-share-section" aria-label="Kanallar ve hedef kitle"><h3>Yayın kanalları</h3><fieldset className="marketing-channel-picks" disabled={locked || Boolean(pub)}><legend>Aktif paylaşım kanalları</legend>{(pub ? snapshot.channels.filter(c => c.id === pub.channel) : channels).map(c => <label key={c.id}><input type="checkbox" checked={draft.options.channels.includes(c.id)} onChange={e => change({...draft, options: {...draft.options, channels: e.target.checked ? [...draft.options.channels, c.id] : draft.options.channels.filter(id => id !== c.id)}})}/>{channelNames[c.id]}</label>)}{!channels.length && <p>Şu anda kullanılabilir paylaşım kanalı yok. İçeriğinizi taslak olarak kaydedebilirsiniz.</p>}</fieldset><ActionButton variant="secondary" disabled={locked || Boolean(pub) || !draft.options.channels.length} onClick={() => openTool("channels")}>Kanal / gönderim ayrıntıları</ActionButton></Panel>
        </>}
        {readOnly && <Panel as="section" className="form-stack marketing-share-section" aria-label="Kanal durumları ve sonuçlar"><h3>Kanal durumları / sonuçlar</h3>{message && <p role="status">{message}</p>}
          <div className="marketing-actions" role="group" aria-label="Sonuç kanalı">{resultChannels.map(channel => <StatusChip key={channel} tone={statusTone(channel)} selected={selectedChannel === channel} disabled={busy} onClick={() => {if (planDirty && selectedPlan) setSelectedPlanId(selectedPlan.schedule.id); setSelectedChannel(channel); setMessage("");}}>{channelNames[channel]} · {statusFor(channel)}</StatusChip>)}</div>
          <small>Sağlayıcı kabulü, teslim veya okunma anlamına gelmez.</small>
          {outcome?.state === "failed" && <p role="status">Kontrol gerekiyor · {outcome.message}</p>}
          {pub?.providerSummary?.failureCode && <p role="status">Yayın hatası: {pub.providerSummary.failureCode}</p>}
          {!channels.some(c => c.id === selectedChannel) && <p>Bu kanal şu anda kullanılamıyor. Kayıtlı sonuçlar korunuyor.</p>}
          {pub && <>
            <div className="marketing-actions">
              {canEditPublication && <ActionButton variant="secondary" disabled={busy || planDirty} onClick={() => {setPub(pub); setDraft(displayedDraft); setBaseline(JSON.stringify(displayedDraft)); setEditingPublication(true);}}>Düzenle</ActionButton>}
              {pub.channel === "website" && !pub.desiredPublished && pub.status !== "publishing" && !activePlan && channels.some(c => c.id === "website") && <ActionButton disabled={busy || planDirty} onClick={() => void publicationAction(false)}>Web sitesinde yayınla</ActionButton>}
              {pub.channel === "website" && pub.status === "failed" && pub.desiredPublished && !activePlan && <ActionButton disabled={busy || !channels.some(c => c.id === "website")} onClick={() => void publicationAction(false)}>Yayını yeniden dene</ActionButton>}
              {pub.channel === "instagram" && pub.status !== "draft" && <ActionButton variant="secondary" disabled={busy || !channels.some(c => c.id === "instagram")} onClick={() => void publicationAction(false)}>Instagram yayın durumunu kontrol et</ActionButton>}
              {pub.channel === "website" && (pub.desiredPublished || pub.status === "failed") && <ActionButton variant="danger" disabled={busy || inFlight || planDirty || !channels.some(c => c.id === "website")} onClick={() => setRemoval(true)}>Yayından kaldır</ActionButton>}
            </div>
            {pub.channel === "instagram" && <small>Instagram içeriği sonradan değiştirilemez veya yayından kaldırılamaz.</small>}
            {pub.providerSummary?.permalink && <a className="marketing-detail-link" href={pub.providerSummary.permalink} target="_blank" rel="noreferrer">Instagram’da görüntüle</a>}
            <MarketingEntityAnalytics inline kind="publication" id={pub.id} revision={String(pub.revision)}/>
          </>}
          {campaignDetail && <>
            <dl className="marketing-counts"><div><dt>Uygun</dt><dd>{campaignDetail.eligibleCount}</dd></div><div><dt>Bekleyen</dt><dd>{campaignDetail.pendingOutboxCount}</dd></div><div><dt>Kabul edilen</dt><dd>{campaignDetail.dispatchedCount}</dd></div><div><dt>Başarısız</dt><dd>{campaignDetail.failedCount}</dd></div></dl>
            {campaignDetail.errorCounts.map(e => <p key={e.category}>{deliveryIssues[e.category] || "Gönderim tamamlanamadı"} · {e.count} alıcı</p>)}
            <MarketingEntityAnalytics inline kind="campaign" id={campaignDetail.campaign.id} revision={campaignDetail.campaign.updatedAt}/>
            {onOpenTarget && selectedTarget && <ActionButton variant="secondary" disabled={busy} onClick={() => close(() => onOpenTarget(selectedTarget))}>Gönderimi yönet</ActionButton>}
          </>}
        </Panel>}
      </div>
      <aside className="form-stack">
        {!readOnly && <Panel as="section" className="form-stack marketing-share-section" aria-label="Yayın kontrolü"><h3>Yayın kontrolü</h3>{readiness.map(r => <div className="marketing-options-row" key={r.label}><span>{r.label}</span><StatusBadge tone={r.ready ? "success" : "warning"}>{r.ready ? "Tamam" : "Eksik"}</StatusBadge></div>)}<small>Alıcı izinleri ve sağlayıcı koşulları gönderimde kontrol edilir.</small>{previewButton}</Panel>}
        {audienceChannels.length > 0 && <Panel as="section" className="form-stack marketing-share-section" aria-label="Hedef kitle özeti"><h3>Hedef kitle</h3><strong>{audienceName}</strong>{audienceSummary && <small>{audienceSummary}</small>}<small>Yalnız izinli ve geçerli alıcılar gönderime alınır.</small>{!readOnly && <ActionButton variant="secondary" disabled={locked || Boolean(pub)} onClick={() => openTool("audience")}><Users size={16}/>Hedef kitle seç</ActionButton>}</Panel>}
        {!readOnly && !pub && <Panel as="section" surfaceRole="configuration" className="form-stack marketing-share-section" aria-label="Yayın planı">
          <h3>Yayın zamanı</h3>
          <>
            <fieldset className="marketing-timing" disabled={locked}>
              <legend>Yayın zamanı seçimi</legend>
              <div className="marketing-actions">
                <label><input type="radio" name="share-timing" checked={draft.options.timing === "now"}
                  onChange={() => change({...draft, options: {...draft.options, timing: "now"}})}/>Hemen yayınla</label>
                <label><input type="radio" name="share-timing" checked={draft.options.timing === "scheduled"}
                  onChange={() => change({...draft, options: {...draft.options, timing: "scheduled"}})}/>Planla</label>
              </div>
            </fieldset>
            {draft.options.timing === "scheduled" ? <div className="form-stack marketing-timing-fields">
              <div className="marketing-schedule-fields">
                <label className="form-field form-field--fluid">Yayın tarihi
                  <DatePicker ariaLabel="Yayın tarihi" clearable={false} value={draft.options.startsLocal.slice(0,10)}
                    disabled={locked} onChange={value => change({...draft, options: {...draft.options, startsLocal: value + "T" + draft.options.startsLocal.slice(11)}})}/>
                </label>
                <label className="form-field form-field--fluid">Yayın saati
                  <TimePicker ariaLabel="Yayın saati" clearable={false} value={draft.options.startsLocal.slice(11)}
                    disabled={locked} onChange={value => change({...draft, options: {...draft.options, startsLocal: draft.options.startsLocal.slice(0,10) + "T" + value}})}/>
                </label>
              </div>
              <label className="form-field form-field--fluid">Saat dilimi
                <input aria-label="Saat dilimi" value={draft.options.timezone} disabled={locked}
                  onChange={e => change({...draft, options: {...draft.options, timezone: e.target.value}})}/>
              </label>
              <small>Tek seferlik plan oluşturulur. Tekrar, duraklatma ve iptal paylaşım detayındaki plan kartından yönetilir.</small>
            </div> : <small>Paylaşım seçili kanallara hemen gönderilmek üzere hazırlanır.</small>}
          </>
        </Panel>}
        {readOnly && (sharePlans.length > 0 || createScheduleInput) && <Panel as="section" surfaceRole="configuration" className="form-stack marketing-share-section" aria-label="Yayın planı"><h3>Yayın planı</h3>
          {sharePlans.length > 1 && <label className="form-field form-field--fluid">Kanal planı<select aria-label="Kanal planı" value={selectedPlan?.schedule.id} disabled={busy || planDirty} onChange={e => setSelectedPlanId(e.target.value)}>{sharePlans.map(p => <option key={p.schedule.id} value={p.schedule.id}>{channelNames[p.schedule.channel]} · {p.schedule.name}</option>)}</select></label>}
          {createScheduleInput && !sharePlans.some(p => p.schedule.targetId === createScheduleInput.targetId && ["active", "paused"].includes(p.schedule.status))
            ? <MarketingInlineScheduleCreate key={createScheduleInput.targetId} initial={createScheduleInput} channels={snapshot.channels} blocked={busy || Boolean(pane)} onReload={onReload} onBusy={childBusy} onDirty={planChanged}/>
            : selectedPlan && <MarketingInlinePlan key={selectedPlan.schedule.id} detail={selectedPlan} channels={snapshot.channels} {...(selectedPlanPublication === undefined ? {} : {publication: selectedPlanPublication})} blocked={busy || Boolean(pane)} onReload={onReload} onBusy={childBusy} onDirty={planChanged}/>}
        </Panel>}
        {readOnly && <Panel as="section" className="form-stack marketing-share-section" aria-label="Geçmiş"><h3>Geçmiş</h3>
          {pub?.publishedAt && <p>Yayınlandı · {new Date(pub.publishedAt).toLocaleString("tr-TR")}</p>}
          {pub?.unpublishedAt && <p>Yayından kaldırıldı · {new Date(pub.unpublishedAt).toLocaleString("tr-TR")}</p>}
          {sharePlans.flatMap(p => p.executions.map(e => ({...e, channel: p.schedule.channel, timezone: p.schedule.timezone}))).sort((a,b) => b.plannedAt.localeCompare(a.plannedAt)).slice(0,5).map(e => <p key={e.id}>{channelNames[e.channel]} · {scheduleDate(e.plannedAt, e.timezone)} · {executionStatuses[e.status]}{e.lastError ? ` · ${e.lastError}` : ""}</p>)}
          {!pub?.publishedAt && !pub?.unpublishedAt && !sharePlans.some(p => p.executions.length) && <small>Henüz yayın veya çalışma kaydı yok.</small>}
        </Panel>}
      </aside>
      </div>
    </section>
  </WorkspaceFrame>;
}

function MarketingCover({snapshot, ids}: {snapshot: MarketingStudioSnapshot; ids: string[]}) {
  const asset = snapshot.assets.find(a => a.id === ids[0]);
  return asset ? <img src={asset.previewUrl} alt={asset.altText || "Paylaşım kapak görseli"}/> : <Image size={28} aria-label="Görsel yok"/>;
}
