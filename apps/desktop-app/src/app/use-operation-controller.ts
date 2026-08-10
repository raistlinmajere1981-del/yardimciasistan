import type { Dispatch, SetStateAction } from "react";
import type {
  DesktopDashboardData,
  DesktopStatusUpdateResult,
  SaveDailyTaskInput,
  SaveManualReservationInput
} from "../../electron/database";
import type { SyncState } from "./runtime-state";

interface UseOperationControllerOptions {
  setDashboardData: Dispatch<SetStateAction<DesktopDashboardData>>;
  setSyncState: Dispatch<SetStateAction<SyncState>>;
  setStatusMessage: Dispatch<SetStateAction<string>>;
}

export function useOperationController({
  setDashboardData,
  setSyncState,
  setStatusMessage
}: UseOperationControllerOptions) {
  async function handleUpdateRoomStatus(roomId: string, status: string) {
    setSyncState("loading");
    setStatusMessage("Oda durumu güncelleniyor...");

    if (!window.yardimciDesktop) {
      setSyncState("error");
      setStatusMessage("Oda durumu güncellenemedi. Uygulamayı yeniden başlatın.");
      return;
    }

    const result = await window.yardimciDesktop.updateRoomStatus({ roomId, status });
    if (!result.ok) {
      setSyncState("error");
      setStatusMessage(result.message);
      return;
    }

    setDashboardData(result.dashboardData);
    setSyncState("success");
    setStatusMessage(result.message);
  }

  async function handleUpdateTableStatus(tableId: string, status: string) {
    setSyncState("loading");
    setStatusMessage("Masa durumu güncelleniyor...");

    if (!window.yardimciDesktop) {
      setSyncState("error");
      setStatusMessage("Masa durumu güncellenemedi. Uygulamayı yeniden başlatın.");
      return;
    }

    const result = await window.yardimciDesktop.updateTableStatus({ tableId, status });
    if (!result.ok) {
      setSyncState("error");
      setStatusMessage(result.message);
      return;
    }

    setDashboardData(result.dashboardData);
    setSyncState("success");
    setStatusMessage(result.message);
  }

  async function handleSaveManualReservation(input: SaveManualReservationInput): Promise<DesktopStatusUpdateResult> {
    setSyncState("loading");
    setStatusMessage("Rezervasyon kaydediliyor...");

    if (!window.yardimciDesktop) {
      const result = { ok: false as const, message: "Rezervasyon kaydedilemedi. Uygulamayı yeniden başlatın." };
      setSyncState("error");
      setStatusMessage(result.message);
      return result;
    }

    const result = await window.yardimciDesktop.saveManualReservation(input);
    if (!result.ok) {
      setSyncState("error");
      setStatusMessage(result.message);
      return result;
    }

    setDashboardData(result.dashboardData);
    setSyncState("success");
    setStatusMessage(result.message);
    return result;
  }

  async function handleUpdateReservationStatus(reservationId: string, status: string) {
    setSyncState("loading");
    setStatusMessage("Rezervasyon durumu güncelleniyor...");

    if (!window.yardimciDesktop) {
      setSyncState("error");
      setStatusMessage("Rezervasyon durumu güncellenemedi. Uygulamayı yeniden başlatın.");
      return;
    }

    const result = await window.yardimciDesktop.updateReservationStatus({ reservationId, status });
    if (!result.ok) {
      setSyncState("error");
      setStatusMessage(result.message);
      return;
    }

    setDashboardData(result.dashboardData);
    setSyncState("success");
    setStatusMessage(result.message);
  }

  async function handleSaveDailyTask(input: SaveDailyTaskInput): Promise<DesktopStatusUpdateResult> {
    setSyncState("loading");
    setStatusMessage(input.id ? "Günlük iş güncelleniyor..." : "Günlük iş ekleniyor...");

    if (!window.yardimciDesktop) {
      const result = { ok: false as const, message: "Günlük iş kaydedilemedi. Uygulamayı yeniden başlatın." };
      setSyncState("error");
      setStatusMessage(result.message);
      return result;
    }

    const result = await window.yardimciDesktop.saveDailyTask(input);
    if (!result.ok) {
      setSyncState("error");
      setStatusMessage(result.message);
      return result;
    }

    setDashboardData(result.dashboardData);
    setSyncState("success");
    setStatusMessage(result.message);
    return result;
  }

  async function handleDeleteDailyTask(taskId: string): Promise<DesktopStatusUpdateResult> {
    setSyncState("loading");
    setStatusMessage("Günlük iş siliniyor...");

    if (!window.yardimciDesktop) {
      const result = { ok: false as const, message: "Günlük iş silinemedi. Uygulamayı yeniden başlatın." };
      setSyncState("error");
      setStatusMessage(result.message);
      return result;
    }

    const result = await window.yardimciDesktop.deleteDailyTask(taskId);
    if (!result.ok) {
      setSyncState("error");
      setStatusMessage(result.message);
      return result;
    }

    setDashboardData(result.dashboardData);
    setSyncState("success");
    setStatusMessage(result.message);
    return result;
  }

  async function handleUpdateDailyTaskStatus(taskId: string, status: string) {
    setSyncState("loading");
    setStatusMessage("Günlük iş durumu güncelleniyor...");

    if (!window.yardimciDesktop) {
      setSyncState("error");
      setStatusMessage("Günlük iş güncellenemedi. Uygulamayı yeniden başlatın.");
      return;
    }

    const result = await window.yardimciDesktop.updateDailyTaskStatus({ taskId, status });
    if (!result.ok) {
      setSyncState("error");
      setStatusMessage(result.message);
      return;
    }

    setDashboardData(result.dashboardData);
    setSyncState("success");
    setStatusMessage(result.message);
  }

  return {
    handleUpdateRoomStatus,
    handleUpdateTableStatus,
    handleSaveManualReservation,
    handleUpdateReservationStatus,
    handleSaveDailyTask,
    handleDeleteDailyTask,
    handleUpdateDailyTaskStatus
  };
}
