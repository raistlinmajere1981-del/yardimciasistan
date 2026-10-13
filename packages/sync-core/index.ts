import {
  type MarketingWebsiteProjection,
  type BusinessAiCatalog,
  type BusinessWebContext,
  type BusinessCapability,
  type CommerceOnlineCatalog,
  type DealerAccessProjection,
  type CommerceOrderBuyerSnapshot,
  type CommerceOrderDeliverySnapshot,
  type CustomerRequest,
  type ISODateTimeString,
  type MenuStockUnit,
  type RoomPublicCatalog,
  type TablePublicCatalog
} from "@yardimci-asistan/shared";
import type {
  AndroidActionType,
  AndroidDeviceRole,
  AndroidPermission
} from "./android-policy";


export interface SyncCoreConfig {
  baseUrl: string;
  syncSecret: string;
  fetchImpl?: typeof fetch;
}

export interface PublicationIdentity {
  clientId: string;
  sourceEpoch: number;
  sourceRevision: number;
  idempotencyKey: string;
}

export interface PublicationReceipt {
  publication_name: string;
  source_client_id: string;
  source_epoch: number;
  source_revision: number;
  idempotency_key: string;
  payload_hash: string;
  accepted: true;
  deduplicated: boolean;
  server_revision: number;
}

export interface PullRequestsOptions extends SyncCoreConfig {
  replayThroughSeq?: number;
  sourceEpoch?: number;
  limit?: number;
  includeSynced?: boolean;
  afterSeq?: number;
  clientId?: string;
}

/** Hosting inbox record; canonical business ownership remains in commerce.orders. */
interface WebOrderEnvelopeBase {
  previouslyAcknowledged?: boolean;
  id: string;
  items: Array<{ productId: string; quantity: number }>;
  delivery: CommerceOrderDeliverySnapshot;
  note?: string;
  createdAt: ISODateTimeString;
  syncSeq: number;
}
export type WebOrderEnvelope = WebOrderEnvelopeBase & (
  | { kind?: "guest"; buyer: CommerceOrderBuyerSnapshot }
  | { kind: "dealer"; dealerAccessId: string; accessRevision: number; catalogRevision?: string; buyer?: never }
);

export interface PullWebOrdersOptions extends SyncCoreConfig {
  replayThroughSeq?: number;
  sourceEpoch?: number;
  clientId: string;
  afterSeq: number;
  limit?: number;
}

export interface AcknowledgeWebOrdersOptions extends SyncCoreConfig {
  clientId: string;
  throughSeq: number;
}

export interface PullWebOrdersSuccess {
  ok: true;
  message: string;
  orders: WebOrderEnvelope[];
  count: number;
  next_cursor: number;
  has_more: boolean;
  pulled_at: ISODateTimeString;
  server_revision: number;
}

export interface AcknowledgeWebOrdersSuccess {
  ok: true;
  message: string;
  updated_count: number;
  acknowledged_cursor: number;
  acknowledged_at: ISODateTimeString;
  server_revision: number;
}

export type PullWebOrdersResult = PullWebOrdersSuccess | SyncFailure;
export type AcknowledgeWebOrdersResult = AcknowledgeWebOrdersSuccess | SyncFailure;

export interface MarkRequestsSyncedOptions extends SyncCoreConfig {
  requestIds: string[];
}

export interface AcknowledgeRequestsOptions extends SyncCoreConfig {
  clientId: string;
  throughSeq: number;
}

export interface DealerAccessPublicationSuccess extends PublicationReceipt {
  ok: true;
  message: string;
  published_at: ISODateTimeString;
  source_revision: number;
  server_revision: number;
  deduplicated: boolean;
}
export type DealerAccessPublicationResult = DealerAccessPublicationSuccess | SyncFailure;

export interface PushOnlineCatalogOptions extends SyncCoreConfig, PublicationIdentity {
  clientId: string;
  catalog: CommerceOnlineCatalog;
  sourceRevision: number;
  idempotencyKey: string;
}

export interface PushOnlineCatalogSuccess extends PublicationReceipt {
  ok: true;
  message: string;
  published_at: ISODateTimeString;
  product_count: number;
  source_revision: number;
  server_revision: number;
  deduplicated: boolean;
}

export type PushOnlineCatalogResult = PushOnlineCatalogSuccess | SyncFailure;

