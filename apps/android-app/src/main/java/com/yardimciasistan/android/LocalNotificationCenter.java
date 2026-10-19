package com.yardimciasistan.android;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

final class LocalNotificationCenter {
  static final String EXTRA_ROUTE = "ya_notification_route";
  static final String EXTRA_EVENT_KEY = "ya_notification_event_key";

  private static final String CHANNEL_HIGH = "yardimci_operations_high_v1";
  private static final String CHANNEL_MEDIUM = "yardimci_operations_medium_v1";
  private static final String CHANNEL_LOW = "yardimci_operations_low_v1";
  private static final String KEY_LEDGER = "notification_event_ledger_v1";
  private static final String KEY_SYNC_FAILURE_STARTED_AT = "notification_sync_failure_started_at_v1";
  private static final String KEY_SYNC_FAILURE_COUNT = "notification_sync_failure_count_v1";
  private static final String KEY_SYNC_FAILURE_CODE = "notification_sync_failure_code_v1";
  private static final long LONG_SYNC_FAILURE_MS = 15L * 60L * 1000L;
  private static final Object STORE_LOCK = new Object();

  private final Context context;
  private final SharedPreferences preferences;
  private final NotificationManager manager;

  LocalNotificationCenter(Context context, SharedPreferences preferences) {
    this.context = context.getApplicationContext();
    this.preferences = preferences;
    this.manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    createChannels();
  }

