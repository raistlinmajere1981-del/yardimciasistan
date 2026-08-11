package com.yardimciasistan.android;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

final class NotificationEventDetector {
  private NotificationEventDetector() {}

  static List<NotificationEvent> detect(OperationData data, String today) {
    ArrayList<NotificationEvent> events = new ArrayList<>();
    if (data == null) {
      return events;
    }

    for (OperationData.RequestRecord request : data.requests) {
      if (!request.id.isEmpty() && "new".equals(request.status)) {
        events.add(new NotificationEvent(
            "request:" + request.id + ":new",
            NotificationEvent.CATEGORY_CUSTOMER,
            "request",
            "Yeni müşteri talebi",
            request.customerName + requestSummarySuffix(request),
            "customers:new",
            firstNonEmpty(request.createdAt, request.updatedAt),
            NotificationEvent.PRIORITY_HIGH
        ));
      }
    }

    for (OperationData.ReservationRecord reservation : data.reservations) {
      if (!reservation.id.isEmpty() && "pending".equals(reservation.status)) {
        events.add(new NotificationEvent(
            "reservation:" + reservation.id + ":pending",
            NotificationEvent.CATEGORY_CUSTOMER,
            "reservation",
            "Rezervasyon onay bekliyor",
            reservation.customerName + reservationSummarySuffix(reservation),
            routeForReservation(reservation),
            reservation.updatedAt,
            NotificationEvent.PRIORITY_MEDIUM
        ));
      }
    }

    Map<String, OperationData.TableRecord> tablesById = new HashMap<>();
    for (OperationData.TableRecord table : data.tables) {
      tablesById.put(table.id, table);
    }
    Set<String> paymentWaitingTableIds = new HashSet<>();
    for (OperationData.TableOrder order : data.tableOrders) {
      if (order.id.isEmpty() || !order.isActive()) {
        continue;
      }
      String tableName = firstNonEmpty(order.tableName, tableName(tablesById.get(order.tableId)));
      if ("payment".equals(order.status)) {
        paymentWaitingTableIds.add(order.tableId);
        events.add(paymentWaitingEvent(order.tableId, tableName, order.total, order.updatedAt));
      } else {
        events.add(new NotificationEvent(
            "order:" + order.id + ":active",
            NotificationEvent.CATEGORY_RESTAURANT,
            "table_order",
            "Masa siparişi açıldı",
            tableName + (order.itemCount > 0 ? " · " + order.itemCount + " ürün" : " için yeni adisyon"),
            "restaurant:orders",
            firstNonEmpty(order.openedAt, order.updatedAt),
            NotificationEvent.PRIORITY_LOW
        ));
      }
    }
    for (OperationData.TableRecord table : data.tables) {
      if (table.id.isEmpty() || paymentWaitingTableIds.contains(table.id)) {
        continue;
      }
      if ("bill_waiting".equals(table.status) || "payment".equals(table.status)) {
        events.add(paymentWaitingEvent(table.id, tableName(table), 0, table.updatedAt));
      }
    }

    for (OperationData.RoomRecord room : data.rooms) {
      if (room.id.isEmpty() || !("cleaning".equals(room.status) || "maintenance".equals(room.status))) {
        continue;
      }
      boolean maintenance = "maintenance".equals(room.status);
      events.add(new NotificationEvent(
          "room:" + room.id + ":" + room.status,
          NotificationEvent.CATEGORY_ROOMS,
          "room",
          maintenance ? "Oda bakım bekliyor" : "Oda temizlik bekliyor",
          tableName(room.name, room.number),
          "pension:rooms",
          room.updatedAt,
          NotificationEvent.PRIORITY_MEDIUM
      ));
    }

    for (OperationData.TaskRecord task : data.tasks) {
      if (task.id.isEmpty() || !"pending".equals(task.status)) {
        continue;
      }
      boolean overdue = isOverdue(task.dueDate, today);
      events.add(new NotificationEvent(
          "task:" + task.id + ":pending",
          NotificationEvent.CATEGORY_ROOMS,
          "daily_task",
          overdue ? "Günlük iş gecikti" : "Günlük iş bekliyor",
          task.title + taskDueSuffix(task),
          routeForTask(task),
          task.updatedAt,
          NotificationEvent.PRIORITY_MEDIUM
      ));
    }

    for (OperationData.ActionRecord action : data.actions) {
      if (action.id.isEmpty() || !"failed".equals(action.status)) {
        continue;
      }
      events.add(new NotificationEvent(
          "action:" + action.id + ":failed",
          NotificationEvent.CATEGORY_ACTION,
          "action_failed",
          "Telefon işlemi uygulanamadı",
          friendlyActionError(action.errorMessage),
          routeForAction(action),
          firstNonEmpty(action.processedAt, action.createdAt),
          NotificationEvent.PRIORITY_HIGH
      ));
    }
    return events;
  }

  static boolean isAllowed(NotificationEvent event, OperationData data, Set<String> enabledCategories) {
    if (event == null || data == null || !data.permissionsResolved || !enabledCategories.contains(event.category)) {
      return false;
    }
    if (NotificationEvent.CATEGORY_ACTION.equals(event.category)) {
      return true;
    }
    if (!data.deviceActive) {
      return false;
    }
    switch (event.kind) {
      case "request":
        return data.hasPermission("customer.view");
      case "reservation":
        return data.hasPermission("reservation.view");
      case "table_order":
        return canViewTables(data);
      case "payment_waiting":
        return canViewTables(data)
            && (data.hasPermission("table_order.set_payment_waiting")
                || data.hasPermission("table_order.close_paid"));
      case "room":
        return data.hasPermission("room.view");
      case "daily_task":
        return data.hasPermission("daily_task.view");
      case "sync_error":
        return "admin".equals(data.deviceRole) || data.hasPermission("settings.view");
      default:
        return false;
    }
  }

