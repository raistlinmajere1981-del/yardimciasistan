import { useState } from "react";
import type { DesktopDashboardData, DesktopStatusUpdateResult } from "../../../electron/database";
import { ActionButton } from "../ui/ActionButton";
import { ChoiceChips } from "../ui/ChoiceChips";
import { SearchSelect } from "../ui/SearchSelect";
import { useConfirmDialog } from "../ui/useConfirmDialog";
import { TableRoomTransfer } from "./TableRoomTransfer";
import type { useTableOrderController } from "./use-table-order-controller";
import { formatMoney, getOrderCurrency, formatTableStatus, getTableStatusAction } from "./table-presentation";

export function TableAccountPanel({ table, data, controller, disabled, customersEnabled, reservationsEnabled, ordersEnabled,
  roomFolioTransferEnabled, duration, onCloseOrder, onTransfer, onUpdateTableStatus }: {
  table: DesktopDashboardData["tables"][number]; data: DesktopDashboardData; controller: ReturnType<typeof useTableOrderController>;
  disabled: boolean; customersEnabled: boolean; reservationsEnabled: boolean; ordersEnabled: boolean; roomFolioTransferEnabled: boolean; duration: number;
  onCloseOrder: (status: "paid" | "cancelled") => void; onTransfer: (folioId: string) => void;
  onUpdateTableStatus: (tableId: string, status: string) => Promise<DesktopStatusUpdateResult>;
}) {
  const { confirm, confirmDialog } = useConfirmDialog();
  const [statusDraft, setStatusDraft] = useState("");
  const [customerDraft, setCustomerDraft] = useState<string | null>(null);
  const order = controller.active;
  const relatedReservations = reservationsEnabled ? data.reservations.filter(item => item.tableIds.includes(table.id)
    && !["rejected", "cancelled", "completed"].includes(item.status)) : [];
  const customer = customersEnabled ? data.customers.find(item => item.id === table.currentCustomerId) : undefined;
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
    <dl className="operation-facts"><div><dt>Masa</dt><dd>{table.name} · {table.area || "Genel"}</dd></div>
      <div><dt>Durum</dt><dd>{formatTableStatus(table.status)}</dd></div><div><dt>Kapasite</dt><dd>{table.capacity} kişi</dd></div>
      {order && <div><dt>Açık kalma süresi</dt><dd>{duration} dk</dd></div>}
    </dl>
    {customersEnabled && <section className="operation-section form-stack" aria-label="Masa müşterisi">
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
      <ActionButton disabled={disabled || !selectedCustomerId || selectedCustomerId === table.currentCustomerId}
        onClick={() => void assignCustomer(selectedCustomerId)}>{table.currentCustomerId ? "Müşteriyi Değiştir" : "Müşteriyi Bağla"}</ActionButton>
      {table.currentCustomerId && <ActionButton variant="secondary" disabled={disabled} onClick={() => void assignCustomer("")}>Bağı Kaldır</ActionButton>}
    </section>}
    {relatedReservations.map(item => <article className="operation-section" key={item.id}><h4>{item.customerName || item.title}</h4><p>Rezervasyon · {item.startDate} {item.time} · {item.guestCount} kişi</p></article>)}
    {order ? <section className="operation-section form-stack" aria-label="Masa hesabı">
      <h4>Hesap</h4><dl className="operation-facts">
        <div><dt>Ara toplam</dt><dd>{formatMoney(order.subtotal, getOrderCurrency(order))}</dd></div>
        <div><dt>İndirim</dt><dd>{formatMoney(order.discountTotal, getOrderCurrency(order))}</dd></div>
        <div className="operation-balance"><dt>Kalan / toplam</dt><dd>{formatMoney(order.total, getOrderCurrency(order))}</dd></div>
      </dl>
      <p>Tahsilatı aldıktan sonra adisyonu ödendi olarak kapatın.</p>
      <ActionButton disabled={disabled} onClick={() => void requestOrderClose("paid")}>Ödendi / Kapat</ActionButton>
      {roomFolioTransferEnabled && order.status === "payment" && order.total > 0 && <TableRoomTransfer key={order.id} order={order} busy={disabled} onTransfer={onTransfer} revision={data.revision} />}
      {roomFolioTransferEnabled && order.status !== "payment" && <p>Odaya yazdırmak için adisyonu Hesap Bekliyor durumuna alın.</p>}
      <ActionButton variant="danger" disabled={disabled} onClick={() => void requestOrderClose("cancelled")}>Adisyonu İptal Et</ActionButton>
    </section> : <form className="operation-section form-stack" onSubmit={event => { event.preventDefault();
      if (!statusDraft) return;
      void controller.run(async isCurrent => {
        const result = await onUpdateTableStatus(table.id, statusDraft);
        if (!isCurrent()) return false;
        controller.feedback(result.message, !result.ok); if (result.ok) setStatusDraft(""); return result.ok;
      });
    }}>
      <h4>Masa hazırlığı</h4>
      <div className="form-field form-field--fluid">
        <span>Masa durumu</span>
        <ChoiceChips
          ariaLabel={`${table.name} durumunu değiştir`}
          value={statusDraft || tableStatus}
          disabled={disabled}
          onChange={setStatusDraft}
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
      <ActionButton variant="secondary" type="submit" disabled={disabled || !statusDraft}>Masa Durumunu Kaydet</ActionButton>
    </form>}
    <p role={controller.error ? "alert" : "status"}>{controller.busy ? "İşlem kaydediliyor..." : controller.loading ? "Adisyon yükleniyor..." : controller.message}</p>
    {confirmDialog}
  </>;
}
