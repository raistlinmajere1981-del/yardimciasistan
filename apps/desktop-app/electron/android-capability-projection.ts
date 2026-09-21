import {
  BUSINESS_CAPABILITIES,
  getReservationDomain,
  isReservationTypeAvailable,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import {
  androidEffectivePermissions,
  androidTaskAllowedByCapabilities,
  type AndroidMarketSnapshot,
  type AndroidOperationsSnapshot,
  type AndroidReportSnapshot,
  type PublishedQrMenu
} from "@yardimci-asistan/sync-core";
import { emptyAndroidMarketSnapshot } from "./market-android-snapshot.js";

const C = BUSINESS_CAPABILITIES;

export function projectAndroidOperationsSnapshot(
  source: AndroidOperationsSnapshot,
  capabilities: Iterable<BusinessCapability>,
  today: string
): AndroidOperationsSnapshot {
  const enabled = new Set(capabilities);
  const androidEnabled = enabled.has(C.ANDROID);
  const has = (capability: BusinessCapability) => androidEnabled && enabled.has(capability);
  const requestsEnabled = has(C.REQUESTS) && has(C.CUSTOMERS);
  const stays = has(C.ACCOMMODATION_STAYS) ? source.customer_room_stays : [];
  const activeStayRoomIds = new Set(
    stays
      .filter((stay) => ["planned", "checked_in"].includes(stay.status))
      .map((stay) => stay.room_id)
  );
  const rooms = has(C.ACCOMMODATION_ROOMS)
    ? source.rooms.map((room) => ({
        ...room,
        status: room.status === "reserved"
          && !has(C.ACCOMMODATION_RESERVATIONS)
          && !activeStayRoomIds.has(room.id)
          ? "occupied"
          : room.status,
        active_reservation_title: has(C.ACCOMMODATION_RESERVATIONS)
          ? room.active_reservation_title
          : ""
      }))
    : [];
  const folios = has(C.ACCOMMODATION_FOLIO) ? source.room_folios : [];
  const tables = has(C.FOOD_TABLES)
    ? source.tables.map((table) => ({
        ...table,
        status: projectTableStatus(
          table.status,
          has(C.FOOD_RESERVATIONS),
          has(C.FOOD_ORDERS)
        ),
        active_reservation_title: has(C.FOOD_RESERVATIONS)
          ? table.active_reservation_title
          : ""
      }))
    : [];
  const orders = has(C.FOOD_ORDERS) ? source.table_orders : [];
  const reservations = androidEnabled
    ? source.reservations.filter((reservation) => isReservationTypeAvailable(
        enabled,
        reservation.reservation_type,
        { roomIds: reservation.room_ids, tableIds: reservation.table_ids }
      ))
    : [];
  const reservationTypes = new Map(
    source.reservations.map((reservation) => [reservation.id, reservationDomainTypeHint(reservation)])
  );
  const tasks = androidEnabled
    ? source.daily_tasks
      .map((task) => ({
        ...task,
        related_reservation_type: task.related_type === "reservation"
          ? reservationTypes.get(task.related_id) ?? task.related_reservation_type ?? ""
          : ""
      }))
      .filter((task) => androidTaskAllowedByCapabilities(
        enabled,
        task.task_type,
        task.related_type,
        task.related_reservation_type
      ))
    : [];
  const customers = has(C.CUSTOMERS)
    ? source.customers.map((customer) => ({
        ...customer,
        reservation_count: reservations.filter((reservation) => reservation.customer_id === customer.id).length,
        stay_count: stays.filter((stay) => stay.customer_id === customer.id).length
      }))
    : [];
  const requests = requestsEnabled
    ? source.requests.map((request) => ({
        ...request,
        ai_summary: has(C.AI) ? request.ai_summary : "",
        ai_suggested_reply: has(C.AI) ? request.ai_suggested_reply : "",
        whatsapp_message: has(C.WHATSAPP) ? request.whatsapp_message : ""
      }))
    : [];
  const stockEnabled = has(C.INVENTORY);
  const qrMenuEnabled = has(C.QR_MENU);
  const menu = has(C.FOOD_MENU)
    ? projectMenu(source.menu, stockEnabled, qrMenuEnabled)
    : emptyMenu(source.menu.updated_at);
  const adminMenu = has(C.FOOD_MENU)
    ? projectMenu(source.admin_menu, stockEnabled, qrMenuEnabled)
    : emptyMenu(source.admin_menu.updated_at);
  const messages = has(C.CUSTOMERS) && has(C.WHATSAPP) ? source.messages : [];
  const trackedStockItems = has(C.FOOD_MENU) && has(C.INVENTORY) ? source.trackedStockItems : [];
  const appliedStockImageHashes = has(C.FOOD_MENU) && has(C.INVENTORY) && has(C.AI)
    ? source.appliedStockImageHashes
    : [];
  const activeMenuCategories = menu.categories.filter((category) => category.is_active).length;
  const availableMenuItems = menu.items.filter((item) => item.is_available).length;
  const market = projectAndroidMarketSnapshot(
    source.market ?? emptyAndroidMarketSnapshot(),
    enabled,
    androidEnabled
  );

  return {
    ...source,
    // The hosted module also uses this publication to gate desktop/public AI
    // endpoints. Keep the persisted capability set while Android is disabled;
    // all Android data and credentials below are still projected to tombstones.
    business_capabilities: [...enabled],
    summary: {
      pending_daily_tasks: tasks.filter((task) => task.status === "pending").length,
      today_tasks: tasks.filter((task) => task.due_date === today && task.status !== "archived").length,
      available_rooms: rooms.filter((room) => room.status === "available").length,
      total_rooms: rooms.length,
      available_tables: tables.filter((table) => table.status === "available").length,
      occupied_tables: tables.filter((table) => table.status === "occupied").length,
      bill_waiting_tables: tables.filter((table) => table.status === "bill_waiting").length,
      active_table_orders: orders.length,
      pending_reservations: reservations.filter((reservation) => reservation.status === "pending").length,
      prepared_whatsapp_messages: messages.length,
      waiting_responses: requestsEnabled
        ? requests.filter((request) => ["new", "seen", "waiting_owner"].includes(request.status)).length
        : 0,
      active_menu_categories: activeMenuCategories,
      available_menu_items: availableMenuItems,
      customer_count: customers.length
    },
    daily_tasks: tasks,
    requests,
    customers,
    customer_room_stays: stays,
    room_folios: folios,
    reservations,
    rooms,
    tables,
    menu,
    admin_menu: adminMenu,
    deleted_request_ids: requestsEnabled ? source.deleted_request_ids : [],
    trackedStockItems,
    appliedStockImageHashes,
    table_orders: orders,
    messages,
    androidPermissions: androidEnabled
      ? Object.fromEntries(Object.entries(source.androidPermissions).map(([deviceId, profile]) => [
          deviceId,
          {
            ...profile,
            permissions: androidEffectivePermissions(profile.permissions, enabled)
          }
        ]))
      : {},
    finance: has(C.FINANCE)
      ? {
          ...source.finance,
          outstanding_pension_minor: has(C.ACCOMMODATION_FOLIO)
            ? source.finance.outstanding_pension_minor
            : 0
        }
      : emptyFinance(source.finance.generated_at, source.finance.currency),
    reports: Object.fromEntries(Object.entries(source.reports).map(([key, report]) => [
      key,
      projectReport(report, enabled, androidEnabled, reservations, tasks, today)
    ])) as AndroidOperationsSnapshot["reports"],
    market
  };
}

/** @compiledSmoke Used via dist-electron by scripts/smoke-market-android-foundation.mjs. */
export function projectAndroidMarketSnapshot(
  source: AndroidMarketSnapshot,
  enabled: ReadonlySet<BusinessCapability>,
  androidEnabled = enabled.has(C.ANDROID)
): AndroidMarketSnapshot {
  const retailWorkspaceEnabled = [
    C.RETAIL_BARCODE,
    C.RETAIL_PURCHASING,
    C.RETAIL_SUPPLIERS,
    C.RETAIL_LABELS
  ].some((capability) => enabled.has(capability));
  if (!androidEnabled || !retailWorkspaceEnabled) {
    return emptyAndroidMarketSnapshot(source.summary.currency || "TRY");
  }

  const catalogEnabled = enabled.has(C.CATALOG);
  const inventoryEnabled = enabled.has(C.INVENTORY);
  const salesEnabled = enabled.has(C.SALES);
  const barcodeEnabled = enabled.has(C.RETAIL_BARCODE);
  const suppliersEnabled = enabled.has(C.RETAIL_SUPPLIERS);
  const purchasingEnabled = enabled.has(C.RETAIL_PURCHASING);
  const productData = catalogEnabled
    ? (source.product_data ?? emptyAndroidMarketSnapshot().product_data)
    : emptyAndroidMarketSnapshot().product_data;
  const recentPurchases = purchasingEnabled
    ? source.recent_purchases.map((purchase) => ({
        ...purchase,
        supplier_id: suppliersEnabled ? purchase.supplier_id : "",
        supplier_name: suppliersEnabled ? purchase.supplier_name : ""
      }))
    : [];

  return {
    product_data: productData,
    summary: {
      today_sale_count: salesEnabled ? source.summary.today_sale_count : 0,
      today_sales_total: salesEnabled ? source.summary.today_sales_total : 0,
      currency: salesEnabled ? source.summary.currency : "TRY",
      critical_stock_count: inventoryEnabled ? source.summary.critical_stock_count : 0,
      recent_stock_adjustments: inventoryEnabled ? source.summary.recent_stock_adjustments : [],
      recent_receiving_count: recentPurchases.length
    },
    products: catalogEnabled
      ? source.products.map((product) => ({
          ...product,
          barcode: barcodeEnabled ? product.barcode : "",
          track_inventory: inventoryEnabled && product.track_inventory,
          current_quantity: inventoryEnabled ? product.current_quantity : 0,
          minimum_quantity: inventoryEnabled ? product.minimum_quantity : 0,
          inventory_updated_at: inventoryEnabled ? product.inventory_updated_at : ""
        }))
      : [],
    suppliers: suppliersEnabled ? source.suppliers : [],
    recent_purchases: recentPurchases,
    cart_drafts: catalogEnabled && salesEnabled ? source.cart_drafts : []
  };
}

function reservationDomainTypeHint(
  reservation: AndroidOperationsSnapshot["reservations"][number]
): string {
  const domain = getReservationDomain(reservation.reservation_type, {
    roomIds: reservation.room_ids,
    tableIds: reservation.table_ids
  });
  if (domain === "accommodation") return "room";
  if (domain === "food_service") return "table";
  if (domain === "mixed") return "mixed";
  return reservation.reservation_type;
}

function projectTableStatus(status: string, reservationsEnabled: boolean, ordersEnabled: boolean): string {
  if (!reservationsEnabled && status === "reserved") return "occupied";
  if (!ordersEnabled && ["bill_waiting", "waiting_bill", "checkout", "payment"].includes(status)) {
    return "occupied";
  }
  return status;
}

function emptyMenu(updatedAt: string): PublishedQrMenu {
  return { categories: [], items: [], updated_at: updatedAt };
}

function projectMenu(menu: PublishedQrMenu, stockEnabled: boolean, qrMenuEnabled: boolean): PublishedQrMenu {
  return {
    ...menu,
    items: menu.items.map((item) => ({
      ...item,
      stock_quantity: stockEnabled ? item.stock_quantity : null,
      stock_min_quantity: stockEnabled ? item.stock_min_quantity : null,
      stock_unit: stockEnabled ? item.stock_unit : "piece",
      stock_consumption_quantity: stockEnabled ? item.stock_consumption_quantity : 1,
      hide_when_out_of_stock: stockEnabled && qrMenuEnabled ? item.hide_when_out_of_stock : false,
      stock_note: stockEnabled ? item.stock_note : null
    }))
  };
}

function emptyFinance(generatedAt: string, currency: string): AndroidOperationsSnapshot["finance"] {
  return {
    generated_at: generatedAt,
    currency,
    today_income_minor: 0,
    today_expense_minor: 0,
    today_net_minor: 0,
    outstanding_pension_minor: 0,
    recent_entries: []
  };
}

function projectReport(
  report: AndroidReportSnapshot,
  enabled: ReadonlySet<BusinessCapability>,
  androidEnabled: boolean,
  reservations: AndroidOperationsSnapshot["reservations"],
  tasks: AndroidOperationsSnapshot["daily_tasks"],
  today: string
): AndroidReportSnapshot {
  if (!androidEnabled || !enabled.has(C.REPORTS)) {
    return {
      ...report,
      summary: {
        restaurant_revenue: 0,
        closed_orders: 0,
        average_order: 0,
        approved_reservations: 0,
        approved_accommodation_reservations: 0,
        approved_food_reservations: 0,
        approved_mixed_reservations: 0,
        approved_generic_reservations: 0,
        new_requests: 0,
        attention_count: 0
      },
      restaurant: { sold_item_count: 0, cancelled_orders: 0, top_items: [], daily_revenue: [] },
      attention: {
        pending_requests: 0,
        pending_reservations: 0,
        payment_waiting_tables: 0,
        overdue_tasks: 0,
        incomplete_tasks: 0,
        out_of_stock_items: 0,
        low_stock_items: 0,
        items: []
      }
    };
  }

  const ordersEnabled = enabled.has(C.FOOD_ORDERS);
  const customersEnabled = enabled.has(C.CUSTOMERS);
  const requestsEnabled = customersEnabled && enabled.has(C.REQUESTS);
  const stockEnabled = enabled.has(C.FOOD_MENU) && enabled.has(C.INVENTORY);
  const accommodationReservationsEnabled = enabled.has(C.ACCOMMODATION_RESERVATIONS);
  const foodReservationsEnabled = enabled.has(C.FOOD_RESERVATIONS);
  const accommodationApproved = nonNegativeCount(report.summary.approved_accommodation_reservations);
  const foodApproved = nonNegativeCount(report.summary.approved_food_reservations);
  const mixedApproved = nonNegativeCount(report.summary.approved_mixed_reservations);
  const genericApproved = nonNegativeCount(report.summary.approved_generic_reservations);
  const approvedReservations = accommodationReservationsEnabled && foodReservationsEnabled
    ? nonNegativeCount(report.summary.approved_reservations)
    : accommodationReservationsEnabled
      ? accommodationApproved + genericApproved
      : foodReservationsEnabled
        ? foodApproved + genericApproved
        : 0;
  const pendingReservations = reservations.filter((reservation) => reservation.status === "pending").length;
  const incompleteTasks = tasks.filter((task) => !["done", "cancelled", "archived"].includes(task.status)).length;
  const overdueTasks = tasks.filter((task) =>
    !["done", "cancelled", "archived"].includes(task.status)
    && Boolean(task.due_date)
    && task.due_date < today
  ).length;
  const attentionItems = report.attention.items.filter((item) => {
    if (item.kind === "pending_request") return requestsEnabled;
    if (item.kind === "pending_reservation") return false;
    if (item.kind === "overdue_task" || item.kind === "open_task") return false;
    if (item.kind === "payment_waiting") return ordersEnabled;
    if (item.kind === "out_of_stock" || item.kind === "low_stock") return stockEnabled;
    return true;
  });
  if (pendingReservations > 0) {
    attentionItems.push({
      kind: "pending_reservation",
      title: `${pendingReservations} rezervasyon onay bekliyor`,
      detail: "Etkin rezervasyon alanlarındaki kayıtları kontrol edin."
    });
  }
  if (overdueTasks > 0) {
    attentionItems.push({
      kind: "overdue_task",
      title: `${overdueTasks} günlük iş gecikti`,
      detail: "Etkin operasyon alanlarındaki geciken işleri kontrol edin."
    });
  }
  const remainingOpenTasks = Math.max(0, incompleteTasks - overdueTasks);
  if (remainingOpenTasks > 0) {
    attentionItems.push({
      kind: "open_task",
      title: `${remainingOpenTasks} günlük iş tamamlanmadı`,
      detail: "Etkin operasyon alanlarındaki açık işleri kontrol edin."
    });
  }
  const pendingRequests = requestsEnabled ? report.attention.pending_requests : 0;
  const paymentWaitingTables = ordersEnabled ? report.attention.payment_waiting_tables : 0;
  const outOfStockItems = stockEnabled ? report.attention.out_of_stock_items : 0;
  const lowStockItems = stockEnabled ? report.attention.low_stock_items : 0;

  return {
    ...report,
    summary: {
      ...report.summary,
      restaurant_revenue: ordersEnabled ? report.summary.restaurant_revenue : 0,
      closed_orders: ordersEnabled ? report.summary.closed_orders : 0,
      average_order: ordersEnabled ? report.summary.average_order : 0,
      approved_reservations: approvedReservations,
      approved_accommodation_reservations: accommodationReservationsEnabled ? accommodationApproved : 0,
      approved_food_reservations: foodReservationsEnabled ? foodApproved : 0,
      approved_mixed_reservations: accommodationReservationsEnabled && foodReservationsEnabled ? mixedApproved : 0,
      approved_generic_reservations: accommodationReservationsEnabled || foodReservationsEnabled ? genericApproved : 0,
      new_requests: requestsEnabled ? report.summary.new_requests : 0,
      attention_count: pendingRequests + pendingReservations + paymentWaitingTables
        + incompleteTasks + outOfStockItems + lowStockItems
    },
    restaurant: ordersEnabled
      ? report.restaurant
      : { sold_item_count: 0, cancelled_orders: 0, top_items: [], daily_revenue: [] },
    attention: {
      ...report.attention,
      pending_requests: pendingRequests,
      pending_reservations: pendingReservations,
      payment_waiting_tables: paymentWaitingTables,
      overdue_tasks: overdueTasks,
      incomplete_tasks: incompleteTasks,
      out_of_stock_items: outOfStockItems,
      low_stock_items: lowStockItems,
      items: attentionItems
    }
  };
}

function nonNegativeCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}
