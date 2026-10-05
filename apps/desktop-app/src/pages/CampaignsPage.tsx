import { useEffect, useRef, useState } from "react";
import type { BusinessMessageTemplate, BusinessMessagingResult, MessagingAudienceCounts, MessagingCampaign,
  MessagingCampaignDetail, MessagingCampaignInput, MessagingSegment, MessagingSegmentRule,
  MessagingTemplateBinding, SaveMessagingSegmentInput } from "@yardimci-asistan/shared";
import type { RegisterPageLeaveGuard } from "../app/page-navigation-guard";
import { MarketingEntityAnalytics } from "../components/marketing/MarketingEntityAnalytics";
import { ActionButton } from "../components/ui/ActionButton";
import { StatusBadge } from "../components/ui/StatusBadge";

const emptyCampaign = (): MessagingCampaignInput => ({ name: "", purpose: "marketing", channel: "whatsapp", providerId: "whatsapp_cloud", segmentId: "", templateName: "", templateLanguage: "", bindings: [] });
const emptySegment = (): SaveMessagingSegmentInput => ({ name: "", description: "", filterDefinition: { version: 1, rules: [] } });
const statusLabels = { draft: "Taslak", prepared: "Hazırlandı", running: "Gönderim sürüyor", paused: "Duraklatıldı", cancelled: "İptal edildi", completed: "Tamamlandı" };
function resultValue<T>(result: BusinessMessagingResult<T>) { if (!result.ok) throw new Error(result.message); return result.value; }
function AudienceCounts({ value }: { value: MessagingAudienceCounts }) {
  return <dl className="campaign-counts" aria-label="Kitle önizlemesi">
    <div><dt>Eşleşen</dt><dd>{value.matchedCount}</dd></div><div><dt>Uygun</dt><dd>{value.eligibleCount}</dd></div>
    <div><dt>İzin bilinmiyor</dt><dd>{value.unknownConsentCount}</dd></div><div><dt>İzin vermiyor</dt><dd>{value.optedOutCount}</dd></div>
    <div><dt>Telefon eksik/geçersiz</dt><dd>{value.missingRecipientCount}</dd></div>
  </dl>;
}

