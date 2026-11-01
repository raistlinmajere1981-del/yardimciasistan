import { createAndroidCompanionSnapshot } from "./android-companion-snapshot";
import { supportsSttModel, isSupportedSttBaseUrl } from "@yardimci-asistan/shared";
import type { AndroidOperationsSnapshot } from "@yardimci-asistan/sync-core";
import { projectAndroidOperationsSnapshot } from "./android-capability-projection";
import { createAndroidMarketSnapshotSource } from "./market-android-snapshot.js";
import {
  DesktopDatabase,
  type DesktopDashboardData
} from "./database";
import { DesktopFinanceService } from "./finance";
import {
  DesktopRoomFolioService,
  type DesktopRoomFolio
} from "./room-folio";

export function createAndroidOperationsSnapshot(
  database: DesktopDatabase,
  dashboardData: DesktopDashboardData
): AndroidOperationsSnapshot {
  const updatedAt = new Date().toISOString();
  const setup = database.getSetupData();
  // Dashboard customer lists are not tenant-scoped. Android recipients must
  // only see customers belonging to the currently active business.
  const firstCustomers = database.listCustomers({ limit: 200, offset: 0 }).items;
  const scopedCustomers = firstCustomers.length < 200
    ? firstCustomers
    : [...firstCustomers, ...database.listCustomers({ limit: 100, offset: 200 }).items];
  const today = formatLocalDateKey(new Date());
  const activeTableOrders = database
    .listTableOrders()
    .filter((order) =>
      ["open", "preparing", "served", "payment"].includes(order.status)
    );
  const activeMenuCategories = dashboardData.menu.categories.filter(
    (category) => category.is_active
  );
  const activeMenuCategoryIds = new Set(
    activeMenuCategories.map((category) => category.id)
  );
  const androidMenu = {
    categories: activeMenuCategories,
    items: dashboardData.menu.items.filter(
      (item) =>
        item.is_available && item.product_is_active !== false && activeMenuCategoryIds.has(item.category_id)
    ),
    updated_at: dashboardData.menu.updated_at
  };
  const financeData = new DesktopFinanceService(database.databasePath).getData(20);
  const roomFolioData = new DesktopRoomFolioService(database.databasePath).getData();
  const messages = database.getPreparedWhatsAppMessages().map((message) => ({
    id: message.id,
    request_id: message.requestId,
    customer_name: message.customerName,
    customer_phone: message.customerPhone,
    message: message.message,
    status: message.status,
    updated_at: message.updatedAt
  }));

  const source: AndroidOperationsSnapshot = {
    kbs: database.getAndroidKbsSnapshot(),
    ...createAndroidCompanionSnapshot(database.databasePath, database.getEnabledBusinessCapabilities()),
    business_capabilities: [],
    voice: { stt_available: setup.aiEnabled && setup.aiApiKeyConfigured
      && supportsSttModel(setup.aiService, setup.aiSttModel ?? "")
      && isSupportedSttBaseUrl(setup.aiService, setup.aiBaseUrl) },
    local_network_enabled: setup.localNetworkEnabled !== false,
    summary: {
      pending_daily_tasks: dashboardData.summary.pendingDailyTasks,
      today_tasks: dashboardData.dailyTasks.filter(
        (task) => task.dueDate === today && task.status !== "archived"
      ).length,
      available_rooms: dashboardData.summary.availableRooms,
      total_rooms: dashboardData.summary.totalRooms,
      available_tables: dashboardData.summary.availableTables,
      occupied_tables: dashboardData.tables.filter(
        (table) => table.status === "occupied"
      ).length,
      bill_waiting_tables: dashboardData.tables.filter(
        (table) => table.status === "bill_waiting"
      ).length,
      active_table_orders: activeTableOrders.length,
      pending_reservations: dashboardData.summary.pendingReservations,
      prepared_whatsapp_messages: messages.length,
      waiting_responses: dashboardData.requests.filter((request) =>
        ["new", "seen", "waiting_owner"].includes(request.status)
      ).length,
      active_menu_categories: dashboardData.summary.activeMenuCategories,
      available_menu_items: dashboardData.summary.availableMenuItems,
      customer_count: scopedCustomers.length
    },
    daily_tasks: dashboardData.dailyTasks
      .filter((task) => task.status !== "archived")
      .slice(0, 200)
      .map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        task_type: task.taskType,
        status: task.status,
        due_date: task.dueDate,
        due_time: task.dueTime,
        related_type: task.relatedType,
        related_id: task.relatedId,
        related_reservation_type:
          task.relatedType === "reservation"
            ? dashboardData.reservations.find(
                (reservation) => reservation.id === task.relatedId
              )?.reservationType ?? ""
            : "",
        updated_at: task.updatedAt
      })),
    requests: dashboardData.requests.slice(0, 300).map((request) => ({
      id: request.id,
      customer_id: request.customer_id,
      request_type: request.request_type,
      status: request.status,
      customer_name: request.customer_name,
      customer_phone: request.customer_phone,
      date_text: request.date_text,
      start_date: request.start_date,
      end_date: request.end_date,
      time: request.time,
      guest_count: request.guest_count,
      message: request.message,
      ai_summary: request.ai_summary,
      ai_suggested_reply: request.ai_suggested_reply,
      whatsapp_message: request.whatsapp_message,
      priority: request.priority,
      created_at: request.created_at,
      updated_at: request.updated_at
    })),
    customers: scopedCustomers.map((customer) => ({
      id: customer.id,
      full_name: customer.fullName,
      phone: customer.phone,
      email: customer.email,
      notes: customer.notes,
      identity_type: customer.identityType,
      identity_number: "",
      nationality: customer.nationality,
      birth_date: customer.birthDate,
      gender: customer.gender,
      document_serial_number: "",
      document_expiry_date: customer.documentExpiryDate,
      birth_place: customer.birthPlace,
      mother_name: customer.motherName,
      father_name: customer.fatherName,
      issuing_authority: customer.issuingAuthority,
      address: customer.address,
      request_count: customer.requestCount,
      reservation_count: customer.reservationCount,
      stay_count: customer.stayCount,
      updated_at: customer.updatedAt
    })),
    customer_room_stays: dashboardData.customerRoomStays
      .slice(0, 500)
      .map((stay) => ({
        id: stay.id,
        customer_id: stay.customerId,
        customer_name: stay.customerName,
        customer_phone: stay.customerPhone,
        room_id: stay.roomId,
        room_name: stay.roomName,
        room_number: stay.roomNumber,
        reservation_id: stay.reservationId,
        status: stay.status,
        check_in_date: stay.checkInDate,
        check_out_date: stay.checkOutDate,
        guest_count: stay.guestCount,
        notes: stay.notes,
        source: stay.source,
        checked_in_at: stay.checkedInAt,
        checked_out_at: stay.checkedOutAt,
        created_at: stay.createdAt,
        updated_at: stay.updatedAt
      })),
    room_folios: roomFolioData.folios
      .filter(
        (folio): folio is DesktopRoomFolio & { status: "open" } =>
          folio.status === "open"
      )
      .slice(0, 100)
      .map((folio) => ({
        id: folio.id,
        version: folio.version,
        can_add_items: folio.canAddItems,
        stay_id: folio.stayId,
        room_id: folio.roomId,
        room_name: folio.roomName,
        room_number: folio.roomNumber,
        customer_id: folio.customerId,
        customer_name: folio.customerName,
        status: folio.status,
        guest_count: folio.guestCount,
        check_in_date: folio.checkInDate,
        planned_check_out_date: folio.plannedCheckOutDate,
        nights: folio.nights,
        nightly_price_minor: folio.nightlyPriceMinor,
        currency: folio.currency,
        lodging_total_minor: folio.lodgingTotalMinor,
        extras_total_minor: folio.extrasTotalMinor,
        charge_total_minor: folio.chargeTotalMinor,
        paid_total_minor: folio.paidTotalMinor,
        remaining_minor: folio.remainingMinor,
        opened_at: folio.openedAt
      })),
    reservations: dashboardData.reservations.slice(0, 300).map((reservation) => ({
      id: reservation.id,
      request_id: reservation.requestId,
      customer_id: reservation.customerId,
      customer_name: reservation.customerName,
      customer_phone: reservation.customerPhone,
      reservation_type: reservation.reservationType,
      status: reservation.status,
      title: reservation.title,
      start_date: reservation.startDate,
      end_date: reservation.endDate,
      time: reservation.time,
      guest_count: reservation.guestCount,
      room_ids: reservation.roomIds,
      table_ids: reservation.tableIds,
      notes: reservation.notes,
      payment_status: reservation.paymentStatus,
      updated_at: reservation.updatedAt
    })),
    rooms: dashboardData.rooms
      .filter((room) => room.isActive)
      .map((room) => ({
        id: room.id,
        name: room.name,
        number: room.number,
        capacity: room.capacity,
        status: room.status,
        active_reservation_title: room.activeReservationTitle,
        updated_at: room.updatedAt
      })),
    tables: dashboardData.tables
      .filter((table) => table.isActive)
      .map((table) => ({
        id: table.id,
        name: table.name,
        area: table.area,
        capacity: table.capacity,
        status: table.status,
        active_reservation_title: table.activeReservationTitle,
        updated_at: table.updatedAt
      })),
    menu: androidMenu,
    admin_menu: dashboardData.menu,
    menu_product_candidates: database.getMenuProductCandidates(),
    deleted_request_ids: database.getDeletedRequestIds(),
    trackedStockItems: database.getTrackedStockProducts(),
    appliedStockImageHashes: database.getAppliedStockImageHashes(100),
    table_orders: activeTableOrders.map((order) => ({
      id: order.id,
      table_id: order.tableId,
      table_name: order.tableName,
      status: order.status,
      opened_at: order.openedAt,
      total: order.total,
      item_count: order.itemCount,
      items: order.items.map((item) => ({
        id: item.id,
        order_id: item.orderId,
        product_id: item.productId,
        menu_entry_id: item.menuEntryId,
        product_name: item.productName,
        unit_price: item.unitPrice,
        currency: item.currency,
        quantity: item.quantity,
        line_total: item.lineTotal,
        status: item.status,
        updated_at: item.updatedAt
      })),
      updated_at: order.updatedAt
    })),
    messages: messages.slice(0, 300),
    androidPermissions: database.getAndroidPermissionSnapshot(),
    finance: {
      generated_at: financeData.generatedAt,
      currency: "TRY",
      today_income_minor: financeData.todayIncomeMinor,
      today_expense_minor: financeData.todayExpenseMinor,
      today_net_minor: financeData.todayNetMinor,
      outstanding_pension_minor: financeData.outstandingPensionMinor,
      recent_entries: financeData.recentEntries.slice(0, 20).map((entry) => ({
        id: entry.id,
        direction: entry.direction,
        amount_minor: entry.amountMinor,
        currency: entry.currency,
        payment_method: entry.paymentMethod,
        category: entry.category,
        description: entry.description,
        occurred_at: entry.occurredAt,
        source_type: entry.sourceType,
        source_id: entry.sourceId,
        note: entry.note,
        created_at: entry.createdAt
      }))
    },
    reports: database.getAndroidReportPresets(today),
    market: createAndroidMarketSnapshotSource(database.databasePath, today),
    updated_at: updatedAt
  };

  return projectAndroidOperationsSnapshot(
    source,
    database.getEnabledBusinessCapabilities(),
    today
  );
}

function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
