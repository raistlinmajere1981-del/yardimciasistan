import type { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES, type BusinessCapability } from "@yardimci-asistan/shared";
import { androidActionAllowedByCapabilities, resolveAndroidActionPermission, type AndroidSyncAction } from "@yardimci-asistan/sync-core";
import type { ApplyAndroidActionResult, DesktopAndroidActionFailure } from "./database-types.js";
import { insertDatabaseEvent } from "./database/event-store.js";
import { updateRequestStatus } from "./database/request-store.js";
import { saveCustomer } from "./database/customer-store.js";
import { applyInventoryMovementInTransaction, setInventoryCountInTransaction } from "./commerce-store.js";
import { assignHospitalityStay, checkInHospitalityStay } from "./hospitality-entry-service.js";
import { updateCustomerRoomStayStatus, updateReservationStatus } from "./stay-reservation-service.js";
import { updateRoomStatusWithStayGuard } from "./room-status-service.js";
import { convertRequestToReservation } from "./request-intake-service.js";
import { normalizeNullableStockNumber, normalizePositiveStockNumber, normalizeSignedStockNumber } from "./database/stock-utils.js";
import { normalizeStatus } from "./database/request-utils.js";
import {
  androidActionRelatedId, androidActionResolutionKey, androidActionTargetPage,
  androidPayloadString, androidPayloadStringArray, createAndroidEntityId,
  effectiveAndroidPermissions, friendlyDesktopActionFailure, getAndroidVersionConflict,
  isAndroidAdminOnlyAction, nextMutationTimestamp, normalizeAndroidDeviceRole,
  normalizeAndroidFailureTargetPage, parseEventPayload, type AndroidActionMutationResult
} from "./database/android-utils.js";

export function insertAndroidActionEvent(db: DatabaseSync, action: AndroidSyncAction, type: string,
  entityType: string, entityId: string, payload: Record<string, unknown>, now: string) {
  insertDatabaseEvent(db, { type, entityType, entityId, payload, now, androidAction: action });
}

export function authorizeAndroidAction(db: DatabaseSync, action: AndroidSyncAction,
  enabledCapabilities: BusinessCapability[]): AndroidActionMutationResult {
  const deviceId = String(action.device_id ?? "").trim();
  const device = db.prepare(`SELECT role, is_active, permissions_json, revoked_at FROM android_devices WHERE device_id = ? LIMIT 1`)
    .get(deviceId) as Record<string, unknown> | undefined;
  if (!device) return { ok: false, message: "Telefon masaüstü cihaz listesine kaydedilemedi." };
  if (Number(device.is_active ?? 0) !== 1 || String(device.revoked_at ?? "").trim()) {
    return { ok: false, message: "Cihaz masaüstünde pasifleştirilmiş." };
  }
  const requiredPermission = resolveAndroidActionPermission(action.action_type, action.payload);
  if (!requiredPermission) return { ok: false, message: "Telefon işlem türü bu masaüstü sürümünde desteklenmiyor." };
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
    return { ok: false, message: requiredPermission === "table_order.close_paid"
      ? "Bu cihazın hesap kapatma yetkisi yok." : "Bu cihazın bu işlem için yetkisi yok." };
  }
  if (["customer_room_assign", "customer_room_stay_status"].includes(action.action_type) && !permissions.includes("customer.manage")) {
    return { ok: false, message: "Bu cihazın müşteri yönetimi yetkisi yok." };
  }
  return { ok: true, message: "Telefon işlemi yetkilendirildi." };
}

