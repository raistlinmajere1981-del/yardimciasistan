import type { CommerceCheckoutSnapshot } from "@yardimci-asistan/shared";

/** Only the authenticated hosting ingress may supply a checkout snapshot.
 * Validate the frozen arithmetic; never reprice an already accepted sale intent.
 */
export function normalizeAcceptedCheckout(value: unknown, items: Array<{ productId: string; quantity: number }>): CommerceCheckoutSnapshot {
  const invalid = (): never => { throw new Error("Sipariş ödeme snapshot geçersiz."); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const snapshot = value as CommerceCheckoutSnapshot;
  const minor = (amount: unknown) => Number.isSafeInteger(amount) && Number(amount) >= 0 && Number(amount) <= 900000000000;
  const text = (value: unknown, maximum: number): value is string => typeof value === "string" && value.trim().length > 0
    && value.length <= maximum && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
  if (snapshot.version !== 2 || snapshot.minor_unit !== 2 || !["TRY", "EUR", "USD", "GBP"].includes(snapshot.currency)
    || !/^YA-\d{8}-[A-F0-9]{10}$/.test(snapshot.order_number) || !/^[a-f0-9]{64}$/.test(snapshot.quote_id)
    || !Number.isFinite(Date.parse(snapshot.accepted_at)) || typeof snapshot.demo !== "boolean"
    || snapshot.payment_method !== "bank_transfer" || !["pickup", "shipping"].includes(snapshot.delivery_method)
    || !minor(snapshot.subtotal_minor) || !minor(snapshot.delivery_fee_minor) || !minor(snapshot.total_minor)
    || snapshot.total_minor !== snapshot.subtotal_minor + snapshot.delivery_fee_minor
    || (snapshot.delivery_method === "pickup" && snapshot.delivery_fee_minor !== 0)
    || !snapshot.bank || !text(snapshot.bank.name, 160) || !text(snapshot.bank.accountHolder, 160) || !text(snapshot.bank.iban, 80)
    || !snapshot.legal || !text(snapshot.legal.version, 80) || !text(snapshot.legal.preliminary, 40000) || !text(snapshot.legal.agreement, 40000)
    || snapshot.consent?.preliminary !== true || snapshot.consent?.agreement !== true || typeof snapshot.consent?.marketing !== "boolean"
    || !Array.isArray(snapshot.items) || snapshot.items.length !== items.length || items.length < 1 || items.length > 50) return invalid();
  let sum = 0;
  const seen = new Set<string>();
  for (const line of snapshot.items) {
    const source = items.find(item => item.productId === line.product_id);
    if (!source || seen.has(line.product_id) || source.quantity !== line.quantity || !text(line.name, 360)
      || !["piece", "kg", "g", "l", "ml", "pack", "box", "meter", "other"].includes(line.unit)
      || !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 1000
      || Math.abs(line.quantity * 10000 - Math.round(line.quantity * 10000)) > 0.000001
      || (["piece", "pack", "box"].includes(line.unit) && !Number.isInteger(line.quantity))
      || !minor(line.unit_price_minor) || !minor(line.line_total_minor) || line.unit_price_minor > 90000000000
      || typeof line.sku !== "string" || line.sku.length > 160 || !Number.isFinite(line.tax_rate) || line.tax_rate < 0) return invalid();
    const numerator = BigInt(line.unit_price_minor) * BigInt(Math.round(line.quantity * 10000)) + 5000n;
    if (Number(numerator / 10000n) !== line.line_total_minor) return invalid();
    sum += line.line_total_minor;
    seen.add(line.product_id);
  }
  if (sum !== snapshot.subtotal_minor) return invalid();
  return JSON.parse(JSON.stringify(snapshot)) as CommerceCheckoutSnapshot;
}
