package com.yardimciasistan.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assume.assumeTrue;

import android.content.SharedPreferences;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

import org.junit.Test;

public final class AndroidDeviceCredentialSmoke {
  private static final String TOKEN = "yat_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  private static final String CREDENTIAL = "device:" + TOKEN;

  @Test
  public void recognizesOnlyWellFormedDeviceCredentials() {
    assertTrue(ConnectionSettings.isDeviceCredential(CREDENTIAL));
    assertEquals(TOKEN, ConnectionSettings.deviceToken(CREDENTIAL));
    assertFalse(ConnectionSettings.isDeviceCredential(TOKEN));
    assertFalse(ConnectionSettings.isDeviceCredential("device:yat_short"));
    assertFalse(ConnectionSettings.isDeviceCredential("change-this-secret"));
  }

  @Test
  public void switchesOnlyTokenizedAndroidCallsToRestrictedGateways() {
    String baseUrl = "https://example.test/yardimci-asistan";
    assertEquals(baseUrl + "/api/sync.php", HostingSyncClient.toSyncEndpoint(baseUrl, "bootstrap-secret"));
    assertEquals(baseUrl + "/api/android.php", HostingSyncClient.toSyncEndpoint(baseUrl, CREDENTIAL));
    assertEquals(baseUrl + "/api/chat.php", HostingSyncClient.toChatEndpoint(baseUrl, "bootstrap-secret"));
    assertEquals(baseUrl + "/api/android-chat.php", HostingSyncClient.toChatEndpoint(baseUrl, CREDENTIAL));
    assertEquals(baseUrl + "/api/stock-image-analysis.php", HostingSyncClient.toStockImageAnalysisEndpoint(baseUrl, "bootstrap-secret"));
    assertEquals(baseUrl + "/api/android-stock-image-analysis.php", HostingSyncClient.toStockImageAnalysisEndpoint(baseUrl, CREDENTIAL));
    assertEquals(baseUrl + "/api/identity-image-analysis.php", HostingSyncClient.toIdentityImageAnalysisEndpoint(baseUrl, "bootstrap-secret"));
    assertEquals(baseUrl + "/api/android-identity-image-analysis.php", HostingSyncClient.toIdentityImageAnalysisEndpoint(baseUrl, CREDENTIAL));
  }

  @Test
  public void embeddedDefaultsNeverOverwriteDeviceToken() {
    InMemoryPreferences preferences = new InMemoryPreferences();
    preferences.edit()
        .putString(ConnectionSettings.KEY_WEB_MODULE_URL, ConnectionDefaults.WEB_MODULE_URL)
        .putString(ConnectionSettings.KEY_SYNC_SECRET, CREDENTIAL)
        .commit();

    ConnectionSettings.ensureDefaults(preferences);

    assertEquals(CREDENTIAL, preferences.getString(ConnectionSettings.KEY_SYNC_SECRET, ""));
  }

  @Test
  public void embeddedDefaultsRefreshStaleSharedSecret() {
    assumeTrue(ConnectionSettings.isEmbeddedConnectionLocked());
    InMemoryPreferences preferences = new InMemoryPreferences();
    preferences.edit()
        .putString(ConnectionSettings.KEY_WEB_MODULE_URL, ConnectionDefaults.WEB_MODULE_URL)
        .putString(ConnectionSettings.KEY_SYNC_SECRET, "stale-bootstrap-secret")
        .commit();

    ConnectionSettings.ensureDefaults(preferences);

    assertEquals(ConnectionDefaults.SYNC_SECRET, preferences.getString(ConnectionSettings.KEY_SYNC_SECRET, ""));
  }

  private static final class InMemoryPreferences implements SharedPreferences {
    private final Map<String, Object> values = new HashMap<>();

    @Override public Map<String, ?> getAll() { return new HashMap<>(values); }
    @Override public String getString(String key, String fallback) {
      Object value = values.get(key);
      return value instanceof String ? (String) value : fallback;
    }
    @Override public Set<String> getStringSet(String key, Set<String> fallback) { return fallback; }
    @Override public int getInt(String key, int fallback) { return fallback; }
    @Override public long getLong(String key, long fallback) { return fallback; }
    @Override public float getFloat(String key, float fallback) { return fallback; }
    @Override public boolean getBoolean(String key, boolean fallback) {
      Object value = values.get(key);
      return value instanceof Boolean ? (Boolean) value : fallback;
    }
    @Override public boolean contains(String key) { return values.containsKey(key); }
    @Override public Editor edit() { return new MemoryEditor(); }
    @Override public void registerOnSharedPreferenceChangeListener(OnSharedPreferenceChangeListener listener) {}
    @Override public void unregisterOnSharedPreferenceChangeListener(OnSharedPreferenceChangeListener listener) {}

    private final class MemoryEditor implements Editor {
      @Override public Editor putString(String key, String value) { values.put(key, value); return this; }
      @Override public Editor putStringSet(String key, Set<String> value) { return this; }
      @Override public Editor putInt(String key, int value) { return this; }
      @Override public Editor putLong(String key, long value) { return this; }
      @Override public Editor putFloat(String key, float value) { return this; }
      @Override public Editor putBoolean(String key, boolean value) { values.put(key, value); return this; }
      @Override public Editor remove(String key) { values.remove(key); return this; }
      @Override public Editor clear() { values.clear(); return this; }
      @Override public boolean commit() { return true; }
      @Override public void apply() {}
    }
  }
}
