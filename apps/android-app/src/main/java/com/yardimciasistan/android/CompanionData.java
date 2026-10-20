package com.yardimciasistan.android;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.HashSet;
import java.util.Set;
import java.net.URI;
import java.nio.charset.StandardCharsets;

/** Optional v3 facts. No business transition implementation. */
final class CompanionData {
  static final class Order {
    String id, customerId, status, source, currency, deliveryMethod, placedAt, updatedAt;
    double total;
    Details details;
    boolean dealerOrder;
  }
  static final class Item { String id, productId, name, unit; double quantity, unitPrice, lineTotal; }
  static final class Address { String recipient, line1, line2, district, city, postalCode, countryCode, note; }
  static final class Details {
    String customerName, buyerName = "", buyerPhone = "", buyerEmail = "", note;
    Address address;
    double subtotal, discountTotal;
    int itemCount;
    boolean itemsComplete;
    final List<Item> items = new ArrayList<>();
    final Set<String> availableActions = new HashSet<>();
  }
  static final class Customer { String id, name, phone, email, updatedAt; }
  static final class Profile { String customerId, dealerStatus, priceGroup, updatedAt, companyName, authorizedPerson; }
  static final class Shipment {
    String id, orderId, status, updatedAt, providerName, trackingNumber, trackingUrl, note;
    boolean trackingAvailable;
  }
  static final class Publication { String id, channel, status, updatedAt; int revision, publishedRevision; boolean desiredPublished; }
  static final class Schedule { String id, channel, targetType, status, nextRunAt, lastExecutionStatus, updatedAt; }
  static final class Campaign { String id, channel, status, updatedAt; int pendingCount, failedCount; }
  private static final class OrderCount { String source, status; long count, dealerCount; }
  private static final class ShipmentCount { String source; long pending, dealerPending; }

  final List<Order> orders = new ArrayList<>();
  final List<Profile> profiles = new ArrayList<>();
  final List<Customer> customers = new ArrayList<>();
  final List<Shipment> shipments = new ArrayList<>();
  final List<Publication> publications = new ArrayList<>();
  final List<Schedule> schedules = new ArrayList<>();
  final List<Campaign> campaigns = new ArrayList<>();
  private final List<OrderCount> orderCounts = new ArrayList<>();
  private final List<ShipmentCount> shipmentCounts = new ArrayList<>();
  long pendingOrders, openOrders, pendingShipments;
  int recentFailedMarketingOperations, desiredProductCount;
  boolean onlineCatalogPending;
  boolean commerceAvailable, marketingAvailable;
  String onlineCatalogUpdatedAt = "";

