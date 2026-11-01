import type { DatabaseSync } from "node:sqlite";
import { authorizeAndroidLocalCredential } from "./database/android-local-credential-store.js";
import { canReadAndroidBenefitsBalance } from "./database/android-benefits-grant-store.js";
import { readCommercePointBalance } from "./commerce-benefits-points.js";

/** Standalone snapshot read; subsequent revocation cannot retract a delivered result. */
export function readAndroidPointBalance(database: DatabaseSync, businessId: string, deviceId: string,
  token: string, customerId: string, currency: string): { availableMinor: number; generatedAtMs: number } | null {
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
  // BEGIN fails closed if the caller already owns a transaction; never roll it back.
  try { database.exec("BEGIN DEFERRED"); } catch { return null; }
  try {
    let result: { availableMinor: number; generatedAtMs: number } | null = null;
    if (authorizeAndroidLocalCredential(database, deviceId, token)
      && canReadAndroidBenefitsBalance(database, businessId, deviceId, customerId)) {
      const generatedAtMs = Date.now();
      const { availableMinor } = readCommercePointBalance(database, businessId, customerId, currency, generatedAtMs);
      result = { availableMinor, generatedAtMs };
    }
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch { /* Preserve the original failure. */ }
    throw error;
  }
}
