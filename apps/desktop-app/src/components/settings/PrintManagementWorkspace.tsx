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
const documents: ReadonlyArray<{ kind: DocumentKind; title: string; size: string }> = [
  { kind: "sale_receipt", title: "Satış fişi", size: "80 × 160 mm" },
  { kind: "table_bill", title: "Adisyon", size: "80 × 160 mm" },
  { kind: "stay_statement", title: "Konaklama dökümü", size: "A4 · 210 × 297 mm" },
  { kind: "credit_statement", title: "Borç dökümü", size: "A4 · 210 × 297 mm" },
  { kind: "shipping_label", title: "Kargo etiketi", size: "100 × 150 mm" },
  { kind: "kitchen_ticket", title: "Mutfak siparişi", size: "80 × 160 mm" },
  { kind: "product_label", title: "Ürün etiketi", size: "60 × 40 mm" }
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
  const [savingAll, setSavingAll] = useState(false);
  const savingRef = useRef(false);
  const [saveNotice, setSaveNotice] = useState("");
  const dirty = rules.dirty || templates.dirty || printers.dirty;
  const busy = savingAll || printing || previewing || rules.saving || templates.saving || printers.saving;
  const canSave = dirty && !busy && (!templates.dirty || templates.canSave) && (!rules.dirty || rules.canSave) && (!printers.dirty || printers.canSave);
  // Each owner acknowledges its own writes. A later failure must not roll back or
  // discard acknowledged settings on another persistence surface.
  const saveAll = async () => {
    if (!canSave || savingRef.current) return;
    const started = authority;
    savingRef.current = true; setSavingAll(true); setSaveNotice("");
    try {
      for (const owner of [templates, rules, printers]) {
        if (latestAuthority.current !== started || (owner.dirty && !await owner.save())) {
          setSaveNotice("Kayıt tamamlanamadı. Kaydedilen ayarlar korundu; kalan taslakları kontrol edin.");
          return;
        }
      }
      setSaveNotice("Ayarlar kaydedildi.");
    } finally { savingRef.current = false; setSavingAll(false); }
  };
  const discardAll = () => {
    if (busy) return;
    templates.discard(); rules.discard(); printers.discard(); setSaveNotice("");
  };
  const selectedLayout = selected ? templates.layout(selected.kind) : null;
  const trigger = selected && documentTriggerCompatible(selected.kind, selectedTrigger) ? selectedTrigger : "manual";
  const channelControl = (channel: "print" | "whatsapp") => selected && <label>
    {channel === "print" ? "Yazdırma politikası" : "WhatsApp politikası"}
    <select aria-label={channel === "print" ? "Yazdırma politikası" : "WhatsApp politikası"} disabled={!rules.ready || busy}
      value={rules.mode(selected.kind, trigger, channel)}
      onChange={event => { setSaveNotice(""); rules.change(selected.kind, trigger, channel, event.target.value as DocumentOutputMode); }}>
      <option value="OFF">Kapalı</option><option value="ASK_CONFIRMATION">{channel === "print" ? "Yazdırma onayı" : "Kullanıcı onayı"}</option>
      {channel === "print" && <option value="AUTOMATIC">Otomatik</option>}
    </select>
  </label>;
  return <WorkspaceFrame title="Baskı Yönetimi"
    presentation="centered" className="print-management" bodyScroll="panes" onClose={onClose} closeBlocked={dirty || busy}
    footer={<>
      <div className="print-management__feedback" aria-live="polite">
        {[templates.error, rules.error, printers.error].filter(Boolean).length > 0 && <p role="alert">{[templates.error, rules.error, printers.error].filter(Boolean).join(" ")}</p>}
        {(saveNotice || dirty) && <p role="status">{saveNotice || "Kaydedilmemiş değişiklikler var."}</p>}
      </div>
      <div className="print-management__footer-actions">
        <ActionButton variant="secondary" disabled={!dirty || busy} onClick={discardAll}>Değişiklikleri geri al</ActionButton>
        <ActionButton disabled={!canSave} busy={savingAll} busyLabel="Kaydediliyor…" onClick={() => void saveAll()}>Kaydet</ActionButton>
      </div>
    </>}>
    {!active ? <p className="print-management__empty" role="status">Baskı Yönetimi için kurulumun tamamlanması ve Baskı ve Belge Paylaşımı özelliğinin kayıtlı olarak etkin olması gerekir.</p>
      : !selected ? <p className="print-management__empty" role="status">Etkin özellikleriniz için önizlenebilir belge bulunmuyor.</p>
        : <div className="print-management__layout">
          <nav className="print-management__documents" aria-label="Belge türleri">
            <h3>Belgeler</h3>
            {available.map(document => <ActionButton key={document.kind} variant="ghost" disabled={busy}
              aria-pressed={selected.kind === document.kind} aria-controls="print-document-preview"
              onClick={() => { setPrintNotice(""); setSelectedKind(document.kind); }}>
              <FileText size={16} aria-hidden="true" /><span>{document.title}<small>{document.size}</small></span>
            </ActionButton>)}
          </nav>
          <section className="print-management__preview" aria-label="Belge önizlemesi">
            <div className="print-management__preview-heading"><h3>{selected.title}</h3><StatusBadge tone="warning">Örnek belge</StatusBadge></div>
            <div className="print-management__mode">
              <small>{selectedLayout ? `${selectedLayout.pageWidth / 10} × ${selectedLayout.pageHeight / 10} mm` : selected.size} · Mali belge değildir</small>
              <ActionButton variant={editing ? "secondary" : "primary"} disabled={!templates.ready || busy} onClick={() => setEditing(value => !value)}>{editing ? "Önizlemeye dön" : "Düzenle"}</ActionButton>
            </div>
            <DocumentTemplateCanvas key={`${selected.kind}:${authority}`} onApplyImage={produce => { setSaveNotice(""); return templates.saveProcessedImage(selected.kind, selectedLayout ?? defaultDocumentLayout(selected.kind), produce); }} documentKind={selected.kind} imageAuthority={authority} onPickImage={() => { setSaveNotice(""); void templates.pickFormImage(selected.kind, selectedLayout ?? defaultDocumentLayout(selected.kind)); }} layout={selectedLayout ?? defaultDocumentLayout(selected.kind)} editing={editing} enabled={templates.ready && !busy} onChange={layout => { setSaveNotice(""); templates.stage(selected.kind, layout); }} onPreset={() => { setSaveNotice(""); templates.stage(selected.kind, defaultDocumentLayout(selected.kind, selectedLayout)); }} />
          </section>
          <aside className="print-management__configuration" aria-label={`${selected.title} yapılandırması`}>
            <h3>Belge ayarları</h3>
            {readyJobs?.authority === authority && readyJobs.kind === selected.kind && readyJobs.jobs.length > 0 && <section aria-label="Hazır belgeler">
              <h3>Hazır Belgeler</h3><small>Mali belge değildir</small>
              {readyJobs.jobs.map(job => <div key={job.jobId}><span>{job.createdAt} · {job.jobId.slice(0, 8)}</span>{" "}<ActionButton disabled={busy || !window.yardimciDesktop?.previewReadyDocument} onClick={() => void previewJob(job.jobId)}>Önizle</ActionButton>{" "}<ActionButton disabled={busy} onClick={() => void printJob(job.jobId)}>Yazdır</ActionButton></div>)}
            </section>}
            {printNotice && <p role="status">{printNotice}</p>}
            <label>Bu cihazın yazıcısı
              {printers.ready && (printers.printers(selected.kind).length > 0 || printers.printerRef(selected.kind)) ? <select aria-label="Bu cihazın yazıcısı" disabled={!printers.ready || busy}
                value={printers.printerRef(selected.kind) ?? ""} onChange={event => { setSaveNotice(""); printers.stage(selected.kind, event.target.value || null); }}>
                <option value="">Yazıcı seçilmedi</option>
                {printers.printerRef(selected.kind) && !printers.printers(selected.kind).some(printer => printer.name === printers.printerRef(selected.kind)) && <option disabled value={printers.printerRef(selected.kind)!}>{printers.printerRef(selected.kind)} — bulunamıyor</option>}
                {printers.printers(selected.kind).map(printer => <option key={printer.name} value={printer.name}>{printer.displayName || printer.name}{printer.isDefault ? " (sistem varsayılanı)" : ""}</option>)}
              </select> : <span role="status">{printers.ready ? "Sistem yazıcısı bulunamadı" : ""}</span>}
            </label>
            {printers.ready && printers.printerRef(selected.kind) && !printers.printers(selected.kind).some(printer => printer.name === printers.printerRef(selected.kind)) && <p role="status">Kayıtlı yazıcı bulunamıyor. Bağlama korunur; başka yazıcıya aktarılmaz.</p>}
            <ActionButton variant="ghost" disabled={busy} onClick={printers.refresh}>Yazıcıları yenile</ActionButton>
            <label>Uygulanacak olay
              <select aria-label="Uygulanacak olay" value={trigger} disabled={!rules.ready || busy}
                onChange={event => setSelectedTrigger(event.target.value as DocumentTrigger)}>
                {triggers.filter(([value]) => documentTriggerCompatible(selected.kind, value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <div className="print-management__channel"><Printer size={18} aria-hidden="true" /><div><strong>Yazdırma</strong>{channelControl("print")}</div></div>
            {whatsappEnabled && capabilities.includes(C.WHATSAPP) && rules.whatsappAvailable && <div className="print-management__channel"><MessageCircle size={18} aria-hidden="true" /><div><strong>WhatsApp</strong>{channelControl("whatsapp")}<small>Gönderim kullanıcı onayı gerektirir; henüz bağlı değil.</small></div></div>}
          </aside>
        </div>}
  </WorkspaceFrame>;
}
