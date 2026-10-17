package com.yardimciasistan.android;

import java.util.Locale;
import java.util.ArrayList;
import java.util.List;

final class AndroidUiRules {
  static final String CAPABILITY_WHATSAPP = "service.whatsapp";
  static final String CAPABILITY_AI = "service.ai";
  static final String CAPABILITY_ANDROID = "service.android";
  static final String CAPABILITY_CUSTOMERS = "core.customers";
  static final String CAPABILITY_REQUESTS = "customer.requests";
  static final String CAPABILITY_TASKS = "core.tasks";
  static final String CAPABILITY_NOTIFICATIONS = "core.notifications";
  static final String CAPABILITY_FINANCE = "core.finance";
  static final String CAPABILITY_REPORTS = "core.reports";
  static final String CAPABILITY_ROOMS = "accommodation.rooms";
  static final String CAPABILITY_ACCOMMODATION_RESERVATIONS = "accommodation.reservations";
  static final String CAPABILITY_STAYS = "accommodation.stays";
  static final String CAPABILITY_FOLIO = "accommodation.folio";
  static final String CAPABILITY_TABLES = "food_service.tables";
  static final String CAPABILITY_FOOD_RESERVATIONS = "food_service.reservations";
  static final String CAPABILITY_ORDERS = "food_service.orders";
  static final String CAPABILITY_MENU = "food_service.menu";
  static final String CAPABILITY_INVENTORY = "commerce.inventory";

  static final String TAB_TODAY = "today";
  static final String TAB_CUSTOMERS = "customers";
  static final String TAB_PENSION = "pension";
  static final String TAB_RESTAURANT = "restaurant";
  static final String TAB_MARKET = "market";
  static final String TAB_MESSAGES = "messages";
  static final String TAB_CASH = "cash";
  static final String TAB_REPORTS = "reports";
  static final String TAB_MORE = "more";

  static final String TODAY_COMMERCE = "commerce";
  static final String TODAY_SHIPMENTS = "shipments";
  static final String TODAY_MARKETING = "marketing";

  static final String CUSTOMER_NEW = "new";
  static final String CUSTOMER_LIST = "customers";
  static final String CUSTOMER_WAITING = "waiting";

  static final String PENSION_RESERVATIONS = "reservations";
  static final String PENSION_ROOMS = "rooms";
  static final String PENSION_STAYS = "stays";
  static final String PENSION_FOLIOS = "folios";
  static final String PENSION_KBS = "kbs";
  static final String PENSION_TASKS = "tasks";

  static final String RESTAURANT_TABLES = "tables";
  static final String RESTAURANT_RESERVATIONS = "reservations";
  static final String RESTAURANT_ORDERS = "orders";
  static final String RESTAURANT_TASKS = "tasks";
  static final String RESTAURANT_STOCK = "stock";
  static final String RESTAURANT_MENU = "menu";

  static final String MESSAGES_PREPARED = "prepared";
  static final String MESSAGES_WAITING = "waiting";

  static final String REPORT_TODAY = "today";
  static final String REPORT_YESTERDAY = "yesterday";
  static final String REPORT_LAST_7 = "last7";
  static final String REPORT_LAST_30 = "last30";

  private AndroidUiRules() {}

  static boolean canOpenTab(OperationData data, String tab) {
    if (TAB_TODAY.equals(tab)) {
      return true;
    }
    if (TAB_MORE.equals(tab)) return !moreNavigation(data).isEmpty();
    if (TAB_CUSTOMERS.equals(tab)) {
      return data != null && (
          data.hasPermission("customer.view")
          || canManageCustomers(data)
      );
    }
    if (TAB_MESSAGES.equals(tab)) {
      return canUseWhatsApp(data) && data.hasPermission("customer.view");
    }
    if (TAB_PENSION.equals(tab)) {
      return firstPensionMode(data) != null;
    }
    if (TAB_RESTAURANT.equals(tab)) {
      return firstRestaurantMode(data) != null;
    }
    if (TAB_MARKET.equals(tab)) {
      return MarketUiRules.canOpenMarket(data);
    }
    if (TAB_CASH.equals(tab)) {
      return data != null && data.hasPermission("finance.view");
    }
    if (TAB_REPORTS.equals(tab)) {
      return data != null && data.isAdmin() && data.hasBusinessCapability(CAPABILITY_REPORTS);
    }
    return false;
  }

