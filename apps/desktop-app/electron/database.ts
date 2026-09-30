import { DatabaseSync } from "node:sqlite";
import { getHospitalityOperations } from "./database/hospitality-operations-store.js";
import {
  getHospitalityNotifications,
  getKbsOverview,
  markHospitalityNotificationSentExternally,
  retryHospitalityNotification
} from "./database/hospitality-notification-store.js";
import { DesktopRoomFolioService } from "./room-folio.js";
import { KbsDeliveryService } from "./kbs-delivery-service.js";
import type { KbsProviderAdapter } from "./kbs-provider-adapter.js";
import { addStayGuest, changeStayPrimary, checkoutStayGuest, moveStayRoom } from "./stay-guest-service.js";
import type { StayGuestInput, CheckoutStayGuestInput, MoveStayRoomInput } from "./database-types.js";
export type { StayGuestInput, CheckoutStayGuestInput, MoveStayRoomInput } from "./database-types.js";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  BUSINESS_CAPABILITIES,
  CORE_BUSINESS_CAPABILITIES,
  createId,
  expandBusinessCapabilities,
  getBusinessProfile,
  normalizeBirthdaySettings,
  normalizeBusinessType,
  validateBirthdaySettings,
  type BusinessCapability,
  type StockImageAnalysis,
  type StockImageMenuCandidate
} from "@yardimci-asistan/shared";
import type {
  AndroidReportPresetKey,
  AndroidReportSnapshot,
  AndroidDeviceSighting,
  AndroidSnapshotPermissionProfile,
  AndroidSyncAction,
  PublishedQrMenu,
  SyncedCustomerRequest
} from "@yardimci-asistan/sync-core";
import {
  resolveBackupRoot,
  resolveDatabasePath
} from "./data-paths.js";
import { applyAndroidReservationAction } from "./android-reservation-actions.js";
import { applyAndroidDailyTaskAction } from "./android-daily-task-actions.js";
import { applyAndroidFinanceAction } from "./android-finance-actions.js";
import { applyAndroidRoomFolioAction } from "./android-room-folio-actions.js";
import { applyMarketAndroidAction } from "./market-android-actions.js";
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

export type { DesktopBirthdayDelivery, DesktopBirthdayOverview, DesktopBirthdayPrepareResult } from "./birthday-service.js";

