package com.yardimciasistan.android;

import java.util.Locale;

final class AndroidUiRules {
  static final String TAB_TODAY = "today";
  static final String TAB_CUSTOMERS = "customers";
  static final String TAB_PENSION = "pension";
  static final String TAB_RESTAURANT = "restaurant";
  static final String TAB_MESSAGES = "messages";
  static final String TAB_REPORTS = "reports";

  static final String CUSTOMER_NEW = "new";
  static final String CUSTOMER_LIST = "customers";
  static final String CUSTOMER_WAITING = "waiting";

  static final String PENSION_RESERVATIONS = "reservations";
  static final String PENSION_ROOMS = "rooms";
  static final String PENSION_STAYS = "stays";
  static final String PENSION_TASKS = "tasks";

  static final String RESTAURANT_TABLES = "tables";
  static final String RESTAURANT_RESERVATIONS = "reservations";
  static final String RESTAURANT_ORDERS = "orders";
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
    if (TAB_CUSTOMERS.equals(tab)) {
      return data != null && (
          data.hasPermission("customer.view")
          || canManageCustomers(data)
      );
    }
    if (TAB_MESSAGES.equals(tab)) {
      return data.hasPermission("customer.view");
    }
    if (TAB_PENSION.equals(tab)) {
      return firstPensionMode(data) != null;
    }
    if (TAB_RESTAURANT.equals(tab)) {
      return firstRestaurantMode(data) != null;
    }
    if (TAB_REPORTS.equals(tab)) {
      return data != null && data.isAdmin();
    }
    return false;
  }

  static boolean canOpenPensionMode(OperationData data, String mode) {
    if (PENSION_RESERVATIONS.equals(mode)) {
      return data.hasPermission("reservation.view");
    }
    if (PENSION_ROOMS.equals(mode)) {
      return data.hasPermission("room.view");
    }
    if (PENSION_STAYS.equals(mode)) {
      return data.isAdmin()
          && data.hasPermission("customer.manage")
          && data.hasPermission("room.assign_customer");
    }
    if (PENSION_TASKS.equals(mode)) {
      return data.hasPermission("daily_task.view");
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
    if (canOpenPensionMode(data, PENSION_TASKS)) {
      return PENSION_TASKS;
    }
    return null;
  }

  static String visiblePensionMode(OperationData data, String requested) {
    return canOpenPensionMode(data, requested) ? requested : firstPensionMode(data);
  }

  static boolean canOpenRestaurantMode(OperationData data, String mode) {
    if (RESTAURANT_TABLES.equals(mode)) {
      return data.hasPermission("table.view");
    }
    if (RESTAURANT_RESERVATIONS.equals(mode)) {
      return data.hasPermission("reservation.view")
          && (data.hasPermission("reservation.create") || hasRestaurantReservationContext(data));
    }
    if (RESTAURANT_ORDERS.equals(mode)) {
      return data.hasPermission("table_order.view");
    }
    if (RESTAURANT_STOCK.equals(mode)) {
      return data.hasPermission("menu.stock_view");
    }
    if (RESTAURANT_MENU.equals(mode)) {
      return canDelete(data, "menu.delete");
    }
    return false;
  }

  static boolean hasRestaurantReservationContext(OperationData data) {
    if (data == null) {
      return false;
    }
    for (OperationData.ReservationRecord reservation : data.reservations) {
      if (isRestaurantReservation(reservation)) {
        return true;
      }
    }
    return false;
  }

  static boolean isRestaurantReservation(OperationData.ReservationRecord reservation) {
    return reservation != null && (
        "table".equals(reservation.type)
        || "breakfast".equals(reservation.type)
        || "room_and_table".equals(reservation.type)
        || !reservation.tableIds.isEmpty()
    );
  }

  static boolean isRestaurantOnlyReservation(OperationData.ReservationRecord reservation) {
    return reservation != null && (
        "table".equals(reservation.type)
        || "breakfast".equals(reservation.type)
        || (reservation.roomIds.isEmpty() && !reservation.tableIds.isEmpty())
    );
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

    if (TAB_CUSTOMERS.equals(tab)) {
      if (!CUSTOMER_LIST.equals(mode) && !CUSTOMER_WAITING.equals(mode)) {
        mode = CUSTOMER_NEW;
      }
      return new Destination(TAB_CUSTOMERS, mode);
    }
    if (TAB_PENSION.equals(tab)) {
      if (!PENSION_ROOMS.equals(mode) && !PENSION_STAYS.equals(mode) && !PENSION_TASKS.equals(mode)) {
        mode = PENSION_RESERVATIONS;
      }
      return new Destination(TAB_PENSION, mode);
    }
    if (TAB_RESTAURANT.equals(tab)) {
      if (
          !RESTAURANT_RESERVATIONS.equals(mode)
          && !RESTAURANT_ORDERS.equals(mode)
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
