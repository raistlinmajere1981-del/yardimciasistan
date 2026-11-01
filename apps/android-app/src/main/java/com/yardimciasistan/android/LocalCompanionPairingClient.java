package com.yardimciasistan.android;

import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import javax.net.ssl.SSLException;
import java.nio.charset.StandardCharsets;

final class LocalCompanionPairingClient {
  interface ConnectionFactory extends LocalPinnedHttps.ConnectionFactory {}
  private final ConnectionFactory connections;

  LocalCompanionPairingClient() { this(LocalPinnedHttps.CONNECTIONS::open); }
  LocalCompanionPairingClient(ConnectionFactory connections) { this.connections = connections; }

  private static final int CONNECT_TIMEOUT_MS = 1500;
  private static final int READ_TIMEOUT_MS = 3500;

  PairResult pairWithQr(
      SharedPreferences preferences,
      DeviceIdentity identity,
      String qrPayload
  ) throws PairingException {
    LocalPairingQr qr = LocalPairingQr.parse(qrPayload);
    String targetKey = CompanionConnectionIdentity.localActionTargetKey(qr.desktopId);
    assertTargetAvailable(preferences, identity, targetKey);
    assertPinChangeAvailable(preferences, identity, qr);
    String expectedDesktopId = qr.desktopId;
    probeStatus(qr.baseUrl, qr.spkiSha256, expectedDesktopId);

    JSONObject request = new JSONObject();
    try {
      request.put("pairing_ticket", qr.credential);
      request.put("device_id", identity.deviceId);
      request.put("device_name", identity.deviceName);
      request.put("app_version", identity.appVersion);
    } catch (Exception error) {
      throw new PairingException("Yerel eşleştirme isteği hazırlanamadı.", error);
    }

    JSONObject response = post(qr.baseUrl + LocalCompanionProtocol.PAIR_PATH, qr.spkiSha256, request);
    String desktopId = response.optString("desktop_id", "").trim();
    String token = response.optString("local_token", "").trim();
    if (!expectedDesktopId.equals(desktopId)) {
      throw new PairingException(
          "Yerel masaüstü kimliği eşleştirme sırasında değişti.",
          "local_desktop_mismatch"
      );
    }
    // Recheck after network I/O before clearing any cache or changing trust.
    assertTargetAvailable(preferences, identity, targetKey);
    assertPinChangeAvailable(preferences, identity, qr);
    boolean targetChanged = !targetKey.equals(CompanionConnectionIdentity.actionTargetKey(
        preferences, ConnectionSettings.webModuleUrl(preferences)));
    if (!ConnectionSettings.storeLocalPairing(
        preferences,
        desktopId,
        qr.baseUrl,
        targetKey,
        token,
        qr.spkiSha256
    )) {
      throw new PairingException("Yerel bağlantı anahtarı telefonda saklanamadı.");
    }

    if (targetChanged) {
      try { new OperationCache(preferences, identity.deviceId).clear(); }
      catch (OperationCache.CacheException error) { throw new PairingException(error.getMessage()); }
    }
    return new PairResult(
        desktopId,
        response.optBoolean("approval_required", true),
        response.optBoolean("approval_required", true)
            ? "Eşleşti. Masaüstünden telefonu onaylayıp izinlerini seçin." : "Yerel eşleştirme tamamlandı."
    );
  }

  static void assertTargetAvailable(SharedPreferences preferences, DeviceIdentity identity, String targetKey) throws PairingException {
    if (ConnectionSettings.hasAnyHostingActionBarrier(preferences)) {
      throw new PairingException("Önceki Web bağlantısında sonucu beklenen işlemler var. Önce o bağlantıda tamamlayın.", "target_barrier");
    }
    ConnectionSettings.LocalConnection existing = ConnectionSettings.localConnection(preferences);
    if (ConnectionSettings.isLocalOnly(preferences) && !existing.desktopId.isEmpty()
        && !targetKey.equals(CompanionConnectionIdentity.localActionTargetKey(existing.desktopId))) {
      throw new PairingException("Bu telefon başka bir masaüstüyle eşleşmiş. Bağlantı değişikliği için yöneticiye başvurun.", "target_barrier");
    }
    try {
      for (ActionOutbox.PendingAction pending : new ActionOutbox(preferences).load()) {
        if (!pending.matchesTarget(targetKey)) {
          throw new PairingException("Önceki bağlantıya ait bekleyen işlemler korunuyor. Önce o bağlantıda tamamlayın.", "target_barrier");
        }
      }
      String previous = CompanionConnectionIdentity.actionTargetKey(preferences, ConnectionSettings.webModuleUrl(preferences));
      if (!previous.equals(targetKey) && new OperationCache(preferences, identity.deviceId).hasUnresolvedActionResults(previous)) {
        throw new PairingException("Önceki bağlantıda sonucu doğrulanmamış işlem var.", "target_barrier");
      }
    } catch (ActionOutbox.OutboxException | OperationCache.CacheException error) {
      throw new PairingException(error.getMessage(), "target_barrier");
    }
  }

