import type { DatabaseSync } from "node:sqlite";
import { createId } from "@yardimci-asistan/shared";
import type { BusinessCapability } from "@yardimci-asistan/shared";
import {
  ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS,
  ANDROID_STAFF_PERMISSIONS,
  androidPermissionsForGroups
} from "@yardimci-asistan/sync-core";
import type { AndroidDeviceSighting, AndroidPermissionGroups, AndroidSnapshotPermissionProfile } from "@yardimci-asistan/sync-core";
import type {
  DesktopAndroidDevice,
  DesktopAndroidDeviceMutationResult,
  DesktopAndroidPermissionGroupsUpdate
} from "../database-types.js";
import {
  androidPermissionsForRole,
  effectiveAndroidPermissions,
  normalizeAndroidDeviceId,
  normalizeAndroidDeviceRole,
  normalizeAndroidDeviceRoleInput,
  normalizeAndroidPermissionGroupsInput,
  normalizeAndroidTimestamp,
  parseStoredAndroidPermissionGroups
} from "./android-utils.js";
import { revokeAndroidLocalCredential } from "./android-local-credential-store.js";

export function getAndroidDevices(db: DatabaseSync, enabledCapabilities: ReadonlySet<BusinessCapability>): DesktopAndroidDevice[] {
  const rows = db
    .prepare(`
        SELECT *
        FROM android_devices
        ORDER BY is_active DESC, last_seen_at DESC, device_name ASC, device_id ASC
      `)
    .all() as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const role = normalizeAndroidDeviceRole(row.role);
    return {
      id: String(row.id ?? ""),
      deviceId: String(row.device_id ?? ""),
      deviceName: String(row.device_name ?? ""),
      appVersion: String(row.app_version ?? ""),
      role,
      isActive: Number(row.is_active ?? 0) === 1 && !String(row.revoked_at ?? "").trim(),
      permissionGroups: parseStoredAndroidPermissionGroups(row.permission_groups_json),
      permissions: effectiveAndroidPermissions(role, row.permissions_json, enabledCapabilities),
      firstSeenAt: String(row.first_seen_at ?? ""),
      lastSeenAt: String(row.last_seen_at ?? ""),
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? ""),
      revokedAt: String(row.revoked_at ?? "")
    };
  });
}

export function getAndroidPermissionSnapshot(db: DatabaseSync, enabledCapabilities: ReadonlySet<BusinessCapability>): Record<string, AndroidSnapshotPermissionProfile> {
  return Object.fromEntries(getAndroidDevices(db, enabledCapabilities).map((device) => [
    device.deviceId,
    {
      role: device.role,
      is_active: device.isActive,
      permissions: device.permissions
    }
  ]));
}

