import { contextBridge, ipcRenderer, webFrame } from "electron";
import type {
  BusinessCapability,
  BusinessPublicProfile,
  CatalogCategory,
  CatalogProduct,
  CatalogProductDraft,
  CommercePurchaseOrder,
  CommercePurchaseOrderDetail,
  CommerceSale,
  CommerceSaleDraft,
  CommerceSaleDraftDetail,
  CommerceSupplier,
  InventoryBalance,
  InventoryMovement,
  MarketBarcodeScanEvent,
  MarketCartDraftLoadResult,
  SaveBusinessPublicProfileInput
} from "@yardimci-asistan/shared";
import type { AndroidPermissionGroups, PullRequestsResult, MarkRequestsSyncedResult, PushAiSettingsResult, PushAndroidSnapshotResult, PushMenuResult } from "@yardimci-asistan/sync-core";
import type {
  DesktopDashboardData,
  DesktopSetupData,
  DesktopSetupSaveResult,
  SaveInitialSetupInput,
  SaveMenuCategoryInput,
  SaveMenuItemInput,
  DesktopMenuSaveResult,
  CreateManualRequestInput,
  CreateManualRequestResult,
  RequestReservationConversionResult,
  RequestAiSuggestionResult,
  GenerateAiWorkspaceInput,
  GenerateAiWorkspaceResult,
  SaveAiWorkspaceResultInput,
  SaveAiWorkspaceResult,
  AiWorkspaceHistoryEntry,
  DesktopAndroidDeviceMutationResult,
  DesktopStatusUpdateResult,
  UpdateRequestStatusInput,
  UpdateRoomStatusInput,
  UpdateTableStatusInput,
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
  DesktopBackupActionResult,
  DesktopBackupCreateResult,
  DesktopBackupListResult,
  DesktopDataMaintenanceResult
} from "./data-maintenance";
import type {
  AddPensionPaymentInput,
  DesktopFinanceData,
  DesktopFinanceMutationResult,
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
  SetRoomNightlyPriceInput,
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
import type { BusinessCapabilitySnapshot } from "./business-capability-store";
import type { BusinessPublicProfileSaveResult } from "./business-public-profile";
import type { BusinessLocationGeocodeResponse } from "./business-location-geocode";
import type { DesktopCommerceBridge } from "./commerce-ipc-contract";
import type { MarketBarcodeFastPullState } from "./commerce-ipc-contract";
import type { DeleteCatalogCategoryResult } from "./commerce-category-store";
import type { CommerceStoreSnapshot } from "./commerce-store";
import type { InventoryCountResult } from "./commerce-runtime";

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
  getFinanceData: (limit?: number) => Promise<DesktopFinanceData>;
  saveManualFinanceEntry: (input: SaveManualFinanceEntryInput) => Promise<DesktopFinanceMutationResult>;
  deleteManualFinanceEntry: (entryId: string) => Promise<DesktopFinanceMutationResult>;
  setReservationAgreedTotal: (input: SetReservationAgreedTotalInput) => Promise<DesktopFinanceMutationResult>;
  addPensionPayment: (input: AddPensionPaymentInput) => Promise<DesktopFinanceMutationResult>;
  getRoomFolioData: () => Promise<DesktopRoomFolioData>;
  setRoomNightlyPrice: (input: SetRoomNightlyPriceInput) => Promise<DesktopRoomFolioMutationResult>;
  openRoomFolio: (stayId: string) => Promise<DesktopRoomFolioMutationResult>;
  updateRoomFolioDetails: (input: UpdateRoomFolioDetailsInput) => Promise<DesktopRoomFolioMutationResult>;
  addRoomFolioMenuItem: (input: AddRoomFolioMenuItemInput) => Promise<DesktopRoomFolioMutationResult>;
  updateRoomFolioItemQuantity: (input: UpdateRoomFolioItemQuantityInput) => Promise<DesktopRoomFolioMutationResult>;
  addRoomFolioManualItem: (input: AddRoomFolioManualItemInput) => Promise<DesktopRoomFolioMutationResult>;
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
  getBusinessPublicProfile: () => Promise<BusinessPublicProfile>;
  saveBusinessPublicProfile: (input: SaveBusinessPublicProfileInput) => Promise<BusinessPublicProfileSaveResult>;
  geocodeBusinessAddress: (address: string) => Promise<BusinessLocationGeocodeResponse>;
  getBusinessCapabilitySnapshot: () => Promise<BusinessCapabilitySnapshot>;
  setBusinessCapability: (capability: BusinessCapability, enabled: boolean) => Promise<BusinessCapabilitySnapshot>;
  clearBusinessCapabilityOverride: (capability: BusinessCapability) => Promise<BusinessCapabilitySnapshot>;
  applyBusinessProfile: (profileId: string, preserveUserOverrides?: boolean) => Promise<BusinessCapabilitySnapshot>;
  commerce: DesktopCommerceBridge;
  setAndroidDeviceRole: (deviceId: string, role: "admin" | "staff") => Promise<DesktopAndroidDeviceMutationResult>;
  setAndroidDevicePermissionGroups: (deviceId: string, groups: AndroidPermissionGroups) => Promise<DesktopAndroidDeviceMutationResult>;
  setAndroidDeviceActive: (deviceId: string, active: boolean) => Promise<DesktopAndroidDeviceMutationResult>;
  resetAndroidDevicePermissions: (deviceId: string) => Promise<DesktopAndroidDeviceMutationResult>;
  revokeAndroidDevice: (deviceId: string) => Promise<DesktopAndroidDeviceMutationResult>;
  createManualRequest: (input: CreateManualRequestInput) => Promise<CreateManualRequestResult>;
  convertRequestToReservation: (requestId: string) => Promise<RequestReservationConversionResult>;
  updateRequestStatus: (input: UpdateRequestStatusInput) => Promise<DesktopStatusUpdateResult>;
  deleteRequest: (requestId: string) => Promise<DesktopStatusUpdateResult>;
  deleteCustomer: (customerId: string) => Promise<DesktopStatusUpdateResult>;
  saveCustomer: (input: SaveCustomerInput) => Promise<DesktopCustomerMutationResult>;
  prepareBirthdayWhatsApp: (customerId: string) => Promise<DesktopBirthdayPrepareResult>;
  registerWhatsAppWebview: (webContentsId: number) => void;
  unregisterWhatsAppWebview: (webContentsId: number) => void;
  setWhatsAppUserActivity: (active: boolean) => void;
  assignCustomerRoom: (input: AssignCustomerRoomInput) => Promise<DesktopCustomerMutationResult>;
  updateCustomerRoomStayStatus: (input: UpdateCustomerRoomStayStatusInput) => Promise<DesktopCustomerMutationResult>;
  analyzeIdentityImage: (input: DesktopIdentityImageAnalyzeInput) => Promise<DesktopIdentityImageAnalyzeResult>;
  markWhatsAppMessageSent: (input: MarkWhatsAppMessageSentInput) => Promise<DesktopStatusUpdateResult>;
  deleteWhatsAppMessage: (input: DeleteWhatsAppMessageInput) => Promise<DesktopStatusUpdateResult>;
  updateRoomStatus: (input: UpdateRoomStatusInput) => Promise<DesktopStatusUpdateResult>;
  updateTableStatus: (input: UpdateTableStatusInput) => Promise<DesktopStatusUpdateResult>;
  listTableOrders: () => Promise<DesktopTableOrder[]>;
  getActiveTableOrder: (tableId: string) => Promise<DesktopTableOrder | null>;
  openTableOrder: (tableId: string) => Promise<DesktopTableOrderResult>;
  addTableOrderItem: (orderId: string, menuItemId: string, quantity: number, note: string) => Promise<DesktopTableOrderResult>;
  updateTableOrderItemQuantity: (itemId: string, quantity: number) => Promise<DesktopTableOrderResult>;
  updateTableOrderItemNote: (itemId: string, note: string) => Promise<DesktopTableOrderResult>;
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
  createOwnerReplySuggestion: (requestId: string) => Promise<RequestAiSuggestionResult>;
  generateAiWorkspace: (input: GenerateAiWorkspaceInput) => Promise<GenerateAiWorkspaceResult>;
  getAiWorkspaceHistory: (limit?: number) => Promise<AiWorkspaceHistoryEntry[]>;
  saveAiWorkspaceResult: (input: SaveAiWorkspaceResultInput) => Promise<SaveAiWorkspaceResult>;
  testAiConnection: (input: AiConnectionTestInput) => Promise<AiConnectionTestResult>;
  revealAiApiKey: (service: string) => Promise<AiApiKeyRevealResult>;
  pullRequests: () => Promise<PullRequestsResult>;
  markRequestsSynced: (requestIds: string[]) => Promise<MarkRequestsSyncedResult>;
  pushMenu: () => Promise<PushMenuResult>;
  pushAndroidSnapshot: () => Promise<PushAndroidSnapshotResult>;
  pushAiSettings: () => Promise<PushAiSettingsResult>;
  saveMenuCategory: (input: SaveMenuCategoryInput) => Promise<DesktopMenuSaveResult>;
  saveMenuItem: (input: SaveMenuItemInput) => Promise<DesktopMenuSaveResult>;
  deleteMenuCategory: (categoryId: string) => Promise<DesktopStatusUpdateResult>;
  deleteMenuItem: (itemId: string) => Promise<DesktopStatusUpdateResult>;
  analyzeStockImage: (input: DesktopStockImageAnalyzeInput) => Promise<DesktopStockImageAnalyzeResult>;
  cancelStockImageAnalysis: (importId: string) => Promise<boolean>;
  applyStockImageImport: (input: ApplyStockImageImportInput) => Promise<DesktopStockImageApplyResult>;
  openExternal: (url: string) => Promise<boolean>;
}

