package com.yardimciasistan.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.SharedPreferences;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

import org.json.JSONObject;
import org.junit.Test;

public final class AndroidCompanionStorageTest {
  @Test
  public void companionKeysSeparateLogicalTargetFromRevisionSource() {
    String baseUrl = "https://example.test/yardimci-asistan/";
    assertEquals(
        "companion:https://example.test/yardimci-asistan",
        CompanionConnectionIdentity.actionTargetKey(baseUrl)
    );
    assertEquals(
        "hosting:https://example.test/yardimci-asistan",
        CompanionConnectionIdentity.hostingSourceKey(baseUrl)
    );
    assertEquals(
        "local:desktop-123",
        CompanionConnectionIdentity.localSourceKey(" desktop-123 ")
    );
  }

  @Test
  public void actionOutboxUsesCurrentTransportNeutralTarget() throws Exception {
    InMemoryPreferences preferences = new InMemoryPreferences();

    ActionOutbox outbox = new ActionOutbox(preferences);

    ActionOutbox.PendingAction action = ActionOutbox.PendingAction.create(
        "android_action_test",
        "room_update",
        new JSONObject().put("room_id", "room-1"),
        "companion:https://example.test/yardimci-asistan"
    );
    java.util.ArrayList<ActionOutbox.PendingAction> additions = new java.util.ArrayList<>();
    additions.add(action);
    outbox.appendAll(additions);

    java.util.List<ActionOutbox.PendingAction> loaded = outbox.load();
    assertEquals(1, loaded.size());
    assertTrue(loaded.get(0).matchesTarget("companion:https://example.test/yardimci-asistan"));
    assertFalse(loaded.get(0).matchesTarget("companion:https://other.example"));
    String stored = preferences.getString("pending_android_actions_v2", "");
    assertTrue(stored.contains("target_key"));
    assertFalse(stored.contains("target_fingerprint"));
  }

  @Test
  public void operationCacheKeepsRevisionPerSource() throws Exception {
    InMemoryPreferences preferences = new InMemoryPreferences();
    OperationCache cache = new OperationCache(preferences, "device-123");

    JSONObject hostingPayload = new JSONObject().put("server_revision", 12);
    cache.save(
        hostingPayload,
        "hosting:https://example.test/yardimci-asistan",
        12
    );
    assertEquals(12L, cache.revision("hosting:https://example.test/yardimci-asistan"));
    assertEquals(0L, cache.revision("local:desktop-123"));

    JSONObject localPayload = new JSONObject().put("server_revision", 3);
    cache.save(localPayload, "local:desktop-123", 3);
    assertEquals(12L, cache.revision("hosting:https://example.test/yardimci-asistan"));
    assertEquals(3L, cache.revision("local:desktop-123"));

    cache.clear();
    assertEquals(0L, cache.revision("hosting:https://example.test/yardimci-asistan"));
    assertEquals(0L, cache.revision("local:desktop-123"));
  }

  @Test
  public void lowerSourceRevisionCannotRepopulateRevokedSnapshot() throws Exception {
    InMemoryPreferences preferences = new InMemoryPreferences();
    OperationCache cache = new OperationCache(preferences, "device-123");
    JSONObject withdrawn = new JSONObject().put("server_revision", 12)
        .put("business_capabilities", new org.json.JSONArray(new String[] { "service.android", "commerce.orders" }))
        .put("androidPermissions", new JSONObject().put("device-123", new JSONObject().put("role", "staff").put("is_active", false)));
    cache.save(withdrawn, "hosting:test", 12);
    try {
      cache.save(new JSONObject().put("server_revision", 11), "hosting:test", 11);
      org.junit.Assert.fail("Older source revision must be rejected");
    } catch (OperationCache.CacheException expected) {
      assertEquals(12L, cache.revision("hosting:test"));
      assertFalse(cache.load().deviceActive);
      assertTrue(cache.load().companion.orders.isEmpty());
    }
  }

  @Test
  public void offlineCommerceRetryKeepsActionIdIntentAndLogicalTarget() throws Exception {
    InMemoryPreferences preferences = new InMemoryPreferences();
    ActionOutbox outbox = new ActionOutbox(preferences);
    ActionOutbox.PendingAction action = ActionOutbox.PendingAction.create("commerce_retry_001", "commerce_order_confirm",
        new JSONObject().put("order_id", "order-1").put("expected_updated_at", "2026-10-12T12:00:00Z").put("expected_status", "placed"), "companion:target");
    java.util.ArrayList<ActionOutbox.PendingAction> actions = new java.util.ArrayList<>(); actions.add(action);
    outbox.appendAll(actions);
    ActionOutbox.PendingAction retry = new ActionOutbox(preferences).load().get(0);
    assertEquals(action.id, retry.id);
    assertEquals("commerce_order_confirm", retry.type);
    assertEquals("order-1", retry.payload.optString("order_id"));
    assertEquals("2026-10-12T12:00:00Z", retry.payload.optString("expected_updated_at"));
    assertEquals("placed", retry.payload.optString("expected_status"));
    assertTrue(retry.matchesTarget("companion:target"));
  }

  static final class InMemoryPreferences implements SharedPreferences {
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
      private final Map<String, Object> pending = new HashMap<>();
      private final java.util.HashSet<String> removals = new java.util.HashSet<>();
      private boolean clear;

      @Override public Editor putString(String key, String value) { pending.put(key, value); removals.remove(key); return this; }
      @Override public Editor putStringSet(String key, Set<String> value) { return this; }
      @Override public Editor putInt(String key, int value) { pending.put(key, value); removals.remove(key); return this; }
      @Override public Editor putLong(String key, long value) { pending.put(key, value); removals.remove(key); return this; }
      @Override public Editor putFloat(String key, float value) { pending.put(key, value); removals.remove(key); return this; }
      @Override public Editor putBoolean(String key, boolean value) { pending.put(key, value); removals.remove(key); return this; }
      @Override public Editor remove(String key) { removals.add(key); pending.remove(key); return this; }
      @Override public Editor clear() { clear = true; pending.clear(); removals.clear(); return this; }
      @Override public boolean commit() {
        if (clear) values.clear();
        for (String key : removals) values.remove(key);
        values.putAll(pending);
        return true;
      }
      @Override public void apply() { commit(); }
    }
  }
}
