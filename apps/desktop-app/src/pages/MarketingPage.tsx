import { FeatureViewSelector } from "../components/workspace/FeatureViewSelector";
import { FeatureWorkspacePage } from "../components/workspace/FeatureWorkspacePage";
import { DataListButton } from "../components/ui/DataList";
import { Panel } from "../components/ui/Panel";
import { usePageViewState, usePageViewScroll } from "../app/page-view-state";
import { observeNexaAi } from "../app/nexa-activity";
import { useEffect, useRef, useState } from "react";
import { MARKETING_CHANNELS, type MarketingContentInput, type MarketingContentDetail, type MarketingPublication, type MarketingPublicationInput,
  type MarketingAnalyticsRangeInput, type MarketingStudioSnapshot, type MarketingResult, type MarketingChannel, type MarketingAiCapability, type MarketingAssetView, type MessagingCampaignInput, type MarketingScheduleInput, type MarketingScheduleSnapshot, type MarketingScheduleDetail, type MessagingCampaign } from "@yardimci-asistan/shared";
import type { RegisterPageLeaveGuard, PageLeaveGuard } from "../app/page-navigation-guard";
import { ActionButton } from "../components/ui/ActionButton";
import { MarketingMediaGallery } from "../components/marketing/MarketingMediaGallery";
import { MarketingPublicationEditor, MarketingWebsitePreview } from "../components/marketing/MarketingPublicationEditor";
import { MarketingCalendar } from "../components/marketing/MarketingCalendar";
import { MarketingScheduleWorkspace, scheduleDraft, scheduleLocal } from "../components/marketing/MarketingScheduleWorkspace";
import { MarketingAnalytics } from "../components/marketing/MarketingAnalytics";
import { MarketingEntityAnalytics } from "../components/marketing/MarketingEntityAnalytics";
import { CampaignsPage } from "./CampaignsPage";

