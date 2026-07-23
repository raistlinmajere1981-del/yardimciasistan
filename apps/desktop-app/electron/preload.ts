import { contextBridge, ipcRenderer, webFrame } from "electron";
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
  DesktopBackupResult,
  DesktopAndroidDeviceMutationResult,
  DesktopStatusUpdateResult,
  UpdateRequestStatusInput,
  UpdateRoomStatusInput,
  UpdateTableStatusInput,
  DesktopTableOrder,
  DesktopTableOrderResult,
  UpdateReservationStatusInput,
  UpdateDailyTaskStatusInput,
  MarkWhatsAppMessageSentInput,
  DeleteWhatsAppMessageInput,
  DesktopStockImageAnalyzeInput,
  DesktopStockImageAnalyzeResult,
  ApplyStockImageImportInput,
  DesktopStockImageApplyResult,
  DesktopReportRangeInput,
  DesktopReportQueryResult,
  GenerateDesktopReportAiInput,
  GenerateDesktopReportAiResult
} from "./database";
import type { AutomaticSyncCycleResult, AutomaticSyncStatus } from "./sync-coordinator";
import type {
  AppLockActionResult,
  AppLockStatus,
  UpdateAppPasswordInput
} from "./app-lock";

export interface AiConnectionTestInput {
  provider: string;
  service: string;
  projectName: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  useStoredApiKey: boolean;
  timeoutSeconds: number;
}

export type AiConnectionTestResult =
  | { ok: true; message: string; model: string; models: Array<{ id: string; label: string }> }
  | { ok: false; message: string; model?: string; models?: Array<{ id: string; label: string }> };

export type AiApiKeyRevealResult =
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
    syncSettings: {
      webModuleUrl: string;
      hasSyncSecret: boolean;
    };
    databasePath: string;
    userDataPath: string;
    backupPath: string;
    setup: DesktopSetupData;
  }>;
  getDashboardData: () => Promise<DesktopDashboardData>;
  getReportData: (input: DesktopReportRangeInput) => Promise<DesktopReportQueryResult>;
  generateReportAiComment: (input: GenerateDesktopReportAiInput) => Promise<GenerateDesktopReportAiResult>;
  onDashboardDataChanged: (listener: (data: DesktopDashboardData) => void) => () => void;
  getSyncStatus: () => Promise<AutomaticSyncStatus>;
  runSyncNow: () => Promise<AutomaticSyncCycleResult>;
  setAutoSyncEnabled: (enabled: boolean) => Promise<AutomaticSyncStatus>;
  onSyncStatusChanged: (listener: (status: AutomaticSyncStatus) => void) => () => void;
  getSetupData: () => Promise<DesktopSetupData>;
  saveInitialSetup: (input: SaveInitialSetupInput) => Promise<DesktopSetupSaveResult>;
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
  updateReservationStatus: (input: UpdateReservationStatusInput) => Promise<DesktopStatusUpdateResult>;
  updateDailyTaskStatus: (input: UpdateDailyTaskStatusInput) => Promise<DesktopStatusUpdateResult>;
  createManualBackup: () => Promise<DesktopBackupResult>;
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
  onDashboardDataChanged: (listener: (data: DesktopDashboardData) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: DesktopDashboardData) => listener(data);
    ipcRenderer.on("dashboard:dataChanged", handler);
    return () => ipcRenderer.removeListener("dashboard:dataChanged", handler);
  },
  getSyncStatus: () => ipcRenderer.invoke("sync:getStatus"),
  runSyncNow: () => ipcRenderer.invoke("sync:runNow"),
  setAutoSyncEnabled: (enabled: boolean) => ipcRenderer.invoke("sync:setAutoEnabled", enabled),
  onSyncStatusChanged: (listener: (status: AutomaticSyncStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: AutomaticSyncStatus) => listener(status);
    ipcRenderer.on("sync:statusChanged", handler);
    return () => ipcRenderer.removeListener("sync:statusChanged", handler);
  },
  getSetupData: () => ipcRenderer.invoke("setup:getData"),
  saveInitialSetup: (input: SaveInitialSetupInput) => ipcRenderer.invoke("setup:saveInitial", input),
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
  markWhatsAppMessageSent: (input: MarkWhatsAppMessageSentInput) => ipcRenderer.invoke("whatsapp:markMessageSent", input),
  deleteWhatsAppMessage: (input: DeleteWhatsAppMessageInput) => ipcRenderer.invoke("whatsapp:deleteMessage", input),
  updateRoomStatus: (input: UpdateRoomStatusInput) => ipcRenderer.invoke("room:updateStatus", input),
  updateTableStatus: (input: UpdateTableStatusInput) => ipcRenderer.invoke("table:updateStatus", input),
  listTableOrders: () => ipcRenderer.invoke("tableOrder:list"),
  getActiveTableOrder: (tableId: string) => ipcRenderer.invoke("tableOrder:getActive", tableId),
  openTableOrder: (tableId: string) => ipcRenderer.invoke("tableOrder:open", tableId),
  addTableOrderItem: (orderId: string, menuItemId: string, quantity: number, note: string) =>
    ipcRenderer.invoke("tableOrder:addItem", { orderId, menuItemId, quantity, note }),
  updateTableOrderItemQuantity: (itemId: string, quantity: number) =>
    ipcRenderer.invoke("tableOrder:updateItemQuantity", { itemId, quantity }),
  updateTableOrderItemNote: (itemId: string, note: string) =>
    ipcRenderer.invoke("tableOrder:updateItemNote", { itemId, note }),
  removeTableOrderItem: (itemId: string) => ipcRenderer.invoke("tableOrder:removeItem", itemId),
  updateTableOrderStatus: (orderId: string, status: string) => ipcRenderer.invoke("tableOrder:updateStatus", { orderId, status }),
  closeTableOrder: (orderId: string, status: "paid" | "cancelled") => ipcRenderer.invoke("tableOrder:close", { orderId, status }),
  recalculateTableOrderTotal: (orderId: string) => ipcRenderer.invoke("tableOrder:recalculate", orderId),
  updateReservationStatus: (input: UpdateReservationStatusInput) => ipcRenderer.invoke("reservation:updateStatus", input),
  updateDailyTaskStatus: (input: UpdateDailyTaskStatusInput) => ipcRenderer.invoke("dailyTask:updateStatus", input),
  createManualBackup: () => ipcRenderer.invoke("backup:createManual"),
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
