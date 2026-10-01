import { useEffect, useRef, useState } from "react";
import type { DesktopDashboardData } from "../../../electron/database";
import {
  resolveMenuPreviewImageUrl,
  stockUnitShortLabel,
  type ItemFormState
} from "./menu-model";
import { ActionButton } from "../ui/ActionButton";
import { MoneyInput } from "../ui/MoneyInput";
import { StatusChip } from "../ui/StatusChip";

const MAX_SOURCE_IMAGE_BYTES = 15 * 1024 * 1024;
const TARGET_IMAGE_BYTES = 420 * 1024;
const MAX_OUTPUT_IMAGE_BYTES = 700 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type MenuItemFieldMode = "all" | "details" | "stock" | "media";

interface MenuItemFormFieldsProps {
  mode: MenuItemFieldMode;
  form: ItemFormState;
  dashboardData: DesktopDashboardData;
  qrMenuEnabled: boolean;
  inventoryEnabled: boolean;
  onChange: (form: ItemFormState) => void;
}

export function MenuItemFormFields({
  mode,
  form,
  dashboardData,
  qrMenuEnabled,
  inventoryEnabled,
  onChange
}: MenuItemFormFieldsProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageLabel, setImageLabel] = useState(() => describeImageValue(form.image_url));
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState("");
  const [failedPreviewSource, setFailedPreviewSource] = useState("");

  useEffect(() => {
    setImageLabel(describeImageValue(form.image_url));
    setImageError("");
    setFailedPreviewSource("");
  }, [form.id]);

  useEffect(() => {
    setFailedPreviewSource("");
  }, [form.image_url]);

  const showDetails = mode === "all" || mode === "details";
  const showStock = inventoryEnabled && (mode === "all" || mode === "stock");
  const showInlineMedia = mode === "all";
  const showStandaloneMedia = mode === "media";
  const previewSource = resolveMenuPreviewImageUrl(form.image_url, dashboardData.webModuleUrl);
  const visiblePreviewSource = previewSource && previewSource !== failedPreviewSource ? previewSource : "";

  async function handleImageFile(file: File | undefined) {
    if (!file) return;
    setImageBusy(true);
    setImageError("");
    try {
      const dataUrl = await prepareMenuImage(file);
      onChange({ ...form, image_url: dataUrl });
      setImageLabel(file.name);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Görsel hazırlanamadı.");
    } finally {
      setImageBusy(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  function clearImage() {
    onChange({ ...form, image_url: "" });
    setImageLabel("Görsel seçilmedi");
    setImageError("");
  }

  function setStockTracking(enabled: boolean) {
    onChange({
      ...form,
      stock_tracking_enabled: enabled,
      stock_quantity: enabled && !form.stock_quantity.trim() ? "0" : form.stock_quantity
    });
  }

  function renderImageControls(compact = false) {
    return (
      <div className={compact ? "menu-media-preview-tools is-compact" : "menu-media-preview-tools"}>
        <figure className="menu-image-inline-preview" aria-label="Mevcut ürün görseli önizlemesi">
          <div className="menu-image-preview-frame">
            {visiblePreviewSource
              ? <img src={visiblePreviewSource} alt="Mevcut ürün görseli" onError={() => setFailedPreviewSource(previewSource)} />
              : <span className="menu-image-preview-empty">{form.image_url ? "Önizleme yok" : "Görsel yok"}</span>}
          </div>
        </figure>

        <div className="menu-media-actions">
          <ActionButton
            variant="secondary"
            size="sm"
            type="button"
            aria-busy={imageBusy}
            onClick={() => imageInputRef.current?.click()}
            disabled={imageBusy}
          >
            {imageBusy ? "Hazırlanıyor…" : "Dosya seç"}
          </ActionButton>
          <ActionButton
            variant="ghost"
            size="sm"
            type="button"
            onClick={clearImage}
            disabled={imageBusy || !form.image_url}
          >
            Temizle
          </ActionButton>
        </div>

        <span className="menu-media-file-name" title={imageLabel}>{imageBusy ? "Görsel hazırlanıyor…" : imageLabel}</span>
        <input ref={imageInputRef} className="menu-image-file-input" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" tabIndex={-1} aria-hidden="true" onChange={(event) => void handleImageFile(event.target.files?.[0])} />
        {imageError && <small className="menu-image-error" role="status">{imageError}</small>}
      </div>
    );
  }

  return (
    <div className="form-stack menu-item-form">
      {showDetails && (
        <section className="panel menu-item-details-section">
          <div className="page-toolbar menu-item-section-heading">
            <div className="page-toolbar__copy">
              <strong>Ürün bilgileri</strong>
              <small>Menüde görünen temel bilgiler ve sınıflandırma.</small>
            </div>
          </div>

          <div className={showInlineMedia ? "menu-item-editor-grid has-media" : "menu-item-editor-grid"}>
            <label className="form-field menu-item-field-name">
              Ürün adı
              <input value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} placeholder="Serpme Kahvaltı" />
            </label>

            <label className="form-field menu-item-field-category">
              Kategori
              <select value={form.category_id} onChange={(event) => onChange({ ...form, category_id: event.target.value })}>
                {dashboardData.menu.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>

            <label className="form-field menu-item-field-price">
              Fiyat
              <MoneyInput value={form.price} onChange={(price) => onChange({ ...form, price })} />
            </label>

            <label className="form-field menu-item-field-currency">
              Para birimi
              <select value={form.currency} onChange={(event) => onChange({ ...form, currency: event.target.value })}>
                <option value="TRY">TRY</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </label>

            <label className="form-field menu-item-field-description">
              Açıklama
              <input value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} placeholder="Ürün açıklaması" />
            </label>

            {showInlineMedia && (
              <div className="menu-item-image-editor">
                <span className="menu-item-image-label">Ürün görseli</span>
                {renderImageControls(true)}
              </div>
            )}

            <div className="menu-item-field-status" aria-label="Ürün durumu">
              <StatusChip
                tone="success"
                selected={form.is_available}
                onClick={() => onChange({ ...form, is_available: !form.is_available })}
              >
                Mevcut
              </StatusChip>
              <StatusChip
                tone="warning"
                selected={form.is_featured}
                onClick={() => onChange({ ...form, is_featured: !form.is_featured })}
              >
                Öne çıkar
              </StatusChip>
            </div>

            <label className="form-field menu-item-field-tags">
              Etiketler
              <input value={form.tags} onChange={(event) => onChange({ ...form, tags: event.target.value })} placeholder="popüler, kahvaltı" />
            </label>

            <label className="form-field menu-item-field-allergens">
              Alerjenler
              <input value={form.allergens} onChange={(event) => onChange({ ...form, allergens: event.target.value })} placeholder="gluten, süt" />
            </label>
          </div>
        </section>
      )}

      {showStock && (
        <section className={`panel menu-item-stock-section ${form.stock_tracking_enabled ? "is-enabled" : "is-disabled"}`}>
          <div className="page-toolbar menu-stock-toolbar">
            <div className="page-toolbar__copy">
              <strong>Stok</strong>
              {form.stock_tracking_enabled && <small>Stok miktarı, uyarı seviyesi ve satışta düşülecek miktarı takip edin.</small>}
            </div>
            <label className="form-check menu-stock-toggle">
              <input
                checked={form.stock_tracking_enabled}
                onChange={(event) => setStockTracking(event.target.checked)}
                type="checkbox"
              />
              Stok takibi
            </label>
          </div>

          {form.stock_tracking_enabled && (
            <div className="menu-stock-fields">
              <div className="menu-stock-metrics">
                <label className="form-field">
                  Stok miktarı
                  <input value={form.stock_quantity} onChange={(event) => onChange({ ...form, stock_quantity: event.target.value })} inputMode="decimal" type="number" min="0" step="any" placeholder="Örn. 10" />
                </label>
                <label className="form-field">
                  Stok birimi
                  <select value={form.stock_unit} onChange={(event) => onChange({ ...form, stock_unit: event.target.value === "gram" ? "gram" : "piece" })}>
                    <option value="piece">Adet</option>
                    <option value="gram">Gram</option>
                  </select>
                </label>
                <label className="form-field">
                  Minimum stok uyarısı ({stockUnitShortLabel(form.stock_unit)})
                  <input value={form.stock_min_quantity} onChange={(event) => onChange({ ...form, stock_min_quantity: event.target.value })} inputMode="decimal" type="number" min="0" step="any" placeholder="Örn. 5" />
                </label>
                <label className="form-field">
                  Bir satışta düşülecek ({stockUnitShortLabel(form.stock_unit)})
                  <input value={form.stock_consumption_quantity} onChange={(event) => onChange({ ...form, stock_consumption_quantity: event.target.value })} inputMode="decimal" type="number" min="0.001" step="any" placeholder="Örn. 1" />
                </label>
              </div>

              {qrMenuEnabled && (
                <label className="form-check menu-stock-qr-toggle">
                  <input checked={form.hide_when_out_of_stock} onChange={(event) => onChange({ ...form, hide_when_out_of_stock: event.target.checked })} type="checkbox" />
                  Stok bitince QR menüden gizle
                </label>
              )}

              <label className="form-field menu-stock-note">
                Stok notu
                <input value={form.stock_note} onChange={(event) => onChange({ ...form, stock_note: event.target.value })} placeholder="İsteğe bağlı kısa stok notu" />
              </label>
            </div>
          )}
        </section>
      )}

      {showStandaloneMedia && (
        <section className="panel menu-item-media-section">
          <div className="menu-media-header">
            <div className="page-toolbar__copy">
              <strong>Görsel</strong>
              <small>Menü kartında kullanılacak görsel.</small>
            </div>
            {renderImageControls()}
          </div>
        </section>
      )}
    </div>
  );
}

function describeImageValue(value: string) {
  const normalized = value.trim();
  if (!normalized) return "Görsel seçilmedi";
  if (normalized.startsWith("data:image/")) return "Kayıtlı ürün görseli";
  try {
    const url = new URL(normalized, window.location.href);
    return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "") || "Kayıtlı ürün görseli";
  } catch {
    return normalized.split(/[\\/]/).filter(Boolean).pop() || "Kayıtlı ürün görseli";
  }
}

