package com.yardimciasistan.android;

import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;

import androidx.activity.ComponentActivity;

final class AndroidConnectionController {
  static final class ApplyResult {
    final boolean changed;
    final String connectionState;

    ApplyResult(boolean changed, String connectionState) {
      this.changed = changed;
      this.connectionState = connectionState == null ? "" : connectionState;
    }
  }

  private static final String EXTRA_WEB_MODULE_URL = "ya_web_module_url";
  private static final String EXTRA_SYNC_SECRET = "ya_sync_secret";
  private static final String EXTRA_ALLOW_DEBUG_OVERRIDE = "ya_allow_debug_connection_override";
  private static final String EXTRA_RESET_DEBUG_APP_STATE = "ya_reset_debug_app_state";

  private final ComponentActivity activity;
  private final SharedPreferences preferences;

  AndroidConnectionController(
      ComponentActivity activity,
      SharedPreferences preferences
  ) {
    this.activity = activity;
    this.preferences = preferences;
  }

  void resetDebugAppStateIfRequested(Intent intent) {
    if (isDebuggable()
        && intent != null
        && intent.getBooleanExtra(EXTRA_RESET_DEBUG_APP_STATE, false)) {
      DeviceIdentity.clearAppStateKeepingIdentity(preferences);
    }
  }

  boolean isDebugConnectionOverrideRequested(Intent intent) {
    return isDebuggable()
        && intent != null
        && intent.getBooleanExtra(EXTRA_ALLOW_DEBUG_OVERRIDE, false);
  }

  ApplyResult applyIntentConnection(
      Intent intent,
      OperationData data,
      ActionOutbox actionOutbox
  ) {
    if (intent == null) {
      return new ApplyResult(false, "");
    }

    String extraUrl = intent.getStringExtra(EXTRA_WEB_MODULE_URL);
    String extraSecret = intent.getStringExtra(EXTRA_SYNC_SECRET);
    boolean debugOverride = isDebugConnectionOverrideRequested(intent);

    if (ConnectionSettings.isEmbeddedConnectionLocked() && !debugOverride) {
      return new ApplyResult(false, "");
    }
    if (data != null
        && data.permissionsResolved
        && !data.hasPermission("settings.edit")
        && !debugOverride) {
      return new ApplyResult(false, "");
    }
    if (extraUrl == null || extraSecret == null
        || extraUrl.trim().isEmpty() || extraSecret.trim().isEmpty()) {
      return new ApplyResult(false, "");
    }

    String normalizedUrl = extraUrl.trim();
    String normalizedSecret = extraSecret.trim();
    String targetKey = CompanionConnectionIdentity.actionTargetKey(normalizedUrl);
    try {
      for (ActionOutbox.PendingAction pending : actionOutbox.load()) {
        if (!pending.matchesTarget(targetKey)) {
          return new ApplyResult(
              false,
              "Önceki bağlantıya ait bekleyen işlem korunuyor"
          );
        }
      }
    } catch (ActionOutbox.OutboxException error) {
      return new ApplyResult(false, error.getMessage());
    }

    preferences.edit()
        .putString(ConnectionSettings.KEY_WEB_MODULE_URL, normalizedUrl)
        .putString(ConnectionSettings.KEY_SYNC_SECRET, normalizedSecret)
        .apply();
    return new ApplyResult(true, "");
  }

  boolean hasConnectionSettings() {
    return ConnectionSettings.isComplete(preferences);
  }

  private boolean isDebuggable() {
    return (activity.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
  }
}
