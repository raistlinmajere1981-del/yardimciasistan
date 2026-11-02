package com.yardimciasistan.android;

import android.app.Instrumentation;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Collections;
import java.util.List;

/**
 * Isolated cross-process Companion outbox fixture. Phase 1 persists one synthetic
 * paid/Puan sale and refuses to dequeue after a simulated transport cut. The smoke
 * script then force-stops the isolated package. Phase 2 runs in a fresh process and
 * must reload the exact id/type/payload/target from SharedPreferences.
 *
 * Receipt acceptance uses Android's actual LocalDesktopOperationsTransport fact
 * validator (no TLS/LAN request is made). The Desktop sale/stock/Finance/points/
 * refund owner proof stays in the real HTTPS fixture smokes and JVM tests.
 */
public final class CompanionRetryFixture {
  private static final String PACKAGE = "com.yardimciasistan.android.uifamily";
  private static final String DESKTOP = "desktop-11111111-2222-3333-4444-555555555555";
  private static final String BASE = "https://192.168.1.2:3456";
  private static final String TOKEN = "yal_" + String.join("", Collections.nCopies(64, "a"));
  private static final String PIN = String.join("", Collections.nCopies(43, "A"));
  private static final String TARGET = CompanionConnectionIdentity.localActionTargetKey(DESKTOP);
  private static final String ACTION_ID = "android_action_device_retry_01";
  private static final String ACTION_TYPE = MarketUiRules.ACTION_SALE;

  public static final class Runner extends Instrumentation {
    private Bundle arguments;
    @Override public void onCreate(Bundle arguments) {
      this.arguments = arguments;
      super.onCreate(arguments);
      start();
    }

    @Override public void onStart() {
      Bundle result = new Bundle();
      String phase = arguments == null ? "" : arguments.getString("retry_phase", "");
      try {
        require(getTargetContext().getPackageName().equals(PACKAGE), "isolated package required");
        require("1".equals(phase) || "2".equals(phase), "retry_phase must be 1 or 2");
        SharedPreferences prefs = getTargetContext().getSharedPreferences(
            ConnectionSettings.PREFS_NAME, Context.MODE_PRIVATE);
        if ("1".equals(phase)) phaseOne(prefs, result); else phaseTwo(prefs, result);
        finish(-1, result);
      } catch (Throwable error) {
        result.putString("stream", "companion-retry-phase" + phase + "-failed: "
            + error + "\n" + android.util.Log.getStackTraceString(error));
        finish(0, result);
      }
    }

    private void phaseOne(SharedPreferences prefs, Bundle result) throws Exception {
      prefs.edit().clear().commit();
      require(ConnectionSettings.storeLocalPairing(prefs, DESKTOP, BASE, TARGET, TOKEN, PIN),
          "synthetic pairing was not stored");
      ActionOutbox outbox = new ActionOutbox(prefs);
      outbox.clear();
      JSONObject intent = intent();
      outbox.appendAll(Collections.singletonList(
          ActionOutbox.PendingAction.create(ACTION_ID, ACTION_TYPE, intent, TARGET)));
      List<ActionOutbox.PendingAction> persisted = new ActionOutbox(prefs).load();
      require(persisted.size() == 1, "action was not persisted before submission");
      require(ACTION_ID.equals(persisted.get(0).id), "persisted action id changed");

      DeviceIdentity identity = DeviceIdentity.loadOrCreate(getTargetContext(), prefs);
      LocalDesktopOperationsTransport offline = new LocalDesktopOperationsTransport(
          prefs, DESKTOP, endpoint -> { throw new java.io.IOException("simulated transport cut"); });
      boolean kept = false;
      try {
        offline.enqueueAction(BASE, TOKEN, identity, ACTION_ID, ACTION_TYPE, intent);
      } catch (AndroidOperationsTransport.TransportException error) {
        kept = !error.invalidatesPendingAction();
      }
      require(kept, "simulated cut must not invalidate the queued sale");
      List<ActionOutbox.PendingAction> after = new ActionOutbox(prefs).load();
      require(after.size() == 1, "action was dequeued without a receipt");
      ActionOutbox.PendingAction pending = after.get(0);
      require(ACTION_ID.equals(pending.id) && ACTION_TYPE.equals(pending.type)
          && TARGET.equals(pending.targetKey) && intent.toString().equals(pending.payload.toString()),
          "persisted action differs after simulated cut");
      result.putString("stream", "companion-retry-phase1-ok: actions=" + after.size()
          + " action_id=" + pending.id + " target=" + pending.targetKey
          + " pending_after_simulated_cut=" + after.size() + "\n");
    }

