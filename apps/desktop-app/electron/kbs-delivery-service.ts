import type { DatabaseSync } from "node:sqlite";
import {
  hasKbsIdentityMinimum, parseKbsIdentitySnapshot,
  type KbsDeliveryInput, type KbsDeliveryResult, type KbsProviderAdapter
} from "./kbs-provider-adapter.js";
import type { KbsProvider } from "./kbs-settings.js";
import { getKbsOverview } from "./database/hospitality-notification-store.js";
import { desktopLog } from "./desktop-logger.js";
import { authorizeAndroidAction } from "./android-action-service.js";
import { readEnabledBusinessCapabilities } from "./business-capability-store.js";
import type { AndroidSyncAction } from "@yardimci-asistan/sync-core";
import { queueSyncJob } from "./database/sync-runtime-store.js";
import { androidKbsActionIntentHash } from "./android-kbs-actions.js";

export type KbsDeliveryAttemptResult = KbsDeliveryResult | {
  ok: true; state: "already_sent"; message: string; provider: KbsProvider; providerReference: string;
};

/** One local notification owns one logical delivery. No provider deduplication guarantee
 * exists: commit an uncertainty fence before I/O and never expire/reset it on recovery.
 * Short local transactions only; no SQLite transaction spans adapter.send(). */
export class KbsDeliveryService {
  private readonly adapters = new Map<KbsProvider, KbsProviderAdapter>();
  constructor(private readonly db: DatabaseSync, adapters: readonly KbsProviderAdapter[]) {
    for (const adapter of adapters) this.adapters.set(adapter.provider, adapter);
  }

  /** Called after receipt commit and again on restart. No running lease can reopen a fence. */
  async processRequests(available: () => boolean): Promise<number> {
    if (this.db.isTransaction || !available()) return 0;
    const requests = this.db.prepare(`SELECT q.*,r.intent_hash AS receipt_hash FROM kbs_delivery_requests q
      JOIN android_action_receipts r ON r.id=q.action_id AND r.device_id=q.device_id AND r.action_type='kbs_send_request'
      WHERE q.completed_at='' ORDER BY q.requested_at,q.action_id LIMIT 50`).all();
    let completed = 0;
    for (const request of requests) {
      if (!available()) break;
      const action: AndroidSyncAction = { id: String(request.action_id), action_type: "kbs_send_request",
        device_id: String(request.device_id), device_name: "", app_version: "", created_at: String(request.requested_at),
        payload: { notification_id: String(request.notification_id), provider: request.provider, expected_status: "pending" },
        status: "pending", error_message: "", processed_at: "", last_seen_at: "" };
      const authorized = () => available() && Boolean(this.db.prepare("SELECT 1 FROM kbs_delivery_requests WHERE action_id=? AND completed_at=''").get(action.id))
        && request.receipt_hash === androidKbsActionIntentHash(action)
        && authorizeAndroidAction(this.db, action, readEnabledBusinessCapabilities(this.db)).ok;
      const result = await this.deliver(String(request.notification_id), request.provider === "jandarma" ? "jandarma" : "egm", authorized, true);
      // Local preparation failures have not called the adapter and must remain durable work.
      if (!result.ok && ["local_preparation_failed", "local_transaction_active"].includes(result.code ?? "")) continue;
      const state = result.ok ? "sent" : result.code === "request_unauthorized" ? "denied"
        : result.state === "submission_unknown" ? "submission_unknown" : result.state === "failed" ? "failed" : "waiting";
      try {
        this.db.exec("BEGIN IMMEDIATE");
        const now = new Date().toISOString();
        const changed = this.db.prepare("UPDATE kbs_delivery_requests SET completed_at=?,result_state=? WHERE action_id=? AND completed_at=''")
          .run(now, state, String(request.action_id)).changes;
        if (changed) queueSyncJob(this.db, "android_snapshot", now);
        this.db.exec("COMMIT");
        completed += Number(changed);
      } catch {
        if (this.db.isTransaction) this.db.exec("ROLLBACK");
        // Restart revisits the request. The canonical notification still fences any POST.
        desktopLog.warn({ scope: "kbs", event: "kbs.request.completion.failed", message: "KBS isteği tamamlanma kaydı bekliyor; kalıcı gönderim sınırı korunuyor." });
      }
    }
    return completed;
  }

