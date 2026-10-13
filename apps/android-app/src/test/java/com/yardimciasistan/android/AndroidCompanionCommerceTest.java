package com.yardimciasistan.android;

import static org.junit.Assert.*;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class AndroidCompanionCommerceTest {
  private static final String DEVICE = "commerce-device";
  private static final String TIME = "2026-10-13T10:00:00.000Z";
  private static final String URL = "https://example.test/companion";
  private static final String TARGET = "companion:https://example.test/companion";

  private JSONObject profile(String... permissions) throws Exception {
    return new JSONObject().put("role", "staff").put("is_active", true).put("permissions", new JSONArray(permissions));
  }
  private JSONObject item(String id) throws Exception {
    return new JSONObject().put("id", id).put("product_id", "product-1").put("product_name", "Canonical product")
        .put("unit", "piece").put("quantity", 2).put("unit_price", 12.5).put("line_total", 25);
  }
  private JSONObject snapshot() throws Exception {
    JSONObject detail = new JSONObject().put("customer_name", "Order-time customer")
        .put("buyer", new JSONObject().put("name", "Guest buyer").put("phone", "+905551234567").put("email", "guest@example.test"))
        .put("delivery_address", new JSONObject().put("recipient_name", "Receiver").put("address_line1", "Example street")
            .put("district", "Merkez").put("city", "Ankara").put("country_code", "TR").put("note", "Door 2"))
        .put("subtotal", 25).put("discount_total", 5).put("note", "Order note")
        .put("items", new JSONArray().put(item("item-1"))).put("items_total_count", 1).put("items_complete", true)
        .put("available_actions", new JSONArray(new String[] { "commerce_order_confirm", "commerce_order_cancel" }));
    JSONObject order = new JSONObject().put("id", "order-1").put("customer_id", "customer-1").put("status", "placed")
        .put("source", "web-dealer").put("total", 20).put("currency", "TRY").put("delivery_method", "shipping")
        .put("placed_at", TIME).put("updated_at", TIME).put("details", detail);
    return new JSONObject().put("business_capabilities", new JSONArray(new String[] {
        "service.android", "commerce.orders", "commerce.wholesale", "core.customers", "channel.online_sales" }))
        .put("androidPermissions", new JSONObject().put(DEVICE, profile("commerce_order.view", "commerce_order.confirm",
            "commerce_order.cancel", "dealer.view", "shipment.view", "online_sales.view")))
        .put("commerce", new JSONObject().put("orders", new JSONArray().put(order))
            .put("customers", new JSONArray().put(new JSONObject().put("id", "customer-1").put("full_name", "Current customer")
                .put("phone", "+905559876543").put("email", "customer@example.test").put("updated_at", TIME))
                .put(new JSONObject().put("id", "unrelated").put("full_name", "Unrelated private name")))
            .put("customer_profiles", new JSONArray().put(new JSONObject().put("customer_id", "customer-1")
                .put("dealer_status", "active").put("price_group", "dealer_a").put("company_name", "Example company")
                .put("authorized_person", "Authorized person").put("updated_at", TIME)))
            .put("shipments", new JSONArray().put(new JSONObject().put("id", "shipment-1").put("order_id", "order-1")
                .put("status", "dispatched").put("tracking_available", true).put("provider_name", "Carrier")
                .put("tracking_number", "123456789").put("tracking_url", "https://tracking.example.test/?code=123456789")
                .put("note", "Shipment note").put("updated_at", TIME))));
  }

  @Test public void listDetailAndCustomerRelationshipsUseTheSameCanonicalIds() throws Exception {
    OperationData data = OperationData.fromJson(snapshot(), DEVICE);
    CompanionData.Order listOrder = CompanionUiRules.orders(data, CompanionUiRules.DEALER, false).get(0);
    assertSame(listOrder, data.companion.orderById("order-1"));
    assertEquals("Order-time customer", listOrder.details.customerName);
    assertEquals("Guest buyer", listOrder.details.buyerName);
    assertEquals("Current customer", data.companion.customerById(listOrder.customerId).name);
    assertEquals("Example company", data.companion.profileById(listOrder.customerId).companyName);
    assertNull(data.companion.customerById("unrelated"));
    assertEquals(1, data.companion.customers.size());
  }

  @Test public void linePricesAndTotalsRemainFactsRatherThanRecomputedCustomerPrices() throws Exception {
    CompanionData.Order order = OperationData.fromJson(snapshot(), DEVICE).companion.orderById("order-1");
    CompanionData.Item item = order.details.items.get(0);
    assertEquals(2, item.quantity, 0); assertEquals(12.5, item.unitPrice, 0); assertEquals(25, item.lineTotal, 0);
    assertEquals(25, order.details.subtotal, 0); assertEquals(5, order.details.discountTotal, 0); assertEquals(20, order.total, 0);
    assertEquals("2 adet", CompanionPresentation.itemQuantity(item));
    assertTrue(order.details.itemsComplete);
    assertEquals("Order note", order.details.note);
  }

  @Test public void shippingAddressAndTrackingLinkStaySeparateFromCustomerIdentity() throws Exception {
    OperationData data = OperationData.fromJson(snapshot(), DEVICE);
    String address = CompanionPresentation.address(data.companion.orders.get(0).details.address);
    assertTrue(address.contains("Receiver")); assertTrue(address.contains("Example street"));
    CompanionData.Shipment shipment = data.companion.shipments.get(0);
    assertEquals("123456789", shipment.trackingNumber);
    assertEquals("https://tracking.example.test/?code=123456789", shipment.trackingUrl);
    assertTrue(String.join("\n", CompanionPresentation.shipment(shipment).lines).contains("123456789"));
    for (String invalid : new String[] { "javascript:alert(1)", "file:///tmp/private", "intent://tracking",
        "https://user:password@example.test/", "https://example.test/ bad" }) assertEquals("", CompanionData.trackingUrl(invalid));
  }

  @Test public void basicCustomerPermissionDoesNotOpenDealerOrShipmentFields() throws Exception {
    JSONObject root = snapshot();
    root.getJSONObject("androidPermissions").put(DEVICE, profile("commerce_order.view", "customer.view"));
    OperationData data = OperationData.fromJson(root, DEVICE);
    assertEquals(1, data.companion.customers.size());
    assertTrue(data.companion.profiles.isEmpty()); assertTrue(data.companion.shipments.isEmpty());
    assertTrue(data.companion.orders.get(0).details.availableActions.isEmpty());
    assertFalse(CompanionUiRules.canDecide(data, data.companion.orders.get(0), "commerce_order_confirm", Collections.emptyList()));
    data.applyPermissionProfile(profile("commerce_order.view"));
    assertTrue(data.companion.customers.isEmpty());
    assertEquals("", data.companion.orders.get(0).customerId);
    assertEquals("Guest buyer", data.companion.orders.get(0).details.buyerName);
    data.businessCapabilities.remove("commerce.wholesale"); data.companion.redact(data);
    assertTrue(data.companion.orders.isEmpty());
  }

  @Test public void eligibilityComesFromTheDomainAdvertisementAndEffectivePermission() throws Exception {
    OperationData data = OperationData.fromJson(snapshot(), DEVICE);
    CompanionData.Order order = data.companion.orders.get(0);
    assertTrue(CompanionUiRules.canDecide(data, order, "commerce_order_confirm", Collections.emptyList()));
    order.details.availableActions.remove("commerce_order_confirm");
    assertFalse(CompanionUiRules.canDecide(data, order, "commerce_order_confirm", Collections.emptyList()));
    assertTrue(CompanionUiRules.canDecide(data, order, "commerce_order_cancel", Collections.emptyList()));
    data.permissions.remove("commerce_order.cancel"); data.companion.redact(data);
    assertFalse(CompanionUiRules.canDecide(data, order, "commerce_order_cancel", Collections.emptyList()));
    assertFalse(CompanionUiRules.canDecide(data, order, "commerce_order_fulfill", Collections.emptyList()));
  }

  @Test public void legacyMissingOrTruncatedDetailsRemainReadableWithoutDecisionButtons() throws Exception {
    JSONObject root = snapshot(), order = root.getJSONObject("commerce").getJSONArray("orders").getJSONObject(0);
    order.remove("details");
    OperationData legacy = OperationData.fromJson(root, DEVICE);
    assertNotNull(legacy.companion.orderById("order-1")); assertNull(legacy.companion.orders.get(0).details);
    assertFalse(CompanionUiRules.canDecide(legacy, legacy.companion.orders.get(0), "commerce_order_confirm", Collections.emptyList()));
    root = snapshot(); JSONObject detail = root.getJSONObject("commerce").getJSONArray("orders").getJSONObject(0).getJSONObject("details");
    detail.put("items_total_count", 2);
    OperationData incomplete = OperationData.fromJson(root, DEVICE);
    assertFalse(incomplete.companion.orders.get(0).details.itemsComplete);
    assertTrue(incomplete.companion.orders.get(0).details.availableActions.isEmpty());
    detail.getJSONArray("items").getJSONObject(0).put("quantity", -1);
    assertTrue(OperationData.fromJson(root, DEVICE).companion.orders.get(0).details.items.isEmpty());
  }

  @Test public void detailBackReturnsToTheListAndRevocationClosesTheDetail() throws Exception {
    OperationData data = OperationData.fromJson(snapshot(), DEVICE);
    AndroidTodayCoordinator coordinator = new AndroidTodayCoordinator(null, null, null);
    coordinator.applyDestination(data, AndroidUiRules.resolveDestination("today:commerce"));
    coordinator.openOrder(data, "order-1"); assertEquals("Sipariş ayrıntısı", coordinator.title());
    coordinator.handleBack(); assertEquals("Ticari siparişler", coordinator.title());
    coordinator.openOrder(data, "unrelated"); assertEquals("Ticari siparişler", coordinator.title());
    coordinator.openOrder(data, "order-1");
    data.applyPermissionProfile(profile()); coordinator.normalize(data);
    assertEquals("Bugün", coordinator.title()); assertTrue(data.companion.orders.isEmpty());
  }

  @Test public void offlineCacheAndRevisionFencingPreserveAuthorizedDetails() throws Exception {
    AndroidCompanionStorageTest.InMemoryPreferences prefs = new AndroidCompanionStorageTest.InMemoryPreferences();
    prefs.edit().putString(ConnectionSettings.KEY_WEB_MODULE_URL, URL).commit();
    ConnectionSettings.setDebugConnectionOverrideActive(prefs, true);
    OperationCache cache = new OperationCache(prefs, DEVICE);
    cache.save(snapshot(), "hosting:test", 12);
    OperationData offline = new OperationCache(prefs, DEVICE).load();
    assertEquals("Example street", offline.companion.orderById("order-1").details.address.line1);
    assertEquals(25, offline.companion.orders.get(0).details.items.get(0).lineTotal, 0);
    assertTrue(CompanionUiRules.syncNotice(offline, false, true, 0).contains("son alınan özet"));
    try { cache.save(snapshot(), "hosting:test", 11); fail("older revision"); }
    catch (OperationCache.CacheException expected) { assertEquals(12, cache.revision("hosting:test")); }
    cache.save(snapshot(), "local:desktop", 2);
    assertEquals(2, cache.revision("local:desktop")); assertNotNull(cache.load().companion.orders.get(0).details);
  }

  @Test public void differentOrdersCanQueueOfflineButDuplicateAndCrossTargetIntentsCannot() throws Exception {
    OperationData data = OperationData.fromJson(snapshot(), DEVICE);
    CompanionData.Order order = data.companion.orders.get(0);
    JSONObject payload = CompanionUiRules.decisionPayload(order);
    assertEquals("", CompanionUiRules.submissionError(data, "commerce_order_confirm", payload, Collections.emptyList(), TARGET));
    ActionOutbox.PendingAction queued = ActionOutbox.PendingAction.create("action-1", "commerce_order_confirm", payload, TARGET);
    List<ActionOutbox.PendingAction> pending = new ArrayList<>(); pending.add(queued);
    assertTrue(CompanionUiRules.orderActionStatus(data, order.id, pending).contains("Bekliyor"));
    assertFalse(CompanionUiRules.canDecide(data, order, "commerce_order_cancel", pending));
    assertFalse(CompanionUiRules.submissionError(data, "commerce_order_cancel", payload, pending, TARGET).isEmpty());
    pending.clear(); pending.add(ActionOutbox.PendingAction.create("action-2", "commerce_order_cancel",
        new JSONObject(payload.toString()).put("order_id", "other-order"), TARGET));
    assertEquals("", CompanionUiRules.submissionError(data, "commerce_order_confirm", payload, pending, TARGET));
    assertFalse(CompanionUiRules.submissionError(data, "commerce_order_confirm", payload, pending, "companion:another").isEmpty());
    order.updatedAt = "2026-10-13T11:00:00.000Z";
    assertTrue(CompanionUiRules.submissionError(data, "commerce_order_confirm", payload, Collections.emptyList(), TARGET).contains("değişti"));
    order.details.availableActions.remove("commerce_order_confirm"); order.status = "confirmed";
    assertTrue(CompanionUiRules.submissionError(data, "commerce_order_confirm", payload, Collections.emptyList(), TARGET).contains("değişti"));
    AndroidCompanionStorageTest.InMemoryPreferences prefs = new AndroidCompanionStorageTest.InMemoryPreferences();
    ActionOutbox outbox = new ActionOutbox(prefs); outbox.appendAll(pending); outbox.appendAll(pending);
    assertEquals(1, new ActionOutbox(prefs).load().size());
    assertEquals("action-2", new ActionOutbox(prefs).load().get(0).id);
    assertEquals(TIME, new ActionOutbox(prefs).load().get(0).payload.optString("expected_updated_at"));
  }

  @Test public void receiptsPersistAcrossRestartSourceChangesAndNotModifiedMetadata() throws Exception {
    AndroidCompanionStorageTest.InMemoryPreferences prefs = new AndroidCompanionStorageTest.InMemoryPreferences();
    prefs.edit().putString(ConnectionSettings.KEY_WEB_MODULE_URL, URL).commit();
    ConnectionSettings.setDebugConnectionOverrideActive(prefs, true);
    OperationCache cache = new OperationCache(prefs, DEVICE);
    OperationData.ActionRecord record = new OperationData.ActionRecord(); record.id = "action-1"; record.type = "commerce_order_confirm";
    record.orderId = "order-1"; record.status = "applied"; record.createdAt = TIME; record.processedAt = TIME;
    cache.recordActionResult(record, TARGET); cache.save(snapshot(), "local:desktop", 5);
    assertTrue(cache.load().actions.stream().anyMatch(action -> "applied".equals(action.status)));
    record.status = "pending"; cache.recordActionResult(record, TARGET);
    cache.save(snapshot(), "hosting:test", 20);
    assertTrue(cache.load().actions.stream().anyMatch(action -> "applied".equals(action.status)));
    assertEquals(0, cache.pendingActionResultIds(TARGET).length());
    record.status = "failed"; record.errorMessage = "Bu cihazın işlem yetkisi kaldırıldı.";
    cache.recordActionResult(record, TARGET);
    assertTrue("A denied retry after local queue cleanup failure cannot erase a known application.",
        cache.load().actions.stream().anyMatch(action -> "applied".equals(action.status)));
    record.id = "action-2"; record.status = "pending"; cache.recordActionResult(record, TARGET);
    assertEquals(1, cache.pendingActionResultIds(TARGET).length());
    record.status = "failed"; record.errorMessage = "Ticari sipariş masaüstünde değişmiş.";
    cache.recordActionResult(record, TARGET);
    String result = CompanionUiRules.orderActionStatus(cache.load(), "order-1", Collections.emptyList());
    assertTrue(result.contains("Uygulanamadı")); assertTrue(result.contains("masaüstünde değişmiş"));
    assertFalse(prefs.getString("operations_action_results_v2", "").contains("Example street"));
    assertFalse(prefs.getString("operations_action_results_v2", "").contains("Guest buyer"));
    prefs.edit().putString(ConnectionSettings.KEY_WEB_MODULE_URL, "https://other.example.test/companion").commit();
    assertTrue(cache.load().actions.isEmpty());
  }

  @Test public void appliedReceiptWaitsForCanonicalProjectionWithoutInventingOrderState() throws Exception {
    OperationData data = OperationData.fromJson(snapshot(), DEVICE);
    CompanionData.Order order = data.companion.orders.get(0);
    OperationData.ActionRecord record = OperationData.ActionRecord.fromJson(new JSONObject()
        .put("id", "action-1").put("action_type", "commerce_order_confirm").put("status", "applied")
        .put("payload", CompanionUiRules.decisionPayload(order)));
    data.actions.add(record);
    assertTrue(CompanionUiRules.awaitingProjection(data, order));
    assertFalse(CompanionUiRules.canDecide(data, order, "commerce_order_cancel", Collections.emptyList()));
    assertEquals("placed", order.status);
    assertTrue(CompanionUiRules.orderActionStatus(data, order.id, Collections.emptyList()).contains("güncellemesi bekleniyor"));
    order.updatedAt = "2026-10-13T11:00:00.000Z";
    assertFalse(CompanionUiRules.awaitingProjection(data, order));
    assertTrue(CompanionUiRules.canDecide(data, order, "commerce_order_cancel", Collections.emptyList()));
  }

  @Test public void missingReceiptIsReportedHonestlyAndDoesNotBlockTheOrderForever() throws Exception {
    AndroidCompanionStorageTest.InMemoryPreferences prefs = new AndroidCompanionStorageTest.InMemoryPreferences();
    prefs.edit().putString(ConnectionSettings.KEY_WEB_MODULE_URL, URL).commit();
    ConnectionSettings.setDebugConnectionOverrideActive(prefs, true);
    OperationCache cache = new OperationCache(prefs, DEVICE);
    cache.save(snapshot(), "hosting:test", 1);
    OperationData.ActionRecord record = OperationData.ActionRecord.fromJson(new JSONObject()
        .put("id", "action-1").put("action_type", "commerce_order_cancel").put("status", "pending")
        .put("payload", CompanionUiRules.decisionPayload(cache.load().companion.orders.get(0))));
    cache.recordActionResult(record, TARGET);
    cache.markMissingActionResults(new JSONArray().put("action-1"), "companion:other");
    assertEquals(1, cache.pendingActionResultIds(TARGET).length());
    cache.markMissingActionResults(new JSONArray().put("action-1"), TARGET);
    OperationData offline = cache.load();
    assertEquals(0, cache.pendingActionResultIds(TARGET).length());
    assertEquals("unknown", offline.actions.get(0).status);
    assertEquals(TIME, offline.actions.get(0).expectedUpdatedAt);
    assertTrue(CompanionUiRules.orderActionStatus(offline, "order-1", Collections.emptyList()).contains("Sonuç kaydı bulunamadı"));
    assertFalse(CompanionUiRules.orderPending(offline, "order-1", Collections.emptyList()));
  }

  @Test public void manualDealerOrderAndItsCountersFollowWholesaleCapability() throws Exception {
    JSONObject root = snapshot(), commerce = root.getJSONObject("commerce");
    commerce.getJSONArray("orders").getJSONObject(0).put("source", "other").put("dealer_order", true);
    commerce.put("order_counts", new JSONArray().put(new JSONObject().put("source", "other").put("status", "placed").put("count", 7).put("dealer_count", 5)));
    commerce.put("shipment_counts", new JSONArray().put(new JSONObject().put("source", "other").put("pending", 6).put("dealer_pending", 4)));
    OperationData data = OperationData.fromJson(root, DEVICE);
    assertEquals(1, CompanionUiRules.orders(data, CompanionUiRules.DEALER, false).size());
    data.businessCapabilities.remove("commerce.wholesale"); data.companion.redact(data); data.companion.redact(data);
    assertTrue(data.companion.orders.isEmpty()); assertTrue(data.companion.shipments.isEmpty());
    assertEquals(2, data.companion.pendingOrders); assertEquals(2, data.companion.pendingShipments);
  }
}
