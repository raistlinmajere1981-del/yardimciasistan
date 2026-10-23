import { useEffect, useId, useRef, useState } from "react";
import { ArrowDownToLine, ArrowDownUp, ArrowUpFromLine, CheckCircle2, FileSpreadsheet, FolderOpen } from "lucide-react";
import { BUSINESS_CAPABILITIES, DEFAULT_TRANSFER_PREFERENCES, PRODUCT_TRANSFER_FIELDS, CUSTOMER_TRANSFER_FIELDS } from "@yardimci-asistan/shared";
import { useBusinessCapabilityRuntime } from "../../app/business-capability-context";
import { runtimeHasCapability } from "../../app/capabilities";
import type { TransferEntity, TransferSource, TransferPreview, TransferPreferences, TransferResult, TransferRow, TransferStatus, TransferFormat, TransferExportOptions, TransferFileResult, TransferExportSummary, TransferProgress } from "../../../electron/data-transfer-contract";
import type { CustomerListQuery } from "../../../electron/database/customer-store";
import { ModalSurface } from "../ui/ModalSurface";
import { WorkspaceHeader } from "../workspace/WorkspaceHeader";
import { DetailSectionCard, DetailWorkspaceLayout } from "../workspace/DetailWorkspaceLayout";
import { ActionButton } from "../ui/ActionButton";
import { IconButton } from "../ui/IconButton";
import { ChoiceChips } from "../ui/ChoiceChips";
import { StatusBadge } from "../ui/StatusBadge";
import { DataList, DataListButton } from "../ui/DataList";

const statusLabel: Record<TransferStatus, string> = { new: "Yeni", update: "Güncellenecek", skip: "Atlanacak", error: "Hatalı" };
const entityLabel: Record<TransferEntity, string> = { products: "Ürün", customers: "Müşteri", menu: "Menü" };
const tools = [
  { id: "import", label: "İçe Aktar", description: "Dosyadan kayıt ekle veya güncelle", icon: ArrowDownToLine },
  { id: "export", label: "Dışa Aktar", description: "Kayıtlarını dosyaya kaydet", icon: ArrowUpFromLine },
  { id: "template", label: "Şablon İndir", description: "Doldurabileceğin boş dosyayı al", icon: FileSpreadsheet }
] as const;
type TransferMode = typeof tools[number]["id"];
interface TransferProps {
  entity: TransferEntity;
  search?: string;
  quickAccessOnly?: boolean;
  customerFilter?: CustomerListQuery["filter"];
  menuCategoryId?: string;
  onChanged: () => void | Promise<void>;
}

export function DataTransferLauncher(props: TransferProps) {
  const [open, setOpen] = useState(false);
  const label = `${entityLabel[props.entity]} verilerini içe/dışa aktar`;
  return <>
    <IconButton aria-label={label} title={label} onClick={() => setOpen(true)}><ArrowDownUp size={18} aria-hidden="true" /></IconButton>
    {open && <DataTransferOverlay {...props} onClose={() => setOpen(false)} />}
  </>;
}

