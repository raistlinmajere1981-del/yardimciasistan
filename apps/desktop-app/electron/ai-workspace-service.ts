import {
  generateConfiguredChat,
  generateOwnerReplySuggestion
} from "@yardimci-asistan/ai-core";
import {
  BUSINESS_CAPABILITIES,
  isOperationalTaskAvailable,
  isReservationTypeAvailable,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import type {
  DesktopDatabase,
  DesktopDashboardData,
  GenerateAiWorkspaceInput,
  GenerateAiWorkspaceResult,
  RequestAiSuggestionResult
} from "./database";
import { createDesktopAiConfig } from "./ai-config";
import { createCurrentBusinessAiContext } from "./business-ai-context-service";
import { createRelevantBusinessAiCatalogContext } from "./business-ai-catalog-service";

export async function createOwnerReplySuggestionForRequest(
  database: DesktopDatabase,
  requestId: string
): Promise<RequestAiSuggestionResult> {
  const request = database.getRequestById(requestId);
  if (!request) {
    return {
      ok: false,
      message: "AI taslağı için talep bulunamadı."
    };
  }

  const setup = database.getSetupData();
  const businessContext = createCurrentBusinessAiContext(database);
  const catalogContext = createRelevantBusinessAiCatalogContext(database, request.message);
  const suggestion = await generateOwnerReplySuggestion(
    {
      businessName: setup.businessName || "Yardımcı Asistan",
      customerName: request.customer_name,
      requestType: request.request_type,
      dateText: request.date_text || request.start_date,
      guestCount: request.guest_count,
      message: request.message,
      tone: "warm",
      businessContext,
      catalogContext
    },
    createDesktopAiConfig(database, setup)
  );

  const saveResult = database.saveRequestAiSuggestion({
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
}

export async function generateAiWorkspaceEntry(
  database: DesktopDatabase,
  input: GenerateAiWorkspaceInput
): Promise<GenerateAiWorkspaceResult> {
  const mode = input?.mode;
  if (mode !== "reply" && mode !== "summary" && mode !== "daily") {
    return { ok: false, message: "AI çalışma türü geçersiz." };
  }

  const setup = database.getSetupData();
  const businessContext = createCurrentBusinessAiContext(database);
  const instructions = String(input?.instructions ?? "").trim().slice(0, 800);
  const request = mode === "daily" ? null : database.getRequestById(String(input?.requestId ?? ""));
  if (mode !== "daily" && !request) {
    return { ok: false, message: "Bu çalışma için bir talep seçin." };
  }

  const config = createDesktopAiConfig(database, setup);
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
        instructions,
        businessContext,
        catalogContext: createRelevantBusinessAiCatalogContext(database, request.message)
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
    const capabilities = database.getEnabledBusinessCapabilities();
    const dashboard = projectDashboardForAi(database.getDashboardData(), capabilities);
    const localFallback = mode === "summary" && request
      ? buildLocalRequestSummary(request)
      : buildLocalDailyEvaluation(dashboard, capabilities);
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
          businessContext,
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

  const entry = database.saveAiWorkspaceHistory({
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
  const requests = enabled.has(BUSINESS_CAPABILITIES.CUSTOMERS) ? source.requests : [];
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
      newRequests: enabled.has(BUSINESS_CAPABILITIES.CUSTOMERS) ? source.summary.newRequests : 0,
      waitingRequests: enabled.has(BUSINESS_CAPABILITIES.CUSTOMERS) ? source.summary.waitingRequests : 0,
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

function buildAiWorkspaceMessages(input: {
  mode: "summary" | "daily";
  businessName: string;
  request: ReturnType<DesktopDatabase["getRequestById"]>;
  dashboard: DesktopDashboardData;
  businessContext: ReturnType<typeof createCurrentBusinessAiContext>;
  instructions: string;
}) {
  const commonRules = [
    `${input.businessName} için işletme sahibine yardımcı ol.`,
    "Türkçe, kısa, açık ve uygulanabilir yaz.",
    "Kesin rezervasyon, müsaitlik veya bağlayıcı fiyat onayı verme.",
    "Olmayan bilgi üretme.",
    "Güncel işletme bağlamında yer almayan sektör, hizmet veya müşteri bilgilerini varsayma.",
    "Katalog eşleşmesi yoksa bunun ürünün satılmadığını kanıtlamadığını kabul et; yalnız doğrulanamadığını söyle."
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
          businessContext: input.businessContext,
          request: {
            customer: input.request.customer_name,
            type: input.request.request_type,
            status: input.request.status,
            date: input.request.date_text || input.request.start_date,
            endDate: input.request.end_date,
            time: input.request.time,
            guestCount: input.request.guest_count,
            message: input.request.message
          },
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
        businessContext: input.businessContext,
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

function buildLocalDailyEvaluation(
  dashboard: DesktopDashboardData,
  capabilities: Iterable<BusinessCapability>
) {
  const enabled = capabilities instanceof Set ? capabilities : new Set(capabilities);
  const pendingTasks = dashboard.dailyTasks.filter((task) => task.status !== "completed");
  const priorities: string[] = [];
  const recommendedOrder: string[] = [];
  if (enabled.has(BUSINESS_CAPABILITIES.CUSTOMERS)) {
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
