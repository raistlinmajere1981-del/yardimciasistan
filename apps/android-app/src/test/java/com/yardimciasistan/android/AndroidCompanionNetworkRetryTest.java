package com.yardimciasistan.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.SharedPreferences;

import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/**
 * Phone-side Companion reliability proof: a paid sale is persisted before any
 * network attempt, survives a transport cut and a process restart with the exact
 * id/payload/target, and is dequeued only after the pinned transport validates
 * the server receipt for that same action.
 *
 * The local HTTPS transport is driven with the same connection seam used by the
 * other phone tests. Desktop sale/stock/Finance/points/refund idempotency is
 * proven by the real HTTPS fixture smokes; this test covers the handset queue
 * and receipt gate that those fixtures do not execute.
 */
public final class AndroidCompanionNetworkRetryTest {
  private static final String DESKTOP = "desktop-12345678-1234-1234-1234-123456789abc";
  private static final String BASE = "https://192.168.1.2:3456";
  private static final String TOKEN = "yal_" + String.join("", Collections.nCopies(64, "a"));
  private static final String PIN = LocalTlsTestCertificates.pin("leaf");
  private static final String TARGET = CompanionConnectionIdentity.localActionTargetKey(DESKTOP);
  private static final String SALE = MarketUiRules.ACTION_SALE;
  private static final String SUMMARY = "{\"ok\":true,\"desktop_id\":\"" + DESKTOP
      + "\",\"business_id\":\"b1\",\"approval_required\":false}";

  private final AndroidCompanionStorageTest.InMemoryPreferences prefs =
      new AndroidCompanionStorageTest.InMemoryPreferences();

  @Test
  public void paidSaleSurvivesCutAndRestartThenDequeuesOnlyOnVerifiedReceipt() throws Exception {
    pair();
    JSONObject intent = paidIntent(false);
    String actionId = "android_action_paid_retry_01";
    persist(actionId, intent);

    LocalDesktopOperationsTransport offline = new LocalDesktopOperationsTransport(
        prefs, DESKTOP, endpoint -> { throw new IOException("offline"); });
    try {
      offline.enqueueAction(BASE, TOKEN, identity(prefs), actionId, SALE, intent);
      fail("Offline transport must not return a receipt");
    } catch (AndroidOperationsTransport.TransportException expected) {
      assertFalse(expected.invalidatesPendingAction());
    }

    AndroidCompanionStorageTest.InMemoryPreferences restarted = restart(prefs);
    ActionOutbox restored = new ActionOutbox(restarted);
    List<ActionOutbox.PendingAction> pending = restored.load();
    assertEquals(1, pending.size());
    assertEquals(actionId, pending.get(0).id);
    assertEquals(SALE, pending.get(0).type);
    assertEquals(intent.toString(), pending.get(0).payload.toString());
    assertEquals(TARGET, pending.get(0).targetKey);
    assertTrue(pending.get(0).matchesTarget(TARGET));

    JSONObject ack = new JSONObject().put("ok", true).put("status", "applied")
        .put("action_id", actionId).put("sale_receipt", receipt(false));
    OperationData.ActionRecord record = reconnected(restarted, ack).enqueueAction(
        BASE, TOKEN, identity(restarted), actionId, SALE, intent);
    assertEquals(actionId, record.id);
    assertEquals("applied", record.status);

    // Same order as AndroidOperationsSyncController/AndroidActionDispatcher:
    // persist the receipt first, then remove the queued action.
    OperationCache cache = new OperationCache(restarted, identity(restarted).deviceId);
    cache.recordActionResult(record, TARGET);
    restored.remove(actionId);
    assertTrue(new ActionOutbox(restarted).load().isEmpty());
    restored.remove(actionId);
    assertTrue(new ActionOutbox(restarted).load().isEmpty());
    assertFalse(new OperationCache(restarted, identity(restarted).deviceId)
        .hasUnresolvedActionResults(TARGET));
    assertFalse(restarted.getAll().toString().contains("sale-1"));
  }

