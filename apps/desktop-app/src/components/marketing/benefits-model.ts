import type { BenefitsFamily, BenefitsManagementResult, BenefitsRule } from "@yardimci-asistan/shared";

export const benefitsFamilyLabels: Record<BenefitsFamily, string> = { coupon: "Kupon", points: "Puan", payment_modifier: "Ödeme Avantajı" };
export const benefitsStatusLabels = { draft: "Taslak", active: "Etkin", disabled: "Pasif" };
export function benefitsRuleStatus(rule: BenefitsRule, now = Date.now()) {
  return rule.status === "active" && rule.endsAt !== null && rule.endsAt <= now ? "expired" : rule.status;
}
export const benefitsDisplayStatusLabels = { ...benefitsStatusLabels, expired: "Süresi dolmuş" };
export function benefitsValue<T>(result: BenefitsManagementResult<T>): T {
  if (!result.ok) throw new Error(result.message);
  return result.value;
}
export function benefitsCurrencyDigits(currency: string): number {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}
export function benefitsDecimal(value: number, digits: number): string { return (value / 10 ** digits).toFixed(digits).replace(".", ","); }
export function benefitsParseDecimal(text: string, digits: number): number {
  const normalized = text.trim().replace(",", ".");
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${Math.max(1, digits)}})?$`).test(normalized)) throw new Error("Geçerli bir tutar girin.");
  const [whole = "0", fraction = ""] = normalized.split(".");
  if (fraction.length > digits) throw new Error("Bu para birimi için ondalık basamak sayısı uygun değil.");
  const amount = Number(BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, "0") || "0"));
  if (!Number.isSafeInteger(amount)) throw new Error("Tutar çok büyük.");
  return amount;
}
export function newBenefitsRule(family: BenefitsFamily): BenefitsRule {
  return { schemaVersion: 1, id: "", version: 1, family, status: "draft", currency: "TRY", startsAt: Date.now(), endsAt: null,
    priority: 0, scope: { channels: ["desktop_cart", "desktop_desk"], customerIds: [], customerGroups: [], priceGroups: [],
      productIds: [], categoryIds: [], excludedProductIds: [], excludedCategoryIds: [] }, minSpendMinor: 0, maxBenefitMinor: null,
    percentBps: 0, fixedMinor: 0, allowCouponStacking: false, combinesWith: [], paymentMethodIds: [],
    points: family === "points" ? { operation: "earn", earnBase: "after_discounts", expiryDays: null } : null };
}
export function benefitsMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value / 10 ** benefitsCurrencyDigits(currency));
}