  async deliver(notificationIdInput: string, provider: KbsProvider, authorize?: () => boolean, pendingOnly = false): Promise<KbsDeliveryAttemptResult> {
    const notificationId = notificationIdInput.trim();
    if (!notificationId) return waiting(provider, "Kimlik bildirimi seçilmedi.", "notification_required");
    // A caller-owned transaction must not carry a not-yet-durable fence across network I/O.
    if (this.db.isTransaction) return waiting(provider, "KBS gönderimi açık bir yerel işlem içinde başlatılamaz.", "local_transaction_active");
    let prepared: KbsDeliveryInput | KbsDeliveryAttemptResult;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      prepared = authorize && !authorize()
        ? waiting(provider, "KBS gönderim isteğinin cihaz yetkisi artık geçerli değil.", "request_unauthorized")
        : this.prepareSubmission(notificationId, provider, pendingOnly);
      this.db.exec("COMMIT");
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      desktopLog.error({ scope: "kbs", event: "kbs.delivery.preparation.failed", message: "KBS gönderim niyeti kaydedilemedi; sağlayıcı çağrılmadı.", operationId: notificationId, error });
      return waiting(provider, "KBS gönderim niyeti kaydedilemedi. Bildirim gönderilmedi.", "local_preparation_failed");
    }
    if (!("notificationId" in prepared)) return prepared;

