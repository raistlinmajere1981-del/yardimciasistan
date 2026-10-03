import { BUSINESS_CAPABILITIES, hasBusinessCapability, normalizeCommerceOrderBuyerSnapshot } from "@yardimci-asistan/shared";
import type { WebOrderEnvelope } from "@yardimci-asistan/sync-core";
import type { DesktopDatabase } from "./database";

function invalidEnvelope(): never {
  throw new Error("Web sipariş taşıma kaydı geçersiz.");
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalidEnvelope();
  return value as Record<string, unknown>;
}

/** Validates only ingress data; canonical pricing and persistence own order rules. */
export class OnlineOrderIngressService {
  constructor(private readonly database: Pick<DesktopDatabase,
    "getEnabledBusinessCapabilities" | "createCommerceOrder">) {}

  importOrder(input: WebOrderEnvelope, afterSeq = 0) {
    if (!hasBusinessCapability(this.database.getEnabledBusinessCapabilities(), BUSINESS_CAPABILITIES.ONLINE_SALES)) {
      throw new Error("Online satış bu işletmede etkin değil.");
    }
    const envelope = record(input);
    const id = typeof envelope.id === "string" ? envelope.id.trim() : "";
    if (!id || id.length > 180
        || typeof envelope.createdAt !== "string" || !Number.isFinite(Date.parse(envelope.createdAt))
        || !Number.isSafeInteger(envelope.syncSeq) || Number(envelope.syncSeq) <= afterSeq
        || !Array.isArray(envelope.items) || envelope.items.length === 0 || envelope.items.length > 50) {
      return invalidEnvelope();
    }
    const items = envelope.items.map((value) => {
      const item = record(value);
      const productId = typeof item.productId === "string" ? item.productId.trim() : "";
      // Numeric strings may cross PHP/JSON boundaries; booleans/objects must not coerce to quantities.
      const quantity = typeof item.quantity === "number"
        || (typeof item.quantity === "string" && item.quantity.trim() !== "")
        ? Math.round(Number(item.quantity) * 10000) / 10000 : NaN;
      if (!productId || productId.length > 180 || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1000) return invalidEnvelope();
      return { productId, quantity };
    });
    if (new Set(items.map((item) => item.productId)).size !== items.length
        || items.reduce((sum, item) => sum + item.quantity, 0) > 10000) return invalidEnvelope();
    const buyerSnapshot = normalizeCommerceOrderBuyerSnapshot(envelope.buyer);
    const note = envelope.note === undefined ? "" : envelope.note;
    if (typeof note !== "string" || [...note].length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(note)) return invalidEnvelope();
    return this.database.createCommerceOrder({
      source: "web-online-sales",
      sourceReference: id,
      buyerSnapshot,
      note: note.trim(),
      items
    });
  }
}
