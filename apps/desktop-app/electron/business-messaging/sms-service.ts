import { createHash } from "node:crypto";
import type { SmsConfigurationInput, MarketingProviderConnectionResult } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "../database";
import { decryptMessagingSecret } from "./secret-service";
import { IletiMerkeziSmsProviderAdapter, type IletiMerkeziCredentials } from "./iletimerkezi-provider";
import { MarketingProviderError } from "../marketing/provider-http";
import { validateSmsConfiguration } from "../marketing/provider-configuration-store";
import { MessagingCampaignError } from "../messaging-campaigns/validation";
import { reconcile, type DispatchResult } from "../messaging-campaigns/dispatch-contract";
import { desktopLog } from "../desktop-logger";
export const smsAccountKey = (credentials: IletiMerkeziCredentials) => createHash("sha256").update(JSON.stringify([credentials.apiKey, credentials.apiHash, credentials.senderId, credentials.iysList])).digest("hex");
export class SmsMessagingService {
  constructor(private readonly database: () => DesktopDatabase, private readonly options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {}
  getConfiguration() { return this.database().getSmsConfiguration(); }
  private credentials(input?: SmsConfigurationInput): IletiMerkeziCredentials {
    if (input) validateSmsConfiguration(input);
    const stored = this.database().getStoredMarketingProvider("iletimerkezi"), config = input ?? this.getConfiguration();
    if (!config.enabled) throw new MarketingProviderError("unconfigured");
    return { senderId: config.senderId, iysList: config.iysList,
      apiKey: input?.clearApiKey ? "" : input?.apiKey || decryptMessagingSecret(String(stored?.secret_one_encrypted ?? "")),
      apiHash: input?.clearApiHash ? "" : input?.apiHash || decryptMessagingSecret(String(stored?.secret_two_encrypted ?? "")) };
  }
  async listSenderIds(input?: SmsConfigurationInput) { return new IletiMerkeziSmsProviderAdapter(this.credentials(input), this.options).listSenderIds(); }
  async testConnection(input?: SmsConfigurationInput): Promise<MarketingProviderConnectionResult> {
    let result: MarketingProviderConnectionResult;
    try { const value = await new IletiMerkeziSmsProviderAdapter(this.credentials(input), this.options).testConnection(); result = { ok: true, ...value, testedAt: new Date().toISOString(), message: "İleti Merkezi bağlantısı ve onaylı başlık doğrulandı." }; }
    catch (error) { result = { ok: false, testedAt: new Date().toISOString(), message: error instanceof MarketingProviderError ? error.message : "SMS ayarlarını kontrol edin." }; }
    desktopLog.info({ scope: "marketing", event: "marketing.channel.connection_test", message: "SMS bağlantısı denendi.", meta: { channel: "sms", connected: result.ok } }); return result;
  }
  async dispatchCampaignItem(id: string, token: string, intervalMs: number, allowed: () => boolean, now: () => Date): Promise<DispatchResult> {
    const db = this.database(), claim = db.getCampaignDispatchClaim(id, token);
    if (!claim) return { kind: "deferred", nextAttemptAt: now().toISOString() };
    if (claim.submitted) return reconcile(claim);
    if (!allowed() || claim.campaign.status !== "running") return { kind: "deferred", nextAttemptAt: now().toISOString() };
    let submitting = false;
    try {
      if (claim.item.channel !== "sms" || claim.item.providerId !== "iletimerkezi") return { kind: "failed", category: "unavailable_provider" };
      const credentials = this.credentials(), accountKey = smsAccountKey(credentials), adapter = new IletiMerkeziSmsProviderAdapter(credentials, this.options);
      // Synchronous config/contact/consent re-read + D3 fence. Recipient goes to provider only after this commit.
      const submission = db.beginCampaignSubmission(id, token, null, accountKey, now().toISOString(), intervalMs);
      if (submission.kind !== "ready") return submission;
      submitting = true;
      desktopLog.info({ scope: "sms", event: "sms.provider.send.started", message: "SMS gönderim niyeti başladı.", operationId: id });
      const result = await adapter.sendMessage({ recipient: submission.message.recipient, text: claim.campaign.text! });
      const saved = db.applyBusinessMessageStatus({ ...result, providerId: "iletimerkezi", messageId: submission.message.id, status: "accepted", timestamp: now().toISOString(), accountKey });
      if (!saved || saved.id !== submission.message.id) return { kind: "retry", category: "submission_uncertain" };
      desktopLog.info({ scope: "sms", event: "sms.provider.send.succeeded", message: "SMS sağlayıcı tarafından kabul edildi.", operationId: id });
      return { kind: "accepted", businessMessageId: saved.id };
    } catch (error) {
      const category = error instanceof MarketingProviderError || error instanceof MessagingCampaignError ? error.code : "operation_failed";
      desktopLog.error({ scope: "sms", event: "sms.provider.send.failed", message: "SMS gönderimi tamamlanamadı.", operationId: id, meta: { category } });
      if (submitting && (!(error instanceof MarketingProviderError) || !error.rejected)) return { kind: "retry", category: "submission_uncertain" };
      if (error instanceof MarketingProviderError && error.retry !== "none") {
        if (submitting && !db.releaseRejectedCampaignMessage(id, token)) return { kind: "retry", category: "submission_uncertain" };
        return { kind: "retry", category: error.retry };
      }
      return { kind: "failed", category };
    }
  }
}
