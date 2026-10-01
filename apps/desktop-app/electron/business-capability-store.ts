import { DatabaseSync } from "node:sqlite";
import {
  BUSINESS_CAPABILITIES,
  CORE_BUSINESS_CAPABILITIES,
  businessProfileSupportsCapability,
  getBusinessProfile,
  getEnabledBusinessCapabilityDependents,
  normalizeBusinessType,
  validateBusinessCapabilitySet,
  type BusinessCapability
} from "@yardimci-asistan/shared";

type BusinessCapabilitySource = "system" | "profile" | "user";

interface PersistedBusinessCapability {
  capability: BusinessCapability;
  enabled: boolean;
  source: BusinessCapabilitySource;
  updatedAt: string;
}

export interface BusinessCapabilitySnapshot {
  businessId: string;
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
    SELECT id, profile_id
    FROM business
    WHERE deleted_at = ''
    ORDER BY created_at ASC
    LIMIT 1
  `).get() as { id?: unknown; profile_id?: unknown } | undefined;
}

function resolveProfileId(business: { profile_id?: unknown } | undefined) {
  return normalizeBusinessType(String(business?.profile_id ?? "").trim());
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

export function readBusinessCapabilitySnapshot(databasePath: string): BusinessCapabilitySnapshot {
  const database = openDatabase(databasePath);
  try {
    const business = readActiveBusiness(database);
    const businessId = String(business?.id ?? "");
    const profileId = resolveProfileId(business);
    if (!businessId) {
      return { businessId: "", profileId, capabilities: [], enabledCapabilities: [] };
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
      if (rawSource !== "system" && rawSource !== "profile" && rawSource !== "user") return [];
      const source: BusinessCapabilitySource = rawSource;
      return [{
        capability,
        enabled: Number(row.is_enabled ?? 0) === 1 && businessProfileSupportsCapability(profileId, capability),
        source,
        updatedAt: String(row.updated_at ?? "")
      }];
    });

    return {
      businessId,
      profileId,
      capabilities,
      enabledCapabilities: capabilities.filter((entry) => entry.enabled).map((entry) => entry.capability)
    };
  } finally {
    database.close();
  }
}

/**
 * Applies a profile as a preset. User overrides survive by default for composable
 * capabilities, while explicitly profile-scoped capabilities (currently customer
 * credit) are forced off when the target profile does not support them. Before
 * commit the resulting set is dependency-validated.
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
        SET profile_id = ?, updated_at = ?
        WHERE id = ? AND deleted_at = ''
      `).run(profileId, now, businessId);

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
        const profileAllows = businessProfileSupportsCapability(profileId, capability);
        if (!system && profileAllows && preserveUserOverrides && existingSources.get(capability) === "user") {
          continue;
        }
        const enabled = system || (profileAllows && profileDefaults.has(capability));
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
 * capabilities are composable unless an explicit profile policy scopes them;
 * mutations must also satisfy declared capability dependencies.
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
    const profileId = resolveProfileId(business);
    if (input.enabled && !businessProfileSupportsCapability(profileId, input.capability)) {
      throw new Error("Veresiye / Müşteri Hesabı yalnızca Market / Perakende işletmelerinde kullanılabilir.");
    }
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
