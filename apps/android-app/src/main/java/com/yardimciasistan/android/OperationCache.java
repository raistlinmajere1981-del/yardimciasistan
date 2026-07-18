package com.yardimciasistan.android;

import android.content.SharedPreferences;

import org.json.JSONObject;

final class OperationCache {
  private static final String KEY_CACHE = "operations_cache_v1";
  private final SharedPreferences preferences;

  OperationCache(SharedPreferences preferences) {
    this.preferences = preferences;
  }

  OperationData load() {
    try {
      String serialized = preferences.getString(KEY_CACHE, "");
      if (serialized == null || serialized.trim().isEmpty()) {
        return null;
      }
      return OperationData.fromJson(new JSONObject(serialized));
    } catch (Exception ignored) {
      return null;
    }
  }

  long revision() {
    OperationData cached = load();
    return cached == null ? 0L : cached.serverRevision;
  }

  void save(JSONObject payload) throws CacheException {
    if (!preferences.edit().putString(KEY_CACHE, payload.toString()).commit()) {
      throw new CacheException("Canlı veri telefon önbelleğine kaydedilemedi.");
    }
  }

  static final class CacheException extends Exception {
    CacheException(String message) {
      super(message);
    }
  }
}
