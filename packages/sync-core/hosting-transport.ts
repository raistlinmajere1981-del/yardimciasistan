import type { MarketingWebsiteProjection } from "@yardimci-asistan/shared";
import type { CommerceOnlineCatalog, DealerAccessProjection } from "@yardimci-asistan/shared";
import type {
  DealerAccessPublicationSuccess,
  DealerAccessPublicationResult,
  AcknowledgeRequestsOptions,
  AcknowledgeRequestsResult,
  AcknowledgeRequestsSuccess,
  AcknowledgeWebOrdersOptions,
  AcknowledgeWebOrdersResult,
  AcknowledgeWebOrdersSuccess,
  ActionCompletion,
  AndroidOperationsSnapshot,
  MarkAndroidActionResultOptions,
  MarkAndroidActionResultResult,
  MarkAndroidActionResultSuccess,
  MarkRequestsSyncedOptions,
  MarkRequestsSyncedResult,
  MarkRequestsSyncedSuccess,
  PhpHostingSyncTransportConfig,
  PublishedQrMenu,
  PullActionsInput,
  PullAndroidActionsOptions,
  PullAndroidActionsResult,
  PullAndroidActionsSuccess,
  PullCursorInput,
  PullRequestsOptions,
  PullRequestsResult,
  PullRequestsSuccess,
  PullWebOrdersOptions,
  PullWebOrdersResult,
  PullWebOrdersSuccess,
  PushAiCatalogOptions,
  PushAiCatalogResult,
  PushAiCatalogSuccess,
  PushAiSettingsOptions,
  PushAiSettingsResult,
  PushAiSettingsSuccess,
  PushAndroidSnapshotOptions,
  PushAndroidSnapshotResult,
  PushAndroidSnapshotSuccess,
  PushBusinessContextOptions,
  PushBusinessContextResult,
  PushBusinessContextSuccess,
  PushMenuOptions,
  PushMenuResult,
  PushMenuSuccess,
  PushOnlineCatalogOptions,
  PushOnlineCatalogResult,
  PushOnlineCatalogSuccess,
  PushRoomCatalogOptions,
  PushRoomCatalogResult,
  PushRoomCatalogSuccess,
  PushTableCatalogOptions,
  PushTableCatalogResult,
  PushTableCatalogSuccess,
  RequestAcknowledgement,
  ResetHostingRuntimeOptions,
  ResetHostingRuntimeResult,
  ResetHostingRuntimeSuccess,
  SyncCapabilitiesOptions,
  SyncCapabilitiesResult,
  SyncCapabilitiesSuccess,
  SyncCoreConfig,
  SyncFailure,
  SyncTransport,
  VersionedPublication,
  WebOrderAcknowledgement
} from "./index";

export function createSyncEndpointUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  return `${normalizedBaseUrl}/api/sync.php`;
}

export async function getSyncCapabilities(options: SyncCapabilitiesOptions): Promise<SyncCapabilitiesResult> {
  return syncRequest<SyncCapabilitiesSuccess>(options, {
    action: "capabilities"
  });
}

export async function resetHostingRuntime(options: ResetHostingRuntimeOptions): Promise<ResetHostingRuntimeResult> {
  return syncRequest<ResetHostingRuntimeSuccess>(options, {
    action: "reset_runtime"
  });
}

export async function pullRequests(options: PullRequestsOptions): Promise<PullRequestsResult> {
  return syncRequest<PullRequestsSuccess>(options, {
    action: "pull_requests",
    limit: options.limit ?? 50,
    include_synced: options.includeSynced ?? false,
    ...(options.afterSeq === undefined ? {} : { after_seq: Math.max(0, Math.trunc(options.afterSeq)) }),
    ...(options.clientId ? { client_id: options.clientId } : {})
  });
}

export async function pullWebOrders(options: PullWebOrdersOptions): Promise<PullWebOrdersResult> {
  const result = await syncRequest<PullWebOrdersSuccess>(options, {
    action: "pull_web_orders",
    client_id: options.clientId,
    after_seq: Math.max(0, Math.trunc(options.afterSeq)),
    limit: options.limit ?? 50
  });
  if (!result.ok) return result;
  // Check the whole page before exposing it to an importer. An out-of-order
  // page must never let a caller acknowledge past an unprocessed record.
  let cursor = Math.max(0, Math.trunc(options.afterSeq));
  let valid = Array.isArray(result.orders) && typeof result.has_more === "boolean"
    && result.count === result.orders.length;
  if (valid) {
    for (const envelope of result.orders) {
      if (!Number.isSafeInteger(envelope?.syncSeq) || envelope.syncSeq <= cursor) {
        valid = false;
        break;
      }
      cursor = envelope.syncSeq;
    }
    valid &&= result.next_cursor === cursor && !(result.orders.length === 0 && result.has_more);
  }
  return valid ? result : {
    ok: false,
    message: "Web sipariş kuyruğu yanıtı geçersiz.",
    error: "invalid_web_order_page"
  };
}

