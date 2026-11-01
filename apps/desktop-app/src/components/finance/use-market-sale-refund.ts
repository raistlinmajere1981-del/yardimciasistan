import { useEffect, useReducer, useState } from "react";
import type { DesktopCommerceBridge } from "../../../electron/commerce-ipc-contract";
import type { FullRefundMarketSaleInput, FullRefundMarketSalePreview } from "../../../electron/market-sale-full-refund";
import { reportAppStatus } from "../../app/runtime-state";
import type { DesktopFinanceEntry } from "../../../electron/finance";

type Pending = { preview: FullRefundMarketSalePreview; command: Readonly<FullRefundMarketSaleInput>; busy: boolean; uncertain: boolean; message: string };
// Memory only, scoped to this authenticated bridge, persisted business/actor and sale.
const sessions = new WeakMap<DesktopCommerceBridge, Map<string, Pending>>();
const reads = new WeakMap<DesktopCommerceBridge, Map<string, Promise<FullRefundMarketSalePreview>>>();
const scopeKey = (p: FullRefundMarketSalePreview) => JSON.stringify([p.businessId, p.actorId, p.saleId]);
const sameAuthority = (a: FullRefundMarketSalePreview, b: FullRefundMarketSalePreview) => a.businessId === b.businessId && a.actorId === b.actorId;
function previewSale(bridge: DesktopCommerceBridge, saleId: string) {
  let inflight = reads.get(bridge);
  if (!inflight) { inflight = new Map(); reads.set(bridge, inflight); }
  let promise = inflight.get(saleId);
  if (!promise) {
    promise = bridge.getFullRefundMarketSalePreview(saleId).finally(() => inflight.delete(saleId));
    inflight.set(saleId, promise);
  }
  return promise;
}
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
function supported(value: FullRefundMarketSalePreview, saleId: string): boolean {
  return value?.saleId === saleId && typeof value.businessId === "string" && value.businessId.length > 0 && typeof value.actorId === "string" && value.actorId.length > 0
    && typeof value.eligible === "boolean" && typeof value.refunded === "boolean" && typeof value.currency === "string" && /^[A-Z]{3}$/.test(value.currency)
    && [value.cashMinor, value.pointsMinor, value.totalMinor].every(n => Number.isSafeInteger(n) && n >= 0)
    && value.cashMinor + value.pointsMinor === value.totalMinor && Array.isArray(value.lines)
    && value.lines.every(line => typeof line.name === "string" && Number.isFinite(line.quantity) && line.quantity > 0)
    && (value.customerName === null || typeof value.customerName === "string");
}

