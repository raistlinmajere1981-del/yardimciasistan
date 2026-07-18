package com.yardimciasistan.android;

import android.content.SharedPreferences;

final class ConnectionSettings {
  static final String PREFS_NAME = "yardimci_asistan_android";
  static final String KEY_WEB_MODULE_URL = "web_module_url";
  static final String KEY_SYNC_SECRET = "sync_secret";
  private static final String KEY_DEBUG_CONNECTION_OVERRIDE_ACTIVE = "debug_connection_override_active";

  private ConnectionSettings() {}

  static void ensureDefaults(SharedPreferences preferences) {
    if (isEmbeddedConnectionLocked() && !isDebugConnectionOverrideActive(preferences)) {
      String storedUrl = storedValue(preferences, KEY_WEB_MODULE_URL);
      String storedSecret = storedValue(preferences, KEY_SYNC_SECRET);
      if (!ConnectionDefaults.WEB_MODULE_URL.equals(storedUrl)
          || !ConnectionDefaults.SYNC_SECRET.equals(storedSecret)) {
        preferences.edit()
            .putString(KEY_WEB_MODULE_URL, ConnectionDefaults.WEB_MODULE_URL)
            .putString(KEY_SYNC_SECRET, ConnectionDefaults.SYNC_SECRET)
            .apply();
      }
      return;
    }
    SharedPreferences.Editor editor = null;
    if (storedValue(preferences, KEY_WEB_MODULE_URL).isEmpty() && !ConnectionDefaults.WEB_MODULE_URL.isEmpty()) {
      editor = preferences.edit().putString(KEY_WEB_MODULE_URL, ConnectionDefaults.WEB_MODULE_URL);
    }
    if (storedValue(preferences, KEY_SYNC_SECRET).isEmpty() && !ConnectionDefaults.SYNC_SECRET.isEmpty()) {
      editor = editor == null ? preferences.edit() : editor;
      editor.putString(KEY_SYNC_SECRET, ConnectionDefaults.SYNC_SECRET);
    }
    if (editor != null) {
      editor.apply();
    }
  }

  static String webModuleUrl(SharedPreferences preferences) {
    String stored = storedValue(preferences, KEY_WEB_MODULE_URL);
    return stored.isEmpty() ? ConnectionDefaults.WEB_MODULE_URL : stored;
  }

  static String syncSecret(SharedPreferences preferences) {
    String stored = storedValue(preferences, KEY_SYNC_SECRET);
    return stored.isEmpty() ? ConnectionDefaults.SYNC_SECRET : stored;
  }

  static boolean isComplete(SharedPreferences preferences) {
    return !webModuleUrl(preferences).isEmpty() && !syncSecret(preferences).isEmpty();
  }

  static boolean isEmbeddedConnectionLocked() {
    return ConnectionDefaults.LOCK_EMBEDDED_CONNECTION
        && !ConnectionDefaults.WEB_MODULE_URL.isEmpty()
        && !ConnectionDefaults.SYNC_SECRET.isEmpty();
  }

  static void setDebugConnectionOverrideActive(SharedPreferences preferences, boolean active) {
    if (active != isDebugConnectionOverrideActive(preferences)) {
      preferences.edit().putBoolean(KEY_DEBUG_CONNECTION_OVERRIDE_ACTIVE, active).apply();
    }
  }

  private static boolean isDebugConnectionOverrideActive(SharedPreferences preferences) {
    return preferences.getBoolean(KEY_DEBUG_CONNECTION_OVERRIDE_ACTIVE, false);
  }

  private static String storedValue(SharedPreferences preferences, String key) {
    String value = preferences.getString(key, "");
    return value == null ? "" : value.trim();
  }
}
