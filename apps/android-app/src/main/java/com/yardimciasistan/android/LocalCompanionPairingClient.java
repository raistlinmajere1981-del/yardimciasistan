package com.yardimciasistan.android;

import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class LocalCompanionPairingClient {
  private static final int CONNECT_TIMEOUT_MS = 1500;
  private static final int READ_TIMEOUT_MS = 3500;

  PairResult pair(
      SharedPreferences preferences,
      DeviceIdentity identity,
      String hostingBaseUrl,
      String pairingSecret
  ) throws PairingException {
    String targetKey = CompanionConnectionIdentity.actionTargetKey(hostingBaseUrl);
    if (targetKey.isEmpty()) {
      throw new PairingException("Web bağlantı hedefi belirlenemedi.");
    }

    ConnectionSettings.LocalConnection discovered = ConnectionSettings.localConnection(preferences);
    if (!discovered.hasEndpoint()) {
      throw new PairingException(
          "Aynı ağdaki masaüstü henüz bulunamadı. Yerel ağ taramasını yeniden deneyin.",
          "local_desktop_not_found"
      );
    }

    String secret = pairingSecret == null ? "" : pairingSecret.trim();
    if (secret.isEmpty()) {
      throw new PairingException("Masaüstündeki eşleştirme kodunu girin.");
    }

    JSONObject request = new JSONObject();
    try {
      request.put("pairing_secret", secret);
      request.put("device_id", identity.deviceId);
      request.put("device_name", identity.deviceName);
      request.put("app_version", identity.appVersion);
    } catch (Exception error) {
      throw new PairingException("Yerel eşleştirme isteği hazırlanamadı.", error);
    }

    JSONObject response = post(discovered.baseUrl + LocalCompanionProtocol.PAIR_PATH, request);
    String desktopId = response.optString("desktop_id", "").trim();
    String token = response.optString("local_token", "").trim();
    if (!desktopId.equals(discovered.desktopId)) {
      throw new PairingException("Bulunan masaüstü kimliği eşleştirme sırasında değişti.");
    }
    if (!ConnectionSettings.storeLocalPairing(
        preferences,
        desktopId,
        discovered.baseUrl,
        targetKey,
        token
    )) {
      throw new PairingException("Yerel bağlantı anahtarı telefonda saklanamadı.");
    }

    return new PairResult(
        desktopId,
        response.optBoolean("approval_required", true),
        response.optString("message", "Telefon yerel ağ için eşleştirildi.").trim()
    );
  }

  private static JSONObject post(String endpoint, JSONObject payload) throws PairingException {
    HttpURLConnection connection = null;
    try {
      connection = (HttpURLConnection) new URL(endpoint).openConnection();
      connection.setRequestMethod("POST");
      connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
      connection.setReadTimeout(READ_TIMEOUT_MS);
      connection.setDoOutput(true);
      connection.setRequestProperty("Accept", "application/json");
      connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
      byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
      connection.setFixedLengthStreamingMode(body.length);
      try (OutputStream output = connection.getOutputStream()) {
        output.write(body);
      }

      int status = connection.getResponseCode();
      InputStream stream = status >= 200 && status < 300
          ? connection.getInputStream()
          : connection.getErrorStream();
      String responseText = readAll(stream);
      JSONObject response;
      try {
        response = new JSONObject(responseText);
      } catch (Exception error) {
        throw new PairingException("Masaüstü eşleştirme isteğine geçerli yanıt vermedi.", error);
      }

      if (status < 200 || status >= 300 || !response.optBoolean("ok", false)) {
        String message = response.optString("message", "").trim();
        String code = response.optString("code", "").trim();
        throw new PairingException(
            message.isEmpty() ? "Yerel eşleştirme başarısız oldu." : message,
            code
        );
      }
      return response;
    } catch (PairingException error) {
      throw error;
    } catch (Exception error) {
      throw new PairingException(
          "Aynı ağdaki masaüstüne eşleştirme için ulaşılamadı.",
          "local_desktop_unreachable",
          error
      );
    } finally {
      if (connection != null) {
        connection.disconnect();
      }
    }
  }

  private static String readAll(InputStream stream) throws Exception {
    if (stream == null) return "";
    StringBuilder result = new StringBuilder();
    try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
      String line;
      while ((line = reader.readLine()) != null) {
        result.append(line);
      }
    }
    return result.toString();
  }

  static final class PairResult {
    final String desktopId;
    final boolean approvalRequired;
    final String message;

    PairResult(String desktopId, boolean approvalRequired, String message) {
      this.desktopId = desktopId;
      this.approvalRequired = approvalRequired;
      this.message = message == null ? "" : message.trim();
    }
  }

  static final class PairingException extends Exception {
    final String code;

    PairingException(String message) {
      this(message, "", null);
    }

    PairingException(String message, Throwable cause) {
      this(message, "", cause);
    }

    PairingException(String message, String code) {
      this(message, code, null);
    }

    PairingException(String message, String code, Throwable cause) {
      super(message, cause);
      this.code = code == null ? "" : code.trim();
    }
  }
}
