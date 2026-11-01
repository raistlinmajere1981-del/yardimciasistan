import type { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";

/** Only a trusted, unlocked Desktop-owner adapter may call these mutation primitives. */
export interface AndroidBenefitsGrantOwner { assertAuthorized(): void }

// Evaluated against persisted state in the same SQL statement as grant/read.
const scope = `b.id = ? AND b.deleted_at = '' AND c.id = ? AND c.business_id = b.id AND c.deleted_at = ''
  AND d.device_id = ? AND d.is_active = 1 AND COALESCE(d.revoked_at, '') = ''
  AND EXISTS (SELECT 1 FROM business_capabilities WHERE business_id = b.id AND capability_id = '${C.ANDROID}' AND is_enabled = 1)
  AND EXISTS (SELECT 1 FROM business_capabilities WHERE business_id = b.id AND capability_id = '${C.COMMERCE_BENEFITS}' AND is_enabled = 1)
  AND EXISTS (SELECT 1 FROM business_capabilities WHERE business_id = b.id AND capability_id = '${C.CATALOG}' AND is_enabled = 1)
  AND EXISTS (SELECT 1 FROM business_capabilities WHERE business_id = b.id AND capability_id = '${C.CUSTOMERS}' AND is_enabled = 1)
  AND EXISTS (SELECT 1 FROM commerce_benefit_settings WHERE business_id = b.id AND points_enabled = 1)
  AND EXISTS (SELECT 1 FROM business_capabilities WHERE business_id = b.id AND capability_id IN ('${C.SALES}', '${C.ORDERS}') AND is_enabled = 1)`;

export function grantAndroidBenefitsBalance(db: DatabaseSync, owner: AndroidBenefitsGrantOwner,
  businessId: string, deviceId: string, customerId: string, expectedRecordId?: string): boolean {
  owner.assertAuthorized();
  const result = db.prepare(`INSERT INTO android_benefits_balance_grants (business_id, device_record_id, customer_id, authorization_epoch)
    SELECT b.id, d.id, c.id, d.authorization_epoch FROM business b JOIN customers c ON c.business_id = b.id
    CROSS JOIN android_devices d WHERE ${scope} AND (? IS NULL OR d.id = ?)
    ON CONFLICT (business_id, device_record_id, customer_id) DO UPDATE SET authorization_epoch = excluded.authorization_epoch`)
    .run(businessId, customerId, deviceId, expectedRecordId ?? null, expectedRecordId ?? null);
  return Number(result.changes) === 1;
}

export function revokeAndroidBenefitsBalance(db: DatabaseSync, owner: AndroidBenefitsGrantOwner,
  businessId: string, deviceId: string, customerId: string, expectedRecordId?: string): boolean {
  owner.assertAuthorized();
  const result = db.prepare(`DELETE FROM android_benefits_balance_grants WHERE business_id = ? AND customer_id = ?
    AND device_record_id = (SELECT id FROM android_devices WHERE device_id = ? AND (? IS NULL OR id = ?))`)
    .run(businessId, customerId, deviceId, expectedRecordId ?? null, expectedRecordId ?? null);
  return Number(result.changes) === 1;
}

/** Caller must supply device identity derived from the authenticated transport, never request JSON. */
export function canReadAndroidBenefitsBalance(db: DatabaseSync, businessId: string, deviceId: string, customerId: string): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM business b JOIN customers c ON c.business_id = b.id
    CROSS JOIN android_devices d JOIN android_benefits_balance_grants g
      ON g.business_id = b.id AND g.customer_id = c.id AND g.device_record_id = d.id AND g.authorization_epoch = d.authorization_epoch
    WHERE ${scope}`).get(businessId, customerId, deviceId));
}