export function useMarketSaleRefund(entries: DesktopFinanceEntry[], refresh: () => Promise<unknown>) {
  const bridge = window.yardimciDesktop?.commerce;
  const [, render] = useReducer(n => n + 1, 0);
  const [previews, setPreviews] = useState<Record<string, FullRefundMarketSalePreview>>({});
  const [selected, setSelected] = useState<FullRefundMarketSalePreview | null>(null);
  const [message, setMessage] = useState("");
  const [revision, reload] = useReducer(n => n + 1, 0);
  const [checkingScope, setCheckingScope] = useState(() => Boolean(bridge && sessions.get(bridge)?.size));
  const [verifiedScope, setVerifiedScope] = useState<FullRefundMarketSalePreview | null>(null);
  const pending = bridge && verifiedScope ? [...(sessions.get(bridge)?.values() ?? [])].find(saved => sameAuthority(saved.preview, verifiedScope)) : undefined;
  useEffect(() => { listeners.add(render); return () => { listeners.delete(render); }; }, []);
  useEffect(() => {
    let disposed = false;
    setPreviews({});
    if (!bridge?.getFullRefundMarketSalePreview) { setCheckingScope(false); return; }
    const saleIds = new Set(entries.filter(e => e.sourceType === "commerce_sale" && e.direction === "income").map(e => e.sourceId));
    const saved = sessions.get(bridge);
    for (const item of saved?.values() ?? []) saleIds.add(item.command.saleId);
    void Promise.all([...saleIds].map(async saleId => {
      try {
        const value = await previewSale(bridge, saleId);
        if (disposed || !supported(value, saleId)) return;
        setVerifiedScope(value);
        setSelected(current => current && !sameAuthority(current, value) ? null : current);
        if (value.eligible && !value.refunded) setPreviews(current => ({ ...current, [saleId]: value }));
      } catch { /* Fail closed: no action for an unverified row. */ }
    })).finally(() => { if (!disposed) setCheckingScope(false); });
    return () => { disposed = true; };
  }, [bridge, entries, revision]);

  async function submit() {
    if (!bridge || pending?.busy) return;
    let active = pending;
    if (!active) {
      if (!selected) return;
      let scoped = sessions.get(bridge);
      if (!scoped) { scoped = new Map(); sessions.set(bridge, scoped); }
      // Synchronous protection also covers two confirms before React renders.
      if ([...scoped.values()].some(saved => sameAuthority(saved.preview, selected))) return;
      active = { preview: selected, command: Object.freeze({ saleId: selected.saleId, operationId: crypto.randomUUID(), kind: "full" }),
        busy: false, uncertain: false, message: "" };
      scoped.set(scopeKey(selected), active);
      setVerifiedScope(selected);
    }
    if (active !== sessions.get(bridge)?.get(scopeKey(active.preview)) || active.busy) return;
    active.busy = true; notify();
    let confirmed = false;
    try {
      const result = await bridge.tryFullRefundMarketSale(active.command);
      if (result?.ok === false && result.expected === true && typeof result.code === "string" && typeof result.message === "string") {
        // After an uncertain attempt even an expected rejection cannot disprove the earlier commit.
        if (active.uncertain) { active.message = result.message; return; }
        sessions.get(bridge)?.delete(scopeKey(active.preview)); setSelected(null); setMessage(result.message); reload(); return;
      }
      const receipt = result?.ok === true ? result.value?.receipt : undefined;
      if (!receipt || receipt.version !== 1 || typeof receipt.refundId !== "string" || !receipt.refundId || receipt.saleId !== active.command.saleId
        || receipt.businessId !== active.preview.businessId || receipt.cashMinor !== active.preview.cashMinor
        || receipt.pointsMinor !== active.preview.pointsMinor || receipt.currency !== active.preview.currency
        || !["cash", "card", "bank", "other"].includes(receipt.paymentMethod)
        || !(receipt.customerId === null || typeof receipt.customerId === "string")
        || !Array.isArray(receipt.stockMovementIds) || !receipt.stockMovementIds.every(id => typeof id === "string")
        || active.preview.pointsMinor > 0 && !receipt.benefits
        || !(receipt.benefits === null || receipt.benefits?.version === 1 && typeof receipt.benefits.snapshotId === "string"
          && receipt.benefits.couponUsageRestored === false && Array.isArray(receipt.benefits.pointEntryIds)
          && receipt.benefits.pointEntryIds.every(id => typeof id === "string"))
        || typeof (result.ok && result.value.replayed) !== "boolean") throw new Error("ambiguous_refund_reply");
      confirmed = true;
      sessions.get(bridge)?.delete(scopeKey(active.preview));
      notify(); // A confirmed refund must release remounted views before projection refresh.
      setSelected(null); setPreviews(current => {
        const next = { ...current }; delete next[active.command.saleId]; return next;
      });
      setMessage("Kasa iadesi kaydı tamamlandı.");
      reportAppStatus("success", "Kasa iadesi kaydı tamamlandı.");
      try { await refresh(); } catch { setMessage("Kasa iadesi kaydı tamamlandı. Hareketler yenilenemedi; listeyi yeniden açın."); }
      reload();
    } catch {
      if (!confirmed) { active.uncertain = true; active.message = "İade yanıtı doğrulanamadı. Aynı işlemle sonucu doğrulayın."; }
    } finally { active.busy = false; notify(); }
  }
  const visiblePending = pending;
  return { previews, selected: visiblePending?.preview ?? selected, message, pending: visiblePending,
    blocked: Boolean(pending) || checkingScope, select: (value: FullRefundMarketSalePreview) => { if (!pending && supported(value, value.saleId) && value.eligible && !value.refunded) { setSelected(value); setMessage(""); } },
    cancel: () => { if (!pending) setSelected(null); }, submit };
}
