import { ipcMain } from "electron";
import { BUSINESS_CAPABILITIES, type BusinessCapability } from "@yardimci-asistan/shared";
import type {
  DesktopDatabase,
  DesktopStatusUpdateResult,
  SaveManualReservationInput,
  SaveManualRestaurantReservationInput,
  UpdateReservationStatusInput
} from "../database";

export function registerReservationIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
  assertReservationType: (
    reservationType: string,
    roomIds?: readonly unknown[],
    tableIds?: readonly unknown[]
  ) => void;
  finalizeOperationMutation: (result: DesktopStatusUpdateResult) => DesktopStatusUpdateResult;
}) {
  const { getDatabase, assertCapability, assertReservationType, finalizeOperationMutation } = options;

  ipcMain.handle("reservation:saveManual", (_event, input: SaveManualReservationInput): DesktopStatusUpdateResult => {
    assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_RESERVATIONS, "Pansiyon rezervasyonları bu işletmede etkin değil.");
    return finalizeOperationMutation(getDatabase().saveManualReservation(input));
  });

  ipcMain.handle("reservation:saveManualRestaurant", (_event, input: SaveManualRestaurantReservationInput): DesktopStatusUpdateResult => {
    assertCapability(BUSINESS_CAPABILITIES.FOOD_RESERVATIONS, "Restoran rezervasyonları bu işletmede etkin değil.");
    return finalizeOperationMutation(getDatabase().saveManualRestaurantReservation(input));
  });

  ipcMain.handle("reservation:updateStatus", (_event, input: UpdateReservationStatusInput): DesktopStatusUpdateResult => {
    const reservation = getDatabase().getDashboardData().reservations.find((item) => item.id === String(input?.reservationId ?? ""));
    assertReservationType(
      reservation?.reservationType ?? "",
      reservation?.roomIds,
      reservation?.tableIds
    );
    return getDatabase().updateReservationStatus(input);
  });
}
