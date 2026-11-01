import { useCallback, useEffect, useRef, useState } from "react";
import { parseMoneyInput } from "@yardimci-asistan/shared";
import type { MarketSaleBenefitsState, MarketSalePreview } from "../../electron/market-sale-benefits";
import type { CompleteMarketSaleInput } from "../../electron/market-sale-operation";
import type { MarketQuickSaleCartLine } from "./use-market-quick-sale-session";

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key: string, item: unknown): unknown => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const record = item as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, record[key]]));
  });
}

/** Workspace-local secrets and pending exact request never enter persisted drafts or diagnostics. */
export function useMarketSaleBenefits(input: {
  enabled: boolean; pricingContext: string; priceRevision: number; pricesReady: boolean;
  cart: MarketQuickSaleCartLine[]; customerId: string; paymentMethod: string;
  paymentAmount: string | null; discountTotal: string; sourceDraftId: string | undefined; transactionMode: string;
}) {
  const [availability, setAvailability] = useState<MarketSaleBenefitsState | null>(null);
  const [availabilityError, setAvailabilityError] = useState("");
  const [availabilityRevision, setAvailabilityRevision] = useState(0);
  const reloadAvailability = useCallback(() => setAvailabilityRevision(revision => revision + 1), []);
  const [selected, setSelected] = useState(false);
  const [points, setPoints] = useState("0");
  const coupon = useRef("");
  const [couponRevision, setCouponRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ fingerprint: string; operationId: string; value: MarketSalePreview } | null>(null);
  const pending = useRef<CompleteMarketSaleInput | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const generation = useRef(0);
  const parsedPoints = parseMoneyInput(points);
  const requestedPointsMinor = parsedPoints.status === "valid" ? parsedPoints.minor : null;
  const fingerprint = JSON.stringify([input, points, couponRevision, selected, availability]);
  const currentFingerprint = useRef(fingerprint);
  currentFingerprint.current = fingerprint;

  useEffect(() => {
    let disposed = false;
    setAvailability(null);
    setAvailabilityError("");
    if (!input.enabled) return;
    void window.yardimciDesktop?.commerce.getMarketSaleBenefitsState?.().then(result => {
      if (disposed) return;
      if (result.ok) setAvailability(result.value);
      else setAvailabilityError(result.message);
    }).catch(() => { if (!disposed) setAvailabilityError("İndirim ve Puan ayarları okunamadı."); });
    return () => { disposed = true; };
  }, [input.enabled, input.pricingContext, input.priceRevision, availabilityRevision]);

  useEffect(() => { if (!input.customerId && !pending.current) setPoints("0"); }, [input.customerId]);

  const available = input.enabled && availability?.enabled === true && Object.values(availability.families).some(Boolean);
  // A selected flow stays selected on capability loss so a pending checkout cannot silently become legacy.
  const active = selected;
  const parsedDiscount = parseMoneyInput(input.discountTotal);
  const compatible = input.transactionMode === "sale" && input.paymentMethod !== "credit"
    && (input.discountTotal.trim() === "" || parsedDiscount.status === "valid" && parsedDiscount.minor === 0)
    && input.paymentAmount === null;
  const current = available && active && compatible && input.pricesReady && preview?.fingerprint === fingerprint ? preview : null;

  function setCoupon(value: string) {
    if (pending.current) return;
    coupon.current = value;
    setCouponRevision(revision => revision + 1);
  }
  async function refresh() {
    const bridge = window.yardimciDesktop?.commerce;
    if (!bridge || pending.current || !available || !active || !compatible || !input.pricesReady || !input.cart.length
      || requestedPointsMinor === null || requestedPointsMinor < 0) return;
    const requestGeneration = ++generation.current;
    const requestFingerprint = fingerprint;
    setPreview(null);
    setLoading(true);
    try {
      const operationId = crypto.randomUUID();
      const result = await bridge.previewMarketSaleBenefits({ operationId,
        items: input.cart.map(line => ({ productId: line.product.id, quantity: line.quantity })),
        customerId: input.customerId, paymentMethod: input.paymentMethod, requestedPointsMinor,
        ...(coupon.current ? { couponCode: coupon.current } : {}) });
      if (requestGeneration !== generation.current || requestFingerprint !== currentFingerprint.current) return;
      if (!result.ok) { reloadAvailability(); throw new Error(result.message); }
      const nextAvailability = { enabled: true, families: result.value.families };
      setAvailability(nextAvailability);
      setPreview({ fingerprint: JSON.stringify([input, points, couponRevision, selected, nextAvailability]), operationId, value: result.value });
    } finally { if (requestGeneration === generation.current) setLoading(false); }
  }
  async function submit() {
    const bridge = window.yardimciDesktop?.commerce;
    if (!bridge) throw new Error("Satış kaydı kullanılamıyor.");
    if (!pending.current) {
      if (!current || requestedPointsMinor === null) throw new Error("Önce güncel tutarı hesaplayın.");
      pending.current = { operationId: current.operationId, settlement: "paid", customerId: input.customerId,
        paymentMethod: input.paymentMethod, paymentAmountMinor: current.value.quote.payableMinor,
        ...(input.sourceDraftId ? { sourceDraftId: input.sourceDraftId } : {}),
        items: input.cart.map(line => ({ productId: line.product.id, quantity: line.quantity })),
        benefits: { requestedPointsMinor, expectedQuote: current.value.quote,
          ...(coupon.current ? { couponCode: coupon.current } : {}) } };
    }
    let rejected = false;
    try {
      const response = await bridge.tryCompleteMarketSale(pending.current);
      if (response?.ok === false && response.expected === true) {
        rejected = true;
        pending.current = null;
        setUncertain(false);
        setPreview(null);
        throw new Error(response.message);
      }
      if (response?.ok !== true || !response.value?.sale?.id || !response.value.benefits
        || response.value.benefits.source.id !== response.value.sale.id
        || canonical(response.value.benefits.quote) !== canonical(pending.current.benefits!.expectedQuote)) {
        throw new Error("Satış sonucu doğrulanamadı. Aynı işlemle yeniden deneyin.");
      }
      pending.current = null;
      coupon.current = "";
      setUncertain(false);
      setPreview(null);
      return response.value;
    } catch (error) {
      if (!rejected) setUncertain(true);
      throw error;
    }
  }
  const clear = useCallback(() => {
    if (pending.current) return false;
    coupon.current = "";
    setCouponRevision(revision => revision + 1);
    setPoints("0");
    setSelected(false);
    setPreview(null);
    generation.current += 1;
    setLoading(false);
    return true;
  }, []);
  return { available, active, compatible, availabilityError, reloadAvailability, families: availability?.families, selected, setSelected,
    points, setPoints, requestedPointsMinor, setCoupon, coupon, current: current?.value ?? null,
    refresh, loading, submit, uncertain, pending, clear };
}