/** Campaigns' single editor family: list lens + inline entity workspace/subflows. */
export function CampaignsPage({ enabled, registerPageLeaveGuard, entry, onPlan }: { enabled: boolean; onPlan?: (campaign:MessagingCampaign)=>void; registerPageLeaveGuard?: RegisterPageLeaveGuard; entry?: { draft?: MessagingCampaignInput; campaignId?: string } }) {
  const [campaigns, setCampaigns] = useState<MessagingCampaign[]>([]);
  const [segments, setSegments] = useState<MessagingSegment[]>([]);
  const [templates, setTemplates] = useState<BusinessMessageTemplate[]>([]);
  const [configured, setConfigured] = useState(false), [smsConfigured,setSmsConfigured]=useState(false);
  const [view, setView] = useState<"list" | "new" | "detail" | "segments">(entry?.draft?"new":"list");
  const [draft, setDraft] = useState(()=>entry?.draft??emptyCampaign());
  const [segmentDraft, setSegmentDraft] = useState(emptySegment);
  const [segmentBaseline, setSegmentBaseline] = useState(() => JSON.stringify(emptySegment()));
  const [detail, setDetail] = useState<MessagingCampaignDetail | null>(null);
  const [preview, setPreview] = useState<MessagingAudienceCounts | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const mounted = useRef(true);
  const dirty = view === "new" ? JSON.stringify(draft) !== JSON.stringify(emptyCampaign())
    : view === "segments" && JSON.stringify(segmentDraft) !== segmentBaseline;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!registerPageLeaveGuard) return;
    return registerPageLeaveGuard((_destination, continueNavigation) => {
      if (busy) return false;
      if (!dirty) return true;
      setPendingLeave(() => continueNavigation); return false;
    });
  }, [busy, dirty, registerPageLeaveGuard]);
  async function action(work: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await work(); }
    catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : "Kampanya işlemi tamamlanamadı."); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function reload() {
    const bridge = window.yardimciDesktop!;
    const values = await Promise.all([bridge.listMessagingCampaigns(), bridge.listMessagingSegments()]);
    if (!mounted.current) return;
    setCampaigns(resultValue(values[0])); setSegments(resultValue(values[1]));
  }
  useEffect(() => {
    if (!enabled || !window.yardimciDesktop?.listMessagingCampaigns) return;
    void action(async () => {
      await reload();
      const configuration = await window.yardimciDesktop!.getBusinessMessagingConfiguration();
      if (!mounted.current) return;
      setConfigured(configuration.configured);
      if(window.yardimciDesktop?.getSmsConfiguration){const sms=await window.yardimciDesktop.getSmsConfiguration();if(mounted.current)setSmsConfigured(sms.configured);}
    });
  }, [enabled]);
  useEffect(() => {
    if (!enabled || !configured) { setTemplates([]); return; }
    let live = true;
    void window.yardimciDesktop!.listBusinessMessagingTemplates().then((result) => {
      if (live && mounted.current) setTemplates(resultValue(result));
    }).catch((error) => { if (live && mounted.current) setMessage(error instanceof Error ? error.message : "Şablonlar okunamadı."); });
    return () => { live = false; };
  }, [enabled, configured]);
  function navigate(next: () => void) {
    if (busy) return;
    if (dirty) { setPendingLeave(() => next); return; }
    setPreview(null); setMessage(""); next();
  }
  function updateDraft(next: Partial<MessagingCampaignInput>) { setDraft({ ...draft, ...next }); setPreview(null); }
  function updateFilter(field: MessagingSegmentRule["field"], value: string) {
    const rules = segmentDraft.filterDefinition.rules.filter((rule) => rule.field !== field);
    if (value) rules.push(field === "phone" ? { field, operator: value as "present" | "absent" }
      : { field, operator: "eq", value } as MessagingSegmentRule);
    setSegmentDraft({ ...segmentDraft, filterDefinition: { version: 1, rules } }); setPreview(null);
  }
  function filterValue(field: MessagingSegmentRule["field"]) {
    const rule = segmentDraft.filterDefinition.rules.find((item) => item.field === field);
    return !rule ? "" : rule.field === "phone" ? rule.operator : rule.value;
  }
  async function openCampaign(id: string) {
    await action(async () => { const value = resultValue(await window.yardimciDesktop!.getMessagingCampaign(id)); if (mounted.current) { setDetail(value); setView("detail"); setPreview(null); } });
  }
  useEffect(()=>{if(entry?.campaignId && enabled)void openCampaign(entry.campaignId);},[entry?.campaignId,enabled]);
  async function dispatchAction(kind: "start" | "pause" | "resume") {
    if (!detail) return;
    await action(async () => {
      const bridge = window.yardimciDesktop!, operation = kind === "start" ? bridge.startMessagingCampaign : kind === "pause" ? bridge.pauseMessagingCampaign : bridge.resumeMessagingCampaign;
      const value = resultValue(await operation(detail.campaign.id));
      if (mounted.current) setDetail(value);
      await reload();
      const current = resultValue(await bridge.getMessagingCampaign(detail.campaign.id));
      if (mounted.current) setDetail(current);
    });
  }
  const campaignId = detail?.campaign.id;
  useEffect(() => {
    if (!enabled) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.onMessagingCampaignsChanged) return;
    let live = true, version = 0;
    const refresh = async () => {
      const revision = ++version;
      try {
        const [list, configuration, sms, current] = await Promise.all([bridge.listMessagingCampaigns(), bridge.getBusinessMessagingConfiguration(), bridge.getSmsConfiguration?.(),
          view === "detail" && campaignId ? bridge.getMessagingCampaign(campaignId) : Promise.resolve(null)]);
        if (!live || !mounted.current || revision !== version) return;
        setCampaigns(resultValue(list)); setConfigured(configuration.configured);
        if (sms) setSmsConfigured(sms.configured);
        if (current) setDetail(resultValue(current));
      } catch { /* The explicit operation displays errors; background refresh keeps the last view. */ }
    };
    const disposeCampaign = bridge.onMessagingCampaignsChanged(() => { void refresh(); });
    const disposeProvider = bridge.onBusinessMessagingChanged?.(() => { void refresh(); });
    return () => { live = false; disposeCampaign(); disposeProvider?.(); };
  }, [enabled, view, campaignId]);
  const selectedTemplate = templates.find((item) => item.name === draft.templateName && item.language === draft.templateLanguage);
  function selectTemplate(name: string, language: string) {
    const template = templates.find((item) => item.name === name && item.language === language);
    updateDraft({ templateName: name, templateLanguage: language,
      bindings: template?.components.map((component) => component.parameters.map(() => ({ type: "static_text", value: "" } as MessagingTemplateBinding))) ?? [] });
  }
  function updateBinding(component: number, index: number, binding: MessagingTemplateBinding) {
    updateDraft({ bindings: draft.bindings.map((group, ci) => group.map((value, pi) => ci === component && pi === index ? binding : value)) });
  }
  const activeConfigured=(view==="detail"?detail?.campaign.channel:draft.channel)==="sms"?smsConfigured:configured;
  if (!enabled) return <div className="empty-state"><strong>Kampanyalar kapalı.</strong><p>İşletme → Ek özellikler bölümünden etkinleştirin.</p></div>;
  return <div className="campaign-page">
    <div className="action-row">
      <ActionButton variant="secondary" disabled={busy} onClick={() => navigate(() => setView("list"))}>Kampanya listesi</ActionButton>
      <ActionButton disabled={busy} onClick={() => navigate(() => { setDraft(emptyCampaign()); setView("new"); })}>Yeni kampanya</ActionButton>
      <ActionButton variant="secondary" disabled={busy} onClick={() => navigate(() => setView("segments"))}>Segmentler</ActionButton>
    </div>
    {pendingLeave && <section className="panel form-stack" aria-label="Kaydedilmemiş değişiklikler"><p>Kaydedilmemiş değişiklikler var.</p><div className="action-row">
      <ActionButton variant="danger" onClick={() => { setDraft(emptyCampaign()); setSegmentDraft(emptySegment()); setSegmentBaseline(JSON.stringify(emptySegment())); setPreview(null); const next = pendingLeave; setPendingLeave(null); next(); }}>Vazgeç ve devam et</ActionButton>
      <ActionButton variant="secondary" onClick={() => setPendingLeave(null)}>Düzenlemeye dön</ActionButton>
    </div></section>}
    <div className="campaign-workspace" aria-busy={busy}>
      {message && <p role="status">{message}</p>}
      <p className="muted">Hazırlama yalnız kitleyi dondurur. Gönderim, siz başlattıktan sonra kontrollü olarak ilerler. Kabul edilme, teslim veya okunma anlamına gelmez.</p>
      {view === "list" && <section className="panel form-stack" aria-label="Kampanya listesi">
        <h2>Kampanyalar</h2>
        {!campaigns.length && <p>Henüz kampanya yok. Önce bir segment kaydedin.</p>}
        {campaigns.map((item) => <div className="campaign-list-row" key={item.id}><div><strong>{item.name}</strong><small>{item.channel==="sms"?"SMS / İleti Merkezi":`${item.templateName} · ${item.templateLanguage}`}</small></div>
          <StatusBadge>{statusLabels[item.status]}</StatusBadge><ActionButton variant="secondary" disabled={busy} onClick={() => void openCampaign(item.id)}>Aç</ActionButton></div>)}
      </section>}
      {view === "new" && <section className="panel form-stack" aria-label="Yeni kampanya">
        <h2>Yeni kampanya</h2>
        <label className="form-field"><span>Kampanya adı</span><input maxLength={120} value={draft.name} disabled={busy} onChange={(event) => updateDraft({ name: event.target.value })} /></label>
        <label className="form-field"><span>Segment</span><select value={draft.segmentId} disabled={busy} onChange={(event) => updateDraft({ segmentId: event.target.value })}><option value="">Segment seçin</option>{segments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="form-field"><span>Kanal</span><select value={draft.channel} disabled={busy||Boolean(draft.contentId)} onChange={event=>{const channel=event.target.value as "whatsapp"|"sms";updateDraft({channel,providerId:channel==="sms"?"iletimerkezi":"whatsapp_cloud",templateName:"",templateLanguage:"",bindings:[],text:channel==="sms"?"":undefined});}}><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select></label>
        <p>{draft.channel==="sms"?"İleti Merkezi · düz metin":"WhatsApp Business · onaylı şablon"}</p>
        {!activeConfigured && <p>Servis yapılandırılmamış. Hazırlamak ve göndermek için Ayarlar → Servisler'i tamamlayın.</p>}
        {draft.channel==="sms"?<label className="form-field">SMS metni<textarea aria-label="SMS metni" maxLength={160} value={draft.text??""} disabled={busy||Boolean(draft.contentId)} onChange={e=>updateDraft({text:e.target.value})}/><small>{draft.text?.length??0}/160 karakter · yalnız düz metin</small></label>:<>
        {draft.contentId && <p>Stüdyo metni referans taslağıdır. Gerçek gönderim yalnız onaylı şablon ve aşağıdaki parametre bağlantılarıyla yapılır.</p>}
        <label className="form-field"><span>Onaylı şablon</span><select value={draft.templateName} disabled={busy} onChange={(event) => { const first = templates.find((item) => item.name === event.target.value); selectTemplate(event.target.value, first?.language ?? ""); }}>
          <option value="">Şablon seçin</option>{[...new Set(templates.map((item) => item.name))].map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label className="form-field"><span>Şablon dili</span><select value={draft.templateLanguage} disabled={busy} onChange={(event) => selectTemplate(draft.templateName, event.target.value)}><option value="">Dil seçin</option>{templates.filter((item) => item.name === draft.templateName).map((item) => <option key={item.language} value={item.language}>{item.language}</option>)}</select></label>
        {selectedTemplate && !selectedTemplate.supported && <p role="alert">Bu şablonun bileşenleri kampanyalarda desteklenmiyor.</p>}
        {selectedTemplate?.supported && selectedTemplate.components.map((component, ci) => component.parameters.map((parameter, pi) => {
          const binding = draft.bindings[ci]?.[pi];
          return <fieldset className="form-stack" key={`${ci}:${pi}`}><legend>{component.type} {parameter}</legend>
            <label className="form-field"><span>{component.type} {parameter} bağlantısı</span><select disabled={busy} value={binding?.type === "customer_field" ? binding.field : "static_text"} onChange={(event) => updateBinding(ci, pi, event.target.value === "static_text" ? { type: "static_text", value: "" } : { type: "customer_field", field: event.target.value as "customer.fullName" | "commercial.companyName" })}>
              <option value="static_text">Sabit metin</option><option value="customer.fullName">Müşteri adı</option><option value="commercial.companyName">Ticari unvan</option>
            </select></label>
            {binding?.type === "static_text" && <label className="form-field"><span>{component.type} {parameter} metni</span><input maxLength={2000} disabled={busy} value={binding.value} onChange={(event) => updateBinding(ci, pi, { type: "static_text", value: event.target.value })} /></label>}
          </fieldset>;
        }))}
        </>}
        <div className="action-row">
          <ActionButton variant="secondary" disabled={busy || !draft.segmentId} onClick={() => void action(async () => { const value = resultValue(await window.yardimciDesktop!.previewMessagingSegment(draft.segmentId, draft.channel)); if (mounted.current) setPreview(value); })}>Kitleyi önizle</ActionButton>
          <ActionButton disabled={busy || !draft.name.trim() || !draft.segmentId || (draft.channel==="sms"?!draft.text?.trim():!selectedTemplate?.supported)} onClick={() => void action(async () => {
            const campaign = resultValue(await window.yardimciDesktop!.createMessagingCampaign(draft)); await reload();
            const value = resultValue(await window.yardimciDesktop!.getMessagingCampaign(campaign.id)); if (mounted.current) { setDetail(value); setDraft(emptyCampaign()); setView("detail"); setPreview(null); }
          })}>Taslağı kaydet</ActionButton>
        </div>
        {preview && <AudienceCounts value={preview} />}
      </section>}
      {view === "detail" && detail && <section className="panel form-stack" aria-label="Kampanya çalışma alanı">
        <div className="campaign-list-row"><h2>{detail.campaign.name}</h2><StatusBadge>{statusLabels[detail.campaign.status]}</StatusBadge></div>
        <p>{detail.campaign.channel==="sms"?"SMS / İleti Merkezi":`WhatsApp · ${detail.campaign.templateName} · ${detail.campaign.templateLanguage}`}</p>{detail.campaign.channel==="sms" && <p>{detail.campaign.text}</p>}
        {detail.campaign.preparedAt && <><p>Kitle üyeliği hazırlama anında donduruldu. Güncel iletişim tercihi gönderimden önce yeniden denetlenecek.</p>
          <dl className="campaign-counts" aria-label="Hazırlanan kitle"><div><dt>Eşleşen</dt><dd>{detail.matchedCount}</dd></div><div><dt>Hazırlamada uygun</dt><dd>{detail.eligibleCount}</dd></div><div><dt>Atlanan</dt><dd>{detail.skippedCount}</dd></div><div><dt>Bekleyen outbox</dt><dd>{detail.pendingOutboxCount}</dd></div><div><dt>İşleniyor</dt><dd>{detail.claimedOutboxCount}</dd></div>
            <div><dt>Gönderim kabul edildi</dt><dd>{detail.dispatchedCount}</dd></div><div><dt>Başarısız</dt><dd>{detail.failedCount}</dd></div><div><dt>İptal</dt><dd>{detail.cancelledCount}</dd></div></dl>
          <label>İlerleme <progress aria-label="Kampanya ilerlemesi" max={Math.max(1, detail.matchedCount)} value={detail.matchedCount - detail.pendingOutboxCount - detail.claimedOutboxCount} /></label>
          <p>{detail.matchedCount - detail.pendingOutboxCount - detail.claimedOutboxCount}/{detail.matchedCount} kayıt sonuçlandı.</p></>}
        <MarketingEntityAnalytics kind="campaign" id={detail.campaign.id} revision={detail.campaign.updatedAt}/>
        {!!detail.errorCounts.length && <section aria-label="Gönderim hata özeti"><h3>Sonuçlanamayan gönderimler</h3>
          {detail.errorCounts.map(({ category, count }) => <p key={category}>{category === "submission_uncertain" ? "Sağlayıcı sonucu belirsiz; tekrar gönderilmedi" : category === "max_attempts" ? "Deneme sınırına ulaşıldı" : category === "unconfigured" || category === "account_changed" ? "Servis yapılandırması" : category.startsWith("provider_") ? "Sağlayıcı reddi" : "Şablon veya gönderim doğrulaması"}: {count}</p>)}
        </section>}
        {preview && <AudienceCounts value={preview} />}
        <div className="action-row">
          {detail.campaign.status === "draft" && <>
            <ActionButton variant="secondary" disabled={busy} onClick={() => void action(async () => { const value = resultValue(await window.yardimciDesktop!.previewMessagingCampaign(detail.campaign.id)); if (mounted.current) setPreview(value); })}>Kitleyi önizle</ActionButton>
            <ActionButton disabled={busy} onClick={() => void action(async () => { const value = resultValue(await window.yardimciDesktop!.prepareMessagingCampaign(detail.campaign.id)); if (mounted.current) { setDetail(value); setPreview(null); } await reload(); })}>Hazırla</ActionButton>
          </>}
          {detail.campaign.status === "prepared" && onPlan && <ActionButton variant="secondary" disabled={busy} onClick={()=>onPlan(detail.campaign)}>Planla</ActionButton>}
          {detail.campaign.status === "prepared" && <ActionButton disabled={busy || !activeConfigured} onClick={() => void dispatchAction("start")}>Gönderimi Başlat</ActionButton>}
          {detail.campaign.status === "running" && <ActionButton variant="secondary" disabled={busy} onClick={() => void dispatchAction("pause")}>Duraklat</ActionButton>}
          {detail.campaign.status === "paused" && <ActionButton disabled={busy || !activeConfigured} onClick={() => void dispatchAction("resume")}>Devam Et</ActionButton>}
          {["prepared", "paused"].includes(detail.campaign.status) && !activeConfigured && <p>Gönderim için ilgili servis ayarlarını tamamlayın.</p>}
          {["draft", "prepared", "running", "paused"].includes(detail.campaign.status) && <ActionButton variant="danger" disabled={busy} onClick={() => void action(async () => { const value = resultValue(await window.yardimciDesktop!.cancelMessagingCampaign(detail.campaign.id)); if (mounted.current) { setDetail(value); setPreview(null); } await reload(); })}>Kampanyayı iptal et</ActionButton>}
          <ActionButton variant="secondary" disabled={busy} onClick={() => void openCampaign(detail.campaign.id)}>Durumu yenile</ActionButton>
        </div>
      </section>}
      {view === "segments" && <section className="panel form-stack" aria-label="Segment düzenleyici">
        <h2>Segmentler</h2>
        <label className="form-field"><span>Kayıtlı segment</span><select value={segmentDraft.id ?? ""} disabled={busy} onChange={(event) => navigate(() => {
          const item = segments.find((value) => value.id === event.target.value);
          const next = item ? { id: item.id, name: item.name, description: item.description, filterDefinition: item.filterDefinition } : emptySegment();
          setSegmentDraft(next); setSegmentBaseline(JSON.stringify(next));
        })}><option value="">Yeni segment</option>{segments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="form-field"><span>Segment adı</span><input value={segmentDraft.name} maxLength={120} disabled={busy} onChange={(event) => { setSegmentDraft({ ...segmentDraft, name: event.target.value }); setPreview(null); }} /></label>
        <label className="form-field"><span>Segment açıklaması</span><input value={segmentDraft.description ?? ""} maxLength={500} disabled={busy} onChange={(event) => setSegmentDraft({ ...segmentDraft, description: event.target.value })} /></label>
        <p>Boş filtre tüm müşterileri seçer. Filtreler birlikte uygulanır; pazarlama uygunluğu ayrıca denetlenir.</p>
        <label className="form-field"><span>Bayi durumu</span><select value={filterValue("dealerStatus")} disabled={busy} onChange={(event) => updateFilter("dealerStatus", event.target.value)}><option value="">Tümü</option><option value="active">Aktif bayi</option><option value="candidate">Aday bayi</option><option value="inactive">Pasif bayi</option></select></label>
        <label className="form-field"><span>Müşteri kaynağı</span><select value={filterValue("source")} disabled={busy} onChange={(event) => updateFilter("source", event.target.value)}><option value="">Tümü</option><option value="manual">Manuel</option><option value="phone">Telefon</option><option value="whatsapp">WhatsApp</option><option value="web_form">Web formu</option><option value="web_ai">Web AI</option><option value="android">Android</option></select></label>
        <label className="form-field"><span>Telefon</span><select value={filterValue("phone")} disabled={busy} onChange={(event) => updateFilter("phone", event.target.value)}><option value="">Tümü</option><option value="present">Var</option><option value="absent">Yok</option></select></label>
        <div className="action-row"><ActionButton disabled={busy || !segmentDraft.name.trim()} onClick={() => void action(async () => {
          const item = resultValue(await window.yardimciDesktop!.saveMessagingSegment(segmentDraft)); await reload();
          if (mounted.current) { const next = { id: item.id, name: item.name, description: item.description, filterDefinition: item.filterDefinition }; setSegmentDraft(next); setSegmentBaseline(JSON.stringify(next)); setPreview(null); setMessage("Segment kaydedildi."); }
        })}>Segmenti kaydet</ActionButton>
          <ActionButton variant="secondary" disabled={busy || dirty || !segmentDraft.id} onClick={() => void action(async () => { const value = resultValue(await window.yardimciDesktop!.previewMessagingSegment(segmentDraft.id!, "whatsapp")); if (mounted.current) setPreview(value); })}>Segmenti önizle</ActionButton></div>
        {preview && <AudienceCounts value={preview} />}
      </section>}
    </div>
  </div>;
}
