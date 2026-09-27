import { ipcMain } from "electron";
import { BUSINESS_CAPABILITIES, type BusinessCapability } from "@yardimci-asistan/shared";
import type {
  AssignTableCustomerInput,
  DesktopDatabase,
  DesktopStatusUpdateResult,
  UpdateRoomStatusInput,
  UpdateTableStatusInput
} from "../database";

export function registerRoomTableIpcHandlers(options: {
  getDatabase: () => DesktopDatabase;
  assertUnlocked: () => void;
  assertCapability: (capability: BusinessCapability, message?: string) => void;
}) {
  const { getDatabase, assertCapability, assertUnlocked } = options;

  ipcMain.handle("room:updateStatus", (_event, input: UpdateRoomStatusInput): DesktopStatusUpdateResult => {
    assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS, "Oda yönetimi bu işletmede etkin değil.");
    if (String(input?.status ?? "").trim() === "reserved") {
      assertCapability(BUSINESS_CAPABILITIES.ACCOMMODATION_RESERVATIONS, "Odayı rezerve etmek için konaklama rezervasyonları etkin olmalı.");
    }
    return getDatabase().updateRoomStatus(input);
  });

  ipcMain.handle("table:assignCustomer", (_event, input: AssignTableCustomerInput): DesktopStatusUpdateResult => {
    assertUnlocked();
    assertCapability(BUSINESS_CAPABILITIES.FOOD_TABLES, "Masa yönetimi bu işletmede etkin değil.");
    assertCapability(BUSINESS_CAPABILITIES.CUSTOMERS, "Müşteri yönetimi bu işletmede etkin değil.");
    return getDatabase().assignTableCustomer(input);
  });

  ipcMain.handle("table:updateStatus", (_event, input: UpdateTableStatusInput): DesktopStatusUpdateResult => {
    assertCapability(BUSINESS_CAPABILITIES.FOOD_TABLES, "Masa yönetimi bu işletmede etkin değil.");
    const requestedStatus = String(input?.status ?? "").trim();
    if (requestedStatus === "reserved") {
      assertCapability(BUSINESS_CAPABILITIES.FOOD_RESERVATIONS, "Masayı rezerve etmek için restoran rezervasyonları etkin olmalı.");
    }
    if (["bill_waiting", "waiting_bill", "checkout", "payment"].includes(requestedStatus)) {
      assertCapability(BUSINESS_CAPABILITIES.FOOD_ORDERS, "Hesap durumu için sipariş yönetimi etkin olmalı.");
    }
    return getDatabase().updateTableStatus(input);
  });
}
