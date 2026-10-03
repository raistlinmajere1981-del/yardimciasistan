import type { DataMaintenanceConfirmation } from "./data-maintenance-confirmation";
import type {
  KbsConnectionTestResult,
  KbsSettings,
  KbsSettingsSaveResult,
  SaveKbsSettingsInput
} from "./kbs-settings";
import { contextBridge, ipcRenderer, webFrame } from "electron";
import type { EgmKbsSessionResult } from "./egm-kbs-webview-driver";
import type {
  BusinessCapability,
  BusinessPublicProfile,
  CatalogCategory,
  CatalogProduct,
  CommerceOrder,
  CommerceOrderDetail,
  CommercePurchaseOrder,
  CommercePurchaseOrderDetail,
  CommerceSale,
  CommerceSaleDraft,
  CommerceSaleDraftDetail,
  CommerceSupplier,
  CustomerCreditEntry,
  InventoryBalance,
  InventoryMovement,
  MarketBarcodeScanEvent,
  MarketCartDraftLoadResult,
  ProductLookupResponse,
  SaveBusinessPublicProfileInput,
  AddRoomMediaInput,
  AddTableMediaInput,
  DeleteRoomMediaInput,
  PublicResourceCoverPreview,
  DeleteTableMediaInput,
  RoomMediaAsset,
  RoomMediaDraftResult,
  RoomMediaDraftState,
  RoomMediaMutationResult,
  TableMediaAsset,
  TableMediaDraftResult,
  TableMediaDraftState,
  TableMediaMutationResult,
  UpdateRoomMediaInput,
  UpdateTableMediaInput
} from "@yardimci-asistan/shared";
import type { PullRequestsResult, MarkRequestsSyncedResult, PushAiSettingsResult, PushAndroidSnapshotResult, PushMenuResult } from "@yardimci-asistan/sync-core";
import type {
  DesktopDashboardData,
  DesktopSetupData,
  DesktopSetupSaveResult,
  SaveInitialSetupInput,
  SaveMenuCategoryInput,
  SaveMenuItemInput,
  ReorderMenuRecordsInput,
  DesktopMenuSaveResult,
  CreateManualRequestInput,
  CreateManualRequestResult,
  RequestReservationConversionResult,
  RequestAiSuggestionResult,
  RewriteRequestAiSuggestionInput,
  DailyBusinessEvaluationResult,
  DesktopAndroidPermissionGroupsUpdate,
  DesktopAndroidDeviceMutationResult,
  DesktopStatusUpdateResult,
  DesktopKbsDeliveryMutationResult,
  UpdateRequestStatusInput,
  UpdateRoomStatusInput,
  UpdateTableStatusInput,
  AssignTableCustomerInput,
  DesktopTableOrder,
  DesktopTableOrderResult,
  UpdateReservationStatusInput,
  SaveManualReservationInput,
  SaveManualRestaurantReservationInput,
  UpdateDailyTaskStatusInput,
  SaveDailyTaskInput,
  MarkWhatsAppMessageSentInput,
  DeleteWhatsAppMessageInput,
  DesktopStockImageAnalyzeInput,
  DesktopStockImageAnalyzeResult,
  ApplyStockImageImportInput,
  DesktopStockImageApplyResult,
  SaveCustomerInput,
  AssignCustomerRoomInput,
  StayGuestInput,
  CheckoutStayGuestInput,
  MoveStayRoomInput,
  CreateStayFromReservationInput,
  UpdateCustomerRoomStayStatusInput,
  DesktopCustomerMutationResult,
  DesktopBirthdayPrepareResult,
  DesktopIdentityImageAnalyzeInput,
  DesktopIdentityImageAnalyzeResult,
  DesktopReportRangeInput,
  DesktopReportQueryResult,
  GenerateDesktopReportAiInput,
  GenerateDesktopReportAiResult
} from "./database";
import type {
  DesktopAndroidInstallationSnapshot,
  DesktopAndroidInstallResult
} from "./android-installation-service";
import type {
  DesktopBackupActionResult,
  DesktopBackupCreateResult,
  DesktopBackupListResult,
  DesktopDataMaintenanceResult
} from "./data-maintenance";
import type {
  AddPensionPaymentInput,
  DesktopFinanceData,
  DesktopFinanceMutationResult,
  GenerateDesktopFinanceAiInput,
  GenerateDesktopFinanceAiResult,
  SaveFinanceCategoryInput,
  SaveManualFinanceEntryInput,
  SetReservationAgreedTotalInput
} from "./finance";
import type {
  AddRoomFolioManualItemInput,
  AddRoomFolioMenuItemInput,
  AddRoomFolioPaymentInput,
  CheckoutRoomFolioInput,
  DesktopRoomFolioData,
  DesktopRoomFolioMutationResult,
  SetRoomFolioDiscountInput,
  UpdateRoomFolioDetailsInput,
  UpdateRoomFolioItemQuantityInput
} from "./room-folio";
import type { AutomaticSyncCycleResult, AutomaticSyncStatus } from "./sync-coordinator";
import type {
  AppLockActionResult,
  AppLockStatus,
  UpdateAppPasswordInput
} from "./app-lock";
import type { WebConnectionTestInput, WebConnectionTestResult } from "./web-connection-test";
import type {
  DesktopDiagnosticReadInput,
  DesktopDiagnosticReadResult,
  DesktopDiagnosticSessionSummary,
  DesktopDiagnosticWriteInput,
  DesktopSupportReportActionResult,
  DesktopSupportReportDraft,
  DesktopSupportReportSendInput,
  DesktopSupportReportSendResult
} from "./diagnostics-contract";
import type { BusinessCapabilitySnapshot } from "./business-capability-store";
import type { BusinessPublicProfileSaveResult } from "./business-public-profile";
import type {
  GoogleReviewsConnectionTestResult,
  GoogleReviewsSettings,
  GoogleReviewsSettingsSaveResult,
  SaveGoogleReviewsSettingsInput
} from "./google-reviews-settings";
import type {
  BusinessLayoutSaveResult,
  BusinessLayoutSnapshot,
  SaveBusinessLayoutInput
} from "./business-layout";
import type { BusinessLocationGeocodeResponse } from "./business-location-geocode";
import type { CommerceIpcMutationResult, DesktopCommerceBridge, MarketBarcodeFastPullState } from "./commerce-ipc-contract";
import type { DeleteCatalogCategoryResult } from "./commerce-category-store";
import type { CommerceStoreSnapshot } from "./commerce-store";
import type { InventoryCountResult } from "./commerce-runtime";
import type {
  DesktopUpdateActionResult,
  DesktopUpdatePreferencesInput,
  DesktopUpdateStatus
} from "./desktop-update-service";

interface AiConnectionTestInput {
  provider: string;
  service: string;
  projectName: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  useStoredApiKey: boolean;
  timeoutSeconds: number;
}