  static CompanionData fromJson(JSONObject root, OperationData data) {
    CompanionData result = new CompanionData();
    if (!data.permissionsResolved || !data.deviceActive || !data.hasBusinessCapability("service.android")) return result;
    JSONObject c = object(root, "commerce");
    result.commerceAvailable = root.optJSONObject("commerce") != null;
    int remainingItems = 2000, remainingBytes = 1024 * 1024;
    for (JSONObject r : rows(c, "orders", 100)) {
      if (!validId(r, "id") || !oneOf(r, "status", "placed", "confirmed", "fulfilled", "cancelled")
          || !oneOf(r, "source", "desktop", "other", "web-online-sales", "web-dealer")) continue;
      Order o = new Order(); o.id = r.optString("id"); o.customerId = validId(r, "customer_id") ? r.optString("customer_id") : ""; o.status = r.optString("status"); o.source = r.optString("source");
      o.dealerOrder = r.optBoolean("dealer_order", false);
      o.currency = r.optString("currency", "TRY"); if (!o.currency.matches("[A-Z]{3}")) o.currency = "TRY";
      double amount = r.optDouble("total", 0); o.total = Double.isFinite(amount) && amount >= 0 ? amount : 0;
      o.deliveryMethod = "shipping".equals(r.optString("delivery_method")) ? "shipping" : "pickup";
      o.placedAt = timestamp(r, "placed_at"); o.updatedAt = timestamp(r, "updated_at");
      JSONObject detail = r.optJSONObject("details");
      if (detail != null) {
        int bytes = detail.toString().getBytes(StandardCharsets.UTF_8).length;
        if (bytes <= remainingBytes) {
          o.details = details(detail, "shipping".equals(o.deliveryMethod), remainingItems);
          if (o.details != null) { remainingItems -= o.details.items.size(); remainingBytes -= bytes; }
        }
      }
      result.orders.add(o);
    }
    for (JSONObject r : rows(c, "customers", 100)) {
      if (!validId(r, "id")) continue;
      Customer customer = new Customer(); customer.id = r.optString("id"); customer.name = text(r, "full_name", 200);
      customer.phone = text(r, "phone", 80); customer.email = text(r, "email", 254); customer.updatedAt = timestamp(r, "updated_at");
      result.customers.add(customer);
    }
    for (JSONObject r : rows(c, "customer_profiles", 100)) {
      if (!validId(r, "customer_id") || !oneOf(r, "dealer_status", "active", "inactive")
          || !oneOf(r, "price_group", "retail", "dealer_a", "dealer_b")) continue;
      Profile p = new Profile(); p.customerId = r.optString("customer_id"); p.dealerStatus = r.optString("dealer_status");
      p.priceGroup = r.optString("price_group"); p.updatedAt = timestamp(r, "updated_at");
      p.companyName = text(r, "company_name", 200); p.authorizedPerson = text(r, "authorized_person", 200); result.profiles.add(p);
    }
    for (JSONObject r : rows(c, "shipments", 100)) {
      if (!validId(r, "id") || !validId(r, "order_id") || !oneOf(r, "status", "draft", "ready", "dispatched", "delivered", "cancelled")) continue;
      Shipment s = new Shipment(); s.id = r.optString("id"); s.orderId = r.optString("order_id"); s.status = r.optString("status");
      s.trackingAvailable = r.optBoolean("tracking_available", false); s.updatedAt = timestamp(r, "updated_at");
      s.providerName = text(r, "provider_name", 120); s.trackingNumber = text(r, "tracking_number", 120);
      s.trackingUrl = trackingUrl(r.optString("tracking_url", "")); s.note = text(r, "note", 2000); result.shipments.add(s);
    }
    for (JSONObject r : rows(c, "order_counts", 16)) {
      if (!oneOf(r, "source", "desktop", "other", "web-online-sales", "web-dealer") || !oneOf(r, "status", "placed", "confirmed", "fulfilled", "cancelled")) continue;
      OrderCount count = new OrderCount(); count.source = r.optString("source"); count.status = r.optString("status");
      count.count = Math.max(0L, r.optLong("count", 0L)); result.orderCounts.add(count);
      count.dealerCount = Math.max(0L, r.optLong("dealer_count", 0L));
    }
    for (JSONObject r : rows(c, "shipment_counts", 4)) {
      if (!oneOf(r, "source", "desktop", "other", "web-online-sales", "web-dealer")) continue;
      ShipmentCount count = new ShipmentCount(); count.source = r.optString("source"); count.pending = Math.max(0L, r.optLong("pending", 0L)); result.shipmentCounts.add(count);
      count.dealerPending = Math.max(0L, r.optLong("dealer_pending", 0L));
    }
    JSONObject catalog = object(c, "online_catalog");
    result.desiredProductCount = number(catalog, "desired_product_count"); result.onlineCatalogPending = catalog.optBoolean("pending", false);
    result.onlineCatalogUpdatedAt = timestamp(catalog, "updated_at");
    JSONObject m = object(root, "marketing");
    result.marketingAvailable = root.optJSONObject("marketing") != null;
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
  Customer customerById(String id) { for (Customer customer : customers) if (customer.id.equals(id)) return customer; return null; }
  Profile profileById(String id) { for (Profile profile : profiles) if (profile.customerId.equals(id)) return profile; return null; }

  void redact(OperationData data) {
    boolean orderAllowed = data.hasPermission("commerce_order.view");
    if (!orderAllowed) { orders.clear(); orderCounts.clear(); }
    orders.removeIf(o -> !sourceAllowed(data, o.source) || (o.dealerOrder && !data.hasBusinessCapability("commerce.wholesale")));
    orderCounts.removeIf(c -> !sourceAllowed(data, c.source));
    boolean contactAllowed = data.hasPermission("customer.view") || data.hasPermission("dealer.view");
    if (!contactAllowed) { customers.clear(); for (Order o : orders) o.customerId = ""; }
    Set<String> customerIds = new HashSet<>(); for (Order order : orders) if (!order.customerId.isEmpty()) customerIds.add(order.customerId);
    customers.removeIf(customer -> !customerIds.contains(customer.id));
    if (!data.hasPermission("dealer.view")) profiles.clear();
    profiles.removeIf(profile -> !customerIds.contains(profile.customerId));
    for (Order order : orders) if (order.details != null) {
      order.details.availableActions.removeIf(action -> !data.hasPermission(AndroidActionPolicy.requiredPermissionForAction(action, null)));
    }
    if (!orderAllowed || !data.hasPermission("shipment.view")) { shipments.clear(); shipmentCounts.clear(); }
    shipments.removeIf(s -> orderById(s.orderId) == null); shipmentCounts.removeIf(c -> !sourceAllowed(data, c.source));
    if (!orderAllowed || !data.hasPermission("online_sales.view")) { desiredProductCount = 0; onlineCatalogPending = false; onlineCatalogUpdatedAt = ""; }
    if (!data.hasPermission("marketing.status.view")) { publications.clear(); schedules.clear(); campaigns.clear(); }
    boolean campaignAllowed = data.hasBusinessCapability("messaging.campaigns") && data.hasBusinessCapability("core.customers");
    if (!campaignAllowed) campaigns.clear();
    schedules.removeIf(s -> !("public_publication".equals(s.targetType) && ("website".equals(s.channel) || "instagram".equals(s.channel)))
        && !(campaignAllowed && "audience_campaign".equals(s.targetType) && ("whatsapp".equals(s.channel) || "sms".equals(s.channel))));
    pendingOrders = 0; openOrders = 0; pendingShipments = 0; recentFailedMarketingOperations = 0;
    for (OrderCount c : orderCounts) {
      long count = Math.max(0L, c.count - (data.hasBusinessCapability("commerce.wholesale") ? 0L : c.dealerCount));
      if ("placed".equals(c.status)) pendingOrders += count;
      if ("placed".equals(c.status) || "confirmed".equals(c.status)) openOrders += count;
    }
    for (ShipmentCount c : shipmentCounts) pendingShipments += Math.max(0L, c.pending - (data.hasBusinessCapability("commerce.wholesale") ? 0L : c.dealerPending));
    for (Publication p : publications) if ("failed".equals(p.status)) recentFailedMarketingOperations++;
    for (Schedule s : schedules) if ("failed".equals(s.lastExecutionStatus)) recentFailedMarketingOperations++;
    for (Campaign c : campaigns) if (c.failedCount > 0) recentFailedMarketingOperations++;
  }

  private static Details details(JSONObject source, boolean shipping, int remainingItems) {
    if (!amount(source, "subtotal", false) || !amount(source, "discount_total", false)) return null;
    Details d = new Details(); d.customerName = text(source, "customer_name", 200); d.note = text(source, "note", 4000);
    d.subtotal = source.optDouble("subtotal"); d.discountTotal = source.optDouble("discount_total");
    d.itemCount = number(source, "items_total_count");
    JSONObject buyer = source.optJSONObject("buyer");
    if (buyer != null) { d.buyerName = text(buyer, "name", 200); d.buyerPhone = text(buyer, "phone", 80); d.buyerEmail = text(buyer, "email", 254); }
    JSONObject address = shipping ? source.optJSONObject("delivery_address") : null;
    if (address != null) {
      Address a = new Address(); a.recipient = text(address, "recipient_name", 200); a.line1 = text(address, "address_line1", 500);
      a.line2 = text(address, "address_line2", 500); a.district = text(address, "district", 120); a.city = text(address, "city", 120);
      a.postalCode = text(address, "postal_code", 40); a.countryCode = text(address, "country_code", 2); a.note = text(address, "note", 2000); d.address = a;
    }
    JSONArray input = source.optJSONArray("items");
    if (input != null && input.length() <= 500 && input.length() <= remainingItems) {
      for (int i = 0; i < input.length(); i++) {
        JSONObject r = input.optJSONObject(i);
        if (r == null || !validId(r, "id") || !validId(r, "product_id") || !(r.opt("product_name") instanceof String)
            || !oneOf(r, "unit", "piece", "kg", "g", "l", "ml", "pack", "box", "meter", "other")
            || !amount(r, "quantity", true) || !amount(r, "unit_price", false) || !amount(r, "line_total", false)) continue;
        Item item = new Item(); item.id = r.optString("id"); item.productId = r.optString("product_id");
        item.name = text(r, "product_name", 200); item.unit = r.optString("unit");
        item.quantity = r.optDouble("quantity"); item.unitPrice = r.optDouble("unit_price"); item.lineTotal = r.optDouble("line_total"); d.items.add(item);
      }
    }
    d.itemsComplete = source.optBoolean("items_complete", false) && input != null && d.itemCount > 0
        && d.itemCount == d.items.size() && input.length() == d.items.size();
    JSONArray actions = source.optJSONArray("available_actions");
    if (d.itemsComplete && actions != null) for (int i = 0; i < actions.length(); i++) {
      String action = actions.optString(i);
      if ("commerce_order_confirm".equals(action) || "commerce_order_cancel".equals(action)) d.availableActions.add(action);
    }
    return d;
  }

  static String trackingUrl(String value) {
    if (value == null || value.length() > 2048 || value.chars().anyMatch(c -> c <= 32 || c == 127)) return "";
    try {
      URI uri = new URI(value);
      return ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))
          && uri.getHost() != null && uri.getUserInfo() == null ? value : "";
    } catch (Exception ignored) { return ""; }
  }
  private static boolean amount(JSONObject r, String key, boolean positive) {
    Object value = r.opt(key); if (!(value instanceof Number)) return false;
    double number = ((Number) value).doubleValue();
    return Double.isFinite(number) && number >= 0 && number <= 9007199254740991d && (!positive || number > 0);
  }
  private static String text(JSONObject r, String key, int limit) {
    Object raw = r.opt(key); if (!(raw instanceof String)) return "";
    String value = (String) raw; int count = value.codePointCount(0, value.length());
    return count <= limit ? value : value.substring(0, value.offsetByCodePoints(0, limit));
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
