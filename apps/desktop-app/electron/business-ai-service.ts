import {
  generateConfiguredChat,
  generateOwnerReplySuggestion
} from "@yardimci-asistan/ai-core";
import {
  BUSINESS_CAPABILITIES,
  evaluateBusinessAiInput,
  businessAiBoundaryReply,
  buildBusinessAiAuthorityPrompt,
  isOperationalTaskAvailable,
  isReservationTypeAvailable,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import type {
  DailyBusinessEvaluationResult,
  DesktopDatabase,
  DesktopDashboardData,
  RequestAiSuggestionResult,
  RewriteRequestAiSuggestionInput
} from "./database";
import { createDesktopAiConfig } from "./ai-config";
import { createDiagnosticOperationId, desktopLog } from "./desktop-logger";
import { logAiFallback, logAiOperationCompleted, logAiOperationStarted } from "./ai-diagnostics";
import { createCurrentBusinessAiContext } from "./business-ai-context-service";
import { createRelevantBusinessAiCatalogContext } from "./business-ai-catalog-service";

export async function createOwnerReplySuggestionForRequest(
  database: DesktopDatabase,
  requestId: string,
  instructions = ""
): Promise<RequestAiSuggestionResult> {
  const request = database.getRequestById(requestId);
  if (!request) {
    return {
      ok: false,
      message: "AI taslağı için talep bulunamadı."
    };
  }

  const capabilities = database.getEnabledBusinessCapabilities();
  let decision = evaluateBusinessAiInput(capabilities, request.request_type, `${request.message}\n${instructions}`);
  let catalogContext: ReturnType<typeof createRelevantBusinessAiCatalogContext> | undefined;
  if (decision.kind === "unrecognized" && (capabilities.includes(BUSINESS_CAPABILITIES.CATALOG) || capabilities.includes(BUSINESS_CAPABILITIES.FOOD_MENU))) {
    catalogContext = createRelevantBusinessAiCatalogContext(database, request.message);
    decision = evaluateBusinessAiInput(capabilities, request.request_type, `${request.message}\n${instructions}`, catalogContext.matches.map((item) => item.source));
  }
  const boundaryReply = businessAiBoundaryReply(decision);
  if (boundaryReply) {
    const customerName = request.customer_name.trim();
    const greeting = customerName ? `Merhaba ${customerName},` : "Merhaba,";
    return database.saveRequestAiSuggestion({
      requestId: request.id,
      summary: `${customerName || "Müşteri"}, işletmede desteklenmeyen veya doğrulanamayan hizmet hakkında bilgi istiyor.`,
      suggestedReply: `${greeting} ${boundaryReply}`,
      missingFields: []
    });
  }

  const setup = database.getSetupData();
  const businessContext = createCurrentBusinessAiContext(database);
  catalogContext ??= createRelevantBusinessAiCatalogContext(database, request.message);
  const config = createDesktopAiConfig(database, setup);
  const operationId = createDiagnosticOperationId("ai-owner-reply");
  const startedAt = Date.now();
  if (config.enabled && config.provider !== "disabled") {
    logAiOperationStarted("owner-reply", config, operationId);
  }
  const suggestion = await generateOwnerReplySuggestion(
    {
      businessName: setup.businessName || "Yardımcı Asistan",
      customerName: request.customer_name,
      requestType: request.request_type,
      dateText: request.date_text || request.start_date,
      guestCount: request.guest_count,
      message: request.message,
      tone: "warm",
      instructions: String(instructions ?? "").trim().slice(0, 400),
      businessContext,
      catalogContext
    },
    config
  );

  const saveResult = database.saveRequestAiSuggestion({
    requestId: request.id,
    summary: suggestion.summary,
    suggestedReply: suggestion.suggestedReply,
    missingFields: suggestion.missingFields
  });

  if (saveResult.ok && suggestion.providerMessage) {
    logAiFallback("owner-reply", suggestion.providerMessage, {
      requestType: request.request_type,
      provider: suggestion.provider || config.provider,
      model: suggestion.model || config.model,
      reason: suggestion.providerReason || "provider_error",
      status: suggestion.providerStatus ?? 0,
      providerCode: suggestion.providerCode || "",
      retryAfterSeconds: suggestion.retryAfterSeconds ?? 0,
      durationMs: Date.now() - startedAt
    });
    return {
      ...saveResult,
      message: `${saveResult.message} ${suggestion.providerMessage} Yerel güvenli taslak kullanıldı.`
    };
  }

  if (saveResult.ok && config.enabled && config.provider !== "disabled") {
    desktopLog.info({
      scope: "ai",
      event: "ai.owner-reply.completed",
      message: "AI müşteri cevap taslağı işlemi tamamlandı.",
      operationId,
      meta: {
        provider: suggestion.provider || config.provider,
        model: suggestion.model || config.model,
        durationMs: Date.now() - startedAt,
        fallback: suggestion.fallback === true
      }
    });
  }

  return saveResult;
}

export async function rewriteOwnerReplySuggestionForRequest(
  database: DesktopDatabase,
  input: RewriteRequestAiSuggestionInput
): Promise<RequestAiSuggestionResult> {
  const requestId = String(input?.requestId ?? "").trim();
  if (!requestId) {
    return { ok: false, message: "AI cevabı için talep seçilmemiş." };
  }
  const instructions = String(input?.instructions ?? "").trim().slice(0, 400);
  return createOwnerReplySuggestionForRequest(database, requestId, instructions);
}

export async function generateDailyBusinessEvaluation(
  database: DesktopDatabase
): Promise<DailyBusinessEvaluationResult> {
  const setup = database.getSetupData();
  const capabilities = database.getEnabledBusinessCapabilities();
  const dashboard = projectDashboardForAi(database.getDashboardData(), capabilities);
  const businessContext = createCurrentBusinessAiContext(database);
  const fallback = buildLocalDailyEvaluation(dashboard, capabilities);
  const config = createDesktopAiConfig(database, setup);

  if (!config.enabled || config.provider === "disabled") {
    return {
      ok: true,
      message: "AI Yardımcı kapalı; güvenli yerel değerlendirme hazırlandı.",
      content: fallback,
      fallback: true
    };
  }

  const operationId = createDiagnosticOperationId("ai-daily");
  const startedAt = Date.now();
  logAiOperationStarted("daily-evaluation", config, operationId);
  const completion = await generateConfiguredChat({
    ...config,
    messages: buildDailyBusinessEvaluationMessages({
      businessName: setup.businessName || "Yardımcı Asistan",
      dashboard,
      businessContext
    })
  });
  logAiOperationCompleted("daily-evaluation", config, completion, startedAt, operationId);

  if (!completion.ok) {
    return {
      ok: true,
      message: `AI servisi kullanılamadı; güvenli yerel değerlendirme hazırlandı. ${completion.message}`.trim(),
      content: fallback,
      fallback: true
    };
  }

  const content = completion.answer.trim().slice(0, 6000);
  if (!content) {
    return { ok: false, message: "AI Yardımcı boş sonuç döndürdü." };
  }

  return {
    ok: true,
    message: "Günlük işletme değerlendirmesi hazırlandı.",
    content,
    fallback: false
  };
}

function projectDashboardForAi(
  source: DesktopDashboardData,
  capabilities: Iterable<BusinessCapability>
): DesktopDashboardData {
  const enabled = capabilities instanceof Set ? capabilities : new Set(capabilities);
  const rooms = enabled.has(BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS) ? source.rooms : [];
  const tables = enabled.has(BUSINESS_CAPABILITIES.FOOD_TABLES) ? source.tables : [];
  const reservations = source.reservations.filter((reservation) =>
    isReservationTypeAvailable(enabled, reservation.reservationType, {
      roomIds: reservation.roomIds,
      tableIds: reservation.tableIds
    })
  );
  const dailyTasks = source.dailyTasks.filter((task) => {
    const relatedReservation = task.relatedType === "reservation"
      ? source.reservations.find((reservation) => reservation.id === task.relatedId)
      : undefined;
    return isOperationalTaskAvailable(
      enabled,
      task.taskType,
      task.relatedType,
      relatedReservation?.reservationType ?? "",
      { roomIds: relatedReservation?.roomIds, tableIds: relatedReservation?.tableIds }
    );
  });
  const stays = enabled.has(BUSINESS_CAPABILITIES.ACCOMMODATION_STAYS) ? source.customerRoomStays : [];
  const requestsEnabled = enabled.has(BUSINESS_CAPABILITIES.REQUESTS) && enabled.has(BUSINESS_CAPABILITIES.CUSTOMERS);
  const requests = requestsEnabled ? source.requests : [];
  const customers = enabled.has(BUSINESS_CAPABILITIES.CUSTOMERS) ? source.customers : [];
  const menu = enabled.has(BUSINESS_CAPABILITIES.FOOD_MENU)
    ? source.menu
    : { categories: [], items: [], updated_at: source.menu.updated_at };

  return {
    ...source,
    rooms,
    tables,
    requests,
    customers,
    reservations,
    dailyTasks,
    customerRoomStays: stays,
    androidDevices: enabled.has(BUSINESS_CAPABILITIES.ANDROID) ? source.androidDevices : [],
    androidActionFailures: enabled.has(BUSINESS_CAPABILITIES.ANDROID) ? source.androidActionFailures : [],
    paymentWaitingTableOrders: enabled.has(BUSINESS_CAPABILITIES.FOOD_ORDERS)
      ? source.paymentWaitingTableOrders
      : [],
    menu,
    summary: {
      ...source.summary,
      newRequests: requestsEnabled ? source.summary.newRequests : 0,
      waitingRequests: requestsEnabled ? source.summary.waitingRequests : 0,
      pendingDailyTasks: dailyTasks.filter((task) => task.status === "pending").length,
      availableRooms: rooms.filter((room) => room.status === "available").length,
      totalRooms: rooms.length,
      availableTables: tables.filter((table) => table.status === "available").length,
      pendingReservations: reservations.filter((reservation) => reservation.status === "pending").length,
      preparedWhatsAppMessages: enabled.has(BUSINESS_CAPABILITIES.CUSTOMERS) && enabled.has(BUSINESS_CAPABILITIES.WHATSAPP)
        ? source.summary.preparedWhatsAppMessages
        : 0,
      activeMenuCategories: menu.categories.filter((category) => category.is_active).length,
      availableMenuItems: menu.items.filter((item) => item.is_available).length
    }
  };
}

function buildDailyBusinessEvaluationMessages(input: {
  businessName: string;
  dashboard: DesktopDashboardData;
  businessContext: ReturnType<typeof createCurrentBusinessAiContext>;
}) {
  const rules = [
    `${input.businessName} için işletme sahibine yardımcı ol.`,
    "Türkçe, kısa, açık ve uygulanabilir yaz.",
    "Günlük operasyonu Öncelikler, Riskler ve Önerilen Sıra başlıklarıyla değerlendir.",
    "Kesin rezervasyon, müsaitlik veya bağlayıcı fiyat onayı verme.",
    "Olmayan bilgi üretme.",
    buildBusinessAiAuthorityPrompt(input.businessContext.capabilityIds),
    "Güncel işletme bağlamında yer almayan sektör, hizmet veya müşteri bilgilerini varsayma."
  ];

  return [
    {
      role: "system" as const,
      content: rules.join("\n")
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        businessContext: input.businessContext,
        summary: input.dashboard.summary,
        pendingTasks: input.dashboard.dailyTasks.filter((task) => task.status !== "completed").slice(0, 20),
        pendingReservations: input.dashboard.reservations
          .filter((reservation) => !["confirmed", "cancelled", "completed"].includes(reservation.status))
          .slice(0, 20),
        recentRequests: input.dashboard.requests.slice(0, 15).map((request) => ({
          customer: request.customer_name,
          type: request.request_type,
          status: request.status,
          date: request.date_text || request.start_date,
          message: request.message
        }))
      })
    }
  ];
}

