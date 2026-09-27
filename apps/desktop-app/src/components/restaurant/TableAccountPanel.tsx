import { useState } from "react";
import type { DesktopDashboardData, DesktopStatusUpdateResult } from "../../../electron/database";
import { ActionButton } from "../ui/ActionButton";
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
  const [confirmCancel, setConfirmCancel] = useState(false);
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
  return <>
    <dl className="operation-facts"><div><dt>Masa</dt><dd>{table.name} · {table.area || "Genel"}</dd></div>
      <div><dt>Durum</dt><dd>{formatTableStatus(table.status)}</dd></div><div><dt>Kapasite</dt><dd>{table.capacity} kişi</dd></div>
      {order && <div><dt>Açık kalma süresi</dt><dd>{duration} dk</dd></div>}
    </dl>
    {customersEnabled && <section className="operation-section form-stack" aria-label="Masa müşterisi">
      <h4>Müşteri</h4><p>{customer?.fullName || "Masaya bağlı müşteri yok."}</p>
      <label className="form-field">Müşteri seç<select aria-label="Müşteri seç" value={selectedCustomerId} disabled={disabled} onChange={event => setCustomerDraft(event.target.value)}>
        <option value="">Müşteri seçin</option>
        {data.customers.map(item => <option key={item.id} value={item.id}>{item.fullName}</option>)}
      </select></label>
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
      <ActionButton disabled={disabled} onClick={() => onCloseOrder("paid")}>Ödendi / Kapat</ActionButton>
      {roomFolioTransferEnabled && order.status === "payment" && order.total > 0 && <TableRoomTransfer key={order.id} order={order} busy={disabled} onTransfer={onTransfer} revision={data.revision} />}
      {roomFolioTransferEnabled && order.status !== "payment" && <p>Odaya yazdırmak için adisyonu Hesap Bekliyor durumuna alın.</p>}
      <ActionButton variant="danger" disabled={disabled} onClick={() => setConfirmCancel(true)}>Adisyonu İptal Et</ActionButton>
      {confirmCancel && <div className="operation-confirmation form-stack"><p>Adisyon iptal edilir ve ürün stokları geri yüklenir.</p>
        <ActionButton variant="danger" disabled={disabled} onClick={() => onCloseOrder("cancelled")}>İptali Onayla</ActionButton>
        <ActionButton variant="secondary" disabled={disabled} onClick={() => setConfirmCancel(false)}>Vazgeç</ActionButton>
      </div>}
    </section> : <form className="operation-section form-stack" onSubmit={event => { event.preventDefault();
      if (!statusDraft) return;
      void controller.run(async isCurrent => {
        const result = await onUpdateTableStatus(table.id, statusDraft);
        if (!isCurrent()) return false;
        controller.feedback(result.message, !result.ok); if (result.ok) setStatusDraft(""); return result.ok;
      });
    }}>
      <h4>Masa hazırlığı</h4><label className="form-field">Masa durumu<select aria-label={`${table.name} durumunu değiştir`} value={statusDraft || tableStatus} disabled={disabled} onChange={event => setStatusDraft(event.target.value)}>
        {!["available", "occupied", "reserved", "bill_waiting", "cleaning"].includes(tableStatus) && <option value={tableStatus}>{formatTableStatus(table.status)}</option>}
        <option value="available">Boş</option><option value="occupied">Dolu</option>{reservationsEnabled && <option value="reserved">Rezerve</option>}
        {ordersEnabled && <option value="bill_waiting">Hesap</option>}<option value="cleaning">Temizlik</option>
      </select></label><ActionButton variant="secondary" type="submit" disabled={disabled || !statusDraft}>Masa Durumunu Kaydet</ActionButton>
    </form>}
    <p role={controller.error ? "alert" : "status"}>{controller.busy ? "İşlem kaydediliyor..." : controller.loading ? "Adisyon yükleniyor..." : controller.message}</p>
  </>;
}
