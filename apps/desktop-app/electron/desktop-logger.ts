import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ipcMain } from "electron";
import {
  resolveDesktopLogSessionsPath,
  resolveLogsPath
} from "./data-paths.js";
import type {
  DesktopDiagnosticError,
  DesktopDiagnosticEvent,
  DesktopDiagnosticLevel,
  DesktopDiagnosticProcess,
  DesktopDiagnosticReadInput,
  DesktopDiagnosticReadResult,
  DesktopDiagnosticSessionManifest,
  DesktopDiagnosticSessionSummary,
  DesktopDiagnosticWriteInput
} from "./diagnostics-contract";

const MAX_EVENT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SESSION_COUNT = 30;
const MAX_TOTAL_SESSION_BYTES = 50 * 1024 * 1024;
const MAX_MESSAGE_LENGTH = 8_000;
const MAX_STRING_LENGTH = 4_000;
const MAX_META_DEPTH = 4;
const MAX_META_KEYS = 60;
const MAX_ARRAY_ITEMS = 50;
const SESSION_ID_PATTERN = /^[0-9A-Z_-]{12,80}$/i;
const EVENT_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,119}$/;

interface InitializeDesktopLoggingOptions {
  dataRoot: string;
  appVersion: string;
  packaged: boolean;
}

interface StructuredLogInput {
  scope: string;
  event: string;
  message: string;
  operationId?: string;
  meta?: Record<string, unknown>;
  error?: unknown;
}

let logsPath = "";
let sessionsPath = "";
let sessionPath = "";
let sessionManifestPath = "";
let currentEventFilePath = "";
let currentChunk = 1;
let currentSequence = 0;
let sessionManifest: DesktopDiagnosticSessionManifest | null = null;
let initialized = false;
let ipcWrapped = false;
let consoleWrapped = false;
let processHooksInstalled = false;

function sanitizeText(value: string, maxLength = MAX_STRING_LENGTH): string {
  return value
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, "$1[redacted]")
    .replace(/\bbearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/((?:sync[_ -]?secret|api[_ -]?key|password|token|authorization|cookie)\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]")
    .replace(/safe-storage:v1:[A-Za-z0-9+/=]+/gi, "safe-storage:v1:[redacted]")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, maxLength);
}

function isSensitiveKey(key: string): boolean {
  return /(?:password|passphrase|secret|token|api.?key|authorization|cookie|credential|private.?key)/i.test(key);
}

function sanitizeValue(value: unknown, key = "", depth = 0): unknown {
  if (isSensitiveKey(key)) return "[redacted]";
  if (depth > MAX_META_DEPTH) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) return sanitizeError(value);
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, key, depth + 1));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>).slice(0, MAX_META_KEYS)) {
      result[entryKey] = sanitizeValue(entryValue, entryKey, depth + 1);
    }
    return result;
  }
  return sanitizeText(String(value));
}

function sanitizeError(error: unknown): DesktopDiagnosticError {
  if (error instanceof Error) {
    return {
      name: sanitizeText(error.name || "Error", 120),
      message: sanitizeText(error.message || String(error), MAX_MESSAGE_LENGTH),
      ...(error.stack ? { stack: sanitizeText(error.stack, 16_000) } : {})
    };
  }
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const record = error as Record<string, unknown>;
    const name = sanitizeText(String(record.name ?? "Error"), 120);
    const message = sanitizeText(String(record.message ?? "Bilinmeyen renderer hatası"), MAX_MESSAGE_LENGTH);
    const stack = typeof record.stack === "string" ? sanitizeText(record.stack, 16_000) : "";
    return {
      name,
      message,
      ...(stack ? { stack } : {})
    };
  }
  return {
    name: "Error",
    message: sanitizeText(typeof error === "string" ? error : String(error), MAX_MESSAGE_LENGTH)
  };
}

function consoleArgText(value: unknown): string {
  if (value instanceof Error) return sanitizeError(value).stack || sanitizeError(value).message;
  if (typeof value === "string") return sanitizeText(value, MAX_MESSAGE_LENGTH);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (value === null || value === undefined) return String(value);
  try {
    return sanitizeText(JSON.stringify(sanitizeValue(value)), MAX_MESSAGE_LENGTH);
  } catch {
    return "[object]";
  }
}