  /** Profile presets never grant access: the first permitted business workspace owns slot three. */
  static List<NavigationItem> rootNavigation(OperationData data) {
    List<NavigationItem> items = new ArrayList<>();
    items.add(new NavigationItem(TAB_TODAY, "Bugün", "Öncelikli işler"));
    if (canOpenTab(data, TAB_CUSTOMERS)) items.add(new NavigationItem(TAB_CUSTOMERS, "Müşteri", "Müşteriler ve talepler"));
    String business = primaryBusinessTab(data);
    if (!business.isEmpty()) items.add(tabNavigationItem(business));
    if (!moreNavigation(data).isEmpty()) items.add(new NavigationItem(TAB_MORE, "Diğer", "Diğer çalışma alanları"));
    return items;
  }

  static String primaryBusinessTab(OperationData data) {
    for (String tab : new String[]{TAB_PENSION, TAB_RESTAURANT, TAB_MARKET}) {
      if (canOpenTab(data, tab)) return tab;
    }
    return "";
  }

  static List<NavigationItem> moreNavigation(OperationData data) {
    List<NavigationItem> items = new ArrayList<>();
    String primary = primaryBusinessTab(data);
    for (String tab : new String[]{TAB_PENSION, TAB_RESTAURANT, TAB_MARKET, TAB_MESSAGES, TAB_CASH, TAB_REPORTS}) {
      if (!tab.equals(primary) && canOpenTab(data, tab)) items.add(tabNavigationItem(tab));
    }
    for (String mode : new String[]{TODAY_COMMERCE, TODAY_SHIPMENTS, TODAY_MARKETING}) {
      if (CompanionUiRules.canOpen(data, mode)) {
        String detail = TODAY_COMMERCE.equals(mode) ? "Sipariş listesi ve mevcut kararlar"
            : TODAY_SHIPMENTS.equals(mode) ? "Teslimat ve gönderi durumu" : "Yayın ve kampanya durumu";
        items.add(new NavigationItem(TAB_TODAY + ":" + mode, CompanionUiRules.title(mode), detail));
      }
    }
    return items;
  }

  private static NavigationItem tabNavigationItem(String tab) {
    if (TAB_PENSION.equals(tab)) return new NavigationItem(tab, "Pansiyon", "Odalar ve konaklama işlemleri");
    if (TAB_RESTAURANT.equals(tab)) return new NavigationItem(tab, "Restoran", "Masalar ve adisyonlar");
    if (TAB_MARKET.equals(tab)) return new NavigationItem(tab, "Satış", "Satış, stok ve cari işlemler");
    if (TAB_MESSAGES.equals(tab)) return new NavigationItem(tab, "Mesajlar", "Hazır mesajlar ve yanıtlar");
    if (TAB_CASH.equals(tab)) return new NavigationItem(tab, "Kasa", "Gelir, gider ve kasa hareketleri");
    return new NavigationItem(tab, "Raporlar", "İşletme raporları");
  }

  static boolean canOpenRoute(OperationData data, String route) {
    if ("settings".equals(route)) return data != null && (!data.permissionsResolved || data.deviceActive);
    Destination target = resolveDestination(route);
    if (!canOpenTab(data, target.tab)) return false;
    if (TAB_TODAY.equals(target.tab) && !target.mode.isEmpty()) return CompanionUiRules.canOpen(data, target.mode);
    if (route != null && route.contains(":")) {
      if (TAB_PENSION.equals(target.tab)) return canOpenPensionMode(data, target.mode);
      if (TAB_RESTAURANT.equals(target.tab)) return canOpenRestaurantMode(data, target.mode);
    }
    return true;
  }

  static final class NavigationItem {
    final String route;
    final String label;
    final String description;
    NavigationItem(String route, String label, String description) {
      this.route = route; this.label = label; this.description = description;
    }
  }

  static boolean canOpenPensionMode(OperationData data, String mode) {
    if (data == null) {
      return false;
    }
    if (PENSION_KBS.equals(mode)) return KbsUiRules.canView(data);
    if (PENSION_RESERVATIONS.equals(mode)) {
      return data.hasBusinessCapability(CAPABILITY_ACCOMMODATION_RESERVATIONS)
          && data.hasPermission("reservation.view");
    }
    if (PENSION_ROOMS.equals(mode)) {
      return data.hasBusinessCapability(CAPABILITY_ROOMS) && data.hasPermission("room.view");
    }
    if (PENSION_STAYS.equals(mode)) {
      return data.hasBusinessCapability(CAPABILITY_STAYS)
          && data.isAdmin()
          && data.hasPermission("customer.manage")
          && data.hasPermission("room.assign_customer");
    }
    if (PENSION_FOLIOS.equals(mode)) {
      return data.hasBusinessCapability(CAPABILITY_FOLIO) && data.hasPermission("room_folio.view");
    }
    if (PENSION_TASKS.equals(mode)) {
      return data.hasBusinessCapability(CAPABILITY_TASKS)
          && data.hasBusinessCapability(CAPABILITY_ROOMS)
          && data.hasPermission("daily_task.view");
    }
    return false;
  }

