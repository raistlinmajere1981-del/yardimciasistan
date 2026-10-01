import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { GripVertical, Plus, Save, Star, Trash2 } from "lucide-react";
import type { PublishedMenuCategory, PublishedMenuItem } from "@yardimci-asistan/sync-core";
import type { DesktopDashboardData, DesktopMenuSaveResult, DesktopStatusUpdateResult } from "../../../electron/database";
import { StockImageImportWorkspace } from "../restaurant/StockImageImportWorkspace";
import { QrMenuPanel } from "./QrMenuPanel";
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
import { MenuItemFormFields } from "./MenuItemFormFields";
import { ActionButton } from "../ui/ActionButton";
import { DataList, DataListButton } from "../ui/DataList";
import { FormDialog } from "../ui/FormDialog";
import { StatusBadge } from "../ui/StatusBadge";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { FeatureWorkspacePage } from "../workspace/FeatureWorkspacePage";
import { useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";

type SyncState = "idle" | "loading" | "success" | "error";

interface MenuManagerProps {
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
  onSaveItem: () => Promise<DesktopMenuSaveResult | undefined>;
  onReorderCategories: (orderedIds: string[]) => Promise<DesktopStatusUpdateResult>;
  onReorderItems: (categoryId: string, orderedIds: string[]) => Promise<DesktopStatusUpdateResult>;
  onDeleteCategoryById: (categoryId: string) => Promise<void>;
  onDashboardDataChanged: (data: DesktopDashboardData) => void;
  onPreview: () => void;
}

export function MenuManager({
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
  const [dragging, setDragging] = useState<{ kind: "category" | "item"; id: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: "before" | "after" } | null>(null);
  const [reorderBusy, setReorderBusy] = useState(false);
  const suppressRowClickRef = useRef(false);

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
    if (navigation.openWorkspace({
      entityType: "menu-item",
      entityId: pendingItemId,
      mode: "details",
      returnContext: { page: "menu", entityId: pendingItemId }
    })) {
      setPendingItemId("");
    }
  }, [itemCreateOpen, navigation, pendingItemId]);

  function openItem(item: PublishedMenuItem) {
    onSelectItem(item);
    navigation.openWorkspace({
      entityType: "menu-item",
      entityId: item.id,
      mode: "details",
      returnContext: { page: "menu", entityId: item.id }
    });
  }

  function startItemCreate() {
    onNewItem();
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

  function handleDragStart(event: DragEvent<HTMLElement>, kind: "category" | "item", id: string) {
    if (reorderBusy || (kind === "category" && editingCategoryId === id)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    suppressRowClickRef.current = false;
    setDragging({ kind, id });
    setDropTarget(null);
  }

  function handleDragOver(event: DragEvent<HTMLElement>, id: string) {
    if (!dragging || dragging.id === id) return;
    if (dragging.kind === "item") {
      const sourceItem = dashboardData.menu.items.find((item) => item.id === dragging.id);
      const targetItem = dashboardData.menu.items.find((item) => item.id === id);
      if (!sourceItem || !targetItem || sourceItem.category_id !== targetItem.category_id) {
        setDropTarget(null);
        return;
      }
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    setDropTarget({ id, position });
  }

  async function handleDrop(event: DragEvent<HTMLElement>, kind: "category" | "item", targetId: string) {
    event.preventDefault();
    event.stopPropagation();
    if (!dragging || dragging.kind !== kind || dragging.id === targetId || reorderBusy) {
      setDragging(null);
      setDropTarget(null);
      return;
    }

    const sourceItem = kind === "item"
      ? dashboardData.menu.items.find((item) => item.id === dragging.id)
      : undefined;
    const targetItem = kind === "item"
      ? dashboardData.menu.items.find((item) => item.id === targetId)
      : undefined;
    if (kind === "item" && (!sourceItem || !targetItem || sourceItem.category_id !== targetItem.category_id)) {
      setDragging(null);
      setDropTarget(null);
      return;
    }

    const sourceIds = kind === "category"
      ? sortedCategories.map((record) => record.id)
      : dashboardData.menu.items
        .filter((record) => record.category_id === sourceItem?.category_id)
        .sort(compareMenuRecords)
        .map((record) => record.id);
    const orderedIds = moveId(sourceIds, dragging.id, targetId, dropTarget?.id === targetId ? dropTarget.position : "before");
    setDragging(null);
    setDropTarget(null);
    if (!orderedIds || orderedIds.every((id, index) => id === sourceIds[index])) return;

    setReorderBusy(true);
    try {
      if (kind === "category") await onReorderCategories(orderedIds);
      else if (sourceItem) await onReorderItems(sourceItem.category_id, orderedIds);
    } finally {
      setReorderBusy(false);
    }
  }

  function finishDrag() {
    suppressRowClickRef.current = true;
    setDragging(null);
    setDropTarget(null);
    window.setTimeout(() => {
      suppressRowClickRef.current = false;
    }, 0);
  }

  return (
    <>
      <FeatureWorkspacePage
        label={qrMenuEnabled ? "QR menü yönetimi" : "Menü yönetimi"}
        bodyLabel="Menü kayıtları"
        toolbar={stockImageImportEnabled ? (
          <div className="page-toolbar__actions">
            <StockImageImportWorkspace menu={dashboardData.menu} onApplied={onDashboardDataChanged} />
          </div>
        ) : undefined}
      >
        {qrMenuEnabled && (
          <QrMenuPanel enabled webModuleUrl={dashboardData.webModuleUrl} onPreview={onPreview} />
        )}
        <div className="menu-management-grid">
          <section className="panel menu-category-panel" data-surface-role="configuration">
            <div className="panel-heading menu-panel-heading">
              <h2>Kategoriler</h2>
              <StatusBadge tone="info">{dashboardData.menu.categories.length} kayıt</StatusBadge>
            </div>

            <DataList className="menu-record-list menu-category-list">
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
                  className={`menu-category-row menu-sortable-record${selectedCategoryId === category.id ? " is-selected" : ""}${dragging?.kind === "category" && dragging.id === category.id ? " is-dragging" : ""}${dropTarget?.id === category.id ? ` is-drop-${dropTarget.position}` : ""}`}
                  key={category.id}
                  onDragOver={(event) => handleDragOver(event, category.id)}
                  onDrop={(event) => void handleDrop(event, "category", category.id)}
                >
                  <span
                    className="menu-drag-handle-hitbox"
                    draggable={!reorderBusy}
                    onDragStart={(event) => handleDragStart(event, "category", category.id)}
                    onDragEnd={finishDrag}
                    onClick={(event) => event.stopPropagation()}
                    aria-hidden="true"
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
                    <p className="menu-category-row__description">{category.description || "Açıklama yok."}</p>
                    <span className="menu-category-row__meta">{productCount} ürün</span>
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
                <StatusBadge tone="info">{visibleItems.length} kayıt</StatusBadge>
                <ActionButton variant="primary" size="sm" onClick={startItemCreate}>
                  <Plus size={16} aria-hidden="true" />
                  Ürün ekle
                </ActionButton>
              </div>
            </div>

            <DataList className="menu-record-list menu-product-list">
              {visibleItems.length === 0 && <p className="empty-state">Bu kategoride henüz ürün yok.</p>}
              {visibleItems.map((item) => {
                const stockBadge = getMenuStockBadge(item);
                return (
                  <DataListButton
                    className={`menu-record menu-sortable-record${dragging?.kind === "item" && dragging.id === item.id ? " is-dragging" : ""}${dropTarget?.id === item.id ? ` is-drop-${dropTarget.position}` : ""}`}
                    key={item.id}
                    onDragOver={(event) => handleDragOver(event, item.id)}
                    onDrop={(event) => void handleDrop(event, "item", item.id)}
                    onClick={() => {
                      if (!suppressRowClickRef.current) openItem(item);
                    }}
                    aria-pressed={selectedItemId === item.id}
                    selected={selectedItemId === item.id}
                    title={item.name}
                    leading={<span className="menu-product-row__leading">
                      <span
                        className="menu-drag-handle-hitbox"
                        draggable={!reorderBusy}
                        onDragStart={(event) => handleDragStart(event, "item", item.id)}
                        onDragEnd={finishDrag}
                        onClick={(event) => event.stopPropagation()}
                        aria-hidden="true"
                      >
                        <GripVertical className="menu-drag-handle" size={16} />
                      </span>
                      <MenuProductThumbnail item={item} webModuleUrl={dashboardData.webModuleUrl} />
                    </span>}
                    meta={(selectedCategoryId ? "" : findMenuCategoryName(item.category_id, dashboardData.menu.categories) + " · ") + formatCurrency(item.price, item.currency) + " · " + (item.is_available ? "Mevcut" : "Kapalı") + (item.is_featured ? " · Öne çıkan" : "")}
                    trailing={(
                      <span className="menu-product-row__trailing">
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
      </FeatureWorkspacePage>

      {itemCreateOpen && (
        <FormDialog
          title="Yeni menü ürünü"
          onClose={() => {
            if (menuEditState !== "loading") setItemCreateOpen(false);
          }}
          closeBlocked={menuEditState === "loading"}
          dismissOnBackdrop
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await onSaveItem();
            if (!result?.ok) return;
            setPendingItemId(result.savedId);
            setItemCreateOpen(false);
          }}
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
            <MenuItemFormFields
              mode="all"
              form={itemForm}
              dashboardData={dashboardData}
              qrMenuEnabled={qrMenuEnabled}
              inventoryEnabled={inventoryEnabled}
              onChange={onItemFormChange}
            />
          </div>
        </FormDialog>
      )}

      {pendingCategoryDelete && <ConfirmDialog tone="danger" title="Kategoriyi sil"
        description={`“${pendingCategoryDelete.name}” kategorisi ve bağlı ${pendingCategoryProductCount} ürün silinecek.`}
        details="Bu işlem geri alınamaz." confirmLabel="Kategoriyi sil" busy={menuEditState === "loading"}
        onCancel={() => setPendingCategoryDeleteId("")}
        onConfirm={() => {
          const categoryId = pendingCategoryDelete.id;
          setPendingCategoryDeleteId("");
          void onDeleteCategoryById(categoryId);
        }} />}
    </>
  );
}

function moveId(
  ids: string[],
  sourceId: string,
  targetId: string,
  position: "before" | "after"
): string[] | null {
  const sourceIndex = ids.indexOf(sourceId);
  const targetIndex = ids.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceId === targetId) return null;

  const next = ids.filter((id) => id !== sourceId);
  const targetIndexAfterRemoval = next.indexOf(targetId);
  const insertIndex = position === "after" ? targetIndexAfterRemoval + 1 : targetIndexAfterRemoval;
  next.splice(Math.max(0, insertIndex), 0, sourceId);
  return next;
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
