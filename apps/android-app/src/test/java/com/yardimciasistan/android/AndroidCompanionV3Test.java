package com.yardimciasistan.android;

import static org.junit.Assert.*;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public final class AndroidCompanionV3Test {
  private static final String DEVICE = "companion-test";
  private static final String TIME = "2026-10-12T12:00:00.000Z";

  private JSONObject snapshot() throws Exception {
    JSONObject order = new JSONObject().put("id", "order-1").put("status", "placed").put("source", "desktop")
        .put("total", 20).put("currency", "TRY").put("delivery_method", "shipping").put("placed_at", TIME).put("updated_at", TIME)
        .put("address", "PRIVATE").put("phone", "PRIVATE");
    return new JSONObject().put("business_capabilities", new JSONArray(new String[] { "service.android", "commerce.orders", "commerce.wholesale",
        "core.customers", "channel.online_sales", "marketing.studio", "messaging.campaigns" }))
        .put("androidPermissions", new JSONObject().put(DEVICE, profile(true, "commerce_order.view", "shipment.view", "dealer.view", "online_sales.view", "marketing.status.view")))
        .put("commerce", new JSONObject().put("orders", new JSONArray().put(order))
          .put("customer_profiles", new JSONArray().put(new JSONObject().put("customer_id", "customer-1").put("dealer_status", "active").put("price_group", "dealer_a").put("updated_at", TIME)))
          .put("shipments", new JSONArray().put(new JSONObject().put("id", "shipment-1").put("order_id", "order-1").put("status", "ready").put("tracking_available", true).put("updated_at", TIME)))
          .put("order_counts", new JSONArray().put(new JSONObject().put("source", "desktop").put("status", "placed").put("count", 200)))
          .put("shipment_counts", new JSONArray().put(new JSONObject().put("source", "desktop").put("pending", 300))))
        .put("marketing", new JSONObject().put("publications", new JSONArray().put(new JSONObject().put("id", "publication-1")
          .put("channel", "website").put("status", "failed").put("revision", 2).put("published_revision", 1).put("desired_published", true).put("updated_at", TIME))));
  }
  private static JSONObject profile(boolean active, String... permissions) throws Exception {
    return new JSONObject().put("role", "staff").put("is_active", active).put("permissions", new JSONArray(permissions));
  }

  @Test public void parsesBoundedOptionalContractsAndCompleteCounters() throws Exception {
    OperationData data = OperationData.fromJson(snapshot(), DEVICE);
    assertEquals(1, data.companion.orders.size());
    assertEquals("placed", data.companion.orders.get(0).status);
    assertEquals(TIME, data.companion.orders.get(0).updatedAt);
    assertEquals(200, data.companion.pendingOrders);
    assertEquals(300, data.companion.pendingShipments);
    assertEquals(1, data.companion.profiles.size());
    assertEquals(1, data.companion.recentFailedMarketingOperations);
    assertTrue(data.tableOrders.isEmpty());
  }
  @Test public void legacySnapshotMissingNewFieldsIsEmpty() throws Exception {
    JSONObject old = snapshot(); old.remove("commerce"); old.remove("marketing");
    OperationData data = OperationData.fromJson(old, DEVICE);
    assertTrue(data.companion.orders.isEmpty()); assertEquals(0, data.companion.pendingOrders);
  }
  @Test public void missingProfileAndAndroidOffCannotPopulateNewData() throws Exception {
    assertTrue(OperationData.fromJson(snapshot(), "other-device").companion.orders.isEmpty());
    JSONObject disabled = snapshot().put("business_capabilities", new JSONArray(new String[] { "commerce.orders" }));
    assertTrue(OperationData.fromJson(disabled, DEVICE).companion.orders.isEmpty());
  }
  @Test public void revokedProfileClearsDataAndCountersAlreadyInMemory() throws Exception {
    OperationData data = OperationData.fromJson(snapshot(), DEVICE);
    data.applyPermissionProfile(profile(false, "commerce_order.view"));
    assertTrue(data.companion.orders.isEmpty()); assertTrue(data.companion.shipments.isEmpty());
    assertTrue(data.companion.profiles.isEmpty()); assertTrue(data.companion.publications.isEmpty());
    assertEquals(0, data.companion.openOrders); assertEquals(0, data.companion.pendingShipments);
  }
  @Test public void adminDoesNotBypassCapabilityOrMissingPermission() throws Exception {
    JSONObject root = snapshot();
    root.put("business_capabilities", new JSONArray(new String[] { "service.android", "food_service.orders" }));
    root.getJSONObject("androidPermissions").put(DEVICE, profile(true, "commerce_order.view", "commerce_order.confirm").put("role", "admin"));
    OperationData data = OperationData.fromJson(root, DEVICE);
    assertFalse(data.hasPermission("commerce_order.confirm")); assertTrue(data.companion.orders.isEmpty());
  }
  @Test public void viewDoesNotGrantDecisionAndDecisionRequiresVersion() throws Exception {
    OperationData data = OperationData.fromJson(snapshot(), DEVICE);
    JSONObject payload = new JSONObject().put("order_id", "order-1").put("expected_updated_at", TIME).put("expected_status", "placed");
    assertFalse(AndroidActionPolicy.validationError(data, "commerce_order_confirm", payload).isEmpty());
    data.permissions.add("commerce_order.confirm");
    assertEquals("", AndroidActionPolicy.validationError(data, "commerce_order_confirm", payload));
    payload.remove("expected_updated_at");
    assertFalse(AndroidActionPolicy.validationError(data, "commerce_order_confirm", payload).isEmpty());
    assertNull(AndroidActionPolicy.requiredPermissionForAction("commerce_order_fulfill", payload));
  }
  @Test public void oversizedListsAreBoundedAndCapabilityWithdrawalFiltersCachedRows() throws Exception {
    JSONObject root = snapshot(); JSONObject commerce = root.getJSONObject("commerce");
    JSONObject order = commerce.getJSONArray("orders").getJSONObject(0);
    JSONArray orders = new JSONArray(); for (int i = 0; i < 1000; i++) orders.put(order);
    commerce.put("orders", orders);
    OperationData data = OperationData.fromJson(root, DEVICE);
    assertEquals(100, data.companion.orders.size());
    data.businessCapabilities.remove("commerce.orders"); data.companion.redact(data);
    assertTrue(data.companion.orders.isEmpty()); assertTrue(data.companion.profiles.isEmpty()); assertEquals(0, data.companion.pendingOrders);
  }
}
