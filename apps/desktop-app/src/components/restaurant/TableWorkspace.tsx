import { useEffect, useRef, useState } from "react";
import type { DesktopDashboardData, DesktopTableOrder, DesktopStatusUpdateResult } from "../../../electron/database";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";
import { useWorkspaceCloseGuard, useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import { WorkspaceTabs, WorkspaceTabList, WorkspaceTabPanel } from "../workspace/WorkspaceTabs";
import type { TableWorkspaceIntent } from "../workspace/workspace-intent";
import { ActionButton } from "../ui/ActionButton";
import { StatusBadge } from "../ui/StatusBadge";
import { TableOrderEditor } from "./TableOrderEditor";
import { TableRoomTransfer } from "./TableRoomTransfer";
import { useTableOrderController } from "./use-table-order-controller";
import { formatMoney, getOrderCurrency, getOrderBadge, formatTableStatus, getResourceStatusTone, getTableStatusAction } from "./table-presentation";

type Mode = NonNullable<TableWorkspaceIntent["mode"]>;
type Flow = "cancel" | "room-transfer" | null;
export function TableWorkspace({ intent, data, orders, ordersEnabled, menuEnabled, customersEnabled, reservationsEnabled,
  roomFolioTransferEnabled, onOrderChanged, onDashboardDataChanged, onUpdateTableStatus }: {
  onUpdateTableStatus: (tableId: string, status: string) => Promise<DesktopStatusUpdateResult>;
  intent: TableWorkspaceIntent; data: DesktopDashboardData; orders: DesktopTableOrder[];
  ordersEnabled: boolean; menuEnabled: boolean; customersEnabled: boolean; reservationsEnabled: boolean;
  roomFolioTransferEnabled: boolean; onOrderChanged: (order: DesktopTableOrder) => void;
  onDashboardDataChanged: (data: DesktopDashboardData) => void;
}) {
  const navigation = useWorkspaceNavigation();
  const controller = useTableOrderController(intent.entityId, ordersEnabled, onOrderChanged, onDashboardDataChanged);
  const [mode, setMode] = useState<Mode>(intent.mode ?? "order");
  const [flow, setFlow] = useState<Flow>(null);
  const [returnRequested, setReturnRequested] = useState(false);
  const [transferCommitted, setTransferCommitted] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const flowTitle = useRef<HTMLHeadingElement>(null);
  const blocked = useWorkspaceCloseGuard({ busy: controller.busy, dirty: controller.dirty });
  const table = data.tables.find(item => item.id === intent.entityId);
  const order = controller.active;
  const tabs: { id: Mode; label: string }[] = [{ id: "order", label: "Sipariş" },
    ...(customersEnabled ? [{ id: "customer" as const, label: "Müşteri" }] : []),
    ...(ordersEnabled ? [{ id: "account" as const, label: "Hesap" }, { id: "history" as const, label: "Geçmiş" }] : [])];
  const activeMode = tabs.some(tab => tab.id === mode) ? mode : "order";
  useEffect(() => { if (returnRequested && !blocked) navigation.closeWorkspace(); }, [returnRequested, blocked, navigation]);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  useEffect(() => { flowTitle.current?.focus(); }, [flow]);
  useEffect(() => {
    if (intent.action === "room-transfer" && roomFolioTransferEnabled && order?.status === "payment" && order.total > 0) setFlow("room-transfer");
    // An initial action is consumed once for the loaded order, not on every item refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent.action, order?.id, roomFolioTransferEnabled]);
  function finishFlow() {
    setFlow(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('dialog[open] [role="tab"][aria-selected="true"]')?.focus());
  }
  async function requestReturn() {
    if (controller.busy) return;
    if (controller.loading || !controller.loaded) { navigation.closeWorkspace(); return; }
    if (await controller.run(async () => true)) setReturnRequested(true);
  }
  async function closeTableOrder(status: "paid" | "cancelled") {
    if (await controller.closeTableOrder(status)) setReturnRequested(true);
  }
  async function transferTableOrderToRoomFolio(folioId: string) {
    if (!order || !roomFolioTransferEnabled) return;
    await controller.run(async isCurrent => {
      const bridge = window.yardimciDesktop!;
      const input = { folioId, kind: "manual_charge" as const,
        label: `Restoran · ${order.tableName || "Masa"}`, amountMinor: Math.round(order.total * 100),
        note: `Masa adisyonu · ${order.id}`, sourceTableOrderId: order.id };
      const result = await bridge.addRoomFolioManualItem(input);
      if (!isCurrent()) return false;
      controller.feedback(result.message, !result.ok);
      if (!result.ok) return false;
      // A committed transfer stays successful even if refreshing projections fails.
      try {
        const [nextOrders, dashboard] = await Promise.all([bridge.listTableOrders(), bridge.getDashboardData()]);
        if (!isCurrent()) return false;
        const transferred = nextOrders.find(item => item.id === order.id);
        if (transferred) onOrderChanged(transferred);
        onDashboardDataChanged(dashboard);
        setReturnRequested(true);
      } catch {
        if (!isCurrent()) return false;
        controller.feedback("Aktarım tamamlandı; masa görünümü yenilenemedi. Yenilemeden yeniden işlem yapmayın.", true);
        setFlow(null);
        setTransferCommitted(true);
      }
      return true;
    });
  }
  if (!table) return <WorkspaceFrame title="Masa kullanılamıyor" presentation={navigation.current!.presentation} onClose={() => navigation.closeWorkspace()}
    returnFocusRef={navigation.returnFocusRef}><p>Masa kaydı bulunamadı.</p></WorkspaceFrame>;
  const tableStatus = getTableStatusAction(table.status) || table.status;
  const relatedReservations = reservationsEnabled ? data.reservations.filter(item => item.tableIds.includes(table.id)
    && !["rejected", "cancelled", "completed"].includes(item.status)) : [];
  const customer = customersEnabled ? data.customers.find(item => item.id === table.currentCustomerId) : undefined;
  const currentReservation = relatedReservations.find(item => item.id === table.currentReservationId);
  const duration = order ? Math.max(0, Math.floor((clock - new Date(order.openedAt).getTime()) / 60_000)) : 0;
  const disabled = controller.busy || controller.loading || !controller.loaded || transferCommitted;
  return <WorkspaceTabs value={activeMode}>
    <WorkspaceFrame title={table.name} presentation={navigation.current!.presentation} closeLabel="Floor'a dön"
      onClose={() => void requestReturn()} closeBlocked={controller.busy} returnFocusRef={navigation.returnFocusRef}
      bodyScroll={activeMode === "order" && !flow ? "panes" : "body"}
      context={<div className="table-workspace-context">
        <span>{table.area || "Genel"}</span>
        <StatusBadge tone={getResourceStatusTone(table.status)}>{formatTableStatus(table.status)}</StatusBadge>
        <span>{currentReservation ? `${currentReservation.guestCount} kişi` : `${table.capacity} kişilik masa`}</span>
        {order && <><StatusBadge tone={getOrderBadge(order.status).tone}>{getOrderBadge(order.status).label}</StatusBadge><span>{duration} dk açık</span></>}
        {customer && <span>{customer.fullName}</span>}
        {order && <strong aria-label="Güncel toplam">{formatMoney(order.total, getOrderCurrency(order))}</strong>}
      </div>}
      actions={<>
        {ordersEnabled && !order && <ActionButton disabled={disabled || !table.isActive} onClick={() => void controller.startTableOrder()}>Sipariş Başlat</ActionButton>}
        {order && <ActionButton disabled={disabled} onClick={() => { setMode("account"); setFlow(null); }}>Hesaba Geç</ActionButton>}
        <details className="table-workspace-overflow"><summary>Diğer</summary><div className="form-stack">
          {order && <ActionButton variant="danger" size="sm" disabled={disabled} onClick={() => setFlow("cancel")}>Adisyonu İptal Et</ActionButton>}
          {!order && <label className="form-field">Masa durumu<select aria-label={`${table.name} durumunu değiştir`} value={tableStatus} disabled={disabled}
            onChange={event => { const status = event.target.value; void controller.run(async isCurrent => {
              const result = await onUpdateTableStatus(table.id, status);
              if (!isCurrent()) return false;
              controller.feedback(result.message, !result.ok); return result.ok;
            }); }}>
            {!["available", "occupied", "reserved", "bill_waiting", "cleaning"].includes(tableStatus) && <option value={tableStatus}>{formatTableStatus(table.status)}</option>}
            <option value="available">Boş</option><option value="occupied">Dolu</option>
            {reservationsEnabled && <option value="reserved">Rezerve</option>}
            {ordersEnabled && <option value="bill_waiting">Hesap</option>}<option value="cleaning">Temizlik</option>
          </select></label>}
        </div></details>
      </>}
      navigation={<WorkspaceTabList tabs={tabs} label="Masa çalışma alanı" onChange={next => {
        if (!controller.busy) { setMode(next); setFlow(null); }
      }} />}
      footer={<div className="table-workspace-feedback">
        <p role={controller.error ? "alert" : "status"}>{controller.busy ? "İşlem kaydediliyor..." : controller.loading ? "Adisyon yükleniyor..." : controller.message || "Ürün ve adet değişiklikleri otomatik kaydedilir."}</p>
        {transferCommitted && <ActionButton variant="secondary" disabled={controller.busy} onClick={() => void controller.run(async isCurrent => {
          const [nextOrders, dashboard] = await Promise.all([window.yardimciDesktop!.listTableOrders(), window.yardimciDesktop!.getDashboardData()]);
          if (!isCurrent()) return false;
          const transferred = nextOrders.find(item => item.id === controller.order?.id);
          if (transferred) onOrderChanged(transferred);
          onDashboardDataChanged(dashboard); setReturnRequested(true); return true;
        })}>Görünümü Yenile</ActionButton>}
        {controller.dirty && <ActionButton variant="secondary" disabled={controller.busy} onClick={() => void controller.run(async () => true)}>Notları Kaydet</ActionButton>}
      </div>}>
      {flow ? <section aria-label="Masa işlemi">
        <h3 ref={flowTitle} tabIndex={-1}>{flow === "cancel" ? "Adisyonu iptal et" : "Oda hesabına aktar"}</h3>
        {flow === "cancel" ? <><p>Adisyon iptal edilir ve ürün stokları geri yüklenir.</p>
          <ActionButton variant="danger" disabled={disabled} onClick={() => void closeTableOrder("cancelled")}>İptali Onayla</ActionButton>{" "}
          <ActionButton variant="secondary" disabled={controller.busy} onClick={finishFlow}>Vazgeç</ActionButton></>
          : order && roomFolioTransferEnabled && <TableRoomTransfer order={order} busy={controller.busy}
            onTransfer={folioId => void transferTableOrderToRoomFolio(folioId)} onCancel={finishFlow} />}
      </section> : <>
        <WorkspaceTabPanel value="order">
          {ordersEnabled ? <TableOrderEditor menu={data.menu} menuEnabled={menuEnabled} controller={controller} readOnly={transferCommitted} /> : <p>Sipariş yönetimi etkin değil. Masa durumunu Diğer üzerinden yönetebilirsiniz.</p>}
        </WorkspaceTabPanel>
        {customersEnabled && <WorkspaceTabPanel value="customer">
          <h3>Masa ile ilişkili müşteri</h3><p>{customer?.fullName || "Masaya bağlı müşteri yok."}</p>
          {relatedReservations.map(item => <article key={item.id}><h4>{item.customerName || item.title}</h4>
            <p>Rezervasyon · {item.startDate} {item.time} · {item.guestCount} kişi</p></article>)}
          {reservationsEnabled && <p>Müşteri ve masa seçimini Floor → Rezervasyonlar → Yeni Rezervasyon üzerinden yapabilirsiniz.</p>}
        </WorkspaceTabPanel>}
        {ordersEnabled && <WorkspaceTabPanel value="account">
          {order ? <div className="form-stack"><h3>Hesap</h3>
            <dl className="restaurant-order-totals"><div><dt>Ara toplam</dt><dd>{formatMoney(order.subtotal, getOrderCurrency(order))}</dd></div>
              {order.discountTotal > 0 && <div><dt>İndirim</dt><dd>{formatMoney(order.discountTotal, getOrderCurrency(order))}</dd></div>}
              <div><dt>Toplam</dt><dd>{formatMoney(order.total, getOrderCurrency(order))}</dd></div></dl>
            <label className="form-field">Sipariş durumu<select value={order.status} disabled={disabled}
              onChange={event => void controller.status(event.target.value as "preparing" | "served" | "payment")}>
              <option value="open" disabled>Açık</option><option value="preparing">Hazırlanıyor</option><option value="served">Servis Edildi</option><option value="payment">Hesap Bekliyor</option>
            </select></label>
            <p>Tahsilatı aldıktan sonra adisyonu ödendi olarak kapatın.</p>
            <div className="page-toolbar"><ActionButton disabled={disabled} onClick={() => void closeTableOrder("paid")}>Ödendi / Kapat</ActionButton>
              {roomFolioTransferEnabled && <ActionButton variant="secondary" disabled={disabled || order.status !== "payment" || order.total <= 0} onClick={() => setFlow("room-transfer")}>Odaya Yaz</ActionButton>}</div>
            {roomFolioTransferEnabled && order.status !== "payment" && <p>Odaya aktarmak için önce Hesap Bekliyor durumunu seçin.</p>}
          </div> : <p>Aktif adisyon yok.</p>}
        </WorkspaceTabPanel>}
        {ordersEnabled && <WorkspaceTabPanel value="history">
          <h3>Kapanan adisyonlar</h3><p>Bu masanın kayıtlı adisyonları gösterilir; tam işlem günlüğü değildir.</p>
          {orders.filter(item => item.tableId === table.id && ["paid", "cancelled"].includes(item.status)).map(item => <article className="table-history-record" key={item.id}>
            <StatusBadge tone={getOrderBadge(item.status).tone}>{getOrderBadge(item.status).label}</StatusBadge>{" "}
            <span>{new Date(item.closedAt).toLocaleString("tr-TR")} · {formatMoney(item.total, getOrderCurrency(item))}</span>
          </article>)}
        </WorkspaceTabPanel>}
      </>}
    </WorkspaceFrame>
  </WorkspaceTabs>;
}