const emptyContent=():MarketingContentInput=>({title:"",purpose:"announcement",masterText:"",status:"draft",source:"manual",variants:MARKETING_CHANNELS.map(channel=>({channel,title:"",text:"",metadata:{version:1,adaptation:"manual"}})),mediaAssetIds:[]});
const publicationDraft=(p:MarketingPublication):MarketingPublicationInput=>({id:p.id,expectedRevision:p.revision,contentId:p.contentId,channel:p.channel,placement:p.placement,title:p.title,text:p.text,mediaAssetIds:[...p.mediaAssetIds]});
function contentDraft(detail:MarketingContentDetail):MarketingContentInput {
  return {...emptyContent(),id:detail.content.id,expectedRevision:detail.content.revision,title:detail.content.title,purpose:detail.content.purpose,masterText:detail.content.masterText,status:detail.content.status,source:detail.content.source,
    variants:MARKETING_CHANNELS.map(channel=>detail.variants.find(v=>v.channel===channel)??{channel,title:"",text:"",mediaAssetId:undefined,metadata:{version:1 as const,adaptation:"manual" as const}}).map(v=>({channel:v.channel,title:v.title??"",text:v.text,metadata:v.metadata,mediaAssetId:v.mediaAssetId})),mediaAssetIds:detail.media.map(m=>m.mediaAssetId)};
}
function value<T>(result:MarketingResult<T>):T {if(!result.ok)throw new Error(result.message);return result.value;}
const statuses={draft:"Taslak",publishing:"Senkron onayı bekleniyor",published:"Yayında",unpublished:"Yayından kaldırıldı",failed:"Eşitleme başarısız · yeniden denenecek"};
function publicationStatus(p:MarketingPublication) {
  if(p.channel!=="instagram")return statuses[p.status];
  return p.status==="publishing"?"Instagram görseli işleniyor":p.status==="failed"?(p.providerSummary?.failureCode==="submission_uncertain"?"Sonuç belirsiz · tekrar gönderilmedi":"Instagram yayını başarısız"):statuses[p.status];
}
type View="studio"|"campaigns"|"publications"|"media"|"calendar"|"analytics";
/** One editorial workspace family; list/preview/publication modes share the same owned drafts. */
export function MarketingPage({enabled,campaignsEnabled,registerPageLeaveGuard,onSettings,scheduleEntry,onScheduleEntryConsumed}:{enabled:boolean;campaignsEnabled:boolean;scheduleEntry?:MessagingCampaign;onScheduleEntryConsumed?:()=>void;registerPageLeaveGuard?:RegisterPageLeaveGuard;onSettings?:()=>void}) {
  const [selectedContentId, setSelectedContentId] = usePageViewState("marketing.contentId", "");
  const [selectedPublicationId, setSelectedPublicationId] = usePageViewState("marketing.publicationId", "");
  const [selectedScheduleId, setSelectedScheduleId] = usePageViewState("marketing.scheduleId", "");
  const restored = useRef(false);
  const [analyticsRange,setAnalyticsRange]=usePageViewState<MarketingAnalyticsRangeInput>("marketing.analytics.range", {preset:"30d"});
  const [calendar,setCalendar]=useState<MarketingScheduleSnapshot|null>(null),[calendarMonth,setCalendarMonth]=usePageViewState("marketing.calendar.month", ()=>new Date().toISOString().slice(0,7));
  const [planDraft,setPlanDraft]=useState<MarketingScheduleInput|null>(null),[planBaseline,setPlanBaseline]=useState("");
  const [campaignEntry,setCampaignEntry]=useState<{draft?:MessagingCampaignInput;campaignId?:string}>();
  const [snapshot,setSnapshot]=useState<MarketingStudioSnapshot|null>(null),[view,setView]=usePageViewState<View>("marketing.view", "studio");
  const bodyScroll = usePageViewScroll(`marketing.scroll.${view}`, snapshot);
  const studioScroll = usePageViewScroll<HTMLElement>("marketing.studio.listScroll", snapshot?.contents.length);
  const publicationsScroll = usePageViewScroll<HTMLElement>("marketing.publications.listScroll", snapshot?.publications.length);
  const [draft,setDraft]=useState<MarketingContentInput|null>(null),[baseline,setBaseline]=useState("");
  const [channel,setChannel]=usePageViewState<MarketingChannel>("marketing.channel", "website"),[instructions,setInstructions]=useState("");
  const [candidate,setCandidate]=useState<{text:string;channel?:MarketingChannel}|null>(null),[generated,setGenerated]=useState<MarketingAssetView|null>(null);
  const [aspect,setAspect]=useState<"square"|"landscape"|"portrait">("square"),[style,setStyle]=useState("");
  const [pubDraft,setPubDraft]=useState<MarketingPublicationInput|null>(null),[pubBaseline,setPubBaseline]=useState("");
  const [preview,setPreview]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [pending,setPending]=useState<(()=>void)|null>(null),[unpublishConfirm,setUnpublishConfirm]=useState(false),[assetConfirm,setAssetConfirm]=useState<{id:string;action:"archive"|"delete"}|null>(null);
  const mounted=useRef(true),scheduleLoad=useRef(0),epoch=useRef(0),campaignGuard=useRef<PageLeaveGuard|null>(null);
  const dirty=Boolean(planDraft && JSON.stringify(planDraft)!==planBaseline)||Boolean(draft && JSON.stringify(draft)!==baseline)||Boolean(pubDraft && JSON.stringify(pubDraft)!==pubBaseline);
  const website=snapshot?.channels.find(c=>c.id==="website"),maxImages=website?.maxImages??0;
  const selectedChannel=snapshot?.channels.find(c=>c.id===channel);
  const channelAvailable=Boolean(selectedChannel?.enabled&&selectedChannel.configured);
  const canPublish=Boolean(website?.enabled && website.configured && website.supportsDirectPublish);
  const bridge=()=>window.yardimciDesktop!;
  async function reloadCalendar() {if(!bridge().getMarketingSchedules)return;const ticket=++scheduleLoad.current;const next=value(await bridge().getMarketingSchedules(calendarMonth));if(mounted.current && ticket===scheduleLoad.current)setCalendar(next);}
  useEffect(()=>{if(!enabled)return;void reloadCalendar().catch(()=>{});return bridge().onMarketingSchedulesChanged?.(()=>{void reloadCalendar().catch(()=>{});});},[enabled,calendarMonth]);
  async function reload() {const next=value(await bridge().getMarketingStudio());if(mounted.current)setSnapshot(next);await reloadCalendar();}
  async function action(work:()=>Promise<void>) {if(busy)return;setBusy(true);setMessage("");try{await work();}catch(error){if(mounted.current)setMessage(error instanceof Error?error.message:"İşlem tamamlanamadı.");}finally{if(mounted.current)setBusy(false);}}
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;};},[]);
  useEffect(()=>{if(!enabled || !window.yardimciDesktop?.getMarketingStudio)return;void action(reload);const timer=setInterval(()=>{void reload().catch(()=>{});},4000);return()=>clearInterval(timer);},[enabled]);
  function navigate(next:()=>void) {
    if(busy)return;
    if(view==="campaigns" && campaignGuard.current && !campaignGuard.current("campaigns",next))return;
    if(dirty){setPending(()=>next);return;} epoch.current++;setCandidate(null);setGenerated(null);setPreview(false);setUnpublishConfirm(false);next();
  }
  useEffect(()=>registerPageLeaveGuard?.((destination,continuation)=>{
    if(busy)return false;
    if(view==="campaigns" && campaignGuard.current)return campaignGuard.current(destination,continuation);
    if(!dirty)return true;setPending(()=>continuation);return false;
  }),[busy,dirty,view,registerPageLeaveGuard]);
  function editContent(detail?:MarketingContentDetail) {restored.current=true;setSelectedContentId(detail?.content.id ?? "");const next=detail?contentDraft(detail):emptyContent();setDraft(next);setBaseline(JSON.stringify(next));setPubDraft(null);setPubBaseline("");setView("studio");}
  function editPublication(p:MarketingPublication) {restored.current=true;setSelectedPublicationId(p.id);const next=publicationDraft(p);setPubDraft(next);setPubBaseline(JSON.stringify(next));setDraft(null);setBaseline("");setView("publications");}
  async function saveContent() {
    if(!draft)throw new Error("İçerik seçin.");
    const saved=value(await bridge().saveMarketingContent(draft));
    if(mounted.current){const next=contentDraft(saved);setDraft(next);setSelectedContentId(saved.content.id);setBaseline(JSON.stringify(next));}await reload();return saved;
  }
  async function ai(capability:MarketingAiCapability,toChannel?:MarketingChannel) {
    if(!draft)return;const ticket=epoch.current;
    await action(async()=>{const result=value(await observeNexaAi(() => bridge().generateMarketingAi({capability,channel:toChannel,text:draft.masterText,instructions,aspect,styleHints:style}), "response", () => mounted.current && ticket === epoch.current));
      if(!mounted.current||ticket!==epoch.current)return;
      if(result.asset){setGenerated(result.asset);await reload();}else if(result.text)setCandidate({text:result.text,channel:toChannel});
    });
  }
  function applyCandidate() {
    if(!draft||!candidate)return;
    setDraft(candidate.channel?{...draft,variants:draft.variants.map(v=>v.channel===candidate.channel?{...v,text:candidate.text,metadata:{version:1,adaptation:"ai"}}:v)}:{...draft,masterText:candidate.text,source:"ai"});setCandidate(null);
  }
  async function preparePublic(channelId:MarketingChannel) {
    await action(async()=>{
      const detail=dirty || !draft?.id?await saveContent():snapshot!.contents.find(c=>c.content.id===draft.id)!;
      const variant=detail.variants.find(v=>v.channel===channelId);if(!variant?.text.trim())throw new Error("Önce kanal varyantını hazırlayın.");
      const existing=channelId==="website"?snapshot?.publications.find(p=>p.contentId===detail.content.id&&p.channel===channelId):undefined;
      const next:MarketingPublicationInput={...(existing?{id:existing.id,expectedRevision:existing.revision}:{}),contentId:detail.content.id,channel:channelId,placement:"homepage_feature",title:variant.title||detail.content.title,text:variant.text,
        mediaAssetIds:channelId==="instagram"?(variant.mediaAssetId?[variant.mediaAssetId]:[]):detail.media.map(m=>m.mediaAssetId)};
      if(mounted.current){setPubDraft(next);setPubBaseline(JSON.stringify(next));setPreview(true);}
    });
  }
  async function prepareCampaign() {
    if(!selectedChannel?.requiresAudience || !draft)return;
    await action(async()=>{
      const detail=dirty||!draft.id?await saveContent():snapshot!.contents.find(c=>c.content.id===draft.id)!;
      const variant=detail.variants.find(v=>v.channel===channel);
      if(channel==="sms"&&!variant?.text.trim())throw new Error("SMS varyantını hazırlayın.");
      setCampaignEntry({draft:{name:detail.content.title.slice(0,120),purpose:"marketing",channel:channel as "sms"|"whatsapp",providerId:selectedChannel.providerId as "iletimerkezi"|"whatsapp_cloud",segmentId:"",templateName:"",templateLanguage:"",bindings:[],contentId:detail.content.id,contentRevision:detail.content.revision,...(channel==="sms"?{text:variant!.text}:{})}});
      setView("campaigns");
    });
  }
  async function savePublication(publish:boolean) {
    if(!pubDraft)return;
    await action(async()=>{let saved=value(await bridge().saveMarketingPublication(pubDraft));
      if(mounted.current){setSelectedPublicationId(saved.id);const next=publicationDraft(saved);setPubDraft(next);setPubBaseline(JSON.stringify(next));}
      if(publish)saved=value(await bridge().publishMarketingPublication(saved.id,saved.revision));
      if(mounted.current){setSelectedPublicationId(saved.id);const next=publicationDraft(saved);setPubDraft(next);setPubBaseline(JSON.stringify(next));setDraft(null);setBaseline("");setPreview(false);setView("publications");setMessage(saved.channel==="instagram"?(saved.status==="published"?"Instagram yayını tamamlandı.":saved.status==="failed"?`Instagram yayını başarısız: ${saved.providerSummary?.failureCode??"operation_failed"}. Sonucu denetleyin; belirsiz gönderim tekrarlanmaz.`:"Instagram görseli işleniyor. Yayınlar ekranından durumu kontrol edin."):publish?"Website yayını hazırlanıyor. Senkron onayı bekleniyor.":"Yayın değişikliği kaydedildi.");}await reload();
    });
  }
  function openPlan(detail:MarketingScheduleDetail) {
    restored.current = true;
    setSelectedScheduleId(detail.schedule.id);const next=scheduleDraft(detail);setPlanDraft(next);setPlanBaseline(JSON.stringify(next));setDraft(null);setPubDraft(null);setView("calendar");
  }
  function createPlan(target:MarketingPublication|MessagingCampaign) {
    restored.current = true;
    setSelectedScheduleId("");
    const isPublication="mediaAssetIds" in target,timezone=calendar?.defaultTimezone??Intl.DateTimeFormat().resolvedOptions().timeZone;
    const next:MarketingScheduleInput={name:isPublication?target.title:target.name,targetType:isPublication?"public_publication":"audience_campaign",targetId:target.id,channel:target.channel,expectedTargetRevision:isPublication?target.revision:undefined,scheduleType:"once",timezone,startsLocal:scheduleLocal(new Date(Date.now()+3600000).toISOString(),timezone),missedRunPolicy:"run_once_when_resumed"};
    setPlanDraft(next);setPlanBaseline(JSON.stringify(next));setDraft(null);setPubDraft(null);setView("calendar");
  }
  async function planPublication() {
    if(!pubDraft)return;
    await action(async()=>{const saved=value(await bridge().saveMarketingPublication(pubDraft));await reload();createPlan(saved);});
  }
  useEffect(()=>{if(scheduleEntry){createPlan(scheduleEntry);onScheduleEntryConsumed?.();}},[scheduleEntry]);
  useEffect(() => {
    if (restored.current || !snapshot || !calendar && selectedScheduleId && view === "calendar") return;
    restored.current = true;
    if (view === "studio" && selectedContentId) {
      const detail = snapshot.contents.find(item => item.content.id === selectedContentId);
      if (detail) editContent(detail); else setSelectedContentId("");
    } else if (view === "publications" && selectedPublicationId) {
      const publication = snapshot.publications.find(item => item.id === selectedPublicationId);
      if (publication) editPublication(publication); else setSelectedPublicationId("");
    } else if (view === "calendar" && selectedScheduleId) {
      const plan = calendar?.schedules.find(item => item.schedule.id === selectedScheduleId);
      if (plan) openPlan(plan); else setSelectedScheduleId("");
    }
  }, [snapshot, calendar]);
  const selectedPlan=planDraft?.id?calendar?.schedules.find(d=>d.schedule.id===planDraft.id):undefined;
  if(!enabled)return <p>Pazarlama bu işletmede etkin değil.</p>;
  const activePub=pubDraft?.id?snapshot?.publications.find(p=>p.id===pubDraft.id):undefined;
  const activeVariant=draft?.variants.find(v=>v.channel===channel);
  const invalidSms = channel === "sms" && Boolean(activeVariant && (!activeVariant.text.trim() || activeVariant.text.length > 160 || /<\/?[A-Za-z][^>]*>|[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(activeVariant.text)));
  return <FeatureWorkspacePage label="Pazarlama" bodyLabel="Pazarlama çalışma alanı" layout="fill" toolbar={<>
    <FeatureViewSelector label="Pazarlama yüzeyleri" value={view} disabled={busy} onChange={id => navigate(() => setView(id))}
      items={[{id:"studio",label:"İçerik Stüdyosu"},{id:"campaigns",label:"Kampanyalar"},{id:"publications",label:"Yayınlar"},{id:"media",label:"Medya"},{id:"calendar",label:"Takvim"},{id:"analytics",label:"Analitik"}]} />
    <div className="page-toolbar__actions"><ActionButton variant="quiet" onClick={()=>navigate(()=>onSettings?.())} disabled={busy}>Kanallar / Ayarlar</ActionButton>
      <ActionButton variant="quiet" onClick={()=>void action(reload)} disabled={busy}>Durumu yenile</ActionButton></div>
    </>}><div className="marketing-page">
    {!!calendar?.schedules.some(d=>d.executions[0]?.status==="failed") && <p role="status"><ActionButton variant="secondary" onClick={()=>navigate(()=>{setView("calendar");setPlanDraft(null);})}>Başarısız pazarlama planları · Takvimi aç</ActionButton></p>}
    {message && <p role="status" className="marketing-message">{message}</p>}
    {pending && <Panel as="section" padding="compact" className="marketing-confirm" aria-label="Kaydedilmemiş değişiklikler"><p>Kaydedilmemiş değişiklikler var.</p>
      <ActionButton variant="danger" onClick={()=>{setDraft(null);setPubDraft(null);setPlanDraft(null);setCandidate(null);setGenerated(null);const next=pending;setPending(null);next();}}>Değişiklikleri bırak</ActionButton>
      <ActionButton variant="secondary" onClick={()=>setPending(null)}>Düzenlemeye dön</ActionButton></Panel>}
    {view==="campaigns"?<CampaignsPage enabled={campaignsEnabled} entry={campaignEntry} onPlan={campaign=>navigate(()=>createPlan(campaign))} registerPageLeaveGuard={guard=>{campaignGuard.current=guard;return()=>{campaignGuard.current=null;};}}/>:
    <div ref={bodyScroll} className="marketing-body">
      {view==="analytics" && <MarketingAnalytics range={analyticsRange} onRange={setAnalyticsRange}
        onCampaign={id=>navigate(()=>{setCampaignEntry({campaignId:id});setView("campaigns");})}
        onPublication={id=>navigate(()=>{const p=snapshot?.publications.find(p=>p.id===id);if(p)editPublication(p);})}/>}

      {view==="calendar" && (planDraft?<MarketingScheduleWorkspace draft={planDraft} onChange={setPlanDraft} detail={selectedPlan} channels={snapshot?.channels??[]} publication={snapshot?.publications.find(p=>p.id===planDraft.targetId)} busy={busy}
        onClose={()=>navigate(()=>{setPlanDraft(null);})}
        onSave={()=>void action(async()=>{const saved=value(await bridge().saveMarketingSchedule(planDraft));await reload();openPlan(saved);setMessage("Plan kaydedildi.");})}
        onTransition={kind=>void action(async()=>{if(!selectedPlan)return;const saved=value(await bridge().transitionMarketingSchedule(selectedPlan.schedule.id,selectedPlan.schedule.revision,kind));await reload();openPlan(saved);})}
        onResult={id=>navigate(()=>{setPlanDraft(null);const p=snapshot?.publications.find(p=>p.id===id);if(p)editPublication(p);else {setCampaignEntry({campaignId:id});setView("campaigns");}})}
        onTarget={()=>navigate(()=>{const p=snapshot?.publications.find(p=>p.id===planDraft.targetId);setPlanDraft(null);if(p)editPublication(p);else {setCampaignEntry({campaignId:planDraft.targetId});setView("campaigns");}})}
      />:<MarketingCalendar snapshot={calendar} channels={snapshot?.channels??[]} month={calendarMonth} onMonth={setCalendarMonth} onOpen={detail=>navigate(()=>openPlan(detail))}/>)}
      {view==="studio" && <div className="marketing-split"><aside ref={studioScroll} className="marketing-list" aria-label="Pazarlama içerikleri">
        <ActionButton onClick={()=>navigate(()=>editContent())} disabled={busy}>Yeni içerik</ActionButton>
        {!snapshot?.contents.length && <p>İlk duyurunuzu veya tanıtım içeriğinizi oluşturun.</p>}
        {snapshot?.contents.map(item=><DataListButton twoLine key={item.content.id} disabled={busy} selected={draft?.id===item.content.id} aria-pressed={draft?.id===item.content.id} title={item.content.title}
          meta={item.content.status==="archived"?"Arşivlenmiş":item.content.status==="ready"?"Hazır":"Taslak"} onClick={()=>navigate(()=>editContent(item))} />)}
      </aside><Panel as="section" surfaceRole="communication" className="marketing-editor" aria-label="İçerik çalışma alanı">
        {!draft?<p>Bir içerik seçin veya yeni içerik oluşturun.</p>:preview && pubDraft?<>
          <h2>{pubDraft.channel==="instagram"?"Instagram":"Website"} önizlemesi</h2><MarketingPublicationEditor draft={pubDraft} onChange={setPubDraft} assets={snapshot?.assets??[]} maxImages={snapshot?.channels.find(c=>c.id===pubDraft.channel)?.maxImages??0} busy={busy}/>
          <MarketingWebsitePreview draft={pubDraft} assets={snapshot?.assets??[]}/>
          {!snapshot?.channels.some(c=>c.id===pubDraft.channel&&c.enabled&&c.configured) && <p>Servis yapılandırılmamış. Ayarlar &gt; Servisler'den tamamlayın.</p>}
          <ActionButton disabled={busy||!snapshot?.channels.some(c=>c.id===pubDraft.channel&&c.enabled&&c.configured)||(pubDraft.channel==="instagram"&&pubDraft.mediaAssetIds.length!==1)} onClick={()=>void savePublication(true)}>{pubDraft.channel==="instagram"?"Instagram’da yayınla":"Website'te yayınla"}</ActionButton>
          {draft?.status!=="ready" && <p>Planlamak için içeriği Hazır olarak kaydedin.</p>}
          <ActionButton variant="secondary" disabled={busy||draft?.status!=="ready"} onClick={()=>void planPublication()}>Planla</ActionButton>
          <ActionButton variant="secondary" disabled={busy} onClick={()=>{setPreview(false);setPubDraft(null);setPubBaseline("");}}>İçeriğe dön</ActionButton>
        </>:<>
          <h2>{draft.id?"İçeriği düzenle":"Yeni içerik"}</h2>
          <fieldset className="form-stack" disabled={busy}>
            <label className="form-field">İçerik başlığı<input value={draft.title} maxLength={240} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
            <label className="form-field">İçerik türü<select value={draft.purpose} onChange={e=>setDraft({...draft,purpose:e.target.value as MarketingContentInput["purpose"]})}><option value="announcement">Duyuru</option><option value="promotion">Tanıtım</option></select></label>
            <label className="form-field">Ana metin<textarea aria-label="Ana metin" rows={6} value={draft.masterText} maxLength={12000} onChange={e=>setDraft({...draft,masterText:e.target.value})}/></label>
            <label className="form-field">AI yönlendirmesi<textarea aria-label="AI yönlendirmesi" rows={2} value={instructions} maxLength={2000} onChange={e=>setInstructions(e.target.value)}/><small>Müşteri adları, telefonlar, listeler veya kimlik bilgileri eklemeyin.</small></label>
            <div className="marketing-actions"><ActionButton variant="secondary" disabled={!snapshot?.aiCapabilities.includes("text_generation")} onClick={()=>void ai("text_generation")}>AI ile metin oluştur</ActionButton>
              <ActionButton variant="secondary" disabled={!snapshot?.aiCapabilities.includes("rewrite")} onClick={()=>void ai("rewrite")}>AI ile yeniden yaz</ActionButton></div>
            {!snapshot?.aiCapabilities.length && <p>Uygun AI servisi yapılandırılmamış.</p>}
            <FeatureViewSelector label="Kanal varyantları" value={channel} disabled={busy} onChange={setChannel} items={(snapshot?.channels??[]).map(c => ({id:c.id,label:c.displayName}))} />
            <p>{channelAvailable?"Etkin · Servis yapılandırılmış":"Servis yapılandırılmamış veya kapalı"}</p>
            {!channelAvailable && <ActionButton variant="secondary" onClick={()=>navigate(()=>onSettings?.())}>Servisler ayarlarına git</ActionButton>}
            {selectedChannel?.requiresConsent && <p>Segment ve kanalın pazarlama izni zorunludur. Bilinmeyen veya izin vermeyen müşterilere gönderilmez.</p>}
            {channel==="whatsapp" && <p>Bu metin düzenleme / referans taslağıdır. Gerçek WhatsApp marketing gönderimi yalnız onaylı şablon ve parametre bağlantılarıyla yapılır.</p>}
            {activeVariant && <>
              <label className="form-field">Kanal başlığı<input value={activeVariant.title??""} maxLength={240} onChange={e=>setDraft({...draft,variants:draft.variants.map(v=>v.channel===channel?{...v,title:e.target.value}:v)})}/></label>
              <label className="form-field">Kanal metni<textarea aria-label="Kanal metni" rows={5} value={activeVariant.text} maxLength={channel==="sms"?160:channel==="instagram"?2200:12000} onChange={e=>setDraft({...draft,variants:draft.variants.map(v=>v.channel===channel?{...v,text:e.target.value,metadata:{version:1,adaptation:"manual"}}:v)})}/></label>
              {channel==="sms" && <small>{activeVariant.text.length}/160 karakter · düz metin · görsel kullanılamaz. Operatör ve çıkış ekleri sağlayıcı tarafından yönetilir.</small>}
              {invalidSms && <p>SMS için boş olmayan, HTML içermeyen ve en fazla 160 karakterlik düz metin hazırlayın.</p>}
              {channel==="instagram" && <><p>Tek görsel · oran 4:5–1.91:1 · açıklama en fazla 2200 karakter.</p><MarketingMediaGallery assets={snapshot?.assets??[]} selected={activeVariant.mediaAssetId?[activeVariant.mediaAssetId]:[]} maxImages={1} onChange={ids=>setDraft({...draft,variants:draft.variants.map(v=>v.channel===channel?{...v,mediaAssetId:ids[0]}:v)})}/></>}
              <ActionButton variant="secondary" disabled={!snapshot?.aiCapabilities.includes("channel_adaptation")} onClick={()=>void ai("channel_adaptation",channel)}>AI kanal varyantı oluştur</ActionButton>
            </>}
            {candidate && <Panel as="section" padding="compact" aria-label="AI taslak önizlemesi" className="marketing-candidate"><h3>{candidate.channel?"Kanal taslağı":"Ana metin taslağı"}</h3><p>{candidate.text}</p>
              <ActionButton onClick={applyCandidate}>Taslağı uygula</ActionButton><ActionButton variant="secondary" onClick={()=>setCandidate(null)}>Taslağı bırak</ActionButton></Panel>}
            {selectedChannel?.supportsImages && channel!=="instagram" && <><h3>Medya galeri</h3><MarketingMediaGallery assets={snapshot?.assets??[]} selected={draft.mediaAssetIds} onChange={mediaAssetIds=>setDraft({...draft,mediaAssetIds})} maxImages={maxImages}/></>}
            {selectedChannel?.supportsImages && <>
            <ActionButton variant="secondary" onClick={()=>void action(async()=>{await bridge().uploadMarketingAssets().then(value);await reload();})}>Görsel yükle</ActionButton>
            <label className="form-field">Görsel oranı<select value={aspect} onChange={e=>setAspect(e.target.value as typeof aspect)}><option value="square">Kare</option><option value="landscape">Yatay</option><option value="portrait">Dikey</option></select></label>
            <label className="form-field">Görsel stil ipucu<input value={style} maxLength={500} onChange={e=>setStyle(e.target.value)}/></label>
            <ActionButton variant="secondary" disabled={!snapshot?.aiCapabilities.includes("image_generation")} onClick={()=>void ai("image_generation")}>AI ile görsel oluştur</ActionButton>
            {!snapshot?.aiCapabilities.includes("image_generation") && <small>Görsel üretimi için uygun AI servisi yapılandırılmamış.</small>}
            {generated && <Panel as="section" padding="compact" aria-label="AI görsel önizlemesi" className="marketing-candidate"><img src={generated.previewUrl} alt="AI görsel adayı"/>
              <ActionButton variant="secondary" onClick={()=>setGenerated(null)}>Kütüphanede tut</ActionButton>
              <ActionButton disabled={channel!=="instagram"&&draft.mediaAssetIds.length>=maxImages} onClick={()=>{setDraft(channel==="instagram"?{...draft,variants:draft.variants.map(v=>v.channel===channel?{...v,mediaAssetId:generated.id}:v)}:{...draft,mediaAssetIds:[...draft.mediaAssetIds,generated.id]});setGenerated(null);}}>İçeriğe ekle</ActionButton>
              <ActionButton variant="danger" onClick={()=>void action(async()=>{value(await bridge().manageMarketingAsset(generated.id,"delete"));setGenerated(null);await reload();})}>Adayı sil</ActionButton></Panel>}
            </>}
            <label className="form-field">İçerik durumu<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as MarketingContentInput["status"]})}><option value="draft">Taslak</option><option value="ready">Hazır</option><option value="archived">Arşivlenmiş</option></select></label>
            <div className="marketing-actions"><ActionButton disabled={!draft.title.trim()} onClick={()=>void action(async()=>{await saveContent();setMessage("İçerik kaydedildi.");})}>İçeriği kaydet</ActionButton>
              {channel==="website" && <ActionButton variant="secondary" disabled={draft.status==="archived"||!draft.title.trim()} onClick={()=>void preparePublic("website")}>Website önizlemesi</ActionButton>}
              {selectedChannel?.requiresAudience && <ActionButton variant="secondary" disabled={!channelAvailable||invalidSms||draft.status==="archived"||!draft.title.trim()} onClick={()=>void prepareCampaign()}>Kampanya oluştur / hazırla</ActionButton>}
              {selectedChannel?.supportsDirectPublish && channel!=="website" && <ActionButton variant="secondary" disabled={!channelAvailable||!activeVariant?.mediaAssetId||!activeVariant?.text.trim()||draft.status==="archived"||!draft.title.trim()} onClick={()=>void preparePublic(channel)}>{snapshot?.publications.some(p=>p.contentId===draft.id&&p.channel==="instagram"&&p.status==="published")?"Instagram’da yeni gönderi önizlemesi":"Instagram önizlemesi"}</ActionButton>}</div>
          </fieldset>
        </>}
      </Panel></div>}
      {view==="publications" && <div className="marketing-split"><aside ref={publicationsScroll} className="marketing-list" aria-label="Yayınlar">
        {!snapshot?.publications.length && <p>Henüz public yayın yok. İçerik Stüdyosu'ndan kanal akışını açın.</p>}
        {snapshot?.publications.map(p=><DataListButton twoLine disabled={busy} key={p.id} title={p.title} selected={pubDraft?.id===p.id} aria-pressed={pubDraft?.id===p.id}
          meta={`${snapshot.channels.find(c=>c.id===p.channel)?.displayName} · ${publicationStatus(p)}`} onClick={()=>navigate(()=>editPublication(p))} />)}
        {snapshot?.campaigns?.map(({campaign:c,dispatchedCount,pendingOutboxCount,failedCount})=><DataListButton twoLine key={c.id} disabled={busy} title={c.name}
          meta={`${snapshot.channels.find(channel=>channel.id===c.channel)?.displayName} · ${c.status} · ${dispatchedCount} kabul · ${pendingOutboxCount} bekleyen · ${failedCount} başarısız`}
          onClick={()=>navigate(()=>{setCampaignEntry({campaignId:c.id});setView("campaigns");})} />)}
      </aside><Panel as="section" surfaceRole="communication" className="marketing-editor" aria-label="Yayın çalışma alanı">{!pubDraft?<p>Bir yayın veya kampanya seçin.</p>:<>
        <h2>{activePub?.title??"Yayın"}</h2>
        {activePub && <details className="record-disclosure"><summary>Yayın bilgileri</summary><div className="record-disclosure__body">
          Sürüm {activePub.revision} · Yayındaki sürüm {activePub.publishedRevision} · {new Date(activePub.createdAt).toLocaleString("tr-TR")}
          {activePub.publishedAt && <p>Yayın: {new Date(activePub.publishedAt).toLocaleString("tr-TR")}</p>}
          {activePub.providerSummary?.mediaId && <p>Medya: {activePub.providerSummary.mediaId}</p>}
        </div></details>}<p>{activePub?publicationStatus(activePub):"Taslak"} · {activePub?.mediaAssetIds.length??0} görsel</p>
        {activePub && <ActionButton variant="secondary" disabled={busy||dirty||snapshot?.contents.find(c=>c.content.id===activePub.contentId)?.content.status!=="ready"||activePub.channel==="instagram"&&activePub.status!=="draft"} onClick={()=>navigate(()=>createPlan(activePub))}>Planla</ActionButton>}
        {activePub && <MarketingEntityAnalytics kind="publication" id={activePub.id} revision={`${activePub.revision}:${activePub.status}:${activePub.updatedAt}`}/>}
        {activePub && activePub.revision!==pubDraft.expectedRevision && <p>Kayıt değişti. Listeden yeniden açın.</p>}
        {pubDraft.channel==="instagram"?<><MarketingWebsitePreview draft={pubDraft} assets={snapshot?.assets??[]}/><p>Instagram yayını değiştirilemez / kaldırılamaz. Güncel içerik için Stüdyo’dan açıkça yeni yayın oluşturun.</p><p>{activePub?.providerSummary?.failureCode}</p>{activePub?.providerSummary?.permalink && <a href={activePub.providerSummary.permalink} target="_blank" rel="noreferrer">Instagram gönderisi</a>}<ActionButton disabled={busy||dirty||!snapshot?.channels.some(c=>c.id===pubDraft.channel&&c.enabled&&c.configured)} onClick={()=>void action(async()=>{const saved=value(await bridge().publishMarketingPublication(pubDraft.id!,pubDraft.expectedRevision!));const next=publicationDraft(saved);setPubDraft(next);setPubBaseline(JSON.stringify(next));await reload();})}>{activePub?.status==="published"?"Durumu / temizliği kontrol et":"Yayınla / durumu kontrol et"}</ActionButton></>:<>
        <MarketingPublicationEditor draft={pubDraft} onChange={setPubDraft} assets={snapshot?.assets??[]} maxImages={maxImages} busy={busy}/><MarketingWebsitePreview draft={pubDraft} assets={snapshot?.assets??[]}/>
        <div className="marketing-actions"><ActionButton disabled={busy||!canPublish} onClick={()=>void savePublication(!activePub?.desiredPublished)}>{activePub?.desiredPublished?"Yayını güncelle":"Website'te yayınla"}</ActionButton>
          {activePub && (activePub.desiredPublished || activePub.status==="failed") && <ActionButton variant="danger" disabled={busy||dirty} onClick={()=>setUnpublishConfirm(true)}>Yayından kaldır</ActionButton>}</div>
        {unpublishConfirm && <Panel as="section" padding="compact" className="marketing-confirm" aria-label="Yayından kaldırma onayı"><p>Website yayını kaldırılsın mı?</p>
          <ActionButton variant="danger" disabled={busy} onClick={()=>void action(async()=>{const saved=value(await bridge().unpublishMarketingPublication(pubDraft.id!,pubDraft.expectedRevision!));const next=publicationDraft(saved);setPubDraft(next);setPubBaseline(JSON.stringify(next));setUnpublishConfirm(false);await reload();})}>Kaldırmayı onayla</ActionButton>
          <ActionButton variant="secondary" disabled={busy} onClick={()=>setUnpublishConfirm(false)}>Vazgeç</ActionButton></Panel>}
      </>}</>}</Panel></div>}
      {view==="media" && <section aria-label="Medya kütüphanesi"><div className="marketing-actions"><ActionButton disabled={busy} onClick={()=>void action(async()=>{value(await bridge().uploadMarketingAssets());await reload();})}>Görsel yükle</ActionButton></div>
        {!snapshot?.assets.length && <p>Yüklenen ve AI ile oluşturulan görseller burada görünür.</p>}
        {assetConfirm && <Panel as="section" padding="compact" className="marketing-confirm" aria-label="Medya işlem onayı"><p>{assetConfirm.action==="delete"?"Görsel kalıcı olarak silinsin mi?":"Görsel yeni seçimlerden arşivlensin mi?"}</p>
          <ActionButton variant="danger" disabled={busy} onClick={()=>void action(async()=>{value(await bridge().manageMarketingAsset(assetConfirm.id,assetConfirm.action));setAssetConfirm(null);await reload();})}>İşlemi onayla</ActionButton><ActionButton variant="secondary" onClick={()=>setAssetConfirm(null)}>Vazgeç</ActionButton></Panel>}
        <div className="marketing-library">{snapshot?.assets.map(a=><Panel key={a.id} padding="compact" surfaceRole="communication"><img src={a.previewUrl} alt={a.altText||"Medya kütüphanesi görseli"}/><p>{a.source==="ai"?"AI görseli":"Yüklenen görsel"} · {a.width} × {a.height}</p>
          <p>{a.usageCount} kullanım · {a.activePublicationCount} aktif yayın{a.archivedAt?" · Arşivlenmiş":""}</p>
          {!a.archivedAt && <ActionButton variant="secondary" disabled={busy} onClick={()=>setAssetConfirm({id:a.id,action:"archive"})}>Arşivle</ActionButton>}
          <ActionButton variant="danger" disabled={busy||a.usageCount>0} onClick={()=>setAssetConfirm({id:a.id,action:"delete"})}>Görseli sil</ActionButton>
        </Panel>)}</div>
      </section>}
    </div>}
  </div></FeatureWorkspacePage>;
}
