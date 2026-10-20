import { Cloud, CloudOff, RefreshCw, WifiOff } from "lucide-react";
import type { AutomaticSyncStatus } from "../../../electron/sync-coordinator";

interface SyncStatusIndicatorProps {
  automaticSyncStatus: AutomaticSyncStatus;
  onSync: () => void;
}

type IndicatorState = "ready" | "pending" | "syncing" | "offline" | "error" | "disabled";

function resolveIndicatorState(status: AutomaticSyncStatus): IndicatorState {
  if (status.phase === "syncing") return "syncing";
  if (status.phase === "error") return "error";
  if (status.phase === "offline") return "offline";
  if (status.phase === "disabled" || !status.enabled) return "disabled";
  if (status.pendingJobs > 0) return "pending";
  return "ready";
}

function indicatorText(state: IndicatorState) {
  if (state === "syncing") return "Eşitleme sürüyor";
  if (state === "error") return "Eşitleme hatası";
  if (state === "offline") return "Çevrimdışı";
  if (state === "disabled") return "Otomatik eşitleme kapalı";
  if (state === "pending") return "Arka planda eşitleme bekliyor";
  return "Eşitleme hazır";
}

export function SyncStatusIndicator({
  automaticSyncStatus,
  onSync
}: SyncStatusIndicatorProps) {
  const state = resolveIndicatorState(automaticSyncStatus);
  const label = indicatorText(state);
  const Icon = state === "offline"
    ? WifiOff
    : state === "error"
      ? CloudOff
      : state === "syncing"
        ? RefreshCw
        : Cloud;

  return (
    <button
      className={`sync-status-indicator topbar-control is-${state}`}
      type="button"
      aria-label={`Eşitleme durumu: ${label}. Elle eşitlemek için tıklayın.`}
      title={`${label}. İsterseniz elle eşitleyebilirsiniz.`}
      onClick={onSync}
      disabled={state === "syncing"}
    >
      <Icon size={18} aria-hidden="true" />
      <span className="sync-status-indicator__dot" aria-hidden="true" />
    </button>
  );
}
