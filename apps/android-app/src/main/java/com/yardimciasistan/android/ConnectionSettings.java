package com.yardimciasistan.android;

import android.content.SharedPreferences;

final class ConnectionSettings {
  static final String PREFS_NAME = "yardimci_asistan_android";
  static final String KEY_WEB_MODULE_URL = "web_module_url";
  static final String KEY_SYNC_SECRET = "sync_secret";
  static final String KEY_LOCAL_DESKTOP_ID = "local_desktop_id_v1";
  static final String KEY_LOCAL_BASE_URL = "local_base_url_v1";
  static final String KEY_LOCAL_TOKEN = "local_token_v1";
  static final String KEY_LOCAL_TARGET_KEY = "local_target_key_v1";
  static final String KEY_LOCAL_LAST_SEEN_AT = "local_last_seen_at_v1";
  static final String KEY_HOSTING_ACTION_BARRIER_TARGET = "hosting_action_barrier_target_v1";
  static final String KEY_BOOTSTRAP_TICKET = "bootstrap_ticket_v1";

  private static final String DEVICE_CREDENTIAL_PREFIX = "device:";
  private static final String KEY_DEBUG_CONNECTION_OVERRIDE_ACTIVE = "debug_connection_override_active";

  private ConnectionSettings() {}

  static void ensureDefaults(SharedPreferences preferences) {
    if (isEmbeddedConnectionLocked() && !isDebugConnectionOverrideActive(preferences)) {
      String storedUrl = storedValue(preferences, KEY_WEB_MODULE_URL);
      String storedCredential = storedValue(preferences, KEY_SYNC_SECRET);

      // A desktop provisioning ticket deliberately moves this installation to
      // another business endpoint. Keep that target until the phone exchanges
      // the ticket for its per-device credential.
      if (hasPendingBootstrap(preferences)) {
        return;
      }

      // After desktop approval URL + device credential form one connection
      // identity. Embedded build defaults must never split that pair.
      if (isDeviceCredential(storedCredential)) {
        return;
      }

      SharedPreferences.Editor editor = null;
      if (!ConnectionDefaults.WEB_MODULE_URL.equals(storedUrl)) {
        editor = preferences.edit().putString(KEY_WEB_MODULE_URL, ConnectionDefaults.WEB_MODULE_URL);
      }
      if (!ConnectionDefaults.SYNC_SECRET.equals(storedCredential)) {
        editor = editor == null ? preferences.edit() : editor;
        editor.putString(KEY_SYNC_SECRET, ConnectionDefaults.SYNC_SECRET);
      }
      if (editor != null) {
        editor.apply();
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

  static boolean isDeviceCredential(String value) {
    String normalized = value == null ? "" : value.trim();
    return normalized.startsWith(DEVICE_CREDENTIAL_PREFIX)
        && normalized.substring(DEVICE_CREDENTIAL_PREFIX.length()).matches("yat_[a-f0-9]{64}");
  }

  static String deviceToken(String credential) {
    if (!isDeviceCredential(credential)) {
      return "";
    }
    return credential.trim().substring(DEVICE_CREDENTIAL_PREFIX.length());
  }

  static boolean storeBootstrapProvisioning(
      SharedPreferences preferences,
      String webModuleUrl,
      String ticket
  ) {
    String normalizedUrl = normalizeWebModuleUrl(webModuleUrl);
    String normalizedTicket = ticket == null ? "" : ticket.trim();
    if (normalizedUrl.isEmpty()
        || !normalizedTicket.matches("^yab1\\.[A-Za-z0-9_-]+\\.[a-f0-9]{64}$")) {
      return false;
    }
    return preferences.edit()
        .putString(KEY_WEB_MODULE_URL, normalizedUrl)
        .putString(KEY_BOOTSTRAP_TICKET, normalizedTicket)
        .remove(KEY_SYNC_SECRET)
        .remove(KEY_LOCAL_DESKTOP_ID)
        .remove(KEY_LOCAL_BASE_URL)
        .remove(KEY_LOCAL_TOKEN)
        .remove(KEY_LOCAL_TARGET_KEY)
        .remove(KEY_LOCAL_LAST_SEEN_AT)
        .remove(KEY_HOSTING_ACTION_BARRIER_TARGET)
        .commit();
  }

  static boolean hasPendingBootstrap(SharedPreferences preferences) {
    return !bootstrapTicket(preferences).isEmpty();
  }

  static String bootstrapTicket(SharedPreferences preferences) {
    String value = storedValue(preferences, KEY_BOOTSTRAP_TICKET);
    return value.matches("^yab1\\.[A-Za-z0-9_-]+\\.[a-f0-9]{64}$") ? value : "";
  }

  static void clearBootstrapTicket(SharedPreferences preferences) {
    preferences.edit().remove(KEY_BOOTSTRAP_TICKET).apply();
  }

  static boolean storeDeviceToken(SharedPreferences preferences, String token) {
    String normalized = token == null ? "" : token.trim();
    if (!normalized.matches("yat_[a-f0-9]{64}")) {
      return false;
    }
    return preferences.edit()
        .putString(KEY_SYNC_SECRET, DEVICE_CREDENTIAL_PREFIX + normalized)
        .commit();
  }

  static LocalConnection localConnection(SharedPreferences preferences) {
    return new LocalConnection(
        storedValue(preferences, KEY_LOCAL_DESKTOP_ID),
        storedValue(preferences, KEY_LOCAL_BASE_URL),
        storedValue(preferences, KEY_LOCAL_TOKEN),
        storedValue(preferences, KEY_LOCAL_TARGET_KEY),
        storedValue(preferences, KEY_LOCAL_LAST_SEEN_AT)
    );
  }

  static LocalConnection localConnectionForTarget(SharedPreferences preferences, String targetKey) {
    LocalConnection connection = localConnection(preferences);
    String normalizedTarget = targetKey == null ? "" : targetKey.trim();
    return connection.isComplete() && connection.targetKey.equals(normalizedTarget)
        ? connection
        : LocalConnection.empty();
  }

  static boolean storeDiscoveredLocalEndpoint(
      SharedPreferences preferences,
      String desktopId,
      String baseUrl
  ) {
    String normalizedDesktopId = normalizeDesktopId(desktopId);
    String normalizedBaseUrl = normalizeLocalBaseUrl(baseUrl);
    if (normalizedDesktopId.isEmpty() || normalizedBaseUrl.isEmpty()) {
      return false;
    }

    LocalConnection existing = localConnection(preferences);
    if (!existing.desktopId.isEmpty()
        && !existing.desktopId.equals(normalizedDesktopId)
        && !existing.localToken.isEmpty()) {
      return false;
    }

    return preferences.edit()
        .putString(KEY_LOCAL_DESKTOP_ID, normalizedDesktopId)
        .putString(KEY_LOCAL_BASE_URL, normalizedBaseUrl)
        .putString(KEY_LOCAL_LAST_SEEN_AT, String.valueOf(System.currentTimeMillis()))
        .commit();
  }

  static boolean storeLocalPairing(
      SharedPreferences preferences,
      String desktopId,
      String baseUrl,
      String targetKey,
      String token
  ) {
    String normalizedDesktopId = normalizeDesktopId(desktopId);
    String normalizedBaseUrl = normalizeLocalBaseUrl(baseUrl);
    String normalizedTargetKey = targetKey == null ? "" : targetKey.trim();
    String normalizedToken = token == null ? "" : token.trim();
    if (normalizedDesktopId.isEmpty()
        || normalizedBaseUrl.isEmpty()
        || normalizedTargetKey.isEmpty()
        || !normalizedToken.matches("yal_[a-f0-9]{64}")) {
      return false;
    }

    return preferences.edit()
        .putString(KEY_LOCAL_DESKTOP_ID, normalizedDesktopId)
        .putString(KEY_LOCAL_BASE_URL, normalizedBaseUrl)
        .putString(KEY_LOCAL_TARGET_KEY, normalizedTargetKey)
        .putString(KEY_LOCAL_TOKEN, normalizedToken)
        .putString(KEY_LOCAL_LAST_SEEN_AT, String.valueOf(System.currentTimeMillis()))
        .commit();
  }

  static void clearLocalEndpoint(SharedPreferences preferences) {
    preferences.edit()
        .remove(KEY_LOCAL_BASE_URL)
        .remove(KEY_LOCAL_LAST_SEEN_AT)
        .apply();
  }

  static void clearLocalCredential(SharedPreferences preferences) {
    preferences.edit()
        .remove(KEY_LOCAL_TOKEN)
        .remove(KEY_LOCAL_TARGET_KEY)
        .apply();
  }

  static void clearLocalConnection(SharedPreferences preferences) {
    preferences.edit()
        .remove(KEY_LOCAL_DESKTOP_ID)
        .remove(KEY_LOCAL_BASE_URL)
        .remove(KEY_LOCAL_TOKEN)
        .remove(KEY_LOCAL_TARGET_KEY)
        .remove(KEY_LOCAL_LAST_SEEN_AT)
        .apply();
  }

  // Must reach disk before the caller can send another action or the process exits:
  // the barrier keeps later operations on Hosting until its queue has drained.
  @android.annotation.SuppressLint("ApplySharedPref")
  static void markHostingActionBarrier(SharedPreferences preferences, String targetKey) {
    String normalized = targetKey == null ? "" : targetKey.trim();
    if (!normalized.isEmpty()) {
      preferences.edit().putString(KEY_HOSTING_ACTION_BARRIER_TARGET, normalized).commit();
    }
  }

  static boolean hasHostingActionBarrier(SharedPreferences preferences, String targetKey) {
    String normalized = targetKey == null ? "" : targetKey.trim();
    return !normalized.isEmpty()
        && normalized.equals(storedValue(preferences, KEY_HOSTING_ACTION_BARRIER_TARGET));
  }

  // Persist the confirmed Hosting drain before allowing the local transport again.
  @android.annotation.SuppressLint("ApplySharedPref")
  static void clearHostingActionBarrier(SharedPreferences preferences, String targetKey) {
    if (hasHostingActionBarrier(preferences, targetKey)) {
      preferences.edit().remove(KEY_HOSTING_ACTION_BARRIER_TARGET).commit();
    }
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

  private static String normalizeDesktopId(String value) {
    String normalized = value == null ? "" : value.trim();
    return normalized.matches("desktop-[A-Za-z0-9._:-]{8,120}") ? normalized : "";
  }

  private static String normalizeWebModuleUrl(String value) {
    String normalized = value == null ? "" : value.trim();
    while (normalized.endsWith("/")) {
      normalized = normalized.substring(0, normalized.length() - 1);
    }
    return normalized.matches("https?://[^\\s]+") ? normalized : "";
  }

  private static String normalizeLocalBaseUrl(String value) {
    String normalized = value == null ? "" : value.trim();
    while (normalized.endsWith("/")) {
      normalized = normalized.substring(0, normalized.length() - 1);
    }
    if (!normalized.matches("http://[^/\\s]+:[0-9]{1,5}")) {
      return "";
    }
    return normalized;
  }

  private static String storedValue(SharedPreferences preferences, String key) {
    String value = preferences.getString(key, "");
    return value == null ? "" : value.trim();
  }

  static final class LocalConnection {
    final String desktopId;
    final String baseUrl;
    final String localToken;
    final String targetKey;
    final String lastSeenAt;

    LocalConnection(
        String desktopId,
        String baseUrl,
        String localToken,
        String targetKey,
        String lastSeenAt
    ) {
      this.desktopId = desktopId == null ? "" : desktopId.trim();
      this.baseUrl = baseUrl == null ? "" : baseUrl.trim();
      this.localToken = localToken == null ? "" : localToken.trim();
      this.targetKey = targetKey == null ? "" : targetKey.trim();
      this.lastSeenAt = lastSeenAt == null ? "" : lastSeenAt.trim();
    }

    static LocalConnection empty() {
      return new LocalConnection("", "", "", "", "");
    }

    boolean hasEndpoint() {
      return !desktopId.isEmpty() && !baseUrl.isEmpty();
    }

    boolean isComplete() {
      return hasEndpoint()
          && localToken.matches("yal_[a-f0-9]{64}")
          && !targetKey.isEmpty();
    }
  }
}
