package com.yardimciasistan.android;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

/** Optional v3 status contracts. No UI or business transition implementation. */
final class CompanionData {
  static final class Order {
    String id, customerId, status, source, currency, deliveryMethod, placedAt, updatedAt;
    double total;
  }
  static final class Profile { String customerId, dealerStatus, priceGroup, updatedAt; }
  static final class Shipment { String id, orderId, status, updatedAt; boolean trackingAvailable; }
  static final class Publication { String id, channel, status, updatedAt; int revision, publishedRevision; boolean desiredPublished; }
  static final class Schedule { String id, channel, targetType, status, nextRunAt, lastExecutionStatus, updatedAt; }
  static final class Campaign { String id, channel, status, updatedAt; int pendingCount, failedCount; }
  private static final class OrderCount { String source, status; long count; }
  private static final class ShipmentCount { String source; long pending; }

  final List<Order> orders = new ArrayList<>();
  final List<Profile> profiles = new ArrayList<>();
  final List<Shipment> shipments = new ArrayList<>();
  final List<Publication> publications = new ArrayList<>();
  final List<Schedule> schedules = new ArrayList<>();
  final List<Campaign> campaigns = new ArrayList<>();
  private final List<OrderCount> orderCounts = new ArrayList<>();
  private final List<ShipmentCount> shipmentCounts = new ArrayList<>();
  long pendingOrders, openOrders, pendingShipments;
  int recentFailedMarketingOperations, desiredProductCount;
  boolean onlineCatalogPending;
  String onlineCatalogUpdatedAt = "";

  static CompanionData fromJson(JSONObject root, OperationData data) {
    CompanionData result = new CompanionData();
    if (!data.permissionsResolved || !data.deviceActive || !data.hasBusinessCapability("service.android")) return result;
    JSONObject c = object(root, "commerce");
    for (JSONObject r : rows(c, "orders", 100)) {
      if (!validId(r, "id") || !oneOf(r, "status", "placed", "confirmed", "fulfilled", "cancelled")
          || !oneOf(r, "source", "desktop", "other", "web-online-sales", "web-dealer")) continue;
      Order o = new Order(); o.id = r.optString("id"); o.customerId = validId(r, "customer_id") ? r.optString("customer_id") : ""; o.status = r.optString("status"); o.source = r.optString("source");
      o.currency = r.optString("currency", "TRY"); if (!o.currency.matches("[A-Z]{3}")) o.currency = "TRY";
      double amount = r.optDouble("total", 0); o.total = Double.isFinite(amount) && amount >= 0 ? amount : 0;
      o.deliveryMethod = "shipping".equals(r.optString("delivery_method")) ? "shipping" : "pickup";
      o.placedAt = timestamp(r, "placed_at"); o.updatedAt = timestamp(r, "updated_at"); result.orders.add(o);
    }
    for (JSONObject r : rows(c, "customer_profiles", 100)) {
      if (!validId(r, "customer_id") || !oneOf(r, "dealer_status", "candidate", "active", "inactive")
          || !oneOf(r, "price_group", "retail", "dealer_a", "dealer_b")) continue;
      Profile p = new Profile(); p.customerId = r.optString("customer_id"); p.dealerStatus = r.optString("dealer_status");
      p.priceGroup = r.optString("price_group"); p.updatedAt = timestamp(r, "updated_at"); result.profiles.add(p);
    }
    for (JSONObject r : rows(c, "shipments", 100)) {
      if (!validId(r, "id") || !validId(r, "order_id") || !oneOf(r, "status", "draft", "ready", "dispatched", "delivered", "cancelled")) continue;
      Shipment s = new Shipment(); s.id = r.optString("id"); s.orderId = r.optString("order_id"); s.status = r.optString("status");
      s.trackingAvailable = r.optBoolean("tracking_available", false); s.updatedAt = timestamp(r, "updated_at"); result.shipments.add(s);
    }
    for (JSONObject r : rows(c, "order_counts", 16)) {
      if (!oneOf(r, "source", "desktop", "other", "web-online-sales", "web-dealer") || !oneOf(r, "status", "placed", "confirmed", "fulfilled", "cancelled")) continue;
      OrderCount count = new OrderCount(); count.source = r.optString("source"); count.status = r.optString("status");
      count.count = Math.max(0L, r.optLong("count", 0L)); result.orderCounts.add(count);
    }
    for (JSONObject r : rows(c, "shipment_counts", 4)) {
      if (!oneOf(r, "source", "desktop", "other", "web-online-sales", "web-dealer")) continue;
      ShipmentCount count = new ShipmentCount(); count.source = r.optString("source"); count.pending = Math.max(0L, r.optLong("pending", 0L)); result.shipmentCounts.add(count);
    }
    JSONObject catalog = object(c, "online_catalog");
    result.desiredProductCount = number(catalog, "desired_product_count"); result.onlineCatalogPending = catalog.optBoolean("pending", false);
    result.onlineCatalogUpdatedAt = timestamp(catalog, "updated_at");
    JSONObject m = object(root, "marketing");
    for (JSONObject r : rows(m, "publications", 50)) {
      if (!validId(r, "id") || !oneOf(r, "channel", "website", "instagram") || !oneOf(r, "status", "draft", "publishing", "published", "unpublished", "failed")) continue;
      Publication p = new Publication(); p.id = r.optString("id"); p.channel = r.optString("channel"); p.status = r.optString("status");
      p.revision = number(r, "revision"); p.publishedRevision = number(r, "published_revision"); p.desiredPublished = r.optBoolean("desired_published", false);
      p.updatedAt = timestamp(r, "updated_at"); result.publications.add(p);
    }
    for (JSONObject r : rows(m, "schedules", 50)) {
      if (!validId(r, "id") || !oneOf(r, "channel", "website", "instagram", "whatsapp", "sms")
          || !oneOf(r, "target_type", "public_publication", "audience_campaign") || !oneOf(r, "status", "active", "paused", "completed", "cancelled")
          || !oneOf(r, "last_execution_status", "", "pending", "claimed", "succeeded", "skipped", "failed")) continue;
      Schedule s = new Schedule(); s.id = r.optString("id"); s.channel = r.optString("channel"); s.targetType = r.optString("target_type");
      s.status = r.optString("status"); s.nextRunAt = timestamp(r, "next_run_at"); s.lastExecutionStatus = r.optString("last_execution_status");
      s.updatedAt = timestamp(r, "updated_at"); result.schedules.add(s);
    }
    for (JSONObject r : rows(m, "campaigns", 50)) {
      if (!validId(r, "id") || !oneOf(r, "channel", "whatsapp", "sms") || !oneOf(r, "status", "draft", "prepared", "running", "paused", "cancelled", "completed")) continue;
      Campaign c1 = new Campaign(); c1.id = r.optString("id"); c1.channel = r.optString("channel"); c1.status = r.optString("status");
      c1.pendingCount = number(r, "pending_count"); c1.failedCount = number(r, "failed_count"); c1.updatedAt = timestamp(r, "updated_at"); result.campaigns.add(c1);
    }
    result.redact(data);
    return result;
  }

