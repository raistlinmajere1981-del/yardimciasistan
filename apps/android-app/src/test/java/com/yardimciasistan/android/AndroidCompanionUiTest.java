package com.yardimciasistan.android;

import static org.junit.Assert.*;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.util.List;

public final class AndroidCompanionUiTest {
  private static final String DEVICE = "companion-ui-test";
  private static final String TIME = "2026-10-13T10:00:00.000Z";
  private static final String[] RIGHTS = {
      "commerce_order.view", "commerce_order.confirm", "commerce_order.cancel",
      "shipment.view", "online_sales.view", "marketing.status.view"
  };

  private JSONObject profile(String role, String... permissions) throws Exception {
    return new JSONObject().put("role", role).put("is_active", true).put("permissions", new JSONArray(permissions));
  }

  private JSONObject order(String id, String source) throws Exception {
    return new JSONObject().put("id", id).put("source", source).put("status", "placed")
        .put("total", 123.45).put("currency", "EUR").put("delivery_method", "shipping")
        .put("placed_at", TIME).put("updated_at", TIME).put("customer_id", "private-customer")
        .put("address", "PRIVATE_ADDRESS").put("phone", "PRIVATE_PHONE").put("items", new JSONArray().put("PRIVATE_ITEM"));
  }

  private JSONObject snapshot() throws Exception {
    return new JSONObject()
        .put("business_capabilities", new JSONArray(new String[] {
            "service.android", "commerce.orders", "commerce.wholesale", "channel.online_sales",
            "marketing.studio", "messaging.campaigns", "core.customers"
        }))
        .put("androidPermissions", new JSONObject().put(DEVICE, profile("staff", RIGHTS)))
        .put("summary", new JSONObject().put("pulled_at", TIME))
        .put("commerce", new JSONObject()
            .put("orders", new JSONArray().put(order("desktop-order", "desktop"))
                .put(order("online-order", "web-online-sales")).put(order("dealer-order", "web-dealer")))
            .put("shipments", new JSONArray().put(new JSONObject().put("id", "shipment-1").put("order_id", "online-order")
                .put("status", "dispatched").put("tracking_available", true).put("updated_at", TIME)
                .put("tracking_number", "PRIVATE_NUMBER").put("tracking_url", "https://private.invalid/")))
            .put("order_counts", new JSONArray().put(new JSONObject().put("source", "desktop").put("status", "placed").put("count", 3000000000L))))
        .put("marketing", new JSONObject()
            .put("publications", new JSONArray().put(new JSONObject().put("id", "publication-1").put("channel", "website")
                .put("status", "failed").put("revision", 2).put("published_revision", 1).put("desired_published", true).put("updated_at", TIME)))
            .put("schedules", new JSONArray().put(new JSONObject().put("id", "schedule-1").put("channel", "sms")
                .put("target_type", "audience_campaign").put("status", "active").put("last_execution_status", "failed")
                .put("next_run_at", TIME).put("updated_at", TIME)))
            .put("campaigns", new JSONArray().put(new JSONObject().put("id", "campaign-1").put("channel", "sms")
                .put("status", "completed").put("pending_count", 0).put("failed_count", 2).put("updated_at", TIME))));
  }