  static String firstPensionMode(OperationData data) {
    if (canOpenPensionMode(data, PENSION_RESERVATIONS)) {
      return PENSION_RESERVATIONS;
    }
    if (canOpenPensionMode(data, PENSION_ROOMS)) {
      return PENSION_ROOMS;
    }
    if (canOpenPensionMode(data, PENSION_STAYS)) {
      return PENSION_STAYS;
    }
    if (canOpenPensionMode(data, PENSION_FOLIOS)) {
      return PENSION_FOLIOS;
    }
    if (canOpenPensionMode(data, PENSION_KBS)) return PENSION_KBS;
    if (canOpenPensionMode(data, PENSION_TASKS)) {
      return PENSION_TASKS;
    }
    return null;
  }

  static String visiblePensionMode(OperationData data, String requested) {
    return canOpenPensionMode(data, requested) ? requested : firstPensionMode(data);
  }

  static boolean canOpenRestaurantMode(OperationData data, String mode) {
    if (data == null) {
      return false;
    }
    if (RESTAURANT_TABLES.equals(mode)) {
      return data.hasBusinessCapability(CAPABILITY_TABLES) && data.hasPermission("table.view");
    }
    if (RESTAURANT_RESERVATIONS.equals(mode)) {
      return data.hasBusinessCapability(CAPABILITY_FOOD_RESERVATIONS)
          && data.hasPermission("reservation.view")
          && (data.hasPermission("reservation.create") || hasRestaurantReservationContext(data));
    }
    if (RESTAURANT_ORDERS.equals(mode)) {
      return data.hasBusinessCapability(CAPABILITY_ORDERS) && data.hasPermission("table_order.view");
    }
    if (RESTAURANT_TASKS.equals(mode)) {
      return data.hasBusinessCapability(CAPABILITY_TASKS)
          && data.hasBusinessCapability(CAPABILITY_TABLES)
          && data.hasPermission("daily_task.view");
    }
    if (RESTAURANT_STOCK.equals(mode)) {
      return data.hasBusinessCapability(CAPABILITY_MENU)
          && data.hasBusinessCapability(CAPABILITY_INVENTORY)
          && data.hasPermission("menu.stock_view");
    }
    if (RESTAURANT_MENU.equals(mode)) {
      return data.hasBusinessCapability(CAPABILITY_MENU) && canDelete(data, "menu.delete");
    }
    return false;
  }

  static boolean hasRestaurantReservationContext(OperationData data) {
    if (data == null) {
      return false;
    }
    for (OperationData.ReservationRecord reservation : data.reservations) {
      if (isRestaurantReservation(data, reservation)) {
        return true;
      }
    }
    return false;
  }

  static boolean isRestaurantReservation(OperationData.ReservationRecord reservation) {
    String domain = reservationDomain(reservation);
    return "food_service".equals(domain) || "mixed".equals(domain);
  }

  static boolean isRestaurantReservation(OperationData data, OperationData.ReservationRecord reservation) {
    if (isRestaurantReservation(reservation)) {
      return true;
    }
    return data != null
        && reservation != null
        && reservation.roomIds.isEmpty()
        && reservation.tableIds.isEmpty()
        && !data.hasBusinessCapability(CAPABILITY_ACCOMMODATION_RESERVATIONS)
        && data.hasBusinessCapability(CAPABILITY_FOOD_RESERVATIONS);
  }

  static boolean isRestaurantOnlyReservation(OperationData.ReservationRecord reservation) {
    return "food_service".equals(reservationDomain(reservation));
  }

  static boolean isPensionReservation(OperationData data, OperationData.ReservationRecord reservation) {
    if (reservation == null) {
      return false;
    }
    String domain = reservationDomain(reservation);
    if ("accommodation".equals(domain) || "mixed".equals(domain)) {
      return true;
    }
    return data != null
        && "generic".equals(domain)
        && data.hasBusinessCapability(CAPABILITY_ACCOMMODATION_RESERVATIONS);
  }

