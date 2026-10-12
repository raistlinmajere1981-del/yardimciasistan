import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { isMarketingDiagnosticSensitiveKey, redactMarketingDiagnosticText } from "./marketing-diagnostic-redaction";
import { app, clipboard, nativeImage, net } from "electron";
import {
  createDiagnosticSupportSnapshot,
  createDiagnosticOperationId,
  desktopLog,
  listDiagnosticSessions
} from "./desktop-logger";
import type {
  DesktopDiagnosticEvent,
  DesktopDiagnosticSupportSession,
  DesktopSupportReportActionResult,
  DesktopSupportReportDraft,
  DesktopSupportReportSendInput,
  DesktopSupportReportSendResult
} from "./diagnostics-contract";

const SUPPORT_REPORT_ENDPOINT = "https://yardimciasistan.alwaysdata.net/support/report.php";
const SUPPORT_DIR_NAME = "support";
const SUPPORT_SCREENSHOT_FILE = "screenshot-draft.png";
const SUPPORT_CLIENT_FILE = "client.json";
const MAX_SCREENSHOT_BYTES = 12 * 1024 * 1024;
const MAX_COMPRESSED_REPORT_BYTES = 20 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 45_000;

interface SupportClientState {
  version: 1;
  clientId: string;
}

interface SupportReportBundle {
  format: "yardimci-asistan-support-report";
  version: 1;
  clientReportId: string;
  createdAt: string;
  app: {
    version: string;
    electronVersion: string;
    nodeVersion: string;
    platform: NodeJS.Platform;
    arch: string;
    packaged: boolean;
  };
  note: string;
  screenshot: null | {
    mimeType: "image/png";
    base64: string;
    width: number;
    height: number;
  };
  sessions: DesktopDiagnosticSupportSession[];
}

function supportRoot(userDataPath: string) {
  return path.join(userDataPath, SUPPORT_DIR_NAME);
}

function screenshotDraftPath(userDataPath: string) {
  return path.join(supportRoot(userDataPath), SUPPORT_SCREENSHOT_FILE);
}

function supportClientPath(userDataPath: string) {
  return path.join(supportRoot(userDataPath), SUPPORT_CLIENT_FILE);
}

function ensureSupportRoot(userDataPath: string) {
  fs.mkdirSync(supportRoot(userDataPath), { recursive: true, mode: 0o700 });
}

function readOrCreateSupportClientId(userDataPath: string) {
  ensureSupportRoot(userDataPath);
  const filePath = supportClientPath(userDataPath);
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<SupportClientState>;
    if (parsed.version === 1 && typeof parsed.clientId === "string" && /^[a-f0-9-]{20,80}$/i.test(parsed.clientId)) {
      return parsed.clientId;
    }
  } catch {
    // Create a new anonymous support client id.
  }
  const state: SupportClientState = { version: 1, clientId: crypto.randomUUID() };
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  return state.clientId;
}

function scrubText(value: string) {
  return redactMarketingDiagnosticText(String(value ?? ""))
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, "$1[redacted]")
    .replace(/\bbearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/((?:sync[_ -]?secret|api[_ -]?key|password|token|authorization|cookie)\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/(?:\+?90\s*)?0?5\d{2}[\s().-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}\b/g, "[phone]")
    .replace(/\b\d{11}\b/g, "[identity-number]")
    .replace(/\/home\/[^/\s]+\//g, "/home/[user]/")
    .replace(/C:\\Users\\[^\\\s]+\\/gi, "C:\\Users\\[user]\\")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]");
}

function isOutboundSensitiveKey(key: string) {
  return isMarketingDiagnosticSensitiveKey(key) || /(?:password|secret|token|api.?key|authorization|cookie|credential|private.?key|phone|email|identity.?number|document.?serial|address|customer.?name|guest.?name|full.?name)/i.test(key);
}

function scrubValue(value: unknown, key = "", depth = 0): unknown {
  if (isOutboundSensitiveKey(key)) return "[redacted]";
  if (depth > 8) return "[truncated]";
  if (typeof value === "string") return scrubText(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, key, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        scrubValue(entryValue, entryKey, depth + 1)
      ])
    );
  }
  return scrubText(String(value));
}

function scrubEvent(event: DesktopDiagnosticEvent): DesktopDiagnosticEvent {
  return scrubValue(event) as DesktopDiagnosticEvent;
}

function scrubSessions(sessions: DesktopDiagnosticSupportSession[]) {
  return sessions.map(({ session, events }) => ({
    session: scrubValue(session) as typeof session,
    events: events.map(scrubEvent)
  }));
}

