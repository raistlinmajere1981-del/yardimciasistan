import { cacheRequestDocuments } from "./request-document-store";
import type { SyncTransport } from "@yardimci-asistan/sync-core";
import type { DesktopDatabase } from "./database";
import { OnlineOrderIngressService } from "./online-order-ingress-service";
import { DealerWebOrderAccessRejected } from "./dealer-web-order-rejection";
import { desktopLog } from "./desktop-logger";
const MAX_PULL_PAGES = 20;

/** Inbound paging, durable successful-prefix ACK and bounded restore replay.
 * Domain validation/writes remain with request intake and OnlineOrderIngressService. */
export class WebSyncIngress {
  constructor(private readonly options: { database: DesktopDatabase; onlineOrderIngress?: OnlineOrderIngressService },
    private readonly operationId: () => string,
    private readonly logSyncFailure: (stage: string, failure: { status?: number; message?: string; error?: string }, meta?: Record<string, unknown>) => void) {}

  async pullCustomerAccountPages(transport: SyncTransport): Promise<{ count: number; error: string }> {
    if (!transport.pullCustomerAccounts) return { count: 0, error: "" };
    let count = 0;
    try {
      for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
        const result = await transport.pullCustomerAccounts({ afterSeq: this.options.database.getCustomerAccountCursor(), limit: 100 });
        if (!result.ok) { this.logSyncFailure("customer-accounts-pull", result); return { count, error: result.message }; }
        for (const account of result.accounts) { this.options.database.importCustomerAccount(account); count += 1; }
        if (!result.has_more) break;
      }
      return { count, error: "" };
    } catch { return { count, error: "Müşteri hesapları alınamadı. Sonraki eşitlemede yeniden denenecek." }; }
  }

  async pullWebOrderPages(transport: SyncTransport): Promise<{ count: number; error: string }> {
    const ingress = this.options.onlineOrderIngress ?? new OnlineOrderIngressService(this.options.database);
    let cursor = this.options.database.getSyncRuntimeStatus().webOrderCursor;
    let count = 0;
    let errorMessage = "";
    const restore = this.options.database.getRestoreReconciliationStatus();
    const replayThroughSeq = restore?.state === "reconciliation_pending" && !restore.ordersComplete ? restore.ordersThrough : undefined;
    let replayExhausted = false;
    try {
      for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
        const result = await transport.pullWebOrders({ afterSeq: cursor, limit: 100, ...(replayThroughSeq === undefined ? {} : { replayThroughSeq }) });
        if (!result.ok) {
          this.logSyncFailure("web-orders-pull", result, { page, cursor });
          errorMessage = result.message;
          break;
        }
        for (const envelope of result.orders) {
          try {
            ingress.importOrder(envelope, cursor, replayThroughSeq !== undefined);
            count += 1;
          } catch (error) {
            if (!(error instanceof DealerWebOrderAccessRejected) || envelope.kind !== "dealer") throw error;
            this.options.database.recordRejectedDealerWebOrder(envelope.id, envelope.dealerAccessId, envelope.accessRevision);
            desktopLog.warn({ scope: "online-order-ingress", event: "dealer.order.ingress.rejected",
              message: "Geçersiz bayi erişimine ait sipariş taşıma kaydı reddedildi.", operationId: this.operationId(),
              meta: { accessId: envelope.dealerAccessId, webOrderId: envelope.id, category: "access_revoked" } });
          }
          cursor = envelope.syncSeq;
          this.options.database.recordWebOrderCursor(cursor);
        }
        if (!result.has_more) {
          replayExhausted = true;
          break;
        }
      }
    } catch (error) {
      errorMessage = "Web siparişi içe aktarılamadı. Yeniden denenecek.";
      desktopLog.error({
        scope: "online-order-ingress",
        event: "online-order-ingress.import.failed",
        message: errorMessage,
        operationId: this.operationId(),
        meta: { cursor, importedCount: count },
        error
      });
    }
    // Even on failure, acknowledge only the persisted successful prefix. Ack failure
    // leaves its own local cursor pending, so a later cycle retries the acknowledgement.
    const runtime = this.options.database.getSyncRuntimeStatus();
    if (runtime.webOrderCursor > runtime.webOrderAcknowledgedCursor) {
      const ack = await transport.acknowledgeWebOrders({ throughSeq: runtime.webOrderCursor });
      if (!ack.ok) {
        this.logSyncFailure("web-orders-ack", ack, { cursor: runtime.webOrderCursor });
        errorMessage ||= ack.message;
      } else if (ack.acknowledged_cursor !== runtime.webOrderCursor) {
        errorMessage ||= "Web sipariş onay cursor değeri geçersiz.";
        this.logSyncFailure("web-orders-ack", { message: errorMessage, error: "invalid_response" });
      } else {
        this.options.database.recordWebOrderCursor(ack.acknowledged_cursor, true);
      }
    }
    if (count > 0) {
      desktopLog.info({
        scope: "online-order-ingress",
        event: "online-order-ingress.import.completed",
        message: "Web siparişleri canonical siparişlere aktarıldı.",
        operationId: this.operationId(),
        meta: { importedCount: count, cursor }
      });
    }
    if (replayThroughSeq !== undefined && replayExhausted && !errorMessage) this.options.database.finishRestoreReplay("orders");
    return { count, error: errorMessage };
  }

  async pullRequestPages(transport: SyncTransport): Promise<{ count: number; error: string }> {
    let count = 0;
    let cursor = this.options.database.getSyncRuntimeStatus().requestCursor;
    const restore = this.options.database.getRestoreReconciliationStatus();
    const replayThroughSeq = restore?.state === "reconciliation_pending" && !restore.requestsComplete ? restore.requestsThrough : undefined;
    for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
      const result = await transport.pullRequests({ afterSeq: cursor, limit: 100, ...(replayThroughSeq === undefined ? {} : { replayThroughSeq }) });
      if (!result.ok) {
        this.options.database.recordSyncEvent({
          direction: "pull",
          entityType: "request",
          ok: false,
          message: result.message,
          ...(result.status === undefined ? {} : { status: result.status })
        });
        this.logSyncFailure("requests-pull", result, { page, cursor });
        return { count, error: result.message };
      }
      if (typeof result.next_cursor !== "number") {
        const message = "Web modülü geçerli bir talep cursor değeri döndürmedi.";
        this.logSyncFailure("requests-pull", { message, error: "invalid_response" }, { page, cursor });
        return { count, error: message };
      }
      try { await cacheRequestDocuments(this.options.database.userDataPath, result.requests, transport); }
      catch {
        const message = "Başvuru belgeleri alınamadı. Sonraki eşitlemede yeniden denenecek.";
        this.logSyncFailure("request-documents", { message, error: "document_transfer_failed" }, { page, cursor });
        return { count, error: message };
      }
      this.options.database.upsertRequests(result.requests, result.next_cursor);
      count += result.requests.length;
      cursor = result.next_cursor;
      if (!result.has_more) {
        if (replayThroughSeq !== undefined) {
          const error = await this.acknowledgeImportedRequests(transport);
          if (error) return { count, error };
          this.options.database.finishRestoreReplay("requests");
        }
        break;
      }
    }
    this.options.database.recordSyncEvent({
      direction: "pull",
      entityType: "request",
      ok: true,
      recordCount: count
    });
    return { count, error: "" };
  }

  async acknowledgeImportedRequests(transport: SyncTransport): Promise<string> {
    const runtime = this.options.database.getSyncRuntimeStatus();
    if (runtime.requestCursor <= runtime.acknowledgedCursor) {
      return "";
    }
    const result = await transport.acknowledgeRequests({ throughSeq: runtime.requestCursor });
    if (!result.ok) {
      this.logSyncFailure("requests-ack", result, {
        requestCursor: runtime.requestCursor,
        acknowledgedCursor: runtime.acknowledgedCursor
      });
      return result.message;
    }
    this.options.database.acknowledgeRequestCursor(result.acknowledged_cursor);
    return "";
  }
}
