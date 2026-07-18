package com.yardimciasistan.android;

import java.util.Locale;

final class AndroidUiRules {
  static final String TAB_TODAY = "today";
  static final String TAB_CUSTOMERS = "customers";
  static final String TAB_PENSION = "pension";
  static final String TAB_RESTAURANT = "restaurant";
  static final String TAB_MESSAGES = "messages";

  static final String CUSTOMER_NEW = "new";
  static final String CUSTOMER_LIST = "customers";
  static final String CUSTOMER_WAITING = "waiting";

  static final String PENSION_RESERVATIONS = "reservations";
  static final String PENSION_ROOMS = "rooms";
  static final String PENSION_TASKS = "tasks";

  static final String RESTAURANT_TABLES = "tables";
  static final String RESTAURANT_ORDERS = "orders";
  static final String RESTAURANT_STOCK = "stock";

  static final String MESSAGES_PREPARED = "prepared";
  static final String MESSAGES_WAITING = "waiting";

  private AndroidUiRules() {}

  static boolean canOpenTab(OperationData data, String tab) {
    if (TAB_TODAY.equals(tab)) {
      return true;
    }
    if (TAB_CUSTOMERS.equals(tab) || TAB_MESSAGES.equals(tab)) {
      return data.hasPermission("customer.view");
    }
    if (TAB_PENSION.equals(tab)) {
      return firstPensionMode(data) != null;
    }
    if (TAB_RESTAURANT.equals(tab)) {
      return firstRestaurantMode(data) != null;
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
    if (RESTAURANT_ORDERS.equals(mode)) {
      return data.hasPermission("table_order.view");
    }
    if (RESTAURANT_STOCK.equals(mode)) {
      return data.hasPermission("menu.stock_view");
    }
    return false;
  }

  static String firstRestaurantMode(OperationData data) {
    if (canOpenRestaurantMode(data, RESTAURANT_TABLES)) {
      return RESTAURANT_TABLES;
    }
    if (canOpenRestaurantMode(data, RESTAURANT_ORDERS)) {
      return RESTAURANT_ORDERS;
    }
    if (canOpenRestaurantMode(data, RESTAURANT_STOCK)) {
      return RESTAURANT_STOCK;
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
      if (!PENSION_ROOMS.equals(mode) && !PENSION_TASKS.equals(mode)) {
        mode = PENSION_RESERVATIONS;
      }
      return new Destination(TAB_PENSION, mode);
    }
    if (TAB_RESTAURANT.equals(tab)) {
      if (!RESTAURANT_ORDERS.equals(mode) && !RESTAURANT_STOCK.equals(mode)) {
        mode = RESTAURANT_TABLES;
      }
      return new Destination(TAB_RESTAURANT, mode);
    }
    if (TAB_MESSAGES.equals(tab)) {
      mode = MESSAGES_WAITING.equals(mode) ? MESSAGES_WAITING : MESSAGES_PREPARED;
      return new Destination(TAB_MESSAGES, mode);
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
