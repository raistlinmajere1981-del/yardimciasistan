import fs from "node:fs";
import path from "node:path";

export const DESKTOP_DATABASE_FILE_NAME = "yardimci-asistan.sqlite";
const DESKTOP_MAINTENANCE_DIR_NAME = "maintenance";
const DESKTOP_PENDING_MAINTENANCE_FILE = "pending-data-maintenance.json";
const DESKTOP_STAGED_RESTORE_FILE = "restore.sqlite";
const DESKTOP_STAGED_RESTORE_ASSETS_DIR = "restore-assets";
const DESKTOP_ASSETS_DIR_NAME = "assets";
const DESKTOP_PRODUCTS_DIR_NAME = "products";
const DESKTOP_LOGS_DIR_NAME = "logs";
const DESKTOP_LOG_SESSIONS_DIR_NAME = "sessions";

export interface DataRootResolutionInput {
  envDataDir?: string;
  isPackaged: boolean;
  appPath?: string;
  defaultUserDataPath: string;
}

export interface BackupRootResolutionInput {
  envBackupDir?: string;
  isPackaged: boolean;
  appPath?: string;
  execDir?: string;
}

function readEnvOverride(value: string | undefined): string {
  return String(value ?? "").trim();
}

function resolveRepoRootFromAppPath(appPath: string): string | null {
  const candidate = path.resolve(appPath, "..", "..");
  try {
    if (!fs.existsSync(path.join(candidate, "package.json"))) return null;
    if (!fs.existsSync(path.join(candidate, "apps", "desktop-app", "package.json"))) return null;
    return candidate;
  } catch {
    return null;
  }
}

export function resolveDataRoot(input: DataRootResolutionInput): string {
  const explicit = readEnvOverride(input.envDataDir ?? process.env.YA_DESKTOP_DATA_DIR);
  if (explicit) return path.resolve(explicit);

  if (!input.isPackaged && input.appPath) {
    const repoRoot = resolveRepoRootFromAppPath(input.appPath);
    if (repoRoot) return path.join(repoRoot, "data");
  }

  return input.defaultUserDataPath;
}

export function resolveBackupRoot(input: BackupRootResolutionInput): string {
  const explicit = readEnvOverride(input.envBackupDir ?? process.env.YA_DESKTOP_BACKUP_DIR);
  if (explicit) return path.resolve(explicit);

  if (!input.isPackaged && input.appPath) {
    const repoRoot = resolveRepoRootFromAppPath(input.appPath);
    if (repoRoot) return path.join(repoRoot, "backup");
  }

  if (input.isPackaged && input.execDir) {
    return path.join(input.execDir, "backup");
  }

  if (input.appPath) {
    return path.resolve(input.appPath, "..", "..", "backup");
  }

  throw new Error("Yedek kökü çözülemedi: appPath veya execDir gerekli.");
}

export function resolveDatabasePath(dataRoot: string): string {
  return path.join(dataRoot, DESKTOP_DATABASE_FILE_NAME);
}

export function resolveMaintenancePath(dataRoot: string): string {
  return path.join(dataRoot, DESKTOP_MAINTENANCE_DIR_NAME);
}

export function resolvePendingMaintenanceMarkerPath(dataRoot: string): string {
  return path.join(resolveMaintenancePath(dataRoot), DESKTOP_PENDING_MAINTENANCE_FILE);
}

export function resolveStagedRestorePath(dataRoot: string): string {
  return path.join(resolveMaintenancePath(dataRoot), DESKTOP_STAGED_RESTORE_FILE);
}

export function resolveStagedRestoreAssetsPath(dataRoot: string): string {
  return path.join(resolveMaintenancePath(dataRoot), DESKTOP_STAGED_RESTORE_ASSETS_DIR);
}

export function resolveAssetsPath(dataRoot: string): string {
  return path.join(dataRoot, DESKTOP_ASSETS_DIR_NAME);
}

function resolveProductAssetsPath(dataRoot: string): string {
  return path.join(resolveAssetsPath(dataRoot), DESKTOP_PRODUCTS_DIR_NAME);
}

export function resolveLogsPath(dataRoot: string): string {
  return path.join(dataRoot, DESKTOP_LOGS_DIR_NAME);
}

export function resolveDesktopLogSessionsPath(dataRoot: string): string {
  return path.join(resolveLogsPath(dataRoot), DESKTOP_LOG_SESSIONS_DIR_NAME);
}

const PRODUCT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const PRODUCT_FILE_PATTERN = /^[A-Za-z0-9_-]{1,80}\.(webp|jpg|jpeg|png)$/i;

function assertSafeProductId(productId: string): string {
  const normalized = String(productId ?? "").trim();
  if (!PRODUCT_ID_PATTERN.test(normalized) || normalized === "." || normalized === "..") {
    throw new Error("Geçersiz ürün kimliği.");
  }
  return normalized;
}

function assertSafeProductFileName(fileName: string): string {
  const normalized = String(fileName ?? "").trim();
  if (!PRODUCT_FILE_PATTERN.test(normalized)) {
    throw new Error("Geçersiz ürün görsel dosya adı.");
  }
  if (normalized.includes("/") || normalized.includes("\\")) {
    throw new Error("Geçersiz ürün görsel dosya adı.");
  }
  return normalized;
}

function isPathWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveProductAssetRelativePath(productId: string, fileName: string): string {
  const safeId = assertSafeProductId(productId);
  const safeFile = assertSafeProductFileName(fileName);
  return [DESKTOP_ASSETS_DIR_NAME, DESKTOP_PRODUCTS_DIR_NAME, safeId, safeFile].join("/");
}

export function resolveProductAssetAbsolutePath(dataRoot: string, productId: string, fileName: string): string {
  const safeId = assertSafeProductId(productId);
  const safeFile = assertSafeProductFileName(fileName);
  const absolute = path.join(resolveProductAssetsPath(dataRoot), safeId, safeFile);
  if (!isPathWithinRoot(resolveProductAssetsPath(dataRoot), absolute)) {
    throw new Error("Ürün görsel yolu asset kökünün dışına çıkamaz.");
  }
  return absolute;
}

export function resolveProductAssetAbsoluteFromRelative(dataRoot: string, relativePath: string): string {
  const normalized = String(relativePath ?? "").trim().replace(/\\/g, "/");
  const prefix = `${DESKTOP_ASSETS_DIR_NAME}/${DESKTOP_PRODUCTS_DIR_NAME}/`;
  if (!normalized.startsWith(prefix)) {
    throw new Error("Geçersiz ürün görsel relative yolu.");
  }
  const remainder = normalized.slice(prefix.length);
  const segments = remainder.split("/");
  if (segments.length !== 2) {
    throw new Error("Geçersiz ürün görsel relative yolu.");
  }
  const absolute = resolveProductAssetAbsolutePath(dataRoot, segments[0] ?? "", segments[1] ?? "");
  const expectedRelative = resolveProductAssetRelativePath(segments[0] ?? "", segments[1] ?? "");
  if (expectedRelative !== normalized) {
    throw new Error("Geçersiz ürün görsel relative yolu.");
  }
  return absolute;
}

