package com.yardimciasistan.android;

import org.json.JSONObject;
import org.json.JSONException;
import java.util.Arrays;
import java.util.Iterator;

final class KbsUiRules {
  static final String SEND = "kbs_send_request";
  static final String RETRY = "kbs_retry_prepare";
  static final String EXTERNAL = "kbs_mark_sent_externally";
  private KbsUiRules() {}

  static boolean isAction(String type) { return SEND.equals(type) || RETRY.equals(type) || EXTERNAL.equals(type); }
  static boolean canReadProjection(OperationData data) {
    return data != null && data.isAdmin() && data.hasPermission("kbs.view")
        && data.hasBusinessCapability("accommodation.rooms") && data.hasBusinessCapability("accommodation.stays");
  }
  static boolean canView(OperationData data) { return canReadProjection(data) && data.kbs.enabled; }
  static boolean canSend(OperationData data, OperationData.KbsNotification row) {
    if (!canView(data) || !data.hasPermission("kbs.send") || !data.kbs.configured || !row.identityReady
        || !"pending".equals(row.status) || row.deliveryRequested) return false;
    for (OperationData.ActionRecord action : data.actions) {
      if (SEND.equals(action.type) && row.id.equals(action.notificationId) && "pending".equals(action.status)) return false;
    }
    return true;
  }
  static boolean canRetry(OperationData data, OperationData.KbsNotification row) {
    return canView(data) && data.hasPermission("kbs.retry") && "failed".equals(row.status) && row.retryReady;
  }
  static boolean canReconcile(OperationData data, OperationData.KbsNotification row) {
    return canView(data) && data.hasPermission("kbs.reconcile_external") && !"sent".equals(row.status);
  }
  static String permission(String type) {
    return SEND.equals(type) ? "kbs.send" : RETRY.equals(type) ? "kbs.retry" : EXTERNAL.equals(type) ? "kbs.reconcile_external" : null;
  }
  static String statusLabel(String status) {
    if ("sent".equals(status)) return "Resmi olarak gönderildi";
    if ("submission_unknown".equals(status)) return "Sonuç belirsiz";
    if ("failed".equals(status)) return "Gönderim başarısız";
    return "Gönderim bekliyor";
  }
  static String actionFeedback(String type, String status) {
    if ("applied".equals(status)) return SEND.equals(type)
        ? "Masaüstüne ulaştı; resmi gönderim durumunu bildirim kaydından kontrol edin."
        : "KBS işlemi masaüstünde kaydedildi.";
    if ("failed".equals(status)) return "Masaüstü isteği reddetti; bildirim durumunu kontrol edin.";
    if ("unknown".equals(status)) return "İstek sonucu bulunamadı; resmi bildirim durumunu yenileyin.";
    return "Kuyruğa alındı; masaüstüne ulaşması bekleniyor.";
  }
  static JSONObject payload(OperationData data, OperationData.KbsNotification row, String type, boolean portalVerified, boolean secondConfirmation) throws JSONException {
    JSONObject value = new JSONObject().put("notification_id", row.id).put("provider", data.kbs.provider).put("expected_status", row.status);
    if (EXTERNAL.equals(type)) {
      if (!portalVerified || !secondConfirmation) throw new IllegalArgumentException("Resmi portal kontrolü ve ikinci onay gerekli.");
      value.put("portal_record_verified", true).put("external_confirmation", "government_portal_verified");
    }
    String error = validationError(data, type, value);
    if (!error.isEmpty()) throw new IllegalArgumentException(error);
    return value;
  }
  static String validationError(OperationData data, String type, JSONObject payload) {
    if (!isAction(type) || !canView(data) || !data.hasPermission(permission(type)) || payload == null) return "KBS işlem yetkisi yok.";
    Iterator<String> keys = payload.keys();
    while (keys.hasNext()) {
      String key = keys.next();
      if (!Arrays.asList("notification_id", "provider", "expected_status").contains(key)
          && !(EXTERNAL.equals(type) && Arrays.asList("portal_record_verified", "external_confirmation").contains(key))) return "KBS isteği desteklenmeyen alan içeriyor.";
    }
    OperationData.KbsNotification row = null;
    for (OperationData.KbsNotification current : data.kbs.notifications) if (current.id.equals(payload.optString("notification_id"))) row = current;
    if (row == null || !row.status.equals(payload.optString("expected_status")) || !data.kbs.provider.equals(payload.optString("provider"))) return "Güncel KBS bildirimi gerekli.";
    if (SEND.equals(type) && !canSend(data, row)) return "Bu bildirimin gönderimi talep edilemez.";
    if (RETRY.equals(type) && !canRetry(data, row)) return "Yalnız kesin ret kanıtı bulunan başarısız bildirim yeniden denemeye hazırlanabilir.";
    if (EXTERNAL.equals(type) && (!canReconcile(data, row) || !Boolean.TRUE.equals(payload.opt("portal_record_verified"))
        || !"government_portal_verified".equals(payload.optString("external_confirmation")))) return "Resmi portal kontrolü ve ikinci onay gerekli.";
    return "";
  }

  /** Rebuild the private projection before disk caching, even if the producer sent extra fields. */
  static JSONObject redactSnapshotForCache(JSONObject source, String deviceId) throws JSONException {
    JSONObject result = new JSONObject(source.toString());
    OperationData data = OperationData.fromJson(source, deviceId);
    result.remove("kbs_settings"); result.remove("kbs_service_settings");
    result.put("kbs", JSONObject.NULL);
    if (canView(data)) {
      JSONObject kbs = new JSONObject().put("enabled", true).put("configured", data.kbs.configured).put("provider", data.kbs.provider)
          .put("pending_count", data.kbs.pendingCount).put("failed_count", data.kbs.failedCount).put("submission_unknown_count", data.kbs.unknownCount)
          .put("sent_count", data.kbs.sentCount).put("identity_ready_count", data.kbs.identityReadyCount).put("identity_missing_count", data.kbs.identityMissingCount);
      org.json.JSONArray rows = new org.json.JSONArray();
      for (OperationData.KbsNotification row : data.kbs.notifications) rows.put(new JSONObject().put("id", row.id).put("customer_name", row.customerName)
          .put("room_name", row.roomName).put("room_number", row.roomNumber).put("kind", row.kind).put("status", row.status).put("occurred_at", row.occurredAt)
          .put("identity_ready", row.identityReady).put("retry_ready", row.retryReady).put("delivery_requested", row.deliveryRequested).put("request_state", row.requestState));
      result.put("kbs", kbs.put("notifications", rows));
    }
    org.json.JSONArray customers = result.optJSONArray("customers");
    if (customers != null) for (int i = 0; i < customers.length(); i++) {
      JSONObject row = customers.optJSONObject(i);
      if (row != null) { row.put("identity_number", ""); row.put("document_serial_number", ""); }
    }
    for (String key : new String[] { "actions", "action_results" }) {
      org.json.JSONArray rows = result.optJSONArray(key), safe = new org.json.JSONArray();
      if (rows != null) for (int i = 0; i < rows.length(); i++) {
        JSONObject row = rows.optJSONObject(i);
        if (row == null || (isAction(row.optString("action_type")) && !canView(data))) continue;
        if (isAction(row.optString("action_type"))) {
          JSONObject payload = row.optJSONObject("payload");
          row.put("payload", payload == null ? new JSONObject() : new JSONObject()
              .put("notification_id", payload.optString("notification_id")).put("expected_status", payload.optString("expected_status")));
        }
        safe.put(row);
      }
      if (rows != null) result.put(key, safe);
    }
    return result;
  }
}