export async function acknowledgeWebOrders(options: AcknowledgeWebOrdersOptions): Promise<AcknowledgeWebOrdersResult> {
  return syncRequest<AcknowledgeWebOrdersSuccess>(options, {
    action: "acknowledge_web_orders",
    client_id: options.clientId,
    through_seq: Math.max(0, Math.trunc(options.throughSeq))
  });
}

export async function markRequestsSynced(options: MarkRequestsSyncedOptions): Promise<MarkRequestsSyncedResult> {
  return syncRequest<MarkRequestsSyncedSuccess>(options, {
    action: "mark_requests_synced",
    request_ids: options.requestIds
  });
}

export async function acknowledgeRequests(options: AcknowledgeRequestsOptions): Promise<AcknowledgeRequestsResult> {
  return syncRequest<AcknowledgeRequestsSuccess>(options, {
    action: "acknowledge_requests",
    client_id: options.clientId,
    through_seq: Math.max(0, Math.trunc(options.throughSeq))
  });
}

export async function pushOnlineCatalog(options: PushOnlineCatalogOptions): Promise<PushOnlineCatalogResult> {
  return syncRequest<PushOnlineCatalogSuccess>(options, {
    action: "publish_online_catalog",
    client_id: options.clientId,
    source_revision: options.sourceRevision,
    idempotency_key: options.idempotencyKey,
    online_catalog: {
      version: options.catalog.version,
      enabled: options.catalog.enabled,
      delivery_methods: options.catalog.deliveryMethods,
      updated_at: options.catalog.updatedAt,
      products: options.catalog.products.map((product) => ({
        product_id: product.productId, name: product.name, description: product.description,
        sku: product.sku, unit: product.unit, price: product.price, currency: product.currency,
        tax_rate: product.taxRate, image_url: product.imageUrl,
        availability: product.availability, sort_order: product.sortOrder
      }))
    }
  });
}

export async function pushMenu(options: PushMenuOptions): Promise<PushMenuResult> {
  return syncRequest<PushMenuSuccess>(options, {
    action: "publish_menu",
    menu: options.menu,
    ...(options.clientId ? { client_id: options.clientId } : {}),
    ...(options.sourceRevision === undefined ? {} : { source_revision: Math.max(0, Math.trunc(options.sourceRevision)) }),
    ...(options.idempotencyKey ? { idempotency_key: options.idempotencyKey } : {})
  });
}

export async function pushAndroidSnapshot(options: PushAndroidSnapshotOptions): Promise<PushAndroidSnapshotResult> {
  return syncRequest<PushAndroidSnapshotSuccess>(options, {
    action: "publish_android_snapshot",
    snapshot: options.snapshot,
    ...(options.clientId ? { client_id: options.clientId } : {}),
    ...(options.sourceRevision === undefined ? {} : { source_revision: Math.max(0, Math.trunc(options.sourceRevision)) }),
    ...(options.idempotencyKey ? { idempotency_key: options.idempotencyKey } : {})
  });
}

export async function pullAndroidActions(options: PullAndroidActionsOptions): Promise<PullAndroidActionsResult> {
  return syncRequest<PullAndroidActionsSuccess>(options, {
    action: "pull_android_actions",
    limit: options.limit ?? 50
  });
}

export async function markAndroidActionResult(options: MarkAndroidActionResultOptions): Promise<MarkAndroidActionResultResult> {
  return syncRequest<MarkAndroidActionResultSuccess>(options, {
    action: "mark_android_action_result",
    action_id: options.actionId,
    status: options.status,
    error_message: options.errorMessage ?? ""
  });
}