async function prepareMenuImage(file: File): Promise<string> {
  if (!isSupportedImage(file)) throw new Error("JPG, PNG veya WebP biçiminde bir görsel seçin.");
  if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error("Görsel çok büyük. En fazla 15 MB boyutunda bir dosya seçin.");
  const bitmap = await createImageBitmap(file);
  try {
    const longestSide = Math.max(bitmap.width, bitmap.height);
    let scale = Math.min(1, 1400 / Math.max(1, longestSide));
    let quality = 0.84;
    let prepared: Blob | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Görsel işleme alanı açılamadı.");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      prepared = await canvasToBlob(canvas, "image/webp", quality);
      if (prepared.size <= TARGET_IMAGE_BYTES) break;
      scale *= 0.82;
      quality = Math.max(0.62, quality - 0.07);
    }
    if (!prepared) throw new Error("Görsel dönüştürülemedi.");
    if (prepared.size > MAX_OUTPUT_IMAGE_BYTES) throw new Error("Görsel menü için hâlâ çok büyük. Daha küçük bir görsel seçin.");
    return blobToDataUrl(prepared);
  } finally {
    bitmap.close();
  }
}

function isSupportedImage(file: File) {
  return SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase()) || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Görsel dönüştürülemedi.")), type, quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Görsel okunamadı."));
    reader.onerror = () => reject(new Error("Görsel okunamadı."));
    reader.readAsDataURL(blob);
  });
}
