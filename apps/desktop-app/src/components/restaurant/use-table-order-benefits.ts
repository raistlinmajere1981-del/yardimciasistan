import { useEffect, useRef, useState, type RefObject } from "react";
import { moneyToMinor, parseMoneyInput } from "@yardimci-asistan/shared";
import type { BenefitsQuote, TableOrderBenefitsCloseInput, TableOrderBenefitsPaidReceipt,
  TableOrderBenefitsPreview, TableOrderBenefitsPreviewInput, TableOrderBenefitsState } from "@yardimci-asistan/shared";
import type { DesktopTableOrder } from "../../../electron/database";

type Stage = "idle" | "preview" | "confirm" | "settle" | "uncertain" | "committed";
const expectedRejections = new Set([
  "BENEFITS_STAFF_REQUIRED", "BENEFITS_SESSION_LOCKED", "BENEFITS_CAPABILITY_DISABLED",
  "BENEFITS_SECURE_STORAGE_UNAVAILABLE", "BENEFITS_POINTS_INSUFFICIENT", "BENEFITS_POINTS_UNAVAILABLE",
  "BENEFITS_COUPON_UNAVAILABLE", "BENEFITS_COUPON_RATE_LIMITED", "BENEFITS_COUPON_AUTHORIZATION_REQUIRED",
  "BENEFITS_COUPON_THRESHOLD", "BENEFITS_COUPON_EXHAUSTED", "BENEFITS_QUOTE_CHANGED",
  "BENEFITS_PAYMENT_METHOD_CHANGED", "BENEFITS_ACTUAL_PAYMENT_REQUIRED", "BENEFITS_TABLE_MANUAL_DISCOUNT_UNSUPPORTED",
  "BENEFITS_TABLE_SNAPSHOT_CONFLICT", "BENEFITS_TABLE_PAID_REQUIRED", "BENEFITS_SETTLEMENT_MISMATCH",
  "BENEFITS_COMBINATION_FORBIDDEN", "BENEFITS_CUSTOMER_SCOPE", "BENEFITS_IDEMPOTENCY_INTENT_CHANGED"
]);
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown): unknown => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const record = item as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, record[key]]));
  });
}
function validQuote(q: BenefitsQuote) {
  return q && q.version === 1 && q.currencyExponent === 2 && q.accountingMinor === 0
    && [q.subtotalMinor, q.discountMinor, q.pointsTenderMinor, q.payableMinor, q.pointsEarnPreviewMinor]
      .every(n => Number.isSafeInteger(n) && n >= 0);
}
function freezeCommand(input: TableOrderBenefitsCloseInput): TableOrderBenefitsCloseInput {
  const freeze = (value: object) => {
    Object.values(value as Record<string, unknown>).forEach(child => { if (child && typeof child === "object") freeze(child); });
    Object.freeze(value);
  };
  freeze(input);
  return input;
}

