import { createHash } from "node:crypto";
import type { BusinessCapability } from "@yardimci-asistan/shared";
import {
  ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS,
  ANDROID_PERMISSION_GROUP_IDS,
  ANDROID_PERMISSIONS,
  ANDROID_STAFF_PERMISSIONS,
  androidEffectivePermissionsForRole
} from "@yardimci-asistan/sync-core";
import type {
  AndroidDeviceRole,
  AndroidPermission,
  AndroidPermissionGroups,
  AndroidSyncAction
} from "@yardimci-asistan/sync-core";
import type { DesktopAndroidActionFailure } from "../database-types.js";

export type AndroidActionMutationResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

const ANDROID_PERMISSION_SET = new Set<string>(ANDROID_PERMISSIONS);

const ANDROID_ADMIN_ONLY_ACTIONS = new Set<string>([
  "customer_request_delete",
  "customer_create",
  "customer_update",
  "customer_delete",
  "customer_room_assign",
  "customer_room_stay_status",
  "daily_task_delete",
  "menu_category_delete",
  "menu_item_delete",
  "message_delete"
]);

export function isAndroidAdminOnlyAction(actionType: unknown): boolean {
  return ANDROID_ADMIN_ONLY_ACTIONS.has(String(actionType ?? "").trim());
}

export function normalizeAndroidDeviceId(value: unknown): string {
  const deviceId = String(value ?? "").trim();
  return /^[A-Za-z0-9._:-]{6,120}$/.test(deviceId) ? deviceId : "";
}

export function normalizeAndroidDeviceRole(value: unknown): AndroidDeviceRole {
  return String(value ?? "").trim() === "admin" ? "admin" : "staff";
}

export function normalizeAndroidDeviceRoleInput(value: unknown): AndroidDeviceRole | null {
  const role = String(value ?? "").trim();
  return role === "admin" || role === "staff" ? role : null;
}

export function androidPermissionsForRole(role: AndroidDeviceRole): AndroidPermission[] {
  return [...(role === "admin" ? ANDROID_PERMISSIONS : ANDROID_STAFF_PERMISSIONS)];
}

function emptyAndroidPermissionGroups(): AndroidPermissionGroups {
  return {
    service_orders: false,
    cashier: false,
    rooms_tasks: false,
    customer_reservation: false,
    market_operations: false
  };
}

export function parseStoredAndroidPermissionGroups(value: unknown): AndroidPermissionGroups {
  try {
    const parsed = JSON.parse(String(value ?? "{}")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return emptyAndroidPermissionGroups();
    }
    const record = parsed as Record<string, unknown>;
    const groups = emptyAndroidPermissionGroups();
    for (const groupId of ANDROID_PERMISSION_GROUP_IDS) {
      groups[groupId] = record[groupId] === true;
    }
    return groups;
  } catch {
    return emptyAndroidPermissionGroups();
  }
}

export function normalizeAndroidPermissionGroupsInput(value: unknown): AndroidPermissionGroups | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const groups = { ...ANDROID_DEFAULT_STAFF_PERMISSION_GROUPS };
  for (const groupId of ANDROID_PERMISSION_GROUP_IDS) {
    if (!(groupId in record)) {
      return null;
    }
    if (typeof record[groupId] !== "boolean") return null;
    groups[groupId] = record[groupId];
  }
  return groups;
}

export function effectiveAndroidPermissions(
  role: AndroidDeviceRole,
  value: unknown,
  capabilities: Iterable<BusinessCapability>
): AndroidPermission[] {
  let storedPermissions: AndroidPermission[] = [];
  try {
    const parsed = JSON.parse(String(value ?? "[]")) as unknown;
    if (Array.isArray(parsed)) {
      storedPermissions = [...new Set(parsed
        .map((permission) => String(permission).trim())
        .filter((permission): permission is AndroidPermission => ANDROID_PERMISSION_SET.has(permission)))];
    }
  } catch {
    storedPermissions = [];
  }
  return androidEffectivePermissionsForRole(role, storedPermissions, capabilities);
}

