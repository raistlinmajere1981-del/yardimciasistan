import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DOCUMENT_FIELD_BINDINGS, type DocumentFieldBinding, type DocumentKind, type DocumentTemplateField, type DocumentTemplateLayout } from "@yardimci-asistan/shared";
import { FormImagePreparation } from "./FormImagePreparation";
import { ActionButton } from "../ui/ActionButton";

const labels: Record<DocumentFieldBinding, string> = {
  "business.name": "İşletme adı", "business.address": "İşletme adresi", "business.phone": "İşletme telefonu",
  "document.number": "Belge numarası", "document.date": "Belge tarihi", "customer.name": "Müşteri adı",
  "totals.total": "Toplam", "totals.currency": "Para birimi", "product.barcode": "Ürün barkodu",
  "line.description": "Satır açıklaması", "line.quantity": "Satır miktarı", "line.price": "Birim fiyat", "line.total": "Satır toplamı"
};
const sampleValues: Record<DocumentFieldBinding, string> = {
  "business.name": "Örnek İşletme", "business.address": "Örnek Mahalle, No: 1", "business.phone": "Örnek telefon",
  "document.number": "ÖRNEK-001", "document.date": "06.11.2026 · 14:30", "customer.name": "Örnek Müşteri",
  "totals.total": "320,00 ₺", "totals.currency": "TRY", "product.barcode": "8690000000001",
  "line.description": "Örnek ürün", "line.quantity": "1", "line.price": "160,00 ₺", "line.total": "160,00 ₺"
};
const bindings = DOCUMENT_FIELD_BINDINGS.filter(binding => !binding.startsWith("line."));
/** Explicit draft geometry only; never rewrites a saved revision or moves its fields. */
export function saleReceiptLineBlock(layout: DocumentTemplateLayout): DocumentTemplateLayout["lineBlock"] {
  const y = Math.max(30, ...layout.fields.map(field => field.y + field.height + 30));
  const rowHeight = 60;
  // Reserve the bottom 8mm for the independently rendered non-fiscal notice.
  const maxRows = Math.min(200, Math.floor((layout.pageHeight - 80 - y) / rowHeight));
  if (maxRows < 1) return null;
  const scale = layout.pageWidth / 800;
  return { y, rowHeight, maxRows, fields: ([
    ["line.description", 30, 430], ["line.quantity", 470, 90], ["line.total", 590, 180]
  ] as const).map(([binding, x, width]) => ({ binding, x: Math.floor(x * scale), y: 0, width: Math.max(1, Math.floor(width * scale)), height: rowHeight })) };
}
export function defaultDocumentLayout(kind: DocumentKind, existing?: DocumentTemplateLayout | null): DocumentTemplateLayout {
  const sheet = kind === "stay_statement" || kind === "credit_statement";
  const pageWidth = sheet ? 2100 : kind === "product_label" ? 600 : kind === "shipping_label" ? 1000 : 800;
  const pageHeight = sheet ? 2970 : kind === "product_label" ? 400 : kind === "shipping_label" ? 1500 : 1600;
  const width = existing?.pageWidth ?? pageWidth;
  const height = existing?.pageHeight ?? pageHeight;
  const layout: DocumentTemplateLayout = { unit: "mm10", pageWidth: width, pageHeight: height, lineBlock: existing?.lineBlock ?? null, scan: existing?.scan ?? null,
    fields: ["business.name", "document.number", kind === "product_label" ? "product.barcode" : "document.date", "totals.total"].map((binding, index) => ({ binding: binding as DocumentFieldBinding, x: Math.round(30 * width / pageWidth), y: Math.round((30 + index * 70) * height / pageHeight), width: Math.max(1, Math.floor((pageWidth - 60) * width / pageWidth)), height: Math.max(1, Math.floor(60 * height / pageHeight)) })) };
  if (kind === "sale_receipt" && !layout.lineBlock) layout.lineBlock = saleReceiptLineBlock(layout);
  return layout;
}
/** Keep partial native number input text while all staged geometry stays valid mm10. */
function TemplateMmInput({ title, value, minimum, maximum, disabled, onChange }: {
  title: string; value: number; minimum: number; maximum: number; disabled: boolean; onChange(value: number): void;
}) {
  const [text, setText] = useState(String(value / 10));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(String(value / 10)); }, [value]);
  return <label>{title} (mm)<input aria-label={`${title} (mm)`} type="number" step="0.1" min={minimum / 10} max={maximum / 10}
    disabled={disabled} value={text} onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; setText(String(value / 10)); }}
    onChange={event => {
      setText(event.target.value);
      const numeric = event.target.value === "" ? minimum : event.target.valueAsNumber * 10;
      if (Number.isFinite(numeric)) onChange(numeric);
    }} /></label>;
}
export function DocumentTemplateCanvas({ layout, editing, enabled, onChange, onPreset, documentKind, imageAuthority = "", onPickImage, onApplyImage }: {
  onApplyImage?(produce: () => Promise<string>): Promise<boolean>;
  documentKind?: DocumentKind; imageAuthority?: string; onPickImage?(): void;
  layout: DocumentTemplateLayout; editing: boolean; enabled: boolean; onChange(layout: DocumentTemplateLayout): void; onPreset(): void;
}) {
  const [image, setImage] = useState<{ key: string; src: string; error: boolean } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const originalRef = layout.scan?.originalImageRef;
  const displayRef = layout.scan?.processedImageRef ?? originalRef;
  const imageKey = `${imageAuthority}:${documentKind}:${displayRef}`;
  useEffect(() => {
    let cancelled = false;
    if (!displayRef || !documentKind) return;
    void window.yardimciDesktop?.readFormImage({ documentKind, imageRef: displayRef }).then(result => {
      if (!cancelled) setImage({ key: imageKey, src: result.ok ? result.value.dataUrl : "", error: !result.ok });
    }).catch(() => { if (!cancelled) setImage({ key: imageKey, src: "", error: true }); });
    return () => { cancelled = true; };
  }, [displayRef, documentKind, imageKey]);
  const [selected, setSelected] = useState(0);
  const [binding, setBinding] = useState<DocumentFieldBinding>("business.name");
  const paper = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const [space, setSpace] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      setSpace({ width: Math.max(1, element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2),
        height: Math.max(1, element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 2) });
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, [editing, preparing]);
  const naturalWidth = layout.pageWidth / 10 * 3.78;
  const paperWidth = zoom === "fit" ? Math.min(naturalWidth, space.width || naturalWidth, (space.height || naturalWidth * layout.pageHeight / layout.pageWidth) * layout.pageWidth / layout.pageHeight) : naturalWidth * zoom;
  const drag = useRef<{ index: number; pointerId: number; clientX: number; clientY: number; x: number; y: number } | null>(null);
  const selectedIndex = Math.min(selected, layout.fields.length - 1);
  const field = layout.fields[selectedIndex];
  const receiptRows = documentKind === "sale_receipt" ? saleReceiptLineBlock(layout) : null;
  const update = (index: number, patch: Partial<DocumentTemplateField>) => {
    const original = layout.fields[index];
    if (!enabled || !original) return;
    const next = { ...original, ...patch };
    next.width = Math.max(1, Math.min(layout.pageWidth, Math.round(next.width)));
    next.height = Math.max(1, Math.min(layout.pageHeight, Math.round(next.height)));
    next.x = Math.max(0, Math.min(layout.pageWidth - next.width, Math.round(next.x)));
    next.y = Math.max(0, Math.min(layout.pageHeight - next.height, Math.round(next.y)));
    onChange({ ...layout, fields: layout.fields.map((item, i) => i === index ? next : item) });
  };
  if (preparing && editing && documentKind && originalRef && onApplyImage) return <FormImagePreparation key={`${imageAuthority}:${originalRef}`} documentKind={documentKind} originalRef={originalRef} pageWidth={layout.pageWidth} pageHeight={layout.pageHeight} enabled={enabled} onApply={onApplyImage} onBack={() => setPreparing(false)} />;
  return <div className={`print-management__editor${editing ? " print-management__editor--editing" : ""}`}>
    <div className="print-management__toolbar" role="group" aria-label="Belge araçları">
      {editing && <>
        <label>Eklenecek alan<select aria-label="Eklenecek alan" disabled={!enabled} value={binding} onChange={event => setBinding(event.target.value as DocumentFieldBinding)}>{bindings.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label>
        <ActionButton variant="secondary" disabled={!enabled || layout.fields.length >= 100} onClick={() => { setSelected(layout.fields.length); onChange({ ...layout, fields: [...layout.fields, { binding, x: 0, y: 0, width: Math.min(400, layout.pageWidth), height: 60 }] }); }}>Alan ekle</ActionButton>
        <details className="print-management__tools-menu">
          <summary>Yerleşim ve form</summary>
          <div onClick={event => { if ((event.target as HTMLElement).closest("button")) event.currentTarget.closest("details")?.removeAttribute("open"); }}>
            <ActionButton variant="secondary" disabled={!enabled} onClick={onPreset}>Başlangıç yerleşimi</ActionButton>
            {documentKind === "sale_receipt" && <ActionButton variant="secondary" disabled={!enabled || !receiptRows} onClick={() => onChange({ ...layout, lineBlock: receiptRows })}>Ürün satırlarını ekle</ActionButton>}
            {onPickImage && <ActionButton variant="secondary" disabled={!enabled} onClick={onPickImage}>Boş form görseli seç</ActionButton>}
            {originalRef && onApplyImage && <ActionButton variant="secondary" disabled={!enabled} onClick={() => setPreparing(true)}>Görseli hazırla</ActionButton>}
            {layout.scan?.processedImageRef && <ActionButton variant="secondary" disabled={!enabled} onClick={() => onChange({ ...layout, scan: { ...layout.scan!, processedImageRef: null, foreground: false } })}>Orijinali göster</ActionButton>}
            {layout.scan && <ActionButton variant="secondary" disabled={!enabled} onClick={() => onChange({ ...layout, scan: null })}>Görseli kaldır</ActionButton>}
          </div>
        </details>
      </>}
      <div className="print-management__zoom" aria-label="Belge yakınlaştırma">
        {([['fit', 'Sığdır'], [.75, '%75'], [1, '%100']] as const).map(([value, title]) => <ActionButton key={value} variant="ghost" disabled={!enabled} aria-pressed={zoom === value} onClick={() => setZoom(value)}>{title}</ActionButton>)}
      </div>
    </div>
    {originalRef && image?.key === imageKey && image.error && <p role="alert">Boş form görseli okunamadı. Yeniden seçebilirsiniz.</p>}
    {documentKind === "sale_receipt" && !layout.lineBlock && <p className="print-management__hint">Bu şablonda ürün satırları yok; fiş hazırlanamaz. Düzenle &gt; Yerleşim ve form &gt; Ürün satırlarını ekle &gt; Kaydet.</p>}
    {editing && documentKind === "sale_receipt" && !receiptRows && <p role="alert">Ürün satırları için boş alan yok. Alanları yukarı taşıyın veya Başlangıç yerleşimi kullanın.</p>}
    {editing && documentKind === "sale_receipt" && layout.lineBlock && <small className="print-management__hint">Ürün satırı kapasitesi: {layout.lineBlock.maxRows}</small>}
    <div className="print-management__editor-body">
    <div ref={viewport} className="print-management__canvas" id="print-document-preview" aria-label="Şablon önizlemesi">
      <article ref={paper} className={`print-management__paper print-management__paper--layout${editing ? "" : " print-management__paper--preview"}`} style={{ aspectRatio: `${layout.pageWidth} / ${layout.pageHeight}`, width: `${paperWidth}px`, fontSize: `${paperWidth / layout.pageWidth * 32}px` }}
        onPointerMove={event => {
          const current = drag.current; const bounds = paper.current?.getBoundingClientRect();
          if (!current || current.pointerId !== event.pointerId || !bounds?.width || !bounds.height || !editing || !enabled) return;
          // Delta coordinates survive inspector/footer reflow when the first move stages a draft.
          update(current.index, { x: current.x + (event.clientX - current.clientX) / bounds.width * layout.pageWidth, y: current.y + (event.clientY - current.clientY) / bounds.height * layout.pageHeight });
        }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={event => { if (event.target === event.currentTarget) drag.current = null; }}>
        {originalRef && image?.key === imageKey && image.src && <img className="print-management__form-image" src={image.src} alt={layout.scan?.processedImageRef ? "Boş form hazırlanmış görseli" : "Boş form asıl görseli"} draggable={false} />}
        {layout.fields.map((item, index) => {
          const style = { left: `${item.x / layout.pageWidth * 100}%`, top: `${item.y / layout.pageHeight * 100}%`, width: `${item.width / layout.pageWidth * 100}%`, height: `${item.height / layout.pageHeight * 100}%` };
          // Preview is not an action: present sample fields as text instead of disabled buttons.
          if (!editing) return <span key={index} className="print-management__field print-management__field--preview" style={style}>{sampleValues[item.binding]}</span>;
          return <ActionButton key={index} variant="secondary" className="print-management__field" aria-label={`${labels[item.binding]} alanı ${index + 1}`} aria-pressed={selectedIndex === index} disabled={!enabled}
            style={style} onClick={() => setSelected(index)}
            onPointerDown={event => {
              if (!enabled || event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.focus({ preventScroll: true });
              setSelected(index);
              drag.current = { index, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: item.x, y: item.y };
              paper.current!.setPointerCapture(event.pointerId);
            }}>{labels[item.binding]}</ActionButton>;
        })}
        {layout.lineBlock && Array.from({ length: Math.min(3, layout.lineBlock.maxRows) }, (_, row) => layout.lineBlock!.fields.map((item, index) => <span key={`${row}:${index}`} className="print-management__row-field"
          style={{ left: `${item.x / layout.pageWidth * 100}%`, top: `${(layout.lineBlock!.y + row * layout.lineBlock!.rowHeight + item.y) / layout.pageHeight * 100}%`, width: `${item.width / layout.pageWidth * 100}%`, height: `${item.height / layout.pageHeight * 100}%` }}>{editing ? labels[item.binding] : sampleValues[item.binding]}</span>))}
        <span className="print-management__watermark">MALİ BELGE DEĞİLDİR</span>
      </article>
    </div>
    {editing && <aside className="print-management__selection print-management__inspector" aria-label="Seçili alan">
      <h3>Seçili alan</h3>
      <label>Alan seç<select aria-label="Alan seç" disabled={!enabled} value={layout.fields.length ? selectedIndex : ""} onChange={event => setSelected(Number(event.target.value))}>
        {!layout.fields.length && <option value="">Alan yok</option>}
        {layout.fields.map((item, index) => <option key={index} value={index}>{index + 1}. {labels[item.binding]}</option>)}
      </select></label>
      {field && <>
        <label>Seçili alan türü<select aria-label="Seçili alan türü" disabled={!enabled} value={field.binding} onChange={event => update(selectedIndex, { binding: event.target.value as DocumentFieldBinding })}>{bindings.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label>
        <div className="print-management__geometry">{([['x', 'X'], ['y', 'Y'], ['width', 'Genişlik'], ['height', 'Yükseklik']] as const).map(([key, title]) => <TemplateMmInput key={`${selectedIndex}:${key}`} title={title} minimum={key === 'width' || key === 'height' ? 1 : 0} maximum={key === 'x' || key === 'width' ? layout.pageWidth : layout.pageHeight} disabled={!enabled} value={field[key]} onChange={value => update(selectedIndex, { [key]: value })} />)}</div>
        <div className="print-management__move" aria-label="Alanı 1 mm taşı">{([[-10, 0, 'Sola', '←'], [10, 0, 'Sağa', '→'], [0, -10, 'Yukarı', '↑'], [0, 10, 'Aşağı', '↓']] as const).map(([x, y, title, arrow]) => <ActionButton key={title} aria-label={title} variant="ghost" disabled={!enabled} onClick={() => update(selectedIndex, { x: field.x + x, y: field.y + y })}>{arrow}</ActionButton>)}</div>
        <ActionButton variant="secondary" disabled={!enabled} onClick={() => { onChange({ ...layout, fields: layout.fields.filter((_, i) => i !== selectedIndex) }); setSelected(0); }}>Alanı kaldır</ActionButton>
      </>}
    </aside>}
    </div>
  </div>;
}
