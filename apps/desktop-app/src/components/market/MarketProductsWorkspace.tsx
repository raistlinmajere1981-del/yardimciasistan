import { Plus, Save, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  BUSINESS_CAPABILITIES,
  type CatalogCategory,
  type CatalogProduct,
  type ProductLookupCandidate
} from "@yardimci-asistan/shared";
import {
  emptyProductForm,
  productFormToSaveInput,
  validateProductFormPrices,
  type ProductFormState
} from "../../app/product-model";
import { runtimeHasCapability } from "../../app/capabilities";
import { useBusinessCapabilityRuntime } from "../../app/business-capability-context";
import { ActionButton } from "../ui/ActionButton";
import { FormDialog } from "../ui/FormDialog";
import { StatusBadge } from "../ui/StatusBadge";
import { useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import { useRequestGeneration } from "../workspace/use-request-generation";
import { MarketProductThumbnail } from "./MarketProductThumbnail";
import { ProductFormFields } from "./ProductFormFields";

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
  onProductSaved: (product: CatalogProduct) => void;
  onStateChange: (state: "loading" | "success" | "error", message: string) => void;
  productLookupRequest?: ProductLookupFormRequest | null;
  onProductLookupLoaded?: (requestId: number) => void;
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

export function MarketProductsWorkspace({
  products,
  categories,
  busy,
  productDataEnabled = false,
  onReload,
  onProductSaved,
  onStateChange,
  productLookupRequest = null,
  onProductLookupLoaded
}: MarketProductsWorkspaceProps) {
  const bridge = window.yardimciDesktop?.commerce;
  const navigation = useWorkspaceNavigation();
  const { snapshot } = useBusinessCapabilityRuntime();
  const inventoryEnabled = runtimeHasCapability(snapshot, BUSINESS_CAPABILITIES.INVENTORY);
  const [search, setSearch] = useState("");
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [productForm, setProductForm] = useState<ProductFormState>(() => emptyProductForm(inventoryEnabled));
  const [saveState, setSaveState] = useState<"idle" | "loading" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("Ürün adı yeterlidir; diğer alanlar daha sonra tamamlanabilir.");
  const [pendingProductId, setPendingProductId] = useState("");
  const beginCreateRequest = useRequestGeneration();

  const filteredProducts = useMemo(() => products.filter((product) => {
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return true;
    return [product.name, product.brand, product.sku, product.barcode]
      .some((value) => String(value ?? "").toLocaleLowerCase("tr-TR").includes(needle));
  }), [products, search]);

  useEffect(() => {
    if (!productLookupRequest) return;
    setProductForm(emptyProductForm(inventoryEnabled));
    setSaveState("idle");
    setSaveMessage("Bulunan ürün bilgilerini kontrol edip kaydedin.");
    setCreateOpen(true);
  }, [inventoryEnabled, productLookupRequest]);

  useEffect(() => {
    if (createOpen || !pendingProductId) return;
    if (navigation.openWorkspace({
      entityType: "product",
      entityId: pendingProductId,
      mode: "details",
      returnContext: { page: "market", view: "products", entityId: pendingProductId }
    })) {
      setPendingProductId("");
    }
  }, [createOpen, navigation, pendingProductId]);

  function openCreate() {
    setProductForm(emptyProductForm(inventoryEnabled));
    setSaveState("idle");
    setSaveMessage("Ürün adı yeterlidir; diğer alanlar daha sonra tamamlanabilir.");
    setCreateOpen(true);
  }

  function openProduct(product: CatalogProduct) {
    navigation.openWorkspace({
      entityType: "product",
      entityId: product.id,
      mode: "details",
      returnContext: { page: "market", view: "products", entityId: product.id }
    });
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

  async function createProduct() {
    if (!bridge || busy || saveState === "loading") return;
    const priceError = validateProductFormPrices(productForm);
    if (priceError) {
      setSaveState("error");
      setSaveMessage(priceError);
      return;
    }
    const isCurrent = beginCreateRequest();
    setSaveState("loading");
    setSaveMessage("");
    let saved: CatalogProduct;
    try {
      saved = await bridge.saveProduct(productFormToSaveInput(productForm));
      if (!isCurrent()) return;
    } catch (error) {
      if (!isCurrent()) return;
      const message = error instanceof Error ? error.message : "Ürün kaydedilemedi.";
      setSaveState("error");
      setSaveMessage("");
      onStateChange("error", message);
      return;
    }

    if (!isCurrent()) return;
    onProductSaved(saved);
    let catalogReloadFailed = false;
    try {
      await onReload();
    } catch {
      catalogReloadFailed = true;
    }
    if (!isCurrent()) return;
    const message = `${saved.name} kaydedildi.${saved.imageAssetPath ? " Ürün görseli yerel arşive eklendi." : ""}${catalogReloadFailed ? " Katalog görünümü yenilenemedi." : ""}`;
    onStateChange("success", message);
    setPendingProductId(saved.id);
    setCreateOpen(false);
  }

  return (
    <>
      <div className="market-two-column">
        <section className="market-panel">
          <header className="market-panel-heading market-panel-heading-row">
            <div><span>Katalog</span><h2>Ürünler</h2><p>Ürün kartları satış ve stok tarafından ortak kullanılır.</p></div>
            <ActionButton size="sm" type="button" onClick={openCreate}>
              <Plus size={16} aria-hidden="true" /> Ürün Ekle
            </ActionButton>
          </header>
          <label className="market-search-field">
            <Search size={16} aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ad, marka, SKU veya barkod ara" />
          </label>
          <div className="market-list">
            {filteredProducts.map((product) => (
              <button type="button" className="market-list-row" key={product.id} onClick={() => openProduct(product)}>
                <MarketProductThumbnail product={product} className="market-list-product-thumb" />
                <span className="market-list-product-info">
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
          <header className="market-panel-heading market-panel-heading-row">
            <div><span>Katalog</span><h2>Kategoriler</h2><p>Ürün gruplarını hiyerarşik olarak düzenleyin.</p></div>
            <ActionButton size="sm" type="button" onClick={() => setCategoryForm(emptyCategoryForm())}><Plus size={16} aria-hidden="true" /> Kategori Ekle</ActionButton>
          </header>
          <div className="market-category-layout market-category-layout--single">
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

      {createOpen && <FormDialog
        title="Yeni ürün ekle"
        onClose={() => { if (saveState !== "loading") setCreateOpen(false); }}
        closeBlocked={saveState === "loading"}
        dismissOnBackdrop
        onSubmit={(event) => { event.preventDefault(); void createProduct(); }}
        footer={<>
          <p className={"form-status sync-" + saveState} role="status">{saveMessage}</p>
          <div className="action-row">
            <ActionButton variant="secondary" type="button" disabled={saveState === "loading"} onClick={() => setCreateOpen(false)}>Vazgeç</ActionButton>
            <ActionButton type="submit" disabled={busy || saveState === "loading" || !productForm.name.trim()}><Save size={16} aria-hidden="true" />{saveState === "loading" ? "Kaydediliyor" : "Ürünü Kaydet"}</ActionButton>
          </div>
        </>}
      >
        <div className="form-stack market-product-create-form">
          <ProductFormFields
            form={productForm}
            categories={categories}
            inventoryEnabled={inventoryEnabled}
            productDataEnabled={productDataEnabled}
            disabled={busy || saveState === "loading"}
            mode="all"
            lookupSeed={productLookupRequest}
            onLookupSeedLoaded={onProductLookupLoaded}
            onChange={setProductForm}
            onStateChange={onStateChange}
          />
        </div>
      </FormDialog>}
    </>
  );
}
