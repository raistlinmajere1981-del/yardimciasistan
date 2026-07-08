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
  available_rooms: number;
  total_rooms: number;
  available_tables: number;
  pending_reservations: number;
  prepared_whatsapp_messages: number;
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
  updated_at: ISODateTimeString | "";
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

export type PullRequestsResult = PullRequestsSuccess | SyncFailure;
export type MarkRequestsSyncedResult = MarkRequestsSyncedSuccess | SyncFailure;
export type PushMenuResult = PushMenuSuccess | SyncFailure;
export type PushAndroidSnapshotResult = PushAndroidSnapshotSuccess | SyncFailure;

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
    const response = await fetcher(createSyncEndpointUrl(config.baseUrl), {
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
        message: typeof payload?.message === "string" ? payload.message : "Güncelleme sırasında bir sorun oldu."
      };
    }

    return payload as SuccessResult;
  } catch (error) {
    return {
      ok: false,
      message: "Bağlantı sırasında bir sorun oldu. İnternet bağlantısını kontrol edip tekrar deneyin.",
      error: error instanceof Error ? error.message : String(error)
    };
  }
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
