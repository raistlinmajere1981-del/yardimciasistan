import { moneyToMinor, type CustomerCreditEntryType, type CustomerCreditPaymentMethod } from "@yardimci-asistan/shared";

export const customerCreditEntryLabels: Record<CustomerCreditEntryType, string> = {
  credit_sale: "Veresiye satış",
  payment: "Tahsilat",
  adjustment_debit: "Borç düzeltmesi",
  adjustment_credit: "Alacak düzeltmesi"
};

export const customerCreditPaymentLabels: Record<CustomerCreditPaymentMethod, string> = {
  cash: "Nakit", card: "Kart", bank: "Havale / EFT", other: "Diğer"
};

export function formatCreditMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(amountMinor / 100);
}

export function parseCreditAmount(value: string): number | null {
  const text = value.trim();
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(text)) return null;
  try {
    const amount = moneyToMinor(Number(text.replace(",", ".")));
    return amount > 0 && amount <= 999_999_999_999 ? amount : null;
  } catch { return null; }
}

export function customerCreditError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, "");
  if (/SQLITE|UNIQUE|FOREIGN KEY|constraint|amount_minor|databasePath/i.test(message)) return fallback;
  return message || fallback;
}

const CREDIT_CHANGED = "customer-credit:changed";

export function notifyCustomerCreditChanged(customerId: string): void {
  window.dispatchEvent(new CustomEvent(CREDIT_CHANGED, { detail: customerId }));
}

export function onCustomerCreditChanged(customerId: string, refresh: () => void): () => void {
  const listener = (event: Event) => {
    if ((event as CustomEvent<string>).detail === customerId) refresh();
  };
  window.addEventListener(CREDIT_CHANGED, listener);
  return () => window.removeEventListener(CREDIT_CHANGED, listener);
}
