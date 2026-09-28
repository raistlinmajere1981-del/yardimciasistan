import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// tools/admin/lib -> repo root
export const REPO_ROOT = resolve(here, "..", "..", "..");
export const ADMIN_ROOT = resolve(here, "..");
export const BLACKSEA_ROOT = process.env.BLACKSEA_REPO ?? join(homedir(), "blacksea_web");

const cacheBase = process.env.XDG_CACHE_HOME?.trim()
  ? process.env.XDG_CACHE_HOME.trim()
  : join(homedir(), ".cache");
export const HISTORY_DIR = join(cacheBase, "yardimci-asistan-admin");
export const HISTORY_FILE = join(HISTORY_DIR, "history.json");
export const HISTORY_LOG_DIR = join(HISTORY_DIR, "logs");
export const REPORT_DIR = join(HISTORY_DIR, "reports");

export function resolveCwd(cwd) {
  if (cwd === "blacksea") return BLACKSEA_ROOT;
  return REPO_ROOT;
}
