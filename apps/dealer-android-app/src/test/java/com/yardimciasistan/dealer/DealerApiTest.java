package com.yardimciasistan.dealer;

import org.junit.Test;
import static org.junit.Assert.*;
import org.json.JSONObject;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

public class DealerApiTest {
  static class Connection extends HttpURLConnection {
    ByteArrayOutputStream sent = new ByteArrayOutputStream(); int status = 200;
    String response = "{\"ok\":true}", cookie = "ya_account_session=" + "c".repeat(43) + "; Secure; HttpOnly";
    Connection(URL url) { super(url); }
    public void disconnect() {}
    public boolean usingProxy() { return false; }
    public void connect() {}
    @Override public OutputStream getOutputStream() { return sent; }
    @Override public InputStream getInputStream() { return new ByteArrayInputStream(response.getBytes(StandardCharsets.UTF_8)); }
    @Override public InputStream getErrorStream() { return getInputStream(); }
    @Override public int getResponseCode() { return status; }
    @Override public String getHeaderField(String name) { return name.equalsIgnoreCase("Set-Cookie") ? cookie : null; }
  }
  @Test public void onlyHttpsModuleUrlsWithoutSecrets() throws Exception {
    assertEquals("https://firma.example/module/", DealerApi.normalizeBase(" https://firma.example/module/// "));
    for (String url : new String[]{"http://firma.example", "https://u:p@firma.example", "https://firma.example/?secret=key", "https://firma.example/#token", "file:///tmp/f"})
      assertThrows(Exception.class, () -> DealerApi.normalizeBase(url));
  }
  @Test public void requestsUseExistingCookieAndPostHeaderNoSyncCredentials() throws Exception {
    Connection connection = new Connection(new URL("https://firma.example/"));
    DealerApi api = new DealerApi("https://firma.example/module/", url -> { assertEquals("https://firma.example/module/api/dealer/order.php", url.toString()); return connection; });
    JSONObject input = new JSONObject().put("idempotencyKey", "same-key-123456789");
    DealerApi.Reply reply = api.call("order", input, "ya_account_session=" + "b".repeat(43));
    assertEquals(input.toString(), connection.sent.toString("UTF-8")); assertEquals("1", connection.getRequestProperty("X-YA-Dealer"));
    assertEquals("POST", connection.getRequestMethod()); assertNull(connection.getRequestProperty("Authorization"));
    assertEquals("ya_account_session=" + "c".repeat(43), reply.cookie); assertFalse(connection.getInstanceFollowRedirects());
  }
  @Test public void redirectsAreRejectedWithoutForwardingSession() throws Exception {
    Connection connection = new Connection(new URL("https://firma.example/")); connection.status = 302;
    DealerApi.Failure error = assertThrows(DealerApi.Failure.class, () -> new DealerApi("https://firma.example/", url -> connection).call("session", null, ""));
    assertEquals(302, error.status); assertFalse(connection.getInstanceFollowRedirects());
  }
  @Test public void revocationAndValidationRemainDistinct() throws Exception {
    Connection connection = new Connection(new URL("https://firma.example/")); connection.status = 401; connection.response = "{\"message\":\"Bayi erişimi gerekli.\"}";
    DealerApi.Failure error = assertThrows(DealerApi.Failure.class, () -> new DealerApi("https://firma.example/", url -> connection).call("orders", null, ""));
    assertEquals(401, error.status); assertEquals("Bayi erişimi gerekli.", error.getMessage());
  }
  @Test public void invalidJsonAndOversizedBodiesFailVisibly() throws Exception {
    Connection connection = new Connection(new URL("https://firma.example/")); connection.response = "<html>bad gateway</html>";
    assertThrows(DealerApi.Failure.class, () -> new DealerApi("https://firma.example/", url -> connection).call("catalog", null, ""));
    assertThrows(IllegalStateException.class, () -> DealerApi.readBounded(new ByteArrayInputStream(new byte[20]), 10));
  }

  @Test public void renewedSessionRecoversReceiptWithoutSecondPost() throws Exception {
    final int[] count = {0};
    DealerApi api = new DealerApi("https://firma.example/", url -> {
      count[0]++; assertTrue(url.toString().endsWith("receipt.php"));
      Connection connection = new Connection(url); connection.response = "{\"ok\":true,\"receipt\":{\"ok\":true,\"order_id\":\"original\",\"accepted_at\":\"2026-01-01T10:00:00+00:00\"}}"; return connection;
    });
    assertEquals("original", api.submit(new JSONObject().put("idempotencyKey", "same-key-123456789"), "").getString("order_id")); assertEquals(1, count[0]);
  }
  @Test public void firstSubmissionChecksReceiptThenSendsOriginalIntent() throws Exception {
    final int[] count = {0}; JSONObject request = new JSONObject().put("idempotencyKey", "same-key-123456789").put("note", "Deneme");
    DealerApi api = new DealerApi("https://firma.example/", url -> {
      Connection connection = new Connection(url);
      if (count[0]++ == 0) { assertTrue(url.toString().endsWith("receipt.php")); connection.response = "{\"ok\":true,\"receipt\":null}"; }
      else { assertTrue(url.toString().endsWith("order.php")); connection.response = "{\"ok\":true,\"order_id\":\"created\",\"accepted_at\":\"2026-01-01T10:00:00+00:00\"}"; }
      return connection;
    });
    assertEquals("created", api.submit(request, "").getString("order_id")); assertEquals(2, count[0]);
  }
  @Test public void unavailableReceiptNeverTriggersBlindResubmission() throws Exception {
    final int[] count = {0};
    DealerApi api = new DealerApi("https://firma.example/", url -> { count[0]++; throw new IOException("offline"); });
    assertThrows(IOException.class, () -> api.submit(new JSONObject().put("idempotencyKey", "same-key-123456789"), "")); assertEquals(1, count[0]);
  }

