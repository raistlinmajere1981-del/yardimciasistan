import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { PublishedMenuItem, PublishedQrMenu } from "@yardimci-asistan/sync-core";
import { ActionButton } from "../ui/ActionButton";
import { SegmentedControl } from "../ui/SegmentedControl";
import { resolveMenuPreviewImageUrl } from "./menu-model";

export function MenuProductPicker({ menu, webModuleUrl, enabled, inventoryEnabled = true, busy = false, panelAriaLabel, searchAriaLabel,
  addAriaLabel, onAddItem, canAddItem, className = "" }: {
  menu: PublishedQrMenu;
  webModuleUrl: string;
  enabled: boolean;
  inventoryEnabled?: boolean;
  busy?: boolean;
  panelAriaLabel: string;
  searchAriaLabel: string;
  addAriaLabel: (item: PublishedMenuItem) => string;
  onAddItem: (item: PublishedMenuItem) => unknown;
  canAddItem?: (item: PublishedMenuItem) => boolean;
  className?: string;
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const activeCategories = useMemo(
    () => menu.categories.filter(category => category.is_active).sort(compareMenuRecords),
    [menu.categories]
  );
  const categoryNames = useMemo(
    () => new Map(activeCategories.map(category => [category.id, category.name])),
    [activeCategories]
  );
  const availableItems = useMemo(() => {
    if (!enabled) return [];
    const activeCategoryIds = new Set(activeCategories.map(category => category.id));
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase("tr-TR");
    return menu.items
      .filter(item => item.is_available && activeCategoryIds.has(item.category_id))
      .filter(item => selectedCategoryId === "all" || item.category_id === selectedCategoryId)
      .filter(item => !normalizedQuery || `${item.name} ${item.description} ${categoryNames.get(item.category_id) ?? ""}`
        .toLocaleLowerCase("tr-TR").includes(normalizedQuery))
      .sort(compareMenuRecords);
  }, [activeCategories, categoryNames, enabled, menu.items, searchQuery, selectedCategoryId]);

  if (!enabled) return null;

  return <section className={`restaurant-order-menu-panel${className ? ` ${className}` : ""}`} aria-label={panelAriaLabel}>
    <div className="restaurant-order-panel-heading">
      <div>
        <h3>Menü</h3>
        <span>{availableItems.length} aktif ürün</span>
      </div>
      <label className="form-field form-field--medium restaurant-order-search">
        <Search size={15} aria-hidden="true" />
        <input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Ürün ara" aria-label={searchAriaLabel} />
      </label>
    </div>
    <SegmentedControl
      className="restaurant-order-category-tabs"
      value={selectedCategoryId}
      ariaLabel="Menü kategorileri"
      onChange={setSelectedCategoryId}
      options={[
        { id: "all", label: "Tümü" },
        ...activeCategories.map(category => ({ id: category.id, label: category.name }))
      ]}
    />
    <div className="restaurant-order-product-list">
      {availableItems.length === 0 && <p className="restaurant-order-empty">Aramanıza uyan aktif ve mevcut ürün bulunamadı.</p>}
      {availableItems.map(item => {
        const disabled = busy || (inventoryEnabled && isPublishedMenuItemOutOfStock(item)) || (canAddItem ? !canAddItem(item) : false);
        return <article className="restaurant-order-product" key={item.id}>
          <div className="restaurant-order-product__main">
            <MenuProductImage item={item} webModuleUrl={webModuleUrl} className="restaurant-order-product__image" />
            <div className="restaurant-order-product__copy">
              <span>{categoryNames.get(item.category_id) ?? "Menü"}</span>
              <strong>{item.name}</strong>
              {item.description && <small>{item.description}</small>}
            </div>
          </div>
          <div className="restaurant-order-product__action">
            <strong>{formatMenuMoney(item.price, item.currency || "TRY")}</strong>
            {inventoryEnabled && <span>{formatMenuStock(item.stock_quantity, item.stock_unit)}</span>}
            <ActionButton
              variant="secondary"
              size="sm"
              onClick={() => void onAddItem(item)}
              disabled={disabled}
              aria-label={addAriaLabel(item)}
            >
              <Plus size={15} aria-hidden="true" /> Ekle
            </ActionButton>
          </div>
        </article>;
      })}
    </div>
  </section>;
}

export function countActiveMenuItems(menu: PublishedQrMenu, enabled: boolean): number {
  if (!enabled) return 0;
  const activeCategoryIds = new Set(menu.categories.filter(category => category.is_active).map(category => category.id));
  return menu.items.filter(item => item.is_available && activeCategoryIds.has(item.category_id)).length;
}

export function isMenuItemOutOfStock(menuItemId: string, menu: PublishedQrMenu, inventoryEnabled = true): boolean {
  if (!inventoryEnabled) return false;
  const item = menu.items.find(candidate => candidate.id === menuItemId);
  return item ? isPublishedMenuItemOutOfStock(item) : false;
}

function isPublishedMenuItemOutOfStock(item: PublishedMenuItem): boolean {
  return item.stock_quantity !== null && item.stock_quantity < menuStockConsumption(item.stock_consumption_quantity);
}

function menuStockConsumption(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 1;
}

function formatMenuStock(quantity: number | null | undefined, unit: string | undefined): string {
  if (quantity == null) return "Stok takibi yok";
  if (quantity <= 0) return "Stokta yok";
  return `Stok: ${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(quantity)} ${unit === "gram" ? "g" : "adet"}`;
}

function formatMenuMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency || "TRY" }).format(value);
  } catch {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value);
  }
}

function compareMenuRecords(a: { sort_order: number; name: string }, b: { sort_order: number; name: string }) {
  return a.sort_order - b.sort_order || a.name.localeCompare(b.name, "tr-TR");
}

export function MenuProductImage({ item, webModuleUrl, className }: {
  item?: PublishedMenuItem;
  webModuleUrl: string;
  className: string;
}) {
  const [failed, setFailed] = useState("");
  const source = item ? resolveMenuPreviewImageUrl(item.image_url || "", webModuleUrl) : "";
  if (!source || source === failed) return null;
  return <img className={className} src={source} alt={item?.name || ""} loading="lazy" onError={() => setFailed(source)} />;
}
