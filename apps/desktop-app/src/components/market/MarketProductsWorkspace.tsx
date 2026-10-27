import { useCatalogProductPage } from "../../app/use-catalog-product-page";
import { CatalogPageControls } from "./CatalogPageControls";
import { DataTransferLauncher } from "../data-transfer/DataTransferOverlay";
import { SearchSelect } from "../ui/SearchSelect";
import { usePageViewState, usePageViewScroll } from "../../app/page-view-state";
import { GripVertical, Plus, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BUSINESS_CAPABILITIES,
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

import { MarketProductToolbar } from "./MarketProductToolbar";
import { readMarketProductViewPreference, saveMarketProductViewPreference, type MarketProductViewPreference } from "../../ui-preferences";
import { useBusinessCapabilityRuntime } from "../../app/business-capability-context";
import { runtimeHasCapability } from "../../app/capabilities";

type BulkProductAction = "activate" | "quickAccess" | "delete" | "publish";
const bulkActionLabels: Record<BulkProductAction, string> = {
  activate: "Aktif yap", quickAccess: "Hızlı erişime ekle", delete: "Sil", publish: "Webde yayınla"
};

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
  catalogRevision?: number;
  categories: CatalogCategory[];
  busy: boolean;
  productDataEnabled?: boolean;
  onReload: () => Promise<void>;
  onStateChange: (state: "loading" | "success" | "error", message: string) => void;
  productLookupRequest?: ProductLookupFormRequest | null;
  onProductLookupLoaded?: (requestId: number) => void;
}

function emptyCategoryForm(): CategoryFormState {
  return { id: "", parentId: "", name: "", code: "", isActive: true };
}

