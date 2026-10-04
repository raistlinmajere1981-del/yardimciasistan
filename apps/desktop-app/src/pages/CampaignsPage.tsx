import { useEffect, useRef, useState } from "react";
import type { BusinessMessageTemplate, BusinessMessagingResult, MessagingAudienceCounts, MessagingCampaign,
  MessagingCampaignDetail, MessagingCampaignInput, MessagingSegment, MessagingSegmentRule,
  MessagingTemplateBinding, SaveMessagingSegmentInput } from "@yardimci-asistan/shared";
import type { RegisterPageLeaveGuard } from "../app/page-navigation-guard";
import { ActionButton } from "../components/ui/ActionButton";
import { StatusBadge } from "../components/ui/StatusBadge";

const emptyCampaign = (): MessagingCampaignInput => ({ name: "", purpose: "marketing", channel: "whatsapp", providerId: "whatsapp_cloud", segmentId: "", templateName: "", templateLanguage: "", bindings: [] });
const emptySegment = (): SaveMessagingSegmentInput => ({ name: "", description: "", filterDefinition: { version: 1, rules: [] } });
const statusLabels = { draft: "Taslak", prepared: "Hazırlandı", cancelled: "İptal edildi", completed: "Tamamlandı" };
function resultValue<T>(result: BusinessMessagingResult<T>) { if (!result.ok) throw new Error(result.message); return result.value; }
function AudienceCounts({ value }: { value: MessagingAudienceCounts }) {
  return <dl className="campaign-counts" aria-label="Kitle önizlemesi">
    <div><dt>Eşleşen</dt><dd>{value.matchedCount}</dd></div><div><dt>Uygun</dt><dd>{value.eligibleCount}</dd></div>
    <div><dt>İzin bilinmiyor</dt><dd>{value.unknownConsentCount}</dd></div><div><dt>İzin vermiyor</dt><dd>{value.optedOutCount}</dd></div>
    <div><dt>Telefon eksik/geçersiz</dt><dd>{value.missingRecipientCount}</dd></div>
  </dl>;
}

