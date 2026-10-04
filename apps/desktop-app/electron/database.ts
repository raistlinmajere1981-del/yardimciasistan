import { getRuntimeOrder, applyRuntimeShipmentProviderResult } from "./commerce-runtime";
import type { ShipmentProviderResultInput } from "./commerce-shipment-store";
import { getShipmentRegistration, prepareShipmentRegistration, markShipmentRegistrationSubmitted, type ShipmentRegistration } from "./shipping-registration-store";
import { getArasShippingConfiguration, getStoredArasShippingConfiguration, type ShippingSecretWrite } from "./shipping-configuration-store";
import { getDealerWebAccess, changeDealerWebAccess, createDealerAccessProjection } from "./dealer-web-access-store";
import type { DealerAccessAction } from "@yardimci-asistan/shared";
import { createCommerceOnlineCatalog } from "./commerce-online-catalog-publication";
import { getCommerceProductPublication, listCommerceProductPublications, saveCommerceProductPublication, deleteCommerceProductPublication } from "./commerce-product-publication-store";
import { hasBusinessCapability, type SaveCommerceProductPublicationInput } from "@yardimci-asistan/shared";
import { listRuntimeShipmentsForOrder, getRuntimeShipment, createRuntimeShipmentForOrder, updateRuntimeShipmentStatus, createRuntimeOrder } from "./commerce-runtime";
import type { CreateCommerceOrderInput } from "./commerce-order-store";
import { DatabaseSync } from "node:sqlite";
import {
  getKbsOverview,
  markHospitalityNotificationSentExternally,
  retryHospitalityNotification
} from "./database/hospitality-notification-store.js";
import { DesktopRoomFolioService } from "./room-folio.js";
import { KbsDeliveryService } from "./kbs-delivery-service.js";
import { updateRoomStatusWithStayGuard } from "./room-status-service.js";
import { createDesktopDashboardData } from "./desktop-dashboard-service.js";
import type { KbsProviderAdapter } from "./kbs-provider-adapter.js";
import { addStayGuest, changeStayPrimary, checkoutStayGuest, moveStayRoom } from "./stay-guest-service.js";
import type { StayGuestInput, CheckoutStayGuestInput, MoveStayRoomInput } from "./database-types.js";
export type { StayGuestInput, CheckoutStayGuestInput, MoveStayRoomInput } from "./database-types.js";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  BUSINESS_CAPABILITIES,
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
import { assertCurrentDesktopSchema } from "./desktop-database-compatibility.js";
import { applyAndroidActionTransaction } from "./android-action-application-service.js";
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
  UpdateTableOrderDiscountInput,
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
  DesktopKbsDeliveryMutationResult,
  DesktopReportPreset,
  DesktopReportRangeInput,
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
  UpdateTableOrderDiscountInput,
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