export function upsertAndroidDeviceSightings(db: DatabaseSync, sightings: AndroidDeviceSighting[]): number {
  if (!Array.isArray(sightings) || sightings.length === 0) {
    return 0;
  }
  const now = new Date().toISOString();
  const statement = db.prepare(`
      INSERT INTO android_devices (
        id, device_id, device_name, app_version, role, is_active, permissions_json, permission_groups_json,
        first_seen_at, last_seen_at, created_at, updated_at, revoked_at
      ) VALUES (?, ?, ?, ?, 'staff', 1, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(device_id) DO UPDATE SET
        device_name = CASE WHEN excluded.device_name != '' THEN excluded.device_name ELSE android_devices.device_name END,
        app_version = CASE WHEN excluded.app_version != '' THEN excluded.app_version ELSE android_devices.app_version END,
        last_seen_at = CASE
          WHEN excluded.last_seen_at > android_devices.last_seen_at THEN excluded.last_seen_at
          ELSE android_devices.last_seen_at
        END,
        updated_at = CASE
          WHEN (excluded.device_name != '' AND excluded.device_name != android_devices.device_name)
            OR (excluded.app_version != '' AND excluded.app_version != android_devices.app_version)
            OR excluded.last_seen_at > android_devices.last_seen_at
          THEN excluded.updated_at
          ELSE android_devices.updated_at
        END
    `);
  let changed = 0;
  db.exec("BEGIN");
  try {
    for (const sighting of sightings) {
      const deviceId = normalizeAndroidDeviceId(sighting?.device_id);
      if (!deviceId) {
        continue;
      }
      const firstSeenAt = normalizeAndroidTimestamp(sighting.first_seen_at, now);
      const lastSeenAt = normalizeAndroidTimestamp(sighting.last_seen_at, firstSeenAt);
      const result = statement.run(
        createId("android_device_"),
        deviceId,
        String(sighting.device_name ?? "").trim().slice(0, 160),
        String(sighting.app_version ?? "").trim().slice(0, 80),
        JSON.stringify(ANDROID_STAFF_PERMISSIONS),
        JSON.stringify(ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS),
        firstSeenAt,
        lastSeenAt,
        firstSeenAt,
        now
      );
      changed += Number(result.changes ?? 0);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return changed;
}

export function setAndroidDeviceRole(db: DatabaseSync, deviceIdInput: string, roleInput: string, enabledCapabilities: ReadonlySet<BusinessCapability>): DesktopAndroidDeviceMutationResult {
  const deviceId = normalizeAndroidDeviceId(deviceIdInput);
  const role = normalizeAndroidDeviceRoleInput(roleInput);
  if (!deviceId || !role) {
    return { ok: false, message: "Telefon rolü için geçerli bir cihaz ve profil seçin.", devices: getAndroidDevices(db, enabledCapabilities) };
  }
  const row = db
    .prepare("SELECT permission_groups_json FROM android_devices WHERE device_id = ?")
    .get(deviceId) as { permission_groups_json?: unknown } | undefined;
  if (!row) {
    return { ok: false, message: "Telefon kaydı bulunamadı.", devices: getAndroidDevices(db, enabledCapabilities) };
  }
  const groups = parseStoredAndroidPermissionGroups(row.permission_groups_json);
  const permissions = role === "admin"
    ? androidPermissionsForRole("admin")
    : androidPermissionsForGroups(groups);
  const now = new Date().toISOString();
  const result = db
    .prepare(`
        UPDATE android_devices
        SET role = ?, permissions_json = ?, updated_at = ?
        WHERE device_id = ?
      `)
    .run(role, JSON.stringify(permissions), now, deviceId);
  return Number(result.changes) === 1
    ? { ok: true, message: role === "admin" ? "Telefon yönetici yapıldı." : "Telefon personel yapıldı.", devices: getAndroidDevices(db, enabledCapabilities) }
    : { ok: false, message: "Telefon kaydı bulunamadı.", devices: getAndroidDevices(db, enabledCapabilities) };
}

export function setAndroidDevicePermissionGroups(db: DatabaseSync, deviceIdInput: string, groupsInput: unknown, enabledCapabilities: ReadonlySet<BusinessCapability>): DesktopAndroidDeviceMutationResult {
  const deviceId = normalizeAndroidDeviceId(deviceIdInput);
  const groups = normalizeAndroidPermissionGroupsInput(groupsInput);
  if (!deviceId || !groups) {
    return { ok: false, message: "Telefon görev alanları için geçerli seçimler yapın.", devices: getAndroidDevices(db, enabledCapabilities) };
  }
  const row = db
    .prepare("SELECT role FROM android_devices WHERE device_id = ?")
    .get(deviceId) as { role?: unknown } | undefined;
  if (!row) {
    return { ok: false, message: "Telefon kaydı bulunamadı.", devices: getAndroidDevices(db, enabledCapabilities) };
  }
  if (normalizeAndroidDeviceRole(row.role) === "admin") {
    return {
      ok: false,
      message: "Yönetici cihazlarda yalnız işletmenin etkin yeteneklerine ait izinler kullanılır.",
      devices: getAndroidDevices(db, enabledCapabilities)
    };
  }
  const result = db
    .prepare(`
        UPDATE android_devices
        SET permission_groups_json = ?, permissions_json = ?, updated_at = ?
        WHERE device_id = ?
      `)
    .run(
      JSON.stringify(groups),
      JSON.stringify(androidPermissionsForGroups(groups)),
      new Date().toISOString(),
      deviceId
    );
  return Number(result.changes) === 1
    ? { ok: true, message: "Telefon görev alanları güncellendi.", devices: getAndroidDevices(db, enabledCapabilities) }
    : { ok: false, message: "Telefon kaydı bulunamadı.", devices: getAndroidDevices(db, enabledCapabilities) };
}

export function setAndroidDevicePermissionGroupsBatch(
  db: DatabaseSync,
  updatesInput: DesktopAndroidPermissionGroupsUpdate[],
  enabledCapabilities: ReadonlySet<BusinessCapability>
): DesktopAndroidDeviceMutationResult {
  if (!Array.isArray(updatesInput) || updatesInput.length === 0) {
    return { ok: true, message: "Telefon görev alanlarında değişiklik yok.", devices: getAndroidDevices(db, enabledCapabilities) };
  }

  const normalized: Array<{ deviceId: string; groups: AndroidPermissionGroups }> = [];
  const seen = new Set<string>();
  let transactionStarted = false;
  try {
    db.exec("BEGIN IMMEDIATE");
    transactionStarted = true;

    for (const update of updatesInput) {
      const deviceId = normalizeAndroidDeviceId(update?.deviceId);
      const groups = normalizeAndroidPermissionGroupsInput(update?.groups);
      if (!deviceId || !groups || seen.has(deviceId)) {
        db.exec("ROLLBACK");
        transactionStarted = false;
        return { ok: false, message: "Telefon görev alanı taslağı geçersiz.", devices: getAndroidDevices(db, enabledCapabilities) };
      }
      seen.add(deviceId);

      const row = db.prepare("SELECT role FROM android_devices WHERE device_id = ?").get(deviceId) as { role?: unknown } | undefined;
      if (!row) {
        db.exec("ROLLBACK");
        transactionStarted = false;
        return { ok: false, message: "Görev alanı değiştirilecek telefon artık mevcut değil.", devices: getAndroidDevices(db, enabledCapabilities) };
      }
      if (normalizeAndroidDeviceRole(row.role) === "admin") {
        db.exec("ROLLBACK");
        transactionStarted = false;
        return { ok: false, message: "Yönetici cihazların görev alanı taslağı kaydedilemez.", devices: getAndroidDevices(db, enabledCapabilities) };
      }
      normalized.push({ deviceId, groups });
    }

    const statement = db.prepare(
      "UPDATE android_devices SET permission_groups_json = ?, permissions_json = ?, updated_at = ? WHERE device_id = ?"
    );
    const now = new Date().toISOString();
    for (const update of normalized) {
      const result = statement.run(
        JSON.stringify(update.groups),
        JSON.stringify(androidPermissionsForGroups(update.groups)),
        now,
        update.deviceId
      );
      if (Number(result.changes) !== 1) {
        throw new Error("Telefon görev alanları toplu olarak kaydedilemedi.");
      }
    }

    db.exec("COMMIT");
    transactionStarted = false;
    return {
      ok: true,
      message: normalized.length === 1
        ? "Telefon görev alanları kaydedildi."
        : `${normalized.length} telefonun görev alanları kaydedildi.`,
      devices: getAndroidDevices(db, enabledCapabilities)
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Preserve the original write failure.
      }
    }
    return {
      ok: false,
      message: error instanceof Error && error.message ? error.message : "Telefon görev alanları kaydedilemedi.",
      devices: getAndroidDevices(db, enabledCapabilities)
    };
  }
}

export function setAndroidDeviceActive(db: DatabaseSync, deviceIdInput: string, active: boolean, enabledCapabilities: ReadonlySet<BusinessCapability>): DesktopAndroidDeviceMutationResult {
  const deviceId = normalizeAndroidDeviceId(deviceIdInput);
  if (!deviceId) {
    return { ok: false, message: "Geçerli bir telefon seçin.", devices: getAndroidDevices(db, enabledCapabilities) };
  }
  const now = new Date().toISOString();
  const result = db
    .prepare(`
        UPDATE android_devices
        SET is_active = ?, revoked_at = CASE WHEN ? = 1 THEN NULL ELSE revoked_at END, updated_at = ?
        WHERE device_id = ?
      `)
    .run(active ? 1 : 0, active ? 1 : 0, now, deviceId);
  return Number(result.changes) === 1
    ? { ok: true, message: active ? "Telefon yeniden aktif edildi." : "Telefon pasifleştirildi.", devices: getAndroidDevices(db, enabledCapabilities) }
    : { ok: false, message: "Telefon kaydı bulunamadı.", devices: getAndroidDevices(db, enabledCapabilities) };
}

export function resetAndroidDevicePermissions(db: DatabaseSync, deviceIdInput: string, enabledCapabilities: ReadonlySet<BusinessCapability>): DesktopAndroidDeviceMutationResult {
  const deviceId = normalizeAndroidDeviceId(deviceIdInput);
  const row = deviceId
    ? db.prepare("SELECT role FROM android_devices WHERE device_id = ?").get(deviceId) as { role?: unknown } | undefined
    : undefined;
  if (!deviceId || !row) {
    return { ok: false, message: "Telefon kaydı bulunamadı.", devices: getAndroidDevices(db, enabledCapabilities) };
  }
  const role = normalizeAndroidDeviceRole(row.role);
  const groups = { ...ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS };
  db
    .prepare("UPDATE android_devices SET permission_groups_json = ?, permissions_json = ?, updated_at = ? WHERE device_id = ?")
    .run(
      JSON.stringify(groups),
      JSON.stringify(role === "admin" ? androidPermissionsForRole("admin") : androidPermissionsForGroups(groups)),
      new Date().toISOString(),
      deviceId
    );
  return { ok: true, message: "Telefon görev alanları varsayılana döndürüldü.", devices: getAndroidDevices(db, enabledCapabilities) };
}

export function revokeAndroidDevice(db: DatabaseSync, deviceIdInput: string, enabledCapabilities: ReadonlySet<BusinessCapability>): DesktopAndroidDeviceMutationResult {
  const deviceId = normalizeAndroidDeviceId(deviceIdInput);
  if (!deviceId) {
    return { ok: false, message: "Geçerli bir telefon seçin.", devices: getAndroidDevices(db, enabledCapabilities) };
  }

  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = db
      .prepare("UPDATE android_devices SET is_active = 0, revoked_at = ?, updated_at = ? WHERE device_id = ?")
      .run(now, now, deviceId);
    if (Number(result.changes) !== 1) {
      db.exec("ROLLBACK");
      return { ok: false, message: "Telefon kaydı bulunamadı.", devices: getAndroidDevices(db, enabledCapabilities) };
    }
    revokeAndroidLocalCredential(db, deviceId, now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    ok: true,
    message: "Telefon kaldırıldı ve yerel ağ erişimi kapatıldı.",
    devices: getAndroidDevices(db, enabledCapabilities)
  };
}
