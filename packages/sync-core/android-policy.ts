import {
  BUSINESS_CAPABILITIES,
  canConvertRequestToReservation,
  isOperationalTaskAvailable,
  isReservationTypeAvailable,
  type BusinessCapability
} from "@yardimci-asistan/shared";

export type AndroidDeviceRole = "admin" | "staff";

export const ANDROID_PERMISSIONS = [
  "voice.dictation",
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
  "kbs.view",
  "kbs.send",
  "kbs.retry",
  "kbs.reconcile_external",
  "room_folio.add_menu_item",
  "room_folio.add_manual_charge",
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
  "market.scan_to_desktop",
  "market.sale.complete",
  "customer_credit.view",
  "customer_credit.payment",
  "commerce_order.view",
  "commerce_order.confirm",
  "commerce_order.cancel",
  "dealer.view",
  "shipment.view",
  "online_sales.view",
  "marketing.status.view"
] as const;

export type AndroidPermission = typeof ANDROID_PERMISSIONS[number];

export const ANDROID_PERMISSION_GROUP_IDS = [
  "voice_dictation",
  "service_orders",
  "cashier",
  "rooms_tasks",
  "customer_reservation",
  "market_operations",
  "market_sales",
  "customer_credit_view",
  "customer_credit_payment",
  "commerce_orders_view",
  "commerce_orders_manage",
  "dealer_view",
  "shipment_view",
  "online_sales_view",
  "marketing_status_view"
] as const;

export type AndroidPermissionGroupId = typeof ANDROID_PERMISSION_GROUP_IDS[number];
export type AndroidPermissionGroups = Record<AndroidPermissionGroupId, boolean>;

