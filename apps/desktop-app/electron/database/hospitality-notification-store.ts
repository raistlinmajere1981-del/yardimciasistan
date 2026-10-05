import type { DatabaseSync } from "node:sqlite";
import type {
  DesktopHospitalityNotification,
  DesktopKbsOverview
} from "../database-types.js";

export function getHospitalityNotifications(db: DatabaseSync): DesktopHospitalityNotification[] {
  return (db.prepare(`
    SELECT
      n.id,
      n.guest_id,
      n.stay_id,
      n.room_id,
      n.kind,
      n.occurred_at,
      n.status,
      n.provider,
      n.provider_reference,
      n.sent_at,
      n.created_at,
      g.customer_id,
      g.status AS guest_status,
      c.full_name AS customer_name,
      c.identity_type,
      c.identity_number,
      c.nationality,
      c.birth_date,
      c.document_serial_number,
      s.status AS stay_status,
      s.check_in_date,
      s.check_out_date,
      r.name AS room_name,
      r.number AS room_number
    FROM hospitality_notifications n
    JOIN stay_guests g ON g.id = n.guest_id
    JOIN customers c ON c.id = g.customer_id
    JOIN customer_room_stays s ON s.id = n.stay_id
    JOIN rooms r ON r.id = n.room_id
    ORDER BY
      CASE n.status WHEN 'submission_unknown' THEN 0 WHEN 'failed' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
      n.occurred_at DESC,
      n.created_at DESC
    LIMIT 500
  `).all() as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id ?? ""),
    guestId: String(row.guest_id ?? ""),
    stayId: String(row.stay_id ?? ""),
    customerId: String(row.customer_id ?? ""),
    customerName: String(row.customer_name ?? ""),
    roomId: String(row.room_id ?? ""),
    roomName: String(row.room_name ?? ""),
    roomNumber: String(row.room_number ?? ""),
    kind: normalizeKind(row.kind),
    status: normalizeStatus(row.status),
    provider: normalizeProvider(row.provider),
    providerReference: String(row.provider_reference ?? ""),
    occurredAt: String(row.occurred_at ?? ""),
    sentAt: String(row.sent_at ?? ""),
    createdAt: String(row.created_at ?? ""),
    guestStatus: normalizeGuestStatus(row.guest_status),
    stayStatus: String(row.stay_status ?? ""),
    checkInDate: String(row.check_in_date ?? ""),
    checkOutDate: String(row.check_out_date ?? ""),
    identityReady: Boolean(
      String(row.identity_type ?? "")
      && (String(row.identity_number ?? "") || String(row.document_serial_number ?? ""))
      && String(row.nationality ?? "")
      && String(row.birth_date ?? "")
    )
  }));
}

