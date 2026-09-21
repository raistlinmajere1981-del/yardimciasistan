import {
  BUSINESS_CAPABILITIES,
  isOperationalTaskAvailable,
  isReservationTypeAvailable,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import type { DesktopDashboardData } from "../../electron/database";

const C = BUSINESS_CAPABILITIES;

/** Capability-safe renderer projection; raw dashboard data never drives a hidden domain surface. */
export function projectDesktopDashboardData(
  source: DesktopDashboardData,
  capabilities: Iterable<BusinessCapability>
): DesktopDashboardData {
  const enabled = new Set(capabilities);
  const accommodationReservationsEnabled = enabled.has(C.ACCOMMODATION_RESERVATIONS);
  const foodReservationsEnabled = enabled.has(C.FOOD_RESERVATIONS);
  const foodOrdersEnabled = enabled.has(C.FOOD_ORDERS);
  const requestsEnabled = enabled.has(C.REQUESTS) && enabled.has(C.CUSTOMERS);
  const stays = enabled.has(C.ACCOMMODATION_STAYS) ? source.customerRoomStays : [];
  const activeStayRoomIds = new Set(
    stays
      .filter((stay) => ["planned", "checked_in"].includes(stay.status))
      .map((stay) => stay.roomId)
  );
  const rooms = enabled.has(C.ACCOMMODATION_ROOMS)
    ? source.rooms.map((room) => ({
        ...room,
        status: room.status === "reserved"
          && !accommodationReservationsEnabled
          && !activeStayRoomIds.has(room.id)
          ? "occupied"
          : room.status,
        activeReservationTitle: accommodationReservationsEnabled ? room.activeReservationTitle : ""
      }))
    : [];
  const tables = enabled.has(C.FOOD_TABLES)
    ? source.tables.map((table) => ({
        ...table,
        status: projectTableStatus(table.status, foodReservationsEnabled, foodOrdersEnabled),
        currentReservationId: foodReservationsEnabled ? table.currentReservationId : "",
        activeReservationTitle: foodReservationsEnabled ? table.activeReservationTitle : ""
      }))
    : [];
  const reservations = source.reservations.filter((reservation) =>
    isReservationTypeAvailable(enabled, reservation.reservationType, {
      roomIds: reservation.roomIds,
      tableIds: reservation.tableIds
    })
  );
  const requests = requestsEnabled
    ? source.requests.map((request) => ({
        ...request,
        ai_summary: enabled.has(C.AI) ? request.ai_summary : "",
        ai_suggested_reply: enabled.has(C.AI) ? request.ai_suggested_reply : "",
        whatsapp_message: enabled.has(C.WHATSAPP) ? request.whatsapp_message : ""
      }))
    : [];
  const customers = enabled.has(C.CUSTOMERS)
    ? source.customers.map((customer) => ({
        ...customer,
        reservationCount: reservations.filter((reservation) => reservation.customerId === customer.id).length,
        stayCount: stays.filter((stay) => stay.customerId === customer.id).length
      }))
    : [];
  const dailyTasks = source.dailyTasks.filter((task) => {
    const relatedReservation = task.relatedType === "reservation"
      ? source.reservations.find((reservation) => reservation.id === task.relatedId)
      : undefined;
    return isOperationalTaskAvailable(
      enabled,
      task.taskType,
      task.relatedType,
      relatedReservation?.reservationType ?? "",
      { roomIds: relatedReservation?.roomIds, tableIds: relatedReservation?.tableIds }
    );
  });
  const menu = enabled.has(C.FOOD_MENU)
    ? source.menu
    : { categories: [], items: [], updated_at: source.menu.updated_at };
  const paymentWaitingTableOrders = foodOrdersEnabled
    ? source.paymentWaitingTableOrders
    : [];

  return {
    ...source,
    rooms,
    tables,
    requests,
    reservations,
    dailyTasks,
    customers,
    customerRoomStays: stays,
    androidDevices: enabled.has(C.ANDROID) ? source.androidDevices : [],
    androidActionFailures: enabled.has(C.ANDROID) ? source.androidActionFailures : [],
    paymentWaitingTableOrders,
    menu,
    summary: {
      ...source.summary,
      newRequests: requestsEnabled ? source.summary.newRequests : 0,
      waitingRequests: requestsEnabled ? source.summary.waitingRequests : 0,
      pendingDailyTasks: dailyTasks.filter((task) => task.status === "pending").length,
      availableRooms: rooms.filter((room) => room.status === "available").length,
      totalRooms: rooms.length,
      availableTables: tables.filter((table) => table.status === "available").length,
      pendingReservations: reservations.filter((reservation) => reservation.status === "pending").length,
      preparedWhatsAppMessages: enabled.has(C.CUSTOMERS) && enabled.has(C.WHATSAPP)
        ? source.summary.preparedWhatsAppMessages
        : 0,
      activeMenuCategories: menu.categories.filter((category) => category.is_active).length,
      availableMenuItems: menu.items.filter((item) => item.is_available).length
    }
  };
}

function projectTableStatus(status: string, reservationsEnabled: boolean, ordersEnabled: boolean): string {
  if (!reservationsEnabled && status === "reserved") return "occupied";
  if (!ordersEnabled && ["bill_waiting", "waiting_bill", "checkout", "payment"].includes(status)) {
    return "occupied";
  }
  return status;
}
