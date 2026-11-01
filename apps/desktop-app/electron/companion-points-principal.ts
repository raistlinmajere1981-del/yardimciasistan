import type { DatabaseSync } from "node:sqlite";
import { authorizeAndroidLocalCredential } from "./database/android-local-credential-store.js";
import { readAndroidBenefitsSpendGrantGeneration } from "./database/android-benefits-spend-grant-store.js";
import { authorizeAndroidAction } from "./android-action-service.js";
import { readEnabledBusinessCapabilities } from "./business-capability-store.js";

function requireScope(value: unknown): asserts value {
  if (!value) throw Object.assign(new Error("Companion points authorization denied."), { code: "COMPANION_POINTS_DENIED" });
}

/** Read-only preflight, never a parent principal. Key I/O must precede BEGIN. */
export function readCompanionPointsPreparationScope(db: DatabaseSync,
  credential: { deviceId: string; token: string }, customerId: string) {
  requireScope(!db.isTransaction);
  return readCompanionPointsScope(db, credential, customerId);
}

function readCompanionCashSaleScope(db: DatabaseSync,
  credential: { deviceId: string; token: string }, customerId: string) {
  const { deviceId, token } = credential;
  requireScope(typeof customerId === "string" && customerId.length > 0 && customerId.length <= 128
    && customerId === customerId.trim() && authorizeAndroidLocalCredential(db, deviceId, token));
  const business = db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get();
  const device = db.prepare("SELECT id,authorization_epoch FROM android_devices WHERE device_id=?").get(deviceId);
  requireScope(business && device && Number.isSafeInteger(device.authorization_epoch) && Number(device.authorization_epoch) > 0);
  const businessId = String(business.id);
  requireScope(db.prepare("SELECT 1 FROM customers WHERE business_id=? AND id=? AND deleted_at=''").get(businessId, customerId));
  requireScope(authorizeAndroidAction(db, { id: "internal_cash_scope", action_type: "market_sale_complete",
    device_id: deviceId, payload: { settlement: "paid", customer_id: customerId }, created_at: "",
    status: "pending", error_message: "" }, readEnabledBusinessCapabilities(db)).ok);
  return Object.freeze({ businessId, deviceRecordId: String(device.id), authorizationEpoch: Number(device.authorization_epoch), spendGrantGeneration: "" });
}

/** Zero-points paid-cash earn must not require a Puan spending grant. This scope
 * still proves the authenticated device, live capability and real customer. */
export function readCompanionCashSalePreparationScope(db: DatabaseSync,
  credential: { deviceId: string; token: string }, customerId: string) {
  requireScope(!db.isTransaction);
  return readCompanionCashSaleScope(db, credential, customerId);
}

function readCompanionPointsScope(db: DatabaseSync,
  credential: { deviceId: string; token: string }, customerId: string) {
  const { deviceId, token } = credential;
  requireScope(typeof customerId === "string" && customerId.length > 0 && customerId.length <= 128
    && customerId === customerId.trim() && authorizeAndroidLocalCredential(db, deviceId, token));
  const business = db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get();
  const device = db.prepare("SELECT id,authorization_epoch FROM android_devices WHERE device_id=?").get(deviceId);
  requireScope(business && device && Number.isSafeInteger(device.authorization_epoch) && Number(device.authorization_epoch) > 0);
  const businessId = String(business.id);
  const spendGrantGeneration = readAndroidBenefitsSpendGrantGeneration(db, businessId, deviceId, customerId);
  requireScope(spendGrantGeneration);
  requireScope(authorizeAndroidAction(db, { id: "internal_points_scope", action_type: "market_sale_complete",
    device_id: deviceId, payload: { settlement: "paid", customer_id: customerId }, created_at: "",
    status: "pending", error_message: "" }, readEnabledBusinessCapabilities(db)).ok);
  return Object.freeze({ businessId, deviceRecordId: String(device.id), authorizationEpoch: Number(device.authorization_epoch), spendGrantGeneration });
}

/** Internal only. Credentials must originate in authenticated ingress, never action JSON.
 * Reads only: requires the caller's existing transaction and never settles or grants.
 * Revalidate at each future parent write; this is not a Desktop-owner authority.
 */
export function requireCompanionCashSalePrincipal(db: DatabaseSync,
  credential: { deviceId: string; token: string }, customerId: string) {
  const deviceId = credential?.deviceId, token = credential?.token;
  requireScope(typeof deviceId === "string" && deviceId.length > 0 && deviceId === deviceId.trim()
    && typeof token === "string" && typeof customerId === "string" && customerId.length > 0
    && customerId.length <= 128 && customerId === customerId.trim());
  const readCurrent = () => {
    requireScope(db.isTransaction);
    return readCompanionCashSaleScope(db, credential, customerId);
  };
  const bound = readCurrent();
  return Object.freeze({ kind: "companion_cash_earn" as const, ...bound, deviceId, customerId,
    spendGrantGeneration: "",
    assertAuthorized(): void {
      const current = readCurrent();
      requireScope(current.businessId === bound.businessId && current.deviceRecordId === bound.deviceRecordId
        && current.authorizationEpoch === bound.authorizationEpoch);
    }
  });
}

export function requireCompanionPointsPrincipal(db: DatabaseSync,
  credential: { deviceId: string; token: string }, customerId: string) {
  const deviceId = credential?.deviceId, token = credential?.token;
  requireScope(typeof deviceId === "string" && deviceId.length > 0 && deviceId === deviceId.trim()
    && typeof token === "string" && typeof customerId === "string" && customerId.length > 0
    && customerId.length <= 128 && customerId === customerId.trim());
  const readCurrent = () => {
    requireScope(db.isTransaction);
    return readCompanionPointsScope(db, credential, customerId);
  };
  const bound = readCurrent();
  return Object.freeze({ kind: "companion_points_spend" as const, ...bound, deviceId, customerId,
    assertAuthorized(): void {
      const current = readCurrent();
      requireScope(current.businessId === bound.businessId && current.deviceRecordId === bound.deviceRecordId
        && current.authorizationEpoch === bound.authorizationEpoch && current.spendGrantGeneration === bound.spendGrantGeneration);
    }
  });
}
