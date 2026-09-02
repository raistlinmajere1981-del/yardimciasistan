import { DatabaseSync } from "node:sqlite";
import {
  BUSINESS_CAPABILITIES,
  CORE_BUSINESS_CAPABILITIES,
  type BusinessCapability
} from "@yardimci-asistan/shared";

export type BusinessCapabilitySource = "system" | "profile" | "legacy" | "user";

export interface PersistedBusinessCapability {
  capability: BusinessCapability;
  enabled: boolean;
  source: BusinessCapabilitySource;
  updatedAt: string;
}

export interface BusinessCapabilitySnapshot {
  businessId: string;
  businessType: string;
  capabilities: PersistedBusinessCapability[];
  enabledCapabilities: BusinessCapability[];
}

export interface SetBusinessCapabilityInput {
  capability: BusinessCapability;
  enabled: boolean;
}

const KNOWN_CAPABILITIES = new Set<BusinessCapability>(Object.values(BUSINESS_CAPABILITIES));
const SYSTEM_CAPABILITIES = new Set<BusinessCapability>(CORE_BUSINESS_CAPABILITIES);

function openDatabase(databasePath: string) {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA busy_timeout = 5000;");
  database.exec("PRAGMA foreign_keys = ON;");
  return database;
}

function readActiveBusiness(database: DatabaseSync) {
  return database.prepare(`
    SELECT id, business_type
    FROM business
    WHERE deleted_at = ''
    ORDER BY created_at ASC
    LIMIT 1
  `).get() as { id?: unknown; business_type?: unknown } | undefined;
}

export function readBusinessCapabilitySnapshot(databasePath: string): BusinessCapabilitySnapshot {
  const database = openDatabase(databasePath);
  try {
    const business = readActiveBusiness(database);
    const businessId = String(business?.id ?? "");
    const businessType = String(business?.business_type ?? "");
    if (!businessId) {
      return { businessId: "", businessType, capabilities: [], enabledCapabilities: [] };
    }

    const rows = database.prepare(`
      SELECT capability_id, is_enabled, source, updated_at
      FROM business_capabilities
      WHERE business_id = ?
      ORDER BY capability_id ASC
    `).all(businessId) as Array<Record<string, unknown>>;

    const capabilities = rows.flatMap((row): PersistedBusinessCapability[] => {
      const capability = String(row.capability_id ?? "") as BusinessCapability;
      if (!KNOWN_CAPABILITIES.has(capability)) return [];
      const rawSource = String(row.source ?? "legacy");
      const source: BusinessCapabilitySource = rawSource === "system"
        || rawSource === "profile"
        || rawSource === "user"
        ? rawSource
        : "legacy";
      return [{
        capability,
        enabled: Number(row.is_enabled ?? 0) === 1,
        source,
        updatedAt: String(row.updated_at ?? "")
      }];
    });

    return {
      businessId,
      businessType,
      capabilities,
      enabledCapabilities: capabilities.filter((entry) => entry.enabled).map((entry) => entry.capability)
    };
  } finally {
    database.close();
  }
}

/**
 * Writes an explicit operator override. Core capabilities are deliberately
 * immutable here: disabling the common data/sync/backup foundation would make
 * domain profiles impossible to reason about. Domain/service capabilities can
 * be independently enabled or disabled without changing business_type.
 */
export function setBusinessCapability(
  databasePath: string,
  input: SetBusinessCapabilityInput
): BusinessCapabilitySnapshot {
  if (!KNOWN_CAPABILITIES.has(input.capability)) {
    throw new Error(`Bilinmeyen işletme yeteneği: ${input.capability}`);
  }
  if (SYSTEM_CAPABILITIES.has(input.capability)) {
    throw new Error(`Çekirdek işletme yeteneği kapatılamaz: ${input.capability}`);
  }

  const database = openDatabase(databasePath);
  try {
    const business = readActiveBusiness(database);
    const businessId = String(business?.id ?? "");
    if (!businessId) throw new Error("Aktif işletme bulunamadı.");
    const now = new Date().toISOString();
    database.prepare(`
      INSERT INTO business_capabilities (
        business_id, capability_id, is_enabled, source, created_at, updated_at
      ) VALUES (?, ?, ?, 'user', ?, ?)
      ON CONFLICT(business_id, capability_id) DO UPDATE SET
        is_enabled = excluded.is_enabled,
        source = 'user',
        updated_at = excluded.updated_at
    `).run(businessId, input.capability, input.enabled ? 1 : 0, now, now);
  } finally {
    database.close();
  }

  return readBusinessCapabilitySnapshot(databasePath);
}

export function clearBusinessCapabilityOverride(
  databasePath: string,
  capability: BusinessCapability
): BusinessCapabilitySnapshot {
  if (!KNOWN_CAPABILITIES.has(capability)) {
    throw new Error(`Bilinmeyen işletme yeteneği: ${capability}`);
  }
  if (SYSTEM_CAPABILITIES.has(capability)) {
    return readBusinessCapabilitySnapshot(databasePath);
  }

  const database = openDatabase(databasePath);
  try {
    const business = readActiveBusiness(database);
    const businessId = String(business?.id ?? "");
    if (!businessId) throw new Error("Aktif işletme bulunamadı.");

    // Removing the override intentionally removes the row. The legacy setup
    // bridge can recreate it on its next settings save; future profile code can
    // replace this with a profile-derived row without schema changes.
    database.prepare(`
      DELETE FROM business_capabilities
      WHERE business_id = ? AND capability_id = ? AND source = 'user'
    `).run(businessId, capability);
  } finally {
    database.close();
  }

  return readBusinessCapabilitySnapshot(databasePath);
}