export interface PushMenuOptions extends SyncCoreConfig, PublicationIdentity {
  menu: PublishedQrMenu;
}

export interface PushAndroidSnapshotOptions extends SyncCoreConfig, PublicationIdentity {
  snapshot: AndroidOperationsSnapshot;
}

export interface SyncCapabilitiesOptions extends SyncCoreConfig {}
export interface ResetHostingRuntimeOptions extends SyncCoreConfig {}

export interface AiConnectionSettings {
  enabled: boolean;
  provider: string;
  service: string;
  baseUrl: string;
  model: string;
  sttModel?: string;
  apiKey: string;
  timeoutSeconds: number;
}

export interface PushAiSettingsOptions extends SyncCoreConfig, PublicationIdentity {
  aiSettings: AiConnectionSettings;
}

export interface PushBusinessContextOptions extends SyncCoreConfig, PublicationIdentity {
  clientId: string;
  context: BusinessWebContext;
}

export interface PushRoomCatalogOptions extends SyncCoreConfig, PublicationIdentity {
  clientId: string;
  catalog: RoomPublicCatalog;
}

export interface PushTableCatalogOptions extends SyncCoreConfig, PublicationIdentity {
  clientId: string;
  catalog: TablePublicCatalog;
}

export interface PushAiCatalogOptions extends SyncCoreConfig, PublicationIdentity {
  clientId: string;
  catalog: BusinessAiCatalog;
}

export interface SyncedCustomerRequest extends CustomerRequest {
  synced_at?: ISODateTimeString | "";
  sync_seq?: number;
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
  /** Admin projections retain inactive canonical products so their channel can be managed. */
  product_is_active?: boolean;
  /** Channel entry identity. Internal snapshots also carry canonical product_id. */
  id: string;
  product_id?: string;
  price_override?: number | null;
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
  stock_quantity: number | null;
  stock_min_quantity: number | null;
  stock_unit: MenuStockUnit;
  stock_consumption_quantity: number;
  hide_when_out_of_stock: boolean;
  stock_note: string | null;
  sort_order: number;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
}

export interface PublishedQrMenu {
  /** Web QR menu publication visibility; omitted payloads remain visible for compatibility. */
  enabled?: boolean;
  categories: PublishedMenuCategory[];
  items: PublishedMenuItem[];
  updated_at: ISODateTimeString;
}

export interface AndroidOperationsSummary {
  pending_commerce_orders?: number;
  open_commerce_orders?: number;
  pending_shipments?: number;
  online_catalog_pending?: number;
  recent_failed_marketing_operations?: number;
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

export type AndroidReportPresetKey = "today" | "yesterday" | "last7" | "last30";

export interface AndroidReportTopItem {
  name: string;
  quantity: number;
  revenue: number;
}

export interface AndroidReportAttentionItem {
  kind: string;
  title: string;
  detail: string;
}

export interface AndroidReportSnapshot {
  period: {
    key: AndroidReportPresetKey;
    label: string;
    start: string;
    end: string;
  };
  summary: {
    restaurant_revenue: number;
    closed_orders: number;
    average_order: number;
    approved_reservations: number;
    approved_accommodation_reservations?: number;
    approved_food_reservations?: number;
    approved_mixed_reservations?: number;
    approved_generic_reservations?: number;
    new_requests: number;
    attention_count: number;
  };
  restaurant: {
    sold_item_count: number;
    cancelled_orders: number;
    top_items: AndroidReportTopItem[];
    daily_revenue: Array<{
      date: string;
      revenue: number;
      closed_orders: number;
    }>;
  };
  attention: {
    pending_requests: number;
    pending_reservations: number;
    payment_waiting_tables: number;
    overdue_tasks: number;
    incomplete_tasks: number;
    out_of_stock_items: number;
    low_stock_items: number;
    items: AndroidReportAttentionItem[];
  };
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
  /** Domain hint retained when the related reservation itself is projected out. */
  related_reservation_type?: string;
  updated_at: ISODateTimeString | "";
}

export interface AndroidFinanceEntry {
  id: string;
  direction: "income" | "expense";
  amount_minor: number;
  currency: string;
  payment_method: string;
  category: string;
  description: string;
  occurred_at: ISODateTimeString | "";
  source_type: string;
  source_id: string;
  note: string;
  created_at: ISODateTimeString | "";
}

export interface AndroidFinanceSnapshot {
  generated_at: ISODateTimeString | "";
  currency: string;
  today_income_minor: number;
  today_expense_minor: number;
  today_net_minor: number;
  outstanding_pension_minor: number;
  recent_entries: AndroidFinanceEntry[];
}

export interface AndroidRoomFolioSnapshot {
  id: string;
  stay_id: string;
  room_id: string;
  room_name: string;
  room_number: string;
  customer_id: string;
  customer_name: string;
  status: "open" | "closed";
  guest_count: number;
  check_in_date: string;
  planned_check_out_date: string;
  nights: number;
  nightly_price_minor: number;
  currency: string;
  lodging_total_minor: number;
  extras_total_minor: number;
  charge_total_minor: number;
  paid_total_minor: number;
  remaining_minor: number;
  opened_at: ISODateTimeString | "";
}

export interface AndroidMarketStockAdjustment {
  id: string;
  product_id: string;
  product_name: string;
  type: "count" | "adjust";
  quantity_delta: number;
  quantity_after: number;
  note: string;
  created_at: ISODateTimeString | "";
}

export interface AndroidMarketSummary {
  today_sale_count: number;
  today_sales_total: number;
  currency: string;
  critical_stock_count: number;
  recent_stock_adjustments: AndroidMarketStockAdjustment[];
  recent_receiving_count: number;
}

export interface AndroidMarketProductDataSettings {
  enabled: boolean;
  provider: string;
  auto_search_unknown_barcode: boolean;
  include_images: boolean;
}

export interface AndroidMarketProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  unit: string;
  sale_price: number;
  currency: string;
  is_active: boolean;
  track_inventory: boolean;
  current_quantity: number;
  minimum_quantity: number;
  inventory_updated_at: ISODateTimeString | "";
  image_source_url: string;
  data_source: string;
}