export const ANDROID_PERMISSION_GROUP_PERMISSIONS: Readonly<Record<AndroidPermissionGroupId, readonly AndroidPermission[]>> = {
  voice_dictation: ["voice.dictation"],
  market_sales: ["market.product.view", "market.sale.complete", "customer.view"],
  customer_credit_view: ["customer_credit.view"],
  customer_credit_payment: ["customer_credit.view", "customer_credit.payment"],
  commerce_orders_view: ["commerce_order.view"],
  commerce_orders_manage: ["commerce_order.view", "commerce_order.confirm", "commerce_order.cancel"],
  dealer_view: ["dealer.view"],
  shipment_view: ["commerce_order.view", "shipment.view"],
  online_sales_view: ["commerce_order.view", "online_sales.view"],
  marketing_status_view: ["marketing.status.view"],
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
    "room_folio.add_menu_item",
    "room_folio.add_manual_charge",
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
  voice_dictation: false,
  service_orders: true,
  cashier: false,
  rooms_tasks: true,
  customer_reservation: false,
  market_operations: false,
  market_sales: false,
  customer_credit_view: false,
  customer_credit_payment: false,
  commerce_orders_view: false,
  commerce_orders_manage: false,
  dealer_view: false,
  shipment_view: false,
  online_sales_view: false,
  marketing_status_view: false
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

const ANDROID_RETAIL_WORKSPACE_CAPABILITIES = [C.RETAIL_BARCODE, C.RETAIL_PURCHASING, C.RETAIL_SUPPLIERS, C.RETAIL_LABELS] as const;
const ANDROID_CUSTOMER_CREDIT_CAPABILITIES = [C.CUSTOMER_CREDIT, C.CUSTOMERS, C.SALES, C.CATALOG, C.FINANCE] as const;

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
  "voice.dictation": { allOf: [C.AI] },
  "commerce_order.view": { allOf: [C.ORDERS] },
  "commerce_order.confirm": { allOf: [C.ORDERS] },
  "commerce_order.cancel": { allOf: [C.ORDERS] },
  "dealer.view": { allOf: [C.CUSTOMERS, C.ORDERS, C.WHOLESALE] },
  "shipment.view": { allOf: [C.ORDERS] },
  "online_sales.view": { allOf: [C.ORDERS, C.ONLINE_SALES] },
  "marketing.status.view": { allOf: [C.MARKETING_STUDIO] },
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
  "kbs.view": { allOf: [C.ACCOMMODATION_ROOMS, C.ACCOMMODATION_STAYS] },
  "kbs.send": { allOf: [C.ACCOMMODATION_ROOMS, C.ACCOMMODATION_STAYS] },
  "kbs.retry": { allOf: [C.ACCOMMODATION_ROOMS, C.ACCOMMODATION_STAYS] },
  "kbs.reconcile_external": { allOf: [C.ACCOMMODATION_ROOMS, C.ACCOMMODATION_STAYS] },
  "room_folio.add_menu_item": { allOf: [C.ACCOMMODATION_FOLIO, C.ACCOMMODATION_STAYS, C.FOOD_MENU] },
  "room_folio.add_manual_charge": { allOf: [C.ACCOMMODATION_FOLIO, C.ACCOMMODATION_STAYS] },
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
  "market.sale.complete": { allOf: [C.SALES, C.CATALOG], anyOf: ANDROID_RETAIL_WORKSPACE_CAPABILITIES },
  "customer_credit.view": { allOf: ANDROID_CUSTOMER_CREDIT_CAPABILITIES, anyOf: ANDROID_RETAIL_WORKSPACE_CAPABILITIES },
  "customer_credit.payment": { allOf: ANDROID_CUSTOMER_CREDIT_CAPABILITIES, anyOf: ANDROID_RETAIL_WORKSPACE_CAPABILITIES },
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
  // KBS has no staff group or inherited rooms/tasks grant.
  const granted = role === "admin" ? ANDROID_PERMISSIONS : [...storedPermissions].filter(permission => !permission.startsWith("kbs."));
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
    if (isRetailOnly && ["service_orders", "cashier", "rooms_tasks", "customer_reservation"].includes(groupId)) return false;
    switch (groupId) {
      case "voice_dictation": return enabled.has(C.AI);
      case "commerce_orders_view":
      case "commerce_orders_manage": return enabled.has(C.ORDERS);
      case "dealer_view": return enabled.has(C.WHOLESALE) && enabled.has(C.ORDERS) && enabled.has(C.CUSTOMERS);
      case "shipment_view": return enabled.has(C.ORDERS);
      case "online_sales_view": return enabled.has(C.ONLINE_SALES) && enabled.has(C.ORDERS);
      case "marketing_status_view": return enabled.has(C.MARKETING_STUDIO);
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
      case "market_sales": return androidPermissionAllowedByCapabilities("market.sale.complete", enabled);
      case "customer_credit_view":
      case "customer_credit_payment": return androidPermissionAllowedByCapabilities("customer_credit.view", enabled);
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
  commerceOrderSource?: string;
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

  if (actionType === "market_sale_complete") {
    return androidPermissionAllowedByCapabilities("market.sale.complete", enabled)
      && (context.payload?.settlement !== "credit" || androidPermissionAllowedByCapabilities("customer_credit.view", enabled));
  }

  if (["commerce_order_confirm", "commerce_order_cancel"].includes(actionType)) {
    return enabled.has(C.ORDERS)
      && (!["web-dealer", "desktop-wholesale"].includes(context.commerceOrderSource ?? "") || enabled.has(C.WHOLESALE))
      && (context.commerceOrderSource !== "web-online-sales" || enabled.has(C.ONLINE_SALES));
  }
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
      ...(context.reservationRoomIds === undefined ? {} : { roomIds: context.reservationRoomIds }),
      ...(context.reservationTableIds === undefined ? {} : { tableIds: context.reservationTableIds })
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


export const ANDROID_ACTION_TYPES = [
  "kbs_send_request",
  "kbs_retry_prepare",
  "kbs_mark_sent_externally",
  "commerce_order_confirm",
  "commerce_order_cancel",
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
  "room_folio_menu_item_add",
  "room_folio_manual_charge_add",
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
  "menu_entry_create",
  "menu_entry_update",
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
  "market_barcode_scan",
  "market_sale_complete",
  "customer_credit_payment_add"
] as const;

export type AndroidActionType = typeof ANDROID_ACTION_TYPES[number];

export const ANDROID_ACTION_PERMISSION_MAP: Partial<Record<AndroidActionType, AndroidPermission>> = {
  kbs_send_request: "kbs.send",
  kbs_retry_prepare: "kbs.retry",
  kbs_mark_sent_externally: "kbs.reconcile_external",
  commerce_order_confirm: "commerce_order.confirm",
  commerce_order_cancel: "commerce_order.cancel",
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
  room_folio_menu_item_add: "room_folio.add_menu_item",
  room_folio_manual_charge_add: "room_folio.add_manual_charge",
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
  menu_entry_create: "menu.edit",
  menu_entry_update: "menu.edit",
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
  market_barcode_scan: "market.scan_to_desktop",
  market_sale_complete: "market.sale.complete",
  customer_credit_payment_add: "customer_credit.payment"
};

export function resolveAndroidActionPermission(
  actionType: string,
  _payload: Record<string, unknown> = {}
): AndroidPermission | null {
  const mapped = Object.hasOwn(ANDROID_ACTION_PERMISSION_MAP, actionType)
    ? ANDROID_ACTION_PERMISSION_MAP[actionType as AndroidActionType] : undefined;
  if (mapped) {
    return mapped;
  }
  return null;
}