  static String reservationDomain(OperationData.ReservationRecord reservation) {
    if (reservation == null) {
      return "generic";
    }
    boolean hasRooms = "room".equals(reservation.type)
        || "room_and_table".equals(reservation.type)
        || "mixed".equals(reservation.type)
        || !reservation.roomIds.isEmpty();
    boolean hasTables = "table".equals(reservation.type)
        || "breakfast".equals(reservation.type)
        || "room_and_table".equals(reservation.type)
        || "mixed".equals(reservation.type)
        || !reservation.tableIds.isEmpty();
    if (hasRooms && hasTables) return "mixed";
    if (hasRooms) return "accommodation";
    if (hasTables) return "food_service";
    return "generic";
  }

  static boolean isManualTask(OperationData.TaskRecord task) {
    return task != null && ("manual_pension".equals(task.type) || "manual_restaurant".equals(task.type));
  }

  static boolean isRestaurantTask(OperationData.TaskRecord task) {
    return "food_service".equals(taskDomain(null, task));
  }

  static boolean isRestaurantTask(OperationData data, OperationData.TaskRecord task) {
    String domain = taskDomain(data, task);
    return "food_service".equals(domain) || "mixed".equals(domain);
  }

  static boolean isPensionTask(OperationData.TaskRecord task) {
    return "accommodation".equals(taskDomain(null, task));
  }

  static boolean isPensionTask(OperationData data, OperationData.TaskRecord task) {
    String domain = taskDomain(data, task);
    return "accommodation".equals(domain) || "mixed".equals(domain);
  }

  static String taskDomain(OperationData data, OperationData.TaskRecord task) {
    if (task == null) {
      return "core";
    }
    if ("reservation".equals(task.relatedType) && data != null) {
      OperationData.ReservationRecord reservation = data.reservationById(task.relatedId);
      String reservationType = reservation == null ? task.relatedReservationType : reservation.type;
      boolean hasRooms = "room".equals(reservationType)
          || "room_and_table".equals(reservationType)
          || "mixed".equals(reservationType)
          || (reservation != null && !reservation.roomIds.isEmpty());
      boolean hasTables = "table".equals(reservationType)
          || "breakfast".equals(reservationType)
          || "room_and_table".equals(reservationType)
          || "mixed".equals(reservationType)
          || (reservation != null && !reservation.tableIds.isEmpty());
      if (hasRooms && hasTables) return "mixed";
      if (hasTables) return "food_service";
      if (hasRooms) return "accommodation";
    }
    if ("manual_restaurant".equals(task.type)
        || "table_reservation".equals(task.type)
        || "breakfast".equals(task.type)
        || "service".equals(task.type)
        || "table_service".equals(task.type)
        || "restaurant".equals(task.type)
        || "table_check".equals(task.type)
        || "payment".equals(task.type)
        || "table".equals(task.relatedType)) {
      return "food_service";
    }
    if ("check_in".equals(task.type)
        || "check_out".equals(task.type)
        || "room_cleaning".equals(task.type)
        || "room_maintenance".equals(task.type)
        || "reservation".equals(task.type)
        || "manual_pension".equals(task.type)
        || "room".equals(task.relatedType)) {
      return "accommodation";
    }
    return "core";
  }

  static boolean canUseWhatsApp(OperationData data) {
    return data != null && data.hasBusinessCapability(CAPABILITY_WHATSAPP);
  }

  static boolean canUseAi(OperationData data) {
    return data != null && data.hasBusinessCapability(CAPABILITY_AI);
  }

  static boolean canCreateRoomReservation(OperationData data) {
    return data != null
        && data.hasBusinessCapability(CAPABILITY_ACCOMMODATION_RESERVATIONS)
        && data.hasPermission("reservation.create");
  }

  static boolean canCreateTableReservation(OperationData data) {
    return data != null
        && data.hasBusinessCapability(CAPABILITY_FOOD_RESERVATIONS)
        && data.hasPermission("reservation.create");
  }

  static boolean canConvertRequest(OperationData data, OperationData.RequestRecord request) {
    if (data == null || request == null || !data.hasPermission("customer.convert_to_reservation")) {
      return false;
    }
    return requestTypeCanConvert(data, request.type);
  }

  static boolean requestTypeCanConvert(OperationData data, String requestType) {
    if (data == null || requestType == null) {
      return false;
    }
    if ("pension_reservation".equals(requestType)) {
      return data.hasBusinessCapability(CAPABILITY_ACCOMMODATION_RESERVATIONS);
    }
    if ("restaurant_reservation".equals(requestType) || "breakfast_request".equals(requestType)) {
      return data.hasBusinessCapability(CAPABILITY_FOOD_RESERVATIONS);
    }
    return false;
  }

