import { ipcMain } from "electron";
import { BUSINESS_CAPABILITIES, type BusinessCapability } from "@yardimci-asistan/shared";
import type {
  AssignCustomerRoomInput,
  CreateStayFromReservationInput,
  DesktopCustomerMutationResult,
  DesktopDatabase,
  DesktopStatusUpdateResult,
  SaveCustomerInput,
  UpdateCustomerRoomStayStatusInput
} from "../database";

export function registerCustomerIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertUnlocked: () => void;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
  finalizeRecordDeletion: (result: DesktopStatusUpdateResult) => DesktopStatusUpdateResult;
  finalizeCustomerMutation: (result: DesktopCustomerMutationResult) => DesktopCustomerMutationResult;
}) {
  const { getDatabase, assertCapability, finalizeRecordDeletion, finalizeCustomerMutation } = options;

  ipcMain.handle("customer:delete", (_event, customerId: unknown): DesktopStatusUpdateResult => {
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil.");
    return finalizeRecordDeletion(getDatabase().deleteCustomer(String(customerId ?? "")));
  });

  ipcMain.handle("customer:save", (_event, input: SaveCustomerInput): DesktopCustomerMutationResult => {
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil.");
    return finalizeCustomerMutation(getDatabase().saveCustomer(input));
  });

  ipcMain.handle("customer:assignRoom", (_event, input: AssignCustomerRoomInput): DesktopCustomerMutationResult => {
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_STAYS, "Konaklama ataması bu işletmede etkin değil.");
    return finalizeCustomerMutation(getDatabase().assignCustomerToRoom(input));
  });

  ipcMain.handle("customer:createStayFromReservation", (_event, input: CreateStayFromReservationInput): DesktopCustomerMutationResult => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_STAYS, "Konaklama ataması bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_RESERVATIONS, "Pansiyon rezervasyonları bu işletmede etkin değil.");
    return finalizeCustomerMutation(getDatabase().createStayFromReservation(input));
  });

  ipcMain.handle("customer:checkInStay", (_event, stayId: string): DesktopCustomerMutationResult => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_STAYS, "Konaklama yönetimi bu işletmede etkin değil.");
    return finalizeCustomerMutation(getDatabase().checkInStay(stayId));
  });

  ipcMain.handle("customer:checkoutStay", (_event, stayId: string): DesktopCustomerMutationResult => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_STAYS, "Konaklama yönetimi bu işletmede etkin değil.");
    return finalizeCustomerMutation(getDatabase().checkoutStay(stayId));
  });

  ipcMain.handle(
    "customer:updateRoomStayStatus",
    (_event, input: UpdateCustomerRoomStayStatusInput): DesktopCustomerMutationResult => {
      assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil.");
      assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_STAYS, "Konaklama yönetimi bu işletmede etkin değil.");
      return finalizeCustomerMutation(getDatabase().updateCustomerRoomStayStatus(input));
    }
  );
}
