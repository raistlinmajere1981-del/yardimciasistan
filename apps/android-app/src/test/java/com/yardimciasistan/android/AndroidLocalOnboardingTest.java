package com.yardimciasistan.android;

import static org.junit.Assert.*;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import javax.net.ssl.HttpsURLConnection;
import java.security.cert.Certificate;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.json.JSONObject;
import org.junit.Test;

public final class AndroidLocalOnboardingTest {
  private static final String DESKTOP = "desktop-12345678-1234-1234-1234-123456789abc";
  private static final String OTHER = "desktop-87654321-1234-1234-1234-123456789abc";
  private static final String TOKEN = "yal_" + String.join("", Collections.nCopies(64, "a"));
  private static final String SECRET = "yald1." + String.join("", Collections.nCopies(64, "b"));
  static final String PIN = LocalTlsTestCertificates.pin("leaf");
  private static final String SHORT_SECRET = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(hexSecret());
  private static byte[] hexSecret() { byte[] bytes = new byte[32]; java.util.Arrays.fill(bytes, (byte) 0xbb); return bytes; }
  private static final String QR = "yapair3|" + DESKTOP + "|" + SHORT_SECRET + "|192.168.1.2:3456|" + PIN;
  private static final String ENDPOINT = "https://192.168.1.2:3456";
  private final AndroidCompanionStorageTest.InMemoryPreferences prefs = new AndroidCompanionStorageTest.InMemoryPreferences();

  private DeviceIdentity identity() throws Exception {
    java.lang.reflect.Constructor<DeviceIdentity> constructor = DeviceIdentity.class.getDeclaredConstructor(
        String.class, String.class, String.class, android.content.SharedPreferences.class);
    constructor.setAccessible(true);
    return constructor.newInstance("android-local-test", "Test phone", "2.1.0", prefs);
  }

  private void discover() { assertTrue(ConnectionSettings.storeDiscoveredLocalEndpoint(prefs, DESKTOP, ENDPOINT)); }
  private void paired() {
    assertTrue(ConnectionSettings.storeLocalPairing(prefs, DESKTOP, ENDPOINT,
        CompanionConnectionIdentity.localActionTargetKey(DESKTOP), TOKEN, PIN));
  }

  @Test public void freshInstallDoesNotRequireOrApplyEmbeddedWebDefaults() {
    ConnectionSettings.ensureDefaults(prefs);
    assertTrue(ConnectionSettings.isLocalOnly(prefs));
    assertFalse(ConnectionSettings.isComplete(prefs));
    assertEquals("", ConnectionSettings.webModuleUrl(prefs));
    assertEquals("", ConnectionSettings.syncSecret(prefs));
    discover();
    assertFalse(ConnectionSettings.isComplete(prefs)); // Discovery never authorizes.
  }

  @Test public void qrIsBoundedAndRejectsOtherCodesAndWeakTickets() throws Exception {
    assertTrue(QR.getBytes(StandardCharsets.UTF_8).length <= 271);
    assertEquals(DESKTOP, LocalPairingQr.parse(QR).desktopId);
    assertEquals(SECRET, LocalPairingQr.parse(QR).credential);
    for (String invalid : new String[] {"https://example.test", "yapair1|" + DESKTOP + "|weak", QR + "|extra", QR.replace("desktop-", "phone-")}) {
      try { LocalPairingQr.parse(invalid); fail("invalid QR"); }
      catch (LocalCompanionPairingClient.PairingException expected) { assertEquals("local_qr_invalid", expected.code); }
    }
  }