import type {
  DesktopDatabaseOptions,
  DesktopPreparedMessage,
  DesktopAndroidDevice,
  DesktopAndroidActionFailure,
  DesktopAndroidPermissionGroupsUpdate,
  DesktopAndroidDeviceMutationResult,
  DesktopDashboardData,
  DesktopHospitalityNotification,
  DesktopKbsOverview,
  DesktopKbsDeliveryMutationResult,
  DesktopReportRangeInput,
  DesktopReportData,
  DesktopAiService,
  DesktopAiModelOption,
  DesktopAiServiceProfile,
  AiApiKeyWrite,
  DesktopSetupData,
  SaveInitialSetupInput,
  DesktopSetupSaveResult,
  SaveMenuCategoryInput,
  SaveMenuItemInput,
  ReorderMenuRecordsInput,
  DesktopMenuStockMovement,
  DesktopMenuSaveResult,
  CreateStockImageImportInput,
  ApplyStockImageImportInput,
  DesktopStockImageApplyResult,
  SaveCustomerInput,
  AssignCustomerRoomInput,
  CreateStayFromReservationInput,
  UpdateCustomerRoomStayStatusInput,
  DesktopCustomerMutationResult,
  RequestReservationConversionResult,
  CreateManualRequestInput,
  CreateManualRequestResult,
  SaveRequestAiSuggestionInput,
  RequestAiSuggestionResult,
  RewriteRequestAiSuggestionInput,
  DailyBusinessEvaluationResult,
  DesktopStatusUpdateResult,
  UpdateRequestStatusInput,
  UpdateRoomStatusInput,
  UpdateTableStatusInput,
  AssignTableCustomerInput,
  DesktopTableOrder,
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
  DesktopReservation,
  DesktopDailyTask,
  DesktopCustomer,
  DesktopPreparedMessage,
  DesktopAndroidDevice,
  DesktopAndroidActionFailure,
  DesktopAndroidPermissionGroupsUpdate,
  DesktopAndroidDeviceMutationResult,
  DesktopDashboardData,
  DesktopHospitalityNotification,
  DesktopKbsOverview,
  DesktopKbsDeliveryMutationResult,
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
  ReorderMenuRecordsInput,
  DesktopMenuStockMovement,
  DesktopMenuSaveResult,
  CreateStockImageImportInput,
  ApplyStockImageImportInput,
  DesktopStockImageAnalyzeInput,
  DesktopStockImageAnalyzeResult,
  DesktopStockImageApplyResult,
  SaveCustomerInput,
  AssignCustomerRoomInput,
  CreateStayFromReservationInput,
  UpdateCustomerRoomStayStatusInput,
  DesktopCustomerMutationResult,
  DesktopIdentityImageAnalyzeInput,
  DesktopIdentityImageAnalyzeResult,
  RequestReservationConversionResult,
  CreateManualRequestInput,
  CreateManualRequestResult,
  SaveRequestAiSuggestionInput,
  RequestAiSuggestionResult,
  RewriteRequestAiSuggestionInput,
  DailyBusinessEvaluationResult,
  DesktopStatusUpdateResult,
  UpdateRequestStatusInput,
  UpdateRoomStatusInput,
  UpdateTableStatusInput,
  AssignTableCustomerInput,
  TableOrderStatus,
  DesktopTableOrder,
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

interface ReplaceStoredBusinessCapabilitiesInput {
  businessId: string;
  profileId: string;
  selectedOptionalCapabilities: BusinessCapability[];
  whatsappEnabled: boolean;
  androidEnabled: boolean;
  aiEnabled: boolean;
  now: string;
}

function replaceStoredBusinessCapabilities(
  db: DatabaseSync,
  input: ReplaceStoredBusinessCapabilitiesInput
) {
  const profile = getBusinessProfile(input.profileId);
  const allowedOptional = new Set(profile.optionalCapabilities);
  const selectedOptional = [...new Set(input.selectedOptionalCapabilities)]
    .filter((capability) => allowedOptional.has(capability));
  const serviceCapabilities: BusinessCapability[] = [
    ...(input.whatsappEnabled ? [BUSINESS_CAPABILITIES.WHATSAPP] : []),
    ...(input.androidEnabled ? [BUSINESS_CAPABILITIES.ANDROID] : []),
    ...(input.aiEnabled ? [BUSINESS_CAPABILITIES.AI] : [])
  ];
  const enabled = new Set(expandBusinessCapabilities([
    ...CORE_BUSINESS_CAPABILITIES,
    ...profile.requiredCapabilities,
    ...selectedOptional,
    ...serviceCapabilities
  ]));
  const systemCapabilities = new Set(CORE_BUSINESS_CAPABILITIES);
  const userCapabilities = new Set<BusinessCapability>([
    ...selectedOptional,
    ...serviceCapabilities
  ]);

  const statement = db.prepare(`
    INSERT INTO business_capabilities (
      business_id, capability_id, is_enabled, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(business_id, capability_id) DO UPDATE SET
      is_enabled = excluded.is_enabled,
      source = excluded.source,
      updated_at = excluded.updated_at
  `);

  for (const capability of Object.values(BUSINESS_CAPABILITIES)) {
    const source = systemCapabilities.has(capability)
      ? "system"
      : userCapabilities.has(capability)
        ? "user"
        : "profile";
    statement.run(
      input.businessId,
      capability,
      enabled.has(capability) ? 1 : 0,
      source,
      input.now,
      input.now
    );
  }
}

// Main and short-lived service facades publish into the same renderer stream.
let dashboardRevision = 0;

export class DesktopDatabase {
  private readonly db: DatabaseSync;
  readonly databasePath: string;
  readonly userDataPath: string;
  readonly backupPath: string;

  constructor(private readonly options: DesktopDatabaseOptions) {
    const dataRoot = options.dataRoot ?? options.userDataPath;
    fs.mkdirSync(dataRoot, { recursive: true });
    this.userDataPath = dataRoot;
    this.backupPath = options.backupPath
      ? path.resolve(options.backupPath)
      : resolveBackupRoot({ isPackaged: false, appPath: options.appPath });
    fs.mkdirSync(this.backupPath, { recursive: true });
    this.databasePath = resolveDatabasePath(dataRoot);
    this.db = new DatabaseSync(this.databasePath);
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
  }

  initialize() {
    const schemaPath = path.join(this.options.appPath, "db", "schema.sql");
    if (!fs.existsSync(schemaPath)) {
      throw new Error("Güncel masaüstü veritabanı şeması bulunamadı.");
    }
    const schemaSql = fs.readFileSync(schemaPath, "utf8");

    // Serialize first-schema creation and local identity creation across connections.
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existingDomainObject = this.db
        .prepare(`
          SELECT 1
          FROM sqlite_master
          WHERE name NOT LIKE 'sqlite_%'
            AND type IN ('table', 'index', 'view', 'trigger')
          LIMIT 1
        `)
        .get();

      if (!existingDomainObject) {
        this.db.exec(schemaSql);
      }

      // Install the current guest model from its canonical schema, once. Existing
      // stays retain their known primary guest; unnamed occupants are never invented.
      if (!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'stay_guests'").get()) {
        const guestSchema = schemaSql.split("-- BEGIN HOSPITALITY GUEST SCHEMA")[1]?.split("-- END HOSPITALITY GUEST SCHEMA")[0];
        if (!guestSchema) throw new Error("Konaklama misafir şeması bulunamadı.");
        this.db.exec(guestSchema);
        this.db.exec(`INSERT INTO stay_guests (id, stay_id, customer_id, status, checked_in_at, checked_out_at, created_at, updated_at)
          SELECT 'guest_' || id, id, customer_id, status, checked_in_at, checked_out_at, created_at, updated_at
          FROM customer_room_stays WHERE deleted_at = '';
          INSERT INTO stay_room_history (id, stay_id, room_id, entered_at, left_at)
          SELECT 'room_' || id, id, room_id, checked_in_at, checked_out_at FROM customer_room_stays
          WHERE deleted_at = '' AND checked_in_at != '';`);
      }

      const requiredTables = ["android_local_credentials", "desktop_sync_identity", "settings"];
      for (const tableName of requiredTables) {
        const present = this.db.prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
        ).get(tableName);
        if (!present) {
          throw new Error("Veritabanı güncel masaüstü şemasını taşımıyor; temiz veri sıfırlaması gerekli.");
        }
      }

      const settingsColumns = this.db.prepare("PRAGMA table_info(settings)").all() as Array<{ name?: string }>;
      const settingsColumnNames = new Set(settingsColumns.map((column) => String(column.name ?? "")));
      for (const columnName of [
        "local_network_enabled",
        "ai_service",
        "ai_last_published_at",
        "google_reviews_enabled",
        "google_place_id",
        "google_places_api_key_encrypted",
        "google_reviews_last_published_at",
        "google_reviews_publish_pending",
        "product_data_enabled"
      ]) {
        if (!settingsColumnNames.has(columnName)) {
          throw new Error("Veritabanı güncel masaüstü şemasını taşımıyor; temiz veri sıfırlaması gerekli.");
        }
      }

      const businessColumns = this.db.prepare("PRAGMA table_info(business)").all() as Array<{ name?: string }>;
      const businessColumnNames = new Set(businessColumns.map((column) => String(column.name ?? "")));
      for (const columnName of [
        "publish_rooms_web",
        "publish_tables_web"
      ]) {
        if (!businessColumnNames.has(columnName)) {
          throw new Error("Veritabanı güncel masaüstü şemasını taşımıyor; temiz veri sıfırlaması gerekli.");
        }
      }

      const tableColumns = this.db.prepare("PRAGMA table_info(tables)").all() as Array<{ name?: string }>;
      const tableColumnNames = new Set(tableColumns.map((column) => String(column.name ?? "")));
      for (const columnName of [
        "public_description",
        "public_features_json",
        "smoking_policy"
      ]) {
        if (!tableColumnNames.has(columnName)) {
          throw new Error("Veritabanı güncel masaüstü şemasını taşımıyor; temiz veri sıfırlaması gerekli.");
        }
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
    const enabledCapabilities = new Set(this.getEnabledBusinessCapabilities());
    const requests = getRequests(this.db);
    const preparedWhatsAppMessages = getStoredPreparedWhatsAppMessages(this.db, requests);
    const rooms = getStoredRooms(this.db, getStoredActiveResourceReservationTitles(this.db, "room"));
    const tables = getStoredTables(this.db, getStoredActiveResourceReservationTitles(this.db, "table"));

    return {
      revision: ++dashboardRevision,
      ...getHospitalityOperations(this.db, rooms, tables, enabledCapabilities),
      databasePath: this.databasePath,
      backupPath: this.backupPath,
      webModuleUrl: settings?.web_module_url ?? "https://yardimciasistan.alwaysdata.net/yardimci-asistan",
      requests,
      preparedWhatsAppMessages,
      rooms,
      tables,
      reservations: getStoredReservations(this.db),
      dailyTasks: getStoredDailyTasks(this.db),
      customers: getStoredCustomers(this.db),
      customerRoomStays: getStoredCustomerRoomStays(this.db),
      hospitalityNotifications: getHospitalityNotifications(this.db),
      kbsOverview: getKbsOverview(this.db),
      androidDevices: this.getAndroidDevices(),
      paymentWaitingTableOrders: listPaymentWaitingTableOrders(this.db),
      androidActionFailures: this.getAndroidActionFailures(),
      attention: getOperationalAttention(this.db, enabledCapabilities),
      birthdayOverview: readBirthdayOverview(this.db),
      summary: {
        newRequests: this.getScalarCount("SELECT COUNT(*) as count FROM requests WHERE status = 'new' AND deleted_at = ''"),
        waitingRequests: this.getScalarCount("SELECT COUNT(*) as count FROM requests WHERE status IN ('new', 'seen', 'waiting_owner', 'pending', 'in_progress') AND deleted_at = ''"),
        pendingDailyTasks: this.getScalarCount("SELECT COUNT(*) as count FROM daily_tasks WHERE status = 'pending' AND deleted_at = ''"),
        availableRooms: this.getScalarCount("SELECT COUNT(*) as count FROM rooms WHERE status = 'available' AND is_active = 1 AND deleted_at = ''"),
        totalRooms: this.getScalarCount("SELECT COUNT(*) as count FROM rooms WHERE is_active = 1 AND deleted_at = ''"),
        availableTables: this.getScalarCount("SELECT COUNT(*) as count FROM tables WHERE status = 'available' AND is_active = 1 AND deleted_at = ''"),
        pendingReservations: this.getScalarCount("SELECT COUNT(*) as count FROM reservations WHERE status = 'pending' AND deleted_at = ''"),
        preparedWhatsAppMessages: preparedWhatsAppMessages.length,
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

  registerPendingLocalAndroidDevice(sighting: AndroidDeviceSighting): boolean {
    return registerStoredPendingLocalAndroidDevice(this.db, sighting);
  }

  storeAndroidLocalCredential(deviceId: string, token: string): boolean {
    return storeStoredAndroidLocalCredential(this.db, deviceId, token);
  }

  authorizeAndroidLocalCredential(deviceId: string, token: string): boolean {
    return authorizeStoredAndroidLocalCredential(this.db, deviceId, token);
  }

  setAndroidDeviceRole(deviceIdInput: string, roleInput: string): DesktopAndroidDeviceMutationResult {
    return setStoredAndroidDeviceRole(this.db, deviceIdInput, roleInput, new Set(this.getEnabledBusinessCapabilities()));
  }

  setAndroidDevicePermissionGroups(deviceIdInput: string, groupsInput: unknown): DesktopAndroidDeviceMutationResult {
    return setStoredAndroidDevicePermissionGroups(this.db, deviceIdInput, groupsInput, new Set(this.getEnabledBusinessCapabilities()));
  }

  setAndroidDevicePermissionGroupsBatch(updates: DesktopAndroidPermissionGroupsUpdate[]): DesktopAndroidDeviceMutationResult {
    return setStoredAndroidDevicePermissionGroupsBatch(this.db, updates, new Set(this.getEnabledBusinessCapabilities()));
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
  getPreparedWhatsAppMessages(): DesktopPreparedMessage[] {
    return getStoredPreparedWhatsAppMessages(this.db, getRequests(this.db));
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

  markKbsNotificationSentExternally(notificationId: string): DesktopStatusUpdateResult {
    const overview = getKbsOverview(this.db);
    if (!overview.enabled) return { ok: false, message: "Kimlik Bildirim Sistemi etkin değil." };
    const result = markHospitalityNotificationSentExternally(this.db, notificationId, overview.provider);
    if (!result.ok) return result;
    return { ...result, dashboardData: this.getDashboardData() };
  }

  retryKbsNotification(notificationId: string): DesktopStatusUpdateResult {
    const result = retryHospitalityNotification(this.db, notificationId);
    if (!result.ok) return result;
    return { ...result, dashboardData: this.getDashboardData() };
  }

  async deliverKbsNotification(
    notificationId: string,
    adapters: readonly KbsProviderAdapter[]
  ): Promise<DesktopKbsDeliveryMutationResult> {
    const overview = getKbsOverview(this.db);
    const dashboardData = this.getDashboardData();
    if (!overview.enabled) {
      return {
        ok: false,
        state: "waiting",
        provider: overview.provider,
        retryable: true,
        code: "kbs_disabled",
        message: "Kimlik Bildirim Sistemi etkin değil.",
        dashboardData
      };
    }
    if (!overview.configured) {
      return {
        ok: false,
        state: "waiting",
        provider: overview.provider,
        retryable: true,
        code: "kbs_not_configured",
        message: "KBS bağlantı ayarları tamamlanmadan bildirim gönderilemez.",
        dashboardData
      };
    }
    const adapter = adapters.find((candidate) => candidate.provider === overview.provider);
    if (!adapter) {
      return {
        ok: false,
        state: "waiting",
        provider: overview.provider,
        retryable: true,
        code: "provider_adapter_unavailable",
        message: "Seçili KBS sağlayıcısı için gönderim adapterı hazır değil.",
        dashboardData
      };
    }
    const service = new KbsDeliveryService(this.db, [adapter]);
    const result = await service.deliver(notificationId, overview.provider);
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
    return this.completeStayEntry(() => assignStoredCustomerToRoom(this.db, input), input.status === "checked_in", input);
  }

  createStayFromReservation(input: CreateStayFromReservationInput): DesktopCustomerMutationResult {
    return this.completeStayEntry(() => createStoredStayFromReservation(this.db, input), input.status === "checked_in", input);
  }

  /** Explicit arrival coordinates the enabled financial account in the same transaction. */
  checkInStay(stayId: string): DesktopCustomerMutationResult {
    return this.completeStayEntry(() => updateStoredCustomerRoomStayStatus(this.db, { stayId, status: "checked_in" }), true);
  }

  private completeStayEntry(operation: () => Omit<Extract<DesktopCustomerMutationResult, { ok: true }>, "dashboardData"> | Extract<DesktopCustomerMutationResult, { ok: false }>,
    checkIn: boolean, input?: AssignCustomerRoomInput | CreateStayFromReservationInput): DesktopCustomerMutationResult {
    let result: ReturnType<typeof operation>;
    this.db.exec("SAVEPOINT hospitality_entry");
    try {
      const receipt = input?.requestId ? this.db.prepare("SELECT stay_id, input_json FROM hospitality_entry_receipts WHERE request_id = ?").get(input.requestId) as { stay_id: string; input_json: string } | undefined : undefined;
      if (receipt && receipt.input_json !== JSON.stringify(input)) result = { ok: false, message: "Giriş isteği değişti; yeni işlem başlatın." };
      else if (receipt) result = { ok: true, savedId: receipt.stay_id, message: "Bu giriş daha önce tamamlandı." };
      else {
        result = operation();
        if (result.ok && checkIn && this.getEnabledBusinessCapabilities().includes(BUSINESS_CAPABILITIES.ACCOMMODATION_FOLIO)) {
          const folio = new DesktopRoomFolioService(this.databasePath).openFolio(result.savedId, this.db);
          if (!folio.ok) result = folio;
        }
        if (result.ok && input?.requestId) this.db.prepare("INSERT INTO hospitality_entry_receipts (request_id, input_json, stay_id) VALUES (?, ?, ?)")
          .run(input.requestId, JSON.stringify(input), result.savedId);
      }
      if (!result.ok) this.db.exec("ROLLBACK TO hospitality_entry");
      this.db.exec("RELEASE hospitality_entry");
    } catch {
      this.db.exec("ROLLBACK TO hospitality_entry; RELEASE hospitality_entry");
      return { ok: false, message: "Giriş tamamlanamadı; konaklama, misafir ve hesap değişiklikleri geri alındı." };
    }
    return result.ok ? { ...result, dashboardData: this.getDashboardData() } : result;
  }

  addStayGuest(input: StayGuestInput): DesktopCustomerMutationResult {
    const result = addStayGuest(this.db, input);
    return result.ok ? { ...result, dashboardData: this.getDashboardData() } : result;
  }

  changeStayPrimary(input: StayGuestInput): DesktopCustomerMutationResult {
    const result = changeStayPrimary(this.db, input);
    return result.ok ? { ...result, dashboardData: this.getDashboardData() } : result;
  }

  checkoutStayGuest(input: CheckoutStayGuestInput): DesktopCustomerMutationResult {
    const result = checkoutStayGuest(this.db, input);
    return result.ok ? { ...result, dashboardData: this.getDashboardData() } : result;
  }

  moveStayRoom(input: MoveStayRoomInput): DesktopCustomerMutationResult {
    const result = moveStayRoom(this.db, input);
    return result.ok ? { ...result, dashboardData: this.getDashboardData() } : result;
  }

  checkoutStay(stayId: string): DesktopCustomerMutationResult {
    return this.updateCustomerRoomStayStatus({ stayId, status: "checked_out" });
  }

  updateCustomerRoomStayStatus(input: UpdateCustomerRoomStayStatusInput): DesktopCustomerMutationResult {
    if (input.status === "checked_in") return this.checkInStay(input.stayId);
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

  assignTableCustomer(input: AssignTableCustomerInput): DesktopStatusUpdateResult {
    const result = assignStoredTableCustomer(this.db, input);
    if (!result.ok) return result;
    return { ...result, dashboardData: this.getDashboardData() };
  }

  listTableOrders(): DesktopTableOrder[] {
    return listStoredTableOrders(this.db);
  }


  getActiveTableOrder(tableId: string): DesktopTableOrder | null {
    return getStoredActiveTableOrder(this.db, tableId);
  }

  openTableOrder(tableId: string): DesktopTableOrderResult {
    const result = openStoredTableOrder(this.db, tableId);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  addTableOrderItem(input: AddTableOrderItemInput): DesktopTableOrderResult {
    const result = addStoredTableOrderItem(this.db, input);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  updateTableOrderItemQuantity(input: UpdateTableOrderItemQuantityInput): DesktopTableOrderResult {
    const result = updateStoredTableOrderItemQuantity(this.db, input);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  updateTableOrderItemNote(input: UpdateTableOrderItemNoteInput): DesktopTableOrderResult {
    return updateStoredTableOrderItemNote(this.db, input);
  }

  removeTableOrderItem(itemId: string): DesktopTableOrderResult {
    const result = removeStoredTableOrderItem(this.db, itemId);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  updateTableOrderStatus(input: UpdateTableOrderStatusInput): DesktopTableOrderResult {
    const result = updateStoredTableOrderStatus(this.db, input);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  closeTableOrder(input: UpdateTableOrderStatusInput): DesktopTableOrderResult {
    const result = closeStoredTableOrder(this.db, input);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
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
    const rawAiApiKeyProvided = Boolean(String(input.aiApiKey ?? "").trim());
    const existingSettings = this.db.prepare("SELECT * FROM settings WHERE deleted_at = '' LIMIT 1").get() as Record<string, unknown> | undefined;
    const productDataSettings = {
      enabled: input.productData?.enabled ?? Number(existingSettings?.product_data_enabled ?? 0) === 1,
      provider: "open_food_facts" as const,
      autoSearchUnknownBarcode: input.productData?.autoSearchUnknownBarcode
        ?? Number(existingSettings?.product_data_auto_search ?? 1) === 1,
      includeImages: input.productData?.includeImages
        ?? Number(existingSettings?.product_data_include_images ?? 1) === 1
    };
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
    const existingEncryptedAiApiKey = String(existingAiProfile?.api_key_encrypted ?? "").trim();
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

    if (input.birthdaySettings) {
      const birthdaySettingsError = validateBirthdaySettings(input.birthdaySettings);
      if (birthdaySettingsError) {
        return { ok: false, message: birthdaySettingsError };
      }
    }

    if (input.servicePreferences.whatsapp && !input.whatsapp.trim()) {
      return {
        ok: false,
        message: "WhatsApp servisi açıkken WhatsApp numarası gerekli."
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
      !existingAiProfile ||
      aiWasEnabled !== input.aiEnabled ||
      String(existingSettings.ai_provider ?? "") !== storedAiProvider ||
      String(existingSettings.ai_service ?? "") !== storedAiService ||
      String(existingAiProfile.project_name ?? "").trim() !== aiProjectName ||
      String(existingAiProfile.model ?? "").trim() !== aiModel ||
      (normalizeAiBaseUrl(existingAiProfile.base_url) || AI_SERVICE_DEFAULT_BASE_URLS[storedAiService]) !== storedAiBaseUrl ||
      normalizeStoredAiTimeout(existingAiProfile.timeout_seconds) !== storedAiTimeoutSeconds ||
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
            ai_service,
            ai_last_published_at,
            whatsapp_mode,
            birthday_enabled,
            birthday_mode,
            birthday_send_time,
            birthday_message_template,
            product_data_enabled,
            product_data_provider,
            product_data_auto_search,
            product_data_include_images,
            setup_completed,
            created_at,
            updated_at,
            sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'webview', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'local_only')
          ON CONFLICT(id) DO UPDATE SET
            business_id = excluded.business_id,
            web_module_url = excluded.web_module_url,
            sync_secret = excluded.sync_secret,
            auto_sync_enabled = excluded.auto_sync_enabled,
            ai_provider = excluded.ai_provider,
            ai_service = excluded.ai_service,
            ai_last_published_at = excluded.ai_last_published_at,
            birthday_enabled = excluded.birthday_enabled,
            birthday_mode = excluded.birthday_mode,
            birthday_send_time = excluded.birthday_send_time,
            birthday_message_template = excluded.birthday_message_template,
            product_data_enabled = excluded.product_data_enabled,
            product_data_provider = excluded.product_data_provider,
            product_data_auto_search = excluded.product_data_auto_search,
            product_data_include_images = excluded.product_data_include_images,
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
          storedAiService,
          aiLastPublishedAt,
          birthdaySettings.enabled ? 1 : 0,
          birthdaySettings.mode,
          birthdaySettings.sendTime,
          birthdaySettings.messageTemplate,
          productDataSettings.enabled ? 1 : 0,
          productDataSettings.provider,
          productDataSettings.autoSearchUnknownBarcode ? 1 : 0,
          productDataSettings.includeImages ? 1 : 0,
          settingsCreatedAt,
          now
        );

      this.db.prepare(
        "UPDATE settings SET local_network_enabled = ?, updated_at = ? WHERE id = ?"
      ).run(input.localNetworkEnabled === false ? 0 : 1, now, settingsId);

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

      replaceStoredBusinessCapabilities(this.db, {
        businessId,
        profileId: input.profileId,
        selectedOptionalCapabilities: input.profileOptions
          ?? getBusinessProfile(input.profileId).defaultOptionalCapabilities,
        whatsappEnabled: input.servicePreferences.whatsapp,
        androidEnabled: input.servicePreferences.android,
        aiEnabled: input.aiEnabled,
        now
      });

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
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
        const customerId = ensureStoredCustomerForRequest(this.db, request as unknown as Record<string, unknown>, new Date().toISOString());
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
    const result = createStoredManualRequest(this.db, input, this.getEnabledBusinessCapabilities());
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
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

  convertRequestToReservation(requestId: string): RequestReservationConversionResult {
    const result = convertStoredRequestToReservation(this.db, requestId, this.getEnabledBusinessCapabilities());
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
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

  reorderMenuRecords(input: ReorderMenuRecordsInput): DesktopStatusUpdateResult {
    const result = reorderStoredMenuRecords(this.db, input);
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
        return applyStoredAndroidRequestConversion(this.db, action, now, this.getEnabledBusinessCapabilities());
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
        return applyStoredAndroidTableOrderOpen(this.db, action, now);
      case "table_order_add_item":
        return applyStoredAndroidTableOrderAddItem(this.db, action, now);
      case "table_order_update_item_quantity":
        return applyStoredAndroidTableOrderItemQuantity(this.db, action, now);
      case "table_order_remove_item":
        return applyStoredAndroidTableOrderRemoveItem(this.db, action, now);
      case "table_order_set_preparing":
        return applyStoredAndroidTableOrderStatus(this.db, action, now, "preparing");
      case "table_order_set_served":
        return applyStoredAndroidTableOrderStatus(this.db, action, now, "served");
      case "table_order_set_payment_waiting":
        return applyStoredAndroidTableOrderStatus(this.db, action, now, "payment");
      case "table_order_close_paid":
        return applyStoredAndroidTableOrderClose(this.db, action, now, "paid");
      case "table_order_cancel":
        return applyStoredAndroidTableOrderClose(this.db, action, now, "cancelled");
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
      case "market_product_create":
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
    if (this.db.prepare("SELECT 1 FROM room_folios WHERE customer_id = ? AND deleted_at = '' AND status = 'open'").get(customerId)) {
      return { ok: false, message: "Bu müşterinin açık konaklama hesabı var; önce hesabı sonuçlandırın." };
    }
    if (this.db.prepare("SELECT 1 FROM reservations WHERE customer_id = ? AND status IN ('pending', 'approved') AND deleted_at = '' LIMIT 1").get(customerId)) {
      return { ok: false, message: "Bu müşterinin aktif rezervasyonu var; önce rezervasyonu tamamlayın veya iptal edin." };
    }
    const activeStay = this.db
      .prepare(`
        SELECT customer_room_stays.id, rooms.name AS room_name
        FROM customer_room_stays
        JOIN rooms ON rooms.id = customer_room_stays.room_id
        WHERE EXISTS (SELECT 1 FROM stay_guests g WHERE g.stay_id = customer_room_stays.id AND g.customer_id = ? AND g.status IN ('planned', 'checked_in'))
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












  private ensureSyncClientId() {
    this.db
      .prepare(`
        INSERT INTO desktop_sync_identity (id, client_id)
        VALUES ('primary', ?)
        ON CONFLICT(id) DO NOTHING
      `)
      .run(`desktop-${randomUUID()}`);
  }

}

import {
  DEFAULT_AI_BASE_URL,
  GOOGLE_AI_STUDIO_BASE_URL,
  DEFAULT_AI_TIMEOUT_SECONDS,
  AI_SERVICE_DEFAULT_BASE_URLS,
  normalizeAiService,
  normalizeStoredAiService,
  getAiServiceDisplayName,
  normalizeAiModelOptions,
  normalizeAiBaseUrl,
  normalizeAiTimeout,
  normalizeStoredAiTimeout,
  normalizeStoredTimestamp,
  resolveEncryptedAiApiKey,
} from "./database/ai-settings-utils.js";

import {
  normalizeStockImageImportId,
  isSha256Hex,
  normalizeStockImageApplyLines,
} from "./database/stock-utils.js";

import {
  normalizeAndroidDeviceRole,
  androidPayloadString,
  getAndroidVersionConflict,
  nextMutationTimestamp,
} from "./database/android-utils.js";

import type {
  AndroidActionMutationResult,
} from "./database/android-utils.js";

import {
  normalizeInteger,
  normalizeBoolean,
  normalizeStatus,
  normalizeUrl,
  slugifyBusinessName,
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

import { getOperationalAttention } from "./database/operational-attention.js";

import {
  getAndroidDevices as getStoredAndroidDevices,
  getAndroidPermissionSnapshot as getStoredAndroidPermissionSnapshot,
  upsertAndroidDeviceSightings as upsertStoredAndroidDeviceSightings,
  setAndroidDeviceRole as setStoredAndroidDeviceRole,
  setAndroidDevicePermissionGroups as setStoredAndroidDevicePermissionGroups,
  setAndroidDevicePermissionGroupsBatch as setStoredAndroidDevicePermissionGroupsBatch,
  setAndroidDeviceActive as setStoredAndroidDeviceActive,
  resetAndroidDevicePermissions as resetStoredAndroidDevicePermissions,
  revokeAndroidDevice as revokeStoredAndroidDevice,
} from "./database/android-device-store.js";

import {
  authorizeAndroidLocalCredential as authorizeStoredAndroidLocalCredential,
  registerPendingLocalAndroidDevice as registerStoredPendingLocalAndroidDevice,
  storeAndroidLocalCredential as storeStoredAndroidLocalCredential,
} from "./database/android-local-credential-store.js";

import {
  getPublishedMenu as getStoredPublishedMenu,
  getQrMenuPublication as getStoredQrMenuPublication,
  saveMenuCategory as saveStoredMenuCategory,
  reorderMenuRecords as reorderStoredMenuRecords,
  deleteMenuCategoryInTransaction as deleteStoredMenuCategoryInTransaction,
  deleteMenuItemInTransaction as deleteStoredMenuItemInTransaction,
} from "./database/menu-store.js";

import {
  getMenuStockMovements as getStoredMenuStockMovements,
  saveMenuItem as saveStoredMenuItem,
} from "./database/menu-stock-store.js";

import {
  listTableOrders as listStoredTableOrders,
  getActiveTableOrder as getStoredActiveTableOrder,
  recalculateTableOrderTotal as recalculateStoredTableOrderTotal,
  listPaymentWaitingTableOrders,
} from "./database/table-order-store.js";

import {
  openTableOrder as openStoredTableOrder,
  addTableOrderItem as addStoredTableOrderItem,
  updateTableOrderItemQuantity as updateStoredTableOrderItemQuantity,
  updateTableOrderItemNote as updateStoredTableOrderItemNote,
  removeTableOrderItem as removeStoredTableOrderItem,
  updateTableOrderStatus as updateStoredTableOrderStatus,
  closeTableOrder as closeStoredTableOrder,
} from "./table-order-service.js";

import {
  applyAndroidTableOrderOpen as applyStoredAndroidTableOrderOpen,
  applyAndroidTableOrderAddItem as applyStoredAndroidTableOrderAddItem,
  applyAndroidTableOrderItemQuantity as applyStoredAndroidTableOrderItemQuantity,
  applyAndroidTableOrderRemoveItem as applyStoredAndroidTableOrderRemoveItem,
  applyAndroidTableOrderStatus as applyStoredAndroidTableOrderStatus,
  applyAndroidTableOrderClose as applyStoredAndroidTableOrderClose,
} from "./android-table-order-actions.js";

import { insertDatabaseEvent } from "./database/event-store.js";

import {
  getRequests,
  getRequestById as getStoredRequestById,
  updateRequestStatus as updateStoredRequestStatus,
  saveRequestAiSuggestion as saveStoredRequestAiSuggestion,
  deleteRequestInTransaction as deleteStoredRequestInTransaction,
} from "./database/request-store.js";

import {
  markWhatsAppMessageSent as markStoredWhatsAppMessageSent,
  getPreparedWhatsAppMessages as getStoredPreparedWhatsAppMessages,
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
} from "./database/customer-room-stay-store.js";

import {
  getAiServiceProfiles as getStoredAiServiceProfiles,
  getEncryptedAiApiKey as getStoredEncryptedAiApiKey,
  markAiSettingsPublished as markStoredAiSettingsPublished,
  upsertAiServiceProfileInTransaction as upsertStoredAiServiceProfileInTransaction,
} from "./database/ai-profile-store.js";

import {
  getRooms as getStoredRooms,
  updateRoomStatus as updateStoredRoomStatus,
} from "./database/room-store.js";

import {
  getTables as getStoredTables,
  updateTableStatus as updateStoredTableStatus,
  assignTableCustomer as assignStoredTableCustomer,
} from "./database/table-store.js";

import {
  assignCustomerToRoom as assignStoredCustomerToRoom,
  createStayFromReservation as createStoredStayFromReservation,
  updateCustomerRoomStayStatus as updateStoredCustomerRoomStayStatus,
  saveManualReservation as saveStoredManualReservation,
  updateReservationStatus as updateStoredReservationStatus,
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
  applyAndroidRequestConversion as applyStoredAndroidRequestConversion,
  insertAndroidActionEvent as insertStoredAndroidActionEvent,
} from "./android-action-service.js";

import {
  ensureCustomerForRequest as ensureStoredCustomerForRequest,
  createManualRequest as createStoredManualRequest,
  convertRequestToReservation as convertStoredRequestToReservation,
} from "./request-intake-service.js";

import {
  getSetupData as getStoredSetupData,
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
