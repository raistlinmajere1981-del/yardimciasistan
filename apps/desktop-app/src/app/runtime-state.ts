import type { AutomaticSyncStatus } from "../../electron/sync-coordinator";

export type SyncState = "idle" | "loading" | "success" | "error";
export type AppAccessPhase = "checking" | "locked" | "unlocking" | "unlocked";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "yardimci-asistan.sidebar-collapsed";

export const defaultAutomaticSyncStatus: AutomaticSyncStatus = {
  enabled: true,
  clientId: "",
  requestCursor: 0,
  acknowledgedCursor: 0,
  lastAttemptAt: "",
  lastSuccessAt: "",
  lastError: "",
  consecutiveFailures: 0,
  pendingJobs: 0,
  nextRetryAt: "",
  phase: "idle",
  message: "Otomatik eşitleme hazır."
};

export function readSidebarCollapsedPreference() {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveSidebarCollapsedPreference(collapsed: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Depolama kapalıysa menü tercihi yalnız bu oturumda geçerli kalır.
  }
}

export function automaticSyncTone(status: AutomaticSyncStatus): SyncState {
  if (status.phase === "syncing") return "loading";
  if (status.phase === "success") return "success";
  if (status.phase === "offline" || status.phase === "error") return "error";
  return "idle";
}
