package com.yardimciasistan.android;

public final class AndroidUiRulesSmoke {
  private AndroidUiRulesSmoke() {}

  public static void main(String[] args) {
    hidesUnauthorizedTabsAndModes();
    selectsTheFirstAuthorizedMode();
    resolvesNotificationDestinations();
    System.out.println("android-ui-rules-smoke-ok");
  }

  private static void hidesUnauthorizedTabsAndModes() {
    OperationData data = restrictedData();
    assertTrue(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_TODAY), "today must remain available");
    assertFalse(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_CUSTOMERS), "customer tab without customer.view");
    assertFalse(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_PENSION), "pension tab without a visible mode");
    assertFalse(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_RESTAURANT), "restaurant tab without a visible mode");

    data.permissions.add("menu.view");
    data.permissions.add("daily_task.view");
    assertFalse(
        AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_TABLES),
        "menu or task permissions must not leak into the tables mode"
    );
    assertFalse(
        AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_ORDERS),
        "menu or task permissions must not leak into the orders mode"
    );
    assertFalse(
        AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_STOCK),
        "menu.view alone must not expose stock"
    );
  }

  private static void selectsTheFirstAuthorizedMode() {
    OperationData data = restrictedData();
    data.permissions.add("room.view");
    assertEquals(AndroidUiRules.PENSION_ROOMS, AndroidUiRules.firstPensionMode(data), "room-only pension profile");
    assertEquals(
        AndroidUiRules.PENSION_ROOMS,
        AndroidUiRules.visiblePensionMode(data, AndroidUiRules.PENSION_RESERVATIONS),
        "a denied pension route should fall back to an authorized mode"
    );

    data.permissions.clear();
    data.permissions.add("table_order.view");
    assertEquals(AndroidUiRules.RESTAURANT_ORDERS, AndroidUiRules.firstRestaurantMode(data), "order-only restaurant profile");
    assertFalse(
        AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_TABLES),
        "table_order.view must not expose table cards"
    );

    data.permissions.clear();
    data.permissions.add("menu.stock_view");
    assertEquals(AndroidUiRules.RESTAURANT_STOCK, AndroidUiRules.firstRestaurantMode(data), "stock-only restaurant profile");

    data.permissions.clear();
    data.permissions.add("customer.view");
    assertTrue(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_CUSTOMERS), "customer.view should expose customers");
    assertTrue(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_MESSAGES), "customer.view should expose messages");
  }

  private static void resolvesNotificationDestinations() {
    assertDestination("customers:new", AndroidUiRules.TAB_CUSTOMERS, AndroidUiRules.CUSTOMER_NEW);
    assertDestination("pension:reservations", AndroidUiRules.TAB_PENSION, AndroidUiRules.PENSION_RESERVATIONS);
    assertDestination("pension/tasks", AndroidUiRules.TAB_PENSION, AndroidUiRules.PENSION_TASKS);
    assertDestination("restaurant:tables", AndroidUiRules.TAB_RESTAURANT, AndroidUiRules.RESTAURANT_TABLES);
    assertDestination("restaurant:orders", AndroidUiRules.TAB_RESTAURANT, AndroidUiRules.RESTAURANT_ORDERS);
    assertDestination("restaurant:stock", AndroidUiRules.TAB_RESTAURANT, AndroidUiRules.RESTAURANT_STOCK);
    assertDestination("messages:waiting", AndroidUiRules.TAB_MESSAGES, AndroidUiRules.MESSAGES_WAITING);
    assertDestination("unknown", AndroidUiRules.TAB_TODAY, "");
  }

  private static OperationData restrictedData() {
    OperationData data = new OperationData();
    data.deviceActive = true;
    data.permissionsResolved = true;
    data.permissions.clear();
    return data;
  }

  private static void assertDestination(String route, String tab, String mode) {
    AndroidUiRules.Destination destination = AndroidUiRules.resolveDestination(route);
    assertEquals(tab, destination.tab, route + " tab");
    assertEquals(mode, destination.mode, route + " mode");
  }

  private static void assertTrue(boolean value, String message) {
    if (!value) throw new AssertionError(message);
  }

  private static void assertFalse(boolean value, String message) {
    assertTrue(!value, message);
  }

  private static void assertEquals(Object expected, Object actual, String message) {
    if (expected == null ? actual != null : !expected.equals(actual)) {
      throw new AssertionError(message + ": expected=" + expected + " actual=" + actual);
    }
  }
}
