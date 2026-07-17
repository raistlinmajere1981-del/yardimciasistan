import type { CustomerRequest, ISODateTimeString } from "@yardimci-asistan/shared";

export interface SyncCoreConfig {
  baseUrl: string;
  syncSecret: string;
  fetchImpl?: typeof fetch;
}

export interface PullRequestsOptions extends SyncCoreConfig {
  limit?: number;
  includeSynced?: boolean;
}

export interface MarkRequestsSyncedOptions extends SyncCoreConfig {
  requestIds: string[];
}

export interface PushMenuOptions extends SyncCoreConfig {
  menu: PublishedQrMenu;
}

export interface PushAndroidSnapshotOptions extends SyncCoreConfig {
  snapshot: AndroidOperationsSnapshot;
}

export interface AiConnectionSettings {
  enabled: boolean;
  provider: string;
  service: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutSeconds: number;
}

export interface PushAiSettingsOptions extends SyncCoreConfig {
  aiSettings: AiConnectionSettings;
}

export interface SyncedCustomerRequest extends CustomerRequest {
  synced_at?: ISODateTimeString | "";
}

export interface PublishedMenuCategory {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  sort_order: number;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
}

export interface PublishedMenuItem {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  image_url: string;
  is_available: boolean;
  is_featured: boolean;
  allergens: string[];
  tags: string[];
  sort_order: number;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
}

export interface PublishedQrMenu {
  categories: PublishedMenuCategory[];
  items: PublishedMenuItem[];
  updated_at: ISODateTimeString;
}

export interface AndroidOperationsSummary {
  pending_daily_tasks: number;
  today_tasks: number;
  available_rooms: number;
  total_rooms: number;
  available_tables: number;
  occupied_tables: number;
  bill_waiting_tables: number;
  active_table_orders: number;
  pending_reservations: number;
  prepared_whatsapp_messages: number;
  waiting_responses: number;
  active_menu_categories: number;
  available_menu_items: number;
  customer_count: number;
}

export interface AndroidSnapshotTask {
  id: string;
  title: string;
  description: string;
  task_type: string;
  status: string;
  due_date: string;
  due_time: string;
  related_type: string;
  related_id: string;
  updated_at: ISODateTimeString | "";
}

export interface AndroidOperationsSnapshot {
  summary: AndroidOperationsSummary;
  daily_tasks: AndroidSnapshotTask[];
  requests: AndroidSnapshotRequest[];
  customers: AndroidSnapshotCustomer[];
  reservations: AndroidSnapshotReservation[];
  rooms: AndroidSnapshotRoom[];
  tables: AndroidSnapshotTable[];
  menu: PublishedQrMenu;
  table_orders: AndroidSnapshotTableOrder[];
  messages: AndroidSnapshotMessage[];
  updated_at: ISODateTimeString | "";
}

export interface AndroidSnapshotRequest {
  id: string;
  customer_id: string;
  request_type: string;
  status: string;
  customer_name: string;
  customer_phone: string;
  date_text: string;
  start_date: string;
  end_date: string;
  time: string;
  guest_count: number;
  message: string;
  ai_summary: string;
  ai_suggested_reply: string;
  whatsapp_message: string;
  priority: string;
  created_at: ISODateTimeString | "";
  updated_at: ISODateTimeString | "";
}

export interface AndroidSnapshotCustomer {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  notes: string;
  tags: string[];
  request_count: number;
  reservation_count: number;
  updated_at: ISODateTimeString | "";
}

export interface AndroidSnapshotReservation {
  id: string;
  request_id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  reservation_type: string;
  status: string;
  title: string;
  start_date: string;
  end_date: string;
  time: string;
  guest_count: number;
  room_ids: string[];
  table_ids: string[];
  notes: string;
  payment_status: string;
  updated_at: ISODateTimeString | "";
}

export interface AndroidSnapshotRoom {
  id: string;
  name: string;
  number: string;
  capacity: number;
  status: string;
  active_reservation_title: string;
  updated_at: ISODateTimeString | "";
}

export interface AndroidSnapshotTable {
  id: string;
  name: string;
  area: string;
  capacity: number;
  status: string;
  active_reservation_title: string;
  updated_at: ISODateTimeString | "";
}

export interface AndroidSnapshotTableOrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  product_name: string;
  unit_price: number;
  currency: string;
  quantity: number;
  line_total: number;
  status: string;
  updated_at: ISODateTimeString | "";
}

export interface AndroidSnapshotTableOrder {
  id: string;
  table_id: string;
  table_name: string;
  status: string;
  opened_at: ISODateTimeString | "";
  total: number;
  item_count: number;
  items: AndroidSnapshotTableOrderItem[];
  updated_at: ISODateTimeString | "";
}

