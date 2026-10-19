package com.yardimciasistan.android;

import static org.junit.Assert.*;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public final class AndroidSyncPresentationTest {
  private JSONObject snapshot() throws Exception {
    return new JSONObject().put("server_revision", 10).put("pulled_at", "old")
        .put("business_capabilities", new JSONArray().put("service.android").put("core.customers"))
        .put("androidPermissions", new JSONObject().put("phone", new JSONObject()
            .put("is_active", true).put("permissions", new JSONArray().put("customer.view"))))
        .put("summary", new JSONObject().put("pulled_at", "old").put("android_snapshot_updated_at", "old").put("pending_action_count", 0))
        .put("customers", new JSONArray().put(new JSONObject().put("id", "customer-1").put("full_name", "Müşteri").put("updated_at", "old")))
        .put("finance", new JSONObject().put("generated_at", "old").put("today_income_minor", 100))
        .put("reports", new JSONObject().put("today", new JSONObject().put("generated_at", "old").put("total", 100)));
  }

  @Test public void heartbeatAndReadTimesDoNotReplaceTheScreenOrMutateSnapshots() throws Exception {
    JSONObject previous = snapshot(), next = snapshot();
    next.put("server_revision", 11).put("pulled_at", "new");
    next.getJSONObject("summary").put("pulled_at", "new").put("android_snapshot_updated_at", "new");
    next.getJSONObject("finance").put("generated_at", "new");
    next.getJSONObject("reports").getJSONObject("today").put("generated_at", "new");
    String before = next.toString();
    assertTrue(AndroidSnapshotPresentation.same(previous, next));
    assertEquals(before, next.toString());
    assertEquals(11, next.getInt("server_revision"));
  }

  @Test public void dataDomainVersionPermissionsAndCapabilitiesAlwaysInvalidate() throws Exception {
    JSONObject previous = snapshot(), next = snapshot();
    next.getJSONArray("customers").getJSONObject(0).put("full_name", "Yeni ad");
    assertFalse(AndroidSnapshotPresentation.same(previous, next));
    next = snapshot(); next.getJSONArray("customers").getJSONObject(0).put("updated_at", "new");
    assertFalse(AndroidSnapshotPresentation.same(previous, next));
    next = snapshot(); next.getJSONObject("androidPermissions").getJSONObject("phone").put("is_active", false);
    assertFalse(AndroidSnapshotPresentation.same(previous, next));
    next = snapshot(); next.put("business_capabilities", new JSONArray());
    assertFalse(AndroidSnapshotPresentation.same(previous, next));
    next = snapshot(); next.getJSONObject("finance").put("today_income_minor", 0);
    assertFalse(AndroidSnapshotPresentation.same(previous, next));
    next = snapshot(); next.getJSONObject("reports").getJSONObject("today").put("total", 0);
    assertFalse(AndroidSnapshotPresentation.same(previous, next));
    assertFalse(AndroidSnapshotPresentation.same(null, previous));
  }

  @Test public void unchangedRepliesRetainBodyButPartialReceiptAndVoiceUpdatesRender() {
    OperationData before = new OperationData(), next = new OperationData();
    before.pulledAt = "old"; next.pulledAt = "new"; next.serverRevision = 50;
    String status = AndroidOperationsSyncController.presentationStatus(before);
    assertFalse(AndroidOperationsSyncController.shouldRender(false, false, status, next));
    assertTrue(AndroidOperationsSyncController.shouldRender(true, false, status, next));
    assertTrue(AndroidOperationsSyncController.shouldRender(false, true, status, next));
    next.pendingActions = 1;
    assertTrue(AndroidOperationsSyncController.shouldRender(false, false, status, next));
    next.pendingActions = 0; next.sttAvailable = true;
    assertTrue(AndroidOperationsSyncController.shouldRender(false, false, status, next));
    next.sttAvailable = false;
    OperationData.ActionRecord action = new OperationData.ActionRecord();
    action.id = "action-1"; action.status = "pending"; next.actions.add(action);
    String pending = AndroidOperationsSyncController.presentationStatus(next);
    action.status = "applied";
    assertTrue(AndroidOperationsSyncController.shouldRender(false, false, pending, next));
    assertFalse(AndroidOperationsSyncController.shouldRender(false, false,
        AndroidOperationsSyncController.presentationStatus(next), next));
  }

  @Test public void cacheStillAdvancesRevisionWithoutNeedingAViewReplacement() throws Exception {
    AndroidCompanionStorageTest.InMemoryPreferences preferences = new AndroidCompanionStorageTest.InMemoryPreferences();
    OperationCache cache = new OperationCache(preferences, "phone");
    JSONObject previous = snapshot();
    assertFalse(cache.hasSamePresentation(previous));
    cache.save(previous, "hosting:test", 10);
    JSONObject next = snapshot().put("server_revision", 11);
    assertTrue(cache.hasSamePresentation(next));
    cache.save(next, "hosting:test", 11);
    assertEquals(11, cache.revision("hosting:test"));
    try { cache.save(previous, "hosting:test", 10); fail("stale delivery accepted"); }
    catch (OperationCache.CacheException expected) { assertEquals(11, cache.revision("hosting:test")); }
  }
}
