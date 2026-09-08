export type IdPrefix =
  | "business_"
  | "user_"
  | "customer_"
  | "request_"
  | "reservation_"
  | "stay_"
  | "room_"
  | "table_"
  | "cat_"
  | "item_"
  | "product_"
  | "inventory_location_"
  | "inventory_movement_"
  | "sale_"
  | "sale_item_"
  | "credit_entry_"
  | "supplier_"
  | "purchase_order_"
  | "purchase_order_item_"
  | "catalog_product_draft_"
  | "commerce_cart_draft_"
  | "commerce_cart_draft_item_"
  | "market_barcode_scan_"
  | "knowledge_"
  | "ai_conv_"
  | "wa_msg_"
  | "notification_"
  | "android_device_"
  | "task_"
  | "sync_"
  | "settings_"
  | "event_";

export const ID_PREFIXES: readonly IdPrefix[] = [
  "business_",
  "user_",
  "customer_",
  "request_",
  "reservation_",
  "stay_",
  "room_",
  "table_",
  "cat_",
  "item_",
  "product_",
  "inventory_location_",
  "inventory_movement_",
  "sale_",
  "sale_item_",
  "credit_entry_",
  "supplier_",
  "purchase_order_",
  "purchase_order_item_",
  "catalog_product_draft_",
  "commerce_cart_draft_",
  "commerce_cart_draft_item_",
  "market_barcode_scan_",
  "knowledge_",
  "ai_conv_",
  "wa_msg_",
  "notification_",
  "android_device_",
  "task_",
  "sync_",
  "settings_",
  "event_"
] as const;

export interface CreateIdOptions {
  now?: Date;
  random?: () => string;
}

export function createId(prefix: IdPrefix, options: CreateIdOptions = {}): string {
  const timestamp = (options.now ?? new Date()).getTime().toString(36);
  const randomPart = sanitizeRandomPart(options.random?.() ?? Math.random().toString(36).slice(2, 10));
  return `${prefix}${timestamp}_${randomPart}`;
}

export function isSupportedIdPrefix(prefix: string): prefix is IdPrefix {
  return ID_PREFIXES.includes(prefix as IdPrefix);
}

export function extractIdPrefix(id: string): IdPrefix | null {
  return ID_PREFIXES.find((prefix) => id.startsWith(prefix)) ?? null;
}

export function hasIdPrefix(id: string, prefix: IdPrefix): boolean {
  return id.startsWith(prefix);
}

function sanitizeRandomPart(value: string): string {
  const safeValue = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return safeValue.slice(0, 12) || "000000";
}
