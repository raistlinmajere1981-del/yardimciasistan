import { usePageViewState } from "../../app/page-view-state";
import { AlertTriangle, Barcode, Minus, Plus, Search, ShoppingCart, Smartphone, Trash2, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CatalogCategory,
  CatalogProduct,
  CommerceSale,
  CommerceUnit,
  ProductLookupCandidate
} from "@yardimci-asistan/shared";
import { parseMoneyToMajor } from "@yardimci-asistan/shared";
import {
  createBarcodeSimulatorAdapter,
  createKeyboardBarcodeInputAdapter,
  type BarcodeScan
} from "../../app/barcode-input";
import type { DesktopCustomer } from "../../../electron/database";
import type { DesktopCommerceBridge } from "../../../electron/commerce-ipc-contract";
import { CustomerPicker } from "../customers/CustomerPicker";
import { customerCreditError, notifyCustomerCreditChanged } from "../../app/customer-credit-ui";
import { MoneyInput } from "../ui/MoneyInput";
import { ActionButton } from "../ui/ActionButton";
import { MarketProductThumbnail } from "./MarketProductThumbnail";
import type { CartDraftQuickSaleRequest, MarketQuickSaleSession } from "../../app/use-market-quick-sale-session";
import { useRequestGeneration } from "../workspace/use-request-generation";

type BarcodeMode = "keyboard-wedge" | "simulator";

