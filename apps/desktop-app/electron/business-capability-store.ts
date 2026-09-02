import { DatabaseSync } from "node:sqlite";
import {
  BUSINESS_CAPABILITIES,
  CORE_BUSINESS_CAPABILITIES,
  getBusinessProfile,
  getEnabledBusinessCapabilityDependents,
  normalizeBusinessType,
  validateBusinessCapabilitySet,
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
  /** Transitional compatibility alias. Prefer profileId. */
  businessType: string;
  profileId: string;
  capabilities: PersistedBusinessCapability[];
  enabledCapabilities: BusinessCapability[];
}

export interface SetBusinessCapabilityInput {
  capability: BusinessCapability;
  enabled: boolean;
}

export interface ApplyBusinessProfileOptions {
  preserveUserOverrides?: boolean;
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
    SELECT id, business_type, profile_id
    FROM business
    WHERE deleted_at = ''
    ORDER BY created_at ASC
    LIMIT 1
  `).get() as { id?: unknown; business_type?: unknown; profile_id?: unknown } | undefined;
}

function resolveProfileId(business: { business_type?: unknown; profile_id?: unknown } | undefined) {
  const storedProfileId = String(business?.profile_id ?? "").trim();
  return normalizeBusinessType(storedProfileId || String(business?.business_type ?? ""));
}

function readEnabledCapabilities(database: DatabaseSync, businessId: string) {
  return new Set<BusinessCapability>(
    (database.prepare(`
      SELECT capability_id
      FROM business_capabilities
      WHERE business_id = ? AND is_enabled = 1
    `).all(businessId) as Array<{ capability_id?: unknown }>)
      .map((row) => String(row.capability_id ?? "") as BusinessCapability)
      .filter((capability) => KNOWN_CAPABILITIES.has(capability))
  );
}

function formatCapabilityList(capabilities: Iterable<BusinessCapability>) {
  return [...capabilities].join(", ");
}

function assertValidCapabilityState(database: DatabaseSync, businessId: string) {
  const enabled = readEnabledCapabilities(database, businessId);
  const violations = validateBusinessCapabilitySet(enabled);
  if (violations.length === 0) return;

  const first = violations[0];
  throw new Error(
    `${first.capability} yeteneği için gerekli yetenekler etkin değil: ${formatCapabilityList(first.missingDependencies)}.`
  );
}

/**
 * Compatibility projection only.
 *
 * v2 persistence treats business_capabilities as authoritative. The historical
 * settings/module fields are still read by parts of the renderer and sync code,
 * so keep them as a materialized projection until those call sites move to the
 * capability IPC surface. No domain decision should be derived from these
 * columns in new code.
 */
function syncLegacyProjection(database: DatabaseSync, businessId: string, now = new Date().toISOString()) {
  const enabled = readEnabledCapabilities(database, businessId);
  const modules = {
    rooms: enabled.has(BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS),
    tables: enabled.has(BUSINESS_CAPABILITIES.FOOD_TABLES),
    qr_menu: enabled.has(BUSINESS_CAPABILITIES.QR_MENU),
    ai: enabled.has(BUSINESS_CAPABILITIES.AI),
    whatsapp: enabled.has(BUSINESS_CAPABILITIES.WHATSAPP),
    android: enabled.has(BUSINESS_CAPABILITIES.ANDROID)
  };

  database.prepare(`
    UPDATE business
    SET modules_json = ?, updated_at = ?
    WHERE id = ? AND deleted_at = ''
  `).run(JSON.stringify(modules), now, businessId);

  database.prepare(`
    UPDATE settings
    SET ai_enabled = ?,
        whatsapp_enabled = ?,
        android_enabled = ?,
        rooms_enabled = ?,
        tables_enabled = ?,
        qr_menu_enabled = ?,
        updated_at = ?
    WHERE business_id = ? AND deleted_at = ''
  `).run(
    modules.ai ? 1 : 0,
    modules.whatsapp ? 1 : 0,
    modules.android ? 1 : 0,
    modules.rooms ? 1 : 0,
    modules.tables ? 1 : 0,
    modules.qr_menu ? 1 : 0,
    now,
    businessId
  );
}

export function readBusinessCapabilitySnapshot(databasePath: string): BusinessCapabilitySnapshot {
  const database = openDatabase(databasePath);
  try {
    const business = readActiveBusiness(database);
    const businessId = String(business?.id ?? "");
    const profileId = resolveProfileId(business);
    const businessType = String(business?.business_type ?? profileId);
    if (!businessId) {
      return { businessId: "", businessType, profileId, capabilities: [], enabledCapabilities: [] };
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
      const rawSource = String(row.source ?? "profile");
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
      profileId,
      capabilities,
      enabledCapabilities: capabilities.filter((entry) => entry.enabled).map((entry) => entry.capability)
    };
  } finally {
    database.close();
  }
}

/**
 * Applies a profile as a preset, not as a permanent business type constraint.
 * User overrides survive by default, so profiles remain composable. Before the
 * transaction commits the resulting set is dependency-validated; an orphaned
 * override can never leave runtime in an internally inconsistent state.
 */
export function applyBusinessProfileCapabilities(
  databasePath: string,
  profileIdInput: string,
  options: ApplyBusinessProfileOptions = {}
): BusinessCapabilitySnapshot {
  const profileId = normalizeBusinessType(profileIdInput);
  const profile = getBusinessProfile(profileId);
  const profileDefaults = new Set(profile.defaultCapabilities);
  const preserveUserOverrides = options.preserveUserOverrides !== false;
  const database = openDatabase(databasePath);

  try {
    const business = readActiveBusiness(database);
    const businessId = String(business?.id ?? "");
    if (!businessId) throw new Error("Aktif işletme bulunamadı.");

    const now = new Date().toISOString();
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare(`
        UPDATE business
        SET profile_id = ?, business_type = ?, updated_at = ?
        WHERE id = ? AND deleted_at = ''
      `).run(profileId, profileId, now, businessId);

      const existingRows = database.prepare(`
        SELECT capability_id, source
        FROM business_capabilities
        WHERE business_id = ?
      `).all(businessId) as Array<{ capability_id?: unknown; source?: unknown }>;
      const existingSources = new Map(
        existingRows.map((row) => [String(row.capability_id ?? ""), String(row.source ?? "")])
      );

      for (const capability of KNOWN_CAPABILITIES) {
        const system = SYSTEM_CAPABILITIES.has(capability);
        if (!system && preserveUserOverrides && existingSources.get(capability) === "user") {
          continue;
        }
        const enabled = system || profileDefaults.has(capability);
        database.prepare(`
          INSERT INTO business_capabilities (
            business_id, capability_id, is_enabled, source, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(business_id, capability_id) DO UPDATE SET
            is_enabled = excluded.is_enabled,
            source = excluded.source,
            updated_at = excluded.updated_at
        `).run(
          businessId,
          capability,
          enabled ? 1 : 0,
          system ? "system" : "profile",
          now,
          now
        );
      }

      assertValidCapabilityState(database, businessId);
      syncLegacyProjection(database, businessId, now);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }

  return readBusinessCapabilitySnapshot(databasePath);
}

/**
 * Writes an explicit operator override. Core capabilities are immutable. Domain
 * capabilities may be composed freely, but a mutation is rejected when it
 * would violate a declared capability dependency.
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

    const currentlyEnabled = readEnabledCapabilities(database, businessId);
    if (!input.enabled) {
      const dependents = getEnabledBusinessCapabilityDependents(input.capability, currentlyEnabled);
      if (dependents.length > 0) {
        throw new Error(
          `${input.capability} kapatılamaz; şu etkin yetenekler buna bağlı: ${formatCapabilityList(dependents)}.`
        );
      }
    }

    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare(`
        INSERT INTO business_capabilities (
          business_id, capability_id, is_enabled, source, created_at, updated_at
        ) VALUES (?, ?, ?, 'user', ?, ?)
        ON CONFLICT(business_id, capability_id) DO UPDATE SET
          is_enabled = excluded.is_enabled,
          source = 'user',
          updated_at = excluded.updated_at
      `).run(businessId, input.capability, input.enabled ? 1 : 0, now, now);

      assertValidCapabilityState(database, businessId);
      syncLegacyProjection(database, businessId, now);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
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
    const profileId = resolveProfileId(business);
    const profileDefaults = new Set(getBusinessProfile(profileId).defaultCapabilities);
    const now = new Date().toISOString();

    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare(`
        INSERT INTO business_capabilities (
          business_id, capability_id, is_enabled, source, created_at, updated_at
        ) VALUES (?, ?, ?, 'profile', ?, ?)
        ON CONFLICT(business_id, capability_id) DO UPDATE SET
          is_enabled = excluded.is_enabled,
          source = 'profile',
          updated_at = excluded.updated_at
      `).run(businessId, capability, profileDefaults.has(capability) ? 1 : 0, now, now);

      assertValidCapabilityState(database, businessId);
      syncLegacyProjection(database, businessId, now);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }

  return readBusinessCapabilitySnapshot(databasePath);
}
