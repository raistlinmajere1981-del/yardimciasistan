import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { PublishedQrMenu } from "@yardimci-asistan/sync-core";
import { IconButton } from "../ui/IconButton";
import { ActionButton } from "../ui/ActionButton";
import { SegmentedControl } from "../ui/SegmentedControl";
import type { useTableOrderController } from "./use-table-order-controller";
import { formatMoney } from "./table-presentation";

export function TableOrderEditor({ menu, menuEnabled, controller, readOnly = false }: {
  menu: PublishedQrMenu; menuEnabled: boolean; readOnly?: boolean; controller: ReturnType<typeof useTableOrderController>;
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const selectedOrder = controller.active;
  const noteDrafts = controller.notes;
  const busyAction = controller.busy || controller.loading || readOnly;
  const activeCategories = useMemo(
    () => menu.categories.filter((category) => category.is_active).sort(compareMenuRecords),
    [menu.categories]
  );
  const categoryNames = useMemo(
    () => new Map(activeCategories.map((category) => [category.id, category.name])),
    [activeCategories]
  );
  const availableItems = useMemo(() => {
    if (!menuEnabled) return [];
    const activeCategoryIds = new Set(activeCategories.map((category) => category.id));
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase("tr-TR");
    return menu.items
      .filter((item) => item.is_available && activeCategoryIds.has(item.category_id))
      .filter((item) => selectedCategoryId === "all" || item.category_id === selectedCategoryId)
      .filter((item) => {
        if (!normalizedQuery) {
          return true;
        }
        return `${item.name} ${item.description} ${categoryNames.get(item.category_id) ?? ""}`
          .toLocaleLowerCase("tr-TR")
          .includes(normalizedQuery);
      })
      .sort(compareMenuRecords);
  }, [activeCategories, categoryNames, menu.items, menuEnabled, searchQuery, selectedCategoryId]);

  return (
    <div className={`restaurant-order-workspace${menuEnabled ? "" : " is-ticket-only"}`}>
              {menuEnabled && <section className="restaurant-order-menu-panel" aria-labelledby="table-order-menu-title">
                <div className="restaurant-order-panel-heading">
                  <div>
                    <h3 id="table-order-menu-title">Menüden Ekle</h3>
                    <span>{availableItems.length} aktif ürün</span>
                  </div>
                  <label className="form-field form-field--medium restaurant-order-search">
                    <Search size={15} aria-hidden="true" />
                    <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Ürün ara" aria-label="Sipariş için ürün ara" />
                  </label>
                </div>
                <SegmentedControl
                  className="restaurant-order-category-tabs"
                  value={selectedCategoryId}
                  ariaLabel="Menü kategorileri"
                  onChange={setSelectedCategoryId}
                  options={[
                    { id: "all", label: "Tümü" },
                    ...activeCategories.map((category) => ({ id: category.id, label: category.name }))
                  ]}
                />
                <div className="restaurant-order-product-list">
                  {availableItems.length === 0 && <p className="restaurant-order-empty">Aramanıza uyan aktif ve mevcut ürün bulunamadı.</p>}
                  {availableItems.map((item) => (
                    <article className="restaurant-order-product" key={item.id}>
                      <div>
                        <span>{categoryNames.get(item.category_id) ?? "Menü"}</span>
                        <strong>{item.name}</strong>
                        {item.description && <small>{item.description}</small>}
                      </div>
                      <div className="restaurant-order-product__action">
                        <strong>{formatMoney(item.price, item.currency || "TRY")}</strong>
                        <span>{formatOrderMenuStock(item.stock_quantity, item.stock_unit)}</span>
                        <ActionButton
                          variant="secondary"
                          size="sm"
                          onClick={() => void controller.addItem(item.id)}
                          disabled={!selectedOrder || Boolean(busyAction) || (item.stock_quantity !== null && item.stock_quantity < menuStockConsumption(item.stock_consumption_quantity))}
                          aria-label={`${item.name} ürününü siparişe ekle`}
                        >
                          <Plus size={15} aria-hidden="true" /> Ekle
                        </ActionButton>
                      </div>
                    </article>
                  ))}
                </div>
              </section>}

              <section className="restaurant-order-ticket-panel" aria-labelledby="table-order-ticket-title">
                <div className="restaurant-order-panel-heading restaurant-order-ticket-heading">
                  <div>
                    <h3 id="table-order-ticket-title">Aktif Adisyon</h3>
                    <span>{selectedOrder?.itemCount ?? 0} ürün</span>
                  </div>
                </div>
                <div className="restaurant-order-line-list">
                  {!selectedOrder && <p className="restaurant-order-empty">Aktif adisyon yok. Sipariş Başlat ile başlayın.</p>}
                  {selectedOrder && selectedOrder.items.length === 0 && (
                    <p className="restaurant-order-empty">{menuEnabled
                      ? "Henüz ürün eklenmedi. Soldaki aktif menüden ürün seçin."
                      : "Bu adisyonda henüz ürün yok."}</p>
                  )}
                  {selectedOrder?.items.map((item) => (
                    <article className="restaurant-order-line" key={item.id}>
                      <div className="restaurant-order-line__main">
                        <strong>{item.productName}</strong>
                        <span>{formatMoney(item.unitPrice, item.currency)} • {formatOrderItemStatus(item.status)}</span>
                      </div>
                      <strong className="restaurant-order-line__total">{formatMoney(item.lineTotal, item.currency)}</strong>
                      <div className="restaurant-quantity-control" role="group" aria-label={`${item.productName} adedi`}>
                        <IconButton size="sm" onClick={() => void controller.quantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1 || Boolean(busyAction)} aria-label={`${item.productName} adetini azalt`}><Minus size={14} aria-hidden="true" /></IconButton>
                        <output>{item.quantity}</output>
                        <IconButton
                          size="sm"
                          onClick={() => void controller.quantity(item.id, item.quantity + 1)}
                          disabled={item.quantity >= 999 || Boolean(busyAction) || isOrderItemOutOfStock(item.menuItemId, menu)}
                          aria-label={`${item.productName} adetini artır`}
                        ><Plus size={14} aria-hidden="true" /></IconButton>
                      </div>
                      <input
                        className="restaurant-order-line__note"
                        value={noteDrafts[item.id] ?? ""}
                        onChange={(event) => {
                          controller.editNote(item.id, event.target.value);
                        }}
                        onBlur={() => void controller.flushNotes()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.currentTarget.blur();
                          }
                        }}
                        placeholder="Ürün notu"
                        aria-label={`${item.productName} notu`}
                        disabled={Boolean(busyAction)}
                        maxLength={500}
                      />
                      <ActionButton className="restaurant-order-line__remove" variant="danger" size="sm" onClick={() => void controller.removeItem(item.id)} disabled={Boolean(busyAction)} aria-label={`${item.productName} satırını sil`}><Trash2 size={15} aria-hidden="true" /></ActionButton>
                    </article>
                  ))}
                </div>

              </section>
            </div>

  );
}

function formatOrderMenuStock(quantity: number | null | undefined, unit: "piece" | "gram"): string {
  if (quantity == null) {
    return "Stok takibi yok";
  }
  if (quantity <= 0) {
    return "Stokta yok";
  }
  return `Stok: ${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(quantity)} ${unit === "gram" ? "g" : "adet"}`;
}

function isOrderItemOutOfStock(menuItemId: string, menu: PublishedQrMenu): boolean {
  const item = menu.items.find((candidate) => candidate.id === menuItemId);
  return item?.stock_quantity !== null && item !== undefined && item.stock_quantity < menuStockConsumption(item.stock_consumption_quantity);
}

function menuStockConsumption(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 1;
}

function compareMenuRecords(a: { sort_order: number; name: string }, b: { sort_order: number; name: string }) {
  return a.sort_order - b.sort_order || a.name.localeCompare(b.name, "tr-TR");
}

function formatOrderItemStatus(status: string): string {
  return {
    open: "Açık",
    preparing: "Hazırlanıyor",
    served: "Servis edildi",
    cancelled: "İptal"
  }[status] ?? status;
}

