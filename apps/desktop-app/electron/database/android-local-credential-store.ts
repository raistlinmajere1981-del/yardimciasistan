import { createHash, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS,
  ANDROID_STAFF_PERMISSIONS
} from "@yardimci-asistan/sync-core";
import type { AndroidDeviceSighting } from "@yardimci-asistan/sync-core";
import { createId } from "@yardimci-asistan/shared";
import {
  normalizeAndroidDeviceId,
  normalizeAndroidTimestamp
} from "./android-utils.js";

const LOCAL_TOKEN_PATTERN = /^yal_[a-f0-9]{64}$/;

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function safeHashEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function registerPendingLocalAndroidDevice(
  db: DatabaseSync,
  sighting: AndroidDeviceSighting
): boolean {
  const deviceId = normalizeAndroidDeviceId(sighting?.device_id);
  if (!deviceId) return false;

  const now = new Date().toISOString();
  const firstSeenAt = normalizeAndroidTimestamp(sighting.first_seen_at, now);
  const lastSeenAt = normalizeAndroidTimestamp(sighting.last_seen_at, firstSeenAt);
  db.prepare(`
      INSERT INTO android_devices (
        id, device_id, device_name, app_version, role, is_active,
        permissions_json, permission_groups_json, first_seen_at, last_seen_at,
        created_at, updated_at, revoked_at
      ) VALUES (?, ?, ?, ?, 'staff', 0, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(device_id) DO UPDATE SET
        device_name = CASE WHEN excluded.device_name != '' THEN excluded.device_name ELSE android_devices.device_name END,
        app_version = CASE WHEN excluded.app_version != '' THEN excluded.app_version ELSE android_devices.app_version END,
        last_seen_at = CASE
          WHEN excluded.last_seen_at > android_devices.last_seen_at THEN excluded.last_seen_at
          ELSE android_devices.last_seen_at
        END,
        updated_at = excluded.updated_at
    `).run(
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
  return true;
}

export function storeAndroidLocalCredential(
  db: DatabaseSync,
  deviceIdInput: string,
  tokenInput: string
): boolean {
  const deviceId = normalizeAndroidDeviceId(deviceIdInput);
  const token = String(tokenInput ?? "").trim();
  if (!deviceId || !LOCAL_TOKEN_PATTERN.test(token)) return false;

  const device = db.prepare(
    "SELECT revoked_at FROM android_devices WHERE device_id = ?"
  ).get(deviceId) as { revoked_at?: unknown } | undefined;
  if (!device || String(device.revoked_at ?? "").trim()) return false;

  const now = new Date().toISOString();
  db.prepare(`
      INSERT INTO android_local_credentials (
        device_id, token_hash, created_at, updated_at, revoked_at
      ) VALUES (?, ?, ?, ?, '')
      ON CONFLICT(device_id) DO UPDATE SET
        token_hash = excluded.token_hash,
        updated_at = excluded.updated_at,
        revoked_at = ''
    `).run(deviceId, tokenHash(token), now, now);
  return true;
}

export function authorizeAndroidLocalCredential(
  db: DatabaseSync,
  deviceIdInput: string,
  tokenInput: string
): boolean {
  const deviceId = normalizeAndroidDeviceId(deviceIdInput);
  const token = String(tokenInput ?? "").trim();
  if (!deviceId || !LOCAL_TOKEN_PATTERN.test(token)) return false;

  const row = db.prepare(`
      SELECT credentials.token_hash
      FROM android_local_credentials AS credentials
      INNER JOIN android_devices AS devices ON devices.device_id = credentials.device_id
      WHERE credentials.device_id = ?
        AND credentials.revoked_at = ''
        AND COALESCE(devices.revoked_at, '') = ''
      LIMIT 1
    `).get(deviceId) as { token_hash?: unknown } | undefined;
  const storedHash = String(row?.token_hash ?? "").trim();
  if (!/^[a-f0-9]{64}$/.test(storedHash)) return false;
  return safeHashEquals(storedHash, tokenHash(token));
}

export function revokeAndroidLocalCredential(
  db: DatabaseSync,
  deviceIdInput: string,
  timestamp = new Date().toISOString()
): number {
  const deviceId = normalizeAndroidDeviceId(deviceIdInput);
  if (!deviceId) return 0;
  const result = db.prepare(`
      UPDATE android_local_credentials
      SET revoked_at = ?, updated_at = ?
      WHERE device_id = ? AND revoked_at = ''
    `).run(timestamp, timestamp, deviceId);
  return Number(result.changes ?? 0);
}
