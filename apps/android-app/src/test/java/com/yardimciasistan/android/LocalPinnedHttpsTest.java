package com.yardimciasistan.android;

import static org.junit.Assert.*;

import java.net.HttpURLConnection;
import java.net.URL;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.Collections;

import org.json.JSONObject;
import org.junit.Test;

public final class LocalPinnedHttpsTest {
  private static final String DESKTOP = "desktop-12345678-1234-1234-1234-123456789abc";
  private static final String BASE = "https://192.168.1.2:3456";
  private static final String TOKEN = "yal_" + String.join("", Collections.nCopies(64, "a"));
  private static final String PIN = LocalTlsTestCertificates.pin("leaf");
  private static final String SHORT_SECRET = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[32]);
  private final AndroidCompanionStorageTest.InMemoryPreferences prefs = new AndroidCompanionStorageTest.InMemoryPreferences();

  private DeviceIdentity identity() throws Exception {
    java.lang.reflect.Constructor<DeviceIdentity> c = DeviceIdentity.class.getDeclaredConstructor(
        String.class, String.class, String.class, android.content.SharedPreferences.class);
    c.setAccessible(true);
    return c.newInstance("android-local-test", "Phone", "2.1.0", prefs);
  }

  private String qr(String pin) { return "yapair3|" + DESKTOP + "|" + SHORT_SECRET + "|192.168.1.2:3456|" + pin; }
  private void pair() { assertTrue(ConnectionSettings.storeLocalPairing(prefs, DESKTOP, BASE,
      CompanionConnectionIdentity.localActionTargetKey(DESKTOP), TOKEN, PIN)); }

  @Test public void realS1LeafAndSameSpkiRenewalAuthenticate() throws Exception {
    byte[] pin = LocalPinnedHttps.decodePin(PIN);
    for (String name : new String[] {"leaf", "renewed"}) {
      LocalPinnedHttps.verify(new X509Certificate[] {LocalTlsTestCertificates.certificate(name)}, pin, "192.168.1.2");
    }
    assertEquals(PIN, LocalTlsTestCertificates.pin("renewed"));
    assertNotEquals(LocalTlsTestCertificates.certificate("leaf"), LocalTlsTestCertificates.certificate("renewed"));
  }

  @Test public void rejectsWrongKeyIpValidityCaAndEku() throws Exception {
    for (String name : new String[] {"wrong-key", "wrong-san", "expired", "future", "ca", "no-eku"}) {
      try {
        LocalPinnedHttps.verify(new X509Certificate[] {LocalTlsTestCertificates.certificate(name)}, LocalPinnedHttps.decodePin(PIN), "192.168.1.2");
        fail("Untrusted profile: " + name);
      } catch (CertificateException expected) { /* fail closed */ }
    }
    try {
      LocalPinnedHttps.verify(new X509Certificate[] {LocalTlsTestCertificates.certificate("leaf")}, LocalPinnedHttps.decodePin(PIN), "192.168.1.3");
      fail("IP SAN mismatch");
    } catch (CertificateException expected) { /* no CN fallback */ }
  }

  @Test public void rejectsInvalidSelfSignatureAndExtraCertificateChain() throws Exception {
    X509Certificate leaf = LocalTlsTestCertificates.certificate("leaf");
    byte[] encoded = leaf.getEncoded(); encoded[encoded.length - 1] ^= 1;
    X509Certificate tampered = (X509Certificate) java.security.cert.CertificateFactory.getInstance("X.509")
        .generateCertificate(new java.io.ByteArrayInputStream(encoded));
    for (X509Certificate[] chain : new X509Certificate[][] {{tampered}, {leaf, leaf}}) {
      try { LocalPinnedHttps.verify(chain, LocalPinnedHttps.decodePin(PIN), "192.168.1.2"); fail("Invalid self-signature/chain"); }
      catch (CertificateException expected) { /* fail before HTTP bytes */ }
    }
  }

  @Test public void v3OnlyCanonicalEncodingAndStrictPrivateEndpoint() throws Exception {
    assertEquals(PIN, LocalPairingQr.parse(qr(PIN)).spkiSha256);
    for (String value : new String[] {
        qr(PIN).replace("yapair3", "yapair1"), qr(PIN).replace("yapair3", "yapair2"),
        qr(PIN).replace(PIN, String.join("", Collections.nCopies(43, "B"))), qr(PIN) + "=", qr(PIN).replace(PIN, ""),
        qr(PIN).replace("192.168.1.2", "127.0.0.1"), qr(PIN).replace("192.168.1.2", "8.8.8.8"),
        qr(PIN).replace("192.168.1.2", "192.168.01.2"), qr(PIN).replace(":3456", ":65536"),
        qr(PIN).replace("192.168.1.2:3456", "user@192.168.1.2:3456"), " " + qr(PIN),
        qr(PIN).replace("192.168.1.2:3456", "192.168.1.2:3456/path")
    }) {
      try { LocalPairingQr.parse(value); fail("Invalid QR accepted"); }
      catch (LocalCompanionPairingClient.PairingException expected) { assertEquals("local_qr_invalid", expected.code); }
    }
  }

  @Test public void atomicPinStorageAndMissingPinFailClosed() throws Exception {
    assertFalse(ConnectionSettings.storeLocalPairing(prefs, DESKTOP, BASE,
        CompanionConnectionIdentity.localActionTargetKey(DESKTOP), TOKEN, ""));
    assertFalse(ConnectionSettings.storeLocalPairing(prefs, DESKTOP, BASE.replace("https:", "http:"),
        CompanionConnectionIdentity.localActionTargetKey(DESKTOP), TOKEN, PIN));
    pair();
    ConnectionSettings.LocalConnection restored = ConnectionSettings.localConnection(prefs);
    assertEquals(PIN, restored.spkiSha256);
    assertEquals(TOKEN, restored.localToken);
    assertTrue(restored.isComplete());
    prefs.edit().remove(ConnectionSettings.KEY_LOCAL_SPKI_SHA256).commit();
    assertFalse(ConnectionSettings.isComplete(prefs));
    LocalDesktopOperationsTransport transport = new LocalDesktopOperationsTransport(prefs, DESKTOP, endpoint -> { throw new AssertionError("No pin: no connection"); });
    assertTlsFailure(transport);
    assertEquals(TOKEN, ConnectionSettings.localConnection(prefs).localToken);
  }

  @Test public void wrongCertificateWithSameDesktopIdSendsNeitherTicketNorToken() throws Exception {
    for (String cert : new String[] {"wrong-key", "wrong-san"}) {
      AndroidLocalOnboardingTest.FakeConnection status = fake("/status", 200);
      status.certificate = cert;
      LocalCompanionPairingClient client = new LocalCompanionPairingClient(endpoint -> status);
      try { client.pairWithQr(prefs, identity(), qr(PIN)); fail("Wrong TLS peer"); }
      catch (LocalCompanionPairingClient.PairingException expected) { assertEquals("local_tls_authentication_failed", expected.code); }
      assertEquals(0, status.sentRequests);
      assertEquals(0, status.body.size());
      pair();
      AndroidLocalOnboardingTest.FakeConnection action = fake("/action", 200);
      action.certificate = cert;
      LocalDesktopOperationsTransport transport = new LocalDesktopOperationsTransport(prefs, DESKTOP, endpoint -> action);
      assertTlsFailure(transport);
      assertEquals(0, action.sentRequests);
      assertEquals(0, action.body.size());
      assertEquals(PIN, ConnectionSettings.localConnection(prefs).spkiSha256);
    }
  }

  @Test public void pairRequestIsAuthenticatedAgainAfterSuccessfulStatus() throws Exception {
    AndroidLocalOnboardingTest.FakeConnection status = fake("/status", 200);
    AndroidLocalOnboardingTest.FakeConnection post = fake("/pair", 200); post.certificate = "wrong-key";
    LocalCompanionPairingClient client = new LocalCompanionPairingClient(endpoint -> endpoint.endsWith("/status") ? status : post);
    try { client.pairWithQr(prefs, identity(), qr(PIN)); fail("Peer changed after probe"); }
    catch (LocalCompanionPairingClient.PairingException expected) { assertEquals("local_tls_authentication_failed", expected.code); }
    assertEquals(0, post.sentRequests);
    assertEquals(0, post.body.size());
    assertFalse(ConnectionSettings.isComplete(prefs));
  }

  @Test public void rejectsHttpFactoryDowngradeAndRedirectWithoutFollowing() throws Exception {
    pair();
    int[] opens = {0};
    HttpURLConnection plaintext = new HttpURLConnection(new URL(BASE.replace("https:", "http:") + "/local/v1/action")) {
      @Override public void disconnect() {}
      @Override public boolean usingProxy() { return false; }
      @Override public void connect() { throw new AssertionError("Plain HTTP used"); }
    };
    LocalDesktopOperationsTransport transport = new LocalDesktopOperationsTransport(prefs, DESKTOP, endpoint -> { opens[0]++; return plaintext; });
    assertTlsFailure(transport);
    assertEquals(1, opens[0]);
    AndroidLocalOnboardingTest.FakeConnection redirect = fake("/action", 307);
    transport = new LocalDesktopOperationsTransport(prefs, DESKTOP, endpoint -> { opens[0]++; return redirect; });
    assertTlsFailure(transport);
    assertEquals(2, opens[0]);
    assertFalse(redirect.getInstanceFollowRedirects());
    // An authenticated redirect may receive the original request, never a second request to Location.
    assertEquals(1, new JSONObject(redirect.body.toString("UTF-8")).getJSONObject("payload").getInt("pin-test-marker"));
  }

  @Test public void pinChangePreservesDurableQueueAndPendingReceiptsBeforeAnyNetwork() throws Exception {
    pair();
    String target = CompanionConnectionIdentity.localActionTargetKey(DESKTOP);
    ActionOutbox outbox = new ActionOutbox(prefs);
    outbox.appendAll(Collections.singletonList(ActionOutbox.PendingAction.create("stable-id", "room_update", new JSONObject().put("room_id", "r1"), target)));
    LocalCompanionPairingClient client = new LocalCompanionPairingClient(endpoint -> { throw new AssertionError("Identity fence must run first"); });
    String changedQr = qr(LocalTlsTestCertificates.pin("wrong-key"));
    try { client.pairWithQr(prefs, identity(), changedQr); fail("Pin changed with queue"); }
    catch (LocalCompanionPairingClient.PairingException expected) { assertEquals("target_barrier", expected.code); }
    assertEquals("stable-id", new ActionOutbox(prefs).load().get(0).id);
    assertEquals(PIN, ConnectionSettings.localConnection(prefs).spkiSha256);
    outbox.clear(); // Test fixture only.
    OperationData.ActionRecord receipt = new OperationData.ActionRecord();
    receipt.id = "pending-receipt"; receipt.type = "commerce_order_confirm"; receipt.status = "pending"; receipt.orderId = "o1";
    new OperationCache(prefs, identity().deviceId).recordActionResult(receipt, target);
    try { client.pairWithQr(prefs, identity(), changedQr); fail("Pin changed with receipt"); }
    catch (LocalCompanionPairingClient.PairingException expected) { assertEquals("target_barrier", expected.code); }
    assertTrue(new OperationCache(prefs, identity().deviceId).hasUnresolvedActionResults(target));
  }

  @Test public void reconnectReadsPersistedPinAndRejectsChangedIdentityWithoutDroppingQueue() throws Exception {
    pair();
    ActionOutbox outbox = new ActionOutbox(prefs);
    outbox.appendAll(Collections.singletonList(ActionOutbox.PendingAction.create("stable-id", "room_update", new JSONObject(), CompanionConnectionIdentity.localActionTargetKey(DESKTOP))));
    LocalDesktopOperationsTransport transport = new LocalDesktopOperationsTransport(prefs, DESKTOP, endpoint -> { throw new AssertionError("Changed pin must reject first"); });
    prefs.edit().putString(ConnectionSettings.KEY_LOCAL_SPKI_SHA256, LocalTlsTestCertificates.pin("wrong-key")).commit();
    assertTlsFailure(transport);
    assertEquals("stable-id", new ActionOutbox(prefs).load().get(0).id);
  }

  @Test public void mdnsUpdateMustAuthenticateExistingPinAndCannotCreateTrust() throws Exception {
    int[] requests = {0};
    LocalCompanionPairingClient client = new LocalCompanionPairingClient(endpoint -> { requests[0]++; return fake("/status", 200); });
    assertFalse(client.refreshDiscoveredEndpoint(prefs, DESKTOP, BASE));
    assertEquals(0, requests[0]);
    pair();
    assertFalse(client.refreshDiscoveredEndpoint(prefs, DESKTOP, "http://192.168.1.2:4567"));
    assertEquals(0, requests[0]);
    LocalCompanionPairingClient wrong = new LocalCompanionPairingClient(endpoint -> { AndroidLocalOnboardingTest.FakeConnection c = fake("/status", 200); c.certificate = "wrong-key"; return c; });
    assertFalse(wrong.refreshDiscoveredEndpoint(prefs, DESKTOP, BASE));
    assertEquals(PIN, ConnectionSettings.localConnection(prefs).spkiSha256);
    assertTrue(client.refreshDiscoveredEndpoint(prefs, DESKTOP, BASE));
    assertEquals(PIN, ConnectionSettings.localConnection(prefs).spkiSha256);
  }

  @Test public void summaryAndActionAcceptRenewedCertificateWithoutChangingTrust() throws Exception {
    pair();
    java.util.List<AndroidLocalOnboardingTest.FakeConnection> requests = new java.util.ArrayList<>();
    LocalDesktopOperationsTransport transport = new LocalDesktopOperationsTransport(prefs, DESKTOP, endpoint -> {
      AndroidLocalOnboardingTest.FakeConnection c = new AndroidLocalOnboardingTest.FakeConnection(endpoint,
          endpoint.endsWith("/summary") ? "{\"ok\":true,\"not_modified\":true,\"server_revision\":7}" : "{\"ok\":true,\"status\":\"applied\"}", 200);
      c.certificate = "renewed"; requests.add(c); return c;
    });
    assertTrue(transport.fetchOperations(BASE, TOKEN, identity(), 7).notModified);
    assertEquals("stable-id", transport.enqueueAction(BASE, TOKEN, identity(), "stable-id", "room_update", new JSONObject()).id);
    assertEquals(2, requests.size());
    for (AndroidLocalOnboardingTest.FakeConnection c : requests) {
      assertEquals(TOKEN, c.getRequestProperty(LocalCompanionProtocol.TOKEN_HEADER));
      assertTrue(c.body.size() > 0);
    }
    assertEquals(PIN, ConnectionSettings.localConnection(prefs).spkiSha256);
  }

  @Test public void saleAckRejectsUntrustedReceiptAndKeepsLegacyCompatibility() throws Exception {
    pair();
    JSONObject intent = new JSONObject().put("settlement", "paid").put("customer_id", "c1").put("payment_method", "cash")
        .put("lines", new org.json.JSONArray().put(new JSONObject().put("expected_currency", "TRY")));
    JSONObject receipt = new JSONObject().put("saleId", "sale-1").put("businessId", "business-1")
        .put("source", "android-market-sale").put("customerId", "c1").put("cashPaidMinor", 1000)
        .put("pointsTenderMinor", 0).put("currency", "TRY").put("paymentMethod", "cash");
    JSONObject ack = new JSONObject().put("ok", true).put("status", "applied").put("action_id", "sale-action-1").put("sale_receipt", receipt);
    LocalDesktopOperationsTransport good = new LocalDesktopOperationsTransport(prefs, DESKTOP,
        endpoint -> new AndroidLocalOnboardingTest.FakeConnection(endpoint, endpoint.endsWith("/summary")
            ? "{\"ok\":true,\"desktop_id\":\"" + DESKTOP + "\",\"business_id\":\"business-1\",\"approval_required\":false}" : ack.toString(), 200));
    assertEquals("sale-action-1", good.enqueueAction(BASE, TOKEN, identity(), "sale-action-1", "market_sale_complete", intent).id);
    for (String field : new String[] {"source", "customerId", "cashPaidMinor", "pointsTenderMinor", "currency", "paymentMethod"}) {
      JSONObject badReceipt = new JSONObject(receipt.toString());
      badReceipt.put(field, field.equals("cashPaidMinor") ? -1 : field.equals("pointsTenderMinor") ? 1 : "wrong");
      JSONObject badAck = new JSONObject(ack.toString()).put("sale_receipt", badReceipt);
      LocalDesktopOperationsTransport bad = new LocalDesktopOperationsTransport(prefs, DESKTOP,
          endpoint -> new AndroidLocalOnboardingTest.FakeConnection(endpoint, badAck.toString(), 200));
      try { bad.enqueueAction(BASE, TOKEN, identity(), "sale-action-1", "market_sale_complete", intent); fail("Accepted invalid " + field); }
      catch (AndroidOperationsTransport.TransportException expected) { assertEquals("local_delivery_unknown", expected.code); }
    }
    // An applied market sale with NO receipt is never delivery proof. This also
    // covers any legacy/desktop that omitted the receipt: keep the action queued.
    JSONObject legacy = new JSONObject().put("ok", true).put("status", "applied");
    int[] legacyCalls = {0};
    LocalDesktopOperationsTransport old = new LocalDesktopOperationsTransport(prefs, DESKTOP,
        endpoint -> { legacyCalls[0]++; assertTrue(endpoint.endsWith("/action")); return new AndroidLocalOnboardingTest.FakeConnection(endpoint, legacy.toString(), 200); });
    try { old.enqueueAction(BASE, TOKEN, identity(), "sale-action-1", "market_sale_complete", intent); fail("Applied sale without receipt accepted"); }
    catch (AndroidOperationsTransport.TransportException expected) { assertEquals("local_delivery_unknown", expected.code); }
    assertEquals(1, legacyCalls[0]);
  }

  @Test public void positivePointsSaleRequiresMatchingReceiptBeforeDequeue() throws Exception {
    pair();
    JSONObject intent = new JSONObject().put("settlement", "paid").put("customer_id", "c1").put("payment_method", "cash")
        .put("requestedPointsMinor", 1000)
        .put("lines", new org.json.JSONArray().put(new JSONObject().put("expected_currency", "TRY")));
    JSONObject receipt = new JSONObject().put("saleId", "sale-1").put("businessId", "business-1")
        .put("source", "android-market-sale").put("customerId", "c1").put("cashPaidMinor", 99000)
        .put("pointsTenderMinor", 1000).put("currency", "TRY").put("paymentMethod", "cash");
    JSONObject ack = new JSONObject().put("ok", true).put("status", "applied").put("action_id", "sale-action-1").put("sale_receipt", receipt);
    LocalDesktopOperationsTransport good = new LocalDesktopOperationsTransport(prefs, DESKTOP,
        endpoint -> new AndroidLocalOnboardingTest.FakeConnection(endpoint, endpoint.endsWith("/summary")
            ? "{\"ok\":true,\"desktop_id\":\"" + DESKTOP + "\",\"business_id\":\"business-1\",\"approval_required\":false}" : ack.toString(), 200));
    assertEquals("sale-action-1", good.enqueueAction(BASE, TOKEN, identity(), "sale-action-1", "market_sale_complete", intent).id);

    // Missing receipt on an applied positive-points sale must keep it queued.
    JSONObject missing = new JSONObject().put("ok", true).put("status", "applied").put("action_id", "sale-action-1");
    // A cash-only or forged point tender is equally unproven.
    JSONObject zeroPoints = new JSONObject(ack.toString())
        .put("sale_receipt", new JSONObject(receipt.toString()).put("pointsTenderMinor", 0));
    JSONObject otherAmount = new JSONObject(ack.toString())
        .put("sale_receipt", new JSONObject(receipt.toString()).put("pointsTenderMinor", 999));
    for (JSONObject response : new JSONObject[] {missing, zeroPoints, otherAmount}) {
      LocalDesktopOperationsTransport invalid = new LocalDesktopOperationsTransport(prefs, DESKTOP,
          endpoint -> new AndroidLocalOnboardingTest.FakeConnection(endpoint, response.toString(), 200));
      try { invalid.enqueueAction(BASE, TOKEN, identity(), "sale-action-1", "market_sale_complete", intent); fail("Unproven points receipt accepted"); }
      catch (AndroidOperationsTransport.TransportException expected) { assertEquals("local_delivery_unknown", expected.code); }
    }
  }

  @Test public void saleAckChecksActionCreditAndNeverPersistsReceipt() throws Exception {
    pair();
    JSONObject intent = new JSONObject().put("settlement", "credit").put("customer_id", "c1").put("payment_method", "")
        .put("lines", new org.json.JSONArray().put(new JSONObject().put("expected_currency", "TRY")));
    JSONObject receipt = new JSONObject().put("saleId", "sale-1").put("businessId", "business-1")
        .put("source", "android-market-sale").put("customerId", "c1").put("cashPaidMinor", 0)
        .put("pointsTenderMinor", 0).put("currency", "TRY").put("paymentMethod", "");
    JSONObject ack = new JSONObject().put("ok", true).put("status", "applied").put("action_id", "sale-action-1").put("sale_receipt", receipt);
    LocalDesktopOperationsTransport transport = new LocalDesktopOperationsTransport(prefs, DESKTOP,
        endpoint -> new AndroidLocalOnboardingTest.FakeConnection(endpoint, endpoint.endsWith("/summary")
            ? "{\"ok\":true,\"desktop_id\":\"" + DESKTOP + "\",\"business_id\":\"business-1\",\"approval_required\":false}" : ack.toString(), 200));
    OperationData.ActionRecord record = transport.enqueueAction(BASE, TOKEN, identity(), "sale-action-1", "market_sale_complete", intent);
    new OperationCache(prefs, identity().deviceId).recordActionResult(record, CompanionConnectionIdentity.localActionTargetKey(DESKTOP));
    assertFalse(prefs.getAll().toString().contains("sale-1"));
    assertFalse(prefs.getAll().toString().contains("business-1"));
    assertTrue(new ActionOutbox(prefs).load().isEmpty());
    JSONObject[] bad = {
        new JSONObject(ack.toString()).put("action_id", "other-action"),
        new JSONObject(ack.toString()).put("sale_receipt", new JSONObject(receipt.toString()).put("cashPaidMinor", 1)),
        new JSONObject(ack.toString()).put("sale_receipt", new JSONObject(receipt.toString()).put("cashPaidMinor", 1.5)),
        new JSONObject(ack.toString()).put("sale_receipt", JSONObject.NULL),
        new JSONObject(ack.toString()).put("sale_receipt", new JSONObject(receipt.toString()).put("businessId", ""))
    };
    for (JSONObject response : bad) {
      LocalDesktopOperationsTransport invalid = new LocalDesktopOperationsTransport(prefs, DESKTOP,
          endpoint -> new AndroidLocalOnboardingTest.FakeConnection(endpoint, response.toString(), 200));
      try { invalid.enqueueAction(BASE, TOKEN, identity(), "sale-action-1", "market_sale_complete", intent); fail("Invalid ACK accepted"); }
      catch (AndroidOperationsTransport.TransportException expected) { assertEquals("local_delivery_unknown", expected.code); }
    }
  }

  @Test public void receiptRequiresFreshPinnedSummaryAndMatchingTenant() throws Exception {
    pair();
    JSONObject intent = new JSONObject().put("settlement", "paid").put("customer_id", "c1").put("payment_method", "cash")
        .put("lines", new org.json.JSONArray().put(new JSONObject().put("expected_currency", "TRY")));
    JSONObject receipt = new JSONObject().put("saleId", "sale-1").put("businessId", "business-1").put("source", "android-market-sale")
        .put("customerId", "c1").put("cashPaidMinor", 1000).put("pointsTenderMinor", 0).put("currency", "TRY").put("paymentMethod", "cash");
    JSONObject ack = new JSONObject().put("ok", true).put("status", "applied").put("action_id", "sale-action-1").put("sale_receipt", receipt);
    java.util.List<AndroidLocalOnboardingTest.FakeConnection> calls = new java.util.ArrayList<>();
    LocalDesktopOperationsTransport transport = new LocalDesktopOperationsTransport(prefs, DESKTOP, endpoint -> {
      String body = endpoint.endsWith("/summary") ? "{\"ok\":true,\"desktop_id\":\"" + DESKTOP + "\",\"business_id\":\"different\",\"approval_required\":false}" : ack.toString();
      AndroidLocalOnboardingTest.FakeConnection c = new AndroidLocalOnboardingTest.FakeConnection(endpoint, body, 200); calls.add(c); return c;
    });
    try { transport.enqueueAction(BASE, TOKEN, identity(), "sale-action-1", "market_sale_complete", intent); fail("Tenant mismatch accepted"); }
    catch (AndroidOperationsTransport.TransportException expected) { assertEquals("local_delivery_unknown", expected.code); }
    assertEquals(2, calls.size());
    JSONObject request = new JSONObject(calls.get(1).body.toString("UTF-8"));
    assertEquals(1, request.length()); assertEquals(0, request.getInt("known_server_revision"));
    assertEquals(TOKEN, calls.get(1).getRequestProperty(LocalCompanionProtocol.TOKEN_HEADER));
    assertFalse(calls.get(1).getUseCaches());
  }

  @Test public void freshReceiptSummaryRejectsMissingDeniedChangedPairingAndWrongCertificate() throws Exception {
    pair();
    JSONObject intent = new JSONObject().put("settlement", "credit").put("customer_id", "c1").put("payment_method", "")
        .put("lines", new org.json.JSONArray().put(new JSONObject().put("expected_currency", "TRY")));
    JSONObject receipt = new JSONObject().put("saleId", "sale-1").put("businessId", "business-1").put("source", "android-market-sale")
        .put("customerId", "c1").put("cashPaidMinor", 0).put("pointsTenderMinor", 0).put("currency", "TRY").put("paymentMethod", "");
    JSONObject ack = new JSONObject().put("ok", true).put("status", "applied").put("action_id", "sale-action-1").put("already_applied", true).put("sale_receipt", receipt);
    String valid = "{\"ok\":true,\"desktop_id\":\"" + DESKTOP + "\",\"business_id\":\"business-1\",\"approval_required\":false}";
    String[] bad = {"{}", "{\"ok\":true,\"desktop_id\":\"" + DESKTOP + "\",\"approval_required\":false}",
        "{\"ok\":true,\"desktop_id\":\"other\",\"business_id\":\"business-1\",\"approval_required\":false}",
        "{\"ok\":true,\"desktop_id\":\"" + DESKTOP + "\",\"business_id\":\"business-1\",\"approval_required\":true}",
        "{\"ok\":true,\"desktop_id\":\"" + DESKTOP + "\",\"business_id\":\"business-1\",\"approval_required\":false,\"not_modified\":true}"};
    for (String summary : bad) {
      LocalDesktopOperationsTransport t = new LocalDesktopOperationsTransport(prefs, DESKTOP, endpoint ->
          new AndroidLocalOnboardingTest.FakeConnection(endpoint, endpoint.endsWith("/summary") ? summary : ack.toString(), 200));
      try { t.enqueueAction(BASE, TOKEN, identity(), "sale-action-1", "market_sale_complete", intent); fail("Invalid summary accepted"); }
      catch (AndroidOperationsTransport.TransportException expected) { assertEquals("local_delivery_unknown", expected.code); }
    }
    for (String mode : new String[] {"denied", "unreachable", "wrong-key", "pairing-changed", "token-changed"}) {
      pair();
      LocalDesktopOperationsTransport t = new LocalDesktopOperationsTransport(prefs, DESKTOP, endpoint -> {
        boolean summary = endpoint.endsWith("/summary");
        if (summary && mode.equals("unreachable")) throw new java.io.IOException("offline");
        if (summary && mode.equals("pairing-changed")) prefs.edit().putString(ConnectionSettings.KEY_LOCAL_SPKI_SHA256, LocalTlsTestCertificates.pin("wrong-key")).commit();
        if (summary && mode.equals("token-changed")) prefs.edit().putString(ConnectionSettings.KEY_LOCAL_TOKEN, "yal_" + String.join("", Collections.nCopies(64, "b"))).commit();
        AndroidLocalOnboardingTest.FakeConnection c = new AndroidLocalOnboardingTest.FakeConnection(endpoint, summary ? valid : ack.toString(), summary && mode.equals("denied") ? 403 : 200);
        if (summary && mode.equals("wrong-key")) c.certificate = "wrong-key";
        return c;
      });
      try { t.enqueueAction(BASE, TOKEN, identity(), "sale-action-1", "market_sale_complete", intent); fail("Unsafe summary accepted"); }
      catch (AndroidOperationsTransport.TransportException expected) { assertEquals("local_delivery_unknown", expected.code); }
    }
    pair();
    LocalDesktopOperationsTransport good = new LocalDesktopOperationsTransport(prefs, DESKTOP, endpoint ->
        new AndroidLocalOnboardingTest.FakeConnection(endpoint, endpoint.endsWith("/summary") ? valid : ack.toString(), 200));
    assertEquals("sale-action-1", good.enqueueAction(BASE, TOKEN, identity(), "sale-action-1", "market_sale_complete", intent).id);
    assertEquals("sale-action-1", good.enqueueAction(BASE, TOKEN, identity(), "sale-action-1", "market_sale_complete", intent).id);
  }

  @Test public void pointsBalanceIsOnDemandPinnedAndNeverQueued() throws Exception {
    pair();
    java.util.List<AndroidLocalOnboardingTest.FakeConnection> requests = new java.util.ArrayList<>();
    LocalDesktopOperationsTransport transport = new LocalDesktopOperationsTransport(prefs, DESKTOP, endpoint -> {
      assertEquals(BASE + "/local/v1/benefits-balance", endpoint);
      AndroidLocalOnboardingTest.FakeConnection c = new AndroidLocalOnboardingTest.FakeConnection(endpoint,
          "{\"availableMinor\":125,\"generatedAtMs\":1700000000000}", 200);
      requests.add(c); return c;
    });
    LocalDesktopOperationsTransport.PointBalance balance = transport.fetchPointBalance(BASE, TOKEN, identity(), "customer-1", "TRY");
    assertEquals(125L, balance.availableMinor);
    assertEquals(1700000000000L, balance.generatedAtMs);
    transport.fetchPointBalance(BASE, TOKEN, identity(), "customer-1", "TRY");
    assertEquals(2, requests.size());
    for (AndroidLocalOnboardingTest.FakeConnection c : requests) {
      assertEquals(TOKEN, c.getRequestProperty(LocalCompanionProtocol.TOKEN_HEADER));
      assertEquals(identity().deviceId, c.getRequestProperty(LocalCompanionProtocol.DEVICE_ID_HEADER));
      JSONObject body = new JSONObject(c.body.toString("UTF-8"));
      assertEquals(2, body.length()); assertEquals("customer-1", body.getString("customerId")); assertEquals("TRY", body.getString("currency"));
      assertFalse(c.getUseCaches());
    }
    assertTrue(new ActionOutbox(prefs).load().isEmpty());
  }

  @Test public void pointsBalanceRejectsDeniedOfflineAndInvalidValues() throws Exception {
    pair();
    String[] bad = { "{}", "{\"availableMinor\":\"4\",\"generatedAtMs\":1}", "{\"availableMinor\":-1,\"generatedAtMs\":1}",
        "{\"availableMinor\":1.5,\"generatedAtMs\":1}", "{\"availableMinor\":9007199254740992,\"generatedAtMs\":1}",
        "{\"availableMinor\":1,\"generatedAtMs\":0}", "{\"availableMinor\":1,\"generatedAtMs\":1,\"ok\":false}", "not-json" };
    for (String response : bad) {
      LocalDesktopOperationsTransport transport = new LocalDesktopOperationsTransport(prefs, DESKTOP,
          endpoint -> new AndroidLocalOnboardingTest.FakeConnection(endpoint, response, 200));
      try { transport.fetchPointBalance(BASE, TOKEN, identity(), "customer-1", "TRY"); fail("Invalid balance accepted"); }
      catch (AndroidOperationsTransport.TransportException expected) { /* deny */ }
    }
    LocalDesktopOperationsTransport denied = new LocalDesktopOperationsTransport(prefs, DESKTOP,
        endpoint -> new AndroidLocalOnboardingTest.FakeConnection(endpoint, "{\"code\":\"benefits_balance_denied\"}", 403));
    try { denied.fetchPointBalance(BASE, TOKEN, identity(), "customer-1", "TRY"); fail("Denied"); }
    catch (AndroidOperationsTransport.TransportException expected) { assertEquals(403, expected.httpStatus); }
    LocalDesktopOperationsTransport offline = new LocalDesktopOperationsTransport(prefs, DESKTOP, endpoint -> { throw new java.io.IOException("offline"); });
    try { offline.fetchPointBalance(BASE, TOKEN, identity(), "customer-1", "TRY"); fail("Offline"); }
    catch (AndroidOperationsTransport.TransportException expected) { assertEquals("local_unreachable", expected.code); }
    AndroidLocalOnboardingTest.FakeConnection wrongPeer = fake("/benefits-balance", 200); wrongPeer.certificate = "wrong-key";
    LocalDesktopOperationsTransport untrusted = new LocalDesktopOperationsTransport(prefs, DESKTOP, endpoint -> wrongPeer);
    try { untrusted.fetchPointBalance(BASE, TOKEN, identity(), "customer-1", "TRY"); fail("Untrusted TLS"); }
    catch (AndroidOperationsTransport.TransportException expected) { assertEquals("local_tls_authentication_failed", expected.code); }
    assertEquals(0, wrongPeer.body.size());
    assertTrue(new ActionOutbox(prefs).load().isEmpty());
  }

  @Test public void customerSalePreviewIsPinnedValidatedAndNeverQueued() throws Exception {
    pair();
    org.json.JSONArray lines = new org.json.JSONArray().put(new JSONObject().put("productId", "p1").put("quantity", 1.5));
    String response = new JSONObject().put("lines", new org.json.JSONArray().put(new JSONObject().put("productId", "p1")
        .put("quantity", 1.5).put("unitPriceMinor", 80000).put("currency", "TRY").put("updatedAt", "version")))
        .put("subtotalMinor", 120000).put("currency", "TRY").put("generatedAtMs", System.currentTimeMillis()).toString();
    AndroidLocalOnboardingTest.FakeConnection connection = new AndroidLocalOnboardingTest.FakeConnection(BASE + "/local/v1/customer-sale-preview", response, 200);
    LocalDesktopOperationsTransport transport = new LocalDesktopOperationsTransport(prefs, DESKTOP, endpoint -> connection);
    JSONObject result = transport.fetchCustomerSalePreview(BASE, TOKEN, identity(), "customer-1", lines);
    assertEquals(120000, result.getLong("subtotalMinor"));
    JSONObject sent = new JSONObject(connection.body.toString("UTF-8"));
    assertEquals(2, sent.length()); assertFalse(sent.has("deviceId")); assertEquals("customer-1", sent.getString("customerId"));
    assertEquals(identity().deviceId, connection.getRequestProperty(LocalCompanionProtocol.DEVICE_ID_HEADER));
    assertFalse(connection.getUseCaches()); assertTrue(new ActionOutbox(prefs).load().isEmpty());
    JSONObject retail = new JSONObject(response); retail.getJSONArray("lines").getJSONObject(0).put("unitPriceMinor", 100000);
    retail.put("subtotalMinor", 150000);
    LocalDesktopOperationsTransport anonymous = new LocalDesktopOperationsTransport(prefs, DESKTOP,
        endpoint -> new AndroidLocalOnboardingTest.FakeConnection(endpoint, retail.toString(), 200));
    assertEquals(150000, anonymous.fetchCustomerSalePreview(BASE, TOKEN, identity(), "", lines).getLong("subtotalMinor"));
  }

  @Test public void customerSalePreviewRejectsInvalidResponsesAndCredentials() throws Exception {
    pair();
    org.json.JSONArray lines = new org.json.JSONArray().put(new JSONObject().put("productId", "p1").put("quantity", 1));
    JSONObject valid = new JSONObject().put("lines", new org.json.JSONArray().put(new JSONObject().put("productId", "p1")
        .put("quantity", 1).put("unitPriceMinor", 100000).put("currency", "TRY").put("updatedAt", "version")))
        .put("subtotalMinor", 100000).put("currency", "TRY").put("generatedAtMs", System.currentTimeMillis());
    for (int i = 0; i < 9; i++) {
      JSONObject bad = new JSONObject(valid.toString()); JSONObject line = bad.getJSONArray("lines").getJSONObject(0);
      switch (i) {
        case 0: line.put("productId", "other"); break;
        case 1: line.put("quantity", 2); break;
        case 2: line.put("currency", "EUR"); break;
        case 3: line.put("updatedAt", ""); break;
        case 4: line.put("unitPriceMinor", -1); break;
        case 5: bad.put("subtotalMinor", 9007199254740992L); break;
        case 6: bad.put("generatedAtMs", 1); break;
        case 7: bad.put("extra", true); break;
        default: line.put("extra", true);
      }
      LocalDesktopOperationsTransport t = new LocalDesktopOperationsTransport(prefs, DESKTOP,
          endpoint -> new AndroidLocalOnboardingTest.FakeConnection(endpoint, bad.toString(), 200));
      try { t.fetchCustomerSalePreview(BASE, TOKEN, identity(), "customer-1", lines); fail("invalid " + i); }
      catch (AndroidOperationsTransport.TransportException expected) { assertEquals("local_preview_invalid", expected.code); }
    }
    LocalDesktopOperationsTransport denied = new LocalDesktopOperationsTransport(prefs, DESKTOP,
        endpoint -> new AndroidLocalOnboardingTest.FakeConnection(endpoint, "{\"code\":\"denied\"}", 403));
    try { denied.fetchCustomerSalePreview(BASE, TOKEN, identity(), "", lines); fail(); }
    catch (AndroidOperationsTransport.TransportException expected) { assertEquals(403, expected.httpStatus); }
    AndroidLocalOnboardingTest.FakeConnection wrong = fake("/customer-sale-preview", 200); wrong.certificate = "wrong-key";
    LocalDesktopOperationsTransport untrusted = new LocalDesktopOperationsTransport(prefs, DESKTOP, endpoint -> wrong);
    try { untrusted.fetchCustomerSalePreview(BASE, TOKEN, identity(), "", lines); fail(); }
    catch (AndroidOperationsTransport.TransportException expected) { assertEquals("local_tls_authentication_failed", expected.code); }
    assertEquals(0, wrong.body.size());
    for (org.json.JSONArray badLines : new org.json.JSONArray[] { new org.json.JSONArray(),
        new org.json.JSONArray().put(new JSONObject().put("productId", "p1").put("quantity", -1)),
        new org.json.JSONArray().put(new JSONObject().put("productId", "p1").put("quantity", 1).put("price", 1)) }) {
      try { untrusted.fetchCustomerSalePreview(BASE, TOKEN, identity(), "", badLines); fail(); }
      catch (AndroidOperationsTransport.TransportException expected) { assertEquals("local_preview_invalid", expected.code); }
    }
    try { untrusted.fetchCustomerSalePreview(BASE, "", identity(), "", lines); fail(); }
    catch (AndroidOperationsTransport.TransportException expected) { assertEquals("local_tls_authentication_failed", expected.code); }
    assertTrue(new ActionOutbox(prefs).load().isEmpty());
  }

  @Test public void pointSpendQuoteIsPinnedScopedAndAdvisoryOnly() throws Exception {
    pair();
    org.json.JSONArray lines = new org.json.JSONArray().put(new JSONObject().put("productId", "p1").put("quantity", 1.5));
    long now = System.currentTimeMillis();
    JSONObject quote = new JSONObject().put("lines", new org.json.JSONArray().put(new JSONObject().put("productId", "p1")
        .put("quantity", 1.5).put("unitPriceMinor", 80000).put("currency", "TRY").put("updatedAt", "v1")))
        .put("subtotalMinor", 120000).put("currency", "TRY").put("availablePointMinor", 50000).put("maxSpendableMinor", 50000)
        .put("generatedAtMs", now).put("expiresAtMs", now + 30000);
    AndroidLocalOnboardingTest.FakeConnection connection = new AndroidLocalOnboardingTest.FakeConnection(BASE + "/local/v1/point-spend-quote", quote.toString(), 200);
    LocalDesktopOperationsTransport t = new LocalDesktopOperationsTransport(prefs, DESKTOP, endpoint -> {
      assertEquals(BASE + "/local/v1/point-spend-quote", endpoint); return connection;
    });
    assertEquals(50000, t.fetchPointSpendQuote(BASE, TOKEN, identity(), "customer-1", lines, "TRY").getLong("maxSpendableMinor"));
    JSONObject sent = new JSONObject(connection.body.toString("UTF-8"));
    assertEquals(2, sent.length()); assertEquals("customer-1", sent.getString("customerId"));
    assertEquals(2, sent.getJSONArray("lines").getJSONObject(0).length()); assertFalse(sent.has("deviceId"));
    assertEquals(TOKEN, connection.getRequestProperty(LocalCompanionProtocol.TOKEN_HEADER));
    assertFalse(connection.getUseCaches()); assertTrue(new ActionOutbox(prefs).load().isEmpty());
    for (int i = 0; i < 18; i++) {
      JSONObject bad = new JSONObject(quote.toString()); JSONObject line = bad.getJSONArray("lines").getJSONObject(0);
      switch (i) {
        case 0: line.put("productId", "other"); break;
        case 1: line.put("quantity", 2); break;
        case 2: line.put("currency", "EUR"); break;
        case 3: line.put("updatedAt", " "); break;
        case 4: line.put("unitPriceMinor", 1); break;
        case 5: bad.put("subtotalMinor", 1); break;
        case 6: bad.put("availablePointMinor", -1); break;
        case 7: bad.put("maxSpendableMinor", 50001); break;
        case 8: bad.put("expiresAtMs", now - 1); break;
        case 9: bad.put("expiresAtMs", now + 30001); break;
        case 10: bad.put("discount", 1); break;
        case 11: line.put("coupon", "x"); break;
        case 12: bad.put("currency", "USD"); break;
        case 13: bad.put("generatedAtMs", now + 60000); break;
        case 14: bad.put("expiresAtMs", now); break;
        case 15: bad.put("availablePointMinor", 1.5); break;
        case 16: bad.put("subtotalMinor", 9007199254740992L); break;
        default: bad.getJSONArray("lines").put(new JSONObject(line.toString()));
      }
      LocalDesktopOperationsTransport invalid = new LocalDesktopOperationsTransport(prefs, DESKTOP,
          endpoint -> new AndroidLocalOnboardingTest.FakeConnection(endpoint, bad.toString(), 200));
      try { invalid.fetchPointSpendQuote(BASE, TOKEN, identity(), "customer-1", lines, "TRY"); fail("bad quote " + i); }
      catch (AndroidOperationsTransport.TransportException expected) { /* fail closed */ }
    }
    LocalDesktopOperationsTransport denied = new LocalDesktopOperationsTransport(prefs, DESKTOP,
        endpoint -> new AndroidLocalOnboardingTest.FakeConnection(endpoint, "{\"code\":\"denied\"}", 403));
    try { denied.fetchPointSpendQuote(BASE, TOKEN, identity(), "customer-1", lines, "TRY"); fail(); }
    catch (AndroidOperationsTransport.TransportException expected) { assertEquals(403, expected.httpStatus); }
    AndroidLocalOnboardingTest.FakeConnection wrong = fake("/point-spend-quote", 200); wrong.certificate = "wrong-key";
    LocalDesktopOperationsTransport untrusted = new LocalDesktopOperationsTransport(prefs, DESKTOP, endpoint -> wrong);
    try { untrusted.fetchPointSpendQuote(BASE, TOKEN, identity(), "customer-1", lines, "TRY"); fail(); }
    catch (AndroidOperationsTransport.TransportException expected) { assertEquals("local_tls_authentication_failed", expected.code); }
    assertEquals(0, wrong.body.size());
    try { t.fetchPointSpendQuote(BASE, TOKEN, identity(), "customer-1", new org.json.JSONArray().put(
        new JSONObject().put("productId", "p1").put("quantity", 1).put("price", 1)), "TRY"); fail(); }
    catch (AndroidOperationsTransport.TransportException expected) { assertEquals("local_point_quote_invalid", expected.code); }
    prefs.edit().remove(ConnectionSettings.KEY_LOCAL_SPKI_SHA256).commit();
    try { t.fetchPointSpendQuote(BASE, TOKEN, identity(), "customer-1", lines, "TRY"); fail(); }
    catch (AndroidOperationsTransport.TransportException expected) { assertEquals("local_tls_authentication_failed", expected.code); }
  }

  @Test public void statusRedirectAndTamperedQrPinNeverReachPair() throws Exception {
    for (boolean redirect : new boolean[] {true, false}) {
      AndroidLocalOnboardingTest.FakeConnection status = fake("/status", redirect ? 302 : 200);
      int[] requests = {0};
      LocalCompanionPairingClient client = new LocalCompanionPairingClient(endpoint -> {
        requests[0]++; assertTrue(endpoint.endsWith("/status")); return status;
      });
      String pin = redirect ? PIN : LocalTlsTestCertificates.pin("wrong-key");
      try { client.pairWithQr(prefs, identity(), qr(pin)); fail("Redirect/tampered pin"); }
      catch (LocalCompanionPairingClient.PairingException expected) { assertEquals("local_tls_authentication_failed", expected.code); }
      assertEquals(1, requests[0]);
      assertEquals(0, status.body.size());
      assertFalse(status.getInstanceFollowRedirects());
    }
  }

  @Test public void newQueueDuringPairingPreventsTrustReplacementAndPreservesData() throws Exception {
    pair();
    String changedPin = LocalTlsTestCertificates.pin("wrong-key");
    String target = CompanionConnectionIdentity.localActionTargetKey(DESKTOP);
    LocalCompanionPairingClient client = new LocalCompanionPairingClient(endpoint -> {
      AndroidLocalOnboardingTest.FakeConnection c = new AndroidLocalOnboardingTest.FakeConnection(endpoint,
          endpoint.endsWith("/status") ? "{\"ok\":true,\"desktop_id\":\"" + DESKTOP + "\"}"
              : "{\"ok\":true,\"desktop_id\":\"" + DESKTOP + "\",\"local_token\":\"" + TOKEN + "\"}", 200);
      c.certificate = "wrong-key";
      if (endpoint.endsWith("/pair")) new ActionOutbox(prefs).appendAll(Collections.singletonList(
          ActionOutbox.PendingAction.create("queued-during-pair", "room_update", new JSONObject().put("room_id", "r1"), target)));
      return c;
    });
    try { client.pairWithQr(prefs, identity(), qr(changedPin)); fail("New queue prevents pin replacement"); }
    catch (LocalCompanionPairingClient.PairingException expected) { assertEquals("target_barrier", expected.code); }
    assertEquals("queued-during-pair", new ActionOutbox(prefs).load().get(0).id);
    assertEquals(PIN, ConnectionSettings.localConnection(prefs).spkiSha256);
    assertEquals(TOKEN, ConnectionSettings.localConnection(prefs).localToken);
  }

  @Test public void routerMissingPinKeepsPendingAndRequiresQrWithoutInvokingTransport() throws Exception {
    pair();
    prefs.edit().remove(ConnectionSettings.KEY_LOCAL_SPKI_SHA256).commit();
    String target = CompanionConnectionIdentity.localActionTargetKey(DESKTOP);
    new ActionOutbox(prefs).appendAll(Collections.singletonList(ActionOutbox.PendingAction.create(
        "still-pending", "room_update", new JSONObject(), target)));
    CompanionOperationsRouter router = new CompanionOperationsRouter(prefs, new HostingAndroidOperationsTransport(), desktop -> {
      throw new AssertionError("No local transport without pin");
    });
    try { router.enqueueAction("", "", identity(), "still-pending", "room_update", new JSONObject()); fail("Missing pin"); }
    catch (AndroidOperationsTransport.TransportException expected) {
      assertEquals("local_tls_pairing_required", expected.code);
      assertFalse(expected.invalidatesPendingAction()); assertFalse(expected.allowsHostingFallback());
      assertTrue(expected.getMessage().contains("QR"));
    }
    assertEquals("still-pending", new ActionOutbox(prefs).load().get(0).id);
  }

  @Test public void samePinRepairPreservesQueueAndReceiptsAndStillRequiresApproval() throws Exception {
    pair();
    String target = CompanionConnectionIdentity.localActionTargetKey(DESKTOP);
    new ActionOutbox(prefs).appendAll(Collections.singletonList(ActionOutbox.PendingAction.create(
        "same-pin-pending", "room_update", new JSONObject(), target)));
    OperationData.ActionRecord receipt = new OperationData.ActionRecord();
    receipt.id = "pending-receipt"; receipt.type = "commerce_order_confirm"; receipt.status = "unknown"; receipt.orderId = "o1";
    new OperationCache(prefs, identity().deviceId).recordActionResult(receipt, target);
    LocalCompanionPairingClient client = new LocalCompanionPairingClient(endpoint -> {
      AndroidLocalOnboardingTest.FakeConnection c = new AndroidLocalOnboardingTest.FakeConnection(endpoint,
          endpoint.endsWith("/status") ? "{\"ok\":true,\"desktop_id\":\"" + DESKTOP + "\"}"
              : "{\"ok\":true,\"desktop_id\":\"" + DESKTOP + "\",\"local_token\":\"" + TOKEN + "\",\"approval_required\":true}", 200);
      c.certificate = "renewed"; return c;
    });
    assertTrue(client.pairWithQr(prefs, identity(), qr(PIN)).approvalRequired);
    assertEquals("same-pin-pending", new ActionOutbox(prefs).load().get(0).id);
    assertTrue(new OperationCache(prefs, identity().deviceId).hasUnresolvedActionResults(target));
    assertEquals(PIN, ConnectionSettings.localConnection(prefs).spkiSha256);
  }

  private AndroidLocalOnboardingTest.FakeConnection fake(String path, int status) throws Exception {
    return new AndroidLocalOnboardingTest.FakeConnection(BASE + "/local/v1" + path,
        "{\"ok\":true,\"desktop_id\":\"" + DESKTOP + "\"}", status);
  }

  private void assertTlsFailure(LocalDesktopOperationsTransport transport) throws Exception {
    try { transport.enqueueAction(BASE, TOKEN, identity(), "stable-id", "room_update", new JSONObject().put("pin-test-marker", 1)); fail("TLS must reject"); }
    catch (AndroidOperationsTransport.TransportException expected) {
      assertEquals("local_tls_authentication_failed", expected.code);
      assertFalse(expected.invalidatesPendingAction());
      assertFalse(expected.allowsHostingFallback());
    }
  }
}
