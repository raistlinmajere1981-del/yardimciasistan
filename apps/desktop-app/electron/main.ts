import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { generateOwnerReplySuggestion } from "@yardimci-asistan/ai-core";
import type { AIProviderName } from "@yardimci-asistan/ai-core";
import { pullRequests, markRequestsSynced, pushAndroidSnapshot, pushMenu } from "@yardimci-asistan/sync-core";
import type { AndroidOperationsSnapshot, PullRequestsResult, MarkRequestsSyncedResult, PushAndroidSnapshotResult, PushMenuResult } from "@yardimci-asistan/sync-core";
import {
  DesktopDatabase,
  type DesktopDashboardData,
  type DesktopSetupData,
  type DesktopSetupSaveResult,
  type SaveInitialSetupInput,
  type SaveMenuCategoryInput,
  type SaveMenuItemInput,
  type DesktopMenuSaveResult,
  type CreateManualRequestInput,
  type CreateManualRequestResult,
  type RequestReservationConversionResult,
  type RequestAiSuggestionResult,
  type DesktopBackupResult,
  type DesktopStatusUpdateResult,
  type UpdateRequestStatusInput,
  type UpdateRoomStatusInput,
  type UpdateTableStatusInput,
  type UpdateReservationStatusInput,
  type UpdateDailyTaskStatusInput
} from "./database";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let desktopDatabase: DesktopDatabase | null = null;

interface DesktopBootstrapData {
  appName: string;
  version: string;
  platform: NodeJS.Platform;
  syncSettings: {
    webModuleUrl: string;
    hasSyncSecret: boolean;
  };
  databasePath: string;
  userDataPath: string;
  backupPath: string;
  setup: DesktopSetupData;
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 720,
    title: "Yardımcı Asistan",
    backgroundColor: "#fff8ee",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    void window.loadFile(path.join(__dirname, "..", "dist-renderer", "index.html"));
  }
}

app.whenReady().then(() => {
  desktopDatabase = new DesktopDatabase({
    appPath: app.getAppPath(),
    userDataPath: process.env.YA_DESKTOP_DATA_DIR ?? app.getPath("userData")
  });
  desktopDatabase.initialize();
  registerIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    desktopDatabase?.close();
    app.quit();
  }
});