type AiConnectionTestResult =
  | { ok: true; message: string; model: string; models: Array<{ id: string; label: string }> }
  | { ok: false; message: string; model?: string; models?: Array<{ id: string; label: string }> };

type AiApiKeyRevealResult =
  | { ok: true; apiKey: string }
  | { ok: false; message: string };

export interface DesktopBridge {
  setUiScale: (scale: number) => void;
  getAppLockStatus: () => Promise<AppLockStatus>;
  getCurrentDiagnosticSession: () => Promise<DesktopDiagnosticSessionSummary | null>;
  listDiagnosticSessions: () => Promise<DesktopDiagnosticSessionSummary[]>;
  readDiagnosticSession: (input?: DesktopDiagnosticReadInput) => Promise<DesktopDiagnosticReadResult | null>;
  writeDiagnosticEvent: (input: DesktopDiagnosticWriteInput) => Promise<unknown>;
  getSupportReportDraft: () => Promise<DesktopSupportReportDraft>;
  addClipboardScreenshot: () => Promise<DesktopSupportReportActionResult>;
  clearSupportScreenshot: () => Promise<DesktopSupportReportActionResult>;
  sendSupportReport: (input?: DesktopSupportReportSendInput) => Promise<DesktopSupportReportSendResult>;
  lockApp: () => Promise<AppLockActionResult>;
  unlockApp: (password: string) => Promise<AppLockActionResult>;
  updateAppPassword: (input: UpdateAppPasswordInput) => Promise<AppLockActionResult>;
  resetAppPassword: (webSecurityKey: string) => Promise<AppLockActionResult>;
  getBootstrapData: () => Promise<{
    appName: string;
    version: string;
    platform: string;
    syncSettings: { webModuleUrl: string; hasSyncSecret: boolean };
    databasePath: string;
    userDataPath: string;
    backupPath: string;
    setup: DesktopSetupData;
  }>;
  getDashboardData: () => Promise<DesktopDashboardData>;
  getReportData: (input: DesktopReportRangeInput) => Promise<DesktopReportQueryResult>;
  generateReportAiComment: (input: GenerateDesktopReportAiInput) => Promise<GenerateDesktopReportAiResult>;
  generateFinanceAiComment: (input: GenerateDesktopFinanceAiInput) => Promise<GenerateDesktopFinanceAiResult>;
  getFinanceData: (limit?: number) => Promise<DesktopFinanceData>;
  saveManualFinanceEntry: (input: SaveManualFinanceEntryInput) => Promise<DesktopFinanceMutationResult>;
  deleteManualFinanceEntry: (entryId: string) => Promise<DesktopFinanceMutationResult>;
  saveFinanceCategory: (input: SaveFinanceCategoryInput) => Promise<DesktopFinanceMutationResult>;
  deleteFinanceCategory: (categoryId: string) => Promise<DesktopFinanceMutationResult>;
  setReservationAgreedTotal: (input: SetReservationAgreedTotalInput) => Promise<DesktopFinanceMutationResult>;
  addPensionPayment: (input: AddPensionPaymentInput) => Promise<DesktopFinanceMutationResult>;
  getRoomFolioData: (roomId?: string) => Promise<DesktopRoomFolioData>;
  openRoomFolio: (stayId: string) => Promise<DesktopRoomFolioMutationResult>;
  updateRoomFolioDetails: (input: UpdateRoomFolioDetailsInput) => Promise<DesktopRoomFolioMutationResult>;
  addRoomFolioMenuItem: (input: AddRoomFolioMenuItemInput) => Promise<DesktopRoomFolioMutationResult>;
  updateRoomFolioItemQuantity: (input: UpdateRoomFolioItemQuantityInput) => Promise<DesktopRoomFolioMutationResult>;
  addRoomFolioManualItem: (input: AddRoomFolioManualItemInput) => Promise<DesktopRoomFolioMutationResult>;
  setRoomFolioDiscount: (input: SetRoomFolioDiscountInput) => Promise<DesktopRoomFolioMutationResult>;
  removeRoomFolioItem: (itemId: string) => Promise<DesktopRoomFolioMutationResult>;
  addRoomFolioPayment: (input: AddRoomFolioPaymentInput) => Promise<DesktopRoomFolioMutationResult>;
  voidRoomFolioPayment: (paymentId: string) => Promise<DesktopRoomFolioMutationResult>;
  checkoutRoomFolio: (input: CheckoutRoomFolioInput) => Promise<DesktopRoomFolioMutationResult>;
  onDashboardDataChanged: (listener: (data: DesktopDashboardData) => void) => () => void;
  getSyncStatus: () => Promise<AutomaticSyncStatus>;
  testWebConnection: (input: WebConnectionTestInput) => Promise<WebConnectionTestResult>;
  runSyncNow: () => Promise<AutomaticSyncCycleResult>;
  setAutoSyncEnabled: (enabled: boolean) => Promise<AutomaticSyncStatus>;
  onSyncStatusChanged: (listener: (status: AutomaticSyncStatus) => void) => () => void;
  getSetupData: () => Promise<DesktopSetupData>;
  saveInitialSetup: (input: SaveInitialSetupInput) => Promise<DesktopSetupSaveResult>;
  getBusinessLayout: () => Promise<BusinessLayoutSnapshot>;
  saveBusinessLayout: (input: SaveBusinessLayoutInput) => Promise<BusinessLayoutSaveResult>;
  listRoomMedia: (roomId: string) => Promise<RoomMediaAsset[]>;
  listRoomMediaCoverPreviews: () => Promise<PublicResourceCoverPreview[]>;
  getRoomMediaDraftState: () => Promise<RoomMediaDraftState>;
  commitRoomMediaDraft: () => Promise<RoomMediaDraftResult>;
  discardRoomMediaDraft: () => Promise<RoomMediaDraftResult>;
  addRoomMedia: (input: AddRoomMediaInput) => Promise<RoomMediaMutationResult>;
  updateRoomMedia: (input: UpdateRoomMediaInput) => Promise<RoomMediaMutationResult>;
  deleteRoomMedia: (input: DeleteRoomMediaInput) => Promise<RoomMediaMutationResult>;
  listTableMedia: (tableId: string) => Promise<TableMediaAsset[]>;
  listTableMediaCoverPreviews: () => Promise<PublicResourceCoverPreview[]>;
  getTableMediaDraftState: () => Promise<TableMediaDraftState>;
  commitTableMediaDraft: () => Promise<TableMediaDraftResult>;
  discardTableMediaDraft: () => Promise<TableMediaDraftResult>;
  addTableMedia: (input: AddTableMediaInput) => Promise<TableMediaMutationResult>;
  updateTableMedia: (input: UpdateTableMediaInput) => Promise<TableMediaMutationResult>;
  deleteTableMedia: (input: DeleteTableMediaInput) => Promise<TableMediaMutationResult>;
  getBusinessPublicProfile: () => Promise<BusinessPublicProfile>;
  saveBusinessPublicProfile: (input: SaveBusinessPublicProfileInput) => Promise<BusinessPublicProfileSaveResult>;
  getGoogleReviewsSettings: () => Promise<GoogleReviewsSettings>;
  saveGoogleReviewsSettings: (input: SaveGoogleReviewsSettingsInput) => Promise<GoogleReviewsSettingsSaveResult>;
  testGoogleReviewsConnection: (input: Pick<SaveGoogleReviewsSettingsInput, "placeId" | "apiKey" | "clearApiKey">) => Promise<GoogleReviewsConnectionTestResult>;
  getKbsSettings: () => Promise<KbsSettings>;
  saveKbsSettings: (input: SaveKbsSettingsInput) => Promise<KbsSettingsSaveResult>;
  testKbsConnection: (input: SaveKbsSettingsInput) => Promise<KbsConnectionTestResult>;
  markKbsNotificationSentExternally: (notificationId: string) => Promise<DesktopStatusUpdateResult>;
  retryKbsNotification: (notificationId: string) => Promise<DesktopStatusUpdateResult>;
  sendKbsNotification: (notificationId: string) => Promise<DesktopKbsDeliveryMutationResult>;
  registerKbsWebview: (webContentsId: number) => void;
  unregisterKbsWebview: (webContentsId: number) => void;
  inspectEgmKbsSession: () => Promise<EgmKbsSessionResult>;
  prepareStoredEgmKbsLogin: () => Promise<EgmKbsSessionResult>;
  prepareEgmKbsLogin: (input: SaveKbsSettingsInput) => Promise<EgmKbsSessionResult>;
  geocodeBusinessAddress: (address: string) => Promise<BusinessLocationGeocodeResponse>;
  getBusinessCapabilitySnapshot: () => Promise<BusinessCapabilitySnapshot>;
  setBusinessCapability: (capability: BusinessCapability, enabled: boolean) => Promise<BusinessCapabilitySnapshot>;
  clearBusinessCapabilityOverride: (capability: BusinessCapability) => Promise<BusinessCapabilitySnapshot>;
  applyBusinessProfile: (profileId: string, preserveUserOverrides?: boolean) => Promise<BusinessCapabilitySnapshot>;
  commerce: DesktopCommerceBridge;
  setAndroidDeviceRole: (deviceId: string, role: "admin" | "staff") => Promise<DesktopAndroidDeviceMutationResult>;
  setAndroidDevicePermissionGroupsBatch: (updates: DesktopAndroidPermissionGroupsUpdate[]) => Promise<DesktopAndroidDeviceMutationResult>;
  setAndroidDeviceActive: (deviceId: string, active: boolean) => Promise<DesktopAndroidDeviceMutationResult>;
  resetAndroidDevicePermissions: (deviceId: string) => Promise<DesktopAndroidDeviceMutationResult>;
  revokeAndroidDevice: (deviceId: string) => Promise<DesktopAndroidDeviceMutationResult>;
  listAndroidInstallDevices: () => Promise<DesktopAndroidInstallationSnapshot>;
  installAndroidApp: (serial: string) => Promise<DesktopAndroidInstallResult>;
  provisionAndroidApp: (serial: string) => Promise<DesktopAndroidInstallResult>;
  createManualRequest: (input: CreateManualRequestInput) => Promise<CreateManualRequestResult>;
  convertRequestToReservation: (requestId: string) => Promise<RequestReservationConversionResult>;
  updateRequestStatus: (input: UpdateRequestStatusInput) => Promise<DesktopStatusUpdateResult>;
  deleteRequest: (requestId: string) => Promise<DesktopStatusUpdateResult>;
  deleteCustomer: (customerId: string) => Promise<DesktopStatusUpdateResult>;
  saveCustomer: (input: SaveCustomerInput) => Promise<DesktopCustomerMutationResult>;
  prepareBirthdayWhatsApp: (customerId: string) => Promise<DesktopBirthdayPrepareResult>;
  assignCustomerRoom: (input: AssignCustomerRoomInput) => Promise<DesktopCustomerMutationResult>;
  addStayGuest: (input: StayGuestInput) => Promise<DesktopCustomerMutationResult>;
  changeStayPrimary: (input: StayGuestInput) => Promise<DesktopCustomerMutationResult>;
  checkoutStayGuest: (input: CheckoutStayGuestInput) => Promise<DesktopCustomerMutationResult>;
  moveStayRoom: (input: MoveStayRoomInput) => Promise<DesktopCustomerMutationResult>;
  createStayFromReservation: (input: CreateStayFromReservationInput) => Promise<DesktopCustomerMutationResult>;
  checkInStay: (stayId: string) => Promise<DesktopCustomerMutationResult>;
  checkoutStay: (stayId: string) => Promise<DesktopCustomerMutationResult>;
  updateCustomerRoomStayStatus: (input: UpdateCustomerRoomStayStatusInput) => Promise<DesktopCustomerMutationResult>;
  analyzeIdentityImage: (input: DesktopIdentityImageAnalyzeInput) => Promise<DesktopIdentityImageAnalyzeResult>;
  markWhatsAppMessageSent: (input: MarkWhatsAppMessageSentInput) => Promise<DesktopStatusUpdateResult>;
  deleteWhatsAppMessage: (input: DeleteWhatsAppMessageInput) => Promise<DesktopStatusUpdateResult>;
  updateRoomStatus: (input: UpdateRoomStatusInput) => Promise<DesktopStatusUpdateResult>;
  updateTableStatus: (input: UpdateTableStatusInput) => Promise<DesktopStatusUpdateResult>;
  assignTableCustomer: (input: AssignTableCustomerInput) => Promise<DesktopStatusUpdateResult>;
  listTableOrders: () => Promise<DesktopTableOrder[]>;
  getActiveTableOrder: (tableId: string) => Promise<DesktopTableOrder | null>;
  openTableOrder: (tableId: string) => Promise<DesktopTableOrderResult>;
  addTableOrderItem: (orderId: string, menuItemId: string, quantity: number, note: string) => Promise<DesktopTableOrderResult>;
  updateTableOrderItemQuantity: (itemId: string, quantity: number) => Promise<DesktopTableOrderResult>;
  updateTableOrderItemNote: (itemId: string, note: string) => Promise<DesktopTableOrderResult>;
  updateTableOrderDiscount: (orderId: string, discountTotal: number) => Promise<DesktopTableOrderResult>;
  removeTableOrderItem: (itemId: string) => Promise<DesktopTableOrderResult>;
  updateTableOrderStatus: (orderId: string, status: string) => Promise<DesktopTableOrderResult>;
  closeTableOrder: (orderId: string, status: "paid" | "cancelled") => Promise<DesktopTableOrderResult>;
  recalculateTableOrderTotal: (orderId: string) => Promise<DesktopTableOrderResult>;
  saveManualReservation: (input: SaveManualReservationInput) => Promise<DesktopStatusUpdateResult>;
  saveManualRestaurantReservation: (input: SaveManualRestaurantReservationInput) => Promise<DesktopStatusUpdateResult>;
  updateReservationStatus: (input: UpdateReservationStatusInput) => Promise<DesktopStatusUpdateResult>;
  saveDailyTask: (input: SaveDailyTaskInput) => Promise<DesktopStatusUpdateResult>;
  deleteDailyTask: (taskId: string) => Promise<DesktopStatusUpdateResult>;
  updateDailyTaskStatus: (input: UpdateDailyTaskStatusInput) => Promise<DesktopStatusUpdateResult>;
  createManualBackup: () => Promise<DesktopBackupCreateResult>;
  listLocalBackups: () => Promise<DesktopBackupListResult>;
  openLocalBackupDirectory: () => Promise<DesktopBackupActionResult>;
  openLocalBackupItemDirectory: (backupId: string) => Promise<DesktopBackupActionResult>;
  deleteLocalBackup: (backupId: string) => Promise<DesktopBackupActionResult>;
  restoreLocalBackup: (backupId: string) => Promise<DesktopDataMaintenanceResult>;
  resetLocalData: () => Promise<DesktopDataMaintenanceResult>;
  onDataMaintenanceConfirmation: (listener: (request: DataMaintenanceConfirmation) => Promise<boolean>) => () => void;
  createOwnerReplySuggestion: (requestId: string) => Promise<RequestAiSuggestionResult>;
  rewriteOwnerReplySuggestion: (input: RewriteRequestAiSuggestionInput) => Promise<RequestAiSuggestionResult>;
  generateDailyBusinessEvaluation: () => Promise<DailyBusinessEvaluationResult>;
  testAiConnection: (input: AiConnectionTestInput) => Promise<AiConnectionTestResult>;
  revealAiApiKey: (service: string) => Promise<AiApiKeyRevealResult>;
  pullRequests: () => Promise<PullRequestsResult>;
  markRequestsSynced: (requestIds: string[]) => Promise<MarkRequestsSyncedResult>;
  pushMenu: () => Promise<PushMenuResult>;
  pushAndroidSnapshot: () => Promise<PushAndroidSnapshotResult>;
  pushAiSettings: () => Promise<PushAiSettingsResult>;
  getQrMenuWebPublication: () => Promise<{ enabled: boolean }>;
  setQrMenuWebPublication: (enabled: boolean) => Promise<{ ok: boolean; message: string; enabled: boolean }>;
  saveMenuCategory: (input: SaveMenuCategoryInput) => Promise<DesktopMenuSaveResult>;
  saveMenuItem: (input: SaveMenuItemInput) => Promise<DesktopMenuSaveResult>;
  reorderMenuRecords: (input: ReorderMenuRecordsInput) => Promise<DesktopStatusUpdateResult>;
  deleteMenuCategory: (categoryId: string) => Promise<DesktopStatusUpdateResult>;
  deleteMenuItem: (itemId: string) => Promise<DesktopStatusUpdateResult>;
  analyzeStockImage: (input: DesktopStockImageAnalyzeInput) => Promise<DesktopStockImageAnalyzeResult>;
  cancelStockImageAnalysis: (importId: string) => Promise<boolean>;
  applyStockImageImport: (input: ApplyStockImageImportInput) => Promise<DesktopStockImageApplyResult>;
  getUpdateStatus: () => Promise<DesktopUpdateStatus>;
  checkForUpdates: (force?: boolean) => Promise<DesktopUpdateStatus>;
  downloadUpdate: () => Promise<DesktopUpdateStatus>;
  saveUpdatePreferences: (input: DesktopUpdatePreferencesInput) => Promise<DesktopUpdateActionResult>;
  restartAndInstallUpdate: () => Promise<DesktopUpdateActionResult>;
  onUpdateStatusChanged: (listener: (status: DesktopUpdateStatus) => void) => () => void;
  openExternal: (url: string) => Promise<boolean>;
}