export function DataTransferOverlay({ entity, search = "", quickAccessOnly = false, customerFilter = "all", menuCategoryId = "", onChanged, onClose }: TransferProps & { onClose: () => void }) {
  const bridge = window.yardimciDesktop?.dataTransfer;
  const { snapshot: runtime } = useBusinessCapabilityRuntime();
  const online = runtimeHasCapability(runtime, BUSINESS_CAPABILITIES.ONLINE_SALES);
  const inventory = runtimeHasCapability(runtime, BUSINESS_CAPABILITIES.INVENTORY);
  const menu = runtimeHasCapability(runtime, BUSINESS_CAPABILITIES.FOOD_MENU);
  const productTransfer = entity !== "customers";
  const titleId = useId(), fields = productTransfer ? PRODUCT_TRANSFER_FIELDS : CUSTOMER_TRANSFER_FIELDS;
  const [mode, setMode] = useState<TransferMode>("import");
  const [stage, setStage] = useState<"prepare" | "confirm" | "result">("prepare");
  const [source, setSource] = useState<TransferSource | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preferences, setPreferences] = useState<TransferPreferences>(() => ({
    ...DEFAULT_TRANSFER_PREFERENCES, ...(entity === "menu" ? { menuCategoryId: menuCategoryId || "__source__" } : {})
  }));
  const [preview, setPreview] = useState<TransferPreview | null>(null), [result, setResult] = useState<TransferResult | null>(null);
  const [rows, setRows] = useState<TransferRow[]>([]), [filter, setFilter] = useState<TransferStatus | "all">("all"), [offset, setOffset] = useState(0), [detail, setDetail] = useState<TransferRow | null>(null);
  const [busy, setBusy] = useState(false), busyRef = useRef(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [progress, setProgress] = useState<TransferProgress>({ stage: "", done: 0, total: 0 });
  const [format, setFormat] = useState<TransferFormat>("zip"), [scope, setScope] = useState<"all" | "filtered">("all"), [includeImages, setIncludeImages] = useState(true), [includeIdentity, setIncludeIdentity] = useState(false);
  const [exportMenuCategoryId, setExportMenuCategoryId] = useState(menuCategoryId);
  const [template, setTemplate] = useState<"full" | "basic" | "ideasoft">("full"), [summary, setSummary] = useState<TransferExportSummary | null>(null), [fileResult, setFileResult] = useState<TransferFileResult | null>(null);
  const [menuCategories, setMenuCategories] = useState<{ id: string; name: string }[]>([]), [publicationUnderstood, setPublicationUnderstood] = useState(false);
  const sourceToken = useRef("");
  sourceToken.current = source?.token ?? "";
  useEffect(() => bridge?.onProgress(setProgress), [bridge]);
  useEffect(() => () => { if (sourceToken.current) void bridge?.release(sourceToken.current).catch(() => {}); }, [bridge]);
  useEffect(() => {
    if (!menu || !window.yardimciDesktop?.getDashboardData) return;
    let current = true;
    void window.yardimciDesktop.getDashboardData().then(data => { if (current) setMenuCategories(data.menu.categories); }).catch(() => {});
    return () => { current = false; };
  }, [menu, result]);
  const exportOptions: TransferExportOptions = { entity, format, scope, search, quickAccessOnly, customerFilter, menuCategoryId: exportMenuCategoryId, includeImages, includeIdentity, ...(mode === "template" ? { template } : {}) };
  useEffect(() => {
    if (mode === "import" || !bridge) return;
    let current = true;
    setSummary(null);
    void bridge.summary({ entity, format, scope, search, quickAccessOnly, customerFilter, menuCategoryId: exportMenuCategoryId, includeImages, includeIdentity, ...(mode === "template" ? { template } : {}) })
      .then(value => { if (current) setSummary(value); }).catch(e => { if (current) setError(message(e)); });
    return () => { current = false; };
  }, [bridge, customerFilter, entity, exportMenuCategoryId, format, includeIdentity, includeImages, mode, scope, search, quickAccessOnly, template]);
  useEffect(() => {
    if (!source || !preview || !bridge) return;
    let current = true;
    void bridge.rows(source.token, filter, offset).then(value => { if (current) { setRows(value); setDetail(null); } }).catch(e => { if (current) setError(message(e)); });
    return () => { current = false; };
  }, [bridge, filter, offset, preview, result, source]);

  async function run(operation: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setNotice(""); setProgress({ stage: "İşlem hazırlanıyor", done: 0, total: 0 });
    try { if (!bridge) throw new Error("Masaüstü aktarım bağlantısı kullanılamıyor."); await operation(); }
    catch (e) { setError(message(e)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function invalidate() { setPreview(null); setResult(null); setDetail(null); setRows([]); setStage("prepare"); setPublicationUnderstood(false); }
  function preference<K extends keyof TransferPreferences>(key: K, value: TransferPreferences[K]) { setPreferences(previous => ({ ...previous, [key]: value })); invalidate(); }
  function acceptSource(value: TransferSource | null) { if (!value) return; setSource(value); setMapping(value.mapping); setFilter("all"); setOffset(0); invalidate(); }
  async function upload(file: File) {
    await run(async () => {
      if (file.size > 32 * 1024 * 1024) throw new Error("Dosya 32 MB sınırını aşıyor.");
      acceptSource(await bridge!.upload(entity, file.name, new Uint8Array(await file.arrayBuffer())));
    });
  }
  const applicable = preview ? preview.counts.new + preview.counts.update : 0;
  const close = () => { if (!busyRef.current) onClose(); };
  const reset = () => { if (source) void bridge?.release(source.token).catch(() => {}); setSource(null); invalidate(); setError(""); setNotice(""); };
  const rowTotal = result ? (filter === "all" ? result.added + result.updated + result.skipped + result.errors : filter === "new" ? result.added : filter === "update" ? result.updated : filter === "skip" ? result.skipped : result.errors) : preview ? (filter === "all" ? preview.total : preview.counts[filter]) : 0;
  const selectedMenuCategory = menuCategories.find(category => category.id === preferences.menuCategoryId)?.name;
  const filteredMenuCategory = menuCategories.find(category => category.id === exportMenuCategoryId)?.name;
  const canConfirm = !busy && !!preview && applicable > 0 && (!preferences.publish || publicationUnderstood);
  function selectMode(value: TransferMode) { if (busyRef.current) return; setMode(value); setFileResult(null); setError(""); setNotice(""); }
  function changeExportOption(operation: () => void) { operation(); setFileResult(null); setError(""); setNotice(""); }
  async function analyze() {
    await run(async () => {
      const next = await bridge!.preview(source!.token, mapping, preferences);
      setPreview(next); setRows(next.rows); setOffset(0); setFilter("all"); setDetail(null);
    });
  }

  const rail = <>
    <DetailSectionCard title="Aktarım araçları">
      <DataList>{tools.map(tool => <DataListButton key={tool.id} title={tool.label} description={tool.description}
        aria-label={tool.label}
        leading={<tool.icon size={18} aria-hidden="true" />} selected={mode === tool.id} aria-pressed={mode === tool.id}
        disabled={busy} onClick={() => selectMode(tool.id)} />)}</DataList>
    </DetailSectionCard>
    {mode === "import" ? <DetailSectionCard title="İçe aktarma tercihleri">
      <fieldset disabled={busy || stage !== "prepare"} className="data-transfer-overlay__controls">
        <label className="form-field"><span>Eşleşen kayıtlar</span><select value={preferences.conflicts} onChange={e => preference("conflicts", e.target.value as "skip" | "update")}><option value="skip">Mevcut kaydı koru ve atla</option><option value="update">Eşlenen alanları güncelle</option></select></label>
        {productTransfer && <>
          {menu && <label className="form-field"><span>{entity === "menu" ? "Hedef menü kategorisi" : "Restoran menüsüne ekle"}</span><select value={preferences.menuCategoryId} onChange={e => preference("menuCategoryId", e.target.value)}>
            {entity !== "menu" && <option value="">Ekleme · yalnız katalogda tut</option>}
            <option value="__source__">Dosyadaki menü kategorileri</option>{menuCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select></label>}
          <label className="form-check"><input type="checkbox" checked={preferences.activate} onChange={e => preference("activate", e.target.checked)} />Yeni ürünleri aktif yap</label>
          <label className="form-check"><input type="checkbox" disabled={!online} checked={preferences.publish} onChange={e => preference("publish", e.target.checked)} />Webde yayınla{!online && " · Online Satış etkin değil"}</label>
          <label className="form-check"><input type="checkbox" disabled={!inventory} checked={preferences.applyStock} onChange={e => preference("applyStock", e.target.checked)} />Doğrulanmış stok miktarını sayım olarak uygula</label>
          <label className="form-check"><input type="checkbox" checked={preferences.fallbackCategory} onChange={e => preference("fallbackCategory", e.target.checked)} />Katalog kategorisi eksikse Diğer'e al</label>
          <label className="form-field"><span>Belirtilen görsel bulunamazsa</span><select value={preferences.missingImages} onChange={e => preference("missingImages", e.target.value as "without" | "skip")}><option value="without">Görselsiz al, sonucu raporla</option><option value="skip">Satırı atla</option></select></label>
        </>}
      </fieldset>
      {productTransfer && <p className="data-transfer-overlay__hint">Yeni ürünler varsayılan olarak pasif taslaktır. {entity === "menu" ? "Menü bağlantısı kurulsa da ürün etkinleştirilene kadar sunulmaz. Yeni menü kategorileri pasif oluşturulur." : "Menü bağlantısı seçilmezse yalnız kataloğa kaydedilir."}</p>}
      {entity === "menu" && <p className="data-transfer-overlay__hint">Ortak ürün alanlarındaki güncellemeler ürünün kullanıldığı diğer satış kanallarını da etkiler.</p>}
    </DetailSectionCard> : <DetailSectionCard title={mode === "template" ? "Aktarım şablonu" : "Dışa aktarma seçenekleri"}>
      <fieldset disabled={busy} className="data-transfer-overlay__controls">
        {mode === "export" ? <label className="form-field"><span>Kapsam</span><select value={scope} onChange={e => changeExportOption(() => setScope(e.target.value as "all" | "filtered"))}>
          <option value="all">{entity === "menu" ? "Menüdeki tüm ürünler" : "Aktif işletmenin tüm kayıtları"}</option>
          <option value="filtered">{entity === "menu" ? (filteredMenuCategory ? `Seçili kategori · ${filteredMenuCategory}` : "Tüm menü · kategori seçilmedi") : "Mevcut arama ve filtre"}</option>
        </select></label> : <label className="form-field"><span>Şablon</span><select value={template} onChange={e => changeExportOption(() => setTemplate(e.target.value as typeof template))}><option value="full">Yardımcı Asistan (tam)</option><option value="basic">Genel Excel/CSV (temel)</option>{entity === "products" && <option value="ideasoft">IdeaSoft eşleme</option>}</select></label>}
        {mode === "export" && entity === "menu" && scope === "filtered" && <label className="form-field"><span>Menü kategorisi</span><select value={exportMenuCategoryId} onChange={e => changeExportOption(() => setExportMenuCategoryId(e.target.value))}><option value="">Tüm menü kategorileri</option>{menuCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}
        <label className="form-field"><span>Dosya biçimi</span><select value={format} onChange={e => changeExportOption(() => setFormat(e.target.value as TransferFormat))}><option value="csv">CSV · Excel uyumlu</option><option value="xlsx">Excel XLSX</option><option value="zip">Yardımcı Asistan ZIP</option></select></label>
        {productTransfer && format === "zip" && mode === "export" && <label className="form-check"><input type="checkbox" checked={includeImages} onChange={e => changeExportOption(() => setIncludeImages(e.target.checked))} />Görselleri arşive dahil et</label>}
        {entity === "customers" && <label className="form-check"><input type="checkbox" checked={includeIdentity} onChange={e => changeExportOption(() => setIncludeIdentity(e.target.checked))} />Kimlik, pasaport ve belge alanlarını bilinçli olarak dahil et</label>}
      </fieldset>
      {entity === "customers" && <p className="data-transfer-overlay__hint">Kimlik ve belge alanları varsayılan olarak dahil edilmez. Dosya yalnız seçtiğin yerel konuma kaydedilir.</p>}
    </DetailSectionCard>}
    <div className="data-transfer-overlay__hint data-transfer-overlay__limits"><strong>Dosya sınırları</strong><span>CSV, XLSX veya ZIP</span><span>En fazla 32 MB · 10.000 kayıt</span></div>
  </>;

  return <ModalSurface labelledBy={titleId} className="workspace-frame data-transfer-overlay" onClose={close} closeBlocked={busy}>
    <WorkspaceHeader title={`${entityLabel[entity]} İçe/Dışa Aktar`} titleId={titleId} context={entity === "menu" ? "Menü ürünleri ve menü ilişkileri" : "Yerel dosyayla veri aktarımı"} onClose={close} closeLabel="Aktarım panelini kapat" closeBlocked={busy} />
    <div className="workspace-frame__body workspace-frame__body--panes data-transfer-overlay__body" aria-busy={busy}>
      <DetailWorkspaceLayout rail={rail} railLabel="Aktarım yönetimi" contentLabel="Aktarım işlemi">
        {error && <p role="alert" className="form-error">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {busy && <div role="status" aria-live="polite" className="data-transfer-overlay__progress"><span>{progress.stage} {progress.total > 0 ? `${progress.done} / ${progress.total}` : ""}</span><progress aria-label="Aktarım ilerlemesi" value={progress.total ? progress.done : undefined} max={progress.total || 1} /></div>}
        {mode === "import" && <ol className="data-transfer-overlay__steps" aria-label="İçe aktarma adımları">
          {["Dosya ve önizleme", "Kontrol ve onay", "İşlem sonucu"].map((label, index) => <li key={label} aria-current={index === (stage === "prepare" ? 0 : stage === "confirm" ? 1 : 2) ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}
        </ol>}
        <fieldset disabled={busy} className="data-transfer-overlay__controls">
          {mode === "import" && stage === "prepare" && <>
            <DetailSectionCard title="Dosya ve kolon eşleme" actions={source && <StatusBadge>{Object.keys(mapping).length} alan eşlendi</StatusBadge>}>
              <div onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file && !busyRef.current) void upload(file); }} className={`data-transfer-overlay__drop${source ? " has-source" : ""}`}>
                <FolderOpen size={28} aria-hidden="true" />
                <div><strong>{source ? `${source.name} · ${source.format.toUpperCase()} · ${source.total} kayıt` : "Aktarılacak dosyayı seç"}</strong><p>{source ? "Dosyayı kontrol et, alanları eşle ve analiz et." : "Dosyanı buraya bırakabilir veya bilgisayarından seçebilirsin."}</p></div>
                <ActionButton variant="secondary" onClick={() => { void run(async () => acceptSource(await bridge!.pick(entity))); }}>{source ? "Dosyayı değiştir" : "Dosya seç"}</ActionButton>
              </div>
              {source ? <>
                {source.warnings.map(warning => <p key={warning}>{warning}</p>)}
                <details className="data-transfer-overlay__mapping"><summary>Kolon eşlemesini düzenle</summary><p className="data-transfer-overlay__hint">Her uygulama alanı için dosyadaki karşılığını seç. Eşlenmeyen alanlar aktarılmaz.</p><div className="data-transfer-overlay__grid">
                  {Object.entries(fields).map(([key, label]) => <label key={key} className="form-field"><span>{label}</span><select value={mapping[key] ?? ""} onChange={event => { const next = { ...mapping }; if (event.target.value) next[key] = event.target.value; else delete next[key]; setMapping(next); invalidate(); }}><option value="">Aktarılmayacak</option>{source.headers.map(header => <option key={header} value={header}>{header}</option>)}</select></label>)}
                </div></details>
                <div className="data-transfer-overlay__actions"><span className="data-transfer-overlay__hint">{preview ? "Tercih veya eşleme değişirse yeniden analiz et." : "Analiz verileri değiştirmez. Sonuçları onaydan önce inceleyebilirsin."}</span><ActionButton onClick={() => void analyze()}>Analiz et ve önizle</ActionButton></div>
              </> : <div className="data-transfer-overlay__guide"><h4>Üç adımda aktar</h4><p>1. Dosyanı seç ve soldaki tercihleri düzenle.</p><p>2. Alanları eşle, yeni ve hatalı kayıtları önizle.</p><p>3. Değişiklikleri kontrol et ve içe aktarmayı onayla.</p><ActionButton variant="link" onClick={() => selectMode("template")}>Dosyan hazır değil mi? Şablon indir</ActionButton></div>}
            </DetailSectionCard>
            {!preview && source && <div className="data-transfer-overlay__guide"><h4>Dosya hazır, sırada önizleme var</h4><p>Analizden sonra eklenecek, güncellenecek, atlanacak ve hatalı kayıtları burada görebilirsin.</p></div>}
          </>}
          {mode === "import" && stage === "confirm" && preview && <DetailSectionCard title="Aktarımı onayla">
            <p>{preview.counts.new} yeni, {preview.counts.update} güncelleme, {preview.counts.skip} atlanacak, {preview.counts.error} hatalı kayıt.</p>
            <p>Etkilenecek {productTransfer ? "ürün" : "müşteri"} sayısı: {applicable}.</p>
            <dl className="data-transfer-overlay__review"><div><dt>Eşleşen kayıtlar</dt><dd>{preferences.conflicts === "update" ? "Eşlenen alanlar güncellenecek" : "Korunacak ve atlanacak"}</dd></div>
              {productTransfer && <><div><dt>Yeni ürünler</dt><dd>{preferences.activate ? "Aktif" : "Pasif taslak"}</dd></div><div><dt>Web yayını</dt><dd>{preferences.publish ? `${preview.publishable} yayınlanabilir · ${preview.blocked} engelli` : "Yeni yayın yapılmayacak"}</dd></div><div><dt>Mevcut web yayınları</dt><dd>{preview.existingPublished} ürünün yayını korunarak güncellenecek</dd></div><div><dt>Stok miktarı</dt><dd>{preferences.applyStock ? "Sayım uygulanacak" : "Değiştirilmeyecek"}</dd></div><div><dt>Menü bağlantısı</dt><dd>{preferences.menuCategoryId === "__source__" ? "Dosyadaki menü kategorileri" : selectedMenuCategory || "Eklenmeyecek"}</dd></div></>}
            </dl>
            <p>Onayladığında doğrulanan kayıtlar yerel veritabanına yazılır. Hatalı ve atlanacak kayıtlar uygulanmaz.</p>
          </DetailSectionCard>}
          {mode === "import" && stage === "result" && result && <DetailSectionCard title="İçe aktarma sonucu">
            <div role="status"><CheckCircle2 size={24} aria-hidden="true" /><p>Eklenen: {result.added} · Güncellenen: {result.updated} · Atlanan: {result.skipped} · Hata: {result.errors}</p><p>{result.errors ? "İşlem hatalarla tamamlandı; aşağıdaki raporu inceleyin." : result.added + result.updated > 0 ? "Kayıtlar uygulandı." : "Hiçbir kayıt değiştirilmedi."}</p></div>
            <ActionButton variant="secondary" onClick={() => { void run(async () => { const file = await bridge!.report(source!.token); if (!file.cancelled) setNotice(`Sonuç raporu kaydedildi: ${file.path}`); }); }}>Sonuç raporunu indir</ActionButton>
          </DetailSectionCard>}
          {mode === "import" && preview && stage !== "confirm" && <DetailSectionCard title={stage === "result" ? "Satır sonuçları" : "Önizleme"}>
            {stage === "prepare" && <><div className="data-transfer-overlay__counts"><StatusBadge>Toplam {preview.total}</StatusBadge>{Object.entries(preview.counts).map(([status, count]) => <StatusBadge key={status} tone={status === "error" ? "danger" : "neutral"}>{statusLabel[status as TransferStatus]} {count}</StatusBadge>)}</div>
              {productTransfer && <p className="data-transfer-overlay__hint">Yayınlanabilir: {preview.publishable} · Yayın engelli: {preview.blocked}. Mevcut yayını etkilenecek: {preview.existingPublished}. {preferences.publish ? "Yalnız yayınlanabilir kayıtlar yayınlanır." : "Yeni web yayını yapılmayacak."}</p>}
              {preferences.publish && <label className="form-check"><input type="checkbox" checked={publicationUnderstood} onChange={e => setPublicationUnderstood(e.target.checked)} />Yayınlanacak {preview.publishable} kaydı ve {preview.blocked} engelli kaydın nedenlerini inceledim.</label>}
            </>}
            <ChoiceChips ariaLabel={stage === "result" ? "Sonuç satır filtresi" : "Aktarım satır filtresi"} value={filter} onChange={value => { setFilter(value); setOffset(0); }} options={[{ id: "all", label: "Tümü" }, ...Object.entries(statusLabel).map(([id, label]) => ({ id: id as TransferStatus, label }))]} />
            <DataList>{rows.map(row => <DataListButton key={row.row} title={`${row.row}. ${row.name}`} meta={[...row.reasons, ...row.warnings].join(" · ") || (stage === "result" ? "Kayıt uygulandı." : "Ayrıntıları incelemek için seç.")}
              selected={detail?.row === row.row} trailing={<StatusBadge tone={row.status === "error" ? "danger" : "neutral"}>{statusLabel[row.status]}</StatusBadge>} onClick={() => setDetail(row)} />)}</DataList>
            {rowTotal === 0 && <p className="data-transfer-overlay__hint">Bu filtrede kayıt yok.</p>}
            <div className="data-transfer-overlay__actions"><ActionButton variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Önceki satırlar</ActionButton><span>{Math.min(offset + 1, rowTotal)}–{Math.min(offset + 50, rowTotal)} / {rowTotal}</span><ActionButton variant="secondary" disabled={offset + 50 >= rowTotal} onClick={() => setOffset(offset + 50)}>Sonraki satırlar</ActionButton></div>
            {detail && <div><h4>Satır {detail.row}: {detail.name}</h4><p>{[...detail.reasons, ...detail.warnings].join(" · ") || "Kayıt doğrulandı."}</p><div className="data-transfer-overlay__table"><table><thead><tr><th>Alan / kaynak kolon</th><th>Eski değer</th><th>Yeni değer</th></tr></thead><tbody>{Object.entries(detail.after).map(([key, value]) => <tr key={key}><th>{fields[key] ?? key}<small>{mapping[key]}</small></th><td>{detail.before[key] || "—"}</td><td>{value || "—"}</td></tr>)}</tbody></table></div></div>}
          </DetailSectionCard>}
          {mode !== "import" && <DetailSectionCard title={mode === "template" ? "Şablon içeriği" : "Dışa aktarma özeti"}>
            <FileSpreadsheet size={28} aria-hidden="true" />
            {mode === "export" ? <><h4>{entity === "menu" ? "Menü ürünlerini dosyaya kaydet" : `${entityLabel[entity]} kayıtlarını dosyaya kaydet`}</h4><p aria-busy={!summary}>{summary ? `${summary.records} kayıt · ${summary.images} görsel kaynağı` : ""}</p><p>{entity === "menu" ? "Menüye bağlı ürünler; kategori, menü fiyatı, alerjen, etiket ve sunum tercihleriyle birlikte aktarılır." : productTransfer ? "Ürün bilgileri, fiyatlar ve varsa menü ilişkileri aktarılır." : "Seçilen kapsamdaki müşteri ve iletişim bilgileri aktarılır."}</p></> : <><h4>{template === "full" ? "Tüm aktarılabilir alanlar" : template === "basic" ? "Temel alanlarla başla" : "IdeaSoft ürün başlıkları"}</h4><p>{template === "full" ? "Uygulamanın tanıdığı alan başlıklarıyla boş bir dosya oluşturulur." : template === "basic" ? "Gerekli temel alanlarla daha kısa bir dosya oluşturulur." : "Tanınmayan kolonları içe aktarırken elle eşleyebilirsin."} Şablon veri içermez.</p><div className="data-transfer-overlay__counts">{(template === "basic" ? (productTransfer ? ["Ürün adı", "Stok kodu", "Fiyat", ...(entity === "menu" ? ["Menü kategorisi", "Alerjenler"] : [])] : ["Müşteri adı", "Telefon", "E-posta"]) : (productTransfer ? ["Ürün bilgileri", "Fiyatlar", "Kategoriler", "Menü alanları"] : ["İletişim", "Adres", "Ticari profil"])).map(label => <StatusBadge key={label}>{label}</StatusBadge>)}</div></>}
            <p className="data-transfer-overlay__hint">{format === "zip" ? "ZIP, kayıt dosyasını ve seçildiyse ürün görsellerini aynı arşivde tutar." : format === "xlsx" ? "Excel'de düzenleyebilir, ardından aynı panelden içe aktarabilirsin." : "CSV, Excel uyumlu UTF-8 ve noktalı virgül ayracıyla kaydedilir; görsel dosyaları içermez."}</p>
          </DetailSectionCard>}
          {mode !== "import" && fileResult && !fileResult.cancelled && <DetailSectionCard title="Dosya kaydedildi"><div role="status"><p>{fileResult.name}</p><p>{fileResult.records} kayıt · {fileResult.images} görsel</p><p className="data-transfer-overlay__path">Kaydedildi: {fileResult.path}</p>{fileResult.warnings.map(warning => <p key={warning}>{warning}</p>)}</div></DetailSectionCard>}
        </fieldset>
      </DetailWorkspaceLayout>
    </div>
    <footer className="workspace-frame__footer data-transfer-overlay__footer">
      <span className="data-transfer-overlay__hint">{mode === "import" ? stage === "prepare" ? preview ? `${applicable} kayıt onayını bekliyor` : source ? "Devam etmek için dosyayı analiz et" : "Dosya seçerek başla" : stage === "confirm" ? "Değişiklikler onayından sonra uygulanır" : "Sonuç raporunu bu panelden indirebilirsin" : mode === "template" ? "Boş şablon seçtiğin konuma kaydedilir" : "Dosya seçtiğin konuma kaydedilir"}</span>
      <div className="data-transfer-overlay__actions">
        {mode === "import" && stage === "prepare" && <><ActionButton variant="secondary" disabled={busy} onClick={close}>Vazgeç</ActionButton><ActionButton disabled={!canConfirm} onClick={() => setStage("confirm")}>Onaya geç</ActionButton></>}
        {mode === "import" && stage === "confirm" && <><ActionButton variant="secondary" disabled={busy} onClick={() => setStage("prepare")}>Geri dön</ActionButton><ActionButton disabled={busy} onClick={() => { void run(async () => {
          const applied = await bridge!.apply(source!.token, preview!.revision); setResult(applied); setRows(applied.rows); setFilter("all"); setOffset(0); setDetail(null); setStage("result");
          try { await onChanged(); } catch { setNotice("Kayıtlar uygulandı; liste yenilenemedi. Sayfayı yeniden açın."); }
        }); }}>{applicable} kaydı içe aktar</ActionButton></>}
        {mode === "import" && stage === "result" && <><ActionButton variant="secondary" onClick={reset} disabled={busy}>Yeniden içe aktar</ActionButton><ActionButton onClick={close} disabled={busy}>Paneli kapat</ActionButton></>}
        {mode !== "import" && <><ActionButton variant="secondary" onClick={close} disabled={busy}>Kapat</ActionButton><ActionButton disabled={busy || !summary} onClick={() => { void run(async () => { const saved = await bridge!.export(exportOptions); setFileResult(saved); if (saved.cancelled) setNotice("Dosya kaydetme iptal edildi."); }); }}>{mode === "template" ? "Şablonu kaydet" : "Dosyayı dışa aktar"}</ActionButton></>}
      </div>
    </footer>
  </ModalSurface>;
}
function message(error: unknown) { return error instanceof Error ? error.message : "Aktarım işlemi tamamlanamadı."; }
