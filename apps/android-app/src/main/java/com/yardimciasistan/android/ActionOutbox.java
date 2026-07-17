package com.yardimciasistan.android;

import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

final class ActionOutbox {
  private static final String KEY_PENDING_ACTIONS = "pending_android_actions_v1";

  private final SharedPreferences preferences;

  ActionOutbox(SharedPreferences preferences) {
    this.preferences = preferences;
  }

  synchronized List<PendingAction> load() throws OutboxException {
    try {
      String serialized = preferences.getString(KEY_PENDING_ACTIONS, "[]");
      JSONArray source = new JSONArray(serialized == null ? "[]" : serialized);
      ArrayList<PendingAction> actions = new ArrayList<>();
      for (int index = 0; index < source.length(); index += 1) {
        JSONObject value = source.optJSONObject(index);
        if (value == null) {
          throw new OutboxException("Telefondaki bekleyen işlem kaydı okunamadı.");
        }
        actions.add(PendingAction.fromJson(value));
      }
      return actions;
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

  static String createActionId() {
    return "android_action_" + UUID.randomUUID().toString().replace("-", "");
  }

  static String targetFingerprint(String baseUrl, String syncSecret) throws OutboxException {
    try {
      String endpoint = HostingSyncClient.toSyncEndpoint(baseUrl);
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] encoded = digest.digest((endpoint + "\u0000" + syncSecret).getBytes(StandardCharsets.UTF_8));
      StringBuilder fingerprint = new StringBuilder();
      for (byte value : encoded) {
        fingerprint.append(String.format(java.util.Locale.US, "%02x", value & 0xff));
      }
      return fingerprint.toString();
    } catch (Exception error) {
      throw new OutboxException("İşlem hedefi güvenli biçimde doğrulanamadı.", error);
    }
  }

  private void persist(List<PendingAction> actions) throws OutboxException {
    JSONArray serialized = new JSONArray();
    for (PendingAction action : actions) {
      serialized.put(action.toJson());
    }
    if (!preferences.edit().putString(KEY_PENDING_ACTIONS, serialized.toString()).commit()) {
      throw new OutboxException("Bekleyen işlem telefonda güvenli biçimde saklanamadı.");
    }
  }

  static final class PendingAction {
    final String id;
    final String type;
    final JSONObject payload;
    final String targetEndpoint;
    final String targetFingerprint;

    private PendingAction(
        String id,
        String type,
        JSONObject payload,
        String targetEndpoint,
        String targetFingerprint
    ) {
      this.id = id;
      this.type = type;
      this.payload = payload;
      this.targetEndpoint = targetEndpoint;
      this.targetFingerprint = targetFingerprint;
    }

    static PendingAction create(
        String id,
        String type,
        JSONObject payload,
        String baseUrl,
        String syncSecret
    ) throws OutboxException {
      try {
        return new PendingAction(
            id,
            type,
            new JSONObject(payload.toString()),
            HostingSyncClient.toSyncEndpoint(baseUrl),
            ActionOutbox.targetFingerprint(baseUrl, syncSecret)
        );
      } catch (Exception error) {
        throw new OutboxException("İşlem telefonda saklanmak üzere hazırlanamadı.", error);
      }
    }

    static PendingAction fromJson(JSONObject source) throws OutboxException {
      String id = source.optString("id", "").trim();
      String type = source.optString("type", "").trim();
      JSONObject payload = source.optJSONObject("payload");
      String targetEndpoint = source.optString("target_endpoint", "").trim();
      String targetFingerprint = source.optString("target_fingerprint", "").trim();
      if (id.isEmpty() || type.isEmpty() || payload == null
          || targetEndpoint.isEmpty() || targetFingerprint.isEmpty()) {
        throw new OutboxException("Telefondaki bekleyen işlem kaydı eksik.");
      }
      try {
        return new PendingAction(id, type, new JSONObject(payload.toString()), targetEndpoint, targetFingerprint);
      } catch (Exception error) {
        throw new OutboxException("Telefondaki bekleyen işlem kaydı okunamadı.", error);
      }
    }

    JSONObject toJson() throws OutboxException {
      try {
        JSONObject result = new JSONObject();
        result.put("id", id);
        result.put("type", type);
        result.put("payload", new JSONObject(payload.toString()));
        result.put("target_endpoint", targetEndpoint);
        result.put("target_fingerprint", targetFingerprint);
        return result;
      } catch (Exception error) {
        throw new OutboxException("Bekleyen işlem telefonda saklanamadı.", error);
      }
    }

    boolean matchesTarget(String baseUrl, String syncSecret) throws OutboxException {
      return targetEndpoint.equals(HostingSyncClient.toSyncEndpoint(baseUrl))
          && targetFingerprint.equals(ActionOutbox.targetFingerprint(baseUrl, syncSecret));
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
