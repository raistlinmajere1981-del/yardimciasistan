import type { DatabaseSync } from "node:sqlite";
import {
  BUSINESS_CAPABILITIES,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import type {
  AndroidSyncAction
} from "@yardimci-asistan/sync-core";
import {
  androidActionAllowedByCapabilities,
  resolveAndroidActionPermission
} from "@yardimci-asistan/sync-core";
import type {
  ApplyAndroidActionResult,
  DesktopAndroidActionFailure
} from "./database-types.js";
import { insertDatabaseEvent } from "./database/event-store.js";
import { markPreparedWhatsAppMessagesSentInTransaction } from "./database/prepared-message-store.js";
import { mutateMenuStockInTransaction as mutateStoredMenuStock } from "./database/menu-stock-store.js";
import { normalizeCustomerInput } from "./database/customer-utils.js";
import {
  normalizeNullableStockNumber,
  normalizePositiveStockNumber,
  normalizeSignedStockNumber
} from "./database/stock-utils.js";
import type { AndroidActionMutationResult } from "./database/android-utils.js";
import {
  androidActionRelatedId,
  androidActionResolutionKey,
  androidActionTargetPage,
  androidPayloadString,
  androidPayloadStringArray,
  createAndroidEntityId,
  effectiveAndroidPermissions,
  friendlyDesktopActionFailure,
  getAndroidVersionConflict,
  isAndroidAdminOnlyAction,
  nextMutationTimestamp,
  normalizeAndroidDeviceRole,
  normalizeAndroidFailureTargetPage,
  parseEventPayload
} from "./database/android-utils.js";

export function insertAndroidActionEvent(
  db: DatabaseSync,
  action: AndroidSyncAction,
  type: string,
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>,
  now: string
) {
  insertDatabaseEvent(db, {
    type,
    entityType,
    entityId,
    payload: { ...payload, android_action_id: action.id },
    now,
    actorType: "android",
    actorId: action.device_id
  });
}

export function authorizeAndroidAction(
  db: DatabaseSync,
  action: AndroidSyncAction,
  enabledCapabilities: BusinessCapability[]
): AndroidActionMutationResult {
  const deviceId = String(action.device_id ?? "").trim();
  const device = db
    .prepare(`
        SELECT role, is_active, permissions_json, revoked_at
        FROM android_devices
        WHERE device_id = ?
        LIMIT 1
      `)
    .get(deviceId) as Record<string, unknown> | undefined;
  if (!device) {
    return { ok: false, message: "Telefon masaüstü cihaz listesine kaydedilemedi." };
  }
  if (Number(device.is_active ?? 0) !== 1 || String(device.revoked_at ?? "").trim()) {
    return { ok: false, message: "Cihaz masaüstünde pasifleştirilmiş." };
  }
  const requiredPermission = resolveAndroidActionPermission(action.action_type, action.payload);
  if (!requiredPermission) {
    return { ok: false, message: "Telefon işlem türü bu masaüstü sürümünde desteklenmiyor." };
  }
  const role = normalizeAndroidDeviceRole(device.role);
  if (isAndroidAdminOnlyAction(action.action_type) && role !== "admin") {
    return { ok: false, message: "Müşteri yönetimi ve kayıt silme işlemleri yalnız yönetici cihazlarda kullanılabilir." };
  }
  const capabilityContext = getAndroidActionCapabilityContext(db, action);
  if (!androidActionAllowedByCapabilities(action.action_type, enabledCapabilities, capabilityContext)) {
    return { ok: false, message: "Bu işlem işletmenin etkin yeteneklerinde kullanılamıyor." };
  }
  const permissions = effectiveAndroidPermissions(role, device.permissions_json, enabledCapabilities);
  if (!permissions.includes(requiredPermission)) {
    return {
      ok: false,
      message: requiredPermission === "table_order.close_paid"
        ? "Bu cihazın hesap kapatma yetkisi yok."
        : "Bu cihazın bu işlem için yetkisi yok."
    };
  }
  if (
    ["customer_room_assign", "customer_room_stay_status"].includes(action.action_type)
    && !permissions.includes("customer.manage")
  ) {
    return { ok: false, message: "Bu cihazın müşteri yönetimi yetkisi yok." };
  }
  return { ok: true, message: "Telefon işlemi yetkilendirildi." };
}

export function getAndroidActionCapabilityContext(db: DatabaseSync, action: AndroidSyncAction) {
  const context = {
    requestType: "",
    reservationType: "",
    reservationRoomIds: [] as string[],
    reservationTableIds: [] as string[],
    taskType: String(action.payload.task_type ?? "").trim(),
    relatedType: String(action.payload.related_type ?? "").trim(),
    relatedReservationType: "",
    relatedReservationRoomIds: [] as string[],
    relatedReservationTableIds: [] as string[],
    payload: action.payload
  };

  if (action.action_type === "customer_request_convert_to_reservation") {
    const requestId = androidPayloadString(action.payload, "request_id");
    const request = requestId
      ? db.prepare("SELECT request_type FROM requests WHERE id = ? AND deleted_at = ''").get(requestId) as { request_type?: unknown } | undefined
      : undefined;
    context.requestType = String(request?.request_type ?? "");
  }

  if (["reservation_approve", "reservation_reject", "reservation_cancel"].includes(action.action_type)) {
    const reservationId = androidPayloadString(action.payload, "reservation_id");
    const reservation = reservationId
      ? db.prepare("SELECT reservation_type, room_ids_json, table_ids_json FROM reservations WHERE id = ? AND deleted_at = ''").get(reservationId) as Record<string, unknown> | undefined
      : undefined;
    context.reservationType = String(reservation?.reservation_type ?? "");
    context.reservationRoomIds = parseStringArray(reservation?.room_ids_json);
    context.reservationTableIds = parseStringArray(reservation?.table_ids_json);
  }

  if (action.action_type.startsWith("daily_task_")) {
    const taskId = action.action_type === "daily_task_create"
      ? ""
      : androidPayloadString(action.payload, "task_id");
    const task = taskId
      ? db.prepare("SELECT task_type, related_type, related_id FROM daily_tasks WHERE id = ? AND deleted_at = ''").get(taskId) as Record<string, unknown> | undefined
      : undefined;
    context.taskType = String(task?.task_type ?? context.taskType).trim();
    context.relatedType = String(task?.related_type ?? context.relatedType).trim();
    if (context.relatedType === "reservation") {
      const relatedId = String(task?.related_id ?? action.payload.related_id ?? "").trim();
      const reservation = relatedId
        ? db.prepare("SELECT reservation_type, room_ids_json, table_ids_json FROM reservations WHERE id = ? AND deleted_at = ''").get(relatedId) as Record<string, unknown> | undefined
        : undefined;
      context.relatedReservationType = String(reservation?.reservation_type ?? "");
      context.relatedReservationRoomIds = parseStringArray(reservation?.room_ids_json);
      context.relatedReservationTableIds = parseStringArray(reservation?.table_ids_json);
    }
  }

  return context;
}

export function recordAndroidActionResult(db: DatabaseSync, action: AndroidSyncAction, result: ApplyAndroidActionResult) {
  const actionId = String(action.id ?? "").trim();
  const actionType = String(action.action_type ?? "").trim();
  const deviceId = String(action.device_id ?? "").trim();
  if (!actionId || !actionType || !deviceId) {
    return;
  }
  const now = new Date().toISOString();
  const resolutionKey = androidActionResolutionKey(action);
  if (result.ok) {
    for (const failure of getActiveAndroidActionFailureRows(db, null)) {
      const payload = parseEventPayload(failure.payload_json);
      if (String(payload.resolution_key ?? "") !== resolutionKey) {
        continue;
      }
      db
        .prepare("UPDATE events SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at = ''")
        .run(now, now, String(failure.id ?? ""));
    }
    return;
  }

  const existing = db
    .prepare("SELECT id FROM events WHERE type = 'android.action_failed' AND entity_id = ? AND deleted_at = '' LIMIT 1")
    .get(actionId);
  if (existing) {
    return;
  }
  insertDatabaseEvent(db, {
    type: "android.action_failed",
    actorType: "android",
    actorId: deviceId,
    entityType: "android_action",
    entityId: actionId,
    payload: {
      action_type: actionType,
      device_id: deviceId,
      error_message: result.message,
      resolution_key: resolutionKey,
      target_page: androidActionTargetPage(actionType, action.payload),
      related_id: androidActionRelatedId(action)
    },
    now
  });
}

export function getAndroidActionFailures(db: DatabaseSync): DesktopAndroidActionFailure[] {
  return getActiveAndroidActionFailureRows(db).map((row) => {
    const payload = parseEventPayload(row.payload_json);
    return {
      id: String(row.entity_id ?? ""),
      actionType: String(payload.action_type ?? ""),
      deviceId: String(payload.device_id ?? row.actor_id ?? ""),
      message: friendlyDesktopActionFailure(String(payload.error_message ?? "")),
      targetPage: normalizeAndroidFailureTargetPage(payload.target_page),
      relatedId: String(payload.related_id ?? ""),
      createdAt: String(row.created_at ?? "")
    };
  });
}

export function applyAndroidRequestStatus(
  db: DatabaseSync,
  action: AndroidSyncAction,
  status: string,
  now: string,
  enabledCapabilities: BusinessCapability[]
): AndroidActionMutationResult {
  const requestId = androidPayloadString(action.payload, "request_id");
  if (!requestId) {
    return { ok: false, message: "Güncellenecek talep seçilmemiş." };
  }
  const request = db
    .prepare("SELECT status, updated_at FROM requests WHERE id = ? AND deleted_at = ''")
    .get(requestId) as { status?: string; updated_at?: string } | undefined;
  if (!request) {
    return { ok: false, message: "Talep masaüstü kayıtlarında bulunamadı." };
  }
  const versionConflict = getAndroidVersionConflict(action.payload, "expected_updated_at", request.updated_at, "Talep");
  if (versionConflict) {
    return versionConflict;
  }
  const updatedAt = nextMutationTimestamp(request.updated_at, now);

  db
    .prepare("UPDATE requests SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
    .run(status, updatedAt, requestId);
  if (status === "answered" && enabledCapabilities.includes(BUSINESS_CAPABILITIES.WHATSAPP)) {
    markPreparedWhatsAppMessagesSentInTransaction(db, requestId, updatedAt);
  }
  insertAndroidActionEvent(db, action, "request.status_changed", "request", requestId, {
    previous_status: String(request.status ?? ""),
    status
  }, now);
  return { ok: true, message: "Talep durumu telefondan güncellendi." };
}

export function applyAndroidCustomerSave(
  db: DatabaseSync,
  action: AndroidSyncAction,
  now: string,
  updating: boolean
): AndroidActionMutationResult {
  const customerId = updating
    ? androidPayloadString(action.payload, "customer_id")
    : createAndroidEntityId("customer_", action.id);
  const existing = updating
    ? db.prepare("SELECT id, source, created_at, updated_at FROM customers WHERE id = ? AND deleted_at = ''").get(customerId) as Record<string, unknown> | undefined
    : undefined;
  if (updating && !existing) {
    return { ok: false, message: "Güncellenecek müşteri masaüstü kayıtlarında bulunamadı." };
  }
  const versionConflict = updating
    ? getAndroidVersionConflict(action.payload, "expected_updated_at", existing?.updated_at, "Müşteri")
    : null;
  if (versionConflict) {
    return versionConflict;
  }

  const normalized = normalizeCustomerInput({
    id: customerId,
    fullName: androidPayloadString(action.payload, "full_name"),
    phone: androidPayloadString(action.payload, "phone"),
    email: androidPayloadString(action.payload, "email"),
    notes: androidPayloadString(action.payload, "notes"),
    tags: androidPayloadStringArray(action.payload, "tags"),
    identityType: androidPayloadString(action.payload, "identity_type"),
    identityNumber: androidPayloadString(action.payload, "identity_number"),
    nationality: androidPayloadString(action.payload, "nationality"),
    birthDate: androidPayloadString(action.payload, "birth_date"),
    gender: androidPayloadString(action.payload, "gender"),
    documentSerialNumber: androidPayloadString(action.payload, "document_serial_number"),
    documentExpiryDate: androidPayloadString(action.payload, "document_expiry_date"),
    birthPlace: androidPayloadString(action.payload, "birth_place"),
    motherName: androidPayloadString(action.payload, "mother_name"),
    fatherName: androidPayloadString(action.payload, "father_name"),
    issuingAuthority: androidPayloadString(action.payload, "issuing_authority"),
    address: androidPayloadString(action.payload, "address")
  });
  if (!normalized.ok) {
    return normalized;
  }
  const customer = normalized.customer;
  const duplicateIdentity = customer.identityNumber
    ? db
      .prepare("SELECT id FROM customers WHERE identity_number = ? AND id != ? AND deleted_at = '' LIMIT 1")
      .get(customer.identityNumber, customerId)
    : undefined;
  if (duplicateIdentity) {
    return { ok: false, message: "Bu kimlik numarası başka bir müşteri kartında kayıtlı." };
  }
  const duplicatePhone = customer.phone
    ? db
      .prepare("SELECT id FROM customers WHERE phone = ? AND id != ? AND deleted_at = '' LIMIT 1")
      .get(customer.phone, customerId)
    : undefined;
  if (duplicatePhone) {
    return { ok: false, message: "Bu telefon numarasıyla kayıtlı bir müşteri zaten var." };
  }

  const updatedAt = nextMutationTimestamp(existing?.updated_at, now);
  db
    .prepare(`
        INSERT INTO customers (
          id, full_name, phone, email, source, notes, tags_json, last_contact_at,
          identity_type, identity_number, nationality, birth_date, gender,
          document_serial_number, document_expiry_date, birth_place, mother_name,
          father_name, issuing_authority, address, created_at, updated_at,
          deleted_at, sync_status
        ) VALUES (
          ?, ?, ?, ?, 'android', ?, ?, '',
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          '', 'local_only'
        )
        ON CONFLICT(id) DO UPDATE SET
          full_name = excluded.full_name,
          phone = excluded.phone,
          email = excluded.email,
          notes = excluded.notes,
          tags_json = excluded.tags_json,
          identity_type = excluded.identity_type,
          identity_number = excluded.identity_number,
          nationality = excluded.nationality,
          birth_date = excluded.birth_date,
          gender = excluded.gender,
          document_serial_number = excluded.document_serial_number,
          document_expiry_date = excluded.document_expiry_date,
          birth_place = excluded.birth_place,
          mother_name = excluded.mother_name,
          father_name = excluded.father_name,
          issuing_authority = excluded.issuing_authority,
          address = excluded.address,
          updated_at = excluded.updated_at,
          deleted_at = '',
          sync_status = 'local_only'
      `)
    .run(
      customerId,
      customer.fullName,
      customer.phone,
      customer.email,
      customer.notes,
      JSON.stringify(customer.tags),
      customer.identityType,
      customer.identityNumber,
      customer.nationality,
      customer.birthDate,
      customer.gender,
      customer.documentSerialNumber,
      customer.documentExpiryDate,
      customer.birthPlace,
      customer.motherName,
      customer.fatherName,
      customer.issuingAuthority,
      customer.address,
      String(existing?.created_at ?? updatedAt) || updatedAt,
      updatedAt
    );
  insertAndroidActionEvent(
    db,
    action,
    updating ? "customer.updated" : "customer.created",
    "customer",
    customerId,
    {
      source: "android",
      identity_type: customer.identityType,
      has_identity_number: Boolean(customer.identityNumber)
    },
    now
  );
  return {
    ok: true,
    message: updating ? "Müşteri kartı telefondan güncellendi." : "Müşteri kartı telefondan oluşturuldu."
  };
}

export function applyAndroidDailyTaskStatus(
  db: DatabaseSync,
  action: AndroidSyncAction,
  status: "done" | "pending" | "cancelled",
  now: string
): AndroidActionMutationResult {
  const taskId = androidPayloadString(action.payload, "task_id");
  if (!taskId) {
    return { ok: false, message: "Güncellenecek günlük iş seçilmemiş." };
  }
  const task = db
    .prepare("SELECT status, updated_at FROM daily_tasks WHERE id = ? AND deleted_at = ''")
    .get(taskId) as { status?: string; updated_at?: string } | undefined;
  if (!task) {
    return { ok: false, message: "Günlük iş masaüstü kayıtlarında bulunamadı." };
  }
  const versionConflict = getAndroidVersionConflict(action.payload, "expected_updated_at", task.updated_at, "Günlük iş");
  if (versionConflict) {
    return versionConflict;
  }
  const updatedAt = nextMutationTimestamp(task.updated_at, now);
  db
    .prepare("UPDATE daily_tasks SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
    .run(status, updatedAt, taskId);
  insertAndroidActionEvent(db, action, status === "done" ? "task.completed" : "task.status_changed", "daily_task", taskId, {
    previous_status: String(task.status ?? ""),
    status
  }, now);
  return { ok: true, message: "Günlük iş telefondan güncellendi." };
}

export function applyAndroidMenuStockAction(
  db: DatabaseSync,
  action: AndroidSyncAction,
  mode: "add" | "set" | "adjust",
  now: string
): AndroidActionMutationResult {
  const menuItemId = androidPayloadString(action.payload, "menu_item_id");
  const note = androidPayloadString(action.payload, "note").slice(0, 500);
  if (!menuItemId) {
    return { ok: false, message: "Stoku güncellenecek menü ürünü seçilmemiş." };
  }

  let quantityChange: number | undefined;
  let quantityAfter: number | undefined;
  if (mode === "set") {
    quantityAfter = normalizeNullableStockNumber(action.payload.quantity) ?? undefined;
    if (quantityAfter === undefined) {
      return { ok: false, message: "Yeni stok adedi 0 veya daha büyük bir sayı olmalı." };
    }
  } else if (mode === "add") {
    quantityChange = normalizePositiveStockNumber(action.payload.quantity) ?? undefined;
    if (quantityChange === undefined) {
      return { ok: false, message: "Eklenecek stok adedi 0'dan büyük olmalı." };
    }
  } else {
    quantityChange = normalizeSignedStockNumber(action.payload.quantity_change) ?? undefined;
    if (quantityChange === undefined || quantityChange === 0) {
      return { ok: false, message: "Stok farkı sıfırdan farklı bir sayı olmalı." };
    }
  }

  const result = mutateStoredMenuStock(db, {
    menuItemId,
    type: mode,
    quantityChange,
    quantityAfter,
    allowStartTracking: mode === "set",
    sourceType: "android",
    sourceId: action.id,
    actorDeviceId: action.device_id,
    note,
    now
  });
  if (!result.ok) {
    return result;
  }
  insertAndroidActionEvent(db, action, "menu.stock_changed", "menu_item", menuItemId, {
    movement_type: mode,
    quantity_before: result.quantityBefore,
    quantity_after: result.quantityAfter
  }, now);
  return { ok: true, message: "Menü ürünü stoku telefondan güncellendi." };
}

function getActiveAndroidActionFailureRows(db: DatabaseSync, limit: number | null = 100): Array<Record<string, unknown>> {
  const statement = db.prepare(`
      SELECT id, actor_id, entity_id, payload_json, created_at
      FROM events
      WHERE type = 'android.action_failed' AND deleted_at = ''
      ORDER BY created_at DESC
      ${limit === null ? "" : "LIMIT ?"}
    `);
  return (limit === null ? statement.all() : statement.all(limit)) as Array<Record<string, unknown>>;
}

function parseStringArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]")) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    return [];
  }
}