export interface AndroidMarketSupplier {
  id: string;
  name: string;
  is_active: boolean;
}

export interface AndroidMarketPurchase {
  id: string;
  supplier_id: string;
  supplier_name: string;
  status: "received";
  received_at: ISODateTimeString | "";
  total: number;
  currency: string;
  line_count: number;
}

export interface AndroidMarketCartDraftLine {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
}

export interface AndroidMarketCartDraft {
  id: string;
  status: "pending" | "reviewed";
  source: string;
  created_by_device: string;
  note: string;
  lines: AndroidMarketCartDraftLine[];
  created_at: ISODateTimeString | "";
  updated_at: ISODateTimeString | "";
}

export interface AndroidMarketSnapshot {
  product_data: AndroidMarketProductDataSettings;
  summary: AndroidMarketSummary;
  products: AndroidMarketProduct[];
  suppliers: AndroidMarketSupplier[];
  recent_purchases: AndroidMarketPurchase[];
  cart_drafts: AndroidMarketCartDraft[];
}

export interface AndroidOperationsSnapshot {
  /** Safe saved STT readiness hint; omitted by old snapshots, never an upload authority. */
  voice?: { stt_available: boolean };
  /** Companion v3 additions are optional for legacy publications/clients. */
  commerce?: import("./android-companion").AndroidCommerceSnapshot;
  marketing?: import("./android-companion").AndroidMarketingSnapshot;
  /** Persisted runtime capabilities used by desktop projection and Android UI. */
  business_capabilities: BusinessCapability[];
  /** Whether same-LAN desktop discovery and direct transport may be used. */
  local_network_enabled?: boolean;
  summary: AndroidOperationsSummary;
  daily_tasks: AndroidSnapshotTask[];
  requests: AndroidSnapshotRequest[];
  customers: AndroidSnapshotCustomer[];
  customer_room_stays: AndroidSnapshotCustomerRoomStay[];
  room_folios: AndroidRoomFolioSnapshot[];
  reservations: AndroidSnapshotReservation[];
  rooms: AndroidSnapshotRoom[];
  tables: AndroidSnapshotTable[];
  menu: PublishedQrMenu;
  admin_menu: PublishedQrMenu;
  /** Safe canonical discovery for Menu linking; no purchasing/private product metadata. */
  menu_product_candidates?: Array<{ product_id: string; name: string; unit: MenuStockUnit; sale_price: number; currency: string }>;
  deleted_request_ids: string[];
  trackedStockItems: AndroidTrackedStockItem[];
  appliedStockImageHashes: string[];
  table_orders: AndroidSnapshotTableOrder[];
  messages: AndroidSnapshotMessage[];
  androidPermissions: Record<string, AndroidSnapshotPermissionProfile>;
  finance: AndroidFinanceSnapshot;
  reports: Record<AndroidReportPresetKey, AndroidReportSnapshot>;
  market: AndroidMarketSnapshot;
  updated_at: ISODateTimeString | "";
}

