package com.yardimciasistan.android;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
final class HostingSyncClient {
  private static final int CONNECT_TIMEOUT_MS = 12000;
  private static final int READ_TIMEOUT_MS = 18000;

  OperationData fetchOperations(String baseUrl, String syncSecret, String deviceId) throws SyncException {
    FetchResult result = fetchOperations(baseUrl, syncSecret, deviceId, 0L);
    return result.data == null ? new OperationData() : result.data;
  }

  FetchResult fetchOperations(String baseUrl, String syncSecret, String deviceId, long knownServerRevision) throws SyncException {
    JSONObject payload = new JSONObject();
    try {
      payload.put("action", "android_summary");
      payload.put("device_id", deviceId);
      payload.put("limit", 200);
      payload.put("known_server_revision", Math.max(0L, knownServerRevision));
    } catch (Exception error) {
      throw new SyncException("Güncelleme isteği hazırlanamadı.", error);
    }
    JSONObject response = post(baseUrl, syncSecret, payload);
    if (response.optBoolean("not_modified", false)) {
      return new FetchResult(true, Math.max(0L, response.optLong("server_revision", knownServerRevision)), null, response);
    }
    return new FetchResult(false, Math.max(0L, response.optLong("server_revision", 0L)), OperationData.fromJson(response), response);
  }

  OperationData.ActionRecord enqueueAction(
      String baseUrl,
      String syncSecret,
      String deviceId,
      String actionId,
      String actionType,
      JSONObject actionPayload
  ) throws SyncException {
    JSONObject payload = new JSONObject();
    try {
      payload.put("action", "enqueue_android_action");
      payload.put("action_id", actionId);
      payload.put("action_type", actionType);
      payload.put("device_id", deviceId);
      payload.put("payload", actionPayload);
    } catch (Exception error) {
      throw new SyncException("İşlem isteği hazırlanamadı.", error);
    }

    JSONObject response = post(baseUrl, syncSecret, payload);
    JSONObject action = response.optJSONObject("action");
    if (action == null) {
      throw new SyncException("İşlem gönderildi ancak bekleme kaydı alınamadı.");
    }
    return OperationData.ActionRecord.fromJson(action);
  }

  private JSONObject post(String baseUrl, String syncSecret, JSONObject payload) throws SyncException {
    HttpURLConnection connection = null;
    try {
      URL endpoint = new URL(toSyncEndpoint(baseUrl));
      connection = (HttpURLConnection) endpoint.openConnection();
      connection.setRequestMethod("POST");
      connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
      connection.setReadTimeout(READ_TIMEOUT_MS);
      connection.setDoOutput(true);
      connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
      connection.setRequestProperty("Accept", "application/json");
      connection.setRequestProperty("X-YA-Sync-Secret", syncSecret);

      byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
      connection.setFixedLengthStreamingMode(body.length);
      try (OutputStream output = connection.getOutputStream()) {
        output.write(body);
      }

      int status = connection.getResponseCode();
      InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
      String responseText = readAll(stream);
      JSONObject response;
      try {
        response = new JSONObject(responseText);
      } catch (Exception error) {
        throw new SyncException(status == 404
            ? "Web modülü güncel değil. Hosting paketini güncelleyip tekrar deneyin."
            : "Web modülü geçerli bir yanıt vermedi.", error);
      }

      if (status == 401) {
        throw new SyncException("Güvenlik anahtarı hatalı. Ayarlar ekranından kontrol edin.");
      }
      if (status < 200 || status >= 300 || !response.optBoolean("ok", false)) {
        String message = response.optString("message", "").trim();
        throw new SyncException(message.isEmpty() ? "İşlem web modülü tarafından kabul edilmedi." : message);
      }
      return response;
    } catch (SyncException error) {
      throw error;
    } catch (java.net.SocketTimeoutException error) {
      throw new SyncException("Bağlantı zaman aşımına uğradı. İnterneti kontrol edip tekrar deneyin.", error);
    } catch (java.net.UnknownHostException error) {
      throw new SyncException("Web modülüne ulaşılamadı. İnternet bağlantısını ve adresi kontrol edin.", error);
    } catch (Exception error) {
      throw new SyncException("Bağlantı kurulamadı. İnternet bağlantısını kontrol edip tekrar deneyin.", error);
    } finally {
      if (connection != null) {
        connection.disconnect();
      }
    }
  }

  static String toSyncEndpoint(String baseUrl) {
    String normalized = baseUrl == null ? "" : baseUrl.trim();
    while (normalized.endsWith("/")) {
      normalized = normalized.substring(0, normalized.length() - 1);
    }
    if (normalized.endsWith("/api/sync.php") || normalized.endsWith("/sync.php")) {
      return normalized;
    }
    if (normalized.endsWith("/api")) {
      return normalized + "/sync.php";
    }
    return normalized + "/api/sync.php";
  }

  private static String readAll(InputStream stream) throws Exception {
    if (stream == null) {
      return "";
    }
    StringBuilder result = new StringBuilder();
    try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
      String line;
      while ((line = reader.readLine()) != null) {
        result.append(line);
      }
    }
    return result.toString();
  }

  static final class SyncException extends Exception {
    SyncException(String message) {
      super(message);
    }

    SyncException(String message, Throwable cause) {
      super(message, cause);
    }
  }

  static final class FetchResult {
    final boolean notModified;
    final long serverRevision;
    final OperationData data;
    final JSONObject payload;

    FetchResult(boolean notModified, long serverRevision, OperationData data, JSONObject payload) {
      this.notModified = notModified;
      this.serverRevision = serverRevision;
      this.data = data;
      this.payload = payload;
    }
  }
}