  void processSnapshot(OperationData previousData, OperationData currentData) {
    if (currentData == null) {
      return;
    }
    synchronized (STORE_LOCK) {
      long now = System.currentTimeMillis();
      String today = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date(now));
      List<NotificationEvent> previousEvents = NotificationEventDetector.detect(previousData, today);
      List<NotificationEvent> currentEvents = NotificationEventDetector.detect(currentData, today);
      Set<String> enabled = NotificationPreferences.enabledCategories(preferences);
      Set<String> previouslyEligible = eligibleKeys(previousEvents, previousData, enabled);
      Set<String> currentlyEligible = eligibleKeys(currentEvents, currentData, enabled);
      NotificationLedger ledger = loadLedger();
      NotificationLedger.Update update = ledger.synchronize(
          previousEvents,
          currentEvents,
          previouslyEligible,
          currentlyEligible,
          previousData != null,
          canPostNotifications(),
          now
      );
      applyUpdate(ledger, update, now);
    }
  }

  void refreshCurrentSnapshot(OperationData data) {
    processSnapshot(data, data);
    refreshSyncAlertPolicy(data);
  }

  void recordSyncSuccess() {
    synchronized (STORE_LOCK) {
      boolean hadFailureTracking = preferences.contains(KEY_SYNC_FAILURE_STARTED_AT)
          || preferences.contains(KEY_SYNC_FAILURE_COUNT)
          || preferences.contains(KEY_SYNC_FAILURE_CODE);
      if (hadFailureTracking) {
        preferences.edit()
            .remove(KEY_SYNC_FAILURE_STARTED_AT)
            .remove(KEY_SYNC_FAILURE_COUNT)
            .remove(KEY_SYNC_FAILURE_CODE)
            .apply();
      }
      NotificationLedger ledger = loadLedger();
      boolean hasActiveSyncEvent = false;
      for (NotificationLedger.Record record : ledger.records.values()) {
        if (record.eventKey.startsWith("sync:error:") && record.clearedAt == 0L) {
          hasActiveSyncEvent = true;
          break;
        }
      }
      if (!hasActiveSyncEvent) {
        return;
      }
      Set<String> cancelKeys = ledger.clearPrefix("sync:error:", System.currentTimeMillis());
      for (String key : cancelKeys) {
        cancel(key);
      }
      saveLedger(ledger);
    }
  }

  void recordSyncFailure(OperationData data, String errorMessage) {
    synchronized (STORE_LOCK) {
      long now = System.currentTimeMillis();
      String errorCode = syncErrorCode(errorMessage);
      String previousCode = preferences.getString(KEY_SYNC_FAILURE_CODE, "");
      long startedAt = preferences.getLong(KEY_SYNC_FAILURE_STARTED_AT, 0L);
      int count = preferences.getInt(KEY_SYNC_FAILURE_COUNT, 0);
      if (startedAt <= 0L || !errorCode.equals(previousCode)) {
        if (previousCode != null && !previousCode.isEmpty() && !errorCode.equals(previousCode)) {
          clearActiveSyncEvents(now);
        }
        startedAt = now;
        count = 0;
      }
      count += 1;
      preferences.edit()
          .putLong(KEY_SYNC_FAILURE_STARTED_AT, startedAt)
          .putInt(KEY_SYNC_FAILURE_COUNT, count)
          .putString(KEY_SYNC_FAILURE_CODE, errorCode)
          .apply();
      if (!isLongSyncFailure(startedAt, now, count)) {
        return;
      }

      NotificationEvent event = syncFailureEvent(errorCode, now);
      Set<String> enabled = NotificationPreferences.enabledCategories(preferences);
      boolean allowed = NotificationEventDetector.isAllowed(event, data, enabled);
      NotificationLedger ledger = loadLedger();
      NotificationLedger.Update update = ledger.activate(event, allowed, canPostNotifications(), now);
      applyUpdate(ledger, update, now);
    }
  }

  static boolean isLongSyncFailure(long startedAt, long now, int count) {
    return count >= 2 && startedAt > 0L && now - startedAt >= LONG_SYNC_FAILURE_MS;
  }

  static String syncErrorCode(String errorMessage) {
    String normalized = errorMessage == null ? "" : errorMessage.toLowerCase(new Locale("tr", "TR"));
    if (normalized.contains("güvenlik anahtarı") || normalized.contains("yetkisiz") || normalized.contains("401")) {
      return "authentication";
    }
    if (normalized.contains("güncel değil") || normalized.contains("protokol") || normalized.contains("geçerli bir yanıt")) {
      return "server_version";
    }
    if (normalized.contains("zaman aş")) {
      return "timeout";
    }
    if (normalized.contains("ulaşılamadı") || normalized.contains("internet") || normalized.contains("bağlantı")) {
      return "connection";
    }
    return "unknown";
  }

  private void refreshSyncAlertPolicy(OperationData data) {
    synchronized (STORE_LOCK) {
      long now = System.currentTimeMillis();
      long startedAt = preferences.getLong(KEY_SYNC_FAILURE_STARTED_AT, 0L);
      int count = preferences.getInt(KEY_SYNC_FAILURE_COUNT, 0);
      if (!isLongSyncFailure(startedAt, now, count)) {
        return;
      }
      String errorCode = preferences.getString(KEY_SYNC_FAILURE_CODE, "unknown");
      NotificationEvent event = syncFailureEvent(errorCode == null ? "unknown" : errorCode, now);
      Set<String> enabled = NotificationPreferences.enabledCategories(preferences);
      boolean allowed = NotificationEventDetector.isAllowed(event, data, enabled);
      NotificationLedger ledger = loadLedger();
      NotificationLedger.Update update = ledger.activate(event, allowed, canPostNotifications(), now);
      applyUpdate(ledger, update, now);
    }
  }

  private void clearActiveSyncEvents(long now) {
    NotificationLedger ledger = loadLedger();
    Set<String> cancelKeys = ledger.clearPrefix("sync:error:", now);
    for (String key : cancelKeys) {
      cancel(key);
    }
    saveLedger(ledger);
  }

  private static NotificationEvent syncFailureEvent(String errorCode, long now) {
    return new NotificationEvent(
        "sync:error:" + errorCode,
        NotificationEvent.CATEGORY_SYNC,
        "sync_error",
        "Senkron uzun süredir başarısız",
        friendlySyncError(errorCode),
        "settings",
        new Date(now).toString(),
        NotificationEvent.PRIORITY_HIGH
    );
  }

  private void applyUpdate(NotificationLedger ledger, NotificationLedger.Update update, long now) {
    for (String key : update.cancelKeys) {
      cancel(key);
    }
    saveLedger(ledger);
    for (NotificationEvent event : update.notifyEvents) {
      ArrayList<NotificationEvent> oneEvent = new ArrayList<>();
      oneEvent.add(event);
      ledger.markNotified(oneEvent, now);
      saveLedger(ledger);
      if (!post(event)) {
        NotificationLedger.Record record = ledger.records.get(event.key);
        if (record != null) {
          record.notifiedAt = 0L;
        }
        saveLedger(ledger);
      }
    }
  }

  private Set<String> eligibleKeys(List<NotificationEvent> events, OperationData data, Set<String> enabled) {
    HashSet<String> keys = new HashSet<>();
    if (data == null) {
      return keys;
    }
    for (NotificationEvent event : events) {
      if (NotificationEventDetector.isAllowed(event, data, enabled)) {
        keys.add(event.key);
      }
    }
    return keys;
  }

  private boolean post(NotificationEvent event) {
    if (manager == null || !canPostNotifications()) {
      return false;
    }
    try {
      Intent intent = new Intent(context, MainActivity.class)
          .setAction("com.yardimciasistan.android.OPEN_NOTIFICATION")
          .setData(Uri.parse("yardimci-asistan://notification/" + Uri.encode(event.key)))
          .putExtra(EXTRA_ROUTE, event.route)
          .putExtra(EXTRA_EVENT_KEY, event.key)
          .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      PendingIntent contentIntent = PendingIntent.getActivity(
          context,
          event.key.hashCode(),
          intent,
          PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
      );
      Notification.Builder builder = new Notification.Builder(context, channelFor(event.priority))
          .setSmallIcon(event.priority == NotificationEvent.PRIORITY_HIGH
              ? android.R.drawable.ic_dialog_alert
              : android.R.drawable.ic_dialog_info)
          .setContentTitle(event.title)
          .setContentText(event.message)
          .setStyle(new Notification.BigTextStyle().bigText(event.message))
          .setContentIntent(contentIntent)
          .setAutoCancel(true)
          .setOnlyAlertOnce(true)
          .setShowWhen(true)
          .setWhen(System.currentTimeMillis())
          .setColor(UiKit.PRIMARY)
          .setCategory(NotificationEvent.CATEGORY_SYNC.equals(event.category)
              || NotificationEvent.CATEGORY_ACTION.equals(event.category)
              ? Notification.CATEGORY_ERROR
              : Notification.CATEGORY_EVENT)
          .setPriority(event.priority == NotificationEvent.PRIORITY_HIGH
              ? Notification.PRIORITY_HIGH
              : event.priority == NotificationEvent.PRIORITY_MEDIUM
                  ? Notification.PRIORITY_DEFAULT
                  : Notification.PRIORITY_LOW);
      manager.notify(event.key, 1, builder.build());
      return true;
    } catch (SecurityException ignored) {
      return false;
    }
  }

  private void cancel(String eventKey) {
    if (manager != null) {
      manager.cancel(eventKey, 1);
    }
  }

  private boolean canPostNotifications() {
    if (manager == null || !manager.areNotificationsEnabled()) {
      return false;
    }
    return Build.VERSION.SDK_INT < 33
        || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
  }

  private void createChannels() {
    if (manager == null) {
      return;
    }
    NotificationChannel high = new NotificationChannel(
        CHANNEL_HIGH,
        "Acil operasyon uyarıları",
        NotificationManager.IMPORTANCE_HIGH
    );
    high.setDescription("Yeni talepler, öncelikli operasyonlar, işlem ve bağlantı hataları");
    high.enableLights(true);
    high.setLightColor(Color.rgb(236, 180, 56));

    NotificationChannel medium = new NotificationChannel(
        CHANNEL_MEDIUM,
        "Günlük operasyon hatırlatmaları",
        NotificationManager.IMPORTANCE_DEFAULT
    );
    medium.setDescription("Etkin çalışma alanları ve günlük iş hatırlatmaları");

    NotificationChannel low = new NotificationChannel(
        CHANNEL_LOW,
        "Bilgilendirme bildirimleri",
        NotificationManager.IMPORTANCE_LOW
    );
    low.setDescription("Masa siparişi gibi bilgilendirme amaçlı durumlar");
    manager.createNotificationChannel(high);
    manager.createNotificationChannel(medium);
    manager.createNotificationChannel(low);
  }

  private String channelFor(int priority) {
    if (priority == NotificationEvent.PRIORITY_HIGH) {
      return CHANNEL_HIGH;
    }
    if (priority == NotificationEvent.PRIORITY_MEDIUM) {
      return CHANNEL_MEDIUM;
    }
    return CHANNEL_LOW;
  }

  private NotificationLedger loadLedger() {
    NotificationLedger ledger = new NotificationLedger();
    String serialized = preferences.getString(KEY_LEDGER, "");
    if (serialized == null || serialized.trim().isEmpty()) {
      return ledger;
    }
    try {
      JSONArray values = new JSONArray(serialized);
      for (int index = 0; index < values.length(); index += 1) {
        JSONObject value = values.optJSONObject(index);
        if (value == null) {
          continue;
        }
        String eventKey = value.optString("event_key", "").trim();
        if (eventKey.isEmpty()) {
          continue;
        }
        ledger.records.put(eventKey, new NotificationLedger.Record(
            eventKey,
            Math.max(0L, value.optLong("first_seen_at", 0L)),
            Math.max(0L, value.optLong("notified_at", 0L)),
            Math.max(0L, value.optLong("cleared_at", 0L)),
            value.optBoolean("baseline_only", false)
        ));
      }
    } catch (Exception ignored) {
      return new NotificationLedger();
    }
    return ledger;
  }

  // applyUpdate persists notifiedAt before posting. A background apply would leave
  // a process-death window for duplicate notifications on the next foreground/job run.
  @android.annotation.SuppressLint("ApplySharedPref")
  private void saveLedger(NotificationLedger ledger) {
    JSONArray values = new JSONArray();
    int retained = 0;
    for (NotificationLedger.Record record : ledger.records.values()) {
      if (retained >= 1000 && record.clearedAt > 0L) {
        continue;
      }
      JSONObject value = new JSONObject();
      try {
        value.put("event_key", record.eventKey);
        value.put("first_seen_at", record.firstSeenAt);
        value.put("notified_at", record.notifiedAt > 0L ? record.notifiedAt : JSONObject.NULL);
        value.put("cleared_at", record.clearedAt > 0L ? record.clearedAt : JSONObject.NULL);
        value.put("baseline_only", record.baselineOnly);
        values.put(value);
        retained += 1;
      } catch (Exception ignored) {
        // Skip only the malformed local record; other event keys remain durable.
      }
    }
    preferences.edit().putString(KEY_LEDGER, values.toString()).commit();
  }

  private static String friendlySyncError(String errorCode) {
    switch (errorCode) {
      case "authentication":
        return "Bağlantı anahtarı doğrulanamıyor. Ayarlar'dan bağlantıyı kontrol edin.";
      case "server_version":
        return "Web modülü güncel yanıt vermiyor. Masaüstü yöneticinizden kontrol etmesini isteyin.";
      case "timeout":
        return "Bağlantı uzun süredir zaman aşımına uğruyor. İnternet bağlantısını kontrol edin.";
      case "connection":
        return "Masaüstü bağlantısına uzun süredir ulaşılamıyor. İnterneti kontrol edin.";
      default:
        return "Canlı veri uzun süredir yenilenemiyor. Bağlantı durumunu kontrol edin.";
    }
  }
}
