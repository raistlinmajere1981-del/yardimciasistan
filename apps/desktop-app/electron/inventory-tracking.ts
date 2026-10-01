import type { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";

/**
 * Inventory is optional. Persisted stock values can remain after the module is disabled;
 * those values must not keep blocking sales or mutate in the background.
 *
 * Low-level legacy fixtures may omit the capability manifest entirely, so an empty
 * manifest preserves the historical stock-aware default.
 */
export function isInventoryTrackingEnabled(db: DatabaseSync): boolean {
  const configured = db.prepare(`
    SELECT COUNT(*) AS count
    FROM business_capabilities
    INNER JOIN business ON business.id = business_capabilities.business_id
    WHERE business.deleted_at = ''
  `).get() as { count?: number } | undefined;
  if (Number(configured?.count ?? 0) === 0) return true;

  const enabled = db.prepare(`
    SELECT 1 AS enabled
    FROM business_capabilities
    INNER JOIN business ON business.id = business_capabilities.business_id
    WHERE business.deleted_at = ''
      AND business_capabilities.capability_id = ?
      AND business_capabilities.is_enabled = 1
    LIMIT 1
  `).get(BUSINESS_CAPABILITIES.INVENTORY) as { enabled?: number } | undefined;
  return Boolean(enabled?.enabled);
}
