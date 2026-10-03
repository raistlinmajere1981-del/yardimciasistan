import type { CommerceOrderBuyerSnapshot } from "../types/commerce";

/** Guest contact validation never includes the supplied PII in an error. */
export function normalizeCommerceOrderBuyerSnapshot(input: unknown): CommerceOrderBuyerSnapshot {
  const invalid = (): never => { throw new Error("Sipariş iletişim bilgileri geçersiz."); };
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid();
  const buyer = input as Record<string, unknown>;
  const text = (value: unknown, maximum: number): string => {
    if (typeof value !== "string") return invalid();
    const normalized = value.trim();
    if ([...normalized].length > maximum || /[\u0000-\u001f\u007f]/.test(normalized)) return invalid();
    return normalized;
  };
  const name = text(buyer.name, 160);
  const phone = text(buyer.phone, 40);
  const digits = phone.replace(/\D/g, "");
  if (!name || !/^\+?[0-9 ()./-]+$/.test(phone) || digits.length < 7 || digits.length > 15) return invalid();
  const email = buyer.email === undefined ? "" : text(buyer.email, 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return invalid();
  return { name, phone, ...(email ? { email } : {}) };
}