  static boolean reservationTypeAllowed(OperationData data, String reservationType) {
    if (data == null || reservationType == null) {
      return false;
    }
    if ("room".equals(reservationType)) {
      return data.hasBusinessCapability(CAPABILITY_ACCOMMODATION_RESERVATIONS);
    }
    if ("table".equals(reservationType) || "breakfast".equals(reservationType)) {
      return data.hasBusinessCapability(CAPABILITY_FOOD_RESERVATIONS);
    }
    if ("room_and_table".equals(reservationType) || "mixed".equals(reservationType)) {
      return data.hasBusinessCapability(CAPABILITY_ACCOMMODATION_RESERVATIONS)
          && data.hasBusinessCapability(CAPABILITY_FOOD_RESERVATIONS);
    }
    return data.hasBusinessCapability(CAPABILITY_ACCOMMODATION_RESERVATIONS)
        || data.hasBusinessCapability(CAPABILITY_FOOD_RESERVATIONS);
  }

  static boolean reservationAllowed(OperationData data, OperationData.ReservationRecord reservation) {
    if (data == null || reservation == null) {
      return false;
    }
    switch (reservationDomain(reservation)) {
      case "accommodation":
        return data.hasBusinessCapability(CAPABILITY_ACCOMMODATION_RESERVATIONS);
      case "food_service":
        return data.hasBusinessCapability(CAPABILITY_FOOD_RESERVATIONS);
      case "mixed":
        return data.hasBusinessCapability(CAPABILITY_ACCOMMODATION_RESERVATIONS)
            && data.hasBusinessCapability(CAPABILITY_FOOD_RESERVATIONS);
      default:
        return data.hasBusinessCapability(CAPABILITY_ACCOMMODATION_RESERVATIONS)
            || data.hasBusinessCapability(CAPABILITY_FOOD_RESERVATIONS);
    }
  }

  static boolean taskTypeAllowed(OperationData data, String taskType, String relatedType) {
    return taskTypeAllowed(data, taskType, relatedType, "");
  }

  static boolean taskTypeAllowed(
      OperationData data,
      String taskType,
      String relatedType,
      String relatedReservationType
  ) {
    if (data == null || !data.hasBusinessCapability(CAPABILITY_TASKS)) {
      return false;
    }
    if ("reservation".equals(relatedType) && !relatedReservationType.isEmpty()) {
      if ("room_and_table".equals(relatedReservationType) || "mixed".equals(relatedReservationType)) {
        return data.hasBusinessCapability(CAPABILITY_ROOMS)
            && data.hasBusinessCapability(CAPABILITY_TABLES);
      }
      if ("table".equals(relatedReservationType) || "breakfast".equals(relatedReservationType)) {
        return data.hasBusinessCapability(CAPABILITY_TABLES);
      }
      if ("room".equals(relatedReservationType)) {
        return data.hasBusinessCapability(CAPABILITY_ROOMS);
      }
    }
    if ("manual_restaurant".equals(taskType)
        || "table_reservation".equals(taskType)
        || "breakfast".equals(taskType)
        || "service".equals(taskType)
        || "table_service".equals(taskType)
        || "restaurant".equals(taskType)
        || "table_check".equals(taskType)
        || "payment".equals(taskType)
        || "table".equals(relatedType)) {
      return data.hasBusinessCapability(CAPABILITY_TABLES);
    }
    if ("check_in".equals(taskType)
        || "check_out".equals(taskType)
        || "room_cleaning".equals(taskType)
        || "room_maintenance".equals(taskType)
        || "reservation".equals(taskType)
        || "manual_pension".equals(taskType)
        || "room".equals(relatedType)) {
      return data.hasBusinessCapability(CAPABILITY_ROOMS);
    }
    return true;
  }

  static boolean taskAllowed(OperationData data, OperationData.TaskRecord task) {
    if (data == null || task == null) {
      return false;
    }
    if (!data.hasBusinessCapability(CAPABILITY_TASKS)) {
      return false;
    }
    String domain = taskDomain(data, task);
    if ("mixed".equals(domain)) {
      return data.hasBusinessCapability(CAPABILITY_ROOMS)
          && data.hasBusinessCapability(CAPABILITY_TABLES);
    }
    if ("food_service".equals(domain)) {
      return data.hasBusinessCapability(CAPABILITY_TABLES);
    }
    if ("accommodation".equals(domain)) {
      return data.hasBusinessCapability(CAPABILITY_ROOMS);
    }
    return true;
  }

