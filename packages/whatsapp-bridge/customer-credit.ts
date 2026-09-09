export interface CustomerCreditMessageInput {
  customerName: string;
  balances: ReadonlyArray<{ currency: string; amountMinor: number }>;
  businessName?: string;
}

/** Pure draft formatter; never reads accounts or opens WhatsApp. */
export function buildCustomerCreditWhatsAppMessage(input: CustomerCreditMessageInput): string {
  const balances = input.balances.filter((balance) => balance.amountMinor > 0);
  const name = input.customerName.trim();
  if (!balances.length) return "";
  return [
    name ? `Merhaba ${name},` : "Merhaba,",
    "",
    `Kayıtlarımıza göre güncel veresiye ${balances.length === 1 ? "bakiyeniz" : "bakiyeleriniz"}:`,
    "",
    ...balances.map((balance) => `• ${new Intl.NumberFormat("tr-TR", { style: "currency", currency: balance.currency }).format(balance.amountMinor / 100)}`),
    "",
    "Bilginize sunarız.",
    ...(input.businessName?.trim() ? [input.businessName.trim()] : [])
  ].join("\n");
}

/** Currency order and history pagination do not affect this comparison. */
export function customerCreditWhatsAppFingerprint(input: CustomerCreditMessageInput & { phone: string }): string {
  return JSON.stringify([
    input.customerName, input.phone,
    input.balances.filter((balance) => balance.amountMinor > 0)
      .map((balance) => [balance.currency, balance.amountMinor] as const)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  ]);
}
