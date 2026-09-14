import { Minus, Plus, ReceiptText, Search, Trash2, UtensilsCrossed, X } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { PublishedQrMenu } from "@yardimci-asistan/sync-core";
import type {
  DesktopDashboardData,
  DesktopTableOrder,
  DesktopTableOrderResult,
  TableOrderStatus
} from "../../../electron/database";
import { ActionButton } from "../ui/ActionButton";
import { StatusBadge, type StatusTone } from "../ui/StatusBadge";

const ACTIVE_ORDER_STATUSES: TableOrderStatus[] = ["open", "preparing", "served", "payment"];

interface TableOrdersWorkspaceProps {
  tables: DesktopDashboardData["tables"];
  menu: PublishedQrMenu;
  orders: DesktopTableOrder[];
  ordersEnabled: boolean;
  reservationsEnabled: boolean;
  menuEnabled: boolean;
  onOrderChanged: (order: DesktopTableOrder) => void;
  onDashboardDataChanged: (data: DesktopDashboardData) => void;
  onUpdateStatus: (tableId: string, status: string) => void;
}

interface DrawerRequestContext {
  generation: number;
  tableId: string;
}

export function TableOrdersWorkspace({
  tables,
  menu,
  orders,
  ordersEnabled,
  reservationsEnabled,
  menuEnabled,
  onOrderChanged,
  onDashboardDataChanged,
  onUpdateStatus
}: TableOrdersWorkspaceProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<DesktopDashboardData["tables"][number] | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<DesktopTableOrder | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [busyAction, setBusyAction] = useState("");
  const [feedback, setFeedback] = useState("Ürün ve adet değişiklikleri otomatik kaydedilir.");
  const [cardFeedback, setCardFeedback] = useState("");
  const selectionRef = useRef({ generation: 0, tableId: "" });
  const busyGenerationRef = useRef(0);
  const selectedOrderRef = useRef<DesktopTableOrder | null>(null);
  const noteDraftsRef = useRef<Record<string, string>>({});
  const dirtyNoteIdsRef = useRef(new Set<string>());
  const noteSavePromisesRef = useRef(new Map<string, Promise<boolean>>());

  const activeOrdersByTable = useMemo(() => {
    const activeOrders = new Map<string, DesktopTableOrder>();
    for (const order of orders) {
      if (ACTIVE_ORDER_STATUSES.includes(order.status) && !activeOrders.has(order.tableId)) {
        activeOrders.set(order.tableId, order);
      }
    }
    return activeOrders;
  }, [orders]);

  const tableGroups = useMemo(() => {
    const groups = new Map<string, {
      name: string;
      tables: DesktopDashboardData["tables"];
    }>();
    for (const table of tables) {
      const name = table.area.trim() || "Genel";
      const key = name.toLocaleLowerCase("tr-TR");
      const group = groups.get(key);
      if (group) {
        group.tables.push(table);
      } else {
        groups.set(key, { name, tables: [table] });
      }
    }
    return [...groups.values()];
  }, [tables]);

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

  const closeDrawerOnEscape = useEffectEvent(() => {
    void requestCloseDrawer();
  });

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDrawerOnEscape();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen]);

  async function openOrderDrawer(table: DesktopDashboardData["tables"][number]) {
    const knownOrder = activeOrdersByTable.get(table.id) ?? null;
    const context = {
      generation: selectionRef.current.generation + 1,
      tableId: table.id
    };
    selectionRef.current = context;
    setSelectedTable(table);
    setSelectedOrder(knownOrder);
    selectedOrderRef.current = knownOrder;
    resetNoteState(knownOrder);
    setSelectedCategoryId("all");
    setSearchQuery("");
    setFeedback(knownOrder ? "Aktif adisyon yüklendi." : "Yeni adisyon açılıyor...");
    setDrawerOpen(true);

    const bridge = window.yardimciDesktop;
    if (!bridge) {
      setFeedback("Masa siparişi yalnızca masaüstü uygulamasında kullanılabilir.");
      return;
    }

    const busyGeneration = startBusyAction("open");
    try {
      if (knownOrder) {
        if (typeof bridge.getActiveTableOrder === "function") {
          const freshOrder = await bridge.getActiveTableOrder(table.id);
          if (freshOrder) {
            handleResult({ ok: true, message: "Aktif adisyon yüklendi.", order: freshOrder }, context);
            return;
          }
        }
      }

      if (typeof bridge.openTableOrder !== "function") {
        if (isCurrentContext(context)) {
          setFeedback("Masa siparişi köprüsü hazır değil. Uygulamayı yeniden başlatın.");
        }
        return;
      }
      const result = await bridge.openTableOrder(table.id);
      handleResult(result, context);
    } catch {
      if (isCurrentContext(context)) {
        setFeedback("Adisyon açılamadı. Yerel veritabanını kontrol edip yeniden deneyin.");
      }
    } finally {
      finishBusyAction(busyGeneration);
    }
  }

  function getCurrentContext(): DrawerRequestContext {
    return { ...selectionRef.current };
  }

  function isCurrentContext(context: DrawerRequestContext) {
    return selectionRef.current.generation === context.generation
      && selectionRef.current.tableId === context.tableId;
  }

  function startBusyAction(action: string) {
    const generation = busyGenerationRef.current + 1;
    busyGenerationRef.current = generation;
    setBusyAction(action);
    return generation;
  }

  function finishBusyAction(generation: number) {
    if (busyGenerationRef.current === generation) {
      setBusyAction("");
    }
  }

  function syncNoteDrafts(order: DesktopTableOrder, preserveDirty: boolean) {
    const previousDrafts = noteDraftsRef.current;
    const itemIds = new Set(order.items.map((item) => item.id));
    for (const dirtyId of dirtyNoteIdsRef.current) {
      if (!itemIds.has(dirtyId)) {
        dirtyNoteIdsRef.current.delete(dirtyId);
      }
    }
    const nextDrafts = Object.fromEntries(order.items.map((item) => [
      item.id,
      preserveDirty && dirtyNoteIdsRef.current.has(item.id)
        ? previousDrafts[item.id] ?? item.note
        : item.note
    ]));
    noteDraftsRef.current = nextDrafts;
    setNoteDrafts(nextDrafts);
  }

  function resetNoteState(order: DesktopTableOrder | null) {
    dirtyNoteIdsRef.current.clear();
    noteSavePromisesRef.current.clear();
    const drafts = order ? Object.fromEntries(order.items.map((item) => [item.id, item.note])) : {};
    noteDraftsRef.current = drafts;
    setNoteDrafts(drafts);
  }

  function applyOrder(
    order: DesktopTableOrder,
    context: DrawerRequestContext,
    preserveDirty = true,
    dashboardData?: DesktopDashboardData
  ) {
    onOrderChanged(order);
    if (dashboardData) {
      onDashboardDataChanged(dashboardData);
    }
    if (!isCurrentContext(context) || order.tableId !== context.tableId) {
      return false;
    }
    setSelectedOrder(order);
    selectedOrderRef.current = order;
    syncNoteDrafts(order, preserveDirty);
    return true;
  }

  function handleResult(result: DesktopTableOrderResult, context: DrawerRequestContext, closeAfter = false) {
    if (!isCurrentContext(context)) {
      if (result.ok) {
        onOrderChanged(result.order);
        if (result.dashboardData) {
          onDashboardDataChanged(result.dashboardData);
        }
      }
      return false;
    }

    setFeedback(result.message);
    if (!result.ok) {
      return false;
    }

    if (result.order.tableId !== context.tableId) {
      onOrderChanged(result.order);
      setFeedback("Adisyon yanıtı seçili masayla eşleşmedi; işlem yenilenmeli.");
      return false;
    }

    applyOrder(result.order, context, true, result.dashboardData);
    if (closeAfter) {
      closeDrawerImmediately();
    }
    return true;
  }

  function closeDrawerImmediately() {
    selectionRef.current = {
      generation: selectionRef.current.generation + 1,
      tableId: ""
    };
    busyGenerationRef.current += 1;
    setBusyAction("");
    setDrawerOpen(false);
    setSelectedTable(null);
    setSelectedOrder(null);
    selectedOrderRef.current = null;
    resetNoteState(null);
  }

  async function persistItemNote(itemId: string, context: DrawerRequestContext): Promise<boolean> {
    if (!dirtyNoteIdsRef.current.has(itemId)) {
      return true;
    }

    const existingPromise = noteSavePromisesRef.current.get(itemId);
    if (existingPromise) {
      return existingPromise;
    }

    const bridge = window.yardimciDesktop;
    if (!bridge || typeof bridge.updateTableOrderItemNote !== "function") {
      if (isCurrentContext(context)) {
        setFeedback("Ürün notu kaydedilemedi.");
      }
      return false;
    }

    const draft = noteDraftsRef.current[itemId] ?? "";
    const savePromise = (async () => {
      try {
        const result = await bridge.updateTableOrderItemNote(itemId, draft);
        if (!result.ok) {
          if (isCurrentContext(context)) {
            setFeedback(result.message);
          }
          return false;
        }

        if ((noteDraftsRef.current[itemId] ?? "").trim() === draft.trim()) {
          dirtyNoteIdsRef.current.delete(itemId);
        }
        applyOrder(result.order, context, true, result.dashboardData);
        if (isCurrentContext(context)) {
          setFeedback(result.message);
        }
        return true;
      } catch {
        if (isCurrentContext(context)) {
          setFeedback("Ürün notu kaydedilemedi.");
        }
        return false;
      }
    })();

    noteSavePromisesRef.current.set(itemId, savePromise);
    try {
      return await savePromise;
    } finally {
      if (noteSavePromisesRef.current.get(itemId) === savePromise) {
        noteSavePromisesRef.current.delete(itemId);
      }
    }
  }

  async function flushDirtyNotes(context: DrawerRequestContext): Promise<boolean> {
    for (let pass = 0; pass < 4; pass += 1) {
      if (dirtyNoteIdsRef.current.size === 0) {
        return true;
      }
      const order = selectedOrderRef.current;
      if (!order || !isCurrentContext(context)) {
        return false;
      }
      const itemIds = order.items
        .map((item) => item.id)
        .filter((itemId) => dirtyNoteIdsRef.current.has(itemId));
      if (itemIds.length === 0) {
        return true;
      }
      const results = await Promise.all(itemIds.map((itemId) => persistItemNote(itemId, context)));
      if (results.some((ok) => !ok)) {
        return false;
      }
    }

    return !selectedOrderRef.current?.items.some((item) => dirtyNoteIdsRef.current.has(item.id));
  }

  async function requestCloseDrawer() {
    const context = getCurrentContext();
    if (!context.tableId) {
      return;
    }
    const busyGeneration = startBusyAction("notes:flush");
    try {
      if (await flushDirtyNotes(context) && isCurrentContext(context)) {
        closeDrawerImmediately();
      }
    } finally {
      finishBusyAction(busyGeneration);
    }
  }

  async function addMenuItem(menuItemId: string) {
    const bridge = window.yardimciDesktop;
    const menuItem = menu.items.find((item) => item.id === menuItemId);
    if (menuItem && menuItem.stock_quantity !== null && menuItem.stock_quantity < menuStockConsumption(menuItem.stock_consumption_quantity)) {
      setFeedback("Bu ürün stokta yeterli değil.");
      return;
    }
    if (!selectedOrderRef.current || !bridge || typeof bridge.addTableOrderItem !== "function") {
      setFeedback("Ürün eklemek için aktif bir masa adisyonu gerekli.");
      return;
    }

    const context = getCurrentContext();
    const busyGeneration = startBusyAction(`add:${menuItemId}`);
    try {
      if (!await flushDirtyNotes(context) || !isCurrentContext(context)) {
        return;
      }
      const orderId = selectedOrderRef.current?.id;
      if (!orderId) {
        return;
      }
      handleResult(await bridge.addTableOrderItem(orderId, menuItemId, 1, ""), context);
    } catch {
      if (isCurrentContext(context)) {
        setFeedback("Ürün adisyona eklenemedi.");
      }
    } finally {
      finishBusyAction(busyGeneration);
    }
  }

  async function changeItemQuantity(itemId: string, quantity: number) {
    const bridge = window.yardimciDesktop;
    if (!bridge || typeof bridge.updateTableOrderItemQuantity !== "function") {
      setFeedback("Adet güncelleme işlemi hazır değil.");
      return;
    }

    const context = getCurrentContext();
    const busyGeneration = startBusyAction(`quantity:${itemId}`);
    try {
      if (!await flushDirtyNotes(context) || !isCurrentContext(context)) {
        return;
      }
      handleResult(await bridge.updateTableOrderItemQuantity(itemId, quantity), context);
    } catch {
      if (isCurrentContext(context)) {
        setFeedback("Ürün adedi güncellenemedi.");
      }
    } finally {
      finishBusyAction(busyGeneration);
    }
  }

  async function removeItem(itemId: string) {
    const bridge = window.yardimciDesktop;
    if (!bridge || typeof bridge.removeTableOrderItem !== "function") {
      setFeedback("Satır silme işlemi hazır değil.");
      return;
    }

    const context = getCurrentContext();
    const busyGeneration = startBusyAction(`remove:${itemId}`);
    try {
      if (!await flushDirtyNotes(context) || !isCurrentContext(context)) {
        return;
      }
      handleResult(await bridge.removeTableOrderItem(itemId), context);
    } catch {
      if (isCurrentContext(context)) {
        setFeedback("Ürün adisyondan kaldırılamadı.");
      }
    } finally {
      finishBusyAction(busyGeneration);
    }
  }

  async function saveItemNote(itemId: string, currentNote: string) {
    const nextNote = noteDraftsRef.current[itemId] ?? "";
    if (nextNote.trim() === currentNote.trim()) {
      dirtyNoteIdsRef.current.delete(itemId);
      return;
    }
    await persistItemNote(itemId, getCurrentContext());
  }

  async function updateOrderStatus(status: "preparing" | "served" | "payment") {
    const bridge = window.yardimciDesktop;
    if (!selectedOrderRef.current || !bridge || typeof bridge.updateTableOrderStatus !== "function") {
      setFeedback("Adisyon durumu güncellenemedi.");
      return;
    }

    const context = getCurrentContext();
    const busyGeneration = startBusyAction(`status:${status}`);
    try {
      if (!await flushDirtyNotes(context) || !isCurrentContext(context)) {
        return;
      }
      const orderId = selectedOrderRef.current?.id;
      if (!orderId) {
        return;
      }
      handleResult(await bridge.updateTableOrderStatus(orderId, status), context);
    } catch {
      if (isCurrentContext(context)) {
        setFeedback("Adisyon durumu güncellenemedi.");
      }
    } finally {
      finishBusyAction(busyGeneration);
    }
  }

  async function closeOrder(status: "paid" | "cancelled") {
    const bridge = window.yardimciDesktop;
    if (!selectedOrderRef.current || !bridge || typeof bridge.closeTableOrder !== "function") {
      setFeedback("Adisyon kapatılamadı.");
      return;
    }

    const context = getCurrentContext();
    const busyGeneration = startBusyAction(`close:${status}`);
    try {
      if (!await flushDirtyNotes(context) || !isCurrentContext(context)) {
        return;
      }
      const orderId = selectedOrderRef.current?.id;
      if (!orderId) {
        return;
      }
      handleResult(await bridge.closeTableOrder(orderId, status), context, true);
    } catch {
      if (isCurrentContext(context)) {
        setFeedback("Adisyon kapatılamadı.");
      }
    } finally {
      finishBusyAction(busyGeneration);
    }
  }

  async function runCardOrderAction(order: DesktopTableOrder, action: "payment" | "paid") {
    const bridge = window.yardimciDesktop;
    if (!bridge) {
      setCardFeedback("Adisyon işlemi yalnızca masaüstü uygulamasında kullanılabilir.");
      return;
    }
    if (action === "payment" && typeof bridge.updateTableOrderStatus !== "function") {
      setCardFeedback("Hesap bekliyor işlemi hazır değil.");
      return;
    }
    if (action === "paid" && typeof bridge.closeTableOrder !== "function") {
      setCardFeedback("Adisyon kapatma işlemi hazır değil.");
      return;
    }

    const busyGeneration = startBusyAction(`card:${order.id}:${action}`);
    try {
      const result = action === "payment"
        ? await bridge.updateTableOrderStatus(order.id, "payment")
        : await bridge.closeTableOrder(order.id, "paid");
      setCardFeedback(result.message);
      if (result.ok) {
        onOrderChanged(result.order);
        if (result.dashboardData) {
          onDashboardDataChanged(result.dashboardData);
        }
      }
    } catch {
      setCardFeedback(action === "payment"
        ? "Adisyon hesap bekliyor durumuna alınamadı."
        : "Adisyon kapatılamadı.");
    } finally {
      finishBusyAction(busyGeneration);
    }
  }

  function renderTableCard(table: DesktopDashboardData["tables"][number]) {
    const activeOrder = ordersEnabled ? activeOrdersByTable.get(table.id) : undefined;
    const manualTableStatus = getTableStatusAction(table.status) || table.status;
    const tableStatusLabel = formatTableStatus(table.status);
    const orderBadge = activeOrder ? getOrderBadge(activeOrder.status) : null;
    const knownManualStatuses = ["available", "occupied", "reserved", "bill_waiting"];
    return (
      <article className="compact-card resource-compact-card table-compact-card" key={table.id}>
        <div className="resource-card-heading">
          <div><h2>{table.name}</h2></div>
          <StatusBadge tone={getResourceStatusTone(table.status)}>
            {tableStatusLabel}
          </StatusBadge>
        </div>
        {activeOrder && orderBadge && (
          <div className="table-order-state-summary">
            <span>Masa: <strong>{tableStatusLabel}</strong></span>
            <span aria-hidden="true">·</span>
            <span>Adisyon: <strong className={`is-${orderBadge.tone}`}>{orderBadge.label}</strong></span>
          </div>
        )}
        <div className="compact-meta-row table-order-summary">
          {activeOrder ? (
            <>
              <span>{activeOrder.itemCount} ürün</span>
              <strong>{formatMoney(activeOrder.total, getOrderCurrency(activeOrder))}</strong>
            </>
          ) : (
            <>
              <span>{table.area || "Genel"}</span>
              <span>{table.capacity} kişi</span>
              {reservationsEnabled && <span>{table.activeReservationTitle || "Rezervasyon yok"}</span>}
            </>
          )}
        </div>
        <div className={`table-card-actions${activeOrder ? " has-active-order" : ""}`}>
          {ordersEnabled && (
            <button className="table-order-open-button" type="button" onClick={() => void openOrderDrawer(table)} disabled={Boolean(busyAction)}>
              <ReceiptText size={13} aria-hidden="true" />
              {activeOrder ? "Siparişi Aç" : "Sipariş Aç"}
            </button>
          )}
          {activeOrder ? (
            <div className="active-table-order-actions" aria-label={`${table.name} aktif adisyon işlemleri`}>
              {activeOrder.status === "payment" ? (
                <button className="is-close" type="button" onClick={() => void runCardOrderAction(activeOrder, "paid")} disabled={Boolean(busyAction)}>Ödendi / Kapat</button>
              ) : (
                <button type="button" onClick={() => void runCardOrderAction(activeOrder, "payment")} disabled={Boolean(busyAction)}>Hesap İste</button>
              )}
            </div>
          ) : (
            <label className="table-status-select">
              <span>Durum</span>
              <select
                aria-label={`${table.name} durumunu değiştir`}
                value={manualTableStatus}
                onChange={(event) => onUpdateStatus(table.id, event.target.value)}
              >
                {!knownManualStatuses.includes(manualTableStatus) && (
                  <option value={manualTableStatus}>{tableStatusLabel}</option>
                )}
                <option value="available">Boş</option>
                <option value="occupied">Dolu</option>
                {reservationsEnabled && <option value="reserved">Rezerve</option>}
                {ordersEnabled && <option value="bill_waiting">Hesap</option>}
              </select>
            </label>
          )}
        </div>
      </article>
    );
  }

  return (
    <>
      <section className="table-area-list" aria-label="Masa yönetimi">
        {tables.length === 0 && (
          <div className="panel empty-state">
            <UtensilsCrossed size={28} aria-hidden="true" />
            <strong>Masa kaydı yok.</strong>
            <p>Masa kategorilerini Temel Ayarlar bölümünden belirleyebilirsiniz.</p>
          </div>
        )}
        {tableGroups.map((group) => (
          <section className="table-area-group" key={group.name}>
            <header className="table-area-heading">
              <h3>{group.name}</h3>
              <span>{group.tables.length} masa</span>
            </header>
            <div className="operations-grid compact-resource-grid">
              {group.tables.map(renderTableCard)}
            </div>
          </section>
        ))}
      </section>
      <span className="table-order-live-feedback" role="status" aria-live="polite">{cardFeedback}</span>

      {ordersEnabled && drawerOpen && selectedTable && (
        <div className="table-order-backdrop overlay overlay--drawer" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget) {
            void requestCloseDrawer();
          }
        }}>
          <section className="table-order-drawer drawer drawer--wide" role="dialog" aria-modal="true" aria-labelledby="table-order-drawer-title">
            <header className="table-order-drawer-header overlay-header">
              <div>
                <span className="operation-panel-eyebrow">Yerel adisyon</span>
                <h2 id="table-order-drawer-title">Masa Siparişi — {selectedTable.name}</h2>
                <p>{selectedTable.area || "Genel"} • {selectedTable.capacity} kişi</p>
              </div>
              <div className="table-order-header-actions">
                {selectedOrder && (
                  <StatusBadge tone={getOrderBadge(selectedOrder.status).tone}>{getOrderBadge(selectedOrder.status).label}</StatusBadge>
                )}
                <button className="drawer-close-button" type="button" onClick={() => void requestCloseDrawer()} aria-label="Sipariş drawer'ını kapat">
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            </header>

            <div className="table-order-drawer-body">
              {menuEnabled && <section className="table-order-menu-pane" aria-labelledby="table-order-menu-title">
                <div className="table-order-pane-heading">
                  <div>
                    <h3 id="table-order-menu-title">Menüden Ekle</h3>
                    <span>{availableItems.length} aktif ürün</span>
                  </div>
                  <label className="table-order-search">
                    <Search size={15} aria-hidden="true" />
                    <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Ürün ara" aria-label="Sipariş için ürün ara" />
                  </label>
                </div>
                <div className="table-order-category-tabs" aria-label="Menü kategorileri">
                  <button className={selectedCategoryId === "all" ? "is-active" : undefined} type="button" onClick={() => setSelectedCategoryId("all")} aria-pressed={selectedCategoryId === "all"}>Tümü</button>
                  {activeCategories.map((category) => (
                    <button className={selectedCategoryId === category.id ? "is-active" : undefined} key={category.id} type="button" onClick={() => setSelectedCategoryId(category.id)} aria-pressed={selectedCategoryId === category.id}>{category.name}</button>
                  ))}
                </div>
                <div className="table-order-product-list">
                  {availableItems.length === 0 && <p className="table-order-empty">Aramanıza uyan aktif ve mevcut ürün bulunamadı.</p>}
                  {availableItems.map((item) => (
                    <article className="table-order-product-row" key={item.id}>
                      <div>
                        <span>{categoryNames.get(item.category_id) ?? "Menü"}</span>
                        <strong>{item.name}</strong>
                        {item.description && <small>{item.description}</small>}
                      </div>
                      <div className="table-order-product-action">
                        <strong>{formatMoney(item.price, item.currency || "TRY")}</strong>
                        <span>{formatOrderMenuStock(item.stock_quantity, item.stock_unit)}</span>
                        <button
                          type="button"
                          onClick={() => void addMenuItem(item.id)}
                          disabled={!selectedOrder || Boolean(busyAction) || (item.stock_quantity !== null && item.stock_quantity < menuStockConsumption(item.stock_consumption_quantity))}
                          aria-label={`${item.name} ürününü siparişe ekle`}
                        >
                          <Plus size={15} aria-hidden="true" /> Ekle
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>}

              <section className="table-order-ticket-pane" aria-labelledby="table-order-ticket-title">
                <div className="table-order-pane-heading ticket-heading">
                  <div>
                    <h3 id="table-order-ticket-title">Aktif Adisyon</h3>
                    <span>{selectedOrder?.itemCount ?? 0} ürün</span>
                  </div>
                  {selectedOrder && <small>{formatOpenedAt(selectedOrder.openedAt)} açıldı</small>}
                </div>
                <div className="table-order-item-list">
                  {!selectedOrder && <p className="table-order-empty">Adisyon hazırlanıyor...</p>}
                  {selectedOrder && selectedOrder.items.length === 0 && (
                    <p className="table-order-empty">{menuEnabled
                      ? "Henüz ürün eklenmedi. Soldaki aktif menüden ürün seçin."
                      : "Bu adisyonda henüz ürün yok."}</p>
                  )}
                  {selectedOrder?.items.map((item) => (
                    <article className="table-order-item-row" key={item.id}>
                      <div className="table-order-item-main">
                        <strong>{item.productName}</strong>
                        <span>{formatMoney(item.unitPrice, item.currency)} • {formatOrderItemStatus(item.status)}</span>
                      </div>
                      <strong className="table-order-line-total">{formatMoney(item.lineTotal, item.currency)}</strong>
                      <div className="table-order-quantity" aria-label={`${item.productName} adedi`}>
                        <button type="button" onClick={() => void changeItemQuantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1 || Boolean(busyAction)} aria-label={`${item.productName} adetini azalt`}><Minus size={14} aria-hidden="true" /></button>
                        <output>{item.quantity}</output>
                        <button
                          type="button"
                          onClick={() => void changeItemQuantity(item.id, item.quantity + 1)}
                          disabled={item.quantity >= 999 || Boolean(busyAction) || isOrderItemOutOfStock(item.menuItemId, menu)}
                          aria-label={`${item.productName} adetini artır`}
                        ><Plus size={14} aria-hidden="true" /></button>
                      </div>
                      <input
                        className="table-order-item-note"
                        value={noteDrafts[item.id] ?? ""}
                        onChange={(event) => {
                          const nextDrafts = { ...noteDraftsRef.current, [item.id]: event.target.value };
                          noteDraftsRef.current = nextDrafts;
                          dirtyNoteIdsRef.current.add(item.id);
                          setNoteDrafts(nextDrafts);
                        }}
                        onBlur={() => void saveItemNote(item.id, item.note)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.currentTarget.blur();
                          }
                        }}
                        placeholder="Ürün notu"
                        aria-label={`${item.productName} notu`}
                        maxLength={500}
                      />
                      <button className="table-order-remove-item" type="button" onClick={() => void removeItem(item.id)} disabled={Boolean(busyAction)} aria-label={`${item.productName} satırını sil`}><Trash2 size={15} aria-hidden="true" /></button>
                    </article>
                  ))}
                </div>
                <div className="table-order-total-box">
                  <div><span>Ara toplam</span><strong>{formatMoney(selectedOrder?.subtotal ?? 0, selectedOrder ? getOrderCurrency(selectedOrder) : "TRY")}</strong></div>
                  {(selectedOrder?.discountTotal ?? 0) > 0 && <div><span>İndirim</span><strong>-{formatMoney(selectedOrder?.discountTotal ?? 0, selectedOrder ? getOrderCurrency(selectedOrder) : "TRY")}</strong></div>}
                  <div className="table-order-grand-total"><span>Toplam</span><strong>{formatMoney(selectedOrder?.total ?? 0, selectedOrder ? getOrderCurrency(selectedOrder) : "TRY")}</strong></div>
                </div>
              </section>
            </div>

            <footer className="table-order-drawer-footer overlay-footer">
              <p className={feedback.includes("edilemedi") || feedback.includes("değil") ? "is-error" : ""} aria-live="polite">{busyAction ? "İşlem kaydediliyor..." : feedback}</p>
              <div className="table-order-footer-actions restaurant-service-actions">
                <label className="table-order-status-select">
                  <span>Sipariş durumu</span>
                  <select
                    value={selectedOrder?.status ?? "open"}
                    disabled={!selectedOrder || Boolean(busyAction)}
                    onChange={(event) => {
                      const nextStatus = event.target.value as "open" | "preparing" | "served" | "payment";
                      if (nextStatus !== "open" && nextStatus !== selectedOrder?.status) {
                        void updateOrderStatus(nextStatus);
                      }
                    }}
                  >
                    <option value="open" disabled>Açık</option>
                    <option value="preparing">Hazırlanıyor</option>
                    <option value="served">Servis Edildi</option>
                    <option value="payment">Hesap Bekliyor</option>
                  </select>
                </label>
                <ActionButton size="sm" onClick={() => void closeOrder("paid")} disabled={!selectedOrder || Boolean(busyAction)}>Ödendi / Kapat</ActionButton>
                <details className="table-order-more-actions">
                  <summary>Diğer</summary>
                  <div>
                    <ActionButton variant="danger" size="sm" onClick={() => void closeOrder("cancelled")} disabled={!selectedOrder || Boolean(busyAction)}>Adisyonu İptal Et</ActionButton>
                  </div>
                </details>
              </div>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}

