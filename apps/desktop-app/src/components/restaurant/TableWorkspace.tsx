import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DesktopDashboardData, DesktopTableOrder, DesktopStatusUpdateResult } from "../../../electron/database";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";
import { useWorkspaceCloseGuard, useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import { OperationPanel } from "../workspace/OperationPanel";
import type { TableWorkspaceIntent } from "../workspace/workspace-intent";
import { ActionButton } from "../ui/ActionButton";
import { StatusBadge } from "../ui/StatusBadge";
import { getTableCardModel } from "./table-card-model";
import { TableOrderEditor } from "./TableOrderEditor";
import { TableAccountPanel } from "./TableAccountPanel";
import { useTableOrderController } from "./use-table-order-controller";
import { formatMoney, getOrderCurrency, getOrderBadge, formatTableStatus, getResourceStatusTone } from "./table-presentation";

export function TableWorkspace({ intent, data, ordersEnabled, menuEnabled, customersEnabled, reservationsEnabled,
  roomFolioTransferEnabled, onDashboardDataChanged, onUpdateTableStatus }: {
  onUpdateTableStatus: (tableId: string, status: string) => Promise<DesktopStatusUpdateResult>;
  intent: TableWorkspaceIntent; data: DesktopDashboardData;
  ordersEnabled: boolean; menuEnabled: boolean; customersEnabled: boolean; reservationsEnabled: boolean;
  roomFolioTransferEnabled: boolean;
  onDashboardDataChanged: (data: DesktopDashboardData) => void;
}) {
  const navigation = useWorkspaceNavigation();
  const [orders, setOrders] = useState<DesktopTableOrder[]>([]);
  const onOrderChanged = (next: DesktopTableOrder) => setOrders(current => [next, ...current.filter(item => item.id !== next.id)]);
  const controller = useTableOrderController(intent.entityId, ordersEnabled, onOrderChanged, onDashboardDataChanged, data.revision, intent.orderId, customersEnabled);
  const history = ordersEnabled && intent.mode === "history";
  const surface = useRef<HTMLDivElement>(null);
  const historyRead = useRef(0);
  const [historyError, setHistoryError] = useState("");
  const [returnRequested, setReturnRequested] = useState(false);
  const [transferCommitted, setTransferCommitted] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const blocked = useWorkspaceCloseGuard({ busy: controller.busy, dirty: controller.dirty });
  const table = data.tables.find(item => item.id === intent.entityId);
  const order = controller.active;
  useEffect(() => { if (returnRequested && !blocked) navigation.closeWorkspace(); }, [returnRequested, blocked, navigation]);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  useLayoutEffect(() => {
    if (history) return;
    const panel = intent.mode === "account" || intent.mode === "customer" || intent.action === "room-transfer"
      ? surface.current?.querySelector<HTMLElement>("#table-account") : null;
    panel?.focus({ preventScroll: true }); panel?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (intent.action === "add-item" && menuEnabled) surface.current?.querySelector<HTMLInputElement>('input[aria-label="Sipariş için ürün ara"]')?.focus({ preventScroll: true });
  }, [history, intent.mode, intent.action, menuEnabled]);
  useEffect(() => {
    if (!history || !ordersEnabled) return;
    const request = ++historyRead.current;
    setHistoryError("");
    void window.yardimciDesktop!.listTableOrders().then(next => {
      if (request === historyRead.current) setOrders(next);
    }).catch(() => { if (request === historyRead.current) setHistoryError("Adisyon geçmişi okunamadı."); });
    return () => { historyRead.current++; };
  }, [history, ordersEnabled, data.revision]);
  async function requestReturn() {
    if (controller.busy) return;
    if (controller.loading || !controller.loaded) { navigation.closeWorkspace(); return; }
    if (await controller.run(async () => true)) setReturnRequested(true);
  }
  async function closeTableOrder(status: "paid" | "cancelled") {
    if (await controller.closeTableOrder(status)) setReturnRequested(true);
  }
  async function transferTableOrderToRoomFolio(folioId: string) {
    if (!order || !roomFolioTransferEnabled || order.status !== "payment" || order.total <= 0 || transferCommitted) return;
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
        setTransferCommitted(true);
      }
      return true;
    });
  }
  if (!table) return <WorkspaceFrame title="Masa kullanılamıyor" presentation={navigation.current!.presentation} onClose={() => navigation.closeWorkspace()}
    returnFocusRef={navigation.returnFocusRef}><p>Masa kaydı bulunamadı.</p></WorkspaceFrame>;
  const cardModel = getTableCardModel(table, data.tableOperations?.find(item => item.tableId === table.id),
    { ordersEnabled, menuEnabled, reservationsEnabled }, new Date().toLocaleDateString("sv-SE"));
  const canStart = cardModel.quickAction?.kind === "start";
  const duration = order ? Math.max(0, Math.floor((clock - new Date(order.openedAt).getTime()) / 60_000)) : 0;
  const disabled = controller.busy || controller.loading || !controller.loaded || transferCommitted;
  const startControl = <div className="restaurant-start form-stack">
    <h4>{canStart ? "Masa siparişe hazır" : "Masa hazırlığını kontrol edin"}</h4>
    <p>{canStart ? "Sipariş açarak bu masa için yeni bir adisyon başlatın." : "Bu masa şu an sipariş başlatmaya uygun değil."}</p>
    {canStart && <ActionButton disabled={disabled} onClick={() => void controller.startTableOrder()}>Sipariş Aç</ActionButton>}
  </div>;
  return <WorkspaceFrame title={table.name} className="operations-workspace" presentation={navigation.current!.presentation} closeLabel="Floor'a dön"
    onClose={() => void requestReturn()} closeBlocked={controller.busy} returnFocusRef={navigation.returnFocusRef} bodyScroll="panes"
    context={<div className="table-workspace-context"><span>{table.area || "Genel"}</span>
      <StatusBadge tone={getResourceStatusTone(table.status)}>{formatTableStatus(table.status)}</StatusBadge>
      {order && <StatusBadge tone={getOrderBadge(order.status).tone}>{getOrderBadge(order.status).label}</StatusBadge>}
    </div>}
    actions={ordersEnabled && <ActionButton variant="ghost" disabled={controller.busy} onClick={() => navigation.updateWorkspaceMode({ entityType: "table", mode: history ? "order" : "history" })}>{history ? "← Masaya dön" : "Geçmiş"}</ActionButton>}
    footer={(controller.dirty || transferCommitted) && <div className="table-workspace-feedback">
      {controller.dirty && <ActionButton variant="secondary" disabled={controller.busy} onClick={() => void controller.run(async () => true)}>Notları Kaydet</ActionButton>}
      {transferCommitted && <ActionButton variant="secondary" disabled={controller.busy} onClick={() => void controller.run(async isCurrent => {
        const [nextOrders, dashboard] = await Promise.all([window.yardimciDesktop!.listTableOrders(), window.yardimciDesktop!.getDashboardData()]);
        if (!isCurrent()) return false;
        const transferred = nextOrders.find(item => item.id === controller.order?.id);
        if (transferred) onOrderChanged(transferred);
        onDashboardDataChanged(dashboard); setReturnRequested(true); return true;
      })}>Görünümü Yenile</ActionButton>}
    </div>}>
    <div ref={surface} className={`operation-surface operation-surface--table${!ordersEnabled || !menuEnabled ? " operation-surface--two" : ""}`} hidden={history}>
      {ordersEnabled ? <TableOrderEditor menu={data.menu} webModuleUrl={data.webModuleUrl} menuEnabled={menuEnabled} controller={controller} readOnly={transferCommitted} startControl={startControl} />
        : <OperationPanel title="Masa İşlemleri"><p>Sipariş yönetimi etkin değil. Masa hazırlığını sağdaki panelden yönetebilirsiniz.</p></OperationPanel>}
      <OperationPanel title="Masa, Müşteri ve Hesap" id="table-account">
        <TableAccountPanel table={table} data={data} controller={controller} disabled={disabled} customersEnabled={customersEnabled}
          reservationsEnabled={reservationsEnabled} ordersEnabled={ordersEnabled} roomFolioTransferEnabled={roomFolioTransferEnabled}
          duration={duration} onCloseOrder={status => void closeTableOrder(status)} onTransfer={folioId => void transferTableOrderToRoomFolio(folioId)} onUpdateTableStatus={onUpdateTableStatus} />
      </OperationPanel>
    </div>
    {history && <section className="operation-history form-stack" aria-label="Masa geçmişi">
      {historyError && <p role="alert">{historyError}</p>}<h3>Kapanan adisyonlar</h3><p>Bu masanın kayıtlı adisyonları gösterilir; tam işlem günlüğü değildir.</p>
      {orders.filter(item => item.tableId === table.id && ["paid", "cancelled"].includes(item.status)).map(item => <article className="table-history-record" key={item.id}>
        <StatusBadge tone={getOrderBadge(item.status).tone}>{getOrderBadge(item.status).label}</StatusBadge>{" "}
        <span>{new Date(item.closedAt).toLocaleString("tr-TR")} · {formatMoney(item.total, getOrderCurrency(item))}</span>
      </article>)}
    </section>}
  </WorkspaceFrame>;
}
