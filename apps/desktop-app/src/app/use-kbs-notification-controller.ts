import { useState, type Dispatch, type SetStateAction } from "react";
import type { DesktopDashboardData } from "../../electron/database";
import type { SyncState } from "./runtime-state";

interface UseKbsNotificationControllerOptions {
  setDashboardData: Dispatch<SetStateAction<DesktopDashboardData>>;
  setSyncState: Dispatch<SetStateAction<SyncState>>;
  setStatusMessage: Dispatch<SetStateAction<string>>;
}

export function useKbsNotificationController({
  setDashboardData,
  setSyncState,
  setStatusMessage
}: UseKbsNotificationControllerOptions) {
  const [busyNotificationId, setBusyNotificationId] = useState("");
  const [message, setMessage] = useState("");

  async function markExternallySent(notificationId: string) {
    return mutate(notificationId, "Kimlik bildirimi kaydı güncelleniyor...", () =>
      window.yardimciDesktop!.markKbsNotificationSentExternally(notificationId)
    );
  }

  async function retry(notificationId: string) {
    return mutate(notificationId, "Kimlik bildirimi yeniden kuyruğa alınıyor...", () =>
      window.yardimciDesktop!.retryKbsNotification(notificationId)
    );
  }

  async function mutate(
    notificationId: string,
    loadingMessage: string,
    operation: () => Promise<Awaited<ReturnType<NonNullable<typeof window.yardimciDesktop>["retryKbsNotification"]>>>
  ) {
    if (!window.yardimciDesktop || busyNotificationId) return false;
    setBusyNotificationId(notificationId);
    setSyncState("loading");
    setStatusMessage(loadingMessage);
    setMessage(loadingMessage);
    try {
      const result = await operation();
      if (!result.ok) {
        setSyncState("error");
        setStatusMessage(result.message);
        setMessage(result.message);
        return false;
      }
      setDashboardData(result.dashboardData);
      setSyncState("success");
      setStatusMessage(result.message);
      setMessage(result.message);
      return true;
    } catch {
      const errorMessage = "Kimlik bildirimi işlemi tamamlanamadı.";
      setSyncState("error");
      setStatusMessage(errorMessage);
      setMessage(errorMessage);
      return false;
    } finally {
      setBusyNotificationId("");
    }
  }

  return {
    busyNotificationId,
    message,
    markExternallySent,
    retry
  };
}

export type KbsNotificationController = ReturnType<typeof useKbsNotificationController>;