  static boolean canDelete(OperationData data, String permission) {
    return data != null && data.isAdmin() && data.hasPermission(permission);
  }

  static boolean canManageCustomers(OperationData data) {
    return data != null && data.isAdmin() && data.hasPermission("customer.manage");
  }

  static boolean isReportPreset(String preset) {
    return REPORT_TODAY.equals(preset)
        || REPORT_YESTERDAY.equals(preset)
        || REPORT_LAST_7.equals(preset)
        || REPORT_LAST_30.equals(preset);
  }

  static String normalizeReportPreset(String preset) {
    return isReportPreset(preset) ? preset : REPORT_LAST_7;
  }

  static String firstRestaurantMode(OperationData data) {
    if (canOpenRestaurantMode(data, RESTAURANT_TABLES)) {
      return RESTAURANT_TABLES;
    }
    if (canOpenRestaurantMode(data, RESTAURANT_RESERVATIONS)) {
      return RESTAURANT_RESERVATIONS;
    }
    if (canOpenRestaurantMode(data, RESTAURANT_ORDERS)) {
      return RESTAURANT_ORDERS;
    }
    if (canOpenRestaurantMode(data, RESTAURANT_TASKS)) {
      return RESTAURANT_TASKS;
    }
    if (canOpenRestaurantMode(data, RESTAURANT_STOCK)) {
      return RESTAURANT_STOCK;
    }
    if (canOpenRestaurantMode(data, RESTAURANT_MENU)) {
      return RESTAURANT_MENU;
    }
    return null;
  }

  static String visibleRestaurantMode(OperationData data, String requested) {
    return canOpenRestaurantMode(data, requested) ? requested : firstRestaurantMode(data);
  }

  static Destination resolveDestination(String rawRoute) {
    String route = rawRoute == null ? "" : rawRoute.trim().toLowerCase(Locale.ROOT);
    route = route.replace('/', ':').replace('#', ':');
    String[] parts = route.split(":", 2);
    String tab = parts.length > 0 ? parts[0] : "";
    String mode = parts.length > 1 ? parts[1] : "";

    if (TAB_TODAY.equals(tab)) {
      return new Destination(TAB_TODAY, CompanionUiRules.isMode(mode) ? mode : "");
    }
    if (TAB_MORE.equals(tab)) return new Destination(TAB_MORE, "");
    if (TAB_CUSTOMERS.equals(tab)) {
      if (!CUSTOMER_LIST.equals(mode) && !CUSTOMER_WAITING.equals(mode)) {
        mode = CUSTOMER_NEW;
      }
      return new Destination(TAB_CUSTOMERS, mode);
    }
    if (TAB_PENSION.equals(tab)) {
      if (!PENSION_ROOMS.equals(mode) && !PENSION_STAYS.equals(mode) && !PENSION_FOLIOS.equals(mode) && !PENSION_TASKS.equals(mode) && !PENSION_KBS.equals(mode)) {
        mode = PENSION_RESERVATIONS;
      }
      return new Destination(TAB_PENSION, mode);
    }
    if (TAB_RESTAURANT.equals(tab)) {
      if (
          !RESTAURANT_RESERVATIONS.equals(mode)
          && !RESTAURANT_ORDERS.equals(mode)
          && !RESTAURANT_TASKS.equals(mode)
          && !RESTAURANT_STOCK.equals(mode)
          && !RESTAURANT_MENU.equals(mode)
      ) {
        mode = RESTAURANT_TABLES;
      }
      return new Destination(TAB_RESTAURANT, mode);
    }
    if (TAB_MESSAGES.equals(tab)) {
      mode = MESSAGES_WAITING.equals(mode) ? MESSAGES_WAITING : MESSAGES_PREPARED;
      return new Destination(TAB_MESSAGES, mode);
    }
    if (TAB_MARKET.equals(tab)) {
      return new Destination(TAB_MARKET, "");
    }
    if (TAB_CASH.equals(tab)) {
      return new Destination(TAB_CASH, "");
    }
    if (TAB_REPORTS.equals(tab)) {
      return new Destination(TAB_REPORTS, "");
    }
    return new Destination(TAB_TODAY, "");
  }

  static final class Destination {
    final String tab;
    final String mode;

    Destination(String tab, String mode) {
      this.tab = tab;
      this.mode = mode;
    }
  }
}
