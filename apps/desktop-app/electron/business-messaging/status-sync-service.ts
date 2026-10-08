import type { DesktopDatabase } from "../database";
import { desktopLog } from "../desktop-logger";
import { messagingAccountKey } from "./service";
import type { MessagingStatusUpdate } from "./store";
/** Separate inbox. Local durable status first, then exact ACK; replay is safe after lost ACK. */
export class BusinessMessagingStatusSyncService {
  constructor(private readonly getDatabase: () => DesktopDatabase, private readonly onChanged: () => void,
    private readonly fetchImpl: typeof fetch = fetch) {}
  async pull(config: { baseUrl: string; syncSecret: string }): Promise<string> {
    const db = this.getDatabase(), account = db.getMessagingConfiguration();
    if (!account.wabaId || !account.phoneNumberId) return "";
    const accountKey = messagingAccountKey(account.wabaId, account.phoneNumberId);
    let url: URL;
    try { url = new URL(`${config.baseUrl.replace(/\/+$/, "")}/api/business-messaging-status.php`);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return "WhatsApp Business durum adresi geçersiz.";
      url.searchParams.set("account_key", accountKey);
    } catch { return "WhatsApp Business durum adresi geçersiz."; }
    try {
      for (let page = 0; page < 20; page++) {
        const data = await this.request(url, config.syncSecret);
        if (!Array.isArray(data.statuses) || data.statuses.length > 100) throw new Error("invalid_statuses");
        const ack: number[] = [];
        for (const value of data.statuses) {
          if (!value || typeof value !== 'object') throw new Error("invalid_status");
          const row = value as MessagingStatusUpdate & { seq: number };
          if (!Number.isSafeInteger(row.seq) || row.seq <= 0 || row.accountKey !== accountKey || typeof row.providerMessageId !== 'string'
            || typeof row.timestamp !== 'string' || (row.messageId !== undefined && (typeof row.messageId !== 'string' || row.messageId.length > 100))) throw new Error("invalid_status");
          const result = db.applyBusinessMessageStatus(row);
          desktopLog.info({ scope: "business-messaging", event: "business-messaging.webhook.status", message: "WhatsApp Business durumu işlendi.",
            ...(result?.id !== undefined ? { operationId: result.id } : {}), meta: { providerId: "whatsapp_cloud", matched: Boolean(result), status: row.status } });
          ack.push(row.seq);
        }
        if (ack.length) { this.onChanged(); await this.request(url, config.syncSecret, { ack }); }
        if (ack.length < 100) return "";
      }
      return "";
    } catch {
      desktopLog.warn({ scope: "business-messaging", event: "business-messaging.webhook.status", message: "WhatsApp Business durum eşitlemesi tamamlanamadı.", meta: { providerId: "whatsapp_cloud", code: "status_sync_failed" } });
      return "WhatsApp Business durum eşitlemesi tamamlanamadı.";
    }
  }
  private async request(url: URL, secret: string, body?: { ack: number[] }): Promise<Record<string, unknown>> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await this.fetchImpl(url, { method: body ? "POST" : "GET", redirect: "error", signal: controller.signal,
        headers: { "X-YA-Sync-Secret": secret, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!response.ok || !response.body) throw new Error("status_sync_failed");
      const reader = response.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
      try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength;
        if (size > 262144) { await reader.cancel(); throw new Error("response_limit"); } chunks.push(part.value); } } finally { reader.releaseLock(); }
      const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!data || typeof data !== "object" || !("ok" in data) || data.ok !== true) throw new Error("invalid_response");
      return data as Record<string, unknown>;
    } finally { clearTimeout(timer); }
  }
}
