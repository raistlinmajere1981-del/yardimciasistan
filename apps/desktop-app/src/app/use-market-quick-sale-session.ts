import { useCallback, useEffect, useRef, useState } from "react";
import type { DesktopCommerceBridge } from "../../electron/commerce-ipc-contract";
import type {
  CatalogProduct,
  CommerceSale,
  CommerceSaleDraft,
  MarketCartDraftLoadResult
} from "@yardimci-asistan/shared";

export interface MarketQuickSaleCartLine {
  product: CatalogProduct;
  quantity: number;
  price?: { customerId: string; unitPrice: number; currency: string };
}

export interface CartDraftQuickSaleRequest {
  requestId: number;
  draftId: string;
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function useMarketQuickSaleSession({
  customerCreditEnabled,
  customerSelectionEnabled = customerCreditEnabled,
  pricingContext = ""
}: {
  customerCreditEnabled: boolean;
  customerSelectionEnabled?: boolean;
  pricingContext?: string;
}) {
  const [transactionMode, setTransactionMode] = useState<"sale" | "order">("sale");
  const [orderNote, setOrderNote] = useState("");
  const pendingOrder = useRef<Parameters<DesktopCommerceBridge["createOrder"]>[0] | null>(null);
  const [orderUncertain, setOrderUncertain] = useState(false);
  const [cart, setCart] = useState<MarketQuickSaleCartLine[]>([]);
  const cartRef = useRef<MarketQuickSaleCartLine[]>([]);
  const [discountTotal, setDiscountTotal] = useState("0");
  const [paymentAmount, setPaymentAmount] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [customerId, setCustomerId] = useState("");
  const [sourceDraft, setSourceDraft] = useState<CommerceSaleDraft | null>(null);
  const [draftLoadWarnings, setDraftLoadWarnings] = useState<string[]>([]);
  const [reviewRecoveryDraft, setReviewRecoveryDraft] = useState<CommerceSaleDraft | null>(null);
  const [lastSale, setLastSale] = useState<CommerceSale | null>(null);
  const saleInFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [cartDraftRequest, setCartDraftRequest] = useState<CartDraftQuickSaleRequest | null>(null);
  const cartDraftRequestRef = useRef<CartDraftQuickSaleRequest | null>(null);
  const loadedDraftRequestId = useRef<number | null>(null);
  const draftRequestSequence = useRef(0);
  const priceGeneration = useRef(0);
  const [priceState, setPriceState] = useState<"loading" | "ready" | "error">("ready");
  const [priceError, setPriceError] = useState("");
  const [priceRevision, setPriceRevision] = useState(0);
  const checkoutIntent = useRef<{ fingerprint: string; operationId: string } | null>(null);

  useEffect(() => {
    if (customerCreditEnabled) return;
    setPaymentMethod((current) => current === "credit" ? "cash" : current);
  }, [customerCreditEnabled]);

  useEffect(() => {
    if (!customerSelectionEnabled) setCustomerId("");
  }, [customerSelectionEnabled]);

  const replaceCart = useCallback((next: MarketQuickSaleCartLine[]) => {
    cartRef.current = next;
    setCart(next);
  }, []);

  const productPriceKey = cart.map(line => `${line.product.id}:${line.product.updatedAt}`).join("|");
  useEffect(() => {
    const generation = ++priceGeneration.current;
    const products = cartRef.current.map(line => line.product);
    if (!products.length) { setPriceState("ready"); setPriceError(""); return; }
    const bridge = window.yardimciDesktop?.commerce;
    setPriceState("loading");
    setPriceError("");
    if (!bridge?.resolveProductPrice) { setPriceState("error"); setPriceError("Satış fiyatları okunamadı."); return; }
    void Promise.all(products.map(product => bridge.resolveProductPrice({ productId: product.id, customerId })))
      .then(prices => {
        if (generation !== priceGeneration.current) return;
        if (prices.some(price => products.find(product => product.id === price.productId)?.currency !== price.currency)) {
          throw new Error("Sepetteki ürünün para birimi değişti. Ürünü çıkarıp yeniden ekleyin.");
        }
        const byId = new Map(prices.map(price => [price.productId, price]));
        replaceCart(cartRef.current.map(line => {
          const price = byId.get(line.product.id);
          return price ? { ...line, price: { customerId, unitPrice: price.unitPrice, currency: price.currency } } : line;
        }));
        setPriceState("ready");
      }).catch(error => {
        if (generation !== priceGeneration.current) return;
        setPriceState("error");
        setPriceError(error instanceof Error ? error.message : "Satış fiyatları okunamadı.");
      });
    return () => { priceGeneration.current += 1; };
  }, [customerId, pricingContext, priceRevision, productPriceKey, replaceCart]);
  const pricesReady = priceState === "ready" && cart.every(line => line.price?.customerId === customerId);
  const refreshPrices = useCallback(() => { setPriceState("loading"); setPriceRevision(current => current + 1); }, []);

  const prepareSaleOperation = useCallback((input: object) => {
    const fingerprint = JSON.stringify(input);
    if (checkoutIntent.current?.fingerprint !== fingerprint) checkoutIntent.current = { fingerprint, operationId: crypto.randomUUID() };
    return checkoutIntent.current.operationId;
  }, []);

  const addProduct = useCallback((product: CatalogProduct) => {
    if (saleInFlight.current || pendingOrder.current) return "blocked" as const;
    const current = cartRef.current;
    const currentCurrency = current[0]?.product.currency ?? "";
    if (currentCurrency && product.currency !== currentCurrency) return "currency_mismatch" as const;
    const existing = current.find((line) => line.product.id === product.id);
    const next = existing
      ? current.map((line) => line.product.id === product.id
        ? { ...line, product, quantity: roundQuantity(line.quantity + 1) }
        : line)
      : [...current, { product, quantity: 1 }];
    replaceCart(next);
    return "added" as const;
  }, [replaceCart]);

  const setQuantity = useCallback((productId: string, quantityInput: number) => {
    if (saleInFlight.current || pendingOrder.current) return false;
    const quantity = roundQuantity(quantityInput);
    const current = cartRef.current;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      replaceCart(current.filter((line) => line.product.id !== productId));
      return true;
    }
    replaceCart(current.map((line) => line.product.id === productId ? { ...line, quantity } : line));
    return true;
  }, [replaceCart]);