  @Test
  public void droppedCommitReplyKeepsSamePointsSaleAndOnlyExactRetryDequeues() throws Exception {
    pair();
    JSONObject intent = paidIntent(true);
    String actionId = "android_action_points_retry_01";
    persist(actionId, intent);

    JSONObject ack = new JSONObject().put("ok", true).put("status", "applied")
        .put("action_id", actionId).put("sale_receipt", receipt(true));
    LocalDesktopOperationsTransport dropped = new LocalDesktopOperationsTransport(prefs, DESKTOP, endpoint -> {
      if (endpoint.endsWith("/summary")) {
        return new AndroidLocalOnboardingTest.FakeConnection(endpoint, SUMMARY, 200);
      }
      return new AndroidLocalOnboardingTest.FakeConnection(endpoint, ack.toString(), 200) {
        @Override public InputStream getInputStream() {
          throw new UncheckedIoFailure("reply lost after server commit");
        }
      };
    });
    try {
      dropped.enqueueAction(BASE, TOKEN, identity(prefs), actionId, SALE, intent);
      fail("Dropped reply must not dequeue the sale");
    } catch (AndroidOperationsTransport.TransportException expected) {
      assertFalse(expected.invalidatesPendingAction());
    }

    AndroidCompanionStorageTest.InMemoryPreferences restarted = restart(prefs);
    ActionOutbox restored = new ActionOutbox(restarted);
    assertEquals(actionId, restored.load().get(0).id);
    assertEquals(intent.toString(), restored.load().get(0).payload.toString());

    // A forged or cash-only receipt is not delivery proof for a positive points
    // sale; the exact id/payload must stay queued.
    JSONObject forged = new JSONObject(ack.toString()).put("sale_receipt",
        new JSONObject(receipt(true).toString()).put("pointsTenderMinor", 999));
    try {
      reconnected(restarted, forged).enqueueAction(
          BASE, TOKEN, identity(restarted), actionId, SALE, intent);
      fail("Forged points receipt must not dequeue the sale");
    } catch (AndroidOperationsTransport.TransportException expected) {
      assertFalse(expected.invalidatesPendingAction());
    }
    assertEquals(actionId, new ActionOutbox(restarted).load().get(0).id);

    JSONObject replay = new JSONObject(ack.toString()).put("already_applied", true);
    OperationData.ActionRecord record = reconnected(restarted, replay).enqueueAction(
        BASE, TOKEN, identity(restarted), actionId, SALE, intent);
    assertEquals(actionId, record.id);
    assertEquals("applied", record.status);
    new OperationCache(restarted, identity(restarted).deviceId).recordActionResult(record, TARGET);
    restored.remove(actionId);
    assertTrue(new ActionOutbox(restarted).load().isEmpty());
    assertEquals(1000, replay.getJSONObject("sale_receipt").getInt("pointsTenderMinor"));
    assertEquals(99000, replay.getJSONObject("sale_receipt").getInt("cashPaidMinor"));
  }

  private void pair() {
    assertTrue(ConnectionSettings.storeLocalPairing(prefs, DESKTOP, BASE, TARGET, TOKEN, PIN));
  }

  private void persist(String actionId, JSONObject intent) throws Exception {
    new ActionOutbox(prefs).appendAll(Collections.singletonList(
        ActionOutbox.PendingAction.create(actionId, SALE, intent, TARGET)));
    assertEquals(1, new ActionOutbox(prefs).load().size());
  }

  private DeviceIdentity identity(SharedPreferences preferences) throws Exception {
    java.lang.reflect.Constructor<DeviceIdentity> constructor = DeviceIdentity.class.getDeclaredConstructor(
        String.class, String.class, String.class, SharedPreferences.class);
    constructor.setAccessible(true);
    return constructor.newInstance("android-local-test", "Phone", "2.1.0", preferences);
  }

  private LocalDesktopOperationsTransport reconnected(
      SharedPreferences preferences, JSONObject actionResponse) {
    return new LocalDesktopOperationsTransport(preferences, DESKTOP, endpoint ->
        new AndroidLocalOnboardingTest.FakeConnection(
            endpoint,
            endpoint.endsWith("/summary") ? SUMMARY : actionResponse.toString(),
            200));
  }

  private static JSONObject paidIntent(boolean points) throws Exception {
    JSONObject payload = new JSONObject()
        .put("location_id", "loc")
        .put("settlement", "paid")
        .put("customer_id", "c1")
        .put("payment_method", "cash")
        .put("external_payment_confirmed", false)
        .put("lines", new JSONArray().put(new JSONObject()
            .put("product_id", "p1")
            .put("quantity", 1)
            .put("expected_unit_price", 1000)
            .put("expected_currency", "TRY")
            .put("expected_updated_at", "fixture")));
    if (points) payload.put("requestedPointsMinor", 1000);
    return payload;
  }

  private static JSONObject receipt(boolean points) throws Exception {
    return new JSONObject()
        .put("saleId", "sale-1")
        .put("businessId", "b1")
        .put("source", "android-market-sale")
        .put("customerId", "c1")
        .put("cashPaidMinor", points ? 99000 : 100000)
        .put("pointsTenderMinor", points ? 1000 : 0)
        .put("currency", "TRY")
        .put("paymentMethod", "cash");
  }

  /** Rehydrates a fresh preferences object from persisted values, as after a process restart. */
  private static AndroidCompanionStorageTest.InMemoryPreferences restart(
      AndroidCompanionStorageTest.InMemoryPreferences source) {
    AndroidCompanionStorageTest.InMemoryPreferences copy =
        new AndroidCompanionStorageTest.InMemoryPreferences();
    for (Map.Entry<String, ?> entry : source.getAll().entrySet()) {
      Object value = entry.getValue();
      SharedPreferences.Editor editor = copy.edit();
      if (value instanceof String) editor.putString(entry.getKey(), (String) value);
      else if (value instanceof Integer) editor.putInt(entry.getKey(), (Integer) value);
      else if (value instanceof Long) editor.putLong(entry.getKey(), (Long) value);
      else if (value instanceof Float) editor.putFloat(entry.getKey(), (Float) value);
      else if (value instanceof Boolean) editor.putBoolean(entry.getKey(), (Boolean) value);
      editor.commit();
    }
    return copy;
  }

  private static final class UncheckedIoFailure extends RuntimeException {
    UncheckedIoFailure(String message) {
      super(message);
    }
  }
}