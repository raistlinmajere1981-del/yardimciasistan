import {
  BUSINESS_CAPABILITIES,
  canConvertRequestToReservation,
  isOperationalTaskAvailable,
  isReservationTypeAvailable,
  type BusinessAiCatalog,
  type BusinessAiContext,
  type BusinessCapability,
  type CustomerRequest,
  type ISODateTimeString,
  type MenuStockUnit,
  type RoomPublicCatalog,
  type TablePublicCatalog
} from "@yardimci-asistan/shared";

export interface SyncCoreConfig {
  baseUrl: string;
  syncSecret: string;
  fetchImpl?: typeof fetch;
}

export interface PullRequestsOptions extends SyncCoreConfig {
  limit?: number;
  includeSynced?: boolean;
  afterSeq?: number;
  clientId?: string;
}

export interface MarkRequestsSyncedOptions extends SyncCoreConfig {
  requestIds: string[];
}

export interface AcknowledgeRequestsOptions extends SyncCoreConfig {
  clientId: string;
  throughSeq: number;
}

export interface PushMenuOptions extends SyncCoreConfig {
  menu: PublishedQrMenu;
  clientId?: string;
  sourceRevision?: number;
  idempotencyKey?: string;
}

export interface PushAndroidSnapshotOptions extends SyncCoreConfig {
  snapshot: AndroidOperationsSnapshot;
  clientId?: string;
  sourceRevision?: number;
  idempotencyKey?: string;
}

export interface SyncCapabilitiesOptions extends SyncCoreConfig {}
export interface ResetHostingRuntimeOptions extends SyncCoreConfig {}

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

export interface PushBusinessContextOptions extends SyncCoreConfig {
  clientId: string;
  context: BusinessAiContext;
}

export interface PushRoomCatalogOptions extends SyncCoreConfig {
  clientId: string;
  catalog: RoomPublicCatalog;
}

export interface PushTableCatalogOptions extends SyncCoreConfig {
  clientId: string;
  catalog: TablePublicCatalog;
}