function buildLocalDailyEvaluation(
  dashboard: DesktopDashboardData,
  capabilities: Iterable<BusinessCapability>
) {
  const enabled = capabilities instanceof Set ? capabilities : new Set(capabilities);
  const pendingTasks = dashboard.dailyTasks.filter((task) => task.status !== "completed");
  const priorities: string[] = [];
  const recommendedOrder: string[] = [];

  if (enabled.has(BUSINESS_CAPABILITIES.REQUESTS) && enabled.has(BUSINESS_CAPABILITIES.CUSTOMERS)) {
    priorities.push(`• ${dashboard.summary.newRequests} yeni talebi kontrol edin.`);
    recommendedOrder.push("yeni talepleri");
  }
  if (enabled.has(BUSINESS_CAPABILITIES.ACCOMMODATION_RESERVATIONS) || enabled.has(BUSINESS_CAPABILITIES.FOOD_RESERVATIONS)) {
    priorities.push(`• ${dashboard.summary.pendingReservations} bekleyen rezervasyonu değerlendirin.`);
    recommendedOrder.push("rezervasyon onaylarını");
  }
  if (enabled.has(BUSINESS_CAPABILITIES.TASKS)) {
    priorities.push(`• ${pendingTasks.length} tamamlanmamış günlük işi takip edin.`);
    recommendedOrder.push("günlük işleri");
  }
  if (priorities.length === 0) {
    priorities.push("• Etkin işletme alanlarındaki güncel durumu kontrol edin.");
  }

  const risks: string[] = [];
  if (enabled.has(BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS)) {
    risks.push(`Boş oda: ${dashboard.summary.availableRooms}/${dashboard.summary.totalRooms}`);
  }
  if (enabled.has(BUSINESS_CAPABILITIES.FOOD_TABLES)) {
    risks.push(`boş masa: ${dashboard.summary.availableTables}`);
  }

  return [
    "Öncelikler",
    ...priorities,
    "Riskler",
    risks.length > 0 ? `• ${risks.join("; ")}.` : "• Etkin operasyonlarda kritik kapasite uyarısı yok.",
    "Önerilen Sıra",
    recommendedOrder.length > 0
      ? `• Önce ${recommendedOrder.join(", ardından ")} sonuçlandırın.`
      : "• Önce güncel işletme durumunu gözden geçirin."
  ].join("\n");
}
