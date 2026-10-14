package com.yardimciasistan.android;

import android.content.SharedPreferences;

import org.json.JSONObject;

final class OperationCache {
  private static final String KEY_CACHE = "operations_cache_v2";
  private static final String KEY_REVISIONS = "operations_revisions_v2";
  private static final String KEY_DEVICE_PROFILE_PREFIX = "operations_device_profile_v2_";
  private static final String KEY_ACTION_RESULTS = "operations_action_results_v2";
  private final SharedPreferences preferences;
  private final String deviceId;

  OperationCache(SharedPreferences preferences, String deviceId) {
    this.preferences = preferences;
    this.deviceId = deviceId;
  }

  OperationData load() {
    try {
      String serialized = preferences.getString(KEY_CACHE, "");
      if (serialized == null || serialized.trim().isEmpty()) {
        return null;
      }
      JSONObject payload = new JSONObject(serialized);
      OperationData data = OperationData.fromJson(payload, deviceId);
      if (!data.permissionsResolved) {
        applyRememberedPermissionProfile(data);
      }
      try {
        org.json.JSONArray results = payload.optJSONArray("action_results");
        String target = CompanionConnectionIdentity.actionTargetKey(ConnectionSettings.webModuleUrl(preferences));
        if (results != null) for (int i = 0; i < results.length() && i < 40; i++) {
          JSONObject row = results.optJSONObject(i);
          if (row != null) recordActionResult(OperationData.ActionRecord.fromJson(row), target);
        }
        markMissingActionResults(payload.optJSONArray("missing_action_result_ids"), target);
        mergeActionResults(data);
      } catch (CacheException ignored) { /* Order facts remain readable offline. */ }
      return data;
    } catch (Exception ignored) {
      return null;
    }
  }

  long revision(String sourceKey) {
    String normalizedSourceKey = sourceKey == null ? "" : sourceKey.trim();
    if (normalizedSourceKey.isEmpty()) {
      return 0L;
    }
    try {
      String serialized = preferences.getString(KEY_REVISIONS, "{}");
      JSONObject revisions = new JSONObject(serialized == null ? "{}" : serialized);
      return Math.max(0L, revisions.optLong(normalizedSourceKey, 0L));
    } catch (Exception ignored) {
      return 0L;
    }
  }

  void save(JSONObject payload, String sourceKey, long sourceRevision) throws CacheException {
    String normalizedSourceKey = sourceKey == null ? "" : sourceKey.trim();
    if (normalizedSourceKey.isEmpty()) {
      throw new CacheException("Canlı veri kaynağı belirlenemedi.");
    }

    try {
      String serialized = preferences.getString(KEY_REVISIONS, "{}");
      JSONObject revisions = new JSONObject(serialized == null ? "{}" : serialized);
      if (sourceRevision < revisions.optLong(normalizedSourceKey, 0L)) {
        throw new CacheException("Eski sunucu revizyonu telefon önbelleğini değiştiremez.");
      }
      revisions.put(normalizedSourceKey, Math.max(0L, sourceRevision));

      SharedPreferences.Editor editor = preferences.edit()
          .putString(KEY_CACHE, KbsUiRules.redactSnapshotForCache(payload, deviceId).toString())
          .putString(KEY_REVISIONS, revisions.toString());

      JSONObject profiles = payload.optJSONObject("androidPermissions");
      JSONObject ownProfile = profiles == null ? null : profiles.optJSONObject(deviceId);
      if (ownProfile != null) {
        editor.putString(profileKey(), ownProfile.toString());
      }

      if (!editor.commit()) {
        throw new CacheException("Canlı veri telefon önbelleğine kaydedilemedi.");
      }
    } catch (CacheException error) {
      throw error;
    } catch (Exception error) {
      throw new CacheException("Canlı veri telefon önbelleğine kaydedilemedi.");
    }
  }

