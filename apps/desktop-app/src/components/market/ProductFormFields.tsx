import { SearchSelect } from "../ui/SearchSelect";
import { Image as ImageIcon, Sparkles, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  normalizeBarcodeIdentity,
  type CatalogCategory,
  type ProductLookupCandidate
} from "@yardimci-asistan/shared";
import {
  PRODUCT_UNIT_LABELS,
  applyProductLookupCandidate,
  productProviderLabel,
  type ProductFormState
} from "../../app/product-model";
import { MoneyInput } from "../ui/MoneyInput";
import { ActionButton } from "../ui/ActionButton";
import { useRequestGeneration } from "../workspace/use-request-generation";

export interface ProductLookupSeed {
  requestId: number;
  product: ProductLookupCandidate;
}

export function ProductFormFields({
  form,
  categories,
  inventoryEnabled,
  productDataEnabled,
  wholesaleEnabled = false,
  disabled = false,
  mode = "all",
  localImageDataUrl = "",
  lookupSeed = null,
  onLookupSeedLoaded,
  onManualImageSelected,
  onImageClear,
  onExternalImageSelected,
  onChange,
  onStateChange
}: {
  form: ProductFormState;
  categories: CatalogCategory[];
  inventoryEnabled: boolean;
  productDataEnabled: boolean;
  wholesaleEnabled?: boolean;
  disabled?: boolean;
  mode?: "all" | "details" | "media";
  localImageDataUrl?: string;
  lookupSeed?: ProductLookupSeed | null;
  onLookupSeedLoaded?: (requestId: number) => void;
  onManualImageSelected?: (dataUrl: string) => void;
  onImageClear?: () => void;
  onExternalImageSelected?: () => void;
  onChange: (form: ProductFormState) => void;
  onStateChange: (state: "loading" | "success" | "error", message: string) => void;
}) {
  const bridge = window.yardimciDesktop?.commerce;
  const [lookupBusy, setLookupBusy] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState(localImageDataUrl);
  const [previewLoading, setPreviewLoading] = useState(false);
  const loadedSeedId = useRef<number | null>(null);
  const manualImageInputRef = useRef<HTMLInputElement | null>(null);
  const beginPreviewRequest = useRequestGeneration();
  const beginLookupRequest = useRequestGeneration();
  const showDetails = mode === "all" || mode === "details";
  const showMedia = mode === "all" || mode === "media";

  useEffect(() => {
    setPreviewDataUrl(localImageDataUrl);
  }, [localImageDataUrl]);

  const previewExternal = useCallback(async (candidate: ProductLookupCandidate) => {
    const isCurrent = beginPreviewRequest();
    setPreviewDataUrl("");
    setPreviewLoading(Boolean(candidate.imageUrl));
    if (!candidate.imageUrl || !bridge?.previewExternalProductImage) {
      if (isCurrent()) setPreviewLoading(false);
      return;
    }
    try {
      const dataUrl = await bridge.previewExternalProductImage(candidate.provider, candidate.imageUrl);
      if (isCurrent()) setPreviewDataUrl(dataUrl);
    } catch {
      if (isCurrent()) setPreviewDataUrl("");
    } finally {
      if (isCurrent()) setPreviewLoading(false);
    }
  }, [beginPreviewRequest, bridge]);

  useEffect(() => {
    if (!lookupSeed || loadedSeedId.current === lookupSeed.requestId) return;
    loadedSeedId.current = lookupSeed.requestId;
    onChange(applyProductLookupCandidate(form, lookupSeed.product, categories));
    if (lookupSeed.product.imageUrl) onExternalImageSelected?.();
    void previewExternal(lookupSeed.product);
    onLookupSeedLoaded?.(lookupSeed.requestId);
    onStateChange(
      "success",
      `${lookupSeed.product.name} bilgileri Open Food Facts'tan bulundu. Satış fiyatı ve diğer yerel alanları kontrol edip kaydedin.`
    );
  }, [categories, form, lookupSeed, onChange, onExternalImageSelected, onLookupSeedLoaded, onStateChange, previewExternal]);

  async function readManualImage(file: File) {
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowedTypes.has(file.type)) {
      onStateChange("error", "Ürün görseli JPEG, PNG veya WEBP olmalı.");
      return;
    }
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
      onStateChange("error", "Ürün görseli en fazla 5 MB olabilir.");
      return;
    }

    const isCurrent = beginPreviewRequest();
    setPreviewLoading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Ürün görseli okunamadı."));
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.readAsDataURL(file);
      });
      if (!isCurrent()) return;
      if (!dataUrl.startsWith("data:image/")) {
        onStateChange("error", "Ürün görseli okunamadı.");
        return;
      }
      setPreviewDataUrl(dataUrl);
      onManualImageSelected?.(dataUrl);
      onChange({ ...form, imageSourceUrl: "", imageLicense: "" });
      onStateChange("success", "Manuel ürün görseli seçildi. Kaydettiğinizde ürün kartına eklenecek.");
    } catch (error) {
      if (isCurrent()) {
        onStateChange("error", error instanceof Error ? error.message : "Ürün görseli okunamadı.");
      }
    } finally {
      if (isCurrent()) setPreviewLoading(false);
    }
  }

  function clearImage() {
    beginPreviewRequest();
    setPreviewLoading(false);
    setPreviewDataUrl("");
    onImageClear?.();
    onChange({ ...form, imageSourceUrl: "", imageLicense: "" });
    onStateChange("success", "Ürün görseli temizlendi. Kaydettiğinizde değişiklik uygulanacak.");
  }

  async function lookupProductInfo() {
    if (!bridge || !form.barcode.trim() || lookupBusy) return;
    const isCurrent = beginLookupRequest();
    setLookupBusy(true);
    onStateChange("loading", "Ürün bilgileri aranıyor…");
    try {
      const normalizedBarcode = normalizeBarcodeIdentity(form.barcode, 80);
      const nextBase = normalizedBarcode === form.barcode ? form : { ...form, barcode: normalizedBarcode };
      if (normalizedBarcode !== form.barcode && isCurrent()) onChange(nextBase);
      const result = await bridge.lookupExternalProductByBarcode(normalizedBarcode, "manual");
      if (!isCurrent()) return;
      if (result.status === "disabled") {
        onStateChange(
          "error",
          result.reason === "service_disabled"
            ? "Ürün Verisi servisi kapalı. Ayarlar > Servisler bölümünden açabilirsiniz."
            : "Otomatik arama kapalı."
        );
        return;
      }
      if (result.status === "not_found") {
        onStateChange("error", `Bu barkod Open Food Facts üzerinde bulunamadı: ${result.barcode}`);
        return;
      }
      onChange(applyProductLookupCandidate(nextBase, result.product, categories));
      if (result.product.imageUrl) onExternalImageSelected?.();
      await previewExternal(result.product);
      if (isCurrent()) onStateChange("success", `${result.product.name} bilgileri bulundu.`);
    } catch (error) {
      if (isCurrent()) onStateChange("error", error instanceof Error ? error.message : "Ürün bilgileri alınamadı.");
    } finally {
      if (isCurrent()) setLookupBusy(false);
    }
  }

  return <>
    {showDetails && <div className="market-form-grid">
      <label className="market-field market-field-wide">Ürün adı<input disabled={disabled} value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} /></label>
      <label className="market-field">Marka<input disabled={disabled} value={form.brand} onChange={(event) => onChange({ ...form, brand: event.target.value })} /></label>
      <label className="market-field">SKU<input disabled={disabled} value={form.sku} onChange={(event) => onChange({ ...form, sku: event.target.value })} /></label>
      <label className="market-field market-field-wide">
        Barkod
        <span className="market-inline-field">
          <input disabled={disabled} value={form.barcode} onChange={(event) => onChange({ ...form, barcode: normalizeBarcodeIdentity(event.target.value, 80) })} />
          {productDataEnabled && <ActionButton
            variant="secondary"
            type="button"
            busy={lookupBusy}
            busyLabel="Aranıyor…"
            onClick={() => void lookupProductInfo()}
            disabled={disabled || !form.barcode.trim()}
          >
            <Sparkles size={15} aria-hidden="true" /> Ürün Bilgilerini Ara
          </ActionButton>}
        </span>
      </label>
      <label className="market-field">Kategori<SearchSelect ariaLabel="Kategori" disabled={disabled} value={form.categoryId} placeholder="Kategorisiz" onChange={categoryId => onChange({ ...form, categoryId })} options={categories.filter(category => category.isActive).map(category => ({ id: category.id, label: category.name }))} /></label>
      <label className="market-field">Birim<select disabled={disabled} value={form.unit} onChange={(event) => onChange({ ...form, unit: event.target.value as ProductFormState["unit"] })}>{Object.entries(PRODUCT_UNIT_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label className="market-field">{wholesaleEnabled ? "Perakende fiyat" : "Satış fiyatı"}<MoneyInput aria-label={wholesaleEnabled ? "Perakende fiyat" : "Satış fiyatı"} disabled={disabled} value={form.salePrice} onChange={(salePrice) => onChange({ ...form, salePrice })} /></label>
      {wholesaleEnabled && <>
        <label className="market-field">Bayi A fiyatı<MoneyInput aria-label="Bayi A fiyatı" disabled={disabled} value={form.dealerPriceA} placeholder="Perakende fiyatı kullan" onChange={(dealerPriceA) => onChange({ ...form, dealerPriceA })} /></label>
        <label className="market-field">Bayi B fiyatı<MoneyInput aria-label="Bayi B fiyatı" disabled={disabled} value={form.dealerPriceB} placeholder="Perakende fiyatı kullan" onChange={(dealerPriceB) => onChange({ ...form, dealerPriceB })} /></label>
      </>}
      <label className="market-field">Alış fiyatı<MoneyInput aria-label="Alış fiyatı" disabled={disabled} value={form.purchasePrice} onChange={(purchasePrice) => onChange({ ...form, purchasePrice })} /></label>
      <label className="market-field">Para birimi<input disabled={disabled} value={form.currency} maxLength={3} onChange={(event) => onChange({ ...form, currency: event.target.value.toUpperCase() })} /></label>
      <label className="market-field">KDV %<input disabled={disabled} type="number" min="0" step="0.01" value={form.taxRate} onChange={(event) => onChange({ ...form, taxRate: event.target.value })} /></label>
      {inventoryEnabled && form.trackInventory && <label className="market-field">Minimum stok<input disabled={disabled} type="number" min="0" step="0.0001" value={form.minimumQuantity} onChange={(event) => onChange({ ...form, minimumQuantity: event.target.value })} /></label>}
      <label className="market-field market-field-wide">Açıklama<textarea disabled={disabled} value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} /></label>
      <label className="market-check"><input disabled={disabled || !inventoryEnabled} type="checkbox" checked={form.trackInventory} onChange={(event) => onChange({ ...form, trackInventory: event.target.checked })} /> Stok takip et</label>
      <label className="market-check"><input disabled={disabled} type="checkbox" checked={form.isActive} onChange={(event) => onChange({ ...form, isActive: event.target.checked })} /> Aktif ürün</label>
    </div>}

    {showMedia && <div className="form-stack market-product-media">
      <div className={`market-product-image-card${previewDataUrl ? " has-image" : ""}`}>
        {previewDataUrl ? <img src={previewDataUrl} alt={form.name ? `${form.name} ürün görseli` : "Ürün görseli"} /> : <div className="market-product-image-placeholder">
          <ImageIcon size={28} aria-hidden="true" />
          <span>{previewLoading ? "Ürün görseli yükleniyor…" : form.imageSourceUrl ? "Görsel önizlenemedi; ürün kaydedildiğinde yeniden arşivleme denenecek." : "Ürün görseli yok"}</span>
        </div>}
      </div>
      <div className="action-row market-product-image-actions">
        <input
          ref={manualImageInputRef}
          hidden
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void readManualImage(file);
          }}
        />
        <ActionButton
          variant="secondary"
          type="button"
          disabled={disabled || previewLoading}
          onClick={() => manualImageInputRef.current?.click()}
        >
          <Upload size={15} aria-hidden="true" /> Görsel Ekle / Değiştir
        </ActionButton>
        <ActionButton
          variant="secondary"
          type="button"
          disabled={disabled || previewLoading || (!previewDataUrl && !form.imageSourceUrl && !localImageDataUrl)}
          onClick={clearImage}
        >
          <Trash2 size={15} aria-hidden="true" /> Görseli Temizle
        </ActionButton>
      </div>
      {form.dataSource && <aside className="market-product-source">
        <strong>Ürün verisi: {productProviderLabel(form.dataSource)}</strong>
        <span>Veri lisansı: {form.dataLicense || "—"}{form.imageLicense ? ` · Görsel: ${form.imageLicense}` : ""}</span>
        {form.sourceFetchedAt && <small>Alınma: {new Date(form.sourceFetchedAt).toLocaleString("tr-TR")}</small>}
      </aside>}
    </div>}
  </>;
}
