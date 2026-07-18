package com.yardimciasistan.android;

import android.content.SharedPreferences;

import java.util.HashSet;
import java.util.Set;

final class NotificationPreferences {
  static final String KEY_CUSTOMER = "notification_customer_reservation_enabled_v1";
  static final String KEY_RESTAURANT = "notification_restaurant_table_enabled_v1";
  static final String KEY_ROOMS = "notification_room_daily_task_enabled_v1";
  static final String KEY_ACTION = "notification_action_failure_enabled_v1";
  static final String KEY_SYNC = "notification_sync_connection_enabled_v1";

  private NotificationPreferences() {}

  static boolean isEnabled(SharedPreferences preferences, String category) {
    return preferences.getBoolean(keyForCategory(category), true);
  }

  static void setEnabled(SharedPreferences preferences, String category, boolean enabled) {
    preferences.edit().putBoolean(keyForCategory(category), enabled).apply();
  }

  static Set<String> enabledCategories(SharedPreferences preferences) {
    HashSet<String> enabled = new HashSet<>();
    for (String category : new String[] {
        NotificationEvent.CATEGORY_CUSTOMER,
        NotificationEvent.CATEGORY_RESTAURANT,
        NotificationEvent.CATEGORY_ROOMS,
        NotificationEvent.CATEGORY_ACTION,
        NotificationEvent.CATEGORY_SYNC
    }) {
      if (isEnabled(preferences, category)) {
        enabled.add(category);
      }
    }
    return enabled;
  }

  private static String keyForCategory(String category) {
    switch (category) {
      case NotificationEvent.CATEGORY_CUSTOMER:
        return KEY_CUSTOMER;
      case NotificationEvent.CATEGORY_RESTAURANT:
        return KEY_RESTAURANT;
      case NotificationEvent.CATEGORY_ROOMS:
        return KEY_ROOMS;
      case NotificationEvent.CATEGORY_ACTION:
        return KEY_ACTION;
      case NotificationEvent.CATEGORY_SYNC:
        return KEY_SYNC;
      default:
        throw new IllegalArgumentException("Bilinmeyen bildirim kategorisi: " + category);
    }
  }
}
