import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Plus, Save, Star, Trash2 } from "lucide-react";
import type { PublishedMenuCategory, PublishedMenuItem } from "@yardimci-asistan/sync-core";
import type { DesktopDashboardData } from "../../../electron/database";
import { StockImageImportWorkspace } from "../restaurant/StockImageImportWorkspace";
import {
  compareMenuRecords,
  findMenuCategoryName,
  formatCurrency,
  formatStockQuantity,
  getMenuStockBadge,
  isQrHiddenByStock,
  resolveMenuPreviewImageUrl,
  stockUnitShortLabel,
  type CategoryFormState,
  type ItemFormState
} from "./menu-model";
import { ActionButton } from "../ui/ActionButton";
import { StatusBadge } from "../ui/StatusBadge";

type SyncState = "idle" | "loading" | "success" | "error";

interface MenuManagerProps {
  dashboardData: DesktopDashboardData;
  qrMenuEnabled: boolean;
  inventoryEnabled: boolean;
  stockImageImportEnabled: boolean;
  categoryForm: CategoryFormState;
  itemForm: ItemFormState;
  selectedCategoryId: string;
  selectedItemId: string;
  menuEditState: SyncState;
  menuEditMessage: string;
  onCategoryFormChange: (form: CategoryFormState) => void;
  onItemFormChange: (form: ItemFormState) => void;
  onSelectCategory: (category: PublishedMenuCategory) => void;
  onSelectItem: (item: PublishedMenuItem) => void;
  onNewCategory: () => void;
  onNewItem: () => void;
  onSaveCategory: () => void;
  onSaveItem: () => void;
  onDeleteCategory: () => void;
  onDeleteItem: () => void;
  onDashboardDataChanged: (data: DesktopDashboardData) => void;
}

