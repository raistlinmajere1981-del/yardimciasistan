import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const DESKTOP_DATABASE_FILE_NAME = "yardimci-asistan.sqlite";
export const DESKTOP_MAINTENANCE_DIR_NAME = "maintenance";
export const DESKTOP_PENDING_MAINTENANCE_FILE = "pending-data-maintenance.json";
export const DESKTOP_STAGED_RESTORE_FILE = "restore.sqlite";
export const DESKTOP_STAGED_RESTORE_ASSETS_DIR = "restore-assets";
export const DESKTOP_ASSETS_DIR_NAME = "assets";
export const DESKTOP_PRODUCTS_DIR_NAME = "products";
export const DESKTOP_TEMPORARY_DIR_NAME = "tmp";
export const DESKTOP_LEGACY_RELOCATION_MARKER_SUFFIX = ".relocated-to-data-root.json";

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

export interface DesktopDataPaths {
  dataRoot: string;
  databasePath: string;
  assetsPath: string;
  productAssetsPath: string;
  maintenancePath: string;
  markerPath: string;
  stagedRestorePath: string;
  stagedRestoreAssetsPath: string;
  backupPath: string;
  temporaryPath: string;
}

function readEnvOverride(value: string | undefined): string {
  return String(value ?? "").trim();
}

export function resolveRepoRootFromAppPath(appPath: string): string | null {
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

export function resolveProductAssetsPath(dataRoot: string): string {
  return path.join(resolveAssetsPath(dataRoot), DESKTOP_PRODUCTS_DIR_NAME);
}

export function resolveTemporaryPath(dataRoot: string): string {
  return path.join(dataRoot, DESKTOP_TEMPORARY_DIR_NAME);
}

export function buildDesktopDataPaths(dataRoot: string, backupPath: string): DesktopDataPaths {
  return {
    dataRoot,
    databasePath: resolveDatabasePath(dataRoot),
    assetsPath: resolveAssetsPath(dataRoot),
    productAssetsPath: resolveProductAssetsPath(dataRoot),
    maintenancePath: resolveMaintenancePath(dataRoot),
    markerPath: resolvePendingMaintenanceMarkerPath(dataRoot),
    stagedRestorePath: resolveStagedRestorePath(dataRoot),
    stagedRestoreAssetsPath: resolveStagedRestoreAssetsPath(dataRoot),
    backupPath,
    temporaryPath: resolveTemporaryPath(dataRoot)
  };
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

export function isPathWithinRoot(root: string, candidate: string): boolean {
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

export function listDurableBackupSources(dataRoot: string): string[] {
  const sources: string[] = [resolveDatabasePath(dataRoot)];
  const assetsPath = resolveAssetsPath(dataRoot);
  try {
    if (fs.existsSync(assetsPath) && fs.statSync(assetsPath).isDirectory()) {
      sources.push(assetsPath);
    }
  } catch {
    // Best effort; backup source discovery must not fail the backup itself.
  }
  return sources;
}

export interface LegacyRelocationPlan {
  relocate: boolean;
  reason: "target-exists" | "legacy-missing" | "same-path" | "legacy-only" | "already-relocated";
  targetDatabasePath: string;
  legacyDatabasePath: string;
  markerPath: string;
}

export function resolveLegacyDevRelocationMarkerPath(legacyDatabasePath: string): string {
  return `${path.resolve(legacyDatabasePath)}${DESKTOP_LEGACY_RELOCATION_MARKER_SUFFIX}`;
}

function writeLegacyDevRelocationMarker(plan: LegacyRelocationPlan) {
  const payload = JSON.stringify({
    version: 1,
    legacyDatabasePath: plan.legacyDatabasePath,
    targetDatabasePath: plan.targetDatabasePath,
    completedAt: new Date().toISOString()
  }, null, 2);
  fs.writeFileSync(plan.markerPath, `${payload}\n`, { encoding: "utf8", mode: 0o600 });
}

export function planLegacyDevRelocation(targetDatabasePath: string, legacyDatabasePath: string): LegacyRelocationPlan {
  const target = path.resolve(targetDatabasePath);
  const legacy = path.resolve(legacyDatabasePath);
  const markerPath = resolveLegacyDevRelocationMarkerPath(legacy);
  if (target === legacy) {
    return { relocate: false, reason: "same-path", targetDatabasePath: target, legacyDatabasePath: legacy, markerPath };
  }
  if (fs.existsSync(markerPath)) {
    return { relocate: false, reason: "already-relocated", targetDatabasePath: target, legacyDatabasePath: legacy, markerPath };
  }
  if (fs.existsSync(target)) {
    return { relocate: false, reason: "target-exists", targetDatabasePath: target, legacyDatabasePath: legacy, markerPath };
  }
  if (!fs.existsSync(legacy)) {
    return { relocate: false, reason: "legacy-missing", targetDatabasePath: target, legacyDatabasePath: legacy, markerPath };
  }
  return { relocate: true, reason: "legacy-only", targetDatabasePath: target, legacyDatabasePath: legacy, markerPath };
}

export function relocateLegacyDevDatabaseOnce(targetDatabasePath: string, legacyDatabasePath: string): LegacyRelocationPlan & { relocated: boolean } {
  const plan = planLegacyDevRelocation(targetDatabasePath, legacyDatabasePath);
  if (!plan.relocate) {
    // Older builds could already have copied the legacy DB before the marker
    // existed. Once a development target DB is present, record that the
    // relocation phase is complete so an intentional future reset does not
    // silently resurrect the legacy database.
    if (plan.reason === "target-exists"
        && fs.existsSync(plan.legacyDatabasePath)
        && !fs.existsSync(plan.markerPath)) {
      writeLegacyDevRelocationMarker(plan);
    }
    return { ...plan, relocated: false };
  }

  fs.mkdirSync(path.dirname(plan.targetDatabasePath), { recursive: true });
  const source = new DatabaseSync(plan.legacyDatabasePath);
  try {
    source.exec("PRAGMA busy_timeout = 5000;");
    source.exec(`VACUUM INTO '${plan.targetDatabasePath.replace(/'/g, "''")}'`);
  } finally {
    source.close();
  }

  if (!fs.existsSync(plan.targetDatabasePath)) {
    throw new Error("Eski geliştirme verisi yeni konuma kopyalanamadı.");
  }
  writeLegacyDevRelocationMarker(plan);
  return { ...plan, relocated: true };
}
