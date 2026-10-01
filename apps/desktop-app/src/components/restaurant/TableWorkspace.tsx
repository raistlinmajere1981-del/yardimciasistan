import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  DesktopCustomerMutationResult,
  DesktopDashboardData,
  DesktopIdentityImageAnalyzeResult,
  DesktopStatusUpdateResult,
  DesktopTableOrder,
  SaveCustomerInput,
  SaveManualRestaurantReservationInput
} from "../../../electron/database";
import { WorkspacePageFrame } from "../workspace/WorkspaceFrame";
import { useWorkspaceCloseGuard, useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import { OperationPanel } from "../workspace/OperationPanel";
import type { TableWorkspaceIntent } from "../workspace/workspace-intent";
import { ActionButton } from "../ui/ActionButton";
import { ChoiceChips } from "../ui/ChoiceChips";
import { StatusBadge } from "../ui/StatusBadge";
import { ResourceWorkspaceSummary } from "../operations/ResourceWorkspaceSummary";
import { ManualRestaurantReservationEditor } from "../operations/ManualRestaurantReservationEditor";
import { CustomerCreateEditor } from "../customers/CustomerCreateEditor";
import { getTableCardModel } from "./table-card-model";
import { TableOrderEditor } from "./TableOrderEditor";
import { TableAccountPanel, TableCancelOrderAction } from "./TableAccountPanel";
import { TableRelationsPanel } from "./TableRelationsPanel";
import { useTableOrderController } from "./use-table-order-controller";
import { formatMoney, getOrderCurrency, getOrderBadge, formatTableStatus, getResourceStatusTone, getTableStatusAction } from "./table-presentation";

export function TableWorkspace({ intent, data, ordersEnabled, menuEnabled, inventoryEnabled = true, customersEnabled, reservationsEnabled,
  roomFolioTransferEnabled, onDashboardDataChanged, onUpdateTableStatus, aiEnabled, onSaveCustomer, onAnalyzeIdentity, onSaveReservation }: {
  onUpdateTableStatus: (tableId: string, status: string) => Promise<DesktopStatusUpdateResult>;
  aiEnabled: boolean;
  onSaveCustomer: (input: SaveCustomerInput) => Promise<DesktopCustomerMutationResult>;
  onAnalyzeIdentity: (file: File) => Promise<DesktopIdentityImageAnalyzeResult>;
  onSaveReservation: (input: SaveManualRestaurantReservationInput) => Promise<DesktopStatusUpdateResult>;
  intent: TableWorkspaceIntent; data: DesktopDashboardData;
  ordersEnabled: boolean; menuEnabled: boolean; inventoryEnabled?: boolean; customersEnabled: boolean; reservationsEnabled: boolean;
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
  const [quickAction, setQuickAction] = useState<"customer" | "reservation" | null>(null);
  const [quickCustomerId, setQuickCustomerId] = useState("");
  const [returnRequested, setReturnRequested] = useState(false);
  const [transferCommitted, setTransferCommitted] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const blocked = useWorkspaceCloseGuard({ busy: controller.busy, dirty: controller.dirty, scope: { entityType: "table", entityId: intent.entityId } });
  const table = data.tables.find(item => item.id === intent.entityId);
  const order = controller.active;
  useEffect(() => { if (returnRequested && !blocked) navigation.closeWorkspace({ entityType: "table", entityId: intent.entityId }); }, [returnRequested, blocked, navigation]);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  useLayoutEffect(() => {
    if (history) return;
    const target = intent.mode === "customer" ? '#table-account [aria-label="Müşteri ve konaklama"]' : "#table-account";
    const panel = intent.mode === "account" || intent.mode === "customer" || intent.action === "room-transfer"
      ? surface.current?.querySelector<HTMLElement>(target) : null;
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
    if (controller.loading || !controller.loaded) { navigation.closeWorkspace({ entityType: "table", entityId: intent.entityId }); return; }
    if (await controller.run(async () => true)) setReturnRequested(true);
  }
  async function closeTableOrder(status: "paid" | "cancelled") {
    if (await controller.closeTableOrder(status)) setReturnRequested(true);
  }
  async function transferTableOrderToRoomFolio(folioId: string) {
    if (!order || !roomFolioTransferEnabled || order.total <= 0 || transferCommitted) return;
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
  if (!table) return <WorkspacePageFrame title="Masa kullanılamıyor" onClose={() => navigation.closeWorkspace({ entityType: "table", entityId: intent.entityId })}><p>Masa kaydı bulunamadı.</p></WorkspacePageFrame>;
  const cardModel = getTableCardModel(table, data.tableOperations?.find(item => item.tableId === table.id),
    { ordersEnabled, menuEnabled, reservationsEnabled }, new Date().toLocaleDateString("sv-SE"));
  const canStart = cardModel.quickAction?.kind === "start";
  const duration = order ? Math.max(0, Math.floor((clock - new Date(order.openedAt).getTime()) / 60_000)) : 0;
  const disabled = controller.busy || controller.loading || !controller.loaded || transferCommitted;
  const tableStatus = getTableStatusAction(table.status) || table.status;
  const accountPanel = <OperationPanel title="Hesap ve İlişkiler" id="table-account" className="operation-panel--table-context">
    <TableAccountPanel
      table={table}
      controller={controller}
      disabled={disabled}
      onCloseOrder={status => void closeTableOrder(status)}
    />
    <TableRelationsPanel
      table={table}
      data={data}
      controller={controller}
      disabled={disabled}
      customersEnabled={customersEnabled}
      reservationsEnabled={reservationsEnabled}
      roomFolioTransferEnabled={roomFolioTransferEnabled}
      quickCustomerId={quickCustomerId}
      onCreateCustomer={() => setQuickAction("customer")}
      onCreateReservation={() => setQuickAction("reservation")}
      onTransfer={folioId => void transferTableOrderToRoomFolio(folioId)}
    />
  </OperationPanel>;
  return <WorkspacePageFrame title={table.name} className="operations-workspace" closeLabel="Masa çalışma alanını kapat"
    onClose={() => void requestReturn()} closeBlocked={controller.busy || Boolean(quickAction)} bodyScroll="panes"
    context={history && <div className="table-workspace-context"><span>{table.area || "Genel"}</span>
      <StatusBadge tone={getResourceStatusTone(table.status)}>{formatTableStatus(table.status)}</StatusBadge>
      {order && <StatusBadge tone={getOrderBadge(order.status).tone}>{getOrderBadge(order.status).label}</StatusBadge>}
    </div>}
    actions={<>
      {!history && order && <TableCancelOrderAction
        table={table}
        order={order}
        disabled={disabled}
        onCancelOrder={() => void closeTableOrder("cancelled")}
      />}
      {ordersEnabled && <ActionButton variant="ghost" disabled={controller.busy} onClick={() => {
        setQuickAction(null);
        navigation.updateWorkspaceMode({ entityType: "table", mode: history ? "order" : "history" });
      }}>{history ? "← Masaya dön" : "Geçmiş"}</ActionButton>}
    </>}
    headerSummary={!history && <ResourceWorkspaceSummary label="Masa özeti" imageSrc="./assets/default-table.png"
      facts={<>
        <strong>{table.name}</strong>
        <span>{table.capacity} kişilik</span>
        {order ? <ChoiceChips
          className="workspace-status-chips"
          ariaLabel="Sipariş durumu"
          value={order.status}
          disabled={disabled}
          onChange={value => {
            if (value !== "open") void controller.status(value as "preparing" | "served" | "payment");
          }}
          options={[
            { id: "open", label: "Açık", disabled: order.status !== "open" },
            { id: "preparing", label: "Hazırlanıyor" },
            { id: "served", label: "Servis edildi" },
            { id: "payment", label: "Hesap bekliyor" }
          ]}
        /> : <ChoiceChips
          className="workspace-status-chips"
          ariaLabel={`${table.name} durumunu değiştir`}
          value={tableStatus}
          disabled={disabled}
          onChange={value => {
            if (value === tableStatus) return;
            void controller.run(async isCurrent => {
              const result = await onUpdateTableStatus(table.id, value);
              if (!isCurrent()) return false;
              controller.feedback(result.message, !result.ok);
              return result.ok;
            });
          }}
          options={[
            ...(!["available", "occupied", "reserved", "bill_waiting", "cleaning"].includes(tableStatus)
              ? [{ id: tableStatus, label: formatTableStatus(table.status), disabled: true }]
              : []),
            { id: "available", label: "Boş" },
            { id: "occupied", label: "Dolu" },
            ...(reservationsEnabled ? [{ id: "reserved", label: "Rezerve" }] : []),
            ...(ordersEnabled ? [{ id: "bill_waiting", label: "Hesap" }] : []),
            { id: "cleaning", label: "Temizlik" }
          ]}
        />}
      </>}
      status={null}>
      {!ordersEnabled ? <span>Sipariş yönetimi etkin değil.</span> : controller.loading ? <span>Adisyon yükleniyor…</span> : !controller.loaded ? <span>Adisyon bilgisi alınamadı.</span>
        : order ? <span>{order.itemCount} ürün · {duration} dk · {formatMoney(order.total, getOrderCurrency(order))}</span>
          : <span>Aktif adisyon yok.</span>}
    </ResourceWorkspaceSummary>}
    footer={(controller.dirty || transferCommitted) && <div className="table-workspace-feedback">
      {controller.dirty && <ActionButton variant="secondary" disabled={controller.busy} onClick={() => void controller.run(async () => true)}>Notları Kaydet</ActionButton>}
      {transferCommitted && <ActionButton variant="secondary" disabled={controller.busy} onClick={() => void controller.run(async isCurrent => {
        const [nextOrders, dashboard] = await Promise.all([window.yardimciDesktop!.listTableOrders(), window.yardimciDesktop!.getDashboardData()]);
        if (!isCurrent()) return false;
        const transferred = nextOrders.find(item => item.id === controller.order?.id);
        if (transferred) onOrderChanged(transferred);
        onDashboardDataChanged(dashboard); setReturnRequested(true); return true;
      })}>Görünümü Yenile</ActionButton>}
    </div>}
    overlay={!history && quickAction ? <>
      {quickAction === "customer" && <CustomerCreateEditor
        open
        withinWorkspace
        aiEnabled={aiEnabled}
        onClose={() => setQuickAction(null)}
        onSave={onSaveCustomer}
        onAnalyzeIdentity={onAnalyzeIdentity}
        onCreated={customerId => setQuickCustomerId(customerId)}
      />}
      {quickAction === "reservation" && <ManualRestaurantReservationEditor
        open
        embedded
        customers={data.customers}
        tables={data.tables}
        initialTableId={table.id}
        onClose={() => setQuickAction(null)}
        onSave={onSaveReservation}
        onSaveCustomer={onSaveCustomer}
      />}
    </> : undefined}>
    <div ref={surface} className={`operation-surface operation-surface--sections operation-surface--table${!ordersEnabled || !menuEnabled ? " operation-surface--two" : ""}`} hidden={history}>
      {ordersEnabled ? <TableOrderEditor menu={data.menu} webModuleUrl={data.webModuleUrl} menuEnabled={menuEnabled} inventoryEnabled={inventoryEnabled} canStartOrder={canStart} controller={controller} readOnly={transferCommitted} accountPanel={accountPanel} />
        : <><OperationPanel title="Masa İşlemleri"><p>Sipariş yönetimi etkin değil. Masa hazırlığını sağdaki panelden yönetebilirsiniz.</p></OperationPanel>{accountPanel}</>}
    </div>
    {history && <section className="operation-history form-stack" aria-label="Masa geçmişi">
      {historyError && <p role="alert">{historyError}</p>}<h3>Kapanan adisyonlar</h3><p>Bu masanın kayıtlı adisyonları gösterilir; tam işlem günlüğü değildir.</p>
      {orders.filter(item => item.tableId === table.id && ["paid", "cancelled"].includes(item.status)).map(item => <article className="table-history-record" key={item.id}>
        <StatusBadge tone={getOrderBadge(item.status).tone}>{getOrderBadge(item.status).label}</StatusBadge>{" "}
        <span>{new Date(item.closedAt).toLocaleString("tr-TR")} · {formatMoney(item.total, getOrderCurrency(item))}</span>
      </article>)}
    </section>}
  </WorkspacePageFrame>;
}