    desktopLog.info({ scope: "kbs", event: "kbs.delivery.submission.started", message: "KBS gönderim niyeti kalıcı olarak sahiplenildi.", operationId: notificationId, meta: { provider } });
    let result: KbsDeliveryResult;
    try { result = await this.adapters.get(provider)!.send(prepared); }
    catch {
      // Never collect arbitrary provider exceptions: they may contain identity or secrets.
      result = unknown(provider, "adapter_exception");
    }
    if (result.provider !== provider) result = unknown(provider, "provider_result_mismatch");
    if (!result.ok && (result.state === "submission_unknown" || result.submission === "unknown" || (result.state === "failed" && result.submission !== "rejected"))) {
      desktopLog.warn({ scope: "kbs", event: "kbs.delivery.submission.unknown", message: "KBS gönderim sonucu belirsiz; otomatik yeniden gönderim engellendi.", operationId: notificationId, meta: { provider } });
      result = unknown(provider, result.state === "submission_unknown" ? result.code || "submission_unknown" : "submission_unknown");
    }
    try {
      this.db.exec("BEGIN IMMEDIATE");
      const saved = this.persistResult(notificationId, result);
      this.db.exec("COMMIT");
      return saved;
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      // The committed pre-I/O fence remains even if ALL result writes fail. In particular,
      // success must never fall through to a failed/pending update or another provider POST.
      desktopLog.error({ scope: "kbs", event: "kbs.delivery.result-persistence.failed", message: "KBS sonucu yerel kayda işlenemedi; gönderim fence'i korunuyor.", operationId: notificationId, error, meta: { provider, providerAccepted: result.ok } });
      return unknown(provider, "local_result_persistence_failed");
    }
  }

  private prepareSubmission(notificationId: string, provider: KbsProvider, pendingOnly: boolean): KbsDeliveryInput | KbsDeliveryAttemptResult {
    const enabled = new Set(readEnabledBusinessCapabilities(this.db));
    if (!enabled.has("accommodation.rooms") || !enabled.has("accommodation.stays")) {
      return waiting(provider, "Konaklama yönetimi bu işletmede etkin değil.", "accommodation_disabled");
    }
    const overview = getKbsOverview(this.db);
    if (!overview.enabled) return waiting(provider, "Kimlik Bildirim Sistemi etkin değil.", "kbs_disabled");
    if (!overview.configured) return waiting(provider, "KBS bağlantı ayarları tamamlanmadan bildirim gönderilemez.", "kbs_not_configured");
    if (overview.provider !== provider) return waiting(provider, "Seçili KBS sağlayıcısı değişmiş.", "provider_changed");
    const row = this.db.prepare(`SELECT n.*, r.number AS room_number FROM hospitality_notifications n
      JOIN rooms r ON r.id=n.room_id WHERE n.id=? LIMIT 1`).get(notificationId);
    if (!row) return waiting(provider, "Kimlik bildirimi kaydı bulunamadı.", "notification_not_found");
    if (row.status === "sent") return alreadySent(row);
    if (row.status === "submission_unknown") return unknown(row.provider === "jandarma" ? "jandarma" : "egm", "submission_unknown");
    // A request completion crash after rejection must not automatically submit it again.
    if (pendingOnly && row.status === "failed") return { ok: false, state: "failed", provider,
      retryable: Number(row.confirmed_rejection) === 1, code: "request_already_attempted",
      message: "Gönderim isteği işlendi; yeniden deneme ayrı onay gerektirir." };
    if (row.status !== "pending" && !(row.status === "failed" && Number(row.confirmed_rejection) === 1)) {
      return waiting(provider, "Sağlayıcının kesin ret kanıtı olmadan başarısız bildirim yeniden gönderilemez.", "rejection_unverified");
    }
    const identity = parseKbsIdentitySnapshot(String(row.identity_snapshot ?? ""));
    if (!identity) return waiting(provider, "Kimlik bildirimi için kayıt anlık görüntüsü okunamadı.", "identity_snapshot_invalid");
    if (!hasKbsIdentityMinimum(identity)) return waiting(provider, "Kimlik bilgileri eksik. Müşteri kartını tamamladıktan sonra bildirimi yeniden deneyin.", "identity_incomplete");
    const kind = row.kind;
    if (kind !== "arrival" && kind !== "departure" && kind !== "room_change") return waiting(provider, "Kimlik bildirimi işlem türü geçersiz.", "notification_kind_invalid");
    const occurredAt = String(row.occurred_at ?? "").trim();
    if (!occurredAt || !Number.isFinite(Date.parse(occurredAt))) return waiting(provider, "Kimlik bildirimi işlem zamanı geçersiz.", "occurred_at_invalid");
    if (!this.adapters.has(provider)) return waiting(provider, "Seçili KBS sağlayıcısı için gönderim adapterı hazır değil.", "adapter_unavailable");
    const changed = this.db.prepare(`UPDATE hospitality_notifications SET status='submission_unknown',provider=?,provider_reference='',sent_at='',confirmed_rejection=0
      WHERE id=? AND (status='pending' OR (status='failed' AND confirmed_rejection=1))`).run(provider, notificationId).changes;
    if (!changed) return unknown(provider, "submission_unknown");
    return { notificationId, kind, occurredAt, roomNumber: String(row.room_number ?? identity.roomNumber).trim(), identity };
  }

  private persistResult(notificationId: string, result: KbsDeliveryResult): KbsDeliveryAttemptResult {
    const row = this.db.prepare("SELECT status,provider,provider_reference FROM hospitality_notifications WHERE id=?").get(notificationId);
    // Explicit external reconciliation may win while provider I/O is in flight.
    if (row?.status === "sent") return alreadySent(row);
    if (row?.status !== "submission_unknown") throw new Error("kbs_result_fence_conflict");
    if (!result.ok && result.state === "submission_unknown") return result;
    const status = result.ok ? "sent" : result.state === "failed" ? "failed" : "pending";
    const changed = this.db.prepare(`UPDATE hospitality_notifications SET status=?,provider=?,provider_reference=?,sent_at=?,confirmed_rejection=?
      WHERE id=? AND status='submission_unknown'`).run(status, result.provider,
      result.ok ? result.providerReference.trim() : result.state === "failed" ? result.code?.trim() || "failed" : "",
      result.ok ? new Date().toISOString() : "", !result.ok && result.state === "failed" && result.submission === "rejected" ? 1 : 0, notificationId).changes;
    if (!changed) throw new Error("kbs_result_fence_conflict");
    return result;
  }
}

function waiting(provider: KbsProvider, message: string, code: string): Extract<KbsDeliveryResult, { ok: false }> {
  return { ok: false, state: "waiting", provider, retryable: true, code, message };
}
function unknown(provider: KbsProvider, code: string): Extract<KbsDeliveryResult, { ok: false }> {
  return { ok: false, state: "submission_unknown", provider, retryable: false, code,
    message: "KBS gönderimi sürüyor veya sonucu belirsiz. Yeniden gönderim engellendi; resmi KBS kaydını kontrol edip bildirildiyse haricen bildirildi olarak işaretleyin." };
}
function alreadySent(row: Record<string, unknown>): KbsDeliveryAttemptResult {
  return { ok: true, state: "already_sent", provider: row.provider === "jandarma" ? "jandarma" : "egm",
    providerReference: String(row.provider_reference ?? ""), message: "Kimlik bildirimi daha önce gönderilmiş." };
}
