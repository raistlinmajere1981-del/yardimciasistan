import { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES as C, type CustomerCreditAccountDetail } from "@yardimci-asistan/shared";
import { customerCreditWhatsAppFingerprint, normalizeTRMobilePhone, prepareWhatsAppAction, type WhatsAppAction, type WhatsAppBridgeMode } from "@yardimci-asistan/whatsapp-bridge";
import { assertPersistedBusinessCapability } from "./business-capability-runtime";
import { getCustomerCreditAccount } from "./customer-credit-runtime";

export interface PrepareCustomerCreditWhatsAppInput {
  customerId: string;
  message: string;
  expectedFingerprint: string;
}

export type CustomerCreditWhatsAppPreparation =
  | { status: "ready"; account: CustomerCreditAccountDetail; action: WhatsAppAction }
  | { status: "changed" | "no_debt"; account: CustomerCreditAccountDetail };

/** Read-only preparation; no request, ledger, finance or message tracking writes. */
export function prepareCustomerCreditWhatsApp(databasePath: string, input: PrepareCustomerCreditWhatsAppInput): CustomerCreditWhatsAppPreparation {
  assertPersistedBusinessCapability(databasePath, C.WHATSAPP, "WhatsApp bu işletmede etkin değil.");
  if (!input || typeof input.customerId !== "string" || typeof input.expectedFingerprint !== "string") {
    throw new Error("Paylaşılacak müşteri hesabı seçilmeli.");
  }
  if (typeof input.message !== "string" || !input.message.trim()) throw new Error("WhatsApp mesajı boş olmamalı.");
  // The existing account runtime also enforces customer-credit capability/ownership.
  const account = getCustomerCreditAccount(databasePath, input.customerId);
  if (account.customer.deletedAt) throw new Error("Silinmiş müşteri hesabı paylaşılamaz.");
  if (!account.balances.some((balance) => balance.amountMinor > 0)) return { status: "no_debt", account };
  if (!normalizeTRMobilePhone(account.customer.phone).ok) throw new Error("Bu müşterinin geçerli bir telefon numarası yok.");
  const fingerprint = customerCreditWhatsAppFingerprint({ customerName: account.customer.fullName, phone: account.customer.phone, balances: account.balances });
  if (fingerprint !== input.expectedFingerprint) return { status: "changed", account };

  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const setting = database.prepare("SELECT whatsapp_mode FROM settings WHERE business_id = ? AND deleted_at = '' LIMIT 1").get(account.customer.businessId);
    const mode = String(setting?.whatsapp_mode ?? "webview");
    const preferredMode: WhatsAppBridgeMode = ["wa_link", "manual_copy", "webview", "official_api"].includes(mode) ? mode as WhatsAppBridgeMode : "manual_copy";
    return { status: "ready", account, action: prepareWhatsAppAction({ phone: account.customer.phone, message: input.message, preferredMode }) };
  } finally { database.close(); }
}