export function normalizeAndroidTimestamp(value: unknown, fallback: string): string {
  const timestamp = String(value ?? "").trim();
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

export function createAndroidEntityId(
  prefix: "customer_" | "reservation_" | "stay_" | "table_order_" | "table_order_item_",
  actionId: string
): string {
  const digest = createHash("sha256").update(actionId).digest("hex").slice(0, 48);
  return `${prefix}android_${digest}`;
}

export function androidPayloadString(payload: Record<string, unknown>, field: string): string {
  return typeof payload[field] === "string" ? payload[field].trim() : "";
}

export function androidPayloadStringArray(payload: Record<string, unknown>, field: string): string[] {
  const value = payload[field];
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getAndroidVersionConflict(
  payload: Record<string, unknown>,
  field: string,
  actualUpdatedAt: unknown,
  entityLabel: string
): AndroidActionMutationResult | null {
  const expectedUpdatedAt = androidPayloadString(payload, field);
  if (!expectedUpdatedAt || expectedUpdatedAt === String(actualUpdatedAt ?? "")) {
    return null;
  }
  return {
    ok: false,
    message: `${entityLabel} masaüstünde değişmiş. Telefonda canlı veriyi yenileyip tekrar deneyin.`
  };
}

export function nextMutationTimestamp(previousUpdatedAt: unknown, candidate: string): string {
  const previous = String(previousUpdatedAt ?? "").trim();
  const previousTime = Date.parse(previous);
  const candidateTime = Date.parse(candidate);
  if (!Number.isFinite(previousTime) || !Number.isFinite(candidateTime) || candidateTime > previousTime) {
    return candidate;
  }
  return new Date(previousTime + 1).toISOString();
}

export function androidPayloadNumber(payload: Record<string, unknown>, field: string, fallback: number): number {
  const value = Number(payload[field]);
  return Number.isFinite(value) ? value : fallback;
}

export function androidActionRelatedId(action: AndroidSyncAction): string {
  const payload = action.payload && typeof action.payload === "object" && !Array.isArray(action.payload)
    ? action.payload
    : {};
  for (const key of ["order_id", "table_id", "reservation_id", "request_id", "customer_id", "folio_id", "room_id", "task_id", "item_id", "product_id", "menu_entry_id", "category_id", "message_id"]) {
    const value = String(payload[key] ?? "").trim();
    if (value) {
      return value;
    }
  }
  return "";
}

export function androidActionResolutionKey(action: AndroidSyncAction): string {
  return [
    String(action.device_id ?? "").trim(),
    String(action.action_type ?? "").trim(),
    androidActionRelatedId(action)
  ].join(":");
}

export function androidActionTargetPage(
  actionType: string,
  payload: Record<string, unknown> = {}
): DesktopAndroidActionFailure["targetPage"] {
  if (actionType.startsWith("customer_") || actionType === "message_delete") {
    return "customerWork";
  }
  if (actionType.startsWith("reservation_table_")) {
    return "restaurant";
  }
  if (actionType.startsWith("daily_task_") && String(payload.task_type ?? "").trim() === "manual_restaurant") {
    return "restaurant";
  }
  if (actionType.startsWith("reservation_") || actionType.startsWith("room_") || actionType.startsWith("daily_task_")) {
    return "pension";
  }
  if (actionType.startsWith("table_") || actionType.startsWith("menu_")) {
    return "restaurant";
  }
  return "settings";
}

export function normalizeAndroidFailureTargetPage(value: unknown): DesktopAndroidActionFailure["targetPage"] {
  const target = String(value ?? "");
  return ["dashboard", "customerWork", "pension", "restaurant", "settings"].includes(target)
    ? target as DesktopAndroidActionFailure["targetPage"]
    : "settings";
}

export function friendlyDesktopActionFailure(value: string): string {
  const message = value.trim();
  const lower = message.toLocaleLowerCase("tr-TR");
  if (lower.includes("hesap kapatma yetkisi") || (lower.includes("yetki") && lower.includes("kapat"))) {
    return "Bu cihazın hesap kapatma yetkisi yok.";
  }
  if (lower.includes("pasif")) {
    return "Bu cihaz pasifleştirilmiş.";
  }
  if (lower.includes("adisyon") && (lower.includes("kapalı") || lower.includes("kapat"))) {
    return "Adisyon kapalı olduğu için işlem yapılamadı.";
  }
  if (lower.includes("stok") && (lower.includes("yeterli") || lower.includes("yok"))) {
    return "Stokta yeterli ürün yok.";
  }
  if (lower.includes("yetki") || lower.includes("izin")) {
    return "Bu cihazın bu işlem için yetkisi yok.";
  }
  return message || "İşlem masaüstü tarafından uygulanamadı.";
}

export function parseEventPayload(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value ?? "{}")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}