  void clear() throws CacheException {
    if (!preferences.edit()
        .remove(KEY_CACHE)
        .remove(KEY_REVISIONS)
        .remove(KEY_ACTION_RESULTS)
        .remove(profileKey())
        .commit()) {
      throw new CacheException("Android verisi telefon önbelleğinden temizlenemedi.");
    }
  }

  /** Bounded transport receipts in the existing cache; no order/customer payload is copied. */
  synchronized void recordActionResult(OperationData.ActionRecord action, String targetKey) throws CacheException {
    boolean financial = MarketUiRules.ACTION_SALE.equals(action.type) || MarketUiRules.ACTION_CREDIT_PAYMENT.equals(action.type);
    boolean kbsAction = KbsUiRules.isAction(action.type);
    if ((!CompanionUiRules.isDecision(action.type) && !financial && !kbsAction) || !action.id.matches("[A-Za-z0-9._:-]{1,120}")
        || (!financial && !kbsAction && !action.orderId.matches("[A-Za-z0-9._:-]{1,120}")) || targetKey.isEmpty()) return;
    try {
      org.json.JSONArray source = new org.json.JSONArray(preferences.getString(KEY_ACTION_RESULTS, "[]"));
      java.util.List<JSONObject> rows = new java.util.ArrayList<>();
      JSONObject result = actionResultJson(action, targetKey);
      for (int i = 0; i < source.length(); i++) {
        JSONObject previous = source.optJSONObject(i);
        if (previous != null && action.id.equals(previous.optString("id")) && targetKey.equals(previous.optString("target_key"))) {
          // A later denied retry cannot undo a known committed application.
          if ("applied".equals(previous.optString("status")) && !"applied".equals(action.status)) return;
          if (!"pending".equals(previous.optString("status")) && "pending".equals(action.status)) return;
          if (previous.toString().equals(result.toString())) return;
        }
      }
      rows.add(result);
      for (int i = 0; i < source.length(); i++) {
        JSONObject previous = source.optJSONObject(i);
        if (previous != null && !(action.id.equals(previous.optString("id")) && targetKey.equals(previous.optString("target_key")))) rows.add(previous);
      }
      rows.sort((left, right) -> Long.compare(actionTime(right.optString("created_at")), actionTime(left.optString("created_at"))));
      org.json.JSONArray next = new org.json.JSONArray();
      for (JSONObject row : rows) { if (next.length() >= 40) break; next.put(row); }
      if (!preferences.edit().putString(KEY_ACTION_RESULTS, next.toString()).commit()) throw new CacheException("Telefon işlemi sonucu kaydedilemedi.");
    } catch (CacheException error) { throw error; }
    catch (Exception ignored) { throw new CacheException("Telefon işlemi sonucu kaydedilemedi."); }
  }

  synchronized void mergeActionResults(OperationData data) throws CacheException {
    String target = CompanionConnectionIdentity.actionTargetKey(ConnectionSettings.webModuleUrl(preferences));
    for (OperationData.ActionRecord action : data.actions) recordActionResult(action, target);
    try {
      org.json.JSONArray results = new org.json.JSONArray(preferences.getString(KEY_ACTION_RESULTS, "[]"));
      java.util.List<OperationData.ActionRecord> merged = new java.util.ArrayList<>();
      for (int i = 0; i < results.length(); i++) {
        JSONObject row = results.optJSONObject(i);
        if (row != null && target.equals(row.optString("target_key"))) {
          OperationData.ActionRecord saved = OperationData.ActionRecord.fromJson(row);
          boolean allowed = CompanionUiRules.isDecision(saved.type) ? data.hasPermission("commerce_order.view")
              : KbsUiRules.isAction(saved.type) ? KbsUiRules.canView(data) && data.hasPermission(KbsUiRules.permission(saved.type))
              : MarketUiRules.ACTION_SALE.equals(saved.type) ? MarketUiRules.canCompleteSale(data) : MarketUiRules.canViewCredit(data);
          if (allowed) merged.add(saved);
        }
      }
      for (OperationData.ActionRecord action : data.actions) {
        boolean found = false;
        for (OperationData.ActionRecord saved : merged) if (saved.id.equals(action.id)) { found = true; break; }
        if (!found) merged.add(action);
      }
      data.actions.clear(); data.actions.addAll(merged);
      data.actions.sort((left, right) -> Long.compare(actionTime(right.createdAt), actionTime(left.createdAt)));
    } catch (Exception ignored) { throw new CacheException("Telefon işlemi sonucu okunamadı."); }
  }

