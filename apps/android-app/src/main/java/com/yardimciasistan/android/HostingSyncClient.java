package com.yardimciasistan.android;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.DataOutputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class HostingSyncClient {
  private static final int CONNECT_TIMEOUT_MS = 12000;
  private static final int READ_TIMEOUT_MS = 18000;

  OperationData fetchOperations(String baseUrl, String syncSecret, DeviceIdentity identity) throws SyncException {
    FetchResult result = fetchOperations(baseUrl, syncSecret, identity, 0L);
    return result.data == null ? new OperationData() : result.data;
  }

  FetchResult fetchOperations(String baseUrl, String syncSecret, DeviceIdentity identity, long knownServerRevision) throws SyncException {
    JSONObject payload = new JSONObject();
    try {
      payload.put("action", "android_summary");
      payload.put("device_id", identity.deviceId);
      payload.put("device_name", identity.deviceName);
      payload.put("app_version", identity.appVersion);
      payload.put("limit", 200);
      payload.put("known_server_revision", Math.max(0L, knownServerRevision));
    } catch (Exception error) {
      throw new SyncException("Güncelleme isteği hazırlanamadı.", error);
    }
    JSONObject response = post(baseUrl, syncSecret, payload);
    if (response.optBoolean("not_modified", false)) {
      return new FetchResult(true, Math.max(0L, response.optLong("server_revision", knownServerRevision)), null, response);
    }
    return new FetchResult(false, Math.max(0L, response.optLong("server_revision", 0L)), OperationData.fromJson(response, identity.deviceId), response);
  }

  OperationData.ActionRecord enqueueAction(
      String baseUrl,
      String syncSecret,
      DeviceIdentity identity,
      String actionId,
      String actionType,
      JSONObject actionPayload
  ) throws SyncException {
    JSONObject payload = new JSONObject();
    try {
      payload.put("action", "enqueue_android_action");
      payload.put("action_id", actionId);
      payload.put("action_type", actionType);
      payload.put("device_id", identity.deviceId);
      payload.put("device_name", identity.deviceName);
      payload.put("app_version", identity.appVersion);
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

  StockImageAnalysisResult analyzeStockImage(
      String baseUrl,
      String syncSecret,
      DeviceIdentity identity,
      String importId,
      StockImageFile.PreparedImage image,
      JSONArray menuItems
  ) throws SyncException {
    HttpURLConnection connection = null;
    String boundary = "----YardimciAsistanStockImage" + System.currentTimeMillis();
    try {
      URL endpoint = new URL(toStockImageAnalysisEndpoint(baseUrl));
      connection = (HttpURLConnection) endpoint.openConnection();
      connection.setRequestMethod("POST");
      connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
      connection.setReadTimeout(90_000);
      connection.setDoOutput(true);
      connection.setChunkedStreamingMode(16 * 1024);
      connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
      connection.setRequestProperty("Accept", "application/json");
      connection.setRequestProperty("X-YA-Sync-Secret", syncSecret);

      try (DataOutputStream output = new DataOutputStream(connection.getOutputStream())) {
        writeMultipartField(output, boundary, "source", "android");
        writeMultipartField(output, boundary, "device_id", identity.deviceId);
        writeMultipartField(output, boundary, "import_id", importId);
        writeMultipartField(output, boundary, "image_hash", image.imageHash);
        writeMultipartField(output, boundary, "menu_items", menuItems.toString());
        output.writeBytes("--" + boundary + "\r\n");
        output.writeBytes("Content-Disposition: form-data; name=\"image\"; filename=\"stock-document.jpg\"\r\n");
        output.writeBytes("Content-Type: " + image.mimeType + "\r\n\r\n");
        byte[] buffer = new byte[16 * 1024];
        try (FileInputStream input = new FileInputStream(image.file)) {
          int read;
          while ((read = input.read(buffer)) != -1) {
            output.write(buffer, 0, read);
          }
        }
        output.writeBytes("\r\n--" + boundary + "--\r\n");
        output.flush();
      }

      int status = connection.getResponseCode();
      InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
      String responseText = readAll(stream);
      JSONObject response;
      try {
        response = new JSONObject(responseText);
      } catch (Exception error) {
        throw new SyncException(status == 404
            ? "Web modülü görsel analizini desteklemiyor. Hosting paketini güncelleyin."
            : "Görsel analiz hizmeti geçerli bir yanıt vermedi.", error);
      }
      if (status == 401) {
        throw new SyncException("Güvenlik anahtarı hatalı. Ayarlar ekranından kontrol edin.");
      }
      if (status == 403) {
        throw new SyncException("Bu cihazın stok güncelleme yetkisi yok.");
      }
      if (status < 200 || status >= 300 || !response.optBoolean("ok", false)) {
        String message = response.optString("message", "").trim();
        throw new SyncException(message.isEmpty() ? "Görsel analiz edilemedi." : message);
      }
      JSONObject analysis = response.optJSONObject("analysis");
      String responseImportId = response.optString("import_id", "").trim();
      String responseHash = response.optString("image_hash", "").trim().toLowerCase(java.util.Locale.US);
      if (analysis == null || !importId.equals(responseImportId) || !image.imageHash.equals(responseHash)) {
        throw new SyncException("Görsel analiz cevabı doğrulanamadı.");
      }
      return new StockImageAnalysisResult(
          responseImportId,
          responseHash,
          response.optString("message", "Görsel analiz edildi."),
          analysis
      );
    } catch (SyncException error) {
      throw error;
    } catch (java.net.SocketTimeoutException error) {
      throw new SyncException("AI görsel analizi zaman aşımına uğradı.", error);
    } catch (java.net.UnknownHostException error) {
      throw new SyncException("Görsel analiz hizmetine ulaşılamadı. İnternet bağlantısını kontrol edin.", error);
    } catch (Exception error) {
      throw new SyncException("Görsel analiz hizmetine bağlanılamadı.", error);
    } finally {
      if (connection != null) {
        connection.disconnect();
      }
    }
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

  static String toStockImageAnalysisEndpoint(String baseUrl) {
    String normalized = baseUrl == null ? "" : baseUrl.trim();
    while (normalized.endsWith("/")) {
      normalized = normalized.substring(0, normalized.length() - 1);
    }
    normalized = normalized.replaceFirst("/(?:api/)?sync\\.php$", "");
    return normalized + "/api/stock-image-analysis.php";
  }

  private static void writeMultipartField(DataOutputStream output, String boundary, String name, String value) throws Exception {
    output.writeBytes("--" + boundary + "\r\n");
    output.writeBytes("Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n");
    output.write(value.getBytes(StandardCharsets.UTF_8));
    output.writeBytes("\r\n");
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

  static final class StockImageAnalysisResult {
    final String importId;
    final String imageHash;
    final String message;
    final JSONObject analysis;

    StockImageAnalysisResult(String importId, String imageHash, String message, JSONObject analysis) {
      this.importId = importId;
      this.imageHash = imageHash;
      this.message = message;
      this.analysis = analysis;
    }
  }
}
