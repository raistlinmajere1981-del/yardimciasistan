import type { DatabaseSync } from "node:sqlite";
import {
  hasKbsIdentityMinimum,
  parseKbsIdentitySnapshot,
  type KbsDeliveryInput,
  type KbsDeliveryResult,
  type KbsProviderAdapter
} from "./kbs-provider-adapter.js";
import type { KbsProvider } from "./kbs-settings.js";

interface StoredNotificationRow {
  id?: unknown;
  kind?: unknown;
  occurred_at?: unknown;
  identity_snapshot?: unknown;
  status?: unknown;
  provider?: unknown;
  provider_reference?: unknown;
  room_number?: unknown;
}

export type KbsDeliveryAttemptResult =
  | KbsDeliveryResult
  | {
      ok: true;
      state: "already_sent";
      message: string;
      provider: KbsProvider;
      providerReference: string;
    };

export class KbsDeliveryService {
  private readonly adapters = new Map<KbsProvider, KbsProviderAdapter>();

  constructor(
    private readonly db: DatabaseSync,
    adapters: readonly KbsProviderAdapter[]
  ) {
    for (const adapter of adapters) {
      this.adapters.set(adapter.provider, adapter);
    }
  }

  async deliver(notificationIdInput: string, provider: KbsProvider): Promise<KbsDeliveryAttemptResult> {
    const notificationId = notificationIdInput.trim();
    if (!notificationId) {
      return waiting(provider, "Kimlik bildirimi seçilmedi.", "notification_required");
    }

    const row = this.db.prepare(`
      SELECT
        n.id,
        n.kind,
        n.occurred_at,
        n.identity_snapshot,
        n.status,
        n.provider,
        n.provider_reference,
        r.number AS room_number
      FROM hospitality_notifications n
      JOIN rooms r ON r.id = n.room_id
      WHERE n.id = ?
      LIMIT 1
    `).get(notificationId) as StoredNotificationRow | undefined;

    if (!row) {
      return waiting(provider, "Kimlik bildirimi kaydı bulunamadı.", "notification_not_found");
    }

    if (row.status === "sent") {
      const storedProvider: KbsProvider = row.provider === "jandarma" ? "jandarma" : "egm";
      return {
        ok: true,
        state: "already_sent",
        provider: storedProvider,
        providerReference: String(row.provider_reference ?? ""),
        message: "Kimlik bildirimi daha önce gönderilmiş."
      };
    }

    const identity = parseKbsIdentitySnapshot(String(row.identity_snapshot ?? ""));
    if (!identity) {
      return waiting(provider, "Kimlik bildirimi için kayıt anlık görüntüsü okunamadı.", "identity_snapshot_invalid");
    }
    if (!hasKbsIdentityMinimum(identity)) {
      return waiting(
        provider,
        "Kimlik bilgileri eksik. Müşteri kartını tamamladıktan sonra bildirimi yeniden deneyin.",
        "identity_incomplete"
      );
    }

    const kind = normalizeKind(row.kind);
    if (!kind) {
      return waiting(provider, "Kimlik bildirimi işlem türü geçersiz.", "notification_kind_invalid");
    }

    const occurredAt = String(row.occurred_at ?? "").trim();
    if (!occurredAt || !Number.isFinite(Date.parse(occurredAt))) {
      return waiting(provider, "Kimlik bildirimi işlem zamanı geçersiz.", "occurred_at_invalid");
    }

    const adapter = this.adapters.get(provider);
    if (!adapter) {
      return waiting(provider, "Seçili KBS sağlayıcısı için gönderim adapterı hazır değil.", "adapter_unavailable");
    }

    const input: KbsDeliveryInput = {
      notificationId,
      kind,
      occurredAt,
      roomNumber: String(row.room_number ?? identity.roomNumber ?? "").trim(),
      identity
    };

    let result: KbsDeliveryResult;
    try {
      result = await adapter.send(input);
    } catch {
      result = {
        ok: false,
        state: "failed",
        provider,
        retryable: true,
        code: "adapter_exception",
        message: "KBS sağlayıcısı beklenmeyen bir hata verdi. Yerel konaklama kaydı korunuyor."
      };
    }

    this.persistResult(notificationId, result);
    return result;
  }

  private persistResult(notificationId: string, result: KbsDeliveryResult) {
    if (result.ok) {
      this.db.prepare(`
        UPDATE hospitality_notifications
        SET status = 'sent',
            provider = ?,
            provider_reference = ?,
            sent_at = ?
        WHERE id = ?
          AND status != 'sent'
      `).run(
        result.provider,
        result.providerReference.trim(),
        new Date().toISOString(),
        notificationId
      );
      return;
    }

    if (result.state === "failed") {
      this.db.prepare(`
        UPDATE hospitality_notifications
        SET status = 'failed',
            provider = ?,
            provider_reference = ?,
            sent_at = ''
        WHERE id = ?
          AND status != 'sent'
      `).run(
        result.provider,
        result.code?.trim() || "failed",
        notificationId
      );
      return;
    }

    // Missing identity, expired web sessions and other recoverable preconditions
    // remain pending. They are attention items, not delivery failures.
    this.db.prepare(`
      UPDATE hospitality_notifications
      SET status = 'pending',
          provider = ?,
          provider_reference = '',
          sent_at = ''
      WHERE id = ?
        AND status != 'sent'
    `).run(result.provider, notificationId);
  }
}

function waiting(
  provider: KbsProvider,
  message: string,
  code: string
): Extract<KbsDeliveryResult, { ok: false }> {
  return {
    ok: false,
    state: "waiting",
    provider,
    retryable: true,
    code,
    message
  };
}

function normalizeKind(value: unknown): KbsDeliveryInput["kind"] | null {
  if (value === "arrival" || value === "departure" || value === "room_change") return value;
  return null;
}
