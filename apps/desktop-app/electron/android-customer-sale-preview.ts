import type { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES, moneyToMinor } from "@yardimci-asistan/shared";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import { authorizeAndroidAction } from "./android-action-service.js";
import { readEnabledBusinessCapabilities } from "./business-capability-store.js";
import { resolveCommerceProductPriceInDatabase } from "./commerce-pricing-service.js";
import { authorizeAndroidLocalCredential } from "./database/android-local-credential-store.js";

/** Internal only: identity and token are transport credentials, never fields from the preview body.
 * This snapshot is neither a reservation nor a benefits quote; checkout must revalidate it. */
export function previewAndroidCustomerSale(db: DatabaseSync, credential: { deviceId: string; token: string },
  input: { customerId?: string; lines: Array<{ productId: string; quantity: number }> }) {
  db.exec("BEGIN DEFERRED");
  try {
    const result = previewAndroidCustomerSaleInTransaction(db, credential, input);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* Preserve original failure. */ }
    throw error;
  }
}

/** Caller owns the synchronous transaction and must commit or roll it back. */
export function previewAndroidCustomerSaleInTransaction(db: DatabaseSync, credential: { deviceId: string; token: string },
  input: { customerId?: string; lines: Array<{ productId: string; quantity: number }> }) {
    if (!db.isTransaction) throw new Error("Preview transaction required.");
    if (!credential || !input) throw new Error("Önizleme isteği geçersiz.");
    if (!authorizeAndroidLocalCredential(db, credential.deviceId, credential.token)) throw new Error("Cihaz kimliği doğrulanamadı.");
    const capabilities = readEnabledBusinessCapabilities(db);
    if (![BUSINESS_CAPABILITIES.CUSTOMERS, BUSINESS_CAPABILITIES.SALES, BUSINESS_CAPABILITIES.CATALOG]
      .every(capability => capabilities.includes(capability))) throw new Error("Satış önizleme yetenekleri etkin değil.");
    const customerId = String(input.customerId ?? "").trim();
    const action: AndroidSyncAction = { id: "preview", action_type: "market_sale_complete", device_id: credential.deviceId,
      payload: { settlement: "paid", customer_id: customerId }, created_at: new Date().toISOString(), status: "pending", error_message: "" };
    const authorization = authorizeAndroidAction(db, action, capabilities);
    if (!authorization.ok) throw new Error(authorization.message);
    const business = db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get();
    const businessId = String(business?.id ?? "");
    if (!businessId || !Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 200) throw new Error("Önizleme ürünleri geçersiz.");
    const seen = new Set<string>();
    let currency = "", subtotalMinor = 0;
    const lines = input.lines.map(line => {
      const productId = typeof line?.productId === "string" ? line.productId.trim() : "";
      const quantity = line?.quantity;
      if (!productId || seen.has(productId) || typeof quantity !== "number" || !Number.isFinite(quantity)
        || quantity <= 0 || quantity > 1_000_000 || Math.abs(quantity * 10000 - Math.round(quantity * 10000)) > 0.00001) {
        throw new Error("Önizleme ürün veya miktarı geçersiz.");
      }
      seen.add(productId);
      const price = resolveCommerceProductPriceInDatabase(db, businessId, { productId, customerId }, capabilities.includes(BUSINESS_CAPABILITIES.WHOLESALE));
      const product = db.prepare("SELECT updated_at FROM catalog_products WHERE id = ? AND business_id = ? AND is_active = 1 AND deleted_at = ''")
        .get(productId, businessId);
      const updatedAt = String(product?.updated_at ?? "").trim();
      if (!updatedAt) throw new Error("Ürün sürümü geçersiz.");
      if (!/^[A-Z]{3}$/.test(price.currency) || (currency && currency !== price.currency)) throw new Error("Önizleme para birimi geçersiz.");
      currency = price.currency;
      const unitPriceMinor = moneyToMinor(price.unitPrice);
      const lineTotalMinor = moneyToMinor(Math.round((price.unitPrice * quantity + Number.EPSILON) * 100) / 100);
      subtotalMinor += lineTotalMinor;
      if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor < 0) throw new Error("Önizleme tutarı geçersiz.");
      return { productId, quantity, unitPriceMinor, currency, updatedAt };
    });
    return { lines, subtotalMinor, currency, generatedAtMs: Date.now() };
}
