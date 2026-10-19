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
import type { CompleteMarketSaleResult } from "../../../electron/market-sale-operation";
import { CustomerPicker } from "../customers/CustomerPicker";
import { customerCreditError, notifyCustomerCreditChanged } from "../../app/customer-credit-ui";
import { MoneyInput } from "../ui/MoneyInput";
import { ActionButton } from "../ui/ActionButton";
import { MarketProductThumbnail } from "./MarketProductThumbnail";
import type { CartDraftQuickSaleRequest, MarketQuickSaleSession } from "../../app/use-market-quick-sale-session";
import { useRequestGeneration } from "../workspace/use-request-generation";
import { ChoiceChips } from "../ui/ChoiceChips";
import { MarketSaleQuantityInput } from "./MarketSaleQuantityInput";
import { readSaleProductViewPreference, saveSaleProductViewPreference, type SaleProductViewPreference, type SaleProductViewPreset } from "../../ui-preferences";

type BarcodeMode = "keyboard-wedge" | "simulator";

interface MarketQuickSaleWorkspaceProps {
  customers?: DesktopCustomer[];
  customerCreditEnabled?: boolean;
  customerSelectionEnabled?: boolean;
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
  customerSelectionEnabled = customerCreditEnabled,
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
  const [productView, setProductView] = useState(readSaleProductViewPreference);
  const [catalogPrices, setCatalogPrices] = useState<{ customerId: string; prices: Map<string, number> } | null>(null);
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
  const { pricesReady, priceError, prepareSaleOperation, refreshPrices } = session;
  const isCredit = paymentMethod === "credit";
  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const draftLoading = Boolean(cartDraftRequest && loadedDraftRequestId.current !== cartDraftRequest.requestId);

  useEffect(() => { refreshPrices(); }, [refreshPrices, selectedCustomer?.updatedAt]);

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

  useEffect(() => {
    if (!bridge?.resolveProductPrice) return;
    let current = true;
    setCatalogPrices(null);
    void Promise.all(activeProducts.map(product => bridge.resolveProductPrice({ productId: product.id, customerId })))
      .then(prices => { if (current) setCatalogPrices({ customerId, prices: new Map(prices.map(price => [price.productId, price.unitPrice])) }); })
      .catch(() => { if (current) setCatalogPrices(null); });
    return () => { current = false; };
  }, [activeProducts, bridge, customerId, selectedCustomer?.updatedAt, session.pricingContext]);

  function changeProductView(next: SaleProductViewPreference) { setProductView(next); saveSaleProductViewPreference(next); }
  const cartCurrency = cart
    .map((line) => line.product.currency)
    .find((value): value is string => Boolean(value)) ?? "";