/** TableWorkspace owns this lifetime. Secrets and exact uncertain commands never enter persistence or projections. */
export function useTableOrderBenefits({ order, customerId, revision, ready, lock, onPaid }: {
  order: DesktopTableOrder | null; customerId: string; revision: number; ready: boolean;
  lock: RefObject<boolean>; onPaid: (receipt: TableOrderBenefitsPaidReceipt, isCurrent: () => boolean) => Promise<void>;
}) {
  const [availability, setAvailability] = useState<TableOrderBenefitsState | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [method, setMethodState] = useState<TableOrderBenefitsPreviewInput["paymentMethod"]>("cash");
  const [points, setPointsState] = useState("0");
  const coupon = useRef("");
  const [couponRevision, setCouponRevision] = useState(0);
  const [preview, setPreview] = useState<{ fingerprint: string; operationKey: string; value: TableOrderBenefitsPreview } | null>(null);
  const [stage, setStageState] = useState<Stage>("idle");
  const stageRef = useRef<Stage>("idle");
  const pending = useRef<TableOrderBenefitsCloseInput | null>(null);
  const wasUncertain = useRef(false);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const [error, setError] = useState("");
  const onPaidRef = useRef(onPaid); onPaidRef.current = onPaid;
  const eligible = Boolean(order && ["open", "preparing", "served", "payment"].includes(order.status)
    && order.total > 0 && order.discountTotal === 0);
  const available = eligible && availability?.enabled === true && Object.values(availability.families).some(Boolean);
  const active = Boolean(selectedId && selectedId === order?.id);
  const pointsAvailable = Boolean(customerId && availability?.families.points);
  const parsed = parseMoneyInput(points);
  const requestedPointsMinor = pointsAvailable ? parsed.status === "valid" ? parsed.minor : null : 0;
  const fingerprint = JSON.stringify([order, customerId, revision, ready, availability, method, points, couponRevision, selectedId]);
  const fingerprintRef = useRef(fingerprint); fingerprintRef.current = fingerprint;
  const current = active && available && ready && preview?.fingerprint === fingerprint ? preview : null;
  const blocked = stage !== "idle" && stage !== "committed";

  function setStage(next: Stage) {
    stageRef.current = next;
    lock.current = next !== "idle";
    if (alive.current) setStageState(next);
  }
  useEffect(() => { alive.current = true; return () => { alive.current = false; coupon.current = ""; }; }, []);
  useEffect(() => {
    let disposed = false;
    if (pending.current || stageRef.current === "committed") return;
    setAvailability(null);
    if (!eligible) return;
    const bridge = window.yardimciDesktop;
    if (!bridge?.getTableOrderBenefitsState) return;
    void bridge.getTableOrderBenefitsState().then(result => {
      if (!disposed && alive.current) {
        if (result.ok) setAvailability(result.value);
        else setError("İndirim ve Puan ayarları okunamadı.");
      }
    }).catch(() => { if (!disposed && alive.current) setError("İndirim ve Puan ayarları okunamadı."); });
    return () => { disposed = true; };
  }, [eligible, order?.id, revision]);
  useEffect(() => {
    if (pending.current) return;
    coupon.current = ""; setCouponRevision(value => value + 1);
    setSelectedId(""); setPointsState("0"); setPreview(null); setError("");
  }, [order?.id]);
  useEffect(() => {
    if (pending.current) return;
    setPointsState("0"); setPreview(null);
  }, [customerId, pointsAvailable]);
  useEffect(() => {
    if (pending.current || availability?.families.coupon) return;
    coupon.current = ""; setCouponRevision(value => value + 1);
  }, [availability?.families.coupon]);
  useEffect(() => {
    if (pending.current || eligible && (!availability || availability.enabled && Object.values(availability.families).some(Boolean))) return;
    setSelectedId(""); setPreview(null); setPointsState("0");
    coupon.current = ""; setCouponRevision(value => value + 1);
  }, [eligible, availability]);

  function select(value: boolean) {
    if (stageRef.current !== "idle") return;
    setError(""); setPreview(null);
    if (value && available && ready) setSelectedId(order!.id);
    else {
      setSelectedId(""); coupon.current = ""; setCouponRevision(v => v + 1); setPointsState("0");
    }
  }
  function setPoints(value: string) { if (stageRef.current === "idle") { setPointsState(value); setPreview(null); } }
  function setMethod(value: TableOrderBenefitsPreviewInput["paymentMethod"]) {
    if (stageRef.current === "idle") { setMethodState(value); setPreview(null); }
  }
  function setCoupon(value: string) {
    if (stageRef.current !== "idle") return;
    coupon.current = value; setCouponRevision(v => v + 1); setPreview(null);
  }
  async function refresh() {
    if (!ready || !available || !active || !order || stageRef.current !== "idle" || requestedPointsMinor === null) return;
    const captured = fingerprint, operationKey = `desktop-table-benefits:${crypto.randomUUID()}`;
    setStage("preview"); setError(""); setPreview(null);
    try {
      const result = await window.yardimciDesktop!.previewTableOrderBenefits({ orderId: order.id, operationKey,
        paymentMethod: method, requestedPointsMinor,
        ...(availability.families.coupon && coupon.current ? { couponCode: coupon.current } : {}) });
      if (!alive.current || captured !== fingerprintRef.current) return;
      if (!result.ok) { setError(result.message); return; }
      const value = result.value, q = value.quote;
      // Shape/context validation only. All discount, tender, cash and earning amounts come from main.
      if (!validQuote(q) || q.currency !== order.items.find(item => item.currency)?.currency
        || q.subtotalMinor !== moneyToMinor(order.subtotal) || !/^[a-f0-9]{64}$/.test(value.previewToken)
        || value.authority.state !== "preview_only" || value.authority.canConfirmPoints !== false
        || !Number.isSafeInteger(value.availablePointsMinor) || value.availablePointsMinor < 0) {
        setError("Tutar doğrulanamadı. Yeniden hesaplayın."); return;
      }
      setPreview({ fingerprint: captured, operationKey, value });
    } catch { if (alive.current) setError("Tutar hesaplanamadı. Yeniden deneyin."); }
    finally { if (alive.current) setStage("idle"); }
  }
  function beginConfirmation() {
    if (!current || stageRef.current !== "idle") return null;
    setStage("confirm"); return current;
  }
  function cancelConfirmation() { if (stageRef.current === "confirm") setStage("idle"); }
  async function submit(approved?: typeof current) {
    if (inFlight.current || !alive.current || stageRef.current === "committed") return;
    if (!pending.current) {
      if (!approved || approved.fingerprint !== fingerprintRef.current || stageRef.current !== "confirm" || requestedPointsMinor === null) {
        cancelConfirmation(); setPreview(null); setError("Adisyon değişti. Yeniden hesaplayın."); return;
      }
      pending.current = freezeCommand({ orderId: order!.id, status: "paid", operationKey: approved.operationKey, paymentMethod: method,
        benefits: { requestedPointsMinor, expectedQuote: structuredClone(approved.value.quote), previewToken: approved.value.previewToken,
          paymentAmountMinor: approved.value.quote.payableMinor,
          ...(availability?.families.coupon && coupon.current ? { couponCode: coupon.current } : {}) } });
    }
    inFlight.current = true; setStage("settle"); setError("");
    try {
      const command = pending.current;
      const result = await window.yardimciDesktop!.settleTableOrderBenefits(command);
      if (!alive.current) return;
      if (result?.ok === false && typeof result.message === "string" && expectedRejections.has(result.code) && !wasUncertain.current) {
        pending.current = null; setPreview(null); setStage("idle");
        setError(result.code === "BENEFITS_QUOTE_CHANGED" ? "Adisyon veya kurallar değişti. Yeniden hesaplayın." : result.message);
        return;
      }
      if (result?.ok !== true || result.value?.orderId !== command.orderId || !result.value.benefits?.snapshotId
        || result.value.benefits.source?.kind !== "table_order" || result.value.benefits.source.id !== command.orderId
        || canonical(result.value.benefits.quote) !== canonical(command.benefits.expectedQuote)) throw new Error("uncertain");
      const receipt = result.value;
      pending.current = null; coupon.current = ""; wasUncertain.current = false;
      setCouponRevision(value => value + 1); setPreview(null); setSelectedId(""); setPointsState("0"); setStage("committed");
      // Projection failures after this point cannot turn a confirmed commit into another financial operation.
      try { await onPaidRef.current(receipt, () => alive.current); }
      catch { if (alive.current) setError("Adisyon ödendi; görünüm yenilenemedi. Masayı yeniden açın."); }
    } catch {
      if (!alive.current) return;
      wasUncertain.current = true; setStage("uncertain");
      setError("Adisyon sonucu belirsiz. Aynı işlemin sonucunu doğrulayın.");
    } finally { inFlight.current = false; }
  }
  return { available, active, availability,
    pointsAvailable: pointsAvailable || Boolean(pending.current && pending.current.benefits.requestedPointsMinor > 0),
    points, setPoints, requestedPointsMinor, coupon, setCoupon,
    method, setMethod, select, current: current?.value ?? null, refresh, beginConfirmation, cancelConfirmation, submit,
    pending, blocked, stage, error };
}
