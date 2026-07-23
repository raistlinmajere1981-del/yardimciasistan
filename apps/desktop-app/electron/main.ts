import { app, BrowserWindow, ipcMain, safeStorage, session, shell } from "electron";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  generateConfiguredChat,
  generateOwnerReplySuggestion,
  listGoogleAiStudioModels,
  rankGoogleAiStudioModels,
  verifyGoogleAiStudioVisionModel
} from "@yardimci-asistan/ai-core";
import type { AIProviderName } from "@yardimci-asistan/ai-core";
import type { StockImageAnalysis, StockImageApplyLine } from "@yardimci-asistan/shared";
import {
  markAndroidActionResult,
  markRequestsSynced,
  pullAndroidActions,
  pullRequests,
  pushAiSettings,
  pushAndroidSnapshot,
  pushMenu
} from "@yardimci-asistan/sync-core";
import type {
  AndroidOperationsSnapshot,
  PullRequestsResult,
  MarkRequestsSyncedResult,
  PushAiSettingsResult,
  PushAndroidSnapshotResult,
  PushMenuResult
} from "@yardimci-asistan/sync-core";
import {
  DesktopDatabase,
  type DesktopDashboardData,
  type DesktopAiService,
  type DesktopSetupData,
  type DesktopSetupSaveResult,
  type SaveAiServiceProfileInput,
  type SaveInitialSetupInput,
  type SaveMenuCategoryInput,
  type SaveMenuItemInput,
  type DesktopMenuSaveResult,
  type CreateManualRequestInput,
  type CreateManualRequestResult,
  type RequestReservationConversionResult,
  type RequestAiSuggestionResult,
  type GenerateAiWorkspaceInput,
  type GenerateAiWorkspaceResult,
  type SaveAiWorkspaceResultInput,
  type SaveAiWorkspaceResult,
  type AiWorkspaceHistoryEntry,
  type DesktopBackupResult,
  type DesktopAndroidDeviceMutationResult,
  type DesktopStatusUpdateResult,
  type UpdateRequestStatusInput,
  type UpdateRoomStatusInput,
  type UpdateTableStatusInput,
  type DesktopTableOrder,
  type DesktopTableOrderResult,
  type AddTableOrderItemInput,
  type UpdateTableOrderItemQuantityInput,
  type UpdateTableOrderItemNoteInput,
  type UpdateTableOrderStatusInput,
  type UpdateReservationStatusInput,
  type UpdateDailyTaskStatusInput,
  type MarkWhatsAppMessageSentInput,
  type DeleteWhatsAppMessageInput,
  type DesktopStockImageAnalyzeInput,
  type DesktopStockImageAnalyzeResult,
  type ApplyStockImageImportInput,
  type DesktopStockImageApplyResult,
  type DesktopReportQueryResult,
  type GenerateDesktopReportAiInput,
  type GenerateDesktopReportAiResult
} from "./database";
import {
  buildReportAiMessages,
  buildReportAiPayload,
  reportHasEnoughData,
  sanitizeReportAiAnswer
} from "./report-ai";
import {
  SyncCoordinator,
  type AutomaticSyncCycleResult,
  type AutomaticSyncStatus
} from "./sync-coordinator";
import {
  createAppPasswordVerifier,
  secureTextEqual,
  validateAppPassword,
  verifyAppPassword,
  type AppLockActionResult,
  type AppLockStatus,
  type UpdateAppPasswordInput
} from "./app-lock";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const WHATSAPP_WEB_PARTITION = "persist:yardimci-whatsapp";
const GOOGLE_AI_STUDIO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
let desktopDatabase: DesktopDatabase | null = null;
let syncCoordinator: SyncCoordinator | null = null;
let androidActionSyncInFlight: Promise<AndroidActionProcessSummary> | null = null;
let androidSnapshotPublishPending = true;
let appSessionLocked = false;
let appLockFailureCount = 0;
let appLockBlockedUntil = 0;
const stockImageAnalysisControllers = new Map<string, AbortController>();
const STOCK_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const APP_LOCK_FAILURE_LIMIT = 5;
const APP_LOCK_RETRY_DELAY_MS = 30_000;

interface AndroidActionProcessSummary {
  pulled: number;
  applied: number;
  failed: number;
}

if (process.env.YA_DESKTOP_DATA_DIR) {
  app.setPath("userData", path.resolve(process.env.YA_DESKTOP_DATA_DIR));
}

// Some Wayland compositors advertise color-management-v1 without every sRGB
// capability Chromium expects, which otherwise produces repeated startup errors.
if (process.platform === "linux" && process.env.XDG_SESSION_TYPE?.toLowerCase() === "wayland") {
  const disabledFeatures = new Set(
    app.commandLine
      .getSwitchValue("disable-features")
      .split(",")
      .map((feature) => feature.trim())
      .filter(Boolean)
  );
  disabledFeatures.add("WaylandWpColorManagerV1");
  app.commandLine.appendSwitch("disable-features", [...disabledFeatures].join(","));
}

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
    show: false,
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 720,
    title: "Yardımcı Asistan",
    icon: getAppIconPath(),
    backgroundColor: "#fff8ee",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });

  window.removeMenu();

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  window.once("ready-to-show", () => {
    window.maximize();
    window.show();
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(__dirname, "..", "dist-renderer", "index.html"));
  }
}

function getAppIconPath() {
  const iconFile = process.platform === "win32" ? "app-icon.ico" : "app-icon.png";
  return path.join(app.getAppPath(), "assets", iconFile);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) {
      return;
    }
    if (window.isMinimized()) {
      window.restore();
    }
    window.show();
    window.focus();
  });

  void app.whenReady().then(() => {
    session.fromPartition(WHATSAPP_WEB_PARTITION).setUserAgent(createChromeUserAgent(), "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7");
    configureDesktopMediaPermissions();

    desktopDatabase = new DesktopDatabase({
      appPath: app.getAppPath(),
      userDataPath: process.env.YA_DESKTOP_DATA_DIR ?? app.getPath("userData")
    });
    desktopDatabase.initialize();
    appSessionLocked = Boolean(desktopDatabase.getAppLockPasswordVerifier());
    syncCoordinator = new SyncCoordinator({
      database: desktopDatabase,
      getSyncConfig: () => getWebSyncConfig(getDatabase().getSetupData()),
      createAndroidSnapshot: () => createAndroidOperationsSnapshot(getDatabase().getDashboardData()),
      onDashboardChanged: () => notifyDesktopDashboardChanged(getDatabase().getDashboardData()),
      onStatusChanged: notifySyncStatusChanged
    });
    registerIpcHandlers();
    createMainWindow();
    syncCoordinator.start();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });
}

function configureDesktopMediaPermissions() {
  session.defaultSession.setPermissionCheckHandler((webContents, permission, _origin) => {
    const trustedRenderer = webContents?.getType() === "window"
      && isTrustedDesktopRendererUrl(webContents.getURL());
    return Boolean(trustedRenderer && (permission === "media" || permission === "clipboard-sanitized-write"));
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const mediaTypes = "mediaTypes" in details ? details.mediaTypes : undefined;
    const trustedRenderer = webContents.getType() === "window"
      && isTrustedDesktopRendererUrl(webContents.getURL());
    if (trustedRenderer && permission === "clipboard-sanitized-write") {
      callback(true);
      return;
    }
    callback(
      trustedRenderer
      && permission === "media"
      && Array.isArray(mediaTypes)
      && mediaTypes.includes("video")
      && !mediaTypes.includes("audio")
    );
  });
}

function isTrustedDesktopRendererUrl(value: string): boolean {
  try {
    const candidate = new URL(value);
    if (candidate.protocol === "file:") {
      return true;
    }
    if (!isDev || !process.env.VITE_DEV_SERVER_URL) {
      return false;
    }
    return candidate.origin === new URL(process.env.VITE_DEV_SERVER_URL).origin;
  } catch {
    return false;
  }
}

