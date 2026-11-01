package com.yardimciasistan.dealer;

import org.json.JSONObject;
import java.net.URI;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Uses the existing cookie protocol; never receives a publication/sync secret. */
final class DealerApi {
  interface Connections { HttpURLConnection open(URL url) throws Exception; }
  static final class Failure extends Exception {
    final int status; final String code;
    Failure(int status, String message) { this(status, message, ""); }
    Failure(int status, String message, String code) { super(message); this.status = status; this.code = code; }
  }
  static final class Reply {
    final JSONObject body; final String cookie;
    Reply(JSONObject body, String cookie) { this.body = body; this.cookie = cookie; }
  }
  private final String base;
  private final Connections connections;
  DealerApi(String base) throws Exception { this(base, url -> (HttpURLConnection) url.openConnection()); }
  DealerApi(String base, Connections connections) throws Exception { this.base = normalizeBase(base); this.connections = connections; }
  static String normalizeBase(String input) throws Exception {
    URI uri = new URI(input.trim());
    if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
        || uri.getRawQuery() != null || uri.getRawFragment() != null) throw new IllegalArgumentException("İşletme için geçerli bir HTTPS bağlantısı girin.");
    return uri.toASCIIString().replaceAll("/+$", "") + "/";
  }
  JSONObject submit(JSONObject request, String cookie) throws Exception {
    JSONObject recovery = call("receipt", new JSONObject().put("idempotencyKey", request.getString("idempotencyKey")), cookie).body;
    JSONObject previous = recovery.optJSONObject("receipt");
    JSONObject receipt = previous == null ? call("order", request, cookie).body : previous;
    boolean valid = Boolean.TRUE.equals(receipt.opt("ok")) && receipt.optString("order_id").matches("[A-Za-z0-9_-]{1,180}");
    try { java.time.OffsetDateTime.parse(receipt.getString("accepted_at")); } catch (Exception error) { valid = false; }
    valid = valid && receipt.opt("quoted_total") instanceof Number
        && Double.isFinite(receipt.optDouble("quoted_total")) && receipt.optDouble("quoted_total") >= 0
        && receipt.optString("currency").matches("[A-Z]{3}");
    if (!valid) throw new Failure(502, "Sipariş sonucu doğrulanamadı. Aynı siparişi tekrar deneyin.");
    return receipt;
  }
  Reply call(String endpoint, JSONObject request, String cookie) throws Exception {
    if (!endpoint.matches("session|catalog|order|orders|logout|receipt|account/(config|login|session|refresh|logout|oauth|exchange|recover|register)")) throw new IllegalArgumentException("Geçersiz işlem.");
    HttpURLConnection connection = connections.open(new URL(base + "api/" + (endpoint.startsWith("account/") ? endpoint : "dealer/" + endpoint) + ".php"));
    connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(20000);
    connection.setUseCaches(false); connection.setRequestProperty("Accept", "application/json");
    connection.setRequestProperty("X-YA-Dealer", "1");
    connection.setRequestProperty("X-YA-Account", "1");
    connection.setRequestProperty("X-YA-Client", "android");
    if (cookie != null && cookie.matches("ya_account_session=[A-Za-z0-9_-]{43}(; ya_account_refresh=[A-Za-z0-9_-]{43})?")) connection.setRequestProperty("Cookie", cookie);
    try {
      if (request != null) {
        connection.setRequestMethod("POST"); connection.setRequestProperty("Content-Type", "application/json"); connection.setDoOutput(true);
        byte[] bytes = request.toString().getBytes(StandardCharsets.UTF_8); connection.setFixedLengthStreamingMode(bytes.length);
        try (java.io.OutputStream output = connection.getOutputStream()) { output.write(bytes); }
      }
      int status = connection.getResponseCode();
      if (status >= 300 && status < 400) throw new Failure(status, "Bu bağlantı yönlendiriliyor. Firmanızdan güncel bayi bağlantısı isteyin.");
      String body;
      try (InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream()) { body = readBounded(stream, 16 * 1024 * 1024); }
      JSONObject json;
      try { json = new JSONObject(body); } catch (Exception error) { throw new Failure(status, "Sunucu yanıtı okunamadı. Siparişinizi aynı kimlikle tekrar deneyebilirsiniz."); }
      if (status < 200 || status >= 300) throw new Failure(status, accountMessage(json.optString("code"), json.optString("message", "İşlem tamamlanamadı (" + status + ").")), json.optString("code"));
      String session = "", refresh = "";
      java.util.List<String> values = new java.util.ArrayList<>();
      for (java.util.Map.Entry<String, java.util.List<String>> entry : connection.getHeaderFields().entrySet())
        if (entry.getKey() != null && entry.getKey().equalsIgnoreCase("Set-Cookie")) values.addAll(entry.getValue());
      if (values.isEmpty() && connection.getHeaderField("Set-Cookie") != null) values.add(connection.getHeaderField("Set-Cookie"));
      for (String header : values) {
        String value = header.split(";", 2)[0].trim();
        if (value.matches("ya_account_session=[A-Za-z0-9_-]{43}")) session = value;
        if (value.matches("ya_account_refresh=[A-Za-z0-9_-]{43}")) refresh = value;
      }
      if (!session.isEmpty() && !refresh.isEmpty()) session += "; " + refresh;
      return new Reply(json, session);
    } finally { connection.disconnect(); }
  }
  static String accountMessage(String code, String fallback) {
    switch (code) {
      case "online_sales_disabled": return "Bu işletmede Online Satış kapalı. Hesap erişimi işletme yeniden açtığında kullanılabilir.";
      case "dealer_access_required": return "Hesabınız normal müşteri hesabı. Bayi yetkisi için işletmeyle iletişime geçin. Web hesabınız korunuyor.";
      case "invalid_email": return "Geçerli bir e-posta adresi girin.";
      case "provider_failed": return "Sağlayıcı girişi tamamlanamadı. Yeniden deneyin.";
      case "invalid_credentials": return "E-posta veya şifre hatalı.";
      case "email_verification_required": return "Önce e-posta adresinizi webden doğrulayın.";
      case "try_later": return "Çok fazla deneme yapıldı. Bir süre sonra yeniden deneyin.";
      default: return fallback;
    }
  }
  interface UploadSource { InputStream open() throws Exception; }
  interface UploadProgress { void update(long sent, long total); }
  static final class DocumentUpload {
    final String name, kind, mime; final long size; final UploadSource source;
    DocumentUpload(String name, String kind, String mime, long size, UploadSource source) {
      this.name = name; this.kind = kind; this.mime = mime; this.size = size; this.source = source;
    }
  }
  JSONObject applicationInfo() throws Exception {
    HttpURLConnection connection = connections.open(new URL(base + "api/business.php"));
    connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(20000); connection.setUseCaches(false);
    try { return publicResponse(connection); } finally { connection.disconnect(); }
  }
  JSONObject apply(JSONObject fields, java.util.List<DocumentUpload> documents, UploadProgress progress) throws Exception {
    if (documents.size() > 5) throw new IllegalArgumentException("En fazla 5 belge ekleyin.");
    String boundary = "YA" + java.util.UUID.randomUUID().toString().replace("-", "");
    HttpURLConnection connection = connections.open(new URL(base + "api/request.php"));
    connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(120000);
    connection.setUseCaches(false); connection.setRequestMethod("POST"); connection.setDoOutput(true);
    connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
    connection.setChunkedStreamingMode(8192);
    long total = 0; for (DocumentUpload doc : documents) {
      if (doc.size < 1 || doc.size > 10 * 1024 * 1024) throw new IllegalArgumentException("Her belge en fazla 10 MB olabilir.");
      total += doc.size;
    }
    try {
      try (java.io.OutputStream output = connection.getOutputStream()) {
        java.util.Iterator<String> keys = fields.keys();
        while (keys.hasNext()) { String key = keys.next(); part(output, boundary, key, fields.getString(key)); }
        long sent = 0;
        for (DocumentUpload doc : documents) {
          part(output, boundary, "document_kinds[]", doc.kind);
          String safe = doc.name.replace((char)34, '_').replace((char)92, '_').replace((char)13, '_').replace((char)10, '_');
          output.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"documents[]\"; filename=\"" + safe + "\"\r\nContent-Type: application/octet-stream\r\n\r\n").getBytes(StandardCharsets.UTF_8));
          long fileSent = 0;
          try (InputStream input = doc.source.open()) {
            byte[] buffer = new byte[8192]; int count;
            while ((count = input.read(buffer)) != -1) {
              fileSent += count; if (fileSent > doc.size) throw new IllegalArgumentException("Belge boyutu değişti. Dosyayı yeniden seçin.");
              output.write(buffer, 0, count); sent += count; progress.update(sent, total);
            }
          }
          if (fileSent != doc.size) throw new IllegalArgumentException("Belge okunamadı. Dosyayı yeniden seçin.");
          output.write("\r\n".getBytes(StandardCharsets.UTF_8));
        }
        output.write(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
      }
      return publicResponse(connection);
    } finally { connection.disconnect(); }
  }
  private static void part(java.io.OutputStream output, String boundary, String key, String value) throws Exception {
    if (!key.matches("[a-z_]+(?:\\[\\])?")) throw new IllegalArgumentException("Geçersiz başvuru alanı.");
    output.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + key + "\"\r\n\r\n" + value + "\r\n").getBytes(StandardCharsets.UTF_8));
  }
  private static JSONObject publicResponse(HttpURLConnection connection) throws Exception {
    int status = connection.getResponseCode();
    if (status >= 300 && status < 400) throw new Failure(status, "Doğrudan web modülü adresini kullanın.");
    String text; try (InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream()) { text = readBounded(input, 65536); }
    JSONObject body;
    try { body = new JSONObject(text); } catch (Exception error) { throw new Failure(502, "Sunucu yanıtı okunamadı. Aynı başvuruyu yeniden deneyin."); }
    if (status < 200 || status >= 300 || !body.optBoolean("ok")) throw new Failure(status, body.optString("message", "Başvuru gönderilemedi."));
    return body;
  }
  static String readBounded(InputStream stream, int limit) throws Exception {
    if (stream == null) return "{}";
    ByteArrayOutputStream bytes = new ByteArrayOutputStream(); byte[] buffer = new byte[8192]; int count;
    while ((count = stream.read(buffer)) != -1) {
      if (bytes.size() + count > limit) throw new IllegalStateException("Sunucu yanıtı çok büyük.");
      bytes.write(buffer, 0, count);
    }
    return bytes.toString("UTF-8");
  }
}
