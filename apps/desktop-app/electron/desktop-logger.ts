import fs from "node:fs";
import path from "node:path";
import { ipcMain } from "electron";
import { resolveDesktopLogFilePath, resolveLogsPath } from "./data-paths.js";

type DesktopLogLevel = "INFO" | "WARN" | "ERROR";

const MAX_LOG_BYTES = 2 * 1024 * 1024;
const ROTATED_LOG_COUNT = 3;

let logFilePath = "";
let initialized = false;
let ipcWrapped = false;
let consoleWrapped = false;
let processHooksInstalled = false;

function sanitizeText(value: string): string {
  return value
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, "$1[redacted]")
    .replace(/\bbearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [redacted]")
    .replace(/((?:sync[_ -]?secret|api[_ -]?key|password|token)\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]")
    .replace(/safe-storage:v1:[A-Za-z0-9+/=]+/gi, "safe-storage:v1:[redacted]");
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeText(error.stack || `${error.name}: ${error.message}`);
  }
  if (typeof error === "string") return sanitizeText(error);
  if (error === null || error === undefined) return String(error);
  return sanitizeText(String(error));
}

function consoleArgText(value: unknown): string {
  if (value instanceof Error) return errorText(value);
  if (typeof value === "string") return sanitizeText(value);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (value === null || value === undefined) return String(value);
  return "[object]";
}

function rotateIfNeeded() {
  if (!logFilePath || !fs.existsSync(logFilePath)) return;
  try {
    const currentSize = fs.statSync(logFilePath).size;
    if (currentSize < MAX_LOG_BYTES) return;

    for (let index = ROTATED_LOG_COUNT; index >= 1; index -= 1) {
      const source = index === 1 ? logFilePath : `${logFilePath}.${index - 1}`;
      const target = `${logFilePath}.${index}`;
      if (!fs.existsSync(source)) continue;
      if (index === ROTATED_LOG_COUNT && fs.existsSync(target)) {
        fs.rmSync(target, { force: true });
      }
      fs.renameSync(source, target);
    }
  } catch {
    // Logging must never be able to stop the desktop process.
  }
}

function append(level: DesktopLogLevel, scope: string, message: string) {
  if (!initialized || !logFilePath) return;
  try {
    rotateIfNeeded();
    const normalizedScope = sanitizeText(String(scope || "app")).replace(/[\r\n]+/g, " ");
    const normalizedMessage = sanitizeText(String(message || "")).trim();
    const record = `${new Date().toISOString()} [${level}] [${normalizedScope}] ${normalizedMessage}\n`;
    fs.appendFileSync(logFilePath, record, { encoding: "utf8" });
  } catch {
    // Keep failures in diagnostics isolated from the application itself.
  }
}

export function desktopLogInfo(scope: string, message: string) {
  append("INFO", scope, message);
}

export function desktopLogWarn(scope: string, message: string, error?: unknown) {
  append("WARN", scope, error === undefined ? message : `${message}\n${errorText(error)}`);
}

export function desktopLogError(scope: string, message: string, error?: unknown) {
  append("ERROR", scope, error === undefined ? message : `${message}\n${errorText(error)}`);
}

function installConsoleMirror() {
  if (consoleWrapped) return;
  consoleWrapped = true;

  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.warn = (...args: unknown[]) => {
    append("WARN", "console", args.map(consoleArgText).join(" "));
    originalWarn(...args);
  };

  console.error = (...args: unknown[]) => {
    append("ERROR", "console", args.map(consoleArgText).join(" "));
    originalError(...args);
  };
}

function installProcessHooks() {
  if (processHooksInstalled) return;
  processHooksInstalled = true;

  process.on("uncaughtExceptionMonitor", (error, origin) => {
    desktopLogError("process", `Uncaught exception monitor (${origin})`, error);
  });

  process.on("warning", (warning) => {
    desktopLogWarn("process-warning", warning.message, warning);
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
        desktopLogError(`ipc:${channel}`, "IPC handler failed.", error);
        throw error;
      }
    });
  }) as typeof ipcMain.handle;
}

export function initializeDesktopLogging(dataRoot: string): string {
  if (initialized) return logFilePath;

  const logsPath = resolveLogsPath(dataRoot);
  logFilePath = resolveDesktopLogFilePath(dataRoot);
  try {
    fs.mkdirSync(logsPath, { recursive: true });
    initialized = true;
    installConsoleMirror();
    installProcessHooks();
    installIpcErrorLogging();
    desktopLogInfo("startup", `Desktop logging initialized at ${path.basename(logFilePath)}`);
  } catch {
    logFilePath = "";
    initialized = false;
  }
  return logFilePath;
}

export function getDesktopLogFilePath(): string {
  return logFilePath;
}
