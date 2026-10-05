import type { DatabaseSync } from "node:sqlite";
import {
  hasKbsIdentityMinimum, parseKbsIdentitySnapshot,
  type KbsDeliveryInput, type KbsDeliveryResult, type KbsProviderAdapter
} from "./kbs-provider-adapter.js";
import type { KbsProvider } from "./kbs-settings.js";
import { getKbsOverview } from "./database/hospitality-notification-store.js";
import { desktopLog } from "./desktop-logger.js";

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

  async deliver(notificationIdInput: string, provider: KbsProvider): Promise<KbsDeliveryAttemptResult> {
    const notificationId = notificationIdInput.trim();
    if (!notificationId) return waiting(provider, "Kimlik bildirimi seçilmedi.", "notification_required");
    // A caller-owned transaction must not carry a not-yet-durable fence across network I/O.
    if (this.db.isTransaction) return waiting(provider, "KBS gönderimi açık bir yerel işlem içinde başlatılamaz.", "local_transaction_active");
    let prepared: KbsDeliveryInput | KbsDeliveryAttemptResult;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      prepared = this.prepareSubmission(notificationId, provider);
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

  private prepareSubmission(notificationId: string, provider: KbsProvider): KbsDeliveryInput | KbsDeliveryAttemptResult {
    const overview = getKbsOverview(this.db);
    if (!overview.enabled) return waiting(provider, "Kimlik Bildirim Sistemi etkin değil.", "kbs_disabled");
    if (!overview.configured) return waiting(provider, "KBS bağlantı ayarları tamamlanmadan bildirim gönderilemez.", "kbs_not_configured");
    if (overview.provider !== provider) return waiting(provider, "Seçili KBS sağlayıcısı değişmiş.", "provider_changed");
    const row = this.db.prepare(`SELECT n.*, r.number AS room_number FROM hospitality_notifications n
      JOIN rooms r ON r.id=n.room_id WHERE n.id=? LIMIT 1`).get(notificationId);
    if (!row) return waiting(provider, "Kimlik bildirimi kaydı bulunamadı.", "notification_not_found");
    if (row.status === "sent") return alreadySent(row);
    if (row.status === "submission_unknown") return unknown(row.provider === "jandarma" ? "jandarma" : "egm", "submission_unknown");
    const identity = parseKbsIdentitySnapshot(String(row.identity_snapshot ?? ""));
    if (!identity) return waiting(provider, "Kimlik bildirimi için kayıt anlık görüntüsü okunamadı.", "identity_snapshot_invalid");
    if (!hasKbsIdentityMinimum(identity)) return waiting(provider, "Kimlik bilgileri eksik. Müşteri kartını tamamladıktan sonra bildirimi yeniden deneyin.", "identity_incomplete");
    const kind = row.kind;
    if (kind !== "arrival" && kind !== "departure" && kind !== "room_change") return waiting(provider, "Kimlik bildirimi işlem türü geçersiz.", "notification_kind_invalid");
    const occurredAt = String(row.occurred_at ?? "").trim();
    if (!occurredAt || !Number.isFinite(Date.parse(occurredAt))) return waiting(provider, "Kimlik bildirimi işlem zamanı geçersiz.", "occurred_at_invalid");
    if (!this.adapters.has(provider)) return waiting(provider, "Seçili KBS sağlayıcısı için gönderim adapterı hazır değil.", "adapter_unavailable");
    const changed = this.db.prepare(`UPDATE hospitality_notifications SET status='submission_unknown',provider=?,provider_reference='',sent_at=''
      WHERE id=? AND status IN ('pending','failed')`).run(provider, notificationId).changes;
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
    const changed = this.db.prepare(`UPDATE hospitality_notifications SET status=?,provider=?,provider_reference=?,sent_at=?
      WHERE id=? AND status='submission_unknown'`).run(status, result.provider,
      result.ok ? result.providerReference.trim() : result.state === "failed" ? result.code?.trim() || "failed" : "",
      result.ok ? new Date().toISOString() : "", notificationId).changes;
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
