import type { DesktopDatabase, SaveInitialSetupInput } from "./database";
import { getEffectiveAiApiKey } from "./ai-secret-service";
import { decryptShippingSecret } from "./shipping-secret-service";
import { decryptMessagingSecret } from "./business-messaging/secret-service";
import { normalizeAiBaseUrl } from "./database/ai-settings-utils";
import { normalizeArasShippingInput } from "./shipping-configuration-store";
import { normalizeMessagingConfiguration } from "./business-messaging/store";
import { validateSmsConfiguration } from "./marketing/provider-configuration-store";
import { serviceConfigFingerprint, validateServiceActivation, type TestedSettingsService } from "./service-settings-validation";
import { normalizeProfileTransitionInput } from "./profile-service-activation";

/** Settings activation policy only. Domain credential parsing/testing stays in each provider. */
export function validateSetupServiceActivation(db: DesktopDatabase, input: SaveInitialSetupInput): string | null {
  const current = db.getSetupData();
  input = normalizeProfileTransitionInput(input, current);
  let shipping = input.arasShipping ?? current.arasShipping;
  try {
    if (input.arasShipping) shipping = normalizeArasShippingInput(input.arasShipping);
    if (input.whatsappCloud) normalizeMessagingConfiguration(input.whatsappCloud);
    if (input.sms) validateSmsConfiguration(input.sms);
  } catch (error) {
    return error instanceof Error ? error.message : "Servis ayarları geçersiz.";
  }
  const check = (service: TestedSettingsService, label: string, enabled: boolean, config: Record<string, unknown>, configured: boolean) =>
    validateServiceActivation({ label, enabled, configured, fingerprint: serviceConfigFingerprint(config), verifiedFingerprint: db.getServiceSettingsVerification(service) });
  const ai = {
    provider: String(input.aiProvider ?? "").trim(), service: String(input.aiService ?? "").trim(), projectName: String(input.aiProjectName ?? "").trim(),
    baseUrl: normalizeAiBaseUrl(input.aiBaseUrl), model: String(input.aiModel ?? "").trim(),
    imageModel: String(input.aiImageModel ?? "").trim(),
    ...(input.aiService === "cloudflare" ? { visionModel: String(input.aiVisionModel ?? "").trim() } : {}),
    apiKey: input.clearAiApiKey ? "" : String(input.aiApiKey ?? "").trim() || getEffectiveAiApiKey(db, input.aiService), timeoutSeconds: input.aiTimeoutSeconds
  };
  let error = check("ai", "AI Yardımcı", input.aiEnabled, ai, Boolean(ai.baseUrl && ai.model && ai.apiKey));
  if (error) return error;
  const aras = { environment: shipping.environment, customerCode: shipping.customerCode.trim(), username: shipping.username.trim(),
    password: input.arasShipping?.clearPassword ? "" : input.arasShipping?.password?.trim() || decryptShippingSecret(db.getEncryptedShippingPassword()) };
  const delivery = input.onlineSalesDelivery ?? current.onlineSalesDelivery;
  const shippingActive = (input.onlineSalesDeliveryEnabled ?? current.onlineSalesDeliveryEnabled ?? true) && delivery?.shippingEnabled === true;
  error = check("aras", "Kargo ile gönderim / Aras Kargo", shippingActive, aras, Boolean(aras.customerCode && aras.username && aras.password));
  if (error) return error;
  const cloud = input.whatsappCloud ?? current.whatsappCloud;
  const whatsapp = { wabaId: cloud.wabaId, phoneNumberId: cloud.phoneNumberId,
    accessToken: input.whatsappCloud?.clearAccessToken ? "" : input.whatsappCloud?.accessToken || decryptMessagingSecret(db.getEncryptedMessagingToken()) };
  error = check("whatsapp_cloud", "WhatsApp Business", cloud.enabled, whatsapp, Boolean(whatsapp.wabaId && whatsapp.phoneNumberId && whatsapp.accessToken));
  if (error) return error;
  const sms = input.sms ?? current.sms, smsStored = db.getStoredMarketingProvider("iletimerkezi");
  const smsConfig = { senderId: sms.senderId, iysList: sms.iysList,
    apiKey: input.sms?.clearApiKey ? "" : input.sms?.apiKey || decryptMessagingSecret(String(smsStored?.secret_one_encrypted ?? "")),
    apiHash: input.sms?.clearApiHash ? "" : input.sms?.apiHash || decryptMessagingSecret(String(smsStored?.secret_two_encrypted ?? "")) };
  error = check("sms", "SMS / İleti Merkezi", sms.enabled, smsConfig, Boolean(smsConfig.senderId && smsConfig.apiKey && smsConfig.apiHash));
  if (error) return error;
  const instagramEnabled = input.instagram?.enabled ?? current.instagram.enabled;
  const instagramStored = db.getStoredMarketingProvider("instagram_api");
  const instagramConfig = { accountId: String(instagramStored?.account_id ?? ""),
    accessToken: decryptMessagingSecret(String(instagramStored?.secret_one_encrypted ?? "")) };
  error = check("instagram", "Instagram", instagramEnabled, instagramConfig,
    Boolean(instagramConfig.accountId && instagramConfig.accessToken &&
      Number.isFinite(Date.parse(String(instagramStored?.secret_two_encrypted ?? ""))) &&
      Date.parse(String(instagramStored?.secret_two_encrypted ?? "")) > Date.now()));
  if (error) return error;
  // Initial setup and activation require matching main-process test evidence.
  // Revalidate activation or effective transport changes, never unrelated local edits.
  const web = { baseUrl: input.webModuleUrl.trim().replace(/\/+$/, ""), syncSecret: input.syncSecret.trim() };
  const transportChanged = web.baseUrl !== current.webModuleUrl.trim().replace(/\/+$/, "")
    || web.syncSecret !== current.syncSecret.trim();
  if ((input.autoSyncEnabled ?? current.autoSyncEnabled)
    && (current.setupRequired || !current.autoSyncEnabled || transportChanged)) {
    error = check("web", "Web Modülü", true, web, Boolean(web.baseUrl && web.syncSecret.length >= 12));
  }
  return error;
}