function getAndroidActionCapabilityContext(db: DatabaseSync, action: AndroidSyncAction) {
  const context = {
    requestType: "", reservationType: "", reservationRoomIds: [] as string[], reservationTableIds: [] as string[],
    taskType: String(action.payload.task_type ?? "").trim(), relatedType: String(action.payload.related_type ?? "").trim(),
    relatedReservationType: "", relatedReservationRoomIds: [] as string[], relatedReservationTableIds: [] as string[], payload: action.payload
  };
  if (action.action_type === "customer_request_convert_to_reservation") {
    const requestId = androidPayloadString(action.payload, "request_id");
    const request = requestId ? db.prepare("SELECT request_type FROM requests WHERE id = ? AND deleted_at = ''").get(requestId) as { request_type?: unknown } | undefined : undefined;
    context.requestType = String(request?.request_type ?? "");
  }
  if (["reservation_approve", "reservation_reject", "reservation_cancel"].includes(action.action_type)) {
    const reservationId = androidPayloadString(action.payload, "reservation_id");
    const reservation = reservationId ? db.prepare("SELECT reservation_type, room_ids_json, table_ids_json FROM reservations WHERE id = ? AND deleted_at = ''").get(reservationId) as Record<string, unknown> | undefined : undefined;
    context.reservationType = String(reservation?.reservation_type ?? "");
    context.reservationRoomIds = parseStringArray(reservation?.room_ids_json);
    context.reservationTableIds = parseStringArray(reservation?.table_ids_json);
  }
  if (action.action_type.startsWith("daily_task_")) {
    const taskId = action.action_type === "daily_task_create" ? "" : androidPayloadString(action.payload, "task_id");
    const task = taskId ? db.prepare("SELECT task_type, related_type, related_id FROM daily_tasks WHERE id = ? AND deleted_at = ''").get(taskId) as Record<string, unknown> | undefined : undefined;
    context.taskType = String(task?.task_type ?? context.taskType).trim();
    context.relatedType = String(task?.related_type ?? context.relatedType).trim();
    if (context.relatedType === "reservation") {
      const relatedId = String(task?.related_id ?? action.payload.related_id ?? "").trim();
      const reservation = relatedId ? db.prepare("SELECT reservation_type, room_ids_json, table_ids_json FROM reservations WHERE id = ? AND deleted_at = ''").get(relatedId) as Record<string, unknown> | undefined : undefined;
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
  if (!actionId || !actionType || !deviceId) return;
  const now = new Date().toISOString();
  const resolutionKey = androidActionResolutionKey(action);
  if (result.ok) {
    for (const failure of getActiveAndroidActionFailureRows(db, null)) {
      const payload = parseEventPayload(failure.payload_json);
      if (String(payload.resolution_key ?? "") !== resolutionKey) continue;
      db.prepare("UPDATE events SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at = ''").run(now, now, String(failure.id ?? ""));
    }
    return;
  }
  if (db.prepare("SELECT id FROM events WHERE type = 'android.action_failed' AND entity_id = ? AND deleted_at = '' LIMIT 1").get(actionId)) return;
  insertDatabaseEvent(db, {
    type: "android.action_failed", actorType: "android", actorId: deviceId, entityType: "android_action", entityId: actionId,
    payload: { action_type: actionType, device_id: deviceId, error_message: result.message, resolution_key: resolutionKey,
      target_page: androidActionTargetPage(actionType, action.payload), related_id: androidActionRelatedId(action) }, now
  });
}

export function getAndroidActionFailures(db: DatabaseSync): DesktopAndroidActionFailure[] {
  return getActiveAndroidActionFailureRows(db).map(row => {
    const payload = parseEventPayload(row.payload_json);
    return { id: String(row.entity_id ?? ""), actionType: String(payload.action_type ?? ""), deviceId: String(payload.device_id ?? row.actor_id ?? ""),
      message: friendlyDesktopActionFailure(String(payload.error_message ?? "")), targetPage: normalizeAndroidFailureTargetPage(payload.target_page),
      relatedId: String(payload.related_id ?? ""), createdAt: String(row.created_at ?? "") };
  });
}

export function applyAndroidRequestStatus(db: DatabaseSync, action: AndroidSyncAction, status: string,
  now: string, enabledCapabilities: BusinessCapability[]): AndroidActionMutationResult {
  const id = androidPayloadString(action.payload, "request_id");
  if (!id) return { ok: false, message: "Güncellenecek talep seçilmemiş." };
  const row = db.prepare("SELECT updated_at FROM requests WHERE id = ? AND deleted_at = ''").get(id) as { updated_at: string } | undefined;
  if (!row) return { ok: false, message: "Talep masaüstü kayıtlarında bulunamadı." };
  const conflict = getAndroidVersionConflict(action.payload, "expected_updated_at", row.updated_at, "Talep");
  if (conflict) return conflict;
  const result = updateRequestStatus(db, { requestId: id, status }, {
    now: nextMutationTimestamp(row.updated_at, now), androidAction: action,
    markPreparedMessagesSent: enabledCapabilities.includes(BUSINESS_CAPABILITIES.WHATSAPP)
  });
  return result.ok ? { ok: true, message: "Talep durumu telefondan güncellendi." } : result;
}

export function applyAndroidCustomerSave(db: DatabaseSync, action: AndroidSyncAction, now: string, updating: boolean): AndroidActionMutationResult {
  const customerId = updating ? androidPayloadString(action.payload, "customer_id") : createAndroidEntityId("customer_", action.id);
  const existing = updating ? db.prepare("SELECT updated_at FROM customers WHERE id = ? AND deleted_at = ''").get(customerId) as { updated_at: string } | undefined : undefined;
  if (updating && !existing) return { ok: false, message: "Güncellenecek müşteri masaüstü kayıtlarında bulunamadı." };
  const conflict = updating ? getAndroidVersionConflict(action.payload, "expected_updated_at", existing?.updated_at, "Müşteri") : null;
  if (conflict) return conflict;
  const result = saveCustomer(db, {
    ...(updating ? { id: customerId } : {}), fullName: androidPayloadString(action.payload, "full_name"), phone: androidPayloadString(action.payload, "phone"),
    email: androidPayloadString(action.payload, "email"), notes: androidPayloadString(action.payload, "notes"), tags: androidPayloadStringArray(action.payload, "tags"),
    identityType: androidPayloadString(action.payload, "identity_type"), identityNumber: androidPayloadString(action.payload, "identity_number"),
    nationality: androidPayloadString(action.payload, "nationality"), birthDate: androidPayloadString(action.payload, "birth_date"), gender: androidPayloadString(action.payload, "gender"),
    documentSerialNumber: androidPayloadString(action.payload, "document_serial_number"), documentExpiryDate: androidPayloadString(action.payload, "document_expiry_date"),
    birthPlace: androidPayloadString(action.payload, "birth_place"), motherName: androidPayloadString(action.payload, "mother_name"), fatherName: androidPayloadString(action.payload, "father_name"),
    issuingAuthority: androidPayloadString(action.payload, "issuing_authority"), address: androidPayloadString(action.payload, "address")
  }, { now: nextMutationTimestamp(existing?.updated_at, now), androidAction: action, newCustomerId: customerId });
  return result.ok ? { ok: true, message: updating ? "Müşteri kartı telefondan güncellendi." : "Müşteri kartı telefondan oluşturuldu." } : result;
}

export function applyAndroidDailyTaskStatus(db: DatabaseSync, action: AndroidSyncAction, status: "done" | "pending" | "cancelled", now: string): AndroidActionMutationResult {
  const taskId = androidPayloadString(action.payload, "task_id");
  if (!taskId) return { ok: false, message: "Güncellenecek günlük iş seçilmemiş." };
  const task = db.prepare("SELECT status, updated_at FROM daily_tasks WHERE id = ? AND deleted_at = ''").get(taskId) as { status?: string; updated_at?: string } | undefined;
  if (!task) return { ok: false, message: "Günlük iş masaüstü kayıtlarında bulunamadı." };
  const versionConflict = getAndroidVersionConflict(action.payload, "expected_updated_at", task.updated_at, "Günlük iş");
  if (versionConflict) return versionConflict;
  const updatedAt = nextMutationTimestamp(task.updated_at, now);
  db.prepare("UPDATE daily_tasks SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?").run(status, updatedAt, taskId);
  insertAndroidActionEvent(db, action, status === "done" ? "task.completed" : "task.status_changed", "daily_task", taskId, { previous_status: String(task.status ?? ""), status }, now);
  return { ok: true, message: "Günlük iş telefondan güncellendi." };
}

export function applyAndroidMenuStockAction(db: DatabaseSync, action: AndroidSyncAction, mode: "add" | "set" | "adjust", now: string): AndroidActionMutationResult {
  const productId = androidPayloadString(action.payload, "product_id");
  const note = androidPayloadString(action.payload, "note").slice(0, 500);
  if (!productId) return { ok: false, message: "Stoku güncellenecek menü ürünü seçilmemiş." };
  let quantityChange: number | undefined;
  let quantityAfter: number | undefined;
  if (mode === "set") {
    quantityAfter = normalizeNullableStockNumber(action.payload.quantity) ?? undefined;
    if (quantityAfter === undefined) return { ok: false, message: "Yeni stok adedi 0 veya daha büyük bir sayı olmalı." };
  } else if (mode === "add") {
    quantityChange = normalizePositiveStockNumber(action.payload.quantity) ?? undefined;
    if (quantityChange === undefined) return { ok: false, message: "Eklenecek stok adedi 0'dan büyük olmalı." };
  } else {
    quantityChange = normalizeSignedStockNumber(action.payload.quantity_change) ?? undefined;
    if (quantityChange === undefined || quantityChange === 0) return { ok: false, message: "Stok farkı sıfırdan farklı bir sayı olmalı." };
  }
  const product = db.prepare("SELECT business_id FROM catalog_products WHERE id = ? AND deleted_at = ''").get(productId);
  if (!product) return { ok: false, message: "Ürün bulunamadı." };
  try {
    if (mode === "set") setInventoryCountInTransaction(db, { productId, countedQuantity: quantityAfter!,
      referenceType: "android", referenceId: action.id, actorSource: "android", note }, now);
    else applyInventoryMovementInTransaction(db, String(product.business_id), { productId, type: "adjust",
      quantityDelta: quantityChange!, referenceType: "android", referenceId: action.id, actorSource: "android", note }, now);
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Stok güncellenemedi." }; }
  insertAndroidActionEvent(db, action, "inventory.stock_changed", "catalog_product", productId, { movement_type: mode }, now);
  return { ok: true, message: "Menü ürünü stoku telefondan güncellendi." };
}

function getActiveAndroidActionFailureRows(db: DatabaseSync, limit: number | null = 100): Array<Record<string, unknown>> {
  const statement = db.prepare(`SELECT id, actor_id, entity_id, payload_json, created_at FROM events
    WHERE type = 'android.action_failed' AND deleted_at = '' ORDER BY created_at DESC ${limit === null ? "" : "LIMIT ?"}`);
  return limit === null ? statement.all() : statement.all(limit);
}

function parseStringArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]")) as unknown;
    return Array.isArray(parsed) ? parsed.map(item => String(item).trim()).filter(Boolean) : [];
  } catch { return []; }
}

