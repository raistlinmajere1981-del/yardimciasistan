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
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm);
  const [listMode, setListMode] = usePageViewState<"products" | "quickAccess">("market.products.listMode", "products");
  const [mutationBusy, setMutationBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ kind: "products" | "categories"; id: string; name: string } | null>(null);
  const quickProducts = useMemo(() => products.filter(product => product.quickAccessEnabled).sort((a, b) => (a.quickAccessOrder ?? 0) - (b.quickAccessOrder ?? 0)), [products]);
  async function mutate(operation: () => Promise<void>, message: string) {
    if (busy || mutationBusy) return;
    setMutationBusy(true);
    try { await operation(); await onReload(); onStateChange("success", message); }
    catch (error) { onStateChange("error", error instanceof Error ? error.message : "Katalog güncellenemedi."); }
    finally { setMutationBusy(false); }
  }
  const reorder = useRecordReorder<"products" | "categories" | "quickAccess">({
    canDrag: () => !busy && !mutationBusy && !search.trim(),
    getIds: kind => (kind === "categories" ? categories : kind === "quickAccess" ? quickProducts : products).map(record => record.id),
    onReorder: async (kind, ids) => { if (bridge) await mutate(() => bridge.reorderCatalog(kind, ids), "Katalog sırası kaydedildi."); }
  });
  function sortClass(kind: "products" | "categories" | "quickAccess", id: string) {
    return `menu-sortable-record${reorder.dragging?.kind === kind && reorder.dragging.id === id ? " is-dragging" : ""}${reorder.dropTarget?.kind === kind && reorder.dropTarget.id === id ? ` is-drop-${reorder.dropTarget.position}` : ""}`;
  }

  const filteredProducts = useMemo(() => (listMode === "quickAccess" ? quickProducts : products).filter((product) => {
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return true;
    return [product.name, product.brand, product.sku, product.barcode]
      .some((value) => String(value ?? "").toLocaleLowerCase("tr-TR").includes(needle));
  }), [listMode, products, quickProducts, search]);

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
    setCategoryForm({
      id: category.id,
      parentId: category.parentId,
      name: category.name,
      code: category.code,
      isActive: category.isActive
    });
  }

  async function saveCategory() {
    if (!bridge) return;
    onStateChange("loading", "Kategori kaydediliyor…");
    try {
      const saved = await bridge.saveCategory({
        ...(categoryForm.id ? { id: categoryForm.id } : {}),
        parentId: categoryForm.parentId,
        name: categoryForm.name,
        code: categoryForm.code,
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
          <ChoiceChips ariaLabel="Ürün listesi" value={listMode} onChange={setListMode} options={[{ id: "products", label: "Tüm ürünler" }, { id: "quickAccess", label: "Hızlı Erişim" }]} />
          <div ref={pageScroll} className="market-list">
            {filteredProducts.map((product) => (
              <article className={`market-catalog-record ${sortClass(listMode, product.id)}`} key={product.id}
                data-sort-kind={listMode} data-sort-id={product.id}>
                <IconButton type="button" className="menu-drag-handle-hitbox" aria-label={`${product.name} sırasını değiştir`} title="Sürükleyin veya yukarı/aşağı okları kullanın" {...reorder.handleProps(listMode, product.id)}><GripVertical size={16} aria-hidden="true" /></IconButton>
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
            <ActionButton size="sm" type="button" onClick={() => setCategoryForm(emptyCategoryForm())}><Plus size={16} aria-hidden="true" /> Kategori Ekle</ActionButton>
          </header>
          <div className="market-category-layout market-category-layout--single">
            <div className="market-list compact">
              {categories.map((category) => (
                <article className={`market-catalog-record ${sortClass("categories", category.id)}`} key={category.id}
                  data-sort-kind="categories" data-sort-id={category.id}>
                  <IconButton type="button" className="menu-drag-handle-hitbox" aria-label={`${category.name} sırasını değiştir`} title="Sürükleyin veya yukarı/aşağı okları kullanın" {...reorder.handleProps("categories", category.id)}><GripVertical size={16} aria-hidden="true" /></IconButton>
                  <button type="button" className="market-list-row interactive-surface interactive-surface--record" aria-pressed={categoryForm.id === category.id} onClick={() => editCategory(category)}>
                  <span><strong>{category.name}</strong><small>{category.code || "Kod yok"}{category.parentId ? " · alt kategori" : " · ana kategori"}</small></span>
                  <StatusBadge tone={category.isActive ? "success" : "neutral"}>{category.isActive ? "Aktif" : "Pasif"}</StatusBadge>
                  </button>
                  <div className="market-record-actions"><ActionButton variant="secondary" onClick={() => editCategory(category)}>Düzenle</ActionButton><ActionButton variant="danger" onClick={() => setPendingDelete({ kind: "categories", id: category.id, name: category.name })}>Sil</ActionButton></div>
                </article>
              ))}
            </div>
            <div className="form-grid form-grid--compact">
              <label className="form-field form-field--fluid">Kategori adı<input value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label className="form-field form-field--fluid">Kod<input value={categoryForm.code} onChange={(event) => setCategoryForm((current) => ({ ...current, code: event.target.value }))} /></label>
              <label className="form-field form-field--fluid">Üst kategori<SearchSelect ariaLabel="Üst kategori" value={categoryForm.parentId} placeholder="Ana kategori" onChange={parentId => setCategoryForm(current => ({ ...current, parentId }))} options={categories.filter(category => category.id !== categoryForm.id).map(category => ({ id: category.id, label: category.name }))} /></label>
              <label className="form-check"><input type="checkbox" checked={categoryForm.isActive} onChange={(event) => setCategoryForm((current) => ({ ...current, isActive: event.target.checked }))} /> Aktif kategori</label>
              <div className="market-form-actions form-field--span">
                <ActionButton type="button" busy={busy} onClick={() => void saveCategory()}><Save size={16} aria-hidden="true" /> Kategoriyi Kaydet</ActionButton>
              </div>
            </div>
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
