import { app, BrowserWindow, ipcMain, net } from "electron";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createUpdateSafetyBackup } from "./data-maintenance";
import { desktopLog } from "./desktop-logger";

const DEFAULT_UPDATE_BASE_URL = "https://yardimciasistan.alwaysdata.net/updates/stable";

const UPDATE_DIRECTORY_NAME = "updates";
const UPDATE_STATE_FILE = "settings.json";
const UPDATE_PENDING_FILE = "pending.json";
const UPDATE_INSTALLING_FILE = "installing.json";
const UPDATE_DOWNLOAD_DIRECTORY = "downloads";
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPDATE_POLL_INTERVAL_MS = 60 * 60 * 1000;
const UPDATE_HTTP_TIMEOUT_MS = 25_000;
const UPDATE_DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;

type DesktopUpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "up-to-date"
  | "error"
  | "unsupported";

export interface DesktopUpdateStatus {
  phase: DesktopUpdatePhase;
  message: string;
  currentVersion: string;
  latestVersion: string;
  progressPercent: number;
  downloadedBytes: number;
  totalBytes: number;
  lastCheckedAt: string;
  defaultBaseUrl: string;
  effectiveBaseUrl: string;
  customBaseUrl: string;
  autoCheckEnabled: boolean;
  notes: string[];
  installSupported: boolean;
  pendingVersion: string;
  lastResult?: {
    kind: "success" | "error";
    version: string;
    at: string;
    message: string;
  };
}

export interface DesktopUpdatePreferencesInput {
  customBaseUrl: string;
  autoCheckEnabled: boolean;
}

export interface DesktopUpdateActionResult {
  ok: boolean;
  message: string;
  status: DesktopUpdateStatus;
}

interface PersistedUpdateState {
  version: 1;
  customBaseUrl: string;
  autoCheckEnabled: boolean;
  lastCheckedAt: string;
  latestVersion: string;
  latestNotes: string[];
  lastResult?: DesktopUpdateStatus["lastResult"];
}

interface UpdateManifest {
  format: "yardimci-asistan-update";
  version: 1;
  channel: "stable";
  appVersion: string;
  publishedAt: string;
  platform: "win32";
  arch: "x64" | "ia32";
  notes: string[];
  artifact: {
    file: string;
    url: string;
    size: number;
    sha256: string;
  };
}

interface PendingDesktopUpdate {
  version: 1;
  targetVersion: string;
  installerPath: string;
  sha256: string;
  size: number;
  downloadedAt: string;
  sourceBaseUrl: string;
}

interface InstallingDesktopUpdate extends PendingDesktopUpdate {
  installStartedAt: string;
  safetyBackupFolderName?: string;
}

interface UpdatePaths {
  root: string;
  state: string;
  pending: string;
  installing: string;
  downloads: string;
}

let currentRuntimeStatus: DesktopUpdateStatus | null = null;
let automaticTimer: NodeJS.Timeout | null = null;
let automaticInitialTimer: NodeJS.Timeout | null = null;
let updateOperation: { kind: "check" | "download"; promise: Promise<DesktopUpdateStatus> } | null = null;

function resolveUpdatePaths(userDataPath: string): UpdatePaths {
  const root = path.join(userDataPath, UPDATE_DIRECTORY_NAME);
  return {
    root,
    state: path.join(root, UPDATE_STATE_FILE),
    pending: path.join(root, UPDATE_PENDING_FILE),
    installing: path.join(root, UPDATE_INSTALLING_FILE),
    downloads: path.join(root, UPDATE_DOWNLOAD_DIRECTORY)
  };
}

function defaultPersistedState(): PersistedUpdateState {
  return {
    version: 1,
    customBaseUrl: "",
    autoCheckEnabled: true,
    lastCheckedAt: "",
    latestVersion: "",
    latestNotes: []
  };
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath: string, value: unknown) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2) + "\n", "utf8");
  fs.renameSync(tempPath, filePath);
}

function removeIfExists(filePath: string) {
  try {
    if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
  } catch {
    // Cleanup is best effort.
  }
}

