import { AlertTriangle, Barcode, Minus, Plus, Search, ShoppingCart, Smartphone, Trash2, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CatalogCategory,
  CatalogProduct,
  CommerceSale,
  CommerceSaleDraft,
  CommerceUnit,
  ProductLookupCandidate
} from "@yardimci-asistan/shared";
import {
  createBarcodeSimulatorAdapter,
  createKeyboardBarcodeInputAdapter,
  type BarcodeScan
} from "../../app/barcode-input";
import type { DesktopCustomer } from "../../../electron/database";
import { CustomerPicker } from "../customers/CustomerPicker";
import { customerCreditError, notifyCustomerCreditChanged } from "../../app/customer-credit-ui";

interface CartLine {
  product: CatalogProduct;
  quantity: number;
}

type BarcodeMode = "keyboard-wedge" | "simulator";

interface MarketQuickSaleWorkspaceProps {
  customers?: DesktopCustomer[];
  customerCreditEnabled?: boolean;
  products: CatalogProduct[];
  categories: CatalogCategory[];
  barcodeEnabled: boolean;
  busy: boolean;
  onSaleCompleted: (sale: CommerceSale) => Promise<void> | void;
  onStateChange: (state: "success" | "error", message: string) => void;
  cartDraftRequest?: CartDraftQuickSaleRequest | null;
  onCartDraftLoaded?: (draftId: string) => Promise<void> | void;
  onCartDraftReviewed?: (draftId: string) => Promise<void> | void;
  onExternalProductFound?: (product: ProductLookupCandidate) => void;
}

export interface CartDraftQuickSaleRequest {
  requestId: number;
  draftId: string;
}

const unitLabels: Record<CommerceUnit, string> = {
  piece: "adet",
  kg: "kg",
  g: "g",
  l: "litre",
  ml: "ml",
  pack: "paket",
  box: "kutu",
  meter: "metre",
  other: "birim"
};

const paymentMethodLabels: Record<string, string> = {
  cash: "Nakit",
  card: "Kart",
  transfer: "Havale / EFT",
  other: "Diğer"
};