function currentDraft(userDataPath: string): DesktopSupportReportDraft {
  const sessions = listDiagnosticSessions().slice(0, 3);
  const filePath = screenshotDraftPath(userDataPath);
  let screenshot: DesktopSupportReportDraft["screenshot"] = null;
  try {
    if (fs.existsSync(filePath)) {
      const bytes = fs.readFileSync(filePath);
      const image = nativeImage.createFromBuffer(bytes);
      const size = image.isEmpty() ? { width: 0, height: 0 } : image.getSize();
      const previewDataUrl = image.isEmpty()
        ? ""
        : image.resize({ width: Math.min(720, Math.max(1, size.width)) }).toDataURL();
      screenshot = {
        previewDataUrl,
        width: size.width,
        height: size.height,
        sizeBytes: bytes.length
      };
    }
  } catch {
    screenshot = null;
  }
  return {
    screenshot,
    sessions,
    sessionCount: sessions.length,
    totalLogBytes: sessions.reduce((sum, session) => sum + session.totalBytes, 0)
  };
}

export function getSupportReportDraft(userDataPath: string): DesktopSupportReportDraft {
  return currentDraft(userDataPath);
}

export async function addClipboardScreenshotToSupportReport(userDataPath: string): Promise<DesktopSupportReportActionResult> {
  // Electron 44 uses async ClipboardItem blobs instead of clipboard.readImage().
  // Only supported raster MIME types are accepted; never interpret clipboard text.
  let image = nativeImage.createEmpty();
  try {
    // The x86 build uses Electron 43 (the last available win32-ia32 runtime).
    // Keep its synchronous readImage path while x64/Linux use Electron 44's
    // async ClipboardItem API. Never read clipboard text as image data.
    const compatibleClipboard = clipboard as typeof clipboard & {
      readImage?: () => ReturnType<typeof nativeImage.createEmpty>;
    };
    if (typeof compatibleClipboard.read === "function") {
      const items = await compatibleClipboard.read();
      const imageTypes = ["image/png", "image/jpeg", "image/webp"] as const;
      for (const item of items) {
        const mime = imageTypes.find(type => item.types.includes(type));
        if (!mime) continue;
        const blob = await item.getType(mime);
        if (blob.size > MAX_SCREENSHOT_BYTES) {
          return { ok: false, message: "Ekran görüntüsü boş veya gönderim için çok büyük.", draft: currentDraft(userDataPath) };
        }
        image = nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer()));
        if (!image.isEmpty()) break;
      }
    } else if (typeof compatibleClipboard.readImage === "function") {
      image = compatibleClipboard.readImage();
    }
  } catch {
    return { ok: false, message: "Panodaki görüntü okunamadı. Ekran görüntüsünü yeniden kopyalayıp deneyin.", draft: currentDraft(userDataPath) };
  }
  if (image.isEmpty()) {
    return {
      ok: false,
      message: "Panoda ekran görüntüsü bulunamadı. Print Screen ile ekran görüntüsü alıp tekrar deneyin.",
      draft: currentDraft(userDataPath)
    };
  }

  const png = image.toPNG();
  if (png.length === 0 || png.length > MAX_SCREENSHOT_BYTES) {
    return {
      ok: false,
      message: "Ekran görüntüsü boş veya gönderim için çok büyük.",
      draft: currentDraft(userDataPath)
    };
  }

  ensureSupportRoot(userDataPath);
  fs.writeFileSync(screenshotDraftPath(userDataPath), png, { mode: 0o600 });
  const size = image.getSize();
  const preview = image.resize({ width: Math.min(720, Math.max(1, size.width)) });
  const draft = currentDraft(userDataPath);
  draft.screenshot = {
    previewDataUrl: preview.toDataURL(),
    width: size.width,
    height: size.height,
    sizeBytes: png.length
  };
  desktopLog.info({
    scope: "support",
    event: "support.screenshot.attached",
    message: "Kullanıcı hata raporuna clipboard ekran görüntüsü ekledi.",
    meta: { width: size.width, height: size.height, sizeBytes: png.length }
  });
  return { ok: true, message: "Ekran görüntüsü rapora eklendi.", draft };
}

export function clearSupportReportScreenshot(userDataPath: string): DesktopSupportReportActionResult {
  try {
    fs.rmSync(screenshotDraftPath(userDataPath), { force: true });
  } catch {
    // Best effort.
  }
  return { ok: true, message: "Ekran görüntüsü rapordan çıkarıldı.", draft: currentDraft(userDataPath) };
}