function readPersistedState(paths: UpdatePaths): PersistedUpdateState {
  const parsed = readJsonFile<Partial<PersistedUpdateState>>(paths.state);
  const defaults = defaultPersistedState();
  if (!parsed || parsed.version !== 1) return defaults;
  const persistedCustomBaseUrl = typeof parsed.customBaseUrl === "string" ? parsed.customBaseUrl : "";
  let customBaseUrl = persistedCustomBaseUrl;
  try {
    if (customBaseUrl && normalizeBaseUrl(customBaseUrl) === DEFAULT_UPDATE_BASE_URL) {
      customBaseUrl = "";
    }
  } catch {
    customBaseUrl = "";
  }
  return {
    version: 1,
    customBaseUrl,
    autoCheckEnabled: parsed.autoCheckEnabled !== false,
    lastCheckedAt: typeof parsed.lastCheckedAt === "string" ? parsed.lastCheckedAt : "",
    latestVersion: typeof parsed.latestVersion === "string" ? parsed.latestVersion : "",
    latestNotes: Array.isArray(parsed.latestNotes)
      ? parsed.latestNotes.filter((item): item is string => typeof item === "string").slice(0, 20)
      : [],
    lastResult: parsed.lastResult
      && (parsed.lastResult.kind === "success" || parsed.lastResult.kind === "error")
      && typeof parsed.lastResult.version === "string"
      && typeof parsed.lastResult.at === "string"
      && typeof parsed.lastResult.message === "string"
        ? parsed.lastResult
        : undefined
  };
}

function writePersistedState(paths: UpdatePaths, state: PersistedUpdateState) {
  writeJsonAtomic(paths.state, state);
}

function readPendingUpdate(paths: UpdatePaths): PendingDesktopUpdate | null {
  const pending = readJsonFile<PendingDesktopUpdate>(paths.pending);
  if (!pending || pending.version !== 1) return null;
  if (!isValidVersion(pending.targetVersion)) return null;
  if (!/^[a-f0-9]{64}$/i.test(pending.sha256)) return null;
  if (!Number.isSafeInteger(pending.size) || pending.size <= 0) return null;
  return pending;
}

function readInstallingUpdate(paths: UpdatePaths): InstallingDesktopUpdate | null {
  const installing = readJsonFile<InstallingDesktopUpdate>(paths.installing);
  if (!installing || installing.version !== 1) return null;
  if (!isValidVersion(installing.targetVersion)) return null;
  return installing;
}

function normalizeBaseUrl(value: string, allowLocalHttp = !app.isPackaged): string {
  const raw = String(value || "").trim();
  if (!raw) return DEFAULT_UPDATE_BASE_URL;
  const parsed = new URL(raw);
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Güncelleme adresinde kullanıcı bilgisi, sorgu veya # bölümü kullanılamaz.");
  }
  const localHttp = allowLocalHttp
    && parsed.protocol === "http:"
    && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1");
  if (parsed.protocol !== "https:" && !localHttp) {
    throw new Error("Güncelleme adresi HTTPS kullanmalı.");
  }
  return parsed.toString().replace(/\/+$/, "");
}

function effectiveBaseUrl(state: PersistedUpdateState): string {
  try {
    return normalizeBaseUrl(state.customBaseUrl || DEFAULT_UPDATE_BASE_URL);
  } catch {
    return DEFAULT_UPDATE_BASE_URL;
  }
}

function updatePlatformDirectory(): "win-x64" | "win-x86" | null {
  if (process.platform === "win32") {
    return process.arch === "ia32" ? "win-x86" : "win-x64";
  }
  if (!app.isPackaged) {
    // Linux development can exercise the network/status path against the x64 feed.
    return "win-x64";
  }
  return null;
}

function installSupported(): boolean {
  return app.isPackaged && process.platform === "win32" && (process.arch === "x64" || process.arch === "ia32");
}

