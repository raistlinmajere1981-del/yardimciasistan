import { useCallback, useEffect, useRef, useState } from "react";
import { moneyToMinor, parseMoneyInput } from "@yardimci-asistan/shared";
import type { CommerceOrderBenefitsPreview, CommerceOrderDetail, FulfillCommerceOrderInput } from "@yardimci-asistan/shared";
import type { MarketSaleBenefitsState } from "../../electron/market-sale-benefits";
import type { FulfillmentPaymentChoice } from "./use-market-orders-session";

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown): unknown => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const record = item as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, record[key]]));
  });
}

function rejectionNote(code: string, fallback: string) {
  if (code === "BENEFITS_ORDER_SNAPSHOT_CONFLICT") return "İndirim siparişle eşleşmiyor. Ödeme/kupon seçimini değiştirin veya İndirim ve Puan seçimini kaldırın; sipariş toplamı değişmez.";
  if (code === "BENEFITS_QUOTE_CHANGED") return "Tutar değişti. Yeniden hesaplayın.";
  return fallback;
}

/** Controller-owned, memory-only secret and immutable command survive workspace/tab unmounts. */
export function useMarketOrderBenefits({ enabled, detail, payment }: {
  enabled: boolean; detail: CommerceOrderDetail | null; payment: FulfillmentPaymentChoice;
}) {
  const order = detail?.order;
  const orderId = order?.id ?? "";
  const customerId = order?.customerId ?? "";
  const eligible = Boolean(enabled && order?.status === "confirmed" && order.total > 0
    && ["desktop", "desktop-wholesale"].includes(order.source));
  const [availability, setAvailability] = useState<MarketSaleBenefitsState | null>(null);
  const [availabilityError, setAvailabilityError] = useState("");
  const [revision, setRevision] = useState(0);
  const reloadAvailability = useCallback(() => setRevision(value => value + 1), []);
  const [selectedId, setSelectedId] = useState("");
  const [points, setPointsState] = useState("0");
  const coupon = useRef("");
  const [couponRevision, setCouponRevision] = useState(0);
  const [preview, setPreview] = useState<{ fingerprint: string; operationKey: string; value: CommerceOrderBenefitsPreview } | null>(null);
  const [loading, setLoading] = useState(false);
  const previewInFlight = useRef(false);
  const generation = useRef(0);
  const pending = useRef<FulfillCommerceOrderInput | null>(null);
  const submitInFlight = useRef(false);
  const [locked, setLocked] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const active = Boolean(selectedId && selectedId === orderId);
  const compatible = eligible && payment !== "credit";
  const hasDiscount = Boolean(order && order.discountTotal > 0);
  const pointsAvailable = Boolean(availability?.families.points && order?.customerId);
  const couponAvailable = Boolean(availability?.families.coupon && hasDiscount);
  const available = eligible && availability?.enabled === true
    && (pointsAvailable || hasDiscount && (couponAvailable || availability.families.payment_modifier));
  const parsed = parseMoneyInput(points);
  const requestedPointsMinor = parsed.status === "valid" ? parsed.minor : null;
  const fingerprint = JSON.stringify([detail, payment, enabled, availability, revision, points, couponRevision, selectedId]);
  const fingerprintRef = useRef(fingerprint);
  fingerprintRef.current = fingerprint;
  const current = available && active && compatible && preview?.fingerprint === fingerprint ? preview : null;

  useEffect(() => {
    let disposed = false;
    setAvailability(null);
    setAvailabilityError("");
    if (!eligible) return;
    void window.yardimciDesktop?.commerce.getMarketSaleBenefitsState().then(result => {
      if (disposed) return;
      if (result.ok) setAvailability(result.value);
      else setAvailabilityError("İndirim ve Puan ayarları okunamadı.");
    }).catch(() => { if (!disposed) setAvailabilityError("İndirim ve Puan ayarları okunamadı."); });
    return () => { disposed = true; };
  }, [eligible, orderId, revision]);

  const clear = useCallback(() => {
    if (pending.current) return false;
    coupon.current = "";
    setCouponRevision(value => value + 1);
    setPointsState("0");
    setSelectedId("");
    setPreview(null);
    ++generation.current;
    previewInFlight.current = false;
    setLoading(false);
    return true;
  }, []);
  useEffect(() => { clear(); }, [orderId, clear]);
  useEffect(() => {
    if (!pending.current && (!customerId || availability && !availability.families.points)) setPointsState("0");
  }, [customerId, availability]);
  useEffect(() => {
    if (!pending.current && (!hasDiscount || availability && !availability.families.coupon)) {
      coupon.current = "";
      setCouponRevision(value => value + 1);
    }
  }, [hasDiscount, availability]);

  function select(value: boolean) {
    if (pending.current) return;
    if (!value) clear();
    else if (available && compatible) setSelectedId(orderId);
  }
  function setPoints(value: string) { if (!pending.current) setPointsState(value); }
  function setCoupon(value: string) {
    if (pending.current) return;
    coupon.current = value;
    setCouponRevision(revision => revision + 1);
  }
  async function refresh() {
    const bridge = window.yardimciDesktop?.commerce;
    if (!bridge || pending.current || previewInFlight.current || !available || !active || !compatible
      || requestedPointsMinor === null || requestedPointsMinor < 0) return;
    const request = ++generation.current, captured = fingerprint;
    previewInFlight.current = true;
    setLoading(true);
    setPreview(null);
    let failureNote = "Tutar hesaplanamadı. Yeniden deneyin.";
    try {
      const operationKey = `desktop-order-benefits:${crypto.randomUUID()}`;
      const result = await bridge.previewOrderBenefits({ orderId, operationKey, paymentMethod: payment,
        requestedPointsMinor, ...(couponAvailable && coupon.current ? { couponCode: coupon.current } : {}) });
      if (request !== generation.current || captured !== fingerprintRef.current || pending.current) return;
      if (!result.ok) {
        reloadAvailability();
        failureNote = rejectionNote(result.code, result.message);
        throw new Error(failureNote);
      }
      const value = result.value, quote = value.quote;
      if (!order || value.authority.state !== "preview_only" || value.authority.canConfirmPoints !== false
        || quote.currency !== order.currency || quote.currencyExponent !== 2 || quote.accountingMinor !== 0
        || quote.subtotalMinor !== moneyToMinor(order.subtotal) || quote.discountMinor !== moneyToMinor(order.discountTotal)
        || quote.payableMinor + quote.pointsTenderMinor !== moneyToMinor(order.total)) {
        throw new Error("Tutar doğrulanamadı. Yeniden hesaplayın.");
      }
      setPreview({ fingerprint: captured, operationKey, value });
    } catch {
      if (request === generation.current && captured === fingerprintRef.current) throw new Error(failureNote);
    } finally {
      if (request === generation.current) { previewInFlight.current = false; setLoading(false); }
    }
  }
  async function submit() {
    const bridge = window.yardimciDesktop?.commerce;
    if (!bridge || submitInFlight.current) throw new Error("Sipariş işlemi sürüyor.");
    if (!pending.current) {
      if (!current || payment === "credit" || requestedPointsMinor === null) throw new Error("Önce güncel tutarı hesaplayın.");
      pending.current = { orderId, operationKey: current.operationKey, settlement: { type: "paid", paymentMethod: payment },
        benefits: { requestedPointsMinor, expectedQuote: structuredClone(current.value.quote), paymentAmountMinor: current.value.quote.payableMinor,
          ...(couponAvailable && coupon.current ? { couponCode: coupon.current } : {}) } };
      ++generation.current;
      setLocked(true);
    }
    submitInFlight.current = true;
    let rejection: string | null = null;
    try {
      const command = pending.current;
      const response = await bridge.tryFulfillOrder(command);
      if (response?.ok === false && response.expected === true) {
        rejection = rejectionNote(response.code, response.message);
        pending.current = null;
        setLocked(false);
        setUncertain(false);
        setPreview(null);
        reloadAvailability();
        throw new Error(rejection);
      }
      if (response?.ok !== true || !response.value?.sale?.id || !response.value.benefits
        || response.value.order.order.id !== command.orderId || response.value.order.order.status !== "fulfilled"
        || response.value.fulfillment.operationKey !== command.operationKey || response.value.fulfillment.orderId !== command.orderId
        || response.value.fulfillment.saleId !== response.value.sale.id || response.value.benefits.source.kind !== "commerce_order"
        || response.value.benefits.source.id !== command.orderId
        || canonical(response.value.benefits.quote) !== canonical(command.benefits!.expectedQuote)) throw new Error("uncertain_order_result");
      pending.current = null;
      setLocked(false);
      setUncertain(false);
      clear();
      return response.value;
    } catch {
      if (rejection) throw new Error(rejection);
      setUncertain(true);
      throw new Error("Sipariş sonucu belirsiz. Aynı işlemin sonucunu doğrulayın.");
    } finally { submitInFlight.current = false; }
  }
  return { eligible, available, active, compatible, pointsAvailable, couponAvailable, availability, availabilityError, reloadAvailability,
    points, setPoints, requestedPointsMinor, coupon, setCoupon, select, clear, current: current?.value ?? null,
    refresh, loading, pending, locked, uncertain, submit };
}
