import { useCatalogProductPage } from "../../app/use-catalog-product-page";
import { CatalogPageControls } from "./CatalogPageControls";
import { usePageViewState } from "../../app/page-view-state";
import { AlertTriangle, Minus, Plus, ShoppingCart, Trash2, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CatalogCategory,
  CatalogProduct,
  CommerceSale,
  CommerceOrderDetail,
  CommerceUnit,
  ProductLookupCandidate
} from "@yardimci-asistan/shared";
import { BUSINESS_CAPABILITIES as C, parseMoneyToMajor, parseMoneyInput } from "@yardimci-asistan/shared";
import { useBusinessCapabilityRuntime } from "../../app/business-capability-context";
import {
  createKeyboardBarcodeInputAdapter,
  type BarcodeScan
} from "../../app/barcode-input";
import type { DesktopCustomer } from "../../../electron/database";
import type { DesktopCommerceBridge } from "../../../electron/commerce-ipc-contract";
import type { CompleteMarketSaleResult } from "../../../electron/market-sale-operation";
import { CustomerPicker, CustomerCreditDebt } from "../customers/CustomerPicker";
import { customerCreditError, notifyCustomerCreditChanged } from "../../app/customer-credit-ui";
import { useCustomerCreditAccount } from "../../app/use-customer-credit-account";
import { MoneyInput } from "../ui/MoneyInput";
import { ActionButton } from "../ui/ActionButton";
import { MarketProductThumbnail } from "./MarketProductThumbnail";
import type { CartDraftQuickSaleRequest, MarketQuickSaleSession } from "../../app/use-market-quick-sale-session";
import { useRequestGeneration } from "../workspace/use-request-generation";
import { ChoiceChips } from "../ui/ChoiceChips";
import { MarketSaleQuantityInput } from "./MarketSaleQuantityInput";
import { readMarketProductViewPreference, saveMarketProductViewPreference, type MarketProductViewPreference } from "../../ui-preferences";
import { MarketProductToolbar } from "./MarketProductToolbar";
import { useWorkspaceNavigation } from "../workspace/WorkspaceNavigation";

