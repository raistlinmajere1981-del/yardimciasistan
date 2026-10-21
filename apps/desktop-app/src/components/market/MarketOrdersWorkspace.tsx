import { ChoiceChips } from "../ui/ChoiceChips";
import { CheckCircle2, ClipboardList, Search, WalletCards, XCircle } from "lucide-react";
import { useMemo } from "react";
import type { MarketOrdersSession, FulfillmentPaymentChoice } from "../../app/use-market-orders-session";
import { MarketOrderShipments } from "./MarketOrderShipments";
import { ActionButton } from "../ui/ActionButton";
import { StatusBadge, type StatusTone } from "../ui/StatusBadge";

function fulfillmentOperationKey(orderId: string, paymentChoice: FulfillmentPaymentChoice | "no_payment") {
  return `desktop-order-fulfillment:${orderId}:${paymentChoice}`;
}

function money(value: number, currency = "TRY") {
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function orderStatusLabel(status: string) {
  if (status === "confirmed") return "Onaylandı";
  if (status === "fulfilled") return "Tamamlandı";
  if (status === "cancelled") return "İptal";
  return "Yeni";
}

function orderStatusTone(status: string): StatusTone {
  if (status === "confirmed") return "info";
  if (status === "fulfilled") return "success";
  if (status === "cancelled") return "muted";
  return "warning";
}

function sourceLabel(source: string) {
  if (source === "desktop") return "Manuel";
  if (source === "desktop-wholesale") return "Manuel bayi";
  if (source === "web-online-sales") return "Web siparişi";
  if (source === "web-dealer") return "Bayi web siparişi";
  if (source === "online_sales") return "Online satış";
  return source || "Sipariş";
}

export function MarketOrdersWorkspace({
  session,
  customerCreditEnabled = false,
  busy,
  onStateChange
}: {
  session: MarketOrdersSession;
  customerCreditEnabled?: boolean;
  busy: boolean;
  onStateChange: (state: "loading" | "success" | "error", message: string) => void;
}) {
  const bridge = window.yardimciDesktop?.commerce;
  const { search, setSearch, statusFilter, setStatusFilter, mutationInFlight,
    orders, selectedOrder, setSelectedOrder, loadingOrders, submitting, setSubmitting,
    fulfillmentPayment, setFulfillmentPayment, reloadOrders, openOrder } = session;
  const filteredOrders = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    return orders.filter(order => (!statusFilter || order.status === statusFilter)
      && (!needle || [order.customerName, order.buyerSnapshot?.name, order.source, sourceLabel(order.source), order.id]
        .some(value => value?.toLocaleLowerCase("tr-TR").includes(needle))));
  }, [orders, search, statusFilter]);
  const disabled = busy || submitting || loadingOrders;

  async function updateStatus(status: "confirmed" | "cancelled") {
    if (!bridge || !selectedOrder || submitting || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setSubmitting(true);
    try {
      const updated = await bridge.updateOrderStatus({
        orderId: selectedOrder.order.id,
        status
      });
      setSelectedOrder(updated);
      await reloadOrders();
      onStateChange("success", status === "confirmed" ? "Sipariş onaylandı." : "Sipariş iptal edildi.");
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Sipariş durumu güncellenemedi.");
    } finally {
      mutationInFlight.current = false;
      setSubmitting(false);
    }
  }

  async function fulfillSelectedOrder() {
    if (!bridge || !selectedOrder || selectedOrder.order.status !== "confirmed" || submitting || mutationInFlight.current) return;
    const zeroTotal = selectedOrder.order.total === 0;
    const paymentChoice = zeroTotal ? "no_payment" : fulfillmentPayment;
    if (paymentChoice === "credit" && (!customerCreditEnabled || !selectedOrder.order.customerId)) {
      onStateChange("error", "Veresiye için Müşteri Hesabı etkin ve siparişte müşteri olmalı.");
      return;
    }

    mutationInFlight.current = true;
    setSubmitting(true);
    try {
      const result = await bridge.fulfillOrder({
        orderId: selectedOrder.order.id,
        operationKey: fulfillmentOperationKey(selectedOrder.order.id, paymentChoice),
        settlement: paymentChoice === "no_payment"
          ? { type: "no_payment" }
          : paymentChoice === "credit"
            ? { type: "credit" }
            : { type: "paid", paymentMethod: paymentChoice }
      });
      setSelectedOrder(result.order);
      await reloadOrders();
      onStateChange(
        "success",
        paymentChoice === "credit"
          ? "Sipariş tamamlandı ve müşteri hesabına borç işlendi."
          : zeroTotal
            ? "Bedelsiz sipariş tamamlandı."
            : `Sipariş tamamlandı: ${money(result.sale.total, result.sale.currency)}.`
      );
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Sipariş tamamlanamadı.");
    } finally {
      mutationInFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="market-order-layout">
      <section className="market-panel market-order-history" aria-label="Sipariş listesi">
        <header className="market-panel-heading-row">
          <small>Son 100 sipariş · {filteredOrders.length} sonuç</small>
          <ActionButton variant="secondary" size="sm" onClick={() => void reloadOrders()} disabled={disabled}>Yenile</ActionButton>
        </header>
        <label className="market-search-field">
          <Search size={16} aria-hidden="true" />
          <input aria-label="Sipariş ara" placeholder="Müşteri veya kaynak ara" value={search} onChange={event => setSearch(event.target.value)} />
        </label>
        <ChoiceChips ariaLabel="Sipariş durumu" value={statusFilter} onChange={setStatusFilter} options={[
          { id: "", label: "Tümü" }, { id: "placed", label: "Yeni" }, { id: "confirmed", label: "Onaylanan" },
          { id: "fulfilled", label: "Tamamlanan" }, { id: "cancelled", label: "İptal" }
        ]} />
        {loadingOrders && <p role="status" className="market-muted">Siparişler yükleniyor…</p>}
        <div className="market-order-list">
          {filteredOrders.map(order => (
            <button type="button" className={`market-order-card interactive-surface interactive-surface--record${selectedOrder?.order.id === order.id ? " is-selected" : ""}`}
              key={order.id} aria-pressed={selectedOrder?.order.id === order.id} disabled={submitting} onClick={() => void openOrder(order.id)}>
              <span><strong>{order.customerName || order.buyerSnapshot?.name || "Müşterisiz sipariş"}</strong>
                <small>{sourceLabel(order.source)} · {new Date(order.placedAt).toLocaleString("tr-TR")}</small></span>
              <span className="market-order-card-meta"><StatusBadge tone={orderStatusTone(order.status)}>{orderStatusLabel(order.status)}</StatusBadge>
                <b>{money(order.total, order.currency)}</b></span>
            </button>
          ))}
          {!loadingOrders && filteredOrders.length === 0 && <p className="market-muted">Sipariş bulunamadı.</p>}
        </div>
      </section>
      <section className="market-panel market-order-detail-panel" aria-label="Sipariş detayı">
        {selectedOrder ? (
          <div className="market-order-detail">
            <header className="market-panel-heading-row">
              <div>
                <span>Detay</span>
                <h2>{selectedOrder.order.customerName || selectedOrder.order.buyerSnapshot?.name || "Sipariş"}</h2>
                <p>{sourceLabel(selectedOrder.order.source)} · {new Date(selectedOrder.order.placedAt).toLocaleString("tr-TR")}</p>
              </div>
              <StatusBadge tone={orderStatusTone(selectedOrder.order.status)}>{orderStatusLabel(selectedOrder.order.status)}</StatusBadge>
            </header>

            {selectedOrder.order.source !== "web-dealer" && selectedOrder.order.buyerSnapshot && (
              <section className="market-order-buyer" aria-label="Sipariş veren">
                <strong>Sipariş veren</strong>
                <dl>
                  <dt>Ad</dt><dd>{selectedOrder.order.buyerSnapshot.name}</dd>
                  {selectedOrder.order.buyerSnapshot.phone.trim() && (
                    <><dt>Telefon</dt><dd>{selectedOrder.order.buyerSnapshot.phone}</dd></>
                  )}
                  {selectedOrder.order.buyerSnapshot.email?.trim() && (
                    <><dt>E-posta</dt><dd>{selectedOrder.order.buyerSnapshot.email}</dd></>
                  )}
                </dl>
              </section>
            )}

            <section className="market-order-buyer" aria-label="Teslimat">
              <strong>Teslimat: {selectedOrder.order.deliverySnapshot.method === "pickup" ? "İşletmeden teslim" : "Kargo"}</strong>
              {selectedOrder.order.deliverySnapshot.method === "shipping" && (
                <>
                  <dl>
                    <dt>Alıcı</dt><dd>{selectedOrder.order.deliverySnapshot.address.recipientName}</dd>
                    <dt>Adres</dt><dd>{selectedOrder.order.deliverySnapshot.address.addressLine1}</dd>
                    {selectedOrder.order.deliverySnapshot.address.addressLine2 && <><dt>Adres devamı</dt><dd>{selectedOrder.order.deliverySnapshot.address.addressLine2}</dd></>}
                    <dt>İlçe / şehir</dt><dd>{selectedOrder.order.deliverySnapshot.address.district} / {selectedOrder.order.deliverySnapshot.address.city}</dd>
                    {selectedOrder.order.deliverySnapshot.address.postalCode && <><dt>Posta kodu</dt><dd>{selectedOrder.order.deliverySnapshot.address.postalCode}</dd></>}
                    <dt>Ülke</dt><dd>{selectedOrder.order.deliverySnapshot.address.countryCode}</dd>
                    {selectedOrder.order.deliverySnapshot.address.note && <><dt>Teslimat notu</dt><dd>{selectedOrder.order.deliverySnapshot.address.note}</dd></>}
                  </dl>
                  <p className="market-muted">Kargo ücreti ayrıca belirlenecektir.</p>
                </>
              )}
            </section>

            {selectedOrder.order.deliverySnapshot.method === "shipping" && (
              <MarketOrderShipments session={session} orderStatus={selectedOrder.order.status} busy={disabled} />
            )}

            <div className="market-order-detail-lines">
              {selectedOrder.items.map((item) => (
                <div key={item.id}>
                  <span><strong>{item.productName}</strong><small>{item.quantity} × {money(item.unitPrice, selectedOrder.order.currency)}</small></span>
                  <strong>{money(item.lineTotal, selectedOrder.order.currency)}</strong>
                </div>
              ))}
            </div>
            {selectedOrder.order.note && <p className="market-order-note">{selectedOrder.order.note}</p>}
            <div className="market-sale-totals">
              <span><small>Ara toplam</small><strong>{money(selectedOrder.order.subtotal, selectedOrder.order.currency)}</strong></span>
              <span><small>İndirim</small><strong>-{money(selectedOrder.order.discountTotal, selectedOrder.order.currency)}</strong></span>
              <span className="market-sale-grand-total"><small>Toplam</small><strong>{money(selectedOrder.order.total, selectedOrder.order.currency)}</strong></span>
            </div>

            {selectedOrder.order.status === "fulfilled" && <p role="status">Sipariş {new Date(selectedOrder.order.fulfilledAt).toLocaleString("tr-TR")} tarihinde tamamlandı.</p>}
            {selectedOrder.order.status === "cancelled" && <p role="status">Sipariş {new Date(selectedOrder.order.cancelledAt).toLocaleString("tr-TR")} tarihinde iptal edildi.</p>}
            {selectedOrder.order.status === "placed" && (
              <div className="action-row market-order-actions">
                <ActionButton onClick={() => void updateStatus("confirmed")} disabled={disabled}>
                  <CheckCircle2 size={16} aria-hidden="true" /> Siparişi Onayla
                </ActionButton>
                <ActionButton variant="danger" onClick={() => void updateStatus("cancelled")} disabled={disabled}>
                  <XCircle size={16} aria-hidden="true" /> Siparişi İptal Et
                </ActionButton>
              </div>
            )}

            {selectedOrder.order.status === "confirmed" && (
              <div className="market-order-fulfillment">
                <header>
                  <span>Tamamla</span>
                  <strong>{selectedOrder.order.total === 0 ? "Tahsilat gerekmiyor" : "Tahsilat tercihi"}</strong>
                </header>
                {selectedOrder.order.total > 0 && (
                  <label className="form-field form-field--fluid">
                    Ödeme
                    <select
                      aria-label="Sipariş ödeme tercihi"
                      value={fulfillmentPayment}
                      onChange={(event) => setFulfillmentPayment(event.target.value as FulfillmentPaymentChoice)}
                      disabled={disabled}
                    >
                      <option value="cash">Nakit</option>
                      <option value="card">Kart</option>
                      <option value="bank">Banka</option>
                      <option value="other">Diğer</option>
                      {customerCreditEnabled && selectedOrder.order.customerId && <option value="credit">Veresiye</option>}
                    </select>
                  </label>
                )}
                <div className="action-row market-order-actions">
                  <ActionButton
                    onClick={() => void fulfillSelectedOrder()}
                    busy={submitting}
                    busyLabel="Sipariş tamamlanıyor…"
                    disabled={disabled}
                  >
                    <WalletCards size={16} aria-hidden="true" /> Siparişi Tamamla
                  </ActionButton>
                  <ActionButton variant="danger" onClick={() => void updateStatus("cancelled")} disabled={disabled}>
                    <XCircle size={16} aria-hidden="true" /> Siparişi İptal Et
                  </ActionButton>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="market-sale-empty-cart">
            <ClipboardList size={28} aria-hidden="true" />
            <p>Detay görmek için bir sipariş seçin.</p>
          </div>
        )}
      </section>
    </div>
  );
}
