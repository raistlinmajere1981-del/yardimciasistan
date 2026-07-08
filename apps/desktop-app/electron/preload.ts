import { contextBridge, ipcRenderer } from "electron";
import type { PullRequestsResult, MarkRequestsSyncedResult, PushAndroidSnapshotResult, PushMenuResult } from "@yardimci-asistan/sync-core";
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
  DesktopBackupResult,
  DesktopStatusUpdateResult,
  UpdateRequestStatusInput,
  UpdateRoomStatusInput,
  UpdateTableStatusInput,
  UpdateReservationStatusInput,
  UpdateDailyTaskStatusInput
} from "./database";

export interface DesktopBridge {
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
  getSetupData: () => Promise<DesktopSetupData>;
  saveInitialSetup: (input: SaveInitialSetupInput) => Promise<DesktopSetupSaveResult>;
  createManualRequest: (input: CreateManualRequestInput) => Promise<CreateManualRequestResult>;
  convertRequestToReservation: (requestId: string) => Promise<RequestReservationConversionResult>;
  updateRequestStatus: (input: UpdateRequestStatusInput) => Promise<DesktopStatusUpdateResult>;
  updateRoomStatus: (input: UpdateRoomStatusInput) => Promise<DesktopStatusUpdateResult>;
  updateTableStatus: (input: UpdateTableStatusInput) => Promise<DesktopStatusUpdateResult>;
  updateReservationStatus: (input: UpdateReservationStatusInput) => Promise<DesktopStatusUpdateResult>;
  updateDailyTaskStatus: (input: UpdateDailyTaskStatusInput) => Promise<DesktopStatusUpdateResult>;
  createManualBackup: () => Promise<DesktopBackupResult>;
  createOwnerReplySuggestion: (requestId: string) => Promise<RequestAiSuggestionResult>;
  pullRequests: () => Promise<PullRequestsResult>;
  markRequestsSynced: (requestIds: string[]) => Promise<MarkRequestsSyncedResult>;
  pushMenu: () => Promise<PushMenuResult>;
  pushAndroidSnapshot: () => Promise<PushAndroidSnapshotResult>;
  saveMenuCategory: (input: SaveMenuCategoryInput) => Promise<DesktopMenuSaveResult>;
  saveMenuItem: (input: SaveMenuItemInput) => Promise<DesktopMenuSaveResult>;
  openExternal: (url: string) => Promise<boolean>;
}

const bridge: DesktopBridge = {
  getBootstrapData: () => ipcRenderer.invoke("app:getBootstrapData"),
  getDashboardData: () => ipcRenderer.invoke("dashboard:getData"),
  getSetupData: () => ipcRenderer.invoke("setup:getData"),
  saveInitialSetup: (input: SaveInitialSetupInput) => ipcRenderer.invoke("setup:saveInitial", input),
  createManualRequest: (input: CreateManualRequestInput) => ipcRenderer.invoke("request:createManual", input),
  convertRequestToReservation: (requestId: string) => ipcRenderer.invoke("request:convertToReservation", requestId),
  updateRequestStatus: (input: UpdateRequestStatusInput) => ipcRenderer.invoke("request:updateStatus", input),
  updateRoomStatus: (input: UpdateRoomStatusInput) => ipcRenderer.invoke("room:updateStatus", input),
  updateTableStatus: (input: UpdateTableStatusInput) => ipcRenderer.invoke("table:updateStatus", input),
  updateReservationStatus: (input: UpdateReservationStatusInput) => ipcRenderer.invoke("reservation:updateStatus", input),
  updateDailyTaskStatus: (input: UpdateDailyTaskStatusInput) => ipcRenderer.invoke("dailyTask:updateStatus", input),
  createManualBackup: () => ipcRenderer.invoke("backup:createManual"),
  createOwnerReplySuggestion: (requestId: string) => ipcRenderer.invoke("ai:createOwnerReplySuggestion", requestId),
  pullRequests: () => ipcRenderer.invoke("sync:pullRequests"),
  markRequestsSynced: (requestIds: string[]) => ipcRenderer.invoke("sync:markRequestsSynced", requestIds),
  pushMenu: () => ipcRenderer.invoke("sync:pushMenu"),
  pushAndroidSnapshot: () => ipcRenderer.invoke("sync:pushAndroidSnapshot"),
  saveMenuCategory: (input: SaveMenuCategoryInput) => ipcRenderer.invoke("menu:saveCategory", input),
  saveMenuItem: (input: SaveMenuItemInput) => ipcRenderer.invoke("menu:saveItem", input),
  openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url)
};

contextBridge.exposeInMainWorld("yardimciDesktop", bridge);