interface MarketQuickSaleWorkspaceProps {
  customers?: DesktopCustomer[];
  customerCreditEnabled?: boolean;
  customerSelectionEnabled?: boolean;
  ordersEnabled?: boolean;
  onOrderCreated?: (detail: CommerceOrderDetail) => void;
  onCreateCustomer?: () => void;
  catalogRevision?: number;
  categories: CatalogCategory[];
  session: MarketQuickSaleSession;
  barcodeEnabled: boolean;
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
  onCreateCustomer,
  ordersEnabled = false,
  onOrderCreated,
  catalogRevision = 0,
  categories,
  session,
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
  const { snapshot } = useBusinessCapabilityRuntime();
  const receiptBridge = window.yardimciDesktop?.prepareSaleReceipt;
  const receiptAuthority = snapshot?.businessId && snapshot.enabledCapabilities.includes(C.PRINTING) && snapshot.enabledCapabilities.includes(C.SALES)
    ? snapshot.businessId : "";
  const receiptScope = useRef({ authority: receiptAuthority, generation: 0 });
  if (receiptScope.current.authority !== receiptAuthority) {
    receiptScope.current = { authority: receiptAuthority, generation: receiptScope.current.generation + 1 };
  }
  const [receiptSale, setReceiptSale] = useState<{ id: string; generation: number } | null>(null);
  const [receiptJob, setReceiptJob] = useState<{ jobId: string; saleId: string; generation: number; terminal: boolean } | null>(null);
  const [receiptMessage, setReceiptMessage] = useState("");
  const [receiptBusy, setReceiptBusy] = useState(false);
  const receiptInFlight = useRef(false);
  const beginReceiptRequest = useRequestGeneration();
  const [search, setSearch] = usePageViewState("market.sale.search", "");
  const [categoryId, setCategoryId] = usePageViewState("market.sale.category", "");
  const [discountDraft, setDiscountDraft] = useState<string | null>(null);
  const navigation = useWorkspaceNavigation();
  const [productView, setProductView] = useState(() => readMarketProductViewPreference("sale"));
  const localScanInFlight = useRef(false);
  const interactionBlocked = useRef(false);
  const beginBarcodeRequest = useRequestGeneration();
  const {
    cart,
    discountTotal,
    setDiscountTotal,
    paymentAmount,
    setPaymentAmount,
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
  const { pricesReady, priceError, prepareSaleOperation, refreshPrices, benefits } = session;
  const { transactionMode, setTransactionMode, orderNote, setOrderNote, orderUncertain } = session;
  const isOrder = transactionMode === "order" && ordersEnabled;
  useEffect(() => {
    if (!receiptAuthority || cart.length || isOrder || cartDraftRequest) {
      setReceiptSale(null);
      setReceiptJob(null);
      setReceiptMessage("");
      beginReceiptRequest();
      receiptInFlight.current = false;
      setReceiptBusy(false);
    }
  }, [receiptAuthority, cart.length, isOrder, cartDraftRequest, beginReceiptRequest]);
  useEffect(() => {
    setReceiptSale(null);
    setReceiptJob(null);
    setReceiptMessage("");
    beginReceiptRequest();
    receiptInFlight.current = false;
    setReceiptBusy(false);
  }, [receiptAuthority, beginReceiptRequest]);
  const isCredit = !isOrder && paymentMethod === "credit";
  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const customerPricingContext = JSON.stringify([selectedCustomer?.id, selectedCustomer?.commercialProfile?.dealerStatus, selectedCustomer?.commercialProfile?.priceGroup]);
  const customerDebtEnabled = !isOrder && customerCreditEnabled && Boolean(selectedCustomer);
  const customerAccount = useCustomerCreditAccount(selectedCustomer?.id ?? "", customerDebtEnabled);
  const customerDebtReady = !customerDebtEnabled || (!customerAccount.loading && !customerAccount.error && customerAccount.account?.customer.id === customerId);
  const draftLoading = Boolean(cartDraftRequest && loadedDraftRequestId.current !== cartDraftRequest.requestId);

  useEffect(() => { refreshPrices(); }, [refreshPrices, customerPricingContext, catalogRevision]);

  const keyboardAdapter = useMemo(() => createKeyboardBarcodeInputAdapter(), []);
  function changeProductView(next: MarketProductViewPreference) { setProductView(next); saveMarketProductViewPreference("sale", next); }
  const cartCurrency = cart
    .map((line) => line.product.currency)
    .find((value): value is string => Boolean(value)) ?? "";

  const catalog = useCatalogProductPage("market.sale", { search, activeOnly: true, customerId,
    categoryId: categoryId === "quickAccess" ? "" : categoryId, quickAccessOnly: categoryId === "quickAccess", currency: cartCurrency }, catalogRevision);
  const filteredProducts = catalog.page?.items ?? [];
  const counts = catalog.page?.counts;

  const cartLines = cart;
  const subtotal = roundMoney(cartLines.reduce(
    (sum, line) => sum + roundMoney((line.price?.customerId === customerId ? line.price.unitPrice : 0) * line.quantity),
    0
  ));
  const discountMajor = discountTotal.trim() === "" ? 0 : parseMoneyToMajor(discountTotal);
  const discountValid = discountMajor !== null && discountMajor >= 0;
  const discount = discountValid ? Math.max(0, Math.min(subtotal, roundMoney(discountMajor))) : 0;
  const previewTotal = benefits.active ? (benefits.current?.quote.payableMinor ?? 0) / 100 : roundMoney(subtotal - discount);
  const currency = benefits.active && benefits.current ? benefits.current.quote.currency : cartLines[0]?.product.currency ?? "TRY";
  const existingDebtMinor = customerDebtEnabled && customerDebtReady
    ? customerAccount.account?.balances.find(balance => balance.currency === currency)?.amountMinor ?? 0 : 0;
  const totalDebt = roundMoney(previewTotal + existingDebtMinor / 100);
  const checkoutReady = pricesReady && (benefits.active || customerDebtReady) && (!benefits.active || Boolean(benefits.current));
  const explicitTender = !benefits.active && !isCredit && (paymentAmount !== null || existingDebtMinor > 0);
  const paymentText = benefits.active ? (benefits.current ? (benefits.current.quote.payableMinor / 100).toFixed(2).replace(".", ",") : "") : isCredit ? "0" : paymentAmount ?? (checkoutReady ? totalDebt.toFixed(2).replace(".", ",") : "");
  const parsedPayment = parseMoneyInput(paymentText);
  const paymentMinor = parsedPayment.status === "valid" ? parsedPayment.minor : null;
  const paymentValid = paymentMinor !== null && paymentMinor >= 0 && paymentMinor <= 999_999_999_999;
  const paymentDifference = paymentValid ? roundMoney(paymentMinor / 100 - previewTotal) : 0;
  const customerPaymentRequired = !benefits.active && (isCredit || paymentDifference !== 0);
  const paymentAllowed = benefits.uncertain || checkoutReady && paymentValid && (!customerPaymentRequired || (customerCreditEnabled && Boolean(selectedCustomer)));

  const addProduct = useCallback((product: CatalogProduct) => {
    const result = addSessionProduct(product);
    if (result === "currency_mismatch") {
      onStateChange("error", "Tek satışta birden fazla para birimi kullanılamaz.");
      return false;
    }
    return result === "added";
  }, [addSessionProduct, onStateChange]);

  const resolveBarcode = useCallback(async (barcode: string) => {
    if (!bridge || orderUncertain || saleInFlight.current) return "stale" as const;
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
  }, [addProduct, beginBarcodeRequest, bridge, onExternalProductFound, onStateChange, orderUncertain, saleInFlight, setSearch]);

  const handleBarcodeScan = useCallback(async (scan: BarcodeScan) => {
    if (!barcodeEnabled || busy || submitting || orderUncertain || benefits.uncertain || saleInFlight.current || draftLoading || localScanInFlight.current) return;
    localScanInFlight.current = true;
    try {
      await resolveBarcode(scan.value);
    } finally {
      localScanInFlight.current = false;
    }
  }, [barcodeEnabled, benefits.uncertain, busy, draftLoading, orderUncertain, resolveBarcode, saleInFlight, submitting]);

  useEffect(() => {
    if (!barcodeEnabled) {
      beginBarcodeRequest();
      return;
    }
    return keyboardAdapter.start((scan) => {
      void handleBarcodeScan(scan);
    });
  }, [barcodeEnabled, beginBarcodeRequest, handleBarcodeScan, keyboardAdapter]);

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
        setDiscountDraft(null);
        void onCartDraftLoaded?.(result.draft.id);
        onStateChange(
          "success",
          warnings.length > 0
            ? warnings.join(" ")
            : "Telefon sepeti Yeni İşlem'e yüklendi; satış kaydedilene kadar taslak açık kalır."
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

  interactionBlocked.current = busy || submitting || orderUncertain || benefits.uncertain || saleInFlight.current || draftLoading;

  useEffect(() => {
    if (!barcodeEnabled || !bridge) {
      return;
    }
    const activeBridge = bridge;
    let disposed = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const scanner = acquirePhoneScanner(activeBridge);

    async function consume() {
      if (disposed || localScanInFlight.current || interactionBlocked.current) return;
      localScanInFlight.current = true;
      try {
        const events = await activeBridge.consumePendingBarcodeScans({ limit: 100 });
        if (disposed) return;
        for (const event of events) {
          if (disposed || interactionBlocked.current) break;
          const outcome = await resolveBarcode(event.barcode);
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
        void consume();
        intervalId = setInterval(() => void consume(), 600);
      })
      .catch((error) => {
        if (disposed) return;
        onStateChange("error", error instanceof Error ? error.message : "Telefon barkod kanalı hazırlanamadı.");
      });

    return () => {
      disposed = true;
      beginBarcodeRequest();
      if (intervalId) clearInterval(intervalId);
      releasePhoneScanner(activeBridge, scanner.lease);
    };
  }, [barcodeEnabled, beginBarcodeRequest, bridge, onStateChange, resolveBarcode]);

  function clearCart() {
    if (orderUncertain || benefits.uncertain || submitting) return;
    setDiscountDraft(null);
    clearSale();
  }

  const draftDiscountMajor = discountDraft?.trim() === "" ? 0 : parseMoneyToMajor(discountDraft ?? "");
  const draftDiscountValid = draftDiscountMajor !== null && draftDiscountMajor >= 0;

  function saveDiscount() {
    if (discountDraft === null || !draftDiscountValid) return;
    setDiscountTotal(discountDraft);
    setDiscountDraft(null);
  }

  async function completeSale() {
    if (isOrder || orderUncertain || busy || (!benefits.uncertain && (!pricesReady || discountDraft !== null || !paymentAllowed))) return;
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
    setReceiptSale(null);
    setReceiptJob(null);
    setReceiptMessage("");
    beginReceiptRequest();
    receiptInFlight.current = false;
    setReceiptBusy(false);
    const saleAuthorityGeneration = receiptScope.current.generation;

    const draftToReview = sourceDraft;
    const creditCustomerId = selectedCustomer?.id ?? "";
    const creditCustomerName = selectedCustomer?.fullName ?? "";
    const salePaymentMethod = paymentMethod;
    let operation: CompleteMarketSaleResult;
    try {
      if (benefits.active || benefits.uncertain) {
        operation = await benefits.submit();
      } else {
        if (paymentMinor === null) throw new Error("Geçerli bir ödeme tutarı girin.");
        const saleInput = {
          items: cartLines.map((line) => ({
            productId: line.product.id,
            quantity: line.quantity,
            ...(!explicitTender ? {} : { expectedUnitPrice: line.price!.unitPrice, expectedCurrency: line.price!.currency })
          })),
          ...(!explicitTender ? {} : { paymentAmountMinor: paymentMinor }),
          discountTotal: discount,
          source: "desktop-market-quick-sale"
        };
        operation = await bridge.completeMarketSale({ ...saleInput,
          settlement: isCredit ? "credit" : "paid", customerId,
          paymentMethod: salePaymentMethod, ...(draftToReview?.id ? { sourceDraftId: draftToReview.id } : {}),
          operationId: prepareSaleOperation({ ...saleInput, settlement: isCredit ? "credit" : "paid", customerId, paymentMethod: salePaymentMethod, sourceDraftId: draftToReview?.id }) });
      }
    } catch (error) {
      onStateChange("error", customerCreditError(error, "Satış tamamlanamadı."));
      finishSale();
      return;
    }

    const sale = operation.sale;
    if (receiptScope.current.authority && receiptScope.current.generation === saleAuthorityGeneration) {
      setReceiptSale({ id: sale.id, generation: saleAuthorityGeneration });
    }
    recordSale(sale);
    if (sale.status === "credit" || (operation.payment?.appliedToDebtMinor ?? 0) > 0) notifyCustomerCreditChanged(creditCustomerId);
    clearSale();

    const saleMessage = operation.benefits
      ? `Satış tamamlandı: ${money(operation.benefits.quote.payableMinor / 100, sale.currency)} tahsilat${operation.benefits.quote.pointsTenderMinor ? ` · ${money(operation.benefits.quote.pointsTenderMinor / 100, sale.currency)} Puan ile ödeme` : ""}.${operation.benefits.quote.pointsEarnPreviewMinor ? ` ${money(operation.benefits.quote.pointsEarnPreviewMinor / 100, sale.currency)} Puan kazanıldı.` : ""}`
      : operation.payment && !isCredit
      ? `Satış kaydedildi. ${money(operation.payment.receivedMinor / 100, sale.currency)} tahsil edildi. ${operation.payment.newDebtMinor > 0 ? `${creditCustomerName}: ${money(operation.payment.newDebtMinor / 100, sale.currency)} veresiye eklendi.` : operation.payment.appliedToDebtMinor > 0 ? `Eski borçtan ${money(operation.payment.appliedToDebtMinor / 100, sale.currency)} düşüldü.` : ""}`.trim()
      : sale.status === "credit"
      ? `Veresiye satış kaydedildi. ${creditCustomerName}: müşteri hesabına ${money(sale.total, sale.currency)} borç işlendi.`
      : `Satış tamamlandı: ${money(sale.total, sale.currency)} · ${paymentMethodLabel(sale.paymentMethod)}.`;
    let completionMessage = saleMessage;
    try {
      try {
        await onSaleCompleted(sale);
      } catch {
        completionMessage += " Katalog görünümü yenilenemedi.";
      }

      if (draftToReview) {
        if (operation.draftReview === "reviewed") {
          clearReviewRecoveryDraft(draftToReview.id);
          completionMessage += " Telefon sepeti kapatıldı.";
          try { await onCartDraftReviewed?.(draftToReview.id); } catch {
            completionMessage += " Telefon sepeti görünümü yenilenemedi.";
          }
        } else {
          setReviewRecoveryDraft(draftToReview);
          completionMessage += " Telefon sepeti kapatılamadı.";
        }
      }
      onStateChange("success", completionMessage);
    } finally {
      finishSale();
    }
  }

  async function prepareReceipt() {
    if (!receiptSale || receiptJob || !receiptAuthority || !receiptBridge || receiptInFlight.current || receiptSale.generation !== receiptScope.current.generation || cart.length || isOrder || submitting || benefits.uncertain || orderUncertain || draftLoading) return;
    const current = beginReceiptRequest();
    const generation = receiptScope.current.generation;
    receiptInFlight.current = true;
    setReceiptBusy(true);
    setReceiptMessage("");
    try {
      const result = await receiptBridge({ saleId: receiptSale.id });
      if (!current() || generation !== receiptScope.current.generation) return;
      if (result.ok) setReceiptJob({ jobId: result.value.jobId, saleId: receiptSale.id, generation, terminal: false });
      setReceiptMessage(result.ok ? "Fiş hazır."
        : result.code === "DOCUMENT_SALE_JOB_LINES_MISSING"
          ? "Fiş şablonunda ürün satırları eksik veya kapasitesi yetersiz. Baskı Yönetimi > Satış fişi > Düzenle > Ürün satırlarını ekle > Şablonları kaydet. Satır kapasitesini aşan satışlar hazırlanamaz."
        : result.code === "DOCUMENT_SALE_JOB_CONFIGURATION_MISSING"
          ? "Fiş hazırlanamadı. Baskı Yönetimi'nde fiş şablonunu, yazıcıyı ve yazdırma onayı kuralını kontrol edin."
          : "Fiş hazırlanamadı. Baskı Yönetimi ayarlarını kontrol edip yeniden deneyin.");
    } catch {
      if (current() && generation === receiptScope.current.generation) setReceiptMessage("Fiş hazırlanamadı. Yeniden deneyin.");
    } finally {
      if (current() && generation === receiptScope.current.generation) {
        receiptInFlight.current = false;
        setReceiptBusy(false);
      }
    }
  }

  async function outputReceipt(action: "preview" | "print") {
    const desktop = window.yardimciDesktop;
    if (!receiptJob || receiptJob.terminal || !receiptSale || receiptJob.saleId !== receiptSale.id || receiptJob.generation !== receiptScope.current.generation || !receiptAuthority || cart.length || isOrder || submitting || benefits.uncertain || orderUncertain || draftLoading || cartDraftRequest || receiptInFlight.current) return;
    const operation = action === "preview" ? desktop?.previewReadyDocument : desktop?.printReadyDocument;
    if (!operation) return;
    const current = beginReceiptRequest();
    const generation = receiptScope.current.generation;
    receiptInFlight.current = true;
    setReceiptBusy(true);
    try {
      const result = await operation({ documentKind: "sale_receipt", jobId: receiptJob.jobId });
      if (!current() || generation !== receiptScope.current.generation) return;
      if (action === "preview") {
        setReceiptMessage(result.ok ? "Önizleme açıldı." : "Önizleme açılamadı. Baskı Yönetimi'ni kontrol edin.");
      } else if (!result.ok && result.code === "DOCUMENT_PRINT_CANCELLED") {
        setReceiptMessage("Yazdırmadan vazgeçildi. Fiş hâlâ hazır.");
      } else {
        setReceiptJob({ ...receiptJob, terminal: true });
        setReceiptMessage(result.ok && result.value === "accepted" ? "Yazdırma işletim sistemine iletildi; kâğıt çıktısı doğrulanmadı."
          : result.ok && result.value === "failed" ? "Yazdırma başarısız. Baskı Yönetimi'ni kontrol edin."
            : result.ok && result.value === null ? "Bu fiş daha önce işlendi; tekrar gönderilmedi. Baskı Yönetimi'ni kontrol edin."
            : "Yazdırma sonucu belirsiz. Tekrar göndermeden önce Baskı Yönetimi'ni ve yazıcıyı kontrol edin.");
      }
    } catch {
      if (!current() || generation !== receiptScope.current.generation) return;
      if (action === "print") setReceiptJob({ ...receiptJob, terminal: true });
      setReceiptMessage(action === "print" ? "Yazdırma sonucu belirsiz. Tekrar göndermeden önce Baskı Yönetimi'ni ve yazıcıyı kontrol edin." : "Önizleme açılamadı. Baskı Yönetimi'ni kontrol edin.");
    } finally {
      if (current() && generation === receiptScope.current.generation) {
        receiptInFlight.current = false;
        setReceiptBusy(false);
      }
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

  async function saveOrder() {
    if (!bridge || !ordersEnabled || !isOrder || busy || submitting || draftLoading || sourceDraft || reviewRecoveryDraft
      || (!orderUncertain && (!pricesReady || !discountValid || discountDraft !== null || !selectedCustomer || !cartLines.length))) return;
    beginBarcodeRequest();
    try {
      const created = await session.createOrder({ customerId, discountTotal: discount, note: orderNote,
        items: cartLines.map(line => ({ productId: line.product.id, quantity: line.quantity })) });
      if (!created) return;
      onStateChange("success", `Sipariş kaydedildi: ${money(created.order.total, created.order.currency)}.`);
      onOrderCreated?.(created);
    } catch (error) {
      onStateChange("error", error instanceof Error ? error.message : "Sipariş kaydedilemedi. Aynı işlemle yeniden deneyin.");
    }
  }

  const disabled = busy || submitting || draftLoading || orderUncertain || benefits.uncertain;

  return (
    <div className="market-quick-sale-layout">
      <section className="market-panel market-sale-catalog">
        <MarketProductToolbar search={search} onSearch={setSearch} view={productView} onViewChange={changeProductView} disabled={disabled}
          onCreate={() => navigation.openWorkspace({ entityType: "product", entityId: "new-product", mode: "create", returnContext: { page: "market", view: "quickSale" } })} />
        <ChoiceChips horizontalWheel ariaLabel="Ürün kategorileri" className="market-category-chips" value={categoryId} onChange={setCategoryId} options={[{ id: "", label: "Tümü", title: `${counts?.total ?? 0} ürün` }, { id: "quickAccess", label: "Hızlı Erişim", title: `${counts?.quickAccess ?? 0} ürün` }, ...categories.filter(category => category.isActive).map(category => ({ id: category.id, label: `${category.name} · ${counts?.categories[category.id] ?? 0}` }))]} />
        <div className={`market-sale-product-grid market-sale-product-grid--${productView.preset}`}>
          {filteredProducts.map((product) => (
            <button
              type="button"
              className="market-sale-product interactive-surface interactive-surface--record"
              key={product.id}
              onClick={() => addProduct(product)}
              disabled={disabled || catalog.loading || Boolean(catalog.error)}
            >
              {productView.showImages && <MarketProductThumbnail product={product} className="market-sale-product-thumb" />}
              <span>
                <strong>{product.name}</strong>
                <small>{product.sku || product.barcode || "Kod yok"}</small>
              </span>
              <b>{catalog.page?.prices[product.id] ? money(catalog.page.prices[product.id]!.unitPrice, product.currency) : "—"}</b>
            </button>
          ))}
          {!catalog.loading && !catalog.error && filteredProducts.length === 0 && (
            <p className="market-muted">Bu filtrelerle satılabilir ürün bulunamadı.</p>
          )}
        </div>
        <CatalogPageControls catalog={catalog} />
      </section>

      <div className={`market-sale-sidebar${benefits.active ? " market-sale-sidebar--benefits" : ""}`}>
      <section className="market-panel market-sale-checkout" aria-label="Ödeme">
        <div className="market-sale-checkout-fields">
          {customerSelectionEnabled && (
            <CustomerPicker compact currency={currency} showDebt={false} customers={customers} value={customerId} onChange={setCustomerId} disabled={disabled} {...(onCreateCustomer ? { onCreateCustomer } : {})} />
          )}
          <div className="market-sale-payment">
            <ChoiceChips ariaLabel="İşlem ve ödeme seçimi" value={isOrder ? "order" : paymentMethod} onChange={value => {
              if (value === "order") { if (sourceDraft || reviewRecoveryDraft) return; setTransactionMode("order"); }
              else { setTransactionMode("sale"); if (value !== "sale") setPaymentMethod(value); }
            }} disabled={disabled} options={[...(isOrder ? [{ id: "sale", label: "Satış" }] : [...Object.entries(paymentMethodLabels).map(([id, label]) => ({ id, label })), ...(customerCreditEnabled ? [{ id: "credit", label: "Veresiye", disabled: benefits.active }] : [])]), ...(ordersEnabled ? [{ id: "order", label: "Sipariş", disabled: benefits.active || Boolean(sourceDraft || reviewRecoveryDraft) }] : [])]} />
          </div>
          {ordersEnabled && (sourceDraft || reviewRecoveryDraft) && <p className="market-muted">Telefon sepeti yalnız satış olarak tamamlanabilir. Sipariş için bağımsız bir sepet hazırlayın.</p>}
          {isOrder && !selectedCustomer && <p role="status" className="market-muted">Sipariş için kayıtlı müşteri seçin.</p>}
          {orderUncertain && <p role="alert" className="market-muted">Sipariş sonucu belirsiz. Sepet korundu; aynı siparişi doğrulamak için yeniden kaydedin.</p>}
          {priceError && <p role="alert">{priceError}</p>}

          {benefits.availabilityError && <p role="alert">{benefits.availabilityError}
            <ActionButton variant="secondary" disabled={disabled} onClick={benefits.reloadAvailability}>Yeniden dene</ActionButton></p>}
          {benefits.available && <section className="form-stack" aria-label="İndirim ve Puan">
            <label><input type="checkbox" checked={benefits.selected} disabled={disabled || (!benefits.selected && (!benefits.compatible || discountDraft !== null))}
              onChange={event => { if (event.target.checked) benefits.setSelected(true); else benefits.clear(); }} /> İndirim ve Puan</label>
            {!benefits.compatible && <p className="market-muted">Tam ödenen satışta kullanılabilir. Manuel indirimi kaldırın ve ödeme tutarını otomatik bırakın.</p>}
            {paymentAmount !== null && <ActionButton variant="ghost" disabled={disabled} onClick={() => setPaymentAmount(null)}>Ödemeyi otomatik hesapla</ActionButton>}
            {benefits.active && <>
              {benefits.families?.coupon && <label className="form-field">Kupon<input aria-label="Kupon kodu" type="password" autoComplete="off" maxLength={128}
                defaultValue={benefits.coupon.current} disabled={disabled} onChange={event => benefits.setCoupon(event.target.value)} /></label>}
              {benefits.families?.points && <>
                <span>Kullanılabilir Puan: {benefits.current ? money(benefits.current.availablePointsMinor / 100, currency) : "—"}</span>
                <label className="form-field">Kullanılacak Puan<MoneyInput aria-label="Kullanılacak Puan" value={benefits.points} onChange={benefits.setPoints} disabled={disabled || !customerId}
                  aria-invalid={benefits.requestedPointsMinor === null || benefits.requestedPointsMinor < 0} /></label>
                {!customerId && <p className="market-muted">Puan için müşteri seçin.</p>}
              </>}
              <ActionButton variant="secondary" type="button" busy={benefits.loading} disabled={disabled || !benefits.compatible || !pricesReady || !cartLines.length || benefits.requestedPointsMinor === null || benefits.requestedPointsMinor < 0}
                onClick={() => void benefits.refresh().catch(error => onStateChange("error", customerCreditError(error, "Tutar hesaplanamadı.")))}>Tutarı Hesapla</ActionButton>
              {!benefits.current && <p role="status" className="market-muted">Onaylamadan önce güncel tutarı hesaplayın.</p>}
              {benefits.current && <details>
                <summary>İndirim ve Puan detayı</summary>
                <div className="market-sale-totals">
                  <span><small>Güncel ara toplam</small><strong>{money(benefits.current.quote.subtotalMinor / 100, currency)}</strong></span>
                  <span><small>Fayda indirimi</small><strong>-{money(benefits.current.quote.discountMinor / 100, currency)}</strong></span>
                  {benefits.current.quote.adjustments.filter(adjustment => adjustment.operation === "discount").map(adjustment =>
                    <span key={adjustment.ruleId}><small>{adjustment.family === "coupon" ? "Kupon indirimi" : "Ödeme yöntemi indirimi"}</small><strong>-{money(adjustment.amountMinor / 100, currency)}</strong></span>)}
                  <span><small>Puan ile ödeme</small><strong>{money(benefits.current.quote.pointsTenderMinor / 100, currency)}</strong></span>
                  <span><small>Ödeme sonrası kazanılacak Puan</small><strong>{money(benefits.current.quote.pointsEarnPreviewMinor / 100, currency)}</strong></span>
                </div>
                <p className="market-muted">Önizleme. Puan, satış kaydedildiğinde kesinleşir.</p>
              </details>}
              {existingDebtMinor > 0 && <p className="market-muted">Mevcut borç bu satışta tahsil edilmez.</p>}
            </>}
          </section>}
          {benefits.active && !benefits.available && <p role="alert">İndirim ve Puan kullanılamıyor. Önizlemeyi yenileyin veya seçimi kaldırın.
            <ActionButton variant="secondary" disabled={disabled} onClick={() => benefits.clear()}>Seçimi kaldır</ActionButton></p>}
          {benefits.uncertain && <p role="alert">Satış sonucu belirsiz. Sepet korundu; aynı işlemin sonucunu doğrulayın.</p>}
          <div className="market-sale-totals">
            <span><small>Ara toplam</small><strong>{benefits.active ? (benefits.current ? money(benefits.current.quote.subtotalMinor / 100, currency) : "—") : pricesReady ? money(subtotal, currency) : "Fiyatlar güncelleniyor…"}</strong></span>
            {!benefits.active && <form className="market-sale-discount" aria-label="İndirim" onSubmit={event => { event.preventDefault(); if (!disabled) saveDiscount(); }}>
              <small>İndirim</small>
              <div className="market-sale-discount-controls">
                {discountDraft === null ? <>
                  <strong>-{money(discount, currency)}</strong>
                  <ActionButton variant="ghost" size="sm" type="button" disabled={disabled || benefits.active} onClick={event => { event.preventDefault(); setDiscountDraft(discountTotal); }}>
                    Düzenle
                  </ActionButton>
                </> : <>
                  <MoneyInput aria-label="İndirim tutarı" value={discountDraft} onChange={setDiscountDraft} disabled={disabled} autoFocus aria-invalid={!draftDiscountValid}
                    onKeyDown={event => { if (event.key === "Escape" && !disabled) { event.preventDefault(); setDiscountDraft(null); } }} />
                  <ActionButton size="sm" type="submit" disabled={disabled || !draftDiscountValid}>Kaydet</ActionButton>
                  <ActionButton variant="ghost" size="sm" type="button" disabled={disabled} onClick={() => setDiscountDraft(null)}>Vazgeç</ActionButton>
                </>}
              </div>
            </form>}
            {(!discountValid || (discountDraft !== null && !draftDiscountValid)) && <p role="alert" className="market-muted">İndirim için geçerli bir tutar girin (örn. 125,50).</p>}
            <span className="market-sale-grand-total"><small>{isOrder ? "Sipariş toplamı" : isCredit ? "Yeni veresiye tutarı" : "Ödenecek"}</small><strong>{(benefits.active ? Boolean(benefits.current) : pricesReady) ? money(previewTotal, currency) : "—"}</strong></span>
            {!isOrder && customerCreditEnabled && selectedCustomer && <CustomerCreditDebt state={customerAccount} compact currency={currency} />}
            {!benefits.active && existingDebtMinor > 0 && <span className="market-sale-total-debt"><small>Toplam borç</small><strong>{checkoutReady ? money(totalDebt, currency) : "—"}</strong></span>}
            {!isOrder && !isCredit && paymentAmount !== null && paymentValid && paymentDifference !== 0 && <span className="market-sale-payment-difference">
              <small>{paymentDifference < 0 ? "Kalan veresiye" : "Eski borca uygulanacak"}</small><strong>{money(Math.abs(paymentDifference), currency)}</strong>
            </span>}
          </div>
          {!isOrder && checkoutReady && !paymentValid && <p role="alert" className="market-muted">Geçerli bir ödeme tutarı girin.</p>}
        </div>

        <div className={`market-sale-checkout-action${isCredit ? " market-sale-checkout-action--credit" : ""}`}>
          {isOrder && <input aria-label="Sipariş notu" placeholder="sipariş notu" value={orderNote} onChange={event => setOrderNote(event.target.value)} maxLength={500} disabled={disabled} />}
          {!isOrder && !isCredit && <MoneyInput aria-label="Ödeme tutarı" value={paymentText} onChange={setPaymentAmount} disabled={disabled || benefits.active || !checkoutReady} aria-invalid={!isOrder && checkoutReady && !paymentValid} />}
          <ActionButton
            size="lg"
            fullWidth
            busy={submitting}
            busyLabel={isOrder ? "Sipariş kaydediliyor…" : "Satış işleniyor…"}
            type="button"
            onClick={() => void (isOrder ? saveOrder() : completeSale())}
            disabled={busy || submitting || draftLoading || (!benefits.uncertain && (isOrder ? Boolean(sourceDraft || reviewRecoveryDraft) || (!orderUncertain && (discountDraft !== null || !pricesReady || !discountValid || !selectedCustomer || cartLines.length === 0)) : orderUncertain || discountDraft !== null || !pricesReady || !discountValid || cartLines.length === 0 || !paymentAllowed || (isCredit && (!customerCreditEnabled || !selectedCustomer || previewTotal <= 0))))}
          >
            <WalletCards size={18} aria-hidden="true" />
            {benefits.uncertain ? "Satış Sonucunu Doğrula" : isOrder ? "Siparişi Kaydet" : isCredit ? "Satışı Veresiye Kaydet" : "Ödeme Al"}
          </ActionButton>
        </div>

        {receiptSale && receiptSale.generation === receiptScope.current.generation && receiptAuthority && receiptBridge && !cart.length && !isOrder && !draftLoading && !cartDraftRequest && !benefits.uncertain && !orderUncertain && (
          <div>
            {!receiptJob && <ActionButton variant="secondary" type="button" busy={receiptBusy} busyLabel="Fiş hazırlanıyor…" disabled={busy || submitting} onClick={() => void prepareReceipt()}>Fişi hazırla</ActionButton>}
            {receiptJob && receiptJob.saleId === receiptSale.id && receiptJob.generation === receiptScope.current.generation && <>
              <p>MALİ BELGE DEĞİLDİR</p>
              {!receiptJob.terminal && <>
                <ActionButton variant="secondary" type="button" disabled={busy || submitting || receiptBusy || !window.yardimciDesktop?.previewReadyDocument} onClick={() => void outputReceipt("preview")}>Önizle</ActionButton>{" "}
                <ActionButton variant="secondary" type="button" disabled={busy || submitting || receiptBusy || !window.yardimciDesktop?.printReadyDocument} onClick={() => void outputReceipt("print")}>Yazdır</ActionButton>
              </>}
            </>}
            {receiptMessage && <p role="status">{receiptMessage}</p>}
          </div>
        )}

      </section>

      <section className="market-panel market-sale-cart" aria-label="Sepet">
        <header className="market-panel-heading market-panel-heading-row">
          <div className="market-sale-cart-heading">
            <span>SEPET</span>
            <small>{cartLines.length} kalem</small>
          </div>
          {cartLines.length > 0 && (
            <ActionButton variant="secondary" type="button" onClick={clearCart} disabled={disabled}>
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
              <p>İşleme başlamak için soldan ürün ekleyin.</p>
            </div>
          )}
        </div>

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
    </div>
  );
}