export function getKbsOverview(db: DatabaseSync): DesktopKbsOverview {
  const settingsTable = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'kbs_service_settings' LIMIT 1"
  ).get();
  const settings = settingsTable
    ? db.prepare("SELECT * FROM kbs_service_settings WHERE id = 'primary' LIMIT 1").get() as Record<string, unknown> | undefined
    : undefined;
  const provider = settings?.provider === "jandarma" ? "jandarma" : "egm";
  const enabled = Number(settings?.enabled ?? 0) === 1;
  const configured = enabled && Boolean(
    String(settings?.authorized_identity_number ?? "")
    && String(settings?.password_encrypted ?? "")
    && (provider === "jandarma"
      ? String(settings?.facility_code ?? "")
      : String(settings?.username ?? ""))
  );

  const counts = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
      SUM(CASE WHEN status = 'submission_unknown' THEN 1 ELSE 0 END) AS submission_unknown_count,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent_count
    FROM hospitality_notifications
  `).get() as Record<string, unknown> | undefined;

  const checkedIn = db.prepare(
    "SELECT COUNT(*) AS count FROM stay_guests WHERE status = 'checked_in'"
  ).get() as { count?: number } | undefined;

  const activeUnsent = db.prepare(`
    SELECT COUNT(*) AS count
    FROM stay_guests g
    WHERE g.status = 'checked_in'
      AND NOT EXISTS (
        SELECT 1
        FROM hospitality_notifications n
        WHERE n.guest_id = g.id
          AND n.kind = 'arrival'
          AND n.status = 'sent'
      )
  `).get() as { count?: number } | undefined;

  const activeMissingIdentity = db.prepare(`
    SELECT COUNT(*) AS count
    FROM stay_guests g
    JOIN customers c ON c.id = g.customer_id
    WHERE g.status = 'checked_in'
      AND (
        c.identity_type = ''
        OR (c.identity_number = '' AND c.document_serial_number = '')
        OR c.nationality = ''
        OR c.birth_date = ''
      )
  `).get() as { count?: number } | undefined;

  return {
    enabled,
    configured,
    provider,
    pendingCount: Number(counts?.pending_count ?? 0),
    failedCount: Number(counts?.failed_count ?? 0),
    submissionUnknownCount: Number(counts?.submission_unknown_count ?? 0),
    sentCount: Number(counts?.sent_count ?? 0),
    checkedInGuestCount: Number(checkedIn?.count ?? 0),
    activeUnsentCount: Number(activeUnsent?.count ?? 0),
    activeMissingIdentityCount: Number(activeMissingIdentity?.count ?? 0)
  };
}

function normalizeKind(value: unknown): DesktopHospitalityNotification["kind"] {
  return value === "departure" || value === "room_change" ? value : "arrival";
}

function normalizeStatus(value: unknown): DesktopHospitalityNotification["status"] {
  return value === "sent" || value === "failed" || value === "submission_unknown" ? value : "pending";
}

function normalizeProvider(value: unknown): DesktopHospitalityNotification["provider"] {
  return value === "egm" || value === "jandarma" ? value : "";
}

function normalizeGuestStatus(value: unknown): DesktopHospitalityNotification["guestStatus"] {
  if (value === "checked_in" || value === "checked_out" || value === "cancelled") return value;
  return "planned";
}


export function markHospitalityNotificationSentExternally(
  db: DatabaseSync,
  notificationIdInput: string,
  provider: "egm" | "jandarma"
): { ok: true; message: string } | { ok: false; message: string } {
  const notificationId = notificationIdInput.trim();
  if (!notificationId) return { ok: false, message: "Kimlik bildirimi seçilmedi." };

  const row = db.prepare("SELECT status FROM hospitality_notifications WHERE id = ? LIMIT 1").get(notificationId) as { status?: string } | undefined;
  if (!row) return { ok: false, message: "Kimlik bildirimi kaydı bulunamadı." };
  if (row.status === "sent") return { ok: true, message: "Kimlik bildirimi zaten gönderilmiş olarak kayıtlı." };

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE hospitality_notifications
    SET status = 'sent',
        provider = ?,
        provider_reference = 'external',
        sent_at = ?
    WHERE id = ? AND status != 'sent'
  `).run(provider, now, notificationId);
  return { ok: true, message: "Kimlik bildirimi haricen gönderilmiş olarak işaretlendi." };
}

export function retryHospitalityNotification(
  db: DatabaseSync,
  notificationIdInput: string
): { ok: true; message: string } | { ok: false; message: string } {
  const notificationId = notificationIdInput.trim();
  if (!notificationId) return { ok: false, message: "Kimlik bildirimi seçilmedi." };

  const row = db.prepare("SELECT status FROM hospitality_notifications WHERE id = ? LIMIT 1").get(notificationId) as { status?: string } | undefined;
  if (!row) return { ok: false, message: "Kimlik bildirimi kaydı bulunamadı." };
  if (row.status === "sent") return { ok: false, message: "Gönderilmiş bildirim tekrar kuyruğa alınamaz." };
  if (row.status === "submission_unknown") return { ok: false, message: "Gönderim sonucu belirsiz; resmi KBS kaydı kontrol edilmeden yeniden gönderilemez." };

  const changed = db.prepare(`
    UPDATE hospitality_notifications
    SET status = 'pending',
        provider = '',
        provider_reference = '',
        sent_at = ''
    WHERE id = ? AND status IN ('pending', 'failed')
  `).run(notificationId).changes;
  if (!changed) return { ok: false, message: "Gönderim durumu değişti; bildirim yeniden kuyruğa alınamadı." };
  return { ok: true, message: "Kimlik bildirimi yeniden gönderim kuyruğuna alındı." };
}
