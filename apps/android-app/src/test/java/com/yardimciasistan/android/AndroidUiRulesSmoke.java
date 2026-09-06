package com.yardimciasistan.android;

public final class AndroidUiRulesSmoke {
  private AndroidUiRulesSmoke() {}

  public static void main(String[] args) {
    hidesUnauthorizedTabsAndModes();
    selectsTheFirstAuthorizedMode();
    recognizesRestaurantReservationContext();
    deletionsRequireResolvedActiveAdmin();
    reportsRequireResolvedActiveAdmin();
    capabilitiesBoundEveryRoleAndDomain();
    classifiesAutomaticTasksByDomain();
    validatesReportDatePresets();
    resolvesNotificationDestinations();
    resolvesReportAiEndpoint();
    invalidatesRevokedAndroidState();
    System.out.println("android-ui-rules-smoke-ok");
  }

  private static void hidesUnauthorizedTabsAndModes() {
    OperationData data = restrictedData();
    assertTrue(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_TODAY), "today must remain available");
    assertFalse(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_CUSTOMERS), "customer tab without customer.view");
    assertFalse(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_PENSION), "pension tab without a visible mode");
    assertFalse(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_RESTAURANT), "restaurant tab without a visible mode");
    assertFalse(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_CASH), "cash tab without finance.view");
    data.permissions.add("finance.view");
    assertTrue(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_CASH), "finance.view should expose the cash workspace");
    data.permissions.remove("finance.view");

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
    data.permissions.add("daily_task.view");
    assertEquals(AndroidUiRules.RESTAURANT_TASKS, AndroidUiRules.firstRestaurantMode(data), "task-only restaurant profile");

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
        "reservation.view alone must not create an empty restaurant reservation mode"
    );

    OperationData.TableRecord table = new OperationData.TableRecord();
    table.id = "table-1";
    data.tables.add(table);
    assertFalse(
        AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_RESERVATIONS),
        "table inventory alone must not expose an empty reservation mode"
    );

    OperationData.ReservationRecord reservation = new OperationData.ReservationRecord();
    reservation.id = "restaurant-reservation-1";
    reservation.type = "table";
    data.reservations.add(reservation);
    assertTrue(AndroidUiRules.isRestaurantReservation(reservation), "table reservation classification");
    assertTrue(AndroidUiRules.isRestaurantOnlyReservation(reservation), "table reservation should use the restaurant-first route");
    assertTrue(
        AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_RESERVATIONS),
        "an existing table reservation should expose restaurant reservations"
    );

    data.permissions.remove("table.view");
    assertEquals(
        AndroidUiRules.RESTAURANT_RESERVATIONS,
        AndroidUiRules.firstRestaurantMode(data),
        "reservation-only restaurant profile should land on reservations"
    );

    OperationData.ReservationRecord pension = new OperationData.ReservationRecord();
    pension.type = "room";
    assertFalse(AndroidUiRules.isRestaurantReservation(pension), "room reservation must stay outside the restaurant list");
    assertFalse(AndroidUiRules.isRestaurantOnlyReservation(pension), "room reservation must keep the pension route");

    OperationData.ReservationRecord combined = new OperationData.ReservationRecord();
    combined.type = "room_and_table";
    combined.roomIds.add("room-1");
    combined.tableIds.add("table-1");
    assertTrue(AndroidUiRules.isRestaurantReservation(combined), "combined stay should be visible in restaurant operations");
    assertFalse(AndroidUiRules.isRestaurantOnlyReservation(combined), "combined stay should remain pension-first for notifications");

    OperationData.ReservationRecord mixed = new OperationData.ReservationRecord();
    mixed.type = "mixed";
    assertTrue(AndroidUiRules.isRestaurantReservation(mixed), "mixed reservations should remain visible in restaurant operations");
    assertTrue(AndroidUiRules.isPensionReservation(data, mixed), "mixed reservations should remain visible in pension operations");
    assertTrue(AndroidUiRules.reservationAllowed(data, mixed), "mixed reservations require and accept both active domains");

    OperationData.ReservationRecord generic = new OperationData.ReservationRecord();
    generic.type = "event";
    assertFalse(
        AndroidUiRules.isRestaurantReservation(data, generic),
        "generic reservations default to pension when both reservation domains are enabled"
    );
    data.businessCapabilities.remove(AndroidUiRules.CAPABILITY_ACCOMMODATION_RESERVATIONS);
    assertTrue(
        AndroidUiRules.isRestaurantReservation(data, generic),
        "a generic reservation must remain reachable from a food-only profile"
    );

    OperationData.ReservationRecord contextual = new OperationData.ReservationRecord();
    contextual.type = "event";
    contextual.roomIds.add("room-1");
    contextual.tableIds.add("table-1");
    OperationData.TaskRecord contextualTask = new OperationData.TaskRecord();
    contextualTask.type = "reservation";
    contextualTask.relatedType = "reservation";
    contextualTask.relatedId = "contextual";
    contextual.id = contextualTask.relatedId;
    data.reservations.add(contextual);
    assertEquals("mixed", AndroidUiRules.taskDomain(data, contextualTask), "resource-linked generic task domain");
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

  private static void capabilitiesBoundEveryRoleAndDomain() {
    OperationData data = restrictedData();
    data.deviceRole = "admin";
    data.permissions.add("room.view");
    data.permissions.add("reservation.view");
    data.permissions.add("reservation.create");
    data.permissions.add("customer.convert_to_reservation");
    data.permissions.add("table.view");
    data.permissions.add("customer.respond");
    data.permissions.add("message.delete");

    data.businessCapabilities.remove(AndroidUiRules.CAPABILITY_ACCOMMODATION_RESERVATIONS);
    assertTrue(
        AndroidUiRules.canOpenPensionMode(data, AndroidUiRules.PENSION_ROOMS),
        "rooms must remain available without room reservations"
    );
    assertFalse(
        AndroidUiRules.canCreateRoomReservation(data),
        "an admin permission must not bypass a disabled accommodation reservation capability"
    );
    OperationData.RequestRecord pensionRequest = new OperationData.RequestRecord();
    pensionRequest.type = "pension_reservation";
    assertFalse(
        AndroidUiRules.canConvertRequest(data, pensionRequest),
        "a pension request must not convert when accommodation reservations are disabled"
    );

    data.businessCapabilities.remove(AndroidUiRules.CAPABILITY_FOOD_RESERVATIONS);
    assertTrue(
        AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_TABLES),
        "tables must remain available without food reservations"
    );
    assertFalse(
        AndroidUiRules.canCreateTableReservation(data),
        "an admin permission must not bypass a disabled food reservation capability"
    );

    data.businessCapabilities.remove(AndroidUiRules.CAPABILITY_CUSTOMERS);
    data.permissions.add("room.assign_customer");
    assertFalse(
        data.hasPermission("room.assign_customer"),
        "room assignment must require the customer domain as well as accommodation stays"
    );
    assertFalse(
        data.hasPermission("message.delete"),
        "message deletion must require the customer domain as well as WhatsApp"
    );
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_CUSTOMERS);
    data.businessCapabilities.remove(AndroidUiRules.CAPABILITY_WHATSAPP);
    assertFalse(AndroidUiRules.canUseWhatsApp(data), "WhatsApp must follow its service capability");
    assertFalse(
        AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_MESSAGES),
        "message navigation must disappear when WhatsApp is disabled"
    );
  }

  private static void classifiesAutomaticTasksByDomain() {
    OperationData.TaskRecord service = new OperationData.TaskRecord();
    service.type = "table_service";
    assertTrue(AndroidUiRules.isRestaurantTask(service), "table service belongs to restaurant tasks");
    assertFalse(AndroidUiRules.isPensionTask(service), "table service must not leak into pension tasks");

    OperationData.TaskRecord room = new OperationData.TaskRecord();
    room.type = "room_cleaning";
    assertTrue(AndroidUiRules.isPensionTask(room), "room cleaning belongs to pension tasks");
    assertFalse(AndroidUiRules.isRestaurantTask(room), "room cleaning must not leak into restaurant tasks");

    OperationData data = restrictedData();
    OperationData.ReservationRecord mixedReservation = new OperationData.ReservationRecord();
    mixedReservation.id = "mixed-reservation";
    mixedReservation.type = "mixed";
    data.reservations.add(mixedReservation);
    OperationData.TaskRecord mixed = new OperationData.TaskRecord();
    mixed.type = "reservation";
    mixed.relatedType = "reservation";
    mixed.relatedId = mixedReservation.id;
    assertTrue(AndroidUiRules.isPensionTask(data, mixed), "mixed reservation task belongs to pension tasks");
    assertTrue(AndroidUiRules.isRestaurantTask(data, mixed), "mixed reservation task belongs to restaurant tasks");
    data.businessCapabilities.remove(AndroidUiRules.CAPABILITY_TABLES);
    assertFalse(AndroidUiRules.taskAllowed(data, mixed), "mixed task requires both operation domains");

    OperationData hintedTableTaskData = restrictedData();
    hintedTableTaskData.businessCapabilities.remove(AndroidUiRules.CAPABILITY_ROOMS);
    hintedTableTaskData.businessCapabilities.remove(AndroidUiRules.CAPABILITY_FOOD_RESERVATIONS);
    OperationData.TaskRecord hintedTableTask = new OperationData.TaskRecord();
    hintedTableTask.type = "reservation";
    hintedTableTask.relatedType = "reservation";
    hintedTableTask.relatedReservationType = "table";
    assertTrue(
        AndroidUiRules.isRestaurantTask(hintedTableTaskData, hintedTableTask),
        "a task must retain its table domain after the reservation record is projected out"
    );
    assertTrue(
        AndroidUiRules.taskAllowed(hintedTableTaskData, hintedTableTask),
        "table operations should retain their linked tasks without reservation capability"
    );

    OperationData market = restrictedData();
    market.businessCapabilities.remove(AndroidUiRules.CAPABILITY_ROOMS);
    market.businessCapabilities.remove(AndroidUiRules.CAPABILITY_TABLES);
    assertTrue(
        AndroidUiRules.taskTypeAllowed(market, "note", ""),
        "domain-neutral tasks remain available from the core task capability"
    );
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
    assertDestination("restaurant:tasks", AndroidUiRules.TAB_RESTAURANT, AndroidUiRules.RESTAURANT_TASKS);
    assertDestination("restaurant:stock", AndroidUiRules.TAB_RESTAURANT, AndroidUiRules.RESTAURANT_STOCK);
    assertDestination("restaurant:menu", AndroidUiRules.TAB_RESTAURANT, AndroidUiRules.RESTAURANT_MENU);
    assertDestination("messages:waiting", AndroidUiRules.TAB_MESSAGES, AndroidUiRules.MESSAGES_WAITING);
    assertDestination("cash", AndroidUiRules.TAB_CASH, "");
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

  private static void invalidatesRevokedAndroidState() {
    HostingSyncClient.SyncException serviceDisabled = new HostingSyncClient.SyncException(
        "Android bağlantısı bu işletmede etkin değil.",
        "android_capability_disabled",
        403
    );
    assertTrue(serviceDisabled.disablesAndroidService(), "service.android revocation must be terminal");
    assertTrue(serviceDisabled.invalidatesPendingAction(), "service.android revocation must invalidate queued actions");

    HostingSyncClient.SyncException permissionRevoked = new HostingSyncClient.SyncException(
        "Bu telefonun bu işlem için etkin yetkisi yok.",
        "android_action_permission_denied",
        403
    );
    assertFalse(permissionRevoked.disablesAndroidService(), "one revoked permission must not disable Android");
    assertTrue(permissionRevoked.invalidatesPendingAction(), "revoked permission must discard its stale action");

    OperationData disabled = OperationData.androidCapabilityDisabled();
    assertTrue(disabled.capabilitiesResolved, "disabled state must resolve capabilities fail-closed");
    assertTrue(disabled.permissionsResolved, "disabled state must resolve permissions fail-closed");
    assertFalse(disabled.deviceActive, "disabled state must deactivate the device UI");
    assertFalse(disabled.hasBusinessCapability(AndroidUiRules.CAPABILITY_ANDROID), "disabled state must not retain service.android");
  }

  private static OperationData restrictedData() {
    OperationData data = new OperationData();
    data.deviceActive = true;
    data.permissionsResolved = true;
    data.capabilitiesResolved = true;
    data.permissions.clear();
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_ANDROID);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_CUSTOMERS);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_TASKS);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_FINANCE);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_REPORTS);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_WHATSAPP);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_AI);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_ROOMS);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_ACCOMMODATION_RESERVATIONS);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_STAYS);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_FOLIO);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_TABLES);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_FOOD_RESERVATIONS);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_ORDERS);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_MENU);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_INVENTORY);
    data.businessCapabilities.add("core.devices");
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