async function invokeWhenUnlocked<T>(channel: string, ...args: unknown[]): Promise<T> {
  const status = await ipcRenderer.invoke("appLock:getStatus") as AppLockStatus;
  if (status.locked) throw new Error("Uygulama kilitli. Devam etmek için kilidi açın.");
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

async function invokeCommerceMutation<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = await invokeWhenUnlocked<CommerceIpcMutationResult<T>>(channel, ...args);
  if (result?.ok === true) return result.value;
  if (result?.ok === false && result.expected === true) {
    const error = new Error(result.message);
    error.name = "CommerceDomainError";
    throw error;
  }
  throw new Error("Market işlemi beklenmeyen bir IPC yanıtı döndürdü.");
}

const bridge: DesktopBridge = {
  setUiScale: (scale: number) => webFrame.setZoomFactor(scale),
  getAppLockStatus: () => ipcRenderer.invoke("appLock:getStatus"),
  getCurrentDiagnosticSession: () => invokeWhenUnlocked<DesktopDiagnosticSessionSummary | null>("diagnostics:getCurrentSession"),
  listDiagnosticSessions: () => invokeWhenUnlocked<DesktopDiagnosticSessionSummary[]>("diagnostics:listSessions"),
  readDiagnosticSession: (input = {}) => invokeWhenUnlocked<DesktopDiagnosticReadResult | null>("diagnostics:readSession", input),
  writeDiagnosticEvent: (input: DesktopDiagnosticWriteInput) => ipcRenderer.invoke("diagnostics:writeRendererEvent", input),
  getSupportReportDraft: () => invokeWhenUnlocked<DesktopSupportReportDraft>("diagnostics:getSupportReportDraft"),
  addClipboardScreenshot: () => invokeWhenUnlocked<DesktopSupportReportActionResult>("diagnostics:addClipboardScreenshot"),
  clearSupportScreenshot: () => invokeWhenUnlocked<DesktopSupportReportActionResult>("diagnostics:clearSupportScreenshot"),
  sendSupportReport: (input = {}) => invokeWhenUnlocked<DesktopSupportReportSendResult>("diagnostics:sendSupportReport", input),
  lockApp: () => ipcRenderer.invoke("appLock:lock"),
  unlockApp: (password: string) => ipcRenderer.invoke("appLock:unlock", password),
  updateAppPassword: (input: UpdateAppPasswordInput) => ipcRenderer.invoke("appLock:updatePassword", input),
  resetAppPassword: (webSecurityKey: string) => ipcRenderer.invoke("appLock:resetWithWebSecurityKey", webSecurityKey),
  getBootstrapData: () => ipcRenderer.invoke("app:getBootstrapData"),
  getDashboardData: () => ipcRenderer.invoke("dashboard:getData"),
  getReportData: (input: DesktopReportRangeInput) => ipcRenderer.invoke("report:getData", input),
  generateReportAiComment: (input: GenerateDesktopReportAiInput) => ipcRenderer.invoke("report:generateAiComment", input),
  generateFinanceAiComment: (input: GenerateDesktopFinanceAiInput) => invokeWhenUnlocked<GenerateDesktopFinanceAiResult>("finance:generateAiComment", input),
  getFinanceData: (limit?: number) => invokeWhenUnlocked<DesktopFinanceData>("finance:getData", limit),
  saveManualFinanceEntry: (input: SaveManualFinanceEntryInput) => invokeWhenUnlocked<DesktopFinanceMutationResult>("finance:saveManualEntry", input),
  deleteManualFinanceEntry: (entryId: string) => invokeWhenUnlocked<DesktopFinanceMutationResult>("finance:deleteManualEntry", entryId),
  saveFinanceCategory: (input: SaveFinanceCategoryInput) => invokeWhenUnlocked<DesktopFinanceMutationResult>("finance:saveCategory", input),
  deleteFinanceCategory: (categoryId: string) => invokeWhenUnlocked<DesktopFinanceMutationResult>("finance:deleteCategory", categoryId),
  setReservationAgreedTotal: (input: SetReservationAgreedTotalInput) => invokeWhenUnlocked<DesktopFinanceMutationResult>("finance:setReservationTotal", input),
  addPensionPayment: (input: AddPensionPaymentInput) => invokeWhenUnlocked<DesktopFinanceMutationResult>("finance:addPensionPayment", input),
  getRoomFolioData: (roomId) => invokeWhenUnlocked<DesktopRoomFolioData>("roomFolio:getData", roomId),
  openRoomFolio: (stayId: string) => invokeWhenUnlocked<DesktopRoomFolioMutationResult>("roomFolio:open", stayId),
  updateRoomFolioDetails: (input: UpdateRoomFolioDetailsInput) => invokeWhenUnlocked<DesktopRoomFolioMutationResult>("roomFolio:updateDetails", input),
  addRoomFolioMenuItem: (input: AddRoomFolioMenuItemInput) => invokeWhenUnlocked<DesktopRoomFolioMutationResult>("roomFolio:addMenuItem", input),
  updateRoomFolioItemQuantity: (input: UpdateRoomFolioItemQuantityInput) => invokeWhenUnlocked<DesktopRoomFolioMutationResult>("roomFolio:updateItemQuantity", input),
  addRoomFolioManualItem: (input: AddRoomFolioManualItemInput) => invokeWhenUnlocked<DesktopRoomFolioMutationResult>("roomFolio:addManualItem", input),
  setRoomFolioDiscount: (input: SetRoomFolioDiscountInput) => invokeWhenUnlocked<DesktopRoomFolioMutationResult>("roomFolio:setDiscount", input),
  removeRoomFolioItem: (itemId: string) => invokeWhenUnlocked<DesktopRoomFolioMutationResult>("roomFolio:removeItem", itemId),
  addRoomFolioPayment: (input: AddRoomFolioPaymentInput) => invokeWhenUnlocked<DesktopRoomFolioMutationResult>("roomFolio:addPayment", input),
  voidRoomFolioPayment: (paymentId: string) => invokeWhenUnlocked<DesktopRoomFolioMutationResult>("roomFolio:voidPayment", paymentId),
  checkoutRoomFolio: (input: CheckoutRoomFolioInput) => invokeWhenUnlocked<DesktopRoomFolioMutationResult>("roomFolio:checkout", input),
  onDashboardDataChanged: (listener: (data: DesktopDashboardData) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: DesktopDashboardData) => listener(data);
    ipcRenderer.on("dashboard:dataChanged", handler);
    return () => ipcRenderer.removeListener("dashboard:dataChanged", handler);
  },
  getSyncStatus: () => ipcRenderer.invoke("sync:getStatus"),
  testWebConnection: (input: WebConnectionTestInput) => ipcRenderer.invoke("sync:testConnection", input),
  runSyncNow: () => ipcRenderer.invoke("sync:runNow"),
  setAutoSyncEnabled: (enabled: boolean) => ipcRenderer.invoke("sync:setAutoEnabled", enabled),
  onSyncStatusChanged: (listener: (status: AutomaticSyncStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: AutomaticSyncStatus) => listener(status);
    ipcRenderer.on("sync:statusChanged", handler);
    return () => ipcRenderer.removeListener("sync:statusChanged", handler);
  },
  getSetupData: () => ipcRenderer.invoke("setup:getData"),
  saveInitialSetup: (input: SaveInitialSetupInput) => invokeWhenUnlocked<DesktopSetupSaveResult>("setup:saveInitial", input),
  getBusinessLayout: () => invokeWhenUnlocked<BusinessLayoutSnapshot>("businessLayout:get"),
  saveBusinessLayout: (input: SaveBusinessLayoutInput) => invokeWhenUnlocked<BusinessLayoutSaveResult>("businessLayout:save", input),
  listRoomMedia: (roomId: string) => invokeWhenUnlocked<RoomMediaAsset[]>("roomMedia:list", roomId),
  listRoomMediaCoverPreviews: () => invokeWhenUnlocked<PublicResourceCoverPreview[]>("roomMedia:coverPreviews"),
  getRoomMediaDraftState: () => invokeWhenUnlocked<RoomMediaDraftState>("roomMedia:draftState"),
  commitRoomMediaDraft: () => invokeWhenUnlocked<RoomMediaDraftResult>("roomMedia:commitDraft"),
  discardRoomMediaDraft: () => invokeWhenUnlocked<RoomMediaDraftResult>("roomMedia:discardDraft"),
  addRoomMedia: (input: AddRoomMediaInput) => invokeWhenUnlocked<RoomMediaMutationResult>("roomMedia:add", input),
  updateRoomMedia: (input: UpdateRoomMediaInput) => invokeWhenUnlocked<RoomMediaMutationResult>("roomMedia:update", input),
  deleteRoomMedia: (input: DeleteRoomMediaInput) => invokeWhenUnlocked<RoomMediaMutationResult>("roomMedia:delete", input),
  listTableMedia: (tableId: string) => invokeWhenUnlocked<TableMediaAsset[]>("tableMedia:list", tableId),
  listTableMediaCoverPreviews: () => invokeWhenUnlocked<PublicResourceCoverPreview[]>("tableMedia:coverPreviews"),
  getTableMediaDraftState: () => invokeWhenUnlocked<TableMediaDraftState>("tableMedia:draftState"),
  commitTableMediaDraft: () => invokeWhenUnlocked<TableMediaDraftResult>("tableMedia:commitDraft"),
  discardTableMediaDraft: () => invokeWhenUnlocked<TableMediaDraftResult>("tableMedia:discardDraft"),
  addTableMedia: (input: AddTableMediaInput) => invokeWhenUnlocked<TableMediaMutationResult>("tableMedia:add", input),
  updateTableMedia: (input: UpdateTableMediaInput) => invokeWhenUnlocked<TableMediaMutationResult>("tableMedia:update", input),
  deleteTableMedia: (input: DeleteTableMediaInput) => invokeWhenUnlocked<TableMediaMutationResult>("tableMedia:delete", input),
  getBusinessPublicProfile: () => invokeWhenUnlocked<BusinessPublicProfile>("businessPublicProfile:get"),
  saveBusinessPublicProfile: (input: SaveBusinessPublicProfileInput) => invokeWhenUnlocked<BusinessPublicProfileSaveResult>("businessPublicProfile:save", input),
  getGoogleReviewsSettings: () => invokeWhenUnlocked<GoogleReviewsSettings>("googleReviews:getSettings"),
  saveGoogleReviewsSettings: (input: SaveGoogleReviewsSettingsInput) => invokeWhenUnlocked<GoogleReviewsSettingsSaveResult>("googleReviews:saveSettings", input),
  testGoogleReviewsConnection: (input) => invokeWhenUnlocked<GoogleReviewsConnectionTestResult>("googleReviews:testConnection", input),
  getKbsSettings: () => invokeWhenUnlocked<KbsSettings>("kbs:getSettings"),
  saveKbsSettings: (input) => invokeWhenUnlocked<KbsSettingsSaveResult>("kbs:saveSettings", input),
  testKbsConnection: (input) => invokeWhenUnlocked<KbsConnectionTestResult>("kbs:testConnection", input),
  markKbsNotificationSentExternally: (notificationId) => invokeWhenUnlocked<DesktopStatusUpdateResult>("kbs:markNotificationSentExternally", notificationId),
  retryKbsNotification: (notificationId) => invokeWhenUnlocked<DesktopStatusUpdateResult>("kbs:retryNotification", notificationId),
  sendKbsNotification: (notificationId) => invokeWhenUnlocked<DesktopKbsDeliveryMutationResult>("kbs:sendNotification", notificationId),
  registerKbsWebview: (webContentsId) => ipcRenderer.send("kbs:registerWebview", webContentsId),
  unregisterKbsWebview: (webContentsId) => ipcRenderer.send("kbs:unregisterWebview", webContentsId),
  inspectEgmKbsSession: () => invokeWhenUnlocked<EgmKbsSessionResult>("kbs:inspectEgmSession"),
  prepareStoredEgmKbsLogin: () => invokeWhenUnlocked<EgmKbsSessionResult>("kbs:prepareStoredEgmLogin"),
  prepareEgmKbsLogin: (input) => invokeWhenUnlocked<EgmKbsSessionResult>("kbs:prepareEgmLogin", input),
  geocodeBusinessAddress: (address: string) => invokeWhenUnlocked<BusinessLocationGeocodeResponse>("businessLocation:geocodeAddress", address),
  getBusinessCapabilitySnapshot: () => invokeWhenUnlocked<BusinessCapabilitySnapshot>("capability:getSnapshot"),
  setBusinessCapability: (capability: BusinessCapability, enabled: boolean) => invokeWhenUnlocked<BusinessCapabilitySnapshot>("capability:set", capability, enabled),
  clearBusinessCapabilityOverride: (capability: BusinessCapability) => invokeWhenUnlocked<BusinessCapabilitySnapshot>("capability:clearOverride", capability),
  applyBusinessProfile: (profileId: string, preserveUserOverrides = true) => invokeWhenUnlocked<BusinessCapabilitySnapshot>("capability:applyProfile", profileId, preserveUserOverrides),
  commerce: {
    getSnapshot: () => invokeWhenUnlocked<CommerceStoreSnapshot>("commerce:getSnapshot"),
    listCategories: (options) => invokeWhenUnlocked<CatalogCategory[]>("commerce:category:list", options),
    getCategory: (categoryId) => invokeWhenUnlocked<CatalogCategory | null>("commerce:category:get", categoryId),
    saveCategory: (input) => invokeCommerceMutation<CatalogCategory>("commerce:category:save", input),
    deleteCategory: (categoryId) => invokeCommerceMutation<DeleteCatalogCategoryResult>("commerce:category:delete", categoryId),
    listProducts: (options) => invokeWhenUnlocked<CatalogProduct[]>("commerce:product:list", options),
    saveProduct: (input) => invokeCommerceMutation<CatalogProduct>("commerce:product:save", input),
    findProductByBarcode: (barcode) => invokeWhenUnlocked<CatalogProduct | null>("commerce:product:findByBarcode", barcode),
    lookupExternalProductByBarcode: (barcode, mode = "manual") => invokeWhenUnlocked<ProductLookupResponse>("commerce:product:lookupExternal", barcode, mode),
    previewExternalProductImage: (provider, imageUrl) => invokeWhenUnlocked<string>("commerce:product:previewExternalImage", provider, imageUrl),
    getProductImageDataUrl: (productId) => invokeWhenUnlocked<string>("commerce:product:imageDataUrl", productId),
    getInventoryBalance: (productId, locationId) => invokeWhenUnlocked<InventoryBalance>("commerce:inventory:getBalance", productId, locationId),
    listInventoryMovements: (options) => invokeWhenUnlocked<InventoryMovement[]>("commerce:inventory:listMovements", options),
    applyInventoryMovement: (input) => invokeCommerceMutation<InventoryMovement>("commerce:inventory:applyMovement", input),
    setInventoryCount: (input) => invokeCommerceMutation<InventoryCountResult>("commerce:inventory:setCount", input),
    createPaidSale: (input) => invokeCommerceMutation<CommerceSale>("commerce:sale:createPaid", input),
    listOrders: (options) => invokeWhenUnlocked<CommerceOrder[]>("commerce:order:list", options),
    getOrder: (orderId) => invokeWhenUnlocked<CommerceOrderDetail | null>("commerce:order:get", orderId),
    createOrder: (input) => invokeCommerceMutation<CommerceOrderDetail>("commerce:order:create", input),
    updateOrderStatus: (input) => invokeCommerceMutation<CommerceOrderDetail>("commerce:order:updateStatus", input),
    listCustomerCreditAccounts: (input) => invokeWhenUnlocked("commerce:customerCredit:list", input),
    getCustomerCreditAccount: (customerId) => invokeWhenUnlocked("commerce:customerCredit:get", customerId),
    prepareCustomerCreditWhatsApp: (input) => invokeWhenUnlocked("commerce:customerCredit:prepareWhatsApp", input),
    listCustomerCreditEntries: (customerId, input) => invokeWhenUnlocked("commerce:customerCredit:entries", customerId, input),
    createCustomerCreditSale: (input) => invokeCommerceMutation<CommerceSale>("commerce:customerCredit:sale", input),
    recordCustomerCreditPayment: (input) => invokeCommerceMutation<CustomerCreditEntry>("commerce:customerCredit:payment", input),
    addCustomerCreditAdjustment: (input) => invokeCommerceMutation<CustomerCreditEntry>("commerce:customerCredit:adjustment", input),
    listCartDrafts: (options) => invokeWhenUnlocked<CommerceSaleDraftDetail[]>("commerce:cartDraft:list", options),
    getCartDraft: (draftId) => invokeWhenUnlocked<CommerceSaleDraftDetail | null>("commerce:cartDraft:get", draftId),
    loadCartDraftForQuickSale: (draftId) => invokeWhenUnlocked<MarketCartDraftLoadResult>("commerce:cartDraft:loadForQuickSale", draftId),
    markCartDraftReviewed: (draftId) => invokeCommerceMutation<CommerceSaleDraft>("commerce:cartDraft:markReviewed", draftId),
    consumePendingBarcodeScans: (options) => invokeWhenUnlocked<MarketBarcodeScanEvent[]>("commerce:barcodeScan:consumePending", options),
    setBarcodeScanMode: (active) => invokeWhenUnlocked<MarketBarcodeFastPullState>("sync:setMarketBarcodeFastPull", active),
    listSuppliers: (options) => invokeWhenUnlocked<CommerceSupplier[]>("commerce:supplier:list", options),
    saveSupplier: (input) => invokeCommerceMutation<CommerceSupplier>("commerce:supplier:save", input),
    listPurchaseOrders: (options) => invokeWhenUnlocked<CommercePurchaseOrder[]>("commerce:purchase:list", options),
    getPurchaseOrder: (purchaseOrderId) => invokeWhenUnlocked<CommercePurchaseOrderDetail | null>("commerce:purchase:get", purchaseOrderId),
    receivePurchase: (input) => invokeCommerceMutation<CommercePurchaseOrderDetail>("commerce:purchase:receive", input)
  },
  setAndroidDeviceRole: (deviceId: string, role: "admin" | "staff") => ipcRenderer.invoke("androidDevice:setRole", deviceId, role),
  setAndroidDevicePermissionGroupsBatch: (updates: DesktopAndroidPermissionGroupsUpdate[]) => ipcRenderer.invoke("androidDevice:setPermissionGroupsBatch", updates),
  setAndroidDeviceActive: (deviceId: string, active: boolean) => ipcRenderer.invoke("androidDevice:setActive", deviceId, active),
  resetAndroidDevicePermissions: (deviceId: string) => ipcRenderer.invoke("androidDevice:resetPermissions", deviceId),
  revokeAndroidDevice: (deviceId: string) => ipcRenderer.invoke("androidDevice:revoke", deviceId),
  listAndroidInstallDevices: () => ipcRenderer.invoke("androidDevice:listInstallDevices"),
  installAndroidApp: (serial: string) => ipcRenderer.invoke("androidDevice:install", serial),
  provisionAndroidApp: (serial: string) => ipcRenderer.invoke("androidDevice:provision", serial),
  createManualRequest: (input: CreateManualRequestInput) => ipcRenderer.invoke("request:createManual", input),
  convertRequestToReservation: (requestId: string) => ipcRenderer.invoke("request:convertToReservation", requestId),
  updateRequestStatus: (input: UpdateRequestStatusInput) => ipcRenderer.invoke("request:updateStatus", input),
  deleteRequest: (requestId: string) => ipcRenderer.invoke("request:delete", requestId),
  deleteCustomer: (customerId: string) => ipcRenderer.invoke("customer:delete", customerId),
  saveCustomer: (input: SaveCustomerInput) => ipcRenderer.invoke("customer:save", input),
  prepareBirthdayWhatsApp: (customerId: string) => ipcRenderer.invoke("birthday:prepareWhatsApp", customerId),
  assignCustomerRoom: (input: AssignCustomerRoomInput) => ipcRenderer.invoke("customer:assignRoom", input),
  addStayGuest: (input: StayGuestInput) => invokeWhenUnlocked<DesktopCustomerMutationResult>("customer:addStayGuest", input),
  changeStayPrimary: (input: StayGuestInput) => invokeWhenUnlocked<DesktopCustomerMutationResult>("customer:changeStayPrimary", input),
  checkoutStayGuest: (input: CheckoutStayGuestInput) => invokeWhenUnlocked<DesktopCustomerMutationResult>("customer:checkoutStayGuest", input),
  moveStayRoom: (input: MoveStayRoomInput) => invokeWhenUnlocked<DesktopCustomerMutationResult>("customer:moveStayRoom", input),
  createStayFromReservation: (input: CreateStayFromReservationInput) => invokeWhenUnlocked<DesktopCustomerMutationResult>("customer:createStayFromReservation", input),
  checkInStay: (stayId: string) => invokeWhenUnlocked<DesktopCustomerMutationResult>("customer:checkInStay", stayId),
  checkoutStay: (stayId: string) => invokeWhenUnlocked<DesktopCustomerMutationResult>("customer:checkoutStay", stayId),
  updateCustomerRoomStayStatus: (input: UpdateCustomerRoomStayStatusInput) => ipcRenderer.invoke("customer:updateRoomStayStatus", input),
  analyzeIdentityImage: (input: DesktopIdentityImageAnalyzeInput) => ipcRenderer.invoke("customer:analyzeIdentityImage", input),
  markWhatsAppMessageSent: (input: MarkWhatsAppMessageSentInput) => ipcRenderer.invoke("whatsapp:markMessageSent", input),
  deleteWhatsAppMessage: (input: DeleteWhatsAppMessageInput) => ipcRenderer.invoke("whatsapp:deleteMessage", input),
  updateRoomStatus: (input: UpdateRoomStatusInput) => ipcRenderer.invoke("room:updateStatus", input),
  updateTableStatus: (input: UpdateTableStatusInput) => ipcRenderer.invoke("table:updateStatus", input),
  assignTableCustomer: (input: AssignTableCustomerInput) => invokeWhenUnlocked<DesktopStatusUpdateResult>("table:assignCustomer", input),
  listTableOrders: () => ipcRenderer.invoke("tableOrder:list"),
  getActiveTableOrder: (tableId: string) => ipcRenderer.invoke("tableOrder:getActive", tableId),
  openTableOrder: (tableId: string) => ipcRenderer.invoke("tableOrder:open", tableId),
  addTableOrderItem: (orderId: string, menuItemId: string, quantity: number, note: string) => ipcRenderer.invoke("tableOrder:addItem", { orderId, menuItemId, quantity, note }),
  updateTableOrderItemQuantity: (itemId: string, quantity: number) => ipcRenderer.invoke("tableOrder:updateItemQuantity", { itemId, quantity }),
  updateTableOrderItemNote: (itemId: string, note: string) => ipcRenderer.invoke("tableOrder:updateItemNote", { itemId, note }),
  updateTableOrderDiscount: (orderId: string, discountTotal: number) => ipcRenderer.invoke("tableOrder:updateDiscount", { orderId, discountTotal }),
  removeTableOrderItem: (itemId: string) => ipcRenderer.invoke("tableOrder:removeItem", itemId),
  updateTableOrderStatus: (orderId: string, status: string) => ipcRenderer.invoke("tableOrder:updateStatus", { orderId, status }),
  closeTableOrder: (orderId: string, status: "paid" | "cancelled") => ipcRenderer.invoke("tableOrder:close", { orderId, status }),
  recalculateTableOrderTotal: (orderId: string) => ipcRenderer.invoke("tableOrder:recalculate", orderId),
  saveManualReservation: (input: SaveManualReservationInput) => ipcRenderer.invoke("reservation:saveManual", input),
  saveManualRestaurantReservation: (input: SaveManualRestaurantReservationInput) => ipcRenderer.invoke("reservation:saveManualRestaurant", input),
  updateReservationStatus: (input: UpdateReservationStatusInput) => ipcRenderer.invoke("reservation:updateStatus", input),
  saveDailyTask: (input: SaveDailyTaskInput) => ipcRenderer.invoke("dailyTask:save", input),
  deleteDailyTask: (taskId: string) => ipcRenderer.invoke("dailyTask:delete", taskId),
  updateDailyTaskStatus: (input: UpdateDailyTaskStatusInput) => ipcRenderer.invoke("dailyTask:updateStatus", input),
  createManualBackup: () => invokeWhenUnlocked<DesktopBackupCreateResult>("dataMaintenance:createBackup"),
  listLocalBackups: () => invokeWhenUnlocked<DesktopBackupListResult>("dataMaintenance:listBackups"),
  openLocalBackupDirectory: () => invokeWhenUnlocked<DesktopBackupActionResult>("dataMaintenance:openBackupDirectory"),
  openLocalBackupItemDirectory: (backupId: string) => invokeWhenUnlocked<DesktopBackupActionResult>("dataMaintenance:openBackupItemDirectory", backupId),
  deleteLocalBackup: (backupId: string) => invokeWhenUnlocked<DesktopBackupActionResult>("dataMaintenance:deleteBackup", backupId),
  restoreLocalBackup: (backupId: string) => invokeWhenUnlocked<DesktopDataMaintenanceResult>("dataMaintenance:restoreBackup", backupId),
  onDataMaintenanceConfirmation: (listener) => {
    const handler = async (_event: Electron.IpcRendererEvent, requestId: string, request: DataMaintenanceConfirmation) => {
      let approved = false;
      try {
        approved = await listener(request);
        const status: AppLockStatus = await ipcRenderer.invoke("appLock:getStatus");
        approved = approved && !status.locked;
      } catch { approved = false; }
      ipcRenderer.send("dataMaintenance:confirmationResponse", requestId, approved);
    };
    ipcRenderer.on("dataMaintenance:confirmationRequested", handler);
    return () => ipcRenderer.removeListener("dataMaintenance:confirmationRequested", handler);
  },
  resetLocalData: () => invokeWhenUnlocked<DesktopDataMaintenanceResult>("dataMaintenance:resetLocalData"),
  createOwnerReplySuggestion: (requestId: string) => ipcRenderer.invoke("ai:createOwnerReplySuggestion", requestId),
  rewriteOwnerReplySuggestion: (input: RewriteRequestAiSuggestionInput) => ipcRenderer.invoke("ai:rewriteOwnerReplySuggestion", input),
  generateDailyBusinessEvaluation: () => ipcRenderer.invoke("ai:generateDailyBusinessEvaluation"),
  testAiConnection: (input: AiConnectionTestInput) => ipcRenderer.invoke("ai:testConnection", input),
  revealAiApiKey: (service: string) => ipcRenderer.invoke("ai:revealApiKey", service),
  pullRequests: () => ipcRenderer.invoke("sync:pullRequests"),
  markRequestsSynced: (requestIds: string[]) => ipcRenderer.invoke("sync:markRequestsSynced", requestIds),
  pushMenu: () => ipcRenderer.invoke("sync:pushMenu"),
  pushAndroidSnapshot: () => ipcRenderer.invoke("sync:pushAndroidSnapshot"),
  pushAiSettings: () => ipcRenderer.invoke("sync:pushAiSettings"),
  getQrMenuWebPublication: () => ipcRenderer.invoke("menu:getWebPublication"),
  setQrMenuWebPublication: (enabled: boolean) => ipcRenderer.invoke("menu:setWebPublication", enabled),
  saveMenuCategory: (input: SaveMenuCategoryInput) => ipcRenderer.invoke("menu:saveCategory", input),
  saveMenuItem: (input: SaveMenuItemInput) => ipcRenderer.invoke("menu:saveItem", input),
  reorderMenuRecords: (input: ReorderMenuRecordsInput) => ipcRenderer.invoke("menu:reorder", input),
  deleteMenuCategory: (categoryId: string) => ipcRenderer.invoke("menu:deleteCategory", categoryId),
  deleteMenuItem: (itemId: string) => ipcRenderer.invoke("menu:deleteItem", itemId),
  analyzeStockImage: (input: DesktopStockImageAnalyzeInput) => ipcRenderer.invoke("stockImage:analyze", input),
  cancelStockImageAnalysis: (importId: string) => ipcRenderer.invoke("stockImage:cancel", importId),
  applyStockImageImport: (input: ApplyStockImageImportInput) => ipcRenderer.invoke("stockImage:apply", input),
  getUpdateStatus: () => ipcRenderer.invoke("update:getStatus"),
  checkForUpdates: (force = true) => ipcRenderer.invoke("update:check", force),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  saveUpdatePreferences: (input: DesktopUpdatePreferencesInput) => ipcRenderer.invoke("update:savePreferences", input),
  restartAndInstallUpdate: () => ipcRenderer.invoke("update:restartAndInstall"),
  onUpdateStatusChanged: (listener: (status: DesktopUpdateStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: DesktopUpdateStatus) => listener(status);
    ipcRenderer.on("update:statusChanged", handler);
    return () => ipcRenderer.removeListener("update:statusChanged", handler);
  },
  openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url)
};

contextBridge.exposeInMainWorld("yardimciDesktop", bridge);
