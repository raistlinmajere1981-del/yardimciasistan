import type { DatabaseSync } from "node:sqlite";
import { ARAS_SHIPPING_PROVIDER, emptyArasShippingConfiguration, isArasShippingConfigurationReady,
  type ArasShippingConfiguration, type ArasShippingConfigurationInput
} from "@yardimci-asistan/shared";

export type ShippingSecretWrite = { mode: "keep" | "replace" | "clear"; encryptedValue?: string };
const secretPrefix = "safe-storage:v1:";

export function normalizeArasShippingInput(input: ArasShippingConfigurationInput): ArasShippingConfigurationInput {
  if (!input || typeof input !== "object" || typeof input.enabled !== "boolean" || !["test", "production"].includes(input.environment)) {
    throw new Error("Kargo sağlayıcı ayarları geçersiz.");
  }
  const text = (value: unknown, limit: number) => {
    if (typeof value !== "string" || value.length > limit || /[\x00-\x1f\x7f]/.test(value)) throw new Error("Kargo sağlayıcı alanları geçersiz.");
    return value.trim();
  };
  return { enabled: input.enabled, environment: input.environment,
    customerCode: text(input.customerCode, 100), username: text(input.username, 160),
    password: text(input.password ?? "", 512), clearPassword: input.clearPassword === true };
}

export function getArasShippingConfiguration(db: DatabaseSync): ArasShippingConfiguration {
  const row = getStoredArasShippingConfiguration(db);
  if (!row) return emptyArasShippingConfiguration();
  const hasSecret = String(row.password_encrypted).startsWith(secretPrefix);
  const delivery = db.prepare("SELECT online_sales_delivery_enabled, online_sales_shipping_enabled FROM settings WHERE business_id = ? AND deleted_at = '' LIMIT 1")
    .get(String(row.business_id));
  // Delivery owns activation, including reads before the next normal Settings save.
  const enabled = Number(delivery?.online_sales_delivery_enabled) === 1 && Number(delivery?.online_sales_shipping_enabled) === 1;
  return { providerId: ARAS_SHIPPING_PROVIDER.id, providerName: ARAS_SHIPPING_PROVIDER.name,
    enabled, environment: row.environment === "production" ? "production" : "test",
    customerCode: String(row.customer_code), username: String(row.username), hasSecret,
    configured: isArasShippingConfigurationReady({ enabled, customerCode: String(row.customer_code), username: String(row.username), hasSecret }) };
}

export function getStoredArasShippingConfiguration(db: DatabaseSync) {
  return db.prepare(`SELECT c.* FROM commerce_shipping_provider_config c JOIN business b ON b.id = c.business_id
    WHERE b.deleted_at = '' AND c.provider_id = ? ORDER BY b.created_at LIMIT 1`).get(ARAS_SHIPPING_PROVIDER.id);
}

/** Called exclusively from the existing Setup transaction. No separate settings save API. */
export function saveArasShippingConfigurationInTransaction(db: DatabaseSync, businessId: string,
  input: ArasShippingConfigurationInput, secretWrite: ShippingSecretWrite) {
  const normalized = normalizeArasShippingInput(input);
  const current = db.prepare("SELECT password_encrypted FROM commerce_shipping_provider_config WHERE business_id = ? AND provider_id = ?")
    .get(businessId, ARAS_SHIPPING_PROVIDER.id);
  let encrypted = String(current?.password_encrypted ?? "");
  if (secretWrite.mode === "clear" || normalized.clearPassword) encrypted = "";
  else if (secretWrite.mode === "replace") {
    if (!secretWrite.encryptedValue?.startsWith(secretPrefix)) throw new Error("Kargo şifresi güvenli biçimde saklanmalı.");
    encrypted = secretWrite.encryptedValue;
  } else if (normalized.password) throw new Error("Kargo şifresi ana süreçte şifrelenmeli.");
  db.prepare(`INSERT INTO commerce_shipping_provider_config
    (business_id, provider_id, enabled, environment, customer_code, username, password_encrypted, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(business_id, provider_id) DO UPDATE SET
    enabled = excluded.enabled, environment = excluded.environment, customer_code = excluded.customer_code,
    username = excluded.username, password_encrypted = excluded.password_encrypted, updated_at = excluded.updated_at`)
    .run(businessId, ARAS_SHIPPING_PROVIDER.id, normalized.enabled ? 1 : 0, normalized.environment,
      normalized.customerCode, normalized.username, encrypted, new Date().toISOString());
}
