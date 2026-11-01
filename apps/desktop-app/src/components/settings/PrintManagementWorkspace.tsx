import { useEffect, useRef, useState } from "react";
import { FileText, MessageCircle, Printer } from "lucide-react";
import { BUSINESS_CAPABILITIES as C, documentKindEnabled, documentTriggerCompatible, type DocumentKind, type DocumentTrigger, type DocumentOutputMode } from "@yardimci-asistan/shared";
import { useBusinessCapabilityRuntime } from "../../app/business-capability-context";
import { isSettingsSectionVisible, printSettingsDefinition } from "../../app/settings-registry";
import { ActionButton } from "../ui/ActionButton";
import { StatusBadge } from "../ui/StatusBadge";
import { DocumentTemplateCanvas, defaultDocumentLayout } from "./DocumentTemplateCanvas";
import { useDocumentPrinterSettings } from "./use-document-printer-settings";
import { useDocumentTemplateSettings } from "./use-document-template-settings";
import { useDocumentOutputSettings } from "./use-document-output-settings";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";

// Deliberately excludes invoice_copy: no legal invoice issuance service exists.
const documents: ReadonlyArray<{
  kind: DocumentKind; title: string; size: string; format: "receipt" | "sheet" | "label" | "shipping";
  lines: ReadonlyArray<readonly [string, string]>; total: string;
}> = [
  { kind: "sale_receipt", title: "Satış fişi", size: "80 × 160 mm", format: "receipt",
    lines: [["2 × Filtre kahve", "180,00 ₺"], ["1 × Sandviç", "140,00 ₺"]], total: "320,00 ₺" },
  { kind: "table_bill", title: "Adisyon", size: "80 × 160 mm", format: "receipt",
    lines: [["Masa: Bahçe 04", "2 kişi"], ["2 × Günün yemeği", "500,00 ₺"], ["2 × Ayran", "80,00 ₺"]], total: "580,00 ₺" },
  { kind: "stay_statement", title: "Konaklama dökümü", size: "A4 · 210 × 297 mm", format: "sheet",
    lines: [["Misafir", "Örnek Misafir"], ["Oda 101 · 2 gece", "3.000,00 ₺"], ["Kahvaltı", "Dahil"]], total: "3.000,00 ₺" },
  { kind: "credit_statement", title: "Borç dökümü", size: "A4 · 210 × 297 mm", format: "sheet",
    lines: [["Müşteri", "Örnek Müşteri"], ["Önceki bakiye", "1.200,00 ₺"], ["Tahsilat", "−400,00 ₺"]], total: "800,00 ₺" },
  { kind: "shipping_label", title: "Kargo etiketi", size: "100 × 150 mm", format: "shipping",
    lines: [["Alıcı", "Örnek Alıcı"], ["Teslimat", "Örnek Mahalle, No: 1"], ["Sipariş", "ÖRNEK-001"]], total: "1 paket" },
  { kind: "kitchen_ticket", title: "Mutfak siparişi", size: "80 × 160 mm", format: "receipt",
    lines: [["Masa", "Bahçe 04"], ["2 × Günün yemeği", "Az tuzlu"], ["1 × Çorba", "Sıcak"]], total: "3 porsiyon" },
  { kind: "product_label", title: "Ürün etiketi", size: "60 × 40 mm", format: "label",
    lines: [["Örnek ürün", "250 g"]], total: "89,90 ₺" }
];

const triggers: Array<[DocumentTrigger, string]> = [["manual", "Elle"], ["sale_completed", "Satış tamamlandığında"], ["table_closed", "Masa kapandığında"], ["stay_checked_out", "Konaklama çıkışında"], ["customer_statement_requested", "Müşteri dökümü istendiğinde"], ["order_dispatched", "Sipariş sevk edildiğinde"], ["shipment_created", "Gönderi oluşturulduğunda"], ["order_created", "Sipariş oluşturulduğunda"]];

