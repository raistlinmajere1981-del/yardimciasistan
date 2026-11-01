import type { DatabaseSync } from "node:sqlite";
import { previewAndroidCustomerSaleInTransaction } from "./android-customer-sale-preview.js";
import { readCommercePointBalance } from "./commerce-benefits-points.js";
import { canSpendAndroidBenefits } from "./database/android-benefits-spend-grant-store.js";

/** Internal advisory only: not a reservation or authorization to spend. */
export function quoteAndroidPointSpend(db: DatabaseSync, credential: { deviceId: string; token: string },
  input: { customerId: string; lines: Array<{ productId: string; quantity: number }> }, now = Date.now()) {
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(now + 30_000)
    || !input || typeof input.customerId !== "string" || !input.customerId || input.customerId !== input.customerId.trim()) return null;
  // A failed BEGIN must never roll back an existing caller-owned transaction.
  try { db.exec("BEGIN DEFERRED"); } catch { return null; }
  try {
    const preview = previewAndroidCustomerSaleInTransaction(db, credential, input);
    const business = db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get();
    const businessId = String(business?.id ?? "");
    if (!businessId || !canSpendAndroidBenefits(db, businessId, credential.deviceId, input.customerId)) throw new Error("Quote denied");
    const balance = readCommercePointBalance(db, businessId, input.customerId, preview.currency, now);
    if (!Number.isSafeInteger(balance.availableMinor) || balance.availableMinor < 0
      || !Number.isSafeInteger(preview.subtotalMinor) || preview.subtotalMinor < 0) throw new Error("Quote denied");
    const lines = Object.freeze(preview.lines.map(line => Object.freeze({ ...line })));
    const result = Object.freeze({ lines, subtotalMinor: preview.subtotalMinor, currency: preview.currency,
      availablePointMinor: balance.availableMinor, maxSpendableMinor: Math.min(balance.availableMinor, preview.subtotalMinor),
      generatedAtMs: now, expiresAtMs: now + 30_000 });
    db.exec("COMMIT");
    return result;
  } catch {
    try { db.exec("ROLLBACK"); } catch { /* No caller transaction is owned here. */ }
    return null;
  }
}
