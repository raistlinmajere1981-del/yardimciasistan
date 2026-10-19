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
  finalizeCheckInMutation: (result: DesktopCustomerMutationResult) => Promise<DesktopCustomerMutationResult>;
  finalizeCheckoutMutation: (result: DesktopCustomerMutationResult) => Promise<DesktopCustomerMutationResult>;
  finalizeRoomChangeMutation: (result: DesktopCustomerMutationResult) => Promise<DesktopCustomerMutationResult>;
}) {
  const {
    getDatabase,
    assertCapability,
    finalizeRecordDeletion,
    finalizeCustomerMutation,
    finalizeCheckInMutation,
    finalizeCheckoutMutation,
    finalizeRoomChangeMutation
  } = options;

  function assertStayAccess() {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_STAYS, "Konaklama yönetimi bu işletmede etkin değil.");
  }
  ipcMain.handle("customer:addStayGuest", async (_event, input: StayGuestInput): Promise<DesktopCustomerMutationResult> => {
    assertStayAccess();
    return finalizeCheckInMutation(getDatabase().addStayGuest(input));
  });
  ipcMain.handle("customer:changeStayPrimary", (_event, input: StayGuestInput) => {
    assertStayAccess();
    return finalizeCustomerMutation(getDatabase().changeStayPrimary(input));
  });
  ipcMain.handle("customer:checkoutStayGuest", async (_event, input: CheckoutStayGuestInput): Promise<DesktopCustomerMutationResult> => {
    assertStayAccess();
    return finalizeCheckoutMutation(getDatabase().checkoutStayGuest(input));
  });
  ipcMain.handle("customer:moveStayRoom", async (_event, input: MoveStayRoomInput): Promise<DesktopCustomerMutationResult> => {
    assertStayAccess();
    return finalizeRoomChangeMutation(getDatabase().moveStayRoom(input));
  });

  ipcMain.handle("customer:delete", (_event, customerId: unknown): DesktopStatusUpdateResult => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil.");
    return finalizeRecordDeletion(getDatabase().deleteCustomer(String(customerId ?? "")));
  });

  ipcMain.handle("customer:list", (_event, query: import("../database/customer-store").CustomerListQuery = {}) => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS);
    if (query.filter === "dealers") assertCapability(BUSINESS_CAPABILITIES.WHOLESALE);
    if (["staying", "kbs_pending", "kbs_failed"].includes(query.filter ?? "")) assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_STAYS);
    if (query.filter === "reserved") {
      const enabled=getDatabase().getEnabledBusinessCapabilities();
      if(!enabled.includes(BUSINESS_CAPABILITIES.FOOD_RESERVATIONS)) assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_RESERVATIONS);
    }
    return getDatabase().listCustomers(query);
  });
  ipcMain.handle("customer:get", (_event, id: string) => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS);
    return getDatabase().getCustomer(String(id));
  });

  ipcMain.handle("customer:save", (_event, input: SaveCustomerInput): DesktopCustomerMutationResult => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil.");
    if (input.commercialProfile !== undefined) {
      assertCapability(BUSINESS_CAPABILITIES.WHOLESALE, "Bayi / Toptan Satış bu işletmede etkin değil.");
    }
    return finalizeCustomerMutation(getDatabase().saveCustomer(input));
  });

  ipcMain.handle("customer:assignRoom", async (_event, input: AssignCustomerRoomInput): Promise<DesktopCustomerMutationResult> => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_STAYS, "Konaklama ataması bu işletmede etkin değil.");
    const result = getDatabase().assignCustomerToRoom(input);
    return input.status === "checked_in"
      ? finalizeCheckInMutation(result)
      : finalizeCustomerMutation(result);
  });

  ipcMain.handle("customer:createStayFromReservation", async (_event, input: CreateStayFromReservationInput): Promise<DesktopCustomerMutationResult> => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_STAYS, "Konaklama ataması bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_RESERVATIONS, "Pansiyon rezervasyonları bu işletmede etkin değil.");
    const result = getDatabase().createStayFromReservation(input);
    return input.status === "checked_in"
      ? finalizeCheckInMutation(result)
      : finalizeCustomerMutation(result);
  });

  ipcMain.handle("customer:checkInStay", async (_event, stayId: string): Promise<DesktopCustomerMutationResult> => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_STAYS, "Konaklama yönetimi bu işletmede etkin değil.");
    return finalizeCheckInMutation(getDatabase().checkInStay(stayId));
  });

  ipcMain.handle("customer:checkoutStay", async (_event, stayId: string): Promise<DesktopCustomerMutationResult> => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_STAYS, "Konaklama yönetimi bu işletmede etkin değil.");
    return finalizeCheckoutMutation(getDatabase().checkoutStay(stayId));
  });

  ipcMain.handle("customer:checkoutStayWithSettlement", async (_event, input: import("../room-settlement-operation").CheckoutStayOperationInput) => {
    assertStayAccess();
    if (input?.settleCurrent || input?.previousFolioIds?.length) {
      assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_FOLIO, "Oda hesabı bu işletmede etkin değil.");
    }
    const result = getDatabase().checkoutStayWithSettlement(input);
    if (result.ok && result.dashboardData) {
      const finalized = await finalizeCheckoutMutation({ ok: true, message: result.message, savedId: result.savedId, dashboardData: result.dashboardData });
      if (finalized.ok) return { ...result, message: finalized.message, dashboardData: finalized.dashboardData };
    }
    return result;
  });

  ipcMain.handle("roomFolio:collectPayment", (_event, input: import("../room-folio").AddRoomFolioPaymentInput) => {
    options.assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_FOLIO, "Oda hesabı bu işletmede etkin değil.");
    const result = getDatabase().collectRoomFolioPayment(input);
    if (result.ok) finalizeCustomerMutation({ ok: true, message: result.message, savedId: input.folioId,
      dashboardData: getDatabase().getDashboardData() });
    return result;
  });

  ipcMain.handle(
    "customer:updateRoomStayStatus",
    async (_event, input: UpdateCustomerRoomStayStatusInput): Promise<DesktopCustomerMutationResult> => {
      options.assertUnlocked();
      assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil.");
      assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_STAYS, "Konaklama yönetimi bu işletmede etkin değil.");
      const result = getDatabase().updateCustomerRoomStayStatus(input);
      if (input.status === "checked_in") return finalizeCheckInMutation(result);
      if (input.status === "checked_out") return finalizeCheckoutMutation(result);
      return finalizeCustomerMutation(result);
    }
  );
}
