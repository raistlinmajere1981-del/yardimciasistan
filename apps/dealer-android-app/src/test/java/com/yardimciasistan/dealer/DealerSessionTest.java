package com.yardimciasistan.dealer;

import static org.junit.Assert.*;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.JSONObject;
import org.junit.Test;

/** Expired access cookies renew once from the persistent refresh cookie; nothing else is loosened. */
public class DealerSessionTest {
  private static final String OLD_SESSION = "ya_account_session=" + "a".repeat(43);
  private static final String OLD_REFRESH = "ya_account_refresh=" + "b".repeat(43);
  private static final String OLD = OLD_SESSION + "; " + OLD_REFRESH;
  private static final String NEW_SESSION = "ya_account_session=" + "c".repeat(43);
  private static final String NEW_REFRESH = "ya_account_refresh=" + "d".repeat(43);
  private static final String NEW = NEW_SESSION + "; " + NEW_REFRESH;
  private static final String NEWEST_SESSION = "ya_account_session=" + "e".repeat(43);
  private static final String NEWEST_REFRESH = "ya_account_refresh=" + "f".repeat(43);
  private static final String NEWEST = NEWEST_SESSION + "; " + NEWEST_REFRESH;

  static final class Connection extends HttpURLConnection {
    final ByteArrayOutputStream sent = new ByteArrayOutputStream();
    final List<String> setCookies = new ArrayList<>();
    String requestCookie;
    int status = 200;
    String response = "{\"ok\":true}";
    Connection(URL url) { super(url); }
    public void disconnect() {}
    public boolean usingProxy() { return false; }
    public void connect() {}
    @Override public void setRequestProperty(String name, String value) {
      super.setRequestProperty(name, value);
      if (name.equalsIgnoreCase("Cookie")) requestCookie = value;
    }
    @Override public OutputStream getOutputStream() { return sent; }
    @Override public InputStream getInputStream() { return new ByteArrayInputStream(response.getBytes(StandardCharsets.UTF_8)); }
    @Override public InputStream getErrorStream() { return getInputStream(); }
    @Override public int getResponseCode() { return status; }
    @Override public Map<String, List<String>> getHeaderFields() {
      Map<String, List<String>> headers = new LinkedHashMap<>();
      if (!setCookies.isEmpty()) headers.put("Set-Cookie", setCookies);
      return headers;
    }
    @Override public String getHeaderField(String name) { return name.equalsIgnoreCase("Set-Cookie") && !setCookies.isEmpty() ? setCookies.get(0) : null; }
    void setCookies(String... values) { setCookies.addAll(Arrays.asList(values)); }
  }

  // Android can fold both Set-Cookie headers into one value; Expires contains its own commas.
  private static void rotate(Connection connection, String session, String refresh) {
    connection.setCookies(session + "; Path=/module/; Expires=Wed, 09 Jun 2027 10:18:14 GMT, "
        + refresh + "; Path=/module/; Secure; HttpOnly; SameSite=Lax");
  }

  private static DealerSession session(DealerSession.Renewed renewed, DealerApi.Connections server) throws Exception {
    return new DealerSession("https://firma.example/module/", OLD, renewed, server);
  }

  @Test public void expiredAccessRenewsOnceAndPersistsTheRotatedPair() throws Exception {
    final List<Connection> requests = new ArrayList<>();
    final List<String> rotated = new ArrayList<>();
    final int[] sessionCalls = {0}, refreshCalls = {0};
    final boolean[] expired = {true};
    DealerSession.Renewed renewed = rotated::add;
    DealerSession session = session(renewed, url -> {
      Connection connection = new Connection(url);
      if (url.getPath().endsWith("/dealer/session.php")) {
        sessionCalls[0]++;
        if (expired[0]) { connection.status = 401; connection.response = "{\"authenticated\":false}"; }
        else connection.response = "{\"authenticated\":true,\"dealer\":{\"access_id\":\"dealer\",\"display_name\":\"Dealer\"}}";
      } else if (url.getPath().endsWith("/account/refresh.php")) {
        refreshCalls[0]++; rotate(connection, NEW_SESSION, NEW_REFRESH);
        expired[0] = false;
      }
      requests.add(connection);
      return connection;
    });
    assertEquals("Dealer", session.call("session", null).body.getJSONObject("dealer").getString("display_name"));
    assertEquals(1, refreshCalls[0]);
    assertEquals(2, sessionCalls[0]);
    assertEquals(NEW, session.cookie());
    assertEquals(Collections.singletonList(NEW), rotated);
    assertEquals(OLD, requests.get(0).requestCookie);
    assertEquals(OLD, requests.get(1).requestCookie);
    assertEquals(NEW, requests.get(2).requestCookie);
  }