  @Test public void qrWithUsbEndpointDoesNotDependOnMdnsOrWebsite() throws Exception {
    byte[] key = new byte[32];
    java.util.Arrays.fill(key, (byte) 0xbb);
    String shortKey = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(key);
    String payload = "yapair3|" + DESKTOP + "|" + shortKey + "|192.168.225.140:47831|" + PIN;
    assertTrue(payload.length() <= 271);
    LocalPairingQr qr = LocalPairingQr.parse(payload);
    assertEquals(DESKTOP, qr.desktopId);
    assertEquals(SECRET, qr.credential);
    assertEquals("https://192.168.225.140:47831", qr.baseUrl);
    assertTrue(ConnectionSettings.storeDiscoveredLocalEndpoint(prefs, qr.desktopId, qr.baseUrl));
    assertFalse(ConnectionSettings.isComplete(prefs));
    for (String invalid : new String[] {
        payload.replace("192.168.225.140", "8.8.8.8"),
        payload.replace(":47831", ":99999"),
        payload.replace(shortKey, "not-base64")
    }) {
      try { LocalPairingQr.parse(invalid); fail("invalid USB QR"); }
      catch (LocalCompanionPairingClient.PairingException expected) { assertEquals("local_qr_invalid", expected.code); }
    }
  }

  @Test public void qrPairingProbesActualStatusAndPersistsLocalOnlyPendingApproval() throws Exception {
    discover();
    List<FakeConnection> requests = new ArrayList<>();
    LocalCompanionPairingClient client = new LocalCompanionPairingClient(endpoint -> {
      FakeConnection request = new FakeConnection(endpoint, endpoint.endsWith("/status")
          ? "{\"ok\":true,\"desktop_id\":\"" + DESKTOP + "\"}"
          : "{\"ok\":true,\"desktop_id\":\"" + DESKTOP + "\",\"local_token\":\"" + TOKEN + "\",\"approval_required\":true}", 200);
      requests.add(request); return request;
    });
    LocalCompanionPairingClient.PairResult result = client.pairWithQr(prefs, identity(), QR);
    assertTrue(result.approvalRequired);
    assertEquals(2, requests.size());
    assertTrue(requests.get(0).getURL().getPath().endsWith("/status"));
    assertTrue(requests.get(1).getURL().getPath().endsWith("/pair"));
    JSONObject body = new JSONObject(requests.get(1).body.toString("UTF-8"));
    assertEquals(SECRET, body.getString("pairing_ticket"));
    assertEquals(identity().deviceId, body.getString("device_id"));
    assertFalse(body.has("sync_secret"));
    assertFalse(requests.get(1).getInstanceFollowRedirects());
    assertTrue(ConnectionSettings.isComplete(prefs));
    assertEquals("", ConnectionSettings.webModuleUrl(prefs));
    assertEquals("", ConnectionSettings.syncSecret(prefs));
    assertEquals(CompanionConnectionIdentity.localActionTargetKey(DESKTOP),
        CompanionConnectionIdentity.actionTargetKey(prefs, "https://ignored.test"));
  }

  @Test public void statusMismatchRejectsBeforeCredentialPost() throws Exception {
    discover();
    int[] count = {0};
    LocalCompanionPairingClient client = new LocalCompanionPairingClient(endpoint -> {
      count[0]++;
      assertTrue(endpoint.endsWith("/status"));
      return new FakeConnection(endpoint, "{\"ok\":true,\"desktop_id\":\"" + OTHER + "\"}", 200);
    });
    try { client.pairWithQr(prefs, identity(), QR); fail("mismatch"); }
    catch (LocalCompanionPairingClient.PairingException expected) { assertEquals("local_desktop_mismatch", expected.code); }
    assertEquals(1, count[0]);
    assertFalse(ConnectionSettings.isComplete(prefs));
  }

  @Test public void wrongExpiredAndReplayedQrGiveSafeRetryMessages() throws Exception {
    discover();
    for (String code : new String[] {"local_pairing_credential_invalid", "local_pairing_session_closed", "local_pairing_ticket_replayed", "unknown"}) {
      LocalCompanionPairingClient client = new LocalCompanionPairingClient(endpoint -> endpoint.endsWith("/status")
          ? new FakeConnection(endpoint, "{\"ok\":true,\"desktop_id\":\"" + DESKTOP + "\"}", 200)
          : new FakeConnection(endpoint, "{\"ok\":false,\"code\":\"" + code + "\",\"message\":\"arbitrary-secret-message\"}", 401));
      try { client.pairWithQr(prefs, identity(), QR); fail("invalid ticket"); }
      catch (LocalCompanionPairingClient.PairingException expected) {
        assertEquals(code, expected.code);
        assertFalse(expected.getMessage().contains("arbitrary-secret-message"));
        assertTrue(expected.getMessage().contains("QR"));
      }
    }
  }