export function applyAndroidCustomerRoomAssignment(db: DatabaseSync, action: AndroidSyncAction, now: string): AndroidActionMutationResult {
  const databasePath = String(db.prepare("PRAGMA database_list").all().find(row => row.name === "main")?.file ?? "");
  const result = assignHospitalityStay(db, databasePath, {
    customerId: androidPayloadString(action.payload, "customer_id"), roomId: androidPayloadString(action.payload, "room_id"),
    checkInDate: androidPayloadString(action.payload, "check_in_date"), checkOutDate: androidPayloadString(action.payload, "check_out_date"),
    guestCount: Number(action.payload.guest_count ?? 1), notes: androidPayloadString(action.payload, "notes"),
    status: androidPayloadString(action.payload, "status") as "planned" | "checked_in"
  }, { now, androidAction: action, newStayId: createAndroidEntityId("stay_", action.id), allowExtraCapacity: false });
  if (!result.ok && result.message === "Giriş için her misafire ayrı müşteri kaydı ekleyin. Kişi sayısı misafir listesiyle aynı olmalı.") {
    return { ok: false, message: "Çok kişili girişte her misafiri masaüstündeki konaklama listesine ekleyin." };
  }
  return result.ok ? { ok: true, message: "Müşteri telefondan odaya atandı." } : result;
}

