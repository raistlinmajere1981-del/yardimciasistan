import { ipcMain } from "electron";
import { BUSINESS_CAPABILITIES, type BusinessCapability } from "@yardimci-asistan/shared";
import type {
  AssignCustomerRoomInput,
  StayGuestInput,
  CheckoutStayGuestInput,
  MoveStayRoomInput,
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

  function assertStayAccess() {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_STAYS, "Konaklama yönetimi bu işletmede etkin değil.");
  }
  ipcMain.handle("customer:addStayGuest", (_event, input: StayGuestInput) => {
    assertStayAccess();
    return finalizeCustomerMutation(getDatabase().addStayGuest(input));
  });
  ipcMain.handle("customer:changeStayPrimary", (_event, input: StayGuestInput) => {
    assertStayAccess();
    return finalizeCustomerMutation(getDatabase().changeStayPrimary(input));
  });
  ipcMain.handle("customer:checkoutStayGuest", (_event, input: CheckoutStayGuestInput) => {
    assertStayAccess();
    return finalizeCustomerMutation(getDatabase().checkoutStayGuest(input));
  });
  ipcMain.handle("customer:moveStayRoom", (_event, input: MoveStayRoomInput) => {
    assertStayAccess();
    return finalizeCustomerMutation(getDatabase().moveStayRoom(input));
  });

  ipcMain.handle("customer:delete", (_event, customerId: unknown): DesktopStatusUpdateResult => {
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil.");
    return finalizeRecordDeletion(getDatabase().deleteCustomer(String(customerId ?? "")));
  });

  ipcMain.handle("customer:save", (_event, input: SaveCustomerInput): DesktopCustomerMutationResult => {
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil.");
    return finalizeCustomerMutation(getDatabase().saveCustomer(input));
  });

  ipcMain.handle("customer:assignRoom", (_event, input: AssignCustomerRoomInput): DesktopCustomerMutationResult => {
    options.assertUnlocked();
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