export interface AndroidSnapshotMessage {
  id: string;
  request_id: string;
  customer_name: string;
  customer_phone: string;
  message: string;
  status: string;
  updated_at: ISODateTimeString | "";
}

export const ANDROID_ACTION_TYPES = [
  "customer_request_mark_answered",
  "customer_request_reopen",
  "customer_request_approve",
  "customer_request_reject",
  "customer_request_convert_to_reservation",
  "reservation_approve",
  "reservation_reject",
  "reservation_cancel",
  "room_status_update",
  "daily_task_complete",
  "daily_task_reopen",
  "daily_task_cancel",
  "table_status_update",
  "table_order_open",
  "table_order_add_item",
  "table_order_update_item_quantity",
  "table_order_remove_item",
  "table_order_set_status",
  "table_order_close"
] as const;

export type AndroidActionType = typeof ANDROID_ACTION_TYPES[number];
export type AndroidActionStatus = "pending" | "applied" | "failed";

export interface AndroidSyncAction {
  id: string;
  action_type: AndroidActionType;
  payload: Record<string, unknown>;
  created_at: ISODateTimeString;
  device_id: string;
  status: AndroidActionStatus;
  error_message: string;
  processed_at?: ISODateTimeString | "";
}

export interface PullAndroidActionsOptions extends SyncCoreConfig {
  limit?: number;
}

export interface MarkAndroidActionResultOptions extends SyncCoreConfig {
  actionId: string;
  status: Exclude<AndroidActionStatus, "pending">;
  errorMessage?: string;
}

export interface PullAndroidActionsSuccess {
  ok: true;
  message: string;
  actions: AndroidSyncAction[];
  count: number;
  pulled_at: ISODateTimeString;
}

export interface MarkAndroidActionResultSuccess {
  ok: true;
  message: string;
  action: AndroidSyncAction;
  updated_at: ISODateTimeString;
}

export interface SyncFailure {
  ok: false;
  message: string;
  status?: number;
  error?: string;
}

export interface PullRequestsSuccess {
  ok: true;
  message: string;
  requests: SyncedCustomerRequest[];
  count: number;
  pulled_at: ISODateTimeString;
}

export interface MarkRequestsSyncedSuccess {
  ok: true;
  message: string;
  updated_count: number;
  synced_at: ISODateTimeString;
  request_ids: string[];
  total_records: number;
}

export interface PushMenuSuccess {
  ok: true;
  message: string;
  published_at: ISODateTimeString;
  updated_at: ISODateTimeString;
  category_count: number;
  item_count: number;
}

export interface PushAndroidSnapshotSuccess {
  ok: true;
  message: string;
  published_at: ISODateTimeString;
  updated_at: ISODateTimeString;
  task_count: number;
}

export interface PushAiSettingsSuccess {
  ok: true;
  message: string;
  published_at: ISODateTimeString;
  enabled: boolean;
  provider: string;
  service: string;
  base_url: string;
  model: string;
  timeout_seconds: number;
  has_api_key: boolean;
}

export type PullRequestsResult = PullRequestsSuccess | SyncFailure;
export type MarkRequestsSyncedResult = MarkRequestsSyncedSuccess | SyncFailure;
export type PushMenuResult = PushMenuSuccess | SyncFailure;
export type PushAndroidSnapshotResult = PushAndroidSnapshotSuccess | SyncFailure;
export type PushAiSettingsResult = PushAiSettingsSuccess | SyncFailure;
export type PullAndroidActionsResult = PullAndroidActionsSuccess | SyncFailure;
export type MarkAndroidActionResultResult = MarkAndroidActionResultSuccess | SyncFailure;

export function createSyncEndpointUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  return `${normalizedBaseUrl}/api/sync.php`;
}

export async function pullRequests(options: PullRequestsOptions): Promise<PullRequestsResult> {
  return syncRequest<PullRequestsSuccess>(options, {
    action: "pull_requests",
    limit: options.limit ?? 50,
    include_synced: options.includeSynced ?? false
  });
}

export async function markRequestsSynced(options: MarkRequestsSyncedOptions): Promise<MarkRequestsSyncedResult> {
  return syncRequest<MarkRequestsSyncedSuccess>(options, {
    action: "mark_requests_synced",
    request_ids: options.requestIds
  });
}

export async function pushMenu(options: PushMenuOptions): Promise<PushMenuResult> {
  return syncRequest<PushMenuSuccess>(options, {
    action: "publish_menu",
    menu: options.menu
  });
}

export async function pushAndroidSnapshot(options: PushAndroidSnapshotOptions): Promise<PushAndroidSnapshotResult> {
  return syncRequest<PushAndroidSnapshotSuccess>(options, {
    action: "publish_android_snapshot",
    snapshot: options.snapshot
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
      body: JSON.stringify({
        ...body,
        sync_secret: config.syncSecret
      })
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
