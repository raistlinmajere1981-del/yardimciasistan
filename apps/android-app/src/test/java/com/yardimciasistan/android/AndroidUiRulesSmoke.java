package com.yardimciasistan.android;

public final class AndroidUiRulesSmoke {
  private AndroidUiRulesSmoke() {}

  public static void main(String[] args) {
    hidesUnauthorizedTabsAndModes();
    selectsTheFirstAuthorizedMode();
    recognizesRestaurantReservationContext();
    deletionsRequireResolvedActiveAdmin();
    reportsRequireResolvedActiveAdmin();
    validatesReportDatePresets();
    resolvesNotificationDestinations();
    resolvesReportAiEndpoint();
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
        AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_RESERVATIONS),
        "menu or task permissions must not leak into restaurant reservations"
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
    assertTrue(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_CUSTOMERS), "customer.view should preserve request handling");
    assertFalse(AndroidUiRules.canManageCustomers(data), "customer cards and creation must stay admin-only");
    assertTrue(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_MESSAGES), "customer.view should expose messages");
    data.permissions.add("customer.manage");
    assertFalse(AndroidUiRules.canManageCustomers(data), "customer.manage must not elevate staff");
    data.deviceRole = "admin";
    assertTrue(AndroidUiRules.canManageCustomers(data), "active admin with customer.manage can manage customers");

    data.permissions.add("room.assign_customer");
    assertTrue(
        AndroidUiRules.canOpenPensionMode(data, AndroidUiRules.PENSION_STAYS),
        "admin customer and room permissions should expose the stay archive"
    );
    data.deviceRole = "staff";
    assertFalse(
        AndroidUiRules.canOpenPensionMode(data, AndroidUiRules.PENSION_STAYS),
        "staff must never open the customer stay archive"
    );
  }

  private static void recognizesRestaurantReservationContext() {
    OperationData data = restrictedData();
    data.permissions.add("reservation.view");
    assertFalse(
        AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_RESERVATIONS),
        "reservation.view alone must not create a restaurant tab in a pension-only snapshot"
    );

    OperationData.TableRecord table = new OperationData.TableRecord();
    table.id = "table-1";
    data.tables.add(table);
    assertTrue(
        AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_RESERVATIONS),
        "a restaurant snapshot plus reservation.view should expose restaurant reservations"
    );
    assertEquals(
        AndroidUiRules.RESTAURANT_RESERVATIONS,
        AndroidUiRules.firstRestaurantMode(data),
        "reservation-only restaurant profile should land on reservations"
    );

    data.tables.clear();
    OperationData.ReservationRecord reservation = new OperationData.ReservationRecord();
    reservation.id = "restaurant-reservation-1";
    reservation.type = "table";
    data.reservations.add(reservation);
    assertTrue(AndroidUiRules.isRestaurantReservation(reservation), "table reservation classification");
    assertTrue(
        AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_RESERVATIONS),
        "an existing table reservation should keep the restaurant reservation mode reachable"
    );

    OperationData.ReservationRecord pension = new OperationData.ReservationRecord();
    pension.type = "room";
    assertFalse(AndroidUiRules.isRestaurantReservation(pension), "room reservation must stay outside the restaurant list");
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

  private static void reportsRequireResolvedActiveAdmin() {
    OperationData data = restrictedData();
    OperationData.ReportSnapshot report = new OperationData.ReportSnapshot();
    report.label = "Son 7 Gün";
    data.reports.put("last7", report);

    assertFalse(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_REPORTS), "staff must not open reports");
    data.deviceRole = "admin";
    assertTrue(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_REPORTS), "active resolved admin can open reports");
    assertEquals(report, data.report("last7"), "report accessor should return the selected compact snapshot");

    data.permissionsResolved = false;
    assertFalse(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_REPORTS), "unresolved admin must fail closed");
    data.permissionsResolved = true;
    data.deviceActive = false;
    assertFalse(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_REPORTS), "inactive admin must fail closed");
  }

  private static void validatesReportDatePresets() {
    for (String preset : new String[] {
        AndroidUiRules.REPORT_TODAY,
        AndroidUiRules.REPORT_YESTERDAY,
        AndroidUiRules.REPORT_LAST_7,
        AndroidUiRules.REPORT_LAST_30
    }) {
      assertTrue(AndroidUiRules.isReportPreset(preset), preset + " must remain selectable");
      assertEquals(preset, AndroidUiRules.normalizeReportPreset(preset), preset + " must not change");
    }
    assertFalse(AndroidUiRules.isReportPreset("custom"), "custom Android range is intentionally deferred");
    assertEquals(
        AndroidUiRules.REPORT_LAST_7,
        AndroidUiRules.normalizeReportPreset("unknown"),
        "invalid report range must safely fall back"
    );
  }

  private static void resolvesNotificationDestinations() {
    assertDestination("customers:new", AndroidUiRules.TAB_CUSTOMERS, AndroidUiRules.CUSTOMER_NEW);
    assertDestination("pension:reservations", AndroidUiRules.TAB_PENSION, AndroidUiRules.PENSION_RESERVATIONS);
    assertDestination("pension:stays", AndroidUiRules.TAB_PENSION, AndroidUiRules.PENSION_STAYS);
    assertDestination("pension/tasks", AndroidUiRules.TAB_PENSION, AndroidUiRules.PENSION_TASKS);
    assertDestination("restaurant:tables", AndroidUiRules.TAB_RESTAURANT, AndroidUiRules.RESTAURANT_TABLES);
    assertDestination("restaurant:reservations", AndroidUiRules.TAB_RESTAURANT, AndroidUiRules.RESTAURANT_RESERVATIONS);
    assertDestination("restaurant:orders", AndroidUiRules.TAB_RESTAURANT, AndroidUiRules.RESTAURANT_ORDERS);
    assertDestination("restaurant:stock", AndroidUiRules.TAB_RESTAURANT, AndroidUiRules.RESTAURANT_STOCK);
    assertDestination("restaurant:menu", AndroidUiRules.TAB_RESTAURANT, AndroidUiRules.RESTAURANT_MENU);
    assertDestination("messages:waiting", AndroidUiRules.TAB_MESSAGES, AndroidUiRules.MESSAGES_WAITING);
    assertDestination("reports", AndroidUiRules.TAB_REPORTS, "");
    assertDestination("unknown", AndroidUiRules.TAB_TODAY, "");
  }

  private static void resolvesReportAiEndpoint() {
    assertEquals(
        "https://firma.example/yardimci-asistan/api/chat.php",
        HostingSyncClient.toChatEndpoint("https://firma.example/yardimci-asistan"),
        "module root report AI endpoint"
    );
    assertEquals(
        "https://firma.example/yardimci-asistan/api/chat.php",
        HostingSyncClient.toChatEndpoint("https://firma.example/yardimci-asistan/api/sync.php"),
        "sync endpoint report AI endpoint"
    );
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
