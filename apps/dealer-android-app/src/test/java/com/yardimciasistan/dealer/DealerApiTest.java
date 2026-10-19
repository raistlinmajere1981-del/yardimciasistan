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
    String response = "{\"ok\":true}", cookie = "ya_dealer_session=" + "c".repeat(43) + "; Secure; HttpOnly";
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
  @Test public void inviteMustMatchOriginAndFragmentContract() throws Exception {
    String token = "a".repeat(43); String base = "https://firma.example/module/";
    assertEquals(token, DealerApi.inviteToken("https://firma.example/bayi/#invite=" + token, base));
    for (String link : new String[]{"https://other.example/bayi/#invite=" + token, "https://firma.example:444/bayi/#invite=" + token, "https://firma.example/bayi/?invite=" + token, "https://firma.example/bayi/#invite=short"})
      assertThrows(Exception.class, () -> DealerApi.inviteToken(link, base));
  }
  @Test public void requestsUseExistingCookieAndPostHeaderNoSyncCredentials() throws Exception {
    Connection connection = new Connection(new URL("https://firma.example/"));
    DealerApi api = new DealerApi("https://firma.example/module/", url -> { assertEquals("https://firma.example/module/api/dealer/order.php", url.toString()); return connection; });
    JSONObject input = new JSONObject().put("idempotencyKey", "same-key-123456789");
    DealerApi.Reply reply = api.call("order", input, "ya_dealer_session=" + "b".repeat(43));
    assertEquals(input.toString(), connection.sent.toString("UTF-8")); assertEquals("1", connection.getRequestProperty("X-YA-Dealer"));
    assertEquals("POST", connection.getRequestMethod()); assertNull(connection.getRequestProperty("Authorization"));
    assertEquals("ya_dealer_session=" + "c".repeat(43), reply.cookie); assertFalse(connection.getInstanceFollowRedirects());
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
}
