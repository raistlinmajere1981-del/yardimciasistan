import { createHash } from "node:crypto";
import type {
  IdentityImageAnalysis,
  StockImageAnalysis,
  StockImageApplyLine
} from "@yardimci-asistan/shared";
import type {
  ApplyStockImageImportInput,
  DesktopDatabase,
  DesktopIdentityImageAnalyzeInput,
  DesktopIdentityImageAnalyzeResult,
  DesktopStockImageAnalyzeInput,
  DesktopStockImageAnalyzeResult
} from "./database";

const stockImageAnalysisControllers = new Map<string, AbortController>();
const STOCK_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export async function analyzeDesktopStockImage(
  database: DesktopDatabase,
  value: unknown
): Promise<DesktopStockImageAnalyzeResult> {
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
  const menuItems = database.getTrackedStockCandidates();
  if (menuItems.length === 0) {
    return { ok: false, code: "no_tracked_items", message: "Stok takip edilen menü ürünü bulunamadı." };
  }
  if (stockImageAnalysisControllers.has(input.importId)) {
    return { ok: false, code: "analysis_in_progress", message: "Bu görsel zaten analiz ediliyor." };
  }
  const imageHash = createHash("sha256").update(bytes).digest("hex");
  const created = database.createStockImageImport({
    importId: input.importId,
    source: "desktop",
    imageHash,
    originalFilename: input.fileName
  });
  if (!created.ok) {
    return { ok: false, code: "import_conflict", message: created.message };
  }

  const setup = database.getSetupData();
  const endpoint = createStockImageAnalysisUrl(setup.webModuleUrl);
  if (!endpoint || !setup.syncSecret.trim()) {
    database.failStockImageImport(input.importId, "Web modülü bağlantısı eksik.");
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
    form.append("products", JSON.stringify(menuItems));
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
      database.failStockImageImport(input.importId, message);
      return {
        ok: false,
        code: typeof payload?.code === "string" ? payload.code : "analysis_failed",
        message
      };
    }
    if (String(payload.import_id ?? "") !== input.importId || String(payload.image_hash ?? "").toLowerCase() !== imageHash) {
      database.failStockImageImport(input.importId, "Görsel analiz cevabı doğrulanamadı.");
      return { ok: false, code: "invalid_analysis_response", message: "Görsel analiz cevabı doğrulanamadı." };
    }
    const analysisValue = payload.analysis;
    if (!analysisValue || typeof analysisValue !== "object" || Array.isArray(analysisValue)) {
      database.failStockImageImport(input.importId, "Görsel analiz cevabı geçersiz.");
      return { ok: false, code: "invalid_analysis_response", message: "Görsel analiz cevabı geçersiz." };
    }
    const analysis = database.completeStockImageAnalysis(input.importId, analysisValue as StockImageAnalysis);
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
    database.failStockImageImport(input.importId, message, cancelled);
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

export async function analyzeDesktopIdentityImage(
  database: DesktopDatabase,
  value: unknown
): Promise<DesktopIdentityImageAnalyzeResult> {
  const input = parseDesktopIdentityImageAnalyzeInput(value);
  if (!input) {
    return { ok: false, code: "invalid_image", message: "Kimlik görseli okunamadı." };
  }
  if (input.bytes.byteLength > STOCK_IMAGE_MAX_BYTES) {
    return { ok: false, code: "image_too_large", message: "Kimlik görseli çok büyük." };
  }
  const bytes = new Uint8Array(input.bytes);
  const detectedMime = detectStockImageMime(bytes);
  if (!detectedMime || detectedMime !== input.mimeType) {
    return { ok: false, code: "unsupported_image_type", message: "Desteklenmeyen kimlik görseli türü." };
  }

  const setup = database.getSetupData();
  const endpoint = createIdentityImageAnalysisUrl(setup.webModuleUrl);
  if (!endpoint || !setup.syncSecret.trim()) {
    return {
      ok: false,
      code: "connection_incomplete",
      message: "Kimlik analizi için web modülü bağlantısını ayarlayın."
    };
  }

  const imageHash = createHash("sha256").update(bytes).digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(30_000, setup.aiTimeoutSeconds * 1000 + 10_000));
  try {
    const form = new FormData();
    form.append("source", "desktop");
    form.append("image_hash", imageHash);
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
      return {
        ok: false,
        code: typeof payload?.code === "string" ? payload.code : "analysis_failed",
        message: identityImageEndpointErrorMessage(response.status, payload)
      };
    }
    if (String(payload.image_hash ?? "").toLowerCase() !== imageHash) {
      return {
        ok: false,
        code: "invalid_analysis_response",
        message: "Kimlik analiz cevabı güvenli biçimde doğrulanamadı."
      };
    }
    const analysis = sanitizeIdentityImageAnalysis(payload.analysis);
    if (!analysis) {
      return {
        ok: false,
        code: "invalid_analysis_response",
        message: "Kimlik analiz cevabı geçersiz."
      };
    }
    return {
      ok: true,
      message: typeof payload.message === "string" && payload.message.trim()
        ? payload.message.trim().slice(0, 500)
        : "Kimlik alanları okundu. Kaydetmeden önce bilgileri kontrol edin.",
      analysis
    };
  } catch {
    return {
      ok: false,
      code: controller.signal.aborted ? "analysis_timeout" : "analysis_connection_failed",
      message: controller.signal.aborted
        ? "Kimlik görseli analizi zaman aşımına uğradı."
        : "Kimlik görseli analiz hizmetine ulaşılamadı."
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function cancelDesktopStockImageAnalysis(database: DesktopDatabase, importIdValue: unknown): boolean {
  const importId = normalizeStockImageImportId(String(importIdValue ?? ""));
  if (!importId) {
    return false;
  }
  const controller = stockImageAnalysisControllers.get(importId);
  controller?.abort();
  database.failStockImageImport(importId, "Kullanıcı analizi iptal etti.", true);
  return Boolean(controller);
}

export function parseStockImageApplyInput(value: unknown): ApplyStockImageImportInput | null {
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

function parseDesktopIdentityImageAnalyzeInput(value: unknown): DesktopIdentityImageAnalyzeInput | null {
  const record = toUnknownRecord(value);
  const fileName = typeof record?.fileName === "string" ? record.fileName.trim().slice(0, 255) : "";
  const mimeType = typeof record?.mimeType === "string" ? record.mimeType.trim().toLowerCase() : "";
  const bytes = record?.bytes;
  if (!fileName || !["image/jpeg", "image/png", "image/webp"].includes(mimeType) || !(bytes instanceof ArrayBuffer)) {
    return null;
  }
  return { fileName, mimeType, bytes };
}

function sanitizeIdentityImageAnalysis(value: unknown): IdentityImageAnalysis | null {
  const source = toUnknownRecord(value);
  const fields = toUnknownRecord(source?.fields);
  if (!source || !fields) {
    return null;
  }
  const identityType = normalizeIdentityAnalysisType(fields.identity_type ?? source.document_type);
  const gender = fields.gender === "female" || fields.gender === "male" || fields.gender === "unspecified"
    ? fields.gender
    : "";
  const documentSide = source.document_side === "front" || source.document_side === "back"
    ? source.document_side
    : "unknown";
  const confidence = source.confidence === "high" || source.confidence === "medium" ? source.confidence : "low";
  const text = (field: string, limit: number) =>
    typeof fields[field] === "string" ? fields[field].trim().slice(0, limit) : "";
  const warnings = Array.isArray(source.warnings)
    ? source.warnings
        .filter((warning): warning is string => typeof warning === "string")
        .map((warning) => warning.trim().slice(0, 300))
        .filter(Boolean)
        .slice(0, 20)
    : [];
  return {
    document_type: identityType,
    document_side: documentSide,
    confidence,
    fields: {
      full_name: text("full_name", 160),
      identity_type: identityType,
      identity_number: text("identity_number", 32).toUpperCase().replace(/[\s-]+/g, ""),
      nationality: text("nationality", 80),
      birth_date: normalizeIdentityAnalysisDate(text("birth_date", 20)),
      gender,
      document_serial_number: text("document_serial_number", 80).toUpperCase(),
      document_expiry_date: normalizeIdentityAnalysisDate(text("document_expiry_date", 20)),
      birth_place: text("birth_place", 160),
      mother_name: text("mother_name", 160),
      father_name: text("father_name", 160),
      issuing_authority: text("issuing_authority", 160),
      address: text("address", 2000)
    },
    warnings
  };
}

function normalizeIdentityAnalysisType(value: unknown): IdentityImageAnalysis["document_type"] {
  return value === "tc_identity_card" || value === "passport" || value === "other" ? value : "";
}

function normalizeIdentityAnalysisDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "";
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? "" : value;
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

function createIdentityImageAnalysisUrl(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl.trim());
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
      return "";
    }
    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = parsed.pathname
      .replace(/\/(?:api\/)?sync\.php\/?$/i, "")
      .replace(/\/+$/, "") + "/api/identity-image-analysis.php";
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

function identityImageEndpointErrorMessage(status: number, payload: Record<string, unknown> | null): string {
  const provided = typeof payload?.message === "string" ? payload.message.trim() : "";
  if (provided) {
    return provided.slice(0, 500);
  }
  if (status === 401 || status === 403) {
    return "Kimlik görseli analizi için yetki alınamadı.";
  }
  if (status === 413) {
    return "Kimlik görseli çok büyük.";
  }
  if (status === 415) {
    return "Desteklenmeyen kimlik görseli türü.";
  }
  if (status === 404) {
    return "Web modülü kimlik görseli analizini desteklemiyor. Hosting paketini güncelleyin.";
  }
  return "Kimlik görseli analiz edilemedi.";
}

function toUnknownRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