export interface PushAiCatalogOptions extends SyncCoreConfig {
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

export type AndroidDeviceRole = "admin" | "staff";

export const ANDROID_PERMISSIONS = [
  "customer.view",
  "customer.manage",
  "customer.respond",
  "customer.mark_answered",
  "customer.reject",
  "customer.convert_to_reservation",
  "customer.delete",
  "request.delete",
  "reservation.view",
  "reservation.create",
  "reservation.update",
  "reservation.approve",
  "reservation.reject",
  "reservation.cancel",
  "room.view",
  "room.update_status",
  "room.assign_customer",
  "room_folio.view",
  "room_folio.payment",
  "room_folio.checkout",
  "daily_task.view",
  "daily_task.create",
  "daily_task.update",
  "daily_task.delete",
  "daily_task.complete",
  "daily_task.reopen",
  "table.view",
  "table.update_status",
  "table_order.view",
  "table_order.open",
  "table_order.add_item",
  "table_order.update_item",
  "table_order.remove_item",
  "table_order.set_preparing",
  "table_order.set_served",
  "table_order.set_payment_waiting",
  "table_order.close_paid",
  "table_order.cancel",
  "menu.view",
  "menu.edit",
  "menu.delete",
  "menu.stock_view",
  "menu.stock_update",
  "finance.view",
  "finance.create",
  "settings.view",
  "settings.edit",
  "message.delete",
  "android_devices.view",
  "android_devices.manage",
  "market.summary.view",
  "market.product.view",
  "market.stock_count",
  "market.receiving",
  "market.product_create",
  "market.cart_draft",
  "market.scan_to_desktop"
] as const;

export type AndroidPermission = typeof ANDROID_PERMISSIONS[number];

export const ANDROID_PERMISSION_GROUP_IDS = [
  "service_orders",
  "cashier",
  "rooms_tasks",
  "customer_reservation",
  "market_operations"
] as const;

export type AndroidPermissionGroupId = typeof ANDROID_PERMISSION_GROUP_IDS[number];
export type AndroidPermissionGroups = Record<AndroidPermissionGroupId, boolean>;

export const ANDROID_PERMISSION_GROUP_PERMISSIONS: Readonly<Record<AndroidPermissionGroupId, readonly AndroidPermission[]>> = {
  service_orders: [
    "table.view",
    "table.update_status",
    "table_order.view",
    "table_order.open",
    "table_order.add_item",
    "table_order.update_item",
    "table_order.remove_item",
    "table_order.set_preparing",
    "table_order.set_served",
    "table_order.set_payment_waiting",
    "menu.view",
    "menu.stock_view"
  ],
  cashier: [
    "table.view",
    "table_order.view",
    "table_order.set_payment_waiting",
    "table_order.close_paid",
    "menu.stock_view",
    "finance.view",
    "finance.create",
    "room_folio.view",
    "room_folio.payment"
  ],
  rooms_tasks: [
    "room.view",
    "room.update_status",
    "room_folio.view",
    "room_folio.checkout",
    "daily_task.view",
    "daily_task.create",
    "daily_task.update",
    "daily_task.complete",
    "daily_task.reopen"
  ],
  customer_reservation: [
    "customer.view",
    "customer.respond",
    "customer.mark_answered",
    "reservation.view",
    "reservation.create",
    "reservation.update",
    "reservation.approve"
  ],
  market_operations: [
    "market.summary.view",
    "market.product.view",
    "market.stock_count",
    "market.receiving",
    "market.product_create",
    "market.cart_draft",
    "market.scan_to_desktop"
  ]
};

export const ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS: Readonly<AndroidPermissionGroups> = {
  service_orders: true,
  cashier: false,
  rooms_tasks: true,
  customer_reservation: false,
  market_operations: false
};

export function androidPermissionsForGroups(groups: AndroidPermissionGroups): AndroidPermission[] {
  const permissions = ANDROID_PERMISSION_GROUP_IDS.flatMap((groupId) =>
    groups[groupId] ? ANDROID_PERMISSION_GROUP_PERMISSIONS[groupId] : []
  );
  return [...new Set(permissions)];
}

const C = BUSINESS_CAPABILITIES;

export interface AndroidPermissionCapabilityRequirement {
  allOf?: readonly BusinessCapability[];
  anyOf?: readonly BusinessCapability[];
}

const ANDROID_RESERVATION_CAPABILITIES = [
  C.ACCOMMODATION_RESERVATIONS,
  C.FOOD_RESERVATIONS
] as const;

const ANDROID_MARKET_CAPABILITIES = [
  C.CATALOG,
  C.INVENTORY,
  C.SALES,
  C.RETAIL_BARCODE,
  C.RETAIL_PURCHASING,
  C.RETAIL_SUPPLIERS
] as const;

const ANDROID_ACCOMMODATION_FOOD_CAPABILITIES = [
  C.ACCOMMODATION_ROOMS,
  C.ACCOMMODATION_RESERVATIONS,
  C.ACCOMMODATION_STAYS,
  C.ACCOMMODATION_FOLIO,
  C.FOOD_TABLES,
  C.FOOD_RESERVATIONS,
  C.FOOD_ORDERS,
  C.FOOD_MENU
] as const;

/**
 * Coarse permission exposure policy. Actions that share a generic permission
 * across domains (reservations and scoped tasks) receive a second, contextual
 * check through androidActionAllowedByCapabilities.
 */
export const ANDROID_PERMISSION_CAPABILITY_REQUIREMENTS: Readonly<Record<AndroidPermission, AndroidPermissionCapabilityRequirement>> = {
  "customer.view": { allOf: [C.CUSTOMERS] },
  "customer.manage": { allOf: [C.CUSTOMERS] },
  "customer.respond": { allOf: [C.CUSTOMERS, C.REQUESTS] },
  "customer.mark_answered": { allOf: [C.CUSTOMERS, C.REQUESTS] },
  "customer.reject": { allOf: [C.CUSTOMERS, C.REQUESTS] },
  "customer.convert_to_reservation": { allOf: [C.CUSTOMERS, C.REQUESTS], anyOf: ANDROID_RESERVATION_CAPABILITIES },
  "customer.delete": { allOf: [C.CUSTOMERS] },
  "request.delete": { allOf: [C.CUSTOMERS, C.REQUESTS] },
  "reservation.view": { anyOf: ANDROID_RESERVATION_CAPABILITIES },
  "reservation.create": { anyOf: ANDROID_RESERVATION_CAPABILITIES },
  "reservation.update": { anyOf: ANDROID_RESERVATION_CAPABILITIES },
  "reservation.approve": { anyOf: ANDROID_RESERVATION_CAPABILITIES },
  "reservation.reject": { anyOf: ANDROID_RESERVATION_CAPABILITIES },
  "reservation.cancel": { anyOf: ANDROID_RESERVATION_CAPABILITIES },
  "room.view": { allOf: [C.ACCOMMODATION_ROOMS] },
  "room.update_status": { allOf: [C.ACCOMMODATION_ROOMS] },
  "room.assign_customer": { allOf: [C.CUSTOMERS, C.ACCOMMODATION_STAYS] },
  "room_folio.view": { allOf: [C.ACCOMMODATION_FOLIO] },
  "room_folio.payment": { allOf: [C.ACCOMMODATION_FOLIO] },
  "room_folio.checkout": { allOf: [C.ACCOMMODATION_FOLIO] },
  "daily_task.view": { allOf: [C.TASKS] },
  "daily_task.create": { allOf: [C.TASKS] },
  "daily_task.update": { allOf: [C.TASKS] },
  "daily_task.delete": { allOf: [C.TASKS] },
  "daily_task.complete": { allOf: [C.TASKS] },
  "daily_task.reopen": { allOf: [C.TASKS] },
  "table.view": { allOf: [C.FOOD_TABLES] },
  "table.update_status": { allOf: [C.FOOD_TABLES] },
  "table_order.view": { allOf: [C.FOOD_ORDERS] },
  "table_order.open": { allOf: [C.FOOD_ORDERS] },
  "table_order.add_item": { allOf: [C.FOOD_ORDERS, C.FOOD_MENU] },
  "table_order.update_item": { allOf: [C.FOOD_ORDERS] },
  "table_order.remove_item": { allOf: [C.FOOD_ORDERS] },
  "table_order.set_preparing": { allOf: [C.FOOD_ORDERS] },
  "table_order.set_served": { allOf: [C.FOOD_ORDERS] },
  "table_order.set_payment_waiting": { allOf: [C.FOOD_ORDERS] },
  "table_order.close_paid": { allOf: [C.FOOD_ORDERS] },
  "table_order.cancel": { allOf: [C.FOOD_ORDERS] },
  "menu.view": { allOf: [C.FOOD_MENU] },
  "menu.edit": { allOf: [C.FOOD_MENU] },
  "menu.delete": { allOf: [C.FOOD_MENU] },
  "menu.stock_view": { allOf: [C.FOOD_MENU, C.INVENTORY] },
  "menu.stock_update": { allOf: [C.FOOD_MENU, C.INVENTORY] },
  "finance.view": { allOf: [C.FINANCE] },
  "finance.create": { allOf: [C.FINANCE] },
  "settings.view": { allOf: [C.DEVICES] },
  "settings.edit": { allOf: [C.DEVICES] },
  "message.delete": { allOf: [C.CUSTOMERS, C.WHATSAPP] },
  "android_devices.view": { allOf: [C.DEVICES] },
  "android_devices.manage": { allOf: [C.DEVICES] },
  "market.summary.view": { anyOf: ANDROID_MARKET_CAPABILITIES },
  "market.product.view": { allOf: [C.CATALOG] },
  "market.stock_count": { allOf: [C.INVENTORY] },
  "market.receiving": { allOf: [C.RETAIL_PURCHASING] },
  "market.product_create": { allOf: [C.CATALOG] },
  "market.cart_draft": { allOf: [C.SALES, C.CATALOG] },
  "market.scan_to_desktop": { allOf: [C.RETAIL_BARCODE, C.CATALOG, C.SALES] }
};

function capabilityRequirementSatisfied(
  requirement: AndroidPermissionCapabilityRequirement,
  enabled: ReadonlySet<BusinessCapability>
): boolean {
  return (requirement.allOf ?? []).every((capability) => enabled.has(capability))
    && (!(requirement.anyOf?.length) || requirement.anyOf.some((capability) => enabled.has(capability)));
}

export function androidPermissionAllowedByCapabilities(
  permission: AndroidPermission,
  capabilities: Iterable<BusinessCapability>
): boolean {
  const enabled = capabilities instanceof Set ? capabilities : new Set(capabilities);
  return enabled.has(C.ANDROID)
    && capabilityRequirementSatisfied(ANDROID_PERMISSION_CAPABILITY_REQUIREMENTS[permission], enabled);
}

export function androidEffectivePermissions(
  grantedPermissions: Iterable<AndroidPermission>,
  capabilities: Iterable<BusinessCapability>
): AndroidPermission[] {
  const enabled = capabilities instanceof Set ? capabilities : new Set(capabilities);
  return [...new Set(grantedPermissions)]
    .filter((permission) => androidPermissionAllowedByCapabilities(permission, enabled));
}

export function androidEffectivePermissionsForGroups(
  groups: AndroidPermissionGroups,
  capabilities: Iterable<BusinessCapability>
): AndroidPermission[] {
  return androidEffectivePermissions(androidPermissionsForGroups(groups), capabilities);
}

export function androidEffectivePermissionsForRole(
  role: AndroidDeviceRole,
  storedPermissions: Iterable<AndroidPermission>,
  capabilities: Iterable<BusinessCapability>
): AndroidPermission[] {
  const granted = role === "admin" ? ANDROID_PERMISSIONS : storedPermissions;
  return androidEffectivePermissions(granted, capabilities);
}

export function androidAvailablePermissionGroupIds(
  capabilities: Iterable<BusinessCapability>
): AndroidPermissionGroupId[] {
  const enabled = capabilities instanceof Set ? capabilities : new Set(capabilities);
  if (!enabled.has(C.ANDROID)) return [];

  const hasMarketOperations = ANDROID_MARKET_CAPABILITIES.some((capability) => enabled.has(capability));
  const isRetailOnly = hasMarketOperations
    && !ANDROID_ACCOMMODATION_FOOD_CAPABILITIES.some((capability) => enabled.has(capability));

  return ANDROID_PERMISSION_GROUP_IDS.filter((groupId) => {
    if (isRetailOnly && groupId !== "market_operations") return false;
    switch (groupId) {
      case "service_orders":
        return enabled.has(C.FOOD_TABLES) || enabled.has(C.FOOD_ORDERS) || enabled.has(C.FOOD_MENU);
      case "cashier":
        return enabled.has(C.FINANCE) || enabled.has(C.ACCOMMODATION_FOLIO) || enabled.has(C.FOOD_ORDERS);
      case "rooms_tasks":
        return enabled.has(C.TASKS)
          || enabled.has(C.ACCOMMODATION_ROOMS)
          || enabled.has(C.ACCOMMODATION_STAYS)
          || enabled.has(C.ACCOMMODATION_FOLIO);
      case "customer_reservation":
        return enabled.has(C.CUSTOMERS)
          || ANDROID_RESERVATION_CAPABILITIES.some((capability) => enabled.has(capability));
      case "market_operations":
        return hasMarketOperations;
    }
  });
}

export interface AndroidActionCapabilityContext {
  requestType?: string;
  reservationType?: string;
  reservationRoomIds?: readonly unknown[];
  reservationTableIds?: readonly unknown[];
  taskType?: string;
  relatedType?: string;
  relatedReservationType?: string;
  relatedReservationRoomIds?: readonly unknown[];
  relatedReservationTableIds?: readonly unknown[];
  payload?: Record<string, unknown>;
}

export function androidTaskAllowedByCapabilities(
  capabilities: Iterable<BusinessCapability>,
  taskType: string,
  relatedType = "",
  relatedReservationType = "",
  relatedReservationRoomIds: readonly unknown[] = [],
  relatedReservationTableIds: readonly unknown[] = []
): boolean {
  const enabled = capabilities instanceof Set ? capabilities : new Set(capabilities);
  return enabled.has(C.ANDROID)
    && isOperationalTaskAvailable(enabled, taskType, relatedType, relatedReservationType, {
      roomIds: relatedReservationRoomIds,
      tableIds: relatedReservationTableIds
    });
}

/** Contextual capability guard used at the Android mutation boundary. */
export function androidActionAllowedByCapabilities(
  actionType: string,
  capabilities: Iterable<BusinessCapability>,
  context: AndroidActionCapabilityContext = {}
): boolean {
  const enabled = capabilities instanceof Set ? capabilities : new Set(capabilities);
  if (!enabled.has(C.ANDROID)) return false;

  if (actionType === "customer_request_convert_to_reservation") {
    return canConvertRequestToReservation(enabled, context.requestType ?? "");
  }
  if (actionType.startsWith("reservation_room_")) {
    return enabled.has(C.ACCOMMODATION_RESERVATIONS);
  }
  if (actionType.startsWith("reservation_table_")) {
    return enabled.has(C.FOOD_RESERVATIONS);
  }
  if (["reservation_approve", "reservation_reject", "reservation_cancel"].includes(actionType)) {
    return isReservationTypeAvailable(enabled, context.reservationType ?? "", {
      roomIds: context.reservationRoomIds,
      tableIds: context.reservationTableIds
    });
  }
  if (actionType.startsWith("daily_task_")) {
    return androidTaskAllowedByCapabilities(
      enabled,
      context.taskType ?? "",
      context.relatedType ?? "",
      context.relatedReservationType ?? "",
      context.relatedReservationRoomIds,
      context.relatedReservationTableIds
    );
  }
  if (actionType === "menu_stock_image_import_apply") {
    return enabled.has(C.FOOD_MENU)
      && enabled.has(C.INVENTORY)
      && enabled.has(C.AI);
  }
  if (actionType === "market_product_create") {
    return enabled.has(C.CATALOG)
      && (context.payload?.track_inventory !== true || enabled.has(C.INVENTORY));
  }
  if (actionType === "room_status_update" && String(context.payload?.status ?? "").trim() === "reserved") {
    return enabled.has(C.ACCOMMODATION_ROOMS) && enabled.has(C.ACCOMMODATION_RESERVATIONS);
  }
  if (actionType === "table_status_update") {
    const status = String(context.payload?.status ?? "").trim();
    if (status === "reserved") {
      return enabled.has(C.FOOD_TABLES) && enabled.has(C.FOOD_RESERVATIONS);
    }
    if (["bill_waiting", "waiting_bill", "checkout", "payment"].includes(status)) {
      return enabled.has(C.FOOD_TABLES) && enabled.has(C.FOOD_ORDERS);
    }
  }

  const permission = resolveAndroidActionPermission(actionType, context.payload ?? {});
  return permission !== null && androidPermissionAllowedByCapabilities(permission, enabled);
}

export const ANDROID_STAFF_PERMISSIONS: readonly AndroidPermission[] = androidPermissionsForGroups({
  ...ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS
});

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

export type AndroidStockStatus = "out_of_stock" | "low_stock" | "in_stock";

export interface AndroidTrackedStockItem {
  menu_item_id: string;
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

export const ANDROID_ACTION_TYPES = [
  "customer_request_mark_answered",
  "customer_request_reopen",
  "customer_request_approve",
  "customer_request_reject",
  "customer_request_convert_to_reservation",
  "customer_request_delete",
  "customer_create",
  "customer_update",
  "customer_delete",
  "customer_room_assign",
  "customer_room_stay_status",
  "reservation_room_create",
  "reservation_room_update",
  "reservation_table_create",
  "reservation_table_update",
  "reservation_approve",
  "reservation_reject",
  "reservation_cancel",
  "room_status_update",
  "daily_task_create",
  "daily_task_update",
  "daily_task_delete",
  "daily_task_complete",
  "daily_task_reopen",
  "daily_task_cancel",
  "finance_manual_create",
  "room_folio_payment_add",
  "room_folio_checkout",
  "table_status_update",
  "table_order_open",
  "table_order_add_item",
  "table_order_update_item_quantity",
  "table_order_remove_item",
  "table_order_set_preparing",
  "table_order_set_served",
  "table_order_set_payment_waiting",
  "table_order_close_paid",
  "table_order_cancel",
  "menu_category_delete",
  "menu_item_delete",
  "message_delete",
  "menu_stock_add",
  "menu_stock_set",
  "menu_stock_adjust",
  "menu_stock_image_import_apply",
  "market_stock_count",
  "market_purchase_receive",
  "market_product_create",
  "market_cart_draft_create",
  "market_barcode_scan"
] as const;

export type AndroidActionType = typeof ANDROID_ACTION_TYPES[number];
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

export const ANDROID_ACTION_PERMISSION_MAP: Partial<Record<AndroidActionType, AndroidPermission>> = {
  customer_request_mark_answered: "customer.mark_answered",
  customer_request_reopen: "customer.respond",
  customer_request_approve: "customer.respond",
  customer_request_reject: "customer.reject",
  customer_request_convert_to_reservation: "customer.convert_to_reservation",
  customer_request_delete: "request.delete",
  customer_create: "customer.manage",
  customer_update: "customer.manage",
  customer_delete: "customer.delete",
  customer_room_assign: "room.assign_customer",
  customer_room_stay_status: "room.assign_customer",
  reservation_room_create: "reservation.create",
  reservation_room_update: "reservation.update",
  reservation_table_create: "reservation.create",
  reservation_table_update: "reservation.update",
  reservation_approve: "reservation.approve",
  reservation_reject: "reservation.reject",
  reservation_cancel: "reservation.cancel",
  room_status_update: "room.update_status",
  daily_task_create: "daily_task.create",
  daily_task_update: "daily_task.update",
  daily_task_delete: "daily_task.delete",
  daily_task_complete: "daily_task.complete",
  daily_task_reopen: "daily_task.reopen",
  daily_task_cancel: "daily_task.update",
  finance_manual_create: "finance.create",
  room_folio_payment_add: "room_folio.payment",
  room_folio_checkout: "room_folio.checkout",
  table_status_update: "table.update_status",
  table_order_open: "table_order.open",
  table_order_add_item: "table_order.add_item",
  table_order_update_item_quantity: "table_order.update_item",
  table_order_remove_item: "table_order.remove_item",
  table_order_set_preparing: "table_order.set_preparing",
  table_order_set_served: "table_order.set_served",
  table_order_set_payment_waiting: "table_order.set_payment_waiting",
  table_order_close_paid: "table_order.close_paid",
  table_order_cancel: "table_order.cancel",
  menu_category_delete: "menu.delete",
  menu_item_delete: "menu.delete",
  message_delete: "message.delete",
  menu_stock_add: "menu.stock_update",
  menu_stock_set: "menu.stock_update",
  menu_stock_adjust: "menu.stock_update",
  menu_stock_image_import_apply: "menu.stock_update",
  market_stock_count: "market.stock_count",
  market_purchase_receive: "market.receiving",
  market_product_create: "market.product_create",
  market_cart_draft_create: "market.cart_draft",
  market_barcode_scan: "market.scan_to_desktop"
};

export function resolveAndroidActionPermission(
  actionType: string,
  _payload: Record<string, unknown> = {}
): AndroidPermission | null {
  const mapped = ANDROID_ACTION_PERMISSION_MAP[actionType as AndroidActionType];
  if (mapped) {
    return mapped;
  }
  return null;
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

export interface PushMenuSuccess {
  ok: true;
  message: string;
  published_at: ISODateTimeString;
  updated_at: ISODateTimeString;
  category_count: number;
  item_count: number;
  source_revision?: number;
  server_revision?: number;
  deduplicated?: boolean;
}

export interface PushAndroidSnapshotSuccess {
  ok: true;
  message: string;
  published_at: ISODateTimeString;
  updated_at: ISODateTimeString;
  task_count: number;
  source_revision?: number;
  server_revision?: number;
  deduplicated?: boolean;
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

export interface PushBusinessContextSuccess {
  ok: true;
  message: string;
  published_at: ISODateTimeString;
  profile_id: string;
  source_revision?: number;
  server_revision?: number;
  deduplicated?: boolean;
}

export interface PushRoomCatalogSuccess {
  ok: true;
  message: string;
  published_at: ISODateTimeString;
  room_count: number;
  source_revision?: number;
  server_revision?: number;
  deduplicated?: boolean;
}

export interface PushTableCatalogSuccess {
  ok: true;
  message: string;
  published_at: ISODateTimeString;
  table_count: number;
  source_revision?: number;
  server_revision?: number;
  deduplicated?: boolean;
}

export interface PushAiCatalogSuccess {
  ok: true;
  message: string;
  published_at: ISODateTimeString;
  item_count: number;
  source_revision?: number;
  server_revision?: number;
  deduplicated?: boolean;
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
  afterSeq: number;
  limit?: number;
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
  pullRequests(input: PullCursorInput): Promise<PullRequestsResult>;
  acknowledgeRequests(input: RequestAcknowledgement): Promise<AcknowledgeRequestsResult>;
  pullAndroidActions(input?: PullActionsInput): Promise<PullAndroidActionsResult>;
  completeAndroidAction(input: ActionCompletion): Promise<MarkAndroidActionResultResult>;
  publishMenu(input: VersionedPublication<PublishedQrMenu>): Promise<PushMenuResult>;
  publishAndroidSnapshot(input: VersionedPublication<AndroidOperationsSnapshot>): Promise<PushAndroidSnapshotResult>;
}

export interface PhpHostingSyncTransportConfig extends SyncCoreConfig {
  clientId: string;
}

export {
  PhpHostingSyncTransport,
  acknowledgeRequests,
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
  pushRoomCatalog,
  pushTableCatalog,
  resetHostingRuntime
} from "./hosting-transport";
