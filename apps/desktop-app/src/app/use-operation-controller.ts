import type { Dispatch, SetStateAction } from "react";
import type {
  DesktopDashboardData,
  DesktopStatusUpdateResult,
  SaveDailyTaskInput,
  SaveManualReservationInput,
  AssignReservationRoomInput,
  SaveManualRestaurantReservationInput
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
  async function handleUpdateTableStatus(tableId: string, status: string): Promise<DesktopStatusUpdateResult> {
    setSyncState("loading");
    setStatusMessage("Masa durumu güncelleniyor...");

    if (!window.yardimciDesktop) {
      setSyncState("error");
      setStatusMessage("Masa durumu güncellenemedi. Uygulamayı yeniden başlatın.");
      return { ok: false, message: "Masa durumu güncellenemedi. Uygulamayı yeniden başlatın." };
    }

    const result = await window.yardimciDesktop.updateTableStatus({ tableId, status });
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

  async function handleSaveManualReservation(input: SaveManualReservationInput): Promise<DesktopStatusUpdateResult> {
    setSyncState("loading");
    setStatusMessage(input.reservationId ? "Rezervasyon güncelleniyor..." : "Rezervasyon kaydediliyor...");

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

  async function handleAssignReservationRoom(input: AssignReservationRoomInput): Promise<DesktopStatusUpdateResult> {
    setSyncState("loading");
    setStatusMessage("Oda ataması kaydediliyor...");
    const result = window.yardimciDesktop
      ? await window.yardimciDesktop.assignReservationRoom(input)
      : { ok: false as const, message: "Oda ataması kaydedilemedi. Uygulamayı yeniden başlatın." };
    if (result.ok) setDashboardData(result.dashboardData);
    setSyncState(result.ok ? "success" : "error");
    setStatusMessage(result.message);
    return result;
  }

  async function handleSaveManualRestaurantReservation(input: SaveManualRestaurantReservationInput): Promise<DesktopStatusUpdateResult> {
    setSyncState("loading");
    setStatusMessage("Restoran rezervasyonu kaydediliyor...");

    if (!window.yardimciDesktop) {
      const result = { ok: false as const, message: "Restoran rezervasyonu kaydedilemedi. Uygulamayı yeniden başlatın." };
      setSyncState("error");
      setStatusMessage(result.message);
      return result;
    }

    const result = await window.yardimciDesktop.saveManualRestaurantReservation(input);
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
    handleUpdateTableStatus,
    handleSaveManualReservation,
    handleAssignReservationRoom,
    handleSaveManualRestaurantReservation,
    handleUpdateReservationStatus,
    handleSaveDailyTask,
    handleDeleteDailyTask,
    handleUpdateDailyTaskStatus
  };
}
