package com.yardimciasistan.dealer;

import org.json.JSONObject;
import java.net.HttpURLConnection;

/**
 * Authenticated dealer calls that renew an expired 30-minute access cookie once from the
 * persistent refresh cookie. Rotation is reported immediately so the fresh pair survives a
 * later catalog/network failure. A 403 demotion and a revoked/transient refresh stay fail-closed:
 * the local session is never cleared here.
 */
final class DealerSession {
  interface Renewed { void renewed(String cookie) throws Exception; }
  private final String base;
  private final DealerApi.Connections connections;
  private final Renewed renewed;
  private String cookie;
  DealerSession(String base, String cookie) throws Exception {
    this(base, cookie, value -> {}, url -> (HttpURLConnection) url.openConnection());
  }
  DealerSession(String base, String cookie, DealerApi.Connections connections) throws Exception {
    this(base, cookie, value -> {}, connections);
  }
  DealerSession(String base, String cookie, Renewed renewed) throws Exception {
    this(base, cookie, renewed, url -> (HttpURLConnection) url.openConnection());
  }
  DealerSession(String base, String cookie, Renewed renewed, DealerApi.Connections connections) throws Exception {
    this.base = DealerApi.normalizeBase(base);
    this.cookie = cookie == null ? "" : cookie;
    this.renewed = renewed;
    this.connections = connections;
  }
  String cookie() { return cookie; }
  private DealerApi api() throws Exception { return new DealerApi(base, connections); }

  DealerApi.Reply call(String endpoint, JSONObject request) throws Exception {
    try {
      return api().call(endpoint, request, cookie);
    } catch (DealerApi.Failure failure) {
      // Only an expired access cookie is renewable. 403 means the capability was withdrawn;
      // that must stay a visible failure and must never be retried as a login refresh.
      if (failure.status != 401 || !DealerApi.hasRotatedPair(cookie)) throw failure;
      renew();
      return api().call(endpoint, request, cookie); // at most one retry
    }
  }

  JSONObject submit(JSONObject request) throws Exception {
    try {
      return api().submit(request, cookie);
    } catch (DealerApi.Failure failure) {
      if (failure.status != 401 || !DealerApi.hasRotatedPair(cookie)) throw failure;
      renew();
      // Receipt recovery and the order keep their original idempotency key, so this is the
      // same intent and cannot create a duplicate order.
      return api().submit(request, cookie);
    }
  }

  private void renew() throws Exception {
    DealerApi.Reply reply = api().call("account/refresh", new JSONObject(), cookie);
    if (!DealerApi.hasRotatedPair(reply.cookie))
      throw new DealerApi.Failure(502, "Oturum yenilenemedi. Aynı hesabınızla yeniden giriş yapın.");
    cookie = reply.cookie;
    renewed.renewed(cookie);
  }
}
