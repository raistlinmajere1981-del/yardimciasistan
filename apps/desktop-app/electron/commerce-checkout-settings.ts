import { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES, hasBusinessCapability, type CommerceCheckoutSettings } from "@yardimci-asistan/shared";
import { readEnabledBusinessCapabilities } from "./business-capability-store";

export const CLOSED_CHECKOUT: CommerceCheckoutSettings = {
  version: 1, enabled: false, demo: true, currency: "TRY", shippingFeeMinor: null, bank: null, legal: null
};

export function normalizeCheckoutSettings(input: unknown): CommerceCheckoutSettings {
  const value=input as CommerceCheckoutSettings;
  const invalid = (): never => { throw new Error("Sipariş ödeme ayarları geçersiz."); };
  if (!value || value.version !== 1 || typeof value.enabled !== "boolean" || typeof value.demo !== "boolean"
    || !["TRY", "EUR", "USD", "GBP"].includes(value.currency)
    || (value.shippingFeeMinor !== null && (!Number.isSafeInteger(value.shippingFeeMinor) || value.shippingFeeMinor < 0 || value.shippingFeeMinor > 90000000000))) return invalid();
  const result: CommerceCheckoutSettings = { version: 1, enabled: value.enabled, demo: value.demo, currency: value.currency,
    shippingFeeMinor: value.shippingFeeMinor, bank: null, legal: null };
  for (const group of ["bank", "legal"] as const) {
    const fields = group === "bank" ? { name: 160, accountHolder: 160, iban: 80 } : { version: 80, preliminary: 20000, agreement: 20000 };
    const source = value[group];
    if (!source && !value.enabled) continue;
    if (!source) return invalid();
    const record: Record<string, string> = {};
    for (const [key, maximum] of Object.entries(fields)) {
      const field = (source as unknown as Record<string, unknown>)[key];
      if (typeof field !== "string" || !field.trim() || [...field].length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(field)) return invalid();
      record[key] = field.trim();
    }
    if (group === "bank") result.bank = record as unknown as CommerceCheckoutSettings["bank"];
    else result.legal = record as unknown as CommerceCheckoutSettings["legal"];
  }
  if (value.enabled) {
    const iban = result.bank!.iban.replace(/ /g, "").toUpperCase();
    if (value.demo) {
      if (!result.bank!.iban.includes("DEMO") || /^[A-Z]{2}\d{2}[A-Z0-9 ]+$/.test(result.bank!.iban)) return invalid();
    } else {
      if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return invalid();
      const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, char => String(char.charCodeAt(0) - 55));
      if (BigInt(digits) % 97n !== 1n) return invalid();
    }
  }
  return result;
}

export function readCheckoutSettings(db: DatabaseSync, businessId: string): CommerceCheckoutSettings {
  const row = db.prepare("SELECT settings_json FROM commerce_checkout_settings WHERE business_id = ?").get(businessId);
  return row ? normalizeCheckoutSettings(JSON.parse(String(row.settings_json))) : { ...CLOSED_CHECKOUT };
}

export function saveCheckoutSettingsInTransaction(db: DatabaseSync,businessId: string,value: unknown,now: string): CommerceCheckoutSettings {
  if(!db.isTransaction)throw new Error("Sipariş ödeme ayarı işlem sınırı gerekli.");
  const settings=normalizeCheckoutSettings(value);
  db.prepare("INSERT INTO commerce_checkout_settings VALUES (?, ?, ?) ON CONFLICT(business_id) DO UPDATE SET settings_json=excluded.settings_json, updated_at=excluded.updated_at")
    .run(businessId,JSON.stringify(settings),now);
  return settings;
}

export function saveCheckoutSettings(databasePath: string, value: CommerceCheckoutSettings): CommerceCheckoutSettings {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; BEGIN IMMEDIATE");
  try {
    if (!hasBusinessCapability(readEnabledBusinessCapabilities(db), BUSINESS_CAPABILITIES.ONLINE_SALES)) throw new Error("Online satış bu işletmede etkin değil.");
    const businessId = String(db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at LIMIT 1").get()?.id ?? "");
    const settings=saveCheckoutSettingsInTransaction(db,businessId,value,new Date().toISOString());
    db.exec("COMMIT"); return settings;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  finally { db.close(); }
}