export interface AndroidSnapshotPermissionProfile {
  role: AndroidDeviceRole;
  is_active: boolean;
  permissions: AndroidPermission[];
}

export interface AndroidDeviceSighting {
  device_id: string;
  device_name: string;
  app_version: string;
  first_seen_at: ISODateTimeString | "";
  last_seen_at: ISODateTimeString | "";
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
  identity_type: string;
  identity_number: string;
  nationality: string;
  birth_date: string;
  gender: string;
  document_serial_number: string;
  document_expiry_date: string;
  birth_place: string;
  mother_name: string;
  father_name: string;
  issuing_authority: string;
  address: string;
  request_count: number;
  reservation_count: number;
  stay_count: number;
  updated_at: ISODateTimeString | "";
}

export interface AndroidSnapshotCustomerRoomStay {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  room_id: string;
  room_name: string;
  room_number: string;
  reservation_id: string;
  status: string;
  check_in_date: string;
  check_out_date: string;
  guest_count: number;
  notes: string;
  source: string;
  checked_in_at: ISODateTimeString | "";
  checked_out_at: ISODateTimeString | "";
  created_at: ISODateTimeString | "";
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
  product_id: string;
  menu_entry_id: string;
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

export type AndroidStockStatus = "out_of_stock" | "low_stock" | "in_stock";

export interface AndroidTrackedStockItem {
  product_id: string;
  menu_entry_id: string;
  name: string;
  category: string;
  price: number;
  stock_quantity: number;
  stock_min_quantity: number | null;
  stock_unit: MenuStockUnit;
  stock_consumption_quantity: number;
  hide_when_out_of_stock: boolean;
  stock_status: AndroidStockStatus;
}

export type AndroidActionStatus = "pending" | "applied" | "failed";

export interface AndroidSyncAction {
  id: string;
  action_type: AndroidActionType;
  payload: Record<string, unknown>;
  created_at: ISODateTimeString;
  device_id: string;
  device_name?: string;
  app_version?: string;
  last_seen_at?: ISODateTimeString | "";
  status: AndroidActionStatus;
  error_message: string;
  processed_at?: ISODateTimeString | "";
}

export interface AndroidMarketStockCountPayload {
  product_id: string;
  counted_quantity: number;
  note?: string;
  expected_updated_at?: ISODateTimeString | "";
}

export interface AndroidMarketPurchaseReceivePayload {
  supplier_id?: string;
  note?: string;
  ordered_at?: ISODateTimeString | "";
  lines: Array<{
    product_id: string;
    quantity: number;
    unit_cost: number;
  }>;
}

export interface AndroidMarketProductCreatePayload {
  barcode: string;
  name: string;
  brand?: string;
  sku?: string;
  category?: string;
  purchase_price?: number;
  sale_price?: number;
  currency?: string;
  unit?: string;
  track_inventory?: boolean;
  note?: string;
  image_source_url?: string;
  data_source?: string;
  source_product_url?: string;
  data_license?: string;
  image_license?: string;
  source_fetched_at?: ISODateTimeString | "";
}

export interface AndroidMarketCartDraftCreatePayload {
  note?: string;
  lines: Array<{
    product_id: string;
    quantity: number;
  }>;
}

export interface AndroidMarketBarcodeScanPayload {
  barcode: string;
  scanned_at: ISODateTimeString;
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
  devices: AndroidDeviceSighting[];
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
  next_cursor?: number;
  has_more?: boolean;
  server_revision?: number;
}

export interface AcknowledgeRequestsSuccess {
  ok: true;
  message: string;
  updated_count: number;
  acknowledged_cursor: number;
  acknowledged_at: ISODateTimeString;
  server_revision: number;
}

export interface MarkRequestsSyncedSuccess {
  ok: true;
  message: string;
  updated_count: number;
  synced_at: ISODateTimeString;
  request_ids: string[];
  total_records: number;
}

export interface PushMenuSuccess extends PublicationReceipt {
  ok: true;
  message: string;
  published_at: ISODateTimeString;
  updated_at: ISODateTimeString;
  category_count: number;
  item_count: number;
}

export interface PushAndroidSnapshotSuccess extends PublicationReceipt {
  ok: true;
  message: string;
  published_at: ISODateTimeString;
  updated_at: ISODateTimeString;
  task_count: number;
}

export interface SyncCapabilitiesSuccess {
  ok: true;
  message: string;
  protocol_version: number;
  storage: string;
  features: string[];
  server_time: ISODateTimeString;
  server_revision: number;
}

export interface ResetHostingRuntimeSuccess {
  ok: true;
  message: string;
  reset_at: ISODateTimeString;
  deleted: Record<string, number>;
  server_revision: number;
}

export interface PushAiSettingsSuccess extends PublicationReceipt {
  ok: true;
  message: string;
  published_at: ISODateTimeString;
  enabled: boolean;
  provider: string;
  service: string;
  base_url: string;
  model: string;
  stt_model: string;
  timeout_seconds: number;
  has_api_key: boolean;
}

export interface PushBusinessContextSuccess extends PublicationReceipt {
  ok: true;
  message: string;
  published_at: ISODateTimeString;
  profile_id: string;
}

export interface PushRoomCatalogSuccess extends PublicationReceipt {
  ok: true;
  message: string;
  published_at: ISODateTimeString;
  room_count: number;
}

export interface PushTableCatalogSuccess extends PublicationReceipt {
  ok: true;
  message: string;
  published_at: ISODateTimeString;
  table_count: number;
}

export interface PushAiCatalogSuccess extends PublicationReceipt {
  ok: true;
  message: string;
  published_at: ISODateTimeString;
  item_count: number;
}

export type PullRequestsResult = PullRequestsSuccess | SyncFailure;
export type MarkRequestsSyncedResult = MarkRequestsSyncedSuccess | SyncFailure;
export type AcknowledgeRequestsResult = AcknowledgeRequestsSuccess | SyncFailure;
export type PushMenuResult = PushMenuSuccess | SyncFailure;
export type PushAndroidSnapshotResult = PushAndroidSnapshotSuccess | SyncFailure;
export type PushAiSettingsResult = PushAiSettingsSuccess | SyncFailure;
export type PushBusinessContextResult = PushBusinessContextSuccess | SyncFailure;
export type PushRoomCatalogResult = PushRoomCatalogSuccess | SyncFailure;
export type PushTableCatalogResult = PushTableCatalogSuccess | SyncFailure;
export type PushAiCatalogResult = PushAiCatalogSuccess | SyncFailure;
export type PullAndroidActionsResult = PullAndroidActionsSuccess | SyncFailure;
export type MarkAndroidActionResultResult = MarkAndroidActionResultSuccess | SyncFailure;
export type SyncCapabilitiesResult = SyncCapabilitiesSuccess | SyncFailure;
export type ResetHostingRuntimeResult = ResetHostingRuntimeSuccess | SyncFailure;

export interface PullCursorInput {
  replayThroughSeq?: number;
  afterSeq: number;
  limit?: number;
}

export interface WebOrderAcknowledgement {
  throughSeq: number;
}

export interface RequestAcknowledgement {
  throughSeq: number;
}

export interface PullActionsInput {
  limit?: number;
}

export interface ActionCompletion {
  actionId: string;
  status: Exclude<AndroidActionStatus, "pending">;
  errorMessage?: string;
}

export interface VersionedPublication<T> {
  sourceRevision: number;
  idempotencyKey: string;
  value: T;
}

export const LOCAL_COMPANION_PROTOCOL_VERSION = 1;
export const LOCAL_COMPANION_SERVICE_TYPE = "_yardimciasistan._tcp";
export const LOCAL_COMPANION_API_PREFIX = "/local/v1";
export const LOCAL_COMPANION_ENDPOINTS = {
  status: `${LOCAL_COMPANION_API_PREFIX}/status`,
  summary: `${LOCAL_COMPANION_API_PREFIX}/summary`,
  action: `${LOCAL_COMPANION_API_PREFIX}/action`,
  pair: `${LOCAL_COMPANION_API_PREFIX}/pair`
} as const;
export const LOCAL_COMPANION_DEVICE_ID_HEADER = "X-YA-Device-Id";
export const LOCAL_COMPANION_TOKEN_HEADER = "X-YA-Local-Token";

export type CompanionTransportKind = "local" | "hosting";

export interface LocalCompanionServiceDescriptor {
  protocolVersion: number;
  desktopId: string;
}

/**
 * Stable cache/outbox namespace. Network address and port are deliberately not
 * part of local identity; desktopId survives DHCP and listener port changes.
 */
export function createCompanionSourceKey(kind: CompanionTransportKind, sourceId: string): string {
  const normalized = kind === "hosting"
    ? sourceId.trim().replace(/\/+$/, "")
    : sourceId.trim();
  return normalized ? `${kind}:${normalized}` : "";
}

export interface SyncTransport {
  getCapabilities(): Promise<SyncCapabilitiesResult>;
  pullWebOrders(input: PullCursorInput): Promise<PullWebOrdersResult>;
  acknowledgeWebOrders(input: WebOrderAcknowledgement): Promise<AcknowledgeWebOrdersResult>;
  pullRequests(input: PullCursorInput): Promise<PullRequestsResult>;
  acknowledgeRequests(input: RequestAcknowledgement): Promise<AcknowledgeRequestsResult>;
  pullAndroidActions(input?: PullActionsInput): Promise<PullAndroidActionsResult>;
  completeAndroidAction(input: ActionCompletion): Promise<MarkAndroidActionResultResult>;
  publishMarketingWebsite?(input: VersionedPublication<MarketingWebsiteProjection>): Promise<DealerAccessPublicationResult>;
  publishDealerAccess?(input: VersionedPublication<DealerAccessProjection>): Promise<DealerAccessPublicationResult>;
  publishOnlineCatalog(input: VersionedPublication<CommerceOnlineCatalog>): Promise<PushOnlineCatalogResult>;
  publishMenu(input: VersionedPublication<PublishedQrMenu>): Promise<PushMenuResult>;
  publishAndroidSnapshot(input: VersionedPublication<AndroidOperationsSnapshot>): Promise<PushAndroidSnapshotResult>;
}

export interface PhpHostingSyncTransportConfig extends SyncCoreConfig {
  clientId: string;
  sourceEpoch: number;
}

export {
  PhpHostingSyncTransport,
  acknowledgeRequests,
  acknowledgeWebOrders,
  pullWebOrders,
  createSyncEndpointUrl,
  getSyncCapabilities,
  markAndroidActionResult,
  markRequestsSynced,
  pullAndroidActions,
  pullRequests,
  pushAiCatalog,
  pushAiSettings,
  pushAndroidSnapshot,
  pushBusinessContext,
  pushMenu,
  pushOnlineCatalog,
  pushRoomCatalog,
  pushTableCatalog,
  resetHostingRuntime
} from "./hosting-transport";

export { activatePublicationSource, readRestoreSyncState, pushAvailability, pushGoogleReviewsSettings } from "./hosting-transport";

export {
  ANDROID_ACTION_PERMISSION_MAP,
  ANDROID_ACTION_TYPES,
  ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS,
  ANDROID_PERMISSIONS,
  ANDROID_PERMISSION_CAPABILITY_REQUIREMENTS,
  ANDROID_PERMISSION_GROUP_IDS,
  ANDROID_PERMISSION_GROUP_PERMISSIONS,
  ANDROID_STAFF_PERMISSIONS,
  androidActionAllowedByCapabilities,
  androidAvailablePermissionGroupIds,
  androidEffectivePermissions,
  androidEffectivePermissionsForGroups,
  androidEffectivePermissionsForRole,
  androidPermissionAllowedByCapabilities,
  androidPermissionsForGroups,
  androidTaskAllowedByCapabilities,
  resolveAndroidActionPermission
} from "./android-policy";

export type {
  AndroidActionCapabilityContext,
  AndroidActionType,
  AndroidDeviceRole,
  AndroidPermission,
  AndroidPermissionCapabilityRequirement,
  AndroidPermissionGroupId,
  AndroidPermissionGroups
} from "./android-policy";

export * from "./android-companion";
