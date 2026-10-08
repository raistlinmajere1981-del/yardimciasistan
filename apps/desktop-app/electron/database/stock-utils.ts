import type {
  MenuStockUnit,
  StockImageAnalysis,
  StockImageAnalysisLine,
  StockImageApplyLine,
  StockImageConfidence,
  StockImageProductCandidate
} from "@yardimci-asistan/shared";

export const TABLE_ORDER_STATUSES = ["open", "preparing", "served", "payment", "paid", "cancelled"];

export function normalizePrice(value: number) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function normalizeStockPrecision(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function normalizeNullableStockNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity >= 0
    ? normalizeStockPrecision(quantity)
    : null;
}

export function normalizePositiveStockNumber(value: unknown): number | null {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0
    ? normalizeStockPrecision(quantity)
    : null;
}

export function normalizeMenuStockUnit(value: unknown): MenuStockUnit {
  const units = ["piece", "kg", "g", "l", "ml", "pack", "box", "meter", "other"];
  return units.includes(String(value)) ? value as MenuStockUnit : "piece";
}

export function normalizeSignedStockNumber(value: unknown): number | null {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? normalizeStockPrecision(quantity) : null;
}

export function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

export function nullableTrimmedString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export function normalizeOrderQuantity(value: number): number | null {
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 999 ? quantity : null;
}

export function createTableOrderId(prefix: "table_order_" | "table_order_item_"): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, "") || "000000";
  return `${prefix}${timestamp}_${randomPart}`;
}

export function normalizeStockImageImportId(value: unknown): string {
  const importId = String(value ?? "").trim();
  return /^[A-Za-z0-9._:-]{8,160}$/.test(importId) ? importId : "";
}

