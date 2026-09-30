import { useRef, useState } from "react";
import { reportAppStatus } from "../../app/runtime-state";
import type {
  AssignCustomerRoomInput,
  CreateStayFromReservationInput,
  SaveCustomerInput,
  DesktopCustomerMutationResult,
  DesktopDashboardData,
  DesktopStatusUpdateResult
} from "../../../electron/database";
import { useRequestGeneration } from "../workspace/use-request-generation";
import type { RoomWorkspaceModel } from "./room-workspace-model";
import type { RoomFolioController } from "./use-room-folio-controller";

export function useRoomStayOperations(model: RoomWorkspaceModel, account: RoomFolioController,
  onDashboard: (data: DesktopDashboardData) => void) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const begin = useRequestGeneration();

  async function mutate(panel: "stay" | "operations", operation: () => Promise<DesktopStatusUpdateResult>, after?: (dashboard: DesktopDashboardData) => Promise<string | undefined>) {
    if (running.current || account.busy) return false;
    running.current = true;
    const current = begin();
    setBusy(true);
    try {
      const result = await operation();
      if (!current()) return false;
      if (!result.ok) {
        reportAppStatus("error", result.message);
        return false;
      }
      onDashboard(result.dashboardData);
      const detail = await after?.(result.dashboardData);
      if (!current()) return false;
      reportAppStatus("success", detail || result.message);
      return true;
    } catch {
      if (current()) reportAppStatus("error", "İşlem sonucu doğrulanamadı. Yenilemeden yeniden göndermeyin.");
      return false;
    } finally { running.current = false; if (current()) setBusy(false); }
  }

  async function checkInCustomer(input: Omit<AssignCustomerRoomInput, "status">) {
    return mutate("stay", () => window.yardimciDesktop!.assignCustomerRoom({ ...input, status: "checked_in" }));
  }

  async function checkInReservation(input: CreateStayFromReservationInput) {
    return mutate("stay", () => window.yardimciDesktop!.createStayFromReservation({ ...input, status: "checked_in" }));
  }

  async function checkIn(stayId: string) {
    if (!model.canCheckIn(stayId)) return false;
    return mutate("operations", () => window.yardimciDesktop!.checkInStay(stayId));
  }

  async function checkout(stayId: string) {
    if (!model.active.some(stay => stay.id === stayId && stay.status === "checked_in")) return false;
    return mutate("operations", () => window.yardimciDesktop!.checkoutStay(stayId));
  }

  async function saveCustomer(input: SaveCustomerInput): Promise<DesktopCustomerMutationResult> {
    let saved: DesktopCustomerMutationResult = { ok: false, message: "Müşteri kaydedilemedi." };
    const ok = await mutate("stay", async () => {
      saved = await window.yardimciDesktop!.saveCustomer(input);
      return saved;
    });
    return ok ? saved : { ok: false, message: "Müşteri kaydı tamamlanamadı; bilgileri kontrol edin." };
  }

  return { busy, mutate, checkInCustomer, checkInReservation, checkIn, checkout, saveCustomer };
}
export type RoomStayOperations = ReturnType<typeof useRoomStayOperations>;
