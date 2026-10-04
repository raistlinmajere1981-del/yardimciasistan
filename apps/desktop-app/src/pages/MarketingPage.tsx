import { useEffect, useRef, useState } from "react";
import { MARKETING_CHANNELS, type MarketingContentInput, type MarketingContentDetail, type MarketingPublication, type MarketingPublicationInput,
  type MarketingStudioSnapshot, type MarketingResult, type MarketingChannel, type MarketingAiCapability, type MarketingAssetView } from "@yardimci-asistan/shared";
import type { RegisterPageLeaveGuard, PageLeaveGuard } from "../app/page-navigation-guard";
import { ActionButton } from "../components/ui/ActionButton";
import { MarketingMediaGallery } from "../components/marketing/MarketingMediaGallery";
import { MarketingPublicationEditor, MarketingWebsitePreview } from "../components/marketing/MarketingPublicationEditor";
import { CampaignsPage } from "./CampaignsPage";

const emptyContent=():MarketingContentInput=>({title:"",purpose:"announcement",masterText:"",status:"draft",source:"manual",variants:MARKETING_CHANNELS.map(channel=>({channel,title:"",text:"",metadata:{version:1,adaptation:"manual"}})),mediaAssetIds:[]});
const publicationDraft=(p:MarketingPublication):MarketingPublicationInput=>({id:p.id,expectedRevision:p.revision,contentId:p.contentId,channel:p.channel,placement:p.placement,title:p.title,text:p.text,mediaAssetIds:[...p.mediaAssetIds]});
function contentDraft(detail:MarketingContentDetail):MarketingContentInput {
  return {...emptyContent(),id:detail.content.id,expectedRevision:detail.content.revision,title:detail.content.title,purpose:detail.content.purpose,masterText:detail.content.masterText,status:detail.content.status,source:detail.content.source,
    variants:MARKETING_CHANNELS.map(channel=>detail.variants.find(v=>v.channel===channel)??{channel,title:"",text:"",metadata:{version:1 as const,adaptation:"manual" as const}}).map(v=>({channel:v.channel,title:v.title??"",text:v.text,metadata:v.metadata})),mediaAssetIds:detail.media.map(m=>m.mediaAssetId)};
}
function value<T>(result:MarketingResult<T>):T {if(!result.ok)throw new Error(result.message);return result.value;}
const statuses={draft:"Taslak",publishing:"Senkron onayı bekleniyor",published:"Yayında",unpublished:"Yayından kaldırıldı",failed:"Eşitleme başarısız · yeniden denenecek"};
type View="studio"|"campaigns"|"publications"|"media";
/** One editorial workspace family; list/preview/publication modes share the same owned drafts. */
export function MarketingPage({enabled,campaignsEnabled,registerPageLeaveGuard,onSettings}:{enabled:boolean;campaignsEnabled:boolean;registerPageLeaveGuard?:RegisterPageLeaveGuard;onSettings?:()=>void}) {
  const [snapshot,setSnapshot]=useState<MarketingStudioSnapshot|null>(null),[view,setView]=useState<View>("studio");
  const [draft,setDraft]=useState<MarketingContentInput|null>(null),[baseline,setBaseline]=useState("");
  const [channel,setChannel]=useState<MarketingChannel>("website"),[instructions,setInstructions]=useState("");
  const [candidate,setCandidate]=useState<{text:string;channel?:MarketingChannel}|null>(null),[generated,setGenerated]=useState<MarketingAssetView|null>(null);
  const [aspect,setAspect]=useState<"square"|"landscape"|"portrait">("square"),[style,setStyle]=useState("");
  const [pubDraft,setPubDraft]=useState<MarketingPublicationInput|null>(null),[pubBaseline,setPubBaseline]=useState("");
  const [preview,setPreview]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [pending,setPending]=useState<(()=>void)|null>(null),[unpublishConfirm,setUnpublishConfirm]=useState(false),[assetConfirm,setAssetConfirm]=useState<{id:string;action:"archive"|"delete"}|null>(null);
  const mounted=useRef(true),epoch=useRef(0),campaignGuard=useRef<PageLeaveGuard|null>(null);
  const dirty=Boolean(draft && JSON.stringify(draft)!==baseline)||Boolean(pubDraft && JSON.stringify(pubDraft)!==pubBaseline);
  const website=snapshot?.channels.find(c=>c.id==="website"),maxImages=website?.maxImages??0;
  const canPublish=Boolean(website?.enabled && website.configured && website.supportsDirectPublish);
  const bridge=()=>window.yardimciDesktop!;
  async function reload() {const next=value(await bridge().getMarketingStudio());if(mounted.current)setSnapshot(next);}
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
  function editContent(detail?:MarketingContentDetail) {const next=detail?contentDraft(detail):emptyContent();setDraft(next);setBaseline(JSON.stringify(next));setPubDraft(null);setPubBaseline("");setView("studio");}
  function editPublication(p:MarketingPublication) {const next=publicationDraft(p);setPubDraft(next);setPubBaseline(JSON.stringify(next));setDraft(null);setBaseline("");setView("publications");}
  async function saveContent() {
    if(!draft)throw new Error("İçerik seçin.");
    const saved=value(await bridge().saveMarketingContent(draft));
    if(mounted.current){const next=contentDraft(saved);setDraft(next);setBaseline(JSON.stringify(next));}await reload();return saved;
  }
  async function ai(capability:MarketingAiCapability,toChannel?:MarketingChannel) {
    if(!draft)return;const ticket=epoch.current;
    await action(async()=>{const result=value(await bridge().generateMarketingAi({capability,channel:toChannel,text:draft.masterText,instructions,aspect,styleHints:style}));
      if(!mounted.current||ticket!==epoch.current)return;
      if(result.asset){setGenerated(result.asset);await reload();}else if(result.text)setCandidate({text:result.text,channel:toChannel});
    });
  }
  function applyCandidate() {
    if(!draft||!candidate)return;
    setDraft(candidate.channel?{...draft,variants:draft.variants.map(v=>v.channel===candidate.channel?{...v,text:candidate.text,metadata:{version:1,adaptation:"ai"}}:v)}:{...draft,masterText:candidate.text,source:"ai"});setCandidate(null);
  }
  async function prepareWebsite() {
    await action(async()=>{
      const detail=dirty || !draft?.id?await saveContent():snapshot!.contents.find(c=>c.content.id===draft.id)!;
      const variant=detail.variants.find(v=>v.channel==="website");if(!variant?.text.trim())throw new Error("Önce Website varyantını hazırlayın.");
      const next:MarketingPublicationInput={contentId:detail.content.id,channel:"website",placement:"homepage_feature",title:variant.title||detail.content.title,text:variant.text,mediaAssetIds:detail.media.map(m=>m.mediaAssetId)};
      if(mounted.current){setPubDraft(next);setPubBaseline(JSON.stringify(next));setPreview(true);}
    });
  }
  async function savePublication(publish:boolean) {
    if(!pubDraft)return;
    await action(async()=>{let saved=value(await bridge().saveMarketingPublication(pubDraft));
      if(publish)saved=value(await bridge().publishMarketingPublication(saved.id,saved.revision));
      if(mounted.current){const next=publicationDraft(saved);setPubDraft(next);setPubBaseline(JSON.stringify(next));setDraft(null);setBaseline("");setPreview(false);setView("publications");setMessage(publish?"Website yayını hazırlanıyor. Senkron onayı bekleniyor.":"Yayın değişikliği kaydedildi.");}await reload();
    });
  }
  if(!enabled)return <p>Pazarlama bu işletmede etkin değil.</p>;
  const activePub=pubDraft?.id?snapshot?.publications.find(p=>p.id===pubDraft.id):undefined;
  const activeVariant=draft?.variants.find(v=>v.channel===channel);
  return <section className="marketing-page" aria-label="Pazarlama">
    <nav className="marketing-tabs" aria-label="Pazarlama yüzeyleri">{([ ["studio","İçerik Stüdyosu"],["campaigns","Kampanyalar"],["publications","Yayınlar"],["media","Medya"] ] as const).map(([id,label])=>
      <ActionButton key={id} variant={view===id?"primary":"secondary"} aria-pressed={view===id} disabled={busy} onClick={()=>navigate(()=>{setView(id);})}>{label}</ActionButton>)}
      <ActionButton variant="secondary" onClick={()=>navigate(()=>onSettings?.())} disabled={busy}>Kanallar / Ayarlar</ActionButton>
      <ActionButton variant="secondary" onClick={()=>void action(reload)} disabled={busy}>Durumu yenile</ActionButton>
    </nav>
    {message && <p role="status" className="marketing-message">{message}</p>}
    {pending && <section className="marketing-confirm" aria-label="Kaydedilmemiş değişiklikler"><p>Kaydedilmemiş değişiklikler var.</p>
      <ActionButton variant="danger" onClick={()=>{setDraft(null);setPubDraft(null);setCandidate(null);setGenerated(null);const next=pending;setPending(null);next();}}>Değişiklikleri bırak</ActionButton>
      <ActionButton variant="secondary" onClick={()=>setPending(null)}>Düzenlemeye dön</ActionButton></section>}
    {view==="campaigns"?<CampaignsPage enabled={campaignsEnabled} registerPageLeaveGuard={guard=>{campaignGuard.current=guard;return()=>{campaignGuard.current=null;};}}/>:
    <div className="marketing-body">
      {view==="studio" && <div className="marketing-split"><aside className="marketing-list" aria-label="Pazarlama içerikleri">
        <ActionButton onClick={()=>navigate(()=>editContent())} disabled={busy}>Yeni içerik</ActionButton>
        {!snapshot?.contents.length && <p>İlk duyurunuzu veya tanıtım içeriğinizi oluşturun.</p>}
        {snapshot?.contents.map(item=><button key={item.content.id} disabled={busy} className={draft?.id===item.content.id?"is-selected":""} onClick={()=>navigate(()=>editContent(item))}>
          <strong>{item.content.title}</strong><span>{item.content.status==="archived"?"Arşivlenmiş":item.content.status==="ready"?"Hazır":"Taslak"}</span></button>)}
      </aside><section className="marketing-editor" aria-label="İçerik çalışma alanı">
        {!draft?<p>Bir içerik seçin veya yeni içerik oluşturun.</p>:preview && pubDraft?<>
          <h2>Website önizlemesi</h2><MarketingPublicationEditor draft={pubDraft} onChange={setPubDraft} assets={snapshot?.assets??[]} maxImages={maxImages} busy={busy}/>
          <MarketingWebsitePreview draft={pubDraft} assets={snapshot?.assets??[]}/>
          {!canPublish && <p>Servis yapılandırılmamış. Website bağlantısını Ayarlar &gt; Servisler'den tamamlayın.</p>}
          <ActionButton disabled={busy||!canPublish} onClick={()=>void savePublication(true)}>Website'te yayınla</ActionButton>
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
            <nav className="marketing-tabs" aria-label="Kanal varyantları">{snapshot?.channels.map(c=><ActionButton key={c.id} variant={channel===c.id?"primary":"secondary"} aria-pressed={channel===c.id} onClick={()=>setChannel(c.id)}>{c.displayName}</ActionButton>)}</nav>
            <p>{snapshot?.channels.find(c=>c.id===channel)?.configured?"Servis yapılandırılmış":"Servis yapılandırılmamış"}{!snapshot?.channels.find(c=>c.id===channel)?.supportsDirectPublish?" · Yayın desteği sonraki aşamada":""}</p>
            {activeVariant && <>
              <label className="form-field">Kanal başlığı<input value={activeVariant.title??""} maxLength={240} onChange={e=>setDraft({...draft,variants:draft.variants.map(v=>v.channel===channel?{...v,title:e.target.value}:v)})}/></label>
              <label className="form-field">Kanal metni<textarea aria-label="Kanal metni" rows={5} value={activeVariant.text} maxLength={channel==="sms"?160:12000} onChange={e=>setDraft({...draft,variants:draft.variants.map(v=>v.channel===channel?{...v,text:e.target.value,metadata:{version:1,adaptation:"manual"}}:v)})}/></label>
              <ActionButton variant="secondary" disabled={!snapshot?.aiCapabilities.includes("channel_adaptation")} onClick={()=>void ai("channel_adaptation",channel)}>AI kanal varyantı oluştur</ActionButton>
            </>}
            {candidate && <section aria-label="AI taslak önizlemesi" className="marketing-candidate"><h3>{candidate.channel?"Kanal taslağı":"Ana metin taslağı"}</h3><p>{candidate.text}</p>
              <ActionButton onClick={applyCandidate}>Taslağı uygula</ActionButton><ActionButton variant="secondary" onClick={()=>setCandidate(null)}>Taslağı bırak</ActionButton></section>}
            <h3>Medya galeri</h3><MarketingMediaGallery assets={snapshot?.assets??[]} selected={draft.mediaAssetIds} onChange={mediaAssetIds=>setDraft({...draft,mediaAssetIds})} maxImages={maxImages}/>
            <ActionButton variant="secondary" onClick={()=>void action(async()=>{await bridge().uploadMarketingAssets().then(value);await reload();})}>Görsel yükle</ActionButton>
            <label className="form-field">Görsel oranı<select value={aspect} onChange={e=>setAspect(e.target.value as typeof aspect)}><option value="square">Kare</option><option value="landscape">Yatay</option><option value="portrait">Dikey</option></select></label>
            <label className="form-field">Görsel stil ipucu<input value={style} maxLength={500} onChange={e=>setStyle(e.target.value)}/></label>
            <ActionButton variant="secondary" disabled={!snapshot?.aiCapabilities.includes("image_generation")} onClick={()=>void ai("image_generation")}>AI ile görsel oluştur</ActionButton>
            {!snapshot?.aiCapabilities.includes("image_generation") && <small>Görsel üretimi için uygun AI servisi yapılandırılmamış.</small>}
            {generated && <section aria-label="AI görsel önizlemesi" className="marketing-candidate"><img src={generated.previewUrl} alt="AI görsel adayı"/>
              <ActionButton variant="secondary" onClick={()=>setGenerated(null)}>Kütüphanede tut</ActionButton>
              <ActionButton disabled={draft.mediaAssetIds.length>=maxImages} onClick={()=>{setDraft({...draft,mediaAssetIds:[...draft.mediaAssetIds,generated.id]});setGenerated(null);}}>İçeriğe ekle</ActionButton>
              <ActionButton variant="danger" onClick={()=>void action(async()=>{value(await bridge().manageMarketingAsset(generated.id,"delete"));setGenerated(null);await reload();})}>Adayı sil</ActionButton></section>}
            <label className="form-field">İçerik durumu<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as MarketingContentInput["status"]})}><option value="draft">Taslak</option><option value="ready">Hazır</option><option value="archived">Arşivlenmiş</option></select></label>
            <div className="marketing-actions"><ActionButton disabled={!draft.title.trim()} onClick={()=>void action(async()=>{await saveContent();setMessage("İçerik kaydedildi.");})}>İçeriği kaydet</ActionButton>
              <ActionButton variant="secondary" disabled={draft.status==="archived"||!draft.title.trim()} onClick={()=>void prepareWebsite()}>Website önizlemesi</ActionButton></div>
          </fieldset>
        </>}
      </section></div>}
      {view==="publications" && <div className="marketing-split"><aside className="marketing-list" aria-label="Website yayınları">
        {!snapshot?.publications.length && <p>Henüz yayın yok. İçerik Stüdyosu'ndan Website önizlemesini açın.</p>}
        {snapshot?.publications.map(p=><button disabled={busy} key={p.id} onClick={()=>navigate(()=>editPublication(p))}><strong>{p.title}</strong><span>{statuses[p.status]}</span><small>Sürüm {p.revision} · Yayındaki sürüm {p.publishedRevision}</small></button>)}
      </aside><section className="marketing-editor" aria-label="Yayın çalışma alanı">{!pubDraft?<p>Bir website yayını seçin.</p>:<>
        <h2>{activePub?.title??"Website yayını"}</h2><p>{activePub?statuses[activePub.status]:"Taslak"} · {activePub?.mediaAssetIds.length??0} görsel</p>
        {activePub && activePub.revision!==pubDraft.expectedRevision && <p>Kayıt değişti. Listeden yeniden açın.</p>}
        <MarketingPublicationEditor draft={pubDraft} onChange={setPubDraft} assets={snapshot?.assets??[]} maxImages={maxImages} busy={busy}/><MarketingWebsitePreview draft={pubDraft} assets={snapshot?.assets??[]}/>
        <div className="marketing-actions"><ActionButton disabled={busy||!canPublish} onClick={()=>void savePublication(!activePub?.desiredPublished)}>{activePub?.desiredPublished?"Yayını güncelle":"Website'te yayınla"}</ActionButton>
          {activePub && (activePub.desiredPublished || activePub.status==="failed") && <ActionButton variant="danger" disabled={busy||dirty} onClick={()=>setUnpublishConfirm(true)}>Yayından kaldır</ActionButton>}</div>
        {unpublishConfirm && <section className="marketing-confirm" aria-label="Yayından kaldırma onayı"><p>Website yayını kaldırılsın mı?</p>
          <ActionButton variant="danger" disabled={busy} onClick={()=>void action(async()=>{const saved=value(await bridge().unpublishMarketingPublication(pubDraft.id!,pubDraft.expectedRevision!));const next=publicationDraft(saved);setPubDraft(next);setPubBaseline(JSON.stringify(next));setUnpublishConfirm(false);await reload();})}>Kaldırmayı onayla</ActionButton>
          <ActionButton variant="secondary" disabled={busy} onClick={()=>setUnpublishConfirm(false)}>Vazgeç</ActionButton></section>}
      </>}</section></div>}
      {view==="media" && <section aria-label="Medya kütüphanesi"><div className="marketing-actions"><h2>Medya kütüphanesi</h2><ActionButton variant="secondary" disabled={busy} onClick={()=>void action(async()=>{value(await bridge().uploadMarketingAssets());await reload();})}>Görsel yükle</ActionButton></div>
        {!snapshot?.assets.length && <p>Yüklenen ve AI ile oluşturulan görseller burada görünür.</p>}
        {assetConfirm && <section className="marketing-confirm" aria-label="Medya işlem onayı"><p>{assetConfirm.action==="delete"?"Görsel kalıcı olarak silinsin mi?":"Görsel yeni seçimlerden arşivlensin mi?"}</p>
          <ActionButton variant="danger" disabled={busy} onClick={()=>void action(async()=>{value(await bridge().manageMarketingAsset(assetConfirm.id,assetConfirm.action));setAssetConfirm(null);await reload();})}>İşlemi onayla</ActionButton><ActionButton variant="secondary" onClick={()=>setAssetConfirm(null)}>Vazgeç</ActionButton></section>}
        <div className="marketing-library">{snapshot?.assets.map(a=><article key={a.id}><img src={a.previewUrl} alt={a.altText||"Medya kütüphanesi görseli"}/><p>{a.source==="ai"?"AI görseli":"Yüklenen görsel"} · {a.width} × {a.height}</p>
          <p>{a.usageCount} kullanım · {a.activePublicationCount} aktif yayın{a.archivedAt?" · Arşivlenmiş":""}</p>
          {!a.archivedAt && <ActionButton variant="secondary" disabled={busy} onClick={()=>setAssetConfirm({id:a.id,action:"archive"})}>Arşivle</ActionButton>}
          <ActionButton variant="danger" disabled={busy||a.usageCount>0} onClick={()=>setAssetConfirm({id:a.id,action:"delete"})}>Görseli sil</ActionButton>
        </article>)}</div>
      </section>}
    </div>}
  </section>;
}
