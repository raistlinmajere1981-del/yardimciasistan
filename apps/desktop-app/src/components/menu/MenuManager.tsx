import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { GripVertical, Plus, Save, Star, Trash2 } from "lucide-react";
import type { PublishedMenuCategory, PublishedMenuItem } from "@yardimci-asistan/sync-core";
import type { DesktopDashboardData, DesktopMenuSaveResult, DesktopStatusUpdateResult } from "../../../electron/database";
import { StockImageImportWorkspace } from "../restaurant/StockImageImportWorkspace";
import {
  compareMenuRecords,
  findMenuCategoryName,
  formatCurrency,
  getMenuStockBadge,
  isQrHiddenByStock,
  resolveMenuPreviewImageUrl,
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
  onSaveItem: () => Promise<DesktopMenuSaveResult | undefined>;
  onReorderCategories: (orderedIds: string[]) => Promise<DesktopStatusUpdateResult>;
  onReorderItems: (categoryId: string, orderedIds: string[]) => Promise<DesktopStatusUpdateResult>;
  onDeleteCategory: (confirmed?: boolean) => void;
  onDashboardDataChanged: (data: DesktopDashboardData) => void;
}

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
  onReorderCategories,
  onReorderItems,
  onDeleteCategory,
  onDashboardDataChanged
}: MenuManagerProps) {
  const navigation = useWorkspaceNavigation();
  const [pendingCategoryDelete, setPendingCategoryDelete] = useState(false);
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

    if (selectedCategoryId) {
      return items.sort(compareMenuRecords);
    }

    const categoryOrder = new Map(sortedCategories.map((category, index) => [category.id, index]));
    return items.sort((left, right) => {
      const categoryDifference = (categoryOrder.get(left.category_id) ?? Number.MAX_SAFE_INTEGER)
        - (categoryOrder.get(right.category_id) ?? Number.MAX_SAFE_INTEGER);
      return categoryDifference || compareMenuRecords(left, right);
    });
  }, [dashboardData.menu.items, selectedCategoryId, sortedCategories]);
  const selectedCategoryName = selectedCategoryId
    ? findMenuCategoryName(selectedCategoryId, dashboardData.menu.categories)
    : "Tüm kategoriler";
  const relatedProductCount = categoryForm.id
    ? dashboardData.menu.items.filter((item) => item.category_id === categoryForm.id).length
    : 0;

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

  function handleDragStart(event: DragEvent<HTMLButtonElement>, kind: "category" | "item", id: string) {
    if (reorderBusy) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    suppressRowClickRef.current = false;
    setDragging({ kind, id });
    setDropTarget(null);
  }

  function handleDragOver(event: DragEvent<HTMLButtonElement>, id: string) {
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

  async function handleDrop(event: DragEvent<HTMLButtonElement>, kind: "category" | "item", targetId: string) {
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
      if (kind === "category") {
        await onReorderCategories(orderedIds);
      } else if (sourceItem) {
        await onReorderItems(sourceItem.category_id, orderedIds);
      }
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
        toolbar={(
          <>
            <div className="page-toolbar__start">
              <StatusBadge tone="info">{selectedCategoryName}</StatusBadge>
              <StatusBadge tone="neutral">{dashboardData.menu.items.length} ürün</StatusBadge>
            </div>
            <div className="page-toolbar__actions">
              {stockImageImportEnabled && (
                <StockImageImportWorkspace menu={dashboardData.menu} onApplied={onDashboardDataChanged} />
              )}
              <ActionButton variant="primary" size="sm" onClick={startItemCreate}>
                <Plus size={16} aria-hidden="true" />
                Ürün ekle
              </ActionButton>
            </div>
          </>
        )}
      >
        <div className="menu-management-grid">
          <section className="panel menu-category-panel">
            <div className="panel-heading menu-panel-heading">
              <div>
                <h2>Kategoriler</h2>
                <p>Menüdeki ürün gruplarını yönetin. Sıralamak için kayıtları sürükleyin.</p>
              </div>
              <div className="page-toolbar__actions">
                <StatusBadge tone="info">{dashboardData.menu.categories.length} kayıt</StatusBadge>
                <ActionButton variant="secondary" size="sm" onClick={onNewCategory}>
                  <Plus size={16} aria-hidden="true" />
                  Kategori ekle
                </ActionButton>
              </div>
            </div>

            <DataList className="menu-record-list menu-category-list">
              {sortedCategories.map((category) => (
                <DataListButton
                  className={`menu-record menu-sortable-record${dragging?.kind === "category" && dragging.id === category.id ? " is-dragging" : ""}${dropTarget?.id === category.id ? ` is-drop-${dropTarget.position}` : ""}`}
                  key={category.id}
                  draggable={!reorderBusy}
                  onDragStart={(event) => handleDragStart(event, "category", category.id)}
                  onDragOver={(event) => handleDragOver(event, category.id)}
                  onDrop={(event) => void handleDrop(event, "category", category.id)}
                  onDragEnd={finishDrag}
                  onClick={() => {
                    if (!suppressRowClickRef.current) onSelectCategory(category);
                  }}
                  aria-pressed={selectedCategoryId === category.id}
                  selected={selectedCategoryId === category.id}
                  title={category.name}
                  leading={<GripVertical className="menu-drag-handle" size={16} aria-hidden="true" />}
                  meta={dashboardData.menu.items.filter((item) => item.category_id === category.id).length + " ürün"}
                  trailing={(
                    <StatusBadge tone={category.is_active ? "success" : "neutral"}>
                      {category.is_active
                        ? (qrMenuEnabled ? "Yayında" : "Aktif")
                        : (qrMenuEnabled ? "Gizli" : "Pasif")}
                    </StatusBadge>
                  )}
                />
              ))}
            </DataList>

            <div className="form-stack menu-category-form">
              <label className="form-field form-field--long">
                Kategori adı
                <input
                  value={categoryForm.name}
                  onChange={(event) => onCategoryFormChange({ ...categoryForm, name: event.target.value })}
                  placeholder="Kahvaltı"
                />
              </label>
              <label className="form-field form-field--fluid">
                Açıklama
                <textarea
                  value={categoryForm.description}
                  onChange={(event) => onCategoryFormChange({ ...categoryForm, description: event.target.value })}
                  placeholder="Kısa kategori açıklaması"
                />
              </label>
              <label className="form-check">
                <input
                  checked={categoryForm.is_active}
                  onChange={(event) => onCategoryFormChange({ ...categoryForm, is_active: event.target.checked })}
                  type="checkbox"
                />
                {qrMenuEnabled ? "Yayında göster" : "Menüde etkin"}
              </label>
              <div className="form-actions menu-form-actions">
                {categoryForm.id && (
                  <ActionButton
                    variant="danger"
                    size="sm"
                    onClick={() => setPendingCategoryDelete(true)}
                    disabled={menuEditState === "loading"}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    Kategoriyi Sil
                  </ActionButton>
                )}
                <ActionButton
                  variant="primary"
                  size="sm"
                  onClick={onSaveCategory}
                  disabled={menuEditState === "loading"}
                >
                  <Save size={16} aria-hidden="true" />
                  Kategoriyi Kaydet
                </ActionButton>
              </div>
            </div>
          </section>

          <section className="panel menu-product-panel">
            <div className="panel-heading menu-panel-heading">
              <div className="menu-heading-copy">
                <h2>Ürünler</h2>
                <span>{selectedCategoryName}{selectedCategoryId ? " · Sıralamak için sürükleyin" : " · Ürünleri kendi kategorisi içinde sürükleyin"}</span>
              </div>
              <StatusBadge tone="info">{dashboardData.menu.items.length} kayıt</StatusBadge>
            </div>

            <DataList className="menu-record-list menu-product-list">
              {visibleItems.length === 0 && <p className="empty-state">Bu kategoride henüz ürün yok.</p>}
              {visibleItems.map((item) => {
                const stockBadge = getMenuStockBadge(item);
                return (
                  <DataListButton
                    className={`menu-record menu-sortable-record${dragging?.kind === "item" && dragging.id === item.id ? " is-dragging" : ""}${dropTarget?.id === item.id ? ` is-drop-${dropTarget.position}` : ""}`}
                    key={item.id}
                    draggable={!reorderBusy}
                    onDragStart={(event) => handleDragStart(event, "item", item.id)}
                    onDragOver={(event) => handleDragOver(event, item.id)}
                    onDrop={(event) => void handleDrop(event, "item", item.id)}
                    onDragEnd={finishDrag}
                    onClick={() => {
                      if (!suppressRowClickRef.current) openItem(item);
                    }}
                    aria-pressed={selectedItemId === item.id}
                    selected={selectedItemId === item.id}
                    title={item.name}
                    leading={<span className="menu-product-row__leading">
                      <GripVertical className="menu-drag-handle" size={16} aria-hidden="true" />
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
                <ActionButton type="submit" disabled={menuEditState === "loading"}>
                  <Save size={16} aria-hidden="true" />
                  {menuEditState === "loading" ? "Kaydediliyor" : "Ürünü Kaydet"}
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
        description={`“${categoryForm.name}” kategorisi ve bağlı ${relatedProductCount} ürün silinecek.`}
        details="Bu işlem geri alınamaz." confirmLabel="Kategoriyi sil" busy={menuEditState === "loading"}
        onCancel={() => setPendingCategoryDelete(false)}
        onConfirm={() => { setPendingCategoryDelete(false); onDeleteCategory(true); }} />}

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
