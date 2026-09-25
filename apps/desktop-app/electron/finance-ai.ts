import type {
  DesktopFinanceAiMode,
  DesktopFinanceData
} from "./finance";

export interface FinanceAiPayload {
  context: {
    date: string;
    currency: string;
  };
  cash: {
    today_income: number;
    today_expense: number;
    today_net: number;
    outstanding_receivables: number;
  };
  recent_today_entries: Array<{
    occurred_at: string;
    direction: "income" | "expense";
    amount: number;
    payment_method: string;
    category: string;
    description: string;
    source_type: string;
  }>;
}

export function buildFinanceAiPayload(data: DesktopFinanceData): FinanceAiPayload {
  const today = localDateKey(new Date());
  const categories = new Map(data.categories.map((category) => [category.id, category.name]));

  return {
    context: {
      date: today,
      currency: data.currency || "TRY"
    },
    cash: {
      today_income: majorMoney(data.todayIncomeMinor),
      today_expense: majorMoney(data.todayExpenseMinor),
      today_net: majorMoney(data.todayNetMinor),
      outstanding_receivables: majorMoney(data.outstandingPensionMinor)
    },
    recent_today_entries: data.recentEntries
      .filter((entry) => localDateKey(new Date(entry.occurredAt)) === today)
      .slice(0, 20)
      .map((entry) => ({
        occurred_at: entry.occurredAt,
        direction: entry.direction,
        amount: majorMoney(entry.amountMinor),
        payment_method: entry.paymentMethod,
        category: categories.get(entry.category) ?? entry.category,
        description: entry.description,
        source_type: entry.sourceType
      }))
  };
}

export function buildFinanceAiMessages(
  mode: DesktopFinanceAiMode,
  payload: FinanceAiPayload,
  businessName: string
) {
  const modeInstruction: Record<DesktopFinanceAiMode, string> = {
    summary: "Bugünkü kasa durumunu; gelen, çıkan, net fark ve mevcut alacak toplamını 3–4 kısa cümle veya maddeyle özetle.",
    flow: "Bugünkü para hareketlerini ve sağlanan son işlem kayıtlarını yorumla. Yalnız görünen hareketlerden bahset; görünmeyen hareketlerin dağılımını varsayma.",
    receivables: "Mevcut bekleyen alacak toplamını kasa açısından yorumla. Alacak yoksa bunu açıkça ve kısa biçimde belirt.",
    recommendations: "Yalnız bu kasa verilerine dayanan en fazla 3 kısa, uygulanabilir operasyon önerisi ver."
  };

  const rules = [
    `${businessName || "İşletme"} için işletme sahibine kısa bir kasa yorumu yaz.`,
    modeInstruction[mode],
    "Yalnız kullanıcı mesajındaki hazırlanmış JSON verisini kullan.",
    "Hiçbir yeni metrik hesaplama, oran çıkarma veya tahmin yapma.",
    "JSON içinde bulunmayan hiçbir sayı, tarih, tutar ya da adet yazma.",
    "Son hareket listesi en fazla son 20 bugünkü kaydı içerir; bunu günün eksiksiz hareket dökümü olarak sunma.",
    "today_net alanını kâr veya zarar olarak adlandırma; yalnız kasa farkı/net para hareketi olarak ifade et.",
    "Muhasebe, vergi, yatırım veya finansal tahmin tavsiyesi verme.",
    "Veri yoksa aynen “Bugün için yorumlanacak kasa hareketi yok.” yaz.",
    "Türkçe, sade ve doğrudan yaz; başlık veya tablo ekleme.",
    "Numaralı liste kullanma; gerekiyorsa tire işaretli en fazla 5 madde yaz."
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

export function financeHasEnoughData(payload: FinanceAiPayload): boolean {
  return payload.cash.today_income !== 0
    || payload.cash.today_expense !== 0
    || payload.cash.today_net !== 0
    || payload.cash.outstanding_receivables !== 0
    || payload.recent_today_entries.length > 0;
}

export function sanitizeFinanceAiAnswer(
  answer: string,
  payload: FinanceAiPayload,
  mode: DesktopFinanceAiMode
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
      message: "AI yorumu kasa verilerinde bulunmayan bir sayı içerdiği için gösterilmedi."
    };
  }

  const maxLines = mode === "recommendations" ? 3 : 5;
  const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
  const limited = lines.length > 1
    ? lines.slice(0, maxLines).join("\n")
    : limitSentences(content, maxLines);
  return { ok: true, content: limited.slice(0, 2400) };
}

function majorMoney(value: number): number {
  return Math.round((Number(value) / 100) * 100) / 100;
}

function localDateKey(date: Date): string {
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface AllowedNumbers {
  decimals: Set<string>;
}

function collectAllowedNumbers(value: unknown): AllowedNumbers {
  const decimals = new Set<string>();
  const visit = (candidate: unknown) => {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      decimals.add(canonicalDecimal(candidate));
      return;
    }
    if (typeof candidate === "string") {
      for (const token of candidate.match(/\d+(?:[.,]\d+)*/g) ?? []) {
        const normalized = normalizeDecimalToken(token);
        if (normalized !== null) decimals.add(normalized);
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
  return { decimals };
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
    if (Number.isFinite(parsed)) candidates.add(canonicalDecimal(parsed * sign));
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
    if (normalized !== null) candidates.add(canonicalDecimal(Number(normalized) * sign));
  }

  return [...candidates];
}

function normalizeDecimalToken(value: string): string | null {
  const token = value.trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(token)) return null;
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
