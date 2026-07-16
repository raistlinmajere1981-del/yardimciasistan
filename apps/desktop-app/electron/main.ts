import { app, BrowserWindow, ipcMain, safeStorage, session, shell } from "electron";
import path from "node:path";
import { generateConfiguredChat, generateOwnerReplySuggestion, listGoogleAiStudioModels, rankGoogleAiStudioModels } from "@yardimci-asistan/ai-core";
import type { AIProviderName } from "@yardimci-asistan/ai-core";
import { pullRequests, markRequestsSynced, pushAiSettings, pushAndroidSnapshot, pushMenu } from "@yardimci-asistan/sync-core";
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
  type GenerateAiWorkspaceInput,
  type GenerateAiWorkspaceResult,
  type SaveAiWorkspaceResultInput,
  type SaveAiWorkspaceResult,
  type AiWorkspaceHistoryEntry,
  type DesktopBackupResult,
  type DesktopStatusUpdateResult,
  type UpdateRequestStatusInput,
  type UpdateRoomStatusInput,
  type UpdateTableStatusInput,
  type UpdateReservationStatusInput,
  type UpdateDailyTaskStatusInput,
  type MarkWhatsAppMessageSentInput
} from "./database";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const WHATSAPP_WEB_PARTITION = "persist:yardimci-whatsapp";
const GOOGLE_AI_STUDIO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
let desktopDatabase: DesktopDatabase | null = null;

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

app.whenReady().then(() => {
  session.fromPartition(WHATSAPP_WEB_PARTITION).setUserAgent(createChromeUserAgent(), "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7");

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
      ...getWebSyncConfig(setup),
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

  ipcMain.handle("sync:pushAiSettings", async (): Promise<PushAiSettingsResult> => {
    return publishSavedAiSettings();
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

  ipcMain.handle("setup:saveInitial", async (_event, input: SaveInitialSetupInput): Promise<DesktopSetupSaveResult> => {
    const secretUpdate = createAiApiKeyUpdate(input);
    if (!secretUpdate.ok) {
      return secretUpdate;
    }

    const localResult = getDatabase().saveInitialSetup({
      ...input,
      aiApiKey: String(input.aiApiKey ?? "").trim() ? "__encrypted_in_main_process__" : ""
    }, secretUpdate.update);
    if (!localResult.ok) {
      return localResult;
    }

    const aiWebSync = await publishSavedAiSettings();
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

    const apiKey = String(input?.apiKey ?? "").trim() || (input?.useStoredApiKey ? getEffectiveAiApiKey() : "");
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
    const modelCandidates = model
      ? [model]
      : rankedGoogleModels.slice(0, 6);
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
      result = await generateConfiguredChat({
        enabled: true,
        provider: "openai_compatible",
        service,
        baseUrl,
        model: candidate,
        apiKey,
        authMode: service === "gemini" ? "google_api_key" : "bearer",
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
        ? `${projectName || "Google AI Studio"} bağlantısı ${model} modeliyle doğrulandı; ${models.length} kullanılabilir Gemini modeli bulundu.`
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

  ipcMain.handle("whatsapp:markMessageSent", (_event, input: MarkWhatsAppMessageSentInput): DesktopStatusUpdateResult => {
    return getDatabase().markWhatsAppMessageSent(input);
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
    apiKey: getEffectiveAiApiKey(),
    authMode: setup.aiService === "gemini" ? "google_api_key" as const : "bearer" as const,
    timeoutMs: timeoutSeconds * 1000
  };
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
      apiKey: setup.aiEnabled ? getEffectiveAiApiKey() : "",
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

  if (input.clearAiApiKey) {
    return {
      ok: true,
      update: { mode: "clear" }
    };
  }

  const apiKey = String(input.aiApiKey ?? "").trim();
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

function getEffectiveAiApiKey() {
  const encryptedValue = getDatabase().getEncryptedAiApiKey();
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
    || (result.status === 400 && /model|not found|support/i.test(result.message));
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
