import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import { getKbsOverview, markHospitalityNotificationSentExternally, retryHospitalityNotification } from "./database/hospitality-notification-store.js";
import { hasKbsIdentityMinimum, parseKbsIdentitySnapshot } from "./kbs-provider-adapter.js";
import { insertDatabaseEvent } from "./database/event-store.js";
import { queueSyncJob } from "./database/sync-runtime-store.js";

export function isAndroidKbsAction(type: string): boolean {
  return ["kbs_send_request", "kbs_retry_prepare", "kbs_mark_sent_externally"].includes(type);
}

export function androidKbsActionIntentHash(action: AndroidSyncAction): string {
  // Strict scalar allowlist below makes key ordering the only normalization required.
  return createHash("sha256").update(JSON.stringify({ type: action.action_type, device: action.device_id,
    payload: Object.fromEntries(Object.entries(action.payload).sort(([a], [b]) => a.localeCompare(b))) })).digest("hex");
}

export function applyAndroidKbsAction(db: DatabaseSync, action: AndroidSyncAction, now: string): { ok: boolean; message: string } {
  if (!db.isTransaction) throw new Error("KBS intent requires the Android receipt transaction.");
  const payload = action.payload;
  const external = action.action_type === "kbs_mark_sent_externally";
  const fields = ["notification_id", "provider", "expected_status", ...(external ? ["portal_record_verified", "external_confirmation"] : [])];
  if (Object.keys(payload).some(key => !fields.includes(key)) || typeof payload.notification_id !== "string"
      || !payload.notification_id.trim() || payload.notification_id.length > 180
      || payload.notification_id !== payload.notification_id.trim()
      || !["egm", "jandarma"].includes(String(payload.provider))) {
    return { ok: false, message: "KBS işlem bilgileri geçersiz." };
  }
  const overview = getKbsOverview(db);
  if (!overview.enabled) return { ok: false, message: "Kimlik Bildirim Sistemi etkin değil." };
  if (overview.provider !== payload.provider) return { ok: false, message: "KBS sağlayıcısı değişmiş. Veriyi yenileyin." };
  const id = payload.notification_id.trim();
  const row = db.prepare("SELECT status, identity_snapshot FROM hospitality_notifications WHERE id=?").get(id);
  if (!row) return { ok: false, message: "Kimlik bildirimi kaydı bulunamadı." };
  if (row.status === "sent") return { ok: false, message: "Gönderilmiş bildirim tekrar işlenemez." };
  if (row.status !== payload.expected_status) return { ok: false, message: "KBS bildirim durumu değişmiş. Veriyi yenileyip tekrar onaylayın." };
  let result: { ok: boolean; message: string };
  if (action.action_type === "kbs_send_request") {
    if (!overview.configured) return { ok: false, message: "KBS bağlantı ayarları tamamlanmadı." };
    if (row.status !== "pending") return { ok: false, message: "Yalnız bekleyen bildirimin gönderimi talep edilebilir. Belirsiz sonuç yeniden gönderilemez." };
    const identity = parseKbsIdentitySnapshot(String(row.identity_snapshot));
    if (!identity || !hasKbsIdentityMinimum(identity)) return { ok: false, message: "Kimlik bilgileri eksik; masaüstünde tamamlayın." };
    const pending = db.prepare("SELECT action_id FROM kbs_delivery_requests WHERE notification_id=? AND completed_at=''").get(id);
    if (pending) return { ok: false, message: "Bu bildirim için masaüstünde bekleyen bir gönderim isteği var." };
    db.prepare(`INSERT INTO kbs_delivery_requests(action_id,notification_id,device_id,provider,requested_at) VALUES(?,?,?,?,?)`)
      .run(action.id, id, action.device_id, overview.provider, now);
    result = { ok: true, message: "Gönderim isteği masaüstüne ulaştı; resmi gönderim henüz doğrulanmadı." };
  } else if (action.action_type === "kbs_retry_prepare") {
    result = retryHospitalityNotification(db, id);
  } else if (external) {
    if (payload.portal_record_verified !== true || payload.external_confirmation !== "government_portal_verified") {
      return { ok: false, message: "Resmi kurum portalındaki kaydı kontrol edip ikinci onayı açıkça verin." };
    }
    result = markHospitalityNotificationSentExternally(db, id, overview.provider);
  } else return { ok: false, message: "KBS işlem türü desteklenmiyor." };
  if (!result.ok) return result;
  insertDatabaseEvent(db, { type: `kbs.${action.action_type}`, entityType: "hospitality_notification", entityId: id,
    payload: { source: "android", provider: overview.provider, portal_record_verified: external }, now, androidAction: action });
  queueSyncJob(db, "android_snapshot", now);
  return result;
}