interface MarketQuickSaleWorkspaceProps {
  customers?: DesktopCustomer[];
  customerCreditEnabled?: boolean;
  products: CatalogProduct[];
  categories: CatalogCategory[];
  session: MarketQuickSaleSession;
  barcodeEnabled: boolean;
  inventoryEnabled?: boolean;
  busy: boolean;
  onSaleCompleted: (sale: CommerceSale) => Promise<void> | void;
  onStateChange: (state: "success" | "error", message: string) => void;
  cartDraftRequest?: CartDraftQuickSaleRequest | null;
  onCartDraftLoaded?: (draftId: string) => Promise<void> | void;
  onCartDraftReviewed?: (draftId: string) => Promise<void> | void;
  onExternalProductFound?: (product: ProductLookupCandidate) => void;
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

let phoneScannerLeaseSequence = 0;
let phoneScannerOwner = 0;
let phoneScannerModeQueue: Promise<void> = Promise.resolve();

function acquirePhoneScanner(bridge: DesktopCommerceBridge) {
  const lease = ++phoneScannerLeaseSequence;
  phoneScannerOwner = lease;
  const operation = phoneScannerModeQueue
    .catch(() => undefined)
    .then(async () => {
      if (phoneScannerOwner !== lease) return;
      await bridge.setBarcodeScanMode(true);
    });
  phoneScannerModeQueue = operation.catch(() => undefined);
  return {
    lease,
    ready: operation.then(() => phoneScannerOwner === lease)
  };
}

function releasePhoneScanner(bridge: DesktopCommerceBridge, lease: number) {
  if (phoneScannerOwner === lease) phoneScannerOwner = 0;
  const operation = phoneScannerModeQueue
    .catch(() => undefined)
    .then(async () => {
      if (phoneScannerOwner !== 0) return;
      await bridge.setBarcodeScanMode(false);
    });
  phoneScannerModeQueue = operation.catch(() => undefined);
}

export function MarketQuickSaleWorkspace({
  customers = [],
  customerCreditEnabled = false,
  products,
  categories,
  session,
  barcodeEnabled,
  inventoryEnabled = true,
  busy,
  onSaleCompleted,
  onStateChange,
  cartDraftRequest = null,
  onCartDraftLoaded,
  onCartDraftReviewed,
  onExternalProductFound
}: MarketQuickSaleWorkspaceProps) {
  const bridge = window.yardimciDesktop?.commerce;
  const [search, setSearch] = usePageViewState("market.sale.search", "");
  const [categoryId, setCategoryId] = usePageViewState("market.sale.category", "");
  const [barcodeMode, setBarcodeMode] = usePageViewState<BarcodeMode>("market.sale.barcodeMode", "keyboard-wedge");
  const [simulatedBarcode, setSimulatedBarcode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [phoneBarcodeReady, setPhoneBarcodeReady] = useState(false);
  const [lastScanDevice, setLastScanDevice] = useState("");
  const localScanInFlight = useRef(false);
  const interactionBlocked = useRef(false);
  const mountedRef = useRef(true);
  const beginBarcodeRequest = useRequestGeneration();
  const {
    cart,
    discountTotal,
    setDiscountTotal,
    paymentMethod,
    setPaymentMethod,
    customerId,
    setCustomerId,
    sourceDraft,
    draftLoadWarnings,
    reviewRecoveryDraft,
    setReviewRecoveryDraft,
    clearReviewRecoveryDraft,
    lastSale,
    lastCreditCustomerName,
    submitting,
    saleInFlight,
    loadedDraftRequestId,
    addProduct: addSessionProduct,
    setQuantity,
    clearSale,
    startSale,
    finishSale,
    recordSale,
    applyLoadedDraft
  } = session;
  const isCredit = paymentMethod === "credit";
  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const draftLoading = Boolean(cartDraftRequest && loadedDraftRequestId.current !== cartDraftRequest.requestId);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
  const discountMajor = discountTotal.trim() === "" ? 0 : parseMoneyToMajor(discountTotal);
  const discountValid = discountMajor !== null && discountMajor >= 0;
  const discount = discountValid ? Math.max(0, Math.min(subtotal, roundMoney(discountMajor))) : 0;
  const previewTotal = roundMoney(subtotal - discount);
  const currency = cartLines[0]?.product.currency ?? "TRY";

  const addProduct = useCallback((product: CatalogProduct) => {
    const result = addSessionProduct(product);
    if (result === "currency_mismatch") {
      onStateChange("error", "Tek satışta birden fazla para birimi kullanılamaz.");
      return false;
    }
    return result === "added";
  }, [addSessionProduct, onStateChange]);

  const resolveBarcode = useCallback(async (barcode: string, source: string) => {
    if (!bridge || saleInFlight.current) return "stale" as const;
    const isCurrent = beginBarcodeRequest();
    setSearch("");
    try {
      const product = await bridge.findProductByBarcode(barcode);
      if (!isCurrent() || saleInFlight.current) return "stale" as const;
      if (!product || !product.isActive) {
        if (typeof bridge.lookupExternalProductByBarcode === "function") {
          const lookup = await bridge.lookupExternalProductByBarcode(barcode, "automatic");
          if (!isCurrent() || saleInFlight.current) return "stale" as const;
          if (lookup.status === "found") {
            const message = `${lookup.product.name} bulundu; ürün kartı hazırlanıyor.`;
            onStateChange("success", message);
            onExternalProductFound?.(lookup.product);
            return "handoff" as const;
          }
        }
        if (!isCurrent() || saleInFlight.current) return "stale" as const;
        const message = `Barkod bulunamadı: ${barcode}`;
        onStateChange("error", message);
        return "not_found" as const;
      }
      if (!isCurrent() || saleInFlight.current) return "stale" as const;
      if (addProduct(product)) {
        return "added" as const;
      }
      return "stale" as const;
    } catch (error) {
      if (!isCurrent() || saleInFlight.current) return "stale" as const;
      const message = error instanceof Error ? error.message : "Barkod okunamadı.";
      onStateChange("error", message);
      return "not_found" as const;
    }
  }, [addProduct, beginBarcodeRequest, bridge, onExternalProductFound, onStateChange, saleInFlight]);

  const handleBarcodeScan = useCallback(async (scan: BarcodeScan) => {
    if (!barcodeEnabled || busy || submitting || saleInFlight.current || draftLoading || localScanInFlight.current) return;
    localScanInFlight.current = true;
    setScanning(true);
    try {
      await resolveBarcode(scan.value, barcodeSourceLabel(scan));
    } finally {
      localScanInFlight.current = false;
      if (mountedRef.current) setScanning(false);
    }
  }, [barcodeEnabled, busy, draftLoading, resolveBarcode, saleInFlight, submitting]);

  useEffect(() => {
    if (!barcodeEnabled) {
      beginBarcodeRequest();
      return;
    }
    const adapter = barcodeMode === "simulator" ? simulatorAdapter : keyboardAdapter;
    return adapter.start((scan) => {
      void handleBarcodeScan(scan);
    });
  }, [barcodeEnabled, barcodeMode, beginBarcodeRequest, handleBarcodeScan, keyboardAdapter, simulatorAdapter]);

  useEffect(() => {
    if (!cartDraftRequest || loadedDraftRequestId.current === cartDraftRequest.requestId || !bridge) return;
    let cancelled = false;
    onStateChange("success", "Telefon sepeti güncel katalogla hazırlanıyor…");
    void bridge.loadCartDraftForQuickSale(cartDraftRequest.draftId)
      .then((result) => {
        if (cancelled) return;
        beginBarcodeRequest();
        const warnings = applyLoadedDraft(cartDraftRequest.requestId, result);
        if (!warnings) return;
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
          void onCartDraftLoaded?.(cartDraftRequest.draftId);
          onStateChange("error", error instanceof Error ? error.message : "Telefon sepeti yüklenemedi.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [applyLoadedDraft, beginBarcodeRequest, bridge, cartDraftRequest, loadedDraftRequestId, onCartDraftLoaded, onStateChange]);

  interactionBlocked.current = busy || submitting || saleInFlight.current || draftLoading;

  useEffect(() => {
    if (!barcodeEnabled || !bridge) {
      setPhoneBarcodeReady(false);
      return;
    }
    const activeBridge = bridge;
    let disposed = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const scanner = acquirePhoneScanner(activeBridge);
    setPhoneBarcodeReady(false);

    async function consume() {
      if (disposed || localScanInFlight.current || interactionBlocked.current) return;
      localScanInFlight.current = true;
      try {
        const events = await activeBridge.consumePendingBarcodeScans({ limit: 100 });
        if (disposed) return;
        for (const event of events) {
          if (disposed || interactionBlocked.current) break;
          setLastScanDevice(event.deviceId || "Bilinmeyen cihaz");
          const outcome = await resolveBarcode(event.barcode, `Telefon · ${event.deviceId || "Bilinmeyen cihaz"}`);
          if (disposed || outcome === "handoff" || outcome === "stale") break;
        }
      } catch (error) {
        if (!disposed) {
          const message = error instanceof Error ? error.message : "Telefon barkodları alınamadı.";
          onStateChange("error", message);
        }
      } finally {
        localScanInFlight.current = false;
      }
    }

    void scanner.ready
      .then((ready) => {
        if (disposed || !ready) return;
        setPhoneBarcodeReady(true);
        void consume();
        intervalId = setInterval(() => void consume(), 600);
      })
      .catch((error) => {
        if (disposed) return;
        setPhoneBarcodeReady(false);
        onStateChange("error", error instanceof Error ? error.message : "Telefon barkod kanalı hazırlanamadı.");
      });

    return () => {
      disposed = true;
      beginBarcodeRequest();
      if (intervalId) clearInterval(intervalId);
      releasePhoneScanner(activeBridge, scanner.lease);
    };
  }, [barcodeEnabled, beginBarcodeRequest, bridge, onStateChange, resolveBarcode]);

  function submitSimulatedBarcode() {
    const scan = simulatorAdapter.submit(simulatedBarcode);
    if (scan) setSimulatedBarcode("");
  }

  async function completeSale() {
    if (busy) return;
    if (!bridge) {
      onStateChange("error", "Satış kaydı kullanılamıyor. Uygulamayı yeniden başlatın.");
      return;
    }
    if (cartLines.length === 0) {
      onStateChange("error", "Satış için sepete en az bir ürün ekleyin.");
      return;
    }
    if (!discountValid) {
      onStateChange("error", "İndirim için geçerli bir tutar girin (örn. 125,50).");
      return;
    }
    if (isCredit && (!customerCreditEnabled || !selectedCustomer)) {
      onStateChange("error", "Veresiye kaydetmek için kayıtlı müşteri seçin.");
      return;
    }

    beginBarcodeRequest();
    if (!startSale()) return;

    const draftToReview = sourceDraft;
    const creditCustomerId = isCredit ? selectedCustomer!.id : "";
    const creditCustomerName = isCredit ? selectedCustomer!.fullName : "";
    const salePaymentMethod = paymentMethod;
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
        ? await bridge.createCustomerCreditSale({ ...saleInput, customerId: creditCustomerId })
        : await bridge.createPaidSale({ ...saleInput, paymentMethod: salePaymentMethod });
    } catch (error) {
      onStateChange("error", customerCreditError(error, "Satış tamamlanamadı."));
      finishSale();
      return;
    }

    recordSale(sale, creditCustomerName);
    if (sale.status === "credit") notifyCustomerCreditChanged(creditCustomerId);
    clearSale();

    try {
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
          clearReviewRecoveryDraft(draftToReview.id);
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
    } finally {
      finishSale();
    }
  }

  async function closeRecoveryDraft() {
    if (!bridge || !reviewRecoveryDraft || submitting) return;
    const recovery = reviewRecoveryDraft;
    try {
      await bridge.markCartDraftReviewed(recovery.id);
      await onCartDraftReviewed?.(recovery.id);
      clearReviewRecoveryDraft(recovery.id);
      onStateChange("success", "Telefon sepeti kapatıldı.");
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Telefon sepeti kapatılamadı.");
    }
  }

  const disabled = busy || submitting || draftLoading;

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
                  <ActionButton variant="secondary" type="button" onClick={submitSimulatedBarcode} disabled={disabled || scanning || !simulatedBarcode.trim()}>
                    Barkodu Gönder
                  </ActionButton>
                </div>
              )}
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
              className="market-sale-product interactive-surface interactive-surface--record"
              key={product.id}
              onClick={() => addProduct(product)}
              disabled={disabled}
            >
              <MarketProductThumbnail product={product} className="market-sale-product-thumb" />
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
            <p>{cartLines.length} kalem · {inventoryEnabled
              ? "fiyat ve stok satış kaydedilirken tekrar doğrulanır."
              : "fiyat satış kaydedilirken tekrar doğrulanır."}</p>
          </div>
          {cartLines.length > 0 && (
            <ActionButton variant="secondary" type="button" onClick={clearSale} disabled={disabled}>
              <Trash2 size={16} aria-hidden="true" /> Temizle
            </ActionButton>
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
              <div className="market-sale-cart-product">
                <MarketProductThumbnail product={line.product} className="market-sale-cart-thumb" />
                <span>
                  <strong>{line.product.name}</strong>
                  <small>{money(line.product.salePrice, line.product.currency)} / {unitLabels[line.product.unit]}</small>
                </span>
              </div>
              <div className="market-sale-quantity">
                <ActionButton variant="secondary" fullWidth type="button" aria-label={`${line.product.name} miktarını azalt`} onClick={() => setQuantity(line.product.id, line.quantity - 1)} disabled={disabled}>
                  <Minus size={15} aria-hidden="true" />
                </ActionButton>
                <input type="number" min="0.0001" step="0.0001" aria-label={`${line.product.name} miktarı`} value={line.quantity} onChange={(event) => setQuantity(line.product.id, Number(event.target.value))} disabled={disabled} />
                <ActionButton variant="secondary" fullWidth type="button" aria-label={`${line.product.name} miktarını artır`} onClick={() => setQuantity(line.product.id, line.quantity + 1)} disabled={disabled}>
                  <Plus size={15} aria-hidden="true" />
                </ActionButton>
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
            <MoneyInput value={discountTotal} onChange={setDiscountTotal} disabled={disabled} />
          </label>
        </div>
        {!discountValid && <p role="alert" className="market-muted">İndirim için geçerli bir tutar girin (örn. 125,50).</p>}

        {customerCreditEnabled && isCredit && (
          <CustomerPicker customers={customers} value={customerId} onChange={setCustomerId} disabled={disabled} />
        )}

        <div className="market-sale-totals">
          <span><small>Ara toplam</small><strong>{money(subtotal, currency)}</strong></span>
          <span><small>İndirim</small><strong>-{money(discount, currency)}</strong></span>
          <span className="market-sale-grand-total"><small>{isCredit ? "Veresiye tutarı" : "Ödenecek"}</small><strong>{money(previewTotal, currency)}</strong></span>
        </div>

        <ActionButton
          size="lg"
          fullWidth
          busy={submitting}
          busyLabel="Satış işleniyor…"
          type="button"
          onClick={() => void completeSale()}
          disabled={disabled || !discountValid || cartLines.length === 0 || (isCredit && (!customerCreditEnabled || !selectedCustomer || previewTotal <= 0))}
        >
          <WalletCards size={18} aria-hidden="true" />
          {isCredit ? "Satışı Veresiye Kaydet" : "Ödemeyi Al ve Satışı Tamamla"}
        </ActionButton>

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
            <ActionButton variant="secondary" type="button" onClick={() => void closeRecoveryDraft()} disabled={disabled}>
              Taslağı Kapat
            </ActionButton>
          </div>
        )}
      </section>
    </div>
  );
}
