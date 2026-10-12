import { reconcile, type DispatchResult } from "../messaging-campaigns/dispatch-contract";
import { MessagingCampaignError } from "../messaging-campaigns/validation";
import { createHash } from "node:crypto";
import { normalizeInternationalPhone } from "@yardimci-asistan/whatsapp-bridge";
import { BUSINESS_CAPABILITIES, type BusinessTemplateIntentInput, type BusinessMessageTemplate, type WhatsAppCloudConfigurationInput, type BusinessMessagingConnectionResult } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "../database";
import { assertPersistedBusinessCapability } from "../business-capability-runtime";
import { desktopLog } from "../desktop-logger";
import { decryptMessagingSecret } from "./secret-service";
import { normalizeMessagingConfiguration } from "./store";
import { BusinessMessagingError, normalizeBusinessMessagingError } from "./provider-error";
import { WhatsAppCloudProviderAdapter } from "./whatsapp-cloud-provider";
export function messagingAccountKey(wabaId: string, phoneNumberId: string) { return createHash("sha256").update(`${wabaId}:${phoneNumberId}`).digest("hex"); }
function intentHash(customerId: string, recipient: string, name: string, language: string, parameters: string[][]) {
  return createHash("sha256").update(JSON.stringify([customerId, recipient, name, language, parameters])).digest("hex");
}
export class BusinessMessagingService {
  private readonly pendingSends = new Set<Promise<unknown>>();
  constructor(private readonly getDatabase: () => DesktopDatabase, private readonly httpOptions: { assertCanSubmit: () => void; fetchImpl?: typeof fetch; timeoutMs?: number }) {}
  async drain() { await Promise.allSettled(this.pendingSends); }
  getConfiguration() {
    const db = this.getDatabase(), config = db.getMessagingConfiguration();
    return { ...config, configured: config.configured && Boolean(decryptMessagingSecret(db.getEncryptedMessagingToken())) };
  }
  private credentials(input?: WhatsAppCloudConfigurationInput) {
    const db = this.getDatabase();
    const config = input ? normalizeMessagingConfiguration(input) : db.getMessagingConfiguration();
    const accessToken = input?.accessToken || (input?.clearAccessToken ? "" : decryptMessagingSecret(db.getEncryptedMessagingToken()));
    if (!config.enabled || !config.wabaId || !config.phoneNumberId || !accessToken) throw new BusinessMessagingError("unconfigured", "WhatsApp Business yapılandırılmamış. Servisler ayarlarını tamamlayın.");
    return { wabaId: config.wabaId, phoneNumberId: config.phoneNumberId, accessToken };
  }
  private log(event: string, ok: boolean, operationId?: string, code?: string, error?: BusinessMessagingError) {
    desktopLog[ok ? "info" : event === "send.failed" ? "error" : "warn"]({ scope: "business-messaging", event: `business-messaging.${event}`,
      message: "WhatsApp Business işlemi.", ...(operationId !== undefined ? { operationId } : {}), ...(error ? { error } : {}), meta: { providerId: "whatsapp_cloud", ok, ...(code ? { code } : {}) } });
  }
  async testConnection(input?: WhatsAppCloudConfigurationInput): Promise<BusinessMessagingConnectionResult> {
    let result: BusinessMessagingConnectionResult;
    try { const credentials = this.credentials(input);
      const phone = await new WhatsAppCloudProviderAdapter(credentials, this.httpOptions).testConnection();
      this.getDatabase().recordServiceSettingsVerification("whatsapp_cloud", credentials);
      result = { ok: true, providerId: "whatsapp_cloud", ...phone, message: "WhatsApp Business hesabı ve telefon bağlantısı doğrulandı.", testedAt: new Date().toISOString() };
    } catch (error) { result = { ok: false, providerId: "whatsapp_cloud", message: normalizeBusinessMessagingError(error).message, testedAt: new Date().toISOString() }; }
    this.log("connection.test", result.ok); return result;
  }
  async listTemplates() {
    try { const result = await new WhatsAppCloudProviderAdapter(this.credentials(), this.httpOptions).listTemplates(); this.log("template.list", true); return result; }
    catch (caught) { const error = normalizeBusinessMessagingError(caught); this.log("template.list", false, undefined, error.code, error); throw error; }
  }
  private assertCustomers() { assertPersistedBusinessCapability(this.getDatabase().databasePath, BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil."); }
  private validateParameters(template: BusinessMessageTemplate, parameters: string[][]) {
    if (!template.supported || !Array.isArray(parameters) || parameters.length !== template.components.length || parameters.some((values, index) => !Array.isArray(values) || values.length !== template.components[index]?.parameters.length || values.some((value) => typeof value !== "string" || !value.trim() || value.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)))) throw new BusinessMessagingError("invalid_parameters", "Şablon parametrelerini tamamlayın.");
  }
  async prepare(input: BusinessTemplateIntentInput) {
    this.assertCustomers();
    if (!input || typeof input.customerId !== "string" || typeof input.templateName !== "string" || typeof input.templateLanguage !== "string") throw new BusinessMessagingError("invalid_intent");
    const db = this.getDatabase(), customer = db.getMessagingCustomer(input.customerId);
    if (!customer) throw new BusinessMessagingError("missing_customer", "Müşteri bulunamadı.");
    const recipient = normalizeInternationalPhone(customer.phone);
    if (!recipient.ok) throw new BusinessMessagingError("invalid_recipient", "Müşterinin telefon numarası geçersiz.");
    const credentials = this.credentials();
    const template = (await this.listTemplates()).find((item) => item.name === input.templateName && item.language === input.templateLanguage);
    if (!template) throw new BusinessMessagingError("missing_template", "Onaylı şablon artık kullanılamıyor.");
    this.validateParameters(template, input.parameters);
    return db.prepareBusinessMessage({ customerId: customer.id, recipient: recipient.whatsapp, templateName: template.name, templateLanguage: template.language,
      accountKey: messagingAccountKey(credentials.wabaId, credentials.phoneNumberId), intentHash: intentHash(customer.id, recipient.whatsapp, template.name, template.language, input.parameters) });
  }
  getMessage(id: string) { this.assertCustomers(); const message = this.getDatabase().getBusinessMessage(id); if (!message) throw new BusinessMessagingError("missing_message"); return message; }
  send(id: string, parameters: string[][]) {
    const pending = this.sendOnce(id, parameters);
    this.pendingSends.add(pending);
    void pending.then(() => this.pendingSends.delete(pending), () => this.pendingSends.delete(pending));
    return pending;
  }
  private async sendOnce(id: string, parameters: string[][]) {
    this.httpOptions.assertCanSubmit();
    const message = this.getMessage(id), db = this.getDatabase();
    if (message.campaignId) throw new BusinessMessagingError("campaign_dispatch_only", "Kampanya mesajları kontrollü gönderim üzerinden işlenir.");
    const binding = db.getMessageBinding(id);
    if (!binding) throw new BusinessMessagingError("missing_message");
    // Retry is an exact intent replay. No new POST, even after process crash or lost response.
    if (binding.intent_hash !== intentHash(message.customerId!, message.recipient, message.templateName, message.templateLanguage, parameters)) throw new BusinessMessagingError("intent_conflict", "Aynı mesajın parametreleri değiştirilemez.");
    if (Number(binding.submitted) === 1) return message;
    const credentials = this.credentials();
    if (binding.account_key !== messagingAccountKey(credentials.wabaId, credentials.phoneNumberId)) throw new BusinessMessagingError("account_changed", "Mesajın sağlayıcı hesabı değişmiş.");
    const adapter = new WhatsAppCloudProviderAdapter(credentials, this.httpOptions);
    const template = (await adapter.listTemplates()).find((item) => item.name === message.templateName && item.language === message.templateLanguage);
    if (!template) throw new BusinessMessagingError("missing_template");
    this.validateParameters(template, parameters);
    // Catalog HTTP yields: re-read authority and canonical state before claiming or posting.
    const assertSubmissionAllowed = () => {
      this.httpOptions.assertCanSubmit();
      if (this.getDatabase() !== db || db.getBusinessMessage(id)?.businessId !== message.businessId) throw new BusinessMessagingError("business_changed", "Mesajın işletmesi değişmiş. Yeni mesaj hazırlayın.");
      this.assertCustomers();
      const current = this.credentials();
      if (messagingAccountKey(current.wabaId, current.phoneNumberId) !== binding.account_key || current.accessToken !== credentials.accessToken) throw new BusinessMessagingError("account_changed", "Mesajın sağlayıcı hesabı değişmiş.");
      const customer = db.getMessagingCustomer(message.customerId!);
      const phone = customer ? normalizeInternationalPhone(customer.phone) : null;
      if (!phone?.ok || phone.whatsapp !== message.recipient) throw new BusinessMessagingError("recipient_changed", "Müşteri telefonu değişmiş. Yeni mesaj hazırlayın.");
    };
    assertSubmissionAllowed();
    if (!db.claimBusinessMessage(id)) return this.getMessage(id);
    try {
      // No await between this final check and the adapter starting its provider POST.
      assertSubmissionAllowed();
      this.log("send.started", true, id);
      const result = await adapter.sendTemplateMessage({ message, template, parameters });
      // Once POST starts, persist its receipt even if authority is withdrawn meanwhile.
      const saved = db.applyBusinessMessageStatus({ ...result, messageId: id, status: "accepted", timestamp: new Date().toISOString(), accountKey: String(binding.account_key) });
      if (!saved || saved.id !== id) throw new BusinessMessagingError("duplicate_provider_response", "Sağlayıcı mesaj kimliği başka bir mesaja bağlı.");
      this.log("send.succeeded", true, id); return saved;
    } catch (caught) {
      const error = normalizeBusinessMessagingError(caught);
      this.log("send.failed", false, id, error.code, error);
      return db.failBusinessMessage(id, error.code, error.message);
    }
  }
  /** D-037 transport boundary: no campaign provider request can bypass its outbox lease and submission fence. */
  async dispatchCampaignItem(id: string, token: string, intervalMs: number, allowed: () => boolean, now: () => Date): Promise<DispatchResult> {
    const db = this.getDatabase(), claim = db.getCampaignDispatchClaim(id, token);
    if (!claim) return { kind: "deferred", nextAttemptAt: now().toISOString() };
    if (claim.submitted) return reconcile(claim);
    if (!allowed() || claim.campaign.status !== "running") return { kind: "deferred", nextAttemptAt: now().toISOString() };
    let submitting = false;
    try {
      if (claim.item.channel !== "whatsapp" || claim.item.providerId !== "whatsapp_cloud") return { kind: "failed", category: "unavailable_provider" };
      const credentials = this.credentials(), accountKey = messagingAccountKey(credentials.wabaId, credentials.phoneNumberId);
      const adapter = new WhatsAppCloudProviderAdapter(credentials, this.httpOptions);
      const template = (await adapter.listTemplates()).find((value) => value.name === claim.campaign.templateName && value.language === claim.campaign.templateLanguage);
      if (!allowed()) return { kind: "deferred", nextAttemptAt: now().toISOString() };
      const current = this.credentials();
      if (messagingAccountKey(current.wabaId, current.phoneNumberId) !== accountKey || current.accessToken !== credentials.accessToken) return { kind: "failed", category: "account_changed" };
      if (!template) return { kind: "failed", category: "missing_template" };
      const submission = db.beginCampaignSubmission(id, token, template, accountKey, now().toISOString(), intervalMs);
      if (submission.kind !== "ready") return submission;
      submitting = true;
      const result = await adapter.sendTemplateMessage({ message: submission.message, parameters: submission.parameters, template });
      // Persist the authoritative receipt first. Recovery can then reconcile the outbox without another POST.
      const saved = db.applyBusinessMessageStatus({ ...result, messageId: submission.message.id, status: "accepted", timestamp: now().toISOString(), accountKey });
      if (!saved || saved.id !== submission.message.id) return { kind: "retry", category: "submission_uncertain" };
      return { kind: "accepted", businessMessageId: saved.id };
    } catch (caught) {
      if (caught instanceof MessagingCampaignError) return { kind: "failed", category: caught.code };
      const error = normalizeBusinessMessagingError(caught);
      if (submitting) {
        if (!error.disposition?.rejected) return { kind: "retry", category: "submission_uncertain" };
        if (error.disposition.retry !== "none") {
          if (!db.releaseRejectedCampaignMessage(id, token)) return { kind: "retry", category: "submission_uncertain" };
          return { kind: "retry", category: error.disposition.retry,
            ...(error.disposition.retryAfterMs !== undefined ? { retryAfterMs: error.disposition.retryAfterMs } : {}) };
        }
        return { kind: "failed", category: error.code };
      }
      // Metadata I/O is read-only; its transient errors can safely be retried.
      if (["network", "timeout"].includes(error.code) || (error.disposition && error.disposition.retry !== "none")) return {
        kind: "retry", category: error.disposition?.retry === "rate_limit" ? "rate_limit" : "transient",
        ...(error.disposition?.retryAfterMs !== undefined ? { retryAfterMs: error.disposition.retryAfterMs } : {})
      };
      return { kind: "failed", category: error.code };
    }
  }

}