/** Campaigns' single editor family: list lens + inline entity workspace/subflows. */
export function CampaignsPage({ enabled, registerPageLeaveGuard }: { enabled: boolean; registerPageLeaveGuard?: RegisterPageLeaveGuard }) {
  const [campaigns, setCampaigns] = useState<MessagingCampaign[]>([]);
  const [segments, setSegments] = useState<MessagingSegment[]>([]);
  const [templates, setTemplates] = useState<BusinessMessageTemplate[]>([]);
  const [configured, setConfigured] = useState(false);
  const [view, setView] = useState<"list" | "new" | "detail" | "segments">("list");
  const [draft, setDraft] = useState(emptyCampaign);
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
      if (configuration.configured) {
        const values = resultValue(await window.yardimciDesktop!.listBusinessMessagingTemplates());
        if (mounted.current) setTemplates(values);
      }
    });
  }, [enabled]);
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
  const selectedTemplate = templates.find((item) => item.name === draft.templateName && item.language === draft.templateLanguage);
  function selectTemplate(name: string, language: string) {
    const template = templates.find((item) => item.name === name && item.language === language);
    updateDraft({ templateName: name, templateLanguage: language,
      bindings: template?.components.map((component) => component.parameters.map(() => ({ type: "static_text", value: "" } as MessagingTemplateBinding))) ?? [] });
  }
  function updateBinding(component: number, index: number, binding: MessagingTemplateBinding) {
    updateDraft({ bindings: draft.bindings.map((group, ci) => group.map((value, pi) => ci === component && pi === index ? binding : value)) });
  }
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
      <p className="muted">Bu aşamada kitle ve bekleyen gönderim kayıtları hazırlanır. Mesaj gönderimi yapılmaz.</p>
      {view === "list" && <section className="panel form-stack" aria-label="Kampanya listesi">
        <h2>Kampanyalar</h2>
        {!campaigns.length && <p>Henüz kampanya yok. Önce bir segment kaydedin.</p>}
        {campaigns.map((item) => <div className="campaign-list-row" key={item.id}><div><strong>{item.name}</strong><small>{item.templateName} · {item.templateLanguage}</small></div>
          <StatusBadge>{statusLabels[item.status]}</StatusBadge><ActionButton variant="secondary" disabled={busy} onClick={() => void openCampaign(item.id)}>Aç</ActionButton></div>)}
      </section>}
      {view === "new" && <section className="panel form-stack" aria-label="Yeni kampanya">
        <h2>Yeni kampanya</h2>
        <label className="form-field"><span>Kampanya adı</span><input maxLength={120} value={draft.name} disabled={busy} onChange={(event) => updateDraft({ name: event.target.value })} /></label>
        <label className="form-field"><span>Segment</span><select value={draft.segmentId} disabled={busy} onChange={(event) => updateDraft({ segmentId: event.target.value })}><option value="">Segment seçin</option>{segments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="form-field"><span>Kanal</span><select value={draft.channel} disabled><option value="whatsapp">WhatsApp</option></select></label>
        <label className="form-field"><span>Sağlayıcı</span><select value={draft.providerId} disabled><option value="whatsapp_cloud">WhatsApp Business</option></select></label>
        {!configured && <p>Onaylı şablonları seçmek ve kampanya hazırlamak için Servisler → WhatsApp Business ayarlarını tamamlayın.</p>}
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
        <div className="action-row">
          <ActionButton variant="secondary" disabled={busy || !draft.segmentId} onClick={() => void action(async () => { const value = resultValue(await window.yardimciDesktop!.previewMessagingSegment(draft.segmentId, draft.channel)); if (mounted.current) setPreview(value); })}>Kitleyi önizle</ActionButton>
          <ActionButton disabled={busy || !draft.name.trim() || !draft.segmentId || !selectedTemplate?.supported} onClick={() => void action(async () => {
            const campaign = resultValue(await window.yardimciDesktop!.createMessagingCampaign(draft)); await reload();
            const value = resultValue(await window.yardimciDesktop!.getMessagingCampaign(campaign.id)); if (mounted.current) { setDetail(value); setDraft(emptyCampaign()); setView("detail"); setPreview(null); }
          })}>Taslağı kaydet</ActionButton>
        </div>
        {preview && <AudienceCounts value={preview} />}
      </section>}
      {view === "detail" && detail && <section className="panel form-stack" aria-label="Kampanya çalışma alanı">
        <div className="campaign-list-row"><h2>{detail.campaign.name}</h2><StatusBadge>{statusLabels[detail.campaign.status]}</StatusBadge></div>
        <p>WhatsApp · {detail.campaign.templateName} · {detail.campaign.templateLanguage}</p>
        {detail.campaign.preparedAt && <><p>Kitle üyeliği hazırlama anında donduruldu. Güncel iletişim tercihi gönderimden önce yeniden denetlenecek.</p>
          <dl className="campaign-counts" aria-label="Hazırlanan kitle"><div><dt>Eşleşen</dt><dd>{detail.matchedCount}</dd></div><div><dt>Hazırlamada uygun</dt><dd>{detail.eligibleCount}</dd></div><div><dt>Atlanan</dt><dd>{detail.skippedCount}</dd></div><div><dt>Bekleyen outbox</dt><dd>{detail.pendingOutboxCount}</dd></div></dl></>}
        {preview && <AudienceCounts value={preview} />}
        <div className="action-row">
          {detail.campaign.status === "draft" && <>
            <ActionButton variant="secondary" disabled={busy} onClick={() => void action(async () => { const value = resultValue(await window.yardimciDesktop!.previewMessagingCampaign(detail.campaign.id)); if (mounted.current) setPreview(value); })}>Kitleyi önizle</ActionButton>
            <ActionButton disabled={busy} onClick={() => void action(async () => { const value = resultValue(await window.yardimciDesktop!.prepareMessagingCampaign(detail.campaign.id)); if (mounted.current) { setDetail(value); setPreview(null); } await reload(); })}>Hazırla</ActionButton>
          </>}
          {["draft", "prepared"].includes(detail.campaign.status) && <ActionButton variant="danger" disabled={busy} onClick={() => void action(async () => { const value = resultValue(await window.yardimciDesktop!.cancelMessagingCampaign(detail.campaign.id)); if (mounted.current) { setDetail(value); setPreview(null); } await reload(); })}>Kampanyayı iptal et</ActionButton>}
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