  private static long actionTime(String value) {
    try { return java.time.Instant.parse(value).toEpochMilli(); }
    catch (Exception ignored) { return 0; }
  }

  synchronized org.json.JSONArray pendingActionResultIds(String targetKey) {
    org.json.JSONArray ids = new org.json.JSONArray();
    try {
      org.json.JSONArray rows = new org.json.JSONArray(preferences.getString(KEY_ACTION_RESULTS, "[]"));
      for (int i = 0; i < rows.length() && ids.length() < 40; i++) {
        JSONObject row = rows.optJSONObject(i);
        if (row != null && targetKey.equals(row.optString("target_key")) && "pending".equals(row.optString("status"))) ids.put(row.optString("id"));
      }
    } catch (Exception ignored) { /* Existing full snapshot history remains the fallback. */ }
    return ids;
  }

  synchronized void markMissingActionResults(org.json.JSONArray missing, String targetKey) throws CacheException {
    if (missing == null) return;
    try {
      org.json.JSONArray results = new org.json.JSONArray(preferences.getString(KEY_ACTION_RESULTS, "[]"));
      for (int i = 0; i < results.length(); i++) {
        JSONObject row = results.optJSONObject(i);
        if (row == null || !targetKey.equals(row.optString("target_key")) || !"pending".equals(row.optString("status"))) continue;
        for (int j = 0; j < missing.length() && j < 40; j++) if (row.optString("id").equals(missing.optString(j))) {
          OperationData.ActionRecord record = OperationData.ActionRecord.fromJson(row);
          record.status = "unknown"; recordActionResult(record, targetKey); break;
        }
      }
    } catch (CacheException error) { throw error; }
    catch (Exception ignored) { throw new CacheException("Telefon işlemi sonucu okunamadı."); }
  }

  private JSONObject actionResultJson(OperationData.ActionRecord action, String targetKey) throws Exception {
    JSONObject row = new JSONObject();
    row.put("id", action.id); row.put("action_type", action.type); row.put("status", action.status);
    row.put("error_message", action.errorMessage.length() > 500 ? action.errorMessage.substring(0, 500) : action.errorMessage);
    row.put("created_at", action.createdAt); row.put("processed_at", action.processedAt);
    row.put("payload", CompanionUiRules.isDecision(action.type) ? new JSONObject().put("order_id", action.orderId)
        .put("expected_updated_at", action.expectedUpdatedAt).put("expected_status", action.expectedStatus)
        : KbsUiRules.isAction(action.type) ? new JSONObject().put("notification_id", action.notificationId).put("expected_status", action.expectedStatus) : new JSONObject());
    row.put("target_key", targetKey);
    return row;
  }

  private void applyRememberedPermissionProfile(OperationData data) {
    String serialized = preferences.getString(profileKey(), "");
    if (serialized == null || serialized.trim().isEmpty()) {
      return;
    }
    try {
      data.applyPermissionProfile(new JSONObject(serialized));
    } catch (Exception ignored) {
      JSONObject failClosed = new JSONObject();
      try {
        failClosed.put("role", "staff");
        failClosed.put("is_active", false);
        failClosed.put("permissions", new org.json.JSONArray());
        data.applyPermissionProfile(failClosed);
      } catch (Exception impossible) {
        // JSONObject backed by in-memory primitive values cannot fail here.
      }
    }
  }

  private String profileKey() {
    return KEY_DEVICE_PROFILE_PREFIX + deviceId;
  }

  static final class CacheException extends Exception {
    CacheException(String message) {
      super(message);
    }
  }
}
