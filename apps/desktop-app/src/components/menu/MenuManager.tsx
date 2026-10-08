import { usePageViewScroll } from "../../app/page-view-state";
import { useEffect, useMemo, useState } from "react";
import { useRecordReorder } from "../ui/use-record-reorder";
import { GripVertical, Plus, Save, Star, Trash2 } from "lucide-react";
import type { PublishedMenuCategory, PublishedMenuItem } from "@yardimci-asistan/sync-core";
import type { DesktopDashboardData, DesktopMenuSaveResult, DesktopStatusUpdateResult } from "../../../electron/database";
import { QrMenuPanel } from "./QrMenuPanel";
import { StockImageImportWorkspace } from "../restaurant/StockImageImportWorkspace";
import {
  compareMenuRecords,
  emptyCategoryForm,
  findMenuCategoryName,
  formatCurrency,
  getMenuStockBadge,
  isQrHiddenByStock,
  nextSortOrder,
  resolveMenuPreviewImageUrl,
  toCategoryForm,
  type CategoryFormState,
  type ItemFormState
} from "./menu-model";
import { MenuProductEntryFields } from "./MenuProductEntryFields";
import { ProductFormFields } from "../market/ProductFormFields";
import { emptyProductForm, productFormToSaveInput, validateProductFormPrices } from "../../app/product-model";
import type { CatalogProduct, CatalogCategory } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { DataList, DataListButton } from "../ui/DataList";
import { FormDialog } from "../ui/FormDialog";
import { StatusBadge } from "../ui/StatusBadge";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { FeatureWorkspacePage } from "../workspace/FeatureWorkspacePage";
import { PageWorkSurface } from "../layout/PageWorkSurface";
import { useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";

type SyncState = "idle" | "loading" | "success" | "error";

interface MenuManagerProps {
  products: CatalogProduct[];
  catalogCategories: CatalogCategory[];
  onCatalogReload: () => Promise<void>;
  dashboardData: DesktopDashboardData;
  qrMenuEnabled: boolean;
  inventoryEnabled: boolean;
  stockImageImportEnabled: boolean;
  itemForm: ItemFormState;
  selectedCategoryId: string;
  selectedItemId: string;
  menuEditState: SyncState;
  menuEditMessage: string;
  onItemFormChange: (form: ItemFormState) => void;
  onSelectCategory: (category: PublishedMenuCategory) => void;
  onSelectItem: (item: PublishedMenuItem) => void;
  onNewItem: () => void;
  onSaveCategoryForm: (form: CategoryFormState, selectSaved?: boolean) => Promise<DesktopMenuSaveResult>;
  onSaveItem: (product?: import("../../../electron/commerce-store").SaveCatalogProductInput) => Promise<DesktopMenuSaveResult | undefined>;
  onReorderCategories: (orderedIds: string[]) => Promise<DesktopStatusUpdateResult>;
  onReorderItems: (categoryId: string, orderedIds: string[]) => Promise<DesktopStatusUpdateResult>;
  onDeleteCategoryById: (categoryId: string) => Promise<void>;
  onDashboardDataChanged: (data: DesktopDashboardData) => void;
  onPreview: () => void;
}

export function MenuManager({
  products,
  catalogCategories,
  onCatalogReload,
  dashboardData,
  qrMenuEnabled,
  inventoryEnabled,
  stockImageImportEnabled,
  itemForm,
  selectedCategoryId,
  selectedItemId,
  menuEditState,
  menuEditMessage,
  onItemFormChange,
  onSelectCategory,
  onSelectItem,
  onNewItem,
  onSaveCategoryForm,
  onSaveItem,
  onReorderCategories,
  onReorderItems,
  onDeleteCategoryById,
  onDashboardDataChanged,
  onPreview
}: MenuManagerProps) {
  const navigation = useWorkspaceNavigation();
  const [pendingCategoryDeleteId, setPendingCategoryDeleteId] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [editingCategoryForm, setEditingCategoryForm] = useState<CategoryFormState | null>(null);
  const [newCategoryForm, setNewCategoryForm] = useState<CategoryFormState>(() => emptyCategoryForm(nextSortOrder(dashboardData.menu.categories)));
  const [itemCreateOpen, setItemCreateOpen] = useState(false);
  const [pendingItemId, setPendingItemId] = useState("");
  const [priceValidationVisible, setPriceValidationVisible] = useState(false);
  const [productForm, setProductForm] = useState(() => ({ ...emptyProductForm(false), purchasePrice: "0" }));
  const [manualImageDataUrl, setManualImageDataUrl] = useState("");
  const [createMessage, setCreateMessage] = useState("");

  const sortedCategories = useMemo(
    () => [...dashboardData.menu.categories].sort(compareMenuRecords),
    [dashboardData.menu.categories]
  );
  const visibleItems = useMemo(() => {
    const items = dashboardData.menu.items
      .filter((item) => !selectedCategoryId || item.category_id === selectedCategoryId);

    if (selectedCategoryId) return items.sort(compareMenuRecords);

    const categoryOrder = new Map(sortedCategories.map((category, index) => [category.id, index]));
    return items.sort((left, right) => {
      const categoryDifference = (categoryOrder.get(left.category_id) ?? Number.MAX_SAFE_INTEGER)
        - (categoryOrder.get(right.category_id) ?? Number.MAX_SAFE_INTEGER);
      return categoryDifference || compareMenuRecords(left, right);
    });
  }, [dashboardData.menu.items, selectedCategoryId, sortedCategories]);
  const categoryScroll = usePageViewScroll("menu.categories.scroll", sortedCategories.length);
  const productScroll = usePageViewScroll(`menu.products.scroll.${selectedCategoryId}`, visibleItems.length);
  const { dragging, dropTarget, reorderBusy, suppressRowClickRef, handleDragStart, handleDragOver, handleDrop, finishDrag,
    handleKeyDown, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = useRecordReorder<"category" | "item">({
    canDrag: (kind, id) => kind === "category" ? editingCategoryId !== id : Boolean(selectedCategoryId),
    getIds: (kind, id) => kind === "category" ? sortedCategories.map(record => record.id) : dashboardData.menu.items
      .filter(record => record.category_id === dashboardData.menu.items.find(item => item.id === id)?.category_id)
      .sort(compareMenuRecords).map(record => record.id),
    onReorder: async (kind, ids, sourceId) => {
      if (kind === "category") await onReorderCategories(ids);
      else { const item = dashboardData.menu.items.find(record => record.id === sourceId); if (item) await onReorderItems(item.category_id, ids); }
    }
  });

  const pendingCategoryDelete = dashboardData.menu.categories.find((category) => category.id === pendingCategoryDeleteId);
  const pendingCategoryProductCount = pendingCategoryDelete
    ? dashboardData.menu.items.filter((item) => item.category_id === pendingCategoryDelete.id).length
    : 0;

  useEffect(() => {
    if (editingCategoryId && !dashboardData.menu.categories.some((category) => category.id === editingCategoryId)) {
      setEditingCategoryId("");
      setEditingCategoryForm(null);
    }
  }, [dashboardData.menu.categories, editingCategoryId]);

  useEffect(() => {
    if (itemCreateOpen || !pendingItemId) return;
    const entry = dashboardData.menu.items.find(item => item.id === pendingItemId);
    if (!entry?.product_id) return;
    if (navigation.openWorkspace({
      entityType: "product",
      entityId: entry.product_id,
      menuEntryId: entry.id,
      mode: "details",
      returnContext: { page: "menu", entityId: pendingItemId }
    })) {
      setPendingItemId("");
    }
  }, [dashboardData.menu.items, itemCreateOpen, navigation, pendingItemId]);

  function openItem(item: PublishedMenuItem) {
    onSelectItem(item);
    navigation.openWorkspace({
      entityType: "product",
      entityId: item.product_id!,
      menuEntryId: item.id,
      mode: "details",
      returnContext: { page: "menu", entityId: item.id }
    });
  }

  function startItemCreate() {
    onNewItem();
    setProductForm({ ...emptyProductForm(false), purchasePrice: "0" });
    setPriceValidationVisible(false);
    setManualImageDataUrl("");
    setCreateMessage("");
    setItemCreateOpen(true);
  }

  function startCategoryEdit(category: PublishedMenuCategory) {
    setEditingCategoryId(category.id);
    setEditingCategoryForm(toCategoryForm(category));
  }

  async function saveCategoryEdit() {
    if (!editingCategoryForm) return;
    const result = await onSaveCategoryForm(editingCategoryForm, false);
    if (!result.ok) return;
    setEditingCategoryId("");
    setEditingCategoryForm(null);
  }

  async function createCategory() {
    const form = {
      ...newCategoryForm,
      id: "",
      sort_order: String(nextSortOrder(dashboardData.menu.categories))
    };
    const result = await onSaveCategoryForm(form, true);
    if (!result.ok) return;
    setNewCategoryForm(emptyCategoryForm(nextSortOrder(result.dashboardData.menu.categories)));
  }


  return (
    <>
      <FeatureWorkspacePage
        label={qrMenuEnabled ? "QR menü yönetimi" : "Menü yönetimi"}
        bodyLabel="Menü kayıtları"
        layout="fill"
      >
        <PageWorkSurface mode="fill" className="menu-page-surface">
          <div className={`menu-page-layout${qrMenuEnabled ? " has-qr" : ""}`}>
            {qrMenuEnabled && (
              <QrMenuPanel
                enabled
                webModuleUrl={dashboardData.webModuleUrl}
                onPreview={onPreview}
                utilityAction={stockImageImportEnabled
                  ? <StockImageImportWorkspace products={products} onApplied={onDashboardDataChanged} />
                  : undefined}
              />
            )}
            <div className="menu-management-grid">
          <section className="panel menu-category-panel" data-surface-role="configuration">
            <div className="panel-heading menu-panel-heading">
              <h2>Kategoriler</h2>
              <StatusBadge tone="info">{dashboardData.menu.categories.length} kayıt</StatusBadge>
            </div>

            <DataList ref={categoryScroll} className="menu-record-list menu-category-list">
              {sortedCategories.map((category) => {
                const productCount = dashboardData.menu.items.filter((item) => item.category_id === category.id).length;
                if (editingCategoryId === category.id && editingCategoryForm) {
                  return <article className="menu-category-row menu-category-row--editing" key={category.id}>
                    <GripVertical className="menu-drag-handle" size={16} aria-hidden="true" />
                    <div className="menu-category-inline-fields">
                      <label className="form-field">
                        Kategori adı
                        <input
                          value={editingCategoryForm.name}
                          onChange={(event) => setEditingCategoryForm({ ...editingCategoryForm, name: event.target.value })}
                        />
                      </label>
                      <label className="form-field">
                        Açıklama
                        <input
                          value={editingCategoryForm.description}
                          onChange={(event) => setEditingCategoryForm({ ...editingCategoryForm, description: event.target.value })}
                          placeholder="Kısa kategori açıklaması"
                        />
                      </label>
                    </div>
                    <label className="form-check menu-category-row__publish">
                      <input
                        type="checkbox"
                        checked={editingCategoryForm.is_active}
                        onChange={(event) => setEditingCategoryForm({ ...editingCategoryForm, is_active: event.target.checked })}
                      />
                      {qrMenuEnabled ? "Yayında" : "Aktif"}
                    </label>
                    <div className="menu-category-row__actions">
                      <ActionButton variant="secondary" size="sm" disabled={menuEditState === "loading"} onClick={() => {
                        setEditingCategoryId("");
                        setEditingCategoryForm(null);
                      }}>Vazgeç</ActionButton>
                      <ActionButton variant="primary" size="sm" busy={menuEditState === "loading"} busyLabel="Kaydediliyor…" onClick={() => void saveCategoryEdit()}>
                        <Save size={15} aria-hidden="true" />
                        Kaydet
                      </ActionButton>
                    </div>
                  </article>;
                }

                return <article
                  className={`menu-category-row menu-sortable-record${selectedCategoryId === category.id ? " is-selected" : ""}${dragging?.kind === "category" && dragging.id === category.id ? " is-dragging" : ""}${dropTarget?.kind === "category" && dropTarget.id === category.id ? ` is-drop-${dropTarget.position}` : ""}`}
                  key={category.id}
                  data-sort-kind="category"
                  data-sort-id={category.id}
                  onDragOver={(event) => handleDragOver(event, "category", category.id)}
                  onDrop={(event) => void handleDrop(event, "category", category.id)}
                >
                  <span
                    className="menu-drag-handle-hitbox"
                    draggable={!reorderBusy}
                    onDragStart={(event) => handleDragStart(event, "category", category.id)}
                    onDragEnd={finishDrag}
                    role="button"
                    tabIndex={0}
                    aria-label={`${category.name} sırasını değiştir`}
                    onKeyDown={event => handleKeyDown(event, "category", category.id)}
                    onPointerDown={event => handlePointerDown(event, "category", category.id)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <GripVertical className="menu-drag-handle" size={16} />
                  </span>
                  <button
                    className="menu-category-row__main menu-category-row__select"
                    type="button"
                    aria-label={category.name}
                    onClick={() => {
                      if (!suppressRowClickRef.current) onSelectCategory(category);
                    }}
                  >
                    <strong>{category.name}</strong>
                    <span className="menu-category-row__details">
                      <span className="menu-category-row__description">{category.description || "Açıklama yok."}</span>
                      <span className="menu-category-row__meta">{productCount} ürün</span>
                    </span>
                  </button>
                  <StatusBadge tone={category.is_active ? "success" : "neutral"}>
                    {category.is_active ? (qrMenuEnabled ? "Yayında" : "Aktif") : (qrMenuEnabled ? "Gizli" : "Pasif")}
                  </StatusBadge>
                  <div className="menu-category-row__actions">
                    <ActionButton variant="secondary" size="sm" onClick={() => startCategoryEdit(category)}>Düzenle</ActionButton>
                    <ActionButton variant="danger" size="sm" onClick={() => setPendingCategoryDeleteId(category.id)}>
                      <Trash2 size={15} aria-hidden="true" />
                      Sil
                    </ActionButton>
                  </div>
                </article>;
              })}
            </DataList>

            <form className="menu-category-create-form" onSubmit={(event) => {
              event.preventDefault();
              void createCategory();
            }}>
              <div className="menu-category-create-fields">
                <label className="form-field">
                  Kategori adı
                  <input
                    value={newCategoryForm.name}
                    onChange={(event) => setNewCategoryForm({ ...newCategoryForm, name: event.target.value })}
                    placeholder="Kahvaltı"
                  />
                </label>
                <label className="form-field">
                  Açıklama
                  <input
                    value={newCategoryForm.description}
                    onChange={(event) => setNewCategoryForm({ ...newCategoryForm, description: event.target.value })}
                    placeholder="Kısa kategori açıklaması"
                  />
                </label>
              </div>
              <div className="menu-category-create-actions">
                <label className="form-check">
                  <input
                    checked={newCategoryForm.is_active}
                    onChange={(event) => setNewCategoryForm({ ...newCategoryForm, is_active: event.target.checked })}
                    type="checkbox"
                  />
                  {qrMenuEnabled ? "Yayında göster" : "Menüde etkin"}
                </label>
                <ActionButton variant="primary" size="sm" type="submit" disabled={menuEditState === "loading" || !newCategoryForm.name.trim()}>
                  <Plus size={16} aria-hidden="true" />
                  Kategori ekle
                </ActionButton>
              </div>
            </form>
          </section>

          <section className="panel menu-product-panel" data-surface-role="configuration">
            <div className="panel-heading menu-panel-heading">
              <h2>Ürünler</h2>
              <div className="page-toolbar__actions">
                <div className="menu-product-heading-status">
                {!selectedCategoryId && <span className="menu-sort-hint">Sıralamak için kategori seçin</span>}
                <StatusBadge tone="info">{visibleItems.length} kayıt</StatusBadge>
              </div>
                <ActionButton variant="primary" size="sm" onClick={startItemCreate}>
                  <Plus size={16} aria-hidden="true" />
                  Ürün ekle
                </ActionButton>
              </div>
            </div>

            <DataList ref={productScroll} className="menu-record-list menu-product-list">
              {visibleItems.length === 0 && <p className="empty-state">Bu kategoride henüz ürün yok.</p>}
              {visibleItems.map((item) => {
                const stockBadge = getMenuStockBadge(item);
                return (
                  <DataListButton
                    className={`menu-record menu-sortable-record${dragging?.kind === "item" && dragging.id === item.id ? " is-dragging" : ""}${dropTarget?.kind === "item" && dropTarget.id === item.id ? ` is-drop-${dropTarget.position}` : ""}`}
                    key={item.id}
                    data-sort-kind="item"
                    data-sort-id={item.id}
                    onDragOver={(event) => handleDragOver(event, "item", item.id)}
                    onDrop={(event) => void handleDrop(event, "item", item.id)}
                    onClick={() => {
                      if (!suppressRowClickRef.current) openItem(item);
                    }}
                    aria-pressed={selectedItemId === item.id}
                    selected={selectedItemId === item.id}
                    title={item.name}
                    leading={<span className="menu-product-row__leading">
                      <span
                        className={`menu-drag-handle-hitbox${!selectedCategoryId ? " is-disabled" : ""}`}
                        draggable={!reorderBusy && Boolean(selectedCategoryId)}
                        onDragStart={(event) => handleDragStart(event, "item", item.id)}
                        onDragEnd={finishDrag}
                        role="button"
                        tabIndex={selectedCategoryId ? 0 : -1}
                        aria-label={`${item.name} sırasını değiştir`}
                        onKeyDown={event => handleKeyDown(event, "item", item.id)}
                        onPointerDown={event => handlePointerDown(event, "item", item.id)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerCancel}
                        onClick={(event) => event.stopPropagation()}
                        title={selectedCategoryId ? "Sürükleyerek sırala" : "Ürün sıralamak için önce bir kategori seçin"}
                      >
                        <GripVertical className="menu-drag-handle" size={16} />
                      </span>
                      <MenuProductThumbnail item={item} webModuleUrl={dashboardData.webModuleUrl} />
                    </span>}
                    meta={(selectedCategoryId ? "" : findMenuCategoryName(item.category_id, dashboardData.menu.categories) + " · ") + formatCurrency(item.price, item.currency) + " · " + (item.is_available ? "Mevcut" : "Kapalı") + (item.is_featured ? " · Öne çıkan" : "")}
                    trailing={(
                      <span className="menu-product-row__trailing">
                        {item.product_is_active === false && <StatusBadge tone="neutral">Ortak ürün pasif</StatusBadge>}
                        {inventoryEnabled && stockBadge && <StatusBadge tone={stockBadge.tone}>{stockBadge.label}</StatusBadge>}
                        {inventoryEnabled && qrMenuEnabled && isQrHiddenByStock(item) && <StatusBadge tone="neutral">QR menüde gizli</StatusBadge>}
                        {item.is_featured && <Star className="menu-product-row__star" size={16} aria-hidden="true" />}
                        {!item.is_featured && <StatusBadge tone={item.is_available ? "success" : "neutral"}>{item.is_available ? "Açık" : "Kapalı"}</StatusBadge>}
                      </span>
                    )}
                  />
                );
              })}
            </DataList>
          </section>
            </div>
          </div>
        </PageWorkSurface>
      </FeatureWorkspacePage>

      {itemCreateOpen && (
        <FormDialog
          title="Yeni ürün"
          onClose={() => {
            if (menuEditState !== "loading") setItemCreateOpen(false);
          }}
          closeBlocked={menuEditState === "loading"}
          dismissOnBackdrop
          onSubmit={(event) => void (async () => {
            event.preventDefault();
            if (menuEditState === "loading") return;
            setPriceValidationVisible(true);
            if (validateProductFormPrices(productForm)) return;
            const result = await onSaveItem({ ...productFormToSaveInput(productForm),
              ...(manualImageDataUrl ? { manualImageDataUrl } : {}) });
            if (!result?.ok) return;
            setPendingItemId(result.savedId);
            setItemCreateOpen(false);
            try { await onCatalogReload(); } catch { setCreateMessage("Ürün kaydedildi; katalog görünümü yenilenemedi."); }
          })()}
          footer={(
            <>
              {menuEditMessage && menuEditMessage !== "Yeni ürün." && (
                <p className={"form-status sync-" + menuEditState} role="status">{menuEditMessage}</p>
              )}
              <div className="action-row">
                <ActionButton
                  variant="secondary"
                  type="button"
                  disabled={menuEditState === "loading"}
                  onClick={() => setItemCreateOpen(false)}
                >
                  Vazgeç
                </ActionButton>
                <ActionButton type="submit" busy={menuEditState === "loading"} busyLabel="Kaydediliyor…">
                  <Save size={16} aria-hidden="true" />
                  Ürünü Kaydet
                </ActionButton>
              </div>
            </>
          )}
        >
          <div className="menu-item-create-form">
            <section className="form-stack" aria-label="Ürün bilgileri">
              <h3>Ürün bilgileri</h3>
              <ProductFormFields form={productForm} categories={catalogCategories} inventoryEnabled={inventoryEnabled}
                 disabled={menuEditState === "loading"}
                 salePriceError={priceValidationVisible ? validateProductFormPrices(productForm) : null}
                 onSalePriceBlur={() => setPriceValidationVisible(true)}
                 productDataEnabled={false} retailFieldsEnabled={false} purchasingEnabled={false} onChange={setProductForm}
                 localImageDataUrl={manualImageDataUrl} onManualImageSelected={setManualImageDataUrl} onImageClear={() => setManualImageDataUrl("")}
                 onStateChange={(_state, message) => setCreateMessage(message)} />
            </section>
            {createMessage && <p role="status">{createMessage}</p>}
            <MenuProductEntryFields
              form={itemForm}
              dashboardData={dashboardData}
              qrMenuEnabled={qrMenuEnabled}
              inventoryEnabled={inventoryEnabled}
              disabled={menuEditState === "loading"}
              showAvailability={false}
              onChange={onItemFormChange}
            />
          </div>
        </FormDialog>
      )}

      {pendingCategoryDelete && <ConfirmDialog tone="danger" title="Kategoriyi sil"
        description={`“${pendingCategoryDelete.name}” kategorisi ve bağlı ${pendingCategoryProductCount} menü ilişkisi kaldırılacak.`}
        details="Ortak ürünler, stok ve diğer satış kanalları korunur." confirmLabel="Kategoriyi sil" busy={menuEditState === "loading"}
        onCancel={() => setPendingCategoryDeleteId("")}
        onConfirm={() => {
          const categoryId = pendingCategoryDelete.id;
          setPendingCategoryDeleteId("");
          void onDeleteCategoryById(categoryId);
        }} />}
    </>
  );
}

function MenuProductThumbnail({ item, webModuleUrl }: {
  item: PublishedMenuItem;
  webModuleUrl: string;
}) {
  const [failed, setFailed] = useState("");
  const source = resolveMenuPreviewImageUrl(item.image_url || "", webModuleUrl);
  if (!source || failed === source) return null;
  return <img className="menu-product-row__image" src={source} alt="" loading="lazy" onError={() => setFailed(source)} />;
}
