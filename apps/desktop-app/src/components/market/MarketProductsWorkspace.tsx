import { Image as ImageIcon, Plus, Save, Search, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BUSINESS_CAPABILITIES,
  type CatalogCategory,
  type CatalogProduct,
  type CommerceUnit,
  type ProductLookupCandidate
} from "@yardimci-asistan/shared";
import { runtimeHasCapability } from "../../app/capabilities";
import { useBusinessCapabilityRuntime } from "../../app/business-capability-context";
import { StatusBadge } from "../ui/StatusBadge";

interface ProductFormState {
  id: string;
  categoryId: string;
  name: string;
  brand: string;
  sku: string;
  barcode: string;
  description: string;
  salePrice: string;
  purchasePrice: string;
  currency: string;
  unit: CommerceUnit;
  taxRate: string;
  minimumQuantity: string;
  trackInventory: boolean;
  isActive: boolean;
  imageSourceUrl: string;
  dataSource: string;
  sourceProductUrl: string;
  dataLicense: string;
  imageLicense: string;
  sourceFetchedAt: string;
}

interface CategoryFormState {
  id: string;
  parentId: string;
  name: string;
  code: string;
  sortOrder: string;
  isActive: boolean;
}

export interface ProductLookupFormRequest {
  requestId: number;
  product: ProductLookupCandidate;
}

interface MarketProductsWorkspaceProps {
  products: CatalogProduct[];
  categories: CatalogCategory[];
  busy: boolean;
  productDataEnabled?: boolean;
  onReload: () => Promise<void>;
  onStateChange: (state: "loading" | "success" | "error", message: string) => void;
  productLookupRequest?: ProductLookupFormRequest | null;
  onProductLookupLoaded?: (requestId: number) => void;
}

const unitLabels: Record<CommerceUnit, string> = {
  piece: "Adet",
  kg: "Kilogram",
  g: "Gram",
  l: "Litre",
  ml: "Mililitre",
  pack: "Paket",
  box: "Kutu",
  meter: "Metre",
  other: "Diğer"
};

function emptyProductForm(inventoryEnabled = true): ProductFormState {
  return {
    id: "",
    categoryId: "",
    name: "",
    brand: "",
    sku: "",
    barcode: "",
    description: "",
    salePrice: "0",
    purchasePrice: "0",
    currency: "TRY",
    unit: "piece",
    taxRate: "0",
    minimumQuantity: "0",
    trackInventory: inventoryEnabled,
    isActive: true,
    imageSourceUrl: "",
    dataSource: "",
    sourceProductUrl: "",
    dataLicense: "",
    imageLicense: "",
    sourceFetchedAt: ""
  };
}

function emptyCategoryForm(): CategoryFormState {
  return { id: "", parentId: "", name: "", code: "", sortOrder: "0", isActive: true };
}

