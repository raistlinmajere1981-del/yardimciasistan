import { DatabaseSync } from "node:sqlite";
import {
  BUSINESS_CAPABILITIES,
  CORE_BUSINESS_CAPABILITIES,
  businessProfileSupportsCapability,
  getBusinessProfile,
  getBusinessProfileSelectionCapabilities,
  getEnabledBusinessCapabilityDependents,
  expandBusinessCapabilities,
  normalizeBusinessType,
  validateBusinessCapabilitySet,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import { queueSyncJob } from "./database/sync-runtime-store";
import { resetProfileServiceActivationsInTransaction } from "./profile-service-activation";

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


export function readEnabledBusinessCapabilities(database: DatabaseSync): BusinessCapability[] {
  const business = readActiveBusiness(database);
  const businessId = String(business?.id ?? "");
  if (!businessId) return [];
  return [...readEnabledCapabilities(database, businessId)].sort();
}

export interface ReplaceBusinessCapabilitiesInput {
  businessId: string;
  profileId: string;
  /** Absent for first setup; initialization's placeholder rows are not operator overrides. */
  previousProfileId?: string;
  selectedOptionalCapabilities: BusinessCapability[];
  whatsappEnabled: boolean;
  androidEnabled: boolean;
  aiEnabled: boolean;
  now: string;
}

export function replaceBusinessCapabilitiesInTransaction(
  database: DatabaseSync,
  input: ReplaceBusinessCapabilitiesInput
): BusinessCapability[] {
  const profile = getBusinessProfile(input.profileId);
  const profileChanged = input.previousProfileId !== undefined
    && normalizeBusinessType(input.previousProfileId) !== profile.id;
  const allowedOptional = new Set(profile.optionalCapabilities);
  const selectedOptional = [...new Set(profileChanged ? profile.defaultOptionalCapabilities : input.selectedOptionalCapabilities)]
    .filter((capability) => allowedOptional.has(capability));
  const serviceCapabilities: BusinessCapability[] = [
    ...(!profileChanged && input.whatsappEnabled ? [BUSINESS_CAPABILITIES.WHATSAPP] : []),
    ...(!profileChanged && input.androidEnabled ? [BUSINESS_CAPABILITIES.ANDROID] : []),
    ...(!profileChanged && input.aiEnabled ? [BUSINESS_CAPABILITIES.AI] : [])
  ];
  const selected = new Set<BusinessCapability>([
    ...getBusinessProfileSelectionCapabilities(profile.id, selectedOptional),
    ...serviceCapabilities
  ]);
  const explicitSelection = new Set<BusinessCapability>([
    ...profile.requiredCapabilities, ...selectedOptional, ...serviceCapabilities
  ]);
  const profileDefaults = new Set(profile.defaultCapabilities);
  const serviceCapabilitiesSet = new Set<BusinessCapability>([
    BUSINESS_CAPABILITIES.WHATSAPP, BUSINESS_CAPABILITIES.ANDROID, BUSINESS_CAPABILITIES.AI
  ]);
  const existing = new Map((input.previousProfileId === undefined || profileChanged ? [] : database.prepare(`
    SELECT capability_id, is_enabled, source FROM business_capabilities WHERE business_id = ?
  `).all(input.businessId) as Array<{ capability_id: string; is_enabled: number; source: string }>)
    .map((row) => [row.capability_id, { enabled: row.is_enabled === 1, source: row.source }]));
  const overrides = new Map<BusinessCapability, boolean>();

  for (const capability of KNOWN_CAPABILITIES) {
    if (SYSTEM_CAPABILITIES.has(capability) || !businessProfileSupportsCapability(profile.id, capability)) continue;
    if (profileChanged) continue;
    const previous = existing.get(capability);
    const controlled = allowedOptional.has(capability) || serviceCapabilitiesSet.has(capability);
    if (!controlled) {
      if (previous?.source === "user") overrides.set(capability, previous.enabled);
      continue;
    }
    const enabled = explicitSelection.has(capability);
    // Only edits of the current profile create overrides. A no-op preserves authority.
    const baselineEnabled = previous
      ? previous.enabled
      : profileDefaults.has(capability);
    if (enabled !== baselineEnabled) {
      overrides.set(capability, enabled);
    } else if (previous?.source === "user") {
      overrides.set(capability, previous.enabled);
    }
  }

  for (const [capability, enabled] of overrides) {
    if (enabled) selected.add(capability);
    else selected.delete(capability);
  }
  const resolved = new Set(expandBusinessCapabilities(selected));
  // Dependency expansion must not silently undo an explicit OFF override.
  for (const [capability, enabled] of overrides) {
    if (!enabled) resolved.delete(capability);
  }

  const statement = database.prepare(`
    INSERT INTO business_capabilities (
      business_id, capability_id, is_enabled, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(business_id, capability_id) DO UPDATE SET
      is_enabled = excluded.is_enabled,
      source = excluded.source,
      updated_at = excluded.updated_at
  `);

  for (const capability of KNOWN_CAPABILITIES) {
    const source: BusinessCapabilitySource = SYSTEM_CAPABILITIES.has(capability)
      ? "system"
      : overrides.has(capability)
        ? "user"
        : "profile";
    statement.run(
      input.businessId,
      capability,
      resolved.has(capability) ? 1 : 0,
      source,
      input.now,
      input.now
    );
  }

  assertValidCapabilityState(database, input.businessId);
  if (profileChanged) resetProfileServiceActivationsInTransaction(database, input.businessId, input.now);
  queueSyncJob(database, "android_snapshot", input.now);
  queueSyncJob(database, "menu_publish", input.now);
  return [...resolved].sort();
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
 * Applies the same canonical transition as Setup. Changed profiles always recompute;
 * preserveUserOverrides applies only when explicitly reapplying the CURRENT profile.
 */
export function applyBusinessProfileCapabilities(
  databasePath: string,
  profileIdInput: string,
  options: ApplyBusinessProfileOptions = {}
): BusinessCapabilitySnapshot {
  const profileId = normalizeBusinessType(profileIdInput);
  const profile = getBusinessProfile(profileId);
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

      const current = readEnabledCapabilities(database, businessId);
      const sameProfile = resolveProfileId(business) === profile.id;
      replaceBusinessCapabilitiesInTransaction(database, {
        businessId, profileId,
        previousProfileId: preserveUserOverrides || !sameProfile ? resolveProfileId(business) : undefined,
        selectedOptionalCapabilities: sameProfile && preserveUserOverrides
          ? profile.optionalCapabilities.filter(capability => current.has(capability))
          : profile.defaultOptionalCapabilities,
        whatsappEnabled: sameProfile && preserveUserOverrides && current.has(BUSINESS_CAPABILITIES.WHATSAPP),
        androidEnabled: sameProfile && preserveUserOverrides && current.has(BUSINESS_CAPABILITIES.ANDROID),
        aiEnabled: sameProfile && preserveUserOverrides && current.has(BUSINESS_CAPABILITIES.AI),
        now
      });
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
      queueSyncJob(database, "android_snapshot", now);
      if (input.capability === BUSINESS_CAPABILITIES.QR_MENU) queueSyncJob(database, "menu_publish", now);
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
      queueSyncJob(database, "android_snapshot", now);
      if (capability === BUSINESS_CAPABILITIES.QR_MENU) queueSyncJob(database, "menu_publish", now);
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