  Order orderById(String id) { for (Order order : orders) if (order.id.equals(id)) return order; return null; }

  void redact(OperationData data) {
    boolean orderAllowed = data.hasPermission("commerce_order.view");
    if (!orderAllowed) { orders.clear(); orderCounts.clear(); }
    orders.removeIf(o -> !sourceAllowed(data, o.source)); orderCounts.removeIf(c -> !sourceAllowed(data, c.source));
    if (!data.hasPermission("dealer.view")) { profiles.clear(); for (Order o : orders) o.customerId = ""; }
    if (!orderAllowed || !data.hasPermission("shipment.view")) { shipments.clear(); shipmentCounts.clear(); }
    shipments.removeIf(s -> orderById(s.orderId) == null); shipmentCounts.removeIf(c -> !sourceAllowed(data, c.source));
    if (!orderAllowed || !data.hasPermission("online_sales.view")) { desiredProductCount = 0; onlineCatalogPending = false; onlineCatalogUpdatedAt = ""; }
    if (!data.hasPermission("marketing.status.view")) { publications.clear(); schedules.clear(); campaigns.clear(); }
    boolean campaignAllowed = data.hasBusinessCapability("messaging.campaigns") && data.hasBusinessCapability("core.customers");
    if (!campaignAllowed) campaigns.clear();
    schedules.removeIf(s -> !("public_publication".equals(s.targetType) && ("website".equals(s.channel) || "instagram".equals(s.channel)))
        && !(campaignAllowed && "audience_campaign".equals(s.targetType) && ("whatsapp".equals(s.channel) || "sms".equals(s.channel))));
    pendingOrders = 0; openOrders = 0; pendingShipments = 0; recentFailedMarketingOperations = 0;
    for (OrderCount c : orderCounts) { if ("placed".equals(c.status)) pendingOrders += c.count; if ("placed".equals(c.status) || "confirmed".equals(c.status)) openOrders += c.count; }
    for (ShipmentCount c : shipmentCounts) pendingShipments += c.pending;
    for (Publication p : publications) if ("failed".equals(p.status)) recentFailedMarketingOperations++;
    for (Schedule s : schedules) if ("failed".equals(s.lastExecutionStatus)) recentFailedMarketingOperations++;
    for (Campaign c : campaigns) if (c.failedCount > 0) recentFailedMarketingOperations++;
  }

  private static boolean sourceAllowed(OperationData data, String source) {
    return (!"web-online-sales".equals(source) || data.hasPermission("online_sales.view"))
        && (!"web-dealer".equals(source) || data.hasBusinessCapability("commerce.wholesale"));
  }
  private static JSONObject object(JSONObject source, String key) { JSONObject value = source.optJSONObject(key); return value == null ? new JSONObject() : value; }
  private static List<JSONObject> rows(JSONObject source, String key, int limit) {
    List<JSONObject> result = new ArrayList<>(); JSONArray values = source.optJSONArray(key); if (values == null) return result;
    for (int i = 0; i < values.length() && result.size() < limit; i++) { JSONObject value = values.optJSONObject(i); if (value != null) result.add(value); }
    return result;
  }
  private static boolean validId(JSONObject r, String key) { return r.optString(key, "").matches("[A-Za-z0-9._:-]{1,120}"); }
  private static boolean oneOf(JSONObject r, String key, String... allowed) { for (String value : allowed) if (value.equals(r.optString(key, ""))) return true; return false; }
  private static String timestamp(JSONObject r, String key) { String value = r.optString(key, ""); return value.matches("\\d{4}-\\d{2}-\\d{2}T[0-9:.+Z-]{8,30}") ? value : ""; }
  private static int number(JSONObject r, String key) { return Math.max(0, r.optInt(key, 0)); }
}