export function applyAndroidCustomerRoomStayStatus(db: DatabaseSync, action: AndroidSyncAction, now: string): AndroidActionMutationResult {
  const stayId = androidPayloadString(action.payload, "stay_id");
  const status = normalizeStatus(androidPayloadString(action.payload, "status"), ["planned", "checked_in", "checked_out", "cancelled"]);
  if (!stayId || !status) return { ok: false, message: "Konaklama kaydı ve yeni durum seçilmeli." };
  const stay = db.prepare("SELECT updated_at FROM customer_room_stays WHERE id = ? AND deleted_at = ''").get(stayId) as { updated_at: string } | undefined;
  if (!stay) return { ok: false, message: "Konaklama kaydı masaüstünde bulunamadı." };
  const conflict = getAndroidVersionConflict(action.payload, "expected_updated_at", stay.updated_at, "Konaklama");
  if (conflict) return conflict;
  const context = { now: nextMutationTimestamp(stay.updated_at, now), androidAction: action };
  const databasePath = String(db.prepare("PRAGMA database_list").all().find(row => row.name === "main")?.file ?? "");
  const result = status === "checked_in" ? checkInHospitalityStay(db, databasePath, stayId, context)
    : updateCustomerRoomStayStatus(db, { stayId, status: status as "planned" | "checked_in" | "checked_out" | "cancelled" }, context);
  return result.ok ? { ok: true, message: "Konaklama durumu telefondan güncellendi." } : result;
}