async function invokeWhenUnlocked<T>(channel: string, ...args: unknown[]): Promise<T> {
  const status = await ipcRenderer.invoke("appLock:getStatus") as AppLockStatus;
  if (status.locked) throw new Error("Uygulama kilitli. Devam etmek için kilidi açın.");
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

const bridge: DesktopBridge = {
  setUiScale: (scale: number) => webFrame.setZoomFactor(scale),
  getAppLockStatus: () => ipcRenderer.invoke("appLock:getStatus"),
  lockApp: () => ipcRenderer.invoke("appLock:lock"),
  unlockApp: (password: string) => ipcRenderer.invoke("appLock:unlock", password),
  updateAppPassword: (input: UpdateAppPasswordInput) => ipcRenderer.invoke("appLock:updatePassword", input),
  resetAppPassword: (webSecurityKey: string) => ipcRenderer.invoke("appLock:resetWithWebSecurityKey", webSecurityKey),
  getBootstrapData: () => ipcRenderer.invoke("app:getBootstrapData"),
  getDashboardData: () => ipcRenderer.invoke("dashboard:getData"),
  getReportData: (input: DesktopReportRangeInput) => ipcRenderer.invoke("report:getData", input),
  generateReportAiComment: (input: GenerateDesktopReportAiInput) => ipcRenderer.invoke("report:generateAiComment", input),
  getFinanceData: (limit?: number) => invokeWhenUnlocked<DesktopFinanceData>("finance:getData", limit),
  saveManualFinanceEntry: (input: SaveManualFinanceEntryInput) => invokeWhenUnlocked<DesktopFinanceMutationResult>("finance:saveManualEntry", input),
  deleteManualFinanceEntry: (entryId: string) => invokeWhenUnlocked<DesktopFinanceMutationResult>("finance:deleteManualEntry", entryId),
  setReservationAgreedTotal: (input: SetReservationAgreedTotalInput) => invokeWhenUnlocked<DesktopFinanceMutationResult>("finance:setReservationTotal", input),
  addPensionPayment: (input: AddPensionPaymentInput) => invokeWhenUnlocked<DesktopFinanceMutationResult>("finance:addPensionPayment", input),
  getRoomFolioData: () => invokeWhenUnlocked<DesktopRoomFolioData>("roomFolio:getData"),
  setRoomNightlyPrice: (input: SetRoomNightlyPriceInput) => invokeWhenUnlocked<DesktopRoomFolioMutationResult>("roomFolio:setRoomNightlyPrice", input),
  openRoomFolio: (stayId: string) => invokeWhenUnlocked<DesktopRoomFolioMutationResult>("roomFolio:open", stayId),
  updateRoomFolioDetails: (input: UpdateRoomFolioDetailsInput) => invokeWhenUnlocked<DesktopRoomFolioMutationResult>("roomFolio:updateDetails", input),
  addRoomFolioMenuItem: (input: AddRoomFolioMenuItemInput) => invokeWhenUnlocked<DesktopRoomFolioMutationResult>("roomFolio:addMenuItem", input),
  updateRoomFolioItemQuantity: (input: UpdateRoomFolioItemQuantityInput) => invokeWhenUnlocked<DesktopRoomFolioMutationResult>("roomFolio:updateItemQuantity", input),
  addRoomFolioManualItem: (input: AddRoomFolioManualItemInput) => invokeWhenUnlocked<DesktopRoomFolioMutationResult>("roomFolio:addManualItem", input),
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
  getBusinessPublicProfile: () => invokeWhenUnlocked<BusinessPublicProfile>("businessPublicProfile:get"),
  saveBusinessPublicProfile: (input: SaveBusinessPublicProfileInput) => invokeWhenUnlocked<BusinessPublicProfileSaveResult>("businessPublicProfile:save", input),
  geocodeBusinessAddress: (address: string) => invokeWhenUnlocked<BusinessLocationGeocodeResponse>("businessLocation:geocodeAddress", address),
  getBusinessCapabilitySnapshot: () => invokeWhenUnlocked<BusinessCapabilitySnapshot>("capability:getSnapshot"),
  setBusinessCapability: (capability: BusinessCapability, enabled: boolean) => invokeWhenUnlocked<BusinessCapabilitySnapshot>("capability:set", capability, enabled),
  clearBusinessCapabilityOverride: (capability: BusinessCapability) => invokeWhenUnlocked<BusinessCapabilitySnapshot>("capability:clearOverride", capability),
  applyBusinessProfile: (profileId: string, preserveUserOverrides = true) => invokeWhenUnlocked<BusinessCapabilitySnapshot>("capability:applyProfile", profileId, preserveUserOverrides),
  commerce: {
    getSnapshot: () => invokeWhenUnlocked<CommerceStoreSnapshot>("commerce:getSnapshot"),
    listCategories: (options) => invokeWhenUnlocked<CatalogCategory[]>("commerce:category:list", options),
    getCategory: (categoryId) => invokeWhenUnlocked<CatalogCategory | null>("commerce:category:get", categoryId),
    saveCategory: (input) => invokeWhenUnlocked<CatalogCategory>("commerce:category:save", input),
    deleteCategory: (categoryId) => invokeWhenUnlocked<DeleteCatalogCategoryResult>("commerce:category:delete", categoryId),
    listProducts: (options) => invokeWhenUnlocked<CatalogProduct[]>("commerce:product:list", options),
    saveProduct: (input) => invokeWhenUnlocked<CatalogProduct>("commerce:product:save", input),
    findProductByBarcode: (barcode) => invokeWhenUnlocked<CatalogProduct | null>("commerce:product:findByBarcode", barcode),
    getInventoryBalance: (productId, locationId) => invokeWhenUnlocked<InventoryBalance>("commerce:inventory:getBalance", productId, locationId),
    listInventoryMovements: (options) => invokeWhenUnlocked<InventoryMovement[]>("commerce:inventory:listMovements", options),
    applyInventoryMovement: (input) => invokeWhenUnlocked<InventoryMovement>("commerce:inventory:applyMovement", input),
    setInventoryCount: (input) => invokeWhenUnlocked<InventoryCountResult>("commerce:inventory:setCount", input),
    createPaidSale: (input) => invokeWhenUnlocked<CommerceSale>("commerce:sale:createPaid", input),
    listCustomerCreditAccounts: (input) => invokeWhenUnlocked("commerce:customerCredit:list", input),
    getCustomerCreditAccount: (customerId) => invokeWhenUnlocked("commerce:customerCredit:get", customerId),
    prepareCustomerCreditWhatsApp: (input) => invokeWhenUnlocked("commerce:customerCredit:prepareWhatsApp", input),
    listCustomerCreditEntries: (customerId, input) => invokeWhenUnlocked("commerce:customerCredit:entries", customerId, input),
    createCustomerCreditSale: (input) => invokeWhenUnlocked("commerce:customerCredit:sale", input),
    recordCustomerCreditPayment: (input) => invokeWhenUnlocked("commerce:customerCredit:payment", input),
    addCustomerCreditAdjustment: (input) => invokeWhenUnlocked("commerce:customerCredit:adjustment", input),
    listProductDrafts: (options) => invokeWhenUnlocked<CatalogProductDraft[]>("commerce:productDraft:list", options),
    markProductDraftReviewed: (draftId) => invokeWhenUnlocked<CatalogProductDraft>("commerce:productDraft:markReviewed", draftId),
    listCartDrafts: (options) => invokeWhenUnlocked<CommerceSaleDraftDetail[]>("commerce:cartDraft:list", options),
    getCartDraft: (draftId) => invokeWhenUnlocked<CommerceSaleDraftDetail | null>("commerce:cartDraft:get", draftId),
    loadCartDraftForQuickSale: (draftId) => invokeWhenUnlocked<MarketCartDraftLoadResult>("commerce:cartDraft:loadForQuickSale", draftId),
    markCartDraftReviewed: (draftId) => invokeWhenUnlocked<CommerceSaleDraft>("commerce:cartDraft:markReviewed", draftId),
    consumePendingBarcodeScans: (options) => invokeWhenUnlocked<MarketBarcodeScanEvent[]>("commerce:barcodeScan:consumePending", options),
    setBarcodeScanMode: (active) => invokeWhenUnlocked<MarketBarcodeFastPullState>("sync:setMarketBarcodeFastPull", active),
    listSuppliers: (options) => invokeWhenUnlocked<CommerceSupplier[]>("commerce:supplier:list", options),
    saveSupplier: (input) => invokeWhenUnlocked<CommerceSupplier>("commerce:supplier:save", input),
    listPurchaseOrders: (options) => invokeWhenUnlocked<CommercePurchaseOrder[]>("commerce:purchase:list", options),
    getPurchaseOrder: (purchaseOrderId) => invokeWhenUnlocked<CommercePurchaseOrderDetail | null>("commerce:purchase:get", purchaseOrderId),
    receivePurchase: (input) => invokeWhenUnlocked<CommercePurchaseOrderDetail>("commerce:purchase:receive", input)
  },
  setAndroidDeviceRole: (deviceId: string, role: "admin" | "staff") => ipcRenderer.invoke("androidDevice:setRole", deviceId, role),
  setAndroidDevicePermissionGroups: (deviceId: string, groups: AndroidPermissionGroups) => ipcRenderer.invoke("androidDevice:setPermissionGroups", deviceId, groups),
  setAndroidDeviceActive: (deviceId: string, active: boolean) => ipcRenderer.invoke("androidDevice:setActive", deviceId, active),
  resetAndroidDevicePermissions: (deviceId: string) => ipcRenderer.invoke("androidDevice:resetPermissions", deviceId),
  revokeAndroidDevice: (deviceId: string) => ipcRenderer.invoke("androidDevice:revoke", deviceId),
  createManualRequest: (input: CreateManualRequestInput) => ipcRenderer.invoke("request:createManual", input),
  convertRequestToReservation: (requestId: string) => ipcRenderer.invoke("request:convertToReservation", requestId),
  updateRequestStatus: (input: UpdateRequestStatusInput) => ipcRenderer.invoke("request:updateStatus", input),
  deleteRequest: (requestId: string) => ipcRenderer.invoke("request:delete", requestId),
  deleteCustomer: (customerId: string) => ipcRenderer.invoke("customer:delete", customerId),
  saveCustomer: (input: SaveCustomerInput) => ipcRenderer.invoke("customer:save", input),
  prepareBirthdayWhatsApp: (customerId: string) => ipcRenderer.invoke("birthday:prepareWhatsApp", customerId),
  registerWhatsAppWebview: (webContentsId: number) => ipcRenderer.send("whatsapp:registerWebview", webContentsId),
  unregisterWhatsAppWebview: (webContentsId: number) => ipcRenderer.send("whatsapp:unregisterWebview", webContentsId),
  setWhatsAppUserActivity: (active: boolean) => ipcRenderer.send("whatsapp:userActivity", active),
  assignCustomerRoom: (input: AssignCustomerRoomInput) => ipcRenderer.invoke("customer:assignRoom", input),
  updateCustomerRoomStayStatus: (input: UpdateCustomerRoomStayStatusInput) => ipcRenderer.invoke("customer:updateRoomStayStatus", input),
  analyzeIdentityImage: (input: DesktopIdentityImageAnalyzeInput) => ipcRenderer.invoke("customer:analyzeIdentityImage", input),
  markWhatsAppMessageSent: (input: MarkWhatsAppMessageSentInput) => ipcRenderer.invoke("whatsapp:markMessageSent", input),
  deleteWhatsAppMessage: (input: DeleteWhatsAppMessageInput) => ipcRenderer.invoke("whatsapp:deleteMessage", input),
  updateRoomStatus: (input: UpdateRoomStatusInput) => ipcRenderer.invoke("room:updateStatus", input),
  updateTableStatus: (input: UpdateTableStatusInput) => ipcRenderer.invoke("table:updateStatus", input),
  listTableOrders: () => ipcRenderer.invoke("tableOrder:list"),
  getActiveTableOrder: (tableId: string) => ipcRenderer.invoke("tableOrder:getActive", tableId),
  openTableOrder: (tableId: string) => ipcRenderer.invoke("tableOrder:open", tableId),
  addTableOrderItem: (orderId: string, menuItemId: string, quantity: number, note: string) => ipcRenderer.invoke("tableOrder:addItem", { orderId, menuItemId, quantity, note }),
  updateTableOrderItemQuantity: (itemId: string, quantity: number) => ipcRenderer.invoke("tableOrder:updateItemQuantity", { itemId, quantity }),
  updateTableOrderItemNote: (itemId: string, note: string) => ipcRenderer.invoke("tableOrder:updateItemNote", { itemId, note }),
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
  resetLocalData: () => invokeWhenUnlocked<DesktopDataMaintenanceResult>("dataMaintenance:resetLocalData"),
  createOwnerReplySuggestion: (requestId: string) => ipcRenderer.invoke("ai:createOwnerReplySuggestion", requestId),
  generateAiWorkspace: (input: GenerateAiWorkspaceInput) => ipcRenderer.invoke("ai:generateWorkspace", input),
  getAiWorkspaceHistory: (limit?: number) => ipcRenderer.invoke("ai:getWorkspaceHistory", limit),
  saveAiWorkspaceResult: (input: SaveAiWorkspaceResultInput) => ipcRenderer.invoke("ai:saveWorkspaceResult", input),
  testAiConnection: (input: AiConnectionTestInput) => ipcRenderer.invoke("ai:testConnection", input),
  revealAiApiKey: (service: string) => ipcRenderer.invoke("ai:revealApiKey", service),
  pullRequests: () => ipcRenderer.invoke("sync:pullRequests"),
  markRequestsSynced: (requestIds: string[]) => ipcRenderer.invoke("sync:markRequestsSynced", requestIds),
  pushMenu: () => ipcRenderer.invoke("sync:pushMenu"),
  pushAndroidSnapshot: () => ipcRenderer.invoke("sync:pushAndroidSnapshot"),
  pushAiSettings: () => ipcRenderer.invoke("sync:pushAiSettings"),
  saveMenuCategory: (input: SaveMenuCategoryInput) => ipcRenderer.invoke("menu:saveCategory", input),
  saveMenuItem: (input: SaveMenuItemInput) => ipcRenderer.invoke("menu:saveItem", input),
  deleteMenuCategory: (categoryId: string) => ipcRenderer.invoke("menu:deleteCategory", categoryId),
  deleteMenuItem: (itemId: string) => ipcRenderer.invoke("menu:deleteItem", itemId),
  analyzeStockImage: (input: DesktopStockImageAnalyzeInput) => ipcRenderer.invoke("stockImage:analyze", input),
  cancelStockImageAnalysis: (importId: string) => ipcRenderer.invoke("stockImage:cancel", importId),
  applyStockImageImport: (input: ApplyStockImageImportInput) => ipcRenderer.invoke("stockImage:apply", input),
  openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url)
};

contextBridge.exposeInMainWorld("yardimciDesktop", bridge);
