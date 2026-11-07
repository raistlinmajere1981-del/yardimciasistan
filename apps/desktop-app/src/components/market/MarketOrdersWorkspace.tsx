import { ChoiceChips } from "../ui/ChoiceChips";
import { CheckCircle2, ClipboardList, Search, WalletCards, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import type { MarketOrdersSession, FulfillmentPaymentChoice } from "../../app/use-market-orders-session";
import { MarketOrderShipments } from "./MarketOrderShipments";
import { ActionButton } from "../ui/ActionButton";
import { StatusBadge, type StatusTone } from "../ui/StatusBadge";
import { MoneyInput } from "../ui/MoneyInput";

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
  const [paymentReason,setPaymentReason] = useState("");
  const bridge = window.yardimciDesktop?.commerce;
  const { search, setSearch, statusFilter, setStatusFilter, mutationInFlight,
    orders, selectedOrder, setSelectedOrder, loadingOrders, submitting, setSubmitting,
    fulfillmentPayment, setFulfillmentPayment, reloadOrders, openOrder, benefits } = session;
  const filteredOrders = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    return orders.filter(order => (!statusFilter || order.status === statusFilter)
      && (!needle || [order.customerName, order.buyerSnapshot?.name, order.source, sourceLabel(order.source), order.orderNumber, order.id]
        .some(value => value?.toLocaleLowerCase("tr-TR").includes(needle))));
  }, [orders, search, statusFilter]);
  const disabled = busy || submitting || loadingOrders || benefits.locked;

  async function updateStatus(status: "confirmed" | "cancelled") {
    if (!bridge || !selectedOrder || submitting || mutationInFlight.current || benefits.pending.current) return;
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

  async function paymentAction(action: "approve" | "reject" | "refund" | "prepare") {
    if (!bridge || !selectedOrder || submitting || mutationInFlight.current) return;
    mutationInFlight.current=true;setSubmitting(true);
    try {
      const order=selectedOrder.order;
      const result=await bridge.manageOrderPayment({orderId:order.id,action,reason:paymentReason,
        operationKey:`order-payment:${order.id}:${action}:${Date.parse(order.updatedAt)}`,expectedUpdatedAt:order.updatedAt});
      setSelectedOrder(result);setPaymentReason("");await reloadOrders();onStateChange("success","Sipariş ödeme işlemi kaydedildi.");
    } catch(error) {onStateChange("error",error instanceof Error ? error.message : "Ödeme kaydedilemedi.");}
    finally {mutationInFlight.current=false;setSubmitting(false);}
  }

  async function fulfillSelectedOrder() {
    if (!bridge || !selectedOrder || selectedOrder.order.status !== "confirmed" || submitting || mutationInFlight.current) return;
    const zeroTotal = selectedOrder.order.total === 0;
    const paymentChoice = selectedOrder.order.checkoutSnapshot ? "bank" : zeroTotal ? "no_payment" : fulfillmentPayment;
    if (paymentChoice === "credit" && (!customerCreditEnabled || !selectedOrder.order.customerId)) {
      onStateChange("error", "Veresiye için Müşteri Hesabı etkin ve siparişte müşteri olmalı.");
      return;
    }
    if (benefits.active && !benefits.uncertain && !benefits.current) {
      onStateChange("error", "Önce güncel tutarı hesaplayın.");
      return;
    }

    mutationInFlight.current = true;
    setSubmitting(true);
    try {
      const result = benefits.active || benefits.pending.current ? await benefits.submit() : await bridge.fulfillOrder({
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
        result.benefits
          ? `Sipariş tamamlandı: ${money(result.benefits.quote.payableMinor / 100, result.sale.currency)} tahsilat · ${money(result.benefits.quote.pointsTenderMinor / 100, result.sale.currency)} Puan ile ödeme · ${money(result.benefits.quote.pointsEarnPreviewMinor / 100, result.sale.currency)} Puan kazanıldı.`
          : paymentChoice === "credit"
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
          <input aria-label="Sipariş ara" placeholder="Sipariş numarası veya müşteri ara" value={search} onChange={event => setSearch(event.target.value)} />
        </label>
        <ChoiceChips ariaLabel="Sipariş durumu" value={statusFilter} onChange={setStatusFilter} options={[
          { id: "", label: "Tümü" }, { id: "placed", label: "Yeni" }, { id: "confirmed", label: "Onaylanan" },
          { id: "fulfilled", label: "Tamamlanan" }, { id: "cancelled", label: "İptal" }
        ]} />
        {loadingOrders && <p role="status" className="market-muted">Siparişler yükleniyor…</p>}
        <div className="market-order-list">
          {filteredOrders.map(order => (
            <button type="button" className={`market-order-card interactive-surface interactive-surface--record${selectedOrder?.order.id === order.id ? " is-selected" : ""}`}
              key={order.id} aria-pressed={selectedOrder?.order.id === order.id} disabled={submitting || benefits.locked} onClick={() => void openOrder(order.id)}>
              <span><strong>{order.customerName || order.buyerSnapshot?.name || "Müşterisiz sipariş"}</strong>
                <small>{order.orderNumber && `${order.orderNumber} · `}{sourceLabel(order.source)} · {new Date(order.placedAt).toLocaleString("tr-TR")}</small></span>
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
                <p>{selectedOrder.order.orderNumber && `${selectedOrder.order.orderNumber} · `}{sourceLabel(selectedOrder.order.source)} · {new Date(selectedOrder.order.placedAt).toLocaleString("tr-TR")}</p>
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

            {selectedOrder.order.checkoutSnapshot && <section className="form-stack" aria-label="Havale ve sipariş olayları">
              <h3>Havale / EFT</h3>
              <p>Ödeme: {({unpaid:"Ödeme bekleniyor",verification_pending:"Havale bildirildi · doğrulama bekliyor",paid:"Doğrulandı",rejected:"Doğrulanamadı",refunded:"İade kaydedildi"})[selectedOrder.order.paymentStatus || "unpaid"]}</p>
              <p>Teslimat: {({unfulfilled:"Hazırlanmadı",preparing:"Hazırlanıyor",delivered:"Teslim edildi",cancelled:"İptal"})[selectedOrder.order.deliveryStatus || "unfulfilled"]} · {money(selectedOrder.order.deliveryFee || 0,selectedOrder.order.currency)}</p>
              <label className="form-field">İşlem açıklaması<input value={paymentReason} onChange={event=>setPaymentReason(event.target.value)} maxLength={500} disabled={disabled} /></label>
              <div className="action-row">
                {["unpaid","verification_pending","rejected"].includes(selectedOrder.order.paymentStatus || "unpaid") && selectedOrder.order.status !== "cancelled" && <ActionButton disabled={disabled} onClick={()=>void paymentAction("approve")}>Havaleyi Doğrula</ActionButton>}
                {["unpaid","verification_pending"].includes(selectedOrder.order.paymentStatus || "unpaid") && <ActionButton variant="danger" disabled={disabled || !paymentReason.trim()} onClick={()=>void paymentAction("reject")}>Bildirimi Reddet</ActionButton>}
                {selectedOrder.order.paymentStatus === "paid" && selectedOrder.order.status === "confirmed" && selectedOrder.order.deliveryStatus === "unfulfilled" && <ActionButton disabled={disabled} onClick={()=>void paymentAction("prepare")}>Hazırlamaya Başla</ActionButton>}
                {selectedOrder.order.paymentStatus === "paid" && selectedOrder.order.status === "cancelled" && <ActionButton disabled={disabled || !paymentReason.trim()} onClick={()=>void paymentAction("refund")}>Banka İadesini Kaydet</ActionButton>}
              </div>
              <details><summary>İşlem geçmişi</summary><ol>{selectedOrder.events?.map(event=><li key={event.id}>{event.type} · {event.actorId} · {new Date(event.createdAt).toLocaleString("tr-TR")}{event.reason && ` · ${event.reason}`}</li>)}</ol></details>
            </section>}

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
                      value={selectedOrder.order.checkoutSnapshot ? "bank" : fulfillmentPayment}
                      onChange={(event) => setFulfillmentPayment(event.target.value as FulfillmentPaymentChoice)}
                      disabled={disabled || Boolean(selectedOrder.order.checkoutSnapshot)}
                    >
                      <option value="cash">Nakit</option>
                      <option value="card">Kart</option>
                      <option value="bank">Banka</option>
                      <option value="other">Diğer</option>
                      {customerCreditEnabled && selectedOrder.order.customerId && <option value="credit" disabled={benefits.active}>Veresiye</option>}
                    </select>
                  </label>
                )}
                {benefits.eligible && benefits.availabilityError && <p role="alert">{benefits.availabilityError}
                  <ActionButton variant="secondary" disabled={disabled} onClick={benefits.reloadAvailability}>Yeniden dene</ActionButton>
                </p>}
                {benefits.available && <section className="form-stack" aria-label="İndirim ve Puan">
                  <label><input type="checkbox" checked={benefits.active} disabled={disabled || !benefits.compatible}
                    onChange={event => benefits.select(event.target.checked)} /> İndirim ve Puan</label>
                  {!benefits.compatible && <p className="market-muted">Yalnız tam ödenen siparişlerde kullanılabilir.</p>}
                  {benefits.active && <>
                    <p className="market-muted">{selectedOrder.order.discountTotal > 0
                      ? "Sipariş toplamı sabittir. Kupon ve ödeme indirimi kayıtlı indirimle eşleşmelidir."
                      : "Bu siparişe yeni kupon veya ödeme indirimi eklenemez; Puan kullanılabilir."}</p>
                    {benefits.couponAvailable && <label className="form-field">Kupon<input aria-label="Kupon kodu" type="password" autoComplete="off" maxLength={128}
                      value={benefits.coupon.current} disabled={disabled} onChange={event => benefits.setCoupon(event.target.value)} /></label>}
                    {benefits.pointsAvailable && <>
                      <p className="market-muted">Kullanılabilir Puan: {benefits.current ? money(benefits.current.availablePointsMinor / 100, selectedOrder.order.currency) : "—"}</p>
                      <label className="form-field">Kullanılacak Puan<MoneyInput aria-label="Kullanılacak Puan" value={benefits.points} onChange={benefits.setPoints}
                        disabled={disabled} aria-invalid={benefits.requestedPointsMinor === null || benefits.requestedPointsMinor < 0} /></label>
                    </>}
                    {!selectedOrder.order.customerId && <p className="market-muted">Puan kullanımı ve kazanımı için siparişte müşteri olmalı.</p>}
                    <ActionButton variant="secondary" busy={benefits.loading} disabled={disabled || !benefits.compatible || benefits.requestedPointsMinor === null || benefits.requestedPointsMinor < 0}
                      onClick={() => void benefits.refresh().catch(error => onStateChange("error", error instanceof Error ? error.message : "Tutar hesaplanamadı."))}>Tutarı Hesapla</ActionButton>
                    {benefits.current ? <div className="market-sale-totals" aria-label="İndirim ve Puan önizlemesi">
                      <span><small>Tahsil edilecek</small><strong>{money(benefits.current.quote.payableMinor / 100, selectedOrder.order.currency)}</strong></span>
                      <span><small>Puan ile ödeme</small><strong>{money(benefits.current.quote.pointsTenderMinor / 100, selectedOrder.order.currency)}</strong></span>
                      <span><small>Ödeme sonrası kazanılacak Puan</small><strong>{money(benefits.current.quote.pointsEarnPreviewMinor / 100, selectedOrder.order.currency)}</strong></span>
                    </div> : <p className="market-muted">Onaylamadan önce güncel tutarı hesaplayın. Puan yalnız ödeme tamamlanınca işlenir.</p>}
                  </>}
                </section>}
                {benefits.eligible && benefits.availability?.enabled && !benefits.available && <p className="market-muted">{!selectedOrder.order.customerId && benefits.availability.families.points
                  ? "Puan için siparişte müşteri olmalı."
                  : "Bu sipariş için uygun İndirim ve Puan seçeneği yok."}{selectedOrder.order.discountTotal === 0 ? " Siparişe yeni indirim eklenemez." : ""}</p>}
                {benefits.active && !benefits.available && !benefits.locked && <p role="alert">İndirim ve Puan kullanılamıyor.
                  <ActionButton variant="secondary" disabled={disabled} onClick={() => benefits.clear()}>Seçimi kaldır</ActionButton>
                </p>}
                {!benefits.active && benefits.available && <p className="market-muted">İndirim ve Puan seçilmeden tamamlama Puan kazandırmaz.</p>}
                {benefits.uncertain && <p role="alert">Sipariş sonucu belirsiz. Sipariş ve ödeme seçimi korundu; aynı işlemin sonucunu doğrulayın.</p>}
                <div className="action-row market-order-actions">
                  <ActionButton
                    onClick={() => void fulfillSelectedOrder()}
                    busy={submitting}
                    busyLabel="Sipariş tamamlanıyor…"
                    disabled={busy || submitting || loadingOrders || (Boolean(selectedOrder.order.checkoutSnapshot) && selectedOrder.order.paymentStatus !== "paid") || (!benefits.uncertain && (benefits.locked || benefits.active && !benefits.current))}
                  >
                    <WalletCards size={16} aria-hidden="true" /> {benefits.uncertain ? "Sipariş Sonucunu Doğrula" : "Siparişi Tamamla"}
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
