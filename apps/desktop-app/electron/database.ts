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
      requests: getRequests(this.db),
      rooms: getStoredRooms(this.db, getStoredActiveResourceReservationTitles(this.db, "room")),
      tables: getStoredTables(this.db, getStoredActiveResourceReservationTitles(this.db, "table")),
      reservations: getStoredReservations(this.db),
      dailyTasks: getStoredDailyTasks(this.db),
      customers: getStoredCustomers(this.db),
      customerRoomStays: getStoredCustomerRoomStays(this.db),
      androidDevices: this.getAndroidDevices(),
      paymentWaitingTableOrders: listPaymentWaitingTableOrders(this.db),
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
    return getStoredAndroidPreparedMessages(this.db, getRequests(this.db));
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
    const result = saveStoredDailyTask(this.db, input);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  deleteDailyTask(taskIdInput: string): DesktopStatusUpdateResult {
    const result = deleteStoredDailyTask(this.db, taskIdInput);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  updateDailyTaskStatus(input: UpdateDailyTaskStatusInput): DesktopStatusUpdateResult {
    const result = updateStoredDailyTaskStatus(this.db, input);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  updateRequestStatus(input: UpdateRequestStatusInput): DesktopStatusUpdateResult {
    const result = updateStoredRequestStatus(this.db, input);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  deleteRequest(requestIdInput: string): DesktopStatusUpdateResult {
    const requestId = requestIdInput.trim();
    if (!requestId) {
      return { ok: false, message: "Silinecek talep seçilmeli." };
    }
    const result = runStoredDesktopDeletion(
      this.db,
      () => deleteStoredRequestInTransaction(this.db, requestId, new Date().toISOString()),
      "Talep silindi."
    );
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  deleteCustomer(customerIdInput: string): DesktopStatusUpdateResult {
    const customerId = customerIdInput.trim();
    if (!customerId) {
      return { ok: false, message: "Silinecek müşteri seçilmeli." };
    }
    const result = runStoredDesktopDeletion(
      this.db,
      () => this.deleteCustomerInTransaction(customerId, new Date().toISOString()),
      "Müşteri silindi; talep ve rezervasyon geçmişi korundu."
    );
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  saveCustomer(input: SaveCustomerInput): DesktopCustomerMutationResult {
    const result = saveStoredCustomer(this.db, input);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  assignCustomerToRoom(input: AssignCustomerRoomInput): DesktopCustomerMutationResult {
    const result = assignStoredCustomerToRoom(this.db, input);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  updateCustomerRoomStayStatus(input: UpdateCustomerRoomStayStatusInput): DesktopCustomerMutationResult {
    const result = updateStoredCustomerRoomStayStatus(this.db, input);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  deleteMenuCategory(categoryIdInput: string): DesktopStatusUpdateResult {
    const categoryId = categoryIdInput.trim();
    if (!categoryId) {
      return { ok: false, message: "Silinecek kategori seçilmeli." };
    }
    const result = runStoredDesktopDeletion(
      this.db,
      () => deleteStoredMenuCategoryInTransaction(this.db, categoryId, new Date().toISOString()),
      "Kategori ve içindeki ürünler silindi."
    );
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  deleteMenuItem(itemIdInput: string): DesktopStatusUpdateResult {
    const itemId = itemIdInput.trim();
    if (!itemId) {
      return { ok: false, message: "Silinecek ürün seçilmeli." };
    }
    const result = runStoredDesktopDeletion(
      this.db,
      () => deleteStoredMenuItemInTransaction(this.db, itemId, new Date().toISOString()),
      "Ürün silindi."
    );
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  deleteWhatsAppMessage(input: DeleteWhatsAppMessageInput): DesktopStatusUpdateResult {
    const messageId = String(input?.messageId ?? "").trim();
    const requestId = String(input?.requestId ?? "").trim();
    if (!messageId && !requestId) {
      return { ok: false, message: "Silinecek mesaj seçilmeli." };
    }
    const result = runStoredDesktopDeletion(
      this.db,
      () => deleteStoredMessageInTransaction(this.db, messageId, requestId, new Date().toISOString()),
      "Hazır mesaj silindi."
    );
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  markWhatsAppMessageSent(input: MarkWhatsAppMessageSentInput): DesktopStatusUpdateResult {
    const result = markStoredWhatsAppMessageSent(this.db, input);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
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
    updateStoredRoomStatus(this.db, roomId, status, String(room.status ?? ""), now);

    return {
      ok: true,
      message: "Oda durumu güncellendi.",
      dashboardData: this.getDashboardData()
    };
  }

  updateTableStatus(input: UpdateTableStatusInput): DesktopStatusUpdateResult {
    const result = updateStoredTableStatus(this.db, input);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  listTableOrders(): DesktopTableOrder[] {
    return listStoredTableOrders(this.db);
  }


  getActiveTableOrder(tableId: string): DesktopTableOrder | null {
    return getStoredActiveTableOrder(this.db, tableId);
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
      insertDatabaseEvent(this.db, {
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

    const order = getTableOrderById(this.db, id);
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
      if (!isActiveTableOrder(this.db, orderId)) {
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
        const stockResult = mutateStoredMenuStock(this.db, {
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
        const stockResult = mutateStoredMenuStock(this.db, {
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
      recalculateTableOrderTotalInTransaction(this.db, orderId, now);
      insertDatabaseEvent(this.db, {
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

    const mutationResult = getTableOrderMutationResult(this.db, orderId, "Ürün adisyona eklendi.");
    if (!mutationResult.ok) {
      return mutationResult;
    }
    return { ...mutationResult, dashboardData: this.getDashboardData() };
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
      const item = getMutableTableOrderItem(this.db, itemId);
      if (!item) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Güncellenecek aktif sipariş satırı bulunamadı." };
      }
      orderId = String(item.order_id);
      const previousQuantity = Number(item.quantity ?? 0);
      if (quantity !== previousQuantity) {
        const stockResult = mutateStoredMenuStock(this.db, {
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
      recalculateTableOrderTotalInTransaction(this.db, orderId, now);
      insertDatabaseEvent(this.db, {
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

    const mutationResult = getTableOrderMutationResult(this.db, orderId, "Ürün adedi güncellendi.");
    if (!mutationResult.ok) {
      return mutationResult;
    }
    return { ...mutationResult, dashboardData: this.getDashboardData() };
  }

  updateTableOrderItemNote(input: UpdateTableOrderItemNoteInput): DesktopTableOrderResult {
    const itemId = input.itemId.trim();
    const note = String(input.note ?? "").trim().slice(0, 500);
    const now = new Date().toISOString();
    let orderId = "";
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const item = getMutableTableOrderItem(this.db, itemId);
      if (!item) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Not eklenecek aktif sipariş satırı bulunamadı." };
      }
      orderId = String(item.order_id);
      const updatedAt = nextMutationTimestamp(item.updated_at, now);
      this.db.prepare("UPDATE table_order_items SET note = ?, updated_at = ? WHERE id = ?").run(note, updatedAt, itemId);
      this.db.prepare("UPDATE table_orders SET updated_at = ? WHERE id = ?").run(now, orderId);
      insertDatabaseEvent(this.db, {
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
    return getTableOrderMutationResult(this.db, orderId, "Ürün notu kaydedildi.");
  }

  removeTableOrderItem(itemId: string): DesktopTableOrderResult {
    const normalizedItemId = itemId.trim();
    const now = new Date().toISOString();
    let orderId = "";
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const item = getMutableTableOrderItem(this.db, normalizedItemId);
      if (!item) {
        this.db.exec("ROLLBACK");
        return { ok: false, message: "Silinecek aktif sipariş satırı bulunamadı." };
      }
      orderId = String(item.order_id);
      const stockResult = mutateStoredMenuStock(this.db, {
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
      recalculateTableOrderTotalInTransaction(this.db, orderId, now);
      insertDatabaseEvent(this.db, {
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

    const mutationResult = getTableOrderMutationResult(this.db, orderId, "Ürün adisyondan kaldırıldı.");
    if (!mutationResult.ok) {
      return mutationResult;
    }
    return { ...mutationResult, dashboardData: this.getDashboardData() };
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
      insertDatabaseEvent(this.db, {
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

    const mutationResult = getTableOrderMutationResult(this.db, orderId, "Adisyon durumu güncellendi.");
    if (!mutationResult.ok) {
      return mutationResult;
    }
    return { ...mutationResult, dashboardData: this.getDashboardData() };
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
        const stockRestore = restoreCancelledOrderStockInTransaction(this.db, orderId, "", now);
        if (!stockRestore.ok) {
          this.db.exec("ROLLBACK");
          return stockRestore;
        }
      }
      recalculateTableOrderTotalInTransaction(this.db, orderId, now);
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
      insertDatabaseEvent(this.db, {
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

    const mutationResult = getTableOrderMutationResult(
      this.db,
      orderId,
      status === "paid" ? "Adisyon ödendi olarak kapatıldı." : "Adisyon iptal edildi."
    );
    if (!mutationResult.ok) {
      return mutationResult;
    }
    return { ...mutationResult, dashboardData: this.getDashboardData() };
  }

  recalculateTableOrderTotal(orderId: string): DesktopTableOrderResult {
    return recalculateStoredTableOrderTotal(this.db, orderId);
  }

  saveManualRestaurantReservation(input: SaveManualRestaurantReservationInput): DesktopStatusUpdateResult {
    const result = saveStoredManualRestaurantReservation(this.db, input);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  saveManualReservation(input: SaveManualReservationInput): DesktopStatusUpdateResult {
    const result = saveStoredManualReservation(this.db, input);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  updateReservationStatus(input: UpdateReservationStatusInput): DesktopStatusUpdateResult {
    const result = updateStoredReservationStatus(this.db, input);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  getSetupData(): DesktopSetupData {
    return getStoredSetupData(this.db, new Set(this.getEnabledBusinessCapabilities()));
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
    return getStoredAiServiceProfiles(this.db);
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
    return getStoredEncryptedAiApiKey(this.db, service);
  }

  markAiSettingsPublished(timestamp: string): DesktopSetupData {
    markStoredAiSettingsPublished(this.db, timestamp);
    return getStoredSetupData(this.db, new Set(this.getEnabledBusinessCapabilities()));
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

      upsertStoredAiServiceProfileInTransaction(this.db, {
        service: storedAiService,
        projectName: aiProjectName,
        baseUrl: storedAiBaseUrl,
        model: aiModel,
        modelOptionsJson: JSON.stringify(storedAiModelOptions),
        timeoutSeconds: storedAiTimeoutSeconds,
        apiKeyEncrypted: storedEncryptedAiApiKey,
        createdAt: String(existingAiProfile?.created_at ?? "") || now,
        now
      });

      for (const profile of additionalAiProfiles) {
        upsertStoredAiServiceProfileInTransaction(this.db, {
          service: profile.service,
          projectName: profile.projectName,
          baseUrl: profile.baseUrl,
          model: profile.model,
          modelOptionsJson: JSON.stringify(profile.modelOptions),
          timeoutSeconds: profile.timeoutSeconds,
          apiKeyEncrypted: profile.encryptedApiKey,
          createdAt: profile.createdAt || now,
          now
        });
      }

      ensureStoredInitialRooms(this.db, normalizeInteger(input.initialCounts.rooms), now);
      if (tableCategoryResolution.categories) {
        reconcileStoredTableCategories(this.db, tableCategoryResolution.categories, now, this.getProtectedTableIds());
      } else {
        ensureStoredInitialTables(this.db, normalizeInteger(input.initialCounts.tables), now);
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
      setupData: getStoredSetupData(this.db, new Set(this.getEnabledBusinessCapabilities())),
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
    return getStoredMenuStockMovements(this.db, menuItemId);
  }

  getTrackedStockCandidates(): StockImageMenuCandidate[] {
    return getStoredTrackedStockCandidates(this.db);
  }

  getAppliedStockImageHashes(limit = 100): string[] {
    return getStoredAppliedStockImageHashes(this.db, limit);
  }

  createStockImageImport(input: CreateStockImageImportInput): { ok: true; duplicateWarning: boolean } | { ok: false; message: string } {
    return createStoredStockImageImport(this.db, input);
  }

  completeStockImageAnalysis(importIdValue: string, analysis: StockImageAnalysis): StockImageAnalysis | null {
    return completeStoredStockImageAnalysis(this.db, importIdValue, analysis);
  }

  failStockImageImport(importIdValue: string, message: string, cancelled = false): void {
    failStoredStockImageImport(this.db, importIdValue, message, cancelled);
  }

  applyStockImageImport(input: ApplyStockImageImportInput): DesktopStockImageApplyResult {
    const result = applyStoredStockImageImport(this.db, input);
    if (!result.ok) {
      return result;
    }
    return {
      ...result,
      dashboardData: this.getDashboardData()
    };
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

      insertDatabaseEvent(this.db, {
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
    return getStoredRequestById(this.db, requestId);
  }

  saveRequestAiSuggestion(input: SaveRequestAiSuggestionInput): RequestAiSuggestionResult {
    const result = saveStoredRequestAiSuggestion(this.db, input);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  saveAiWorkspaceHistory(input: Omit<AiWorkspaceHistoryEntry, "id" | "createdAt">): AiWorkspaceHistoryEntry {
    return saveStoredAiWorkspaceHistory(this.db, input);
  }

  getAiWorkspaceHistory(limit = 12): AiWorkspaceHistoryEntry[] {
    return getStoredAiWorkspaceHistory(this.db, limit);
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
    insertDatabaseEvent(this.db, {
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

      insertDatabaseEvent(this.db, {
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
      insertDatabaseEvent(this.db, {
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
    insertDatabaseEvent(this.db, {
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
    insertDatabaseEvent(this.db, {
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
    recordStoredAndroidActionResult(this.db, action, result);
  }

  getAndroidActionFailures(): DesktopAndroidActionFailure[] {
    return getStoredAndroidActionFailures(this.db);
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
    const result = saveStoredMenuItem(this.db, input);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  close() {
    this.db.close();
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
    return authorizeStoredAndroidAction(this.db, action, this.getEnabledBusinessCapabilities());
  }

  private applyAndroidActionInTransaction(action: AndroidSyncAction, now: string): AndroidActionMutationResult {
    switch (action.action_type) {
      case "customer_request_mark_answered":
        return applyStoredAndroidRequestStatus(this.db, action, "answered", now, this.getEnabledBusinessCapabilities());
      case "customer_request_reopen":
        return applyStoredAndroidRequestStatus(this.db, action, "new", now, this.getEnabledBusinessCapabilities());
      case "customer_request_approve":
        return applyStoredAndroidRequestStatus(this.db, action, "approved", now, this.getEnabledBusinessCapabilities());
      case "customer_request_reject":
        return applyStoredAndroidRequestStatus(this.db, action, "rejected", now, this.getEnabledBusinessCapabilities());
      case "customer_request_convert_to_reservation":
        return this.applyAndroidRequestConversion(action, now);
      case "customer_request_delete":
        return deleteStoredRequestInTransaction(
          this.db,
          androidPayloadString(action.payload, "request_id"),
          now,
          action,
          (sinkAction, type, entityType, entityId, payload, eventNow) =>
            this.insertAndroidActionEvent(sinkAction, type, entityType, entityId, payload, eventNow)
        );
      case "customer_create":
        return applyStoredAndroidCustomerSave(this.db, action, now, false);
      case "customer_update":
        return applyStoredAndroidCustomerSave(this.db, action, now, true);
      case "customer_delete":
        return this.deleteCustomerInTransaction(androidPayloadString(action.payload, "customer_id"), now, action);
      case "customer_room_assign":
        return applyStoredAndroidCustomerRoomAssignment(this.db, action, now);
      case "customer_room_stay_status":
        return applyStoredAndroidCustomerRoomStayStatus(this.db, action, now);
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
        return applyStoredAndroidReservationStatus(this.db, action, "approved", now);
      case "reservation_reject":
        return applyStoredAndroidReservationStatus(this.db, action, "rejected", now);
      case "reservation_cancel":
        return applyStoredAndroidReservationStatus(this.db, action, "cancelled", now);
      case "room_status_update":
        return applyStoredAndroidRoomStatus(this.db, action, now);
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
        return applyStoredAndroidDailyTaskStatus(this.db, action, "done", now);
      case "daily_task_reopen":
        return applyStoredAndroidDailyTaskStatus(this.db, action, "pending", now);
      case "daily_task_cancel":
        return applyStoredAndroidDailyTaskStatus(this.db, action, "cancelled", now);
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
        return deleteStoredMenuCategoryInTransaction(
          this.db,
          androidPayloadString(action.payload, "category_id"),
          now,
          action,
          (sinkAction, type, entityType, entityId, payload, eventNow) =>
            this.insertAndroidActionEvent(sinkAction, type, entityType, entityId, payload, eventNow)
        );
      case "menu_item_delete":
        return deleteStoredMenuItemInTransaction(
          this.db,
          androidPayloadString(action.payload, "menu_item_id"),
          now,
          action,
          (sinkAction, type, entityType, entityId, payload, eventNow) =>
            this.insertAndroidActionEvent(sinkAction, type, entityType, entityId, payload, eventNow)
        );
      case "message_delete":
        return deleteStoredMessageInTransaction(
          this.db,
          androidPayloadString(action.payload, "message_id"),
          androidPayloadString(action.payload, "request_id"),
          now,
          action,
          (sinkAction, type, entityType, entityId, payload, eventNow) =>
            this.insertAndroidActionEvent(sinkAction, type, entityType, entityId, payload, eventNow)
        );
      case "menu_stock_add":
        return applyStoredAndroidMenuStockAction(this.db, action, "add", now);
      case "menu_stock_set":
        return applyStoredAndroidMenuStockAction(this.db, action, "set", now);
      case "menu_stock_adjust":
        return applyStoredAndroidMenuStockAction(this.db, action, "adjust", now);
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
    insertStoredDeletionEvent(this.db, androidAction, (sinkAction, type, entityType, entityId, payload, eventNow) =>
      this.insertAndroidActionEvent(sinkAction, type, entityType, entityId, payload, eventNow), "customer.deleted", "customer", customerId, {
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
      orderId = resolveAndroidActiveOrderId(this.db, action.payload);
    } else if (dependencyActionId) {
      const dependencyReceipt = this.db
        .prepare("SELECT action_type FROM android_action_receipts WHERE id = ?")
        .get(dependencyActionId) as { action_type?: string } | undefined;
      const dependentOrderId = createAndroidEntityId("table_order_", dependencyActionId);
      if (dependencyReceipt?.action_type !== "table_order_open" || !isActiveTableOrder(this.db, dependentOrderId)) {
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
      const stockResult = mutateStoredMenuStock(this.db, {
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
      const stockResult = mutateStoredMenuStock(this.db, {
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
    recalculateTableOrderTotalInTransaction(this.db, orderId, now);
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
    const item = getMutableTableOrderItem(this.db, itemId);
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
      const stockResult = mutateStoredMenuStock(this.db, {
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
    recalculateTableOrderTotalInTransaction(this.db, orderId, now);
    this.insertAndroidActionEvent(action, "table_order.item_quantity_changed", "table_order", orderId, {
      item_id: itemId,
      quantity
    }, now);
    return { ok: true, message: "Ürün adedi telefondan güncellendi." };
  }

  private applyAndroidTableOrderRemoveItem(action: AndroidSyncAction, now: string): AndroidActionMutationResult {
    const itemId = androidPayloadString(action.payload, "item_id");
    const item = getMutableTableOrderItem(this.db, itemId);
    if (!item) {
      return { ok: false, message: "Silinecek aktif sipariş satırı bulunamadı." };
    }
    const versionConflict = getAndroidVersionConflict(action.payload, "expected_item_updated_at", item.updated_at, "Sipariş satırı");
    if (versionConflict) {
      return versionConflict;
    }
    const updatedAt = nextMutationTimestamp(item.updated_at, now);
    const orderId = String(item.order_id ?? "");
    const stockResult = mutateStoredMenuStock(this.db, {
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
    recalculateTableOrderTotalInTransaction(this.db, orderId, now);
    this.insertAndroidActionEvent(action, "table_order.item_removed", "table_order", orderId, { item_id: itemId }, now);
    return { ok: true, message: "Ürün telefondan adisyondan kaldırıldı." };
  }

  private applyAndroidTableOrderStatus(
    action: AndroidSyncAction,
    now: string,
    forcedStatus?: "preparing" | "served" | "payment"
  ): AndroidActionMutationResult {
    const orderId = resolveAndroidActiveOrderId(this.db, action.payload);
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
    const orderId = resolveAndroidActiveOrderId(this.db, action.payload);
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
      const stockRestore = restoreCancelledOrderStockInTransaction(this.db, orderId, action.device_id, now);
      if (!stockRestore.ok) {
        return stockRestore;
      }
    }
    recalculateTableOrderTotalInTransaction(this.db, orderId, now);
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
    const created = createStoredStockImageImport(this.db, {
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
    const result = applyStoredStockImageImportInTransaction(this.db, {
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

  private insertAndroidActionEvent(
    action: AndroidSyncAction,
    type: string,
    entityType: string,
    entityId: string,
    payload: Record<string, unknown>,
    now: string
  ) {
    insertStoredAndroidActionEvent(this.db, action, type, entityType, entityId, payload, now);
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
      insertDatabaseEvent(this.db, {
        type: "table.status_changed",
        entityType: "table",
        entityId: tableId,
        payload,
        now
      });
    }
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
  normalizeNullableStockNumber,
  normalizePositiveStockNumber,
  normalizeMenuStockUnit,
  normalizeSignedStockNumber,
  nullableTrimmedString,
  normalizeOrderQuantity,
  createTableOrderId,
  normalizeStockImageImportId,
  isSha256Hex,
  sanitizeStockImageAnalysis,
  normalizeStockImageApplyLines,
  roundMoney,
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
  deleteMenuCategoryInTransaction as deleteStoredMenuCategoryInTransaction,
  deleteMenuItemInTransaction as deleteStoredMenuItemInTransaction,
} from "./database/menu-store.js";

import {
  getMenuStockMovements as getStoredMenuStockMovements,
  saveMenuItem as saveStoredMenuItem,
  mutateMenuStockInTransaction as mutateStoredMenuStock,
} from "./database/menu-stock-store.js";

import {
  listTableOrders as listStoredTableOrders,
  getActiveTableOrder as getStoredActiveTableOrder,
  recalculateTableOrderTotal as recalculateStoredTableOrderTotal,
  listPaymentWaitingTableOrders,
  getTableOrderById,
  mapTableOrderRow,
  getTableOrderItems,
  getMutableTableOrderItem,
  findActiveOrderForTables,
  isActiveTableOrder,
  recalculateTableOrderTotalInTransaction,
  getTableOrderMutationResult,
  restoreCancelledOrderStockInTransaction,
  resolveAndroidActiveOrderId,
} from "./database/table-order-store.js";

import { insertDatabaseEvent } from "./database/event-store.js";

import {
  getRequests,
  getRequestById as getStoredRequestById,
  updateRequestStatus as updateStoredRequestStatus,
  saveRequestAiSuggestion as saveStoredRequestAiSuggestion,
  deleteRequestInTransaction as deleteStoredRequestInTransaction,
} from "./database/request-store.js";

import {
  markPreparedWhatsAppMessagesSentInTransaction,
  markWhatsAppMessageSent as markStoredWhatsAppMessageSent,
  getAndroidPreparedMessages as getStoredAndroidPreparedMessages,
  deleteMessageInTransaction as deleteStoredMessageInTransaction,
} from "./database/prepared-message-store.js";

import {
  getDailyTasks as getStoredDailyTasks,
  saveDailyTask as saveStoredDailyTask,
  deleteDailyTask as deleteStoredDailyTask,
  updateDailyTaskStatus as updateStoredDailyTaskStatus,
} from "./database/daily-task-store.js";

import {
  getReservations as getStoredReservations,
  getActiveResourceReservationTitles as getStoredActiveResourceReservationTitles,
  saveManualRestaurantReservation as saveStoredManualRestaurantReservation,
  findConflictingRoomReservation as findStoredConflictingRoomReservation,
} from "./database/reservation-store.js";

import {
  runDesktopDeletion as runStoredDesktopDeletion,
  insertDeletionEvent as insertStoredDeletionEvent,
} from "./database/deletion-store.js";

import {
  getCustomers as getStoredCustomers,
  saveCustomer as saveStoredCustomer,
} from "./database/customer-store.js";

import {
  getCustomerRoomStays as getStoredCustomerRoomStays,
  hasOverlappingCustomerRoomStay as hasStoredOverlappingCustomerRoomStay,
} from "./database/customer-room-stay-store.js";

import {
  getAiServiceProfiles as getStoredAiServiceProfiles,
  getEncryptedAiApiKey as getStoredEncryptedAiApiKey,
  markAiSettingsPublished as markStoredAiSettingsPublished,
  upsertAiServiceProfileInTransaction as upsertStoredAiServiceProfileInTransaction,
} from "./database/ai-profile-store.js";

import {
  saveAiWorkspaceHistory as saveStoredAiWorkspaceHistory,
  getAiWorkspaceHistory as getStoredAiWorkspaceHistory,
} from "./database/ai-workspace-store.js";

import {
  getRooms as getStoredRooms,
  updateRoomStatus as updateStoredRoomStatus,
} from "./database/room-store.js";

import {
  getTables as getStoredTables,
  updateTableStatus as updateStoredTableStatus,
} from "./database/table-store.js";

import {
  assignCustomerToRoom as assignStoredCustomerToRoom,
  updateCustomerRoomStayStatus as updateStoredCustomerRoomStayStatus,
  saveManualReservation as saveStoredManualReservation,
  updateReservationStatus as updateStoredReservationStatus,
  refreshRoomStatusFromStays as refreshStoredRoomStatusFromStays,
  enforceActiveStayRoomStatus as enforceStoredActiveStayRoomStatus,
} from "./stay-reservation-service.js";

import {
  authorizeAndroidAction as authorizeStoredAndroidAction,
  recordAndroidActionResult as recordStoredAndroidActionResult,
  getAndroidActionFailures as getStoredAndroidActionFailures,
  applyAndroidRequestStatus as applyStoredAndroidRequestStatus,
  applyAndroidCustomerSave as applyStoredAndroidCustomerSave,
  applyAndroidDailyTaskStatus as applyStoredAndroidDailyTaskStatus,
  applyAndroidMenuStockAction as applyStoredAndroidMenuStockAction,
  applyAndroidCustomerRoomAssignment as applyStoredAndroidCustomerRoomAssignment,
  applyAndroidCustomerRoomStayStatus as applyStoredAndroidCustomerRoomStayStatus,
  applyAndroidReservationStatus as applyStoredAndroidReservationStatus,
  applyAndroidRoomStatus as applyStoredAndroidRoomStatus,
  insertAndroidActionEvent as insertStoredAndroidActionEvent,
} from "./android-action-service.js";

import {
  getSetupData as getStoredSetupData,
  ensureInitialRooms as ensureStoredInitialRooms,
  ensureInitialTables as ensureStoredInitialTables,
  reconcileTableCategories as reconcileStoredTableCategories,
} from "./setup-service.js";

import {
  getTrackedStockCandidates as getStoredTrackedStockCandidates,
  getAppliedStockImageHashes as getStoredAppliedStockImageHashes,
  createStockImageImport as createStoredStockImageImport,
  completeStockImageAnalysis as completeStoredStockImageAnalysis,
  failStockImageImport as failStoredStockImageImport,
  applyStockImageImport as applyStoredStockImageImport,
  applyStockImageImportInTransaction as applyStoredStockImageImportInTransaction,
} from "./database/stock-image-store.js";