function buildStatus(userDataPath: string, overrides: Partial<DesktopUpdateStatus> = {}): DesktopUpdateStatus {
  const paths = resolveUpdatePaths(userDataPath);
  const persisted = readPersistedState(paths);
  const pending = readPendingUpdate(paths);
  const currentVersion = app.getVersion();
  const platformDirectory = updatePlatformDirectory();
  const latestVersion = pending?.targetVersion || persisted.latestVersion || currentVersion;

  let phase: DesktopUpdatePhase = "idle";
  let message = persisted.lastResult?.message || "Güncelleme henüz kontrol edilmedi.";
  if (!platformDirectory) {
    phase = "unsupported";
    message = "Bu platform için otomatik güncelleme henüz etkin değil.";
  } else if (pending) {
    phase = "ready";
    message = `Yardımcı Asistan ${pending.targetVersion} indirildi. Sonraki açılışta kurulacak.`;
  } else if (persisted.latestVersion && compareVersions(persisted.latestVersion, currentVersion) > 0) {
    phase = "available";
    message = `Yardımcı Asistan ${persisted.latestVersion} kullanılabilir.`;
  } else if (persisted.lastCheckedAt) {
    phase = "up-to-date";
    message = persisted.lastResult?.kind === "success"
      ? persisted.lastResult.message
      : "Yardımcı Asistan güncel.";
  }

  return {
    phase,
    message,
    currentVersion,
    latestVersion,
    progressPercent: 0,
    downloadedBytes: 0,
    totalBytes: pending?.size ?? 0,
    lastCheckedAt: persisted.lastCheckedAt,
    defaultBaseUrl: DEFAULT_UPDATE_BASE_URL,
    effectiveBaseUrl: effectiveBaseUrl(persisted),
    customBaseUrl: persisted.customBaseUrl,
    autoCheckEnabled: persisted.autoCheckEnabled,
    notes: persisted.latestNotes,
    installSupported: installSupported(),
    pendingVersion: pending?.targetVersion ?? "",
    lastResult: persisted.lastResult,
    ...overrides
  };
}

function publishStatus(status: DesktopUpdateStatus) {
  currentRuntimeStatus = status;
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("update:statusChanged", status);
    }
  }
  return status;
}

function getStatus(userDataPath: string): DesktopUpdateStatus {
  const persistedStatus = buildStatus(userDataPath);
  if (!currentRuntimeStatus) return persistedStatus;

  const preferencesChanged =
    currentRuntimeStatus.effectiveBaseUrl !== persistedStatus.effectiveBaseUrl
    || currentRuntimeStatus.autoCheckEnabled !== persistedStatus.autoCheckEnabled
    || currentRuntimeStatus.currentVersion !== persistedStatus.currentVersion;
  return preferencesChanged ? persistedStatus : currentRuntimeStatus;
}

function isValidVersion(value: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(String(value || "").trim());
}

function parseVersion(value: string) {
  const match = String(value || "").trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?(?:\+.+)?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || ""
  };
}

function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return left.localeCompare(right);
  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true });
}

function manifestUrlFor(baseUrl: string): string {
  const platformDirectory = updatePlatformDirectory();
  if (!platformDirectory) throw new Error("Bu platform için güncelleme kanalı bulunmuyor.");
  return `${baseUrl}/${platformDirectory}/release.json`;
}

function validateManifest(value: unknown, manifestUrl: string): UpdateManifest {
  if (!value || typeof value !== "object") throw new Error("Güncelleme manifesti geçersiz.");
  const candidate = value as Partial<UpdateManifest>;
  const artifact = candidate.artifact;
  if (candidate.format !== "yardimci-asistan-update" || candidate.version !== 1 || candidate.channel !== "stable") {
    throw new Error("Güncelleme manifesti tanınmıyor.");
  }
  if (!isValidVersion(String(candidate.appVersion ?? ""))) {
    throw new Error("Güncelleme sürümü geçersiz.");
  }
  if (candidate.platform !== "win32" || !["x64", "ia32"].includes(String(candidate.arch ?? ""))) {
    throw new Error("Güncelleme hedef platformu geçersiz.");
  }
  if (!artifact || typeof artifact !== "object") {
    throw new Error("Güncelleme paketi bilgisi eksik.");
  }
  const file = String(artifact.file ?? "");
  if (!/^[A-Za-z0-9._-]+\.exe$/i.test(file)) {
    throw new Error("Güncelleme paket adı geçersiz.");
  }
  const size = Number(artifact.size ?? 0);
  const sha256 = String(artifact.sha256 ?? "").toLowerCase();
  if (!Number.isSafeInteger(size) || size <= 0 || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error("Güncelleme bütünlük bilgisi geçersiz.");
  }

  const resolvedArtifactUrl = new URL(String(artifact.url || file), manifestUrl);
  if (resolvedArtifactUrl.protocol !== "https:" && app.isPackaged) {
    throw new Error("Güncelleme paketi HTTPS üzerinden sunulmalı.");
  }

  const expectedArch = process.arch === "ia32" ? "ia32" : "x64";
  if (app.isPackaged && process.platform === "win32" && candidate.arch !== expectedArch) {
    throw new Error("Güncelleme paketi bu Windows mimarisiyle uyumlu değil.");
  }

  return {
    format: "yardimci-asistan-update",
    version: 1,
    channel: "stable",
    appVersion: String(candidate.appVersion),
    publishedAt: typeof candidate.publishedAt === "string" ? candidate.publishedAt : "",
    platform: "win32",
    arch: candidate.arch as "x64" | "ia32",
    notes: Array.isArray(candidate.notes)
      ? candidate.notes.filter((item): item is string => typeof item === "string").slice(0, 20)
      : [],
    artifact: {
      file,
      url: resolvedArtifactUrl.toString(),
      size,
      sha256
    }
  };
}