export async function pushAiCatalog(options: PushAiCatalogOptions): Promise<PushAiCatalogResult> {
  return syncRequest<PushAiCatalogSuccess>(options, {
    action: "publish_ai_catalog",
    client_id: options.clientId,
    ai_catalog: {
      version: options.catalog.version,
      updated_at: options.catalog.updatedAt,
      items: options.catalog.items.map((item) => ({
        id: item.id,
        source: item.source,
        name: item.name,
        description: item.description,
        category: item.category,
        brand: item.brand,
        barcode: item.barcode,
        price: item.price,
        currency: item.currency,
        unit: item.unit,
        available: item.available,
        featured: item.featured,
        tags: item.tags
      }))
    }
  });
}

export async function pushRoomCatalog(options: PushRoomCatalogOptions): Promise<PushRoomCatalogResult> {
  return syncRequest<PushRoomCatalogSuccess>(options, {
    action: "publish_room_catalog",
    client_id: options.clientId,
    room_catalog: {
      version: options.catalog.version,
      enabled: options.catalog.enabled,
      updated_at: options.catalog.updatedAt,
      rooms: options.catalog.rooms.map((room) => ({
        id: room.id,
        name: room.name,
        number: room.number,
        capacity: room.capacity,
        bed_info: room.bedInfo,
        floor: room.floor,
        features: room.features,
        description: room.description,
        price_note: room.priceNote,
        nightly_price_minor: room.nightlyPriceMinor,
        currency: room.currency,
        sort_order: room.sortOrder,
        media: room.media.map((media) => ({
          id: media.id,
          kind: media.kind,
          url: media.url,
          mime_type: media.mimeType,
          title: media.title,
          sort_order: media.sortOrder
        }))
      }))
    }
  });
}

export async function pushTableCatalog(options: PushTableCatalogOptions): Promise<PushTableCatalogResult> {
  return syncRequest<PushTableCatalogSuccess>(options, {
    action: "publish_table_catalog",
    client_id: options.clientId,
    table_catalog: {
      version: options.catalog.version,
      enabled: options.catalog.enabled,
      updated_at: options.catalog.updatedAt,
      tables: options.catalog.tables.map((table) => ({
        id: table.id,
        name: table.name,
        area: table.area,
        capacity: table.capacity,
        description: table.description,
        features: table.features,
        smoking_policy: table.smokingPolicy,
        sort_order: table.sortOrder,
        media: table.media.map((media) => ({
          id: media.id,
          kind: media.kind,
          url: media.url,
          mime_type: media.mimeType,
          title: media.title,
          sort_order: media.sortOrder
        }))
      }))
    }
  });
}

export async function pushBusinessContext(options: PushBusinessContextOptions): Promise<PushBusinessContextResult> {
  return syncRequest<PushBusinessContextSuccess>(options, {
    action: "publish_business_context",
    client_id: options.clientId,
    business_context: {
      version: options.context.version,
      business_name: options.context.businessName,
      profile_id: options.context.profileId,
      profile_label: options.context.profileLabel,
      phone: options.context.phone,
      whatsapp: options.context.whatsapp,
      whatsapp_enabled: options.context.whatsappEnabled,
      email: options.context.email,
      address: options.context.address,
      mapDisplayMode: options.context.mapDisplayMode ?? "manual",
      googleMapsEmbedUrl: options.context.googleMapsEmbedUrl ?? "",
      latitude: options.context.latitude,
      longitude: options.context.longitude,
      description: options.context.description,
      directions_note: options.context.directionsNote,
      policy_note: options.context.policyNote,
      payment_note: options.context.paymentNote,
      languages: options.context.languages,
      features: options.context.features,
      feature_ids: options.context.featureIds,
      social_links: (options.context.socialLinks ?? []).map((link) => ({
        platform: link.platform,
        url: link.url
      })),
      capability_ids: options.context.capabilityIds ?? [],
      check_in_time: options.context.checkInTime,
      check_out_time: options.context.checkOutTime,
      breakfast_start_time: options.context.breakfastStartTime,
      breakfast_end_time: options.context.breakfastEndTime
    }
  });
}

