import { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES, hasBusinessCapability, type CommerceCheckoutSettings } from "@yardimci-asistan/shared";
import { readEnabledBusinessCapabilities } from "./business-capability-store";

export const CLOSED_CHECKOUT: CommerceCheckoutSettings = {
  version: 2, enabled: false, currency: "TRY", shippingFeeMinor: null, bank: null, legal: null
};

/** Real bank transfer only. Sample/demo bank strings never bypass checksum validation. */
export function isValidCommerceIban(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const iban = value.replace(/ /g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, char => String(char.charCodeAt(0) - 55));
  return BigInt(digits) % 97n === 1n;
}

export function normalizeCheckoutSettings(input: unknown): CommerceCheckoutSettings {
  const value = input as CommerceCheckoutSettings;
  const invalid = (message = "Sipariş ödeme ayarları geçersiz."): never => { throw new Error(message); };
  if (!value || value.version !== 2 || typeof value.enabled !== "boolean" || "demo" in value
    || !["TRY", "EUR", "USD", "GBP"].includes(value.currency)) return invalid();
  if (value.shippingFeeMinor !== null && (!Number.isSafeInteger(value.shippingFeeMinor)
    || value.shippingFeeMinor < 0 || value.shippingFeeMinor > 90000000000))
    return invalid("Kargo bedeli geçersiz. Boş bırakın veya sıfır ve üzeri geçerli bir tutar girin.");
  const result: CommerceCheckoutSettings = { version: 2, enabled: value.enabled, currency: value.currency,
    shippingFeeMinor: value.shippingFeeMinor, bank: null, legal: null };
  for (const group of ["bank", "legal"] as const) {
    const fields = group === "bank" ? { name: 160, accountHolder: 160, iban: 80 }
      : { version: 80, preliminary: 20000, agreement: 20000 };
    const labels: Record<string, string> = group === "bank"
      ? { name: "Banka adı", accountHolder: "Hesap sahibi", iban: "IBAN" }
      : { version: "Sözleşme sürümü", preliminary: "Ön bilgilendirme", agreement: "Satış sözleşmesi" };
    const source = value[group];
    if (!source && !value.enabled) continue;
    if (!source) return invalid(group === "bank"
      ? "Havale / EFT açıkken banka adı, hesap sahibi ve IBAN bilgilerini doldurun."
      : "Havale / EFT açıkken sözleşme sürümü, ön bilgilendirme ve satış sözleşmesini doldurun.");
    const record: Record<string, string> = {};
    for (const [key, maximum] of Object.entries(fields)) {
      const field = (source as unknown as Record<string, unknown>)[key];
      const label = labels[key];
      if (typeof field !== "string" || !field.trim()) return invalid(`${label} boş bırakılamaz.`);
      if ([...field].length > maximum) return invalid(`${label} en fazla ${maximum} karakter olabilir.`);
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(field))
        return invalid(`${label} geçersiz kontrol karakterleri içeriyor.`);
      record[key] = field.trim();
    }
    if (group === "bank") result.bank = record as unknown as CommerceCheckoutSettings["bank"];
    else result.legal = record as unknown as CommerceCheckoutSettings["legal"];
  }
  if (value.enabled && !isValidCommerceIban(result.bank!.iban))
    return invalid("IBAN geçersiz. Ülke kodunu, karakter sayısını ve IBAN kontrol basamaklarını kontrol edin.");
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
