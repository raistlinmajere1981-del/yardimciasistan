import { useEffect, useState } from "react";
import type { DesktopDashboardData, DesktopStatusUpdateResult } from "../../../electron/database";
import { ActionButton } from "../ui/ActionButton";
import { ChoiceChips } from "../ui/ChoiceChips";
import { SearchSelect } from "../ui/SearchSelect";
import { useConfirmDialog } from "../ui/useConfirmDialog";
import { TableRoomTransfer } from "./TableRoomTransfer";
import { useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";
import type { useTableOrderController } from "./use-table-order-controller";
import { formatMoney, getOrderCurrency, formatTableStatus, getTableStatusAction } from "./table-presentation";

export function TableAccountPanel({ table, data, controller, disabled, customersEnabled, reservationsEnabled, ordersEnabled,
  roomFolioTransferEnabled, quickCustomerId, onCloseOrder, onTransfer, onUpdateTableStatus }: {
  table: DesktopDashboardData["tables"][number]; data: DesktopDashboardData; controller: ReturnType<typeof useTableOrderController>;
  disabled: boolean; customersEnabled: boolean; reservationsEnabled: boolean; ordersEnabled: boolean; roomFolioTransferEnabled: boolean;
  quickCustomerId?: string;
  onCloseOrder: (status: "paid" | "cancelled") => void; onTransfer: (folioId: string) => void;
  onUpdateTableStatus: (tableId: string, status: string) => Promise<DesktopStatusUpdateResult>;
}) {
  const { confirm, confirmDialog } = useConfirmDialog();
  const navigation = useWorkspaceNavigation();
  const [entryRoomId, setEntryRoomId] = useState("");
  const [entryRequested, setEntryRequested] = useState(false);
  useEffect(() => {
    if (!entryRequested || controller.busy || controller.dirty) return;
    setEntryRequested(false);
    navigation.openWorkspace({ entityType: "room", entityId: entryRoomId, mode: "stay", action: "create-stay", customerId: table.currentCustomerId,
      returnContext: { page: "restaurant", view: "floor", entityId: table.id } });
  }, [entryRequested, controller.busy, controller.dirty, entryRoomId, table.currentCustomerId, table.id, navigation]);
  const [customerDraft, setCustomerDraft] = useState<string | null>(null);
  useEffect(() => {
    if (quickCustomerId) setCustomerDraft(quickCustomerId);
  }, [quickCustomerId]);
  const order = controller.active;
  const relatedReservations = reservationsEnabled ? data.reservations.filter(item => item.tableIds.includes(table.id)
    && !["rejected", "cancelled", "completed"].includes(item.status)) : [];
  const customer = customersEnabled ? data.customers.find(item => item.id === table.currentCustomerId) : undefined;
  const customerStay = customer ? (data.roomOperations?.flatMap(room => room.stays) ?? data.customerRoomStays).find(stay => stay.status === "checked_in"
    && stay.guests?.some(guest => guest.customerId === customer.id && guest.status === "checked_in")) : undefined;
  const suggestedCustomerId = table.currentCustomerId || (reservationsEnabled
    ? data.reservations.find(item => item.id === table.currentReservationId)?.customerId : "") || "";
  const selectedCustomerId = customerDraft ?? (data.customers.some(item => item.id === suggestedCustomerId) ? suggestedCustomerId : "");
  async function assignCustomer(customerId: string) {
    if (!customersEnabled || disabled) return;
    if (await controller.assignTableCustomer(customerId)) setCustomerDraft(customerId);
  }
  const tableStatus = getTableStatusAction(table.status) || table.status;
  async function requestOrderClose(status: "paid" | "cancelled") {
    if (!order) return;
    const cancelling = status === "cancelled";
    const approved = await confirm({
      eyebrow: table.name,
      title: cancelling ? "Adisyonu iptal et" : "Hesabı kapat",
      description: cancelling
        ? "Adisyon iptal edilir ve ürün stokları geri yüklenir."
        : "Tahsilatın alındığını onayladığınızda adisyon ödendi olarak kapatılır.",
      confirmLabel: cancelling ? "Adisyonu İptal Et" : "Ödendi / Kapat",
      tone: cancelling ? "danger" : "warning",
      details: <dl className="operation-facts">
        <div><dt>Masa</dt><dd>{table.name} · {table.area || "Genel"}</dd></div>
        <div><dt>Ürün</dt><dd>{order.itemCount} adet</dd></div>
        <div><dt>Toplam</dt><dd>{formatMoney(order.total, getOrderCurrency(order))}</dd></div>
      </dl>
    });
    if (approved) onCloseOrder(status);
  }
  return <>
    {order && <section className="operation-section form-stack" aria-label="Masa hesabı">
      <h4>Hesap</h4><dl className="operation-facts">
        <div><dt>Ara toplam</dt><dd>{formatMoney(order.subtotal, getOrderCurrency(order))}</dd></div>
        <div><dt>İndirim</dt><dd>{formatMoney(order.discountTotal, getOrderCurrency(order))}</dd></div>
        <div className="operation-balance"><dt>Kalan / toplam</dt><dd>{formatMoney(order.total, getOrderCurrency(order))}</dd></div>
      </dl>
      <p>Tahsilatı aldıktan sonra adisyonu ödendi olarak kapatın.</p>
      <ActionButton disabled={disabled} onClick={() => void requestOrderClose("paid")}>Ödendi / Kapat</ActionButton>
      {roomFolioTransferEnabled && order.total > 0 && <TableRoomTransfer key={order.id} order={order} busy={disabled} onTransfer={onTransfer} revision={data.revision} customerId={table.currentCustomerId} dashboard={data} />}
      <ActionButton variant="danger" disabled={disabled} onClick={() => void requestOrderClose("cancelled")}>Adisyonu İptal Et</ActionButton>
    </section>}
    {customersEnabled && <section className="operation-section form-stack" aria-label="Masa müşterisi" tabIndex={-1}>
      <h4>Müşteri</h4><p>{customer?.fullName || "Masaya bağlı müşteri yok."}</p>
      <div className="form-field form-field--fluid">
        <span>Müşteri seç</span>
        <SearchSelect
          ariaLabel="Müşteri seç"
          value={selectedCustomerId}
          disabled={disabled}
          placeholder="Müşteri seçin"
          searchPlaceholder="Müşteri adı veya telefon ara"
          onChange={setCustomerDraft}
          options={data.customers.map(item => ({
            id: item.id,
            label: item.fullName,
            description: item.phone || item.email || undefined,
            keywords: [item.phone, item.email, ...(item.tags ?? [])].filter(Boolean).join(" ")
          }))}
        />
      </div>
      <div className="action-row">
      <ActionButton disabled={disabled || !selectedCustomerId || selectedCustomerId === table.currentCustomerId}
        onClick={() => void assignCustomer(selectedCustomerId)}>{table.currentCustomerId ? "Müşteriyi Değiştir" : "Müşteriyi Bağla"}</ActionButton>
      {table.currentCustomerId && <ActionButton variant="secondary" disabled={disabled} onClick={() => void assignCustomer("")}>Bağı Kaldır</ActionButton>}
      </div>
      {roomFolioTransferEnabled && customer && !customerStay && <div className="form-stack">
        <div className="form-field"><span>Konaklama odası</span><SearchSelect ariaLabel="Konaklama başlatılacak oda" value={entryRoomId} onChange={setEntryRoomId} disabled={disabled}
          options={data.rooms.filter(room => room.isActive && room.status === "available").map(room => ({ id: room.id, label: room.number ? `Oda ${room.number}` : room.name }))} /></div>
        <ActionButton variant="secondary" disabled={disabled || !entryRoomId} onClick={async () => {
          if (await controller.run(async () => true)) setEntryRequested(true);
        }}>Konaklama Başlat</ActionButton>
      </div>}
      {customerStay && <p>Aktif konaklama · {customerStay.roomNumber ? `Oda ${customerStay.roomNumber}` : customerStay.roomName}</p>}
    </section>}
    {relatedReservations.map(item => <article className="operation-section" key={item.id}><h4>{item.customerName || item.title}</h4><p>Rezervasyon · {item.startDate} {item.time} · {item.guestCount} kişi</p></article>)}
    {!order && <section className="operation-section form-stack">
      <h4>Masa hazırlığı</h4>
      <div className="form-field form-field--fluid">
        <span>Masa durumu</span>
        <ChoiceChips
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
        />
      </div>
    </section>}
    <p role={controller.error ? "alert" : "status"}>{controller.busy ? "İşlem kaydediliyor..." : controller.loading ? "Adisyon yükleniyor..." : controller.message}</p>
    {confirmDialog}
  </>;
}
