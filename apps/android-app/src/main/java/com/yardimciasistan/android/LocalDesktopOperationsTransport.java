package com.yardimciasistan.android;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class LocalDesktopOperationsTransport implements AndroidOperationsTransport {
  private static final int CONNECT_TIMEOUT_MS = 900;
  private static final int READ_TIMEOUT_MS = 2200;

  private final String desktopId;

  LocalDesktopOperationsTransport(String desktopId) {
    this.desktopId = desktopId == null ? "" : desktopId.trim();
  }

  @Override
  public String preferredSourceKey(String baseUrl, String credential) {
    return CompanionConnectionIdentity.localSourceKey(desktopId);
  }

  @Override
  public FetchResult fetchOperations(
      String baseUrl,
      String credential,
      DeviceIdentity identity,
      long knownServerRevision
  ) throws TransportException {
    JSONObject request = new JSONObject();
    try {
      request.put("known_server_revision", Math.max(0L, knownServerRevision));
      request.put("device_name", identity.deviceName);
      request.put("app_version", identity.appVersion);
    } catch (Exception error) {
      throw new TransportException("Yerel güncelleme isteği hazırlanamadı.", error);
    }

    JSONObject response = post(
        endpoint(baseUrl, LocalCompanionProtocol.SUMMARY_PATH),
        credential,
        identity,
        request
    );
    long revision = Math.max(0L, response.optLong("server_revision", 0L));
    String sourceKey = preferredSourceKey(baseUrl, credential);
    if (response.optBoolean("not_modified", false)) {
      return new FetchResult(true, revision, null, response, sourceKey);
    }
    return new FetchResult(
        false,
        revision,
        OperationData.fromJson(response, identity.deviceId),
        response,
        sourceKey
    );
  }

  @Override
  public OperationData.ActionRecord enqueueAction(
      String baseUrl,
      String credential,
      DeviceIdentity identity,
      String actionId,
      String actionType,
      JSONObject actionPayload
  ) throws TransportException {
    JSONObject request = new JSONObject();
    try {
      request.put("id", actionId);
      request.put("action_type", actionType);
      request.put("payload", actionPayload);
      request.put("device_name", identity.deviceName);
      request.put("app_version", identity.appVersion);
      request.put("created_at", new java.util.Date().toInstant().toString());
    } catch (Exception error) {
      throw new TransportException("Yerel işlem isteği hazırlanamadı.", error);
    }

    JSONObject response = post(
        endpoint(baseUrl, LocalCompanionProtocol.ACTION_PATH),
        credential,
        identity,
        request
    );
    String status = response.optString("status", "").trim();
    String message = response.optString("message", "").trim();
    if (!"applied".equals(status)) {
      throw new TransportException(
          message.isEmpty() ? "Masaüstü yerel işlemi reddetti." : message,
          "local_action_rejected",
          409,
          null
      );
    }

    try {
      JSONObject action = new JSONObject();
      action.put("id", actionId);
      action.put("action_type", actionType);
      action.put("status", "applied");
      action.put("error_message", "");
      action.put("payload", actionPayload);
      action.put("created_at", request.optString("created_at", ""));
      action.put("processed_at", new java.util.Date().toInstant().toString());
      return OperationData.ActionRecord.fromJson(action);
    } catch (Exception error) {
      throw new TransportException("Yerel işlem sonucu okunamadı.", error);
    }
  }

  private static String endpoint(String baseUrl, String path) throws TransportException {
    String normalized = baseUrl == null ? "" : baseUrl.trim();
    while (normalized.endsWith("/")) {
      normalized = normalized.substring(0, normalized.length() - 1);
    }
    if (!normalized.startsWith("http://")) {
      throw new TransportException(
          "Yerel masaüstü adresi geçersiz.",
          "local_unreachable",
          0,
          null
      );
    }
    return normalized + path;
  }

  private static JSONObject post(
      String endpoint,
      String token,
      DeviceIdentity identity,
      JSONObject payload
  ) throws TransportException {
    HttpURLConnection connection = null;
    try {
      connection = (HttpURLConnection) new URL(endpoint).openConnection();
      connection.setRequestMethod("POST");
      connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
      connection.setReadTimeout(READ_TIMEOUT_MS);
      connection.setDoOutput(true);
      connection.setRequestProperty("Accept", "application/json");
      connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
      connection.setRequestProperty(LocalCompanionProtocol.DEVICE_ID_HEADER, identity.deviceId);
      connection.setRequestProperty(LocalCompanionProtocol.TOKEN_HEADER, token == null ? "" : token.trim());

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
        throw new TransportException(
            "Yerel masaüstü geçerli bir yanıt vermedi.",
            "local_unreachable",
            status,
            error
        );
      }

      if (status < 200 || status >= 300 || !response.optBoolean("ok", false)) {
        String code = response.optString("code", "").trim();
        String message = response.optString("message", "").trim();
        throw new TransportException(
            message.isEmpty() ? "Yerel masaüstü isteği başarısız oldu." : message,
            code.isEmpty() ? "local_unreachable" : code,
            status,
            null
        );
      }
      return response;
    } catch (TransportException error) {
      throw error;
    } catch (SocketTimeoutException error) {
      throw new TransportException(
          "Yerel masaüstü bağlantısı zaman aşımına uğradı.",
          "local_unreachable",
          0,
          error
      );
    } catch (Exception error) {
      throw new TransportException(
          "Yerel masaüstüne ulaşılamadı.",
          "local_unreachable",
          0,
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
}