  static String friendlyActionError(String rawMessage) {
    String message = rawMessage == null ? "" : rawMessage.trim();
    String lower = message.toLowerCase(new Locale("tr", "TR"));
    if (lower.contains("hesap kapatma yetkisi") || (lower.contains("yetki") && lower.contains("kapat"))) {
      return "Bu cihazın hesap kapatma yetkisi yok.";
    }
    if (lower.contains("pasif") || lower.contains("pasifleştiril")) {
      return "Bu cihaz pasifleştirilmiş.";
    }
    if (lower.contains("adisyon") && (lower.contains("kapalı") || lower.contains("kapat"))) {
      return "Adisyon kapalı olduğu için işlem yapılamadı.";
    }
    if (lower.contains("yetki") || lower.contains("izin")) {
      return "Bu cihazın bu işlem için yetkisi yok.";
    }
    if (message.isEmpty()) {
      return "İşlem masaüstü tarafından uygulanamadı.";
    }
    return message.length() > 180 ? message.substring(0, 177) + "..." : message;
  }

  static String routeForAction(OperationData.ActionRecord action) {
    if (action != null && action.type.startsWith("daily_task_") && "manual_restaurant".equals(action.taskType)) {
      return "restaurant:tasks";
    }
    return routeForAction(action == null ? "" : action.type);
  }

  static String routeForAction(String actionType) {
    String type = actionType == null ? "" : actionType;
    if (type.startsWith("customer_")) {
      return "customers:new";
    }
    if (type.startsWith("reservation_table_")) {
      return "restaurant:reservations";
    }
    if (type.startsWith("reservation_room_")) {
      return "pension:reservations";
    }
    if (type.startsWith("reservation_")) {
      return "pension:reservations";
    }
    if (type.startsWith("room_")) {
      return "pension:rooms";
    }
    if (type.startsWith("daily_task_")) {
      return "pension:tasks";
    }
    if (type.startsWith("finance_")) {
      return "cash";
    }
    if (type.startsWith("menu_stock_")) {
      return "restaurant:stock";
    }
    if (type.startsWith("table_order_")) {
      return "restaurant:orders";
    }
    if (type.startsWith("table_")) {
      return "restaurant:tables";
    }
    return "today";
  }

  static String routeForTask(OperationData.TaskRecord task) {
    return AndroidUiRules.isRestaurantTask(task) ? "restaurant:tasks" : "pension:tasks";
  }

  static String routeForReservation(OperationData.ReservationRecord reservation) {
    return AndroidUiRules.isRestaurantOnlyReservation(reservation)
        ? "restaurant:reservations"
        : "pension:reservations";
  }

  private static NotificationEvent paymentWaitingEvent(String tableId, String tableName, double total, String updatedAt) {
    String normalizedId = tableId == null || tableId.trim().isEmpty() ? tableName : tableId.trim();
    String message = tableName;
    if (total > 0) {
      message += " · " + Math.round(total * 100d) / 100d + " TL";
    }
    return new NotificationEvent(
        "table:" + normalizedId + ":payment_waiting",
        NotificationEvent.CATEGORY_RESTAURANT,
        "payment_waiting",
        "Masa hesap bekliyor",
        message,
        "restaurant:tables",
        updatedAt,
        NotificationEvent.PRIORITY_HIGH
    );
  }

  private static boolean canViewTables(OperationData data) {
    return data.hasPermission("table.view") || data.hasPermission("table_order.view");
  }

  private static boolean isOverdue(String dueDate, String today) {
    return dueDate != null && today != null
        && dueDate.length() == 10 && today.length() == 10
        && dueDate.compareTo(today) < 0;
  }

  private static String requestSummarySuffix(OperationData.RequestRecord request) {
    String summary = firstNonEmpty(request.aiSummary, request.message);
    return summary.isEmpty() ? " yeni bir talep gönderdi." : " · " + ellipsize(summary, 96);
  }

  private static String reservationSummarySuffix(OperationData.ReservationRecord reservation) {
    String date = firstNonEmpty(reservation.startDate, reservation.time);
    return date.isEmpty() ? " için karar bekleniyor." : " · " + date;
  }

  private static String taskDueSuffix(OperationData.TaskRecord task) {
    String due = (firstNonEmpty(task.dueDate, task.dueTime) + (task.dueDate.isEmpty() || task.dueTime.isEmpty() ? "" : " " + task.dueTime)).trim();
    return due.isEmpty() ? "" : " · " + due;
  }

  private static String tableName(OperationData.TableRecord table) {
    return table == null ? "Masa" : firstNonEmpty(table.name, "Masa");
  }

  private static String tableName(String name, String number) {
    String normalized = firstNonEmpty(name, "Oda");
    return number == null || number.trim().isEmpty() || normalized.contains(number.trim())
        ? normalized
        : normalized + " " + number.trim();
  }

  private static String firstNonEmpty(String... values) {
    for (String value : values) {
      if (value != null && !value.trim().isEmpty()) {
        return value.trim();
      }
    }
    return "";
  }

  private static String ellipsize(String value, int limit) {
    String normalized = value == null ? "" : value.trim();
    return normalized.length() <= limit ? normalized : normalized.substring(0, Math.max(0, limit - 3)) + "...";
  }
}
