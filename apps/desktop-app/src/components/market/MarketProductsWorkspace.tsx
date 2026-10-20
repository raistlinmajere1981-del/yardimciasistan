import { DataTransferLauncher } from "../data-transfer/DataTransferOverlay";
import { SearchSelect } from "../ui/SearchSelect";
import { usePageViewState, usePageViewScroll } from "../../app/page-view-state";
import { GripVertical, Plus, Save, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  type CatalogCategory,
  type CatalogProduct,
  type ProductLookupCandidate
} from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { DataListButton } from "../ui/DataList";
import { StatusBadge } from "../ui/StatusBadge";
import { useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import { MarketProductThumbnail } from "./MarketProductThumbnail";
import { useRecordReorder } from "../ui/use-record-reorder";
import { ChoiceChips } from "../ui/ChoiceChips";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { IconButton } from "../ui/IconButton";

interface CategoryFormState {
  id: string;
  parentId: string;
  name: string;
  code: string;
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
  return { id: "", parentId: "", name: "", code: "", isActive: true };
}

function CategoryFormFields({ form, categories, onChange }: {
  form: CategoryFormState;
  categories: CatalogCategory[];
  onChange: (form: CategoryFormState) => void;
}) {
  return <>
    <label className="form-field form-field--fluid">Kategori adı<input value={form.name} onChange={event => onChange({ ...form, name: event.target.value })} /></label>
    <label className="form-field form-field--fluid">Kod<input value={form.code} onChange={event => onChange({ ...form, code: event.target.value })} /></label>
    <label className="form-field form-field--fluid form-field--span">Üst kategori<SearchSelect ariaLabel="Üst kategori" value={form.parentId} placeholder="Ana kategori" onChange={parentId => onChange({ ...form, parentId })} options={categories.filter(category => category.id !== form.id).map(category => ({ id: category.id, label: category.name }))} /></label>
    <label className="form-check"><input type="checkbox" checked={form.isActive} onChange={event => onChange({ ...form, isActive: event.target.checked })} /> Aktif kategori</label>
  </>;
}

type ProductListMode = "products" | "quickAccess" | `category:${string}`;

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
  onReload,
  onStateChange,
  productLookupRequest = null,
  onProductLookupLoaded
}: MarketProductsWorkspaceProps) {
  const bridge = window.yardimciDesktop?.commerce;
  const navigation = useWorkspaceNavigation();
  const [search, setSearch] = usePageViewState("market.products.search", "");
  const [editingCategoryForm, setEditingCategoryForm] = useState<CategoryFormState | null>(null);
  const [newCategoryForm, setNewCategoryForm] = useState<CategoryFormState>(emptyCategoryForm);
  const [listMode, setListMode] = usePageViewState<ProductListMode>("market.products.listMode", "products");
  const [mutationBusy, setMutationBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ kind: "products" | "categories"; id: string; name: string } | null>(null);
  const quickProducts = useMemo(() => products.filter(product => product.quickAccessEnabled).sort((a, b) => (a.quickAccessOrder ?? 0) - (b.quickAccessOrder ?? 0)), [products]);
  const activeCategories = useMemo(() => categories.filter(category => category.isActive), [categories]);
  const categoryProductCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) counts.set(product.categoryId, (counts.get(product.categoryId) ?? 0) + 1);
    return counts;
  }, [products]);
  const selectedCategoryId = listMode.startsWith("category:") ? listMode.slice("category:".length) : "";
  const productSortKind = listMode === "quickAccess" ? "quickAccess" : "products";

  useEffect(() => {
    if (!busy && selectedCategoryId && !activeCategories.some(category => category.id === selectedCategoryId)) setListMode("products");
  }, [activeCategories, busy, selectedCategoryId, setListMode]);

  useEffect(() => {
    if (!busy && editingCategoryForm && !categories.some(category => category.id === editingCategoryForm.id)) setEditingCategoryForm(null);
  }, [busy, categories, editingCategoryForm]);

  async function mutate(operation: () => Promise<void>, message: string) {
    if (busy || mutationBusy) return;
    setMutationBusy(true);
    try { await operation(); await onReload(); onStateChange("success", message); }
    catch (error) { onStateChange("error", error instanceof Error ? error.message : "Katalog güncellenemedi."); }
    finally { setMutationBusy(false); }
  }
  const reorder = useRecordReorder<"products" | "categories" | "quickAccess">({
    canDrag: (kind, id) => !busy && !mutationBusy && !search.trim()
      && (kind === "categories" ? editingCategoryForm?.id !== id : !selectedCategoryId),
    getIds: kind => (kind === "categories" ? categories : kind === "quickAccess" ? quickProducts : products).map(record => record.id),
    onReorder: async (kind, ids) => { if (bridge) await mutate(() => bridge.reorderCatalog(kind, ids), "Katalog sırası kaydedildi."); }
  });
  function sortClass(kind: "products" | "categories" | "quickAccess", id: string) {
    return `menu-sortable-record${reorder.dragging?.kind === kind && reorder.dragging.id === id ? " is-dragging" : ""}${reorder.dropTarget?.kind === kind && reorder.dropTarget.id === id ? ` is-drop-${reorder.dropTarget.position}` : ""}`;
  }

  const filteredProducts = useMemo(() => (listMode === "quickAccess" ? quickProducts : products).filter((product) => {
    if (selectedCategoryId && product.categoryId !== selectedCategoryId) return false;
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return true;
    return [product.name, product.brand, product.sku, product.barcode]
      .some((value) => String(value ?? "").toLocaleLowerCase("tr-TR").includes(needle));
  }), [listMode, products, quickProducts, search, selectedCategoryId]);

  useEffect(() => {
    if (!productLookupRequest) return;
    if (navigation.openWorkspace({
      entityType: "product", entityId: `new-product-${productLookupRequest.requestId}`, mode: "create",
      lookupSeed: productLookupRequest, returnContext: { page: "market", view: "products" }
    })) onProductLookupLoaded?.(productLookupRequest.requestId);
  }, [navigation, onProductLookupLoaded, productLookupRequest]);

  function openCreate() {
    navigation.openWorkspace({ entityType: "product", entityId: "new-product", mode: "create",
      returnContext: { page: "market", view: "products" } });
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
    setEditingCategoryForm({
      id: category.id,
      parentId: category.parentId,
      name: category.name,
      code: category.code,
      isActive: category.isActive
    });
  }

  async function saveCategory(form: CategoryFormState) {
    if (!bridge || busy || mutationBusy) return;
    setMutationBusy(true);
    onStateChange("loading", "Kategori kaydediliyor…");
    try {
      const saved = await bridge.saveCategory({
        ...(form.id ? { id: form.id } : {}),
        parentId: form.parentId,
        name: form.name,
        code: form.code,
        isActive: form.isActive
      });
      await onReload();
      if (form.id) setEditingCategoryForm(null);
      else setNewCategoryForm(emptyCategoryForm());
      onStateChange("success", `${saved.name} kategorisi kaydedildi.`);
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Kategori kaydedilemedi.");
    } finally {
      setMutationBusy(false);
    }
  }

  async function deleteCategory(categoryId: string) {
    if (!bridge || busy || mutationBusy) return;
    setMutationBusy(true);
    onStateChange("loading", "Kategori kaldırılıyor…");
    try {
      await bridge.deleteCategory(categoryId);
      if (editingCategoryForm?.id === categoryId) setEditingCategoryForm(null);
      await onReload();
      onStateChange("success", "Kategori kaldırıldı.");
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Kategori kaldırılamadı.");
    } finally {
      setMutationBusy(false);
    }
  }

  const pageScroll = usePageViewScroll(`market.products.scroll`, filteredProducts.length);
  return (
    <>
      <div className="market-two-column">
        <section className="market-panel">
          <header className="market-panel-heading market-panel-heading-row">
            <div><span>Katalog</span><h2>Ürünler</h2><p>Ürün kartları satış ve stok tarafından ortak kullanılır.</p></div>
            <div className="data-transfer-launch-actions"><ActionButton size="sm" type="button" onClick={openCreate}>
              <Plus size={16} aria-hidden="true" /> Ürün Ekle
            </ActionButton><DataTransferLauncher entity="products" search={search} quickAccessOnly={listMode === "quickAccess"} onChanged={onReload} /></div>
          </header>
          <label className="market-search-field">
            <Search size={16} aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ad, marka, SKU veya barkod ara" />
          </label>
          <ChoiceChips<ProductListMode> ariaLabel="Ürün listesi" className="market-category-chips" value={listMode} onChange={setListMode} options={[
            { id: "products", label: "Tüm ürünler" },
            { id: "quickAccess", label: "Hızlı Erişim" },
            ...activeCategories.map(category => ({ id: `category:${category.id}` as const, label: `${category.name} · ${categoryProductCounts.get(category.id) ?? 0}` }))
          ]} />
          <div ref={pageScroll} className="market-list">
            {filteredProducts.map((product) => (
              <article className={`market-catalog-record ${sortClass(productSortKind, product.id)}`} key={product.id}
                data-sort-kind={productSortKind} data-sort-id={product.id}>
                <IconButton type="button" className="menu-drag-handle-hitbox" aria-label={`${product.name} sırasını değiştir`} title="Sürükleyin veya yukarı/aşağı okları kullanın" {...reorder.handleProps(productSortKind, product.id)}><GripVertical size={16} aria-hidden="true" /></IconButton>
                <DataListButton className="market-list-row" onClick={() => { if (!reorder.suppressRowClickRef.current) openProduct(product); }}
                  leading={<MarketProductThumbnail product={product} className="market-list-product-thumb" />} title={product.name}
                  meta={<span>{money(product.salePrice, product.currency)} · {product.sku || product.barcode || "Kod yok"}</span>}
                  trailing={<StatusBadge tone={product.isActive ? "success" : "neutral"}>{product.isActive ? "Aktif" : "Pasif"}</StatusBadge>} />
                <div className="market-record-actions">
                  <ActionButton variant="secondary" onClick={() => openProduct(product)}>Düzenle</ActionButton>
                  <ActionButton variant="secondary" disabled={busy || mutationBusy} onClick={() => { if (bridge) void mutate(() => bridge.setProductQuickAccess(product.id, !product.quickAccessEnabled), "Hızlı erişim tercihi kaydedildi."); }}>{product.quickAccessEnabled ? "Hızlı erişimden çıkar" : "Hızlı erişime ekle"}</ActionButton>
                  <ActionButton variant="danger" disabled={busy || mutationBusy} onClick={() => setPendingDelete({ kind: "products", id: product.id, name: product.name })}>Sil</ActionButton>
                </div>
              </article>
            ))}
            {!busy && filteredProducts.length === 0 && <p className="market-muted">Eşleşen ürün yok.</p>}
          </div>
        </section>

        <section className="market-panel">
          <header className="market-panel-heading market-panel-heading-row">
            <div><span>Katalog</span><h2>Kategoriler</h2><p>Ürün gruplarını hiyerarşik olarak düzenleyin.</p></div>
          </header>
          <div className="market-category-management">
            <div className="market-list compact">
              {categories.map((category) => editingCategoryForm?.id === category.id ? (
                <article className="market-catalog-record market-category-record--editing" key={category.id}
                  data-sort-kind="categories" data-sort-id={category.id}>
                  <form aria-label={`${category.name} kategorisini düzenle`} onSubmit={event => { event.preventDefault(); void saveCategory(editingCategoryForm); }}>
                    <fieldset className="market-category-fields" disabled={busy || mutationBusy}>
                      <CategoryFormFields form={editingCategoryForm} categories={categories} onChange={setEditingCategoryForm} />
                      <div className="market-category-actions">
                        <ActionButton type="submit" size="sm" busy={busy || mutationBusy} disabled={!editingCategoryForm.name.trim()}><Save size={16} aria-hidden="true" /> Kaydet</ActionButton>
                        <ActionButton type="button" size="sm" variant="secondary" onClick={() => setEditingCategoryForm(null)}>Vazgeç</ActionButton>
                      </div>
                    </fieldset>
                  </form>
                </article>
              ) : (
                <article className={`market-catalog-record ${sortClass("categories", category.id)}`} key={category.id}
                  data-sort-kind="categories" data-sort-id={category.id}>
                  <IconButton type="button" className="menu-drag-handle-hitbox" aria-label={`${category.name} sırasını değiştir`} title="Sürükleyin veya yukarı/aşağı okları kullanın" {...reorder.handleProps("categories", category.id)}><GripVertical size={16} aria-hidden="true" /></IconButton>
                  <div className="market-list-row">
                  <span><strong>{category.name}</strong><small>{category.code || "Kod yok"}{category.parentId ? " · alt kategori" : " · ana kategori"} · {categoryProductCounts.get(category.id) ?? 0} ürün</small></span>
                  <StatusBadge tone={category.isActive ? "success" : "neutral"}>{category.isActive ? "Aktif" : "Pasif"}</StatusBadge>
                  </div>
                  <div className="market-record-actions"><ActionButton variant="secondary" disabled={busy || mutationBusy} onClick={() => editCategory(category)}>Düzenle</ActionButton><ActionButton variant="danger" disabled={busy || mutationBusy} onClick={() => setPendingDelete({ kind: "categories", id: category.id, name: category.name })}>Sil</ActionButton></div>
                </article>
              ))}
            </div>
            <form className="market-category-create" aria-label="Yeni kategori" onSubmit={event => { event.preventDefault(); void saveCategory(newCategoryForm); }}>
              <h3>Yeni kategori</h3>
              <fieldset className="market-category-fields" disabled={busy || mutationBusy}>
                <CategoryFormFields form={newCategoryForm} categories={categories} onChange={setNewCategoryForm} />
                <div className="market-category-actions">
                  <ActionButton type="submit" size="sm" busy={busy || mutationBusy} disabled={!newCategoryForm.name.trim()}><Plus size={16} aria-hidden="true" /> Kategori Ekle</ActionButton>
                </div>
              </fieldset>
            </form>
          </div>
        </section>
      </div>

      {pendingDelete && <ConfirmDialog tone="danger" title={pendingDelete.kind === "products" ? "Ürünü sil" : "Kategoriyi sil"} description={`“${pendingDelete.name}” kaldırılacak.`} confirmLabel="Sil" busy={mutationBusy || busy} onCancel={() => setPendingDelete(null)} onConfirm={() => {
        const record = pendingDelete;
        setPendingDelete(null);
        if (record.kind === "categories") void deleteCategory(record.id);
        else if (bridge) void mutate(() => bridge.deleteProduct(record.id), "Ürün kaldırıldı.");
      }} />}


    </>
  );
}