  @Test public void previousHostedQueueAndBarrierBlockPairingWithoutNetworkOrDiscard() throws Exception {
    discover();
    ActionOutbox outbox = new ActionOutbox(prefs);
    String previous = "companion:https://old.example.test";
    outbox.appendAll(Collections.singletonList(ActionOutbox.PendingAction.create("stable-id", "room_update", new JSONObject().put("room_id", "room-1"), previous)));
    LocalCompanionPairingClient client = new LocalCompanionPairingClient(endpoint -> { throw new AssertionError("No network allowed across target fence"); });
    try { client.pairWithQr(prefs, identity(), QR); fail("target fence"); }
    catch (LocalCompanionPairingClient.PairingException expected) { assertEquals("target_barrier", expected.code); }
    assertEquals("stable-id", new ActionOutbox(prefs).load().get(0).id);
    assertTrue(outbox.load().get(0).matchesTarget(previous));
    outbox.clear(); // Explicit test development reset, never production onboarding.
    ConnectionSettings.markHostingActionBarrier(prefs, previous);
    try { client.pairWithQr(prefs, identity(), QR); fail("hosting barrier"); }
    catch (LocalCompanionPairingClient.PairingException expected) { assertEquals("target_barrier", expected.code); }
    assertTrue(ConnectionSettings.hasHostingActionBarrier(prefs, previous));
  }

  @Test public void pendingHostedReceiptBlocksTargetSwitch() throws Exception {
    prefs.edit().putString(ConnectionSettings.KEY_WEB_MODULE_URL, "https://old.example.test").commit();
    String previous = CompanionConnectionIdentity.actionTargetKey("https://old.example.test");
    OperationData.ActionRecord receipt = new OperationData.ActionRecord();
    receipt.id = "pending-receipt"; receipt.type = "commerce_order_confirm"; receipt.status = "pending"; receipt.orderId = "order-1";
    new OperationCache(prefs, identity().deviceId).recordActionResult(receipt, previous);
    try { LocalCompanionPairingClient.assertTargetAvailable(prefs, identity(), CompanionConnectionIdentity.localActionTargetKey(DESKTOP)); fail("pending receipt"); }
    catch (LocalCompanionPairingClient.PairingException expected) { assertEquals("target_barrier", expected.code); }
  }

  @Test public void localOnlyFailureKeepsOrderedIdentityAndNeverCallsHosting() throws Exception {
    paired();
    ActionOutbox outbox = new ActionOutbox(prefs);
    String target = CompanionConnectionIdentity.localActionTargetKey(DESKTOP);
    JSONObject payload = new JSONObject().put("room_id", "room-1");
    outbox.appendAll(Collections.singletonList(ActionOutbox.PendingAction.create("stable-id", "room_update", payload, target)));
    FakeTransport local = new FakeTransport(); local.error = "local_delivery_unknown";
    CompanionOperationsRouter router = new CompanionOperationsRouter(prefs, forbiddenHosting(), desktop -> { assertEquals(DESKTOP, desktop); return local; });
    for (int retry = 0; retry < 2; retry++) {
      ActionOutbox.PendingAction pending = new ActionOutbox(prefs).load().get(0);
      try { router.enqueueAction("", "", identity(), pending.id, pending.type, pending.payload); fail("offline"); }
      catch (AndroidOperationsTransport.TransportException expected) { assertEquals("local_delivery_unknown", expected.code); assertFalse(expected.invalidatesPendingAction()); }
      assertEquals("stable-id", local.lastActionId);
      assertEquals(payload.toString(), local.lastPayload.toString());
      assertEquals(1, outbox.load().size());
    }
    local.error = "local_unreachable";
    try { router.fetchOperations("", "", identity(), 4); fail("offline fetch"); }
    catch (AndroidOperationsTransport.TransportException expected) { assertEquals("local_unreachable", expected.code); }
    local.error = "";
    ActionOutbox.PendingAction pending = outbox.load().get(0);
    assertEquals("stable-id", router.enqueueAction("", "", identity(), pending.id, pending.type, pending.payload).id);
    assertEquals("local:" + DESKTOP, router.preferredSourceKey("", ""));
  }

