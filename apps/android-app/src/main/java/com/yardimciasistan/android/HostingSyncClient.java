package com.yardimciasistan.android;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Timer;
import java.util.TimerTask;
import javax.net.ssl.HttpsURLConnection;

final class HostingSyncClient {
  interface AudioConnectionFactory { HttpsURLConnection open(URL url) throws java.io.IOException; }
  private final AudioConnectionFactory audioConnections;
  private static final int CONNECT_TIMEOUT_MS = 12000;
  private static final int READ_TIMEOUT_MS = 18000;

  HostingSyncClient() { this(url -> (HttpsURLConnection) url.openConnection()); }
  HostingSyncClient(AudioConnectionFactory audioConnections) { this.audioConnections = audioConnections; }

  /** Direct Hosting only: deliberately never enters the LAN router or token bootstrap. */
  String transcribeAudio(String baseUrl, String credential, DeviceIdentity identity,
      File audio, AudioRequest request) throws SyncException {
    if (!ConnectionSettings.isDeviceCredential(credential) || !AndroidVoiceRules.httpsHosting(baseUrl)) {
      throw new SyncException("Dikte için HTTPS Hosting ve kişisel cihaz bağlantısı gerekli.");
    }
    if (audio == null || audio.length() <= 0 || audio.length() > AndroidVoiceRules.MAX_AUDIO_BYTES) {
      throw new SyncException("Ses kaydı boş veya 5 MiB sınırını aşıyor.");
    }
    HttpsURLConnection connection = null;
    Timer deadline = new Timer("android-dictation-timeout", true);
    deadline.schedule(new TimerTask() {
      @Override public void run() { request.timeout(); }
    }, 70_000);
    try {
      request.check();
      String boundary = "----YardimciAsistanAudio" + java.util.UUID.randomUUID();
      ByteArrayOutputStream fields = new ByteArrayOutputStream();
      try (DataOutputStream prefix = new DataOutputStream(fields)) {
        writeMultipartField(prefix, boundary, "source", "android");
        writeMultipartField(prefix, boundary, "device_id", identity.deviceId);
        prefix.writeBytes("--" + boundary + "\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"dictation.m4a\"\r\n");
        prefix.writeBytes("Content-Type: audio/mp4\r\n\r\n");
      }
      byte[] prefix = fields.toByteArray();
      byte[] suffix = ("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8);
      connection = audioConnections.open(new URL(normalizeBaseUrl(baseUrl) + "/api/audio-transcribe.php"));
      request.attach(connection);
      connection.setInstanceFollowRedirects(false);
      connection.setRequestMethod("POST");
      connection.setConnectTimeout(10_000);
      connection.setReadTimeout(65_000);
      connection.setDoOutput(true);
      connection.setFixedLengthStreamingMode(prefix.length + audio.length() + suffix.length);
      connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
      connection.setRequestProperty("Accept", "application/json");
      applyAuthorization(connection, credential, identity);
      try (OutputStream output = connection.getOutputStream(); FileInputStream input = new FileInputStream(audio)) {
        request.check();
        output.write(prefix);
        byte[] buffer = new byte[16 * 1024];
        int count;
        long total = 0;
        while ((count = input.read(buffer)) != -1) {
          request.check();
          total += count;
          if (total > AndroidVoiceRules.MAX_AUDIO_BYTES) throw new SyncException("Ses kaydı 5 MiB sınırını aşıyor.");
          output.write(buffer, 0, count);
        }
        output.write(suffix);
      }
      request.check();
      int status = connection.getResponseCode();
      // Keep status even when a proxy returns HTML or an empty denial body.
      // Raw error bodies never enter UI, diagnostics or transcript parsing.
      if (status != 200) throw audioHttpFailure(status);
      InputStream stream = connection.getInputStream();
      ByteArrayOutputStream responseBytes = new ByteArrayOutputStream();
      if (stream != null) try (InputStream input = stream) {
        byte[] buffer = new byte[4096];
        int count;
        while ((count = input.read(buffer)) != -1) {
          request.check();
          if (responseBytes.size() + count > 128 * 1024) throw new SyncException("Dikte yanıtı okunamadı.");
          responseBytes.write(buffer, 0, count);
        }
      }
      request.check();
      JSONObject response = new JSONObject(new String(responseBytes.toByteArray(), StandardCharsets.UTF_8));
      if (!response.optBoolean("ok", false)) throw audioHttpFailure(status);
      Object value = response.opt("text");
      if (!(value instanceof String) || ((String) value).length() > AndroidVoiceRules.MAX_TEXT_CHARS) {
        throw new SyncException("Dikte yanıtı okunamadı.");
      }
      return ((String) value).replace(ConnectionSettings.deviceToken(credential), "[gizlendi]");
    } catch (SyncException error) {
      throw error;
    } catch (Exception ignored) {
      throw new SyncException(request.timedOut ? "Dikte yanıtı zamanında alınamadı." : "Dikte bağlantısı tamamlanamadı.");
    } finally {
      deadline.cancel();
      request.detach();
      if (connection != null) connection.disconnect();
    }
  }

  private static SyncException audioHttpFailure(int status) {
    String message = status == 401 ? "Telefon bağlantısı doğrulanamadı. Cihazı yeniden eşleştirin."
        : status == 403 ? "Bu telefonun güncel onayı veya dikte yetkisi yok."
        : status == 413 ? "Ses kaydı 5 MiB sınırını aşıyor."
        : status == 415 ? "Ses kaydı biçimi Hosting tarafından desteklenmiyor."
        : status == 422 ? "Konuşma tanıma modeli Hosting'de etkin değil veya kayıt geçersiz. Ayarları yayınlayın."
        : "Ses metne çevrilemedi. Bağlantı ve AI ayarlarını kontrol edin.";
    return new SyncException(message, "audio_transcription_failed", status);
  }

  static final class AudioRequest {
    private boolean canceled;
    private volatile boolean timedOut;
    private HttpURLConnection connection;
    synchronized void check() throws SyncException {
      if (canceled) throw new SyncException(timedOut ? "Dikte yanıtı zamanında alınamadı." : "Dikte iptal edildi.");
    }
    synchronized void attach(HttpURLConnection value) throws SyncException {
      check();
      connection = value;
    }
    synchronized void detach() { connection = null; }
    synchronized void cancel() {
      canceled = true;
      if (connection != null) connection.disconnect();
    }
    synchronized void timeout() { timedOut = true; cancel(); }
  }

  OperationData fetchOperations(String baseUrl, String credential, DeviceIdentity identity) throws SyncException {
    FetchResult result = fetchOperations(baseUrl, credential, identity, 0L);
    return result.data == null ? new OperationData() : result.data;
  }

  FetchResult fetchOperations(String baseUrl, String credential, DeviceIdentity identity, long knownServerRevision) throws SyncException {
    JSONObject payload = new JSONObject();
    try {
      payload.put("action", "android_summary");
      payload.put("device_id", identity.deviceId);
      payload.put("device_name", identity.deviceName);
      payload.put("app_version", identity.appVersion);
      payload.put("limit", 200);
      payload.put("known_server_revision", Math.max(0L, knownServerRevision));
      payload.put("action_result_ids", new OperationCache(identity.preferences, identity.deviceId)
          .pendingActionResultIds(CompanionConnectionIdentity.actionTargetKey(baseUrl)));
    } catch (Exception error) {
      throw new SyncException("Güncelleme isteği hazırlanamadı.", error);
    }
    JSONObject response = post(baseUrl, credential, identity, payload);
    tryUpgradeDeviceCredential(baseUrl, credential, identity, response);
    if (response.optBoolean("not_modified", false)) {
      return new FetchResult(true, Math.max(0L, response.optLong("server_revision", knownServerRevision)), null, response);
    }
    return new FetchResult(false, Math.max(0L, response.optLong("server_revision", 0L)), OperationData.fromJson(response, identity.deviceId), response);
  }

  OperationData.ActionRecord enqueueAction(
      String baseUrl,
      String credential,
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

    JSONObject response = post(baseUrl, credential, identity, payload);
    JSONObject action = response.optJSONObject("action");
    if (action == null) {
      throw new SyncException("İşlem gönderildi ancak bekleme kaydı alınamadı.");
    }
    return OperationData.ActionRecord.fromJson(action);
  }

  String generateReportComment(
      String baseUrl,
      String credential,
      DeviceIdentity identity,
      String reportMode,
      String reportPreset
  ) throws SyncException {
    if (!"summary".equals(reportMode)
        && !"attention".equals(reportMode)
        && !"sales".equals(reportMode)
        && !"recommendations".equals(reportMode)) {
      throw new SyncException("AI rapor yorumu seçimi geçersiz.");
    }
    if (!AndroidUiRules.isReportPreset(reportPreset)) {
      throw new SyncException("AI rapor dönemi geçersiz.");
    }

    JSONObject payload = new JSONObject();
    try {
      payload.put("report_mode", reportMode);
      payload.put("report_preset", reportPreset);
      payload.put("device_id", identity.deviceId);
    } catch (Exception error) {
      throw new SyncException("AI rapor yorumu isteği hazırlanamadı.", error);
    }
    JSONObject response = postJson(
        toChatEndpoint(baseUrl, credential),
        credential,
        identity,
        payload,
        60_000,
        "Web modülü AI rapor yorumunu desteklemiyor. Hosting paketini güncelleyin."
    );
    String answer = response.optString("answer", "").trim();
    if (answer.isEmpty()) {
      throw new SyncException("Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı.");
    }
    return answer;
  }

  StockImageAnalysisResult analyzeStockImage(
      String baseUrl,
      String credential,
      DeviceIdentity identity,
      String importId,
      StockImageFile.PreparedImage image,
      JSONArray menuItems
  ) throws SyncException {
    HttpURLConnection connection = null;
    String boundary = "----YardimciAsistanStockImage" + System.currentTimeMillis();
    try {
      URL endpoint = new URL(toStockImageAnalysisEndpoint(baseUrl, credential));
      connection = (HttpURLConnection) endpoint.openConnection();
      connection.setRequestMethod("POST");
      connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
      connection.setReadTimeout(90_000);
      connection.setDoOutput(true);
      connection.setChunkedStreamingMode(16 * 1024);
      connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
      connection.setRequestProperty("Accept", "application/json");
      applyAuthorization(connection, credential, identity);

      try (DataOutputStream output = new DataOutputStream(connection.getOutputStream())) {
        writeMultipartField(output, boundary, "source", "android");
        writeMultipartField(output, boundary, "device_id", identity.deviceId);
        writeMultipartField(output, boundary, "import_id", importId);
        writeMultipartField(output, boundary, "image_hash", image.imageHash);
        writeMultipartField(output, boundary, "products", menuItems.toString());
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
        String message = response.optString("message", "").trim();
        String code = response.optString("code", "").trim();
        throw new SyncException(
            message.isEmpty()
                ? "Telefon bağlantısı doğrulanamadı. Cihazı masaüstünden yeniden eşleştirin."
                : message,
            code,
            status
        );
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

  IdentityImageAnalysisResult analyzeIdentityImage(
      String baseUrl,
      String credential,
      DeviceIdentity identity,
      StockImageFile.PreparedImage image
  ) throws SyncException {
    HttpURLConnection connection = null;
    String boundary = "----YardimciAsistanIdentityImage" + System.currentTimeMillis();
    try {
      URL endpoint = new URL(toIdentityImageAnalysisEndpoint(baseUrl, credential));
      connection = (HttpURLConnection) endpoint.openConnection();
      connection.setRequestMethod("POST");
      connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
      connection.setReadTimeout(90_000);
      connection.setDoOutput(true);
      connection.setChunkedStreamingMode(16 * 1024);
      connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
      connection.setRequestProperty("Accept", "application/json");
      applyAuthorization(connection, credential, identity);

      try (DataOutputStream output = new DataOutputStream(connection.getOutputStream())) {
        writeMultipartField(output, boundary, "source", "android");
        writeMultipartField(output, boundary, "device_id", identity.deviceId);
        writeMultipartField(output, boundary, "image_hash", image.imageHash);
        output.writeBytes("--" + boundary + "\r\n");
        output.writeBytes("Content-Disposition: form-data; name=\"image\"; filename=\"identity-document.jpg\"\r\n");
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
            ? "Web modülü kimlik görseli analizini desteklemiyor. Hosting paketini güncelleyin."
            : "Kimlik görseli analiz hizmeti geçerli bir yanıt vermedi.", error);
      }
      if (status == 401) {
        throw new SyncException("Telefon bağlantısı doğrulanamadı. Cihazı masaüstünden yeniden eşleştirin.");
      }
      if (status == 403) {
        throw new SyncException("Kimlik görseli analizi yalnız aktif yönetici cihazlarda kullanılabilir.");
      }
      if (status < 200 || status >= 300 || !response.optBoolean("ok", false)) {
        String message = response.optString("message", "").trim();
        throw new SyncException(message.isEmpty() ? "Kimlik görseli analiz edilemedi." : message);
      }
      JSONObject analysis = response.optJSONObject("analysis");
      String responseHash = response.optString("image_hash", "").trim().toLowerCase(java.util.Locale.US);
      if (analysis == null || !image.imageHash.equals(responseHash)) {
        throw new SyncException("Kimlik görseli analiz cevabı doğrulanamadı.");
      }
      return new IdentityImageAnalysisResult(
          response.optString("message", "Kimlik alanları okundu. Bilgileri kontrol edin."),
          analysis
      );
    } catch (SyncException error) {
      throw error;
    } catch (java.net.SocketTimeoutException error) {
      throw new SyncException("Kimlik görseli analizi zaman aşımına uğradı.", error);
    } catch (java.net.UnknownHostException error) {
      throw new SyncException("Kimlik görseli analiz hizmetine ulaşılamadı. İnternet bağlantısını kontrol edin.", error);
    } catch (Exception error) {
      throw new SyncException("Kimlik görseli analiz hizmetine bağlanılamadı.", error);
    } finally {
      if (connection != null) {
        connection.disconnect();
      }
    }
  }

  String claimBootstrapDeviceToken(
      String baseUrl,
      String bootstrapTicket,
      DeviceIdentity identity
  ) throws SyncException {
    JSONObject request = new JSONObject();
    try {
      request.put("bootstrap_ticket", bootstrapTicket == null ? "" : bootstrapTicket.trim());
      request.put("device_name", identity.deviceName);
      request.put("app_version", identity.appVersion);
    } catch (Exception error) {
      throw new SyncException("Android kurulum eşleştirme isteği hazırlanamadı.", error);
    }

    JSONObject response = postJson(
        normalizeBaseUrl(baseUrl) + "/api/android-bootstrap.php",
        "",
        identity,
        request,
        READ_TIMEOUT_MS,
        "Web modülü Android kurulum eşleştirmesini desteklemiyor. Hosting paketini güncelleyin.",
        false
    );
    String token = response.optString("device_token", "").trim();
    if (!token.matches("yat_[a-f0-9]{64}")) {
      throw new SyncException("Telefonun kişisel bağlantı anahtarı alınamadı.");
    }
    return token;
  }

  LocalPairingTicketResult requestLocalPairingTicket(
      String baseUrl,
      String credential,
      DeviceIdentity identity
  ) throws SyncException {
    JSONObject request = new JSONObject();
    try {
      request.put("action", "local_pairing_ticket");
      request.put("device_id", identity.deviceId);
      request.put("device_name", identity.deviceName);
      request.put("app_version", identity.appVersion);
    } catch (Exception error) {
      throw new SyncException("Yerel bağlantı bileti hazırlanamadı.", error);
    }

    JSONObject response = postJson(
        normalizeBaseUrl(baseUrl) + "/api/android.php",
        credential,
        identity,
        request,
        READ_TIMEOUT_MS,
        "Web modülü otomatik yerel bağlantıyı desteklemiyor. Hosting paketini güncelleyin."
    );
    String ticket = response.optString("local_pairing_ticket", "").trim();
    String desktopId = response.optString("desktop_id", "").trim();
    String expiresAt = response.optString("expires_at", "").trim();
    if (!ticket.startsWith("yalp1.")
        || !desktopId.matches("desktop-[A-Za-z0-9._:-]{8,120}")) {
      throw new SyncException("Yerel bağlantı bileti doğrulanamadı.");
    }
    return new LocalPairingTicketResult(ticket, desktopId, expiresAt);
  }

  private JSONObject post(String baseUrl, String credential, DeviceIdentity identity, JSONObject payload) throws SyncException {
    return postJson(
        toSyncEndpoint(baseUrl, credential),
        credential,
        identity,
        payload,
        READ_TIMEOUT_MS,
        "Web modülü güncel değil. Hosting paketini güncelleyip tekrar deneyin."
    );
  }

  private JSONObject postJson(
      String endpointUrl,
      String credential,
      DeviceIdentity identity,
      JSONObject payload,
      int readTimeoutMs,
      String notFoundMessage
  ) throws SyncException {
    return postJson(endpointUrl, credential, identity, payload, readTimeoutMs, notFoundMessage, true);
  }

  private JSONObject postJson(
      String endpointUrl,
      String credential,
      DeviceIdentity identity,
      JSONObject payload,
      int readTimeoutMs,
      String notFoundMessage,
      boolean includeAuthorization
  ) throws SyncException {
    HttpURLConnection connection = null;
    try {
      URL endpoint = new URL(endpointUrl);
      connection = (HttpURLConnection) endpoint.openConnection();
      connection.setRequestMethod("POST");
      connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
      connection.setReadTimeout(readTimeoutMs);
      connection.setDoOutput(true);
      connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
      connection.setRequestProperty("Accept", "application/json");
      if (includeAuthorization) {
        applyAuthorization(connection, credential, identity);
      } else {
        connection.setRequestProperty("X-YA-Device-Id", identity.deviceId);
      }

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
        throw new SyncException(status == 404 ? notFoundMessage : "Web modülü geçerli bir yanıt vermedi.", error);
      }

      if (status == 401) {
        throw new SyncException("Telefon bağlantısı doğrulanamadı. Cihazı masaüstünden yeniden eşleştirin.");
      }
      if (status < 200 || status >= 300 || !response.optBoolean("ok", false)) {
        String message = response.optString("message", "").trim();
        throw new SyncException(
            message.isEmpty() ? "İşlem web modülü tarafından kabul edilmedi." : message,
            response.optString("code", "").trim(),
            status
        );
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

  private void tryUpgradeDeviceCredential(
      String baseUrl,
      String credential,
      DeviceIdentity identity,
      JSONObject summaryResponse
  ) {
    if (ConnectionSettings.isDeviceCredential(credential)
        || !summaryResponse.has("approval_required")
        || summaryResponse.optBoolean("approval_required", true)) {
      return;
    }

    try {
      JSONObject response = postJson(
          toDeviceTokenEndpoint(baseUrl),
          credential,
          identity,
          new JSONObject(),
          READ_TIMEOUT_MS,
          ""
      );
      String token = response.optString("device_token", "").trim();
      if (!token.isEmpty() && !ConnectionSettings.storeDeviceToken(identity.preferences, token)) {
        throw new SyncException("Telefonun kişisel bağlantı anahtarı kaydedilemedi.");
      }
    } catch (SyncException ignored) {
      // Token issuance is opportunistic; bootstrap authentication remains usable
      // when the token endpoint is unavailable during the pairing step.
    }
  }

  private static void applyAuthorization(HttpURLConnection connection, String credential, DeviceIdentity identity) {
    connection.setRequestProperty("X-YA-Device-Id", identity.deviceId);
    if (ConnectionSettings.isDeviceCredential(credential)) {
      connection.setRequestProperty("X-YA-Device-Token", ConnectionSettings.deviceToken(credential));
      return;
    }
    connection.setRequestProperty("X-YA-Sync-Secret", credential == null ? "" : credential.trim());
  }

  static String toSyncEndpoint(String baseUrl) {
    return toSyncEndpoint(baseUrl, "");
  }

  static String toSyncEndpoint(String baseUrl, String credential) {
    String normalized = normalizeBaseUrl(baseUrl);
    if (ConnectionSettings.isDeviceCredential(credential)) {
      return normalized + "/api/android.php";
    }
    return normalized + "/api/sync.php";
  }

  static String toStockImageAnalysisEndpoint(String baseUrl) {
    return toStockImageAnalysisEndpoint(baseUrl, "");
  }

  static String toStockImageAnalysisEndpoint(String baseUrl, String credential) {
    String normalized = normalizeBaseUrl(baseUrl);
    return normalized + (ConnectionSettings.isDeviceCredential(credential)
        ? "/api/android-stock-image-analysis.php"
        : "/api/stock-image-analysis.php");
  }

  static String toIdentityImageAnalysisEndpoint(String baseUrl) {
    return toIdentityImageAnalysisEndpoint(baseUrl, "");
  }

  static String toIdentityImageAnalysisEndpoint(String baseUrl, String credential) {
    String normalized = normalizeBaseUrl(baseUrl);
    return normalized + (ConnectionSettings.isDeviceCredential(credential)
        ? "/api/android-identity-image-analysis.php"
        : "/api/identity-image-analysis.php");
  }

  static String toChatEndpoint(String baseUrl) {
    return toChatEndpoint(baseUrl, "");
  }

  static String toChatEndpoint(String baseUrl, String credential) {
    String normalized = normalizeBaseUrl(baseUrl);
    return normalized + (ConnectionSettings.isDeviceCredential(credential)
        ? "/api/android-chat.php"
        : "/api/chat.php");
  }

  static String toDeviceTokenEndpoint(String baseUrl) {
    return normalizeBaseUrl(baseUrl) + "/api/android-device-token.php";
  }

  private static String normalizeBaseUrl(String baseUrl) {
    String normalized = baseUrl == null ? "" : baseUrl.trim();
    while (normalized.endsWith("/")) {
      normalized = normalized.substring(0, normalized.length() - 1);
    }
    normalized = normalized.replaceFirst("/(?:api/)?(?:sync|android|chat|stock-image-analysis|identity-image-analysis|android-chat|android-stock-image-analysis|android-identity-image-analysis|android-device-token)\\.php$", "");
    if (normalized.endsWith("/api")) {
      normalized = normalized.substring(0, normalized.length() - 4);
    }
    return normalized;
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
    final String code;
    final int httpStatus;

    SyncException(String message) {
      this(message, "", 0, null);
    }

    SyncException(String message, Throwable cause) {
      this(message, "", 0, cause);
    }

    SyncException(String message, String code, int httpStatus) {
      this(message, code, httpStatus, null);
    }

    private SyncException(String message, String code, int httpStatus, Throwable cause) {
      super(message, cause);
      this.code = code == null ? "" : code.trim();
      this.httpStatus = httpStatus;
    }

    boolean disablesAndroidService() {
      return "android_capability_disabled".equals(code);
    }

    boolean invalidatesPendingAction() {
      return disablesAndroidService()
          || "device_approval_required".equals(code)
          || "customer_management_permission_denied".equals(code)
          || "android_action_permission_denied".equals(code)
          || "android_action_capability_disabled".equals(code);
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

  static final class LocalPairingTicketResult {
    final String ticket;
    final String desktopId;
    final String expiresAt;

    LocalPairingTicketResult(String ticket, String desktopId, String expiresAt) {
      this.ticket = ticket == null ? "" : ticket.trim();
      this.desktopId = desktopId == null ? "" : desktopId.trim();
      this.expiresAt = expiresAt == null ? "" : expiresAt.trim();
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

  static final class IdentityImageAnalysisResult {
    final String message;
    final JSONObject analysis;

    IdentityImageAnalysisResult(String message, JSONObject analysis) {
      this.message = message;
      this.analysis = analysis;
    }
  }
}
