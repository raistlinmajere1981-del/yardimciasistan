import { smsConfiguration, instagramConfiguration, validateSmsConfiguration, saveMarketingProviderConfigurations, storedMarketingProvider } from "./marketing/provider-configuration-store";
import type { MarketingProviderSecretWrites } from "./marketing/provider-secrets";
import { getMessagingConfiguration, getStoredMessagingConfiguration, normalizeMessagingConfiguration, saveMessagingConfiguration } from "./business-messaging/store";
import type { MessagingSecretWrite } from "./business-messaging/secret-service";
import { getArasShippingConfiguration, getStoredArasShippingConfiguration, normalizeArasShippingInput, saveArasShippingConfigurationInTransaction, type ShippingSecretWrite } from "./shipping-configuration-store";
import { validateServiceActivation, serviceConfigFingerprint, readServiceVerification } from "./service-settings-validation";
import { decryptMessagingSecret } from "./business-messaging/secret-service";
import { setInstagramOAuthEnabled } from "./marketing/instagram-oauth-store";
import { normalizeProfileTransitionInput } from "./profile-service-activation";
import type { DatabaseSync } from "node:sqlite";
import { isCloudflareAiBaseUrl, supportsVisionModel, isSupportedSttBaseUrl, supportsImageGenerationModel, supportsSttModel } from "@yardimci-asistan/shared";
import {
  BUSINESS_CAPABILITIES,
  createId,
  normalizeOnlineSalesDeliverySettings,
  isArasShippingConfigurationReady,
  getBusinessProfile,
  isBusinessServiceAvailable,
  normalizeBirthdaySettings,
  normalizeBusinessType,
  validateBirthdaySettings,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import type {
  AiApiKeyWrite,
  DesktopAiModelOption,
  DesktopAiService,
  DesktopSetupData,
  SaveInitialSetupInput
} from "./database-types.js";
import {
  getAiServiceProfiles as getStoredAiServiceProfiles,
  upsertAiServiceProfileInTransaction
} from "./database/ai-profile-store.js";
import {
  AI_SERVICE_DEFAULT_BASE_URLS,
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_TIMEOUT_SECONDS,
  GOOGLE_AI_STUDIO_BASE_URL,
  getAiServiceDisplayName,
  normalizeAiBaseUrl,
  normalizeAiModelOptions,
  normalizeAiService,
  normalizeAiTimeout,
  normalizeStoredAiService,
  normalizeStoredAiTimeout,
  normalizeStoredTimestamp,
  resolveEncryptedAiApiKey
} from "./database/ai-settings-utils.js";
import {
  normalizeBoolean,
  normalizeUrl,
  slugifyBusinessName
} from "./database/request-utils.js";
import { queueSyncJob } from "./database/sync-runtime-store.js";
import {
  readEnabledBusinessCapabilities,
  replaceBusinessCapabilitiesInTransaction
} from "./business-capability-store.js";

export type StoredSetupSaveResult =
  | {
      ok: true;
      message: string;
      setupData: DesktopSetupData;
    }
  | {
      ok: false;
      message: string;
    };

export function getSetupData(db: DatabaseSync, enabledCapabilities: ReadonlySet<BusinessCapability>): DesktopSetupData {
  const business = db.prepare("SELECT * FROM business WHERE deleted_at = '' LIMIT 1").get() as Record<string, unknown> | undefined;
  const settings = db.prepare("SELECT * FROM settings WHERE deleted_at = '' LIMIT 1").get() as Record<string, unknown> | undefined;
  const syncSecret = String(settings?.sync_secret ?? "");
  const businessName = String(business?.display_name ?? "");
  const aiService = normalizeStoredAiService(settings?.ai_service);
  const aiProfiles = getStoredAiServiceProfiles(db);
  const activeAiProfile = aiProfiles.find((profile) => profile.service === aiService);
  const profileId = normalizeBusinessType(String(business?.profile_id ?? ""));
  const profile = getBusinessProfile(profileId);
  const available = (service: Parameters<typeof isBusinessServiceAvailable>[0]) => isBusinessServiceAvailable(service, enabledCapabilities);
  const selected = new Set((db.prepare(`SELECT capability_id FROM business_capabilities
    WHERE business_id = ? AND is_selected = 1`).all(String(business?.id ?? "")) as Array<{ capability_id: string }>)
    .map(row => row.capability_id));
  const setupCompleted = Number(settings?.setup_completed ?? 0) === 1;
  const setupRequired =
    !setupCompleted ||
    (Number(settings?.auto_sync_enabled ?? 1) === 1 && (syncSecret.length < 12 || syncSecret === "change-this-secret"));

  return {
    setupRequired,
    appPasswordConfigured: Boolean(String(settings?.app_password_verifier ?? "").trim()),
    businessName,
    profileId,
    profileOptions: setupCompleted
      ? profile.optionalCapabilities.filter((capability) => selected.has(capability))
      : [...profile.defaultOptionalCapabilities],
    phone: String(business?.phone ?? ""),
    whatsapp: String(business?.whatsapp ?? ""),
    email: String(business?.email ?? ""),
    address: String(business?.address ?? ""),
    webModuleUrl: String(settings?.web_module_url ?? "https://yardimciasistan.alwaysdata.net/yardimci-asistan"),
    syncSecret,
    autoSyncEnabled: Number(settings?.auto_sync_enabled ?? 1) === 1,
    localNetworkEnabled: Number(settings?.local_network_enabled ?? 1) === 1,
    aiEnabled: enabledCapabilities.has(BUSINESS_CAPABILITIES.AI),
    aiProvider: String(settings?.ai_provider ?? "openai_compatible") || "openai_compatible",
    aiService,
    aiProjectName: activeAiProfile?.projectName ?? "",
    aiModel: activeAiProfile?.model ?? "",
    aiVisionModel: activeAiProfile?.visionModel ?? "",
    aiImageModel: activeAiProfile?.imageModel ?? "",
    aiSttModel: activeAiProfile?.sttModel ?? "",
    aiBaseUrl: activeAiProfile?.baseUrl ?? "",
    aiTimeoutSeconds: activeAiProfile?.timeoutSeconds ?? 30,
    aiApiKeyConfigured: activeAiProfile?.apiKeyConfigured ?? false,
    aiLastPublishedAt: normalizeStoredTimestamp(settings?.ai_last_published_at),
    aiProfiles,
    arasShipping: getArasShippingConfiguration(db),
    sms: smsConfiguration(db), instagram: instagramConfiguration(db),
    whatsappCloud: getMessagingConfiguration(db),
    dealerApplicationEnabled: Number(settings?.dealer_application_enabled ?? 0) === 1,
    dealerPortalEnabled: available("dealerPortal") && Number(settings?.dealer_portal_enabled ?? 0) === 1,
    onlineSalesDeliveryEnabled: available("delivery") && Number(settings?.online_sales_delivery_enabled ?? 0) === 1,
    onlineSalesDelivery: {
      pickupEnabled: Number(settings?.online_sales_pickup_enabled ?? 1) === 1,
      shippingEnabled: Number(settings?.online_sales_shipping_enabled ?? 0) === 1
    },
    productData: {
      enabled: available("productData") && Number(settings?.product_data_enabled ?? 0) === 1,
      provider: "open_food_facts",
      autoSearchUnknownBarcode: Number(settings?.product_data_auto_search ?? 1) === 1,
      includeImages: Number(settings?.product_data_include_images ?? 1) === 1
    },
    servicePreferences: {
      whatsapp: enabledCapabilities.has(BUSINESS_CAPABILITIES.WHATSAPP),
      android: enabledCapabilities.has(BUSINESS_CAPABILITIES.ANDROID)
    },
    birthdaySettings: normalizeBirthdaySettings({
      enabled: available("birthday") && normalizeBoolean(settings?.birthday_enabled, true),
      mode: settings?.birthday_mode === "automatic" ? "automatic" : "manual",
      sendTime: String(settings?.birthday_send_time ?? "10:00"),
      messageTemplate: String(settings?.birthday_message_template ?? "")
    })
  };
}

export function saveSetupData(
  db: DatabaseSync,
  input: SaveInitialSetupInput,
  aiApiKeyWrite: AiApiKeyWrite = { mode: "keep" },
  aiProfileApiKeyWrites: Partial<Record<DesktopAiService, AiApiKeyWrite>> = {},
  shippingSecretWrite: ShippingSecretWrite = { mode: "keep" },
  messagingSecretWrite: MessagingSecretWrite = { mode: "keep" },
  marketingSecretWrites: MarketingProviderSecretWrites = {}
): StoredSetupSaveResult {
  input = normalizeProfileTransitionInput(input, getSetupData(db, new Set(readEnabledBusinessCapabilities(db))));
  const businessName = input.businessName.trim();
  const syncSecret = input.syncSecret.trim();
  const webModuleUrl = normalizeUrl(input.webModuleUrl);
  const aiProvider = input.aiProvider.trim() || "openai_compatible";
  const aiService = normalizeAiService(input.aiService);
  const aiProjectName = String(input.aiProjectName ?? "").trim();
  const aiModel = input.aiModel.trim();
  const aiImageModel = String(input.aiImageModel ?? "").trim();
  if (aiImageModel && !supportsImageGenerationModel(input.aiService, aiImageModel)) {
    return { ok: false, message: "Seçilen görsel üretim modeli bu sağlayıcıda desteklenmiyor." };
  }
  const aiBaseUrl = normalizeAiBaseUrl(input.aiBaseUrl);
  const aiTimeoutSeconds = normalizeAiTimeout(input.aiTimeoutSeconds);
  const rawAiApiKeyProvided = Boolean(String(input.aiApiKey ?? "").trim());
  const existingSettings = db.prepare("SELECT * FROM settings WHERE deleted_at = '' LIMIT 1").get() as Record<string, unknown> | undefined;
  const effectiveSecret = (write: { mode: string; encryptedValue?: string } | undefined, old: string, clear?: boolean) =>
    clear || write?.mode === "clear" ? "" : write?.mode === "replace" ? write.encryptedValue ?? "" : old;
  let shipping = input.arasShipping ?? getArasShippingConfiguration(db);
  try {
    if (input.arasShipping) shipping = normalizeArasShippingInput(input.arasShipping);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Kargo ayarları geçersiz." };
  }
  try { if (input.sms) validateSmsConfiguration(input.sms); }
  catch { return { ok: false, message: "SMS servis ayarları geçersiz." }; }
  if (input.whatsappCloud) {
    try { normalizeMessagingConfiguration(input.whatsappCloud); }
    catch { return { ok: false, message: "WhatsApp Business ayarları geçersiz." }; }
  }
  const shippingReady = isArasShippingConfigurationReady({ ...shipping, hasSecret: Boolean(effectiveSecret(shippingSecretWrite,
    String(getStoredArasShippingConfiguration(db)?.password_encrypted ?? ""), input.arasShipping?.clearPassword)), password: "" });
  const requiredServices = [
    ...(input.whatsappCloud ? [{ label: "WhatsApp Business", enabled: input.whatsappCloud.enabled,
      configured: Boolean(input.whatsappCloud.wabaId && input.whatsappCloud.phoneNumberId && effectiveSecret(messagingSecretWrite,
        String(getStoredMessagingConfiguration(db)?.access_token_encrypted ?? ""), input.whatsappCloud.clearAccessToken)) }] : []),
    ...(input.sms ? [{ label: "SMS / İleti Merkezi", enabled: input.sms.enabled, configured: Boolean(input.sms.senderId
      && effectiveSecret(marketingSecretWrites.apiKey, String(storedMarketingProvider(db, "iletimerkezi")?.secret_one_encrypted ?? ""), input.sms.clearApiKey)
      && effectiveSecret(marketingSecretWrites.apiHash, String(storedMarketingProvider(db, "iletimerkezi")?.secret_two_encrypted ?? ""), input.sms.clearApiHash)) }] : []),
  ];
  for (const service of requiredServices) {
    const error = validateServiceActivation(service);
    if (error) return { ok: false, message: error };
  }
  if (input.instagram?.enabled === true && !instagramConfiguration(db).enabled) {
    const stored = storedMarketingProvider(db, "instagram_api");
    const credentials = { accountId: String(stored?.account_id ?? ""),
      accessToken: decryptMessagingSecret(String(stored?.secret_one_encrypted ?? "")) };
    const expiresAt = Date.parse(String(stored?.secret_two_encrypted ?? ""));
    const error = validateServiceActivation({ label: "Instagram", enabled: true,
      configured: Boolean(credentials.accountId && credentials.accessToken && expiresAt > Date.now()),
      fingerprint: serviceConfigFingerprint(credentials), verifiedFingerprint: readServiceVerification(db, "instagram") });
    if (error) return { ok: false, message: error };
  }
  let onlineSalesDelivery;
  try {
    const deliveryDraft = input.onlineSalesDelivery ?? {
      pickupEnabled: Number(existingSettings?.online_sales_pickup_enabled ?? 1) === 1,
      shippingEnabled: Number(existingSettings?.online_sales_shipping_enabled ?? 0) === 1
    };
    onlineSalesDelivery = normalizeOnlineSalesDeliverySettings(deliveryDraft, input.onlineSalesDeliveryEnabled ?? Number(existingSettings?.online_sales_delivery_enabled ?? 1) === 1);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Online satış teslimat ayarları geçersiz." };
  }
  const deliveryEnabled = input.onlineSalesDeliveryEnabled ?? Number(existingSettings?.online_sales_delivery_enabled ?? 1) === 1;
  if (deliveryEnabled && onlineSalesDelivery.shippingEnabled && !shippingReady) {
    return { ok: false, message: "Kargo ile gönderim için bir kargo sağlayıcısının hesap ayarlarını tamamlayın ve bağlantıyı test edin." };
  }
  const productDataSettings = {
    enabled: input.productData?.enabled ?? Number(existingSettings?.product_data_enabled ?? 0) === 1,
    provider: "open_food_facts" as const,
    autoSearchUnknownBarcode: input.productData?.autoSearchUnknownBarcode
      ?? Number(existingSettings?.product_data_auto_search ?? 1) === 1,
    includeImages: input.productData?.includeImages
      ?? Number(existingSettings?.product_data_include_images ?? 1) === 1
  };
  const birthdaySettings = normalizeBirthdaySettings(input.birthdaySettings ?? {
    enabled: normalizeBoolean(existingSettings?.birthday_enabled, true),
    mode: existingSettings?.birthday_mode === "automatic" ? "automatic" : "manual",
    sendTime: String(existingSettings?.birthday_send_time ?? "10:00"),
    messageTemplate: String(existingSettings?.birthday_message_template ?? "")
  });
  const profileService = aiService ?? normalizeStoredAiService(existingSettings?.ai_service);
  const existingAiProfile = db
    .prepare("SELECT * FROM ai_service_profiles WHERE service = ? LIMIT 1")
    .get(profileService) as Record<string, unknown> | undefined;
  const aiVisionModel = input.aiVisionModel === undefined ? String(existingAiProfile?.vision_model ?? "") : input.aiVisionModel;
  if (typeof aiVisionModel !== "string" || (aiVisionModel !== "" && !supportsVisionModel(profileService, aiVisionModel))) {
    return { ok: false, message: "Seçilen görsel analiz modeli bu sağlayıcıda desteklenmiyor." };
  }
  if (profileService === "cloudflare" && (input.aiBaseUrl || input.aiEnabled)
      && !isCloudflareAiBaseUrl(input.aiBaseUrl)) {
    return { ok: false, message: "Cloudflare için geçerli Account ID ile oluşturulan resmi API adresi gerekli." };
  }
  const existingEncryptedAiApiKey = String(existingAiProfile?.api_key_encrypted ?? "").trim();
  const aiSttModel = input.aiSttModel === undefined ? String(existingAiProfile?.stt_model ?? "") : input.aiSttModel;
  if (typeof aiSttModel !== "string" || (aiSttModel !== "" && !supportsSttModel(profileService, aiSttModel))) {
    return { ok: false, message: "Seçilen konuşma tanıma modeli bu sağlayıcıda desteklenmiyor." };
  }
  if (aiSttModel && !isSupportedSttBaseUrl(profileService, input.aiBaseUrl)) {
    return { ok: false, message: "Konuşma tanıma için sağlayıcının resmi HTTPS bağlantı adresi kullanılmalı." };
  }
  const aiApiKeyResolution = resolveEncryptedAiApiKey({
    rawKeyProvided: rawAiApiKeyProvided,
    clearRequested: Boolean(input.clearAiApiKey),
    write: aiApiKeyWrite,
    existingEncryptedValue: existingEncryptedAiApiKey
  });

  if (input.birthdaySettings) {
    const birthdaySettingsError = validateBirthdaySettings(input.birthdaySettings);
    if (birthdaySettingsError) return { ok: false, message: birthdaySettingsError };
  }

  if (input.servicePreferences.whatsapp && !input.whatsapp.trim()) {
    return { ok: false, message: "WhatsApp servisi açıkken WhatsApp numarası gerekli." };
  }
  if (input.autoSyncEnabled !== false && !webModuleUrl) {
    return { ok: false, message: "Web modül adresi http veya https ile başlamalı." };
  }
  if (input.autoSyncEnabled !== false && (syncSecret.length < 12 || syncSecret === "change-this-secret")) {
    return { ok: false, message: "Web güvenlik anahtarı en az 12 karakter olmalı ve varsayılan değer olmamalı." };
  }
  if (!aiApiKeyResolution.ok) return aiApiKeyResolution;
  if (input.aiEnabled && aiProvider !== "openai_compatible") {
    return { ok: false, message: "AI servis sağlayıcı ayarı geçerli değil." };
  }
  if (input.aiEnabled && !aiService) {
    return { ok: false, message: "AI servisi desteklenmiyor." };
  }
  if (aiProjectName.length > 120 || /[\x00-\x1F\x7F]/.test(aiProjectName)) {
    return { ok: false, message: "Google AI Studio proje adı geçersiz." };
  }
  if (input.aiEnabled && !aiBaseUrl) {
    return { ok: false, message: "AI bağlantı adresi http veya https ile başlamalı ve kullanıcı bilgisi içermemeli." };
  }
  if (input.aiEnabled && aiService === "gemini" && aiBaseUrl !== GOOGLE_AI_STUDIO_BASE_URL) {
    return { ok: false, message: "Google AI Studio için resmi Gemini bağlantı adresi kullanılmalı." };
  }
  if (input.aiEnabled && !aiModel) {
    return { ok: false, message: "AI model adı gerekli." };
  }
  if (input.aiEnabled && !aiApiKeyResolution.encryptedValue) {
    return { ok: false, message: "AI güvenlik anahtarı gerekli." };
  }
  if (input.aiEnabled && aiTimeoutSeconds === null) {
    return { ok: false, message: "AI zaman aşımı 5 ile 120 saniye arasında olmalı." };
  }

  const additionalAiProfiles: Array<{
    service: DesktopAiService;
    projectName: string;
    baseUrl: string;
    model: string;
    visionModel: string;
    imageModel: string;
    sttModel: string;
    modelOptions: DesktopAiModelOption[];
    timeoutSeconds: number;
    encryptedApiKey: string;
    createdAt: string;
  }> = [];
  const seenProfileServices = new Set<DesktopAiService>();
  for (const profileInput of Array.isArray(input.aiProfiles) ? input.aiProfiles : []) {
    const service = normalizeAiService(profileInput?.service);
    if (!service) return { ok: false, message: "Kaydedilecek AI servis profillerinden biri geçersiz." };
    if (seenProfileServices.has(service)) {
      return { ok: false, message: "Aynı AI servis profili birden fazla kez gönderilemez." };
    }
    seenProfileServices.add(service);
    if (profileInput.sttModel !== undefined && (typeof profileInput.sttModel !== "string"
        || (profileInput.sttModel !== "" && !supportsSttModel(service, profileInput.sttModel)))) {
      return { ok: false, message: "Seçilen konuşma tanıma modeli bu sağlayıcıda desteklenmiyor." };
    }
    if (profileInput.visionModel !== undefined && (typeof profileInput.visionModel !== "string"
      || (profileInput.visionModel !== "" && !supportsVisionModel(service, profileInput.visionModel)))) {
      return { ok: false, message: "Seçilen görsel analiz modeli bu sağlayıcıda desteklenmiyor." };
    }
    if (service === profileService) continue;

    const existingProfile = db
      .prepare("SELECT * FROM ai_service_profiles WHERE service = ? LIMIT 1")
      .get(service) as Record<string, unknown> | undefined;
    const projectName = String(profileInput.projectName ?? "").trim();
    const model = String(profileInput.model ?? "").trim();
    const visionModel = profileInput.visionModel ?? String(existingProfile?.vision_model ?? "");
    const imageModel = String(profileInput.imageModel ?? "").trim();
    if (imageModel && !supportsImageGenerationModel(service, imageModel)) return { ok: false, message: "Seçilen görsel üretim modeli bu sağlayıcıda desteklenmiyor." };
    const normalizedBaseUrl = normalizeAiBaseUrl(profileInput.baseUrl);
    const baseUrl = normalizedBaseUrl || AI_SERVICE_DEFAULT_BASE_URLS[service];
    const sttModel = profileInput.sttModel ?? String(existingProfile?.stt_model ?? "");
    if (sttModel && (!supportsSttModel(service, sttModel) || !isSupportedSttBaseUrl(service, profileInput.baseUrl))) {
      return { ok: false, message: "Konuşma tanıma modeli veya resmi HTTPS bağlantı adresi desteklenmiyor." };
    }
    if (service === "cloudflare" && (profileInput.baseUrl || model || imageModel || visionModel)
        && !isCloudflareAiBaseUrl(profileInput.baseUrl)) {
      return { ok: false, message: "Cloudflare profili için geçerli Account ID ve resmi API adresi gerekli." };
    }
    const timeoutSeconds = normalizeAiTimeout(profileInput.timeoutSeconds);
    const rawKeyProvided = Boolean(String(profileInput.apiKey ?? "").trim());
    const keyResolution = resolveEncryptedAiApiKey({
      rawKeyProvided,
      clearRequested: Boolean(profileInput.clearApiKey),
      write: aiProfileApiKeyWrites[service] ?? { mode: "keep" },
      existingEncryptedValue: String(existingProfile?.api_key_encrypted ?? "").trim()
    });

    if (!keyResolution.ok) return keyResolution;
    if (projectName.length > 120 || /[\x00-\x1F\x7F]/.test(projectName)) {
      return { ok: false, message: `${getAiServiceDisplayName(service)} profil adı geçersiz.` };
    }
    if (!timeoutSeconds) {
      return { ok: false, message: `${getAiServiceDisplayName(service)} zaman aşımı 5 ile 120 saniye arasında olmalı.` };
    }
    if (service === "gemini" && baseUrl !== GOOGLE_AI_STUDIO_BASE_URL) {
      return { ok: false, message: "Google AI Studio profili için resmi Gemini bağlantı adresi kullanılmalı." };
    }
    if (!baseUrl && (model || keyResolution.encryptedValue)) {
      return { ok: false, message: `${getAiServiceDisplayName(service)} bağlantı adresi gerekli.` };
    }

    additionalAiProfiles.push({
      service,
      projectName,
      baseUrl,
      model,
      visionModel,
      imageModel,
      sttModel,
      modelOptions: normalizeAiModelOptions(
        profileInput.modelOptions === undefined ? existingProfile?.model_options_json : profileInput.modelOptions,
        model
      ),
      timeoutSeconds,
      encryptedApiKey: keyResolution.encryptedValue,
      createdAt: String(existingProfile?.created_at ?? "")
    });
  }

  const now = new Date().toISOString();
  const existingBusiness = db.prepare("SELECT id, profile_id, created_at FROM business WHERE deleted_at = '' LIMIT 1").get() as { id?: string; profile_id?: string; created_at?: string } | undefined;
  const businessId = existingBusiness?.id || createId("business_");
  const settingsId = String(existingSettings?.id ?? "") || "settings_primary";
  const createdAt = existingBusiness?.created_at || now;
  const settingsCreatedAt = String(existingSettings?.created_at ?? "") || now;
  const storedAiProvider = aiProvider === "openai_compatible" ? aiProvider : "openai_compatible";
  const storedAiService = aiService ?? "openai";
  const storedAiBaseUrl = aiBaseUrl || (storedAiService === "cloudflare" ? "" : DEFAULT_AI_BASE_URL);
  const storedAiTimeoutSeconds = aiTimeoutSeconds ?? DEFAULT_AI_TIMEOUT_SECONDS;
  const storedEncryptedAiApiKey = aiApiKeyResolution.encryptedValue;
  const storedAiModelOptions = normalizeAiModelOptions(
    input.aiModelOptions === undefined ? existingAiProfile?.model_options_json : input.aiModelOptions,
    aiModel
  );
  const beforeCapabilities = new Set(readEnabledBusinessCapabilities(db));
  const aiWasEnabled = beforeCapabilities.has(BUSINESS_CAPABILITIES.AI);
  const aiSettingsChanged =
    !existingSettings ||
    !existingAiProfile ||
    aiWasEnabled !== input.aiEnabled ||
    String(existingSettings.ai_provider ?? "") !== storedAiProvider ||
    String(existingSettings.ai_service ?? "") !== storedAiService ||
    String(existingAiProfile.project_name ?? "").trim() !== aiProjectName ||
    String(existingAiProfile.model ?? "").trim() !== aiModel ||
    String(existingAiProfile.stt_model ?? "") !== aiSttModel ||
    String(existingAiProfile.vision_model ?? "") !== aiVisionModel ||
    (normalizeAiBaseUrl(existingAiProfile.base_url) || AI_SERVICE_DEFAULT_BASE_URLS[storedAiService]) !== storedAiBaseUrl ||
    normalizeStoredAiTimeout(existingAiProfile.timeout_seconds) !== storedAiTimeoutSeconds ||
    existingEncryptedAiApiKey !== storedEncryptedAiApiKey;
  const webTransportChanged = String(existingSettings?.web_module_url ?? "") !== webModuleUrl
    || String(existingSettings?.sync_secret ?? "") !== syncSecret;
  const dictationSettingsChanged = aiSettingsChanged || webTransportChanged
    || String(existingAiProfile?.image_model ?? "") !== aiImageModel
    || Number(existingSettings?.auto_sync_enabled ?? 1) !== Number(input.autoSyncEnabled !== false);
  const aiLastPublishedAt = aiSettingsChanged || webTransportChanged ? "" : normalizeStoredTimestamp(existingSettings?.ai_last_published_at);

  db.exec("BEGIN IMMEDIATE");
  try {
    if (dictationSettingsChanged) db.prepare("DELETE FROM service_settings_verifications WHERE service = 'desktop_stt'").run();
    db
      .prepare(`
        INSERT INTO business (
          id, name, display_name, profile_id, phone, whatsapp, email, address,
          created_at, updated_at, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local_only')
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          display_name = excluded.display_name,
          profile_id = excluded.profile_id,
          phone = excluded.phone,
          whatsapp = excluded.whatsapp,
          email = excluded.email,
          address = excluded.address,
          updated_at = excluded.updated_at,
          deleted_at = '',
          sync_status = 'local_only'
      `)
      .run(
        businessId,
        slugifyBusinessName(businessName),
        businessName,
        normalizeBusinessType(input.profileId),
        input.phone.trim(),
        input.whatsapp.trim(),
        input.email.trim(),
        input.address.trim(),
        createdAt,
        now
      );

    db
      .prepare(`
        INSERT INTO settings (
          id, business_id, web_module_url, sync_secret, auto_sync_enabled,
          ai_provider, ai_service, ai_last_published_at, whatsapp_mode,
          birthday_enabled, birthday_mode, birthday_send_time, birthday_message_template,
          product_data_enabled, product_data_provider, product_data_auto_search,
          product_data_include_images, setup_completed, created_at, updated_at, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'webview', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'local_only')
        ON CONFLICT(id) DO UPDATE SET
          business_id = excluded.business_id,
          web_module_url = excluded.web_module_url,
          sync_secret = excluded.sync_secret,
          auto_sync_enabled = excluded.auto_sync_enabled,
          ai_provider = excluded.ai_provider,
          ai_service = excluded.ai_service,
          ai_last_published_at = excluded.ai_last_published_at,
          birthday_enabled = excluded.birthday_enabled,
          birthday_mode = excluded.birthday_mode,
          birthday_send_time = excluded.birthday_send_time,
          birthday_message_template = excluded.birthday_message_template,
          product_data_enabled = excluded.product_data_enabled,
          product_data_provider = excluded.product_data_provider,
          product_data_auto_search = excluded.product_data_auto_search,
          product_data_include_images = excluded.product_data_include_images,
          setup_completed = 1,
          updated_at = excluded.updated_at,
          deleted_at = '',
          sync_status = 'local_only'
      `)
      .run(
        settingsId,
        businessId,
        webModuleUrl,
        syncSecret,
        input.autoSyncEnabled === false ? 0 : 1,
        storedAiProvider,
        storedAiService,
        aiLastPublishedAt,
        birthdaySettings.enabled ? 1 : 0,
        birthdaySettings.mode,
        birthdaySettings.sendTime,
        birthdaySettings.messageTemplate,
        productDataSettings.enabled ? 1 : 0,
        productDataSettings.provider,
        productDataSettings.autoSearchUnknownBarcode ? 1 : 0,
        productDataSettings.includeImages ? 1 : 0,
        settingsCreatedAt,
        now
      );

    db.prepare("UPDATE settings SET local_network_enabled = ?, updated_at = ? WHERE id = ?")
      .run(input.localNetworkEnabled === false ? 0 : 1, now, settingsId);

    db.prepare("UPDATE settings SET online_sales_delivery_enabled = ?, online_sales_pickup_enabled = ?, online_sales_shipping_enabled = ? WHERE id = ?")
      .run(deliveryEnabled ? 1 : 0, onlineSalesDelivery.pickupEnabled ? 1 : 0, onlineSalesDelivery.shippingEnabled ? 1 : 0, settingsId);

    db.prepare("UPDATE settings SET dealer_portal_enabled = ? WHERE id = ?")
      .run((input.dealerPortalEnabled ?? Number(existingSettings?.dealer_portal_enabled ?? 0) === 1) ? 1 : 0, settingsId);

    db.prepare("UPDATE settings SET dealer_application_enabled = ? WHERE id = ?")
      .run((input.dealerApplicationEnabled ?? Number(existingSettings?.dealer_application_enabled ?? 0) === 1) ? 1 : 0, settingsId);

    saveMarketingProviderConfigurations(db, businessId, input.sms, marketingSecretWrites);
    if (input.instagram) setInstagramOAuthEnabled(db, input.instagram.enabled);
    if (input.whatsappCloud) saveMessagingConfiguration(db, businessId, input.whatsappCloud, messagingSecretWrite);
    // Legacy provider activation is a projection of delivery intent, never an independent Settings switch.
    saveArasShippingConfigurationInTransaction(db, businessId, {
      ...shipping, enabled: deliveryEnabled && onlineSalesDelivery.shippingEnabled
    }, shippingSecretWrite);

    upsertAiServiceProfileInTransaction(db, {
      service: storedAiService,
      projectName: aiProjectName,
      baseUrl: storedAiBaseUrl,
      model: aiModel,
      visionModel: aiVisionModel,
      imageModel: aiImageModel,
      sttModel: aiSttModel,
      modelOptionsJson: JSON.stringify(storedAiModelOptions),
      timeoutSeconds: storedAiTimeoutSeconds,
      apiKeyEncrypted: storedEncryptedAiApiKey,
      createdAt: String(existingAiProfile?.created_at ?? "") || now,
      now
    });

    for (const profile of additionalAiProfiles) {
      upsertAiServiceProfileInTransaction(db, {
        service: profile.service,
        projectName: profile.projectName,
        baseUrl: profile.baseUrl,
        model: profile.model,
        visionModel: profile.visionModel,
        imageModel: profile.imageModel,
        sttModel: profile.sttModel,
        modelOptionsJson: JSON.stringify(profile.modelOptions),
        timeoutSeconds: profile.timeoutSeconds,
        apiKeyEncrypted: profile.encryptedApiKey,
        createdAt: profile.createdAt || now,
        now
      });
    }

    replaceBusinessCapabilitiesInTransaction(db, {
      businessId,
      profileId: input.profileId,
      ...(Number(existingSettings?.setup_completed ?? 0) === 1 && existingBusiness?.profile_id !== undefined
        ? { previousProfileId: existingBusiness.profile_id }
        : {}),
      selectedOptionalCapabilities: input.profileOptions
        ?? getBusinessProfile(input.profileId).defaultOptionalCapabilities,
      whatsappEnabled: input.servicePreferences.whatsapp,
      androidEnabled: input.servicePreferences.android,
      aiEnabled: input.aiEnabled,
      now
    });

    if (Number(existingSettings?.online_sales_pickup_enabled ?? 1) !== Number(onlineSalesDelivery.pickupEnabled)
        || Number(existingSettings?.online_sales_delivery_enabled ?? 1) !== Number(deliveryEnabled)
        || Number(existingSettings?.online_sales_shipping_enabled ?? 0) !== Number(onlineSalesDelivery.shippingEnabled)) {
      queueSyncJob(db, "online_catalog_publish", now);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const enabledCapabilities = new Set(readEnabledBusinessCapabilities(db));

  return {
    ok: true,
    message: "İlk kurulum ayarları kaydedildi.",
    setupData: getSetupData(db, enabledCapabilities)
  };
}