const MAX_SOURCE_IMAGE_BYTES = 15 * 1024 * 1024;
const TARGET_IMAGE_BYTES = 420 * 1024;
const MAX_OUTPUT_IMAGE_BYTES = 700 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function MenuManager({
  dashboardData,
  qrMenuEnabled,
  inventoryEnabled,
  stockImageImportEnabled,
  categoryForm,
  itemForm,
  selectedCategoryId,
  selectedItemId,
  menuEditState,
  menuEditMessage,
  onCategoryFormChange,
  onItemFormChange,
  onSelectCategory,
  onSelectItem,
  onNewCategory,
  onNewItem,
  onSaveCategory,
  onSaveItem,
  onDeleteCategory,
  onDeleteItem,
  onDashboardDataChanged
}: MenuManagerProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageLabel, setImageLabel] = useState(() => describeImageValue(itemForm.image_url));
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState("");
  const [failedPreviewSource, setFailedPreviewSource] = useState("");

  const sortedCategories = useMemo(
    () => [...dashboardData.menu.categories].sort(compareMenuRecords),
    [dashboardData.menu.categories]
  );
  const visibleItems = useMemo(
    () => dashboardData.menu.items
      .filter((item) => !selectedCategoryId || item.category_id === selectedCategoryId)
      .sort(compareMenuRecords),
    [dashboardData.menu.items, selectedCategoryId]
  );
  const selectedCategoryName = selectedCategoryId
    ? findMenuCategoryName(selectedCategoryId, dashboardData.menu.categories)
    : "Tüm kategoriler";
  const previewSource = resolveMenuPreviewImageUrl(itemForm.image_url, dashboardData.webModuleUrl);
  const visiblePreviewSource = previewSource && previewSource !== failedPreviewSource ? previewSource : "";

  // Reset on item selection, preserving the uploaded filename when only its URL changes.
  const resetSelectedImage = useEffectEvent(() => {
    setImageLabel(describeImageValue(itemForm.image_url));
    setImageError("");
    setFailedPreviewSource("");
  });

  useEffect(() => {
    resetSelectedImage();
  }, [itemForm.id, selectedItemId]);

  useEffect(() => {
    setFailedPreviewSource("");
  }, [itemForm.image_url]);

  function selectManagerCategory(category: PublishedMenuCategory) {
    onSelectCategory(category);
  }

  async function handleImageFile(file: File | undefined) {
    if (!file) return;
    setImageBusy(true);
    setImageError("");
    try {
      const dataUrl = await prepareMenuImage(file);
      onItemFormChange({ ...itemForm, image_url: dataUrl });
      setImageLabel(file.name);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Görsel hazırlanamadı.");
    } finally {
      setImageBusy(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  function clearImage() {
    onItemFormChange({ ...itemForm, image_url: "" });
    setImageLabel("Görsel seçilmedi");
    setImageError("");
  }

  return (
    <section className="menu-manager" aria-label={qrMenuEnabled ? "QR menü yönetimi" : "Menü yönetimi"}>
      <div className="menu-management-grid">
        <section className="panel menu-list-panel category-panel">
          <div className="panel-heading compact">
            <h2>Kategoriler</h2>
            <div className="menu-heading-actions page-toolbar__actions">
              <StatusBadge tone="info">{dashboardData.menu.categories.length} kayıt</StatusBadge>
              <button className="icon-command" type="button" onClick={onNewCategory} aria-label="Kategori ekle" title="Kategori ekle">
                <Plus size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="manager-list">
            {sortedCategories.map((category) => (
              <button
                className={selectedCategoryId === category.id ? "manager-row is-active" : "manager-row"}
                key={category.id}
                type="button"
                onClick={() => selectManagerCategory(category)}
                aria-pressed={selectedCategoryId === category.id}
              >
                <span>
                  <strong>{category.name}</strong>
                  <small>{dashboardData.menu.items.filter((item) => item.category_id === category.id).length} ürün · {category.is_active ? (qrMenuEnabled ? "Yayında" : "Aktif") : (qrMenuEnabled ? "Gizli" : "Pasif")}</small>
                </span>
                <span className={category.is_active ? "dot is-on" : "dot"} aria-hidden="true" />
              </button>
            ))}
          </div>

          <div className="manager-form">
            <label>
              Kategori adı
              <input
                value={categoryForm.name}
                onChange={(event) => onCategoryFormChange({ ...categoryForm, name: event.target.value })}
                placeholder="Kahvaltı"
              />
            </label>
            <label>
              Açıklama
              <textarea
                value={categoryForm.description}
                onChange={(event) => onCategoryFormChange({ ...categoryForm, description: event.target.value })}
                placeholder="Kısa kategori açıklaması"
              />
            </label>
            <label className="toggle-label">
              <input
                checked={categoryForm.is_active}
                onChange={(event) => onCategoryFormChange({ ...categoryForm, is_active: event.target.checked })}
                type="checkbox"
              />
              {qrMenuEnabled ? "Yayında göster" : "Menüde etkin"}
            </label>
            <div className="form-details category-details menu-always-open-details">
              <label>
                Sıra
                <input
                  value={categoryForm.sort_order}
                  onChange={(event) => onCategoryFormChange({ ...categoryForm, sort_order: event.target.value })}
                  inputMode="numeric"
                />
              </label>
            </div>
            <div className="menu-form-actions action-row">
              {categoryForm.id && (
                <ActionButton variant="danger" size="sm" type="button" onClick={onDeleteCategory} disabled={menuEditState === "loading"}>
                  <Trash2 size={16} aria-hidden="true" />
                  Kategoriyi Sil
                </ActionButton>
              )}
              <button className="primary-command" type="button" onClick={onSaveCategory} disabled={menuEditState === "loading"}>
                <Save size={16} aria-hidden="true" />
                Kategoriyi Kaydet
              </button>
            </div>
          </div>
        </section>

        <section className="panel menu-list-panel product-panel">
          <div className="panel-heading compact">
            <div className="menu-heading-copy">
              <h2>Ürünler</h2>
              <span>{selectedCategoryName}</span>
            </div>
            <div className="menu-heading-actions page-toolbar__actions">
              {stockImageImportEnabled && (
                <StockImageImportWorkspace menu={dashboardData.menu} onApplied={onDashboardDataChanged} />
              )}
              <StatusBadge tone="info">{dashboardData.menu.items.length} kayıt</StatusBadge>
              <button className="icon-command" type="button" onClick={onNewItem} aria-label="Ürün ekle" title="Ürün ekle">
                <Plus size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="manager-list product-list">
            {visibleItems.length === 0 && <p className="manager-list-empty">Bu kategoride henüz ürün yok.</p>}
            {visibleItems.map((item) => {
              const stockBadge = getMenuStockBadge(item);
              return (
                <button
                  className={selectedItemId === item.id ? "manager-row is-active" : "manager-row"}
                  key={item.id}
                  type="button"
                  onClick={() => onSelectItem(item)}
                  aria-pressed={selectedItemId === item.id}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>{formatCurrency(item.price, item.currency)} · {item.is_available ? "Mevcut" : "Kapalı"}{item.is_featured ? " · Öne çıkan" : ""}</small>
                  </span>
                  <span className="menu-stock-badges">
                    {inventoryEnabled && stockBadge && <StatusBadge tone={stockBadge.tone}>{stockBadge.label}</StatusBadge>}
                    {inventoryEnabled && qrMenuEnabled && isQrHiddenByStock(item) && <StatusBadge tone="neutral">QR menüde gizli</StatusBadge>}
                    {item.is_featured
                      ? <Star className="manager-row-star" size={14} aria-hidden="true" />
                      : <span className={item.is_available ? "dot is-on dot" : "dot"} aria-hidden="true" />}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="panel item-editor-panel">
          <div className="panel-heading compact">
            <h2>Ürün Detayı</h2>
            <StatusBadge tone={itemForm.is_available ? "ok" : "neutral"}>{itemForm.id ? "Seçili" : "Yeni"}</StatusBadge>
          </div>

          <div className="manager-form item-form">
            <label className="item-name-field">
              Ürün adı
              <input value={itemForm.name} onChange={(event) => onItemFormChange({ ...itemForm, name: event.target.value })} placeholder="Serpme Kahvaltı" />
            </label>
            <label className="item-category-field">
              Kategori
              <select value={itemForm.category_id} onChange={(event) => onItemFormChange({ ...itemForm, category_id: event.target.value })}>
                {dashboardData.menu.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="item-price-field">
              Fiyat
              <input value={itemForm.price} onChange={(event) => onItemFormChange({ ...itemForm, price: event.target.value })} inputMode="decimal" />
            </label>
            <label className="item-description-field">
              Açıklama
              <textarea
                value={itemForm.description}
                onChange={(event) => onItemFormChange({ ...itemForm, description: event.target.value })}
                placeholder="Ürün açıklaması"
              />
            </label>
            <div className="form-row">
              <label className="toggle-label">
                <input checked={itemForm.is_available} onChange={(event) => onItemFormChange({ ...itemForm, is_available: event.target.checked })} type="checkbox" />
                Mevcut
              </label>
              <label className="toggle-label">
                <input checked={itemForm.is_featured} onChange={(event) => onItemFormChange({ ...itemForm, is_featured: event.target.checked })} type="checkbox" />
                Öne çıkar
              </label>
            </div>

            {inventoryEnabled && <details className="menu-stock-editor" key={itemForm.id || "new-menu-item"}>
              <summary className="menu-stock-editor-heading">
                <span>
                  <strong id="menu-stock-editor-title">Stok</strong>
                  <small>Miktar boşsa takip edilmez; 0 stokta yok demektir.</small>
                </span>
                <span className="menu-stock-summary-value">
                  {itemForm.stock_quantity === "" ? "Takip edilmiyor" : formatStockQuantity(Number(itemForm.stock_quantity), itemForm.stock_unit)}
                </span>
              </summary>
              <div className="menu-stock-editor-body">
                <div className="form-row">
                  <label>
                    Stok miktarı
                    <input value={itemForm.stock_quantity} onChange={(event) => onItemFormChange({ ...itemForm, stock_quantity: event.target.value })} inputMode="decimal" type="number" min="0" step="any" placeholder="Takip edilmiyor" />
                  </label>
                  <label>
                    Stok birimi
                    <select value={itemForm.stock_unit} onChange={(event) => onItemFormChange({ ...itemForm, stock_unit: event.target.value === "gram" ? "gram" : "piece" })}>
                      <option value="piece">Adet</option>
                      <option value="gram">Gram</option>
                    </select>
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Minimum stok uyarısı ({stockUnitShortLabel(itemForm.stock_unit)})
                    <input value={itemForm.stock_min_quantity} onChange={(event) => onItemFormChange({ ...itemForm, stock_min_quantity: event.target.value })} inputMode="decimal" type="number" min="0" step="any" placeholder="Örn. 5" />
                  </label>
                  <label>
                    Bir satışta düşülecek ({stockUnitShortLabel(itemForm.stock_unit)})
                    <input value={itemForm.stock_consumption_quantity} onChange={(event) => onItemFormChange({ ...itemForm, stock_consumption_quantity: event.target.value })} inputMode="decimal" type="number" min="0.001" step="any" placeholder="Örn. 1" />
                  </label>
                </div>
                {qrMenuEnabled && (
                  <label className="toggle-label">
                    <input checked={itemForm.hide_when_out_of_stock} onChange={(event) => onItemFormChange({ ...itemForm, hide_when_out_of_stock: event.target.checked })} type="checkbox" />
                    Stok bitince QR menüden gizle
                  </label>
                )}
                <label>
                  Stok notu
                  <textarea value={itemForm.stock_note} onChange={(event) => onItemFormChange({ ...itemForm, stock_note: event.target.value })} placeholder="İsteğe bağlı kısa stok notu" />
                </label>
                {itemForm.stock_quantity !== "" && (
                  <button className="stock-stop-action" type="button" onClick={() => onItemFormChange({ ...itemForm, stock_quantity: "" })}>Stok takibini bırak</button>
                )}
              </div>
            </details>}

            <div className="form-details item-details has-menu-image-preview menu-always-open-details">
              <div className="menu-image-picker-label">
                <span className="menu-image-field-title">Görsel</span>
                <button
                  className="menu-image-picker-control"
                  type="button"
                  aria-label="Ürün görseli seç"
                  aria-busy={imageBusy}
                  title="Görsel seçmek veya değiştirmek için tıklayın. Görseli kaldırmak için Delete tuşuna basın."
                  onClick={() => imageInputRef.current?.click()}
                  onKeyDown={(event) => {
                    if ((event.key === "Delete" || event.key === "Backspace") && itemForm.image_url) {
                      event.preventDefault();
                      clearImage();
                    }
                  }}
                >
                  <span>{imageBusy ? "Görsel hazırlanıyor…" : imageLabel}</span>
                  <strong>{imageBusy ? "Hazırlanıyor" : "Dosya seç"}</strong>
                </button>
                <input
                  ref={imageInputRef}
                  className="menu-image-file-input"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(event) => void handleImageFile(event.target.files?.[0])}
                />
                {imageError && <small className="menu-image-error" role="status">{imageError}</small>}
              </div>
              <div className="form-row">
                <label>
                  Sıra
                  <input value={itemForm.sort_order} onChange={(event) => onItemFormChange({ ...itemForm, sort_order: event.target.value })} inputMode="numeric" />
                </label>
                <label>
                  Para birimi
                  <select value={itemForm.currency} onChange={(event) => onItemFormChange({ ...itemForm, currency: event.target.value })}>
                    <option value="TRY">TRY</option><option value="EUR">EUR</option><option value="USD">USD</option>
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label>
                  Etiketler
                  <input value={itemForm.tags} onChange={(event) => onItemFormChange({ ...itemForm, tags: event.target.value })} placeholder="popüler, kahvaltı" />
                </label>
                <label>
                  Alerjenler
                  <input value={itemForm.allergens} onChange={(event) => onItemFormChange({ ...itemForm, allergens: event.target.value })} placeholder="gluten, süt" />
                </label>
              </div>
              <figure className="menu-image-inline-preview" aria-label="Mevcut ürün görseli önizlemesi">
                <div className="menu-image-preview-frame">
                  {visiblePreviewSource ? (
                    <img src={visiblePreviewSource} alt="Mevcut ürün görseli" onError={() => setFailedPreviewSource(previewSource)} />
                  ) : (
                    <span className="menu-image-preview-empty">{itemForm.image_url ? "Önizleme yok" : "Görsel yok"}</span>
                  )}
                </div>
                <figcaption>Mevcut görsel</figcaption>
              </figure>
            </div>

            <div className="menu-editor-footer">
              <p className={`menu-status sync-${menuEditState}`} role="status" aria-live="polite">{menuEditMessage}</p>
              <div className="menu-editor-actions action-row">
                {itemForm.id && (
                  <ActionButton variant="danger" size="sm" type="button" onClick={onDeleteItem} disabled={menuEditState === "loading"}>
                    <Trash2 size={16} aria-hidden="true" />
                    Ürünü Sil
                  </ActionButton>
                )}
                <button className="primary-command" type="button" onClick={onSaveItem} disabled={menuEditState === "loading"}>
                  <Save size={16} aria-hidden="true" />
                  Ürünü Kaydet
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

function describeImageValue(value: string) {
  const normalized = value.trim();
  if (!normalized) return "Görsel seçilmedi";
  if (normalized.startsWith("data:image/")) return "Kayıtlı ürün görseli";
  try {
    const url = new URL(normalized, window.location.href);
    return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "") || "Kayıtlı ürün görseli";
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