  const filteredProducts = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    return activeProducts.filter((product) => {
      if (categoryId === "quickAccess" ? !product.quickAccessEnabled : categoryId && product.categoryId !== categoryId) return false;
      if (cartCurrency && product.currency !== cartCurrency) return false;
      if (!needle) return true;
      return [product.name, product.sku, product.barcode]
        .some((value) => value.toLocaleLowerCase("tr-TR").includes(needle));
    }).sort((a, b) => categoryId === "quickAccess" ? (a.quickAccessOrder ?? 0) - (b.quickAccessOrder ?? 0) : 0);
  }, [activeProducts, cartCurrency, categoryId, search]);

  const cartLines = cart;
  const subtotal = roundMoney(cartLines.reduce(
    (sum, line) => sum + roundMoney((line.price?.customerId === customerId ? line.price.unitPrice : 0) * line.quantity),
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

  const resolveBarcode = useCallback(async (barcode: string, _source: string) => {
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
  }, [addProduct, beginBarcodeRequest, bridge, onExternalProductFound, onStateChange, saleInFlight, setSearch]);

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
    if (busy || !pricesReady) return;
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
    let operation: CompleteMarketSaleResult;
    try {
      const saleInput = {
        items: cartLines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity
        })),
        discountTotal: discount,
        source: "desktop-market-quick-sale"
      };
      operation = await bridge.completeMarketSale({ ...saleInput,
        settlement: isCredit ? "credit" : "paid", customerId,
        paymentMethod: salePaymentMethod, ...(draftToReview?.id ? { sourceDraftId: draftToReview.id } : {}),
        operationId: prepareSaleOperation({ ...saleInput, settlement: isCredit ? "credit" : "paid", customerId, paymentMethod: salePaymentMethod, sourceDraftId: draftToReview?.id }) });
    } catch (error) {
      onStateChange("error", customerCreditError(error, "Satış tamamlanamadı."));
      finishSale();
      return;
    }

    const sale = operation.sale;
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
        if (operation.draftReview === "reviewed") {
          clearReviewRecoveryDraft(draftToReview.id);
          try { await onCartDraftReviewed?.(draftToReview.id); } catch {
            onStateChange("success", "Satış ve telefon sepeti kapanışı kaydedildi ancak görünüm yenilenemedi.");
          }
          onStateChange("success", sale.status === "credit"
            ? "Veresiye satış kaydedildi ve telefon sepeti kapatıldı."
            : "Satış tamamlandı ve telefon sepeti kapatıldı.");
        } else {
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
        <div className="market-sale-toolbar">
          <label className="market-search-field"><Search size={16} aria-hidden="true" /><input aria-label="Ürün ara" value={search} onChange={event => setSearch(event.target.value)} placeholder="Ürün ara" /></label>
          {barcodeEnabled && <>
            <section className="market-barcode-panel" aria-label="Barkod girişi">
              <label className="market-barcode-heading"><Barcode size={17} aria-hidden="true" />
                <select aria-label="Barkod kaynağı" value={barcodeMode} onChange={event => setBarcodeMode(event.target.value as BarcodeMode)} disabled={disabled || scanning}>
                  <option value="keyboard-wedge">USB okuyucu</option><option value="simulator">Test barkodu</option>
                </select>
              </label>
            </section>
            <span className="market-phone-status" role="status" aria-label="Telefon barkod kanalı" title={lastScanDevice ? `Son cihaz: ${lastScanDevice}` : undefined}><Smartphone size={16} aria-hidden="true" />Telefon {phoneBarcodeReady ? "hazır" : "bağlanıyor…"}</span>
          </>}
        </div>
        {barcodeEnabled && barcodeMode === "simulator" && (
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
        <div className="market-sale-browse-tools">
          <ChoiceChips ariaLabel="Ürün kategorileri" className="market-category-chips" value={categoryId} onChange={setCategoryId} options={[{ id: "", label: "Tümü" }, { id: "quickAccess", label: "Hızlı Erişim" }, ...categories.filter(category => category.isActive).map(category => ({ id: category.id, label: category.name }))]} />
          <label className="form-field form-field--fluid">Ürün görünümü<select aria-label="Ürün görünümü" value={productView.preset} onChange={event => changeProductView({ ...productView, preset: event.target.value as SaleProductViewPreset })}>
            <option value="comfortable">Rahat</option><option value="balanced">Dengeli</option><option value="dense">Yoğun</option><option value="list">Liste</option><option value="custom">Özel</option>
          </select></label>
        </div>
        {productView.preset === "custom" && <div className="market-sale-custom-view" aria-label="Özel ürün görünümü">
          <label className="form-field form-field--fluid">Sütun<select aria-label="Ürün sütun sayısı" value={productView.columns} onChange={event => changeProductView({ ...productView, columns: Number(event.target.value) })}>{[2, 3, 4, 5, 6].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="form-check"><input type="checkbox" checked={productView.showImages} onChange={event => changeProductView({ ...productView, showImages: event.target.checked })} /> Görsel göster</label>
          <label className="form-check"><input type="checkbox" checked={productView.emphasizePrice} onChange={event => changeProductView({ ...productView, emphasizePrice: event.target.checked })} /> Fiyatı vurgula</label>
        </div>}
        <div className={`market-sale-product-grid market-sale-product-grid--${productView.preset}${productView.preset === "custom" && !productView.emphasizePrice ? " market-sale-product-grid--quiet-price" : ""}`} data-columns={productView.columns}>
          {filteredProducts.map((product) => (
            <button
              type="button"
              className="market-sale-product interactive-surface interactive-surface--record"
              key={product.id}
              onClick={() => addProduct(product)}
              disabled={disabled}
            >
              {(productView.preset !== "custom" || productView.showImages) && <MarketProductThumbnail product={product} className="market-sale-product-thumb" />}
              <span>
                <strong>{product.name}</strong>
                <small>{product.sku || product.barcode || "Kod yok"}</small>
              </span>
              <b>{catalogPrices?.customerId === customerId && catalogPrices.prices.has(product.id) ? money(catalogPrices.prices.get(product.id)!, product.currency) : "—"}</b>
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
                  <small>{pricesReady ? money(line.price!.unitPrice, line.price!.currency) : "—"} / {unitLabels[line.product.unit]}</small>
                </span>
              </div>
              <div className="market-sale-quantity">
                <ActionButton variant="secondary" fullWidth type="button" aria-label={`${line.product.name} miktarını azalt`} onClick={() => setQuantity(line.product.id, line.quantity - 1)} disabled={disabled}>
                  <Minus size={15} aria-hidden="true" />
                </ActionButton>
                <MarketSaleQuantityInput name={line.product.name} quantity={line.quantity} unit={line.product.unit} onChange={quantity => setQuantity(line.product.id, quantity)} disabled={disabled} />
                <ActionButton variant="secondary" fullWidth type="button" aria-label={`${line.product.name} miktarını artır`} onClick={() => setQuantity(line.product.id, line.quantity + 1)} disabled={disabled}>
                  <Plus size={15} aria-hidden="true" />
                </ActionButton>
              </div>
              <strong>{pricesReady ? money(line.price!.unitPrice * line.quantity, line.price!.currency) : "—"}</strong>
            </div>
          ))}
          {cartLines.length === 0 && (
            <div className="market-sale-empty-cart">
              <ShoppingCart size={28} aria-hidden="true" />
              <p>Satışa başlamak için soldan ürün ekleyin.</p>
            </div>
          )}
        </div>

        <div className="market-sale-checkout-fields">
          <div className="market-sale-payment">
            <ChoiceChips ariaLabel="Ödeme yöntemi" value={paymentMethod} onChange={setPaymentMethod} disabled={disabled} options={[...Object.entries(paymentMethodLabels).map(([id, label]) => ({ id, label })), ...(customerCreditEnabled ? [{ id: "credit", label: "Veresiye" }] : [])]} />
            <label className="form-field form-field--fluid">
              İndirim
              <MoneyInput value={discountTotal} onChange={setDiscountTotal} disabled={disabled} />
            </label>
          </div>
          {!discountValid && <p role="alert" className="market-muted">İndirim için geçerli bir tutar girin (örn. 125,50).</p>}

          {customerSelectionEnabled && (
            <CustomerPicker compact currency={currency} showDebt={isCredit && customerCreditEnabled} customers={customers} value={customerId} onChange={setCustomerId} disabled={disabled} />
          )}
          {priceError && <p role="alert">{priceError}</p>}

          <div className="market-sale-totals">
            <span><small>Ara toplam</small><strong>{pricesReady ? money(subtotal, currency) : "Fiyatlar güncelleniyor…"}</strong></span>
            <span><small>İndirim</small><strong>-{money(discount, currency)}</strong></span>
            <span className="market-sale-grand-total"><small>{isCredit ? "Yeni veresiye tutarı" : "Ödenecek"}</small><strong>{pricesReady ? money(previewTotal, currency) : "—"}</strong></span>
          </div>
        </div>

        <ActionButton
          size="lg"
          fullWidth
          busy={submitting}
          busyLabel="Satış işleniyor…"
          type="button"
          onClick={() => void completeSale()}
          disabled={disabled || !pricesReady || !discountValid || cartLines.length === 0 || (isCredit && (!customerCreditEnabled || !selectedCustomer || previewTotal <= 0))}
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
