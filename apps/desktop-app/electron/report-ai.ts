import type {
  DesktopReportAiMode,
  DesktopReportData
} from "./database";

export interface ReportAiPayload {
  period: {
    label: string;
    start: string;
    end: string;
  };
  summary: {
    restaurant_revenue: number;
    closed_orders: number;
    average_order: number;
    approved_reservations: number;
    new_requests: number;
    pending_tasks: number;
  };
  restaurant: {
    sold_item_count: number;
    cancelled_orders: number;
    top_items: Array<{
      name: string;
      quantity: number;
      revenue: number;
    }>;
    daily_revenue: Array<{
      date: string;
      revenue: number;
      closed_orders: number;
    }>;
  };
  pension_and_requests: {
    incoming_reservations: number;
    approved_reservations: number;
    pending_reservations: number;
    cancelled_or_rejected_reservations: number;
    accommodation_nights: number;
    new_requests: number;
    answered_requests: number;
    waiting_requests: number;
  };
  stock: {
    top_consumed: Array<{
      name: string;
      quantity: number;
      unit: string;
    }>;
    manual_movement_count: number;
    image_movement_count: number;
  };
}

export function buildReportAiPayload(report: DesktopReportData): ReportAiPayload {
  return {
    period: {
      label: report.period.label,
      start: report.period.startDate,
      end: report.period.endDate
    },
    summary: {
      restaurant_revenue: report.summary.restaurantRevenue,
      closed_orders: report.summary.closedOrders,
      average_order: report.summary.averageOrder,
      approved_reservations: report.summary.approvedReservations,
      new_requests: report.summary.newRequests,
      pending_tasks: report.summary.pendingTasks
    },
    restaurant: {
      sold_item_count: report.restaurant.soldItemCount,
      cancelled_orders: report.restaurant.cancelledOrders,
      top_items: report.restaurant.topItems.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        revenue: item.revenue
      })),
      daily_revenue: report.restaurant.dailyRevenue.map((day) => ({
        date: day.date,
        revenue: day.revenue,
        closed_orders: day.closedOrders
      }))
    },
    pension_and_requests: {
      incoming_reservations: report.pensionAndRequests.incomingReservations,
      approved_reservations: report.pensionAndRequests.approvedReservations,
      pending_reservations: report.pensionAndRequests.pendingReservations,
      cancelled_or_rejected_reservations: report.pensionAndRequests.cancelledOrRejectedReservations,
      accommodation_nights: report.pensionAndRequests.accommodationNights,
      new_requests: report.pensionAndRequests.newRequests,
      answered_requests: report.pensionAndRequests.answeredRequests,
      waiting_requests: report.pensionAndRequests.waitingRequests
    },
    stock: {
      top_consumed: report.stock.topConsumed.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit
      })),
      manual_movement_count: report.stock.manualMovementCount,
      image_movement_count: report.stock.imageMovementCount
    }
  };
}

export function buildReportAiMessages(
  mode: DesktopReportAiMode,
  payload: ReportAiPayload,
  businessName: string
) {
  const modeInstruction: Record<DesktopReportAiMode, string> = {
    summary: "Seçilen dönemin genel durumunu 3–5 kısa cümle veya maddeyle özetle.",
    sales: "Yalnız restoran cirosunu, ortalama hesabı, en çok satılan ürünleri ve günlük değişimleri yorumla.",
    recommendations: "Mevcut verilere dayanan en fazla 3 kısa ve uygulanabilir işletme önerisi ver."
  };
  const rules = [
    `${businessName || "İşletme"} için işletme sahibine kısa bir rapor yorumu yaz.`,
    modeInstruction[mode],
    "Yalnız kullanıcı mesajındaki hesaplanmış JSON verisini kullan.",
    "Hiçbir metrik hesaplama, oran çıkarma veya tahmin yapma.",
    "JSON içinde bulunmayan hiçbir sayı, tarih, tutar ya da adet yazma.",
    "Sayısal bilgileri yalnız rakamla yaz; sayı kelimeleri kullanma.",
    "Veri yoksa aynen “Bu dönem için yeterli veri yok.” yaz.",
    "Türkçe, sade ve doğrudan yaz; başlık veya tablo ekleme.",
    "Numaralı liste kullanma; gerekiyorsa tire işaretli en fazla 5 madde yaz.",
    "Muhasebe, vergi, yatırım, kâr-zarar veya finansal tahmin tavsiyesi verme."
  ];
  return [
    {
      role: "system" as const,
      content: rules.join("\n")
    },
    {
      role: "user" as const,
      content: JSON.stringify(payload)
    }
  ];
}

