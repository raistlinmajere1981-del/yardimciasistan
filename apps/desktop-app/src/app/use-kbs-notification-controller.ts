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

  async function send(notificationId: string) {
    if (!window.yardimciDesktop || busyNotificationId) return null;
    setBusyNotificationId(notificationId);
    setSyncState("loading");
    setStatusMessage("Kimlik bildirimi gönderiliyor...");
    try {
      const result = await window.yardimciDesktop.sendKbsNotification(notificationId);
      setDashboardData(result.dashboardData);
      setStatusMessage(result.message);
      setSyncState(result.ok || (result.state !== "failed" && result.state !== "submission_unknown") ? "success" : "error");
      return result;
    } catch {
      const errorMessage = "Kimlik bildirimi gönderim denemesi tamamlanamadı.";
      setSyncState("error");
      setStatusMessage(errorMessage);
      return null;
    } finally {
      setBusyNotificationId("");
    }
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
    try {
      const result = await operation();
      if (!result.ok) {
        setSyncState("error");
        setStatusMessage(result.message);
        return false;
      }
      setDashboardData(result.dashboardData);
      setSyncState("success");
      setStatusMessage(result.message);
      return true;
    } catch {
      const errorMessage = "Kimlik bildirimi işlemi tamamlanamadı.";
      setSyncState("error");
      setStatusMessage(errorMessage);
      return false;
    } finally {
      setBusyNotificationId("");
    }
  }

  return {
    busyNotificationId,
    markExternallySent,
    retry,
    send
  };
}

export type KbsNotificationController = ReturnType<typeof useKbsNotificationController>;