  @Test public void secondExpiryUsesTheRotatedRefreshCookieAgain() throws Exception {
    final List<Connection> refreshes = new ArrayList<>();
    final boolean[] expired = {true};
    final int[] rotations = {0};
    DealerSession session = session(value -> {}, url -> {
      Connection connection = new Connection(url);
      if (url.getPath().endsWith("/dealer/session.php")) {
        if (expired[0]) { connection.status = 401; connection.response = "{\"authenticated\":false}"; }
        else connection.response = "{\"authenticated\":true,\"dealer\":{\"access_id\":\"dealer\"}}";
      } else if (url.getPath().endsWith("/account/refresh.php")) {
        refreshes.add(connection);
        if (++rotations[0] == 1) rotate(connection, NEW_SESSION, NEW_REFRESH);
        else rotate(connection, NEWEST_SESSION, NEWEST_REFRESH);
        expired[0] = false;
      }
      return connection;
    });
    session.call("session", null);
    assertEquals(NEW, session.cookie());
    expired[0] = true;
    session.call("session", null);
    assertEquals(NEWEST, session.cookie());
    assertEquals(2, refreshes.size());
    assertEquals(OLD, refreshes.get(0).requestCookie);
    assertEquals(NEW, refreshes.get(1).requestCookie);
  }

  @Test public void revokedRefreshFailsClosedWithoutRetryingTheRequest() throws Exception {
    final List<String> paths = new ArrayList<>();
    final List<String> rotated = new ArrayList<>();
    DealerSession session = session(rotated::add, url -> {
      paths.add(url.getPath());
      Connection connection = new Connection(url);
      connection.status = 401; connection.response = "{\"ok\":false,\"code\":\"login_required\"}";
      return connection;
    });
    DealerApi.Failure error = assertThrows(DealerApi.Failure.class, () -> session.call("session", null));
    assertEquals(401, error.status);
    assertEquals(2, paths.size());
    assertTrue(paths.get(0).endsWith("/dealer/session.php"));
    assertTrue(paths.get(1).endsWith("/account/refresh.php"));
    assertEquals(OLD, session.cookie());
    assertTrue(rotated.isEmpty());
  }

  @Test public void transientRefreshFailureKeepsTheLiveSessionAndDoesNotRetry() throws Exception {
    final int[] calls = {0};
    final List<String> rotated = new ArrayList<>();
    DealerSession session = session(rotated::add, url -> {
      Connection connection = new Connection(url);
      calls[0]++;
      if (calls[0] == 1) { connection.status = 401; connection.response = "{\"authenticated\":false}"; }
      else { connection.status = 503; connection.response = "{\"ok\":false,\"code\":\"account_unavailable\"}"; }
      return connection;
    });
    DealerApi.Failure error = assertThrows(DealerApi.Failure.class, () -> session.call("session", null));
    assertEquals(503, error.status);
    assertEquals(2, calls[0]);
    assertEquals(OLD, session.cookie());
    assertTrue(rotated.isEmpty());
  }

  @Test public void networkFailureNeverRenewsOrChangesTheSession() throws Exception {
    final int[] calls = {0};
    DealerSession session = session(value -> {}, url -> {
      calls[0]++; throw new IOException("offline");
    });
    assertThrows(IOException.class, () -> session.call("session", null));
    assertEquals(1, calls[0]);
    assertEquals(OLD, session.cookie());
  }