function createChromeUserAgent() {
  const chromeMajorVersion = process.versions.chrome.split(".")[0] || "144";
  const platform =
    process.platform === "win32"
      ? "Windows NT 10.0; Win64; x64"
      : process.platform === "darwin"
        ? "Macintosh; Intel Mac OS X 10_15_7"
        : "X11; Linux x86_64";

  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajorVersion}.0.0.0 Safari/537.36`;
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    syncCoordinator?.stop();
    desktopDatabase?.close();
    app.quit();
  }
});

app.on("before-quit", () => {
  syncCoordinator?.stop();
});

function registerIpcHandlers() {
  registerAppLockIpcHandlers();

  ipcMain.handle("app:getBootstrapData", (): DesktopBootstrapData => {
    assertAppSessionUnlocked();
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

  ipcMain.handle("sync:getStatus", (): AutomaticSyncStatus => {
    return getSyncCoordinator().getStatus();
  });

  ipcMain.handle("report:getData", (_event, input: GenerateDesktopReportAiInput["range"]): DesktopReportQueryResult => {
    assertAppSessionUnlocked();
    try {
      return { ok: true, data: getDatabase().getReportData(input) };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Rapor verileri hazırlanamadı."
      };
    }
  });

  ipcMain.handle(
    "report:generateAiComment",
    async (_event, input: GenerateDesktopReportAiInput): Promise<GenerateDesktopReportAiResult> => {
      return generateDesktopReportAiComment(input);
    }
  );

  ipcMain.handle("sync:runNow", async (): Promise<AutomaticSyncCycleResult> => {
    return getSyncCoordinator().runNow();
  });

  ipcMain.handle("sync:setAutoEnabled", (_event, enabled: unknown): AutomaticSyncStatus => {
    return getSyncCoordinator().setEnabled(enabled === true);
  });

  ipcMain.handle("sync:pullRequests", async (): Promise<PullRequestsResult> => {
    const setup = getDatabase().getSetupData();
    const { baseUrl, syncSecret } = getWebSyncConfig(setup);
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

    if (result.ok) {
      await processAndroidActionQueue(true);
    }

    return result;
  });

  ipcMain.handle("sync:markRequestsSynced", async (_event, requestIds: string[]): Promise<MarkRequestsSyncedResult> => {
    const setup = getDatabase().getSetupData();
    const syncConfig = getWebSyncConfig(setup);
    const result = await markRequestsSynced({
      ...syncConfig,
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
      ...getWebSyncConfig(setup),
      menu: getDatabase().getQrMenuPublication()
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
    return publishCurrentAndroidSnapshot();
  });

  ipcMain.handle("sync:pushAiSettings", async (): Promise<PushAiSettingsResult> => {
    return publishSavedAiSettings();
  });

  ipcMain.handle("menu:saveCategory", (_event, input: SaveMenuCategoryInput): DesktopMenuSaveResult => {
    return getDatabase().saveMenuCategory(input);
  });

  ipcMain.handle("menu:saveItem", (_event, input: SaveMenuItemInput): DesktopMenuSaveResult => {
    return getDatabase().saveMenuItem(input);
  });

  ipcMain.handle("menu:deleteCategory", (_event, categoryId: unknown): DesktopStatusUpdateResult => {
    return finalizeDesktopRecordDeletion(getDatabase().deleteMenuCategory(String(categoryId ?? "")));
  });

  ipcMain.handle("menu:deleteItem", (_event, itemId: unknown): DesktopStatusUpdateResult => {
    return finalizeDesktopRecordDeletion(getDatabase().deleteMenuItem(String(itemId ?? "")));
  });

  ipcMain.handle("stockImage:analyze", async (_event, value: unknown): Promise<DesktopStockImageAnalyzeResult> => {
    return analyzeDesktopStockImage(value);
  });

  ipcMain.handle("stockImage:cancel", (_event, importIdValue: unknown): boolean => {
    const importId = normalizeStockImageImportId(String(importIdValue ?? ""));
    if (!importId) {
      return false;
    }
    const controller = stockImageAnalysisControllers.get(importId);
    controller?.abort();
    getDatabase().failStockImageImport(importId, "Kullanıcı analizi iptal etti.", true);
    return Boolean(controller);
  });

  ipcMain.handle("stockImage:apply", (_event, value: unknown): DesktopStockImageApplyResult => {
    const input = parseStockImageApplyInput(value);
    if (!input) {
      return { ok: false, message: "Görsel stok taslağı geçersiz." };
    }
    const result = getDatabase().applyStockImageImport(input);
    if (result.ok) {
      notifyDesktopDashboardChanged(result.dashboardData);
      androidSnapshotPublishPending = true;
      getSyncCoordinator().scheduleSoon();
    }
    return result;
  });

  ipcMain.handle("setup:getData", (): DesktopSetupData => {
    assertAppSessionUnlocked();
    return getDatabase().getSetupData();
  });

  ipcMain.handle("ai:revealApiKey", (_event, serviceValue: unknown): AiApiKeyRevealResult => {
    assertAppSessionUnlocked();
    const service = String(serviceValue ?? "").trim().toLowerCase() as DesktopAiService;
    if (!["openai", "openrouter", "groq", "gemini", "custom"].includes(service)) {
      return { ok: false, message: "API anahtarı için geçerli bir servis sağlayıcı seçin." };
    }

    const encryptedValue = getDatabase().getEncryptedAiApiKey(service);
    if (!encryptedValue) {
      return { ok: false, message: "Bu sağlayıcı için kayıtlı bir API anahtarı bulunamadı." };
    }
    if (!encryptedValue.startsWith("safe-storage:v1:") || !safeStorage.isEncryptionAvailable()) {
      return { ok: false, message: "Kayıtlı API anahtarı bu cihazda çözülemiyor." };
    }

    try {
      const payload = encryptedValue.slice("safe-storage:v1:".length);
      const apiKey = safeStorage.decryptString(Buffer.from(payload, "base64")).trim();
      return apiKey
        ? { ok: true, apiKey }
        : { ok: false, message: "Kayıtlı API anahtarı boş." };
    } catch {
      return { ok: false, message: "Kayıtlı API anahtarı çözülemedi." };
    }
  });

  ipcMain.handle("androidDevice:setRole", (_event, deviceId: unknown, role: unknown): DesktopAndroidDeviceMutationResult => {
    const result = getDatabase().setAndroidDeviceRole(String(deviceId ?? ""), String(role ?? ""));
    return finalizeAndroidDeviceMutation(result);
  });

  ipcMain.handle("androidDevice:setPermissionGroups", (_event, deviceId: unknown, groups: unknown): DesktopAndroidDeviceMutationResult => {
    const result = getDatabase().setAndroidDevicePermissionGroups(String(deviceId ?? ""), groups);
    return finalizeAndroidDeviceMutation(result);
  });

  ipcMain.handle("androidDevice:setActive", (_event, deviceId: unknown, active: unknown): DesktopAndroidDeviceMutationResult => {
    const result = getDatabase().setAndroidDeviceActive(String(deviceId ?? ""), active === true);
    return finalizeAndroidDeviceMutation(result);
  });

  ipcMain.handle("androidDevice:resetPermissions", (_event, deviceId: unknown): DesktopAndroidDeviceMutationResult => {
    return finalizeAndroidDeviceMutation(getDatabase().resetAndroidDevicePermissions(String(deviceId ?? "")));
  });

  ipcMain.handle("androidDevice:revoke", (_event, deviceId: unknown): DesktopAndroidDeviceMutationResult => {
    return finalizeAndroidDeviceMutation(getDatabase().revokeAndroidDevice(String(deviceId ?? "")));
  });

  ipcMain.handle("setup:saveInitial", async (_event, input: SaveInitialSetupInput): Promise<DesktopSetupSaveResult> => {
    assertAppSessionUnlocked();
    const secretUpdate = createAiApiKeyUpdate(input);
    if (!secretUpdate.ok) {
      return secretUpdate;
    }
    const profileSecretUpdates = createAiProfileApiKeyUpdates(input);
    if (!profileSecretUpdates.ok) {
      return profileSecretUpdates;
    }

    const localResult = getDatabase().saveInitialSetup({
      ...input,
      aiApiKey: String(input.aiApiKey ?? "").trim() ? "__encrypted_in_main_process__" : "",
      aiProfiles: profileSecretUpdates.profiles
    }, secretUpdate.update, profileSecretUpdates.updates);
    if (!localResult.ok) {
      return localResult;
    }

    const aiWebSync = await publishSavedAiSettings();
    getSyncCoordinator().restart();
    const setupData = getDatabase().getSetupData();
    const dashboardData = getDatabase().getDashboardData();

    if (!aiWebSync.ok) {
      return {
        ...localResult,
        message: `Ayarlar bu bilgisayarda kaydedildi. Web sitesine uygulanamadı: ${aiWebSync.message}`,
        setupData,
        dashboardData,
        aiWebSync
      };
    }

    return {
      ...localResult,
      message: "Ayarlar kaydedildi ve AI bağlantısı web sitesinde güncellendi.",
      setupData,
      dashboardData,
      aiWebSync
    };
  });

  ipcMain.handle("ai:testConnection", async (_event, input: AiConnectionTestInput): Promise<AiConnectionTestResult> => {
    const provider = String(input?.provider ?? "").trim();
    const service = String(input?.service ?? "").trim();
    const projectName = String(input?.projectName ?? "").trim();
    const baseUrl = normalizeAiConnectionUrl(input?.baseUrl);
    let model = String(input?.model ?? "").trim();
    let models: Array<{ id: string; label: string }> = [];

    if (provider !== "openai_compatible") {
      return {
        ok: false,
        message: "Bu AI bağlantı türü henüz desteklenmiyor."
      };
    }

    if (!baseUrl) {
      return {
        ok: false,
        message: "AI bağlantı adresi geçerli bir http veya https adresi olmalı ve kullanıcı bilgisi içermemeli."
      };
    }

    if (service === "gemini" && !isGoogleAiStudioUrl(baseUrl)) {
      return {
        ok: false,
        message: "Google AI Studio için resmi Gemini bağlantı adresi kullanılmalı."
      };
    }

    const timeoutCandidate = Number(input?.timeoutSeconds);
    if (!Number.isInteger(timeoutCandidate) || timeoutCandidate < 5 || timeoutCandidate > 120) {
      return {
        ok: false,
        message: "Yanıt bekleme süresi 5 ile 120 saniye arasında olmalı."
      };
    }

    const apiKey = String(input?.apiKey ?? "").trim() || (input?.useStoredApiKey ? getEffectiveAiApiKey(service) : "");
    const timeoutSeconds = normalizeAiTimeoutSeconds(timeoutCandidate);

    if (service === "gemini") {
      const modelListResult = await listGoogleAiStudioModels({
        baseUrl,
        apiKey,
        timeoutMs: timeoutSeconds * 1000
      });
      if (!modelListResult.ok) {
        return {
          ok: false,
          message: modelListResult.message
        };
      }

      models = modelListResult.models.map((item) => ({
        id: item.id,
        label: item.displayName && item.displayName !== item.id
          ? `${item.displayName} (${item.id})`
          : item.id
      }));
      const rankedIds = rankGoogleAiStudioModels(models.map((item) => item.id));
      models.sort((left, right) => rankedIds.indexOf(left.id) - rankedIds.indexOf(right.id));
      if (!models.some((item) => item.id === model)) {
        model = "";
      }
    }

    const rankedGoogleModels = service === "gemini"
      ? rankGoogleAiStudioModels(models.map((item) => item.id))
      : [];
    const modelCandidates = service === "gemini"
      ? [...new Set([model, ...rankedGoogleModels].filter(Boolean))].slice(0, 6)
      : model
        ? [model]
        : [];
    if (modelCandidates.length === 0) {
      return {
        ok: false,
        message: "AI model adı gerekli."
      };
    }

    let result: Awaited<ReturnType<typeof generateConfiguredChat>> | null = null;
    const attemptedModels: string[] = [];
    for (const candidate of modelCandidates) {
      attemptedModels.push(candidate);
      result = service === "gemini"
        ? await verifyGoogleAiStudioVisionModel({
            baseUrl,
            model: candidate,
            apiKey,
            timeoutMs: timeoutSeconds * 1000
          })
        : await generateConfiguredChat({
            enabled: true,
            provider: "openai_compatible",
            service,
            baseUrl,
            model: candidate,
            apiKey,
            authMode: "bearer",
            timeoutMs: timeoutSeconds * 1000,
            messages: [
              {
                role: "system",
                content: "Bu bir bağlantı kontrolüdür. Türkçe ve tek kısa cümleyle bağlantının çalıştığını belirt."
              },
              {
                role: "user",
                content: "Bağlantı kontrolü"
              }
            ]
          });
      if (result.ok) {
        model = candidate;
        break;
      }
      if (service !== "gemini" || modelCandidates.length === 1 || !shouldTryNextGoogleModel(result)) {
        break;
      }
    }

    if (!result || !result.ok) {
      return {
        ok: false,
        message: formatAiConnectionFailure(attemptedModels.at(-1) || modelCandidates[0], result, attemptedModels),
        model: service === "gemini" ? attemptedModels.at(-1) : undefined,
        models: service === "gemini" ? models : undefined
      };
    }

    return {
      ok: true,
      message: service === "gemini"
        ? `${projectName || "Google AI Studio"} bağlantısında ${model} modeliyle görsel girişi doğrulandı; ${models.length} uygun Gemini modeli bulundu. Kullanmak için ayarları kaydedin.`
        : `${getAiServiceLabel(service)} bağlantısı çalışıyor.`,
      model: result.model || model,
      models
    };
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

  ipcMain.handle("request:delete", (_event, requestId: unknown): DesktopStatusUpdateResult => {
    return finalizeDesktopRecordDeletion(getDatabase().deleteRequest(String(requestId ?? "")));
  });

  ipcMain.handle("customer:delete", (_event, customerId: unknown): DesktopStatusUpdateResult => {
    return finalizeDesktopRecordDeletion(getDatabase().deleteCustomer(String(customerId ?? "")));
  });

  ipcMain.handle("whatsapp:markMessageSent", (_event, input: MarkWhatsAppMessageSentInput): DesktopStatusUpdateResult => {
    return getDatabase().markWhatsAppMessageSent(input);
  });

  ipcMain.handle("whatsapp:deleteMessage", (_event, input: DeleteWhatsAppMessageInput): DesktopStatusUpdateResult => {
    return finalizeDesktopRecordDeletion(getDatabase().deleteWhatsAppMessage(input));
  });

  ipcMain.handle("room:updateStatus", (_event, input: UpdateRoomStatusInput): DesktopStatusUpdateResult => {
    return getDatabase().updateRoomStatus(input);
  });

  ipcMain.handle("table:updateStatus", (_event, input: UpdateTableStatusInput): DesktopStatusUpdateResult => {
    return getDatabase().updateTableStatus(input);
  });

  ipcMain.handle("tableOrder:list", (): DesktopTableOrder[] => {
    return getDatabase().listTableOrders();
  });

  ipcMain.handle("tableOrder:getActive", (_event, tableId: unknown): DesktopTableOrder | null => {
    return typeof tableId === "string" ? getDatabase().getActiveTableOrder(tableId) : null;
  });

  ipcMain.handle("tableOrder:open", (_event, tableId: unknown): DesktopTableOrderResult => {
    return typeof tableId === "string"
      ? getDatabase().openTableOrder(tableId)
      : invalidTableOrderPayload("Sipariş açmak için geçerli bir masa seçin.");
  });

  ipcMain.handle("tableOrder:addItem", (_event, input: unknown): DesktopTableOrderResult => {
    const parsedInput = parseAddTableOrderItemInput(input);
    return parsedInput
      ? getDatabase().addTableOrderItem(parsedInput)
      : invalidTableOrderPayload("Ürün ekleme bilgileri geçersiz.");
  });

  ipcMain.handle("tableOrder:updateItemQuantity", (_event, input: unknown): DesktopTableOrderResult => {
    const parsedInput = parseUpdateTableOrderItemQuantityInput(input);
    return parsedInput
      ? getDatabase().updateTableOrderItemQuantity(parsedInput)
      : invalidTableOrderPayload("Ürün adedi bilgisi geçersiz.");
  });

  ipcMain.handle("tableOrder:updateItemNote", (_event, input: unknown): DesktopTableOrderResult => {
    const parsedInput = parseUpdateTableOrderItemNoteInput(input);
    return parsedInput
      ? getDatabase().updateTableOrderItemNote(parsedInput)
      : invalidTableOrderPayload("Ürün notu bilgisi geçersiz.");
  });

  ipcMain.handle("tableOrder:removeItem", (_event, itemId: unknown): DesktopTableOrderResult => {
    return typeof itemId === "string"
      ? getDatabase().removeTableOrderItem(itemId)
      : invalidTableOrderPayload("Silinecek sipariş satırı geçersiz.");
  });

  ipcMain.handle("tableOrder:updateStatus", (_event, input: unknown): DesktopTableOrderResult => {
    const parsedInput = parseUpdateTableOrderStatusInput(input);
    return parsedInput
      ? getDatabase().updateTableOrderStatus(parsedInput)
      : invalidTableOrderPayload("Adisyon durumu bilgisi geçersiz.");
  });

  ipcMain.handle("tableOrder:close", (_event, input: unknown): DesktopTableOrderResult => {
    const parsedInput = parseUpdateTableOrderStatusInput(input);
    return parsedInput
      ? getDatabase().closeTableOrder(parsedInput)
      : invalidTableOrderPayload("Adisyon kapatma bilgisi geçersiz.");
  });

  ipcMain.handle("tableOrder:recalculate", (_event, orderId: unknown): DesktopTableOrderResult => {
    return typeof orderId === "string"
      ? getDatabase().recalculateTableOrderTotal(orderId)
      : invalidTableOrderPayload("Toplamı hesaplanacak adisyon geçersiz.");
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

  ipcMain.handle("ai:generateWorkspace", async (_event, input: GenerateAiWorkspaceInput): Promise<GenerateAiWorkspaceResult> => {
    return generateAiWorkspaceEntry(input);
  });

  ipcMain.handle("ai:getWorkspaceHistory", (_event, limit?: number): AiWorkspaceHistoryEntry[] => {
    return getDatabase().getAiWorkspaceHistory(limit);
  });

  ipcMain.handle("ai:saveWorkspaceResult", (_event, input: SaveAiWorkspaceResultInput): SaveAiWorkspaceResult => {
    return getDatabase().saveAiWorkspaceResult(input);
  });

  ipcMain.handle("shell:openExternal", async (_event, url: string) => {
    if (!/^https?:\/\//.test(url) && !/^tel:/.test(url)) {
      return false;
    }

    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle("dashboard:getData", (): DesktopDashboardData => {
    assertAppSessionUnlocked();
    return getDatabase().getDashboardData();
  });
}

function registerAppLockIpcHandlers() {
  ipcMain.handle("appLock:getStatus", (): AppLockStatus => getAppLockStatus());

  ipcMain.handle("appLock:lock", (): AppLockActionResult => {
    appSessionLocked = true;
    return {
      ok: true,
      message: "Uygulama kilitlendi.",
      status: getAppLockStatus()
    };
  });

  ipcMain.handle("appLock:unlock", async (_event, passwordValue: unknown): Promise<AppLockActionResult> => {
    const retryAfterSeconds = getAppLockRetryAfterSeconds();
    if (retryAfterSeconds > 0) {
      return appLockFailureResult(
        `Çok fazla deneme yapıldı. ${retryAfterSeconds} saniye sonra tekrar deneyin.`,
        retryAfterSeconds
      );
    }

    const verifier = getDatabase().getAppLockPasswordVerifier();
    if (!verifier) {
      resetAppLockFailures();
      appSessionLocked = false;
      return {
        ok: true,
        message: "Kilit açıldı.",
        status: getAppLockStatus()
      };
    }

    const password = typeof passwordValue === "string" ? passwordValue : "";
    if (!await verifyAppPassword(password, verifier)) {
      const nextRetryAfterSeconds = recordAppLockFailure();
      return appLockFailureResult(
        nextRetryAfterSeconds > 0
          ? `Şifre doğru değil. ${nextRetryAfterSeconds} saniye sonra tekrar deneyin.`
          : "Şifre doğru değil.",
        nextRetryAfterSeconds
      );
    }

    resetAppLockFailures();
    appSessionLocked = false;
    return {
      ok: true,
      message: "Kilit açıldı.",
      status: getAppLockStatus()
    };
  });

  ipcMain.handle(
    "appLock:updatePassword",
    async (_event, inputValue: unknown): Promise<AppLockActionResult> => {
      if (appSessionLocked) {
        return appLockFailureResult("Şifreyi değiştirmek için önce uygulama kilidini açın.");
      }

      const input = toAppPasswordUpdateInput(inputValue);
      if (!input) {
        return appLockFailureResult("Şifre bilgileri okunamadı.");
      }

      const retryAfterSeconds = getAppLockRetryAfterSeconds();
      if (retryAfterSeconds > 0) {
        return appLockFailureResult(
          `Çok fazla deneme yapıldı. ${retryAfterSeconds} saniye sonra tekrar deneyin.`,
          retryAfterSeconds
        );
      }

      const currentVerifier = getDatabase().getAppLockPasswordVerifier();
      if (currentVerifier && !await verifyAppPassword(input.currentPassword, currentVerifier)) {
        const nextRetryAfterSeconds = recordAppLockFailure();
        return appLockFailureResult(
          nextRetryAfterSeconds > 0
            ? `Mevcut şifre doğru değil. ${nextRetryAfterSeconds} saniye sonra tekrar deneyin.`
            : "Mevcut şifre doğru değil.",
          nextRetryAfterSeconds
        );
      }

      if (!input.newPassword) {
        getDatabase().setAppLockPasswordVerifier("");
        resetAppLockFailures();
        return {
          ok: true,
          message: "Uygulama açılış şifresi kaldırıldı.",
          status: getAppLockStatus()
        };
      }

      const validationMessage = validateAppPassword(input.newPassword);
      if (validationMessage) {
        return appLockFailureResult(validationMessage);
      }

      try {
        const verifier = await createAppPasswordVerifier(input.newPassword);
        getDatabase().setAppLockPasswordVerifier(verifier);
        resetAppLockFailures();
        return {
          ok: true,
          message: currentVerifier
            ? "Uygulama açılış şifresi değiştirildi."
            : "Uygulama açılış şifresi belirlendi.",
          status: getAppLockStatus()
        };
      } catch {
        return appLockFailureResult("Uygulama şifresi güvenli biçimde kaydedilemedi.");
      }
    }
  );

  ipcMain.handle(
    "appLock:resetWithWebSecurityKey",
    (_event, webSecurityKeyValue: unknown): AppLockActionResult => {
      const retryAfterSeconds = getAppLockRetryAfterSeconds();
      if (retryAfterSeconds > 0) {
        return appLockFailureResult(
          `Çok fazla deneme yapıldı. ${retryAfterSeconds} saniye sonra tekrar deneyin.`,
          retryAfterSeconds
        );
      }

      const suppliedKey = typeof webSecurityKeyValue === "string" ? webSecurityKeyValue.trim() : "";
      const expectedKey = getWebSyncConfig(getDatabase().getSetupData()).syncSecret.trim();
      if (
        !suppliedKey
        || suppliedKey.length > 4096
        || !expectedKey
        || !secureTextEqual(suppliedKey, expectedKey)
      ) {
        const nextRetryAfterSeconds = recordAppLockFailure();
        return appLockFailureResult(
          nextRetryAfterSeconds > 0
            ? `Web güvenlik anahtarı doğru değil. ${nextRetryAfterSeconds} saniye sonra tekrar deneyin.`
            : "Web güvenlik anahtarı doğru değil.",
          nextRetryAfterSeconds
        );
      }

      getDatabase().setAppLockPasswordVerifier("");
      resetAppLockFailures();
      appSessionLocked = false;
      return {
        ok: true,
        message: "Uygulama şifresi sıfırlandı ve kilit açıldı.",
        status: getAppLockStatus()
      };
    }
  );
}

function invalidTableOrderPayload(message: string): DesktopTableOrderResult {
  return { ok: false, message };
}

async function analyzeDesktopStockImage(value: unknown): Promise<DesktopStockImageAnalyzeResult> {
  const input = parseDesktopStockImageAnalyzeInput(value);
  if (!input) {
    return { ok: false, code: "invalid_image", message: "Görsel okunamadı." };
  }
  if (input.bytes.byteLength > STOCK_IMAGE_MAX_BYTES) {
    return { ok: false, code: "image_too_large", message: "Görsel çok büyük." };
  }
  const bytes = new Uint8Array(input.bytes);
  const detectedMime = detectStockImageMime(bytes);
  if (!detectedMime || detectedMime !== input.mimeType) {
    return { ok: false, code: "unsupported_image_type", message: "Desteklenmeyen dosya türü." };
  }
  const menuItems = getDatabase().getTrackedStockCandidates();
  if (menuItems.length === 0) {
    return { ok: false, code: "no_tracked_items", message: "Stok takip edilen menü ürünü bulunamadı." };
  }
  if (stockImageAnalysisControllers.has(input.importId)) {
    return { ok: false, code: "analysis_in_progress", message: "Bu görsel zaten analiz ediliyor." };
  }
  const imageHash = createHash("sha256").update(bytes).digest("hex");
  const created = getDatabase().createStockImageImport({
    importId: input.importId,
    source: "desktop",
    imageHash,
    originalFilename: input.fileName
  });
  if (!created.ok) {
    return { ok: false, code: "import_conflict", message: created.message };
  }

  const setup = getDatabase().getSetupData();
  const endpoint = createStockImageAnalysisUrl(setup.webModuleUrl);
  if (!endpoint || !setup.syncSecret.trim()) {
    getDatabase().failStockImageImport(input.importId, "Web modülü bağlantısı eksik.");
    return { ok: false, code: "connection_incomplete", message: "Görsel analizi için web modülü bağlantısını ayarlayın." };
  }
  const controller = new AbortController();
  stockImageAnalysisControllers.set(input.importId, controller);
  const timeout = setTimeout(() => controller.abort(), Math.max(30_000, setup.aiTimeoutSeconds * 1000 + 10_000));
  try {
    const form = new FormData();
    form.append("source", "desktop");
    form.append("import_id", input.importId);
    form.append("image_hash", imageHash);
    form.append("menu_items", JSON.stringify(menuItems));
    form.append("image", new Blob([input.bytes], { type: input.mimeType }), input.fileName);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-YA-Sync-Secret": setup.syncSecret
      },
      body: form,
      redirect: "error",
      signal: controller.signal
    });
    const payload = toUnknownRecord(await response.json().catch(() => null));
    if (!response.ok || payload?.ok !== true) {
      const message = stockImageEndpointErrorMessage(response.status, payload);
      getDatabase().failStockImageImport(input.importId, message);
      return {
        ok: false,
        code: typeof payload?.code === "string" ? payload.code : "analysis_failed",
        message
      };
    }
    if (String(payload.import_id ?? "") !== input.importId || String(payload.image_hash ?? "").toLowerCase() !== imageHash) {
      getDatabase().failStockImageImport(input.importId, "Görsel analiz cevabı doğrulanamadı.");
      return { ok: false, code: "invalid_analysis_response", message: "Görsel analiz cevabı doğrulanamadı." };
    }
    const analysisValue = payload.analysis;
    if (!analysisValue || typeof analysisValue !== "object" || Array.isArray(analysisValue)) {
      getDatabase().failStockImageImport(input.importId, "Görsel analiz cevabı geçersiz.");
      return { ok: false, code: "invalid_analysis_response", message: "Görsel analiz cevabı geçersiz." };
    }
    const analysis = getDatabase().completeStockImageAnalysis(input.importId, analysisValue as StockImageAnalysis);
    if (!analysis) {
      return { ok: false, code: "draft_unavailable", message: "Görsel stok taslağı kaydedilemedi." };
    }
    return {
      ok: true,
      message: typeof payload.message === "string" && payload.message.trim()
        ? payload.message.trim()
        : "Görsel analiz edildi. Satırları kontrol edin.",
      importId: input.importId,
      imageHash,
      duplicateWarning: created.duplicateWarning,
      analysis
    };
  } catch (error) {
    const cancelled = controller.signal.aborted;
    const message = cancelled
      ? "Görsel analizi iptal edildi."
      : "Görsel analiz hizmetine ulaşılamadı.";
    getDatabase().failStockImageImport(input.importId, message, cancelled);
    return {
      ok: false,
      code: cancelled ? "analysis_cancelled" : "analysis_connection_failed",
      message
    };
  } finally {
    clearTimeout(timeout);
    stockImageAnalysisControllers.delete(input.importId);
  }
}

function parseDesktopStockImageAnalyzeInput(value: unknown): DesktopStockImageAnalyzeInput | null {
  const record = toUnknownRecord(value);
  const importId = normalizeStockImageImportId(record?.importId);
  const fileName = typeof record?.fileName === "string" ? record.fileName.trim().slice(0, 255) : "";
  const mimeType = typeof record?.mimeType === "string" ? record.mimeType.trim().toLowerCase() : "";
  const bytes = record?.bytes;
  if (!importId || !fileName || !["image/jpeg", "image/png", "image/webp"].includes(mimeType) || !(bytes instanceof ArrayBuffer)) {
    return null;
  }
  return { importId, fileName, mimeType, bytes };
}

function parseStockImageApplyInput(value: unknown): ApplyStockImageImportInput | null {
  const record = toUnknownRecord(value);
  const importId = normalizeStockImageImportId(record?.importId);
  const imageHash = typeof record?.imageHash === "string" ? record.imageHash.trim().toLowerCase() : "";
  if (!importId || !/^[a-f0-9]{64}$/.test(imageHash) || !Array.isArray(record?.lines)) {
    return null;
  }
  return {
    importId,
    imageHash,
    duplicateWarningAcknowledged: record.duplicateWarningAcknowledged === true,
    lines: record.lines as StockImageApplyLine[]
  };
}

function normalizeStockImageImportId(value: unknown): string {
  const importId = String(value ?? "").trim();
  return /^[A-Za-z0-9._:-]{8,160}$/.test(importId) ? importId : "";
}

function detectStockImageMime(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return "image/png";
  }
  if (bytes.length >= 12
      && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    return "image/webp";
  }
  return null;
}

function createStockImageAnalysisUrl(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl.trim());
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
      return "";
    }
    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = parsed.pathname
      .replace(/\/(?:api\/)?sync\.php\/?$/i, "")
      .replace(/\/+$/, "") + "/api/stock-image-analysis.php";
    return parsed.toString();
  } catch {
    return "";
  }
}

function stockImageEndpointErrorMessage(status: number, payload: Record<string, unknown> | null): string {
  const provided = typeof payload?.message === "string" ? payload.message.trim() : "";
  if (provided) {
    return provided.slice(0, 500);
  }
  if (status === 401 || status === 403) {
    return "Görsel analizi için yetki alınamadı.";
  }
  if (status === 413) {
    return "Görsel çok büyük.";
  }
  if (status === 415) {
    return "Desteklenmeyen dosya türü.";
  }
  if (status === 404) {
    return "Web modülü görsel analizini desteklemiyor. Hosting paketini güncelleyin.";
  }
  return "Görsel analiz edilemedi.";
}

function finalizeAndroidDeviceMutation(result: DesktopAndroidDeviceMutationResult): DesktopAndroidDeviceMutationResult {
  if (result.ok) {
    androidSnapshotPublishPending = true;
    notifyDesktopDashboardChanged(getDatabase().getDashboardData());
    getSyncCoordinator().scheduleSoon();
  }
  return result;
}

function finalizeDesktopRecordDeletion(result: DesktopStatusUpdateResult): DesktopStatusUpdateResult {
  if (result.ok) {
    androidSnapshotPublishPending = true;
    notifyDesktopDashboardChanged(result.dashboardData);
    getSyncCoordinator().scheduleSoon();
  }
  return result;
}

function parseAddTableOrderItemInput(value: unknown): AddTableOrderItemInput | null {
  const record = toUnknownRecord(value);
  return record
    && typeof record.orderId === "string"
    && typeof record.menuItemId === "string"
    && typeof record.quantity === "number"
    && Number.isFinite(record.quantity)
    && typeof record.note === "string"
    ? {
        orderId: record.orderId,
        menuItemId: record.menuItemId,
        quantity: record.quantity,
        note: record.note
      }
    : null;
}

function parseUpdateTableOrderItemQuantityInput(value: unknown): UpdateTableOrderItemQuantityInput | null {
  const record = toUnknownRecord(value);
  return record
    && typeof record.itemId === "string"
    && typeof record.quantity === "number"
    && Number.isFinite(record.quantity)
    ? { itemId: record.itemId, quantity: record.quantity }
    : null;
}

function parseUpdateTableOrderItemNoteInput(value: unknown): UpdateTableOrderItemNoteInput | null {
  const record = toUnknownRecord(value);
  return record && typeof record.itemId === "string" && typeof record.note === "string"
    ? { itemId: record.itemId, note: record.note }
    : null;
}

function parseUpdateTableOrderStatusInput(value: unknown): UpdateTableOrderStatusInput | null {
  const record = toUnknownRecord(value);
  return record && typeof record.orderId === "string" && typeof record.status === "string"
    ? { orderId: record.orderId, status: record.status }
    : null;
}

function toUnknownRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getDatabase() {
  if (!desktopDatabase) {
    throw new Error("Desktop database is not initialized.");
  }

  return desktopDatabase;
}

function getAppLockStatus(): AppLockStatus {
  const syncStatus = syncCoordinator?.getStatus();
  const syncProblemCount = syncStatus?.enabled && syncStatus.consecutiveFailures > 0 && syncStatus.lastError ? 1 : 0;
  return {
    locked: appSessionLocked,
    passwordConfigured: Boolean(getDatabase().getAppLockPasswordVerifier()),
    notificationCount: getDatabase().getAppLockNotificationCount() + syncProblemCount
  };
}

function appLockFailureResult(message: string, retryAfterSeconds = 0): AppLockActionResult {
  return {
    ok: false,
    message,
    status: getAppLockStatus(),
    ...(retryAfterSeconds > 0 ? { retryAfterSeconds } : {})
  };
}

function toAppPasswordUpdateInput(value: unknown): UpdateAppPasswordInput | null {
  const record = toUnknownRecord(value);
  if (!record) {
    return null;
  }
  return {
    currentPassword: typeof record.currentPassword === "string" ? record.currentPassword : "",
    newPassword: typeof record.newPassword === "string" ? record.newPassword : ""
  };
}

function getAppLockRetryAfterSeconds(): number {
  if (appLockBlockedUntil <= Date.now()) {
    appLockBlockedUntil = 0;
    return 0;
  }
  return Math.max(1, Math.ceil((appLockBlockedUntil - Date.now()) / 1000));
}

function recordAppLockFailure(): number {
  appLockFailureCount += 1;
  if (appLockFailureCount < APP_LOCK_FAILURE_LIMIT) {
    return 0;
  }

  appLockFailureCount = 0;
  appLockBlockedUntil = Date.now() + APP_LOCK_RETRY_DELAY_MS;
  return getAppLockRetryAfterSeconds();
}

function resetAppLockFailures() {
  appLockFailureCount = 0;
  appLockBlockedUntil = 0;
}

function assertAppSessionUnlocked() {
  if (appSessionLocked) {
    throw new Error("Uygulama kilitli. Devam etmek için kilidi açın.");
  }
}

function getSyncCoordinator() {
  if (!syncCoordinator) {
    throw new Error("Sync coordinator is not initialized.");
  }
  return syncCoordinator;
}

function canUseAndroidSync(setup: DesktopSetupData, allowPlaceholderSecret: boolean) {
  const { baseUrl, syncSecret } = getWebSyncConfig(setup);
  return setup.modules.android
    && Boolean(baseUrl.trim())
    && Boolean(syncSecret.trim())
    && (allowPlaceholderSecret || syncSecret.trim() !== "change-this-secret");
}

function processAndroidActionQueue(allowPlaceholderSecret: boolean): Promise<AndroidActionProcessSummary> {
  if (androidActionSyncInFlight) {
    return androidActionSyncInFlight;
  }

  androidActionSyncInFlight = processAndroidActionQueueOnce(allowPlaceholderSecret)
    .finally(() => {
      androidActionSyncInFlight = null;
    });
  return androidActionSyncInFlight;
}

async function processAndroidActionQueueOnce(allowPlaceholderSecret: boolean): Promise<AndroidActionProcessSummary> {
  const summary: AndroidActionProcessSummary = { pulled: 0, applied: 0, failed: 0 };
  const setup = getDatabase().getSetupData();
  if (!canUseAndroidSync(setup, allowPlaceholderSecret)) {
    return summary;
  }

  const syncConfig = getWebSyncConfig(setup);
  const pullResult = await pullAndroidActions({ ...syncConfig, limit: 100 });
  if (!pullResult.ok) {
    getDatabase().recordSyncEvent({
      direction: "pull",
      entityType: "android_action",
      ok: false,
      message: pullResult.message,
      status: pullResult.status
    });
    return summary;
  }

  const androidDevicesChanged = getDatabase().upsertAndroidDeviceSightings(pullResult.devices ?? []);
  summary.pulled = pullResult.count;
  for (const action of pullResult.actions) {
    const applyResult = getDatabase().applyAndroidAction(action);
    getDatabase().recordAndroidActionResult(action, applyResult);
    const actionStatus = applyResult.ok ? "applied" : "failed";
    const markResult = await markAndroidActionResult({
      ...syncConfig,
      actionId: action.id,
      status: actionStatus,
      errorMessage: applyResult.ok ? "" : applyResult.message
    });

    if (applyResult.ok) {
      summary.applied += 1;
    } else {
      summary.failed += 1;
    }
    if (!markResult.ok) {
      getDatabase().recordSyncEvent({
        direction: "push",
        entityType: "android_action_result",
        ok: false,
        message: markResult.message,
        status: markResult.status
      });
    }
  }

  getDatabase().recordSyncEvent({
    direction: "pull",
    entityType: "android_action",
    ok: true,
    recordCount: summary.pulled,
    message: `${summary.applied} telefon işlemi uygulandı, ${summary.failed} işlem uygulanamadı.`
  });
  if (summary.applied > 0 || summary.failed > 0 || androidDevicesChanged > 0) {
    notifyDesktopDashboardChanged(getDatabase().getDashboardData());
    androidSnapshotPublishPending = true;
  }
  if (androidSnapshotPublishPending) {
    await publishCurrentAndroidSnapshot();
  }
  return summary;
}

function notifyDesktopDashboardChanged(dashboardData: DesktopDashboardData) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send("dashboard:dataChanged", dashboardData);
    }
  }
}

function notifySyncStatusChanged(status: AutomaticSyncStatus) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send("sync:statusChanged", status);
    }
  }
}

async function publishCurrentAndroidSnapshot(): Promise<PushAndroidSnapshotResult> {
  const setup = getDatabase().getSetupData();
  const snapshot = createAndroidOperationsSnapshot(getDatabase().getDashboardData());
  const result = await pushAndroidSnapshot({
    ...getWebSyncConfig(setup),
    snapshot
  });

  getDatabase().recordSyncEvent({
    direction: "push",
    entityType: "android_snapshot",
    ok: result.ok,
    recordCount: result.ok ? result.task_count + snapshot.requests.length + snapshot.rooms.length + snapshot.tables.length : 0,
    message: result.message,
    status: result.ok ? undefined : result.status
  });
  androidSnapshotPublishPending = !result.ok;
  return result;
}

function createAndroidOperationsSnapshot(dashboardData: DesktopDashboardData): AndroidOperationsSnapshot {
  const updatedAt = new Date().toISOString();
  const today = formatLocalDateKey(new Date());
  const activeTableOrders = getDatabase()
    .listTableOrders()
    .filter((order) => ["open", "preparing", "served", "payment"].includes(order.status));
  const activeMenuCategories = dashboardData.menu.categories.filter((category) => category.is_active);
  const activeMenuCategoryIds = new Set(activeMenuCategories.map((category) => category.id));
  const menuCategoryNames = new Map(dashboardData.menu.categories.map((category) => [category.id, category.name]));
  const androidMenu = {
    categories: activeMenuCategories,
    items: dashboardData.menu.items.filter((item) => item.is_available && activeMenuCategoryIds.has(item.category_id)),
    updated_at: dashboardData.menu.updated_at
  };
  const messages = getDatabase().getAndroidPreparedMessages().map((message) => ({
    id: message.id,
    request_id: message.requestId,
    customer_name: message.customerName,
    customer_phone: message.customerPhone,
    message: message.message,
    status: message.status,
    updated_at: message.updatedAt
  }));

  return {
    summary: {
      pending_daily_tasks: dashboardData.summary.pendingDailyTasks,
      today_tasks: dashboardData.dailyTasks.filter((task) => task.dueDate === today && task.status !== "archived").length,
      available_rooms: dashboardData.summary.availableRooms,
      total_rooms: dashboardData.summary.totalRooms,
      available_tables: dashboardData.summary.availableTables,
      occupied_tables: dashboardData.tables.filter((table) => table.status === "occupied").length,
      bill_waiting_tables: dashboardData.tables.filter((table) => table.status === "bill_waiting").length,
      active_table_orders: activeTableOrders.length,
      pending_reservations: dashboardData.summary.pendingReservations,
      prepared_whatsapp_messages: messages.length,
      waiting_responses: dashboardData.requests.filter((request) => ["new", "seen", "waiting_owner"].includes(request.status)).length,
      active_menu_categories: dashboardData.summary.activeMenuCategories,
      available_menu_items: dashboardData.summary.availableMenuItems,
      customer_count: dashboardData.customers.length
    },
    daily_tasks: dashboardData.dailyTasks
      .filter((task) => task.status !== "archived")
      .slice(0, 200)
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
    requests: dashboardData.requests.slice(0, 300).map((request) => ({
      id: request.id,
      customer_id: request.customer_id,
      request_type: request.request_type,
      status: request.status,
      customer_name: request.customer_name,
      customer_phone: request.customer_phone,
      date_text: request.date_text,
      start_date: request.start_date,
      end_date: request.end_date,
      time: request.time,
      guest_count: request.guest_count,
      message: request.message,
      ai_summary: request.ai_summary,
      ai_suggested_reply: request.ai_suggested_reply,
      whatsapp_message: request.whatsapp_message,
      priority: request.priority,
      created_at: request.created_at,
      updated_at: request.updated_at
    })),
    customers: dashboardData.customers.slice(0, 300).map((customer) => ({
      id: customer.id,
      full_name: customer.fullName,
      phone: customer.phone,
      email: customer.email,
      notes: customer.notes,
      tags: customer.tags,
      request_count: customer.requestCount,
      reservation_count: customer.reservationCount,
      updated_at: customer.updatedAt
    })),
    reservations: dashboardData.reservations.slice(0, 300).map((reservation) => ({
      id: reservation.id,
      request_id: reservation.requestId,
      customer_id: reservation.customerId,
      customer_name: reservation.customerName,
      customer_phone: reservation.customerPhone,
      reservation_type: reservation.reservationType,
      status: reservation.status,
      title: reservation.title,
      start_date: reservation.startDate,
      end_date: reservation.endDate,
      time: reservation.time,
      guest_count: reservation.guestCount,
      room_ids: reservation.roomIds,
      table_ids: reservation.tableIds,
      notes: reservation.notes,
      payment_status: reservation.paymentStatus,
      updated_at: reservation.updatedAt
    })),
    rooms: dashboardData.rooms.filter((room) => room.isActive).map((room) => ({
      id: room.id,
      name: room.name,
      number: room.number,
      capacity: room.capacity,
      status: room.status,
      active_reservation_title: room.activeReservationTitle,
      updated_at: room.updatedAt
    })),
    tables: dashboardData.tables.filter((table) => table.isActive).map((table) => ({
      id: table.id,
      name: table.name,
      area: table.area,
      capacity: table.capacity,
      status: table.status,
      active_reservation_title: table.activeReservationTitle,
      updated_at: table.updatedAt
    })),
    menu: androidMenu,
    admin_menu: dashboardData.menu,
    deleted_request_ids: getDatabase().getDeletedRequestIds(),
    trackedStockItems: dashboardData.menu.items
      .filter((item) => item.stock_quantity !== null)
      .map((item) => ({
        menu_item_id: item.id,
        name: item.name,
        category: menuCategoryNames.get(item.category_id) ?? "Menü",
        price: item.price,
        stock_quantity: item.stock_quantity ?? 0,
        stock_min_quantity: item.stock_min_quantity,
        stock_unit: item.stock_unit,
        stock_consumption_quantity: item.stock_consumption_quantity,
        hide_when_out_of_stock: item.hide_when_out_of_stock,
        stock_status: getMenuStockStatus(item.stock_quantity ?? 0, item.stock_min_quantity, item.stock_consumption_quantity)
      })),
    appliedStockImageHashes: getDatabase().getAppliedStockImageHashes(100),
    table_orders: activeTableOrders.map((order) => ({
      id: order.id,
      table_id: order.tableId,
      table_name: order.tableName,
      status: order.status,
      opened_at: order.openedAt,
      total: order.total,
      item_count: order.itemCount,
      items: order.items.map((item) => ({
        id: item.id,
        order_id: item.orderId,
        menu_item_id: item.menuItemId,
        product_name: item.productName,
        unit_price: item.unitPrice,
        currency: item.currency,
        quantity: item.quantity,
        line_total: item.lineTotal,
        status: item.status,
        updated_at: item.updatedAt
      })),
      updated_at: order.updatedAt
    })),
    messages: messages.slice(0, 300),
    androidPermissions: getDatabase().getAndroidPermissionSnapshot(),
    reports: getDatabase().getAndroidReportPresets(today),
    updated_at: updatedAt
  };
}

function getMenuStockStatus(quantity: number, minimum: number | null, consumptionQuantity = 1): "out_of_stock" | "low_stock" | "in_stock" {
  if (quantity < consumptionQuantity) {
    return "out_of_stock";
  }
  if (minimum !== null && quantity <= minimum) {
    return "low_stock";
  }
  return "in_stock";
}

function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createDesktopAiConfig(setup: DesktopSetupData) {
  const legacyEnvApiKey = (process.env.YARDIMCI_ASISTAN_AI_API_KEY ?? process.env.OPENAI_API_KEY ?? "").trim();
  const useLegacyEnvironment = !setup.aiApiKeyConfigured && legacyEnvApiKey !== "";
  const enabled = setup.aiEnabled;
  const provider = (setup.aiProvider || "openai_compatible") as AIProviderName;
  const timeoutSeconds = normalizeAiTimeoutSeconds(
    useLegacyEnvironment ? Number(process.env.YARDIMCI_ASISTAN_AI_TIMEOUT_SECONDS ?? setup.aiTimeoutSeconds) : setup.aiTimeoutSeconds
  );

  return {
    enabled,
    provider: enabled ? provider : "disabled" as AIProviderName,
    service: setup.aiService,
    baseUrl: useLegacyEnvironment ? process.env.YARDIMCI_ASISTAN_AI_BASE_URL || setup.aiBaseUrl : setup.aiBaseUrl,
    model: useLegacyEnvironment ? process.env.YARDIMCI_ASISTAN_AI_MODEL || setup.aiModel : setup.aiModel,
    apiKey: getEffectiveAiApiKey(setup.aiService),
    authMode: setup.aiService === "gemini" ? "google_api_key" as const : "bearer" as const,
    timeoutMs: timeoutSeconds * 1000
  };
}

async function generateDesktopReportAiComment(
  input: GenerateDesktopReportAiInput
): Promise<GenerateDesktopReportAiResult> {
  const mode = input?.mode;
  if (!["summary", "attention", "sales", "recommendations"].includes(mode)) {
    return { ok: false, message: "Geçerli bir AI yorum türü seçin." };
  }

  const setup = getDatabase().getSetupData();
  const config = createDesktopAiConfig(setup);
  if (!config.enabled || config.provider === "disabled") {
    return { ok: false, message: "Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı." };
  }

  let report;
  try {
    report = getDatabase().getReportData(input.range);
  } catch {
    return { ok: false, message: "Rapor verileri hazırlanamadı." };
  }
  const payload = buildReportAiPayload(report);
  if (!reportHasEnoughData(payload)) {
    return { ok: true, content: "Bu dönem için yeterli veri yok." };
  }

  try {
    const completion = await generateConfiguredChat({
      ...config,
      messages: buildReportAiMessages(mode, payload, setup.businessName || "İşletme")
    });
    if (!completion.ok) {
      return { ok: false, message: "Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı." };
    }
    const sanitized = sanitizeReportAiAnswer(completion.answer, payload, mode);
    return sanitized.ok
      ? sanitized
      : { ok: false, message: "Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı." };
  } catch {
    return { ok: false, message: "Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı." };
  }
}

async function generateAiWorkspaceEntry(input: GenerateAiWorkspaceInput): Promise<GenerateAiWorkspaceResult> {
  const mode = input?.mode;
  if (mode !== "reply" && mode !== "summary" && mode !== "daily") {
    return { ok: false, message: "AI çalışma türü geçersiz." };
  }

  const setup = getDatabase().getSetupData();
  const instructions = String(input?.instructions ?? "").trim().slice(0, 800);
  const request = mode === "daily" ? null : getDatabase().getRequestById(String(input?.requestId ?? ""));
  if (mode !== "daily" && !request) {
    return { ok: false, message: "Bu çalışma için bir talep seçin." };
  }

  const config = createDesktopAiConfig(setup);
  let content = "";
  let summary = "";
  let missingFields: string[] = [];
  let provider = String(config.provider);
  let model = setup.aiModel;
  let fallback = false;
  let providerMessage = "";
  const requestLabel = request ? `${request.customer_name} • ${formatWorkspaceRequestType(request.request_type)}` : "Günlük işletme özeti";

  if (mode === "reply" && request) {
    const suggestion = await generateOwnerReplySuggestion(
      {
        businessName: setup.businessName || "Yardımcı Asistan",
        customerName: request.customer_name,
        requestType: request.request_type,
        dateText: request.date_text || request.start_date,
        guestCount: request.guest_count,
        message: request.message,
        tone: "warm",
        instructions
      },
      config
    );
    content = suggestion.suggestedReply;
    summary = suggestion.summary;
    missingFields = suggestion.missingFields;
    provider = String(suggestion.provider ?? provider);
    model = suggestion.model || model;
    fallback = suggestion.fallback === true;
    providerMessage = suggestion.providerMessage ?? "";
  } else {
    const dashboard = getDatabase().getDashboardData();
    const localFallback = mode === "summary" && request
      ? buildLocalRequestSummary(request)
      : buildLocalDailyEvaluation(dashboard);
    if (!config.enabled || config.provider === "disabled") {
      content = localFallback;
      summary = mode === "summary" ? localFallback.slice(0, 1600) : "Günlük işletme değerlendirmesi";
      provider = "disabled";
      fallback = true;
      providerMessage = "AI Yardımcı kapalı.";
    } else {
      const completion = await generateConfiguredChat({
        ...config,
        messages: buildAiWorkspaceMessages({
          mode: mode as "summary" | "daily",
          businessName: setup.businessName || "Yardımcı Asistan",
          request,
          dashboard,
          instructions
        })
      });

      if (completion.ok) {
        content = completion.answer.trim().slice(0, 6000);
        summary = mode === "summary" ? content.slice(0, 1600) : "Günlük işletme değerlendirmesi";
        provider = completion.provider;
        model = completion.model || model;
      } else {
        content = localFallback;
        summary = mode === "summary" ? localFallback.slice(0, 1600) : "Günlük işletme değerlendirmesi";
        provider = completion.provider;
        fallback = true;
        providerMessage = completion.message;
      }
    }
  }

  if (!content.trim()) {
    return { ok: false, message: "AI Yardımcı boş sonuç döndürdü." };
  }

  const entry = getDatabase().saveAiWorkspaceHistory({
    mode,
    requestId: request?.id ?? "",
    requestLabel,
    instructions,
    content,
    summary,
    missingFields,
    provider,
    model,
    fallback
  });

  return {
    ok: true,
    message: fallback
      ? `AI servisi kullanılamadı; güvenli yerel sonuç hazırlandı.${providerMessage ? ` ${providerMessage}` : ""}`
      : "AI sonucu hazırlandı. Düzenleyip kullanabilirsiniz.",
    entry
  };
}

function buildAiWorkspaceMessages(input: {
  mode: "summary" | "daily";
  businessName: string;
  request: ReturnType<DesktopDatabase["getRequestById"]>;
  dashboard: DesktopDashboardData;
  instructions: string;
}) {
  const commonRules = [
    `${input.businessName} için işletme sahibine yardımcı ol.`,
    "Türkçe, kısa, açık ve uygulanabilir yaz.",
    "Kesin rezervasyon, müsaitlik veya bağlayıcı fiyat onayı verme.",
    "Olmayan bilgi üretme."
  ];
  if (input.mode === "summary" && input.request) {
    return [
      {
        role: "system" as const,
        content: [...commonRules, "Talebi en fazla 5 kısa maddede özetle; eksik ve dikkat gerektiren bilgileri belirt."].join("\n")
      },
      {
        role: "user" as const,
        content: JSON.stringify({
          request: input.request,
          additionalInstructions: input.instructions
        })
      }
    ];
  }

  return [
    {
      role: "system" as const,
      content: [...commonRules, "Günlük operasyonu Öncelikler, Riskler ve Önerilen Sıra başlıklarıyla değerlendir."].join("\n")
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        summary: input.dashboard.summary,
        pendingTasks: input.dashboard.dailyTasks.filter((task) => task.status !== "completed").slice(0, 20),
        pendingReservations: input.dashboard.reservations.filter((reservation) => !["confirmed", "cancelled", "completed"].includes(reservation.status)).slice(0, 20),
        recentRequests: input.dashboard.requests.slice(0, 15).map((request) => ({
          customer: request.customer_name,
          type: request.request_type,
          status: request.status,
          date: request.date_text || request.start_date,
          message: request.message
        })),
        additionalInstructions: input.instructions
      })
    }
  ];
}

function buildLocalRequestSummary(request: NonNullable<ReturnType<DesktopDatabase["getRequestById"]>>) {
  const fields = [
    `Müşteri: ${request.customer_name || "Belirtilmedi"}`,
    `Talep: ${formatWorkspaceRequestType(request.request_type)}`,
    `Tarih: ${request.date_text || request.start_date || "Belirtilmedi"}`,
    `Kişi: ${request.guest_count > 0 ? request.guest_count : "Belirtilmedi"}`,
    `Not: ${request.message || "Belirtilmedi"}`
  ];
  return fields.map((field) => `• ${field}`).join("\n");
}

function buildLocalDailyEvaluation(dashboard: DesktopDashboardData) {
  const pendingTasks = dashboard.dailyTasks.filter((task) => task.status !== "completed");
  return [
    "Öncelikler",
    `• ${dashboard.summary.newRequests} yeni talebi kontrol edin.`,
    `• ${dashboard.summary.pendingReservations} bekleyen rezervasyonu değerlendirin.`,
    `• ${pendingTasks.length} tamamlanmamış günlük işi takip edin.`,
    "Riskler",
    `• Boş oda: ${dashboard.summary.availableRooms}/${dashboard.summary.totalRooms}; boş masa: ${dashboard.summary.availableTables}.`,
    "Önerilen Sıra",
    "• Önce yeni talepler, sonra rezervasyon onayları, ardından günlük işler."
  ].join("\n");
}

function formatWorkspaceRequestType(value: string) {
  const labels: Record<string, string> = {
    pension_reservation: "Pansiyon rezervasyonu",
    restaurant_reservation: "Masa rezervasyonu",
    breakfast_request: "Kahvaltı talebi",
    general_info: "Bilgi talebi",
    price_question: "Fiyat sorusu"
  };
  return labels[value] ?? "Genel talep";
}

async function publishSavedAiSettings(): Promise<PushAiSettingsResult> {
  const setup = getDatabase().getSetupData();
  const result = await pushAiSettings({
    ...getWebSyncConfig(setup),
    aiSettings: {
      enabled: setup.aiEnabled,
      provider: setup.aiProvider || "openai_compatible",
      service: setup.aiService || "custom",
      baseUrl: setup.aiBaseUrl,
      model: setup.aiModel,
      apiKey: setup.aiEnabled ? getEffectiveAiApiKey(setup.aiService) : "",
      timeoutSeconds: normalizeAiTimeoutSeconds(setup.aiTimeoutSeconds)
    }
  });

  if (result.ok) {
    try {
      getDatabase().markAiSettingsPublished(result.published_at);
    } catch {
      const invalidResponse: PushAiSettingsResult = {
        ok: false,
        message: "Web modülü AI ayarını aldı ancak yayın zamanı doğrulanamadı. Web modülünü güncelleyip tekrar deneyin."
      };
      getDatabase().recordSyncEvent({
        direction: "push",
        entityType: "ai_settings",
        ok: false,
        recordCount: 0,
        message: invalidResponse.message
      });
      return invalidResponse;
    }
  }

  getDatabase().recordSyncEvent({
    direction: "push",
    entityType: "ai_settings",
    ok: result.ok,
    recordCount: result.ok ? 1 : 0,
    message: result.message,
    status: result.ok ? undefined : result.status
  });

  return result;
}

function getWebSyncConfig(setup: DesktopSetupData) {
  const baseUrl = process.env.YA_WEB_MODULE_URL ?? setup.webModuleUrl;
  const syncSecret = process.env.YA_SYNC_SECRET ?? setup.syncSecret;

  return { baseUrl, syncSecret };
}

type AiApiKeyUpdate =
  | { mode: "keep" }
  | { mode: "replace"; encryptedValue: string }
  | { mode: "clear" };

function createAiApiKeyUpdate(input: SaveInitialSetupInput): { ok: true; update: AiApiKeyUpdate } | { ok: false; message: string } {
  if (!input || typeof input !== "object") {
    return {
      ok: false,
      message: "Kaydedilecek ayarlar okunamadı."
    };
  }

  return createEncryptedAiApiKeyUpdate(input.aiApiKey, input.clearAiApiKey);
}

function createAiProfileApiKeyUpdates(input: SaveInitialSetupInput):
  | {
      ok: true;
      profiles: SaveAiServiceProfileInput[];
      updates: Partial<Record<DesktopAiService, AiApiKeyUpdate>>;
    }
  | { ok: false; message: string } {
  const profiles = Array.isArray(input.aiProfiles) ? input.aiProfiles : [];
  const supportedServices = new Set<DesktopAiService>(["openai", "openrouter", "groq", "gemini", "custom"]);
  const updates: Partial<Record<DesktopAiService, AiApiKeyUpdate>> = {};
  const sanitizedProfiles: SaveAiServiceProfileInput[] = [];

  for (const profile of profiles) {
    const service = String(profile?.service ?? "").trim().toLowerCase() as DesktopAiService;
    if (!supportedServices.has(service)) {
      return { ok: false, message: "Kaydedilecek AI servis profillerinden biri geçersiz." };
    }

    const apiKey = String(profile.apiKey ?? "").trim();
    if (service !== input.aiService) {
      const update = createEncryptedAiApiKeyUpdate(apiKey, Boolean(profile.clearApiKey));
      if (!update.ok) {
        return update;
      }
      updates[service] = update.update;
    }
    sanitizedProfiles.push({
      ...profile,
      service,
      apiKey: apiKey ? "__encrypted_in_main_process__" : ""
    });
  }

  return { ok: true, profiles: sanitizedProfiles, updates };
}

function createEncryptedAiApiKeyUpdate(apiKeyValue: unknown, clearRequested: boolean): { ok: true; update: AiApiKeyUpdate } | { ok: false; message: string } {
  if (clearRequested) {
    return {
      ok: true,
      update: { mode: "clear" }
    };
  }

  const apiKey = String(apiKeyValue ?? "").trim();
  if (!apiKey) {
    return {
      ok: true,
      update: { mode: "keep" }
    };
  }

  if (!safeStorage.isEncryptionAvailable()) {
    return {
      ok: false,
      message: "Gizli erişim anahtarı bu cihazda güvenli biçimde saklanamıyor. İşletim sistemi anahtar kasasını kontrol edin."
    };
  }

  try {
    const encryptedValue = safeStorage.encryptString(apiKey).toString("base64");
    return {
      ok: true,
      update: {
        mode: "replace",
        encryptedValue: `safe-storage:v1:${encryptedValue}`
      }
    };
  } catch {
    return {
      ok: false,
      message: "Gizli erişim anahtarı güvenli biçimde kaydedilemedi."
    };
  }
}

function getEffectiveAiApiKey(service?: string) {
  const encryptedValue = getDatabase().getEncryptedAiApiKey(service);
  if (encryptedValue.startsWith("safe-storage:v1:")) {
    if (!safeStorage.isEncryptionAvailable()) {
      return "";
    }

    try {
      const payload = encryptedValue.slice("safe-storage:v1:".length);
      return safeStorage.decryptString(Buffer.from(payload, "base64")).trim();
    } catch {
      return "";
    }
  }

  return (process.env.YARDIMCI_ASISTAN_AI_API_KEY ?? process.env.OPENAI_API_KEY ?? "").trim();
}

function normalizeAiTimeoutSeconds(value: number) {
  if (!Number.isFinite(value)) {
    return 30;
  }

  return Math.max(5, Math.min(120, Math.trunc(value)));
}

function normalizeAiConnectionUrl(value: unknown) {
  const candidate = String(value ?? "").trim();
  try {
    const parsed = new URL(candidate);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname || parsed.username || parsed.password) {
      return "";
    }

    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function isGoogleAiStudioUrl(value: string) {
  return value === GOOGLE_AI_STUDIO_BASE_URL;
}

function shouldTryNextGoogleModel(result: { status?: number; message: string }) {
  return result.status === 404
    || result.status === 429
    || (result.status === 400 && /model|not found|support|image|vision|multimodal|mime/i.test(result.message));
}

function formatAiConnectionFailure(
  model: string,
  result: { status?: number; message: string } | null,
  attemptedModels: string[]
) {
  if (!result) {
    return "AI bağlantı testi tamamlanamadı.";
  }

  const attempted = attemptedModels.length > 1 ? ` Denenen modeller: ${attemptedModels.join(", ")}.` : "";
  if (result.status === 429) {
    return `${model} modeli için kullanılabilir Google kotası bulunamadı (HTTP 429). Rate Limit ekranında limiti 0'dan büyük bir model seçin veya faturalandırmayı etkinleştirin.${attempted}`;
  }
  if (result.status === 401 || result.status === 403) {
    return `Google AI Studio erişim anahtarı veya proje yetkisi kabul edilmedi (HTTP ${result.status}). Anahtar durumunu ve proje erişimini kontrol edin.`;
  }
  if (result.status === 404) {
    return `${model} modeli bu proje için bulunamadı (HTTP 404).${attempted}`;
  }

  const shortMessage = result.message.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim().slice(0, 280);
  return `${model} modeliyle bağlantı kurulamadı${result.status ? ` (HTTP ${result.status})` : ""}: ${shortMessage || "Bilinmeyen sağlayıcı hatası."}${attempted}`;
}

function getAiServiceLabel(service: string) {
  const labels: Record<string, string> = {
    openai: "OpenAI",
    openrouter: "OpenRouter",
    groq: "Groq",
    gemini: "Google Gemini",
    custom: "Özel AI servisi"
  };

  return labels[service] || "AI servisi";
}
