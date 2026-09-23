import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CatalogProduct,
  CommerceSale,
  CommerceSaleDraft,
  MarketCartDraftLoadResult
} from "@yardimci-asistan/shared";

export interface MarketQuickSaleCartLine {
  product: CatalogProduct;
  quantity: number;
}

export interface CartDraftQuickSaleRequest {
  requestId: number;
  draftId: string;
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function useMarketQuickSaleSession({
  customerCreditEnabled
}: {
  customerCreditEnabled: boolean;
}) {
  const [cart, setCart] = useState<MarketQuickSaleCartLine[]>([]);
  const cartRef = useRef<MarketQuickSaleCartLine[]>([]);
  const [discountTotal, setDiscountTotal] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [customerId, setCustomerId] = useState("");
  const [sourceDraft, setSourceDraft] = useState<CommerceSaleDraft | null>(null);
  const [draftLoadWarnings, setDraftLoadWarnings] = useState<string[]>([]);
  const [reviewRecoveryDraft, setReviewRecoveryDraft] = useState<CommerceSaleDraft | null>(null);
  const [lastSale, setLastSale] = useState<CommerceSale | null>(null);
  const [lastCreditCustomerName, setLastCreditCustomerName] = useState("");
  const saleInFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [cartDraftRequest, setCartDraftRequest] = useState<CartDraftQuickSaleRequest | null>(null);
  const cartDraftRequestRef = useRef<CartDraftQuickSaleRequest | null>(null);
  const loadedDraftRequestId = useRef<number | null>(null);
  const draftRequestSequence = useRef(0);

  useEffect(() => {
    if (customerCreditEnabled) return;
    setPaymentMethod((current) => current === "credit" ? "cash" : current);
    setCustomerId("");
  }, [customerCreditEnabled]);

  const replaceCart = useCallback((next: MarketQuickSaleCartLine[]) => {
    cartRef.current = next;
    setCart(next);
  }, []);

  const addProduct = useCallback((product: CatalogProduct) => {
    if (saleInFlight.current) return "blocked" as const;
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
    if (saleInFlight.current) return false;
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
    replaceCart([]);
    setDiscountTotal("0");
    setPaymentMethod("cash");
    setCustomerId("");
    setSourceDraft(null);
    setDraftLoadWarnings([]);
  }, [replaceCart]);

  const startSale = useCallback(() => {
    if (saleInFlight.current) return false;
    saleInFlight.current = true;
    setSubmitting(true);
    return true;
  }, []);

  const finishSale = useCallback(() => {
    saleInFlight.current = false;
    setSubmitting(false);
  }, []);

  const recordSale = useCallback((sale: CommerceSale, creditCustomerName: string) => {
    setLastSale(sale);
    setLastCreditCustomerName(sale.status === "credit" ? creditCustomerName : "");
  }, []);

  const requestCartDraft = useCallback((draftId: string) => {
    if (saleInFlight.current) return null;
    const request = { requestId: ++draftRequestSequence.current, draftId };
    cartDraftRequestRef.current = request;
    setCartDraftRequest(request);
    return request;
  }, []);

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
    setPaymentMethod("cash");
    setCustomerId("");
    setSourceDraft(result.draft);
    setDraftLoadWarnings(warnings);
    setLastSale(null);
    setLastCreditCustomerName("");
    loadedDraftRequestId.current = requestId;
    return warnings;
  }, [replaceCart]);

  return {
    cart,
    cartRef,
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
    lastSale,
    lastCreditCustomerName,
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