async function fetchManifest(baseUrl: string): Promise<UpdateManifest> {
  const manifestUrl = manifestUrlFor(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPDATE_HTTP_TIMEOUT_MS);
  try {
    const response = await net.fetch(manifestUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache"
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Güncelleme sunucusu HTTP ${response.status} döndürdü.`);
    }
    return validateManifest(await response.json(), manifestUrl);
  } finally {
    clearTimeout(timer);
  }
}

function shouldSkipAutomaticCheck(state: PersistedUpdateState): boolean {
  if (!state.autoCheckEnabled) return true;
  if (!state.lastCheckedAt) return false;
  const lastChecked = Date.parse(state.lastCheckedAt);
  return Number.isFinite(lastChecked) && Date.now() - lastChecked < UPDATE_CHECK_INTERVAL_MS;
}

async function performCheck(userDataPath: string, force: boolean): Promise<DesktopUpdateStatus> {
  const paths = resolveUpdatePaths(userDataPath);
  const persisted = readPersistedState(paths);
  if (!force && shouldSkipAutomaticCheck(persisted)) {
    return publishStatus(buildStatus(userDataPath));
  }

  const platformDirectory = updatePlatformDirectory();
  if (!platformDirectory) {
    return publishStatus(buildStatus(userDataPath, {
      phase: "unsupported",
      message: "Bu platform için otomatik güncelleme henüz etkin değil."
    }));
  }

  const checking = publishStatus(buildStatus(userDataPath, {
    phase: "checking",
    message: "Güncellemeler kontrol ediliyor..."
  }));
  desktopLog.info({
    scope: "update",
    event: "update.check.started",
    message: "Güncellemeler kontrol ediliyor.",
    meta: { baseUrl: checking.effectiveBaseUrl }
  });

  try {
    const manifest = await fetchManifest(checking.effectiveBaseUrl);
    const now = new Date().toISOString();
    const nextPersisted: PersistedUpdateState = {
      ...persisted,
      lastCheckedAt: now,
      latestVersion: manifest.appVersion,
      latestNotes: manifest.notes
    };
    writePersistedState(paths, nextPersisted);

    const available = compareVersions(manifest.appVersion, app.getVersion()) > 0;
    const status = buildStatus(userDataPath, {
      phase: available ? "available" : "up-to-date",
      message: available
        ? `Yardımcı Asistan ${manifest.appVersion} kullanılabilir.`
        : "Yardımcı Asistan güncel.",
      latestVersion: manifest.appVersion,
      notes: manifest.notes,
      lastCheckedAt: now
    });
    desktopLog.info({
      scope: "update",
      event: "update.check.completed",
      message: available
        ? `Yardımcı Asistan ${manifest.appVersion} kullanılabilir.`
        : "Yardımcı Asistan güncel.",
      meta: {
        currentVersion: app.getVersion(),
        remoteVersion: manifest.appVersion,
        available
      }
    });
    return publishStatus(status);
  } catch (error) {
    desktopLog.warn({
      scope: "update",
      event: "update.check.failed",
      message: "Güncelleme kontrol edilemedi.",
      error
    });
    return publishStatus(buildStatus(userDataPath, {
      phase: "error",
      message: error instanceof Error ? error.message : "Güncelleme kontrol edilemedi."
    }));
  }
}

async function checkDesktopUpdate(userDataPath: string, force = false): Promise<DesktopUpdateStatus> {
  if (updateOperation) return updateOperation.promise;
  const promise = performCheck(userDataPath, force);
  updateOperation = { kind: "check", promise };
  const clear = () => {
    if (updateOperation?.promise === promise) updateOperation = null;
  };
  void promise.then(clear, clear);
  return promise;
}

async function sha256File(filePath: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function isPathInside(childPath: string, parentPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function downloadUpdate(userDataPath: string): Promise<DesktopUpdateStatus> {
  if (!installSupported()) {
    return publishStatus(buildStatus(userDataPath, {
      phase: "unsupported",
      message: "Güncelleme indirme ve kurulum yalnız paketlenmiş Windows sürümünde kullanılabilir."
    }));
  }

  const paths = resolveUpdatePaths(userDataPath);
  const persisted = readPersistedState(paths);
  const baseUrl = effectiveBaseUrl(persisted);

  try {
    const manifest = await fetchManifest(baseUrl);
    if (compareVersions(manifest.appVersion, app.getVersion()) <= 0) {
      const now = new Date().toISOString();
      writePersistedState(paths, {
        ...persisted,
        lastCheckedAt: now,
        latestVersion: manifest.appVersion,
        latestNotes: manifest.notes
      });
      return publishStatus(buildStatus(userDataPath, {
        phase: "up-to-date",
        message: "Yardımcı Asistan zaten güncel.",
        latestVersion: manifest.appVersion,
        notes: manifest.notes,
        lastCheckedAt: now
      }));
    }

    fs.mkdirSync(paths.downloads, { recursive: true });
    const finalPath = path.join(paths.downloads, manifest.artifact.file);
    const tempPath = `${finalPath}.part`;
    removeIfExists(tempPath);

    if (fs.existsSync(finalPath)) {
      const stat = fs.statSync(finalPath);
      if (stat.size === manifest.artifact.size && await sha256File(finalPath) === manifest.artifact.sha256) {
        const pending: PendingDesktopUpdate = {
          version: 1,
          targetVersion: manifest.appVersion,
          installerPath: finalPath,
          sha256: manifest.artifact.sha256,
          size: manifest.artifact.size,
          downloadedAt: new Date().toISOString(),
          sourceBaseUrl: baseUrl
        };
        writeJsonAtomic(paths.pending, pending);
        return publishStatus(buildStatus(userDataPath, {
          phase: "ready",
          message: `Yardımcı Asistan ${manifest.appVersion} kurulmaya hazır.`,
          latestVersion: manifest.appVersion,
          pendingVersion: manifest.appVersion,
          notes: manifest.notes,
          totalBytes: manifest.artifact.size,
          downloadedBytes: manifest.artifact.size,
          progressPercent: 100
        }));
      }
      removeIfExists(finalPath);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPDATE_DOWNLOAD_TIMEOUT_MS);
    const downloading = publishStatus(buildStatus(userDataPath, {
      phase: "downloading",
      message: `Yardımcı Asistan ${manifest.appVersion} indiriliyor...`,
      latestVersion: manifest.appVersion,
      notes: manifest.notes,
      totalBytes: manifest.artifact.size
    }));
    desktopLog.info({
      scope: "update",
      event: "update.download.started",
      message: `Yardımcı Asistan ${manifest.appVersion} indiriliyor.`,
      meta: { targetVersion: manifest.appVersion, totalBytes: manifest.artifact.size }
    });

    let fileDescriptor: number | null = null;
    try {
      const response = await net.fetch(manifest.artifact.url, {
        method: "GET",
        headers: { "Cache-Control": "no-cache" },
        signal: controller.signal
      });
      if (!response.ok || !response.body) {
        throw new Error(`Güncelleme paketi HTTP ${response.status} döndürdü.`);
      }

      fileDescriptor = fs.openSync(tempPath, "w");
      const hash = createHash("sha256");
      const reader = response.body.getReader();
      let downloadedBytes = 0;
      let lastPublishedAt = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        fs.writeSync(fileDescriptor, value);
        hash.update(value);
        downloadedBytes += value.byteLength;

        const now = Date.now();
        if (now - lastPublishedAt >= 250 || downloadedBytes === manifest.artifact.size) {
          lastPublishedAt = now;
          const progressPercent = manifest.artifact.size > 0
            ? Math.min(100, Math.round((downloadedBytes / manifest.artifact.size) * 100))
            : 0;
          publishStatus({
            ...downloading,
            phase: "downloading",
            message: `Yardımcı Asistan ${manifest.appVersion} indiriliyor... %${progressPercent}`,
            downloadedBytes,
            totalBytes: manifest.artifact.size,
            progressPercent
          });
        }
      }

      fs.closeSync(fileDescriptor);
      fileDescriptor = null;
      const actualSize = fs.statSync(tempPath).size;
      const actualHash = hash.digest("hex");
      if (actualSize !== manifest.artifact.size) {
        throw new Error(`Güncelleme paketi boyutu uyuşmuyor (beklenen ${manifest.artifact.size}, alınan ${actualSize}).`);
      }
      if (actualHash !== manifest.artifact.sha256) {
        throw new Error("Güncelleme paketi SHA-256 doğrulamasından geçemedi.");
      }

      removeIfExists(finalPath);
      fs.renameSync(tempPath, finalPath);
      const pending: PendingDesktopUpdate = {
        version: 1,
        targetVersion: manifest.appVersion,
        installerPath: finalPath,
        sha256: manifest.artifact.sha256,
        size: manifest.artifact.size,
        downloadedAt: new Date().toISOString(),
        sourceBaseUrl: baseUrl
      };
      writeJsonAtomic(paths.pending, pending);
      writePersistedState(paths, {
        ...persisted,
        lastCheckedAt: new Date().toISOString(),
        latestVersion: manifest.appVersion,
        latestNotes: manifest.notes
      });
      desktopLog.info({
        scope: "update",
        event: "update.download.completed",
        message: `Yardımcı Asistan ${manifest.appVersion} indirildi ve doğrulandı.`,
        meta: { targetVersion: manifest.appVersion }
      });
      return publishStatus(buildStatus(userDataPath, {
        phase: "ready",
        message: `Yardımcı Asistan ${manifest.appVersion} indirildi. Sonraki açılışta kurulacak.`,
        latestVersion: manifest.appVersion,
        pendingVersion: manifest.appVersion,
        notes: manifest.notes,
        downloadedBytes: manifest.artifact.size,
        totalBytes: manifest.artifact.size,
        progressPercent: 100
      }));
    } finally {
      clearTimeout(timer);
      if (fileDescriptor !== null) {
        try {
          fs.closeSync(fileDescriptor);
        } catch {
          // Best effort.
        }
      }
    }
  } catch (error) {
    const paths = resolveUpdatePaths(userDataPath);
    try {
      for (const entry of fs.existsSync(paths.downloads) ? fs.readdirSync(paths.downloads) : []) {
        if (entry.endsWith(".part")) removeIfExists(path.join(paths.downloads, entry));
      }
    } catch {
      // Best effort.
    }
    desktopLog.error({
      scope: "update",
      event: "update.download.failed",
      message: "Güncelleme indirilemedi.",
      error
    });
    return publishStatus(buildStatus(userDataPath, {
      phase: "error",
      message: error instanceof Error ? error.message : "Güncelleme indirilemedi."
    }));
  }
}

async function downloadDesktopUpdate(userDataPath: string): Promise<DesktopUpdateStatus> {
  if (updateOperation?.kind === "download") return updateOperation.promise;
  if (updateOperation?.kind === "check") {
    await updateOperation.promise;
    // Re-enter after the check settles so TypeScript and the runtime both
    // observe the fresh global operation state. A concurrent caller may have
    // started the download while this call was waiting.
    return downloadDesktopUpdate(userDataPath);
  }

  const promise = downloadUpdate(userDataPath);
  updateOperation = { kind: "download", promise };
  const clear = () => {
    if (updateOperation?.promise === promise) updateOperation = null;
  };
  void promise.then(clear, clear);
  return promise;
}

function saveDesktopUpdatePreferences(
  userDataPath: string,
  input: DesktopUpdatePreferencesInput
): DesktopUpdateActionResult {
  const paths = resolveUpdatePaths(userDataPath);
  const current = readPersistedState(paths);
  try {
    const requested = String(input.customBaseUrl ?? "").trim();
    const normalizedCustom = requested
      ? normalizeBaseUrl(requested) === DEFAULT_UPDATE_BASE_URL
        ? ""
        : normalizeBaseUrl(requested)
      : "";
    const next: PersistedUpdateState = {
      ...current,
      customBaseUrl: normalizedCustom,
      autoCheckEnabled: input.autoCheckEnabled !== false,
      lastCheckedAt: normalizedCustom !== current.customBaseUrl ? "" : current.lastCheckedAt
    };
    writePersistedState(paths, next);
    const status = publishStatus(buildStatus(userDataPath, {
      message: normalizedCustom
        ? "Özel güncelleme sunucusu kaydedildi."
        : "Varsayılan güncelleme sunucusu kullanılacak."
    }));
    return { ok: true, message: status.message, status };
  } catch (error) {
    const status = publishStatus(buildStatus(userDataPath, {
      phase: "error",
      message: error instanceof Error ? error.message : "Güncelleme ayarları kaydedilemedi."
    }));
    return { ok: false, message: status.message, status };
  }
}

function restartForPendingDesktopUpdate(userDataPath: string): DesktopUpdateActionResult {
  const paths = resolveUpdatePaths(userDataPath);
  const pending = readPendingUpdate(paths);
  if (!pending) {
    const status = publishStatus(buildStatus(userDataPath, {
      phase: "error",
      message: "Kurulmaya hazır bir güncelleme bulunmuyor."
    }));
    return { ok: false, message: status.message, status };
  }

  const status = publishStatus(buildStatus(userDataPath, {
    phase: "ready",
    message: `Yardımcı Asistan ${pending.targetVersion} kurulmak üzere yeniden başlatılıyor.`
  }));
  const timer = setTimeout(() => {
    app.relaunch();
    app.quit();
  }, 250);
  timer.unref();
  return { ok: true, message: status.message, status };
}

function recordInstallResult(
  paths: UpdatePaths,
  kind: "success" | "error",
  version: string,
  message: string
) {
  const current = readPersistedState(paths);
  writePersistedState(paths, {
    ...current,
    latestVersion: kind === "success" ? app.getVersion() : current.latestVersion,
    lastResult: {
      kind,
      version,
      at: new Date().toISOString(),
      message
    }
  });
}

function verifyPendingInstaller(paths: UpdatePaths, pending: PendingDesktopUpdate) {
  if (!isPathInside(pending.installerPath, paths.downloads)) {
    throw new Error("Bekleyen güncelleme paketi güvenli indirme klasörünün dışında.");
  }
  if (!fs.existsSync(pending.installerPath)) {
    throw new Error("Bekleyen güncelleme paketi bulunamadı.");
  }
  const stat = fs.statSync(pending.installerPath);
  if (stat.size !== pending.size) {
    throw new Error("Bekleyen güncelleme paketinin boyutu değişmiş.");
  }
  const hash = createHash("sha256").update(fs.readFileSync(pending.installerPath)).digest("hex");
  if (hash !== pending.sha256) {
    throw new Error("Bekleyen güncelleme paketi SHA-256 doğrulamasından geçemedi.");
  }
}

function cleanupInstallArtifacts(paths: UpdatePaths, installerPath?: string) {
  removeIfExists(paths.pending);
  removeIfExists(paths.installing);
  if (installerPath && isPathInside(installerPath, paths.downloads)) {
    removeIfExists(installerPath);
  }
}

export function applyPendingDesktopUpdateAtStartup(userDataPath: string): boolean {
  const paths = resolveUpdatePaths(userDataPath);
  const currentVersion = app.getVersion();
  const installing = readInstallingUpdate(paths);

  if (installing) {
    if (compareVersions(currentVersion, installing.targetVersion) >= 0) {
      const message = `Yardımcı Asistan ${currentVersion} güncellemesi başarıyla kuruldu.`;
      recordInstallResult(paths, "success", installing.targetVersion, message);
      desktopLog.info({
        scope: "update",
        event: "update.install.completed",
        message,
        meta: { targetVersion: installing.targetVersion }
      });
      cleanupInstallArtifacts(paths, installing.installerPath);
    } else {
      const message = `Yardımcı Asistan ${installing.targetVersion} güncellemesi tamamlanamadı; mevcut ${currentVersion} sürümü açıldı.`;
      recordInstallResult(paths, "error", installing.targetVersion, message);
      desktopLog.warn({
        scope: "update",
        event: "update.install.incomplete",
        message,
        meta: { targetVersion: installing.targetVersion, currentVersion }
      });
      cleanupInstallArtifacts(paths, installing.installerPath);
    }
    return false;
  }

  const pending = readPendingUpdate(paths);
  if (!pending) return false;

  if (compareVersions(pending.targetVersion, currentVersion) <= 0) {
    cleanupInstallArtifacts(paths, pending.installerPath);
    return false;
  }

  if (!installSupported()) {
    const message = "Bekleyen güncelleme bu ortamda otomatik kurulamadı.";
    recordInstallResult(paths, "error", pending.targetVersion, message);
    desktopLog.warn({
      scope: "update",
      event: "update.install.unsupported",
      message,
      meta: { targetVersion: pending.targetVersion }
    });
    cleanupInstallArtifacts(paths, pending.installerPath);
    return false;
  }

  try {
    verifyPendingInstaller(paths, pending);
    const safetyBackup = createUpdateSafetyBackup(userDataPath, pending.targetVersion);
    const installingState: InstallingDesktopUpdate = {
      ...pending,
      installStartedAt: new Date().toISOString(),
      safetyBackupFolderName: safetyBackup?.folderName
    };
    writeJsonAtomic(paths.installing, installingState);

    // Per-machine NSIS installs live under Program Files and require elevation.
    // electron-builder packages elevate.exe for this purpose; keep the same
    // invocation contract as electron-updater and let NSIS relaunch the app
    // only after the update transaction has completed.
    const installerArgs = ["--updated", "/S", "--force-run"];
    const elevationHelperPath = path.join(process.resourcesPath, "elevate.exe");
    const useElevationHelper = fs.existsSync(elevationHelperPath);
    const child = spawn(
      useElevationHelper ? elevationHelperPath : pending.installerPath,
      useElevationHelper ? [pending.installerPath, ...installerArgs] : installerArgs,
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      }
    );
    child.unref();
    removeIfExists(paths.pending);
    desktopLog.info({
      scope: "update",
      event: "update.install.started",
      message: `Yardımcı Asistan ${pending.targetVersion} kurucusu başlatıldı.`,
      meta: {
        targetVersion: pending.targetVersion,
        ...(safetyBackup ? { safetyBackupFolderName: safetyBackup.folderName } : {})
      }
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bekleyen güncelleme başlatılamadı.";
    recordInstallResult(paths, "error", pending.targetVersion, message);
    desktopLog.error({
      scope: "update",
      event: "update.install.failed",
      message: "Bekleyen güncelleme uygulanamadı.",
      meta: { targetVersion: pending.targetVersion },
      error
    });
    cleanupInstallArtifacts(paths, pending.installerPath);
    return false;
  }
}

export function registerDesktopUpdateIpcHandlers(userDataPath: () => string) {
  const channels = [
    "update:getStatus",
    "update:check",
    "update:download",
    "update:savePreferences",
    "update:restartAndInstall"
  ];
  for (const channel of channels) ipcMain.removeHandler(channel);

  ipcMain.handle("update:getStatus", () => getStatus(userDataPath()));
  ipcMain.handle("update:check", (_event, force = true) => checkDesktopUpdate(userDataPath(), force === true));
  ipcMain.handle("update:download", () => downloadDesktopUpdate(userDataPath()));
  ipcMain.handle(
    "update:savePreferences",
    (_event, input: DesktopUpdatePreferencesInput) => saveDesktopUpdatePreferences(userDataPath(), input)
  );
  ipcMain.handle("update:restartAndInstall", () => restartForPendingDesktopUpdate(userDataPath()));
}

export function startAutomaticDesktopUpdateChecks(userDataPath: () => string) {
  if (!app.isPackaged || process.platform !== "win32") return;
  if (automaticInitialTimer || automaticTimer) return;

  const check = () => {
    void checkDesktopUpdate(userDataPath(), false).catch((error) => {
      desktopLog.warn({
        scope: "update",
        event: "update.check.failed",
        message: "Otomatik güncelleme kontrolü başarısız oldu.",
        error
      });
    });
  };

  automaticInitialTimer = setTimeout(() => {
    automaticInitialTimer = null;
    check();
  }, 8_000);
  automaticInitialTimer.unref();

  automaticTimer = setInterval(check, UPDATE_POLL_INTERVAL_MS);
  automaticTimer.unref();
}