function CategoryFormFields({ form, categories, onChange, showActive = true }: {
  form: CategoryFormState;
  categories: CatalogCategory[];
  onChange: (form: CategoryFormState) => void;
  showActive?: boolean;
}) {
  return <>
    <label className="form-field form-field--fluid">Kategori adı<input value={form.name} onChange={event => onChange({ ...form, name: event.target.value })} /></label>
    <label className="form-field form-field--fluid">Kod<input value={form.code} onChange={event => onChange({ ...form, code: event.target.value })} /></label>
    <label className="form-field form-field--fluid form-field--span">Üst kategori<SearchSelect ariaLabel="Üst kategori" value={form.parentId} placeholder="Ana kategori" onChange={parentId => onChange({ ...form, parentId })} options={categories.filter(category => category.id !== form.id).map(category => ({ id: category.id, label: category.name }))} /></label>
    {showActive && <label className="form-check"><input type="checkbox" checked={form.isActive} onChange={event => onChange({ ...form, isActive: event.target.checked })} /> Aktif kategori</label>}
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
  catalogRevision = 0,
  categories,
  busy,
  onReload,
  onStateChange,
  productLookupRequest = null,
  onProductLookupLoaded
}: MarketProductsWorkspaceProps) {
  const bridge = window.yardimciDesktop?.commerce;
  const navigation = useWorkspaceNavigation();
  const { snapshot } = useBusinessCapabilityRuntime();
  const onlineSalesEnabled = runtimeHasCapability(snapshot, BUSINESS_CAPABILITIES.ONLINE_SALES);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [pendingBulk, setPendingBulk] = useState<{ action: BulkProductAction; products: Array<{ id: string; name: string }> } | null>(null);
  const bulkLock = useRef(false);
  const [productView, setProductView] = useState(() => readMarketProductViewPreference("catalog"));
  function changeProductView(next: MarketProductViewPreference) { setProductView(next); saveMarketProductViewPreference("catalog", next); }
  const [search, setSearch] = usePageViewState("market.products.search", "");
  const [editingCategoryForm, setEditingCategoryForm] = useState<CategoryFormState | null>(null);
  const [newCategoryForm, setNewCategoryForm] = useState<CategoryFormState>(emptyCategoryForm);
  const [listMode, setListMode] = usePageViewState<ProductListMode>("market.products.listMode", "products");
  const [mutationBusy, setMutationBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ kind: "products" | "categories"; id: string; name: string } | null>(null);
  const activeCategories = useMemo(() => categories.filter(category => category.isActive), [categories]);
  const selectedCategoryId = listMode.startsWith("category:") ? listMode.slice("category:".length) : "";
  const productSortKind = listMode === "quickAccess" ? "quickAccess" : "products";
  const catalog = useCatalogProductPage("market.products", { search, categoryId: selectedCategoryId, quickAccessOnly: listMode === "quickAccess" }, catalogRevision);
  const products = useMemo(() => catalog.page?.items ?? [], [catalog.page]);
  const quickProducts = products;
  const categoryProductCounts = catalog.page?.counts.categories ?? {};


  useEffect(() => {
    if (!busy && selectedCategoryId && !activeCategories.some(category => category.id === selectedCategoryId)) setListMode("products");
  }, [activeCategories, busy, selectedCategoryId, setListMode]);

  useEffect(() => {
    if (!busy && editingCategoryForm && !categories.some(category => category.id === editingCategoryForm.id)) setEditingCategoryForm(null);
  }, [busy, categories, editingCategoryForm]);

  async function mutate(operation: () => Promise<void>, message: string) {
    if (busy || mutationBusy || catalog.loading || Boolean(catalog.error)) return;
    setMutationBusy(true);
    try { await operation(); await onReload(); onStateChange("success", message); }
    catch (error) { onStateChange("error", error instanceof Error ? error.message : "Katalog güncellenemedi."); }
    finally { setMutationBusy(false); }
  }
  const reorder = useRecordReorder<"products" | "categories" | "quickAccess">({
    canDrag: (kind, id) => !busy && !mutationBusy && !search.trim()
      && !catalog.loading && !catalog.error
      && (kind === "categories" ? editingCategoryForm?.id !== id : !selectedCategoryId),
    getIds: kind => (kind === "categories" ? categories : kind === "quickAccess" ? quickProducts : products).map(record => record.id),
    onReorder: async (kind, ids) => { if (bridge) await mutate(() => bridge.reorderCatalog(kind, ids, kind !== "categories" && catalog.page ? { offset: catalog.page.offset, total: catalog.page.total } : undefined), "Katalog sırası kaydedildi."); }
  });
  function sortClass(kind: "products" | "categories" | "quickAccess", id: string) {
    return `menu-sortable-record${reorder.dragging?.kind === kind && reorder.dragging.id === id ? " is-dragging" : ""}${reorder.dropTarget?.kind === kind && reorder.dropTarget.id === id ? ` is-drop-${reorder.dropTarget.position}` : ""}`;
  }

  const filteredProducts = products;

  const selectedProducts = filteredProducts.filter(product => selectedIds.has(product.id));
  useEffect(() => {
    const visible = new Set(filteredProducts.map(product => product.id));
    setSelectedIds(previous => {
      const next = new Set([...previous].filter(id => visible.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [filteredProducts]);

  function requestBulk(action: BulkProductAction) {
    if (busy || mutationBusy || catalog.loading || Boolean(catalog.error) || !selectedProducts.length || (action === "publish" && !onlineSalesEnabled)) return;
    setPendingBulk({ action, products: selectedProducts.map(({ id, name }) => ({ id, name })) });
  }

  async function applyBulk() {
    if (!bridge || !pendingBulk || busy || mutationBusy || catalog.loading || Boolean(catalog.error) || bulkLock.current) return;
    if (pendingBulk.action === "publish" && !onlineSalesEnabled) {
      setPendingBulk(null);
      onStateChange("error", "Webde yayınlamak için online satış etkin olmalı.");
      return;
    }
    bulkLock.current = true;
    setMutationBusy(true);
    const command = pendingBulk;
    const failed = new Set<string>();
    let firstError = "";
    try {
      for (const product of command.products) {
        try {
          if (command.action === "activate") await bridge.activateProduct(product.id);
          else if (command.action === "quickAccess") await bridge.setProductQuickAccess(product.id, true);
          else if (command.action === "delete") await bridge.deleteProduct(product.id);
          else await bridge.saveProductPublication({ productId: product.id, isPublished: true });
        } catch (error) {
          failed.add(product.id);
          firstError ||= error instanceof Error ? error.message : "Ürün işlemi tamamlanamadı.";
        }
      }
      setSelectedIds(failed);
      let reloadError = "";
      try { await onReload(); }
      catch { reloadError = "Liste yenilenemedi; yeniden yükleyin."; }
      const completed = command.products.length - failed.size;
      onStateChange(failed.size || reloadError ? "error" : "success", failed.size
        ? `${completed}/${command.products.length} ürün işlendi. ${failed.size} ürün işlenemedi. ${firstError} ${reloadError}`.trim()
        : `${completed} ürün için “${bulkActionLabels[command.action]}” tamamlandı.${reloadError ? ` ${reloadError}` : ""}`);
    } finally {
      setPendingBulk(null);
      setMutationBusy(false);
      bulkLock.current = false;
    }
  }

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
    if (catalog.loading || catalog.error) return;
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
    if (!bridge || busy || mutationBusy || catalog.loading || Boolean(catalog.error)) return;
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
    if (!bridge || busy || mutationBusy || catalog.loading || Boolean(catalog.error)) return;
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
            <div><span>Katalog</span><h2>Ürünler</h2></div>
            <DataTransferLauncher entity="products" search={search} quickAccessOnly={listMode === "quickAccess"} onChanged={onReload} />
          </header>
          <MarketProductToolbar search={search} onSearch={setSearch} view={productView} onViewChange={changeProductView} onCreate={openCreate} disabled={busy || mutationBusy || catalog.loading || Boolean(catalog.error)} />
          <ChoiceChips<ProductListMode> horizontalWheel ariaLabel="Ürün listesi" className="market-category-chips" value={listMode} onChange={setListMode} options={[
            { id: "products", label: "Tüm ürünler" },
            { id: "quickAccess", label: "Hızlı Erişim" },
            ...activeCategories.map(category => ({ id: `category:${category.id}` as const, label: `${category.name} · ${categoryProductCounts[category.id] ?? 0}` }))
          ]} />
          <div className="market-product-bulk-actions" role="group" aria-label="Toplu ürün işlemleri">
            <span aria-live="polite">{selectedProducts.length} seçili</span>
            <ActionButton variant="secondary" size="sm" type="button" title="Listelenen ürünlerin tümünü seç" disabled={busy || mutationBusy || catalog.loading || Boolean(catalog.error) || !filteredProducts.length || selectedProducts.length === filteredProducts.length} onClick={() => setSelectedIds(new Set(filteredProducts.map(product => product.id)))}>Tümünü seç</ActionButton>
            <ActionButton variant="ghost" size="sm" type="button" disabled={busy || mutationBusy || catalog.loading || Boolean(catalog.error) || !selectedProducts.length} onClick={() => setSelectedIds(new Set())}>Temizle</ActionButton>
            {(["activate", "quickAccess", "delete", "publish"] as const).map(action => <ActionButton key={action} variant={action === "delete" ? "danger" : "secondary"} size="sm" type="button"
              disabled={busy || mutationBusy || catalog.loading || Boolean(catalog.error) || !selectedProducts.length || (action === "publish" && !onlineSalesEnabled)}
              title={action === "publish" && !onlineSalesEnabled ? "Webde yayınlamak için online satış etkin olmalı." : undefined}
              onClick={() => requestBulk(action)}>{bulkActionLabels[action]}</ActionButton>)}
          </div>
          <div ref={pageScroll} className={`market-list market-catalog-products market-catalog-products--${productView.preset}${productView.showImages ? " has-product-images" : ""}`}>
            {filteredProducts.map((product) => (
              <article className={`market-catalog-record ${sortClass(productSortKind, product.id)}`} key={product.id}
                data-sort-kind={productSortKind} data-sort-id={product.id}>
                <div className="market-product-controls">
                  <label className="market-product-selection"><input type="checkbox" aria-label={`${product.name} seç`} checked={selectedIds.has(product.id)} disabled={busy || mutationBusy || catalog.loading || Boolean(catalog.error)}
                    onChange={event => setSelectedIds(previous => { const next = new Set(previous); if (event.target.checked) next.add(product.id); else next.delete(product.id); return next; })} /></label>
                  <IconButton type="button" className="menu-drag-handle-hitbox" aria-label={`${product.name} sırasını değiştir`} title="Sürükleyin veya yukarı/aşağı okları kullanın" {...reorder.handleProps(productSortKind, product.id)}><GripVertical size={16} aria-hidden="true" /></IconButton>
                </div>
                <DataListButton disabled={busy || mutationBusy || catalog.loading || Boolean(catalog.error)} twoLine={productView.preset === "list"} className="market-list-row" onClick={() => { if (!reorder.suppressRowClickRef.current) openProduct(product); }}
                  leading={productView.showImages ? <MarketProductThumbnail product={product} className="market-list-product-thumb" /> : null} title={product.name}
                  meta={<span>{money(product.salePrice, product.currency)} · {product.sku || product.barcode || "Kod yok"}</span>}
                  trailing={<StatusBadge tone={product.isActive ? "success" : "neutral"}>{product.isActive ? "Aktif" : "Pasif"}</StatusBadge>} />
                <ActionButton className="market-product-delete" variant="danger" disabled={busy || mutationBusy || catalog.loading || Boolean(catalog.error)} onClick={() => setPendingDelete({ kind: "products", id: product.id, name: product.name })}>Sil</ActionButton>
              </article>
            ))}
            {!busy && !catalog.loading && !catalog.error && filteredProducts.length === 0 && <p className="market-muted">Eşleşen ürün yok.</p>}
          </div>
          <CatalogPageControls catalog={catalog} />
        </section>

        <section className="market-panel">
          <header className="market-panel-heading market-panel-heading-row">
            <div><span>Katalog</span><h2>Kategoriler</h2></div>
          </header>
          <div className="market-category-management">
            <div className="market-list compact">
              {categories.map((category) => editingCategoryForm?.id === category.id ? (
                <article className="market-catalog-record market-category-record--editing" key={category.id}
                  data-sort-kind="categories" data-sort-id={category.id}>
                  <form aria-label={`${category.name} kategorisini düzenle`} onSubmit={event => { event.preventDefault(); void saveCategory(editingCategoryForm); }}>
                    <fieldset className="market-category-fields" disabled={busy || mutationBusy || catalog.loading || Boolean(catalog.error)}>
                      <CategoryFormFields form={editingCategoryForm} categories={categories} onChange={setEditingCategoryForm} />
                      <div className="market-category-actions">
                        <ActionButton type="submit" size="sm" busy={busy || mutationBusy || catalog.loading || Boolean(catalog.error)} disabled={!editingCategoryForm.name.trim()}><Save size={16} aria-hidden="true" /> Kaydet</ActionButton>
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
                  <span><strong>{category.name}</strong><small>{category.code || "Kod yok"}{category.parentId ? " · alt kategori" : " · ana kategori"} · {categoryProductCounts[category.id] ?? 0} ürün</small></span>
                  <StatusBadge tone={category.isActive ? "success" : "neutral"}>{category.isActive ? "Aktif" : "Pasif"}</StatusBadge>
                  </div>
                  <div className="market-record-actions"><ActionButton variant="secondary" disabled={busy || mutationBusy || catalog.loading || Boolean(catalog.error)} onClick={() => editCategory(category)}>Düzenle</ActionButton><ActionButton variant="danger" disabled={busy || mutationBusy || catalog.loading || Boolean(catalog.error)} onClick={() => setPendingDelete({ kind: "categories", id: category.id, name: category.name })}>Sil</ActionButton></div>
                </article>
              ))}
            </div>
            <form className="market-category-create" aria-label="Yeni kategori" onSubmit={event => { event.preventDefault(); void saveCategory(newCategoryForm); }}>
              <fieldset className="market-category-fields" disabled={busy || mutationBusy || catalog.loading || Boolean(catalog.error)}>
                <div className="market-category-create-heading">
                  <h3>Yeni kategori</h3>
                  <label className="form-check"><input type="checkbox" checked={newCategoryForm.isActive} onChange={event => setNewCategoryForm({ ...newCategoryForm, isActive: event.target.checked })} /> Aktif kategori</label>
                </div>
                <CategoryFormFields form={newCategoryForm} categories={categories} onChange={setNewCategoryForm} showActive={false} />
                <div className="market-category-actions">
                  <ActionButton type="submit" size="sm" busy={busy || mutationBusy || catalog.loading || Boolean(catalog.error)} disabled={!newCategoryForm.name.trim()}><Plus size={16} aria-hidden="true" /> Kategori Ekle</ActionButton>
                </div>
              </fieldset>
            </form>
          </div>
        </section>
      </div>

      {pendingBulk && <ConfirmDialog tone={pendingBulk.action === "delete" ? "danger" : "warning"} title={`Toplu işlem: ${bulkActionLabels[pendingBulk.action]}`}
        description={`${pendingBulk.products.length} seçili ürüne “${bulkActionLabels[pendingBulk.action]}” işlemi uygulanacak. Onaylıyor musunuz?`}
        details={<ul>{pendingBulk.products.slice(0, 5).map(product => <li key={product.id}>{product.name}</li>)}{pendingBulk.products.length > 5 && <li>ve {pendingBulk.products.length - 5} ürün daha</li>}</ul>}
        confirmLabel={bulkActionLabels[pendingBulk.action]} busy={mutationBusy || busy} onCancel={() => { if (!bulkLock.current) setPendingBulk(null); }} onConfirm={applyBulk} />}

      {pendingDelete && <ConfirmDialog tone="danger" title={pendingDelete.kind === "products" ? "Ürünü sil" : "Kategoriyi sil"} description={`“${pendingDelete.name}” kaldırılacak.`} confirmLabel="Sil" busy={mutationBusy || busy} onCancel={() => setPendingDelete(null)} onConfirm={() => {
        const record = pendingDelete;
        setPendingDelete(null);
        if (record.kind === "categories") void deleteCategory(record.id);
        else if (bridge) void mutate(() => bridge.deleteProduct(record.id), "Ürün kaldırıldı.");
      }} />}


    </>
  );
}