function createSessionId(now = new Date()): string {
  const timestamp = now.toISOString().replace(/[-:.]/g, "");
  return `${timestamp}-${crypto.randomBytes(4).toString("hex")}`;
}

function eventFileName(chunk: number): string {
  return `events-${String(chunk).padStart(3, "0")}.jsonl`;
}

function writeManifest() {
  if (!sessionManifest || !sessionManifestPath) return;
  try {
    fs.writeFileSync(sessionManifestPath, `${JSON.stringify(sessionManifest, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
  } catch {
    // Diagnostics must never stop the desktop process.
  }
}

function ensureEventFile(recordBytes: number) {
  if (!currentEventFilePath) return;
  try {
    const size = fs.existsSync(currentEventFilePath) ? fs.statSync(currentEventFilePath).size : 0;
    if (size > 0 && size + recordBytes > MAX_EVENT_FILE_BYTES) {
      currentChunk += 1;
      currentEventFilePath = path.join(sessionPath, eventFileName(currentChunk));
    }
  } catch {
    // Best effort rotation; the append path remains usable.
  }
}

function appendStructured(
  level: DesktopDiagnosticLevel,
  processName: DesktopDiagnosticProcess,
  input: StructuredLogInput
): DesktopDiagnosticEvent | null {
  if (!initialized || !sessionManifest || !currentEventFilePath) return null;

  try {
    const scope = sanitizeText(String(input.scope || "app"), 120).replace(/[\r\n]+/g, " ").trim() || "app";
    const event = EVENT_NAME_PATTERN.test(String(input.event || "").trim())
      ? String(input.event).trim().toLowerCase()
      : "app.message";
    const message = sanitizeText(String(input.message || "").trim(), MAX_MESSAGE_LENGTH);
    const operationId = sanitizeText(String(input.operationId || "").trim(), 160);
    const sanitizedMeta = sanitizeValue(input.meta ?? {}, "meta") as Record<string, unknown>;
    const record: DesktopDiagnosticEvent = {
      timestamp: new Date().toISOString(),
      sequence: ++currentSequence,
      level,
      process: processName,
      scope,
      event,
      message,
      ...(operationId ? { operationId } : {}),
      ...(Object.keys(sanitizedMeta).length > 0 ? { meta: sanitizedMeta } : {}),
      ...(input.error !== undefined ? { error: sanitizeError(input.error) } : {})
    };
    const serialized = `${JSON.stringify(record)}\n`;
    ensureEventFile(Buffer.byteLength(serialized));
    fs.appendFileSync(currentEventFilePath, serialized, { encoding: "utf8", mode: 0o600 });

    sessionManifest.eventCount += 1;
    if (level === "WARN") sessionManifest.warnCount += 1;
    if (level === "ERROR") sessionManifest.errorCount += 1;
    writeManifest();
    return record;
  } catch {
    return null;
  }
}

export const desktopLog = {
  info(input: StructuredLogInput) {
    return appendStructured("INFO", "main", input);
  },
  warn(input: StructuredLogInput) {
    return appendStructured("WARN", "main", input);
  },
  error(input: StructuredLogInput) {
    return appendStructured("ERROR", "main", input);
  }
};

export function writeRendererDiagnostic(inputValue: unknown): DesktopDiagnosticEvent | null {
  if (!inputValue || typeof inputValue !== "object" || Array.isArray(inputValue)) return null;
  const input = inputValue as Partial<DesktopDiagnosticWriteInput>;
  const level = String(input.level ?? "").toUpperCase() as DesktopDiagnosticLevel;
  if (!["INFO", "WARN", "ERROR"].includes(level)) return null;

  return appendStructured(level, "renderer", {
    scope: String(input.scope ?? "renderer"),
    event: String(input.event ?? "renderer.message"),
    message: String(input.message ?? ""),
    operationId: typeof input.operationId === "string" ? input.operationId : "",
    meta: input.meta && typeof input.meta === "object" && !Array.isArray(input.meta)
      ? input.meta as Record<string, unknown>
      : undefined,
    error: input.error
  });
}

function installConsoleMirror() {
  if (consoleWrapped) return;
  consoleWrapped = true;

  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.warn = (...args: unknown[]) => {
    appendStructured("WARN", "main", {
      scope: "console",
      event: "console.warn",
      message: args.map(consoleArgText).join(" ")
    });
    originalWarn(...args);
  };

  console.error = (...args: unknown[]) => {
    appendStructured("ERROR", "main", {
      scope: "console",
      event: "console.error",
      message: args.map(consoleArgText).join(" ")
    });
    originalError(...args);
  };
}

function installProcessHooks() {
  if (processHooksInstalled) return;
  processHooksInstalled = true;

  process.on("uncaughtExceptionMonitor", (error, origin) => {
    desktopLog.error({
      scope: "process",
      event: "process.uncaught-exception",
      message: `Yakalanmamış istisna izlendi (${origin}).`,
      error
    });
  });

  process.on("warning", (warning) => {
    desktopLog.warn({
      scope: "process",
      event: "process.warning",
      message: warning.message,
      error: warning
    });
  });
}

function installIpcErrorLogging() {
  if (ipcWrapped) return;
  ipcWrapped = true;

  const originalHandle = ipcMain.handle.bind(ipcMain);
  const mutableIpcMain = ipcMain as unknown as { handle: typeof ipcMain.handle };

  mutableIpcMain.handle = ((channel, listener) => {
    originalHandle(channel, async (event, ...args) => {
      try {
        return await listener(event, ...args);
      } catch (error) {
        desktopLog.error({
          scope: "ipc",
          event: "ipc.handler.failed",
          message: "IPC işleyicisi başarısız oldu.",
          meta: { channel },
          error
        });
        throw error;
      }
    });
  }) as typeof ipcMain.handle;
}

function directorySize(directoryPath: string): number {
  try {
    let total = 0;
    for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) total += directorySize(entryPath);
      else if (entry.isFile()) total += fs.statSync(entryPath).size;
    }
    return total;
  } catch {
    return 0;
  }
}

function readManifest(directoryPath: string): DesktopDiagnosticSessionManifest | null {
  try {
    const candidate = JSON.parse(fs.readFileSync(path.join(directoryPath, "session.json"), "utf8")) as DesktopDiagnosticSessionManifest;
    if (!candidate || candidate.version !== 1 || !SESSION_ID_PATTERN.test(candidate.sessionId)) return null;
    return candidate;
  } catch {
    return null;
  }
}

function cleanupOldSessions() {
  if (!sessionsPath) return;
  try {
    const entries = fs.readdirSync(sessionsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== sessionManifest?.sessionId)
      .map((entry) => {
        const directoryPath = path.join(sessionsPath, entry.name);
        const manifest = readManifest(directoryPath);
        return {
          name: entry.name,
          path: directoryPath,
          startedAt: manifest?.startedAt || "",
          size: directorySize(directoryPath)
        };
      })
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt));

    let totalBytes = entries.reduce((sum, entry) => sum + entry.size, directorySize(sessionPath));
    let totalCount = entries.length + 1;
    for (const entry of entries) {
      if (totalCount <= MAX_SESSION_COUNT && totalBytes <= MAX_TOTAL_SESSION_BYTES) break;
      fs.rmSync(entry.path, { recursive: true, force: true });
      totalBytes -= entry.size;
      totalCount -= 1;
    }
  } catch {
    // Retention is best effort.
  }
}

function toSummary(manifest: DesktopDiagnosticSessionManifest, directoryPath: string): DesktopDiagnosticSessionSummary {
  return {
    ...manifest,
    current: manifest.sessionId === sessionManifest?.sessionId,
    totalBytes: directorySize(directoryPath)
  };
}

export function initializeDesktopLogging(options: InitializeDesktopLoggingOptions): DesktopDiagnosticSessionSummary | null {
  if (initialized && sessionManifest) return toSummary(sessionManifest, sessionPath);

  logsPath = resolveLogsPath(options.dataRoot);
  sessionsPath = resolveDesktopLogSessionsPath(options.dataRoot);
  try {
    fs.mkdirSync(sessionsPath, { recursive: true });
    const startedAt = new Date().toISOString();
    const sessionId = createSessionId(new Date(startedAt));
    sessionPath = path.join(sessionsPath, sessionId);
    fs.mkdirSync(sessionPath, { recursive: true, mode: 0o700 });
    sessionManifestPath = path.join(sessionPath, "session.json");
    currentEventFilePath = path.join(sessionPath, eventFileName(1));
    currentChunk = 1;
    currentSequence = 0;
    sessionManifest = {
      version: 1,
      sessionId,
      startedAt,
      appVersion: sanitizeText(options.appVersion || "", 120),
      electronVersion: sanitizeText(process.versions.electron || "", 120),
      nodeVersion: sanitizeText(process.versions.node || "", 120),
      platform: process.platform,
      arch: process.arch,
      packaged: Boolean(options.packaged),
      eventCount: 0,
      warnCount: 0,
      errorCount: 0
    };
    initialized = true;
    writeManifest();
    cleanupOldSessions();
    installConsoleMirror();
    installProcessHooks();
    installIpcErrorLogging();
    desktopLog.info({
      scope: "startup",
      event: "app.session.started",
      message: "Masaüstü tanılama oturumu başlatıldı.",
      meta: { logsPath: path.basename(logsPath) }
    });
    return toSummary(sessionManifest, sessionPath);
  } catch {
    logsPath = "";
    sessionsPath = "";
    sessionPath = "";
    sessionManifestPath = "";
    currentEventFilePath = "";
    sessionManifest = null;
    initialized = false;
    return null;
  }
}

export function finalizeDesktopLogging(reason = "quit") {
  if (!initialized || !sessionManifest) return;
  sessionManifest.endedAt = new Date().toISOString();
  sessionManifest.endReason = sanitizeText(reason, 120);
  writeManifest();
}

export function getCurrentDiagnosticSession(): DesktopDiagnosticSessionSummary | null {
  return sessionManifest ? toSummary(sessionManifest, sessionPath) : null;
}

export function listDiagnosticSessions(): DesktopDiagnosticSessionSummary[] {
  if (!sessionsPath) return [];
  try {
    return fs.readdirSync(sessionsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const directoryPath = path.join(sessionsPath, entry.name);
        const manifest = readManifest(directoryPath);
        return manifest ? toSummary(manifest, directoryPath) : null;
      })
      .filter((entry): entry is DesktopDiagnosticSessionSummary => Boolean(entry))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  } catch {
    return [];
  }
}

function resolveSessionDirectory(sessionIdValue: unknown): { path: string; manifest: DesktopDiagnosticSessionManifest } | null {
  const sessionId = String(sessionIdValue ?? sessionManifest?.sessionId ?? "").trim();
  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId) || !sessionsPath) return null;
  const candidate = path.join(sessionsPath, sessionId);
  if (path.dirname(candidate) !== sessionsPath) return null;
  const manifest = readManifest(candidate);
  return manifest ? { path: candidate, manifest } : null;
}

function eventMatches(record: DesktopDiagnosticEvent, input: DesktopDiagnosticReadInput): boolean {
  if (input.levels?.length && !input.levels.includes(record.level)) return false;
  if (input.scopes?.length && !input.scopes.includes(record.scope)) return false;
  if (input.beforeSequence && record.sequence >= input.beforeSequence) return false;
  const query = String(input.query ?? "").trim().toLocaleLowerCase("tr-TR");
  if (!query) return true;
  return JSON.stringify(record).toLocaleLowerCase("tr-TR").includes(query);
}

export function readDiagnosticSession(inputValue: unknown): DesktopDiagnosticReadResult | null {
  const input = inputValue && typeof inputValue === "object" && !Array.isArray(inputValue)
    ? inputValue as DesktopDiagnosticReadInput
    : {};
  const resolved = resolveSessionDirectory(input.sessionId);
  if (!resolved) return null;

  const limitCandidate = Number(input.limit ?? 500);
  const limit = Number.isInteger(limitCandidate) ? Math.max(1, Math.min(2_000, limitCandidate)) : 500;
  const events: DesktopDiagnosticEvent[] = [];
  try {
    const files = fs.readdirSync(resolved.path)
      .filter((fileName) => /^events-\d{3}\.jsonl$/.test(fileName))
      .sort();
    for (const fileName of files) {
      const content = fs.readFileSync(path.join(resolved.path, fileName), "utf8");
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line) as DesktopDiagnosticEvent;
          if (record && Number.isInteger(record.sequence) && eventMatches(record, input)) events.push(record);
        } catch {
          // Ignore a partially written final line after an abrupt process stop.
        }
      }
    }
  } catch {
    // A session can still be summarized even if one event chunk is unreadable.
  }

  const hasMore = events.length > limit;
  return {
    session: toSummary(resolved.manifest, resolved.path),
    events: events.slice(-limit),
    hasMore
  };
}