// Main and short-lived service facades publish into the same renderer stream.

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

      assertCurrentDesktopSchema(this.db, schemaSql);

      this.ensureSyncClientId();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getEnabledBusinessCapabilities(): BusinessCapability[] {
    return readEnabledBusinessCapabilities(this.db);
  }

  getDashboardData(): DesktopDashboardData {
    return createDesktopDashboardData(
      this.db,
      this.databasePath,
      this.backupPath
    );
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
    return applyAndroidActionTransaction(
      this.db,
      action,
      this.getEnabledBusinessCapabilities()
    );
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
      () => deleteStoredCustomerInTransaction(this.db, customerId, new Date().toISOString()),
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
    const result = updateRoomStatusWithStayGuard(this.db, input);
    if (!result.ok) {
      return result;
    }
    return {
      ...result,
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

  updateTableOrderDiscount(input: UpdateTableOrderDiscountInput): DesktopTableOrderResult {
    const result = updateStoredTableOrderDiscount(this.db, input);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
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

  private assertProductPublicationCapability() {
    if (!hasBusinessCapability(this.getEnabledBusinessCapabilities(), BUSINESS_CAPABILITIES.ONLINE_SALES)) {
      throw new Error("Online satış bu işletmede etkin değil.");
    }
  }

  getCommerceProductPublication(productId: string) {
    this.assertProductPublicationCapability();
    return getCommerceProductPublication(this.db, productId);
  }

  listCommerceProductPublications() {
    this.assertProductPublicationCapability();
    return listCommerceProductPublications(this.db);
  }

  saveCommerceProductPublication(input: SaveCommerceProductPublicationInput) {
    this.assertProductPublicationCapability();
    return saveCommerceProductPublication(this.db, input);
  }

  deleteCommerceProductPublication(productId: string) {
    this.assertProductPublicationCapability();
    deleteCommerceProductPublication(this.db, productId);
  }

  invalidateRestoredDealerAccess() {
    this.db.prepare(`UPDATE commerce_dealer_web_access SET enabled = 0, access_revision = MAX(access_revision + 1, ?),
      invite_hash = '', invite_issued_at = '', invite_expires_at = '', revoked_at = ?, updated_at = ?`)
      .run(Date.now(), new Date().toISOString(), new Date().toISOString());
  }

  getDealerWebAccess(customerId: string) {
    this.assertWholesaleAccess();
    return getDealerWebAccess(this.db, customerId);
  }

  changeDealerWebAccess(customerId: string, action: DealerAccessAction) {
    this.assertWholesaleAccess();
    return changeDealerWebAccess(this.db, customerId, action);
  }

  private assertWholesaleAccess() {
    if (!hasBusinessCapability(this.getEnabledBusinessCapabilities(), BUSINESS_CAPABILITIES.WHOLESALE)) {
      throw new Error("Bayi / Toptan Satış bu işletmede etkin değil.");
    }
  }

  createDealerAccessProjection() {
    return createDealerAccessProjection(this.db);
  }

  createCommerceOnlineCatalog() {
    return createCommerceOnlineCatalog(this.db, this.getEnabledBusinessCapabilities());
  }

  getCommerceOrder(orderId: string) { return getRuntimeOrder(this.databasePath, orderId); }
  getShipmentRegistration(shipmentId: string) {
    if (!this.getShipment(shipmentId)) throw new Error("Gönderi bulunamadı.");
    return getShipmentRegistration(this.db, shipmentId);
  }
  prepareShipmentRegistration(input: Omit<ShipmentRegistration, "state">) {
    const shipment = this.getShipment(input.shipmentId);
    if (!shipment || !["draft", "ready"].includes(shipment.status)) throw new Error("Yalnız taslak veya hazır gönderi sağlayıcıya kaydedilebilir.");
    return prepareShipmentRegistration(this.db, input);
  }
  markShipmentRegistrationSubmitted(shipmentId: string) {
    const shipment = this.getShipment(shipmentId);
    if (!shipment || !["draft", "ready"].includes(shipment.status) || this.getCommerceOrder(shipment.orderId)?.order.status === "cancelled") return false;
    return markShipmentRegistrationSubmitted(this.db, shipmentId);
  }
  applyShipmentProviderResult(input: ShipmentProviderResultInput) { return applyRuntimeShipmentProviderResult(this.databasePath, input); }

  getArasShippingConfiguration() { return getArasShippingConfiguration(this.db); }
  getEncryptedShippingPassword() { return String(getStoredArasShippingConfiguration(this.db)?.password_encrypted ?? ""); }

  listShipmentsForOrder(orderId: string) { return listRuntimeShipmentsForOrder(this.databasePath, orderId); }
  getShipment(shipmentId: string) { return getRuntimeShipment(this.databasePath, shipmentId); }
  createShipmentForOrder(orderId: string) { return createRuntimeShipmentForOrder(this.databasePath, orderId); }
  updateShipmentStatus(input: import("@yardimci-asistan/shared").UpdateCommerceShipmentStatusInput) {
    return updateRuntimeShipmentStatus(this.databasePath, input);
  }

  createCommerceOrder(input: CreateCommerceOrderInput) {
    return createRuntimeOrder(this.databasePath, input);
  }

  recordWebOrderCursor(cursor: number, acknowledged = false) {
    recordStoredWebOrderCursor(this.db, cursor, acknowledged);
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
    aiProfileApiKeyWrites: Partial<Record<DesktopAiService, AiApiKeyWrite>> = {},
    shippingSecretWrite: ShippingSecretWrite = { mode: "keep" }
  ): DesktopSetupSaveResult {
    const result = saveStoredSetupData(
      this.db,
      input,
      aiApiKeyWrite,
      aiProfileApiKeyWrites,
      shippingSecretWrite
    );
    if (!result.ok) return result;
    return {
      ...result,
      dashboardData: this.getDashboardData()
    };
  }

  getPublishedMenu(): PublishedQrMenu {
    return getStoredPublishedMenu(this.db);
  }

  getDeletedRequestIds(): string[] {
    return getStoredDeletedRequestIds(this.db);
  }

  getQrMenuPublication(): PublishedQrMenu & { enabled: boolean } {
    return getStoredQrMenuPublication(this.db);
  }

  getQrMenuWebPublicationEnabled(): boolean {
    return getStoredQrMenuWebPublicationEnabled(this.db);
  }

  setQrMenuWebPublicationEnabled(enabled: boolean): void {
    setStoredQrMenuWebPublicationEnabled(this.db, enabled);
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
    upsertSyncedRequests(this.db, requests, nextCursor);
  }

  markLocalRequestsSynced(requestIds: string[]) {
    markStoredLocalRequestsSynced(this.db, requestIds);
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
  setAutoSyncEnabled as setStoredAutoSyncEnabled,
  getSyncRuntimeStatus as getStoredSyncRuntimeStatus,
  getPendingSyncJobs as getStoredPendingSyncJobs,
  queueSyncJob as queueStoredSyncJob,
  completeSyncJob as completeStoredSyncJob,
  failSyncJob as failStoredSyncJob,
  recordSyncAttempt as recordStoredSyncAttempt,
  recordAutomaticSyncSuccess as recordStoredAutomaticSyncSuccess,
  recordAutomaticSyncFailure as recordStoredAutomaticSyncFailure,
  recordWebOrderCursor as recordStoredWebOrderCursor,
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
  getQrMenuWebPublicationEnabled as getStoredQrMenuWebPublicationEnabled,
  setQrMenuWebPublicationEnabled as setStoredQrMenuWebPublicationEnabled,
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
} from "./database/table-order-store.js";

import {
  openTableOrder as openStoredTableOrder,
  addTableOrderItem as addStoredTableOrderItem,
  updateTableOrderItemQuantity as updateStoredTableOrderItemQuantity,
  updateTableOrderItemNote as updateStoredTableOrderItemNote,
  updateTableOrderDiscount as updateStoredTableOrderDiscount,
  removeTableOrderItem as removeStoredTableOrderItem,
  updateTableOrderStatus as updateStoredTableOrderStatus,
  closeTableOrder as closeStoredTableOrder,
} from "./table-order-service.js";

import { insertDatabaseEvent } from "./database/event-store.js";

import {
  getRequests,
  getRequestById as getStoredRequestById,
  updateRequestStatus as updateStoredRequestStatus,
  saveRequestAiSuggestion as saveStoredRequestAiSuggestion,
  deleteRequestInTransaction as deleteStoredRequestInTransaction,
  markLocalRequestsSynced as markStoredLocalRequestsSynced,
  getDeletedRequestIds as getStoredDeletedRequestIds,
} from "./database/request-store.js";

import {
  markWhatsAppMessageSent as markStoredWhatsAppMessageSent,
  getPreparedWhatsAppMessages as getStoredPreparedWhatsAppMessages,
  deleteMessageInTransaction as deleteStoredMessageInTransaction,
} from "./database/prepared-message-store.js";

import {
  saveDailyTask as saveStoredDailyTask,
  deleteDailyTask as deleteStoredDailyTask,
  updateDailyTaskStatus as updateStoredDailyTaskStatus,
} from "./database/daily-task-store.js";

import {
  saveManualRestaurantReservation as saveStoredManualRestaurantReservation,
} from "./database/reservation-store.js";

import {
  runDesktopDeletion as runStoredDesktopDeletion,
} from "./database/deletion-store.js";
import { deleteCustomerInTransaction as deleteStoredCustomerInTransaction } from "./database/customer-deletion-service.js";

import {
  saveCustomer as saveStoredCustomer,
} from "./database/customer-store.js";

import {
  getAiServiceProfiles as getStoredAiServiceProfiles,
  getEncryptedAiApiKey as getStoredEncryptedAiApiKey,
  markAiSettingsPublished as markStoredAiSettingsPublished,
} from "./database/ai-profile-store.js";

import {
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
  recordAndroidActionResult as recordStoredAndroidActionResult,
  getAndroidActionFailures as getStoredAndroidActionFailures,
} from "./android-action-service.js";

import {
  createManualRequest as createStoredManualRequest,
  convertRequestToReservation as convertStoredRequestToReservation,
  upsertSyncedRequests,
} from "./request-intake-service.js";

import {
  getSetupData as getStoredSetupData,
  saveSetupData as saveStoredSetupData,
} from "./setup-service.js";
import { readEnabledBusinessCapabilities } from "./business-capability-store.js";

import {
  getTrackedStockCandidates as getStoredTrackedStockCandidates,
  getAppliedStockImageHashes as getStoredAppliedStockImageHashes,
  createStockImageImport as createStoredStockImageImport,
  completeStockImageAnalysis as completeStoredStockImageAnalysis,
  failStockImageImport as failStoredStockImageImport,
  applyStockImageImport as applyStoredStockImageImport,
} from "./database/stock-image-store.js";