  @Test public void commerceRoutesRemainInTodayWithoutMarketOrRestaurant() throws Exception {
    OperationData data = OperationData.fromJson(snapshot(), DEVICE);
    assertFalse(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_MARKET));
    assertFalse(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_RESTAURANT));
    assertTrue(CompanionUiRules.canOpen(data, AndroidUiRules.TODAY_COMMERCE));
    assertTrue(CompanionUiRules.canOpen(data, AndroidUiRules.TODAY_SHIPMENTS));
    assertEquals("commerce", AndroidUiRules.resolveDestination("today/commerce").mode);
    assertEquals("today", AndroidUiRules.resolveDestination("today:shipments").tab);
    assertEquals("marketing", AndroidUiRules.resolveDestination("today:marketing").mode);
    assertEquals("", AndroidUiRules.resolveDestination("today:table-orders").mode);
    assertEquals(3000000000L, data.companion.pendingOrders);
    assertTrue(data.tableOrders.isEmpty());
  }

  @Test public void staffAndAdminUseEffectiveRightsAndCapabilityOffHidesViews() throws Exception {
    for (String role : new String[] { "staff", "admin" }) {
      JSONObject root = snapshot();
      root.getJSONObject("androidPermissions").put(DEVICE, profile(role));
      OperationData denied = OperationData.fromJson(root, DEVICE);
      assertFalse(CompanionUiRules.canOpen(denied, AndroidUiRules.TODAY_COMMERCE));
      assertFalse(CompanionUiRules.canOpen(denied, AndroidUiRules.TODAY_MARKETING));
      root.getJSONObject("androidPermissions").put(DEVICE, profile(role, RIGHTS));
      OperationData allowed = OperationData.fromJson(root, DEVICE);
      assertTrue(CompanionUiRules.canOpen(allowed, AndroidUiRules.TODAY_COMMERCE));
      allowed.businessCapabilities.remove("commerce.orders");
      assertFalse(CompanionUiRules.canOpen(allowed, AndroidUiRules.TODAY_COMMERCE));
      assertFalse(CompanionUiRules.canOpen(allowed, AndroidUiRules.TODAY_SHIPMENTS));
      allowed.businessCapabilities.remove("marketing.studio");
      assertFalse(CompanionUiRules.canOpen(allowed, AndroidUiRules.TODAY_MARKETING));
      allowed.businessCapabilities.clear();
      assertFalse(CompanionUiRules.sourceFilterAvailable(allowed, CompanionUiRules.ALL));
    }
  }

  @Test public void onlineAndDealerSelectionReuseRedactionWithoutDealerProfilePermission() throws Exception {
    OperationData data = OperationData.fromJson(snapshot(), DEVICE);
    assertFalse(data.hasPermission("dealer.view"));
    assertEquals("online-order", CompanionUiRules.orders(data, CompanionUiRules.ONLINE, false).get(0).id);
    assertEquals("dealer-order", CompanionUiRules.orders(data, CompanionUiRules.DEALER, false).get(0).id);
    data.permissions.remove("online_sales.view");
    assertTrue(CompanionUiRules.orders(data, CompanionUiRules.ONLINE, false).isEmpty());
    List<CompanionData.Order> visible = CompanionUiRules.orders(data, CompanionUiRules.ALL, false);
    assertEquals(2, visible.size());
    data.businessCapabilities.remove("commerce.wholesale");
    assertTrue(CompanionUiRules.orders(data, CompanionUiRules.DEALER, false).isEmpty());
    assertEquals(1, CompanionUiRules.orders(data, CompanionUiRules.ALL, false).size());
  }

  @Test public void safeOrderSummaryIncludesShipmentPresenceButNoPrivateDetail() throws Exception {
    OperationData data = OperationData.fromJson(snapshot(), DEVICE);
    CompanionData.Order order = CompanionUiRules.orders(data, CompanionUiRules.ONLINE, true).get(0);
    CompanionPresentation.Summary summary = CompanionPresentation.order(data.companion, order, true);
    assertEquals("Sipariş online-order", summary.title);
    assertEquals("Onay bekliyor", summary.status);
    assertTrue(summary.pending);
    String lines = String.join("\n", summary.lines);
    assertTrue(lines.contains("Online satış"));
    assertTrue(lines.contains("EUR"));
    assertTrue(lines.contains("2026-10-13"));
    assertTrue(lines.contains("Teslimat: Kargo"));
    assertTrue(lines.contains("Gönderildi"));
    assertTrue(lines.contains("Takip kaydı: Var"));
    assertFalse(lines.contains("PRIVATE"));
    assertFalse(lines.contains("private-customer"));
    assertFalse(lines.contains("https://"));
    assertFalse(String.join("\n", CompanionPresentation.order(data.companion, order, false).lines).contains("Takip"));
    data.permissions.remove("shipment.view");
    assertTrue(CompanionUiRules.orders(data, CompanionUiRules.ALL, true).isEmpty());
  }

  @Test public void failuresRetainActualPublicationPlanAndCampaignStates() throws Exception {
    OperationData data = OperationData.fromJson(snapshot(), DEVICE);
    CompanionPresentation.Summary publication = CompanionPresentation.publication(data.companion.publications.get(0));
    assertEquals("Başarısız", publication.status);
    assertTrue(publication.failed);
    CompanionPresentation.Summary schedule = CompanionPresentation.schedule(data.companion.schedules.get(0));
    assertEquals("Aktif", schedule.status);
    assertTrue(schedule.failed);
    assertTrue(schedule.lines.contains("Son çalıştırma: Başarısız"));
    CompanionPresentation.Summary campaign = CompanionPresentation.campaign(data.companion.campaigns.get(0));
    assertEquals("Tamamlandı", campaign.status);
    assertTrue(campaign.failed);
    assertTrue(campaign.lines.contains("Bekleyen: 0 · Başarısız: 2"));
    assertEquals(3, data.companion.recentFailedMarketingOperations);
    data.businessCapabilities.remove("messaging.campaigns");
    data.companion.redact(data);
    assertTrue(data.companion.campaigns.isEmpty());
    assertTrue(data.companion.schedules.isEmpty());
    assertEquals(1, data.companion.recentFailedMarketingOperations);
  }

  @Test public void legacyAndEmptySnapshotsHaveDifferentAvailabilityAndBoundedLists() throws Exception {
    JSONObject root = snapshot();
    root.remove("commerce"); root.remove("marketing");
    OperationData legacy = OperationData.fromJson(root, DEVICE);
    assertFalse(legacy.companion.commerceAvailable);
    assertFalse(legacy.companion.marketingAvailable);
    assertTrue(CompanionUiRules.orders(legacy, CompanionUiRules.ALL, false).isEmpty());
    root.put("commerce", new JSONObject()).put("marketing", new JSONObject());
    OperationData empty = OperationData.fromJson(root, DEVICE);
    assertTrue(empty.companion.commerceAvailable);
    assertTrue(empty.companion.marketingAvailable);
    root = snapshot();
    JSONArray orders = new JSONArray(), publications = new JSONArray();
    for (int i = 0; i < 101; i++) orders.put(order("order-" + i, "desktop"));
    JSONObject publication = root.getJSONObject("marketing").getJSONArray("publications").getJSONObject(0);
    for (int i = 0; i < 51; i++) publications.put(publication);
    root.getJSONObject("commerce").put("orders", orders);
    root.getJSONObject("marketing").put("publications", publications);
    OperationData bounded = OperationData.fromJson(root, DEVICE);
    assertEquals(100, CompanionUiRules.orders(bounded, CompanionUiRules.ALL, false).size());
    assertEquals(50, bounded.companion.publications.size());
  }

  @Test public void permissionLossClosesSubViewAndBackDoesNotGrowNavigation() throws Exception {
    OperationData data = OperationData.fromJson(snapshot(), DEVICE);
    AndroidTodayCoordinator coordinator = new AndroidTodayCoordinator(null, null, null);
    coordinator.applyDestination(data, AndroidUiRules.resolveDestination("today:commerce"));
    assertEquals("Ticari siparişler", coordinator.title());
    assertTrue(coordinator.isCompanionViewOpen());
    assertTrue(coordinator.handleBack());
    assertEquals("Bugün", coordinator.title());
    assertFalse(coordinator.isCompanionViewOpen());
    assertFalse(coordinator.handleBack());
    coordinator.applyDestination(data, AndroidUiRules.resolveDestination("today:shipments"));
    data.applyPermissionProfile(profile("staff", "commerce_order.view"));
    coordinator.normalize(data);
    assertEquals("Bugün", coordinator.title());
    assertTrue(data.companion.shipments.isEmpty());
    coordinator.applyDestination(data, AndroidUiRules.resolveDestination("today:marketing"));
    assertEquals("Bugün", coordinator.title());
    data.deviceActive = false;
    coordinator.normalize(data);
    assertTrue(data.companion.orders.isEmpty());
  }

  @Test public void staleCachedReadingsLoadingAndOfflineRetryHaveExplicitStatus() throws Exception {
    OperationData data = OperationData.fromJson(snapshot(), DEVICE);
    data.pulledAt = TIME;
    data.snapshotUpdatedAt = "2026-10-10T08:00:00.000Z";
    String offline = CompanionUiRules.syncNotice(data, false, true, 2);
    assertTrue(offline.contains("son alınan özet"));
    assertTrue(offline.contains("2026-10-13"));
    assertTrue(offline.contains("Özet güncellemesi: 2026-10-10"));
    assertTrue(offline.contains("2 telefon işlemi"));
    assertTrue(CompanionUiRules.syncNotice(data, true, false, 0).contains("Senkronizasyon sürüyor"));
    assertFalse(CompanionUiRules.syncNotice(data, false, false, 0).contains("bekliyor"));
    data.pulledAt = "";
    data.snapshotUpdatedAt = "";
    assertTrue(CompanionUiRules.syncNotice(data, false, false, 0).contains("Henüz senkronizasyon"));
    assertTrue(CompanionUiRules.syncNotice(data, false, false, 0).contains("güncelleme zamanı bilinmiyor"));
  }
}
