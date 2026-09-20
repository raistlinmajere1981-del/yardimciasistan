package com.yardimciasistan.android;

import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

final class ActionOutbox {
  private static final String KEY_PENDING_ACTIONS_V1 = "pending_android_actions_v1";
  private static final String KEY_PENDING_ACTIONS_V2 = "pending_android_actions_v2";

  private final SharedPreferences preferences;

  ActionOutbox(SharedPreferences preferences) {
    this.preferences = preferences;
  }

  synchronized List<PendingAction> load() throws OutboxException {
    try {
      if (preferences.contains(KEY_PENDING_ACTIONS_V2)) {
        return parse(
            preferences.getString(KEY_PENDING_ACTIONS_V2, "[]"),
            false
        );
      }

      List<PendingAction> migrated = parse(
          preferences.getString(KEY_PENDING_ACTIONS_V1, "[]"),
          true
      );
      if (preferences.contains(KEY_PENDING_ACTIONS_V1)) {
        migrateLegacy(migrated);
      }
      return migrated;
    } catch (OutboxException error) {
      throw error;
    } catch (Exception error) {
      throw new OutboxException("Telefondaki bekleyen işlem kaydı okunamadı.", error);
    }
  }

  synchronized void appendAll(List<PendingAction> additions) throws OutboxException {
    ArrayList<PendingAction> actions = new ArrayList<>(load());
    for (PendingAction addition : additions) {
      boolean exists = false;
      for (PendingAction action : actions) {
        if (action.id.equals(addition.id)) {
          exists = true;
          break;
        }
      }
      if (!exists) {
        actions.add(addition);
      }
    }
    persist(actions);
  }

  synchronized void remove(String actionId) throws OutboxException {
    ArrayList<PendingAction> remaining = new ArrayList<>();
    for (PendingAction action : load()) {
      if (!action.id.equals(actionId)) {
        remaining.add(action);
      }
    }
    persist(remaining);
  }

  synchronized void clear() throws OutboxException {
    persist(new ArrayList<>());
  }

  static String createActionId() {
    return "android_action_" + UUID.randomUUID().toString().replace("-", "");
  }

  private List<PendingAction> parse(String serialized, boolean legacy) throws OutboxException {
    JSONArray source = new JSONArray(serialized == null ? "[]" : serialized);
    ArrayList<PendingAction> actions = new ArrayList<>();
    for (int index = 0; index < source.length(); index += 1) {
      JSONObject value = source.optJSONObject(index);
      if (value == null) {
        throw new OutboxException("Telefondaki bekleyen işlem kaydı okunamadı.");
      }
      actions.add(legacy ? PendingAction.fromLegacyJson(value) : PendingAction.fromJson(value));
    }
    return actions;
  }

  private void migrateLegacy(List<PendingAction> actions) throws OutboxException {
    JSONArray serialized = serialize(actions);
    boolean committed = preferences.edit()
        .putString(KEY_PENDING_ACTIONS_V2, serialized.toString())
        .remove(KEY_PENDING_ACTIONS_V1)
        .commit();
    if (!committed) {
      throw new OutboxException("Bekleyen telefon işlemleri yeni saklama biçimine taşınamadı.");
    }
  }

  private void persist(List<PendingAction> actions) throws OutboxException {
    JSONArray serialized = serialize(actions);
    if (!preferences.edit().putString(KEY_PENDING_ACTIONS_V2, serialized.toString()).commit()) {
      throw new OutboxException("Bekleyen işlem telefonda güvenli biçimde saklanamadı.");
    }
  }

  private static JSONArray serialize(List<PendingAction> actions) throws OutboxException {
    JSONArray serialized = new JSONArray();
    for (PendingAction action : actions) {
      serialized.put(action.toJson());
    }
    return serialized;
  }

  static final class PendingAction {
    final String id;
    final String type;
    final JSONObject payload;
    final String targetKey;

    private PendingAction(
        String id,
        String type,
        JSONObject payload,
        String targetKey
    ) {
      this.id = id;
      this.type = type;
      this.payload = payload;
      this.targetKey = targetKey;
    }

    static PendingAction create(
        String id,
        String type,
        JSONObject payload,
        String targetKey
    ) throws OutboxException {
      try {
        String normalizedTargetKey = targetKey == null ? "" : targetKey.trim();
        if (normalizedTargetKey.isEmpty()) {
          throw new OutboxException("İşlem hedefi belirlenemedi.");
        }
        return new PendingAction(
            id,
            type,
            new JSONObject(payload.toString()),
            normalizedTargetKey
        );
      } catch (OutboxException error) {
        throw error;
      } catch (Exception error) {
        throw new OutboxException("İşlem telefonda saklanmak üzere hazırlanamadı.", error);
      }
    }

    static PendingAction fromJson(JSONObject source) throws OutboxException {
      String id = source.optString("id", "").trim();
      String type = source.optString("type", "").trim();
      JSONObject payload = source.optJSONObject("payload");
      String targetKey = source.optString("target_key", "").trim();
      if (id.isEmpty() || type.isEmpty() || payload == null || targetKey.isEmpty()) {
        throw new OutboxException("Telefondaki bekleyen işlem kaydı eksik.");
      }
      try {
        return new PendingAction(id, type, new JSONObject(payload.toString()), targetKey);
      } catch (Exception error) {
        throw new OutboxException("Telefondaki bekleyen işlem kaydı okunamadı.", error);
      }
    }

    static PendingAction fromLegacyJson(JSONObject source) throws OutboxException {
      String id = source.optString("id", "").trim();
      String type = source.optString("type", "").trim();
      JSONObject payload = source.optJSONObject("payload");
      String targetEndpoint = source.optString("target_endpoint", "").trim();
      String targetFingerprint = source.optString("target_fingerprint", "").trim();
      String targetKey = CompanionConnectionIdentity.actionTargetKeyFromLegacyEndpoint(targetEndpoint);
      if (id.isEmpty() || type.isEmpty() || payload == null
          || targetEndpoint.isEmpty() || targetFingerprint.isEmpty() || targetKey.isEmpty()) {
        throw new OutboxException("Telefondaki eski bekleyen işlem kaydı eksik.");
      }
      try {
        return new PendingAction(id, type, new JSONObject(payload.toString()), targetKey);
      } catch (Exception error) {
        throw new OutboxException("Telefondaki eski bekleyen işlem kaydı okunamadı.", error);
      }
    }

    JSONObject toJson() throws OutboxException {
      try {
        JSONObject result = new JSONObject();
        result.put("id", id);
        result.put("type", type);
        result.put("payload", new JSONObject(payload.toString()));
        result.put("target_key", targetKey);
        return result;
      } catch (Exception error) {
        throw new OutboxException("Bekleyen işlem telefonda saklanamadı.", error);
      }
    }

    boolean matchesTarget(String targetKey) {
      String normalized = targetKey == null ? "" : targetKey.trim();
      return !normalized.isEmpty() && this.targetKey.equals(normalized);
    }
  }

  static final class OutboxException extends Exception {
    OutboxException(String message) {
      super(message);
    }

    OutboxException(String message, Throwable cause) {
      super(message, cause);
    }
  }
}