function paymentMethodLabel(value: string) {
  return paymentMethodLabels[value] ?? value;
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function money(value: number, currency = "TRY") {
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function barcodeSourceLabel(scan: BarcodeScan) {
  if (scan.source === "keyboard-wedge") return "USB okuyucu";
  if (scan.source === "simulator") return "Simülatör";
  return "Kamera";
}

export function MarketQuickSaleWorkspace({
  customers = [],
  customerCreditEnabled = false,
  products,
  categories,
  barcodeEnabled,
  busy,
  onSaleCompleted,
  onStateChange,
  cartDraftRequest = null,
  onCartDraftLoaded,
  onCartDraftReviewed,
  onExternalProductFound
}: MarketQuickSaleWorkspaceProps) {
  const bridge = window.yardimciDesktop?.commerce;
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountTotal, setDiscountTotal] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [lastSale, setLastSale] = useState<CommerceSale | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [lastCreditCustomerName, setLastCreditCustomerName] = useState("");
  const saleInFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [barcodeMode, setBarcodeMode] = useState<BarcodeMode>("keyboard-wedge");
  const [simulatedBarcode, setSimulatedBarcode] = useState("");
  const [barcodeMessage, setBarcodeMessage] = useState("USB okuyucu hazır; barkodu okutun.");
  const [scanning, setScanning] = useState(false);
  const [phoneBarcodeReady, setPhoneBarcodeReady] = useState(false);
  const [lastScanDevice, setLastScanDevice] = useState("");
  const [sourceDraft, setSourceDraft] = useState<CommerceSaleDraft | null>(null);
  const [draftLoadWarnings, setDraftLoadWarnings] = useState<string[]>([]);
  const [reviewRecoveryDraft, setReviewRecoveryDraft] = useState<CommerceSaleDraft | null>(null);
  const cartRef = useRef<CartLine[]>([]);
  const localScanInFlight = useRef(false);
  const loadedDraftRequestId = useRef<number | null>(null);
  const interactionBlocked = useRef(false);
  const isCredit = paymentMethod === "credit";
  const selectedCustomer = customers.find((customer) => customer.id === customerId);

  useEffect(() => {
    if (!customerCreditEnabled) {
      setPaymentMethod((current) => current === "credit" ? "cash" : current);
      setCustomerId("");
    }
  }, [customerCreditEnabled]);

  const simulatorAdapter = useMemo(() => createBarcodeSimulatorAdapter(), []);
  const keyboardAdapter = useMemo(() => createKeyboardBarcodeInputAdapter(), []);
  const activeProducts = useMemo(
    () => products.filter((product) => product.isActive),
    [products]
  );
  const cartCurrency = cart
    .map((line) => line.product.currency)
    .find((value): value is string => Boolean(value)) ?? "";

  const filteredProducts = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    return activeProducts.filter((product) => {
      if (categoryId && product.categoryId !== categoryId) return false;
      if (cartCurrency && product.currency !== cartCurrency) return false;
      if (!needle) return true;
      return [product.name, product.sku, product.barcode]
        .some((value) => value.toLocaleLowerCase("tr-TR").includes(needle));
    });
  }, [activeProducts, cartCurrency, categoryId, search]);

  const cartLines = cart;
  const subtotal = roundMoney(cartLines.reduce(
    (sum, line) => sum + (line.product.salePrice * line.quantity),
    0
  ));
  const discount = Math.max(0, Math.min(subtotal, roundMoney(Number(discountTotal) || 0)));
  const previewTotal = roundMoney(subtotal - discount);
  const currency = cartLines[0]?.product.currency ?? "TRY";

  const replaceCart = useCallback((next: CartLine[]) => {
    cartRef.current = next;
    setCart(next);
  }, []);

  const addProduct = useCallback((product: CatalogProduct) => {
    const current = cartRef.current;
    const currentCurrency = current[0]?.product.currency ?? "";
    if (currentCurrency && product.currency !== currentCurrency) {
      onStateChange("error", "Tek satışta birden fazla para birimi kullanılamaz.");
      return false;
    }
    const existing = current.find((line) => line.product.id === product.id);
    const next = existing
      ? current.map((line) => line.product.id === product.id
        ? { ...line, product, quantity: roundQuantity(line.quantity + 1) }
        : line)
      : [...current, { product, quantity: 1 }];
    replaceCart(next);
    return true;
  }, [onStateChange, replaceCart]);

  const resolveBarcode = useCallback(async (barcode: string, source: string) => {
    if (!bridge) return;
    setSearch("");
    setBarcodeMessage(`${source}: ${barcode} aranıyor…`);
    try {
      const product = await bridge.findProductByBarcode(barcode);
      if (!product || !product.isActive) {
        if (typeof bridge.lookupExternalProductByBarcode === "function") {
          const lookup = await bridge.lookupExternalProductByBarcode(barcode, "automatic");
          if (lookup.status === "found") {
            const message = `${lookup.product.name} bulundu; ürün kartı hazırlanıyor.`;
            setBarcodeMessage(message);
            onStateChange("success", message);
            onExternalProductFound?.(lookup.product);
            return;
          }
        }
        const message = `Barkod bulunamadı: ${barcode}`;
        setBarcodeMessage(message);
        onStateChange("error", message);
        return;
      }
      if (addProduct(product)) {
        setBarcodeMessage(`${product.name} sepete eklendi · ${source}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Barkod okunamadı.";
      setBarcodeMessage(message);
      onStateChange("error", message);
    }
  }, [addProduct, bridge, onExternalProductFound, onStateChange]);

  const handleBarcodeScan = useCallback(async (scan: BarcodeScan) => {
    if (!barcodeEnabled || busy || submitting || localScanInFlight.current) return;
    localScanInFlight.current = true;
    setScanning(true);
    try {
      await resolveBarcode(scan.value, barcodeSourceLabel(scan));
    } finally {
      localScanInFlight.current = false;
      setScanning(false);
    }
  }, [barcodeEnabled, busy, resolveBarcode, submitting]);

  useEffect(() => {
    if (!barcodeEnabled) return;
    const adapter = barcodeMode === "simulator" ? simulatorAdapter : keyboardAdapter;
    setBarcodeMessage(barcodeMode === "simulator"
      ? "Simülatör hazır; test barkodunu girin."
      : "USB okuyucu hazır; barkodu okutun.");
    return adapter.start((scan) => {
      void handleBarcodeScan(scan);
    });
  }, [barcodeEnabled, barcodeMode, handleBarcodeScan, keyboardAdapter, simulatorAdapter]);

  useEffect(() => {
    if (!cartDraftRequest || loadedDraftRequestId.current === cartDraftRequest.requestId || !bridge) return;
    let cancelled = false;
    onStateChange("success", "Telefon sepeti güncel katalogla hazırlanıyor…");
    void bridge.loadCartDraftForQuickSale(cartDraftRequest.draftId)
      .then((result) => {
        if (cancelled) return;
        loadedDraftRequestId.current = cartDraftRequest.requestId;
        const warnings = result.skippedItems.map(
          (item) => `${item.productName || item.productId} ürünü artık aktif olmadığı için sepete eklenmedi.`
        );
        replaceCart(result.items.map((item) => ({ product: item.product, quantity: item.quantity })));
        setDiscountTotal("0");
        setPaymentMethod("cash");
        setCustomerId("");
        setSourceDraft(result.draft);
        setDraftLoadWarnings(warnings);
        setLastSale(null);
        void onCartDraftLoaded?.(result.draft.id);
        onStateChange(
          "success",
          warnings.length > 0
            ? warnings.join(" ")
            : "Telefon sepeti Hızlı Satış'a yüklendi; satış kaydedilene kadar taslak açık kalır."
        );
      })
      .catch((error) => {
        if (!cancelled) {
          onStateChange("error", error instanceof Error ? error.message : "Telefon sepeti yüklenemedi.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bridge, cartDraftRequest, onCartDraftLoaded, onStateChange, replaceCart]);

  interactionBlocked.current = busy || submitting;

  useEffect(() => {
    if (!barcodeEnabled || !bridge) {
      setPhoneBarcodeReady(false);
      return;
    }
    const activeBridge = bridge;
    let disposed = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    setPhoneBarcodeReady(false);

    async function consume() {
      if (disposed || localScanInFlight.current || interactionBlocked.current) return;
      localScanInFlight.current = true;
      try {
        const events = await activeBridge.consumePendingBarcodeScans({ limit: 100 });
        for (const event of events) {
          setLastScanDevice(event.deviceId || "Bilinmeyen cihaz");
          await resolveBarcode(event.barcode, `Telefon · ${event.deviceId || "Bilinmeyen cihaz"}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Telefon barkodları alınamadı.";
        onStateChange("error", message);
      } finally {
        localScanInFlight.current = false;
      }
    }

    void activeBridge.setBarcodeScanMode(true)
      .then(() => {
        if (disposed) {
          return activeBridge.setBarcodeScanMode(false).then(() => undefined);
        }
        setPhoneBarcodeReady(true);
        void consume();
        intervalId = setInterval(() => void consume(), 600);
        return undefined;
      })
      .catch((error) => {
        if (disposed) return;
        setPhoneBarcodeReady(false);
        onStateChange("error", error instanceof Error ? error.message : "Telefon barkod kanalı hazırlanamadı.");
      });

    return () => {
      disposed = true;
      if (intervalId) clearInterval(intervalId);
      void activeBridge.setBarcodeScanMode(false).catch(() => undefined);
    };
  }, [barcodeEnabled, bridge, onStateChange, resolveBarcode]);

  function setQuantity(productId: string, quantityInput: number) {
    const quantity = roundQuantity(quantityInput);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      replaceCart(cartRef.current.filter((line) => line.product.id !== productId));
      return;
    }
    replaceCart(cartRef.current.map((line) => line.product.id === productId
      ? { ...line, quantity }
      : line));
  }

  function clearSale() {
    replaceCart([]);
    setDiscountTotal("0");
    setPaymentMethod("cash");
    setCustomerId("");
    setSourceDraft(null);
    setDraftLoadWarnings([]);
  }

  function submitSimulatedBarcode() {
    const scan = simulatorAdapter.submit(simulatedBarcode);
    if (scan) setSimulatedBarcode("");
  }

  async function completeSale() {
    if (saleInFlight.current || busy) return;
    if (!bridge) {
      onStateChange("error", "Satış kaydı kullanılamıyor. Uygulamayı yeniden başlatın.");
      return;
    }
    if (cartLines.length === 0) {
      onStateChange("error", "Satış için sepete en az bir ürün ekleyin.");
      return;
    }
    if (isCredit && (!customerCreditEnabled || !selectedCustomer)) {
      onStateChange("error", "Veresiye kaydetmek için kayıtlı müşteri seçin.");
      return;
    }

    const draftToReview = sourceDraft;
    saleInFlight.current = true;
    setSubmitting(true);
    let sale: CommerceSale;
    try {
      const saleInput = {
        items: cartLines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity
        })),
        discountTotal: discount,
        source: "desktop-market-quick-sale"
      };
      sale = isCredit
        ? await bridge.createCustomerCreditSale({ ...saleInput, customerId: selectedCustomer!.id })
        : await bridge.createPaidSale({ ...saleInput, paymentMethod });
    } catch (error) {
      onStateChange("error", customerCreditError(error, "Satış tamamlanamadı."));
      saleInFlight.current = false;
      setSubmitting(false);
      return;
    }

    setLastSale(sale);
    setLastCreditCustomerName(sale.status === "credit" ? selectedCustomer?.fullName ?? "" : "");
    if (sale.status === "credit") notifyCustomerCreditChanged(customerId);
    clearSale();
    try {
      await onSaleCompleted(sale);
    } catch {
      onStateChange("success", sale.status === "credit"
        ? "Veresiye satış kaydedildi ancak katalog görünümü yenilenemedi."
        : "Satış tamamlandı ancak katalog görünümü yenilenemedi.");
    }
    if (draftToReview) {
      try {
        await bridge.markCartDraftReviewed(draftToReview.id);
        await onCartDraftReviewed?.(draftToReview.id);
        setReviewRecoveryDraft(null);
        onStateChange("success", sale.status === "credit"
          ? "Veresiye satış kaydedildi ve telefon sepeti kapatıldı."
          : "Satış tamamlandı ve telefon sepeti kapatıldı.");
      } catch {
        setReviewRecoveryDraft(draftToReview);
        onStateChange("success", sale.status === "credit"
          ? "Veresiye satış kaydedildi ancak telefon sepeti kapatılamadı."
          : "Satış tamamlandı ancak telefon sepeti kapatılamadı.");
      }
    }
    saleInFlight.current = false;
    setSubmitting(false);
  }

  async function closeRecoveryDraft() {
    if (!bridge || !reviewRecoveryDraft) return;
    try {
      await bridge.markCartDraftReviewed(reviewRecoveryDraft.id);
      await onCartDraftReviewed?.(reviewRecoveryDraft.id);
      setReviewRecoveryDraft(null);
      onStateChange("success", "Telefon sepeti kapatıldı.");
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Telefon sepeti kapatılamadı.");
    }
  }

  const disabled = busy || submitting;

  return (
    <div className="market-quick-sale-layout">
      <section className="market-panel market-sale-catalog">
        <header className="market-panel-heading">
          <span>Satış</span>
          <h2>Ürün Ekle</h2>
          <p>Ürün seçin, arayın veya etkinse barkod girişini kullanın.</p>
        </header>

        {barcodeEnabled && (
          <div className="market-barcode-stack">
            <section className={`market-phone-barcode-panel${phoneBarcodeReady ? " is-active" : ""}`} aria-label="Telefon barkod kanalı">
              <div>
                <span><Smartphone size={17} aria-hidden="true" /><strong>Telefon Kamerası</strong></span>
                <small>
                  Hızlı Satış açıkken telefondaki Kasa Barkod Modu otomatik dinlenir; masaüstünde ayrıca mod açmanız gerekmez.
                  Tarama ürünü bu sepete ekler, ödeme yine masaüstünde tamamlanır.
                </small>
              </div>
              <small className="market-phone-device">
                {phoneBarcodeReady ? "Hazır" : "Bağlanıyor…"}
                {lastScanDevice ? ` · Son cihaz: ${lastScanDevice}` : ""}
              </small>
            </section>

            <section className="market-barcode-panel" aria-label="Barkod girişi">
              <div className="market-barcode-heading">
                <span><Barcode size={17} aria-hidden="true" /><strong>USB / Test Barkod Girişi</strong></span>
                <select value={barcodeMode} onChange={(event) => setBarcodeMode(event.target.value as BarcodeMode)} disabled={disabled || scanning}>
                  <option value="keyboard-wedge">USB Klavye Okuyucu</option>
                  <option value="simulator">Simülatör</option>
                </select>
              </div>
              {barcodeMode === "simulator" && (
                <div className="market-barcode-simulator">
                  <input
                    value={simulatedBarcode}
                    onChange={(event) => setSimulatedBarcode(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") submitSimulatedBarcode();
                    }}
                    placeholder="Test barkodu"
                    disabled={disabled || scanning}
                  />
                  <button type="button" className="market-secondary-button" onClick={submitSimulatedBarcode} disabled={disabled || scanning || !simulatedBarcode.trim()}>
                    Barkodu Gönder
                  </button>
                </div>
              )}
              <small className="market-barcode-status" role="status" aria-live="polite">{barcodeMessage}</small>
            </section>
          </div>
        )}

        <div className="market-sale-filters">
          <label className="market-search-field">
            <Search size={16} aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ürün ara"
            />
          </label>
          <label className="market-field">
            Kategori
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Tümü</option>
              {categories.filter((category) => category.isActive).map((category) => (
                <option value={category.id} key={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="market-sale-product-grid">
          {filteredProducts.map((product) => (
            <button
              type="button"
              className="market-sale-product"
              key={product.id}
              onClick={() => addProduct(product)}
              disabled={disabled}
            >
              <span>
                <strong>{product.name}</strong>
                <small>{product.sku || product.barcode || "Kod yok"}</small>
              </span>
              <b>{money(product.salePrice, product.currency)}</b>
            </button>
          ))}
          {filteredProducts.length === 0 && (
            <p className="market-muted">Bu filtrelerle satılabilir ürün bulunamadı.</p>
          )}
        </div>
      </section>

      <section className="market-panel market-sale-cart">
        <header className="market-panel-heading market-panel-heading-row">
          <div>
            <span>Sepet</span>
            <h2>Hızlı Satış</h2>
            <p>{cartLines.length} kalem · fiyat ve stok satış kaydedilirken tekrar doğrulanır.</p>
          </div>
          {cartLines.length > 0 && (
            <button type="button" className="market-secondary-button" onClick={clearSale} disabled={disabled}>
              <Trash2 size={16} aria-hidden="true" /> Temizle
            </button>
          )}
        </header>

        {sourceDraft && (
          <aside className="market-draft-reference" aria-label="Telefon sepeti kaynağı">
            <strong>Telefon sepetinden hazırlanıyor</strong>
            <span>{sourceDraft.createdByDevice || sourceDraft.source || "Telefon"} · {new Date(sourceDraft.createdAt).toLocaleString("tr-TR")}</span>
            {sourceDraft.note && <p>{sourceDraft.note}</p>}
            <small>Sepeti temizlemek veya başka taslağa geçmek bu kaydı kapatmaz. Başarılı satıştan sonra kaynak sepet kapanır.</small>
            {draftLoadWarnings.map((warning) => <em key={warning}>{warning}</em>)}
          </aside>
        )}

        <div className="market-sale-cart-lines">
          {cartLines.map((line) => (
            <div className="market-sale-cart-line" key={line.product.id}>
              <div>
                <strong>{line.product.name}</strong>
                <small>{money(line.product.salePrice, line.product.currency)} / {unitLabels[line.product.unit]}</small>
              </div>
              <div className="market-sale-quantity">
                <button type="button" aria-label={`${line.product.name} miktarını azalt`} onClick={() => setQuantity(line.product.id, line.quantity - 1)} disabled={disabled}>
                  <Minus size={15} aria-hidden="true" />
                </button>
                <input type="number" min="0.0001" step="0.0001" aria-label={`${line.product.name} miktarı`} value={line.quantity} onChange={(event) => setQuantity(line.product.id, Number(event.target.value))} disabled={disabled} />
                <button type="button" aria-label={`${line.product.name} miktarını artır`} onClick={() => setQuantity(line.product.id, line.quantity + 1)} disabled={disabled}>
                  <Plus size={15} aria-hidden="true" />
                </button>
              </div>
              <strong>{money(line.product.salePrice * line.quantity, line.product.currency)}</strong>
            </div>
          ))}
          {cartLines.length === 0 && (
            <div className="market-sale-empty-cart">
              <ShoppingCart size={28} aria-hidden="true" />
              <p>Satışa başlamak için soldan ürün ekleyin.</p>
            </div>
          )}
        </div>

        <div className="market-sale-payment">
          <label className="market-field">
            Ödeme yöntemi
            <select aria-label="Ödeme yöntemi" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} disabled={disabled}>
              <option value="cash">Nakit</option>
              <option value="card">Kart</option>
              <option value="transfer">Havale / EFT</option>
              <option value="other">Diğer</option>
              {customerCreditEnabled && <option value="credit">Veresiye</option>}
            </select>
          </label>
          <label className="market-field">
            İndirim
            <input type="number" min="0" step="0.01" value={discountTotal} onChange={(event) => setDiscountTotal(event.target.value)} disabled={disabled} />
          </label>
        </div>

        {customerCreditEnabled && isCredit && (
          <CustomerPicker customers={customers} value={customerId} onChange={setCustomerId} disabled={disabled} />
        )}

        <div className="market-sale-totals">
          <span><small>Ara toplam</small><strong>{money(subtotal, currency)}</strong></span>
          <span><small>İndirim</small><strong>-{money(discount, currency)}</strong></span>
          <span className="market-sale-grand-total"><small>{isCredit ? "Veresiye tutarı" : "Ödenecek"}</small><strong>{money(previewTotal, currency)}</strong></span>
        </div>

        <button type="button" className="market-sale-complete" onClick={() => void completeSale()} disabled={disabled || cartLines.length === 0 || (isCredit && (!customerCreditEnabled || !selectedCustomer || previewTotal <= 0))}>
          <WalletCards size={18} aria-hidden="true" />
          {submitting ? "Satış işleniyor…" : isCredit ? "Satışı Veresiye Kaydet" : "Ödemeyi Al ve Satışı Tamamla"}
        </button>

        {lastSale && (
          <div className="market-sale-receipt" role="status">
            <strong>{lastSale.status === "credit" ? "Veresiye satış kaydedildi." : "Satış tamamlandı"}</strong>
            {lastSale.status === "credit" ? <>
              <span>{lastCreditCustomerName}</span>
              <span>Müşteri hesabına {money(lastSale.total, lastSale.currency)} borç işlendi.</span>
            </> : <span>{money(lastSale.total, lastSale.currency)} · {paymentMethodLabel(lastSale.paymentMethod)}</span>}
          </div>
        )}

        {reviewRecoveryDraft && (
          <div className="market-sale-review-recovery" role="status">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>
              <strong>{lastSale?.status === "credit" ? "Veresiye satış kaydedildi ancak telefon sepeti kapatılamadı." : "Satış tamamlandı ancak telefon sepeti kapatılamadı."}</strong>
              <small>Satış kaydı korundu. Kaynak sepeti kapatmak için yeniden deneyebilirsiniz.</small>
            </span>
            <button type="button" className="market-secondary-button" onClick={() => void closeRecoveryDraft()} disabled={disabled}>
              Taslağı Kapat
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
