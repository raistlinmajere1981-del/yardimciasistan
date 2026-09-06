package com.yardimciasistan.android;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class NotificationRulesSmoke {
  private NotificationRulesSmoke() {}

  public static void main(String[] args) {
    detectsAndFiltersPermissionPackages();
    filtersTechnicalAndActionAlerts();
    preventsDuplicateEventsAndClearsResolvedEvents();
    unlocksAnUnnotifiedEventAfterPermissionChange();
    doesNotNotifyAnInitialBaseline();
    keepsSyncEventsOutOfSnapshotReconciliation();
    renotifiesSyncAfterAResolvedOutage();
    classifiesLongSyncFailures();
    System.out.println("notification-rules-smoke-ok");
  }

  private static void filtersTechnicalAndActionAlerts() {
    OperationData data = baseData();
    Set<String> enabled = allCategories();
    NotificationEvent actionFailure = new NotificationEvent(
        "action:failed-1:failed",
        NotificationEvent.CATEGORY_ACTION,
        "action_failed",
        "Telefon işlemi uygulanamadı",
        "Yetki hatası",
        "restaurant",
        "",
        NotificationEvent.PRIORITY_HIGH
    );
    data.deviceActive = false;
    assertTrue(
        NotificationEventDetector.isAllowed(actionFailure, data, enabled),
        "an inactive or unauthorized device should still receive its own friendly action failure"
    );
    enabled.remove(NotificationEvent.CATEGORY_ACTION);
    assertFalse(
        NotificationEventDetector.isAllowed(actionFailure, data, enabled),
        "the local action-failure preference should still be respected"
    );
    assertEquals(
        "Bu cihazın hesap kapatma yetkisi yok.",
        NotificationEventDetector.friendlyActionError("Hesap kapatma yetkisi bulunamadı."),
        "permission errors must be converted to user-facing messages"
    );

    NotificationEvent syncFailure = new NotificationEvent(
        "sync:error:connection",
        NotificationEvent.CATEGORY_SYNC,
        "sync_error",
        "Senkron uzun süredir başarısız",
        "Bağlantı sorunu",
        "settings",
        "",
        NotificationEvent.PRIORITY_HIGH
    );
    data.deviceActive = true;
    enabled = allCategories();
    assertFalse(
        NotificationEventDetector.isAllowed(syncFailure, data, enabled),
        "ordinary staff should not receive technical sync alerts"
    );
    data.permissions.add("settings.view");
    assertTrue(
        NotificationEventDetector.isAllowed(syncFailure, data, enabled),
        "settings.view should allow technical sync alerts"
    );
    data.permissions.clear();
    data.deviceRole = "admin";
    assertFalse(
        NotificationEventDetector.isAllowed(syncFailure, data, enabled),
        "the administrator label must not bypass the effective settings permission"
    );
    data.businessCapabilities.remove(AndroidUiRules.CAPABILITY_NOTIFICATIONS);
    assertFalse(
        NotificationEventDetector.isAllowed(actionFailure, data, allCategories()),
        "core.notifications=false must suppress every notification category"
    );
    assertTrue(
        NotificationEventDetector.detect(data, "2026-07-18").isEmpty(),
        "core.notifications=false must suppress snapshot event generation"
    );
  }

  private static void detectsAndFiltersPermissionPackages() {
    OperationData data = baseData();
    OperationData.RequestRecord request = new OperationData.RequestRecord();
    request.id = "request-1";
    request.status = "new";
    request.customerName = "Ayşe";
    data.requests.add(request);

    OperationData.ReservationRecord reservation = new OperationData.ReservationRecord();
    reservation.id = "reservation-1";
    reservation.type = "room";
    reservation.status = "pending";
    reservation.customerName = "Mehmet";
    data.reservations.add(reservation);

    OperationData.ReservationRecord restaurantReservation = new OperationData.ReservationRecord();
    restaurantReservation.id = "reservation-table-1";
    restaurantReservation.type = "table";
    restaurantReservation.status = "pending";
    restaurantReservation.customerName = "Zeynep";
    restaurantReservation.time = "19:30";
    data.reservations.add(restaurantReservation);

    OperationData.TableOrder order = new OperationData.TableOrder();
    order.id = "order-1";
    order.tableId = "table-1";
    order.tableName = "Masa 4";
    order.status = "payment";
    data.tableOrders.add(order);

    OperationData.RoomRecord room = new OperationData.RoomRecord();
    room.id = "room-1";
    room.name = "Oda 101";
    room.status = "cleaning";
    data.rooms.add(room);

    OperationData.TaskRecord task = new OperationData.TaskRecord();
    task.id = "task-1";
    task.title = "Oda hazırlığı";
    task.status = "pending";
    task.dueDate = "2026-07-17";
    data.tasks.add(task);

    List<NotificationEvent> events = NotificationEventDetector.detect(data, "2026-07-18");
    assertEquals(6, events.size(), "all required snapshot events should be detected");

    Set<String> enabled = allCategories();
    NotificationEvent requestEvent = event(events, "request:request-1:new");
    NotificationEvent reservationEvent = event(events, "reservation:reservation-1:pending");
    NotificationEvent restaurantReservationEvent = event(events, "reservation:reservation-table-1:pending");
    NotificationEvent paymentEvent = event(events, "table:table-1:payment_waiting");
    NotificationEvent roomEvent = event(events, "room:room-1:cleaning");
    NotificationEvent taskEvent = event(events, "task:task-1:pending");

    assertEquals("customers:new", requestEvent.route, "request notification route");
    assertEquals("pension:reservations", reservationEvent.route, "pension reservation notification route");
    assertEquals("restaurant:reservations", restaurantReservationEvent.route, "restaurant reservation notification route");
    assertEquals("restaurant:tables", paymentEvent.route, "payment notification route");
    assertEquals("pension:rooms", roomEvent.route, "room notification route");
    assertEquals("today", taskEvent.route, "domain-neutral daily-task notification route");
    assertEquals("restaurant:stock", NotificationEventDetector.routeForAction("menu_stock_set"), "stock action route");
    assertEquals("restaurant:orders", NotificationEventDetector.routeForAction("table_order_set_served"), "order action route");
    assertEquals("cash", NotificationEventDetector.routeForAction("finance_manual_create"), "finance action route");

    OperationData.ReservationRecord combinedReservation = new OperationData.ReservationRecord();
    combinedReservation.type = "room_and_table";
    combinedReservation.roomIds.add("room-1");
    combinedReservation.tableIds.add("table-1");
    assertEquals(
        "pension:reservations",
        NotificationEventDetector.routeForReservation(combinedReservation),
        "combined lodging reservation notifications should keep the pension-first route"
    );

    data.permissions.add("customer.view");
    assertTrue(NotificationEventDetector.isAllowed(requestEvent, data, enabled), "customer.view should allow request alerts");
    assertFalse(NotificationEventDetector.isAllowed(reservationEvent, data, enabled), "reservation.view should remain independent");
    data.permissions.clear();
    data.permissions.add("reservation.view");
    assertTrue(NotificationEventDetector.isAllowed(reservationEvent, data, enabled), "reservation.view should allow pension reservation alerts");
    assertTrue(NotificationEventDetector.isAllowed(restaurantReservationEvent, data, enabled), "reservation.view should allow restaurant reservation alerts");

    data.permissions.clear();
    data.permissions.addAll(Arrays.asList("table_order.view", "table_order.set_payment_waiting"));
    assertTrue(NotificationEventDetector.isAllowed(paymentEvent, data, enabled), "service package should see payment-waiting alerts");
    data.permissions.remove("table_order.set_payment_waiting");
    assertFalse(NotificationEventDetector.isAllowed(paymentEvent, data, enabled), "view without payment responsibility should hide payment alerts");
    data.permissions.add("table_order.close_paid");
    assertTrue(NotificationEventDetector.isAllowed(paymentEvent, data, enabled), "cashier package should see payment-waiting alerts");

    data.permissions.clear();
    data.permissions.addAll(Arrays.asList("room.view", "daily_task.view"));
    assertTrue(NotificationEventDetector.isAllowed(roomEvent, data, enabled), "room.view should allow room alerts");
    assertTrue(NotificationEventDetector.isAllowed(taskEvent, data, enabled), "daily_task.view should allow task alerts");
    data.permissions.clear();
    assertFalse(NotificationEventDetector.isAllowed(roomEvent, data, enabled), "unauthorized devices should not see room alerts");
    assertFalse(NotificationEventDetector.isAllowed(taskEvent, data, enabled), "unauthorized devices should not see task alerts");
  }

  private static void preventsDuplicateEventsAndClearsResolvedEvents() {
    NotificationLedger ledger = new NotificationLedger();
    NotificationEvent first = simpleEvent("request:one:new");
    NotificationLedger.Update firstUpdate = ledger.synchronize(
        Collections.emptyList(),
        Collections.singletonList(first),
        Collections.emptySet(),
        Collections.singleton(first.key),
        true,
        true,
        100L
    );
    assertEquals(1, firstUpdate.notifyEvents.size(), "a new event should notify once");
    ledger.markNotified(firstUpdate.notifyEvents, 100L);

    NotificationLedger.Update repeated = ledger.synchronize(
        Collections.singletonList(first),
        Collections.singletonList(first),
        Collections.singleton(first.key),
        Collections.singleton(first.key),
        true,
        true,
        200L
    );
    assertEquals(0, repeated.notifyEvents.size(), "the same event key must not notify twice");

    NotificationLedger.Update cleared = ledger.synchronize(
        Collections.singletonList(first),
        Collections.emptyList(),
        Collections.singleton(first.key),
        Collections.emptySet(),
        true,
        true,
        300L
    );
    assertTrue(cleared.cancelKeys.contains(first.key), "resolved events should leave the active notification set");

    NotificationEvent second = simpleEvent("request:two:new");
    NotificationLedger.Update nextRequest = ledger.synchronize(
        Collections.emptyList(),
        Collections.singletonList(second),
        Collections.emptySet(),
        Collections.singleton(second.key),
        true,
        true,
        400L
    );
    assertEquals(1, nextRequest.notifyEvents.size(), "a different request id should create a new notification");
  }

  private static void unlocksAnUnnotifiedEventAfterPermissionChange() {
    NotificationLedger ledger = new NotificationLedger();
    NotificationEvent payment = simpleEvent("table:one:payment_waiting");
    NotificationLedger.Update denied = ledger.synchronize(
        Collections.emptyList(),
        Collections.singletonList(payment),
        Collections.emptySet(),
        Collections.emptySet(),
        true,
        true,
        100L
    );
    assertEquals(0, denied.notifyEvents.size(), "an event outside effective permissions must stay silent");

    NotificationLedger.Update granted = ledger.synchronize(
        Collections.singletonList(payment),
        Collections.singletonList(payment),
        Collections.emptySet(),
        Collections.singleton(payment.key),
        true,
        true,
        200L
    );
    assertEquals(1, granted.notifyEvents.size(), "a later effective-permission grant should unlock the active alert");
  }

  private static void doesNotNotifyAnInitialBaseline() {
    NotificationLedger ledger = new NotificationLedger();
    NotificationEvent existing = simpleEvent("task:existing:pending");
    NotificationLedger.Update baseline = ledger.synchronize(
        Collections.emptyList(),
        Collections.singletonList(existing),
        Collections.emptySet(),
        Collections.singleton(existing.key),
        false,
        true,
        100L
    );
    assertEquals(0, baseline.notifyEvents.size(), "the first downloaded snapshot should establish a baseline");
    NotificationLedger.Update unchanged = ledger.synchronize(
        Collections.singletonList(existing),
        Collections.singletonList(existing),
        Collections.singleton(existing.key),
        Collections.singleton(existing.key),
        true,
        true,
        200L
    );
    assertEquals(0, unchanged.notifyEvents.size(), "an unchanged baseline event should remain silent");
  }

  private static void keepsSyncEventsOutOfSnapshotReconciliation() {
    NotificationLedger ledger = new NotificationLedger();
    NotificationEvent sync = syncEvent();
    NotificationLedger.Update activated = ledger.activate(sync, true, true, 100L);
    ledger.markNotified(activated.notifyEvents, 100L);

    NotificationLedger.Update snapshotRefresh = ledger.synchronize(
        Collections.emptyList(),
        Collections.emptyList(),
        Collections.emptySet(),
        Collections.emptySet(),
        true,
        true,
        200L
    );
    assertFalse(snapshotRefresh.cancelKeys.contains(sync.key), "snapshot reconciliation must not clear synthetic sync alerts");
    assertEquals(0L, ledger.records.get(sync.key).clearedAt, "the active sync alert should remain active");
  }

  private static void renotifiesSyncAfterAResolvedOutage() {
    NotificationLedger ledger = new NotificationLedger();
    NotificationEvent sync = syncEvent();
    NotificationLedger.Update firstOutage = ledger.activate(sync, true, true, 100L);
    assertEquals(1, firstOutage.notifyEvents.size(), "the first long outage should notify");
    ledger.markNotified(firstOutage.notifyEvents, 100L);
    ledger.clearPrefix("sync:error:", 200L);

    NotificationLedger.Update laterOutage = ledger.activate(sync, true, true, 300L);
    assertEquals(1, laterOutage.notifyEvents.size(), "a later outage after recovery should notify again");
    assertEquals(0L, ledger.records.get(sync.key).clearedAt, "the later outage should reactivate the sync record");
  }

  private static void classifiesLongSyncFailures() {
    assertFalse(LocalNotificationCenter.isLongSyncFailure(1_000L, 60_000L, 4), "short outages should stay silent");
    assertTrue(LocalNotificationCenter.isLongSyncFailure(1_000L, 901_000L, 2), "repeated 15-minute outages should notify");
    assertEquals("authentication", LocalNotificationCenter.syncErrorCode("Güvenlik anahtarı hatalı."), "auth errors need stable keys");
    assertEquals("timeout", LocalNotificationCenter.syncErrorCode("Bağlantı zaman aşımına uğradı."), "timeout errors need stable keys");
  }

  private static OperationData baseData() {
    OperationData data = new OperationData();
    data.permissionsResolved = true;
    data.capabilitiesResolved = true;
    data.deviceActive = true;
    data.permissions.clear();
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_ANDROID);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_CUSTOMERS);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_TASKS);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_NOTIFICATIONS);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_ROOMS);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_ACCOMMODATION_RESERVATIONS);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_TABLES);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_FOOD_RESERVATIONS);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_ORDERS);
    data.businessCapabilities.add("core.devices");
    return data;
  }

  private static Set<String> allCategories() {
    return new HashSet<>(Arrays.asList(
        NotificationEvent.CATEGORY_CUSTOMER,
        NotificationEvent.CATEGORY_RESTAURANT,
        NotificationEvent.CATEGORY_ROOMS,
        NotificationEvent.CATEGORY_ACTION,
        NotificationEvent.CATEGORY_SYNC
    ));
  }

  private static NotificationEvent event(List<NotificationEvent> events, String key) {
    for (NotificationEvent event : events) {
      if (key.equals(event.key)) {
        return event;
      }
    }
    throw new AssertionError("event not found: " + key);
  }

  private static NotificationEvent simpleEvent(String key) {
    return new NotificationEvent(
        key,
        NotificationEvent.CATEGORY_CUSTOMER,
        "request",
        "Başlık",
        "Açıklama",
        "customers",
        "",
        NotificationEvent.PRIORITY_HIGH
    );
  }

  private static NotificationEvent syncEvent() {
    return new NotificationEvent(
        "sync:error:connection",
        NotificationEvent.CATEGORY_SYNC,
        "sync_error",
        "Senkron uzun süredir başarısız",
        "Bağlantı sorunu",
        "settings",
        "",
        NotificationEvent.PRIORITY_HIGH
    );
  }

  private static void assertTrue(boolean value, String message) {
    if (!value) {
      throw new AssertionError(message);
    }
  }

  private static void assertFalse(boolean value, String message) {
    assertTrue(!value, message);
  }

  private static void assertEquals(Object expected, Object actual, String message) {
    if (expected == null ? actual != null : !expected.equals(actual)) {
      throw new AssertionError(message + " (expected=" + expected + ", actual=" + actual + ")");
    }
  }
}