function readScreenshot(userDataPath: string) {
  const filePath = screenshotDraftPath(userDataPath);
  try {
    if (!fs.existsSync(filePath)) return null;
    const bytes = fs.readFileSync(filePath);
    if (!bytes.length || bytes.length > MAX_SCREENSHOT_BYTES) return null;
    const image = nativeImage.createFromBuffer(bytes);
    const size = image.isEmpty() ? { width: 0, height: 0 } : image.getSize();
    return {
      mimeType: "image/png" as const,
      base64: bytes.toString("base64"),
      width: size.width,
      height: size.height
    };
  } catch {
    return null;
  }
}

export async function sendSupportReport(
  userDataPath: string,
  input: DesktopSupportReportSendInput = {}
): Promise<DesktopSupportReportSendResult> {
  const operationId = createDiagnosticOperationId("support-report");
  const startedAt = Date.now();
  const clientId = readOrCreateSupportClientId(userDataPath);
  const clientReportId = crypto.randomUUID();
  const sessions = scrubSessions(createDiagnosticSupportSnapshot(3));
  const screenshot = readScreenshot(userDataPath);
  const bundle: SupportReportBundle = {
    format: "yardimci-asistan-support-report",
    version: 1,
    clientReportId,
    createdAt: new Date().toISOString(),
    app: {
      version: app.getVersion(),
      electronVersion: process.versions.electron || "",
      nodeVersion: process.versions.node || "",
      platform: process.platform,
      arch: process.arch,
      packaged: app.isPackaged
    },
    note: scrubText(String(input.note ?? "").trim()).slice(0, 2000),
    screenshot,
    sessions
  };

  const compressed = gzipSync(Buffer.from(JSON.stringify(bundle), "utf8"), { level: 6 });
  if (compressed.length > MAX_COMPRESSED_REPORT_BYTES) {
    desktopLog.warn({
      scope: "support",
      event: "support.report.too-large",
      message: "Hata raporu gönderim sınırını aştı.",
      operationId,
      meta: {
        compressedBytes: compressed.length,
        sessionCount: sessions.length,
        screenshotBytes: screenshot ? Buffer.byteLength(screenshot.base64, "base64") : 0
      }
    });
    return {
      ok: false,
      message: "Hata raporu gönderim için çok büyük. Ekran görüntüsünü kaldırıp tekrar deneyin."
    };
  }

  desktopLog.info({
    scope: "support",
    event: "support.report.upload.started",
    message: "Hata raporu gönderiliyor.",
    operationId,
    meta: {
      compressedBytes: compressed.length,
      sessionCount: sessions.length,
      screenshotAttached: Boolean(screenshot)
    }
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const response = await net.fetch(SUPPORT_REPORT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
        "X-YA-Support-Client": clientId,
        "X-YA-App-Version": app.getVersion()
      },
      body: new Uint8Array(compressed),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; report_id?: string; message?: string } | null;
    if (!response.ok || payload?.ok !== true || !payload.report_id) {
      desktopLog.error({
        scope: "support",
        event: "support.report.upload.failed",
        message: "Hata raporu sunucuya gönderilemedi.",
        operationId,
        meta: {
          status: response.status,
          durationMs: Date.now() - startedAt,
          remoteMessage: scrubText(String(payload?.message ?? ""))
        }
      });
      return {
        ok: false,
        message: payload?.message || `Hata raporu gönderilemedi (HTTP ${response.status}).`
      };
    }

    fs.rmSync(screenshotDraftPath(userDataPath), { force: true });
    desktopLog.info({
      scope: "support",
      event: "support.report.upload.completed",
      message: "Hata raporu başarıyla gönderildi.",
      operationId,
      meta: {
        reportId: payload.report_id,
        durationMs: Date.now() - startedAt,
        compressedBytes: compressed.length
      }
    });
    return {
      ok: true,
      message: `Hata raporu gönderildi. Takip kodu: ${payload.report_id}`,
      reportId: payload.report_id
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    desktopLog.error({
      scope: "support",
      event: "support.report.upload.failed",
      message: timedOut ? "Hata raporu gönderimi zaman aşımına uğradı." : "Hata raporu gönderiminde ağ hatası oluştu.",
      operationId,
      meta: { durationMs: Date.now() - startedAt, timedOut },
      error
    });
    return {
      ok: false,
      message: timedOut
        ? "Hata raporu gönderimi zaman aşımına uğradı. İnternet bağlantısını kontrol edip tekrar deneyin."
        : "Hata raporu gönderilemedi. İnternet bağlantısını kontrol edip tekrar deneyin."
    };
  } finally {
    clearTimeout(timer);
  }
}
