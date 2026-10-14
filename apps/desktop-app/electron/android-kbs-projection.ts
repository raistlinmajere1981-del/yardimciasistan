import type { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES as C, type BusinessCapability } from "@yardimci-asistan/shared";
import type { AndroidKbsSnapshot, AndroidSnapshotPermissionProfile } from "@yardimci-asistan/sync-core";
import { getKbsOverview } from "./database/hospitality-notification-store.js";

export function androidKbsAllowed(capabilities: Iterable<BusinessCapability>): boolean {
  const enabled = new Set(capabilities);
  return [C.ANDROID, C.ACCOMMODATION_ROOMS, C.ACCOMMODATION_STAYS].every(capability => enabled.has(capability));
}

/** Snapshot identities are inspected in SQLite; no identity document enters the transport object. */
export function readAndroidKbsSnapshot(db: DatabaseSync, capabilities: Iterable<BusinessCapability>): AndroidKbsSnapshot | null {
  if (!androidKbsAllowed(capabilities)) return null;
  const overview = getKbsOverview(db);
  if (!overview.enabled) return null;
  const readiness = `CASE WHEN json_valid(n.identity_snapshot) THEN
    trim(COALESCE(json_extract(n.identity_snapshot,'$.identityType'),''))!=''
    AND (trim(COALESCE(json_extract(n.identity_snapshot,'$.identityNumber'),''))!=''
      OR trim(COALESCE(json_extract(n.identity_snapshot,'$.documentSerialNumber'),''))!='')
    AND trim(COALESCE(json_extract(n.identity_snapshot,'$.nationality'),''))!=''
    AND trim(COALESCE(json_extract(n.identity_snapshot,'$.birthDate'),''))!=''
    ELSE 0 END`;
  const counts = db.prepare(`SELECT COALESCE(SUM(${readiness}),0) AS ready, COUNT(*) AS total FROM hospitality_notifications n`).get();
  const notifications = db.prepare(`SELECT n.id,n.kind,n.status,n.occurred_at,n.confirmed_rejection,
    c.full_name AS customer_name,r.name AS room_name,r.number AS room_number,${readiness} AS identity_ready,
    EXISTS(SELECT 1 FROM kbs_delivery_requests q WHERE q.notification_id=n.id AND q.completed_at='') AS delivery_requested,
    COALESCE((SELECT CASE WHEN q.completed_at='' THEN 'queued' ELSE q.result_state END FROM kbs_delivery_requests q
      WHERE q.notification_id=n.id ORDER BY q.requested_at DESC,q.action_id DESC LIMIT 1),'') AS request_state
    FROM hospitality_notifications n JOIN stay_guests g ON g.id=n.guest_id JOIN customers c ON c.id=g.customer_id
    JOIN rooms r ON r.id=n.room_id
    ORDER BY CASE n.status WHEN 'submission_unknown' THEN 0 WHEN 'failed' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,n.occurred_at DESC,n.id
    LIMIT 500`).all();
  return sanitizeAndroidKbsSnapshot({ enabled: true, configured: overview.configured, provider: overview.provider,
    pending_count: overview.pendingCount, failed_count: overview.failedCount, submission_unknown_count: overview.submissionUnknownCount,
    sent_count: overview.sentCount, identity_ready_count: Number(counts?.ready), identity_missing_count: Number(counts?.total) - Number(counts?.ready),
    notifications: notifications.map(row => ({ id: row.id, customer_name: row.customer_name, room_name: row.room_name, room_number: row.room_number,
      kind: row.kind, status: row.status, occurred_at: row.occurred_at, identity_ready: Number(row.identity_ready) === 1,
      retry_ready: row.status === "failed" && Number(row.confirmed_rejection) === 1 && Number(row.delivery_requested) !== 1,
      delivery_requested: Number(row.delivery_requested) === 1, request_state: row.request_state })) });
}

/** Fresh allowlisted objects at both publication and per-device boundaries, including malformed input. */
export function sanitizeAndroidKbsSnapshot(input: unknown): AndroidKbsSnapshot | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  if (source.enabled !== true || !["egm", "jandarma"].includes(String(source.provider))) return null;
  const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
  const label = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
  const notifications: AndroidKbsSnapshot["notifications"] = [];
  for (const value of Array.isArray(source.notifications) ? source.notifications.slice(0,500) : []) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    const id = label(row.id,180);
    if (!id || !["pending","failed","submission_unknown","sent"].includes(String(row.status))
        || !["arrival","departure","room_change"].includes(String(row.kind))) continue;
    notifications.push({ id, customer_name: label(row.customer_name,160), room_name: label(row.room_name,120), room_number: label(row.room_number,40),
      occurred_at: label(row.occurred_at,80), kind: row.kind as "arrival" | "departure" | "room_change",
      status: row.status as "pending" | "failed" | "submission_unknown" | "sent", identity_ready: row.identity_ready === true,
      retry_ready: row.status === "failed" && row.retry_ready === true, delivery_requested: row.status === "pending" && row.delivery_requested === true,
      request_state: ["queued","sent","failed","waiting","submission_unknown","denied"].includes(String(row.request_state))
        ? row.request_state as AndroidKbsSnapshot["notifications"][number]["request_state"] : "" });
  }
  return { enabled: true, configured: source.configured === true, provider: source.provider as "egm" | "jandarma",
    pending_count: count(source.pending_count), failed_count: count(source.failed_count), submission_unknown_count: count(source.submission_unknown_count),
    sent_count: count(source.sent_count), identity_ready_count: count(source.identity_ready_count), identity_missing_count: count(source.identity_missing_count), notifications };
}

export function projectAndroidKbsForDevice(source: unknown, capabilities: Iterable<BusinessCapability>, profile: AndroidSnapshotPermissionProfile): AndroidKbsSnapshot | null {
  return androidKbsAllowed(capabilities) && profile.role === "admin" && profile.is_active && profile.permissions.includes("kbs.view")
    ? sanitizeAndroidKbsSnapshot(source) : null;
}
