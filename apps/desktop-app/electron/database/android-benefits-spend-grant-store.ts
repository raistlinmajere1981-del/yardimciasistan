import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";

/** Only an unlocked, trusted Desktop owner may mutate this internal grant. */
export interface AndroidBenefitsSpendGrantOwner { assertAuthorized(): void }

// Scope and permissions are read in the same statement as grant/check.
const scope = `b.id = ? AND b.deleted_at = '' AND c.id = ? AND c.business_id = b.id AND c.deleted_at = ''
  AND d.device_id = ? AND d.is_active = 1 AND COALESCE(d.revoked_at, '') = ''
  AND (d.role = 'admin' OR (json_valid(d.permissions_json) AND json_type(d.permissions_json) = 'array'
    AND EXISTS (SELECT 1 FROM json_each(d.permissions_json) WHERE value = 'market.sale.complete')
    AND EXISTS (SELECT 1 FROM json_each(d.permissions_json) WHERE value = 'customer.view')))
  AND EXISTS (SELECT 1 FROM commerce_benefit_settings WHERE business_id = b.id AND points_enabled = 1)
  AND EXISTS (SELECT 1 FROM business_capabilities WHERE business_id = b.id AND capability_id = '${C.ANDROID}' AND is_enabled = 1)
  AND EXISTS (SELECT 1 FROM business_capabilities WHERE business_id = b.id AND capability_id = '${C.COMMERCE_BENEFITS}' AND is_enabled = 1)
  AND EXISTS (SELECT 1 FROM business_capabilities WHERE business_id = b.id AND capability_id = '${C.CATALOG}' AND is_enabled = 1)
  AND EXISTS (SELECT 1 FROM business_capabilities WHERE business_id = b.id AND capability_id = '${C.CUSTOMERS}' AND is_enabled = 1)
  AND EXISTS (SELECT 1 FROM business_capabilities WHERE business_id = b.id AND capability_id = '${C.SALES}' AND is_enabled = 1)`;

export function grantAndroidBenefitsSpend(db: DatabaseSync, owner: AndroidBenefitsSpendGrantOwner,
  businessId: string, deviceId: string, customerId: string, expectedRecordId?: string): boolean {
  owner.assertAuthorized();
  // Owner-issued lifetime, independent of request/customer/epoch. Every successful
  // reissue rotates it, even when all other grant fields are identical.
  const generation = randomBytes(32).toString("hex");
  return Number(db.prepare(`INSERT INTO android_benefits_spend_grants (business_id, device_record_id, customer_id, authorization_epoch, grant_generation)
    SELECT b.id, d.id, c.id, d.authorization_epoch, ? FROM business b JOIN customers c ON c.business_id = b.id
    CROSS JOIN android_devices d WHERE ${scope} AND (? IS NULL OR d.id = ?)
    ON CONFLICT (business_id, device_record_id, customer_id) DO UPDATE SET authorization_epoch = excluded.authorization_epoch,
      grant_generation = excluded.grant_generation`)
    .run(generation, businessId, customerId, deviceId, expectedRecordId ?? null, expectedRecordId ?? null).changes) === 1;
}

export function revokeAndroidBenefitsSpend(db: DatabaseSync, owner: AndroidBenefitsSpendGrantOwner,
  businessId: string, deviceId: string, customerId: string, expectedRecordId?: string): boolean {
  owner.assertAuthorized();
  return Number(db.prepare(`DELETE FROM android_benefits_spend_grants WHERE business_id = ? AND customer_id = ?
    AND device_record_id = (SELECT id FROM android_devices WHERE device_id = ? AND (? IS NULL OR id = ?))`)
    .run(businessId, customerId, deviceId, expectedRecordId ?? null, expectedRecordId ?? null).changes) === 1;
}

/** Device identity must come from authenticated transport, never request JSON. */
export function canSpendAndroidBenefits(db: DatabaseSync, businessId: string, deviceId: string, customerId: string): boolean {
  return readAndroidBenefitsSpendGrantGeneration(db, businessId, deviceId, customerId) !== null;
}

/** Internal lifetime evidence, read from the owner table with all current gates.
 * Never a bearer token or a substitute for revalidation in the canonical parent.
 */
export function readAndroidBenefitsSpendGrantGeneration(db: DatabaseSync, businessId: string, deviceId: string,
  customerId: string): string | null {
  const row = db.prepare(`SELECT g.grant_generation FROM business b JOIN customers c ON c.business_id = b.id
    CROSS JOIN android_devices d JOIN android_benefits_spend_grants g
      ON g.business_id = b.id AND g.customer_id = c.id AND g.device_record_id = d.id AND g.authorization_epoch = d.authorization_epoch
    WHERE ${scope}`).get(businessId, customerId, deviceId);
  return typeof row?.grant_generation === "string" && /^[a-f0-9]{64}$/.test(row.grant_generation) ? row.grant_generation : null;
}