  @Test public void forbiddenDemotionIsNeverRetriedAsARefresh() throws Exception {
    final int[] calls = {0};
    DealerSession session = session(value -> {}, url -> {
      calls[0]++;
      Connection connection = new Connection(url);
      connection.status = 403; connection.response = "{\"ok\":false,\"code\":\"dealer_access_required\"}";
      return connection;
    });
    DealerApi.Failure error = assertThrows(DealerApi.Failure.class, () -> session.call("session", null));
    assertEquals(403, error.status);
    assertEquals("dealer_access_required", error.code);
    assertEquals(1, calls[0]);
    assertEquals(OLD, session.cookie());
  }

  @Test public void partialRotationIsNeverSavedOverTheLiveRefreshCookie() throws Exception {
    final int[] calls = {0};
    final List<String> rotated = new ArrayList<>();
    DealerSession session = session(rotated::add, url -> {
      Connection connection = new Connection(url);
      calls[0]++;
      if (calls[0] == 1) { connection.status = 401; connection.response = "{\"authenticated\":false}"; }
      else { connection.setCookies(NEW_SESSION + "; Path=/; HttpOnly"); connection.response = "{\"ok\":true}"; }
      return connection;
    });
    DealerApi.Failure error = assertThrows(DealerApi.Failure.class, () -> session.call("session", null));
    assertEquals(502, error.status);
    assertEquals(2, calls[0]);
    assertEquals(OLD, session.cookie());
    assertTrue(rotated.isEmpty());
  }

  @Test public void sessionCookieWithoutRefreshCookieCannotBeRenewed() throws Exception {
    final int[] calls = {0};
    DealerSession session = new DealerSession("https://firma.example/module/", OLD_SESSION,
        value -> {}, url -> {
          calls[0]++;
          Connection connection = new Connection(url);
          connection.status = 401; connection.response = "{\"ok\":false,\"code\":\"login_required\"}";
          return connection;
        });
    assertEquals(401, assertThrows(DealerApi.Failure.class, () -> session.call("session", null)).status);
    assertEquals(1, calls[0]);
    assertEquals(OLD_SESSION, session.cookie());
  }

  @Test public void submissionRenewsBeforeRecoveryAndKeepsTheSameIdempotencyKey() throws Exception {
    final int[] receiptCalls = {0};
    final List<Connection> orderRequests = new ArrayList<>();
    DealerSession session = session(value -> {}, url -> {
      Connection connection = new Connection(url);
      if (url.getPath().endsWith("/account/refresh.php")) {
        rotate(connection, NEW_SESSION, NEW_REFRESH);
        connection.response = "{\"ok\":true}";
      } else if (url.getPath().endsWith("/dealer/receipt.php")) {
        if (receiptCalls[0]++ == 0) { connection.status = 401; connection.response = "{\"ok\":false,\"code\":\"login_required\"}"; }
        else connection.response = "{\"ok\":true,\"receipt\":null}";
      } else if (url.getPath().endsWith("/dealer/order.php")) {
        orderRequests.add(connection);
        connection.response = "{\"ok\":true,\"order_id\":\"order-1\",\"accepted_at\":\"2026-01-01T10:00:00+00:00\",\"quoted_total\":10,\"currency\":\"TRY\"}";
      }
      return connection;
    });
    JSONObject request = new JSONObject().put("idempotencyKey", "same-key-123456789").put("note", "order");
    assertEquals("order-1", session.submit(request).getString("order_id"));
    assertEquals(NEW, session.cookie());
    assertEquals(2, receiptCalls[0]);
    assertEquals(1, orderRequests.size());
    assertTrue(orderRequests.get(0).sent.toString(StandardCharsets.UTF_8).contains("same-key-123456789"));
  }

  @Test public void forbiddenSubmissionDoesNotRenewOrLoseTheRefreshCookie() throws Exception {
    final int[] calls = {0};
    DealerSession session = session(value -> {}, url -> {
      calls[0]++;
      Connection connection = new Connection(url);
      connection.status = 403; connection.response = "{\"ok\":false,\"code\":\"dealer_access_required\"}";
      return connection;
    });
    DealerApi.Failure error = assertThrows(DealerApi.Failure.class,
        () -> session.submit(new JSONObject().put("idempotencyKey", "same-key-123456789")));
    assertEquals(403, error.status);
    assertEquals(1, calls[0]);
    assertEquals(OLD, session.cookie());
  }
}
