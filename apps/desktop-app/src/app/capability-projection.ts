import {
  BUSINESS_CAPABILITIES,
  isOperationalTaskAvailable,
  isReservationTypeAvailable,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import type { DesktopDashboardData } from "../../electron/database";
import { reconcileDashboardSnapshot } from "./use-dashboard-snapshot";

const C = BUSINESS_CAPABILITIES;

/** Per-mounted-app memo of the derived view only; capabilities are applied on every input. */
export function createDesktopDashboardProjector() {
  let previous: DesktopDashboardData | undefined;
  return (source: DesktopDashboardData, capabilities: Iterable<BusinessCapability>) => {
    const next = projectDesktopDashboardData(source, capabilities);
    previous = previous ? reconcileDashboardSnapshot(previous, next) : next;
    return previous;
  };
}

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
  const tasksEnabled = enabled.has(C.TASKS);
  const reservationAttentionEnabled = accommodationReservationsEnabled || foodReservationsEnabled;
  const stockAttentionEnabled = enabled.has(C.FOOD_MENU) && enabled.has(C.INVENTORY);
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
  const preparedWhatsAppMessages = enabled.has(C.CUSTOMERS) && enabled.has(C.WHATSAPP)
    ? source.preparedWhatsAppMessages ?? []
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
      {
        ...(relatedReservation?.roomIds === undefined ? {} : { roomIds: relatedReservation.roomIds }),
        ...(relatedReservation?.tableIds === undefined ? {} : { tableIds: relatedReservation.tableIds })
      }
    );
  });
  const menu = enabled.has(C.FOOD_MENU)
    ? source.menu
    : { categories: [], items: [], updated_at: source.menu.updated_at };
  const paymentWaitingTableOrders = foodOrdersEnabled
    ? source.paymentWaitingTableOrders
    : [];
  const sourceAttention = source.attention ?? {
    pendingRequests: 0,
    pendingReservations: 0,
    paymentWaitingTables: 0,
    overdueTasks: 0,
    incompleteTasks: 0,
    outOfStockItems: 0,
    lowStockItems: 0,
    totalCount: 0,
    items: []
  };
  const attentionItems = sourceAttention.items.filter((item) => {
    if (item.kind === "pending_request") return requestsEnabled;
    if (item.kind === "pending_reservation") return reservationAttentionEnabled;
    if (item.kind === "payment_waiting") return foodOrdersEnabled;
    if (item.kind === "overdue_task" || item.kind === "open_task") return tasksEnabled;
    if (item.kind === "out_of_stock" || item.kind === "low_stock") return stockAttentionEnabled;
    return false;
  });
  const attention = {
    pendingRequests: requestsEnabled ? sourceAttention.pendingRequests : 0,
    pendingReservations: reservationAttentionEnabled ? sourceAttention.pendingReservations : 0,
    paymentWaitingTables: foodOrdersEnabled ? sourceAttention.paymentWaitingTables : 0,
    overdueTasks: tasksEnabled ? sourceAttention.overdueTasks : 0,
    incompleteTasks: tasksEnabled ? sourceAttention.incompleteTasks : 0,
    outOfStockItems: stockAttentionEnabled ? sourceAttention.outOfStockItems : 0,
    lowStockItems: stockAttentionEnabled ? sourceAttention.lowStockItems : 0,
    totalCount: 0,
    items: attentionItems
  };
  attention.totalCount = attention.pendingRequests
    + attention.pendingReservations
    + attention.paymentWaitingTables
    + attention.incompleteTasks
    + attention.outOfStockItems
    + attention.lowStockItems;

  return {
    ...source,
    rooms,
    tables,
    roomOperations: enabled.has(C.ACCOMMODATION_ROOMS) ? source.roomOperations?.map(item => ({
      ...item,
      stays: enabled.has(C.ACCOMMODATION_STAYS) ? item.stays : [],
      reservations: accommodationReservationsEnabled ? item.reservations : [],
      accounts: enabled.has(C.ACCOMMODATION_FOLIO) ? item.accounts : []
    })) ?? null : [],
    tableOperations: enabled.has(C.FOOD_TABLES) ? source.tableOperations?.map(item => ({
      ...item,
      order: foodOrdersEnabled ? item.order : null,
      reservations: foodReservationsEnabled ? item.reservations : []
    })) ?? null : [],
    requests,
    preparedWhatsAppMessages,
    reservations,
    dailyTasks,
    customers,
    customerRoomStays: stays,
    androidDevices: enabled.has(C.ANDROID) ? source.androidDevices : [],
    androidActionFailures: enabled.has(C.ANDROID) ? source.androidActionFailures : [],
    paymentWaitingTableOrders,
    menu,
    attention,
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
