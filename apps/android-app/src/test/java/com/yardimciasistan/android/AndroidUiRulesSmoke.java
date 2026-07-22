package com.yardimciasistan.android;

public final class AndroidUiRulesSmoke {
  private AndroidUiRulesSmoke() {}

  public static void main(String[] args) {
    hidesUnauthorizedTabsAndModes();
    selectsTheFirstAuthorizedMode();
    deletionsRequireResolvedActiveAdmin();
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
    data.permissions.add("menu.delete");
    assertFalse(
        AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_MENU),
        "a staff role must not expose menu deletion even if the permission is present"
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

  private static void deletionsRequireResolvedActiveAdmin() {
    OperationData data = restrictedData();
    data.permissions.add("customer.delete");
    data.permissions.add("request.delete");
    data.permissions.add("menu.delete");
    data.permissions.add("message.delete");

    assertFalse(AndroidUiRules.canDelete(data, "customer.delete"), "staff cannot delete customers");
    assertFalse(AndroidUiRules.canDelete(data, "request.delete"), "staff cannot delete requests");
    assertFalse(AndroidUiRules.canDelete(data, "message.delete"), "staff cannot delete messages");
    assertFalse(
        AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_MENU),
        "staff cannot open menu deletion"
    );

    data.deviceRole = "admin";
    assertTrue(AndroidUiRules.canDelete(data, "customer.delete"), "active resolved admin can delete customers");
    assertTrue(AndroidUiRules.canDelete(data, "request.delete"), "active resolved admin can delete requests");
    assertTrue(AndroidUiRules.canDelete(data, "message.delete"), "active resolved admin can delete messages");
    assertTrue(
        AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_MENU),
        "active resolved admin can open menu deletion"
    );

    data.permissionsResolved = false;
    assertFalse(AndroidUiRules.canDelete(data, "menu.delete"), "an unresolved profile must fail closed");
    data.permissionsResolved = true;
    data.deviceActive = false;
    assertFalse(AndroidUiRules.canDelete(data, "menu.delete"), "an inactive admin must fail closed");
  }

  private static void resolvesNotificationDestinations() {
    assertDestination("customers:new", AndroidUiRules.TAB_CUSTOMERS, AndroidUiRules.CUSTOMER_NEW);
    assertDestination("pension:reservations", AndroidUiRules.TAB_PENSION, AndroidUiRules.PENSION_RESERVATIONS);
    assertDestination("pension/tasks", AndroidUiRules.TAB_PENSION, AndroidUiRules.PENSION_TASKS);
    assertDestination("restaurant:tables", AndroidUiRules.TAB_RESTAURANT, AndroidUiRules.RESTAURANT_TABLES);
    assertDestination("restaurant:orders", AndroidUiRules.TAB_RESTAURANT, AndroidUiRules.RESTAURANT_ORDERS);
    assertDestination("restaurant:stock", AndroidUiRules.TAB_RESTAURANT, AndroidUiRules.RESTAURANT_STOCK);
    assertDestination("restaurant:menu", AndroidUiRules.TAB_RESTAURANT, AndroidUiRules.RESTAURANT_MENU);
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