  const clearSale = useCallback(() => {
    pendingOrder.current = null;
    setOrderUncertain(false);
    setOrderNote("");
    setTransactionMode("sale");
    replaceCart([]);
    setDiscountTotal("0");
    setPaymentAmount(null);
    setPaymentMethod("cash");
    setCustomerId("");
    setSourceDraft(null);
    setDraftLoadWarnings([]);
    checkoutIntent.current = null;
  }, [replaceCart]);

  const startSale = useCallback(() => {
    if (saleInFlight.current || pendingOrder.current) return false;
    saleInFlight.current = true;
    setSubmitting(true);
    return true;
  }, []);

  const finishSale = useCallback(() => {
    saleInFlight.current = false;
    setSubmitting(false);
  }, []);

  const recordSale = useCallback((sale: CommerceSale) => {
    setLastSale(sale);
  }, []);

  const clearReviewRecoveryDraft = useCallback((draftId: string) => {
    setReviewRecoveryDraft((current) => current?.id === draftId ? null : current);
  }, []);

  const requestCartDraft = useCallback((draftId: string) => {
    if (saleInFlight.current || pendingOrder.current || reviewRecoveryDraft) return null;
    const request = { requestId: ++draftRequestSequence.current, draftId };
    cartDraftRequestRef.current = request;
    setCartDraftRequest(request);
    return request;
  }, [reviewRecoveryDraft]);

  const clearCartDraftRequest = useCallback((draftId: string) => {
    const current = cartDraftRequestRef.current;
    if (!current || current.draftId !== draftId) return;
    cartDraftRequestRef.current = null;
    setCartDraftRequest(null);
  }, []);

  const applyLoadedDraft = useCallback((requestId: number, result: MarketCartDraftLoadResult) => {
    const pending = cartDraftRequestRef.current;
    if (!pending || pending.requestId !== requestId || saleInFlight.current) return null;
    const warnings = result.skippedItems.map(
      (item) => `${item.productName || item.productId} ürünü artık aktif olmadığı için sepete eklenmedi.`
    );
    replaceCart(result.items.map((item) => ({ product: item.product, quantity: item.quantity })));
    setDiscountTotal("0");
    setPaymentAmount(null);
    setPaymentMethod("cash");
    setCustomerId("");
    setTransactionMode("sale");
    setOrderNote("");
    setSourceDraft(result.draft);
    setDraftLoadWarnings(warnings);
    setLastSale(null);
    loadedDraftRequestId.current = requestId;
    return warnings;
  }, [replaceCart]);

  // The immutable intent survives workspace/tab unmounts. A lost response must
  // retry this payload and reference before the cart can become another operation.
  const createOrder = useCallback(async (input: Parameters<DesktopCommerceBridge["createOrder"]>[0]) => {
    const bridge = window.yardimciDesktop?.commerce;
    if (!bridge || saleInFlight.current || sourceDraft || reviewRecoveryDraft) return null;
    saleInFlight.current = true;
    setSubmitting(true);
    if (!pendingOrder.current) pendingOrder.current = { ...input, source: "desktop", sourceReference: `desktop-order:${crypto.randomUUID()}` };
    let rejected = false;
    try {
      const response = await bridge.createOrder(pendingOrder.current);
      if (response?.ok === false && response.expected === true) {
        rejected = true;
        pendingOrder.current = null;
        setOrderUncertain(false);
        throw new Error(response.message);
      }
      if (response?.ok !== true) throw new Error("Sipariş sonucu doğrulanamadı. Aynı işlemle yeniden deneyin.");
      const result = response.value;
      if (!result?.order?.id || result.order.source !== pendingOrder.current.source
        || result.order.sourceReference !== pendingOrder.current.sourceReference) {
        throw new Error("Sipariş sonucu doğrulanamadı. Aynı işlemle yeniden deneyin.");
      }
      clearSale();
      return result;
    } catch (error) {
      // contextBridge strips custom Error names. Only the existing typed IPC
      // rejection envelope proves rollback; thrown errors may follow a commit.
      if (!rejected) setOrderUncertain(true);
      throw error;
    } finally {
      saleInFlight.current = false;
      setSubmitting(false);
    }
  }, [clearSale, sourceDraft, reviewRecoveryDraft]);

  return {
    transactionMode, setTransactionMode, orderNote, setOrderNote, orderUncertain, createOrder,
    cart,
    cartRef,
    pricingContext,
    refreshPrices,
    pricesReady,
    priceState,
    priceError,
    prepareSaleOperation,
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
    cartDraftRequest,
    loadedDraftRequestId,
    replaceCart,
    addProduct,
    setQuantity,
    clearSale,
    startSale,
    finishSale,
    recordSale,
    requestCartDraft,
    clearCartDraftRequest,
    applyLoadedDraft
  };
}

export type MarketQuickSaleSession = ReturnType<typeof useMarketQuickSaleSession>;