function registerIpcHandlers() {
  ipcMain.handle("app:getBootstrapData", (): DesktopBootstrapData => {
    return {
      appName: "Yardımcı Asistan",
      version: app.getVersion(),
      platform: process.platform,
      syncSettings: {
        webModuleUrl: getDatabase().getSetupData().webModuleUrl,
        hasSyncSecret: Boolean(getDatabase().getSetupData().syncSecret)
      },
      databasePath: getDatabase().databasePath,
      userDataPath: getDatabase().userDataPath,
      backupPath: getDatabase().backupPath,
      setup: getDatabase().getSetupData()
    };
  });

  ipcMain.handle("sync:pullRequests", async (): Promise<PullRequestsResult> => {
    const setup = getDatabase().getSetupData();
    const baseUrl = process.env.YA_WEB_MODULE_URL ?? setup.webModuleUrl;
    const syncSecret = process.env.YA_SYNC_SECRET ?? setup.syncSecret;
    const result = await pullRequests({
      baseUrl,
      syncSecret,
      limit: 50
    });

    if (result.ok) {
      getDatabase().upsertRequests(result.requests);
      const requestIds = result.requests.map((request) => request.id);
      if (requestIds.length > 0) {
        const markResult = await markRequestsSynced({
          baseUrl,
          syncSecret,
          requestIds
        });

        if (markResult.ok) {
          getDatabase().markLocalRequestsSynced(requestIds);
        } else {
          getDatabase().recordSyncEvent({
            direction: "push",
            entityType: "request",
            ok: false,
            message: markResult.message,
            status: markResult.status
          });
        }
      }
      getDatabase().recordSyncEvent({
        direction: "pull",
        entityType: "request",
        ok: true,
        recordCount: result.count
      });
    } else {
      getDatabase().recordSyncEvent({
        direction: "pull",
        entityType: "request",
        ok: false,
        message: result.message,
        status: result.status
      });
    }

    return result;
  });

  ipcMain.handle("sync:markRequestsSynced", async (_event, requestIds: string[]): Promise<MarkRequestsSyncedResult> => {
    const setup = getDatabase().getSetupData();
    const result = await markRequestsSynced({
      baseUrl: process.env.YA_WEB_MODULE_URL ?? setup.webModuleUrl,
      syncSecret: process.env.YA_SYNC_SECRET ?? setup.syncSecret,
      requestIds
    });
    getDatabase().recordSyncEvent({
      direction: "push",
      entityType: "request",
      ok: result.ok,
      recordCount: result.ok ? result.updated_count : 0,
      message: result.ok ? result.message : result.message,
      status: result.ok ? undefined : result.status
    });

    return result;
  });

  ipcMain.handle("sync:pushMenu", async (): Promise<PushMenuResult> => {
    const setup = getDatabase().getSetupData();
    const result = await pushMenu({
      baseUrl: process.env.YA_WEB_MODULE_URL ?? setup.webModuleUrl,
      syncSecret: process.env.YA_SYNC_SECRET ?? setup.syncSecret,
      menu: getDatabase().getPublishedMenu()
    });

    if (result.ok) {
      getDatabase().markMenuPublished();
      getDatabase().recordSyncEvent({
        direction: "push",
        entityType: "menu",
        ok: true,
        recordCount: result.category_count + result.item_count
      });
    } else {
      getDatabase().recordSyncEvent({
        direction: "push",
        entityType: "menu",
        ok: false,
        message: result.message,
        status: result.status
      });
    }

    return result;
  });

  ipcMain.handle("sync:pushAndroidSnapshot", async (): Promise<PushAndroidSnapshotResult> => {
    const setup = getDatabase().getSetupData();
    const snapshot = createAndroidOperationsSnapshot(getDatabase().getDashboardData());
    const result = await pushAndroidSnapshot({
      baseUrl: process.env.YA_WEB_MODULE_URL ?? setup.webModuleUrl,
      syncSecret: process.env.YA_SYNC_SECRET ?? setup.syncSecret,
      snapshot
    });

    getDatabase().recordSyncEvent({
      direction: "push",
      entityType: "android_snapshot",
      ok: result.ok,
      recordCount: result.ok ? result.task_count + 1 : 0,
      message: result.message,
      status: result.ok ? undefined : result.status
    });

    return result;
  });

  ipcMain.handle("menu:saveCategory", (_event, input: SaveMenuCategoryInput): DesktopMenuSaveResult => {
    return getDatabase().saveMenuCategory(input);
  });

  ipcMain.handle("menu:saveItem", (_event, input: SaveMenuItemInput): DesktopMenuSaveResult => {
    return getDatabase().saveMenuItem(input);
  });

  ipcMain.handle("setup:getData", (): DesktopSetupData => {
    return getDatabase().getSetupData();
  });

  ipcMain.handle("setup:saveInitial", (_event, input: SaveInitialSetupInput): DesktopSetupSaveResult => {
    return getDatabase().saveInitialSetup(input);
  });

  ipcMain.handle("request:createManual", (_event, input: CreateManualRequestInput): CreateManualRequestResult => {
    return getDatabase().createManualRequest(input);
  });

  ipcMain.handle("request:convertToReservation", (_event, requestId: string): RequestReservationConversionResult => {
    return getDatabase().convertRequestToReservation(requestId);
  });

  ipcMain.handle("request:updateStatus", (_event, input: UpdateRequestStatusInput): DesktopStatusUpdateResult => {
    return getDatabase().updateRequestStatus(input);
  });

  ipcMain.handle("room:updateStatus", (_event, input: UpdateRoomStatusInput): DesktopStatusUpdateResult => {
    return getDatabase().updateRoomStatus(input);
  });

  ipcMain.handle("table:updateStatus", (_event, input: UpdateTableStatusInput): DesktopStatusUpdateResult => {
    return getDatabase().updateTableStatus(input);
  });

  ipcMain.handle("reservation:updateStatus", (_event, input: UpdateReservationStatusInput): DesktopStatusUpdateResult => {
    return getDatabase().updateReservationStatus(input);
  });

  ipcMain.handle("dailyTask:updateStatus", (_event, input: UpdateDailyTaskStatusInput): DesktopStatusUpdateResult => {
    return getDatabase().updateDailyTaskStatus(input);
  });

  ipcMain.handle("backup:createManual", (): DesktopBackupResult => {
    return getDatabase().createManualBackup();
  });

  ipcMain.handle("ai:createOwnerReplySuggestion", async (_event, requestId: string): Promise<RequestAiSuggestionResult> => {
    const request = getDatabase().getRequestById(requestId);
    if (!request) {
      return {
        ok: false,
        message: "AI taslağı için talep bulunamadı."
      };
    }

    const setup = getDatabase().getSetupData();
    const suggestion = await generateOwnerReplySuggestion(
      {
        businessName: setup.businessName || "Yardımcı Asistan",
        customerName: request.customer_name,
        requestType: request.request_type,
        dateText: request.date_text || request.start_date,
        guestCount: request.guest_count,
        message: request.message,
        tone: "warm"
      },
      createDesktopAiConfig(setup)
    );

    const saveResult = getDatabase().saveRequestAiSuggestion({
      requestId: request.id,
      summary: suggestion.summary,
      suggestedReply: suggestion.suggestedReply,
      missingFields: suggestion.missingFields
    });

    if (saveResult.ok && suggestion.providerMessage) {
      return {
        ...saveResult,
        message: `${saveResult.message} ${suggestion.providerMessage} Yerel güvenli taslak kullanıldı.`
      };
    }

    return saveResult;
  });

  ipcMain.handle("shell:openExternal", async (_event, url: string) => {
    if (!/^https?:\/\//.test(url) && !/^tel:/.test(url)) {
      return false;
    }

    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle("dashboard:getData", (): DesktopDashboardData => {
    return getDatabase().getDashboardData();
  });
}

function getDatabase() {
  if (!desktopDatabase) {
    throw new Error("Desktop database is not initialized.");
  }

  return desktopDatabase;
}

function createAndroidOperationsSnapshot(dashboardData: DesktopDashboardData): AndroidOperationsSnapshot {
  const updatedAt = new Date().toISOString();

  return {
    summary: {
      pending_daily_tasks: dashboardData.summary.pendingDailyTasks,
      available_rooms: dashboardData.summary.availableRooms,
      total_rooms: dashboardData.summary.totalRooms,
      available_tables: dashboardData.summary.availableTables,
      pending_reservations: dashboardData.summary.pendingReservations,
      prepared_whatsapp_messages: dashboardData.summary.preparedWhatsAppMessages,
      active_menu_categories: dashboardData.summary.activeMenuCategories,
      available_menu_items: dashboardData.summary.availableMenuItems,
      customer_count: dashboardData.customers.length
    },
    daily_tasks: dashboardData.dailyTasks
      .filter((task) => task.status === "pending")
      .slice(0, 8)
      .map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        task_type: task.taskType,
        status: task.status,
        due_date: task.dueDate,
        due_time: task.dueTime,
        related_type: task.relatedType,
        related_id: task.relatedId,
        updated_at: task.updatedAt
      })),
    updated_at: updatedAt
  };
}

function createDesktopAiConfig(setup: DesktopSetupData) {
  const envEnabled = process.env.YARDIMCI_ASISTAN_AI_ENABLED;
  const enabled = envEnabled === undefined ? setup.aiEnabled : parseEnvBoolean(envEnabled);
  const provider = (process.env.YARDIMCI_ASISTAN_AI_PROVIDER ?? setup.aiProvider ?? "openai_compatible") as AIProviderName;
  const timeoutSeconds = Number(process.env.YARDIMCI_ASISTAN_AI_TIMEOUT_SECONDS ?? 15);

  return {
    enabled,
    provider: enabled ? provider : "disabled" as AIProviderName,
    baseUrl: process.env.YARDIMCI_ASISTAN_AI_BASE_URL ?? "https://api.openai.com/v1",
    model: process.env.YARDIMCI_ASISTAN_AI_MODEL ?? setup.aiModel,
    apiKey: process.env.YARDIMCI_ASISTAN_AI_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
    timeoutMs: Number.isFinite(timeoutSeconds) ? timeoutSeconds * 1000 : 15000
  };
}

function parseEnvBoolean(value: string) {
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