function money(value: number, currency = "TRY") {
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function providerLabel(provider: string) {
  return provider === "open_food_facts" ? "Open Food Facts" : provider || "Harici kaynak";
}

function matchingCategoryId(categories: CatalogCategory[], hint: string) {
  const hints = hint
    .split(",")
    .map((value) => value.trim().toLocaleLowerCase("tr-TR"))
    .filter(Boolean);
  if (hints.length === 0) return "";
  return categories.find((category) =>
    category.isActive && hints.includes(category.name.trim().toLocaleLowerCase("tr-TR"))
  )?.id ?? "";
}

export function MarketProductsWorkspace({
  products,
  categories,
  busy,
  productDataEnabled = false,
  onReload,
  onStateChange,
  productLookupRequest = null,
  onProductLookupLoaded
}: MarketProductsWorkspaceProps) {
  const bridge = window.yardimciDesktop?.commerce;
  const { snapshot } = useBusinessCapabilityRuntime();
  const inventoryEnabled = runtimeHasCapability(snapshot, BUSINESS_CAPABILITIES.INVENTORY);
  const [search, setSearch] = useState("");
  const [productForm, setProductForm] = useState<ProductFormState>(() => emptyProductForm(inventoryEnabled));
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [imagePreviewDataUrl, setImagePreviewDataUrl] = useState("");
  const [imagePreviewLoading, setImagePreviewLoading] = useState(false);
  const loadedLookupRequestId = useRef<number | null>(null);
  const imagePreviewRequestId = useRef(0);

  const filteredProducts = products.filter((product) => {
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return true;
    return [product.name, product.brand, product.sku, product.barcode]
      .some((value) => String(value ?? "").toLocaleLowerCase("tr-TR").includes(needle));
  });

  const loadExternalImagePreview = useCallback((candidate: ProductLookupCandidate) => {
    imagePreviewRequestId.current += 1;
    const requestId = imagePreviewRequestId.current;
    setImagePreviewDataUrl("");
    setImagePreviewLoading(Boolean(candidate.imageUrl));
    if (!candidate.imageUrl || !bridge?.previewExternalProductImage) {
      setImagePreviewLoading(false);
      return;
    }
    void bridge.previewExternalProductImage(candidate.provider, candidate.imageUrl)
      .then((dataUrl) => {
        if (imagePreviewRequestId.current === requestId) {
          setImagePreviewDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (imagePreviewRequestId.current === requestId) {
          setImagePreviewDataUrl("");
        }
      })
      .finally(() => {
        if (imagePreviewRequestId.current === requestId) {
          setImagePreviewLoading(false);
        }
      });
  }, [bridge]);

  const applyLookupCandidate = useCallback((candidate: ProductLookupCandidate, reset = false) => {
    loadExternalImagePreview(candidate);
    setProductForm((current) => {
      const base = reset ? emptyProductForm(inventoryEnabled) : current;
      const matchedCategoryId = matchingCategoryId(categories, candidate.categoryHint);
      const quantityDescription = candidate.quantity ? `Ambalaj: ${candidate.quantity}` : "";
      return {
        ...base,
        barcode: candidate.barcode,
        name: base.name.trim() ? base.name : candidate.name,
        brand: base.brand.trim() ? base.brand : candidate.brand,
        categoryId: base.categoryId || matchedCategoryId,
        description: base.description.trim() ? base.description : quantityDescription,
        imageSourceUrl: candidate.imageUrl,
        dataSource: candidate.provider,
        sourceProductUrl: candidate.sourceProductUrl,
        dataLicense: candidate.dataLicense,
        imageLicense: candidate.imageLicense,
        sourceFetchedAt: candidate.fetchedAt
      };
    });
  }, [categories, inventoryEnabled, loadExternalImagePreview]);

  useEffect(() => {
    if (!productLookupRequest || loadedLookupRequestId.current === productLookupRequest.requestId) return;
    loadedLookupRequestId.current = productLookupRequest.requestId;
    applyLookupCandidate(productLookupRequest.product, true);
    onProductLookupLoaded?.(productLookupRequest.requestId);
    onStateChange(
      "success",
      `${productLookupRequest.product.name} bilgileri Open Food Facts'tan bulundu. Satış fiyatı ve diğer yerel alanları kontrol edip kaydedin.`
    );
  }, [applyLookupCandidate, onProductLookupLoaded, onStateChange, productLookupRequest]);

  async function editProduct(product: CatalogProduct) {
    let minimumQuantity = "0";
    if (bridge && inventoryEnabled && product.trackInventory) {
      try {
        const balance = await bridge.getInventoryBalance(product.id);
        minimumQuantity = String(balance.minimumQuantity);
      } catch {
        onStateChange("error", "Ürünün mevcut minimum stok eşiği okunamadı; kaydetmeden önce Stok ekranını kontrol edin.");
        return;
      }
    }
    setProductForm({
      id: product.id,
      categoryId: product.categoryId,
      name: product.name,
      brand: product.brand ?? "",
      sku: product.sku,
      barcode: product.barcode,
      description: product.description,
      salePrice: String(product.salePrice),
      purchasePrice: String(product.purchasePrice),
      currency: product.currency,
      unit: product.unit,
      taxRate: String(product.taxRate),
      minimumQuantity,
      trackInventory: product.trackInventory,
      isActive: product.isActive,
      imageSourceUrl: product.imageSourceUrl ?? "",
      dataSource: product.dataSource ?? "",
      sourceProductUrl: product.sourceProductUrl ?? "",
      dataLicense: product.dataLicense ?? "",
      imageLicense: product.imageLicense ?? "",
      sourceFetchedAt: product.sourceFetchedAt ?? ""
    });
    imagePreviewRequestId.current += 1;
    setImagePreviewLoading(false);
    setImagePreviewDataUrl("");
    if (bridge && product.imageAssetPath) {
      try {
        setImagePreviewDataUrl(await bridge.getProductImageDataUrl(product.id));
      } catch {
        setImagePreviewDataUrl("");
      }
    }
  }

  async function lookupProductInfo() {
    if (!bridge || !productForm.barcode.trim() || lookupBusy) return;
    setLookupBusy(true);
    onStateChange("loading", "Ürün bilgileri aranıyor…");
    try {
      const result = await bridge.lookupExternalProductByBarcode(productForm.barcode.trim(), "manual");
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
      applyLookupCandidate(result.product);
      onStateChange("success", `${result.product.name} bilgileri bulundu.`);
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Ürün bilgileri alınamadı.");
    } finally {
      setLookupBusy(false);
    }
  }

  async function saveProduct() {
    if (!bridge) return;
    onStateChange("loading", "Ürün kaydediliyor…");
    let saved: CatalogProduct;
    try {
      saved = await bridge.saveProduct({
        id: productForm.id || undefined,
        categoryId: productForm.categoryId,
        name: productForm.name,
        brand: productForm.brand,
        sku: productForm.sku,
        barcode: productForm.barcode,
        description: productForm.description,
        salePrice: Number(productForm.salePrice),
        purchasePrice: Number(productForm.purchasePrice),
        currency: productForm.currency,
        unit: productForm.unit,
        taxRate: Number(productForm.taxRate),
        minimumQuantity: Number(productForm.minimumQuantity),
        trackInventory: productForm.trackInventory,
        isActive: productForm.isActive,
        imageSourceUrl: productForm.imageSourceUrl,
        dataSource: productForm.dataSource,
        sourceProductUrl: productForm.sourceProductUrl,
        dataLicense: productForm.dataLicense,
        imageLicense: productForm.imageLicense,
        sourceFetchedAt: productForm.sourceFetchedAt
      });
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Ürün kaydedilemedi.");
      return;
    }

    setProductForm((current) => ({
      ...current,
      id: saved.id,
      brand: saved.brand,
      imageSourceUrl: saved.imageSourceUrl,
      dataSource: saved.dataSource,
      sourceProductUrl: saved.sourceProductUrl,
      dataLicense: saved.dataLicense,
      imageLicense: saved.imageLicense,
      sourceFetchedAt: saved.sourceFetchedAt
    }));
    if (saved.imageAssetPath) {
      try {
        setImagePreviewDataUrl(await bridge.getProductImageDataUrl(saved.id));
      } catch {
        setImagePreviewDataUrl("");
      }
    }

    let catalogReloadFailed = false;
    try {
      await onReload();
    } catch {
      catalogReloadFailed = true;
    }
    onStateChange(
      "success",
      `${saved.name} kaydedildi.${saved.imageAssetPath ? " Ürün görseli yerel arşive eklendi." : ""}${catalogReloadFailed ? " Katalog görünümü yenilenemedi." : ""}`
    );
  }

  function editCategory(category: CatalogCategory) {
    setCategoryForm({
      id: category.id,
      parentId: category.parentId,
      name: category.name,
      code: category.code,
      sortOrder: String(category.sortOrder),
      isActive: category.isActive
    });
  }

  async function saveCategory() {
    if (!bridge) return;
    onStateChange("loading", "Kategori kaydediliyor…");
    try {
      const saved = await bridge.saveCategory({
        id: categoryForm.id || undefined,
        parentId: categoryForm.parentId,
        name: categoryForm.name,
        code: categoryForm.code,
        sortOrder: Number(categoryForm.sortOrder),
        isActive: categoryForm.isActive
      });
      setCategoryForm(emptyCategoryForm());
      await onReload();
      onStateChange("success", `${saved.name} kategorisi kaydedildi.`);
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Kategori kaydedilemedi.");
    }
  }

  async function deleteCategory(categoryId: string) {
    if (!bridge) return;
    onStateChange("loading", "Kategori kaldırılıyor…");
    try {
      await bridge.deleteCategory(categoryId);
      if (categoryForm.id === categoryId) setCategoryForm(emptyCategoryForm());
      await onReload();
      onStateChange("success", "Kategori kaldırıldı.");
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Kategori kaldırılamadı.");
    }
  }

  return (
    <div className="market-two-column">
      <section className="market-panel">
        <header className="market-panel-heading market-panel-heading-row">
          <div><span>Katalog</span><h2>Ürünler</h2><p>Ürün kartları satış ve stok tarafından ortak kullanılır.</p></div>
          <button type="button" className="market-secondary-button" onClick={() => {
            setProductForm(emptyProductForm(inventoryEnabled));
            imagePreviewRequestId.current += 1;
            setImagePreviewLoading(false);
            setImagePreviewDataUrl("");
          }}>
            <Plus size={16} aria-hidden="true" /> Yeni ürün
          </button>
        </header>
        <label className="market-search-field">
          <Search size={16} aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ad, marka, SKU veya barkod ara" />
        </label>
        <div className="market-list">
          {filteredProducts.map((product) => (
            <button type="button" className="market-list-row" key={product.id} onClick={() => void editProduct(product)}>
              <span>
                <strong>{product.name}</strong>
                <small>{product.brand ? `${product.brand} · ` : ""}{product.sku || "SKU yok"} · {product.barcode || "Barkod yok"}</small>
              </span>
              <span className="market-list-value">{money(product.salePrice, product.currency)}</span>
            </button>
          ))}
          {filteredProducts.length === 0 && <p className="market-muted">Eşleşen ürün yok.</p>}
        </div>
      </section>

      <section className="market-panel">
        <header className="market-panel-heading"><span>{productForm.id ? "Düzenle" : "Yeni kayıt"}</span><h2>Ürün Kartı</h2></header>

        <div className="market-product-image-card">
          {imagePreviewDataUrl ? (
            <img src={imagePreviewDataUrl} alt={productForm.name ? `${productForm.name} ürün görseli` : "Ürün görseli"} />
          ) : (
            <div className="market-product-image-placeholder">
              <ImageIcon size={28} aria-hidden="true" />
              <span>{
                imagePreviewLoading
                  ? "Ürün görseli yükleniyor…"
                  : productForm.imageSourceUrl
                    ? "Görsel önizlenemedi; ürün kaydedildiğinde yeniden arşivleme denenecek."
                    : "Ürün görseli yok"
              }</span>
            </div>
          )}
        </div>

        <div className="market-form-grid">
          <label className="market-field market-field-wide">Ürün adı<input value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="market-field">Marka<input value={productForm.brand} onChange={(event) => setProductForm((current) => ({ ...current, brand: event.target.value }))} /></label>
          <label className="market-field">SKU<input value={productForm.sku} onChange={(event) => setProductForm((current) => ({ ...current, sku: event.target.value }))} /></label>
          <label className="market-field market-field-wide">
            Barkod
            <span className="market-inline-field">
              <input value={productForm.barcode} onChange={(event) => setProductForm((current) => ({ ...current, barcode: event.target.value }))} />
              {productDataEnabled && (
                <button type="button" className="market-secondary-button" onClick={() => void lookupProductInfo()} disabled={busy || lookupBusy || !productForm.barcode.trim()}>
                  <Sparkles size={15} aria-hidden="true" /> {lookupBusy ? "Aranıyor…" : "Ürün Bilgilerini Ara"}
                </button>
              )}
            </span>
          </label>
          <label className="market-field">Kategori<select value={productForm.categoryId} onChange={(event) => setProductForm((current) => ({ ...current, categoryId: event.target.value }))}><option value="">Kategorisiz</option>{categories.filter((category) => category.isActive).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
          <label className="market-field">Birim<select value={productForm.unit} onChange={(event) => setProductForm((current) => ({ ...current, unit: event.target.value as CommerceUnit }))}>{Object.entries(unitLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label className="market-field">Satış fiyatı<input type="number" min="0" step="0.01" value={productForm.salePrice} onChange={(event) => setProductForm((current) => ({ ...current, salePrice: event.target.value }))} /></label>
          <label className="market-field">Alış fiyatı<input type="number" min="0" step="0.01" value={productForm.purchasePrice} onChange={(event) => setProductForm((current) => ({ ...current, purchasePrice: event.target.value }))} /></label>
          <label className="market-field">Para birimi<input value={productForm.currency} maxLength={3} onChange={(event) => setProductForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} /></label>
          <label className="market-field">KDV %<input type="number" min="0" step="0.01" value={productForm.taxRate} onChange={(event) => setProductForm((current) => ({ ...current, taxRate: event.target.value }))} /></label>
          {inventoryEnabled && productForm.trackInventory && <label className="market-field">Minimum stok<input type="number" min="0" step="0.0001" value={productForm.minimumQuantity} onChange={(event) => setProductForm((current) => ({ ...current, minimumQuantity: event.target.value }))} /></label>}
          <label className="market-field market-field-wide">Açıklama<textarea value={productForm.description} onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))} /></label>
          <label className="market-check"><input type="checkbox" checked={productForm.trackInventory} disabled={!inventoryEnabled} onChange={(event) => setProductForm((current) => ({ ...current, trackInventory: event.target.checked }))} /> Stok takip et</label>
          <label className="market-check"><input type="checkbox" checked={productForm.isActive} onChange={(event) => setProductForm((current) => ({ ...current, isActive: event.target.checked }))} /> Aktif ürün</label>
        </div>

        {productForm.dataSource && (
          <aside className="market-product-source">
            <strong>Ürün verisi: {providerLabel(productForm.dataSource)}</strong>
            <span>Veri lisansı: {productForm.dataLicense || "—"}{productForm.imageLicense ? ` · Görsel: ${productForm.imageLicense}` : ""}</span>
            {productForm.sourceFetchedAt && <small>Alınma: {new Date(productForm.sourceFetchedAt).toLocaleString("tr-TR")}</small>}
          </aside>
        )}

        <div className="market-form-actions"><button type="button" onClick={() => void saveProduct()} disabled={busy}><Save size={16} aria-hidden="true" /> Ürünü kaydet</button></div>
      </section>

      <section className="market-panel market-span-all">
        <header className="market-panel-heading market-panel-heading-row">
          <div><span>Katalog</span><h2>Kategoriler</h2><p>Ürün gruplarını hiyerarşik olarak düzenleyin.</p></div>
          <button type="button" className="market-secondary-button" onClick={() => setCategoryForm(emptyCategoryForm())}><Plus size={16} aria-hidden="true" /> Yeni kategori</button>
        </header>
        <div className="market-category-layout">
          <div className="market-list compact">
            {categories.map((category) => (
              <button type="button" className="market-list-row" key={category.id} onClick={() => editCategory(category)}>
                <span><strong>{category.name}</strong><small>{category.code || "Kod yok"}{category.parentId ? " · alt kategori" : " · ana kategori"}</small></span>
                <StatusBadge tone={category.isActive ? "success" : "neutral"}>{category.isActive ? "Aktif" : "Pasif"}</StatusBadge>
              </button>
            ))}
          </div>
          <div className="market-form-grid">
            <label className="market-field">Kategori adı<input value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label className="market-field">Kod<input value={categoryForm.code} onChange={(event) => setCategoryForm((current) => ({ ...current, code: event.target.value }))} /></label>
            <label className="market-field">Üst kategori<select value={categoryForm.parentId} onChange={(event) => setCategoryForm((current) => ({ ...current, parentId: event.target.value }))}><option value="">Ana kategori</option>{categories.filter((category) => category.id !== categoryForm.id).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
            <label className="market-field">Sıra<input type="number" value={categoryForm.sortOrder} onChange={(event) => setCategoryForm((current) => ({ ...current, sortOrder: event.target.value }))} /></label>
            <label className="market-check"><input type="checkbox" checked={categoryForm.isActive} onChange={(event) => setCategoryForm((current) => ({ ...current, isActive: event.target.checked }))} /> Aktif kategori</label>
            <div className="market-form-actions market-field-wide">
              <button type="button" onClick={() => void saveCategory()} disabled={busy}><Save size={16} aria-hidden="true" /> Kaydet</button>
              {categoryForm.id && <button type="button" className="market-danger-button" onClick={() => void deleteCategory(categoryForm.id)}>Kategoriyi kaldır</button>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