/** Configuration only; the canvas remains representative sample data. */
export function PrintManagementWorkspace({ initialized, whatsappEnabled, onClose }: {
  initialized: boolean; whatsappEnabled: boolean; onClose: () => void;
}) {
  const { snapshot } = useBusinessCapabilityRuntime();
  const capabilities = snapshot?.enabledCapabilities ?? [];
  const active = isSettingsSectionVisible(printSettingsDefinition, capabilities, initialized, snapshot);
  const available = active ? documents.filter(document => documentKindEnabled(document.kind, capabilities)) : [];
  const [selectedKind, setSelectedKind] = useState<DocumentKind>("sale_receipt");
  const [selectedTrigger, setSelectedTrigger] = useState<DocumentTrigger>("manual");
  const authority = `${snapshot?.businessId ?? "locked"}:${[...capabilities].sort().join(",")}:${whatsappEnabled}:${initialized}`;
  const rules = useDocumentOutputSettings(available.map(document => document.kind), authority, active, snapshot?.businessId, whatsappEnabled);
  const templates = useDocumentTemplateSettings(available.map(document => document.kind), authority, active, snapshot?.businessId);
  const printers = useDocumentPrinterSettings(available.map(document => document.kind), authority, active, snapshot?.businessId);
  const [editing, setEditing] = useState(false);
  const selected = available.find(document => document.kind === selectedKind) ?? available[0];
  const readyKind = selected?.kind;
  const [readyJobs, setReadyJobs] = useState<{ authority: string; kind: DocumentKind; jobs: Array<{ jobId: string; createdAt: string }> } | null>(null);
  const [jobRefresh, setJobRefresh] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [printNotice, setPrintNotice] = useState("");
  const latestAuthority = useRef(authority); latestAuthority.current = authority;
  useEffect(() => {
    let cancelled = false;
    setReadyJobs(null);
    if (active && readyKind && window.yardimciDesktop?.listReadyDocuments) {
      void window.yardimciDesktop.listReadyDocuments({ documentKind: readyKind }).then(result => {
        if (!cancelled && result.ok) setReadyJobs({ authority, kind: readyKind, jobs: result.value });
      }).catch(() => { /* No fabricated fallback jobs. */ });
    }
    return () => { cancelled = true; };
  }, [active, authority, readyKind, jobRefresh]);
  const printJob = async (jobId: string) => {
    if (!selected || printing || previewing || readyJobs?.authority !== authority || readyJobs.kind !== selected.kind) return;
    const started = authority;
    setPrinting(true); setPrintNotice("");
    try {
      const result = await window.yardimciDesktop!.printReadyDocument({ documentKind: selected.kind, jobId });
      if (latestAuthority.current !== started) return;
      setPrintNotice(!result.ok ? result.message : result.value === "accepted" ? "Belge yazdırma kuyruğuna alındı." : result.value === "failed" ? "Yazdırma başarısız oldu; iş tekrar gönderilmez." : result.value === "unknown" ? "Yazdırma sonucu bilinmiyor; iş tekrar gönderilmez." : "Bu iş daha önce işlendi; tekrar gönderilmedi.");
      setJobRefresh(value => value + 1);
    } catch { if (latestAuthority.current === started) setPrintNotice("Belge işleme alınamadı."); }
    finally { setPrinting(false); }
  };
  const previewJob = async (jobId: string) => {
    if (!selected || printing || previewing || readyJobs?.authority !== authority || readyJobs.kind !== selected.kind) return;
    const started = authority;
    setPreviewing(true); setPrintNotice("");
    try {
      const result = await window.yardimciDesktop!.previewReadyDocument({ documentKind: selected.kind, jobId });
      if (latestAuthority.current === started && !result.ok) setPrintNotice(result.message);
    } catch { if (latestAuthority.current === started) setPrintNotice("Belge önizlemesi açılamadı."); }
    finally { setPreviewing(false); }
  };
  const selectedLayout = selected ? templates.layout(selected.kind) : null;
  const trigger = selected && documentTriggerCompatible(selected.kind, selectedTrigger) ? selectedTrigger : "manual";
  const channelControl = (channel: "print" | "whatsapp") => selected && <label>
    {channel === "print" ? "Yazdırma politikası" : "WhatsApp politikası"}
    <select aria-label={channel === "print" ? "Yazdırma politikası" : "WhatsApp politikası"} disabled={!rules.ready || rules.saving || printers.saving}
      value={rules.mode(selected.kind, trigger, channel)}
      onChange={event => rules.change(selected.kind, trigger, channel, event.target.value as DocumentOutputMode)}>
      <option value="OFF">Kapalı</option><option value="ASK_CONFIRMATION">{channel === "print" ? "Yazdırma onayı" : "Kullanıcı onayı"}</option>
      {channel === "print" && <option value="AUTOMATIC">Otomatik</option>}
    </select>
  </label>;
  return <WorkspaceFrame title="Baskı Yönetimi" context="Şablon tasarım önizlemesi"
    presentation="full-canvas" className="print-management" bodyScroll="panes" onClose={onClose} closeBlocked={printing || previewing || rules.dirty || rules.saving || templates.dirty || templates.saving || printers.dirty || printers.saving}
    footer={<>
      {(rules.dirty || templates.dirty || printers.dirty) && <p role="status">Kaydedilmemiş değişiklikler var. Kapatmak veya Ayarlardan ayrılmak için kaydedin ya da vazgeçin.</p>}
      {printers.error && <p role="alert">{printers.error}</p>}
      {printers.notice && <p role="status">{printers.notice}</p>}
      {templates.error && <p role="alert">{templates.error}</p>}
      {templates.notice && <p role="status">{templates.notice}</p>}
      {templates.dirty && <><ActionButton disabled={!templates.canSave || templates.saving} busy={templates.saving} onClick={() => void templates.save()}>Şablonları kaydet</ActionButton>
        <ActionButton variant="secondary" disabled={templates.saving} onClick={templates.discard}>Şablonlardan vazgeç</ActionButton></>}
      {rules.error && <p role="alert">{rules.error}</p>}
      {rules.notice && <p role="status">{rules.notice}</p>}
      {(rules.dirty || printers.dirty) && <><ActionButton disabled={(rules.dirty && !rules.canSave) || (printers.dirty && !printers.canSave) || rules.saving || printers.saving} busy={rules.saving || printers.saving}
        onClick={() => { void (async () => { if (rules.dirty) await rules.save(); if (printers.dirty) await printers.save(); })(); }}>
        {rules.dirty && printers.dirty ? "Kuralları ve yazıcıyı kaydet" : printers.dirty ? "Yazıcı ayarlarını kaydet" : "Kuralları kaydet"}</ActionButton>
        <ActionButton variant="secondary" disabled={rules.saving || printers.saving} onClick={() => { rules.discard(); printers.discard(); }}>
          {rules.dirty && printers.dirty ? "Kurallardan ve yazıcıdan vazgeç" : printers.dirty ? "Yazıcı ayarlarından vazgeç" : "Kurallardan vazgeç"}</ActionButton></>}
    </>}>
    {!active ? <p className="print-management__empty" role="status">Baskı Yönetimi için kurulumun tamamlanması ve Baskı ve Belge Paylaşımı özelliğinin kayıtlı olarak etkin olması gerekir.</p>
      : !selected ? <p className="print-management__empty" role="status">Etkin özellikleriniz için önizlenebilir belge bulunmuyor.</p>
        : <div className="print-management__layout">
          <nav className="print-management__documents" aria-label="Belge türleri">
            <h3>Belgeler</h3>
            {available.map(document => <ActionButton key={document.kind} variant="ghost" disabled={templates.saving || printing || previewing}
              aria-pressed={selected.kind === document.kind} aria-controls="print-document-preview"
              onClick={() => { setPrintNotice(""); setSelectedKind(document.kind); }}>
              <FileText size={16} aria-hidden="true" /><span>{document.title}<small>{document.size}</small></span>
            </ActionButton>)}
          </nav>
          <section className="print-management__preview" aria-label="Belge önizlemesi">
            <div className="print-management__preview-heading"><h3>{selected.title}</h3><StatusBadge tone="warning">Örnek belge</StatusBadge></div>
            <p className="print-management__hint">Temsili veriler · Mali belge değildir</p>
            <ActionButton variant="secondary" disabled={!templates.ready || templates.saving} onClick={() => setEditing(value => !value)}>{editing ? "Önizlemeye dön" : "Düzenle"}</ActionButton>
            {(editing || selectedLayout) ? <DocumentTemplateCanvas key={`${selected.kind}:${authority}`} onApplyImage={produce => templates.saveProcessedImage(selected.kind, selectedLayout ?? defaultDocumentLayout(selected.kind), produce)} documentKind={selected.kind} imageAuthority={authority} onPickImage={() => void templates.pickFormImage(selected.kind, selectedLayout ?? defaultDocumentLayout(selected.kind))} layout={selectedLayout ?? defaultDocumentLayout(selected.kind)} editing={editing} enabled={templates.ready && !templates.saving} onChange={layout => templates.stage(selected.kind, layout)} onPreset={() => templates.stage(selected.kind, defaultDocumentLayout(selected.kind, selectedLayout))} /> : <>
            <div className="print-management__canvas" id="print-document-preview" tabIndex={0} aria-label={`${selected.title} örnek görünümü`}>
              <article className={`print-management__paper print-management__paper--${selected.format}`}>
                <header><span className="print-management__sample">ÖRNEK</span><strong>Örnek İşletme</strong><span>{selected.title}</span></header>
                {selected.format !== "label" && <div className="print-management__paper-meta"><span>28.10.2026 · 14:30</span><span>Örnek no: 001</span></div>}
                <dl>{selected.lines.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
                <div className="print-management__total"><span>{selected.format === "label" ? "Fiyat" : selected.kind === "credit_statement" ? "Kalan borç" : "Toplam"}</span><strong>{selected.total}</strong></div>
                <footer>MALİ BELGE DEĞİLDİR<br />Yalnızca tasarım önizlemesi</footer>
              </article>
            </div>
            <p className="print-management__hint">{selected.size} · İlk düzenlemede belge türüne uygun başlangıç yerleşimi kullanılır.</p></>}
          </section>
          <aside className="print-management__configuration" aria-label={`${selected.title} yapılandırması`}>
            <h3>Belge ayarları</h3>
            {readyJobs?.authority === authority && readyJobs.kind === selected.kind && readyJobs.jobs.length > 0 && <section aria-label="Hazır belgeler">
              <h3>Hazır Belgeler</h3><small>Mali belge değildir</small>
              {readyJobs.jobs.map(job => <div key={job.jobId}><span>{job.createdAt} · {job.jobId.slice(0, 8)}</span>{" "}<ActionButton disabled={printing || previewing || !window.yardimciDesktop?.previewReadyDocument} onClick={() => void previewJob(job.jobId)}>Önizle</ActionButton>{" "}<ActionButton disabled={printing || previewing} onClick={() => void printJob(job.jobId)}>Yazdır</ActionButton></div>)}
            </section>}
            {printNotice && <p role="status">{printNotice}</p>}
            <p className="print-management__hint">Yazıcı seçimi bu cihaza kaydedilir. Ayarlar kaydedilir, otomasyon çalışmaz.</p>
            <label>Bu cihazın yazıcısı
              {printers.ready && (printers.printers(selected.kind).length > 0 || printers.printerRef(selected.kind)) ? <select aria-label="Bu cihazın yazıcısı" disabled={!printers.ready || printers.saving || rules.saving}
                value={printers.printerRef(selected.kind) ?? ""} onChange={event => printers.stage(selected.kind, event.target.value || null)}>
                <option value="">Yazıcı seçilmedi</option>
                {printers.printerRef(selected.kind) && !printers.printers(selected.kind).some(printer => printer.name === printers.printerRef(selected.kind)) && <option disabled value={printers.printerRef(selected.kind)!}>{printers.printerRef(selected.kind)} — bulunamıyor</option>}
                {printers.printers(selected.kind).map(printer => <option key={printer.name} value={printer.name}>{printer.displayName || printer.name}{printer.isDefault ? " (sistem varsayılanı)" : ""}</option>)}
              </select> : <span role="status">{printers.ready ? "Sistem yazıcısı bulunamadı" : "Sistem yazıcıları okunuyor…"}</span>}
            </label>
            {printers.ready && printers.printerRef(selected.kind) && !printers.printers(selected.kind).some(printer => printer.name === printers.printerRef(selected.kind)) && <p role="status">Kayıtlı yazıcı bulunamıyor. Bağlama korunur; başka yazıcıya aktarılmaz.</p>}
            <ActionButton variant="ghost" disabled={printers.saving || rules.saving} onClick={printers.refresh}>Yazıcıları yenile</ActionButton>
            <small>Yalnız bu cihaz ve seçilen belge için ayardır. Sistem listesi bağlantı durumunu garanti etmez.</small>
            <dl className="print-management__details">
              <div><dt>Şablon</dt><dd>{templates.revision(selected.kind) ? `Kayıtlı sürüm ${templates.revision(selected.kind)}` : `Örnek ${selected.title.toLocaleLowerCase("tr-TR")}`}</dd></div>
              <div><dt>Belge boyutu</dt><dd>{selectedLayout ? `${selectedLayout.pageWidth / 10} × ${selectedLayout.pageHeight / 10} mm` : selected.size}</dd></div>
            </dl>
            <label>Uygulanacak olay
              <select aria-label="Uygulanacak olay" value={trigger} disabled={!rules.ready || rules.saving || printers.saving}
                onChange={event => setSelectedTrigger(event.target.value as DocumentTrigger)}>
                {triggers.filter(([value]) => documentTriggerCompatible(selected.kind, value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <div className="print-management__channel"><Printer size={18} aria-hidden="true" /><div><strong>Yazdırma</strong>{channelControl("print")}</div></div>
            {whatsappEnabled && capabilities.includes(C.WHATSAPP) && rules.whatsappAvailable && <div className="print-management__channel"><MessageCircle size={18} aria-hidden="true" /><div><strong>WhatsApp</strong>{channelControl("whatsapp")}<small>WhatsApp Web gönderimi kullanıcı onayı gerektirir. Gönderim henüz bağlı değil.</small></div></div>}
            {!rules.ready && !rules.error && <p role="status">Kayıtlı ayarlar okunuyor…</p>}
            <p className="print-management__hint">Politikalar yalnız gelecekteki kullanım tercihleridir. Kaydetmek çıktı işi oluşturmaz.</p>
          </aside>
        </div>}
  </WorkspaceFrame>;
}