    private void phaseTwo(SharedPreferences prefs, Bundle result) throws Exception {
      require(ConnectionSettings.isComplete(prefs), "pairing did not survive process death");
      ActionOutbox outbox = new ActionOutbox(prefs);
      List<ActionOutbox.PendingAction> reloaded = outbox.load();
      require(reloaded.size() == 1, "expected exactly one persisted action after restart");
      ActionOutbox.PendingAction pending = reloaded.get(0);
      JSONObject intent = intent();
      require(ACTION_ID.equals(pending.id), "reloaded id mismatch");
      require(ACTION_TYPE.equals(pending.type), "reloaded type mismatch");
      require(TARGET.equals(pending.targetKey), "reloaded target mismatch");
      require(intent.toString().equals(pending.payload.toString()), "reloaded payload mismatch");
      require(pending.matchesTarget(TARGET), "reloaded target no longer matches");

      JSONObject forged = new JSONObject().put("action_id", pending.id)
          .put("sale_receipt", new JSONObject(receipt().toString()).put("pointsTenderMinor", 999));
      boolean rejected = false;
      try {
        LocalDesktopOperationsTransport.validateSaleReceiptFacts(forged, pending.id, pending.payload);
      } catch (Exception expected) {
        rejected = true;
      }
      require(rejected, "forged points receipt was accepted");
      require(new ActionOutbox(prefs).load().size() == 1, "forged receipt dequeued the action");

      JSONObject applied = new JSONObject().put("action_id", pending.id).put("sale_receipt", receipt());
      LocalDesktopOperationsTransport.validateSaleReceiptFacts(applied, pending.id, pending.payload);
      OperationData.ActionRecord record = new OperationData.ActionRecord();
      record.id = pending.id;
      record.type = pending.type;
      record.status = "applied";
      record.createdAt = java.time.Instant.now().toString();
      record.processedAt = record.createdAt;
      DeviceIdentity identity = DeviceIdentity.loadOrCreate(getTargetContext(), prefs);
      new OperationCache(prefs, identity.deviceId).recordActionResult(record, TARGET);
      outbox.remove(pending.id);
      List<ActionOutbox.PendingAction> after = new ActionOutbox(prefs).load();
      require(after.isEmpty(), "validated receipt did not remove the action");
      require(!new OperationCache(prefs, identity.deviceId).hasUnresolvedActionResults(TARGET),
          "applied receipt remained unresolved");
      result.putString("stream", "companion-retry-phase2-ok: reloaded_actions=" + reloaded.size()
          + " action_id=" + pending.id + " target=" + pending.targetKey
          + " exact_payload=true forged_receipt_rejected=true exact_receipt_validated=true actions_after=" + after.size() + "\n");
    }

    private static JSONObject intent() throws Exception {
      return new JSONObject()
          .put("location_id", "loc")
          .put("settlement", "paid")
          .put("customer_id", "c1")
          .put("payment_method", "cash")
          .put("external_payment_confirmed", false)
          .put("requestedPointsMinor", 1000)
          .put("lines", new JSONArray().put(new JSONObject()
              .put("product_id", "p1")
              .put("quantity", 1)
              .put("expected_unit_price", 1000)
              .put("expected_currency", "TRY")
              .put("expected_updated_at", "fixture")));
    }

    private static JSONObject receipt() throws Exception {
      return new JSONObject()
          .put("saleId", "sale-device-1")
          .put("businessId", "b1")
          .put("source", "android-market-sale")
          .put("customerId", "c1")
          .put("cashPaidMinor", 99000)
          .put("pointsTenderMinor", 1000)
          .put("currency", "TRY")
          .put("paymentMethod", "cash");
    }

    private static void require(boolean condition, String message) {
      if (!condition) throw new AssertionError(message);
    }
  }

  private CompanionRetryFixture() {}
}