export function reportHasEnoughData(payload: ReportAiPayload): boolean {
  return Object.values(payload.summary).some((value) => value > 0)
    || payload.restaurant.top_items.length > 0
    || payload.pension_and_requests.incoming_reservations > 0
    || payload.pension_and_requests.new_requests > 0
    || payload.stock.top_consumed.length > 0
    || payload.stock.manual_movement_count > 0
    || payload.stock.image_movement_count > 0;
}

export function sanitizeReportAiAnswer(
  answer: string,
  payload: ReportAiPayload,
  mode: DesktopReportAiMode
): { ok: true; content: string } | { ok: false; message: string } {
  const content = String(answer ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*\d+[.)]\s+/gm, "- ")
    .trim();
  if (!content) {
    return { ok: false, message: "AI servisi boş bir yorum döndürdü." };
  }

  const allowed = collectAllowedNumbers(payload);
  const usedNumbers = content.match(/[-+]?\d+(?:[.,]\d+)*/g) ?? [];
  if (usedNumbers.some((token) => !numberTokenIsAllowed(token, allowed))) {
    return {
      ok: false,
      message: "AI yorumu raporda bulunmayan bir sayı içerdiği için gösterilmedi."
    };
  }

  const maxLines = mode === "recommendations" ? 3 : 5;
  const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
  const limited = lines.length > 1
    ? lines.slice(0, maxLines).join("\n")
    : limitSentences(content, maxLines);
  return { ok: true, content: limited.slice(0, 2400) };
}

interface AllowedNumbers {
  decimals: Set<string>;
  integers: Set<string>;
}

function collectAllowedNumbers(value: unknown): AllowedNumbers {
  const decimals = new Set<string>();
  const integers = new Set<string>();
  const visit = (candidate: unknown) => {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      const canonical = canonicalDecimal(candidate);
      decimals.add(canonical);
      if (Number.isInteger(candidate)) {
        integers.add(String(Math.abs(candidate)));
      }
      return;
    }
    if (typeof candidate === "string") {
      for (const token of candidate.match(/\d+(?:[.,]\d+)*/g) ?? []) {
        const normalized = normalizeDecimalToken(token);
        if (normalized !== null) {
          decimals.add(normalized);
        }
        if (/^\d+$/.test(token)) {
          integers.add(token.replace(/^0+(?=\d)/, ""));
        }
      }
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (candidate && typeof candidate === "object") {
      Object.values(candidate as Record<string, unknown>).forEach(visit);
    }
  };
  visit(value);
  return { decimals, integers };
}

function numberTokenIsAllowed(token: string, allowed: AllowedNumbers): boolean {
  return numberTokenCandidates(token).some((candidate) => allowed.decimals.has(candidate));
}

function numberTokenCandidates(value: string): string[] {
  const token = value.trim();
  const sign = token.startsWith("-") ? -1 : 1;
  const unsigned = token.replace(/^[+-]/, "");
  const candidates = new Set<string>();
  const add = (normalized: string) => {
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      candidates.add(canonicalDecimal(parsed * sign));
    }
  };

  if (/^\d+$/.test(unsigned)) {
    add(unsigned);
    return [...candidates];
  }

  if (/^\d{1,3}([.,])\d{3}(?:\1\d{3})*$/.test(unsigned)) {
    add(unsigned.replace(/[.,]/g, ""));
  }

  const lastDot = unsigned.lastIndexOf(".");
  const lastComma = unsigned.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSeparator = lastDot > lastComma ? "." : ",";
    const groupingSeparator = decimalSeparator === "." ? "," : ".";
    const decimalIndex = unsigned.lastIndexOf(decimalSeparator);
    const integerPart = unsigned.slice(0, decimalIndex);
    const fractionPart = unsigned.slice(decimalIndex + 1);
    const escapedGrouping = groupingSeparator === "." ? "\\." : ",";
    const groupedInteger = new RegExp(`^\\d{1,3}(?:${escapedGrouping}\\d{3})*$`);
    if (groupedInteger.test(integerPart) && /^\d+$/.test(fractionPart)) {
      add(`${integerPart.replaceAll(groupingSeparator, "")}.${fractionPart}`);
    }
  } else {
    const normalized = normalizeDecimalToken(unsigned);
    if (normalized !== null) {
      candidates.add(canonicalDecimal(Number(normalized) * sign));
    }
  }
  return [...candidates];
}

function normalizeDecimalToken(value: string): string | null {
  const token = value.trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(token)) {
    return null;
  }
  const parsed = Number(token.replace(",", "."));
  return Number.isFinite(parsed) ? canonicalDecimal(parsed) : null;
}

function canonicalDecimal(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function limitSentences(value: string, limit: number): string {
  const sentences = value.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
  return sentences.length > limit ? sentences.slice(0, limit).join(" ") : value;
}