  @Test public void reconnectAcceptsSameDesktopNewIpButRejectsDifferentDesktop() {
    paired();
    String target = ConnectionSettings.localConnection(prefs).targetKey;
    ConnectionSettings.clearLocalEndpoint(prefs);
    assertTrue(ConnectionSettings.isComplete(prefs));
    assertFalse(ConnectionSettings.storeDiscoveredLocalEndpoint(prefs, OTHER, "https://192.168.1.4:3456"));
    assertTrue(ConnectionSettings.storeDiscoveredLocalEndpoint(prefs, DESKTOP, "https://192.168.1.3:4567"));
    assertEquals(target, ConnectionSettings.localConnection(prefs).targetKey);
    assertEquals(TOKEN, ConnectionSettings.localConnection(prefs).localToken);
  }

  @Test public void hostedFallbackRemainsButUnknownDeliveryCannotChangeTransport() throws Exception {
    prefs.edit().putString(ConnectionSettings.KEY_WEB_MODULE_URL, "https://host.test").putString(ConnectionSettings.KEY_SYNC_SECRET, "host-secret").commit();
    String target = CompanionConnectionIdentity.actionTargetKey("https://host.test");
    assertTrue(ConnectionSettings.storeLocalPairing(prefs, DESKTOP, ENDPOINT, target, TOKEN, PIN));
    FakeTransport hosting = new FakeTransport(), local = new FakeTransport();
    local.error = "local_delivery_unknown";
    CompanionOperationsRouter router = new CompanionOperationsRouter(prefs, hosting, desktop -> local);
    try { router.enqueueAction("https://host.test", "host-secret", identity(), "stable", "room_update", new JSONObject()); fail("unknown"); }
    catch (AndroidOperationsTransport.TransportException expected) { assertFalse(expected.allowsHostingFallback()); }
    assertEquals(0, hosting.actions);
    local.error = "local_unreachable";
    router.fetchOperations("https://host.test", "host-secret", identity(), 99);
    assertEquals(1, hosting.fetches);
    assertEquals(0, hosting.lastRevision);
  }

  @Test public void actualActionTransportClassifiesLostResponseAsUnknownAndKeepsTokenOffRedirects() throws Exception {
    paired();
    FakeConnection lost = new FakeConnection(ENDPOINT + "/local/v1/action", "not-json", 200);
    LocalDesktopOperationsTransport transport = new LocalDesktopOperationsTransport(prefs, DESKTOP, endpoint -> lost);
    try { transport.enqueueAction(ENDPOINT, TOKEN, identity(), "stable-id", "room_update", new JSONObject()); fail("lost reply"); }
    catch (AndroidOperationsTransport.TransportException expected) {
      assertEquals("local_delivery_unknown", expected.code);
      assertFalse(expected.allowsHostingFallback());
      assertFalse(expected.invalidatesPendingAction());
    }
    assertFalse(lost.getInstanceFollowRedirects());
    assertEquals(TOKEN, lost.getRequestProperty(LocalCompanionProtocol.TOKEN_HEADER));
    assertEquals("stable-id", new JSONObject(lost.body.toString("UTF-8")).getString("id"));
  }