function getOrderCurrency(order: DesktopTableOrder): string {
  return order.items[0]?.currency || "TRY";
}

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency || "TRY" }).format(value);
  } catch {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value);
  }
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

function formatOpenedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Şimdi";
  }
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function compareMenuRecords(a: { sort_order: number; name: string }, b: { sort_order: number; name: string }) {
  return a.sort_order - b.sort_order || a.name.localeCompare(b.name, "tr-TR");
}

function getOrderBadge(status: TableOrderStatus): { label: string; tone: StatusTone } {
  const badges: Record<TableOrderStatus, { label: string; tone: StatusTone }> = {
    open: { label: "Açık", tone: "info" },
    preparing: { label: "Hazırlanıyor", tone: "wait" },
    served: { label: "Servis edildi", tone: "ok" },
    payment: { label: "Hesap bekliyor", tone: "wait" },
    paid: { label: "Ödendi", tone: "ok" },
    cancelled: { label: "İptal", tone: "danger" }
  };
  return badges[status];
}

function formatOrderItemStatus(status: string): string {
  return {
    open: "Açık",
    preparing: "Hazırlanıyor",
    served: "Servis edildi",
    cancelled: "İptal"
  }[status] ?? status;
}

function getTableStatusAction(status: string) {
  if (["available", "empty", "vacant"].includes(status)) return "available";
  if (["occupied", "busy", "full"].includes(status)) return "occupied";
  if (["reserved", "reservation"].includes(status)) return "reserved";
  if (["bill_waiting", "waiting_bill", "checkout", "payment"].includes(status)) return "bill_waiting";
  return "";
}

function formatTableStatus(status: string) {
  const labels: Record<string, string> = {
    available: "Boş",
    empty: "Boş",
    vacant: "Boş",
    occupied: "Dolu",
    busy: "Dolu",
    full: "Dolu",
    reserved: "Rezerve",
    reservation: "Rezerve",
    bill_waiting: "Hesap",
    waiting_bill: "Hesap",
    checkout: "Hesap",
    payment: "Hesap",
    cleaning: "Temizlik"
  };
  return labels[status] ?? status;
}

function getResourceStatusTone(status: string): StatusTone {
  if (["available", "empty", "vacant", "ready", "completed", "done"].includes(status)) return "ok";
  if (["reserved", "pending", "waiting", "bill_waiting", "waiting_bill", "checkout", "payment"].includes(status)) return "wait";
  if (["occupied", "busy", "full", "in_progress", "preparing"].includes(status)) return "info";
  if (["cancelled", "rejected", "maintenance", "out_of_service"].includes(status)) return "danger";
  return "neutral";
}
