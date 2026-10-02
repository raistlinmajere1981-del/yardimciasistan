import { BUSINESS_CAPABILITIES as C } from "@yardimci-asistan/shared";
import type { BusinessCapabilitySnapshot } from "../../electron/business-capability-store";
import { runtimeHasCapability } from "./capabilities";

export interface DesktopWorkspaceFeatures {
  customers: boolean;
  requests: boolean;
  tasks: boolean;
  ai: boolean;
  whatsapp: boolean;
  android: boolean;
  calendar: boolean;
  finance: boolean;
  reports: boolean;
  qrMenu: boolean;
  inventory: boolean;
  customerMessaging: boolean;
  accommodation: {
    rooms: boolean;
    reservations: boolean;
    stays: boolean;
    folio: boolean;
    any: boolean;
  };
  food: {
    tables: boolean;
    reservations: boolean;
    orders: boolean;
    menu: boolean;
    any: boolean;
  };
}

export function projectDesktopWorkspaceFeatures(
  snapshot: BusinessCapabilitySnapshot | null | undefined
): DesktopWorkspaceFeatures {
  const customers = runtimeHasCapability(snapshot, C.CUSTOMERS);
  const whatsapp = runtimeHasCapability(snapshot, C.WHATSAPP);
  const rooms = runtimeHasCapability(snapshot, C.ACCOMMODATION_ROOMS);
  const accommodationReservations = runtimeHasCapability(snapshot, C.ACCOMMODATION_RESERVATIONS);
  const stays = runtimeHasCapability(snapshot, C.ACCOMMODATION_STAYS);
  const folio = runtimeHasCapability(snapshot, C.ACCOMMODATION_FOLIO);
  const tables = runtimeHasCapability(snapshot, C.FOOD_TABLES);
  const foodReservations = runtimeHasCapability(snapshot, C.FOOD_RESERVATIONS);
  const orders = runtimeHasCapability(snapshot, C.FOOD_ORDERS);
  const menu = runtimeHasCapability(snapshot, C.FOOD_MENU);

  return {
    customers,
    requests: runtimeHasCapability(snapshot, C.REQUESTS),
    tasks: runtimeHasCapability(snapshot, C.TASKS),
    ai: runtimeHasCapability(snapshot, C.AI),
    whatsapp,
    android: runtimeHasCapability(snapshot, C.ANDROID),
    calendar: runtimeHasCapability(snapshot, C.CALENDAR),
    finance: runtimeHasCapability(snapshot, C.FINANCE),
    reports: runtimeHasCapability(snapshot, C.REPORTS),
    qrMenu: runtimeHasCapability(snapshot, C.QR_MENU),
    inventory: runtimeHasCapability(snapshot, C.INVENTORY),
    customerMessaging: customers && whatsapp,
    accommodation: {
      rooms,
      reservations: accommodationReservations,
      stays,
      folio,
      any: rooms || accommodationReservations || stays || folio
    },
    food: {
      tables,
      reservations: foodReservations,
      orders,
      menu,
      any: tables || foodReservations || orders || menu
    }
  };
}
