package com.yardimciasistan.android;

import android.content.SharedPreferences;

import org.json.JSONObject;

final class OperationCache {
  private static final String KEY_CACHE = "operations_cache_v1";
  private static final String KEY_DEVICE_PROFILE_PREFIX = "operations_device_profile_v1_";
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
      return data;
    } catch (Exception ignored) {
      return null;
    }
  }

  long revision() {
    OperationData cached = load();
    return cached == null ? 0L : cached.serverRevision;
  }

  void save(JSONObject payload) throws CacheException {
    SharedPreferences.Editor editor = preferences.edit().putString(KEY_CACHE, payload.toString());
    JSONObject profiles = payload.optJSONObject("androidPermissions");
    JSONObject ownProfile = profiles == null ? null : profiles.optJSONObject(deviceId);
    if (ownProfile != null) {
      editor.putString(profileKey(), ownProfile.toString());
    }
    if (!editor.commit()) {
      throw new CacheException("Canlı veri telefon önbelleğine kaydedilemedi.");
    }
  }

  void clear() throws CacheException {
    if (!preferences.edit().remove(KEY_CACHE).remove(profileKey()).commit()) {
      throw new CacheException("Eski Android verisi telefon önbelleğinden temizlenemedi.");
    }
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
