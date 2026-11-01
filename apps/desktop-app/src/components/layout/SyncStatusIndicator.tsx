import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import type { ConnectionStatus } from "../../app/connection-status";

interface SyncStatusIndicatorProps {
  connection: ConnectionStatus;
  onSync: () => void;
}

export function SyncStatusIndicator({
  connection,
  onSync
}: SyncStatusIndicatorProps) {
  if (!connection.webConfigured) return null;
  const state = connection.webSyncStatus === "unreachable" ? "offline"
    : connection.webSyncStatus === "waiting" ? "pending" : connection.webSyncStatus;
  const { label, detail } = connection.web;
  const action = connection.manualWebSyncAllowed ? " Elle eşitlemek için tıklayın." : "";
  const Icon = state === "offline" || state === "error"
      ? CloudOff
      : state === "syncing"
        ? RefreshCw
        : Cloud;

  return (
    <button
      className={`sync-status-indicator topbar-control is-${state}`}
      type="button"
      aria-label={`Web eşitleme durumu: ${label}.${action}`}
      title={`${label}. ${detail}${action}`}
      onClick={onSync}
      disabled={!connection.manualWebSyncAllowed}
    >
      <Icon size={18} aria-hidden="true" />
      <span className="sync-status-indicator__dot" aria-hidden="true" />
    </button>
  );
}
