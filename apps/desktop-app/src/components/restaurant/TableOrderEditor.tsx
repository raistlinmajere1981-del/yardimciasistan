import { Minus, Plus, Trash2 } from "lucide-react";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import type { PublishedQrMenu } from "@yardimci-asistan/sync-core";
import { IconButton } from "../ui/IconButton";
import { ActionButton } from "../ui/ActionButton";
import { MenuProductImage, MenuProductPicker, countActiveMenuItems, isMenuItemOutOfStock } from "../menu/MenuProductPicker";
import type { useTableOrderController } from "./use-table-order-controller";
import { formatMoney, getOrderCurrency } from "./table-presentation";

export function TableOrderEditor({ menu, webModuleUrl, menuEnabled, inventoryEnabled = true, canStartOrder, controller, readOnly = false, accountPanel }: {
  menu: PublishedQrMenu; webModuleUrl: string; menuEnabled: boolean; inventoryEnabled?: boolean; canStartOrder: boolean; readOnly?: boolean; accountPanel: ReactNode; controller: ReturnType<typeof useTableOrderController>;
}) {
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(() => new Set());
  const selectedOrder = controller.active;
  const noteDrafts = controller.notes;
  const busyAction = controller.busy || controller.loading || readOnly;
  const menuItemsById = useMemo(() => new Map(menu.items.map(item => [item.id, item])), [menu.items]);
  const activeCatalogItemCount = countActiveMenuItems(menu, menuEnabled);

  const menuPanel = <MenuProductPicker
    menu={menu}
    webModuleUrl={webModuleUrl}
    enabled={menuEnabled}
    inventoryEnabled={inventoryEnabled}
    busy={Boolean(busyAction)}
    panelAriaLabel="Sipariş menüsü"
    searchAriaLabel="Sipariş için ürün ara"
    addAriaLabel={item => `${item.name} ürününü siparişe ekle`}
    canAddItem={() => Boolean(selectedOrder || canStartOrder)}
    onAddItem={item => controller.addItem(item.id)}
  />;

  const ticketPanel = <section className="restaurant-order-ticket-panel" data-surface-role="operation" aria-labelledby="table-order-ticket-title">
                <div className="restaurant-order-panel-heading restaurant-order-ticket-heading">
                  <div>
                    <h3 id="table-order-ticket-title">Aktif Adisyon</h3>
                    <span>{selectedOrder?.itemCount ?? 0} ürün</span>
                  </div>
                </div>
                <div className="restaurant-order-line-list">
                  {!selectedOrder && <div className="restaurant-order-empty">
                    <p>{canStartOrder ? "Henüz ürün yok." : "Bu masa şu an sipariş almaya uygun değil."}</p>
                    {canStartOrder && (!menuEnabled || activeCatalogItemCount === 0) && <ActionButton
                      variant="secondary"
                      size="sm"
                      disabled={Boolean(busyAction)}
                      onClick={() => void controller.startTableOrder()}
                    >Adisyon aç</ActionButton>}
                  </div>}
                  {selectedOrder && selectedOrder.items.length === 0 && (
                    <p className="restaurant-order-empty">Henüz ürün yok.</p>
                  )}
                  {selectedOrder?.items.map((item) => {
                    const menuItem = menuItemsById.get(item.menuEntryId);
                    return (
                    <article className="restaurant-order-line" key={item.id}>
                      <div className="restaurant-order-line__main">
                        <MenuProductImage {...(menuItem === undefined ? {} : { item: menuItem })} webModuleUrl={webModuleUrl} className="restaurant-order-line__image" />
                        <div className="restaurant-order-line__copy">
                          <strong>{item.productName}</strong>
                          <span>{formatMoney(item.unitPrice, item.currency)}</span>
                        </div>
                      </div>
                      <div className="restaurant-quantity-control" role="group" aria-label={`${item.productName} adedi`}>
                        <IconButton size="sm" onClick={() => void controller.quantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1 || Boolean(busyAction)} aria-label={`${item.productName} adetini azalt`}><Minus size={14} aria-hidden="true" /></IconButton>
                        <output>{item.quantity}</output>
                        <IconButton
                          size="sm"
                          onClick={() => void controller.quantity(item.id, item.quantity + 1)}
                          disabled={item.quantity >= 999 || Boolean(busyAction) || isMenuItemOutOfStock(item.menuEntryId, menu, inventoryEnabled)}
                          aria-label={`${item.productName} adetini artır`}
                        ><Plus size={14} aria-hidden="true" /></IconButton>
                      </div>
                      <strong className="restaurant-order-line__total">{formatMoney(item.lineTotal, item.currency)}</strong>
                      {(expandedNotes.has(item.id) || Boolean(noteDrafts[item.id])) ? <input
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
                      /> : <ActionButton
                        className="restaurant-order-line__note-toggle"
                        variant="ghost"
                        size="sm"
                        disabled={Boolean(busyAction)}
                        aria-label={`${item.productName} için not ekle`}
                        onClick={() => setExpandedNotes(current => new Set(current).add(item.id))}
                      >
                        Not ekle
                      </ActionButton>}
                      <ActionButton className="restaurant-order-line__remove" variant="danger" size="sm" onClick={() => void controller.removeItem(item.id)} disabled={Boolean(busyAction)} aria-label={`${item.productName} satırını sil`}><Trash2 size={15} aria-hidden="true" /></ActionButton>
                    </article>
                    );
                  })}
                </div>

                {selectedOrder && <div className="restaurant-ticket-total"><span>Adisyon toplamı</span><strong>{formatMoney(selectedOrder.total, getOrderCurrency(selectedOrder))}</strong></div>}
              </section>;
  // Keep all three panes mounted and in a stable order while the order lifecycle changes.
  return <>
    <Fragment key="menu">{menuPanel}</Fragment>
    <Fragment key="ticket">{ticketPanel}</Fragment>
    <Fragment key="context">{accountPanel}</Fragment>
  </>;
}
