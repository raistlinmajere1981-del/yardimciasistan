import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Star, Trash2 } from "lucide-react";
import type { PublishedMenuCategory, PublishedMenuItem } from "@yardimci-asistan/sync-core";
import type { DesktopDashboardData, DesktopMenuSaveResult } from "../../../electron/database";
import { StockImageImportWorkspace } from "../restaurant/StockImageImportWorkspace";
import {
  compareMenuRecords,
  findMenuCategoryName,
  formatCurrency,
  getMenuStockBadge,
  isQrHiddenByStock,
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
  onDeleteCategory,
  onDashboardDataChanged
}: MenuManagerProps) {
  const navigation = useWorkspaceNavigation();
  const [pendingCategoryDelete, setPendingCategoryDelete] = useState(false);
  const [itemCreateOpen, setItemCreateOpen] = useState(false);
  const [pendingItemId, setPendingItemId] = useState("");

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
                <p>Menüdeki ürün gruplarını yönetin.</p>
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
                  className="menu-record"
                  key={category.id}
                  onClick={() => onSelectCategory(category)}
                  aria-pressed={selectedCategoryId === category.id}
                  selected={selectedCategoryId === category.id}
                  title={category.name}
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
              <div className="form-row">
                <label className="form-field form-field--xs">
                  Sıra
                  <input
                    value={categoryForm.sort_order}
                    onChange={(event) => onCategoryFormChange({ ...categoryForm, sort_order: event.target.value })}
                    inputMode="numeric"
                  />
                </label>
              </div>
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
                <span>{selectedCategoryName}</span>
              </div>
              <StatusBadge tone="info">{dashboardData.menu.items.length} kayıt</StatusBadge>
            </div>

            <DataList className="menu-record-list menu-product-list">
              {visibleItems.length === 0 && <p className="empty-state">Bu kategoride henüz ürün yok.</p>}
              {visibleItems.map((item) => {
                const stockBadge = getMenuStockBadge(item);
                return (
                  <DataListButton
                    className="menu-record"
                    key={item.id}
                    onClick={() => openItem(item)}
                    aria-pressed={selectedItemId === item.id}
                    selected={selectedItemId === item.id}
                    title={item.name}
                    meta={formatCurrency(item.price, item.currency) + " · " + (item.is_available ? "Mevcut" : "Kapalı") + (item.is_featured ? " · Öne çıkan" : "")}
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