  @Test public void unknownReceiptAndCorruptReceiptStoreFailClosedOnTargetSwitch() throws Exception {
    prefs.edit().putString(ConnectionSettings.KEY_WEB_MODULE_URL, "https://old.example.test").commit();
    for (String rows : new String[] {"[{\"target_key\":\"companion:https://old.example.test\",\"status\":\"unknown\"}]", "broken"}) {
      prefs.edit().putString("operations_action_results_v2", rows).commit();
      try { LocalCompanionPairingClient.assertTargetAvailable(prefs, identity(), CompanionConnectionIdentity.localActionTargetKey(DESKTOP)); fail("receipt barrier"); }
      catch (LocalCompanionPairingClient.PairingException expected) { assertEquals("target_barrier", expected.code); }
    }
  }

  @Test public void evenMalformedLocalBarrierCannotInvokeHosting() throws Exception {
    paired();
    ConnectionSettings.markHostingActionBarrier(prefs, CompanionConnectionIdentity.localActionTargetKey(DESKTOP));
    CompanionOperationsRouter router = new CompanionOperationsRouter(prefs, forbiddenHosting());
    try { router.fetchOperations("", "", identity(), 0); fail("barrier"); }
    catch (AndroidOperationsTransport.TransportException expected) { assertEquals("target_barrier", expected.code); }
    try { router.enqueueAction("", "", identity(), "stable-id", "room_update", new JSONObject()); fail("barrier"); }
    catch (AndroidOperationsTransport.TransportException expected) { assertEquals("target_barrier", expected.code); }
  }

  private static AndroidOperationsTransport forbiddenHosting() {
    return new AndroidOperationsTransport() {
      @Override public String preferredSourceKey(String a, String b) { throw new AssertionError("Hosting used"); }
      @Override public FetchResult fetchOperations(String a, String b, DeviceIdentity c, long d) { throw new AssertionError("Hosting used"); }
      @Override public OperationData.ActionRecord enqueueAction(String a, String b, DeviceIdentity c, String d, String e, JSONObject f) { throw new AssertionError("Hosting used"); }
    };
  }

  private static final class FakeTransport implements AndroidOperationsTransport {
    String error = "", lastActionId; JSONObject lastPayload; int actions, fetches; long lastRevision;
    @Override public String preferredSourceKey(String a, String b) { return "hosting:test"; }
    @Override public FetchResult fetchOperations(String a, String b, DeviceIdentity c, long revision) throws TransportException {
      fetches++; lastRevision = revision;
      if (!error.isEmpty()) throw new TransportException("Offline", error, 0, null);
      return new FetchResult(false, 1, null, new JSONObject(), "hosting:test");
    }
    @Override public OperationData.ActionRecord enqueueAction(String a, String b, DeviceIdentity c, String id, String type, JSONObject payload) throws TransportException {
      actions++; lastActionId = id; lastPayload = payload;
      if (!error.isEmpty()) throw new TransportException("Offline", error, 0, null);
      OperationData.ActionRecord result = new OperationData.ActionRecord(); result.id = id; result.status = "applied"; return result;
    }
  }

  static class FakeConnection extends HttpsURLConnection {
    String certificate = "leaf";
    boolean authenticated;
    int sentRequests;
    final ByteArrayOutputStream body = new ByteArrayOutputStream();
    private final String response; private final int status;
    FakeConnection(String endpoint, String response, int status) throws Exception { super(new URL(endpoint)); this.response = response; this.status = status; }
    @Override public void disconnect() {}
    @Override public boolean usingProxy() { return false; }
    @Override public void connect() { authenticated = true; }
    @Override public String getCipherSuite() { return "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256"; }
    @Override public Certificate[] getLocalCertificates() { return null; }
    @Override public Certificate[] getServerCertificates() {
      assertTrue(authenticated);
      try { return new Certificate[] {LocalTlsTestCertificates.certificate(certificate)}; }
      catch (Exception error) { throw new AssertionError(error); }
    }
    @Override public int getResponseCode() { assertTrue(authenticated); sentRequests++; return status; }
    @Override public java.io.OutputStream getOutputStream() { assertTrue(authenticated); sentRequests++; return body; }
    @Override public java.io.InputStream getInputStream() { return new ByteArrayInputStream(response.getBytes(StandardCharsets.UTF_8)); }
    @Override public java.io.InputStream getErrorStream() { return getInputStream(); }
  }
}
