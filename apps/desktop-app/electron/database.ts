import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  BUSINESS_CAPABILITIES,
  canConvertRequestToReservation,
  createId,
  normalizeBirthdaySettings,
  getRequestReservationType,
  isRequestTypeAvailable,
  normalizeBusinessType,
  normalizePhone,
  validateBirthdaySettings,
  type BusinessCapability,
  type StockImageAnalysis,
  type StockImageApplyLine,
  type StockImageImportSource,
  type StockImageMenuCandidate
} from "@yardimci-asistan/shared";
import {
  androidActionAllowedByCapabilities,
  resolveAndroidActionPermission
} from "@yardimci-asistan/sync-core";
import type {
  AndroidReportPresetKey,
  AndroidReportSnapshot,
  AndroidDeviceRole,
  AndroidDeviceSighting,
  AndroidPermission,
  AndroidPermissionGroups,
  AndroidSnapshotPermissionProfile,
  AndroidSyncAction,
  PublishedQrMenu,
  PushAiSettingsResult,
  SyncedCustomerRequest
} from "@yardimci-asistan/sync-core";
import { applyAndroidReservationAction } from "./android-reservation-actions.js";
import { applyAndroidDailyTaskAction } from "./android-daily-task-actions.js";
import { applyAndroidFinanceAction } from "./android-finance-actions.js";
import { applyAndroidRoomFolioAction } from "./android-room-folio-actions.js";
import { applyMarketAndroidAction } from "./market-android-actions.js";
import {
  applyBusinessProfileCapabilities,
  setBusinessCapability
} from "./business-capability-store.js";
import {
  claimAutomaticBirthdayDelivery,
  getAutomaticBirthdayCandidates,
  getBirthdayOverview as readBirthdayOverview,
  markBirthdayDeliveryFailed,
  markBirthdayDeliveryPrepared,
  markBirthdayDeliverySkipped,
  markBirthdayDeliverySent,
  markBirthdayDeliveryWaiting,
  prepareBirthdayWhatsApp as prepareBirthdayWhatsAppMessage,
  revalidateAutomaticBirthdayDelivery,
  type BirthdayAutomaticClaimResult,
  type DesktopBirthdayDelivery,
  type DesktopBirthdayOverview,
  type DesktopBirthdayPrepareResult
} from "./birthday-service.js";

export type { DesktopBirthdayCandidate, DesktopBirthdayDelivery, DesktopBirthdayOverview, DesktopBirthdayPrepareResult } from "./birthday-service.js";

import type {
  DesktopDatabaseOptions,
  DesktopRoom,
  DesktopTable,
  DesktopTableCategory,
  DesktopReservation,
  DesktopDailyTask,
  DesktopCustomer,
  DesktopCustomerRoomStay,
  DesktopPreparedMessage,
  DesktopAndroidDevice,
  DesktopAndroidActionFailure,
  DesktopAndroidDeviceMutationResult,
  DesktopDashboardData,
  DesktopReportPreset,
  DesktopReportRangeInput,
  DesktopReportPeriod,
  DesktopReportStockMovement,
  DesktopReportData,
  DesktopReportQueryResult,
  DesktopReportAiMode,
  GenerateDesktopReportAiInput,
  GenerateDesktopReportAiResult,
  DesktopAiService,
  DesktopAiModelOption,
  DesktopAiServiceProfile,
  SaveAiServiceProfileInput,
  AiApiKeyWrite,
  DesktopSetupData,
  SaveInitialSetupInput,
  DesktopSetupSaveResult,
  SaveMenuCategoryInput,
  SaveMenuItemInput,
  MenuStockMovementType,
  MenuStockSourceType,
  DesktopMenuStockMovement,
  DesktopMenuSaveResult,
  CreateStockImageImportInput,
  ApplyStockImageImportInput,
  DesktopStockImageAnalyzeInput,
  DesktopStockImageAnalyzeResult,
  DesktopStockImageApplyResult,
  SaveCustomerInput,
  AssignCustomerRoomInput,
  UpdateCustomerRoomStayStatusInput,
  DesktopCustomerMutationResult,
  DesktopIdentityImageAnalyzeInput,
  DesktopIdentityImageAnalyzeResult,
  RequestReservationConversionResult,
  CreateManualRequestInput,
  CreateManualRequestResult,
  SaveRequestAiSuggestionInput,
  RequestAiSuggestionResult,
  AiWorkspaceMode,
  AiWorkspaceHistoryEntry,
  GenerateAiWorkspaceInput,
  GenerateAiWorkspaceResult,
  SaveAiWorkspaceResultInput,
  SaveAiWorkspaceResult,
  DesktopStatusUpdateResult,
  UpdateRequestStatusInput,
  UpdateRoomStatusInput,
  UpdateTableStatusInput,
  TableOrderStatus,
  DesktopTableOrderItem,
  DesktopTableOrder,
  DesktopPaymentWaitingTableOrder,
  AddTableOrderItemInput,
  UpdateTableOrderItemQuantityInput,
  UpdateTableOrderItemNoteInput,
  UpdateTableOrderStatusInput,
  DesktopTableOrderResult,
  UpdateReservationStatusInput,
  SaveManualReservationInput,
  SaveManualRestaurantReservationInput,
  UpdateDailyTaskStatusInput,
  SaveDailyTaskInput,
  MarkWhatsAppMessageSentInput,
  DeleteWhatsAppMessageInput,
  RecordSyncEventInput,
  DesktopSyncJobType,
  DesktopSyncJob,
  DesktopSyncRuntimeStatus,
  ApplyAndroidActionResult,
  TableOrderItemStatus,
} from "./database-types.js";

export type {
  DesktopDatabaseOptions,
  DesktopRoom,
  DesktopTable,
  DesktopTableCategory,
  DesktopReservation,
  DesktopDailyTask,
  DesktopCustomer,
  DesktopCustomerRoomStay,
  DesktopPreparedMessage,
  DesktopAndroidDevice,
  DesktopAndroidActionFailure,
  DesktopAndroidDeviceMutationResult,
  DesktopDashboardData,
  DesktopReportPreset,
  DesktopReportRangeInput,
  DesktopReportPeriod,
  DesktopReportStockMovement,
  DesktopReportData,
  DesktopReportQueryResult,
  DesktopReportAiMode,
  GenerateDesktopReportAiInput,
  GenerateDesktopReportAiResult,
  DesktopAiService,
  DesktopAiModelOption,
  DesktopAiServiceProfile,
  SaveAiServiceProfileInput,
  AiApiKeyWrite,
  DesktopSetupData,
  SaveInitialSetupInput,
  DesktopSetupSaveResult,
  SaveMenuCategoryInput,
  SaveMenuItemInput,
  MenuStockMovementType,
  MenuStockSourceType,
  DesktopMenuStockMovement,
  DesktopMenuSaveResult,
  CreateStockImageImportInput,
  ApplyStockImageImportInput,
  DesktopStockImageAnalyzeInput,
  DesktopStockImageAnalyzeResult,
  DesktopStockImageApplyResult,
  SaveCustomerInput,
  AssignCustomerRoomInput,
  UpdateCustomerRoomStayStatusInput,
  DesktopCustomerMutationResult,
  DesktopIdentityImageAnalyzeInput,
  DesktopIdentityImageAnalyzeResult,
  RequestReservationConversionResult,
  CreateManualRequestInput,
  CreateManualRequestResult,
  SaveRequestAiSuggestionInput,
  RequestAiSuggestionResult,
  AiWorkspaceMode,
  AiWorkspaceHistoryEntry,
  GenerateAiWorkspaceInput,
  GenerateAiWorkspaceResult,
  SaveAiWorkspaceResultInput,
  SaveAiWorkspaceResult,
  DesktopStatusUpdateResult,
  UpdateRequestStatusInput,
  UpdateRoomStatusInput,
  UpdateTableStatusInput,
  TableOrderStatus,
  DesktopTableOrderItem,
  DesktopTableOrder,
  DesktopPaymentWaitingTableOrder,
  AddTableOrderItemInput,
  UpdateTableOrderItemQuantityInput,
  UpdateTableOrderItemNoteInput,
  UpdateTableOrderStatusInput,
  DesktopTableOrderResult,
  UpdateReservationStatusInput,
  SaveManualReservationInput,
  SaveManualRestaurantReservationInput,
  UpdateDailyTaskStatusInput,
  SaveDailyTaskInput,
  MarkWhatsAppMessageSentInput,
  DeleteWhatsAppMessageInput,
  RecordSyncEventInput,
  DesktopSyncJobType,
  DesktopSyncJob,
  DesktopSyncRuntimeStatus,
  ApplyAndroidActionResult,
} from "./database-types.js";

type MenuStockMutationResult =
  | {
      ok: true;
      message: string;
      tracked: boolean;
      quantityBefore: number;
      quantityAfter: number;
    }
  | { ok: false; message: string };

export class DesktopDatabase {
  private readonly db: DatabaseSync;
  readonly databasePath: string;
  readonly userDataPath: string;
  readonly backupPath: string;

  constructor(private readonly options: DesktopDatabaseOptions) {
    fs.mkdirSync(options.userDataPath, { recursive: true });
    this.userDataPath = options.userDataPath;
    this.backupPath = options.backupPath
      ? path.resolve(options.backupPath)
      : resolveBackupPath(options.appPath);
    fs.mkdirSync(this.backupPath, { recursive: true });
    this.databasePath = path.join(options.userDataPath, "yardimci-asistan.sqlite");
    this.db = new DatabaseSync(this.databasePath);
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
  }

  initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);

    const migrations = this.readSqlFiles("db/migrations");
    if (migrations.length !== 1 || migrations[0]?.name !== "001_baseline.sql") {
      throw new Error("Yalnız 001_baseline.sql güncel temiz kurulum şeması olarak desteklenir.");
    }

    // Serialize baseline checks and local identity creation across connections.
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const appliedMigrations = this.db
        .prepare("SELECT id FROM schema_migrations ORDER BY id")
        .all() as Array<{ id?: unknown }>;
      const unsupportedMigrations = appliedMigrations
        .map((row) => String(row.id ?? ""))
        .filter((id) => id !== "001_baseline.sql");
      if (unsupportedMigrations.length > 0) {
        throw new Error("Bu veritabanı güncel baseline şemasıyla oluşturulmamış; eski migration zinciri desteklenmiyor.");
      }

      const existingDomainObject = this.db
        .prepare(`
          SELECT 1
          FROM sqlite_master
          WHERE name NOT LIKE 'sqlite_%'
            AND name <> 'schema_migrations'
            AND type IN ('table', 'index', 'view', 'trigger')
          LIMIT 1
        `)
        .get();
      const baselineApplied = appliedMigrations.some((row) => String(row.id ?? "") === "001_baseline.sql");
      if (!baselineApplied && existingDomainObject) {
        throw new Error("Mevcut veritabanı baseline migration işareti taşımıyor; temiz kurulum gerekli.");
      }

      for (const migration of migrations) {
        const alreadyApplied = this.db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(migration.name);
        if (alreadyApplied) {
          continue;
        }

        this.db.exec(migration.sql);
        this.db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(migration.name, new Date().toISOString());
      }

      this.ensureSyncClientId();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getEnabledBusinessCapabilities(): BusinessCapability[] {
    const knownCapabilities = new Set<BusinessCapability>(Object.values(BUSINESS_CAPABILITIES));
    const rows = this.db.prepare(`
      SELECT business_capabilities.capability_id
      FROM business_capabilities
      INNER JOIN business ON business.id = business_capabilities.business_id
      WHERE business.deleted_at = '' AND business_capabilities.is_enabled = 1
      ORDER BY business_capabilities.capability_id ASC
    `).all() as Array<{ capability_id?: unknown }>;

    return rows
      .map((row) => String(row.capability_id ?? "") as BusinessCapability)
      .filter((capability) => knownCapabilities.has(capability));
  }

  getDashboardData(): DesktopDashboardData {
    const settings = this.db.prepare("SELECT web_module_url FROM settings LIMIT 1").get() as { web_module_url?: string } | undefined;

    return {
      databasePath: this.databasePath,
      backupPath: this.backupPath,
      webModuleUrl: settings?.web_module_url ?? "https://yardimciasistan.alwaysdata.net/yardimci-asistan",
      requests: this.getRequests(),
      rooms: this.getRooms(),
      tables: this.getTables(),
      reservations: this.getReservations(),
      dailyTasks: this.getDailyTasks(),
      customers: this.getCustomers(),
      customerRoomStays: this.getCustomerRoomStays(),
      androidDevices: this.getAndroidDevices(),
      paymentWaitingTableOrders: this.listPaymentWaitingTableOrders(),
      androidActionFailures: this.getAndroidActionFailures(),
      birthdayOverview: readBirthdayOverview(this.db),
      summary: {
        newRequests: this.getScalarCount("SELECT COUNT(*) as count FROM requests WHERE status = 'new' AND deleted_at = ''"),
        waitingRequests: this.getScalarCount("SELECT COUNT(*) as count FROM requests WHERE status IN ('new', 'seen', 'waiting_owner', 'pending', 'in_progress') AND deleted_at = ''"),
        pendingDailyTasks: this.getScalarCount("SELECT COUNT(*) as count FROM daily_tasks WHERE status = 'pending' AND deleted_at = ''"),
        availableRooms: this.getScalarCount("SELECT COUNT(*) as count FROM rooms WHERE status = 'available' AND is_active = 1 AND deleted_at = ''"),
        totalRooms: this.getScalarCount("SELECT COUNT(*) as count FROM rooms WHERE is_active = 1 AND deleted_at = ''"),
        availableTables: this.getScalarCount("SELECT COUNT(*) as count FROM tables WHERE status = 'available' AND is_active = 1 AND deleted_at = ''"),
        pendingReservations: this.getScalarCount("SELECT COUNT(*) as count FROM reservations WHERE status = 'pending' AND deleted_at = ''"),
        preparedWhatsAppMessages: this.getScalarCount(`
          SELECT COUNT(*) as count
          FROM whatsapp_messages
          LEFT JOIN requests ON requests.id = whatsapp_messages.request_id AND requests.deleted_at = ''
          WHERE whatsapp_messages.direction = 'outgoing'
            AND whatsapp_messages.status = 'prepared'
            AND whatsapp_messages.deleted_at = ''
            AND (
              requests.id IS NULL
              OR requests.status NOT IN ('answered', 'rejected', 'cancelled', 'archived', 'converted_to_reservation')
            )
        `),
        activeMenuCategories: this.getScalarCount("SELECT COUNT(*) as count FROM menu_categories WHERE is_active = 1 AND deleted_at = ''"),
        availableMenuItems: this.getScalarCount(`
          SELECT COUNT(*) as count
          FROM menu_items
          INNER JOIN menu_categories ON menu_categories.id = menu_items.category_id
          WHERE menu_items.is_available = 1
            AND menu_items.deleted_at = ''
            AND menu_categories.is_active = 1
            AND menu_categories.deleted_at = ''
        `)
      },
      menu: this.getPublishedMenu()
    };
  }

  getBirthdayOverview(now = new Date()): DesktopBirthdayOverview {
    return readBirthdayOverview(this.db, now);
  }

  prepareBirthdayWhatsApp(customerId: string, now = new Date()): DesktopBirthdayPrepareResult {
    return prepareBirthdayWhatsAppMessage(this.db, String(customerId ?? ""), now);
  }

  getAutomaticBirthdayCandidates(now = new Date()) {
    return getAutomaticBirthdayCandidates(this.db, now);
  }

  claimAutomaticBirthdayDelivery(customerId: string, now = new Date()): BirthdayAutomaticClaimResult {
    return claimAutomaticBirthdayDelivery(this.db, customerId, now);
  }

  revalidateAutomaticBirthdayDelivery(
    customerId: string,
    expectedMessage: string,
    expectedPhone: string,
    now = new Date()
  ) {
    return revalidateAutomaticBirthdayDelivery(this.db, customerId, expectedMessage, expectedPhone, now);
  }

  markBirthdayDeliveryPrepared(customerId: string, birthdayYear: number, message: string, now = new Date()): DesktopBirthdayDelivery | null {
    return markBirthdayDeliveryPrepared(this.db, customerId, birthdayYear, message, now);
  }

  markBirthdayDeliverySent(customerId: string, birthdayYear: number, now = new Date()): DesktopBirthdayDelivery | null {
    return markBirthdayDeliverySent(this.db, customerId, birthdayYear, now);
  }

  markBirthdayDeliveryFailed(customerId: string, birthdayYear: number, error: string, retryable: boolean, now = new Date()): DesktopBirthdayDelivery | null {
    return markBirthdayDeliveryFailed(this.db, customerId, birthdayYear, error, retryable, now);
  }

  markBirthdayDeliveryWaiting(
    customerId: string,
    birthdayYear: number,
    birthdayDate: string,
    mode: "manual" | "automatic",
    message: string,
    error: string,
    now = new Date()
  ): DesktopBirthdayDelivery | null {
    return markBirthdayDeliveryWaiting(this.db, customerId, birthdayYear, birthdayDate, mode, message, error, now);
  }

  markBirthdayDeliverySkipped(customerId: string, birthdayYear: number, error: string, now = new Date()): DesktopBirthdayDelivery | null {
    return markBirthdayDeliverySkipped(this.db, customerId, birthdayYear, error, now);
  }

  getReportData(input: DesktopReportRangeInput): DesktopReportData {
    return getStoredReportData(this.db, input, new Set(this.getEnabledBusinessCapabilities()));
  }

  getAndroidReportPresets(referenceDateInput = ""): Record<AndroidReportPresetKey, AndroidReportSnapshot> {
    return getStoredAndroidReportPresets(this.db, referenceDateInput, new Set(this.getEnabledBusinessCapabilities()));
  }

  getAndroidDevices(): DesktopAndroidDevice[] {
    return getStoredAndroidDevices(this.db, new Set(this.getEnabledBusinessCapabilities()));
  }

  getAndroidPermissionSnapshot(): Record<string, AndroidSnapshotPermissionProfile> {
    return getStoredAndroidPermissionSnapshot(this.db, new Set(this.getEnabledBusinessCapabilities()));
  }

  upsertAndroidDeviceSightings(sightings: AndroidDeviceSighting[]): number {
    return upsertStoredAndroidDeviceSightings(this.db, sightings);
  }

  setAndroidDeviceRole(deviceIdInput: string, roleInput: string): DesktopAndroidDeviceMutationResult {
    return setStoredAndroidDeviceRole(this.db, deviceIdInput, roleInput, new Set(this.getEnabledBusinessCapabilities()));
  }

  setAndroidDevicePermissionGroups(deviceIdInput: string, groupsInput: unknown): DesktopAndroidDeviceMutationResult {
    return setStoredAndroidDevicePermissionGroups(this.db, deviceIdInput, groupsInput, new Set(this.getEnabledBusinessCapabilities()));
  }

  setAndroidDeviceActive(deviceIdInput: string, active: boolean): DesktopAndroidDeviceMutationResult {
    return setStoredAndroidDeviceActive(this.db, deviceIdInput, active, new Set(this.getEnabledBusinessCapabilities()));
  }

  resetAndroidDevicePermissions(deviceIdInput: string): DesktopAndroidDeviceMutationResult {
    return resetStoredAndroidDevicePermissions(this.db, deviceIdInput, new Set(this.getEnabledBusinessCapabilities()));
  }

  revokeAndroidDevice(deviceIdInput: string): DesktopAndroidDeviceMutationResult {
    return revokeStoredAndroidDevice(this.db, deviceIdInput, new Set(this.getEnabledBusinessCapabilities()));
  }
  getAndroidPreparedMessages(): DesktopPreparedMessage[] {
    const rows = this.db
      .prepare(`
        SELECT
          whatsapp_messages.id,
          whatsapp_messages.request_id,
          COALESCE(NULLIF(customers.full_name, ''), NULLIF(requests.customer_name, ''), 'Misafir') AS customer_name,
          COALESCE(NULLIF(whatsapp_messages.phone, ''), NULLIF(customers.phone, ''), requests.customer_phone, '') AS customer_phone,
          whatsapp_messages.message,
          whatsapp_messages.status,
          whatsapp_messages.updated_at
        FROM whatsapp_messages
        LEFT JOIN requests ON requests.id = whatsapp_messages.request_id AND requests.deleted_at = ''
        LEFT JOIN customers ON customers.id = whatsapp_messages.customer_id AND customers.deleted_at = ''
        WHERE whatsapp_messages.direction = 'outgoing'
          AND whatsapp_messages.status = 'prepared'
          AND whatsapp_messages.deleted_at = ''
          AND (
            requests.id IS NULL
            OR requests.status NOT IN ('answered', 'rejected', 'cancelled', 'archived', 'converted_to_reservation')
          )
        ORDER BY whatsapp_messages.updated_at DESC, whatsapp_messages.created_at DESC
        LIMIT 300
      `)
      .all() as Array<Record<string, unknown>>;
    const messages: DesktopPreparedMessage[] = rows.map((row) => ({
      id: String(row.id ?? ""),
      requestId: String(row.request_id ?? ""),
      customerName: String(row.customer_name ?? "Misafir"),
      customerPhone: String(row.customer_phone ?? ""),
      message: String(row.message ?? ""),
      status: String(row.status ?? "prepared"),
      updatedAt: String(row.updated_at ?? "")
    }));

    const requestIdsWithMessage = new Set(
      (this.db
        .prepare("SELECT request_id FROM whatsapp_messages WHERE direction = 'outgoing' AND request_id != '' AND deleted_at = ''")
        .all() as Array<{ request_id?: string }>)
        .map((row) => String(row.request_id ?? ""))
    );
    for (const request of this.getRequests()) {
      if (messages.length >= 300 || requestIdsWithMessage.has(request.id)
          || ["answered", "rejected", "cancelled", "archived", "converted_to_reservation"].includes(request.status)) {
        continue;
      }
      const message = String(request.ai_suggested_reply || request.whatsapp_message || "").trim();
      if (!message) {
        continue;
      }
      messages.push({
        id: `message_${request.id}`,
        requestId: request.id,
        customerName: request.customer_name,
        customerPhone: request.customer_phone,
        message,
        status: "prepared",
        updatedAt: request.updated_at
      });
    }
    return messages;
  }

  applyAndroidAction(action: AndroidSyncAction): ApplyAndroidActionResult {
    const actionId = String(action.id ?? "").trim();
    const actionType = String(action.action_type ?? "").trim();
    const deviceId = String(action.device_id ?? "").trim();
    if (!actionId || !actionType || !deviceId || !action.payload || typeof action.payload !== "object" || Array.isArray(action.payload)) {
      return { ok: false, message: "Telefon işlemi eksik veya geçersiz." };
    }

    try {
      this.upsertAndroidDeviceSightings([{
        device_id: deviceId,
        device_name: String(action.device_name ?? ""),
        app_version: String(action.app_version ?? ""),
        first_seen_at: action.created_at,
        last_seen_at: action.last_seen_at || new Date().toISOString()
      }]);
    } catch {
      return { ok: false, message: "Telefon kaydı masaüstünde hazırlanamadı." };
    }

    const existingReceipt = this.db.prepare("SELECT id FROM android_action_receipts WHERE id = ?").get(actionId);
    if (existingReceipt) {
      return {
        ok: true,
        message: "Telefon işlemi daha önce uygulanmış.",
        alreadyApplied: true
      };
    }

    const now = new Date().toISOString();
    let transactionStarted = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      transactionStarted = true;
      const concurrentReceipt = this.db.prepare("SELECT id FROM android_action_receipts WHERE id = ?").get(actionId);
      if (concurrentReceipt) {
        this.db.exec("COMMIT");
        transactionStarted = false;
        return {
          ok: true,
          message: "Telefon işlemi daha önce uygulanmış.",
          alreadyApplied: true
        };
      }

      const authorization = this.authorizeAndroidActionInTransaction(action);
      if (!authorization.ok) {
        this.db.exec("ROLLBACK");
        transactionStarted = false;
        return authorization;
      }

      const result = this.applyAndroidActionInTransaction(action, now);
      if (!result.ok) {
        this.db.exec("ROLLBACK");
        transactionStarted = false;
        return result;
      }

      this.db
        .prepare("INSERT INTO android_action_receipts (id, action_type, device_id, applied_at) VALUES (?, ?, ?, ?)")
        .run(actionId, actionType, deviceId, now);
      this.db.exec("COMMIT");
      transactionStarted = false;
      return {
        ok: true,
        message: result.message,
        alreadyApplied: false
      };
    } catch {
      if (transactionStarted) {
        try {
          this.db.exec("ROLLBACK");
        } catch {
          // Preserve the action failure result even if SQLite already ended the transaction.
        }
      }
      return {
        ok: false,
        message: "Telefon işlemi yerel kayıtlara uygulanamadı. Masaüstünde kayıtları kontrol edip tekrar deneyin."
      };
    }
  }

  saveDailyTask(input: SaveDailyTaskInput): DesktopStatusUpdateResult {
    const taskIdInput = String(input?.id ?? "").trim();
    const title = String(input?.title ?? "").trim().replace(/\s+/g, " ");
    const description = String(input?.description ?? "").trim();
    const taskType = input?.taskType === "manual_pension" || input?.taskType === "manual_restaurant"
      ? input.taskType
      : "";
    const dueDate = String(input?.dueDate ?? "").trim();
    const dueTime = String(input?.dueTime ?? "").trim();

    if (!title) {
      return { ok: false, message: "Günlük iş başlığı boş olamaz." };
    }
    if (title.length > 160) {
      return { ok: false, message: "Günlük iş başlığı en fazla 160 karakter olabilir." };
    }
    if (description.length > 1000) {
      return { ok: false, message: "Günlük iş notu en fazla 1000 karakter olabilir." };
    }
    if (!taskType) {
      return { ok: false, message: "Günlük iş alanı seçilemedi." };
    }
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return { ok: false, message: "Günlük iş tarihi geçersiz." };
    }
    if (dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) {
      return { ok: false, message: "Günlük iş saati geçersiz." };
    }

    const now = new Date().toISOString();
    const taskId = taskIdInput || createId("task_");
    const existing = taskIdInput
      ? this.db.prepare("SELECT task_type FROM daily_tasks WHERE id = ? AND deleted_at = ''").get(taskId) as { task_type?: string } | undefined
      : undefined;
    if (taskIdInput && !existing) {
      return { ok: false, message: "Düzenlenecek günlük iş bulunamadı." };
    }
    if (existing && !String(existing.task_type ?? "").startsWith("manual_")) {
      return { ok: false, message: "Otomatik oluşturulan günlük işler yalnız durum işlemleriyle yönetilebilir." };
    }

    this.db.exec("BEGIN");
    try {
      if (existing) {
        this.db.prepare(`
          UPDATE daily_tasks
          SET title = ?, description = ?, task_type = ?, due_date = ?, due_time = ?, updated_at = ?, sync_status = 'local_only'
          WHERE id = ? AND deleted_at = ''
        `).run(title, description, taskType, dueDate, dueTime, now, taskId);
      } else {
        this.db.prepare(`
          INSERT INTO daily_tasks (
            id, title, description, task_type, status, due_date, due_time, related_type, related_id,
            created_at, updated_at, deleted_at, sync_status
          ) VALUES (?, ?, ?, ?, 'pending', ?, ?, '', '', ?, ?, '', 'local_only')
        `).run(taskId, title, description, taskType, dueDate, dueTime, now, now);
      }
      this.insertEvent({
        type: existing ? "task.updated" : "task.created",
        entityType: "daily_task",
        entityId: taskId,
        payload: { title, task_type: taskType, due_date: dueDate, due_time: dueTime },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Günlük iş kaydedilemedi."
      };
    }

    return {
      ok: true,
      message: existing ? "Günlük iş güncellendi." : "Günlük iş eklendi.",
      dashboardData: this.getDashboardData()
    };
  }

  deleteDailyTask(taskIdInput: string): DesktopStatusUpdateResult {
    const taskId = String(taskIdInput ?? "").trim();
    if (!taskId) {
      return { ok: false, message: "Silinecek günlük iş seçilmeli." };
    }
    const task = this.db.prepare("SELECT task_type, title FROM daily_tasks WHERE id = ? AND deleted_at = ''").get(taskId) as { task_type?: string; title?: string } | undefined;
    if (!task) {
      return { ok: false, message: "Günlük iş bulunamadı." };
    }
    if (!String(task.task_type ?? "").startsWith("manual_")) {
      return { ok: false, message: "Otomatik oluşturulan günlük işler silinemez; durumunu tamamlandı veya iptal olarak değiştirin." };
    }

    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE daily_tasks SET deleted_at = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?").run(now, now, taskId);
      this.insertEvent({
        type: "task.deleted",
        entityType: "daily_task",
        entityId: taskId,
        payload: { title: String(task.title ?? "") },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Günlük iş silinemedi."
      };
    }

    return { ok: true, message: "Günlük iş silindi.", dashboardData: this.getDashboardData() };
  }

  updateDailyTaskStatus(input: UpdateDailyTaskStatusInput): DesktopStatusUpdateResult {
    const taskId = input.taskId.trim();
    const status = normalizeStatus(input.status, ["pending", "done", "cancelled", "archived"]);
    if (!taskId || !status) {
      return {
        ok: false,
        message: "Günlük iş için geçerli kayıt ve durum seçilmeli."
      };
    }

    const task = this.db.prepare("SELECT status FROM daily_tasks WHERE id = ? AND deleted_at = ''").get(taskId) as { status?: string } | undefined;
    if (!task) {
      return {
        ok: false,
        message: "Günlük iş bulunamadı."
      };
    }

    const now = new Date().toISOString();
    const eventType = status === "done" ? "task.completed" : status === "cancelled" ? "task.cancelled" : "task.status_changed";
    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE daily_tasks SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?").run(status, now, taskId);
      this.insertEvent({
        type: eventType,
        entityType: "daily_task",
        entityId: taskId,
        payload: {
          previous_status: String(task.status ?? ""),
          status
        },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      ok: true,
      message: "Günlük iş durumu güncellendi.",
      dashboardData: this.getDashboardData()
    };
  }

  updateRequestStatus(input: UpdateRequestStatusInput): DesktopStatusUpdateResult {
    const requestId = input.requestId.trim();
    const status = normalizeStatus(input.status, ["new", "seen", "waiting_owner", "waiting_customer", "approved", "rejected", "answered", "cancelled", "archived"]);
    if (!requestId || !status) {
      return {
        ok: false,
        message: "Talep durumu için geçerli kayıt ve durum seçilmeli."
      };
    }

    const request = this.db.prepare("SELECT status FROM requests WHERE id = ? AND deleted_at = ''").get(requestId) as { status?: string } | undefined;
    if (!request) {
      return {
        ok: false,
        message: "Talep bulunamadı."
      };
    }

    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE requests SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?").run(status, now, requestId);
      if (status === "answered") {
        this.markPreparedWhatsAppMessagesSentInTransaction(requestId, now);
      }
      this.insertEvent({
        type: "request.status_changed",
        entityType: "request",
        entityId: requestId,
        payload: {
          previous_status: String(request.status ?? ""),
          status
        },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      ok: true,
      message: "Talep durumu güncellendi.",
      dashboardData: this.getDashboardData()
    };
  }

  deleteRequest(requestIdInput: string): DesktopStatusUpdateResult {
    const requestId = requestIdInput.trim();
    if (!requestId) {
      return { ok: false, message: "Silinecek talep seçilmeli." };
    }
    return this.runDesktopDeletion(
      () => this.deleteRequestInTransaction(requestId, new Date().toISOString()),
      "Talep silindi."
    );
  }

  deleteCustomer(customerIdInput: string): DesktopStatusUpdateResult {
    const customerId = customerIdInput.trim();
    if (!customerId) {
      return { ok: false, message: "Silinecek müşteri seçilmeli." };
    }
    return this.runDesktopDeletion(
      () => this.deleteCustomerInTransaction(customerId, new Date().toISOString()),
      "Müşteri silindi; talep ve rezervasyon geçmişi korundu."
    );
  }

  saveCustomer(input: SaveCustomerInput): DesktopCustomerMutationResult {
    const normalized = normalizeCustomerInput(input);
    if (!normalized.ok) {
      return normalized;
    }

    const requestedId = String(input?.id ?? "").trim();
    const existing = requestedId
      ? this.db.prepare("SELECT id, source, created_at, birthday_message_enabled FROM customers WHERE id = ? AND deleted_at = ''").get(requestedId) as Record<string, unknown> | undefined
      : undefined;
    if (requestedId && !existing) {
      return { ok: false, message: "Düzenlenecek müşteri bulunamadı." };
    }

    const duplicateIdentity = normalized.customer.identityNumber
      ? this.db
          .prepare("SELECT id FROM customers WHERE identity_number = ? AND id != ? AND deleted_at = '' LIMIT 1")
          .get(normalized.customer.identityNumber, requestedId)
      : undefined;
    if (duplicateIdentity) {
      return { ok: false, message: "Bu kimlik numarası başka bir müşteri kartında kayıtlı." };
    }
    const duplicatePhone = normalized.customer.phone
      ? this.db
          .prepare("SELECT id FROM customers WHERE phone = ? AND id != ? AND deleted_at = '' LIMIT 1")
          .get(normalized.customer.phone, requestedId)
      : undefined;
    if (duplicatePhone) {
      return { ok: false, message: "Bu telefon numarasıyla kayıtlı bir müşteri zaten var." };
    }

    const id = requestedId || createId("customer_");
    const now = new Date().toISOString();
    const source = String(existing?.source ?? "manual") || "manual";
    const createdAt = String(existing?.created_at ?? now) || now;
    const customer = normalized.customer;
    const birthdayMessageEnabled = input.birthdayMessageEnabled === undefined
      ? normalizeBoolean(existing?.birthday_message_enabled, true)
      : normalizeBoolean(input.birthdayMessageEnabled, true);

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(`
          INSERT INTO customers (
            id, full_name, phone, email, source, notes, tags_json, last_contact_at,
            identity_type, identity_number, nationality, birth_date, gender,
            birthday_message_enabled,
            document_serial_number, document_expiry_date, birth_place, mother_name,
            father_name, issuing_authority, address, created_at, updated_at,
            deleted_at, sync_status
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, '',
            ?, ?, ?, ?, ?,
            ?,
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
            birthday_message_enabled = excluded.birthday_message_enabled,
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
          id,
          customer.fullName,
          customer.phone,
          customer.email,
          source,
          customer.notes,
          JSON.stringify(customer.tags),
          customer.identityType,
          customer.identityNumber,
          customer.nationality,
          customer.birthDate,
          customer.gender,
          birthdayMessageEnabled ? 1 : 0,
          customer.documentSerialNumber,
          customer.documentExpiryDate,
          customer.birthPlace,
          customer.motherName,
          customer.fatherName,
          customer.issuingAuthority,
          customer.address,
          createdAt,
          now
        );
      this.insertEvent({
        type: requestedId ? "customer.updated" : "customer.created",
        entityType: "customer",
        entityId: id,
        payload: {
          source: requestedId ? "desktop_edit" : "desktop_manual",
          identity_type: customer.identityType,
          has_identity_number: Boolean(customer.identityNumber)
        },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      return { ok: false, message: "Müşteri kartı kaydedilemedi. Kimlik ve iletişim alanlarını kontrol edin." };
    }

    return {
      ok: true,
      message: requestedId ? "Müşteri kartı güncellendi." : "Müşteri kartı oluşturuldu.",
      savedId: id,
      dashboardData: this.getDashboardData()
    };
  }

  assignCustomerToRoom(input: AssignCustomerRoomInput): DesktopCustomerMutationResult {
    const customerId = String(input?.customerId ?? "").trim();
    const roomId = String(input?.roomId ?? "").trim();
    const checkInDate = normalizeDateInput(String(input?.checkInDate ?? ""));
    const checkOutDate = normalizeDateInput(String(input?.checkOutDate ?? ""));
    const guestCount = normalizeInteger(Number(input?.guestCount));
    const status = input?.status === "checked_in" ? "checked_in" : input?.status === "planned" ? "planned" : "";
    const notes = normalizeLimitedText(input?.notes, 2000);
    if (!customerId || !roomId || !checkInDate || !status) {
      return { ok: false, message: "Müşteri, oda, giriş tarihi ve konaklama durumu seçilmeli." };
    }
    if (checkOutDate && checkOutDate < checkInDate) {
      return { ok: false, message: "Çıkış tarihi giriş tarihinden önce olamaz." };
    }
    if (guestCount < 1 || guestCount > 50) {
      return { ok: false, message: "Konaklayan kişi sayısı 1 ile 50 arasında olmalı." };
    }

    const customer = this.db
      .prepare("SELECT full_name FROM customers WHERE id = ? AND deleted_at = ''")
      .get(customerId) as { full_name?: string } | undefined;
    const room = this.db
      .prepare("SELECT name, number, capacity, status, is_active FROM rooms WHERE id = ? AND deleted_at = ''")
      .get(roomId) as Record<string, unknown> | undefined;
    if (!customer) {
      return { ok: false, message: "Odaya atanacak müşteri bulunamadı." };
    }
    if (!room || Number(room.is_active ?? 0) !== 1) {
      return { ok: false, message: "Atama yapılacak aktif oda bulunamadı." };
    }
    if (["maintenance", "out_of_service", "cleaning"].includes(String(room.status ?? ""))) {
      return { ok: false, message: "Bakımda, servis dışı veya temizlikte olan odaya müşteri atanamaz." };
    }
    if (Number(room.capacity ?? 0) > 0 && guestCount > Number(room.capacity ?? 0)) {
      return { ok: false, message: `Bu odanın kapasitesi en fazla ${Number(room.capacity)} kişi.` };
    }
    if (this.hasOverlappingCustomerRoomStay(roomId, checkInDate, checkOutDate)) {
      return { ok: false, message: "Seçilen tarihlerde odanın başka bir aktif müşteri kaydı var." };
    }
    const reservationConflict = this.findConflictingRoomReservation(roomId, customerId, checkInDate, checkOutDate);
    if (reservationConflict) {
      return { ok: false, message: `Oda bu tarihlerde ${reservationConflict} rezervasyonuna bağlı.` };
    }

    const id = createId("stay_");
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(`
          INSERT INTO customer_room_stays (
            id, customer_id, room_id, reservation_id, status, check_in_date,
            check_out_date, guest_count, notes, source, checked_in_at,
            checked_out_at, created_at, updated_at, deleted_at, sync_status
          ) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, 'manual', ?, '', ?, ?, '', 'local_only')
        `)
        .run(
          id,
          customerId,
          roomId,
          status,
          checkInDate,
          checkOutDate,
          guestCount,
          notes,
          status === "checked_in" ? now : "",
          now,
          now
        );
      this.db
        .prepare("UPDATE rooms SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
        .run(status === "checked_in" ? "occupied" : "reserved", now, roomId);
      this.insertEvent({
        type: "customer.room_assigned",
        entityType: "customer_room_stay",
        entityId: id,
        payload: {
          customer_id: customerId,
          room_id: roomId,
          status,
          check_in_date: checkInDate,
          check_out_date: checkOutDate
        },
        now
      });
      this.db.exec("COMMIT");
    } catch {
      this.db.exec("ROLLBACK");
      return { ok: false, message: "Müşteri oda kaydı oluşturulamadı." };
    }

    const roomLabel = String(room.number ?? "").trim() || String(room.name ?? "").trim();
    return {
      ok: true,
      message: `${String(customer.full_name ?? "Müşteri")} ${roomLabel ? `· ${roomLabel}` : ""} oda kaydına eklendi.`,
      savedId: id,
      dashboardData: this.getDashboardData()
    };
  }

  updateCustomerRoomStayStatus(input: UpdateCustomerRoomStayStatusInput): DesktopCustomerMutationResult {
    const stayId = String(input?.stayId ?? "").trim();
    const status = normalizeStatus(String(input?.status ?? ""), ["planned", "checked_in", "checked_out", "cancelled"]);
    if (!stayId || !status) {
      return { ok: false, message: "Konaklama kaydı ve yeni durum seçilmeli." };
    }
    const stay = this.db
      .prepare(`
        SELECT customer_room_stays.*, customers.full_name, rooms.name AS room_name
        FROM customer_room_stays
        JOIN customers ON customers.id = customer_room_stays.customer_id
        JOIN rooms ON rooms.id = customer_room_stays.room_id
        WHERE customer_room_stays.id = ? AND customer_room_stays.deleted_at = ''
      `)
      .get(stayId) as Record<string, unknown> | undefined;
    if (!stay) {
      return { ok: false, message: "Konaklama kaydı bulunamadı." };
    }
    const previousStatus = String(stay.status ?? "");
    if (previousStatus === status) {
      return {
        ok: true,
        message: "Konaklama kaydı zaten seçilen durumda.",
        savedId: stayId,
        dashboardData: this.getDashboardData()
      };
    }
    const allowedTransitions: Record<string, string[]> = {
      planned: ["checked_in", "cancelled"],
      checked_in: ["checked_out", "cancelled"],
      cancelled: ["planned"],
      checked_out: []
    };
    if (!(allowedTransitions[previousStatus] ?? []).includes(status)) {
      return { ok: false, message: "Bu konaklama kaydı seçilen duruma geçirilemez." };
    }
    if (
      ["planned", "checked_in"].includes(status)
      && this.hasOverlappingCustomerRoomStay(
        String(stay.room_id ?? ""),
        String(stay.check_in_date ?? ""),
        String(stay.check_out_date ?? ""),
        stayId
      )
    ) {
      return { ok: false, message: "Odanın aynı tarihlerde başka bir aktif müşteri kaydı var." };
    }

    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(`
          UPDATE customer_room_stays
          SET status = ?,
              checked_in_at = CASE WHEN ? = 'checked_in' THEN ? ELSE checked_in_at END,
              checked_out_at = CASE WHEN ? = 'checked_out' THEN ? ELSE checked_out_at END,
              updated_at = ?,
              sync_status = 'local_only'
          WHERE id = ?
        `)
        .run(status, status, now, status, now, now, stayId);
      this.refreshRoomStatusFromStays(
        String(stay.room_id ?? ""),
        now,
        status === "checked_out"
      );
      this.insertEvent({
        type: "customer.room_stay_status_changed",
        entityType: "customer_room_stay",
        entityId: stayId,
        payload: {
          customer_id: String(stay.customer_id ?? ""),
          room_id: String(stay.room_id ?? ""),
          previous_status: previousStatus,
          status
        },
        now
      });
      this.db.exec("COMMIT");
    } catch {
      this.db.exec("ROLLBACK");
      return { ok: false, message: "Konaklama durumu güncellenemedi." };
    }

    return {
      ok: true,
      message: status === "checked_in"
        ? "Müşteri odaya giriş yaptı."
        : status === "checked_out"
          ? "Müşteri çıkışı tamamlandı; oda temizlik durumuna alındı."
          : status === "cancelled"
            ? "Oda ataması iptal edildi."
            : "Oda ataması yeniden planlandı.",
      savedId: stayId,
      dashboardData: this.getDashboardData()
    };
  }

  deleteMenuCategory(categoryIdInput: string): DesktopStatusUpdateResult {
    const categoryId = categoryIdInput.trim();
    if (!categoryId) {
      return { ok: false, message: "Silinecek kategori seçilmeli." };
    }
    return this.runDesktopDeletion(
      () => this.deleteMenuCategoryInTransaction(categoryId, new Date().toISOString()),
      "Kategori ve içindeki ürünler silindi."
    );
  }

  deleteMenuItem(itemIdInput: string): DesktopStatusUpdateResult {
    const itemId = itemIdInput.trim();
    if (!itemId) {
      return { ok: false, message: "Silinecek ürün seçilmeli." };
    }
    return this.runDesktopDeletion(
      () => this.deleteMenuItemInTransaction(itemId, new Date().toISOString()),
      "Ürün silindi."
    );
  }

  deleteWhatsAppMessage(input: DeleteWhatsAppMessageInput): DesktopStatusUpdateResult {
    const messageId = String(input?.messageId ?? "").trim();
    const requestId = String(input?.requestId ?? "").trim();
    if (!messageId && !requestId) {
      return { ok: false, message: "Silinecek mesaj seçilmeli." };
    }
    return this.runDesktopDeletion(
      () => this.deleteMessageInTransaction(messageId, requestId, new Date().toISOString()),
      "Hazır mesaj silindi."
    );
  }

  markWhatsAppMessageSent(input: MarkWhatsAppMessageSentInput): DesktopStatusUpdateResult {
    const requestId = input.requestId.trim();
    const message = input.message.trim();
    if (!requestId || !message) {
      return {
        ok: false,
        message: "Gönderilen WhatsApp mesajı için talep ve metin bilgisi gerekli."
      };
    }

    const preparedMessage = this.db
      .prepare(`
        SELECT id, message, status
        FROM whatsapp_messages
        WHERE request_id = ?
          AND direction = 'outgoing'
          AND deleted_at = ''
        ORDER BY updated_at DESC
        LIMIT 1
      `)
      .get(requestId) as { id?: string; message?: string; status?: string } | undefined;

    if (!preparedMessage?.id) {
      return {
        ok: false,
        message: "Talebe ait hazır WhatsApp mesajı bulunamadı."
      };
    }

    if (String(preparedMessage.message ?? "").trim() !== message) {
      return {
        ok: false,
        message: "Gönderilen metin yerel AI taslağıyla eşleşmediği için kayıt güncellenmedi."
      };
    }

    if (preparedMessage.status === "sent") {
      return {
        ok: true,
        message: "WhatsApp mesajı daha önce gönderildi olarak kaydedilmiş.",
        dashboardData: this.getDashboardData()
      };
    }

    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(`
          UPDATE whatsapp_messages
          SET mode = 'webview',
              status = 'sent',
              sent_at = ?,
              updated_at = ?,
              sync_status = 'local_only'
          WHERE id = ?
        `)
        .run(now, now, preparedMessage.id);

      this.insertEvent({
        type: "whatsapp.message_sent",
        entityType: "whatsapp_message",
        entityId: preparedMessage.id,
        payload: {
          request_id: requestId,
          mode: "webview",
          user_approved: true
        },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      ok: true,
      message: "WhatsApp mesajı gönderildi olarak kaydedildi.",
      dashboardData: this.getDashboardData()
    };
  }

  updateRoomStatus(input: UpdateRoomStatusInput): DesktopStatusUpdateResult {
    const roomId = input.roomId.trim();
    const status = normalizeStatus(input.status, ["available", "reserved", "occupied", "cleaning", "maintenance"]);
    if (!roomId || !status) {
      return {
        ok: false,
        message: "Oda durumu için geçerli kayıt ve durum seçilmeli."
      };
    }

    const room = this.db.prepare("SELECT status FROM rooms WHERE id = ? AND deleted_at = ''").get(roomId) as { status?: string } | undefined;
    if (!room) {
      return {
        ok: false,
        message: "Oda bulunamadı."
      };
    }
    const activeStay = this.db
      .prepare(`
        SELECT status
        FROM customer_room_stays
        WHERE room_id = ?
          AND status IN ('checked_in', 'planned')
          AND deleted_at = ''
        ORDER BY CASE status WHEN 'checked_in' THEN 0 ELSE 1 END
        LIMIT 1
      `)
      .get(roomId) as { status?: string } | undefined;
    const expectedStatus = activeStay?.status === "checked_in"
      ? "occupied"
      : activeStay?.status === "planned"
        ? "reserved"
        : "";
    if (expectedStatus && status !== expectedStatus) {
      return {
        ok: false,
        message: "Odanın aktif müşteri kaydı var. Durumu konaklama kartındaki giriş, çıkış veya iptal işlemiyle değiştirin."
      };
    }

    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE rooms SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?").run(status, now, roomId);
      this.insertEvent({
        type: "room.status_changed",
        entityType: "room",
        entityId: roomId,
        payload: {
          old_status: String(room.status ?? ""),
          new_status: status
        },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      ok: true,
      message: "Oda durumu güncellendi.",
      dashboardData: this.getDashboardData()
    };
  }

  updateTableStatus(input: UpdateTableStatusInput): DesktopStatusUpdateResult {
    const tableId = input.tableId.trim();
    const status = normalizeStatus(input.status, ["available", "reserved", "occupied", "bill_waiting", "cleaning"]);
    if (!tableId || !status) {
      return {
        ok: false,
        message: "Masa durumu için geçerli kayıt ve durum seçilmeli."
      };
    }

    const table = this.db.prepare("SELECT status FROM tables WHERE id = ? AND deleted_at = ''").get(tableId) as { status?: string } | undefined;
    if (!table) {
      return {
        ok: false,
        message: "Masa bulunamadı."
      };
    }

    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE tables SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?").run(status, now, tableId);
      this.insertEvent({
        type: "table.status_changed",
        entityType: "table",
        entityId: tableId,
        payload: {
          old_status: String(table.status ?? ""),
          new_status: status
        },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      ok: true,
      message: "Masa durumu güncellendi.",
      dashboardData: this.getDashboardData()
    };
  }

  listTableOrders(): DesktopTableOrder[] {
    const rows = this.db
      .prepare(`
        SELECT
          table_orders.*,
          tables.name AS table_name,
          COALESCE(SUM(
            CASE
              WHEN table_order_items.status != 'cancelled' THEN table_order_items.quantity
              ELSE 0
            END
          ), 0) AS item_count
        FROM table_orders
        INNER JOIN tables ON tables.id = table_orders.table_id
        LEFT JOIN table_order_items ON table_order_items.order_id = table_orders.id
        GROUP BY table_orders.id
        ORDER BY table_orders.opened_at DESC, table_orders.created_at DESC
      `)
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => this.mapTableOrderRow(row));
  }

  private listPaymentWaitingTableOrders(): DesktopPaymentWaitingTableOrder[] {
    const rows = this.db
      .prepare(`
        SELECT
          table_orders.id,
          table_orders.table_id,
          tables.name AS table_name,
          table_orders.total,
          table_orders.opened_at,
          table_orders.updated_at,
          COALESCE(MAX(
            CASE
              WHEN table_order_items.status != 'cancelled' THEN table_order_items.currency
              ELSE NULL
            END
          ), 'TRY') AS currency
        FROM table_orders
        INNER JOIN tables ON tables.id = table_orders.table_id
        LEFT JOIN table_order_items ON table_order_items.order_id = table_orders.id
        WHERE table_orders.status = 'payment'
        GROUP BY table_orders.id
        ORDER BY table_orders.updated_at DESC, table_orders.opened_at DESC
        LIMIT 100
      `)
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id ?? ""),
      tableId: String(row.table_id ?? ""),
      tableName: String(row.table_name ?? "Masa"),
      total: roundMoney(Number(row.total ?? 0)),
      currency: normalizeTableOrderCurrency(row.currency),
      openedAt: String(row.opened_at ?? ""),
      updatedAt: String(row.updated_at ?? "")
    }));
  }

  getActiveTableOrder(tableId: string): DesktopTableOrder | null {
    const normalizedTableId = tableId.trim();
    if (!normalizedTableId) {
      return null;
    }

    const row = this.db
      .prepare(`
        SELECT
          table_orders.*,
          tables.name AS table_name,
          COALESCE(SUM(
            CASE
              WHEN table_order_items.status != 'cancelled' THEN table_order_items.quantity
              ELSE 0
            END
          ), 0) AS item_count
        FROM table_orders
        INNER JOIN tables ON tables.id = table_orders.table_id
        LEFT JOIN table_order_items ON table_order_items.order_id = table_orders.id
        WHERE table_orders.table_id = ?
          AND table_orders.status IN ('open', 'preparing', 'served', 'payment')
        GROUP BY table_orders.id
        LIMIT 1
      `)
      .get(normalizedTableId) as Record<string, unknown> | undefined;

    return row ? this.mapTableOrderRow(row) : null;
  }

  openTableOrder(tableId: string): DesktopTableOrderResult {
    const normalizedTableId = tableId.trim();
    if (!normalizedTableId) {
      return { ok: false, message: "Sipariş açmak için geçerli bir masa seçin." };
    }

    const id = createTableOrderId("table_order_");
    const now = new Date().toISOString();
    let tableName = "Masa";
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const table = this.db
        .prepare("SELECT id, name, status FROM tables WHERE id = ? AND is_active = 1 AND deleted_at = ''")
        .get(normalizedTableId) as { id?: string; name?: string; status?: string } | undefined;
      if (!table?.id) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Sipariş açılacak aktif masa bulunamadı." };
      }
      tableName = String(table.name ?? "Masa");

      const activeOrder = this.getActiveTableOrder(normalizedTableId);
      if (activeOrder) {
        this.updateTableStatusForOrderInTransaction(
          normalizedTableId,
          activeOrder.status === "payment" ? "bill_waiting" : "occupied",
          activeOrder.id,
          now
        );
        this.db.exec("COMMIT");
        return {
          ok: true,
          message: `${tableName} için açık adisyon gösteriliyor.`,
          order: activeOrder,
          dashboardData: this.getDashboardData()
        };
      }

      this.db
        .prepare(`
          INSERT INTO table_orders (
            id,
            table_id,
            status,
            opened_at,
            closed_at,
            subtotal,
            discount_total,
            total,
            note,
            created_at,
            updated_at
          ) VALUES (?, ?, 'open', ?, '', 0, 0, 0, '', ?, ?)
        `)
        .run(id, normalizedTableId, now, now, now);
      this.updateTableStatusForOrderInTransaction(normalizedTableId, "occupied", id, now);
      this.insertEvent({
        type: "table_order.opened",
        entityType: "table_order",
        entityId: id,
        payload: { table_id: normalizedTableId },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    const order = this.getTableOrderById(id);
    if (!order) {
      return { ok: false, message: "Adisyon açıldı ancak yeniden yüklenemedi." };
    }

    return {
      ok: true,
      message: `${tableName} için adisyon açıldı.`,
      order,
      dashboardData: this.getDashboardData()
    };
  }

  addTableOrderItem(input: AddTableOrderItemInput): DesktopTableOrderResult {
    const orderId = input.orderId.trim();
    const menuItemId = input.menuItemId.trim();
    const quantity = normalizeOrderQuantity(input.quantity);
    const note = String(input.note ?? "").trim().slice(0, 500);
    if (!orderId || !menuItemId || !quantity) {
      return { ok: false, message: "Ürün, aktif adisyon ve geçerli adet bilgisi gerekli." };
    }

    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (!this.isActiveTableOrder(orderId)) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Ürün yalnızca aktif bir adisyona eklenebilir." };
      }

      const menuItem = this.db
        .prepare(`
          SELECT menu_items.id, menu_items.name, menu_items.price, menu_items.currency
          FROM menu_items
          INNER JOIN menu_categories ON menu_categories.id = menu_items.category_id
          WHERE menu_items.id = ?
            AND menu_items.is_available = 1
            AND menu_items.deleted_at = ''
            AND menu_categories.is_active = 1
            AND menu_categories.deleted_at = ''
          LIMIT 1
        `)
        .get(menuItemId) as { id?: string; name?: string; price?: number; currency?: string } | undefined;
      if (!menuItem?.id) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Yalnızca aktif ve mevcut menü ürünleri siparişe eklenebilir." };
      }

      const productName = String(menuItem.name ?? "Ürün").trim() || "Ürün";
      const unitPrice = roundMoney(Number(menuItem.price ?? 0));
      const currency = normalizeTableOrderCurrency(menuItem.currency);
      const orderCurrency = this.db
        .prepare(`
          SELECT currency
          FROM table_order_items
          WHERE order_id = ?
            AND status != 'cancelled'
          ORDER BY created_at ASC
          LIMIT 1
        `)
        .get(orderId) as { currency?: string } | undefined;
      if (orderCurrency?.currency && normalizeTableOrderCurrency(orderCurrency.currency) !== currency) {
        this.db.exec("ROLLBACK");
        return {
          ok: false,
          message: `Bu adisyon ${normalizeTableOrderCurrency(orderCurrency.currency)} para birimiyle açık; ${currency} ürün eklenemez.`
        };
      }

      const existingItem = this.db
        .prepare(`
          SELECT id, quantity
          FROM table_order_items
          WHERE order_id = ?
            AND menu_item_id = ?
            AND product_name = ?
            AND unit_price = ?
            AND currency = ?
            AND note = ?
            AND status = 'open'
          ORDER BY created_at DESC
          LIMIT 1
        `)
        .get(orderId, menuItemId, productName, unitPrice, currency, note) as { id?: string; quantity?: number } | undefined;

      const itemId = existingItem?.id || createTableOrderId("table_order_item_");
      if (existingItem?.id) {
        const nextQuantity = Number(existingItem.quantity ?? 0) + quantity;
        if (nextQuantity > 999) {
          this.db.exec("ROLLBACK");
          return { ok: false, message: "Bir sipariş satırındaki ürün adedi 999'u aşamaz." };
        }
        const stockResult = this.mutateMenuStockInTransaction({
          menuItemId,
          type: "order_add",
          quantityChange: -quantity,
          sourceType: "table_order",
          sourceId: orderId,
          actorDeviceId: "",
          note: `${productName} adisyona eklendi.`,
          now
        });
        if (!stockResult.ok) {
          this.db.exec("ROLLBACK");
          return stockResult;
        }
        this.db
          .prepare("UPDATE table_order_items SET quantity = ?, line_total = ?, updated_at = ? WHERE id = ?")
          .run(nextQuantity, roundMoney(unitPrice * nextQuantity), now, itemId);
      } else {
        const stockResult = this.mutateMenuStockInTransaction({
          menuItemId,
          type: "order_add",
          quantityChange: -quantity,
          sourceType: "table_order",
          sourceId: orderId,
          actorDeviceId: "",
          note: `${productName} adisyona eklendi.`,
          now
        });
        if (!stockResult.ok) {
          this.db.exec("ROLLBACK");
          return stockResult;
        }
        this.db
          .prepare(`
            INSERT INTO table_order_items (
              id,
              order_id,
              menu_item_id,
              product_name,
              unit_price,
              currency,
              quantity,
              line_total,
              note,
              status,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
          `)
          .run(
            itemId,
            orderId,
            menuItemId,
            productName,
            unitPrice,
            currency,
            quantity,
            roundMoney(unitPrice * quantity),
            note,
            now,
            now
          );
      }
      this.recalculateTableOrderTotalInTransaction(orderId, now);
      this.insertEvent({
        type: "table_order.item_added",
        entityType: "table_order",
        entityId: orderId,
        payload: { item_id: itemId, menu_item_id: menuItemId, product_name: productName, quantity, unit_price: unitPrice, currency },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return this.getTableOrderMutationResult(orderId, "Ürün adisyona eklendi.", true);
  }

  updateTableOrderItemQuantity(input: UpdateTableOrderItemQuantityInput): DesktopTableOrderResult {
    const itemId = input.itemId.trim();
    const quantity = normalizeOrderQuantity(input.quantity);
    if (!itemId || !quantity) {
      return { ok: false, message: "Sipariş satırı için 1 ile 999 arasında bir adet girin." };
    }

    const now = new Date().toISOString();
    let orderId = "";
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const item = this.getMutableTableOrderItem(itemId);
      if (!item) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Güncellenecek aktif sipariş satırı bulunamadı." };
      }
      orderId = String(item.order_id);
      const previousQuantity = Number(item.quantity ?? 0);
      if (quantity !== previousQuantity) {
        const stockResult = this.mutateMenuStockInTransaction({
          menuItemId: String(item.menu_item_id ?? ""),
          type: "order_update",
          quantityChange: previousQuantity - quantity,
          sourceType: "table_order",
          sourceId: orderId,
          actorDeviceId: "",
          note: "Adisyon ürün adedi değiştirildi.",
          now
        });
        if (!stockResult.ok) {
          this.db.exec("ROLLBACK");
          return stockResult;
        }
      }
      const lineTotal = roundMoney(Number(item.unit_price ?? 0) * quantity);
      const updatedAt = nextMutationTimestamp(item.updated_at, now);
      this.db
        .prepare("UPDATE table_order_items SET quantity = ?, line_total = ?, updated_at = ? WHERE id = ?")
        .run(quantity, lineTotal, updatedAt, itemId);
      this.recalculateTableOrderTotalInTransaction(orderId, now);
      this.insertEvent({
        type: "table_order.item_quantity_changed",
        entityType: "table_order",
        entityId: orderId,
        payload: { item_id: itemId, quantity },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return this.getTableOrderMutationResult(orderId, "Ürün adedi güncellendi.", true);
  }

  updateTableOrderItemNote(input: UpdateTableOrderItemNoteInput): DesktopTableOrderResult {
    const itemId = input.itemId.trim();
    const note = String(input.note ?? "").trim().slice(0, 500);
    const now = new Date().toISOString();
    let orderId = "";
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const item = this.getMutableTableOrderItem(itemId);
      if (!item) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Not eklenecek aktif sipariş satırı bulunamadı." };
      }
      orderId = String(item.order_id);
      const updatedAt = nextMutationTimestamp(item.updated_at, now);
      this.db.prepare("UPDATE table_order_items SET note = ?, updated_at = ? WHERE id = ?").run(note, updatedAt, itemId);
      this.db.prepare("UPDATE table_orders SET updated_at = ? WHERE id = ?").run(now, orderId);
      this.insertEvent({
        type: "table_order.item_note_changed",
        entityType: "table_order",
        entityId: orderId,
        payload: { item_id: itemId, has_note: Boolean(note) },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getTableOrderMutationResult(orderId, "Ürün notu kaydedildi.");
  }

  removeTableOrderItem(itemId: string): DesktopTableOrderResult {
    const normalizedItemId = itemId.trim();
    const now = new Date().toISOString();
    let orderId = "";
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const item = this.getMutableTableOrderItem(normalizedItemId);
      if (!item) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Silinecek aktif sipariş satırı bulunamadı." };
      }
      orderId = String(item.order_id);
      const stockResult = this.mutateMenuStockInTransaction({
        menuItemId: String(item.menu_item_id ?? ""),
        type: "order_remove",
        quantityChange: Number(item.quantity ?? 0),
        sourceType: "table_order",
        sourceId: orderId,
        actorDeviceId: "",
        note: "Ürün adisyondan silindi.",
        now
      });
      if (!stockResult.ok) {
        this.db.exec("ROLLBACK");
        return stockResult;
      }
      const updatedAt = nextMutationTimestamp(item.updated_at, now);
      this.db.prepare("UPDATE table_order_items SET status = 'cancelled', updated_at = ? WHERE id = ?").run(updatedAt, normalizedItemId);
      this.recalculateTableOrderTotalInTransaction(orderId, now);
      this.insertEvent({
        type: "table_order.item_removed",
        entityType: "table_order",
        entityId: orderId,
        payload: { item_id: normalizedItemId },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return this.getTableOrderMutationResult(orderId, "Ürün adisyondan kaldırıldı.", true);
  }

  updateTableOrderStatus(input: UpdateTableOrderStatusInput): DesktopTableOrderResult {
    const orderId = input.orderId.trim();
    const status = normalizeStatus(input.status, TABLE_ORDER_STATUSES) as TableOrderStatus;
    if (!orderId || !status) {
      return { ok: false, message: "Adisyon için geçerli bir durum seçin." };
    }

    if (status === "paid" || status === "cancelled") {
      return this.closeTableOrder({ orderId, status });
    }

    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.db
        .prepare("SELECT status, table_id FROM table_orders WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')")
        .get(orderId) as { status?: string; table_id?: string } | undefined;
      if (!current) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Durumu güncellenecek aktif adisyon bulunamadı." };
      }

      const updateResult = this.db
        .prepare("UPDATE table_orders SET status = ?, updated_at = ? WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')")
        .run(status, now, orderId);
      if (Number(updateResult.changes) !== 1) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Adisyon başka bir işlem tarafından güncellendi; yeniden yükleyin." };
      }
      if (status === "preparing") {
        this.db
          .prepare("UPDATE table_order_items SET status = 'preparing', updated_at = ? WHERE order_id = ? AND status != 'cancelled'")
          .run(now, orderId);
      } else if (status === "served") {
        this.db
          .prepare("UPDATE table_order_items SET status = 'served', updated_at = ? WHERE order_id = ? AND status != 'cancelled'")
          .run(now, orderId);
      }
      this.updateTableStatusForOrderInTransaction(
        String(current.table_id ?? ""),
        status === "payment" ? "bill_waiting" : "occupied",
        orderId,
        now
      );
      this.insertEvent({
        type: "table_order.status_changed",
        entityType: "table_order",
        entityId: orderId,
        payload: { old_status: String(current.status ?? ""), new_status: status },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return this.getTableOrderMutationResult(orderId, "Adisyon durumu güncellendi.", true);
  }

  closeTableOrder(input: UpdateTableOrderStatusInput): DesktopTableOrderResult {
    const orderId = input.orderId.trim();
    const status = normalizeStatus(input.status, ["paid", "cancelled"]) as "paid" | "cancelled";
    if (!orderId || !status) {
      return { ok: false, message: "Adisyon yalnızca ödendi veya iptal durumuyla kapatılabilir." };
    }

    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.db
        .prepare("SELECT status, table_id FROM table_orders WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')")
        .get(orderId) as { status?: string; table_id?: string } | undefined;
      if (!current) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Kapatılacak aktif adisyon bulunamadı." };
      }
      if (status === "cancelled") {
        const stockRestore = this.restoreCancelledOrderStockInTransaction(orderId, "", now);
        if (!stockRestore.ok) {
          this.db.exec("ROLLBACK");
          return stockRestore;
        }
      }
      this.recalculateTableOrderTotalInTransaction(orderId, now);
      const updateResult = this.db
        .prepare(`
          UPDATE table_orders
          SET status = ?, closed_at = ?, updated_at = ?
          WHERE id = ?
            AND status IN ('open', 'preparing', 'served', 'payment')
        `)
        .run(status, now, now, orderId);
      if (Number(updateResult.changes) !== 1) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Adisyon başka bir işlem tarafından kapatıldı; yeniden yükleyin." };
      }
      this.updateTableStatusForOrderInTransaction(String(current.table_id ?? ""), "available", orderId, now);
      this.insertEvent({
        type: status === "paid" ? "table_order.paid" : "table_order.cancelled",
        entityType: "table_order",
        entityId: orderId,
        payload: { old_status: String(current.status ?? ""), status },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return this.getTableOrderMutationResult(
      orderId,
      status === "paid" ? "Adisyon ödendi olarak kapatıldı." : "Adisyon iptal edildi.",
      true
    );
  }

  recalculateTableOrderTotal(orderId: string): DesktopTableOrderResult {
    const normalizedOrderId = orderId.trim();
    if (!normalizedOrderId) {
      return { ok: false, message: "Toplamı hesaplanacak adisyon bulunamadı." };
    }

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const exists = this.db.prepare("SELECT id FROM table_orders WHERE id = ?").get(normalizedOrderId);
      if (!exists) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Toplamı hesaplanacak adisyon bulunamadı." };
      }
      this.recalculateTableOrderTotalInTransaction(normalizedOrderId, new Date().toISOString());
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getTableOrderMutationResult(normalizedOrderId, "Adisyon toplamı güncellendi.");
  }

  saveManualRestaurantReservation(input: SaveManualRestaurantReservationInput): DesktopStatusUpdateResult {
    const customerId = String(input?.customerId ?? "").trim();
    const tableId = String(input?.tableId ?? "").trim();
    const date = normalizeDateInput(String(input?.date ?? ""));
    const time = normalizeTimeInput(String(input?.time ?? ""));
    const guestCount = normalizeInteger(input?.guestCount);
    const notes = normalizeLimitedText(input?.notes, 2000);

    if (!customerId || !date || !time || guestCount < 1 || guestCount > 99) {
      return { ok: false, message: "Müşteri, tarih, saat ve geçerli kişi sayısı zorunludur." };
    }

    const customer = this.db
      .prepare("SELECT id, full_name, phone FROM customers WHERE id = ? AND deleted_at = ''")
      .get(customerId) as { id?: string; full_name?: string; phone?: string } | undefined;
    if (!customer) {
      return { ok: false, message: "Rezervasyon için seçilen müşteri bulunamadı." };
    }

    if (tableId) {
      const table = this.db
        .prepare("SELECT id, name, capacity, status, is_active FROM tables WHERE id = ? AND deleted_at = ''")
        .get(tableId) as Record<string, unknown> | undefined;
      if (!table || Number(table.is_active ?? 0) !== 1) {
        return { ok: false, message: "Seçilen masa aktif değil veya bulunamadı." };
      }
      if (String(table.status ?? "") === "maintenance") {
        return { ok: false, message: "Bakım durumundaki masaya rezervasyon atanamaz." };
      }
      const capacity = Math.max(0, Number(table.capacity ?? 0));
      if (capacity > 0 && guestCount > capacity) {
        return { ok: false, message: `${String(table.name ?? "Masa")} en fazla ${capacity} kişi kapasitelidir.` };
      }

      const sameSlotRows = this.db
        .prepare(`
          SELECT id, title, table_ids_json
          FROM reservations
          WHERE reservation_type IN ('table', 'breakfast')
            AND status IN ('pending', 'approved')
            AND start_date = ?
            AND time = ?
            AND deleted_at = ''
        `)
        .all(date, time) as Array<{ id?: string; title?: string; table_ids_json?: string }>;
      const conflict = sameSlotRows.find((row) => this.parseStringArray(row.table_ids_json).includes(tableId));
      if (conflict) {
        return {
          ok: false,
          message: `Seçilen masada ${date} ${time} için aktif rezervasyon var${conflict.title ? `: ${conflict.title}` : "."}`
        };
      }
    }

    const now = new Date().toISOString();
    const reservationId = createId("reservation_");
    const customerName = String(customer.full_name ?? "").trim() || "Misafir";
    const tableIds = tableId ? [tableId] : [];

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(`
          INSERT INTO reservations (
            id, request_id, customer_id, reservation_type, status, title, start_date, end_date, time,
            guest_count, adult_count, child_count, room_ids_json, table_ids_json, notes, price_note,
            payment_status, created_at, updated_at, deleted_at, sync_status
          ) VALUES (?, ?, ?, 'table', 'approved', ?, ?, ?, ?, ?, ?, 0, '[]', ?, ?, '',
            'not_required', ?, ?, '', 'local_only')
        `)
        .run(
          reservationId,
          `manual:${reservationId}`,
          customerId,
          `${customerName} - restoran rezervasyonu`,
          date,
          date,
          time,
          guestCount,
          guestCount,
          JSON.stringify(tableIds),
          notes,
          now,
          now
        );

      this.insertEvent({
        type: "reservation.created",
        entityType: "reservation",
        entityId: reservationId,
        payload: {
          source: "manual_desktop",
          customer_id: customerId,
          reservation_type: "table",
          table_ids: tableIds,
          date,
          time,
          guest_count: guestCount
        },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      ok: true,
      message: tableId
        ? "Restoran rezervasyonu oluşturuldu ve masa planlandı."
        : "Restoran rezervasyonu oluşturuldu. Masayı daha sonra atayabilirsiniz.",
      dashboardData: this.getDashboardData()
    };
  }

  saveManualReservation(input: SaveManualReservationInput): DesktopStatusUpdateResult {
    const reservationId = String(input?.reservationId ?? "").trim();
    const customerId = String(input?.customerId ?? "").trim();
    const roomId = String(input?.roomId ?? "").trim();
    const startDate = normalizeDateInput(input?.startDate);
    const endDate = normalizeDateInput(input?.endDate);
    const guestCount = normalizeInteger(Number(input?.guestCount ?? 0));
    const notes = normalizeLimitedText(input?.notes, 2000);

    if (!customerId || !startDate || !endDate || guestCount < 1) {
      return { ok: false, message: "Müşteri, giriş-çıkış tarihi ve kişi sayısı zorunludur." };
    }
    if (endDate <= startDate) {
      return { ok: false, message: "Çıkış tarihi giriş tarihinden sonra olmalıdır." };
    }

    const customer = this.db
      .prepare("SELECT id, full_name, phone FROM customers WHERE id = ? AND deleted_at = ''")
      .get(customerId) as { id?: string; full_name?: string; phone?: string } | undefined;
    if (!customer?.id) {
      return { ok: false, message: "Rezervasyon için geçerli bir müşteri seçin." };
    }

    const existingReservation = reservationId
      ? this.db
        .prepare("SELECT * FROM reservations WHERE id = ? AND deleted_at = ''")
        .get(reservationId) as Record<string, unknown> | undefined
      : undefined;
    if (reservationId && !existingReservation) {
      return { ok: false, message: "Düzenlenecek rezervasyon bulunamadı." };
    }

    const isEditing = Boolean(existingReservation);
    const existingStatus = String(existingReservation?.status ?? "approved");
    const existingRequestId = String(existingReservation?.request_id ?? "");
    const isManualReservation = existingRequestId.startsWith("manual:");
    const existingRoomIds = existingReservation ? this.parseStringArray(existingReservation.room_ids_json) : [];
    const previousRoomId = existingRoomIds[0] ?? "";

    if (existingReservation) {
      if (String(existingReservation.reservation_type ?? "") !== "room") {
        return { ok: false, message: "Bu ekrandan yalnızca pansiyon rezervasyonları düzenlenebilir." };
      }
      if (!["pending", "approved"].includes(existingStatus)) {
        return { ok: false, message: "Tamamlanmış veya iptal edilmiş rezervasyon düzenlenemez." };
      }
      if (existingRoomIds.length > 1) {
        return { ok: false, message: "Birden fazla odaya bağlı rezervasyon bu sade formdan düzenlenemez." };
      }
      if (String(existingReservation.customer_id ?? "") !== customerId) {
        return { ok: false, message: "Rezervasyonun müşteri kaydı bu ekrandan değiştirilemez." };
      }
      if (!isManualReservation) {
        if (String(existingReservation.start_date ?? "") !== startDate
          || String(existingReservation.end_date ?? "") !== endDate
          || Number(existingReservation.guest_count ?? 0) !== guestCount) {
          return { ok: false, message: "Web talebinden oluşan rezervasyonda tarih ve kişi bilgisi bu ekrandan değiştirilemez." };
        }
      }
      const activeStay = this.db
        .prepare(`
          SELECT id
          FROM customer_room_stays
          WHERE reservation_id = ?
            AND status IN ('planned', 'checked_in')
            AND deleted_at = ''
          LIMIT 1
        `)
        .get(reservationId) as { id?: string } | undefined;
      if (activeStay?.id) {
        return { ok: false, message: "Bu rezervasyon aktif konaklamaya dönüştürülmüş. Oda ve tarih değişikliğini konaklama kaydından yönetin." };
      }
    }

    let room: { id?: string; name?: string; capacity?: number; status?: string } | undefined;
    if (roomId) {
      room = this.db
        .prepare("SELECT id, name, capacity, status FROM rooms WHERE id = ? AND is_active = 1 AND deleted_at = ''")
        .get(roomId) as { id?: string; name?: string; capacity?: number; status?: string } | undefined;
      if (!room?.id) {
        return { ok: false, message: "Seçilen oda artık kullanılamıyor." };
      }
      if (String(room.status ?? "") === "maintenance") {
        return { ok: false, message: "Bakım durumundaki odaya rezervasyon açılamaz." };
      }
      if (Number(room.capacity ?? 0) > 0 && guestCount > Number(room.capacity)) {
        return { ok: false, message: `${String(room.name ?? "Oda")} en fazla ${Number(room.capacity)} kişi kapasitelidir.` };
      }
      if (this.hasOverlappingCustomerRoomStay(roomId, startDate, endDate)) {
        return { ok: false, message: `${String(room.name ?? "Seçilen oda")} bu tarihlerde aktif bir konaklama kaydına bağlı.` };
      }

      const conflict = this.getDashboardData().reservations.find((reservation) => {
        if (reservation.id === reservationId) return false;
        if (!["pending", "approved"].includes(reservation.status) || !reservation.roomIds.includes(roomId)) {
          return false;
        }
        const existingStart = reservation.startDate || reservation.endDate;
        const existingEnd = reservation.endDate || reservation.startDate;
        if (!existingStart || !existingEnd) return false;
        return existingStart < endDate && startDate < existingEnd;
      });
      if (conflict) {
        return {
          ok: false,
          message: `${String(room.name ?? "Seçilen oda")} bu tarih aralığında başka bir aktif rezervasyona bağlı.`
        };
      }
    }

    const now = new Date().toISOString();
    const savedReservationId = reservationId || createId("reservation_");
    const customerName = String(customer.full_name ?? "").trim() || "Misafir";
    const roomIds = roomId ? [roomId] : [];

    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (existingReservation) {
        const nextAdultCount = isManualReservation
          ? guestCount
          : Number(existingReservation.adult_count ?? guestCount);
        const nextChildCount = isManualReservation
          ? 0
          : Number(existingReservation.child_count ?? 0);
        this.db
          .prepare(`
            UPDATE reservations
            SET start_date = ?,
                end_date = ?,
                guest_count = ?,
                adult_count = ?,
                child_count = ?,
                room_ids_json = ?,
                notes = ?,
                updated_at = ?,
                sync_status = 'local_only'
            WHERE id = ? AND deleted_at = ''
          `)
          .run(
            startDate,
            endDate,
            guestCount,
            nextAdultCount,
            nextChildCount,
            JSON.stringify(roomIds),
            notes,
            now,
            savedReservationId
          );

        if (previousRoomId && previousRoomId !== roomId) {
          const otherRows = this.db
            .prepare(`
              SELECT room_ids_json
              FROM reservations
              WHERE id != ?
                AND status IN ('pending', 'approved')
                AND deleted_at = ''
            `)
            .all(savedReservationId) as Array<{ room_ids_json?: string }>;
          const stillReserved = otherRows.some((row) => this.parseStringArray(row.room_ids_json).includes(previousRoomId));
          if (!stillReserved) {
            this.db
              .prepare("UPDATE rooms SET status = 'available', updated_at = ?, sync_status = 'local_only' WHERE id = ? AND status = 'reserved' AND deleted_at = ''")
              .run(now, previousRoomId);
            this.enforceActiveStayRoomStatus(previousRoomId, now);
          }
        }
      } else {
        this.db
          .prepare(`
            INSERT INTO reservations (
              id, request_id, customer_id, reservation_type, status, title, start_date, end_date, time,
              guest_count, adult_count, child_count, room_ids_json, table_ids_json, notes, price_note,
              payment_status, created_at, updated_at, deleted_at, sync_status
            ) VALUES (?, ?, ?, 'room', 'approved', ?, ?, ?, '', ?, ?, 0, ?, '[]', ?, '',
              'not_required', ?, ?, '', 'local_only')
          `)
          .run(
            savedReservationId,
            `manual:${savedReservationId}`,
            customerId,
            `${customerName} - oda rezervasyonu`,
            startDate,
            endDate,
            guestCount,
            guestCount,
            JSON.stringify(roomIds),
            notes,
            now,
            now
          );
      }

      if (roomId && existingStatus === "approved" && String(room?.status ?? "") === "available") {
        this.db
          .prepare("UPDATE rooms SET status = 'reserved', updated_at = ?, sync_status = 'local_only' WHERE id = ? AND deleted_at = ''")
          .run(now, roomId);
      }

      this.insertEvent({
        type: isEditing ? "reservation.updated" : "reservation.created",
        entityType: "reservation",
        entityId: savedReservationId,
        payload: {
          source: isManualReservation || !isEditing ? "manual_desktop" : "desktop_edit",
          customer_id: customerId,
          previous_room_ids: existingRoomIds,
          room_ids: roomIds,
          start_date: startDate,
          end_date: endDate,
          guest_count: guestCount
        },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      ok: true,
      message: isEditing
        ? roomId
          ? "Rezervasyon güncellendi ve oda bilgisi kaydedildi."
          : "Rezervasyon güncellendi. Odayı daha sonra atayabilirsiniz."
        : roomId
          ? "Rezervasyon oluşturuldu ve oda ayrıldı."
          : "Rezervasyon oluşturuldu. Odayı daha sonra atayabilirsiniz.",
      dashboardData: this.getDashboardData()
    };
  }

  updateReservationStatus(input: UpdateReservationStatusInput): DesktopStatusUpdateResult {
    const reservationId = input.reservationId.trim();
    const status = normalizeStatus(input.status, ["pending", "approved", "rejected", "cancelled", "completed"]);
    if (!reservationId || !status) {
      return {
        ok: false,
        message: "Rezervasyon durumu için geçerli kayıt ve durum seçilmeli."
      };
    }

    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const reservation = this.db
        .prepare("SELECT * FROM reservations WHERE id = ? AND deleted_at = ''")
        .get(reservationId) as Record<string, unknown> | undefined;
      if (!reservation) {
        this.db.exec("ROLLBACK");
        return {
          ok: false,
          message: "Rezervasyon bulunamadı."
        };
      }

      const roomIds = this.parseStringArray(reservation.room_ids_json);
      const tableIds = this.parseStringArray(reservation.table_ids_json);
      if (this.findActiveOrderForTables(tableIds)) {
        this.db.exec("ROLLBACK");
        return {
          ok: false,
          message: "Aktif adisyonu olan masaya bağlı rezervasyon değiştirilemez. Önce adisyonu kapatın."
        };
      }

      this.db.prepare("UPDATE reservations SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?").run(status, now, reservationId);

      if (status === "approved") {
        for (const roomId of roomIds) {
          this.db.prepare("UPDATE rooms SET status = 'reserved', updated_at = ?, sync_status = 'local_only' WHERE id = ? AND deleted_at = ''").run(now, roomId);
        }
        for (const tableId of tableIds) {
          this.db
            .prepare("UPDATE tables SET status = 'reserved', current_reservation_id = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ? AND deleted_at = ''")
            .run(reservationId, now, tableId);
        }
      }

      if (["rejected", "cancelled", "completed"].includes(status)) {
        for (const roomId of roomIds) {
          this.db.prepare("UPDATE rooms SET status = 'available', updated_at = ?, sync_status = 'local_only' WHERE id = ? AND status = 'reserved' AND deleted_at = ''").run(now, roomId);
        }
        for (const tableId of tableIds) {
          this.db
            .prepare(`
              UPDATE tables
              SET status = 'available',
                  current_reservation_id = '',
                  updated_at = ?,
                  sync_status = 'local_only'
              WHERE id = ?
                AND current_reservation_id = ?
                AND deleted_at = ''
            `)
            .run(now, tableId, reservationId);
        }
      }

      for (const roomId of roomIds) {
        this.enforceActiveStayRoomStatus(roomId, now);
      }

      this.insertEvent({
        type: "reservation.status_changed",
        entityType: "reservation",
        entityId: reservationId,
        payload: {
          previous_status: String(reservation.status ?? ""),
          status,
          room_ids: roomIds,
          table_ids: tableIds
        },
        now
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      ok: true,
      message: "Rezervasyon durumu güncellendi.",
      dashboardData: this.getDashboardData()
    };
  }

  getSetupData(): DesktopSetupData {
    const business = this.db.prepare("SELECT * FROM business WHERE deleted_at = '' LIMIT 1").get() as Record<string, unknown> | undefined;
    const settings = this.db.prepare("SELECT * FROM settings WHERE deleted_at = '' LIMIT 1").get() as Record<string, unknown> | undefined;
    const enabledCapabilities = new Set(this.getEnabledBusinessCapabilities());
    const syncSecret = String(settings?.sync_secret ?? "");
    const businessName = String(business?.display_name ?? "");
    const aiService = normalizeStoredAiService(settings?.ai_service);
    const aiProfiles = this.getAiServiceProfiles();
    const activeAiProfile = aiProfiles.find((profile) => profile.service === aiService);
    const setupCompleted = Number(settings?.setup_completed ?? 0) === 1;
    const setupRequired =
      !setupCompleted ||
      !businessName.trim() ||
      syncSecret.length < 12 ||
      syncSecret === "change-this-secret";

    return {
      setupRequired,
      appPasswordConfigured: Boolean(String(settings?.app_password_verifier ?? "").trim()),
      businessName,
      profileId: normalizeBusinessType(String(business?.profile_id ?? "")),
      phone: String(business?.phone ?? ""),
      whatsapp: String(business?.whatsapp ?? ""),
      email: String(business?.email ?? ""),
      address: String(business?.address ?? ""),
      webModuleUrl: String(settings?.web_module_url ?? "https://yardimciasistan.alwaysdata.net/yardimci-asistan"),
      syncSecret,
      autoSyncEnabled: Number(settings?.auto_sync_enabled ?? 1) === 1,
      aiEnabled: enabledCapabilities.has(BUSINESS_CAPABILITIES.AI),
      aiProvider: String(settings?.ai_provider ?? "openai_compatible") || "openai_compatible",
      aiService,
      aiProjectName: activeAiProfile?.projectName ?? String(settings?.ai_project_name ?? ""),
      aiModel: activeAiProfile?.model ?? String(settings?.ai_model ?? ""),
      aiBaseUrl: activeAiProfile?.baseUrl || normalizeStoredAiBaseUrl(settings?.ai_base_url),
      aiTimeoutSeconds: activeAiProfile?.timeoutSeconds ?? normalizeStoredAiTimeout(settings?.ai_timeout_seconds),
      aiApiKeyConfigured: activeAiProfile?.apiKeyConfigured ?? Boolean(String(settings?.ai_api_key_encrypted ?? "").trim()),
      aiLastPublishedAt: normalizeStoredTimestamp(settings?.ai_last_published_at),
      aiProfiles,
      servicePreferences: {
        whatsapp: enabledCapabilities.has(BUSINESS_CAPABILITIES.WHATSAPP),
        android: enabledCapabilities.has(BUSINESS_CAPABILITIES.ANDROID)
      },
      initialCounts: {
        rooms: this.getScalarCount("SELECT COUNT(*) as count FROM rooms WHERE deleted_at = ''"),
        tables: this.getScalarCount("SELECT COUNT(*) as count FROM tables WHERE deleted_at = ''")
      },
      tableCategories: this.getTableCategories(),
      birthdaySettings: normalizeBirthdaySettings({
        enabled: normalizeBoolean(settings?.birthday_enabled, true),
        mode: settings?.birthday_mode === "automatic" ? "automatic" : "manual",
        sendTime: String(settings?.birthday_send_time ?? "10:00"),
        messageTemplate: String(settings?.birthday_message_template ?? "")
      })
    };
  }

  getAppLockPasswordVerifier(): string {
    const settings = this.db
      .prepare("SELECT app_password_verifier FROM settings WHERE deleted_at = '' LIMIT 1")
      .get() as { app_password_verifier?: string } | undefined;
    return String(settings?.app_password_verifier ?? "").trim();
  }

  setAppLockPasswordVerifier(verifier: string): void {
    const normalizedVerifier = verifier.trim();
    if (normalizedVerifier.length > 1024 || /[\x00-\x1F\x7F]/.test(normalizedVerifier)) {
      throw new Error("Uygulama şifre kaydı geçersiz.");
    }

    const now = new Date().toISOString();
    const result = this.db
      .prepare(`
        UPDATE settings
        SET app_password_verifier = ?,
            app_password_updated_at = ?,
            updated_at = ?
        WHERE deleted_at = ''
      `)
      .run(normalizedVerifier, now, now);
    if (Number(result.changes) === 0) {
      throw new Error("Uygulama şifresinin kaydedileceği ayar bulunamadı.");
    }
  }

  getAppLockNotificationCount(): number {
    const row = this.db
      .prepare(`
        SELECT
          (
            (SELECT COUNT(*) FROM requests WHERE status = 'new' AND deleted_at = '')
            + (SELECT COUNT(*) FROM reservations WHERE status = 'pending' AND deleted_at = '')
            + (SELECT COUNT(*) FROM daily_tasks WHERE status = 'pending' AND deleted_at = '')
            + (
              SELECT COUNT(DISTINCT tables.id)
              FROM tables
              LEFT JOIN table_orders
                ON table_orders.table_id = tables.id
                AND table_orders.status = 'payment'
              WHERE tables.deleted_at = ''
                AND tables.is_active = 1
                AND (tables.status = 'bill_waiting' OR table_orders.id IS NOT NULL)
            )
            + (
              SELECT COUNT(*)
              FROM events
              WHERE type = 'android.action_failed' AND deleted_at = ''
            )
          ) AS count
      `)
      .get() as { count?: number } | undefined;
    return Math.max(0, Number(row?.count ?? 0));
  }

  getAiServiceProfiles(): DesktopAiServiceProfile[] {
    const settings = this.db
      .prepare("SELECT * FROM settings WHERE deleted_at = '' LIMIT 1")
      .get() as Record<string, unknown> | undefined;
    const activeService = normalizeStoredAiService(settings?.ai_service);
    const rows = this.db
      .prepare("SELECT * FROM ai_service_profiles ORDER BY service")
      .all() as Array<Record<string, unknown>>;
    const rowsByService = new Map<DesktopAiService, Record<string, unknown>>();

    for (const row of rows) {
      const service = normalizeAiService(row.service);
      if (service) {
        rowsByService.set(service, row);
      }
    }

    return AI_SERVICE_IDS.map((service) => {
      const row = rowsByService.get(service);
      const useActiveSettings = !row && service === activeService;
      const model = String(row?.model ?? (useActiveSettings ? settings?.ai_model : "") ?? "").trim();
      const baseUrl = normalizeAiBaseUrl(row?.base_url ?? (useActiveSettings ? settings?.ai_base_url : ""))
        || AI_SERVICE_DEFAULT_BASE_URLS[service];
      return {
        service,
        projectName: String(row?.project_name ?? (useActiveSettings ? settings?.ai_project_name : "") ?? "").trim(),
        baseUrl,
        model,
        modelOptions: normalizeAiModelOptions(row?.model_options_json, model),
        timeoutSeconds: normalizeStoredAiTimeout(row?.timeout_seconds ?? (useActiveSettings ? settings?.ai_timeout_seconds : DEFAULT_AI_TIMEOUT_SECONDS)),
        apiKeyConfigured: Boolean(String(row?.api_key_encrypted ?? (useActiveSettings ? settings?.ai_api_key_encrypted : "") ?? "").trim()),
        updatedAt: normalizeStoredTimestamp(row?.updated_at ?? (useActiveSettings ? settings?.updated_at : ""))
      };
    });
  }

  setAutoSyncEnabled(enabled: boolean): DesktopSyncRuntimeStatus {
    return setStoredAutoSyncEnabled(this.db, enabled);
  }

  getSyncRuntimeStatus(): DesktopSyncRuntimeStatus {
    return getStoredSyncRuntimeStatus(this.db);
  }

  getPendingSyncJobs(now = new Date().toISOString()): DesktopSyncJob[] {
    return getStoredPendingSyncJobs(this.db, now);
  }

  queueSyncJob(jobType: DesktopSyncJobType, timestamp = new Date().toISOString()) {
    queueStoredSyncJob(this.db, jobType, timestamp);
  }

  completeSyncJob(jobKey: string, sourceRevision: number) {
    completeStoredSyncJob(this.db, jobKey, sourceRevision);
  }

  failSyncJob(jobKey: string, sourceRevision: number, errorMessage: string, nextAttemptAt: string) {
    failStoredSyncJob(this.db, jobKey, sourceRevision, errorMessage, nextAttemptAt);
  }

  recordSyncAttempt(timestamp = new Date().toISOString()) {
    recordStoredSyncAttempt(this.db, timestamp);
  }

  recordAutomaticSyncSuccess(timestamp = new Date().toISOString()) {
    recordStoredAutomaticSyncSuccess(this.db, timestamp);
  }

  recordAutomaticSyncFailure(message: string, timestamp = new Date().toISOString()) {
    recordStoredAutomaticSyncFailure(this.db, message, timestamp);
  }

  acknowledgeRequestCursor(cursor: number, timestamp = new Date().toISOString()) {
    acknowledgeStoredRequestCursor(this.db, cursor, timestamp);
  }

  getEncryptedAiApiKey(service?: DesktopAiService | string): string {
    const settings = this.db
      .prepare("SELECT ai_service, ai_api_key_encrypted FROM settings WHERE deleted_at = '' LIMIT 1")
      .get() as { ai_service?: string; ai_api_key_encrypted?: string } | undefined;
    const requestedService = service === undefined ? normalizeStoredAiService(settings?.ai_service) : normalizeAiService(service);

    if (!requestedService) {
      return "";
    }

    const profile = this.db
      .prepare("SELECT api_key_encrypted FROM ai_service_profiles WHERE service = ? LIMIT 1")
      .get(requestedService) as { api_key_encrypted?: string } | undefined;
    if (profile) {
      return String(profile.api_key_encrypted ?? "").trim();
    }

    return normalizeStoredAiService(settings?.ai_service) === requestedService
      ? String(settings?.ai_api_key_encrypted ?? "").trim()
      : "";
  }

  markAiSettingsPublished(timestamp: string): DesktopSetupData {
    const publishedAt = normalizePublishedTimestamp(timestamp);
    if (!publishedAt) {
      throw new Error("AI ayarları için geçerli yayın zamanı gerekli.");
    }

    const result = this.db
      .prepare(`
        UPDATE settings
        SET ai_last_published_at = ?,
            updated_at = ?
        WHERE deleted_at = ''
      `)
      .run(publishedAt, new Date().toISOString());

    if (Number(result.changes) === 0) {
      throw new Error("Yayınlandı olarak işaretlenecek AI ayarı bulunamadı.");
    }

    return this.getSetupData();
  }

  saveInitialSetup(
    input: SaveInitialSetupInput,
    aiApiKeyWrite: AiApiKeyWrite = { mode: "keep" },
    aiProfileApiKeyWrites: Partial<Record<DesktopAiService, AiApiKeyWrite>> = {}
  ): DesktopSetupSaveResult {
    const businessName = input.businessName.trim();
    const syncSecret = input.syncSecret.trim();
    const webModuleUrl = normalizeUrl(input.webModuleUrl);
    const aiProvider = input.aiProvider.trim() || "openai_compatible";
    const aiService = normalizeAiService(input.aiService);
    const aiProjectName = String(input.aiProjectName ?? "").trim();
    const aiModel = input.aiModel.trim();
    const aiBaseUrl = normalizeAiBaseUrl(input.aiBaseUrl);
    const aiTimeoutSeconds = normalizeAiTimeout(input.aiTimeoutSeconds);
    const tableCategoryResolution = normalizeTableCategoryInputs(input.tableCategories);
    const rawAiApiKeyProvided = Boolean(String(input.aiApiKey ?? "").trim());
    const existingSettings = this.db.prepare("SELECT * FROM settings WHERE deleted_at = '' LIMIT 1").get() as Record<string, unknown> | undefined;
    const birthdaySettings = normalizeBirthdaySettings(input.birthdaySettings ?? {
      enabled: normalizeBoolean(existingSettings?.birthday_enabled, true),
      mode: existingSettings?.birthday_mode === "automatic" ? "automatic" : "manual",
      sendTime: String(existingSettings?.birthday_send_time ?? "10:00"),
      messageTemplate: String(existingSettings?.birthday_message_template ?? "")
    });
    const profileService = aiService ?? normalizeStoredAiService(existingSettings?.ai_service);
    const existingAiProfile = this.db
      .prepare("SELECT * FROM ai_service_profiles WHERE service = ? LIMIT 1")
      .get(profileService) as Record<string, unknown> | undefined;
    const existingEncryptedAiApiKey = String(
      existingAiProfile?.api_key_encrypted
        ?? (normalizeStoredAiService(existingSettings?.ai_service) === profileService ? existingSettings?.ai_api_key_encrypted : "")
        ?? ""
    ).trim();
    const aiApiKeyResolution = resolveEncryptedAiApiKey({
      rawKeyProvided: rawAiApiKeyProvided,
      clearRequested: Boolean(input.clearAiApiKey),
      write: aiApiKeyWrite,
      existingEncryptedValue: existingEncryptedAiApiKey
    });

    if (!businessName) {
      return {
        ok: false,
        message: "Firma adı gerekli."
      };
    }

    if (!tableCategoryResolution.ok) {
      return tableCategoryResolution;
    }

    if (input.birthdaySettings) {
      const birthdaySettingsError = validateBirthdaySettings(input.birthdaySettings);
      if (birthdaySettingsError) {
        return { ok: false, message: birthdaySettingsError };
      }
    }

    if (
      tableCategoryResolution.categories
      && this.getProtectedTableIds().size > tableCategoryResolution.categories.reduce((total, category) => total + category.tableCount, 0)
    ) {
      return {
        ok: false,
        message: "Aktif adisyon veya rezervasyona bağlı masalar nedeniyle toplam masa sayısı bu kadar azaltılamaz."
      };
    }

    if (!input.whatsapp.trim()) {
      return {
        ok: false,
        message: "WhatsApp numarası gerekli."
      };
    }

    if (!webModuleUrl) {
      return {
        ok: false,
        message: "Web modül adresi http veya https ile başlamalı."
      };
    }

    if (syncSecret.length < 12 || syncSecret === "change-this-secret") {
      return {
        ok: false,
        message: "Web güvenlik anahtarı en az 12 karakter olmalı ve varsayılan değer olmamalı."
      };
    }

    if (!aiApiKeyResolution.ok) {
      return aiApiKeyResolution;
    }

    if (input.aiEnabled && aiProvider !== "openai_compatible") {
      return {
        ok: false,
        message: "AI servis sağlayıcı ayarı geçerli değil."
      };
    }

    if (input.aiEnabled && !aiService) {
      return {
        ok: false,
        message: "AI servisi desteklenmiyor."
      };
    }

    if (aiProjectName.length > 120 || /[\x00-\x1F\x7F]/.test(aiProjectName)) {
      return {
        ok: false,
        message: "Google AI Studio proje adı geçersiz."
      };
    }

    if (input.aiEnabled && !aiBaseUrl) {
      return {
        ok: false,
        message: "AI bağlantı adresi http veya https ile başlamalı ve kullanıcı bilgisi içermemeli."
      };
    }

    if (input.aiEnabled && aiService === "gemini" && aiBaseUrl !== GOOGLE_AI_STUDIO_BASE_URL) {
      return {
        ok: false,
        message: "Google AI Studio için resmi Gemini bağlantı adresi kullanılmalı."
      };
    }

    if (input.aiEnabled && !aiModel) {
      return {
        ok: false,
        message: "AI model adı gerekli."
      };
    }

    if (input.aiEnabled && !aiApiKeyResolution.encryptedValue) {
      return {
        ok: false,
        message: "AI güvenlik anahtarı gerekli."
      };
    }

    if (input.aiEnabled && aiTimeoutSeconds === null) {
      return {
        ok: false,
        message: "AI zaman aşımı 5 ile 120 saniye arasında olmalı."
      };
    }

    const additionalAiProfiles: Array<{
      service: DesktopAiService;
      projectName: string;
      baseUrl: string;
      model: string;
      modelOptions: DesktopAiModelOption[];
      timeoutSeconds: number;
      encryptedApiKey: string;
      createdAt: string;
    }> = [];
    const seenProfileServices = new Set<DesktopAiService>();
    for (const profileInput of Array.isArray(input.aiProfiles) ? input.aiProfiles : []) {
      const service = normalizeAiService(profileInput?.service);
      if (!service) {
        return { ok: false, message: "Kaydedilecek AI servis profillerinden biri geçersiz." };
      }
      if (seenProfileServices.has(service)) {
        return { ok: false, message: "Aynı AI servis profili birden fazla kez gönderilemez." };
      }
      seenProfileServices.add(service);
      if (service === profileService) {
        continue;
      }

      const existingProfile = this.db
        .prepare("SELECT * FROM ai_service_profiles WHERE service = ? LIMIT 1")
        .get(service) as Record<string, unknown> | undefined;
      const projectName = String(profileInput.projectName ?? "").trim();
      const model = String(profileInput.model ?? "").trim();
      const normalizedBaseUrl = normalizeAiBaseUrl(profileInput.baseUrl);
      const baseUrl = normalizedBaseUrl || AI_SERVICE_DEFAULT_BASE_URLS[service];
      const timeoutSeconds = normalizeAiTimeout(profileInput.timeoutSeconds);
      const rawKeyProvided = Boolean(String(profileInput.apiKey ?? "").trim());
      const keyResolution = resolveEncryptedAiApiKey({
        rawKeyProvided,
        clearRequested: Boolean(profileInput.clearApiKey),
        write: aiProfileApiKeyWrites[service] ?? { mode: "keep" },
        existingEncryptedValue: String(existingProfile?.api_key_encrypted ?? "").trim()
      });

      if (!keyResolution.ok) {
        return keyResolution;
      }
      if (projectName.length > 120 || /[\x00-\x1F\x7F]/.test(projectName)) {
        return { ok: false, message: `${getAiServiceDisplayName(service)} profil adı geçersiz.` };
      }
      if (!timeoutSeconds) {
        return { ok: false, message: `${getAiServiceDisplayName(service)} zaman aşımı 5 ile 120 saniye arasında olmalı.` };
      }
      if (service === "gemini" && baseUrl !== GOOGLE_AI_STUDIO_BASE_URL) {
        return { ok: false, message: "Google AI Studio profili için resmi Gemini bağlantı adresi kullanılmalı." };
      }
      if (!baseUrl && (model || keyResolution.encryptedValue)) {
        return { ok: false, message: `${getAiServiceDisplayName(service)} bağlantı adresi gerekli.` };
      }

      additionalAiProfiles.push({
        service,
        projectName,
        baseUrl,
        model,
        modelOptions: normalizeAiModelOptions(
          profileInput.modelOptions === undefined ? existingProfile?.model_options_json : profileInput.modelOptions,
          model
        ),
        timeoutSeconds,
        encryptedApiKey: keyResolution.encryptedValue,
        createdAt: String(existingProfile?.created_at ?? "")
      });
    }

    const now = new Date().toISOString();
    const existingBusiness = this.db.prepare("SELECT id, created_at FROM business WHERE deleted_at = '' LIMIT 1").get() as { id?: string; created_at?: string } | undefined;
    const businessId = existingBusiness?.id || createId("business_");
    const settingsId = String(existingSettings?.id ?? "") || "settings_primary";
    const createdAt = existingBusiness?.created_at || now;
    const settingsCreatedAt = String(existingSettings?.created_at ?? "") || now;
    const storedAiProvider = aiProvider === "openai_compatible" ? aiProvider : "openai_compatible";
    const storedAiService = aiService ?? "openai";
    const storedAiBaseUrl = aiBaseUrl || DEFAULT_AI_BASE_URL;
    const storedAiTimeoutSeconds = aiTimeoutSeconds ?? DEFAULT_AI_TIMEOUT_SECONDS;
    const storedEncryptedAiApiKey = aiApiKeyResolution.encryptedValue;
    const storedAiModelOptions = normalizeAiModelOptions(
      input.aiModelOptions === undefined ? existingAiProfile?.model_options_json : input.aiModelOptions,
      aiModel
    );
    const aiWasEnabled = this.getEnabledBusinessCapabilities().includes(BUSINESS_CAPABILITIES.AI);
    const aiSettingsChanged =
      !existingSettings ||
      aiWasEnabled !== input.aiEnabled ||
      String(existingSettings.ai_provider ?? "") !== storedAiProvider ||
      String(existingSettings.ai_service ?? "") !== storedAiService ||
      String(existingSettings.ai_project_name ?? "") !== aiProjectName ||
      String(existingSettings.ai_model ?? "") !== aiModel ||
      normalizeStoredAiBaseUrl(existingSettings.ai_base_url) !== storedAiBaseUrl ||
      normalizeStoredAiTimeout(existingSettings.ai_timeout_seconds) !== storedAiTimeoutSeconds ||
      existingEncryptedAiApiKey !== storedEncryptedAiApiKey;
    const aiLastPublishedAt = aiSettingsChanged ? "" : normalizeStoredTimestamp(existingSettings?.ai_last_published_at);
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(`
          INSERT INTO business (
            id,
            name,
            display_name,
            profile_id,
            phone,
            whatsapp,
            email,
            address,
            created_at,
            updated_at,
            sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local_only')
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            display_name = excluded.display_name,
            profile_id = excluded.profile_id,
            phone = excluded.phone,
            whatsapp = excluded.whatsapp,
            email = excluded.email,
            address = excluded.address,
            updated_at = excluded.updated_at,
            deleted_at = '',
            sync_status = 'local_only'
        `)
        .run(
          businessId,
          slugifyBusinessName(businessName),
          businessName,
          normalizeBusinessType(input.profileId),
          input.phone.trim(),
          input.whatsapp.trim(),
          input.email.trim(),
          input.address.trim(),
          createdAt,
          now
        );

      this.db
        .prepare(`
          INSERT INTO settings (
            id,
            business_id,
            web_module_url,
            sync_secret,
            auto_sync_enabled,
            ai_provider,
            ai_model,
            ai_service,
            ai_project_name,
            ai_base_url,
            ai_timeout_seconds,
            ai_api_key_encrypted,
            ai_last_published_at,
            whatsapp_mode,
            birthday_enabled,
            birthday_mode,
            birthday_send_time,
            birthday_message_template,
            setup_completed,
            created_at,
            updated_at,
            sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'webview', ?, ?, ?, ?, 1, ?, ?, 'local_only')
          ON CONFLICT(id) DO UPDATE SET
            business_id = excluded.business_id,
            web_module_url = excluded.web_module_url,
            sync_secret = excluded.sync_secret,
            auto_sync_enabled = excluded.auto_sync_enabled,
            ai_provider = excluded.ai_provider,
            ai_model = excluded.ai_model,
            ai_service = excluded.ai_service,
            ai_project_name = excluded.ai_project_name,
            ai_base_url = excluded.ai_base_url,
            ai_timeout_seconds = excluded.ai_timeout_seconds,
            ai_api_key_encrypted = excluded.ai_api_key_encrypted,
            ai_last_published_at = excluded.ai_last_published_at,
            birthday_enabled = excluded.birthday_enabled,
            birthday_mode = excluded.birthday_mode,
            birthday_send_time = excluded.birthday_send_time,
            birthday_message_template = excluded.birthday_message_template,
            setup_completed = 1,
            updated_at = excluded.updated_at,
            deleted_at = '',
            sync_status = 'local_only'
        `)
        .run(
          settingsId,
          businessId,
          webModuleUrl,
          syncSecret,
          input.autoSyncEnabled === false ? 0 : 1,
          storedAiProvider,
          aiModel,
          storedAiService,
          aiProjectName,
          storedAiBaseUrl,
          storedAiTimeoutSeconds,
          storedEncryptedAiApiKey,
          aiLastPublishedAt,
          birthdaySettings.enabled ? 1 : 0,
          birthdaySettings.mode,
          birthdaySettings.sendTime,
          birthdaySettings.messageTemplate,
          settingsCreatedAt,
          now
        );

      this.db
        .prepare(`
          INSERT INTO ai_service_profiles (
            service,
            project_name,
            base_url,
            model,
            model_options_json,
            timeout_seconds,
            api_key_encrypted,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(service) DO UPDATE SET
            project_name = excluded.project_name,
            base_url = excluded.base_url,
            model = excluded.model,
            model_options_json = excluded.model_options_json,
            timeout_seconds = excluded.timeout_seconds,
            api_key_encrypted = excluded.api_key_encrypted,
            updated_at = excluded.updated_at
        `)
        .run(
          storedAiService,
          aiProjectName,
          storedAiBaseUrl,
          aiModel,
          JSON.stringify(storedAiModelOptions),
          storedAiTimeoutSeconds,
          storedEncryptedAiApiKey,
          String(existingAiProfile?.created_at ?? "") || now,
          now
        );

      const saveAiProfile = this.db.prepare(`
        INSERT INTO ai_service_profiles (
          service,
          project_name,
          base_url,
          model,
          model_options_json,
          timeout_seconds,
          api_key_encrypted,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(service) DO UPDATE SET
          project_name = excluded.project_name,
          base_url = excluded.base_url,
          model = excluded.model,
          model_options_json = excluded.model_options_json,
          timeout_seconds = excluded.timeout_seconds,
          api_key_encrypted = excluded.api_key_encrypted,
          updated_at = excluded.updated_at
      `);
      for (const profile of additionalAiProfiles) {
        saveAiProfile.run(
          profile.service,
          profile.projectName,
          profile.baseUrl,
          profile.model,
          JSON.stringify(profile.modelOptions),
          profile.timeoutSeconds,
          profile.encryptedApiKey,
          profile.createdAt || now,
          now
        );
      }

      this.ensureInitialRooms(normalizeInteger(input.initialCounts.rooms), now);
      if (tableCategoryResolution.categories) {
        this.reconcileTableCategories(tableCategoryResolution.categories, now);
      } else {
        this.ensureInitialTables(normalizeInteger(input.initialCounts.tables), now);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    applyBusinessProfileCapabilities(this.databasePath, input.profileId, {
      preserveUserOverrides: true
    });
    for (const [capability, enabled] of [
      [BUSINESS_CAPABILITIES.WHATSAPP, input.servicePreferences.whatsapp],
      [BUSINESS_CAPABILITIES.ANDROID, input.servicePreferences.android],
      [BUSINESS_CAPABILITIES.AI, input.aiEnabled]
    ] as const) {
      setBusinessCapability(this.databasePath, { capability, enabled });
    }

    const enabledCapabilities = new Set(this.getEnabledBusinessCapabilities());
    if (enabledCapabilities.has(BUSINESS_CAPABILITIES.QR_MENU)) {
      this.queueSyncJob("menu_publish", now);
    }
    // This publication is also the persisted capability manifest consumed by
    // hosted service endpoints. Publish a tombstone even when Android is off.
    this.queueSyncJob("android_snapshot", now);

    return {
      ok: true,
      message: "İlk kurulum ayarları kaydedildi.",
      setupData: this.getSetupData(),
      dashboardData: this.getDashboardData()
    };
  }

  getPublishedMenu(): PublishedQrMenu {
    return getStoredPublishedMenu(this.db);
  }

  getDeletedRequestIds(): string[] {
    return (this.db
      .prepare("SELECT id FROM requests WHERE deleted_at != '' ORDER BY deleted_at ASC, id ASC")
      .all() as Array<{ id?: string }>)
      .map((row) => String(row.id ?? "").trim())
      .filter(Boolean);
  }

  getQrMenuPublication(): PublishedQrMenu {
    return getStoredQrMenuPublication(this.db);
  }

  getMenuStockMovements(menuItemId = ""): DesktopMenuStockMovement[] {
    const normalizedMenuItemId = menuItemId.trim();
    const rows = (normalizedMenuItemId
      ? this.db.prepare(`
          SELECT * FROM menu_stock_movements
          WHERE menu_item_id = ?
          ORDER BY created_at ASC, id ASC
        `).all(normalizedMenuItemId)
      : this.db.prepare(`
          SELECT * FROM menu_stock_movements
          ORDER BY created_at ASC, id ASC
        `).all()) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id ?? ""),
      menuItemId: String(row.menu_item_id ?? ""),
      type: String(row.type ?? "adjust") as MenuStockMovementType,
      quantityChange: Number(row.quantity_change ?? 0),
      quantityBefore: Number(row.quantity_before ?? 0),
      quantityAfter: Number(row.quantity_after ?? 0),
      sourceType: String(row.source_type ?? "desktop") as MenuStockSourceType,
      sourceId: String(row.source_id ?? ""),
      actorSource: String(row.actor_source ?? (row.actor_device_id ? "android" : "desktop")) as StockImageImportSource,
      actorDeviceId: String(row.actor_device_id ?? ""),
      note: String(row.note ?? ""),
      createdAt: String(row.created_at ?? "")
    }));
  }

  getTrackedStockCandidates(): StockImageMenuCandidate[] {
    const rows = this.db
      .prepare(`
        SELECT menu_items.id, menu_items.name, menu_items.stock_quantity, menu_items.stock_unit,
          menu_categories.name AS category
        FROM menu_items
        INNER JOIN menu_categories ON menu_categories.id = menu_items.category_id
        WHERE menu_items.deleted_at = ''
          AND menu_categories.deleted_at = ''
          AND menu_items.stock_quantity IS NOT NULL
        ORDER BY menu_categories.sort_order ASC, menu_items.sort_order ASC, menu_items.name ASC
      `)
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      category: String(row.category ?? "Menü"),
      current_stock: Number(row.stock_quantity ?? 0),
      stock_unit: normalizeMenuStockUnit(row.stock_unit)
    }));
  }

  getAppliedStockImageHashes(limit = 100): string[] {
    const normalizedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const rows = this.db
      .prepare(`
        SELECT image_hash
        FROM stock_image_imports
        WHERE status = 'applied'
        ORDER BY applied_at DESC, created_at DESC
        LIMIT ?
      `)
      .all(normalizedLimit) as Array<{ image_hash?: string }>;
    return [...new Set(rows.map((row) => String(row.image_hash ?? "").toLowerCase()).filter(isSha256Hex))];
  }

  createStockImageImport(input: CreateStockImageImportInput): { ok: true; duplicateWarning: boolean } | { ok: false; message: string } {
    const importId = normalizeStockImageImportId(input.importId);
    const imageHash = String(input.imageHash ?? "").trim().toLowerCase();
    const source = input.source === "android" ? "android" : input.source === "desktop" ? "desktop" : null;
    if (!importId || !isSha256Hex(imageHash) || !source) {
      return { ok: false, message: "Görsel içe aktarma kimliği veya özeti geçersiz." };
    }
    if (this.db.prepare("SELECT id FROM stock_image_imports WHERE import_id = ?").get(importId)) {
      return { ok: false, message: "Bu içe aktarma daha önce başlatılmış." };
    }
    const duplicateWarning = Boolean(this.db
      .prepare("SELECT id FROM stock_image_imports WHERE image_hash = ? AND status = 'applied' LIMIT 1")
      .get(imageHash));
    const now = new Date().toISOString();
    this.db
      .prepare(`
        INSERT INTO stock_image_imports (
          id, import_id, source, device_id, image_hash, original_filename, status,
          supplier_name, invoice_number, invoice_date, raw_analysis_json, error_message,
          created_at, applied_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'analyzing', NULL, NULL, NULL, NULL, NULL, ?, NULL)
      `)
      .run(
        `stock_image_import_record_${randomUUID()}`,
        importId,
        source,
        nullableTrimmedString(input.deviceId)?.slice(0, 120) ?? null,
        imageHash,
        nullableTrimmedString(input.originalFilename)?.slice(0, 255) ?? null,
        now
      );
    return { ok: true, duplicateWarning };
  }

  completeStockImageAnalysis(importIdValue: string, analysis: StockImageAnalysis): StockImageAnalysis | null {
    const importId = normalizeStockImageImportId(importIdValue);
    if (!importId) {
      return null;
    }
    const existing = this.db
      .prepare("SELECT status FROM stock_image_imports WHERE import_id = ?")
      .get(importId) as { status?: string } | undefined;
    if (!existing || !["analyzing", "review"].includes(String(existing.status ?? ""))) {
      return null;
    }
    const sanitized = sanitizeStockImageAnalysis(analysis, this.getTrackedStockCandidates());
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("DELETE FROM stock_image_import_lines WHERE import_id = ?").run(importId);
      const insertLine = this.db.prepare(`
        INSERT INTO stock_image_import_lines (
          id, import_id, raw_text, matched_menu_item_id, suggested_quantity,
          approved_quantity, source_quantity_text, confidence, status, note, created_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
      `);
      for (const line of sanitized.lines) {
        const needsReview = line.matched_menu_item_id === null
          || line.suggested_quantity === null
          || line.confidence === "low"
          || Boolean(line.needs_review_reason);
        insertLine.run(
          `stock_image_import_line_${randomUUID()}`,
          importId,
          line.raw_text,
          line.matched_menu_item_id,
          line.suggested_quantity,
          line.source_quantity_text,
          line.confidence,
          needsReview ? "needs_review" : "proposed",
          line.needs_review_reason,
          now
        );
      }
      this.db
        .prepare(`
          UPDATE stock_image_imports
          SET status = 'review', supplier_name = ?, invoice_number = ?, invoice_date = ?,
              raw_analysis_json = ?, error_message = NULL
          WHERE import_id = ? AND status IN ('analyzing', 'review')
        `)
        .run(
          sanitized.document.supplier_name,
          sanitized.document.invoice_number,
          sanitized.document.invoice_date,
          JSON.stringify(sanitized),
          importId
        );
      this.db.exec("COMMIT");
      return sanitized;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  failStockImageImport(importIdValue: string, message: string, cancelled = false): void {
    const importId = normalizeStockImageImportId(importIdValue);
    if (!importId) {
      return;
    }
    this.db
      .prepare(`
        UPDATE stock_image_imports
        SET status = ?, error_message = ?
        WHERE import_id = ? AND status != 'applied'
      `)
      .run(cancelled ? "cancelled" : "failed", String(message ?? "").trim().slice(0, 1000) || null, importId);
  }

  applyStockImageImport(input: ApplyStockImageImportInput): DesktopStockImageApplyResult {
    const importId = normalizeStockImageImportId(input.importId);
    const imageHash = String(input.imageHash ?? "").trim().toLowerCase();
    if (!importId || !isSha256Hex(imageHash)) {
      return { ok: false, message: "Görsel stok taslağı geçersiz." };
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = this.applyStockImageImportInTransaction({
        importId,
        imageHash,
        lines: input.lines,
        source: "desktop",
        actorDeviceId: "",
        duplicateWarningAcknowledged: input.duplicateWarningAcknowledged === true,
        canOverrideDuplicate: true,
        now: new Date().toISOString()
      });
      if (!result.ok) {
        this.db.exec("ROLLBACK");
        return result;
      }
      this.db.exec("COMMIT");
      return {
        ...result,
        dashboardData: this.getDashboardData()
      };
    } catch {
      this.db.exec("ROLLBACK");
      return { ok: false, message: "Stoklar tek işlem içinde güncellenemedi." };
    }
  }

  upsertRequests(requests: SyncedCustomerRequest[], nextCursor?: number) {
    if (requests.length === 0 && nextCursor === undefined) {
      return;
    }

    const statement = this.db.prepare(`
      INSERT INTO requests (
        id,
        customer_id,
        source,
        request_type,
        status,
        customer_name,
        customer_phone,
        date_text,
        start_date,
        end_date,
        time,
        guest_count,
        adult_count,
        child_count,
        message,
        ai_summary,
        ai_suggested_reply,
        whatsapp_message,
        assigned_to,
        priority,
        created_at,
        updated_at,
        sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        customer_id = excluded.customer_id,
        source = excluded.source,
        request_type = excluded.request_type,
        status = excluded.status,
        customer_name = excluded.customer_name,
        customer_phone = excluded.customer_phone,
        date_text = excluded.date_text,
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        time = excluded.time,
        guest_count = excluded.guest_count,
        adult_count = excluded.adult_count,
        child_count = excluded.child_count,
        message = excluded.message,
        ai_summary = excluded.ai_summary,
        ai_suggested_reply = excluded.ai_suggested_reply,
        whatsapp_message = excluded.whatsapp_message,
        assigned_to = excluded.assigned_to,
        priority = excluded.priority,
        updated_at = excluded.updated_at,
        sync_status = excluded.sync_status
    `);

    this.db.exec("BEGIN");
    try {
      for (const request of requests) {
        const customerId = this.ensureCustomerForRequest(request as unknown as Record<string, unknown>, new Date().toISOString());
        statement.run(
          request.id,
          customerId,
          request.source,
          request.request_type,
          request.status,
          request.customer_name,
          request.customer_phone,
          request.date_text,
          request.start_date,
          request.end_date,
          request.time,
          request.guest_count,
          request.adult_count,
          request.child_count,
          request.message,
          request.ai_summary,
          request.ai_suggested_reply,
          request.whatsapp_message,
          request.assigned_to,
          request.priority,
          request.created_at,
          request.updated_at,
          "synced"
        );
      }
      if (nextCursor !== undefined) {
        const now = new Date().toISOString();
        this.db
          .prepare(`
            UPDATE sync_runtime
            SET request_cursor = MAX(request_cursor, ?), updated_at = ?
            WHERE id = 'primary'
          `)
          .run(Math.max(0, Math.trunc(nextCursor)), now);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  markLocalRequestsSynced(requestIds: string[]) {
    if (requestIds.length === 0) {
      return;
    }

    const statement = this.db.prepare("UPDATE requests SET sync_status = 'synced', updated_at = ? WHERE id = ?");
    const now = new Date().toISOString();

    this.db.exec("BEGIN");
    try {
      for (const id of requestIds) {
        statement.run(now, id);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  createManualRequest(input: CreateManualRequestInput): CreateManualRequestResult {
    const requestType = normalizeRequestType(input.requestType);
    if (!isRequestTypeAvailable(this.getEnabledBusinessCapabilities(), requestType)) {
      return {
        ok: false,
        message: "Bu talep türü işletmenin etkin yeteneklerinde kullanılamıyor."
      };
    }
    const customerName = input.customerName.trim();
    if (!customerName) {
      return {
        ok: false,
        message: "Müşteri adı gerekli."
      };
    }

    const phone = normalizePhone(input.customerPhone);
    if (!phone.ok) {
      return {
        ok: false,
        message: phone.error
      };
    }

    const dateText = input.dateText.trim();
    const startDate = normalizeDateInput(input.startDate);
    const endDate = normalizeDateInput(input.endDate);
    const time = normalizeTimeInput(input.time);
    const message = input.message.trim();
    const guestCount = normalizeInteger(input.guestCount);
    const adultCount = Math.max(0, normalizeInteger(input.adultCount));
    const childCount = Math.max(0, normalizeInteger(input.childCount));

    if (input.startDate.trim() && !startDate) {
      return {
        ok: false,
        message: "Giriş tarihi YYYY-AA-GG formatında olmalı."
      };
    }

    if (input.endDate.trim() && !endDate) {
      return {
        ok: false,
        message: "Çıkış tarihi YYYY-AA-GG formatında olmalı."
      };
    }

    if (startDate && endDate && endDate < startDate) {
      return {
        ok: false,
        message: "Çıkış tarihi giriş tarihinden önce olamaz."
      };
    }

    if (input.time.trim() && !time) {
      return {
        ok: false,
        message: "Saat HH:DD formatında olmalı."
      };
    }

    if (guestCount < 1) {
      return {
        ok: false,
        message: "Kişi sayısı en az 1 olmalı."
      };
    }

    if (!dateText && !startDate && !message) {
      return {
        ok: false,
        message: "Talep için tarih notu, giriş tarihi veya not girin."
      };
    }

    const now = new Date().toISOString();
    const request: SyncedCustomerRequest = {
      id: createId("request_"),
      customer_id: "",
      source: "manual",
      request_type: requestType as SyncedCustomerRequest["request_type"],
      status: "new",
      customer_name: customerName,
      customer_phone: phone.e164,
      date_text: dateText,
      start_date: startDate,
      end_date: endDate,
      time,
      guest_count: guestCount,
      adult_count: adultCount,
      child_count: childCount,
      message,
      ai_summary: "",
      ai_suggested_reply: "",
      whatsapp_message: buildManualRequestReply(customerName),
      assigned_to: "",
      priority: normalizePriority(input.priority) as SyncedCustomerRequest["priority"],
      sync_status: "local_only",
      created_at: now,
      updated_at: now
    };

    this.db.exec("BEGIN");
    try {
      const customerId = this.ensureCustomerForRequest(request as unknown as Record<string, unknown>, now);
      request.customer_id = customerId;

      this.db
        .prepare(`
          INSERT INTO requests (
            id,
            customer_id,
            source,
            request_type,
            status,
            customer_name,
            customer_phone,
            date_text,
            start_date,
            end_date,
            time,
            guest_count,
            adult_count,
            child_count,
            message,
            ai_summary,
            ai_suggested_reply,
            whatsapp_message,
            assigned_to,
            priority,
            created_at,
            updated_at,
            sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          request.id,
          request.customer_id,
          request.source,
          request.request_type,
          request.status,
          request.customer_name,
          request.customer_phone,
          request.date_text,
          request.start_date,
          request.end_date,
          request.time,
          request.guest_count,
          request.adult_count,
          request.child_count,
          request.message,
          request.ai_summary,
          request.ai_suggested_reply,
          request.whatsapp_message,
          request.assigned_to,
          request.priority,
          request.created_at,
          request.updated_at,
          request.sync_status
        );

      this.insertEvent({
        type: "request.created",
        entityType: "request",
        entityId: request.id,
        payload: {
          source: request.source,
          request_type: request.request_type,
          customer_id: customerId
        },
        now
      });

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      ok: true,
      message: "Manuel talep kaydedildi.",
      savedId: request.id,
      dashboardData: this.getDashboardData()
    };
  }

  getRequestById(requestId: string): SyncedCustomerRequest | null {
    const id = requestId.trim();
    if (!id) {
      return null;
    }

    const row = this.db
      .prepare(`
        SELECT
          id,
          customer_id,
          source,
          request_type,
          status,
          customer_name,
          customer_phone,
          date_text,
          start_date,
          end_date,
          time,
          guest_count,
          adult_count,
          child_count,
          message,
          ai_summary,
          ai_suggested_reply,
          whatsapp_message,
          assigned_to,
          priority,
          sync_status,
          created_at,
          updated_at
        FROM requests
        WHERE id = ? AND deleted_at = ''
        LIMIT 1
      `)
      .get(id) as Record<string, unknown> | undefined;

    return row ? this.mapRequestRow(row) : null;
  }

  saveRequestAiSuggestion(input: SaveRequestAiSuggestionInput): RequestAiSuggestionResult {
    const requestId = input.requestId.trim();
    const summary = input.summary.trim();
    const suggestedReply = input.suggestedReply.trim();

    if (!requestId) {
      return {
        ok: false,
        message: "AI taslağı için talep seçilmeli."
      };
    }

    if (!suggestedReply) {
      return {
        ok: false,
        message: "AI cevap taslağı boş olamaz."
      };
    }

    const request = this.db.prepare("SELECT * FROM requests WHERE id = ? AND deleted_at = ''").get(requestId) as Record<string, unknown> | undefined;
    if (!request) {
      return {
        ok: false,
        message: "Talep bulunamadı."
      };
    }

    const now = new Date().toISOString();
    const existingMessage = this.db
      .prepare("SELECT id FROM whatsapp_messages WHERE request_id = ? AND direction = 'outgoing' AND deleted_at = '' LIMIT 1")
      .get(requestId) as { id?: string } | undefined;
    const messageId = existingMessage?.id || createId("wa_msg_");
    const missingFields = input.missingFields.map((field) => field.trim()).filter(Boolean);

    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(`
          UPDATE requests
          SET ai_summary = ?,
              ai_suggested_reply = ?,
              updated_at = ?,
              sync_status = 'local_only'
          WHERE id = ?
        `)
        .run(summary, suggestedReply, now, requestId);

      this.db
        .prepare(`
          INSERT INTO whatsapp_messages (
            id,
            request_id,
            customer_id,
            phone,
            direction,
            mode,
            status,
            message,
            prepared_by_ai,
            created_at,
            updated_at,
            sync_status
          ) VALUES (?, ?, ?, ?, 'outgoing', 'manual_copy', 'prepared', ?, 1, ?, ?, 'local_only')
          ON CONFLICT(id) DO UPDATE SET
            customer_id = excluded.customer_id,
            phone = excluded.phone,
            status = 'prepared',
            message = excluded.message,
            prepared_by_ai = 1,
            updated_at = excluded.updated_at,
            deleted_at = '',
            sync_status = 'local_only'
        `)
        .run(
          messageId,
          requestId,
          String(request.customer_id ?? ""),
          String(request.customer_phone ?? ""),
          suggestedReply,
          now,
          now
        );

      this.insertEvent({
        type: "ai.reply_suggested",
        entityType: "request",
        entityId: requestId,
        payload: {
          summary,
          missing_fields: missingFields,
          whatsapp_message_id: messageId
        },
        now
      });

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      ok: true,
      message: "AI cevap taslağı yenilendi.",
      requestId,
      summary,
      suggestedReply,
      missingFields,
      dashboardData: this.getDashboardData()
    };
  }

  saveAiWorkspaceHistory(input: Omit<AiWorkspaceHistoryEntry, "id" | "createdAt">): AiWorkspaceHistoryEntry {
    const id = createId("ai_conv_");
    const createdAt = new Date().toISOString();
    const entry: AiWorkspaceHistoryEntry = {
      ...input,
      id,
      createdAt,
      instructions: input.instructions.trim().slice(0, 800),
      content: input.content.trim().slice(0, 6000),
      summary: input.summary.trim().slice(0, 1600),
      missingFields: input.missingFields.map((field) => field.trim()).filter(Boolean).slice(0, 8)
    };

    this.db
      .prepare(`
        INSERT INTO ai_conversations (
          id, source, request_id, status, messages_json, summary,
          created_at, updated_at, sync_status
        ) VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, 'local_only')
      `)
      .run(
        entry.id,
        `desktop_workspace:${entry.mode}`,
        entry.requestId,
        JSON.stringify({
          instructions: entry.instructions,
          content: entry.content,
          missing_fields: entry.missingFields,
          provider: entry.provider,
          model: entry.model,
          fallback: entry.fallback,
          request_label: entry.requestLabel
        }),
        entry.summary,
        entry.createdAt,
        entry.createdAt
      );

    return entry;
  }

  getAiWorkspaceHistory(limit = 12): AiWorkspaceHistoryEntry[] {
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit) || 12));
    const rows = this.db
      .prepare(`
        SELECT id, source, request_id, messages_json, summary, created_at
        FROM ai_conversations
        WHERE source LIKE 'desktop_workspace:%' AND deleted_at = ''
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(safeLimit) as Record<string, unknown>[];

    return rows.map((row) => {
      const payload = parseAiWorkspacePayload(row.messages_json);
      const modeCandidate = String(row.source ?? "").replace("desktop_workspace:", "");
      const mode: AiWorkspaceMode = modeCandidate === "summary" || modeCandidate === "daily" ? modeCandidate : "reply";
      return {
        id: String(row.id ?? ""),
        mode,
        requestId: String(row.request_id ?? ""),
        requestLabel: String(payload.request_label ?? ""),
        instructions: String(payload.instructions ?? ""),
        content: String(payload.content ?? ""),
        summary: String(row.summary ?? ""),
        missingFields: Array.isArray(payload.missing_fields) ? payload.missing_fields.map(String).filter(Boolean) : [],
        provider: String(payload.provider ?? "disabled"),
        model: String(payload.model ?? ""),
        fallback: Boolean(payload.fallback),
        createdAt: String(row.created_at ?? "")
      };
    });
  }

  saveAiWorkspaceResult(input: SaveAiWorkspaceResultInput): SaveAiWorkspaceResult {
    const requestId = input.requestId.trim();
    const content = input.content.trim();
    const summary = input.summary.trim();
    if (input.mode === "daily") {
      return { ok: false, message: "Günlük değerlendirme belirli bir talebe kaydedilemez." };
    }
    if (!requestId) {
      return { ok: false, message: "Sonucu kaydetmek için talep seçin." };
    }
    if (!content) {
      return { ok: false, message: "Kaydedilecek AI sonucu boş olamaz." };
    }

    if (input.mode === "reply") {
      const result = this.saveRequestAiSuggestion({
        requestId,
        summary,
        suggestedReply: content,
        missingFields: input.missingFields
      });
      return result.ok
        ? { ok: true, message: "AI cevap taslağı talebe kaydedildi.", requestId, dashboardData: result.dashboardData }
        : result;
    }

    const request = this.db.prepare("SELECT id FROM requests WHERE id = ? AND deleted_at = ''").get(requestId);
    if (!request) {
      return { ok: false, message: "Talep bulunamadı." };
    }
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE requests SET ai_summary = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
      .run(content.slice(0, 1600), now, requestId);
    this.insertEvent({
      type: "ai.request_summarized",
      entityType: "request",
      entityId: requestId,
      payload: { summary: content.slice(0, 1600) },
      now
    });
    return {
      ok: true,
      message: "AI özeti talebe kaydedildi.",
      requestId,
      dashboardData: this.getDashboardData()
    };
  }

  convertRequestToReservation(requestId: string): RequestReservationConversionResult {
    const id = requestId.trim();
    if (!id) {
      return {
        ok: false,
        message: "Rezervasyona çevrilecek talep seçilmeli."
      };
    }

    const request = this.db.prepare("SELECT * FROM requests WHERE id = ? AND deleted_at = ''").get(id) as Record<string, unknown> | undefined;
    if (!request) {
      return {
        ok: false,
        message: "Talep bulunamadı."
      };
    }

    const requestType = String(request.request_type ?? "");
    const reservationType = getRequestReservationType(requestType);
    if (!reservationType || !canConvertRequestToReservation(this.getEnabledBusinessCapabilities(), requestType)) {
      return {
        ok: false,
        message: reservationType
          ? "Bu rezervasyon türü işletmenin etkin yeteneklerinde kullanılamıyor."
          : "Bu talep türü rezervasyona dönüştürülemez."
      };
    }

    const existingReservation = this.db.prepare("SELECT id FROM reservations WHERE request_id = ? AND deleted_at = '' LIMIT 1").get(id) as { id?: string } | undefined;
    const now = new Date().toISOString();
    const reservationId = existingReservation?.id || createId("reservation_");
    const title = buildReservationTitle(request, reservationType);
    let customerId = "";

    this.db.exec("BEGIN");
    try {
      customerId = this.ensureCustomerForRequest(request, now);
      this.db
        .prepare(`
          INSERT INTO reservations (
            id,
            request_id,
            customer_id,
            reservation_type,
            status,
            title,
            start_date,
            end_date,
            time,
            guest_count,
            adult_count,
            child_count,
            room_ids_json,
            table_ids_json,
            notes,
            price_note,
            payment_status,
            created_at,
            updated_at,
            sync_status
          ) VALUES (?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?, 'not_required', ?, ?, 'local_only')
          ON CONFLICT(id) DO UPDATE SET
            customer_id = excluded.customer_id,
            reservation_type = excluded.reservation_type,
            status = 'approved',
            title = excluded.title,
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            time = excluded.time,
            guest_count = excluded.guest_count,
            adult_count = excluded.adult_count,
            child_count = excluded.child_count,
            notes = excluded.notes,
            price_note = excluded.price_note,
            updated_at = excluded.updated_at,
            deleted_at = '',
            sync_status = 'local_only'
        `)
        .run(
          reservationId,
          id,
          customerId,
          reservationType,
          title,
          String(request.start_date ?? ""),
          String(request.end_date ?? ""),
          String(request.time ?? ""),
          Number(request.guest_count ?? 1),
          Number(request.adult_count ?? 0),
          Number(request.child_count ?? 0),
          buildReservationNotes(request),
          "Fiyat ve kaynak ataması işletme sahibi tarafından netleştirilecek.",
          now,
          now
        );

      this.db
        .prepare(`
          UPDATE requests
          SET status = 'converted_to_reservation',
              customer_id = ?,
              updated_at = ?,
              sync_status = 'local_only'
          WHERE id = ?
        `)
        .run(customerId, now, id);

      this.insertEvent({
        type: "request.converted_to_reservation",
        entityType: "request",
        entityId: id,
        payload: {
          reservation_id: reservationId,
          customer_id: customerId,
          previous_status: String(request.status ?? "")
        },
        now
      });
      this.insertEvent({
        type: "reservation.approved",
        entityType: "reservation",
        entityId: reservationId,
        payload: {
          request_id: id,
          customer_id: customerId,
          reservation_type: reservationType
        },
        now
      });

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      ok: true,
      message: existingReservation ? "Mevcut rezervasyon onaylandı." : "Talep rezervasyona çevrildi ve onaylandı.",
      reservationId,
      dashboardData: this.getDashboardData()
    };
  }

  markMenuPublished() {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE menu_categories SET sync_status = 'synced', updated_at = ? WHERE deleted_at = ''").run(now);
    this.db.prepare("UPDATE menu_items SET sync_status = 'synced', updated_at = ? WHERE deleted_at = ''").run(now);
    this.insertEvent({
      type: "menu.published",
      entityType: "menu",
      entityId: "qr_menu",
      payload: {
        category_count: this.getScalarCount("SELECT COUNT(*) as count FROM menu_categories WHERE deleted_at = ''"),
        item_count: this.getScalarCount("SELECT COUNT(*) as count FROM menu_items WHERE deleted_at = ''")
      },
      now
    });
  }

  recordSyncEvent(input: RecordSyncEventInput) {
    const now = new Date().toISOString();
    this.insertEvent({
      type: input.ok ? "sync.completed" : "sync.failed",
      entityType: "sync",
      entityId: `${input.direction}:${input.entityType}`,
      payload: input.ok
        ? {
            direction: input.direction,
            entity_type: input.entityType,
            record_count: input.recordCount ?? 0
          }
        : {
            direction: input.direction,
            entity_type: input.entityType,
            error_message: input.message ?? "Senkronizasyon başarısız oldu.",
            status: input.status ?? 0
          },
      now
    });
  }

  recordAndroidActionResult(action: AndroidSyncAction, result: ApplyAndroidActionResult) {
    const actionId = String(action.id ?? "").trim();
    const actionType = String(action.action_type ?? "").trim();
    const deviceId = String(action.device_id ?? "").trim();
    if (!actionId || !actionType || !deviceId) {
      return;
    }
    const now = new Date().toISOString();
    const resolutionKey = androidActionResolutionKey(action);
    if (result.ok) {
      for (const failure of this.getActiveAndroidActionFailureRows(null)) {
        const payload = parseEventPayload(failure.payload_json);
        if (String(payload.resolution_key ?? "") !== resolutionKey) {
          continue;
        }
        this.db
          .prepare("UPDATE events SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at = ''")
          .run(now, now, String(failure.id ?? ""));
      }
      return;
    }

    const existing = this.db
      .prepare("SELECT id FROM events WHERE type = 'android.action_failed' AND entity_id = ? AND deleted_at = '' LIMIT 1")
      .get(actionId);
    if (existing) {
      return;
    }
    this.insertEvent({
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

  getAndroidActionFailures(): DesktopAndroidActionFailure[] {
    return this.getActiveAndroidActionFailureRows().map((row) => {
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

  private getActiveAndroidActionFailureRows(limit: number | null = 100): Array<Record<string, unknown>> {
    const statement = this.db.prepare(`
        SELECT id, actor_id, entity_id, payload_json, created_at
        FROM events
        WHERE type = 'android.action_failed' AND deleted_at = ''
        ORDER BY created_at DESC
        ${limit === null ? "" : "LIMIT ?"}
      `);
    return (limit === null ? statement.all() : statement.all(limit)) as Array<Record<string, unknown>>;
  }

  countEventsByType(type: string) {
    const row = this.db.prepare("SELECT COUNT(*) as count FROM events WHERE type = ? AND deleted_at = ''").get(type.trim()) as { count?: number } | undefined;
    return Number(row?.count ?? 0);
  }

  saveMenuCategory(input: SaveMenuCategoryInput): DesktopMenuSaveResult {
    const result = saveStoredMenuCategory(this.db, input);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  saveMenuItem(input: SaveMenuItemInput): DesktopMenuSaveResult {
    const name = input.name.trim();
    const categoryId = input.category_id.trim();
    const stockQuantity = normalizeNullableStockNumber(input.stock_quantity);
    const stockMinQuantity = normalizeNullableStockNumber(input.stock_min_quantity);
    const stockUnit = normalizeMenuStockUnit(input.stock_unit);
    const stockConsumptionQuantity = normalizePositiveStockNumber(input.stock_consumption_quantity) ?? 1;
    if (!name) {
      return {
        ok: false,
        message: "Ürün adı gerekli."
      };
    }

    const categoryExists = this.db.prepare("SELECT id FROM menu_categories WHERE id = ? AND deleted_at = ''").get(categoryId);
    if (!categoryExists) {
      return {
        ok: false,
        message: "Ürün için kategori seçilmeli."
      };
    }
    if (input.stock_quantity !== null && input.stock_quantity !== undefined && stockQuantity === null) {
      return { ok: false, message: "Stok miktarı 0 veya daha büyük bir sayı olmalı." };
    }
    if (input.stock_min_quantity !== null && input.stock_min_quantity !== undefined && stockMinQuantity === null) {
      return { ok: false, message: "Minimum stok uyarısı 0 veya daha büyük bir sayı olmalı." };
    }

    const id = input.id?.trim() || createId("item_");
    const now = new Date().toISOString();
    const existing = this.db
      .prepare("SELECT created_at, stock_quantity FROM menu_items WHERE id = ?")
      .get(id) as { created_at?: string; stock_quantity?: number | null } | undefined;
    const createdAt = existing?.created_at || now;
    const previousStockQuantity = existing ? nullableNumber(existing.stock_quantity) : null;

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(`
          INSERT INTO menu_items (
            id,
            category_id,
            name,
            description,
            price,
            currency,
            image_url,
            is_available,
            is_featured,
            allergens_json,
            tags_json,
            stock_quantity,
            stock_min_quantity,
            stock_unit,
            stock_consumption_quantity,
            hide_when_out_of_stock,
            stock_note,
            sort_order,
            created_at,
            updated_at,
            sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
          ON CONFLICT(id) DO UPDATE SET
            category_id = excluded.category_id,
            name = excluded.name,
            description = excluded.description,
            price = excluded.price,
            currency = excluded.currency,
            image_url = excluded.image_url,
            is_available = excluded.is_available,
            is_featured = excluded.is_featured,
            allergens_json = excluded.allergens_json,
            tags_json = excluded.tags_json,
            stock_quantity = excluded.stock_quantity,
            stock_min_quantity = excluded.stock_min_quantity,
            stock_unit = excluded.stock_unit,
            stock_consumption_quantity = excluded.stock_consumption_quantity,
            hide_when_out_of_stock = excluded.hide_when_out_of_stock,
            stock_note = excluded.stock_note,
            sort_order = excluded.sort_order,
            updated_at = excluded.updated_at,
            deleted_at = '',
            sync_status = 'pending'
        `)
        .run(
          id,
          categoryId,
          name,
          input.description.trim(),
          normalizePrice(input.price),
          normalizeCurrency(input.currency),
          input.image_url.trim(),
          input.is_available ? 1 : 0,
          input.is_featured ? 1 : 0,
          JSON.stringify(normalizeStringArray(input.allergens)),
          JSON.stringify(normalizeStringArray(input.tags)),
          stockQuantity,
          stockMinQuantity,
          stockUnit,
          stockConsumptionQuantity,
          input.hide_when_out_of_stock ? 1 : 0,
          nullableTrimmedString(input.stock_note),
          normalizeInteger(input.sort_order),
          createdAt,
          now
        );

      if (previousStockQuantity !== stockQuantity) {
        const before = previousStockQuantity ?? 0;
        const after = stockQuantity ?? 0;
        this.insertMenuStockMovementInTransaction({
          menuItemId: id,
          type: "set",
          quantityChange: after - before,
          quantityBefore: before,
          quantityAfter: after,
          sourceType: "desktop",
          sourceId: id,
          actorDeviceId: "",
          note: stockQuantity === null ? "Stok takibi bırakıldı." : "Menü ürün detayından stok ayarlandı.",
          now
        });
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      ok: true,
      message: "Ürün kaydedildi.",
      savedId: id,
      dashboardData: this.getDashboardData()
    };
  }

  close() {
    this.db.close();
  }

  private getDailyTasks(): DesktopDailyTask[] {
    const rows = this.db
      .prepare(`
        SELECT
          id,
          title,
          description,
          task_type,
          status,
          due_date,
          due_time,
          related_type,
          related_id,
          updated_at
        FROM daily_tasks
        WHERE deleted_at = ''
        ORDER BY
          CASE status WHEN 'pending' THEN 0 WHEN 'done' THEN 1 ELSE 2 END ASC,
          due_date ASC,
          due_time ASC,
          created_at DESC
        LIMIT 80
      `)
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id ?? ""),
      title: String(row.title ?? ""),
      description: String(row.description ?? ""),
      taskType: String(row.task_type ?? "note"),
      status: String(row.status ?? "pending"),
      dueDate: String(row.due_date ?? ""),
      dueTime: String(row.due_time ?? ""),
      relatedType: String(row.related_type ?? ""),
      relatedId: String(row.related_id ?? ""),
      updatedAt: String(row.updated_at ?? "")
    }));
  }

  private getCustomers(): DesktopCustomer[] {
    const rows = this.db
      .prepare(`
        SELECT
          customers.id,
          customers.full_name,
          customers.phone,
          customers.email,
          customers.source,
          customers.notes,
          customers.tags_json,
          customers.last_contact_at,
          customers.identity_type,
          customers.identity_number,
          customers.nationality,
          customers.birth_date,
          customers.gender,
          customers.birthday_message_enabled,
          customers.document_serial_number,
          customers.document_expiry_date,
          customers.birth_place,
          customers.mother_name,
          customers.father_name,
          customers.issuing_authority,
          customers.address,
          customers.updated_at,
          COUNT(DISTINCT requests.id) AS request_count,
          COUNT(DISTINCT reservations.id) AS reservation_count,
          COUNT(DISTINCT customer_room_stays.id) AS stay_count
        FROM customers
        LEFT JOIN requests ON requests.customer_id = customers.id AND requests.deleted_at = ''
        LEFT JOIN reservations ON reservations.customer_id = customers.id AND reservations.deleted_at = ''
        LEFT JOIN customer_room_stays ON customer_room_stays.customer_id = customers.id AND customer_room_stays.deleted_at = ''
        WHERE customers.deleted_at = ''
        GROUP BY customers.id
        ORDER BY
          COALESCE(NULLIF(customers.last_contact_at, ''), customers.updated_at) DESC,
          customers.full_name ASC
        LIMIT 500
      `)
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id ?? ""),
      fullName: String(row.full_name ?? ""),
      phone: String(row.phone ?? ""),
      email: String(row.email ?? ""),
      source: String(row.source ?? "manual"),
      notes: String(row.notes ?? ""),
      tags: this.parseStringArray(row.tags_json),
      lastContactAt: String(row.last_contact_at ?? ""),
      identityType: normalizeCustomerIdentityType(row.identity_type),
      identityNumber: String(row.identity_number ?? ""),
      nationality: String(row.nationality ?? ""),
      birthDate: String(row.birth_date ?? ""),
      gender: normalizeCustomerGender(row.gender),
      birthdayMessageEnabled: normalizeBoolean(row.birthday_message_enabled, true),
      documentSerialNumber: String(row.document_serial_number ?? ""),
      documentExpiryDate: String(row.document_expiry_date ?? ""),
      birthPlace: String(row.birth_place ?? ""),
      motherName: String(row.mother_name ?? ""),
      fatherName: String(row.father_name ?? ""),
      issuingAuthority: String(row.issuing_authority ?? ""),
      address: String(row.address ?? ""),
      requestCount: Number(row.request_count ?? 0),
      reservationCount: Number(row.reservation_count ?? 0),
      stayCount: Number(row.stay_count ?? 0),
      updatedAt: String(row.updated_at ?? "")
    }));
  }

  private getCustomerRoomStays(): DesktopCustomerRoomStay[] {
    const rows = this.db
      .prepare(`
        SELECT
          customer_room_stays.id,
          customer_room_stays.customer_id,
          customers.full_name AS customer_name,
          customers.phone AS customer_phone,
          customer_room_stays.room_id,
          rooms.name AS room_name,
          rooms.number AS room_number,
          customer_room_stays.reservation_id,
          customer_room_stays.status,
          customer_room_stays.check_in_date,
          customer_room_stays.check_out_date,
          customer_room_stays.guest_count,
          customer_room_stays.notes,
          customer_room_stays.source,
          customer_room_stays.checked_in_at,
          customer_room_stays.checked_out_at,
          customer_room_stays.created_at,
          customer_room_stays.updated_at
        FROM customer_room_stays
        JOIN customers ON customers.id = customer_room_stays.customer_id
        JOIN rooms ON rooms.id = customer_room_stays.room_id
        WHERE customer_room_stays.deleted_at = ''
        ORDER BY
          CASE customer_room_stays.status
            WHEN 'checked_in' THEN 0
            WHEN 'planned' THEN 1
            WHEN 'checked_out' THEN 2
            ELSE 3
          END,
          customer_room_stays.check_in_date DESC,
          customer_room_stays.created_at DESC
        LIMIT 500
      `)
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id ?? ""),
      customerId: String(row.customer_id ?? ""),
      customerName: String(row.customer_name ?? ""),
      customerPhone: String(row.customer_phone ?? ""),
      roomId: String(row.room_id ?? ""),
      roomName: String(row.room_name ?? ""),
      roomNumber: String(row.room_number ?? ""),
      reservationId: String(row.reservation_id ?? ""),
      status: String(row.status ?? "planned"),
      checkInDate: String(row.check_in_date ?? ""),
      checkOutDate: String(row.check_out_date ?? ""),
      guestCount: Number(row.guest_count ?? 1),
      notes: String(row.notes ?? ""),
      source: String(row.source ?? "manual"),
      checkedInAt: String(row.checked_in_at ?? ""),
      checkedOutAt: String(row.checked_out_at ?? ""),
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? "")
    }));
  }

  private hasOverlappingCustomerRoomStay(
    roomId: string,
    checkInDate: string,
    checkOutDate: string,
    excludedStayId = ""
  ): boolean {
    const rows = this.db
      .prepare(`
        SELECT id, check_in_date, check_out_date
        FROM customer_room_stays
        WHERE room_id = ?
          AND id != ?
          AND status IN ('planned', 'checked_in')
          AND deleted_at = ''
      `)
      .all(roomId, excludedStayId) as Array<Record<string, unknown>>;
    const candidateEnd = checkOutDate || "9999-12-31";
    return rows.some((row) => {
      const existingStart = String(row.check_in_date ?? "");
      const existingEnd = String(row.check_out_date ?? "") || "9999-12-31";
      return existingStart < candidateEnd && checkInDate < existingEnd;
    });
  }

  private findConflictingRoomReservation(
    roomId: string,
    customerId: string,
    checkInDate: string,
    checkOutDate: string
  ): string {
    const candidateEnd = checkOutDate || "9999-12-31";
    for (const reservation of this.getReservations()) {
      if (
        reservation.customerId === customerId
        || !reservation.roomIds.includes(roomId)
        || !["pending", "approved"].includes(reservation.status)
      ) {
        continue;
      }
      const reservationStart = reservation.startDate;
      const reservationEnd = reservation.endDate || "9999-12-31";
      if (reservationStart < candidateEnd && checkInDate < reservationEnd) {
        return reservation.customerName || reservation.title || "başka bir müşteri";
      }
    }
    return "";
  }

  private refreshRoomStatusFromStays(roomId: string, now: string, checkoutToCleaning: boolean) {
    const active = this.db
      .prepare(`
        SELECT status
        FROM customer_room_stays
        WHERE room_id = ?
          AND status IN ('checked_in', 'planned')
          AND deleted_at = ''
        ORDER BY CASE status WHEN 'checked_in' THEN 0 ELSE 1 END, check_in_date ASC
        LIMIT 1
      `)
      .get(roomId) as { status?: string } | undefined;
    const room = this.db
      .prepare("SELECT status FROM rooms WHERE id = ? AND deleted_at = ''")
      .get(roomId) as { status?: string } | undefined;
    if (!room) {
      return;
    }
    const currentStatus = String(room.status ?? "");
    let nextStatus = currentStatus;
    if (active?.status === "checked_in") {
      nextStatus = "occupied";
    } else if (active?.status === "planned") {
      nextStatus = "reserved";
    } else if (checkoutToCleaning) {
      nextStatus = "cleaning";
    } else if (["occupied", "reserved"].includes(currentStatus)) {
      nextStatus = "available";
    }
    if (nextStatus !== currentStatus) {
      this.db
        .prepare("UPDATE rooms SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
        .run(nextStatus, now, roomId);
    }
  }

  private enforceActiveStayRoomStatus(roomId: string, now: string) {
    const active = this.db
      .prepare(`
        SELECT status
        FROM customer_room_stays
        WHERE room_id = ?
          AND status IN ('checked_in', 'planned')
          AND deleted_at = ''
        ORDER BY CASE status WHEN 'checked_in' THEN 0 ELSE 1 END, check_in_date ASC
        LIMIT 1
      `)
      .get(roomId) as { status?: string } | undefined;
    if (!active) {
      return;
    }
    this.db
      .prepare("UPDATE rooms SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ? AND deleted_at = ''")
      .run(active.status === "checked_in" ? "occupied" : "reserved", now, roomId);
  }

  private getRooms(): DesktopRoom[] {
    const reservationTitles = this.getActiveResourceReservationTitles("room");
    const rows = this.db
      .prepare(`
        SELECT
          id,
          name,
          number,
          capacity,
          bed_info,
          floor,
          status,
          features_json,
          description,
          price_note,
          is_active,
          sort_order,
          updated_at
        FROM rooms
        WHERE deleted_at = ''
        ORDER BY sort_order ASC, number ASC, name ASC
      `)
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      number: String(row.number ?? ""),
      capacity: Number(row.capacity ?? 0),
      bedInfo: String(row.bed_info ?? ""),
      floor: String(row.floor ?? ""),
      status: String(row.status ?? "available"),
      features: this.parseStringArray(row.features_json),
      description: String(row.description ?? ""),
      priceNote: String(row.price_note ?? ""),
      isActive: Number(row.is_active ?? 0) === 1,
      sortOrder: Number(row.sort_order ?? 0),
      activeReservationTitle: reservationTitles.get(String(row.id ?? "")) ?? "",
      updatedAt: String(row.updated_at ?? "")
    }));
  }

  private getTables(): DesktopTable[] {
    const reservationTitles = this.getActiveResourceReservationTitles("table");
    const rows = this.db
      .prepare(`
        SELECT
          id,
          name,
          area,
          capacity,
          status,
          current_customer_id,
          current_reservation_id,
          notes,
          is_active,
          sort_order,
          updated_at
        FROM tables
        WHERE deleted_at = ''
        ORDER BY sort_order ASC, area ASC, name ASC
      `)
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      area: String(row.area ?? ""),
      capacity: Number(row.capacity ?? 0),
      status: String(row.status ?? "available"),
      currentCustomerId: String(row.current_customer_id ?? ""),
      currentReservationId: String(row.current_reservation_id ?? ""),
      activeReservationTitle: reservationTitles.get(String(row.id ?? "")) ?? "",
      notes: String(row.notes ?? ""),
      isActive: Number(row.is_active ?? 0) === 1,
      sortOrder: Number(row.sort_order ?? 0),
      updatedAt: String(row.updated_at ?? "")
    }));
  }

  private getTableCategories(): DesktopTableCategory[] {
    const rows = this.db
      .prepare(`
        SELECT area, sort_order
        FROM tables
        WHERE deleted_at = ''
        ORDER BY sort_order ASC, name ASC
      `)
      .all() as Array<Record<string, unknown>>;
    const categories = new Map<string, DesktopTableCategory>();

    for (const row of rows) {
      const name = normalizeTableCategoryName(row.area);
      const key = tableCategoryKey(name);
      const existing = categories.get(key);
      if (existing) {
        existing.tableCount += 1;
      } else {
        categories.set(key, { name, tableCount: 1 });
      }
    }

    return [...categories.values()];
  }

  private getReservations(): DesktopReservation[] {
    const rows = this.db
      .prepare(`
        SELECT
          reservations.id,
          reservations.request_id,
          reservations.customer_id,
          customers.full_name AS customer_name,
          customers.phone AS customer_phone,
          reservations.reservation_type,
          reservations.status,
          reservations.title,
          reservations.start_date,
          reservations.end_date,
          reservations.time,
          reservations.guest_count,
          reservations.adult_count,
          reservations.child_count,
          reservations.room_ids_json,
          reservations.table_ids_json,
          reservations.notes,
          reservations.price_note,
          reservations.payment_status,
          reservations.updated_at
        FROM reservations
        LEFT JOIN customers ON customers.id = reservations.customer_id AND customers.deleted_at = ''
        WHERE reservations.deleted_at = ''
        ORDER BY reservations.start_date ASC, reservations.time ASC, reservations.created_at DESC
        LIMIT 80
      `)
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id ?? ""),
      requestId: String(row.request_id ?? ""),
      customerId: String(row.customer_id ?? ""),
      customerName: String(row.customer_name ?? ""),
      customerPhone: String(row.customer_phone ?? ""),
      reservationType: String(row.reservation_type ?? ""),
      status: String(row.status ?? "pending"),
      title: String(row.title ?? ""),
      startDate: String(row.start_date ?? ""),
      endDate: String(row.end_date ?? ""),
      time: String(row.time ?? ""),
      guestCount: Number(row.guest_count ?? 0),
      adultCount: Number(row.adult_count ?? 0),
      childCount: Number(row.child_count ?? 0),
      roomIds: this.parseStringArray(row.room_ids_json),
      tableIds: this.parseStringArray(row.table_ids_json),
      notes: String(row.notes ?? ""),
      priceNote: String(row.price_note ?? ""),
      paymentStatus: String(row.payment_status ?? "not_required"),
      updatedAt: String(row.updated_at ?? "")
    }));
  }

  private getActiveResourceReservationTitles(resourceType: "room" | "table") {
    const map = new Map<string, string>();
    const rows = this.db
      .prepare(`
        SELECT id, title, room_ids_json, table_ids_json
        FROM reservations
        WHERE deleted_at = ''
          AND status IN ('pending', 'approved')
        ORDER BY start_date ASC, time ASC, created_at DESC
      `)
      .all() as Array<Record<string, unknown>>;

    for (const row of rows) {
      const ids = this.parseStringArray(resourceType === "room" ? row.room_ids_json : row.table_ids_json);
      for (const id of ids) {
        if (!map.has(id)) {
          map.set(id, String(row.title ?? ""));
        }
      }
    }

    return map;
  }

  private getRequests(): SyncedCustomerRequest[] {
    const rows = this.db
      .prepare(`
        SELECT
          id,
          customer_id,
          source,
          request_type,
          status,
          customer_name,
          customer_phone,
          date_text,
          start_date,
          end_date,
          time,
          guest_count,
          adult_count,
          child_count,
          message,
          ai_summary,
          ai_suggested_reply,
          whatsapp_message,
          assigned_to,
          priority,
          sync_status,
          created_at,
          updated_at
        FROM requests
        WHERE deleted_at = ''
        ORDER BY
          CASE
            WHEN status IN ('new', 'seen', 'waiting_owner', 'pending', 'in_progress') AND priority = 'urgent' THEN 0
            WHEN status IN ('new', 'seen', 'waiting_owner', 'pending', 'in_progress') AND priority = 'high' THEN 1
            WHEN status = 'new' THEN 2
            WHEN status IN ('seen', 'waiting_owner', 'pending', 'in_progress') AND priority <> 'low' THEN 3
            WHEN status IN ('seen', 'waiting_owner', 'pending', 'in_progress') THEN 4
            ELSE 5
          END,
          created_at DESC
        LIMIT 80
      `)
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => this.mapRequestRow(row));
  }

  private mapRequestRow(row: Record<string, unknown>): SyncedCustomerRequest {
    return {
      id: String(row.id ?? ""),
      customer_id: String(row.customer_id ?? ""),
      source: row.source as SyncedCustomerRequest["source"],
      request_type: row.request_type as SyncedCustomerRequest["request_type"],
      status: row.status as SyncedCustomerRequest["status"],
      customer_name: String(row.customer_name ?? ""),
      customer_phone: String(row.customer_phone ?? ""),
      date_text: String(row.date_text ?? ""),
      start_date: String(row.start_date ?? ""),
      end_date: String(row.end_date ?? ""),
      time: String(row.time ?? ""),
      guest_count: Number(row.guest_count ?? 0),
      adult_count: Number(row.adult_count ?? 0),
      child_count: Number(row.child_count ?? 0),
      message: String(row.message ?? ""),
      ai_summary: String(row.ai_summary ?? ""),
      ai_suggested_reply: String(row.ai_suggested_reply ?? ""),
      whatsapp_message: String(row.whatsapp_message ?? ""),
      assigned_to: String(row.assigned_to ?? ""),
      priority: row.priority as SyncedCustomerRequest["priority"],
      sync_status: row.sync_status as SyncedCustomerRequest["sync_status"],
      created_at: String(row.created_at ?? ""),
      updated_at: String(row.updated_at ?? "")
    };
  }



  private getScalarCount(sql: string, ...params: Array<string | number | null>): number {
    const row = this.db.prepare(sql).get(...params) as { count?: number } | undefined;
    return Number(row?.count ?? 0);
  }

  private parseStringArray(value: unknown): string[] {
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

  private ensureInitialRooms(targetCount: number, now: string) {
    const count = this.getScalarCount("SELECT COUNT(*) as count FROM rooms WHERE deleted_at = ''");
    const missing = Math.max(0, targetCount - count);
    const statement = this.db.prepare(`
      INSERT INTO rooms (
        id,
        name,
        number,
        capacity,
        bed_info,
        status,
        features_json,
        description,
        sort_order,
        created_at,
        updated_at,
        sync_status
      ) VALUES (?, ?, ?, 2, '1 çift kişilik yatak', 'available', '[]', '', ?, ?, ?, 'local_only')
    `);

    for (let index = 0; index < missing; index += 1) {
      const order = count + index + 1;
      const number = String(100 + order);
      statement.run(createId("room_"), `Oda ${number}`, number, order, now, now);
    }
  }

  private ensureInitialTables(targetCount: number, now: string) {
    const count = this.getScalarCount("SELECT COUNT(*) as count FROM tables WHERE deleted_at = ''");
    const missing = Math.max(0, targetCount - count);
    const statement = this.db.prepare(`
      INSERT INTO tables (
        id,
        name,
        area,
        capacity,
        status,
        sort_order,
        created_at,
        updated_at,
        sync_status
      ) VALUES (?, ?, 'Genel', 4, 'available', ?, ?, ?, 'local_only')
    `);

    for (let index = 0; index < missing; index += 1) {
      const order = count + index + 1;
      statement.run(createId("table_"), `Masa ${order}`, order, now, now);
    }
  }

  private getProtectedTableIds(): Set<string> {
    const protectedIds = new Set<string>();
    const activeOrders = this.db
      .prepare(`
        SELECT table_id
        FROM table_orders
        WHERE status IN ('open', 'preparing', 'served', 'payment')
      `)
      .all() as Array<{ table_id?: string }>;
    for (const order of activeOrders) {
      const tableId = String(order.table_id ?? "").trim();
      if (tableId) {
        protectedIds.add(tableId);
      }
    }

    const activeReservations = this.db
      .prepare(`
        SELECT table_ids_json
        FROM reservations
        WHERE deleted_at = ''
          AND status IN ('pending', 'approved')
      `)
      .all() as Array<{ table_ids_json?: string }>;
    for (const reservation of activeReservations) {
      for (const tableId of this.parseStringArray(reservation.table_ids_json)) {
        protectedIds.add(tableId);
      }
    }

    const unavailableTables = this.db
      .prepare(`
        SELECT id
        FROM tables
        WHERE deleted_at = ''
          AND (
            status != 'available'
            OR current_customer_id != ''
            OR current_reservation_id != ''
          )
      `)
      .all() as Array<{ id?: string }>;
    for (const table of unavailableTables) {
      const tableId = String(table.id ?? "").trim();
      if (tableId) {
        protectedIds.add(tableId);
      }
    }

    const currentTableIds = new Set(
      (this.db.prepare("SELECT id FROM tables WHERE deleted_at = ''").all() as Array<{ id?: string }>)
        .map((table) => String(table.id ?? "").trim())
        .filter(Boolean)
    );
    return new Set([...protectedIds].filter((tableId) => currentTableIds.has(tableId)));
  }

  private reconcileTableCategories(categories: NormalizedTableCategoryInput[], now: string) {
    const tables = this.db
      .prepare(`
        SELECT id, name, area, capacity, status, is_active, sort_order
        FROM tables
        WHERE deleted_at = ''
        ORDER BY sort_order ASC, name ASC
      `)
      .all() as Array<Record<string, unknown>>;
    const protectedIds = this.getProtectedTableIds();
    const remaining = [...tables];
    const assignments = categories.map((category) => ({
      category,
      tables: [] as Array<Record<string, unknown>>
    }));

    const takeFromRemaining = (
      assignment: (typeof assignments)[number],
      predicate: (table: Record<string, unknown>) => boolean
    ) => {
      for (let index = 0; index < remaining.length && assignment.tables.length < assignment.category.tableCount;) {
        if (predicate(remaining[index])) {
          assignment.tables.push(remaining.splice(index, 1)[0]);
        } else {
          index += 1;
        }
      }
    };

    // Önce kendi kategorisindeki korumalı masaları yerinde tut.
    for (const assignment of assignments) {
      const sourceKey = assignment.category.sourceKey || assignment.category.nameKey;
      takeFromRemaining(assignment, (table) =>
        protectedIds.has(String(table.id ?? ""))
        && tableCategoryKey(normalizeTableCategoryName(table.area)) === sourceKey
      );
    }

    // Kaldırılan veya küçültülen kategorilerdeki aktif masalara mutlaka yeni bir yer ayır.
    const assignFromPool = (protectedOnly: boolean) => {
      for (const assignment of assignments) {
        while (assignment.tables.length < assignment.category.tableCount) {
          const candidateIndex = remaining.findIndex((table) =>
            protectedIds.has(String(table.id ?? "")) === protectedOnly
          );
          if (candidateIndex < 0) {
            break;
          }
          assignment.tables.push(remaining.splice(candidateIndex, 1)[0]);
        }
      }
    };

    assignFromPool(true);

    // Korumalı masalar yerleştirildikten sonra mevcut kategori eşleşmelerini koru.
    for (const assignment of assignments) {
      const sourceKey = assignment.category.sourceKey || assignment.category.nameKey;
      takeFromRemaining(assignment, (table) =>
        !protectedIds.has(String(table.id ?? ""))
        && tableCategoryKey(normalizeTableCategoryName(table.area)) === sourceKey
      );
    }

    assignFromPool(false);
    for (const assignment of assignments) {
      assignment.tables.sort((left, right) =>
        Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0)
        || String(left.name ?? "").localeCompare(String(right.name ?? ""), "tr")
      );
    }

    const updateTable = this.db.prepare(`
      UPDATE tables
      SET name = ?,
          area = ?,
          is_active = 1,
          sort_order = ?,
          updated_at = ?,
          deleted_at = '',
          sync_status = 'local_only'
      WHERE id = ?
    `);
    const insertTable = this.db.prepare(`
      INSERT INTO tables (
        id,
        name,
        area,
        capacity,
        status,
        notes,
        is_active,
        sort_order,
        created_at,
        updated_at,
        sync_status
      ) VALUES (?, ?, ?, 4, 'available', '', 1, ?, ?, ?, 'local_only')
    `);
    let sortOrder = 1;

    for (const assignment of assignments) {
      for (let index = 0; index < assignment.category.tableCount; index += 1) {
        const table = assignment.tables[index];
        const position = index + 1;
        if (table) {
          const nextName = reconcileTableName(table.name, table.area, assignment.category.name, position);
          if (
            nextName !== String(table.name ?? "")
            || assignment.category.name !== String(table.area ?? "")
            || sortOrder !== Number(table.sort_order ?? 0)
            || Number(table.is_active ?? 0) !== 1
          ) {
            updateTable.run(
              nextName,
              assignment.category.name,
              sortOrder,
              now,
              String(table.id ?? "")
            );
          }
        } else {
          insertTable.run(
            createId("table_"),
            `${assignment.category.name} ${position}`,
            assignment.category.name,
            sortOrder,
            now,
            now
          );
        }
        sortOrder += 1;
      }
    }

    const archiveTable = this.db.prepare(`
      UPDATE tables
      SET is_active = 0,
          deleted_at = ?,
          updated_at = ?,
          sync_status = 'local_only'
      WHERE id = ?
    `);
    for (const table of remaining) {
      archiveTable.run(now, now, String(table.id ?? ""));
    }
  }

  private ensureCustomerForRequest(request: Record<string, unknown>, now: string) {
    const requestCustomerId = String(request.customer_id ?? "").trim();
    if (requestCustomerId) {
      const existing = this.db.prepare("SELECT id FROM customers WHERE id = ? AND deleted_at = ''").get(requestCustomerId);
      if (existing) {
        return requestCustomerId;
      }
    }

    const phone = String(request.customer_phone ?? "").trim();
    const existingByPhone = phone
      ? (this.db.prepare("SELECT id FROM customers WHERE phone = ? AND deleted_at = '' LIMIT 1").get(phone) as { id?: string } | undefined)
      : undefined;
    const customerId = existingByPhone?.id || requestCustomerId || createId("customer_");
    const source = String(request.source ?? "web_form").trim() || "web_form";

    this.db
      .prepare(`
        INSERT INTO customers (
          id,
          full_name,
          phone,
          source,
          notes,
          tags_json,
          last_contact_at,
          created_at,
          updated_at,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'local_only')
        ON CONFLICT(id) DO UPDATE SET
          full_name = excluded.full_name,
          phone = excluded.phone,
          source = excluded.source,
          notes = excluded.notes,
          tags_json = excluded.tags_json,
          last_contact_at = excluded.last_contact_at,
          updated_at = excluded.updated_at,
          deleted_at = '',
          sync_status = 'local_only'
      `)
      .run(
        customerId,
        String(request.customer_name ?? "Misafir").trim() || "Misafir",
        phone,
        source,
        String(request.message ?? ""),
        JSON.stringify(getCustomerTagsForSource(source)),
        now,
        now,
        now
      );

    return customerId;
  }

  private authorizeAndroidActionInTransaction(action: AndroidSyncAction): AndroidActionMutationResult {
    const deviceId = String(action.device_id ?? "").trim();
    const device = this.db
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
    const enabledCapabilities = this.getEnabledBusinessCapabilities();
    const capabilityContext = this.getAndroidActionCapabilityContext(action);
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

  private getAndroidActionCapabilityContext(action: AndroidSyncAction) {
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
        ? this.db.prepare("SELECT request_type FROM requests WHERE id = ? AND deleted_at = ''").get(requestId) as { request_type?: unknown } | undefined
        : undefined;
      context.requestType = String(request?.request_type ?? "");
    }

    if (["reservation_approve", "reservation_reject", "reservation_cancel"].includes(action.action_type)) {
      const reservationId = androidPayloadString(action.payload, "reservation_id");
      const reservation = reservationId
        ? this.db.prepare("SELECT reservation_type, room_ids_json, table_ids_json FROM reservations WHERE id = ? AND deleted_at = ''").get(reservationId) as Record<string, unknown> | undefined
        : undefined;
      context.reservationType = String(reservation?.reservation_type ?? "");
      context.reservationRoomIds = this.parseStringArray(reservation?.room_ids_json);
      context.reservationTableIds = this.parseStringArray(reservation?.table_ids_json);
    }

    if (action.action_type.startsWith("daily_task_")) {
      const taskId = action.action_type === "daily_task_create"
        ? ""
        : androidPayloadString(action.payload, "task_id");
      const task = taskId
        ? this.db.prepare("SELECT task_type, related_type, related_id FROM daily_tasks WHERE id = ? AND deleted_at = ''").get(taskId) as Record<string, unknown> | undefined
        : undefined;
      context.taskType = String(task?.task_type ?? context.taskType).trim();
      context.relatedType = String(task?.related_type ?? context.relatedType).trim();
      if (context.relatedType === "reservation") {
        const relatedId = String(task?.related_id ?? action.payload.related_id ?? "").trim();
        const reservation = relatedId
          ? this.db.prepare("SELECT reservation_type, room_ids_json, table_ids_json FROM reservations WHERE id = ? AND deleted_at = ''").get(relatedId) as Record<string, unknown> | undefined
          : undefined;
        context.relatedReservationType = String(reservation?.reservation_type ?? "");
        context.relatedReservationRoomIds = this.parseStringArray(reservation?.room_ids_json);
        context.relatedReservationTableIds = this.parseStringArray(reservation?.table_ids_json);
      }
    }

    return context;
  }

  private applyAndroidActionInTransaction(action: AndroidSyncAction, now: string): AndroidActionMutationResult {
    switch (action.action_type) {
      case "customer_request_mark_answered":
        return this.applyAndroidRequestStatus(action, "answered", now);
      case "customer_request_reopen":
        return this.applyAndroidRequestStatus(action, "new", now);
      case "customer_request_approve":
        return this.applyAndroidRequestStatus(action, "approved", now);
      case "customer_request_reject":
        return this.applyAndroidRequestStatus(action, "rejected", now);
      case "customer_request_convert_to_reservation":
        return this.applyAndroidRequestConversion(action, now);
      case "customer_request_delete":
        return this.deleteRequestInTransaction(androidPayloadString(action.payload, "request_id"), now, action);
      case "customer_create":
        return this.applyAndroidCustomerSave(action, now, false);
      case "customer_update":
        return this.applyAndroidCustomerSave(action, now, true);
      case "customer_delete":
        return this.deleteCustomerInTransaction(androidPayloadString(action.payload, "customer_id"), now, action);
      case "customer_room_assign":
        return this.applyAndroidCustomerRoomAssignment(action, now);
      case "customer_room_stay_status":
        return this.applyAndroidCustomerRoomStayStatus(action, now);
      case "reservation_room_create":
      case "reservation_room_update":
      case "reservation_table_create":
      case "reservation_table_update":
        return applyAndroidReservationAction({
          db: this.db,
          action,
          now,
          insertEvent: (type, entityId, payload) =>
            this.insertAndroidActionEvent(action, type, "reservation", entityId, payload, now)
        });
      case "reservation_approve":
        return this.applyAndroidReservationStatus(action, "approved", now);
      case "reservation_reject":
        return this.applyAndroidReservationStatus(action, "rejected", now);
      case "reservation_cancel":
        return this.applyAndroidReservationStatus(action, "cancelled", now);
      case "room_status_update":
        return this.applyAndroidRoomStatus(action, now);
      case "daily_task_create":
      case "daily_task_update":
      case "daily_task_delete":
        return applyAndroidDailyTaskAction({
          db: this.db,
          action,
          now,
          insertEvent: (type, entityId, payload) =>
            this.insertAndroidActionEvent(action, type, "daily_task", entityId, payload, now)
        });
      case "daily_task_complete":
        return this.applyAndroidDailyTaskStatus(action, "done", now);
      case "daily_task_reopen":
        return this.applyAndroidDailyTaskStatus(action, "pending", now);
      case "daily_task_cancel":
        return this.applyAndroidDailyTaskStatus(action, "cancelled", now);
      case "finance_manual_create":
        return applyAndroidFinanceAction({
          db: this.db,
          action,
          now,
          insertEvent: (type, entityId, payload) =>
            this.insertAndroidActionEvent(action, type, "finance_entry", entityId, payload, now)
        });
      case "room_folio_payment_add":
      case "room_folio_checkout":
        return applyAndroidRoomFolioAction({
          db: this.db,
          action,
          now,
          insertEvent: (type, entityId, payload) =>
            this.insertAndroidActionEvent(action, type, "room_folio", entityId, payload, now)
        });
      case "table_status_update":
        return this.applyAndroidTableStatus(action, now);
      case "table_order_open":
        return this.applyAndroidTableOrderOpen(action, now);
      case "table_order_add_item":
        return this.applyAndroidTableOrderAddItem(action, now);
      case "table_order_update_item_quantity":
        return this.applyAndroidTableOrderItemQuantity(action, now);
      case "table_order_remove_item":
        return this.applyAndroidTableOrderRemoveItem(action, now);
      case "table_order_set_preparing":
        return this.applyAndroidTableOrderStatus(action, now, "preparing");
      case "table_order_set_served":
        return this.applyAndroidTableOrderStatus(action, now, "served");
      case "table_order_set_payment_waiting":
        return this.applyAndroidTableOrderStatus(action, now, "payment");
      case "table_order_close_paid":
        return this.applyAndroidTableOrderClose(action, now, "paid");
      case "table_order_cancel":
        return this.applyAndroidTableOrderClose(action, now, "cancelled");
      case "menu_category_delete":
        return this.deleteMenuCategoryInTransaction(androidPayloadString(action.payload, "category_id"), now, action);
      case "menu_item_delete":
        return this.deleteMenuItemInTransaction(androidPayloadString(action.payload, "menu_item_id"), now, action);
      case "message_delete":
        return this.deleteMessageInTransaction(
          androidPayloadString(action.payload, "message_id"),
          androidPayloadString(action.payload, "request_id"),
          now,
          action
        );
      case "menu_stock_add":
        return this.applyAndroidMenuStockAction(action, "add", now);
      case "menu_stock_set":
        return this.applyAndroidMenuStockAction(action, "set", now);
      case "menu_stock_adjust":
        return this.applyAndroidMenuStockAction(action, "adjust", now);
      case "menu_stock_image_import_apply":
        return this.applyAndroidStockImageImport(action, now);
      case "market_stock_count":
      case "market_purchase_receive":
      case "market_product_draft_create":
      case "market_cart_draft_create":
      case "market_barcode_scan":
        return applyMarketAndroidAction({
          db: this.db,
          action,
          now,
          insertEvent: (type, entityType, entityId, payload) =>
            this.insertAndroidActionEvent(action, type, entityType, entityId, payload, now),
          queueSnapshot: () => this.queueSyncJob("android_snapshot", now)
        });
      default:
        return { ok: false, message: "Telefon işlem türü bu masaüstü sürümünde desteklenmiyor." };
    }
  }

  private runDesktopDeletion(
    operation: () => AndroidActionMutationResult,
    successMessage: string
  ): DesktopStatusUpdateResult {
    let transactionStarted = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      transactionStarted = true;
      const result = operation();
      if (!result.ok) {
        this.db.exec("ROLLBACK");
        transactionStarted = false;
        return result;
      }
      this.db.exec("COMMIT");
      transactionStarted = false;
      return {
        ok: true,
        message: result.message || successMessage,
        dashboardData: this.getDashboardData()
      };
    } catch {
      if (transactionStarted) {
        try {
          this.db.exec("ROLLBACK");
        } catch {
          // SQLite işlemi zaten sonlandıysa kullanıcı dostu hata sonucunu koru.
        }
      }
      return { ok: false, message: "Kayıt silinemedi. Yerel kayıtları kontrol edip tekrar deneyin." };
    }
  }

  private deleteRequestInTransaction(
    requestId: string,
    now: string,
    androidAction?: AndroidSyncAction
  ): AndroidActionMutationResult {
    if (!requestId) {
      return { ok: false, message: "Silinecek talep seçilmemiş." };
    }
    const request = this.db
      .prepare("SELECT customer_name, updated_at FROM requests WHERE id = ? AND deleted_at = ''")
      .get(requestId) as { customer_name?: string; updated_at?: string } | undefined;
    if (!request) {
      return { ok: false, message: "Talep masaüstü kayıtlarında bulunamadı." };
    }
    const versionConflict = androidAction
      ? getAndroidVersionConflict(androidAction.payload, "expected_updated_at", request.updated_at, "Talep")
      : null;
    if (versionConflict) {
      return versionConflict;
    }

    const updatedAt = nextMutationTimestamp(request.updated_at, now);
    const messageResult = this.db
      .prepare(`
        UPDATE whatsapp_messages
        SET deleted_at = ?, updated_at = ?, sync_status = 'local_only'
        WHERE request_id = ? AND deleted_at = ''
      `)
      .run(updatedAt, updatedAt, requestId);
    this.db
      .prepare("UPDATE notifications SET deleted_at = ?, updated_at = ?, sync_status = 'local_only' WHERE related_type = 'request' AND related_id = ? AND deleted_at = ''")
      .run(updatedAt, updatedAt, requestId);
    this.db
      .prepare("UPDATE requests SET deleted_at = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ? AND deleted_at = ''")
      .run(updatedAt, updatedAt, requestId);
    this.insertDeletionEvent(androidAction, "request.deleted", "request", requestId, {
      customer_name: String(request.customer_name ?? ""),
      deleted_message_count: Number(messageResult.changes ?? 0)
    }, now);
    return { ok: true, message: androidAction ? "Talep telefondan silindi." : "Talep silindi." };
  }

  private deleteCustomerInTransaction(
    customerId: string,
    now: string,
    androidAction?: AndroidSyncAction
  ): AndroidActionMutationResult {
    if (!customerId) {
      return { ok: false, message: "Silinecek müşteri seçilmemiş." };
    }
    const customer = this.db
      .prepare("SELECT full_name, updated_at FROM customers WHERE id = ? AND deleted_at = ''")
      .get(customerId) as { full_name?: string; updated_at?: string } | undefined;
    if (!customer) {
      return { ok: false, message: "Müşteri masaüstü kayıtlarında bulunamadı." };
    }
    const creditDebt = this.db.prepare(`
      SELECT 1 FROM customer_credit_balances
      WHERE customer_id = ? AND amount_minor > 0 LIMIT 1
    `).get(customerId);
    if (creditDebt) {
      return { ok: false, message: "Bu müşterinin açık veresiye borcu var." };
    }
    const activeStay = this.db
      .prepare(`
        SELECT customer_room_stays.id, rooms.name AS room_name
        FROM customer_room_stays
        JOIN rooms ON rooms.id = customer_room_stays.room_id
        WHERE customer_room_stays.customer_id = ?
          AND customer_room_stays.status IN ('planned', 'checked_in')
          AND customer_room_stays.deleted_at = ''
        LIMIT 1
      `)
      .get(customerId) as { id?: string; room_name?: string } | undefined;
    if (activeStay) {
      return {
        ok: false,
        message: `${String(activeStay.room_name ?? "Oda")} için aktif konaklama kaydı var. Önce çıkış veya iptal işlemini tamamlayın.`
      };
    }
    const versionConflict = androidAction
      ? getAndroidVersionConflict(androidAction.payload, "expected_updated_at", customer.updated_at, "Müşteri")
      : null;
    if (versionConflict) {
      return versionConflict;
    }

    const updatedAt = nextMutationTimestamp(customer.updated_at, now);
    const requestResult = this.db
      .prepare("UPDATE requests SET customer_id = '', updated_at = ?, sync_status = 'local_only' WHERE customer_id = ? AND deleted_at = ''")
      .run(updatedAt, customerId);
    const reservationResult = this.db
      .prepare("UPDATE reservations SET customer_id = '', updated_at = ?, sync_status = 'local_only' WHERE customer_id = ? AND deleted_at = ''")
      .run(updatedAt, customerId);
    this.db
      .prepare("UPDATE whatsapp_messages SET customer_id = '', updated_at = ?, sync_status = 'local_only' WHERE customer_id = ? AND deleted_at = ''")
      .run(updatedAt, customerId);
    this.db
      .prepare("UPDATE notifications SET deleted_at = ?, updated_at = ?, sync_status = 'local_only' WHERE related_type = 'customer' AND related_id = ? AND deleted_at = ''")
      .run(updatedAt, updatedAt, customerId);
    this.db
      .prepare("UPDATE customers SET deleted_at = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ? AND deleted_at = ''")
      .run(updatedAt, updatedAt, customerId);
    this.insertDeletionEvent(androidAction, "customer.deleted", "customer", customerId, {
      full_name: String(customer.full_name ?? ""),
      preserved_request_count: Number(requestResult.changes ?? 0),
      preserved_reservation_count: Number(reservationResult.changes ?? 0)
    }, now);
    return {
      ok: true,
      message: androidAction
        ? "Müşteri telefondan silindi; talep ve rezervasyon geçmişi korundu."
        : "Müşteri silindi; talep ve rezervasyon geçmişi korundu."
    };
  }

  private deleteMenuCategoryInTransaction(
    categoryId: string,
    now: string,
    androidAction?: AndroidSyncAction
  ): AndroidActionMutationResult {
    if (!categoryId) {
      return { ok: false, message: "Silinecek menü kategorisi seçilmemiş." };
    }
    const category = this.db
      .prepare("SELECT name, updated_at FROM menu_categories WHERE id = ? AND deleted_at = ''")
      .get(categoryId) as { name?: string; updated_at?: string } | undefined;
    if (!category) {
      return { ok: false, message: "Menü kategorisi masaüstü kayıtlarında bulunamadı." };
    }
    const versionConflict = androidAction
      ? getAndroidVersionConflict(androidAction.payload, "expected_updated_at", category.updated_at, "Menü kategorisi")
      : null;
    if (versionConflict) {
      return versionConflict;
    }

    const updatedAt = nextMutationTimestamp(category.updated_at, now);
    const itemResult = this.db
      .prepare(`
        UPDATE menu_items
        SET deleted_at = ?, updated_at = ?, sync_status = 'pending'
        WHERE category_id = ? AND deleted_at = ''
      `)
      .run(updatedAt, updatedAt, categoryId);
    this.db
      .prepare("UPDATE menu_categories SET deleted_at = ?, updated_at = ?, sync_status = 'pending' WHERE id = ? AND deleted_at = ''")
      .run(updatedAt, updatedAt, categoryId);
    this.insertDeletionEvent(androidAction, "menu.category_deleted", "menu_category", categoryId, {
      name: String(category.name ?? ""),
      deleted_item_count: Number(itemResult.changes ?? 0)
    }, now);
    return {
      ok: true,
      message: Number(itemResult.changes ?? 0) > 0
        ? `${Number(itemResult.changes ?? 0)} ürünle birlikte kategori silindi.`
        : "Kategori silindi."
    };
  }

  private deleteMenuItemInTransaction(
    itemId: string,
    now: string,
    androidAction?: AndroidSyncAction
  ): AndroidActionMutationResult {
    if (!itemId) {
      return { ok: false, message: "Silinecek menü ürünü seçilmemiş." };
    }
    const item = this.db
      .prepare("SELECT name, category_id, updated_at FROM menu_items WHERE id = ? AND deleted_at = ''")
      .get(itemId) as { name?: string; category_id?: string; updated_at?: string } | undefined;
    if (!item) {
      return { ok: false, message: "Menü ürünü masaüstü kayıtlarında bulunamadı." };
    }
    const versionConflict = androidAction
      ? getAndroidVersionConflict(androidAction.payload, "expected_updated_at", item.updated_at, "Menü ürünü")
      : null;
    if (versionConflict) {
      return versionConflict;
    }

    const updatedAt = nextMutationTimestamp(item.updated_at, now);
    this.db
      .prepare("UPDATE menu_items SET deleted_at = ?, updated_at = ?, sync_status = 'pending' WHERE id = ? AND deleted_at = ''")
      .run(updatedAt, updatedAt, itemId);
    this.insertDeletionEvent(androidAction, "menu.item_deleted", "menu_item", itemId, {
      name: String(item.name ?? ""),
      category_id: String(item.category_id ?? "")
    }, now);
    return { ok: true, message: androidAction ? "Menü ürünü telefondan silindi." : "Ürün silindi." };
  }

  private deleteMessageInTransaction(
    messageId: string,
    requestIdInput: string,
    now: string,
    androidAction?: AndroidSyncAction
  ): AndroidActionMutationResult {
    if (!messageId && !requestIdInput) {
      return { ok: false, message: "Silinecek hazır mesaj seçilmemiş." };
    }
    const message = messageId
      ? this.db
        .prepare("SELECT id, request_id, updated_at FROM whatsapp_messages WHERE id = ? AND deleted_at = ''")
        .get(messageId) as { id?: string; request_id?: string; updated_at?: string } | undefined
      : undefined;
    if (message && requestIdInput && String(message.request_id ?? "") !== requestIdInput) {
      return { ok: false, message: "Mesaj ile talep bilgisi eşleşmiyor." };
    }
    const requestId = requestIdInput || String(message?.request_id ?? "");
    const request = requestId
      ? this.db
        .prepare("SELECT ai_suggested_reply, whatsapp_message, updated_at FROM requests WHERE id = ? AND deleted_at = ''")
        .get(requestId) as { ai_suggested_reply?: string; whatsapp_message?: string; updated_at?: string } | undefined
      : undefined;
    const hasRequestDraft = Boolean(String(request?.ai_suggested_reply ?? "").trim() || String(request?.whatsapp_message ?? "").trim());
    if (!message && !hasRequestDraft) {
      return { ok: false, message: "Hazır mesaj masaüstü kayıtlarında bulunamadı." };
    }
    const actualUpdatedAt = message?.updated_at || request?.updated_at;
    const versionConflict = androidAction
      ? getAndroidVersionConflict(androidAction.payload, "expected_updated_at", actualUpdatedAt, "Hazır mesaj")
      : null;
    if (versionConflict) {
      return versionConflict;
    }

    const updatedAt = nextMutationTimestamp(actualUpdatedAt, now);
    let deletedCount = 0;
    if (requestId) {
      const result = this.db
        .prepare(`
          UPDATE whatsapp_messages
          SET deleted_at = ?, updated_at = ?, sync_status = 'local_only'
          WHERE request_id = ? AND direction = 'outgoing' AND status = 'prepared' AND deleted_at = ''
        `)
        .run(updatedAt, updatedAt, requestId);
      deletedCount = Number(result.changes ?? 0);
      this.db
        .prepare(`
          UPDATE requests
          SET ai_suggested_reply = '', whatsapp_message = '', updated_at = ?, sync_status = 'local_only'
          WHERE id = ? AND deleted_at = ''
        `)
        .run(updatedAt, requestId);
    } else if (message?.id) {
      const result = this.db
        .prepare("UPDATE whatsapp_messages SET deleted_at = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ? AND deleted_at = ''")
        .run(updatedAt, updatedAt, message.id);
      deletedCount = Number(result.changes ?? 0);
    }
    const eventId = String(message?.id ?? (messageId || `message_${requestId}`));
    this.insertDeletionEvent(androidAction, "whatsapp.message_deleted", "whatsapp_message", eventId, {
      request_id: requestId,
      deleted_record_count: deletedCount
    }, now);
    return { ok: true, message: androidAction ? "Hazır mesaj telefondan silindi." : "Hazır mesaj silindi." };
  }

  private insertDeletionEvent(
    androidAction: AndroidSyncAction | undefined,
    type: string,
    entityType: string,
    entityId: string,
    payload: Record<string, unknown>,
    now: string
  ) {
    if (androidAction) {
      this.insertAndroidActionEvent(androidAction, type, entityType, entityId, payload, now);
      return;
    }
    this.insertEvent({ type, entityType, entityId, payload, now });
  }

  private applyAndroidRequestStatus(action: AndroidSyncAction, status: string, now: string): AndroidActionMutationResult {
    const requestId = androidPayloadString(action.payload, "request_id");
    if (!requestId) {
      return { ok: false, message: "Güncellenecek talep seçilmemiş." };
    }
    const request = this.db
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

    this.db
      .prepare("UPDATE requests SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
      .run(status, updatedAt, requestId);
    if (status === "answered" && this.getEnabledBusinessCapabilities().includes(BUSINESS_CAPABILITIES.WHATSAPP)) {
      this.markPreparedWhatsAppMessagesSentInTransaction(requestId, updatedAt);
    }
    this.insertAndroidActionEvent(action, "request.status_changed", "request", requestId, {
      previous_status: String(request.status ?? ""),
      status
    }, now);
    return { ok: true, message: "Talep durumu telefondan güncellendi." };
  }

  private applyAndroidRequestConversion(action: AndroidSyncAction, now: string): AndroidActionMutationResult {
    const requestId = androidPayloadString(action.payload, "request_id");
    if (!requestId) {
      return { ok: false, message: "Rezervasyona çevrilecek talep seçilmemiş." };
    }
    const request = this.db
      .prepare("SELECT * FROM requests WHERE id = ? AND deleted_at = ''")
      .get(requestId) as Record<string, unknown> | undefined;
    if (!request) {
      return { ok: false, message: "Talep masaüstü kayıtlarında bulunamadı." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_updated_at", request.updated_at, "Talep");
    if (versionConflict) {
      return versionConflict;
    }
    const updatedAt = nextMutationTimestamp(request.updated_at, now);

    const requestType = String(request.request_type ?? "");
    const reservationType = getRequestReservationType(requestType);
    if (!reservationType || !canConvertRequestToReservation(this.getEnabledBusinessCapabilities(), requestType)) {
      return { ok: false, message: "Bu talep türü etkin bir rezervasyon alanına dönüştürülemez." };
    }

    const existingReservation = this.db
      .prepare("SELECT id FROM reservations WHERE request_id = ? AND deleted_at = '' LIMIT 1")
      .get(requestId) as { id?: string } | undefined;
    const reservationId = existingReservation?.id || createAndroidEntityId("reservation_", action.id);
    const customerId = this.ensureCustomerForRequest(request, now);
    this.db
      .prepare(`
        INSERT INTO reservations (
          id, request_id, customer_id, reservation_type, status, title, start_date, end_date, time,
          guest_count, adult_count, child_count, room_ids_json, table_ids_json, notes, price_note,
          payment_status, created_at, updated_at, sync_status
        ) VALUES (?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?, 'not_required', ?, ?, 'local_only')
        ON CONFLICT(id) DO UPDATE SET
          customer_id = excluded.customer_id,
          reservation_type = excluded.reservation_type,
          status = 'approved',
          title = excluded.title,
          start_date = excluded.start_date,
          end_date = excluded.end_date,
          time = excluded.time,
          guest_count = excluded.guest_count,
          adult_count = excluded.adult_count,
          child_count = excluded.child_count,
          notes = excluded.notes,
          price_note = excluded.price_note,
          updated_at = excluded.updated_at,
          deleted_at = '',
          sync_status = 'local_only'
      `)
      .run(
        reservationId,
        requestId,
        customerId,
        reservationType,
        buildReservationTitle(request, reservationType),
        String(request.start_date ?? ""),
        String(request.end_date ?? ""),
        String(request.time ?? ""),
        Number(request.guest_count ?? 1),
        Number(request.adult_count ?? 0),
        Number(request.child_count ?? 0),
        buildReservationNotes(request),
        "Fiyat ve kaynak ataması işletme sahibi tarafından netleştirilecek.",
        updatedAt,
        updatedAt
      );
    this.db
      .prepare("UPDATE requests SET status = 'converted_to_reservation', customer_id = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
      .run(customerId, updatedAt, requestId);
    this.insertAndroidActionEvent(action, "request.converted_to_reservation", "request", requestId, {
      reservation_id: reservationId,
      customer_id: customerId,
      previous_status: String(request.status ?? "")
    }, now);
    this.insertAndroidActionEvent(action, "reservation.approved", "reservation", reservationId, {
      request_id: requestId,
      customer_id: customerId,
      reservation_type: reservationType
    }, now);
    return {
      ok: true,
      message: existingReservation ? "Mevcut rezervasyon telefondan onaylandı." : "Talep telefondan rezervasyona çevrildi."
    };
  }

  private applyAndroidCustomerSave(
    action: AndroidSyncAction,
    now: string,
    updating: boolean
  ): AndroidActionMutationResult {
    const customerId = updating
      ? androidPayloadString(action.payload, "customer_id")
      : createAndroidEntityId("customer_", action.id);
    const existing = updating
      ? this.db.prepare("SELECT id, source, created_at, updated_at FROM customers WHERE id = ? AND deleted_at = ''").get(customerId) as Record<string, unknown> | undefined
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
      ? this.db
          .prepare("SELECT id FROM customers WHERE identity_number = ? AND id != ? AND deleted_at = '' LIMIT 1")
          .get(customer.identityNumber, customerId)
      : undefined;
    if (duplicateIdentity) {
      return { ok: false, message: "Bu kimlik numarası başka bir müşteri kartında kayıtlı." };
    }
    const duplicatePhone = customer.phone
      ? this.db
          .prepare("SELECT id FROM customers WHERE phone = ? AND id != ? AND deleted_at = '' LIMIT 1")
          .get(customer.phone, customerId)
      : undefined;
    if (duplicatePhone) {
      return { ok: false, message: "Bu telefon numarasıyla kayıtlı bir müşteri zaten var." };
    }

    const updatedAt = nextMutationTimestamp(existing?.updated_at, now);
    this.db
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
    this.insertAndroidActionEvent(
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

  private applyAndroidCustomerRoomAssignment(action: AndroidSyncAction, now: string): AndroidActionMutationResult {
    const customerId = androidPayloadString(action.payload, "customer_id");
    const roomId = androidPayloadString(action.payload, "room_id");
    const checkInDate = normalizeDateInput(androidPayloadString(action.payload, "check_in_date"));
    const checkOutDate = normalizeDateInput(androidPayloadString(action.payload, "check_out_date"));
    const guestCount = normalizeInteger(Number(action.payload.guest_count ?? 1));
    const status = normalizeStatus(androidPayloadString(action.payload, "status"), ["planned", "checked_in"]);
    const notes = normalizeLimitedText(action.payload.notes, 2000);
    if (!customerId || !roomId || !checkInDate || !status) {
      return { ok: false, message: "Müşteri, oda, giriş tarihi ve konaklama durumu seçilmeli." };
    }
    if (checkOutDate && checkOutDate < checkInDate) {
      return { ok: false, message: "Çıkış tarihi giriş tarihinden önce olamaz." };
    }
    if (guestCount < 1 || guestCount > 50) {
      return { ok: false, message: "Konaklayan kişi sayısı 1 ile 50 arasında olmalı." };
    }
    const customer = this.db
      .prepare("SELECT full_name FROM customers WHERE id = ? AND deleted_at = ''")
      .get(customerId) as { full_name?: string } | undefined;
    const room = this.db
      .prepare("SELECT name, capacity, status, is_active FROM rooms WHERE id = ? AND deleted_at = ''")
      .get(roomId) as Record<string, unknown> | undefined;
    if (!customer || !room || Number(room.is_active ?? 0) !== 1) {
      return { ok: false, message: "Müşteri veya aktif oda masaüstü kayıtlarında bulunamadı." };
    }
    if (["maintenance", "out_of_service", "cleaning"].includes(String(room.status ?? ""))) {
      return { ok: false, message: "Bakımda, servis dışı veya temizlikte olan odaya müşteri atanamaz." };
    }
    if (Number(room.capacity ?? 0) > 0 && guestCount > Number(room.capacity ?? 0)) {
      return { ok: false, message: `Bu odanın kapasitesi en fazla ${Number(room.capacity)} kişi.` };
    }
    if (this.hasOverlappingCustomerRoomStay(roomId, checkInDate, checkOutDate)) {
      return { ok: false, message: "Seçilen tarihlerde odanın başka bir aktif müşteri kaydı var." };
    }
    const reservationConflict = this.findConflictingRoomReservation(roomId, customerId, checkInDate, checkOutDate);
    if (reservationConflict) {
      return { ok: false, message: `Oda bu tarihlerde ${reservationConflict} rezervasyonuna bağlı.` };
    }

    const stayId = createAndroidEntityId("stay_", action.id);
    this.db
      .prepare(`
        INSERT INTO customer_room_stays (
          id, customer_id, room_id, reservation_id, status, check_in_date,
          check_out_date, guest_count, notes, source, checked_in_at,
          checked_out_at, created_at, updated_at, deleted_at, sync_status
        ) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, 'android', ?, '', ?, ?, '', 'local_only')
      `)
      .run(
        stayId,
        customerId,
        roomId,
        status,
        checkInDate,
        checkOutDate,
        guestCount,
        notes,
        status === "checked_in" ? now : "",
        now,
        now
      );
    this.db
      .prepare("UPDATE rooms SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
      .run(status === "checked_in" ? "occupied" : "reserved", now, roomId);
    this.insertAndroidActionEvent(action, "customer.room_assigned", "customer_room_stay", stayId, {
      customer_id: customerId,
      room_id: roomId,
      status,
      check_in_date: checkInDate,
      check_out_date: checkOutDate
    }, now);
    return { ok: true, message: "Müşteri telefondan odaya atandı." };
  }

  private applyAndroidCustomerRoomStayStatus(action: AndroidSyncAction, now: string): AndroidActionMutationResult {
    const stayId = androidPayloadString(action.payload, "stay_id");
    const status = normalizeStatus(
      androidPayloadString(action.payload, "status"),
      ["planned", "checked_in", "checked_out", "cancelled"]
    );
    if (!stayId || !status) {
      return { ok: false, message: "Konaklama kaydı ve yeni durum seçilmeli." };
    }
    const stay = this.db
      .prepare("SELECT * FROM customer_room_stays WHERE id = ? AND deleted_at = ''")
      .get(stayId) as Record<string, unknown> | undefined;
    if (!stay) {
      return { ok: false, message: "Konaklama kaydı masaüstünde bulunamadı." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_updated_at", stay.updated_at, "Konaklama");
    if (versionConflict) {
      return versionConflict;
    }
    const previousStatus = String(stay.status ?? "");
    const allowedTransitions: Record<string, string[]> = {
      planned: ["checked_in", "cancelled"],
      checked_in: ["checked_out", "cancelled"],
      cancelled: ["planned"],
      checked_out: []
    };
    if (!(allowedTransitions[previousStatus] ?? []).includes(status)) {
      return { ok: false, message: "Bu konaklama kaydı seçilen duruma geçirilemez." };
    }
    if (
      ["planned", "checked_in"].includes(status)
      && this.hasOverlappingCustomerRoomStay(
        String(stay.room_id ?? ""),
        String(stay.check_in_date ?? ""),
        String(stay.check_out_date ?? ""),
        stayId
      )
    ) {
      return { ok: false, message: "Odanın aynı tarihlerde başka bir aktif müşteri kaydı var." };
    }
    const updatedAt = nextMutationTimestamp(stay.updated_at, now);
    this.db
      .prepare(`
        UPDATE customer_room_stays
        SET status = ?,
            checked_in_at = CASE WHEN ? = 'checked_in' THEN ? ELSE checked_in_at END,
            checked_out_at = CASE WHEN ? = 'checked_out' THEN ? ELSE checked_out_at END,
            updated_at = ?,
            sync_status = 'local_only'
        WHERE id = ?
      `)
      .run(status, status, updatedAt, status, updatedAt, updatedAt, stayId);
    this.refreshRoomStatusFromStays(String(stay.room_id ?? ""), updatedAt, status === "checked_out");
    this.insertAndroidActionEvent(action, "customer.room_stay_status_changed", "customer_room_stay", stayId, {
      customer_id: String(stay.customer_id ?? ""),
      room_id: String(stay.room_id ?? ""),
      previous_status: previousStatus,
      status
    }, now);
    return { ok: true, message: "Konaklama durumu telefondan güncellendi." };
  }

  private applyAndroidReservationStatus(action: AndroidSyncAction, status: "approved" | "rejected" | "cancelled", now: string): AndroidActionMutationResult {
    const reservationId = androidPayloadString(action.payload, "reservation_id");
    if (!reservationId) {
      return { ok: false, message: "Güncellenecek rezervasyon seçilmemiş." };
    }
    const reservation = this.db
      .prepare("SELECT * FROM reservations WHERE id = ? AND deleted_at = ''")
      .get(reservationId) as Record<string, unknown> | undefined;
    if (!reservation) {
      return { ok: false, message: "Rezervasyon masaüstü kayıtlarında bulunamadı." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_updated_at", reservation.updated_at, "Rezervasyon");
    if (versionConflict) {
      return versionConflict;
    }

    const roomIds = this.parseStringArray(reservation.room_ids_json);
    const tableIds = this.parseStringArray(reservation.table_ids_json);
    const activeOrder = this.findActiveOrderForTables(tableIds);
    if (activeOrder) {
      return { ok: false, message: "Aktif adisyonu olan masaya bağlı rezervasyon değiştirilemez. Önce adisyonu kapatın." };
    }
    const updatedAt = nextMutationTimestamp(reservation.updated_at, now);
    this.db
      .prepare("UPDATE reservations SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
      .run(status, updatedAt, reservationId);
    if (status === "approved") {
      for (const roomId of roomIds) {
        this.db
          .prepare("UPDATE rooms SET status = 'reserved', updated_at = ?, sync_status = 'local_only' WHERE id = ? AND deleted_at = ''")
          .run(updatedAt, roomId);
      }
      for (const tableId of tableIds) {
        this.db
          .prepare("UPDATE tables SET status = 'reserved', current_reservation_id = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ? AND deleted_at = ''")
          .run(reservationId, updatedAt, tableId);
      }
    } else {
      for (const roomId of roomIds) {
        this.db
          .prepare("UPDATE rooms SET status = 'available', updated_at = ?, sync_status = 'local_only' WHERE id = ? AND status = 'reserved' AND deleted_at = ''")
          .run(updatedAt, roomId);
      }
      for (const tableId of tableIds) {
        this.db
          .prepare(`
            UPDATE tables
            SET status = 'available', current_reservation_id = '', updated_at = ?, sync_status = 'local_only'
            WHERE id = ? AND current_reservation_id = ? AND deleted_at = ''
          `)
          .run(updatedAt, tableId, reservationId);
      }
    }
    for (const roomId of roomIds) {
      this.enforceActiveStayRoomStatus(roomId, updatedAt);
    }
    this.insertAndroidActionEvent(action, "reservation.status_changed", "reservation", reservationId, {
      previous_status: String(reservation.status ?? ""),
      status,
      room_ids: roomIds,
      table_ids: tableIds
    }, now);
    return { ok: true, message: "Rezervasyon durumu telefondan güncellendi." };
  }

  private applyAndroidRoomStatus(action: AndroidSyncAction, now: string): AndroidActionMutationResult {
    const roomId = androidPayloadString(action.payload, "room_id");
    const status = normalizeStatus(androidPayloadString(action.payload, "status"), ["available", "reserved", "occupied", "cleaning", "maintenance"]);
    if (!roomId || !status) {
      return { ok: false, message: "Oda veya yeni oda durumu geçersiz." };
    }
    const room = this.db
      .prepare("SELECT status, updated_at FROM rooms WHERE id = ? AND is_active = 1 AND deleted_at = ''")
      .get(roomId) as { status?: string; updated_at?: string } | undefined;
    if (!room) {
      return { ok: false, message: "Oda masaüstü kayıtlarında bulunamadı." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_updated_at", room.updated_at, "Oda");
    if (versionConflict) {
      return versionConflict;
    }
    const activeStay = this.db
      .prepare(`
        SELECT status
        FROM customer_room_stays
        WHERE room_id = ?
          AND status IN ('checked_in', 'planned')
          AND deleted_at = ''
        ORDER BY CASE status WHEN 'checked_in' THEN 0 ELSE 1 END
        LIMIT 1
      `)
      .get(roomId) as { status?: string } | undefined;
    const expectedStatus = activeStay?.status === "checked_in"
      ? "occupied"
      : activeStay?.status === "planned"
        ? "reserved"
        : "";
    if (expectedStatus && status !== expectedStatus) {
      return {
        ok: false,
        message: "Odanın aktif müşteri kaydı var. Durumu konaklama kartından değiştirin."
      };
    }
    const updatedAt = nextMutationTimestamp(room.updated_at, now);
    this.db
      .prepare("UPDATE rooms SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
      .run(status, updatedAt, roomId);
    this.insertAndroidActionEvent(action, "room.status_changed", "room", roomId, {
      old_status: String(room.status ?? ""),
      new_status: status
    }, now);
    return { ok: true, message: "Oda durumu telefondan güncellendi." };
  }

  private applyAndroidDailyTaskStatus(action: AndroidSyncAction, status: "done" | "pending" | "cancelled", now: string): AndroidActionMutationResult {
    const taskId = androidPayloadString(action.payload, "task_id");
    if (!taskId) {
      return { ok: false, message: "Güncellenecek günlük iş seçilmemiş." };
    }
    const task = this.db
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
    this.db
      .prepare("UPDATE daily_tasks SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
      .run(status, updatedAt, taskId);
    this.insertAndroidActionEvent(action, status === "done" ? "task.completed" : "task.status_changed", "daily_task", taskId, {
      previous_status: String(task.status ?? ""),
      status
    }, now);
    return { ok: true, message: "Günlük iş telefondan güncellendi." };
  }

  private applyAndroidTableStatus(action: AndroidSyncAction, now: string): AndroidActionMutationResult {
    const tableId = androidPayloadString(action.payload, "table_id");
    const status = normalizeStatus(androidPayloadString(action.payload, "status"), ["available", "reserved", "occupied", "bill_waiting", "cleaning"]);
    if (!tableId || !status) {
      return { ok: false, message: "Masa veya yeni masa durumu geçersiz." };
    }
    const table = this.db
      .prepare("SELECT status, updated_at FROM tables WHERE id = ? AND is_active = 1 AND deleted_at = ''")
      .get(tableId) as { status?: string; updated_at?: string } | undefined;
    if (!table) {
      return { ok: false, message: "Masa masaüstü kayıtlarında bulunamadı." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_updated_at", table.updated_at, "Masa");
    if (versionConflict) {
      return versionConflict;
    }
    const activeOrder = this.db
      .prepare("SELECT id, status FROM table_orders WHERE table_id = ? AND status IN ('open', 'preparing', 'served', 'payment') LIMIT 1")
      .get(tableId) as { id?: string; status?: string } | undefined;
    if (activeOrder) {
      return { ok: false, message: "Aktif adisyonu olan masanın durumu adisyon üzerinden değiştirilmelidir." };
    }
    const updatedAt = nextMutationTimestamp(table.updated_at, now);
    this.db
      .prepare("UPDATE tables SET status = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?")
      .run(status, updatedAt, tableId);
    this.insertAndroidActionEvent(action, "table.status_changed", "table", tableId, {
      old_status: String(table.status ?? ""),
      new_status: status
    }, now);
    return { ok: true, message: "Masa durumu telefondan güncellendi." };
  }

  private applyAndroidTableOrderOpen(action: AndroidSyncAction, now: string): AndroidActionMutationResult {
    const tableId = androidPayloadString(action.payload, "table_id");
    if (!tableId) {
      return { ok: false, message: "Sipariş açılacak masa seçilmemiş." };
    }
    const table = this.db
      .prepare("SELECT id, updated_at FROM tables WHERE id = ? AND is_active = 1 AND deleted_at = ''")
      .get(tableId) as { id?: string; updated_at?: string } | undefined;
    if (!table) {
      return { ok: false, message: "Sipariş açılacak masa bulunamadı." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_table_updated_at", table.updated_at, "Masa");
    if (versionConflict) {
      return versionConflict;
    }
    const activeOrder = this.db
      .prepare("SELECT id, status FROM table_orders WHERE table_id = ? AND status IN ('open', 'preparing', 'served', 'payment') LIMIT 1")
      .get(tableId) as { id?: string; status?: string } | undefined;
    if (activeOrder?.id) {
      this.updateTableStatusForOrderInTransaction(tableId, activeOrder.status === "payment" ? "bill_waiting" : "occupied", activeOrder.id, now, action);
      return { ok: true, message: "Masada zaten açık bir adisyon var." };
    }

    const orderId = createAndroidEntityId("table_order_", action.id);
    this.db
      .prepare(`
        INSERT INTO table_orders (
          id, table_id, status, opened_at, closed_at, subtotal, discount_total, total, note, created_at, updated_at
        ) VALUES (?, ?, 'open', ?, '', 0, 0, 0, '', ?, ?)
      `)
      .run(orderId, tableId, now, now, now);
    this.updateTableStatusForOrderInTransaction(tableId, "occupied", orderId, now, action);
    this.insertAndroidActionEvent(action, "table_order.opened", "table_order", orderId, { table_id: tableId }, now);
    return { ok: true, message: "Masa adisyonu telefondan açıldı." };
  }

  private applyAndroidTableOrderAddItem(action: AndroidSyncAction, now: string): AndroidActionMutationResult {
    const explicitOrderId = androidPayloadString(action.payload, "order_id");
    const dependencyActionId = androidPayloadString(action.payload, "depends_on_action_id");
    let orderId = "";
    if (explicitOrderId) {
      orderId = this.resolveAndroidActiveOrderId(action.payload);
    } else if (dependencyActionId) {
      const dependencyReceipt = this.db
        .prepare("SELECT action_type FROM android_action_receipts WHERE id = ?")
        .get(dependencyActionId) as { action_type?: string } | undefined;
      const dependentOrderId = createAndroidEntityId("table_order_", dependencyActionId);
      if (dependencyReceipt?.action_type !== "table_order_open" || !this.isActiveTableOrder(dependentOrderId)) {
        return { ok: false, message: "Ürün eklenemedi çünkü bağlı adisyon açma işlemi uygulanmadı." };
      }
      orderId = dependentOrderId;
    } else {
      return { ok: false, message: "Ürün eklemek için açık adisyon veya uygulanmış adisyon açma işlemi gerekli." };
    }
    const menuItemId = androidPayloadString(action.payload, "menu_item_id");
    const quantity = normalizeOrderQuantity(androidPayloadNumber(action.payload, "quantity", 1));
    if (!orderId || !menuItemId || !quantity) {
      return { ok: false, message: "Ürün, adisyon veya adet bilgisi geçersiz." };
    }
    const order = this.db
      .prepare("SELECT table_id, updated_at FROM table_orders WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')")
      .get(orderId) as { table_id?: string; updated_at?: string } | undefined;
    if (!order) {
      return { ok: false, message: "Ürün eklenecek aktif adisyon bulunamadı." };
    }
    const payloadTableId = androidPayloadString(action.payload, "table_id");
    if (payloadTableId && payloadTableId !== String(order.table_id ?? "")) {
      return { ok: false, message: "Ürün ile adisyonun masa bilgisi eşleşmiyor." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_order_updated_at", order.updated_at, "Adisyon");
    if (versionConflict) {
      return versionConflict;
    }
    const menuItem = this.db
      .prepare(`
        SELECT menu_items.id, menu_items.name, menu_items.price, menu_items.currency
        FROM menu_items
        INNER JOIN menu_categories ON menu_categories.id = menu_items.category_id
        WHERE menu_items.id = ?
          AND menu_items.is_available = 1
          AND menu_items.deleted_at = ''
          AND menu_categories.is_active = 1
          AND menu_categories.deleted_at = ''
        LIMIT 1
      `)
      .get(menuItemId) as { id?: string; name?: string; price?: number; currency?: string } | undefined;
    if (!menuItem?.id) {
      return { ok: false, message: "Menü ürünü artık satışta değil veya bulunamadı." };
    }
    const productName = String(menuItem.name ?? "Ürün").trim() || "Ürün";
    const unitPrice = roundMoney(Number(menuItem.price ?? 0));
    const currency = normalizeTableOrderCurrency(menuItem.currency);
    const orderCurrency = this.db
      .prepare("SELECT currency FROM table_order_items WHERE order_id = ? AND status != 'cancelled' ORDER BY created_at ASC LIMIT 1")
      .get(orderId) as { currency?: string } | undefined;
    if (orderCurrency?.currency && normalizeTableOrderCurrency(orderCurrency.currency) !== currency) {
      return { ok: false, message: "Farklı para birimindeki ürün aynı adisyona eklenemez." };
    }
    const existingItem = this.db
      .prepare(`
        SELECT id, quantity, updated_at FROM table_order_items
        WHERE order_id = ? AND menu_item_id = ? AND product_name = ? AND unit_price = ? AND currency = ? AND note = '' AND status = 'open'
        ORDER BY created_at DESC LIMIT 1
      `)
      .get(orderId, menuItemId, productName, unitPrice, currency) as { id?: string; quantity?: number; updated_at?: string } | undefined;
    const itemId = existingItem?.id || createAndroidEntityId("table_order_item_", action.id);
    if (existingItem?.id) {
      const nextQuantity = Number(existingItem.quantity ?? 0) + quantity;
      if (nextQuantity > 999) {
        return { ok: false, message: "Bir sipariş satırındaki ürün adedi 999'u aşamaz." };
      }
      const stockResult = this.mutateMenuStockInTransaction({
        menuItemId,
        type: "order_add",
        quantityChange: -quantity,
        sourceType: "table_order",
        sourceId: orderId,
        actorDeviceId: action.device_id,
        note: `${productName} Android siparişinden adisyona eklendi.`,
        now
      });
      if (!stockResult.ok) {
        return stockResult;
      }
      const itemUpdatedAt = nextMutationTimestamp(existingItem.updated_at, now);
      this.db
        .prepare("UPDATE table_order_items SET quantity = ?, line_total = ?, updated_at = ? WHERE id = ?")
        .run(nextQuantity, roundMoney(unitPrice * nextQuantity), itemUpdatedAt, itemId);
    } else {
      const stockResult = this.mutateMenuStockInTransaction({
        menuItemId,
        type: "order_add",
        quantityChange: -quantity,
        sourceType: "table_order",
        sourceId: orderId,
        actorDeviceId: action.device_id,
        note: `${productName} Android siparişinden adisyona eklendi.`,
        now
      });
      if (!stockResult.ok) {
        return stockResult;
      }
      this.db
        .prepare(`
          INSERT INTO table_order_items (
            id, order_id, menu_item_id, product_name, unit_price, currency, quantity, line_total, note, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 'open', ?, ?)
        `)
        .run(itemId, orderId, menuItemId, productName, unitPrice, currency, quantity, roundMoney(unitPrice * quantity), now, now);
    }
    this.recalculateTableOrderTotalInTransaction(orderId, now);
    this.insertAndroidActionEvent(action, "table_order.item_added", "table_order", orderId, {
      item_id: itemId,
      menu_item_id: menuItemId,
      quantity,
      unit_price: unitPrice,
      currency
    }, now);
    return { ok: true, message: "Ürün telefondan adisyona eklendi." };
  }

  private applyAndroidTableOrderItemQuantity(action: AndroidSyncAction, now: string): AndroidActionMutationResult {
    const itemId = androidPayloadString(action.payload, "item_id");
    const quantity = normalizeOrderQuantity(androidPayloadNumber(action.payload, "quantity", 0));
    if (!itemId || !quantity) {
      return { ok: false, message: "Sipariş satırı veya adet bilgisi geçersiz." };
    }
    const item = this.getMutableTableOrderItem(itemId);
    if (!item) {
      return { ok: false, message: "Güncellenecek aktif sipariş satırı bulunamadı." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_item_updated_at", item.updated_at, "Sipariş satırı");
    if (versionConflict) {
      return versionConflict;
    }
    const updatedAt = nextMutationTimestamp(item.updated_at, now);
    const orderId = String(item.order_id ?? "");
    const previousQuantity = Number(item.quantity ?? 0);
    if (quantity !== previousQuantity) {
      const stockResult = this.mutateMenuStockInTransaction({
        menuItemId: String(item.menu_item_id ?? ""),
        type: "order_update",
        quantityChange: previousQuantity - quantity,
        sourceType: "table_order",
        sourceId: orderId,
        actorDeviceId: action.device_id,
        note: "Android siparişinde ürün adedi değiştirildi.",
        now
      });
      if (!stockResult.ok) {
        return stockResult;
      }
    }
    this.db
      .prepare("UPDATE table_order_items SET quantity = ?, line_total = ?, updated_at = ? WHERE id = ?")
      .run(quantity, roundMoney(Number(item.unit_price ?? 0) * quantity), updatedAt, itemId);
    this.recalculateTableOrderTotalInTransaction(orderId, now);
    this.insertAndroidActionEvent(action, "table_order.item_quantity_changed", "table_order", orderId, {
      item_id: itemId,
      quantity
    }, now);
    return { ok: true, message: "Ürün adedi telefondan güncellendi." };
  }

  private applyAndroidTableOrderRemoveItem(action: AndroidSyncAction, now: string): AndroidActionMutationResult {
    const itemId = androidPayloadString(action.payload, "item_id");
    const item = this.getMutableTableOrderItem(itemId);
    if (!item) {
      return { ok: false, message: "Silinecek aktif sipariş satırı bulunamadı." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_item_updated_at", item.updated_at, "Sipariş satırı");
    if (versionConflict) {
      return versionConflict;
    }
    const updatedAt = nextMutationTimestamp(item.updated_at, now);
    const orderId = String(item.order_id ?? "");
    const stockResult = this.mutateMenuStockInTransaction({
      menuItemId: String(item.menu_item_id ?? ""),
      type: "order_remove",
      quantityChange: Number(item.quantity ?? 0),
      sourceType: "table_order",
      sourceId: orderId,
      actorDeviceId: action.device_id,
      note: "Ürün Android siparişinden silindi.",
      now
    });
    if (!stockResult.ok) {
      return stockResult;
    }
    this.db
      .prepare("UPDATE table_order_items SET status = 'cancelled', updated_at = ? WHERE id = ?")
      .run(updatedAt, itemId);
    this.recalculateTableOrderTotalInTransaction(orderId, now);
    this.insertAndroidActionEvent(action, "table_order.item_removed", "table_order", orderId, { item_id: itemId }, now);
    return { ok: true, message: "Ürün telefondan adisyondan kaldırıldı." };
  }

  private applyAndroidTableOrderStatus(
    action: AndroidSyncAction,
    now: string,
    forcedStatus?: "preparing" | "served" | "payment"
  ): AndroidActionMutationResult {
    const orderId = this.resolveAndroidActiveOrderId(action.payload);
    const status = forcedStatus ?? normalizeStatus(androidPayloadString(action.payload, "status"), ["open", "preparing", "served", "payment"]);
    if (!orderId || !status) {
      return { ok: false, message: "Adisyon veya yeni durum bilgisi geçersiz." };
    }
    const current = this.db
      .prepare("SELECT status, table_id, updated_at FROM table_orders WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')")
      .get(orderId) as { status?: string; table_id?: string; updated_at?: string } | undefined;
    if (!current) {
      return { ok: false, message: "Güncellenecek aktif adisyon bulunamadı." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_updated_at", current.updated_at, "Adisyon");
    if (versionConflict) {
      return versionConflict;
    }
    const updatedAt = nextMutationTimestamp(current.updated_at, now);
    this.db.prepare("UPDATE table_orders SET status = ?, updated_at = ? WHERE id = ?").run(status, updatedAt, orderId);
    if (status === "preparing") {
      this.db
        .prepare("UPDATE table_order_items SET status = 'preparing', updated_at = ? WHERE order_id = ? AND status != 'cancelled'")
        .run(updatedAt, orderId);
    } else if (status === "served") {
      this.db
        .prepare("UPDATE table_order_items SET status = 'served', updated_at = ? WHERE order_id = ? AND status != 'cancelled'")
        .run(updatedAt, orderId);
    }
    this.updateTableStatusForOrderInTransaction(String(current.table_id ?? ""), status === "payment" ? "bill_waiting" : "occupied", orderId, now, action);
    this.insertAndroidActionEvent(action, "table_order.status_changed", "table_order", orderId, {
      old_status: String(current.status ?? ""),
      new_status: status
    }, now);
    return { ok: true, message: "Adisyon durumu telefondan güncellendi." };
  }

  private applyAndroidTableOrderClose(
    action: AndroidSyncAction,
    now: string,
    forcedStatus?: "paid" | "cancelled"
  ): AndroidActionMutationResult {
    const orderId = this.resolveAndroidActiveOrderId(action.payload);
    const status = forcedStatus ?? normalizeStatus(androidPayloadString(action.payload, "status"), ["paid", "cancelled"]);
    if (!orderId || !status) {
      return { ok: false, message: "Kapatılacak adisyon veya kapanış durumu geçersiz." };
    }
    const current = this.db
      .prepare("SELECT status, table_id, updated_at FROM table_orders WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')")
      .get(orderId) as { status?: string; table_id?: string; updated_at?: string } | undefined;
    if (!current) {
      return { ok: false, message: "Kapatılacak aktif adisyon bulunamadı." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_updated_at", current.updated_at, "Adisyon");
    if (versionConflict) {
      return versionConflict;
    }
    const updatedAt = nextMutationTimestamp(current.updated_at, now);
    if (status === "cancelled") {
      const stockRestore = this.restoreCancelledOrderStockInTransaction(orderId, action.device_id, now);
      if (!stockRestore.ok) {
        return stockRestore;
      }
    }
    this.recalculateTableOrderTotalInTransaction(orderId, now);
    this.db
      .prepare("UPDATE table_orders SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?")
      .run(status, now, updatedAt, orderId);
    this.updateTableStatusForOrderInTransaction(String(current.table_id ?? ""), "available", orderId, now, action);
    this.insertAndroidActionEvent(action, status === "paid" ? "table_order.paid" : "table_order.cancelled", "table_order", orderId, {
      old_status: String(current.status ?? ""),
      status
    }, now);
    return { ok: true, message: status === "paid" ? "Adisyon telefondan ödendi olarak kapatıldı." : "Adisyon telefondan iptal edildi." };
  }

  private applyAndroidMenuStockAction(
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

    const result = this.mutateMenuStockInTransaction({
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
    this.insertAndroidActionEvent(action, "menu.stock_changed", "menu_item", menuItemId, {
      movement_type: mode,
      quantity_before: result.quantityBefore,
      quantity_after: result.quantityAfter
    }, now);
    return { ok: true, message: "Menü ürünü stoku telefondan güncellendi." };
  }

  private applyAndroidStockImageImport(action: AndroidSyncAction, now: string): AndroidActionMutationResult {
    const importId = normalizeStockImageImportId(androidPayloadString(action.payload, "import_id"));
    const imageHash = androidPayloadString(action.payload, "image_hash").toLowerCase();
    const lines = normalizeStockImageApplyLines(action.payload.lines);
    if (!importId || !isSha256Hex(imageHash) || !lines) {
      return { ok: false, message: "Görsel stok taslağı eksik veya geçersiz." };
    }
    const existing = this.db
      .prepare("SELECT status FROM stock_image_imports WHERE import_id = ?")
      .get(importId) as { status?: string } | undefined;
    if (existing) {
      return {
        ok: false,
        message: existing.status === "applied"
          ? "Bu içe aktarma daha önce uygulanmış."
          : "Bu içe aktarma kimliği daha önce kullanılmış."
      };
    }
    const created = this.createStockImageImport({
      importId,
      source: "android",
      deviceId: action.device_id,
      imageHash
    });
    if (!created.ok) {
      return created;
    }
    this.db
      .prepare("UPDATE stock_image_imports SET status = 'review', raw_analysis_json = ? WHERE import_id = ?")
      .run(JSON.stringify({ lines }), importId);
    const device = this.db
      .prepare("SELECT role FROM android_devices WHERE device_id = ? LIMIT 1")
      .get(action.device_id) as { role?: string } | undefined;
    const result = this.applyStockImageImportInTransaction({
      importId,
      imageHash,
      lines,
      source: "android",
      actorDeviceId: action.device_id,
      duplicateWarningAcknowledged: action.payload.duplicate_warning_acknowledged === true,
      canOverrideDuplicate: normalizeAndroidDeviceRole(device?.role) === "admin",
      now
    });
    if (!result.ok) {
      return result;
    }
    this.insertAndroidActionEvent(action, "menu.stock_image_import_applied", "stock_image_import", importId, {
      image_hash: imageHash,
      applied_line_count: result.appliedLineCount,
      total_quantity: result.totalQuantity
    }, now);
    return { ok: true, message: "Görsel stok girişi telefondan uygulandı." };
  }

  private applyStockImageImportInTransaction(input: {
    importId: string;
    imageHash: string;
    lines: StockImageApplyLine[];
    source: StockImageImportSource;
    actorDeviceId: string;
    duplicateWarningAcknowledged: boolean;
    canOverrideDuplicate: boolean;
    now: string;
  }): { ok: true; message: string; importId: string; appliedLineCount: number; totalQuantity: number } | { ok: false; message: string } {
    const record = this.db
      .prepare("SELECT source, device_id, image_hash, status FROM stock_image_imports WHERE import_id = ? LIMIT 1")
      .get(input.importId) as Record<string, unknown> | undefined;
    if (!record || String(record.image_hash ?? "").toLowerCase() !== input.imageHash || String(record.source ?? "") !== input.source) {
      return { ok: false, message: "Görsel stok taslağı bulunamadı veya değiştirilmiş." };
    }
    if (String(record.status ?? "") === "applied") {
      return { ok: false, message: "Bu içe aktarma daha önce uygulanmış." };
    }
    if (!["analyzing", "review"].includes(String(record.status ?? ""))) {
      return { ok: false, message: "Bu görsel stok taslağı artık uygulanamaz." };
    }
    const lines = normalizeStockImageApplyLines(input.lines);
    if (!lines || lines.length === 0) {
      return { ok: false, message: "Uygulanacak geçerli stok satırı bulunamadı." };
    }
    const duplicate = this.db
      .prepare(`
        SELECT import_id
        FROM stock_image_imports
        WHERE image_hash = ? AND status = 'applied' AND import_id != ?
        LIMIT 1
      `)
      .get(input.imageHash, input.importId);
    if (duplicate && !input.duplicateWarningAcknowledged) {
      return { ok: false, message: "Bu görsel daha önce stok girişinde kullanılmış olabilir." };
    }
    if (duplicate && !input.canOverrideDuplicate) {
      return { ok: false, message: "Bu görseli yeniden uygulamak için yönetici yetkisi gerekli." };
    }

    const candidates = new Map(this.getTrackedStockCandidates().map((candidate) => [candidate.id, candidate]));
    for (const line of lines) {
      if (!candidates.has(line.menu_item_id)) {
        return { ok: false, message: "Satırlardan biri artık mevcut veya stok takipli bir menü ürünü değil." };
      }
    }

    this.db
      .prepare("UPDATE stock_image_import_lines SET status = 'ignored', approved_quantity = NULL WHERE import_id = ?")
      .run(input.importId);
    const insertApprovedLine = this.db.prepare(`
      INSERT INTO stock_image_import_lines (
        id, import_id, raw_text, matched_menu_item_id, suggested_quantity,
        approved_quantity, source_quantity_text, confidence, status, note, created_at
      ) VALUES (?, ?, ?, ?, NULL, ?, NULL, ?, 'approved', NULL, ?)
    `);
    let totalQuantity = 0;
    for (const line of lines) {
      insertApprovedLine.run(
        `stock_image_import_line_${randomUUID()}`,
        input.importId,
        line.raw_text.slice(0, 1000),
        line.menu_item_id,
        line.quantity,
        line.confidence,
        input.now
      );
      const result = this.mutateMenuStockInTransaction({
        menuItemId: line.menu_item_id,
        type: "image_import_add",
        quantityChange: line.quantity,
        sourceType: "stock_image_import",
        sourceId: input.importId,
        actorSource: input.source,
        actorDeviceId: input.actorDeviceId,
        note: line.raw_text.slice(0, 500),
        now: input.now
      });
      if (!result.ok) {
        return result;
      }
      totalQuantity += line.quantity;
    }
    const update = this.db
      .prepare(`
        UPDATE stock_image_imports
        SET status = 'applied', applied_at = ?, error_message = NULL
        WHERE import_id = ? AND status IN ('analyzing', 'review')
      `)
      .run(input.now, input.importId);
    if (Number(update.changes) !== 1) {
      return { ok: false, message: "Görsel stok taslağı uygulanmış olarak kaydedilemedi." };
    }
    this.insertEvent({
      type: "stock.image_import_applied",
      actorType: input.source,
      actorId: input.actorDeviceId,
      entityType: "stock_image_import",
      entityId: input.importId,
      payload: {
        source: input.source,
        line_count: lines.length,
        total_quantity: totalQuantity
      },
      now: input.now
    });
    this.queueSyncJob("menu_publish", input.now);
    this.queueSyncJob("android_snapshot", input.now);
    return {
      ok: true,
      message: `${lines.length} stok satırı güncellendi.`,
      importId: input.importId,
      appliedLineCount: lines.length,
      totalQuantity
    };
  }

  private mutateMenuStockInTransaction(input: {
    menuItemId: string;
    type: MenuStockMovementType;
    quantityChange?: number;
    quantityAfter?: number;
    allowStartTracking?: boolean;
    sourceType: MenuStockSourceType;
    sourceId: string;
    actorSource?: StockImageImportSource;
    actorDeviceId: string;
    note: string;
    now: string;
  }): MenuStockMutationResult {
    const item = this.db
      .prepare("SELECT stock_quantity, stock_consumption_quantity, updated_at FROM menu_items WHERE id = ? AND deleted_at = ''")
      .get(input.menuItemId) as {
        stock_quantity?: number | null;
        stock_consumption_quantity?: number;
        updated_at?: string;
      } | undefined;
    if (!item) {
      return { ok: false, message: "Menü ürünü bulunamadı." };
    }

    const storedQuantity = nullableNumber(item.stock_quantity);
    if (storedQuantity === null && !input.allowStartTracking) {
      if (input.sourceType === "table_order") {
        return {
          ok: true,
          message: "Ürün stok takibinde değil.",
          tracked: false,
          quantityBefore: 0,
          quantityAfter: 0
        };
      }
      return { ok: false, message: "Bu ürün stok takibinde değil." };
    }

    const quantityBefore = storedQuantity ?? 0;
    const stockConsumptionQuantity = normalizePositiveStockNumber(item.stock_consumption_quantity) ?? 1;
    const quantityChange = input.quantityChange === undefined
      ? undefined
      : ["order_add", "order_update", "order_remove"].includes(input.type)
        ? normalizeStockPrecision(input.quantityChange * stockConsumptionQuantity)
        : input.quantityChange;
    const requestedAfter = input.quantityAfter === undefined
      ? quantityBefore + (quantityChange ?? 0)
      : input.quantityAfter;
    const quantityAfter = normalizeNullableStockNumber(requestedAfter);
    if (quantityAfter === null) {
      return {
        ok: false,
        message: input.actorDeviceId ? "Stokta yeterli ürün yok." : "Bu ürün stokta yeterli değil."
      };
    }

    const updatedAt = nextMutationTimestamp(item.updated_at, input.now);
    const update = this.db
      .prepare(`
        UPDATE menu_items
        SET stock_quantity = ?, updated_at = ?, sync_status = 'pending'
        WHERE id = ? AND deleted_at = ''
      `)
      .run(quantityAfter, updatedAt, input.menuItemId);
    if (Number(update.changes) !== 1) {
      return { ok: false, message: "Menü ürünü stoku güncellenemedi." };
    }
    this.insertMenuStockMovementInTransaction({
      menuItemId: input.menuItemId,
      type: input.type,
      quantityChange: quantityAfter - quantityBefore,
      quantityBefore,
      quantityAfter,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      actorSource: input.actorSource,
      actorDeviceId: input.actorDeviceId,
      note: input.note,
      now: input.now
    });
    return {
      ok: true,
      message: "Stok güncellendi.",
      tracked: true,
      quantityBefore,
      quantityAfter
    };
  }

  private restoreCancelledOrderStockInTransaction(
    orderId: string,
    actorDeviceId: string,
    now: string
  ): AndroidActionMutationResult {
    const balances = this.db
      .prepare(`
        SELECT menu_item_id, COALESCE(SUM(quantity_change), 0) AS quantity_balance
        FROM menu_stock_movements
        WHERE source_type = 'table_order'
          AND source_id = ?
          AND type IN ('order_add', 'order_update', 'order_remove')
        GROUP BY menu_item_id
      `)
      .all(orderId) as Array<{ menu_item_id?: string; quantity_balance?: number }>;
    for (const balance of balances) {
      const outstandingQuantity = normalizeStockPrecision(-Number(balance.quantity_balance ?? 0));
      if (outstandingQuantity <= 0) {
        continue;
      }
      const result = this.mutateMenuStockInTransaction({
        menuItemId: String(balance.menu_item_id ?? ""),
        type: "order_cancel",
        quantityChange: outstandingQuantity,
        sourceType: "table_order",
        sourceId: orderId,
        actorDeviceId,
        note: "Adisyon iptal edildi; ayrılan stok geri eklendi.",
        now
      });
      if (!result.ok) {
        return result;
      }
    }
    return { ok: true, message: "İptal edilen adisyonun stoku geri eklendi." };
  }

  private insertMenuStockMovementInTransaction(input: {
    menuItemId: string;
    type: MenuStockMovementType;
    quantityChange: number;
    quantityBefore: number;
    quantityAfter: number;
    sourceType: MenuStockSourceType;
    sourceId: string;
    actorSource?: StockImageImportSource;
    actorDeviceId: string;
    note: string;
    now: string;
  }) {
    this.db
      .prepare(`
        INSERT INTO menu_stock_movements (
          id, menu_item_id, type, quantity_change, quantity_before, quantity_after,
          source_type, source_id, actor_source, actor_device_id, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        `stock_movement_${randomUUID()}`,
        input.menuItemId,
        input.type,
        normalizeStockPrecision(input.quantityChange),
        normalizeStockPrecision(input.quantityBefore),
        normalizeStockPrecision(input.quantityAfter),
        input.sourceType,
        input.sourceId || null,
        input.actorSource ?? (input.actorDeviceId ? "android" : "desktop"),
        input.actorDeviceId || null,
        input.note || null,
        input.now
      );
  }

  private resolveAndroidActiveOrderId(payload: Record<string, unknown>): string {
    const orderId = androidPayloadString(payload, "order_id");
    if (orderId) {
      return this.isActiveTableOrder(orderId) ? orderId : "";
    }
    const tableId = androidPayloadString(payload, "table_id");
    if (!tableId) {
      return "";
    }
    const order = this.db
      .prepare("SELECT id FROM table_orders WHERE table_id = ? AND status IN ('open', 'preparing', 'served', 'payment') LIMIT 1")
      .get(tableId) as { id?: string } | undefined;
    return String(order?.id ?? "");
  }

  private insertAndroidActionEvent(
    action: AndroidSyncAction,
    type: string,
    entityType: string,
    entityId: string,
    payload: Record<string, unknown>,
    now: string
  ) {
    this.insertEvent({
      type,
      entityType,
      entityId,
      payload: { ...payload, android_action_id: action.id },
      now,
      actorType: "android",
      actorId: action.device_id
    });
  }

  private getTableOrderById(orderId: string): DesktopTableOrder | null {
    const row = this.db
      .prepare(`
        SELECT
          table_orders.*,
          tables.name AS table_name,
          COALESCE(SUM(
            CASE
              WHEN table_order_items.status != 'cancelled' THEN table_order_items.quantity
              ELSE 0
            END
          ), 0) AS item_count
        FROM table_orders
        INNER JOIN tables ON tables.id = table_orders.table_id
        LEFT JOIN table_order_items ON table_order_items.order_id = table_orders.id
        WHERE table_orders.id = ?
        GROUP BY table_orders.id
        LIMIT 1
      `)
      .get(orderId) as Record<string, unknown> | undefined;

    return row ? this.mapTableOrderRow(row) : null;
  }

  private mapTableOrderRow(row: Record<string, unknown>): DesktopTableOrder {
    const id = String(row.id ?? "");
    return {
      id,
      tableId: String(row.table_id ?? ""),
      tableName: String(row.table_name ?? "Masa"),
      status: String(row.status ?? "open") as TableOrderStatus,
      openedAt: String(row.opened_at ?? ""),
      closedAt: String(row.closed_at ?? ""),
      subtotal: roundMoney(Number(row.subtotal ?? 0)),
      discountTotal: roundMoney(Number(row.discount_total ?? 0)),
      total: roundMoney(Number(row.total ?? 0)),
      note: String(row.note ?? ""),
      itemCount: Number(row.item_count ?? 0),
      items: this.getTableOrderItems(id),
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? "")
    };
  }

  private getTableOrderItems(orderId: string): DesktopTableOrderItem[] {
    const rows = this.db
      .prepare(`
        SELECT *
        FROM table_order_items
        WHERE order_id = ?
          AND status != 'cancelled'
        ORDER BY created_at ASC, id ASC
      `)
      .all(orderId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id ?? ""),
      orderId: String(row.order_id ?? ""),
      menuItemId: String(row.menu_item_id ?? ""),
      productName: String(row.product_name ?? "Ürün"),
      unitPrice: roundMoney(Number(row.unit_price ?? 0)),
      currency: normalizeTableOrderCurrency(row.currency),
      quantity: Number(row.quantity ?? 0),
      lineTotal: roundMoney(Number(row.line_total ?? 0)),
      note: String(row.note ?? ""),
      status: String(row.status ?? "open") as TableOrderItemStatus,
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? "")
    }));
  }

  private getMutableTableOrderItem(itemId: string): Record<string, unknown> | null {
    if (!itemId) {
      return null;
    }

    const row = this.db
      .prepare(`
        SELECT
          table_order_items.order_id,
          table_order_items.menu_item_id,
          table_order_items.unit_price,
          table_order_items.quantity,
          table_order_items.updated_at
        FROM table_order_items
        INNER JOIN table_orders ON table_orders.id = table_order_items.order_id
        WHERE table_order_items.id = ?
          AND table_order_items.status != 'cancelled'
          AND table_orders.status IN ('open', 'preparing', 'served', 'payment')
        LIMIT 1
      `)
      .get(itemId) as Record<string, unknown> | undefined;

    return row ?? null;
  }

  private findActiveOrderForTables(tableIds: string[]): { id: string; tableId: string } | null {
    const statement = this.db.prepare(`
      SELECT id, table_id
      FROM table_orders
      WHERE table_id = ?
        AND status IN ('open', 'preparing', 'served', 'payment')
      LIMIT 1
    `);
    for (const tableId of tableIds) {
      const row = statement.get(tableId) as { id?: string; table_id?: string } | undefined;
      if (row?.id) {
        return { id: row.id, tableId: String(row.table_id ?? tableId) };
      }
    }
    return null;
  }

  private markPreparedWhatsAppMessagesSentInTransaction(requestId: string, now: string) {
    this.db
      .prepare(`
        UPDATE whatsapp_messages
        SET mode = 'manual_copy',
            status = 'sent',
            sent_at = CASE WHEN sent_at = '' THEN ? ELSE sent_at END,
            updated_at = ?,
            sync_status = 'local_only'
        WHERE request_id = ?
          AND direction = 'outgoing'
          AND status = 'prepared'
          AND deleted_at = ''
      `)
      .run(now, now, requestId);
  }

  private isActiveTableOrder(orderId: string): boolean {
    return Boolean(
      this.db
        .prepare("SELECT id FROM table_orders WHERE id = ? AND status IN ('open', 'preparing', 'served', 'payment')")
        .get(orderId)
    );
  }

  private updateTableStatusForOrderInTransaction(
    tableId: string,
    status: "available" | "occupied" | "bill_waiting",
    orderId: string,
    now: string,
    androidAction?: AndroidSyncAction
  ) {
    if (!tableId) {
      return;
    }

    const table = this.db
      .prepare("SELECT status, current_customer_id, current_reservation_id, updated_at FROM tables WHERE id = ? AND deleted_at = ''")
      .get(tableId) as { status?: string; current_customer_id?: string; current_reservation_id?: string; updated_at?: string } | undefined;
    const shouldClearAssignment = status === "available"
      && (Boolean(String(table?.current_customer_id ?? "")) || Boolean(String(table?.current_reservation_id ?? "")));
    if (!table || (table.status === status && !shouldClearAssignment)) {
      return;
    }
    const updatedAt = nextMutationTimestamp(table.updated_at, now);

    const updateResult = this.db
      .prepare(`
        UPDATE tables
        SET status = ?,
            current_customer_id = CASE WHEN ? = 'available' THEN '' ELSE current_customer_id END,
            current_reservation_id = CASE WHEN ? = 'available' THEN '' ELSE current_reservation_id END,
            updated_at = ?,
            sync_status = 'local_only'
        WHERE id = ? AND deleted_at = ''
      `)
      .run(status, status, status, updatedAt, tableId);
    if (Number(updateResult.changes) !== 1) {
      throw new Error("Table status could not be synchronized with the active order.");
    }
    const payload = {
      old_status: String(table.status ?? ""),
      new_status: status,
      source: "table_order",
      order_id: orderId
    };
    if (androidAction) {
      this.insertAndroidActionEvent(androidAction, "table.status_changed", "table", tableId, payload, now);
    } else {
      this.insertEvent({
        type: "table.status_changed",
        entityType: "table",
        entityId: tableId,
        payload,
        now
      });
    }
  }

  private recalculateTableOrderTotalInTransaction(orderId: string, now: string) {
    const row = this.db
      .prepare(`
        SELECT
          COALESCE(SUM(
            CASE
              WHEN table_order_items.status != 'cancelled' THEN table_order_items.line_total
              ELSE 0
            END
          ), 0) AS subtotal,
          table_orders.discount_total AS discount_total,
          table_orders.updated_at AS updated_at
        FROM table_orders
        LEFT JOIN table_order_items ON table_order_items.order_id = table_orders.id
        WHERE table_orders.id = ?
        GROUP BY table_orders.id
      `)
      .get(orderId) as { subtotal?: number; discount_total?: number; updated_at?: string } | undefined;
    if (!row) {
      throw new Error("Table order not found while recalculating totals.");
    }

    const subtotal = roundMoney(Number(row.subtotal ?? 0));
    const discountTotal = roundMoney(Number(row.discount_total ?? 0));
    const total = roundMoney(Math.max(0, subtotal - discountTotal));
    const updatedAt = nextMutationTimestamp(row.updated_at, now);
    this.db
      .prepare("UPDATE table_orders SET subtotal = ?, total = ?, updated_at = ? WHERE id = ?")
      .run(subtotal, total, updatedAt, orderId);
  }

  private getTableOrderMutationResult(orderId: string, message: string, includeDashboardData = false): DesktopTableOrderResult {
    const order = this.getTableOrderById(orderId);
    return order
      ? {
          ok: true,
          message,
          order,
          ...(includeDashboardData ? { dashboardData: this.getDashboardData() } : {})
        }
      : { ok: false, message: "Adisyon güncellendi ancak yeniden yüklenemedi." };
  }

  private insertEvent(input: {
    type: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
    now: string;
    actorType?: "desktop" | "android";
    actorId?: string;
  }) {
    this.db
      .prepare(`
        INSERT INTO events (
          id,
          type,
          actor_type,
          actor_id,
          entity_type,
          entity_id,
          payload_json,
          created_at,
          updated_at,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'local_only')
      `)
      .run(
        createId("event_"),
        input.type,
        input.actorType ?? "desktop",
        input.actorId ?? "",
        input.entityType,
        input.entityId,
        JSON.stringify(input.payload),
        input.now,
        input.now
      );
  }

  private ensureSyncClientId() {
    // Also initialize this local metadata for databases already marked 001_baseline.sql.
    // Retain any identity issued by that baseline's settings-based initialization.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS desktop_sync_identity (
        id TEXT PRIMARY KEY CHECK (id = 'primary'),
        client_id TEXT NOT NULL UNIQUE CHECK (length(trim(client_id)) > 0)
      );
    `);
    this.db
      .prepare(`
        INSERT INTO desktop_sync_identity (id, client_id)
        VALUES ('primary', COALESCE(
          (SELECT NULLIF(trim(sync_client_id), '') FROM settings WHERE deleted_at = '' LIMIT 1),
          ?
        ))
        ON CONFLICT(id) DO NOTHING
      `)
      .run(`desktop-${randomUUID()}`);
  }

  private readSqlFiles(relativeDir: string) {
    const directory = path.join(this.options.appPath, relativeDir);
    if (!fs.existsSync(directory)) {
      return [];
    }

    return fs
      .readdirSync(directory)
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .map((file) => ({
        name: file,
        sql: fs.readFileSync(path.join(directory, file), "utf8")
      }));
  }
}

function resolveBackupPath(appPath: string): string {
  const override = process.env.YA_DESKTOP_BACKUP_DIR?.trim();
  if (override) return path.resolve(override);
  return path.resolve(appPath, "..", "..", "backup");
}

import {
  normalizeTableCategoryInputs,
  normalizeTableCategoryName,
  tableCategoryKey,
  reconcileTableName,
} from "./database/table-category-utils.js";

import type {
  NormalizedTableCategoryInput,
} from "./database/table-category-utils.js";

import {
  AI_SERVICE_IDS,
  DEFAULT_AI_BASE_URL,
  GOOGLE_AI_STUDIO_BASE_URL,
  DEFAULT_AI_TIMEOUT_SECONDS,
  AI_SERVICE_DEFAULT_BASE_URLS,
  normalizeAiService,
  normalizeStoredAiService,
  getAiServiceDisplayName,
  normalizeAiModelOptions,
  normalizeAiBaseUrl,
  normalizeStoredAiBaseUrl,
  normalizeAiTimeout,
  normalizeStoredAiTimeout,
  normalizeStoredTimestamp,
  normalizePublishedTimestamp,
  resolveEncryptedAiApiKey,
} from "./database/ai-settings-utils.js";

import {
  normalizeCustomerInput,
  normalizeCustomerIdentityType,
  normalizeCustomerGender,
  normalizeLimitedText,
} from "./database/customer-utils.js";

import {
  TABLE_ORDER_STATUSES,
  normalizePrice,
  normalizeStockPrecision,
  normalizeNullableStockNumber,
  normalizePositiveStockNumber,
  normalizeMenuStockUnit,
  normalizeSignedStockNumber,
  nullableNumber,
  nullableTrimmedString,
  normalizeOrderQuantity,
  createTableOrderId,
  normalizeStockImageImportId,
  isSha256Hex,
  sanitizeStockImageAnalysis,
  normalizeStockImageApplyLines,
  roundMoney,
  normalizeCurrency,
  normalizeTableOrderCurrency,
} from "./database/stock-utils.js";

import {
  isAndroidAdminOnlyAction,
  normalizeAndroidDeviceRole,
  effectiveAndroidPermissions,
  createAndroidEntityId,
  androidPayloadString,
  androidPayloadStringArray,
  androidPayloadNumber,
  getAndroidVersionConflict,
  nextMutationTimestamp,
  androidActionRelatedId,
  androidActionResolutionKey,
  androidActionTargetPage,
  normalizeAndroidFailureTargetPage,
  friendlyDesktopActionFailure,
  parseEventPayload,
} from "./database/android-utils.js";

import type {
  AndroidActionMutationResult,
} from "./database/android-utils.js";

import {
  normalizeInteger,
  normalizeBoolean,
  parseAiWorkspacePayload,
  normalizeStringArray,
  normalizeRequestType,
  normalizePriority,
  normalizeDateInput,
  normalizeTimeInput,
  getCustomerTagsForSource,
  buildManualRequestReply,
  normalizeStatus,
  normalizeUrl,
  slugifyBusinessName,
  buildReservationTitle,
  buildReservationNotes,
} from "./database/request-utils.js";

import {
  setAutoSyncEnabled as setStoredAutoSyncEnabled,
  getSyncRuntimeStatus as getStoredSyncRuntimeStatus,
  getPendingSyncJobs as getStoredPendingSyncJobs,
  queueSyncJob as queueStoredSyncJob,
  completeSyncJob as completeStoredSyncJob,
  failSyncJob as failStoredSyncJob,
  recordSyncAttempt as recordStoredSyncAttempt,
  recordAutomaticSyncSuccess as recordStoredAutomaticSyncSuccess,
  recordAutomaticSyncFailure as recordStoredAutomaticSyncFailure,
  acknowledgeRequestCursor as acknowledgeStoredRequestCursor,
} from "./database/sync-runtime-store.js";

import {
  getReportData as getStoredReportData,
  getAndroidReportPresets as getStoredAndroidReportPresets,
} from "./database/report-store.js";

import {
  getAndroidDevices as getStoredAndroidDevices,
  getAndroidPermissionSnapshot as getStoredAndroidPermissionSnapshot,
  upsertAndroidDeviceSightings as upsertStoredAndroidDeviceSightings,
  setAndroidDeviceRole as setStoredAndroidDeviceRole,
  setAndroidDevicePermissionGroups as setStoredAndroidDevicePermissionGroups,
  setAndroidDeviceActive as setStoredAndroidDeviceActive,
  resetAndroidDevicePermissions as resetStoredAndroidDevicePermissions,
  revokeAndroidDevice as revokeStoredAndroidDevice,
} from "./database/android-device-store.js";

import {
  getPublishedMenu as getStoredPublishedMenu,
  getQrMenuPublication as getStoredQrMenuPublication,
  saveMenuCategory as saveStoredMenuCategory,
} from "./database/menu-store.js";