  @Test public void successfulHttpWithoutValidAcceptanceCannotClearPendingOrder() throws Exception {
    for (String malformed : new String[]{"{\"ok\":false}", "{\"ok\":true,\"order_id\":\"fake\"}", "{\"ok\":true,\"order_id\":\"fake\",\"accepted_at\":\"2026-01-01T10:00:00Z\",\"quoted_total\":-1,\"currency\":\"TRY\"}"}) {
      DealerApi api = new DealerApi("https://firma.example/", url -> {
        Connection connection = new Connection(url);
        connection.response = url.toString().endsWith("receipt.php") ? "{\"ok\":true,\"receipt\":null}" : malformed; return connection;
      });
      assertThrows(DealerApi.Failure.class, () -> api.submit(new JSONObject().put("idempotencyKey", "same-key-123456789"), ""));
    }
  }
  @Test public void applicationIsPublicMultipartAndSharesRequestTypeWithWidget() throws Exception {
    Connection connection = new Connection(new URL("https://firma.example/")); connection.response = "{\"ok\":true,\"request_id\":\"request-application\"}";
    DealerApi api = new DealerApi("https://firma.example/module/", url -> { assertEquals("https://firma.example/module/api/request.php", url.toString()); return connection; });
    byte[] bytes = "%PDF-1.4\n%%EOF".getBytes(StandardCharsets.UTF_8);
    DealerApi.DocumentUpload doc = new DealerApi.DocumentUpload("vergi.pdf", "tax_certificate", "application/pdf", bytes.length, () -> new ByteArrayInputStream(bytes));
    JSONObject fields = new JSONObject().put("request_type", "dealer_application").put("idempotency_key", "same-application-key").put("company_name", "Firma");
    long[] progress = {0};
    assertEquals("request-application", api.apply(fields, java.util.Collections.singletonList(doc), (sent,total) -> progress[0] = sent).getString("request_id"));
    String body = connection.sent.toString("UTF-8");
    assertTrue(body.contains("dealer_application")); assertTrue(body.contains("documents[]")); assertTrue(body.contains("tax_certificate")); assertTrue(body.contains("%PDF-1.4"));
    assertTrue(connection.getRequestProperty("Content-Type").startsWith("multipart/form-data; boundary=")); assertNull(connection.getRequestProperty("Cookie")); assertNull(connection.getRequestProperty("X-YA-Sync-Secret")); assertNull(connection.getRequestProperty("X-YA-Dealer"));
    assertEquals(bytes.length, progress[0]); assertFalse(body.contains("base64"));
  }
  @Test public void applicationRejectsOversizedAndIncompleteFilesWithoutRetryingNewIdentity() throws Exception {
    Connection connection = new Connection(new URL("https://firma.example/"));
    DealerApi api = new DealerApi("https://firma.example/", url -> connection);
    JSONObject fields = new JSONObject().put("request_type", "dealer_application").put("idempotency_key", "same-application-key");
    DealerApi.DocumentUpload big = new DealerApi.DocumentUpload("big.pdf", "other", "application/pdf", 10L * 1024 * 1024 + 1, () -> new ByteArrayInputStream(new byte[0]));
    assertThrows(IllegalArgumentException.class, () -> api.apply(fields, java.util.Collections.singletonList(big), (sent,total) -> {}));
    DealerApi.DocumentUpload incomplete = new DealerApi.DocumentUpload("part.pdf", "other", "application/pdf", 100, () -> new ByteArrayInputStream(new byte[1]));
    assertThrows(IllegalArgumentException.class, () -> api.apply(fields, java.util.Collections.singletonList(incomplete), (sent,total) -> {}));
    assertEquals("same-application-key", fields.getString("idempotency_key"));
  }
  @Test public void disabledApplicationAndRedirectAreVisibleWithoutDealerCredentials() throws Exception {
    Connection connection = new Connection(new URL("https://firma.example/")); connection.status = 403; connection.response = "{\"ok\":false,\"message\":\"Online bayi başvurusu kapalı.\"}";
    DealerApi api = new DealerApi("https://firma.example/", url -> connection);
    assertEquals(403, assertThrows(DealerApi.Failure.class, () -> api.apply(new JSONObject(), java.util.Collections.emptyList(), (sent,total) -> {})).status);
    connection.status = 302;
    assertEquals(302, assertThrows(DealerApi.Failure.class, api::applicationInfo).status);
    assertNull(connection.getRequestProperty("Cookie"));
  }

}