  private static void assertPinChangeAvailable(SharedPreferences preferences, DeviceIdentity identity, LocalPairingQr qr) throws PairingException {
    ConnectionSettings.LocalConnection existing = ConnectionSettings.localConnection(preferences);
    if (!existing.desktopId.equals(qr.desktopId) || existing.spkiSha256.equals(qr.spkiSha256)) return;
    try {
      String target = CompanionConnectionIdentity.localActionTargetKey(qr.desktopId);
      if (!new ActionOutbox(preferences).load().isEmpty()
          || new OperationCache(preferences, identity.deviceId).hasUnresolvedActionResults(target)) {
        throw new PairingException("Masaüstü güvenlik kimliği değişti. Bekleyen işlemler korunuyor; önce eski masaüstünde tamamlayın.", "target_barrier");
      }
    } catch (ActionOutbox.OutboxException | OperationCache.CacheException error) {
      throw new PairingException("Bekleyen işlemler doğrulanamadı; bağlantı kimliği korunuyor.", "target_barrier");
    }
  }

  /** Discovery may propose an address, but cannot replace the QR trust anchor. */
  boolean refreshDiscoveredEndpoint(SharedPreferences preferences, String desktopId, String baseUrl) {
    ConnectionSettings.LocalConnection before = ConnectionSettings.localConnection(preferences);
    if (!before.isPaired() || !before.desktopId.equals(desktopId)) return false;
    try {
      probeStatus(baseUrl, before.spkiSha256, desktopId);
      ConnectionSettings.LocalConnection current = ConnectionSettings.localConnection(preferences);
      if (!before.desktopId.equals(current.desktopId) || !before.spkiSha256.equals(current.spkiSha256)
          || !before.localToken.equals(current.localToken)) return false;
      return ConnectionSettings.storeDiscoveredLocalEndpoint(preferences, desktopId, baseUrl);
    } catch (PairingException error) { return false; }
  }

  private void probeStatus(
      String baseUrl,
      String pin,
      String expectedDesktopId
  ) throws PairingException {
    HttpURLConnection connection = null;
    String endpoint = baseUrl + LocalCompanionProtocol.STATUS_PATH;
    try {
      connection = LocalPinnedHttps.open(endpoint, pin, connections);
      connection.setInstanceFollowRedirects(false);
      connection.setRequestMethod("GET");
      connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
      connection.setReadTimeout(READ_TIMEOUT_MS);
      connection.setRequestProperty("Accept", "application/json");
      LocalPinnedHttps.authenticate(connection, pin);
      int status = connection.getResponseCode();
      LocalPinnedHttps.rejectRedirect(status);
      String responseText = readAll(
          status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream()
      );
      JSONObject response = new JSONObject(responseText);
      String desktopId = response.optString("desktop_id", "").trim();
      if (status < 200 || status >= 300 || !response.optBoolean("ok", false)) {
        throw new PairingException(
            "Masaüstü bulundu ancak güvenli HTTPS servisi hazır değil.",
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
    } catch (SSLException error) {
      throw tlsError(error);
    } catch (Exception error) {
      throw new PairingException(
          "Masaüstü bulundu fakat güvenli HTTPS adresine ulaşılamadı.",
          "local_desktop_unreachable",
          error
      );
    } finally {
      if (connection != null) {
        connection.disconnect();
      }
    }
  }

  private JSONObject post(String endpoint, String pin, JSONObject payload) throws PairingException {
    HttpURLConnection connection = null;
    try {
      connection = LocalPinnedHttps.open(endpoint, pin, connections);
      connection.setInstanceFollowRedirects(false);
      connection.setRequestMethod("POST");
      connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
      connection.setReadTimeout(READ_TIMEOUT_MS);
      connection.setDoOutput(true);
      connection.setRequestProperty("Accept", "application/json");
      connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
      byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
      connection.setFixedLengthStreamingMode(body.length);
      LocalPinnedHttps.authenticate(connection, pin);
      try (OutputStream output = connection.getOutputStream()) {
        output.write(body);
      }

      int status = connection.getResponseCode();
      LocalPinnedHttps.rejectRedirect(status);
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
        String code = response.optString("code", "").trim();
        throw new PairingException(
            pairingErrorMessage(code),
            code
        );
      }
      return response;
    } catch (PairingException error) {
      throw error;
    } catch (SSLException error) {
      throw tlsError(error);
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

  private static PairingException tlsError(Exception error) {
    return new PairingException("Masaüstünün güvenli kimliği doğrulanamadı. Doğru masaüstünde yeni QR açıp yeniden eşleştirin.", "local_tls_authentication_failed", error);
  }

  private static String pairingErrorMessage(String code) {
    switch (code) {
      case "local_pairing_session_closed":
      case "local_pairing_ticket_replayed": return "QR kodunun süresi dolmuş veya kullanılmış. Masaüstünde yeni QR açın.";
      case "local_pairing_credential_invalid": return "QR kodu geçerli değil. Masaüstünde yeni QR açın.";
      case "app_locked": return "Eşleştirme için masaüstü kilidini açın.";
      case "device_revoked": return "Telefon erişimi kaldırılmış. Masaüstü yöneticisine başvurun.";
      case "android_capability_disabled": return "Masaüstünde Android servisini etkinleştirin.";
      case "local_network_disabled": return "Masaüstünde yerel ağ bağlantısını etkinleştirin.";
      default: return "Eşleştirme tamamlanamadı. Masaüstünde yeni QR açıp tekrar deneyin.";
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
