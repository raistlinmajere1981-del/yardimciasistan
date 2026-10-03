import type { AutomaticSyncStatus } from "../../electron/sync-coordinator";

export type SyncState = "idle" | "loading" | "success" | "error";
export type AppAccessPhase = "checking" | "locked" | "unlocking" | "unlocked";
export type AppStatusState = Exclude<SyncState, "idle">;

export interface AppStatusDetail {
  state: AppStatusState;
  message: string;
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = "yardimci-asistan.sidebar-collapsed";
const APP_STATUS_EVENT = "yardimci-asistan:app-status";

export const defaultAutomaticSyncStatus: AutomaticSyncStatus = {
  enabled: true,
  clientId: "",
  requestCursor: 0,
  webOrderCursor: 0,
  webOrderAcknowledgedCursor: 0,
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

/** Single transient operation-notice channel for the desktop shell top bar. */
export function reportAppStatus(state: AppStatusState, message: string) {
  const normalized = message.trim();
  if (!normalized) return;
  window.dispatchEvent(new CustomEvent<AppStatusDetail>(APP_STATUS_EVENT, {
    detail: { state, message: normalized }
  }));
}

export function subscribeAppStatus(listener: (detail: AppStatusDetail) => void) {
  const handleStatus = (event: Event) => {
    const detail = (event as CustomEvent<AppStatusDetail>).detail;
    if (detail?.message) listener(detail);
  };
  window.addEventListener(APP_STATUS_EVENT, handleStatus);
  return () => window.removeEventListener(APP_STATUS_EVENT, handleStatus);
}

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