export async function pushAiSettings(options: PushAiSettingsOptions): Promise<PushAiSettingsResult> {
  const targetValidationError = validateAiSettingsTarget(options.baseUrl);
  if (targetValidationError) {
    return targetValidationError;
  }

  const result = await syncRequest<PushAiSettingsSuccess>(options, {
    action: "publish_ai_settings",
    ai_settings: {
      enabled: options.aiSettings.enabled,
      provider: options.aiSettings.provider,
      service: options.aiSettings.service,
      base_url: options.aiSettings.baseUrl,
      model: options.aiSettings.model,
      api_key: options.aiSettings.apiKey,
      timeout_seconds: options.aiSettings.timeoutSeconds
    }
  });

  if (!result.ok) {
    return {
      ...result,
      message: redactSecret(result.message, options.aiSettings.apiKey),
      error: result.error ? redactSecret(result.error, options.aiSettings.apiKey) : undefined
    };
  }

  const publishedAt = typeof result.published_at === "string" && Number.isFinite(Date.parse(result.published_at))
    ? result.published_at
    : "";
  if (!publishedAt) {
    return {
      ok: false,
      message: "Web modülü AI ayarını aldı ancak geçerli bir yayın zamanı döndürmedi. Web modülünü güncelleyip tekrar deneyin."
    };
  }

  return {
    ok: true,
    message: redactSecret(result.message, options.aiSettings.apiKey),
    published_at: publishedAt,
    enabled: options.aiSettings.enabled,
    provider: options.aiSettings.provider,
    service: options.aiSettings.service,
    base_url: options.aiSettings.baseUrl.replace(/\/+$/, ""),
    model: options.aiSettings.model,
    timeout_seconds: options.aiSettings.timeoutSeconds,
    has_api_key: options.aiSettings.apiKey.trim() !== ""
  };
}

export class PhpHostingSyncTransport implements SyncTransport {
  constructor(private readonly config: PhpHostingSyncTransportConfig) {}

  getCapabilities(): Promise<SyncCapabilitiesResult> {
    return getSyncCapabilities(this.config);
  }

  pullRequests(input: PullCursorInput): Promise<PullRequestsResult> {
    return pullRequests({
      ...this.config,
      clientId: this.config.clientId,
      afterSeq: input.afterSeq,
      limit: input.limit
    });
  }

  acknowledgeRequests(input: RequestAcknowledgement): Promise<AcknowledgeRequestsResult> {
    return acknowledgeRequests({
      ...this.config,
      clientId: this.config.clientId,
      throughSeq: input.throughSeq
    });
  }

  pullWebOrders(input: PullCursorInput): Promise<PullWebOrdersResult> {
    return pullWebOrders({ ...this.config, ...input });
  }

  acknowledgeWebOrders(input: WebOrderAcknowledgement): Promise<AcknowledgeWebOrdersResult> {
    return acknowledgeWebOrders({ ...this.config, ...input });
  }

  pullAndroidActions(input: PullActionsInput = {}): Promise<PullAndroidActionsResult> {
    return pullAndroidActions({ ...this.config, limit: input.limit });
  }

  completeAndroidAction(input: ActionCompletion): Promise<MarkAndroidActionResultResult> {
    return markAndroidActionResult({
      ...this.config,
      actionId: input.actionId,
      status: input.status,
      errorMessage: input.errorMessage
    });
  }

  publishMarketingWebsite(input: VersionedPublication<MarketingWebsiteProjection>): Promise<DealerAccessPublicationResult> {
    return syncRequest<DealerAccessPublicationSuccess>(this.config, {
      action: "publish_marketing_website", client_id: this.config.clientId,
      source_revision: input.sourceRevision, idempotency_key: input.idempotencyKey,
      marketing: input.value
    });
  }

  publishDealerAccess(input: VersionedPublication<DealerAccessProjection>): Promise<DealerAccessPublicationResult> {
    return syncRequest<DealerAccessPublicationSuccess>(this.config, {
      action: "publish_dealer_access", client_id: this.config.clientId,
      source_revision: input.sourceRevision, idempotency_key: input.idempotencyKey,
      dealer_access: input.value
    });
  }

  publishOnlineCatalog(input: VersionedPublication<CommerceOnlineCatalog>): Promise<PushOnlineCatalogResult> {
    return pushOnlineCatalog({
      ...this.config, catalog: input.value,
      sourceRevision: input.sourceRevision, idempotencyKey: input.idempotencyKey
    });
  }

  publishMenu(input: VersionedPublication<PublishedQrMenu>): Promise<PushMenuResult> {
    return pushMenu({
      ...this.config,
      clientId: this.config.clientId,
      sourceRevision: input.sourceRevision,
      idempotencyKey: input.idempotencyKey,
      menu: input.value
    });
  }

