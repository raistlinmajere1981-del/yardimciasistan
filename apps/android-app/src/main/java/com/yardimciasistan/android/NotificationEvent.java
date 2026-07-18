package com.yardimciasistan.android;

final class NotificationEvent {
  static final String CATEGORY_CUSTOMER = "customer_reservation";
  static final String CATEGORY_RESTAURANT = "restaurant_table";
  static final String CATEGORY_ROOMS = "room_daily_task";
  static final String CATEGORY_ACTION = "action_failure";
  static final String CATEGORY_SYNC = "sync_connection";

  static final int PRIORITY_LOW = 1;
  static final int PRIORITY_MEDIUM = 2;
  static final int PRIORITY_HIGH = 3;

  final String key;
  final String category;
  final String kind;
  final String title;
  final String message;
  final String route;
  final String occurredAt;
  final int priority;

  NotificationEvent(
      String key,
      String category,
      String kind,
      String title,
      String message,
      String route,
      String occurredAt,
      int priority
  ) {
    this.key = safe(key);
    this.category = safe(category);
    this.kind = safe(kind);
    this.title = safe(title);
    this.message = safe(message);
    this.route = safe(route);
    this.occurredAt = safe(occurredAt);
    this.priority = priority;
  }

  private static String safe(String value) {
    return value == null ? "" : value.trim();
  }
}
