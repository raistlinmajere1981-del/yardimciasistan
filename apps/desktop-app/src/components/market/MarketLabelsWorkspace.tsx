import { Download, FileImage, FileText, Printer, Tags } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CatalogCategory, CatalogProduct } from "@yardimci-asistan/shared";
import {
  LABEL_PRINTER_CATALOG,
  LABEL_SIZE_PRESETS,
  canEncodeCode128B,
  downloadLabelResult,
  getLabelPrinter,
  type LabelPrintJob,
  type LabelPrinterId,
  type LabelSizePreset
} from "../../app/label-printer";
import "../../market-label-ux.css";

interface MarketLabelsWorkspaceProps {
  products: CatalogProduct[];
  categories: CatalogCategory[];
  busy: boolean;
  onStateChange: (state: "loading" | "success" | "error", message: string) => void;
}

export function MarketLabelsWorkspace({
  products,
  categories,
  busy,
  onStateChange
}: MarketLabelsWorkspaceProps) {
  const activeProducts = useMemo(() => products.filter((product) => product.isActive), [products]);
  const [productId, setProductId] = useState("");
  const [sizeId, setSizeId] = useState<LabelSizePreset["id"]>("58x40");
  const [copies, setCopies] = useState("1");
  const [showPrice, setShowPrice] = useState(true);
  const [showSku, setShowSku] = useState(true);
  const [showBarcode, setShowBarcode] = useState(true);
  const [previewDataUrl, setPreviewDataUrl] = useState("");
  const [previewMessage, setPreviewMessage] = useState("Etiket önizlemesi için ürün seçin.");
  const [exporting, setExporting] = useState<LabelPrinterId | "">("");

  useEffect(() => {
    if (productId && activeProducts.some((product) => product.id === productId)) return;
    setProductId(activeProducts[0]?.id ?? "");
  }, [activeProducts, productId]);

  const product = activeProducts.find((item) => item.id === productId) ?? null;
  const size = LABEL_SIZE_PRESETS.find((item) => item.id === sizeId) ?? LABEL_SIZE_PRESETS[0];
  const category = product
    ? categories.find((item) => item.id === product.categoryId) ?? null
    : null;
  const parsedCopies = Math.max(1, Math.min(50, Math.trunc(Number(copies) || 1)));

  const job = useMemo<LabelPrintJob | null>(() => product ? {
    product: {
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      salePrice: product.salePrice,
      currency: product.currency
    },
    size,
    copies: parsedCopies,
    showPrice,
    showSku,
    showBarcode
  } : null, [parsedCopies, product, showBarcode, showPrice, showSku, size]);

  useEffect(() => {
    if (!job) {
      setPreviewDataUrl("");
      setPreviewMessage("Etiket önizlemesi için ürün seçin.");
      return;
    }

    let mounted = true;
    setPreviewMessage("Önizleme hazırlanıyor…");
    void getLabelPrinter("preview").print(job)
      .then((result) => {
        if (!mounted) return;
        setPreviewDataUrl(result.previewDataUrl ?? "");
        setPreviewMessage(result.message);
      })
      .catch((error) => {
        if (!mounted) return;
        setPreviewDataUrl("");
        setPreviewMessage(error instanceof Error ? error.message : "Etiket önizlenemedi.");
      });

    return () => {
      mounted = false;
    };
  }, [job]);

  async function exportLabel(printerId: "png" | "pdf") {
    if (!job || exporting) return;
    setExporting(printerId);
    onStateChange("loading", `${printerId.toUpperCase()} etiketi hazırlanıyor…`);
    try {
      const result = await getLabelPrinter(printerId).print(job);
      downloadLabelResult(result);
      onStateChange("success", `${result.fileName} hazırlandı.`);
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Etiket çıktısı üretilemedi.");
    } finally {
      setExporting("");
    }
  }

  const barcodeIsPrintable = Boolean(
    product?.barcode && canEncodeCode128B(product.barcode)
  );
  const disabled = busy || Boolean(exporting);

  if (activeProducts.length === 0) {
    return (
      <section className="market-panel">
        <header className="market-panel-heading">
          <span>Etiket</span>
          <h2>Etiketler</h2>
          <p>Etiket üretmek için önce aktif bir ürün kartı oluşturun.</p>
        </header>
      </section>
    );
  }

  return (
    <div className="market-label-layout">
      <section className="market-panel market-label-controls">
        <header className="market-panel-heading">
          <span>Etiket</span>
          <h2>Etiket Hazırla</h2>
          <p>Donanım gerekmeden önizleyin; PNG veya label-boyutlu PDF üretin.</p>
        </header>

        <div className="market-form-grid">
          <label className="market-field market-field-wide">
            Ürün
            <select value={productId} onChange={(event) => setProductId(event.target.value)} disabled={disabled}>
              {activeProducts.map((item) => (
                <option value={item.id} key={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="market-field">
            Etiket ölçüsü
            <select value={sizeId} onChange={(event) => setSizeId(event.target.value as LabelSizePreset["id"])} disabled={disabled}>
              {LABEL_SIZE_PRESETS.map((preset) => (
                <option value={preset.id} key={preset.id}>{preset.label}</option>
              ))}
            </select>
          </label>
          <label className="market-field">
            PDF kopya sayısı
            <input
              type="number"
              min="1"
              max="50"
              step="1"
              value={copies}
              onChange={(event) => setCopies(event.target.value)}
              disabled={disabled}
            />
          </label>
        </div>

        <div className="market-label-options">
          <label className="market-check"><input type="checkbox" checked={showPrice} onChange={(event) => setShowPrice(event.target.checked)} disabled={disabled} /> Fiyatı göster</label>
          <label className="market-check"><input type="checkbox" checked={showSku} onChange={(event) => setShowSku(event.target.checked)} disabled={disabled} /> SKU göster</label>
          <label className="market-check"><input type="checkbox" checked={showBarcode} onChange={(event) => setShowBarcode(event.target.checked)} disabled={disabled} /> Barkodu göster</label>
        </div>

        {product && (
          <div className="market-label-product-summary">
            <span><strong>{product.name}</strong><small>{category?.name || "Kategorisiz"}</small></span>
            <span><small>SKU</small><strong>{product.sku || "—"}</strong></span>
            <span><small>Barkod</small><strong>{product.barcode || "—"}</strong></span>
          </div>
        )}

        {showBarcode && product?.barcode && !barcodeIsPrintable && (
          <p className="market-label-warning">
            Bu barkod Code 128-B karakter aralığında değil; etikette metin olarak görünür ancak çizgili barkod üretilmez.
          </p>
        )}
        {showBarcode && product && !product.barcode && (
          <p className="market-label-warning">Bu ürünün barkodu yok; etiket barkodsuz üretilecek.</p>
        )}

        <div className="market-label-actions">
          <button type="button" onClick={() => void exportLabel("png")} disabled={disabled || !job}>
            <FileImage size={17} aria-hidden="true" />
            {exporting === "png" ? "PNG hazırlanıyor…" : "PNG İndir"}
          </button>
          <button type="button" onClick={() => void exportLabel("pdf")} disabled={disabled || !job}>
            <FileText size={17} aria-hidden="true" />
            {exporting === "pdf" ? "PDF hazırlanıyor…" : "PDF İndir"}
          </button>
        </div>

        <section className="market-label-adapters" aria-label="Etiket çıktı adaptörleri">
          <div className="market-label-adapter-heading">
            <Printer size={17} aria-hidden="true" />
            <strong>LabelPrinter adaptörleri</strong>
          </div>
          <div className="market-label-adapter-list">
            {LABEL_PRINTER_CATALOG.map((adapter) => (
              <span className={adapter.availability === "available" ? "market-badge" : "market-badge is-muted"} key={adapter.id}>
                {adapter.label} · {adapter.availability === "available" ? "hazır" : "planlı"}
              </span>
            ))}
          </div>
          <small>ZPL, TSPL ve sistem yazıcısı saha donanımı belli olduğunda aynı sözleşmeye takılacak.</small>
        </section>
      </section>

      <section className="market-panel market-label-preview-panel">
        <header className="market-panel-heading market-panel-heading-row">
          <div>
            <span>Preview</span>
            <h2>Etiket Önizleme</h2>
            <p>{size.label} · PNG/PDF ile aynı render sözleşmesi</p>
          </div>
          <Download size={18} aria-hidden="true" />
        </header>
        <div className="market-label-preview-stage">
          {previewDataUrl ? (
            <img src={previewDataUrl} alt={`${product?.name ?? "Ürün"} etiket önizlemesi`} />
          ) : (
            <div className="market-label-preview-empty"><Tags size={28} aria-hidden="true" /><span>{previewMessage}</span></div>
          )}
        </div>
        <small className="market-label-preview-message" role="status" aria-live="polite">{previewMessage}</small>
      </section>
    </div>
  );
}
