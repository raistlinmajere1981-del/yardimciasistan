package com.yardimciasistan.dealer;

import org.junit.Test;
import static org.junit.Assert.*;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.security.*;
import javax.net.ssl.*;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/** Native Java client against real local PHP/SQLite, behind a test-only trusted TLS proxy. No provider double is called here. */
public class DealerAccountHttpTest {
  private static final String PASSWORD = "Native-Account-Fixture-2048!";
  private static final String ACCOUNT = "11111111-1111-4111-8111-111111111111";
  private static String read(InputStream input) throws Exception {
    if (input == null) return "";
    try (InputStream stream = input; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[8192]; int n;
      while ((n = stream.read(buffer)) >= 0) out.write(buffer, 0, n);
      return out.toString("UTF-8");
    }
  }
  private static void command(Path directory, String... command) throws Exception {
    Process process = new ProcessBuilder(command).directory(directory.toFile()).redirectErrorStream(true).start();
    String output = read(process.getInputStream());
    assertEquals(output, 0, process.waitFor());
  }
  private static String line(InputStream stream) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream(); int value;
    while ((value = stream.read()) >= 0) { if (value == 10) break; if (value != 13) out.write(value); if (out.size() > 16384) throw new IOException("header too large"); }
    return out.toString("US-ASCII");
  }
  private static void proxyRequest(SSLSocket client, int port, AtomicInteger refreshPosts, List<String> refreshCookies) {
    HttpURLConnection upstream = null;
    try (SSLSocket socket = client) {
      socket.setSoTimeout(20000); InputStream input = socket.getInputStream();
      String[] request = line(input).split(" "); if (request.length < 2) return;
      boolean accountRefresh = request[0].equals("POST") && request[1].endsWith("/api/account/refresh.php");
      if (accountRefresh) refreshPosts.incrementAndGet();
      upstream = (HttpURLConnection) new URL("http://127.0.0.1:" + port + request[1]).openConnection();
      upstream.setInstanceFollowRedirects(false); upstream.setRequestMethod(request[0]);
      int length = 0; String header;
      while (!(header = line(input)).isEmpty()) {
        int colon = header.indexOf(':'); if (colon < 0) continue;
        String name = header.substring(0,colon), value = header.substring(colon+1).trim();
        if (accountRefresh && name.equalsIgnoreCase("Cookie")) refreshCookies.add(value);
        if (name.equalsIgnoreCase("Content-Length")) length = Integer.parseInt(value);
        else if (!name.equalsIgnoreCase("Host") && !name.equalsIgnoreCase("Connection")) upstream.setRequestProperty(name,value);
      }
      if (length > 0) {
        upstream.setDoOutput(true); byte[] body = new byte[length]; int offset = 0;
        while (offset < length) { int n = input.read(body,offset,length-offset); if (n < 0) throw new EOFException(); offset += n; }
        try (OutputStream output = upstream.getOutputStream()) { output.write(body); }
      }
      int status = upstream.getResponseCode(); byte[] body = read(status >= 400 ? upstream.getErrorStream() : upstream.getInputStream()).getBytes("UTF-8");
      StringBuilder headers = new StringBuilder("HTTP/1.1 " + status + " Fixture\r\nConnection: close\r\nContent-Length: " + body.length + "\r\n");
      for (Map.Entry<String,List<String>> entry : upstream.getHeaderFields().entrySet())
        if (entry.getKey() != null && !entry.getKey().equalsIgnoreCase("Content-Length") && !entry.getKey().equalsIgnoreCase("Connection") && !entry.getKey().equalsIgnoreCase("Transfer-Encoding"))
          for (String value : entry.getValue()) headers.append(entry.getKey()).append(": ").append(value).append("\r\n");
      OutputStream output = socket.getOutputStream(); output.write(headers.append("\r\n").toString().getBytes("US-ASCII")); output.write(body); output.flush();
    } catch (Exception ignored) { /* Assertion at the client reports a failed transport. */ }
    finally { if (upstream != null) upstream.disconnect(); }
  }
  @Test public void sharedLoginRefreshCommercialAndOnlineSalesGatesUseActualPhp() throws Exception {
    Path source = Paths.get(System.getProperty("user.dir"), "../../firm-template/web-module").normalize();
    assertTrue("Run from the dealer Android project", Files.isDirectory(source));
    Path root = Files.createTempDirectory("dealer-account-http-");
    Path module = root.resolve("module"); Files.createDirectories(module);
    try (java.util.stream.Stream<Path> paths = Files.walk(source)) {
      paths.filter(path -> !path.startsWith(source.resolve("data"))).forEach(path -> {
        try { Path target = module.resolve(source.relativize(path)); if (Files.isDirectory(path)) Files.createDirectories(target); else Files.copy(path, target); }
        catch (IOException error) { throw new java.io.UncheckedIOException(error); }
      });
    }
    Process php = null; SSLServerSocket proxy = null; java.util.concurrent.ExecutorService executor = Executors.newCachedThreadPool();
    AtomicInteger refreshPosts = new AtomicInteger();
    List<String> refreshCookies = Collections.synchronizedList(new ArrayList<>());
    try {
      Path key = root.resolve("tls.p12");
      command(root, Paths.get(System.getProperty("java.home"), "bin/keytool").toString(), "-genkeypair", "-alias", "fixture", "-keyalg", "RSA", "-keysize", "2048", "-validity", "1", "-dname", "CN=localhost", "-ext", "SAN=dns:localhost,ip:127.0.0.1", "-storetype", "PKCS12", "-keystore", key.toString(), "-storepass", "test-only-password", "-keypass", "test-only-password", "-noprompt");
      KeyStore store = KeyStore.getInstance("PKCS12");
      try (InputStream input = Files.newInputStream(key)) { store.load(input, "test-only-password".toCharArray()); }
      KeyManagerFactory km = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm()); km.init(store, "test-only-password".toCharArray());
      TrustManagerFactory tm = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()); tm.init(store);
      SSLContext tls = SSLContext.getInstance("TLS"); tls.init(km.getKeyManagers(), tm.getTrustManagers(), new SecureRandom());
      proxy = (SSLServerSocket) tls.getServerSocketFactory().createServerSocket(0, 50, InetAddress.getByName("127.0.0.1"));
      int phpPort; try (java.net.ServerSocket socket = new java.net.ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) { phpPort = socket.getLocalPort(); }
      final int upstreamPort = phpPort;
      final SSLServerSocket listener = proxy;
      executor.submit(() -> {
        while (!listener.isClosed()) {
          try { final SSLSocket client = (SSLSocket) listener.accept(); executor.submit(() -> proxyRequest(client, upstreamPort, refreshPosts, refreshCookies)); }
          catch (IOException error) { break; }
        }
      });
      final String base = "https://localhost:" + proxy.getLocalPort() + "/module/";
      Files.write(module.resolve("config/business.json"), "{\"sync_secret\":\"native-test-secret\"}".getBytes("UTF-8"));
      String seed = "<?php require __DIR__.'/module/lib/dealer-access.php'; $db=ya_storage_open(); "
          + "$db->prepare('INSERT INTO customer_accounts(id,email,full_name,password_hash,email_verified,created_at) VALUES (?,?,?,?,1,?)')->execute(['" + ACCOUNT + "','native@example.test','Native account',password_hash('" + PASSWORD + "',PASSWORD_ARGON2ID),time()]); "
          + "$p=['version'=>3,'online_sales_enabled'=>true,'enabled'=>true,'dealers'=>[['access_id'=>'22222222-2222-4222-8222-222222222222','customer_ref'=>'33333333-3333-4333-8333-333333333333','account_id'=>'" + ACCOUNT + "','display_name'=>'Native dealer','access_revision'=>1,'session_revision'=>1,'enabled'=>true]],'catalogs'=>[],'order_history'=>[]]; "
          + "ya_storage_activate_source('native-android-test',0,'native-test-activation'); ya_storage_publish('dealer_access_private',$p,'native-android-test',1,'native-publication',date(DATE_ATOM),1,hash('sha256',json_encode($p)),static function($db)use($p){ya_dealer_apply_projection($db,$p,1);});";
      Files.write(root.resolve("seed.php"), seed.getBytes("UTF-8")); command(root, "php", "seed.php");
      ProcessBuilder process = new ProcessBuilder("php", "-S", "127.0.0.1:" + phpPort, "-t", root.toString()).redirectErrorStream(true).redirectOutput(root.resolve("php.log").toFile());
      process.environment().put("YA_ACCOUNT_SITE_URL", "https://localhost:" + proxy.getLocalPort() + "/hesabim/"); process.environment().put("YA_ACCOUNT_MODULE_URL", base);
      php = process.start();
      DealerApi.Connections connections = url -> { HttpsURLConnection c = (HttpsURLConnection) url.openConnection(); c.setSSLSocketFactory(tls.getSocketFactory()); return c; };
      DealerApi api = new DealerApi(base, connections);
      for (int i = 0; ; i++) { try { if (api.call("account/config", null, "").body.getBoolean("enabled")) break; } catch (Exception error) { if (i > 100) throw error; Thread.sleep(30); } }
      JSONObject credentials = new JSONObject().put("email", "native@example.test").put("password", PASSWORD);
      DealerApi.Reply web = api.call("account/login", credentials, ""), android = api.call("account/login", credentials, "");
      assertNotEquals(web.cookie, android.cookie); assertTrue(android.cookie.contains("ya_account_refresh="));
      assertEquals(ACCOUNT, api.call("account/session", null, android.cookie).body.getJSONObject("account").getString("id"));

      // Drive the production DealerSession controller, not a manual refresh, against the real PHP fixture.
      List<String> renewed = new ArrayList<>();
      DealerSession session = new DealerSession(base, android.cookie, renewed::add, connections);
      assertEquals("Native dealer", session.call("session", null).body.getJSONObject("dealer").getString("display_name"));
      assertEquals("A valid access cookie must not refresh", 0, refreshPosts.get());

      // Deterministic 30-minute expiry #1: expire only the access row in this temporary fixture DB.
      Files.write(root.resolve("expire-access.php"), "<?php require __DIR__.'/module/lib/storage.php'; ya_storage_open()->exec('UPDATE customer_account_sessions SET expires_at=0 WHERE revoked_at=0');".getBytes("UTF-8"));
      command(root, "php", "expire-access.php");
      assertEquals("Native dealer", session.call("session", null).body.getJSONObject("dealer").getString("display_name"));
      assertEquals("Expired access must make one actual POST /account/refresh", 1, refreshPosts.get());
      assertTrue(DealerApi.hasRotatedPair(session.cookie()));
      assertNotEquals(android.cookie, session.cookie());
      assertEquals(session.cookie(), renewed.get(0));
      assertEquals(android.cookie, refreshCookies.get(0));
      assertEquals(ACCOUNT, api.call("account/session", null, session.cookie()).body.getJSONObject("account").getString("id"));

      // Independent second expiry must use the rotated pair, never the revoked original refresh key.
      command(root, "php", "expire-access.php");
      assertEquals("Native dealer", session.call("session", null).body.getJSONObject("dealer").getString("display_name"));
      assertEquals("Second expiry must make exactly one more refresh POST", 2, refreshPosts.get());
      assertEquals(2, renewed.size());
      assertEquals(session.cookie(), renewed.get(1));
      assertNotEquals(renewed.get(0), renewed.get(1));
      assertEquals(renewed.get(0), refreshCookies.get(1));
      assertEquals("Native dealer", api.call("session", null, session.cookie()).body.getJSONObject("dealer").getString("display_name"));

      // Replaying the revoked original pair fails closed and is not retried a second time.
      DealerSession stale = new DealerSession(base, android.cookie, renewed::add, connections);
      assertEquals(401, assertThrows(DealerApi.Failure.class, () -> stale.call("session", null)).status);
      assertEquals("Stale refresh attempt is one POST and fails", 3, refreshPosts.get());
      assertEquals(android.cookie, refreshCookies.get(2));
      assertEquals(android.cookie, stale.cookie());
      assertEquals(2, renewed.size());

      // Real 403 dealer demotion must not be treated as a renewable expiry.
      Files.write(root.resolve("demote.php"), "<?php require __DIR__.'/module/lib/storage.php'; ya_storage_open()->exec('UPDATE dealer_access SET enabled=0');".getBytes("UTF-8")); command(root, "php", "demote.php");
      DealerApi.Failure normal = assertThrows(DealerApi.Failure.class, () -> session.call("session", null));
      assertEquals(403, normal.status); assertEquals("dealer_access_required", normal.code);
      assertEquals("403 demotion must not refresh", 3, refreshPosts.get());
      assertEquals(renewed.get(1), session.cookie());
      assertEquals(ACCOUNT, api.call("account/session", null, session.cookie()).body.getJSONObject("account").getString("id"));
      Files.write(root.resolve("disable.php"), "<?php require __DIR__.'/module/lib/storage.php'; $db=ya_storage_open(); $p=ya_storage_get_publication('dealer_access_private',[]); $p['online_sales_enabled']=false; $db->prepare('UPDATE publications SET payload_json=? WHERE name=?')->execute([json_encode($p),'dealer_access_private']);".getBytes("UTF-8")); command(root, "php", "disable.php");
      DealerApi.Failure disabled = assertThrows(DealerApi.Failure.class, () -> api.call("account/session", null, session.cookie())); assertEquals(403, disabled.status); assertEquals("online_sales_disabled", disabled.code);
      assertTrue(api.call("account/logout", new JSONObject(), session.cookie()).body.getBoolean("ok"));
    } finally {
      if (php != null) { php.destroy(); php.waitFor(); } if (proxy != null) proxy.close(); executor.shutdownNow();
      try (java.util.stream.Stream<Path> paths = Files.walk(root)) { paths.sorted(Comparator.reverseOrder()).forEach(path -> { try { Files.delete(path); } catch (IOException ignored) {} }); }
    }
  }
}