  publishAndroidSnapshot(input: VersionedPublication<AndroidOperationsSnapshot>): Promise<PushAndroidSnapshotResult> {
    return pushAndroidSnapshot({
      ...this.config,
      clientId: this.config.clientId,
      sourceRevision: input.sourceRevision,
      idempotencyKey: input.idempotencyKey,
      snapshot: input.value
    });
  }
}

async function syncRequest<SuccessResult extends { ok: true }>(
  config: SyncCoreConfig,
  body: Record<string, unknown>
): Promise<SuccessResult | SyncFailure> {
  const validationError = validateConfig(config);
  if (validationError) {
    return validationError;
  }

  const fetcher = config.fetchImpl ?? globalThis.fetch;
  if (!fetcher) {
    return {
      ok: false,
      message: "Bağlantı aracı bulunamadı."
    };
  }

  try {
    const endpointUrl = createSyncEndpointUrl(config.baseUrl);
    const response = await fetcher(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-YA-Sync-Secret": config.syncSecret
      },
      body: JSON.stringify(body)
    });
    const payload = await readJsonResponse(response);

    if (!response.ok || payload?.ok !== true) {
      return {
        ok: false,
        status: response.status,
        message: typeof payload?.message === "string"
          ? payload.message
          : describeInvalidSyncResponse(response.status, endpointUrl)
      };
    }

    return payload as SuccessResult;
  } catch (error) {
    return {
      ok: false,
      message: describeSyncConnectionFailure(config.baseUrl),
      error: describeError(error)
    };
  }
}

function describeSyncConnectionFailure(baseUrl: string) {
  const target = getSafeSyncTarget(baseUrl);
  if (target?.isLoopback) {
    return `Yerel web modülüne ulaşılamadı (${target.displayUrl}). Web modülü sunucusunu başlatın veya canlı hosting adresini girin.`;
  }

  if (target) {
    return `Web modülüne ulaşılamadı (${target.displayUrl}). Adresi, internet bağlantısını ve sitenin SSL sertifikasını kontrol edin.`;
  }

  return "Web modülüne ulaşılamadı. Web modül adresini ve internet bağlantısını kontrol edin.";
}

function describeInvalidSyncResponse(status: number, endpointUrl: string) {
  const target = getSafeSyncTarget(endpointUrl)?.displayUrl ?? "web modülü";
  if (status === 404) {
    return `Web modülü senkron uç noktası bulunamadı (${target}). Hosting paketini güncelleyip web modül adresini kontrol edin.`;
  }

  if (status === 405) {
    return `Web modülü senkron isteğini kabul etmedi (${target}). Hosting paketini güncelleyip tekrar deneyin.`;
  }

  return `Web modülü geçerli bir senkron yanıtı vermedi (HTTP ${status}, ${target}).`;
}

function getSafeSyncTarget(value: string) {
  try {
    const url = new URL(value.trim());
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    return {
      displayUrl: url.toString().replace(/\/$/, ""),
      isLoopback
    };
  } catch {
    return null;
  }
}

function describeError(error: unknown) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause = error.cause;
  if (cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string") {
    return `${error.message} (${cause.code})`;
  }

  return error.message;
}

function validateConfig(config: SyncCoreConfig): SyncFailure | null {
  if (!config.baseUrl.trim()) {
    return {
      ok: false,
      message: "Web modül adresi gerekli."
    };
  }

  if (!config.syncSecret.trim()) {
    return {
      ok: false,
      message: "Güvenlik anahtarı gerekli."
    };
  }

  return null;
}

function validateAiSettingsTarget(baseUrl: string): SyncFailure | null {
  let target: URL;
  try {
    target = new URL(baseUrl.trim());
  } catch {
    return {
      ok: false,
      message: "AI ayarlarını yayınlamak için geçerli bir web modül adresi gerekli."
    };
  }

  if (target.protocol === "https:") {
    return null;
  }

  const isLoopbackHost = target.hostname === "localhost" || target.hostname === "127.0.0.1" || target.hostname === "[::1]";
  if (target.protocol === "http:" && isLoopbackHost) {
    return null;
  }

  return {
    ok: false,
    message: "AI ayarları uzak hedefe yalnız HTTPS üzerinden yayınlanabilir. HTTP yalnız localhost bağlantılarında kullanılabilir."
  };
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const payload = (await response.json()) as unknown;
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactSecret(value: unknown, secret: string) {
  const text = String(value ?? "");
  const normalizedSecret = secret.trim();
  if (!normalizedSecret) {
    return text;
  }

  return text.split(normalizedSecret).join("[gizlendi]");
}

