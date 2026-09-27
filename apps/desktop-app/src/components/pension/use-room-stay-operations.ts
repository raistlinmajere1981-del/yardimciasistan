import { useRef, useState } from "react";
import type {
  AssignCustomerRoomInput,
  CreateStayFromReservationInput,
  DesktopCustomerMutationResult,
  DesktopDashboardData,
  DesktopStatusUpdateResult
} from "../../../electron/database";
import type { RoomFolioPaymentMethod } from "../../../electron/room-folio";
import { useRequestGeneration } from "../workspace/use-request-generation";
import type { RoomWorkspaceModel } from "./room-workspace-model";
import type { RoomFolioController } from "./use-room-folio-controller";

export function useRoomStayOperations(model: RoomWorkspaceModel, account: RoomFolioController, folioEnabled: boolean,
  onDashboard: (data: DesktopDashboardData) => void) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ panel: "stay" | "operations"; message: string; error: boolean } | null>(null);
  const running = useRef(false);
  const begin = useRequestGeneration();

  async function mutate(panel: "stay" | "operations", operation: () => Promise<DesktopStatusUpdateResult>, after?: (dashboard: DesktopDashboardData) => Promise<string | undefined>) {
    if (running.current || account.busy) return false;
    running.current = true;
    const current = begin();
    setBusy(true); setFeedback(null);
    try {
      const result = await operation();
      if (!current()) return false;
      if (!result.ok) { setFeedback({ panel, error: true, message: result.message }); return false; }
      onDashboard(result.dashboardData);
      const detail = await after?.(result.dashboardData);
      if (!current()) return false;
      setFeedback({ panel, error: false, message: detail || result.message });
      return true;
    } catch {
      if (current()) setFeedback({ panel, error: true, message: "İşlem sonucu doğrulanamadı. Yenilemeden yeniden göndermeyin." });
      return false;
    } finally { running.current = false; if (current()) setBusy(false); }
  }

  async function finishNewCheckIn(create: () => Promise<DesktopCustomerMutationResult>) {
    let stayId = "";
    return mutate("stay", async () => {
      const result = await create();
      if (result.ok) stayId = result.savedId;
      return result;
    }, async () => {
      if (!folioEnabled) return "Misafir girişi tamamlandı.";
      if (!stayId) return "Misafir girişi tamamlandı.";
      const financial = await account.mutate(() => window.yardimciDesktop!.openRoomFolio(stayId));
      return financial?.ok ? "Misafir girişi tamamlandı · Oda hesabı açıldı."
        : "Misafir girişi tamamlandı; hesap açılamadı. Misafir Hesabı panelinde Hesabı Aç ile yeniden deneyin.";
    });
  }

  async function checkInCustomer(input: Omit<AssignCustomerRoomInput, "status">) {
    return finishNewCheckIn(() => window.yardimciDesktop!.assignCustomerRoom({ ...input, status: "checked_in" }));
  }

  async function checkInReservation(input: CreateStayFromReservationInput) {
    return finishNewCheckIn(() => window.yardimciDesktop!.createStayFromReservation({ ...input, status: "checked_in" }));
  }

  async function checkIn(stayId: string) {
    if (!model.canCheckIn(stayId)) return false;
    return mutate("operations", () => window.yardimciDesktop!.checkInStay(stayId), async () => {
      if (!folioEnabled) return "Misafir girişi tamamlandı.";
      const financial = await account.mutate(() => window.yardimciDesktop!.openRoomFolio(stayId));
      return financial?.ok ? "Misafir girişi tamamlandı · Oda hesabı açıldı."
        : "Misafir girişi tamamlandı; hesap açılamadı. Misafir Hesabı panelinde Hesabı Aç ile yeniden deneyin.";
    });
  }

  async function checkout(stayId: string, paymentMethod: RoomFolioPaymentMethod = "cash") {
    if (!model.active.some(stay => stay.id === stayId && stay.status === "checked_in")) return false;
    const openAccount = folioEnabled ? model.operations?.accounts.find(item => item.stayId === stayId) : undefined;
    if (openAccount && openAccount.remainingMinor > 0) {
      const payment = await account.mutate(() => window.yardimciDesktop!.addRoomFolioPayment({
        folioId: openAccount.folioId,
        amountMinor: openAccount.remainingMinor,
        paymentMethod
      }));
      if (!payment?.ok) return false;
    }
    return mutate("operations", () => window.yardimciDesktop!.checkoutStay(stayId), async () =>
      folioEnabled && openAccount
        ? "Misafir çıkışı ve hesap kapanışı tamamlandı. Oda temizlik bekliyor."
        : "Misafir çıkışı tamamlandı. Oda temizlik bekliyor.");
  }

  return { busy, feedback, mutate, checkInCustomer, checkInReservation, checkIn, checkout };
}
export type RoomStayOperations = ReturnType<typeof useRoomStayOperations>;
