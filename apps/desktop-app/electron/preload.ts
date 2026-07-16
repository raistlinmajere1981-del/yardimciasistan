import { contextBridge, ipcRenderer, webFrame } from "electron";
import type { PullRequestsResult, MarkRequestsSyncedResult, PushAiSettingsResult, PushAndroidSnapshotResult, PushMenuResult } from "@yardimci-asistan/sync-core";
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
  DesktopStatusUpdateResult,
  UpdateRequestStatusInput,
  UpdateRoomStatusInput,
  UpdateTableStatusInput,
  UpdateReservationStatusInput,
  UpdateDailyTaskStatusInput,
  MarkWhatsAppMessageSentInput
} from "./database";

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

export interface DesktopBridge {
  setUiScale: (scale: number) => void;
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
  markWhatsAppMessageSent: (input: MarkWhatsAppMessageSentInput) => Promise<DesktopStatusUpdateResult>;
  updateRoomStatus: (input: UpdateRoomStatusInput) => Promise<DesktopStatusUpdateResult>;
  updateTableStatus: (input: UpdateTableStatusInput) => Promise<DesktopStatusUpdateResult>;
  updateReservationStatus: (input: UpdateReservationStatusInput) => Promise<DesktopStatusUpdateResult>;
  updateDailyTaskStatus: (input: UpdateDailyTaskStatusInput) => Promise<DesktopStatusUpdateResult>;
  createManualBackup: () => Promise<DesktopBackupResult>;
  createOwnerReplySuggestion: (requestId: string) => Promise<RequestAiSuggestionResult>;
  generateAiWorkspace: (input: GenerateAiWorkspaceInput) => Promise<GenerateAiWorkspaceResult>;
  getAiWorkspaceHistory: (limit?: number) => Promise<AiWorkspaceHistoryEntry[]>;
  saveAiWorkspaceResult: (input: SaveAiWorkspaceResultInput) => Promise<SaveAiWorkspaceResult>;
  testAiConnection: (input: AiConnectionTestInput) => Promise<AiConnectionTestResult>;
  pullRequests: () => Promise<PullRequestsResult>;
  markRequestsSynced: (requestIds: string[]) => Promise<MarkRequestsSyncedResult>;
  pushMenu: () => Promise<PushMenuResult>;
  pushAndroidSnapshot: () => Promise<PushAndroidSnapshotResult>;
  pushAiSettings: () => Promise<PushAiSettingsResult>;
  saveMenuCategory: (input: SaveMenuCategoryInput) => Promise<DesktopMenuSaveResult>;
  saveMenuItem: (input: SaveMenuItemInput) => Promise<DesktopMenuSaveResult>;
  openExternal: (url: string) => Promise<boolean>;
}

const bridge: DesktopBridge = {
  setUiScale: (scale: number) => webFrame.setZoomFactor(scale),
  getBootstrapData: () => ipcRenderer.invoke("app:getBootstrapData"),
  getDashboardData: () => ipcRenderer.invoke("dashboard:getData"),
  getSetupData: () => ipcRenderer.invoke("setup:getData"),
  saveInitialSetup: (input: SaveInitialSetupInput) => ipcRenderer.invoke("setup:saveInitial", input),
  createManualRequest: (input: CreateManualRequestInput) => ipcRenderer.invoke("request:createManual", input),
  convertRequestToReservation: (requestId: string) => ipcRenderer.invoke("request:convertToReservation", requestId),
  updateRequestStatus: (input: UpdateRequestStatusInput) => ipcRenderer.invoke("request:updateStatus", input),
  markWhatsAppMessageSent: (input: MarkWhatsAppMessageSentInput) => ipcRenderer.invoke("whatsapp:markMessageSent", input),
  updateRoomStatus: (input: UpdateRoomStatusInput) => ipcRenderer.invoke("room:updateStatus", input),
  updateTableStatus: (input: UpdateTableStatusInput) => ipcRenderer.invoke("table:updateStatus", input),
  updateReservationStatus: (input: UpdateReservationStatusInput) => ipcRenderer.invoke("reservation:updateStatus", input),
  updateDailyTaskStatus: (input: UpdateDailyTaskStatusInput) => ipcRenderer.invoke("dailyTask:updateStatus", input),
  createManualBackup: () => ipcRenderer.invoke("backup:createManual"),
  createOwnerReplySuggestion: (requestId: string) => ipcRenderer.invoke("ai:createOwnerReplySuggestion", requestId),
  generateAiWorkspace: (input: GenerateAiWorkspaceInput) => ipcRenderer.invoke("ai:generateWorkspace", input),
  getAiWorkspaceHistory: (limit?: number) => ipcRenderer.invoke("ai:getWorkspaceHistory", limit),
  saveAiWorkspaceResult: (input: SaveAiWorkspaceResultInput) => ipcRenderer.invoke("ai:saveWorkspaceResult", input),
  testAiConnection: (input: AiConnectionTestInput) => ipcRenderer.invoke("ai:testConnection", input),
  pullRequests: () => ipcRenderer.invoke("sync:pullRequests"),
  markRequestsSynced: (requestIds: string[]) => ipcRenderer.invoke("sync:markRequestsSynced", requestIds),
  pushMenu: () => ipcRenderer.invoke("sync:pushMenu"),
  pushAndroidSnapshot: () => ipcRenderer.invoke("sync:pushAndroidSnapshot"),
  pushAiSettings: () => ipcRenderer.invoke("sync:pushAiSettings"),
  saveMenuCategory: (input: SaveMenuCategoryInput) => ipcRenderer.invoke("menu:saveCategory", input),
  saveMenuItem: (input: SaveMenuItemInput) => ipcRenderer.invoke("menu:saveItem", input),
  openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url)
};

contextBridge.exposeInMainWorld("yardimciDesktop", bridge);
