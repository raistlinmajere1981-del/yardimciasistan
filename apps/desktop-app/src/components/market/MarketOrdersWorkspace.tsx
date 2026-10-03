import { CheckCircle2, ClipboardList, Minus, Plus, Search, ShoppingCart, Trash2, WalletCards, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CatalogProduct,
  CommerceOrder,
  CommerceOrderDetail,
  CommerceResolvedUnitPrice
} from "@yardimci-asistan/shared";
import type { DesktopCustomer } from "../../../electron/database";
import { ActionButton } from "../ui/ActionButton";
import { StatusBadge, type StatusTone } from "../ui/StatusBadge";

interface DraftLine {
  product: CatalogProduct;
  pricing: CommerceResolvedUnitPrice;
  quantity: number;
}

type FulfillmentPaymentChoice = "cash" | "card" | "bank" | "other" | "credit";

function fulfillmentOperationKey(orderId: string, paymentChoice: FulfillmentPaymentChoice | "no_payment") {
  return `desktop-order-fulfillment:${orderId}:${paymentChoice}`;
}

function createManualOrderReference() {
  const randomId = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `desktop-wholesale:${randomId}`;
}

function money(value: number, currency = "TRY") {
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function priceGroupLabel(group: string) {
  if (group === "dealer_a") return "Bayi A";
  if (group === "dealer_b") return "Bayi B";
  return "Perakende";
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
  if (source === "desktop-wholesale") return "Manuel bayi";
  if (source === "web-online-sales") return "Web siparişi";
  if (source === "online_sales") return "Online satış";
  return source || "Sipariş";
}

function catalogPreviewPrice(product: CatalogProduct, customer: DesktopCustomer | undefined) {
  const profile = customer?.commercialProfile;
  if (!profile || profile.dealerStatus !== "active") {
    return { value: product.salePrice, label: "Perakende" };
  }
  if (profile.priceGroup === "dealer_a" && product.dealerPriceA != null) {
    return { value: product.dealerPriceA, label: "Bayi A" };
  }
  if (profile.priceGroup === "dealer_b" && product.dealerPriceB != null) {
    return { value: product.dealerPriceB, label: "Bayi B" };
  }
  return { value: product.salePrice, label: profile.priceGroup === "retail" ? "Perakende" : "Perakende · yedek" };
}

export function MarketOrdersWorkspace({
  customers,
  products,
  customerCreditEnabled = false,
  busy,
  onStateChange
}: {
  customers: DesktopCustomer[];
  products: CatalogProduct[];
  customerCreditEnabled?: boolean;
  busy: boolean;
  onStateChange: (state: "loading" | "success" | "error", message: string) => void;
}) {
  const bridge = window.yardimciDesktop?.commerce;
  const activeDealers = useMemo(
    () => customers.filter((customer) => customer.commercialProfile?.dealerStatus === "active"),
    [customers]
  );
  const orderProducts = useMemo(() => products.filter((product) => product.isActive !== false), [products]);
  const [customerId, setCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [orders, setOrders] = useState<CommerceOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<CommerceOrderDetail | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fulfillmentPayment, setFulfillmentPayment] = useState<FulfillmentPaymentChoice>("cash");
  const [resolvingProductId, setResolvingProductId] = useState("");
  const customerIdRef = useRef("");
  const draftReferenceRef = useRef(createManualOrderReference());

  const resetDraftReference = useCallback(() => {
    draftReferenceRef.current = createManualOrderReference();
  }, []);

  const selectedCustomer = activeDealers.find((customer) => customer.id === customerId);
  const filteredProducts = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return orderProducts;
    return orderProducts.filter((product) =>
      [product.name, product.brand, product.sku, product.barcode]
        .some((value) => String(value ?? "").toLocaleLowerCase("tr-TR").includes(needle))
    );
  }, [orderProducts, search]);

  const currency = lines[0]?.pricing.currency ?? "TRY";
  const subtotal = lines.reduce((sum, line) => sum + line.pricing.unitPrice * line.quantity, 0);
  const disabled = busy || submitting || loadingOrders;

  const reloadOrders = useCallback(async () => {
    if (!bridge) return;
    setLoadingOrders(true);
    try {
      setOrders(await bridge.listOrders({ limit: 100 }));
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Siparişler yüklenemedi.");
    } finally {
      setLoadingOrders(false);
    }
  }, [bridge, onStateChange]);

  useEffect(() => {
    void reloadOrders();
  }, [reloadOrders]);

  function changeCustomer(nextCustomerId: string) {
    customerIdRef.current = nextCustomerId;
    setCustomerId(nextCustomerId);
    setLines([]);
    resetDraftReference();
  }

  async function addProduct(product: CatalogProduct) {
    if (!bridge || !customerId || resolvingProductId || disabled) return;
    const existing = lines.find((line) => line.product.id === product.id);
    if (existing) {
      resetDraftReference();
      setLines((current) => current.map((line) =>
        line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line
      ));
      return;
    }

    const requestedCustomerId = customerId;
    customerIdRef.current = customerId;
    setResolvingProductId(product.id);
    try {
      const pricing = await bridge.resolveProductPrice({ productId: product.id, customerId: requestedCustomerId });
      if (customerIdRef.current !== requestedCustomerId) return;
      if (lines.length > 0 && pricing.currency !== currency) {
        onStateChange("error", "Tek siparişte birden fazla para birimi kullanılamaz.");
        return;
      }
      resetDraftReference();
      setLines((current) => [...current, { product, pricing, quantity: 1 }]);
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Ürün fiyatı çözümlenemedi.");
    } finally {
      setResolvingProductId("");
    }
  }

  function setQuantity(productId: string, quantity: number) {
    resetDraftReference();
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setLines((current) => current.filter((line) => line.product.id !== productId));
      return;
    }
    setLines((current) => current.map((line) =>
      line.product.id === productId
        ? { ...line, quantity: Math.round(quantity * 10000) / 10000 }
        : line
    ));
  }

  async function createOrder() {
    if (!bridge || !selectedCustomer || lines.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const created = await bridge.createOrder({
        customerId: selectedCustomer.id,
        source: "desktop-wholesale",
        sourceReference: draftReferenceRef.current,
        note,
        items: lines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity
        }))
      });
      setSelectedOrder(created);
      setLines([]);
      setNote("");
      resetDraftReference();
      await reloadOrders();
      onStateChange("success", `Sipariş kaydedildi: ${money(created.order.total, created.order.currency)}.`);
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Sipariş kaydedilemedi.");
    } finally {
      setSubmitting(false);
    }
  }

  async function openOrder(orderId: string) {
    if (!bridge) return;
    try {
      const detail = await bridge.getOrder(orderId);
      setSelectedOrder(detail);
      setFulfillmentPayment("cash");
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Sipariş detayı yüklenemedi.");
    }
  }

  async function updateStatus(status: "confirmed" | "cancelled") {
    if (!bridge || !selectedOrder || submitting) return;
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
      setSubmitting(false);
    }
  }

  async function fulfillSelectedOrder() {
    if (!bridge || !selectedOrder || selectedOrder.order.status !== "confirmed" || submitting) return;
    const zeroTotal = selectedOrder.order.total === 0;
    const paymentChoice = zeroTotal ? "no_payment" : fulfillmentPayment;
    if (paymentChoice === "credit" && (!customerCreditEnabled || !selectedOrder.order.customerId)) {
      onStateChange("error", "Veresiye için Müşteri Hesabı etkin ve siparişte müşteri olmalı.");
      return;
    }

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
      setSubmitting(false);
    }
  }

  return (
    <div className="market-order-layout">
      <section className="market-panel market-order-compose">
        <header className="market-panel-heading">
          <span>Bayi / Toptan</span>
          <h2>Yeni Sipariş</h2>
          <p>Aktif bayi seçin; ürün fiyatı müşterinin fiyat grubuna göre hesaplanır.</p>
        </header>

        <div className="market-order-customer">
          <label className="market-field">
            Aktif bayi
            <select
              aria-label="Sipariş müşterisi"
              value={customerId}
              onChange={(event) => changeCustomer(event.target.value)}
              disabled={disabled || Boolean(resolvingProductId)}
            >
              <option value="">Bayi seçin</option>
              {activeDealers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.commercialProfile?.companyName || customer.fullName} · {priceGroupLabel(customer.commercialProfile?.priceGroup ?? "retail")}
                </option>
              ))}
            </select>
          </label>
          {selectedCustomer && (
            <div className="market-order-customer-summary">
              <strong>{selectedCustomer.commercialProfile?.companyName || selectedCustomer.fullName}</strong>
              <span>{selectedCustomer.fullName}</span>
              <StatusBadge tone="success">Aktif bayi · {priceGroupLabel(selectedCustomer.commercialProfile?.priceGroup ?? "retail")}</StatusBadge>
            </div>
          )}
          {activeDealers.length === 0 && (
            <p className="market-muted">Sipariş oluşturmak için Müşteri İşleri'nde aktif bir bayi profili oluşturun.</p>
          )}
        </div>

        <label className="market-search-field">
          <Search size={16} aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ürün ara"
            disabled={!selectedCustomer || disabled}
          />
        </label>

        <div className="market-order-product-grid">
          {filteredProducts.map((product) => {
            const preview = catalogPreviewPrice(product, selectedCustomer);
            return (
              <button
                type="button"
                className="market-sale-product interactive-surface interactive-surface--record"
                key={product.id}
                disabled={!selectedCustomer || disabled || resolvingProductId === product.id}
                onClick={() => void addProduct(product)}
              >
                <span>
                  <strong>{product.name}</strong>
                  <small>{product.sku || product.barcode || "Kod yok"}</small>
                </span>
                <b>{money(preview.value, product.currency)}</b>
                <small>{preview.label}</small>
              </button>
            );
          })}
          {filteredProducts.length === 0 && (
            <div className="market-order-product-empty">
              <ShoppingCart size={24} aria-hidden="true" />
              <strong>{search.trim() ? "Aramaya uygun ürün yok." : "Siparişe eklenebilir ürün yok."}</strong>
              <span>{search.trim() ? "Arama metnini değiştirin veya temizleyin." : "Ürünler sekmesinden aktif bir ürün ekleyin."}</span>
            </div>
          )}
        </div>

        <div className="market-order-draft">
          <header className="market-panel-heading-row">
            <div>
              <span>Taslak</span>
              <h2>Sipariş Kalemleri</h2>
              <p>{lines.length} kalem · fiyatlar kayıtta yeniden doğrulanır.</p>
            </div>
            {lines.length > 0 && (
              <ActionButton variant="secondary" size="sm" onClick={() => {
                setLines([]);
                resetDraftReference();
              }} disabled={disabled}>
                <Trash2 size={15} aria-hidden="true" /> Temizle
              </ActionButton>
            )}
          </header>

          <div className="market-order-lines">
            {lines.map((line) => (
              <div className="market-sale-cart-line" key={line.product.id}>
                <span className="market-sale-cart-product">
                  <span>
                    <strong>{line.product.name}</strong>
                    <small>
                      {money(line.pricing.unitPrice, line.pricing.currency)} · {priceGroupLabel(line.pricing.appliedGroup)}
                      {line.pricing.fallbackToRetail ? " · perakendeye düştü" : ""}
                    </small>
                  </span>
                </span>
                <div className="market-sale-quantity">
                  <ActionButton variant="secondary" fullWidth aria-label={`${line.product.name} miktarını azalt`} onClick={() => setQuantity(line.product.id, line.quantity - 1)} disabled={disabled}>
                    <Minus size={15} aria-hidden="true" />
                  </ActionButton>
                  <input
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    aria-label={`${line.product.name} miktarı`}
                    value={line.quantity}
                    onChange={(event) => setQuantity(line.product.id, Number(event.target.value))}
                    disabled={disabled}
                  />
                  <ActionButton variant="secondary" fullWidth aria-label={`${line.product.name} miktarını artır`} onClick={() => setQuantity(line.product.id, line.quantity + 1)} disabled={disabled}>
                    <Plus size={15} aria-hidden="true" />
                  </ActionButton>
                </div>
                <strong>{money(line.pricing.unitPrice * line.quantity, line.pricing.currency)}</strong>
              </div>
            ))}
            {lines.length === 0 && (
              <div className="market-sale-empty-cart">
                <ShoppingCart size={28} aria-hidden="true" />
                <p>Siparişe ürün eklemek için yukarıdan bir ürün seçin.</p>
              </div>
            )}
          </div>

          <label className="market-field">
            Sipariş notu
            <textarea
              rows={2}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                resetDraftReference();
              }}
              maxLength={4000}
              disabled={disabled}
            />
          </label>

          <div className="market-sale-totals">
            <span className="market-sale-grand-total"><small>Sipariş toplamı</small><strong>{money(subtotal, currency)}</strong></span>
          </div>

          <ActionButton
            size="lg"
            fullWidth
            busy={submitting}
            busyLabel="Sipariş kaydediliyor…"
            disabled={!selectedCustomer || lines.length === 0 || disabled}
            onClick={() => void createOrder()}
          >
            <ClipboardList size={18} aria-hidden="true" /> Siparişi Kaydet
          </ActionButton>
        </div>
      </section>

      <section className="market-panel market-order-history">
        <header className="market-panel-heading-row">
          <div>
            <span>Siparişler</span>
            <h2>Sipariş Geçmişi</h2>
            <p>{orders.length} kayıt · tüm commerce sipariş kaynakları.</p>
          </div>
          <ActionButton variant="secondary" size="sm" onClick={() => void reloadOrders()} disabled={disabled}>
            Yenile
          </ActionButton>
        </header>

        <div className="market-order-list">
          {orders.map((order) => (
            <button
              type="button"
              className={selectedOrder?.order.id === order.id
                ? "market-order-card interactive-surface interactive-surface--record is-selected"
                : "market-order-card interactive-surface interactive-surface--record"}
              key={order.id}
              onClick={() => void openOrder(order.id)}
            >
              <span>
                <strong>{order.customerName || order.buyerSnapshot?.name || "Müşterisiz sipariş"}</strong>
                <small>{new Date(order.placedAt).toLocaleString("tr-TR")} · {sourceLabel(order.source)}</small>
              </span>
              <span className="market-order-card-meta">
                <StatusBadge tone={orderStatusTone(order.status)}>{orderStatusLabel(order.status)}</StatusBadge>
                <b>{money(order.total, order.currency)}</b>
              </span>
            </button>
          ))}
          {!loadingOrders && orders.length === 0 && <p className="market-muted">Henüz sipariş kaydı yok.</p>}
        </div>

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

            {selectedOrder.order.buyerSnapshot && (
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
                  <label className="market-field">
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
