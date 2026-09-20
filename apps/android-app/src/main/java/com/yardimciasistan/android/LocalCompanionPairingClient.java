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

  PairResult pairWithTicket(
      SharedPreferences preferences,
      DeviceIdentity identity,
      String hostingBaseUrl,
      HostingSyncClient.LocalPairingTicketResult ticketResult
  ) throws PairingException {
    String targetKey = CompanionConnectionIdentity.actionTargetKey(hostingBaseUrl);
    if (targetKey.isEmpty()) {
      throw new PairingException("Web bağlantı hedefi belirlenemedi.", "local_target_invalid");
    }

    ConnectionSettings.LocalConnection discovered = ConnectionSettings.localConnection(preferences);
    if (!discovered.hasEndpoint()) {
      throw new PairingException(
          "Aynı ağdaki masaüstü henüz bulunamadı.",
          "local_desktop_not_found"
      );
    }

    String expectedDesktopId = ticketResult == null ? "" : ticketResult.desktopId;
    if (expectedDesktopId.isEmpty()) {
      throw new PairingException("Web modülü yerel masaüstü kimliği vermedi.", "local_desktop_unavailable");
    }
    if (!expectedDesktopId.equals(discovered.desktopId)) {
      if (!discovered.localToken.isEmpty()) {
        ConnectionSettings.clearLocalConnection(preferences);
      } else {
        ConnectionSettings.clearLocalEndpoint(preferences);
      }
      throw new PairingException(
          "Bulunan masaüstü bu işletmenin web kaydıyla eşleşmiyor.",
          "local_desktop_mismatch"
      );
    }

    probeStatus(discovered, expectedDesktopId);

    JSONObject request = new JSONObject();
    try {
      request.put("pairing_ticket", ticketResult.ticket);
      request.put("device_id", identity.deviceId);
      request.put("device_name", identity.deviceName);
      request.put("app_version", identity.appVersion);
    } catch (Exception error) {
      throw new PairingException("Yerel eşleştirme isteği hazırlanamadı.", error);
    }

    JSONObject response = post(discovered.baseUrl + LocalCompanionProtocol.PAIR_PATH, request);
    String desktopId = response.optString("desktop_id", "").trim();
    String token = response.optString("local_token", "").trim();
    if (!expectedDesktopId.equals(desktopId)) {
      throw new PairingException(
          "Yerel masaüstü kimliği eşleştirme sırasında değişti.",
          "local_desktop_mismatch"
      );
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
        response.optString("message", "Telefon yerel ağa otomatik bağlandı.").trim()
    );
  }

  private static void probeStatus(
      ConnectionSettings.LocalConnection discovered,
      String expectedDesktopId
  ) throws PairingException {
    HttpURLConnection connection = null;
    String endpoint = discovered.baseUrl + LocalCompanionProtocol.STATUS_PATH;
    try {
      connection = (HttpURLConnection) new URL(endpoint).openConnection();
      connection.setRequestMethod("GET");
      connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
      connection.setReadTimeout(READ_TIMEOUT_MS);
      connection.setRequestProperty("Accept", "application/json");
      int status = connection.getResponseCode();
      String responseText = readAll(
          status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream()
      );
      JSONObject response = new JSONObject(responseText);
      String desktopId = response.optString("desktop_id", "").trim();
      if (status < 200 || status >= 300 || !response.optBoolean("ok", false)) {
        throw new PairingException(
            "Masaüstü bulundu ancak yerel HTTP servisi hazır değil.",
            "local_status_failed"
        );
      }
      if (!response.optBoolean("local_network_enabled", true)) {
        throw new PairingException(
            "Yerel ağ bağlantısı masaüstü ayarlarından kapatılmış.",
            "local_network_disabled"
        );
      }
      if (!expectedDesktopId.equals(desktopId)) {
        throw new PairingException(
            "Bulunan yerel adres farklı bir masaüstüne ait.",
            "local_desktop_mismatch"
        );
      }
    } catch (PairingException error) {
      throw error;
    } catch (Exception error) {
      throw new PairingException(
          "Masaüstü bulundu fakat yerel HTTP adresine ulaşılamadı.",
          "local_desktop_unreachable",
          error
      );
    } finally {
      if (connection != null) {
        connection.disconnect();
      }
    }
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
            message.isEmpty() ? "Otomatik yerel eşleştirme başarısız oldu." : message,
            code
        );
      }
      return response;
    } catch (PairingException error) {
      throw error;
    } catch (Exception error) {
      throw new PairingException(
          "Aynı ağdaki masaüstüne otomatik eşleştirme için ulaşılamadı.",
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
