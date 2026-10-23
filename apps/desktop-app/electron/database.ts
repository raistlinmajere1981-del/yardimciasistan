import { getAppLockPasswordVerifier as getAppLockPasswordVerifierStored, setAppLockPasswordVerifier as setAppLockPasswordVerifierStored, getAppLockNotificationCount as getAppLockNotificationCountStored } from "./database/app-lock-store.js";
import { recordRejectedDealerWebOrder } from "./dealer-web-order-rejection.js";
import { PublicTranslationStore } from "./database/public-translation-store";
import { publishedGallery } from "./business-gallery-service";
import * as marketingAnalyticsStore from "./marketing/analytics-read-store";
import * as marketingScheduleStore from "./marketing/schedule-store";
import * as marketingScheduleTargetStore from "./marketing/schedule-target-store";
import * as instagramPublicationStore from "./marketing/instagram-publication-store";
import * as marketingProviderStore from "./marketing/provider-configuration-store";
import type { MarketingProviderSecretWrites } from "./marketing/provider-secrets";
import * as marketingAssetStore from "./marketing/asset-store";
import * as marketingStore from "./marketing/store";
import * as marketingShareStore from "./marketing/share-store";
import * as messagingStore from "./business-messaging/store";
import type { DispatchResult } from "./messaging-campaigns/dispatch-contract";
import * as campaignDispatchStore from "./messaging-campaigns/dispatch-store";
import * as campaignStore from "./messaging-campaigns/store";
import type { BusinessMessageTemplate, MessagingChannel } from "@yardimci-asistan/shared";
import type { MessagingSecretWrite } from "./business-messaging/secret-service";
import { getRuntimeOrder, applyRuntimeShipmentProviderResult } from "./commerce-runtime";
import type { ShipmentProviderResultInput } from "./commerce-shipment-store";
import { getShipmentRegistration, prepareShipmentRegistration, markShipmentRegistrationSubmitted, type ShipmentRegistration } from "./shipping-registration-store";
import { getArasShippingConfiguration, getStoredArasShippingConfiguration, type ShippingSecretWrite } from "./shipping-configuration-store";
import { getDealerWebAccess, changeDealerWebAccess, createDealerAccessProjection } from "./dealer-web-access-store";
import type { DealerAccessAction } from "@yardimci-asistan/shared";
import { dealerProductImageArchives, publishedDealerProductImage, acknowledgeDealerProductImage } from "./dealer-product-media-store";
import { createCommerceOnlineCatalog } from "./commerce-online-catalog-publication";
import * as instagramOAuthStore from "./marketing/instagram-oauth-store";
import { getCommerceProductPublication, listCommerceProductPublications, saveCommerceProductPublication, deleteCommerceProductPublication } from "./commerce-product-publication-store";
import { hasBusinessCapability, type SaveCommerceProductPublicationInput } from "@yardimci-asistan/shared";
import { listRuntimeShipmentsForOrder, getRuntimeShipment, createRuntimeShipmentForOrder, updateRuntimeShipmentStatus, createRuntimeOrder } from "./commerce-runtime";
import type { CreateCommerceOrderInput } from "./commerce-order-store";
import { DatabaseSync } from "node:sqlite";
import { getPublicRoomAvailabilityInput } from "./database/public-room-availability-store";
import { beginRestoreReconciliation, getRestoreReconciliationStatus, saveRestoreActivationExpectation, finishRestoreActivation, finishRestoreReplay, replayRetainedWebOrder } from "./database/restore-reconciliation-store";
import {
  getKbsOverview,
  markHospitalityNotificationSentExternally,
  retryHospitalityNotification
} from "./database/hospitality-notification-store.js";
import { assignHospitalityStay, enterReservedHospitalityStay, checkInHospitalityStay } from "./hospitality-entry-service.js";
import { KbsDeliveryService } from "./kbs-delivery-service.js";
import { readAndroidKbsSnapshot } from "./android-kbs-projection.js";
import { updateRoomStatusWithStayGuard } from "./room-status-service.js";
import { createDesktopDashboardData } from "./desktop-dashboard-service.js";
import { getReservationById } from "./database/reservation-store.js";
import { getDailyTaskById } from "./database/daily-task-store.js";
import { assignReservationRoom } from "./stay-reservation-service.js";
import { collectRoomFolioPayment, checkoutStayWithSettlement, type CheckoutStayOperationInput, type DesktopCheckoutStayOperationResult } from "./room-settlement-operation.js";
import type { AddRoomFolioPaymentInput } from "./room-folio.js";
import type { AssignReservationRoomInput } from "./database-types.js";
export type { AssignReservationRoomInput } from "./database-types.js";
import type { KbsProviderAdapter } from "./kbs-provider-adapter.js";
import { addStayGuest, changeStayPrimary, checkoutStayGuest, moveStayRoom } from "./stay-guest-service.js";
import type { StayGuestInput, CheckoutStayGuestInput, MoveStayRoomInput } from "./database-types.js";
export type { StayGuestInput, CheckoutStayGuestInput, MoveStayRoomInput } from "./database-types.js";
import fs from "node:fs";
import path from "node:path";
import {
  BUSINESS_CAPABILITIES,
  type BusinessCapability,
  type StockImageAnalysis,
  type StockImageProductCandidate
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
  DesktopAiServiceProfile,
  AiApiKeyWrite,
  DesktopSetupData,
  SaveInitialSetupInput,
  DesktopSetupSaveResult,
  SaveMenuCategoryInput,
  SaveMenuProductEntryInput,
  ReorderMenuRecordsInput,
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
  SaveMenuProductEntryInput,
  ReorderMenuRecordsInput,
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

      assertCurrentDesktopSchema(this.db, schemaSql);

      ensureSyncClientId(this.db);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  translations() { return new PublicTranslationStore(this.db, () => publishedGallery(this.userDataPath)); }

  getEnabledBusinessCapabilities(): BusinessCapability[] {
    return readEnabledBusinessCapabilities(this.db);
  }

  beginRestoreReconciliation(operationId: string, clientId: string, currentDatabasePath?: string) { beginRestoreReconciliation(this.db, operationId, clientId, currentDatabasePath); }
  getRestoreReconciliationStatus() { return getRestoreReconciliationStatus(this.db); }
  saveRestoreActivationExpectation(operationId: string, target: string, epoch: number, requests: number, orders: number) { saveRestoreActivationExpectation(this.db, operationId, target, epoch, requests, orders); }
  finishRestoreActivation(operationId: string, target: string, epoch: number) { finishRestoreActivation(this.db, operationId, target, epoch); }
  finishRestoreReplay(kind: "requests" | "orders") { finishRestoreReplay(this.db, kind); }
  replayRetainedWebOrder(envelope: import("@yardimci-asistan/sync-core").WebOrderEnvelope) { return replayRetainedWebOrder(this.db, envelope); }

  getPublicRoomAvailabilityInput() {
    return getPublicRoomAvailabilityInput(this.db);
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

  getDailyTaskById(taskId: string) {
    return getDailyTaskById(this.db, taskId);
  }

  getReservationById(reservationId: string) {
    return getReservationById(this.db, reservationId);
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

  processKbsDeliveryRequests(adapters: readonly KbsProviderAdapter[], available: () => boolean): Promise<number> {
    return new KbsDeliveryService(this.db, adapters).processRequests(available);
  }

  canProcessKbsDeliveryRequests(): boolean {
    const enabled = new Set(this.getEnabledBusinessCapabilities());
    return enabled.has("service.android") && enabled.has("accommodation.rooms") && enabled.has("accommodation.stays") && getKbsOverview(this.db).enabled;
  }

  getAndroidKbsSnapshot() {
    return readAndroidKbsSnapshot(this.db, this.getEnabledBusinessCapabilities());
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

  listCustomers(query: import("./database/customer-store").CustomerListQuery = {}) { return listStoredCustomersPage(this.db, query); }
  getCustomer(id: string) { return getStoredCustomer(this.db, id); }

  saveCustomer(input: SaveCustomerInput): DesktopCustomerMutationResult {
    const result = saveStoredCustomer(this.db, input);
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  assignCustomerToRoom(input: AssignCustomerRoomInput): DesktopCustomerMutationResult {
    const result = assignHospitalityStay(this.db, this.databasePath, input);
    return result.ok ? { ...result, dashboardData: this.getDashboardData() } : result;
  }

  createStayFromReservation(input: CreateStayFromReservationInput): DesktopCustomerMutationResult {
    const result = enterReservedHospitalityStay(this.db, this.databasePath, input);
    return result.ok ? { ...result, dashboardData: this.getDashboardData() } : result;
  }

  /** Explicit arrival coordinates the enabled financial account in the same transaction. */
  checkInStay(stayId: string): DesktopCustomerMutationResult {
    const result = checkInHospitalityStay(this.db, this.databasePath, stayId);
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

  checkoutStayWithSettlement(input: CheckoutStayOperationInput): DesktopCheckoutStayOperationResult {
    const result = checkoutStayWithSettlement(this.db, input);
    return result.ok ? { ...result, dashboardData: this.getDashboardData() } : result;
  }

  collectRoomFolioPayment(input: AddRoomFolioPaymentInput) {
    return collectRoomFolioPayment(this.db, input);
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

  deleteMenuProductEntry(itemIdInput: string): DesktopStatusUpdateResult {
    const itemId = itemIdInput.trim();
    if (!itemId) {
      return { ok: false, message: "Silinecek ürün seçilmeli." };
    }
    const result = runStoredDesktopDeletion(
      this.db,
      () => deleteStoredMenuProductEntryInTransaction(this.db, itemId, new Date().toISOString()),
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

  assignReservationRoom(input: AssignReservationRoomInput): DesktopStatusUpdateResult {
    const result = assignReservationRoom(this.db, input);
    return result.ok ? { ...result, dashboardData: this.getDashboardData() } : result;
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
    return getAppLockPasswordVerifierStored(this.db);
  }

  setAppLockPasswordVerifier(verifier: string): void {
    return setAppLockPasswordVerifierStored(this.db, verifier);
  }

  getAppLockNotificationCount(): number {
    return getAppLockNotificationCountStored(this.db);
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

  getPublicationSourceEpoch(target: string) { return getStoredPublicationSourceEpoch(this.db, target); }
  savePublicationSourceEpoch(target: string, epoch: number) { saveStoredPublicationSourceEpoch(this.db, target, epoch); }
  replacePublicationSourceEpoch(target: string, epoch: number) { replaceStoredPublicationSourceEpoch(this.db, target, epoch); }
  prepareSyncPublication<T>(jobType: DesktopSyncJobType, value: T, refresh = false, expectedRevision?: number) {
    return prepareStoredSyncPublication(this.db, jobType, value, refresh, expectedRevision);
  }
  readPreparedSyncPublication<T>(jobType: DesktopSyncJobType, revision: number): T | null {
    return readStoredPreparedSyncPublication<T>(this.db, jobType, revision);
  }

  ensurePublicationTarget(target: string) {
    ensureStoredPublicationTarget(this.db, target);
  }

  completeSyncJob(jobKey: string, sourceRevision: number, sourceEpoch?: number) {
    completeStoredSyncJob(this.db, jobKey, sourceRevision, sourceEpoch);
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
  getDealerProductImageArchives(productIds: readonly string[]) { return dealerProductImageArchives(this.db, productIds); }
  getPublishedDealerProductImage(productId: string, hash: string, target: string) { return publishedDealerProductImage(this.db, productId, hash, target); }
  acknowledgeDealerProductImage(productId: string, hash: string, target: string, url: string) { acknowledgeDealerProductImage(this.db, productId, hash, target, url); }

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

  getMessagingConfiguration() { return messagingStore.getMessagingConfiguration(this.db); }
  getCustomerMessagingPreference(customerId: string, channel: MessagingChannel, purpose: "marketing") { return campaignStore.getCustomerMessagingPreference(this.db, customerId, channel, purpose); }
  saveCustomerMessagingPreference(input: Parameters<typeof campaignStore.saveCustomerMessagingPreference>[1]) { return campaignStore.saveCustomerMessagingPreference(this.db, input); }
  listMessagingSegments() { return campaignStore.listMessagingSegments(this.db); }
  saveMessagingSegment(input: Parameters<typeof campaignStore.saveMessagingSegment>[1]) { return campaignStore.saveMessagingSegment(this.db, input); }
  previewMessagingSegment(id: string, channel: MessagingChannel) { return campaignStore.previewMessagingSegment(this.db, id, channel); }
  readMarketingAnalyticsRecords(startAt: string, endAt: string, target?: Parameters<typeof marketingAnalyticsStore.readMarketingAnalyticsRecords>[3]) { return marketingAnalyticsStore.readMarketingAnalyticsRecords(this.db, startAt, endAt, target); }
  readMarketingMetricSnapshots(targetId: string, providerKey: string, startAt: string, endAt: string) { return marketingAnalyticsStore.readMarketingMetricSnapshots(this.db, targetId, providerKey, startAt, endAt); }
  saveMarketingMetricSnapshots(records: Parameters<typeof marketingAnalyticsStore.saveMarketingMetricSnapshots>[1], startAt: string, endAt: string) { return marketingAnalyticsStore.saveMarketingMetricSnapshots(this.db, records, startAt, endAt); }
  listMarketingSchedules() { return marketingScheduleStore.listMarketingSchedules(this.db); }
  getMarketingSchedule(id: string) { return marketingScheduleStore.getMarketingSchedule(this.db,id); }
  getMarketingScheduleExecution(id: string) { return marketingScheduleStore.getMarketingScheduleExecution(this.db,id); }
  saveMarketingSchedule(input: Parameters<typeof marketingScheduleStore.saveMarketingSchedule>[1], now: string) { return marketingScheduleStore.saveMarketingSchedule(this.db,input,now); }
  transitionMarketingSchedule(id: string, revision: number, action: "pause"|"resume"|"cancel", now: string) { return marketingScheduleStore.transitionMarketingSchedule(this.db,id,revision,action,now); }
  recoverMarketingScheduleExecutions() { return marketingScheduleStore.recoverMarketingScheduleExecutions(this.db); }
  claimMarketingScheduleExecution(now: string, graceMs: number) { return marketingScheduleStore.claimMarketingScheduleExecution(this.db,now,graceMs); }
  finishMarketingScheduleExecution(id: string, status: "succeeded"|"skipped"|"failed"|"pending", now: string, error = "") { return marketingScheduleStore.finishMarketingScheduleExecution(this.db,id,status,now,error); }
  prepareScheduledPublication(id: string) { return marketingScheduleTargetStore.prepareScheduledPublication(this.db,id); }
  transitionScheduledCampaignDispatch(campaignId: string, executionId: string) { return marketingScheduleTargetStore.transitionScheduledCampaignDispatch(this.db,campaignId,executionId); }
  getMarketingPublication(id: string) { return marketingStore.getMarketingPublication(this.db,id); }
  getInstagramPublicationState(id: string) { return instagramPublicationStore.instagramPublicationState(this.db,id); }
  beginInstagramPublication(id: string, revision: number, accountKey: string, stage: Parameters<typeof instagramPublicationStore.beginInstagramPublication>[4]) { return instagramPublicationStore.beginInstagramPublication(this.db,id,revision,accountKey,stage); }
  claimInstagramSubmission(id: string, phase: "create" | "publish") { return instagramPublicationStore.claimInstagramSubmission(this.db,id,phase); }
  recordInstagramContainer(id: string, containerId: string) { return instagramPublicationStore.recordInstagramContainer(this.db,id,containerId); }
  finishInstagramPublication(id: string, result: Parameters<typeof instagramPublicationStore.finishInstagramPublication>[2]) { return instagramPublicationStore.finishInstagramPublication(this.db,id,result); }
  clearInstagramStage(id: string) { instagramPublicationStore.clearInstagramStage(this.db,id); }
  getSmsConfiguration() { return marketingProviderStore.smsConfiguration(this.db); }
  getInstagramConfiguration() { return marketingProviderStore.instagramConfiguration(this.db); }
  saveInstagramOAuthConnection(account: Parameters<typeof instagramOAuthStore.saveInstagramOAuth>[1]) { return instagramOAuthStore.saveInstagramOAuth(this.db,account); }
  disconnectInstagramOAuthConnection() { return instagramOAuthStore.disconnectInstagramOAuth(this.db); }
  setInstagramOAuthEnabled(enabled: boolean) { return instagramOAuthStore.setInstagramOAuthEnabled(this.db, enabled); }
  getStoredMarketingProvider(provider: "iletimerkezi" | "instagram_api") { return marketingProviderStore.storedMarketingProvider(this.db, provider); }
  listMarketingContents() { return marketingStore.listMarketingContents(this.db); }
  getMarketingShare(id: string) { return marketingShareStore.getMarketingShare(this.db, id); }
  listMarketingShares() { return marketingShareStore.listMarketingShares(this.db); }
  saveMarketingShare(input: Parameters<typeof marketingShareStore.saveMarketingShare>[1]) { return marketingShareStore.saveMarketingShare(this.db, input); }
  prepareMarketingShareTargets(...args: Parameters<typeof marketingShareStore.prepareMarketingShareTargets> extends [unknown, ...infer Rest] ? Rest : never) { return marketingShareStore.prepareMarketingShareTargets(this.db, ...args); }
  saveMarketingContent(input: Parameters<typeof marketingStore.saveMarketingContent>[1], source: "manual" | "ai" = "manual") { return marketingStore.saveMarketingContent(this.db, input, source); }
  listMediaAssets() { return marketingAssetStore.listMediaAssets(this.db); }
  getMediaAsset(id: string) { return marketingAssetStore.getMediaAsset(this.db, id); }
  insertMediaAsset(input: Parameters<typeof marketingAssetStore.insertMediaAsset>[1]) { return marketingAssetStore.insertMediaAsset(this.db, input); }
  marketingAssetUsage(id: string) { return marketingAssetStore.assetUsage(this.db, id); }
  manageMediaAsset(id: string, action: "archive" | "delete", altText?: string) { return marketingAssetStore.manageMediaAsset(this.db, id, action, altText); }
  listMarketingPublications() { return marketingStore.listMarketingPublications(this.db); }
  saveMarketingPublication(input: Parameters<typeof marketingStore.saveMarketingPublication>[1]) { return marketingStore.saveMarketingPublication(this.db, input); }
  requestMarketingPublication(id: string, revision: number, published: boolean) { return marketingStore.requestMarketingPublication(this.db, id, revision, published); }
  acknowledgeMarketingPublications(sent: Parameters<typeof marketingStore.acknowledgeMarketingPublications>[1], now: string) { return marketingStore.acknowledgeMarketingPublications(this.db, sent, now); }
  failMarketingPublications(sent: Parameters<typeof marketingStore.failMarketingPublications>[1]) { return marketingStore.failMarketingPublications(this.db, sent); }
  marketingPrivateNames() { return marketingStore.marketingPrivateNames(this.db); }
  listMessagingCampaigns() { return campaignStore.listMessagingCampaigns(this.db); }
  getMessagingCampaign(id: string) { return campaignStore.getMessagingCampaign(this.db, id); }
  getMessagingCampaignDetail(id: string) { return campaignStore.getMessagingCampaignDetail(this.db, id); }
  createMessagingCampaign(input: Parameters<typeof campaignStore.createMessagingCampaign>[1]) { return campaignStore.createMessagingCampaign(this.db, input); }
  previewMessagingCampaign(id: string) { return campaignStore.previewMessagingCampaign(this.db, id); }
  prepareMessagingCampaign(id: string, template: BusinessMessageTemplate | null) { return campaignStore.prepareMessagingCampaign(this.db, id, template); }
  cancelMessagingCampaign(id: string) { return campaignStore.cancelMessagingCampaign(this.db, id); }
  getEncryptedMessagingToken() { return String(messagingStore.getStoredMessagingConfiguration(this.db)?.access_token_encrypted ?? ""); }
  getMessagingCustomer(id: string) { return messagingStore.getMessagingCustomer(this.db, id); }
  getCampaignDispatchClaim(id: string, token: string) { return campaignDispatchStore.getDispatchClaim(this.db, id, token); }
  recoverCampaignDispatchClaims(now: string, staleBefore: string) { return campaignDispatchStore.recoverDispatchClaims(this.db, now, staleBefore); }
  claimCampaignDispatchBatch(now: string, size: number) { return campaignDispatchStore.claimDispatchBatch(this.db, now, size); }
  transitionCampaignDispatch(id: string, action: "start" | "pause" | "resume") { return campaignDispatchStore.transitionCampaignDispatch(this.db, id, action); }
  beginCampaignSubmission(id: string, token: string, template: BusinessMessageTemplate | null, accountKey: string, now: string, intervalMs: number) { return campaignDispatchStore.beginCampaignSubmission(this.db, id, token, template, accountKey, now, intervalMs); }
  releaseRejectedCampaignMessage(id: string, token: string) { return campaignDispatchStore.releaseRejectedCampaignMessage(this.db, id, token); }
  finishCampaignDispatchClaim(id: string, token: string, result: DispatchResult, now: string, nextAttemptAt = "", rateLimitUntil = "") { return campaignDispatchStore.finishDispatchClaim(this.db, id, token, result, now, nextAttemptAt, rateLimitUntil); }
  completeDispatchCampaigns(now: string) { return campaignDispatchStore.completeDispatchCampaigns(this.db, now); }
  getBusinessMessage(id: string) { return messagingStore.getBusinessMessage(this.db, id); }
  getMessageBinding(id: string) { return messagingStore.getMessageBinding(this.db, id); }
  prepareBusinessMessage(input: Parameters<typeof messagingStore.prepareBusinessMessage>[1]) { return messagingStore.prepareBusinessMessage(this.db, input); }
  claimBusinessMessage(id: string) { return messagingStore.claimBusinessMessage(this.db, id); }
  applyBusinessMessageStatus(input: messagingStore.MessagingStatusUpdate) { return messagingStore.applyBusinessMessageStatus(this.db, input); }
  failBusinessMessage(id: string, code: string, message: string) { return messagingStore.failBusinessMessage(this.db, id, code, message); }

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

  createDealerWebOrder(accessId: string, accessRevision: number, input: Pick<CreateCommerceOrderInput, "sourceReference" | "items" | "deliverySnapshot" | "note">) {
    return createRuntimeOrder(this.databasePath, { ...input, source: "web-dealer" },
      { dealerAccess: { accessId, accessRevision } });
  }

  recordRejectedDealerWebOrder(orderId: string, accessId: string, accessRevision: number) {
    recordRejectedDealerWebOrder(this.db, orderId, accessId, accessRevision);
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

  getServiceSettingsVerification(service: TestedSettingsService): string {
    return readServiceVerification(this.db, service);
  }

  getServiceSettingsVerificationTime(service: TestedSettingsService): string {
    return readServiceVerificationTime(this.db, service);
  }

  recordServiceSettingsVerification(service: TestedSettingsService, config: Record<string, unknown>): void {
    recordServiceVerification(this.db, service, serviceConfigFingerprint(config));
  }

  clearServiceSettingsVerification(service: TestedSettingsService): void {
    clearServiceVerification(this.db, service);
  }

  markAiSettingsPublished(timestamp: string): DesktopSetupData {
    markStoredAiSettingsPublished(this.db, timestamp);
    return getStoredSetupData(this.db, new Set(this.getEnabledBusinessCapabilities()));
  }

  saveInitialSetup(
    input: SaveInitialSetupInput,
    aiApiKeyWrite: AiApiKeyWrite = { mode: "keep" },
    aiProfileApiKeyWrites: Partial<Record<DesktopAiService, AiApiKeyWrite>> = {},
    shippingSecretWrite: ShippingSecretWrite = { mode: "keep" },
    messagingSecretWrite: MessagingSecretWrite = { mode: "keep" },
    marketingSecretWrites: MarketingProviderSecretWrites = {}
  ): DesktopSetupSaveResult {
    const result = saveStoredSetupData(
      this.db,
      input,
      aiApiKeyWrite,
      aiProfileApiKeyWrites,
      shippingSecretWrite,
      messagingSecretWrite,
      marketingSecretWrites
    );
    if (!result.ok) return result;
    return {
      ...result,
      dashboardData: this.getDashboardData()
    };
  }

  getPublishedMenu(includeInactiveProducts = false): PublishedQrMenu {
    return getStoredPublishedMenu(this.db, includeInactiveProducts);
  }
  getMenuProductCandidates() { return getStoredMenuProductCandidates(this.db); }
  getMenuEntryMutationBaseline(entryId: string) { return getStoredMenuEntryMutationBaseline(this.db, entryId); }
  getTrackedStockProducts() { return getStoredTrackedStockProducts(this.db); }

  getDeletedRequestIds(): string[] {
    return getStoredDeletedRequestIds(this.db);
  }

  getQrMenuPublication(): PublishedQrMenu & { enabled: boolean } {
    const menu = getStoredQrMenuPublication(this.db);
    menu.localization = this.translations().localization([
      ...menu.categories.filter(c => c.is_active).map(c => ({kind: "menu_category" as const, id: c.id, fields: {name: c.name, description: c.description}})),
      ...menu.items.map(p => ({kind: "menu_product" as const, id: p.id, fields: {name: p.name, description: p.description}}))
    ]);
    return menu.enabled && this.getEnabledBusinessCapabilities().includes(BUSINESS_CAPABILITIES.QR_MENU)
      ? menu : { ...menu, enabled: false, categories: [], items: [] };
  }

  getQrMenuWebPublicationEnabled(): boolean {
    return getStoredQrMenuWebPublicationEnabled(this.db);
  }

  setQrMenuWebPublicationEnabled(enabled: boolean): void {
    setStoredQrMenuWebPublicationEnabled(this.db, enabled);
  }

  getTrackedStockCandidates(): StockImageProductCandidate[] {
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

  getCustomerRequests(customerId: string) { return getRequests(this.db, customerId); }

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

  approveDealerApplication(requestId: string, priceGroup: string) {
    const result = approveDealerApplication(this.db, requestId, priceGroup, this.getEnabledBusinessCapabilities());
    return result.ok ? { ...result, dashboardData: this.getDashboardData() } : result;
  }

  convertRequestToReservation(requestId: string): RequestReservationConversionResult {
    const result = convertStoredRequestToReservation(this.db, requestId, this.getEnabledBusinessCapabilities());
    if (!result.ok) {
      return result;
    }
    return { ...result, dashboardData: this.getDashboardData() };
  }

  markMenuPublished(sent: PublishedQrMenu) {
    markStoredMenuPublished(this.db, sent, () => this.getQrMenuPublication());
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

  saveMenuProductEntry(input: SaveMenuProductEntryInput, image?: import("./commerce-store").CatalogProductImageMutation): DesktopMenuSaveResult {
    const result = saveStoredMenuProductEntry(this.db, input, image);
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

}

import {
  ensureSyncClientId,
  setAutoSyncEnabled as setStoredAutoSyncEnabled,
  getSyncRuntimeStatus as getStoredSyncRuntimeStatus,
  getPendingSyncJobs as getStoredPendingSyncJobs,
  queueSyncJob as queueStoredSyncJob,
  getPublicationSourceEpoch as getStoredPublicationSourceEpoch,
  savePublicationSourceEpoch as saveStoredPublicationSourceEpoch,
  replacePublicationSourceEpoch as replaceStoredPublicationSourceEpoch,
  prepareSyncPublication as prepareStoredSyncPublication,
  readPreparedSyncPublication as readStoredPreparedSyncPublication,
  ensurePublicationTarget as ensureStoredPublicationTarget,
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
  markMenuPublished as markStoredMenuPublished,
  getPublishedMenu as getStoredPublishedMenu,
  getMenuEntryMutationBaseline as getStoredMenuEntryMutationBaseline,
  getMenuProductCandidates as getStoredMenuProductCandidates,
  getQrMenuPublication as getStoredQrMenuPublication,
  getQrMenuWebPublicationEnabled as getStoredQrMenuWebPublicationEnabled,
  setQrMenuWebPublicationEnabled as setStoredQrMenuWebPublicationEnabled,
  saveMenuCategory as saveStoredMenuCategory,
  reorderMenuRecords as reorderStoredMenuRecords,
  deleteMenuCategoryInTransaction as deleteStoredMenuCategoryInTransaction,
  deleteMenuProductEntryInTransaction as deleteStoredMenuProductEntryInTransaction,
} from "./database/menu-store.js";

import { saveMenuProductEntry as saveStoredMenuProductEntry } from "./database/menu-product-entry-store.js";

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
  listCustomersPage as listStoredCustomersPage,
  getCustomer as getStoredCustomer,
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
  updateCustomerRoomStayStatus as updateStoredCustomerRoomStayStatus,
  saveManualReservation as saveStoredManualReservation,
  updateReservationStatus as updateStoredReservationStatus,
} from "./stay-reservation-service.js";

import {
  recordAndroidActionResult as recordStoredAndroidActionResult,
  getAndroidActionFailures as getStoredAndroidActionFailures,
} from "./android-action-service.js";

import {
  approveDealerApplication,
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
  getTrackedStockProducts as getStoredTrackedStockProducts,
  getAppliedStockImageHashes as getStoredAppliedStockImageHashes,
  createStockImageImport as createStoredStockImageImport,
  completeStockImageAnalysis as completeStoredStockImageAnalysis,
  failStockImageImport as failStoredStockImageImport,
  applyStockImageImport as applyStoredStockImageImport,
} from "./database/stock-image-store.js";
import { readServiceVerification, readServiceVerificationTime, clearServiceVerification, recordServiceVerification, serviceConfigFingerprint, type TestedSettingsService } from "./service-settings-validation";