export function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function normalizeStockImageConfidence(value: unknown): StockImageConfidence {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function normalizeStockImageText(value: unknown, limit: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim().slice(0, limit);
  return text || null;
}

export function sanitizeStockImageAnalysis(value: StockImageAnalysis, candidates: StockImageProductCandidate[]): StockImageAnalysis {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as unknown as Record<string, unknown>
    : {};
  const documentSource = source.document && typeof source.document === "object" && !Array.isArray(source.document)
    ? source.document as Record<string, unknown>
    : {};
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const sourceLines = Array.isArray(source.lines) ? source.lines.slice(0, 200) : [];
  const lines: StockImageAnalysisLine[] = [];
  for (const rawLine of sourceLines) {
    if (!rawLine || typeof rawLine !== "object" || Array.isArray(rawLine)) {
      continue;
    }
    const line = rawLine as Record<string, unknown>;
    const rawText = normalizeStockImageText(line.raw_text, 1000);
    if (!rawText) {
      continue;
    }
    const requestedId = normalizeStockImageText(line.matched_product_id, 160);
    const candidate = requestedId ? candidateById.get(requestedId) : undefined;
    const sourceQuantityText = normalizeStockImageText(line.source_quantity_text, 200);
    const rawQuantity = Number(line.suggested_quantity);
    const integerQuantity = Number.isInteger(rawQuantity) && rawQuantity > 0 && rawQuantity <= 100_000
      ? rawQuantity
      : null;
    const quantityText = sourceQuantityText || rawText;
    const measuredQuantity = candidate && candidate.stock_unit !== "piece" ? parseMeasuredStockQuantity(quantityText, candidate.stock_unit) : null;
    const ambiguousQuantity = hasAmbiguousStockUnit(quantityText, candidate?.stock_unit ?? "piece");
    const suggestedQuantity = candidate && candidate.stock_unit !== "piece" ? measuredQuantity : integerQuantity;
    let reason = normalizeStockImageText(line.needs_review_reason, 500);
    if (requestedId && !candidate) {
      reason = reason || "Önerilen ürün mevcut stok takipli menü listesinde değil.";
    }
    if (ambiguousQuantity) {
      reason = candidate?.stock_unit === "g"
        ? "Miktar gram veya kilogram olarak açıkça okunamadı."
        : "Koli, paket, ağırlık veya hacim bilgisi açık bir adede dönüştürülemedi.";
    } else if (suggestedQuantity === null) {
      reason = reason || (candidate?.stock_unit === "g"
        ? "Açık gram veya kilogram bilgisi bulunamadı."
        : "Açık adet bilgisi bulunamadı.");
    }
    lines.push({
      raw_text: rawText,
      matched_product_id: candidate?.id ?? null,
      matched_product_name: candidate?.name ?? null,
      suggested_quantity: ambiguousQuantity ? null : suggestedQuantity,
      source_quantity_text: sourceQuantityText,
      confidence: normalizeStockImageConfidence(line.confidence),
      needs_review_reason: reason
    });
  }
  return {
    document: {
      supplier_name: normalizeStockImageText(documentSource.supplier_name, 255),
      invoice_number: normalizeStockImageText(documentSource.invoice_number, 120),
      invoice_date: normalizeStockImageText(documentSource.invoice_date, 40),
      document_confidence: normalizeStockImageConfidence(documentSource.document_confidence)
    },
    lines
  };
}

function hasAmbiguousStockUnit(value: string, stockUnit: MenuStockUnit): boolean {
  const normalized = value.toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/\b\d+\s*['’]?\s*(?:li|lı|lu|lü|lik|lık|luk|lük)\s+paket\b/giu, "")
    .replace(/\s+/g, " ");
  if (stockUnit !== "piece") return parseMeasuredStockQuantity(normalized, stockUnit) === null;
  return /\b(?:\d+(?:[.,]\d+)?\s*)?(?:koli|paket|kg|kilogram|kilo|gr|gram|lt|litre)\b/iu.test(normalized);
}

function parseMeasuredStockQuantity(value: string, unit: MenuStockUnit): number | null {
  const normalized = value.toLocaleLowerCase("tr-TR").replace(/ı/g, "i");
  const match = normalized.match(/(\d[\d.,]*)\s*(kg|kilogram|kilo|gr|gram|g|ml|mililitre|lt|litre|l|paket|pack|koli|kutu|box|metre|meter|m)\b/iu);
  if (!match) {
    return null;
  }
  const quantity = parseTurkishDocumentNumber(match[1] ?? "");
  const source = match[2] ?? "";
  const mass = ["kg", "kilogram", "kilo", "gr", "gram", "g"].includes(source);
  const volume = ["ml", "mililitre", "lt", "litre", "l"].includes(source);
  let result: number | null = null;
  if (mass && (unit === "g" || unit === "kg")) result = quantity * (["kg", "kilogram", "kilo"].includes(source) ? 1000 : 1) / (unit === "kg" ? 1000 : 1);
  if (volume && (unit === "ml" || unit === "l")) result = quantity * (["ml", "mililitre"].includes(source) ? 1 : 1000) / (unit === "l" ? 1000 : 1);
  if (unit === "pack" && ["paket", "pack"].includes(source)) result = quantity;
  if (unit === "box" && ["koli", "kutu", "box"].includes(source)) result = quantity;
  if (unit === "meter" && ["metre", "meter", "m"].includes(source)) result = quantity;
  return result !== null && Number.isFinite(result) && result > 0 && result <= 100_000 ? Math.round(result * 10000) / 10000 : null;
}

function parseTurkishDocumentNumber(value: string): number {
  const text = value.trim();
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(?:\.\d{3})+$/.test(text)
      ? text.replace(/\./g, "")
      : text;
  return Number(normalized);
}

export function normalizeStockImageApplyLines(value: unknown): StockImageApplyLine[] | null {
  if (!Array.isArray(value) || value.length > 200) {
    return null;
  }
  const lines: StockImageApplyLine[] = [];
  for (const rawLine of value) {
    if (!rawLine || typeof rawLine !== "object" || Array.isArray(rawLine)) {
      return null;
    }
    const line = rawLine as Record<string, unknown>;
    const productId = normalizeStockImageText(line.product_id, 160);
    const rawText = normalizeStockImageText(line.raw_text, 1000);
    const quantity = Number(line.quantity);
    if (!productId || !rawText || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100_000 || Math.round(quantity * 10000) / 10000 !== quantity) {
      return null;
    }
    lines.push({
      product_id: productId,
      quantity,
      raw_text: rawText,
      confidence: normalizeStockImageConfidence(line.confidence)
    });
  }
  return lines;
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeCurrency(value: string) {
  const currency = value.trim().toUpperCase();
  return currency || "TRY";
}

export function normalizeTableOrderCurrency(value: unknown): string {
  const currency = String(value ?? "TRY").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "TRY";
}
