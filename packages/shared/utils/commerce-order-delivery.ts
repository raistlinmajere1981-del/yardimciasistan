import type { CommerceOrderDeliverySnapshot, CommerceOrderShippingAddress, OnlineSalesDeliverySettings } from "../types/commerce";

/** Explicit allowlist; validation errors never include submitted address PII. */
export function normalizeCommerceOrderDeliverySnapshot(input: unknown): CommerceOrderDeliverySnapshot {
  const invalid = (): never => { throw new Error("Sipariş teslimat bilgileri geçersiz."); };
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid();
  const delivery = input as Record<string, unknown>;
  if (delivery.method === "pickup") return { method: "pickup", address: null };
  if (delivery.method !== "shipping" || !delivery.address || typeof delivery.address !== "object" || Array.isArray(delivery.address)) return invalid();
  const raw = delivery.address as Record<string, unknown>;
  const text = (value: unknown, maximum: number, multiline = false): string => {
    if (typeof value !== "string") return invalid();
    const valueText = value.trim();
    const controls = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
    if ([...valueText].length > maximum || controls.test(valueText)) return invalid();
    return valueText;
  };
  const countryCode = text(raw.countryCode, 2);
  if (!/^[A-Za-z]{2}$/.test(countryCode)) return invalid();
  const address: CommerceOrderShippingAddress = {
    recipientName: text(raw.recipientName, 160), addressLine1: text(raw.addressLine1, 300),
    district: text(raw.district, 120), city: text(raw.city, 120), countryCode: countryCode.toUpperCase()
  };
  if (!address.recipientName || !address.addressLine1 || !address.district || !address.city || !/^[A-Z]{2}$/.test(address.countryCode)) return invalid();
  for (const [key, maximum] of [["addressLine2", 300], ["postalCode", 32], ["note", 500]] as const) {
    const value = raw[key] === undefined ? "" : text(raw[key], maximum, key === "note");
    if (value) address[key] = value;
  }
  return { method: "shipping", address };
}

export function normalizeOnlineSalesDeliverySettings(input: unknown): OnlineSalesDeliverySettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Online satış teslimat ayarları geçersiz.");
  const value = input as Record<string, unknown>;
  if (typeof value.pickupEnabled !== "boolean" || typeof value.shippingEnabled !== "boolean" || (!value.pickupEnabled && !value.shippingEnabled)) {
    throw new Error("En az bir online satış teslimat yöntemi açık olmalı.");
  }
  return { pickupEnabled: value.pickupEnabled, shippingEnabled: value.shippingEnabled };
}