export function applyAndroidReservationStatus(db: DatabaseSync, action: AndroidSyncAction,
  status: "approved" | "rejected" | "cancelled", now: string): AndroidActionMutationResult {
  const id = androidPayloadString(action.payload, "reservation_id");
  if (!id) return { ok: false, message: "Güncellenecek rezervasyon seçilmemiş." };
  const row = db.prepare("SELECT updated_at FROM reservations WHERE id = ? AND deleted_at = ''").get(id) as { updated_at: string } | undefined;
  if (!row) return { ok: false, message: "Rezervasyon masaüstü kayıtlarında bulunamadı." };
  const conflict = getAndroidVersionConflict(action.payload, "expected_updated_at", row.updated_at, "Rezervasyon");
  if (conflict) return conflict;
  const result = updateReservationStatus(db, { reservationId: id, status }, { now: nextMutationTimestamp(row.updated_at, now), androidAction: action });
  return result.ok ? { ok: true, message: "Rezervasyon durumu telefondan güncellendi." } : result;
}

export function applyAndroidRoomStatus(db: DatabaseSync, action: AndroidSyncAction, now: string): AndroidActionMutationResult {
  const roomId = androidPayloadString(action.payload, "room_id");
  const status = normalizeStatus(androidPayloadString(action.payload, "status"), ["available", "reserved", "occupied", "cleaning", "maintenance"]);
  if (!roomId || !status) return { ok: false, message: "Oda veya yeni oda durumu geçersiz." };
  const room = db.prepare("SELECT updated_at FROM rooms WHERE id = ? AND is_active = 1 AND deleted_at = ''").get(roomId) as { updated_at: string } | undefined;
  if (!room) return { ok: false, message: "Oda masaüstü kayıtlarında bulunamadı." };
  const conflict = getAndroidVersionConflict(action.payload, "expected_updated_at", room.updated_at, "Oda");
  if (conflict) return conflict;
  const result = updateRoomStatusWithStayGuard(db, { roomId, status }, { now: nextMutationTimestamp(room.updated_at, now), androidAction: action });
  return result.ok ? { ok: true, message: "Oda durumu telefondan güncellendi." } : result;
}

export function applyAndroidRequestConversion(db: DatabaseSync, action: AndroidSyncAction, now: string,
  enabledCapabilities: BusinessCapability[]): AndroidActionMutationResult {
  const id = androidPayloadString(action.payload, "request_id");
  if (!id) return { ok: false, message: "Rezervasyona çevrilecek talep seçilmemiş." };
  const row = db.prepare("SELECT updated_at FROM requests WHERE id = ? AND deleted_at = ''").get(id) as { updated_at: string } | undefined;
  if (!row) return { ok: false, message: "Talep masaüstü kayıtlarında bulunamadı." };
  const conflict = getAndroidVersionConflict(action.payload, "expected_updated_at", row.updated_at, "Talep");
  if (conflict) return conflict;
  const result = convertRequestToReservation(db, id, enabledCapabilities, {
    now: nextMutationTimestamp(row.updated_at, now), androidAction: action, newReservationId: createAndroidEntityId("reservation_", action.id)
  });
  return result.ok ? { ok: true, message: result.message === "Mevcut rezervasyon onaylandı."
    ? "Mevcut rezervasyon telefondan onaylandı." : "Talep telefondan rezervasyona çevrildi." } : result;
}
