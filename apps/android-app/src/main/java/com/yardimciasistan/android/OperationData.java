package com.yardimciasistan.android;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

final class OperationData {
  private static final String[] ALL_PERMISSIONS = {
      "kbs.view", "kbs.send", "kbs.retry", "kbs.reconcile_external",
      "voice.dictation",
      "customer.view",
      "customer.manage",
      "customer.respond",
      "customer.mark_answered",
      "customer.reject",
      "customer.convert_to_reservation",
      "customer.delete",
      "request.delete",
      "reservation.view",
      "reservation.create",
      "reservation.update",
      "reservation.approve",
      "reservation.reject",
      "reservation.cancel",
      "room.view",
      "room.update_status",
      "room.assign_customer",
      "room_folio.view",
      "room_folio.add_menu_item",
      "room_folio.add_manual_charge",
      "room_folio.payment",
      "room_folio.checkout",
      "daily_task.view",
      "daily_task.create",
      "daily_task.update",
      "daily_task.delete",
      "daily_task.complete",
      "daily_task.reopen",
      "table.view",
      "table.update_status",
      "table_order.view",
      "table_order.open",
      "table_order.add_item",
      "table_order.update_item",
      "table_order.remove_item",
      "table_order.set_preparing",
      "table_order.set_served",
      "table_order.set_payment_waiting",
      "table_order.close_paid",
      "table_order.cancel",
      "menu.view",
      "menu.edit",
      "menu.stock_view",
      "menu.stock_update",
      "finance.view",
      "finance.create",
      "menu.delete",
      "message.delete",
      "settings.view",
      "settings.edit",
      "android_devices.view",
      "android_devices.manage",
      "market.summary.view",
      "market.product.view",
      "market.stock_count",
      "market.receiving",
      "market.product_create",
      "market.cart_draft",
      "commerce_order.view",
      "commerce_order.confirm",
      "commerce_order.cancel",
      "dealer.view",
      "shipment.view",
      "online_sales.view",
      "marketing.status.view",
      "market.scan_to_desktop",
      "market.sale.complete", "customer_credit.view", "customer_credit.payment"
  };
  private static final String[] KNOWN_BUSINESS_CAPABILITIES = {
      "core.customers",
      "customer.requests",
      "core.tasks",
      "core.calendar",
      "core.notifications",
      "core.finance",
      "core.reports",
      "core.web",
      "core.sync",
      "core.backups",
      "core.devices",
      "service.whatsapp",
      "service.ai",
      "service.android",
      "accommodation.rooms",
      "accommodation.reservations",
      "accommodation.stays",
      "accommodation.folio",
      "food_service.tables",
      "food_service.reservations",
      "food_service.orders",
      "food_service.menu",
      "channel.qr_menu",
      "commerce.catalog",
      "commerce.inventory",
      "commerce.sales",
      "commerce.customer_credit",
      "commerce.orders",
      "commerce.wholesale",
      "channel.online_sales",
      "marketing.studio",
      "messaging.campaigns",
      "retail.barcode",
      "retail.purchasing",
      "retail.suppliers",
      "retail.labels"
  };

  String businessName = "Yardımcı Asistan";
  String businessPhone = "";
  String businessWhatsapp = "";
  String pulledAt = "";
  String snapshotUpdatedAt = "";
  long serverRevision;
  int totalRequests;
  int newRequests;
  int pendingRequests;
  int pendingActions;
  int pendingDailyTasks;
  int todayTasks;
  int availableRooms;
  int totalRooms;
  int availableTables;
  int occupiedTables;
  int billWaitingTables;
  int activeTableOrders;
  int pendingReservations;
  int preparedMessages;
  int waitingResponses;
  int customerCount;
  String deviceRole = "staff";
  boolean deviceActive = true;
  boolean sttAvailable;
  boolean permissionsResolved;
  boolean capabilitiesResolved;
  final Set<String> permissions = new HashSet<>();
  final Set<String> businessCapabilities = new HashSet<>();

  final List<RequestRecord> requests = new ArrayList<>();
  final List<CustomerRecord> customers = new ArrayList<>();
  final List<CustomerRoomStayRecord> customerRoomStays = new ArrayList<>();
  final List<RoomFolioRecord> roomFolios = new ArrayList<>();
  final List<ReservationRecord> reservations = new ArrayList<>();
  final List<RoomRecord> rooms = new ArrayList<>();
  final List<TableRecord> tables = new ArrayList<>();
  final List<TaskRecord> tasks = new ArrayList<>();
  final List<MenuCategory> categories = new ArrayList<>();
  final List<MenuItem> menuItems = new ArrayList<>();
  final List<MenuCategory> adminCategories = new ArrayList<>();
  final List<MenuItem> adminMenuItems = new ArrayList<>();
  final List<JSONObject> menuProductCandidates = new ArrayList<>();
  final List<TrackedStockItem> trackedStockItems = new ArrayList<>();
  final Set<String> appliedStockImageHashes = new HashSet<>();
  final List<TableOrder> tableOrders = new ArrayList<>();
  final List<MessageRecord> messages = new ArrayList<>();
  final List<ActionRecord> actions = new ArrayList<>();
  FinanceSnapshot finance = new FinanceSnapshot();
  final Map<String, ReportSnapshot> reports = new HashMap<>();
  MarketSnapshot market = new MarketSnapshot();
  CompanionData companion = new CompanionData();
  KbsSnapshot kbs = new KbsSnapshot();

  static OperationData fromJson(JSONObject root) {
    return fromJson(root, "");
  }

  static OperationData androidCapabilityDisabled() {
    OperationData data = new OperationData();
    data.capabilitiesResolved = true;
    data.permissionsResolved = true;
    data.deviceActive = false;
    return data;
  }

  static OperationData fromJson(JSONObject root, String deviceId) {
    OperationData data = new OperationData();
    data.serverRevision = Math.max(0L, root.optLong("server_revision", 0L));
    boolean messagesIncluded = root.has("messages") && root.optJSONArray("messages") != null;
    JSONObject business = object(root, "business");
    data.businessName = value(business, "display_name", "Yardımcı Asistan");
    data.businessPhone = value(business, "phone", "");
    data.businessWhatsapp = value(business, "whatsapp", data.businessPhone);

    JSONArray businessCapabilities = root.optJSONArray("business_capabilities");
    data.capabilitiesResolved = businessCapabilities != null;
    if (businessCapabilities != null) {
      Set<String> knownCapabilities = new HashSet<>(Arrays.asList(KNOWN_BUSINESS_CAPABILITIES));
      for (int index = 0; index < businessCapabilities.length(); index += 1) {
        String capability = businessCapabilities.optString(index, "").trim();
        if (knownCapabilities.contains(capability)) {
          data.businessCapabilities.add(capability);
        }
      }
    }

    // A snapshot without the persisted capability manifest is invalid and must
    // not repopulate operational data. A manifest that revokes Android is a
    // terminal tombstone even if a malformed payload still carries stale arrays.
    if (!data.capabilitiesResolved) {
      return data;
    }
    if (!data.businessCapabilities.contains("service.android")) {
      data.permissionsResolved = true;
      data.deviceActive = false;
      return data;
    }

    data.applyVoiceProjection(root);
    JSONObject summary = object(root, "summary");
    data.totalRequests = number(summary, "total_requests");
    data.newRequests = number(summary, "new_requests");
    data.pendingRequests = number(summary, "pending_requests");
    data.pendingActions = number(summary, "pending_action_count");
    data.pulledAt = value(summary, "pulled_at", "");
    data.snapshotUpdatedAt = value(summary, "android_snapshot_updated_at", "");

    JSONObject operations = object(root, "operations");
    data.pendingDailyTasks = number(operations, "pending_daily_tasks");
    data.todayTasks = number(operations, "today_tasks");
    data.availableRooms = number(operations, "available_rooms");
    data.totalRooms = number(operations, "total_rooms");
    data.availableTables = number(operations, "available_tables");
    data.occupiedTables = number(operations, "occupied_tables");
    data.billWaitingTables = number(operations, "bill_waiting_tables");
    data.activeTableOrders = number(operations, "active_table_orders");
    data.pendingReservations = number(operations, "pending_reservations");
    data.preparedMessages = number(operations, "prepared_whatsapp_messages");
    data.waitingResponses = number(operations, "waiting_responses");
    data.customerCount = number(operations, "customer_count");

    addRecords(array(root, "requests"), data.requests, RequestRecord::fromJson);
    addRecords(array(root, "customers"), data.customers, CustomerRecord::fromJson);
    addRecords(array(root, "customer_room_stays"), data.customerRoomStays, CustomerRoomStayRecord::fromJson);
    addRecords(array(root, "room_folios"), data.roomFolios, RoomFolioRecord::fromJson);
    addRecords(array(root, "reservations"), data.reservations, ReservationRecord::fromJson);
    addRecords(array(root, "rooms"), data.rooms, RoomRecord::fromJson);
    addRecords(array(root, "tables"), data.tables, TableRecord::fromJson);
    addRecords(array(root, "daily_tasks"), data.tasks, TaskRecord::fromJson);
    addRecords(array(root, "table_orders"), data.tableOrders, TableOrder::fromJson);
    addRecords(array(root, "trackedStockItems"), data.trackedStockItems, TrackedStockItem::fromJson);
    JSONArray appliedHashes = array(root, "appliedStockImageHashes");
    for (int index = 0; index < appliedHashes.length(); index += 1) {
      String hash = appliedHashes.optString(index, "").trim().toLowerCase(java.util.Locale.US);
      if (hash.matches("[a-f0-9]{64}")) {
        data.appliedStockImageHashes.add(hash);
      }
    }
    addRecords(array(root, "messages"), data.messages, MessageRecord::fromJson);
    addRecords(array(root, "actions"), data.actions, ActionRecord::fromJson);
    data.finance = FinanceSnapshot.fromJson(object(root, "finance"));
    data.market = MarketSnapshot.fromJson(object(root, "market"));
    JSONObject reports = root.optJSONObject("reports");
    if (reports != null) {
      for (String preset : new String[] {"today", "yesterday", "last7", "last30"}) {
        JSONObject report = reports.optJSONObject(preset);
        if (report != null) {
          ReportSnapshot parsed = ReportSnapshot.fromJson(report);
          if (!parsed.startDate.isEmpty() && !parsed.endDate.isEmpty()) {
            data.reports.put(preset, parsed);
          }
        }
      }
    }

    JSONObject menu = object(root, "menu");
    addRecords(array(menu, "categories"), data.categories, MenuCategory::fromJson);
    addRecords(array(menu, "items"), data.menuItems, MenuItem::fromJson);
    JSONObject adminMenu = root.optJSONObject("admin_menu");
    if (adminMenu == null) {
      adminMenu = new JSONObject();
    }
    addRecords(array(adminMenu, "categories"), data.adminCategories, MenuCategory::fromJson);
    addRecords(array(adminMenu, "items"), data.adminMenuItems, MenuItem::fromJson);
    JSONArray menuCandidates = array(root, "menu_product_candidates");
    for (int index = 0; index < menuCandidates.length(); index++) {
      JSONObject candidate = menuCandidates.optJSONObject(index);
      if (candidate != null) data.menuProductCandidates.add(candidate);
    }

    data.applyPermissionProfile(root.optJSONObject("androidPermissions"), deviceId);
    if (KbsUiRules.canReadProjection(data)) data.kbs = KbsSnapshot.fromJson(root.optJSONObject("kbs"));
    if (!KbsUiRules.canView(data)) data.actions.removeIf(action -> KbsUiRules.isAction(action.type));
    if (data.hasPermission("customer_credit.view")) {
      JSONArray accounts = array(object(root, "market"), "customer_credit_accounts");
      for (int index = 0; index < Math.min(300, accounts.length()); index++) {
        JSONObject account = accounts.optJSONObject(index);
        if (account != null && !account.optString("customer_id").isEmpty()) data.market.customerCreditAccounts.add(CustomerCreditAccount.fromJson(account));
      }
    }
    data.companion = CompanionData.fromJson(root, data);

    if (!messagesIncluded) {
      for (RequestRecord request : data.requests) {
        String readyMessage = request.readyMessage();
        if (!readyMessage.isEmpty()) {
          MessageRecord message = new MessageRecord();
          message.id = "message_" + request.id;
          message.requestId = request.id;
          message.customerName = request.customerName;
          message.customerPhone = request.customerPhone;
          message.message = readyMessage;
          message.status = "prepared";
          message.updatedAt = request.updatedAt;
          data.messages.add(message);
        }
      }
    }
    return data;
  }

  boolean hasPermission(String permission) {
    return permissionsResolved
        && deviceActive
        && hasBusinessCapability("service.android")
        && permissionAllowedByCapabilities(permission)
        && permissions.contains(permission);
  }

  void applyVoiceProjection(JSONObject response) {
    sttAvailable = Boolean.TRUE.equals(object(response, "voice").opt("stt_available"));
  }

  boolean hasBusinessCapability(String capability) {
    return capabilitiesResolved && businessCapabilities.contains(capability);
  }

  private boolean permissionAllowedByCapabilities(String permission) {
    if (permission == null || permission.isEmpty()) {
      return false;
    }
    if (permission.startsWith("kbs.")) return isAdmin() && hasBusinessCapability("accommodation.rooms") && hasBusinessCapability("accommodation.stays");
    if ("voice.dictation".equals(permission)) return hasBusinessCapability("service.ai");
    if (permission.startsWith("commerce_order.") || "shipment.view".equals(permission)) return hasBusinessCapability("commerce.orders");
    if ("dealer.view".equals(permission)) return hasBusinessCapability("core.customers") && hasBusinessCapability("commerce.orders") && hasBusinessCapability("commerce.wholesale");
    if ("online_sales.view".equals(permission)) return hasBusinessCapability("commerce.orders") && hasBusinessCapability("channel.online_sales");
    if ("marketing.status.view".equals(permission)) return hasBusinessCapability("marketing.studio");
    if ("room_folio.add_menu_item".equals(permission)) {
      return hasBusinessCapability("accommodation.folio") && hasBusinessCapability("accommodation.stays")
          && hasBusinessCapability("food_service.menu");
    }
    if ("room_folio.add_manual_charge".equals(permission)) {
      return hasBusinessCapability("accommodation.folio") && hasBusinessCapability("accommodation.stays");
    }
    if (permission.startsWith("room_folio.")) {
      return hasBusinessCapability("accommodation.folio");
    }
    if ("room.assign_customer".equals(permission)) {
      return hasBusinessCapability("core.customers")
          && hasBusinessCapability("accommodation.stays");
    }
    if (permission.startsWith("room.")) {
      return hasBusinessCapability("accommodation.rooms");
    }
    if ("table_order.add_item".equals(permission)) {
      return hasBusinessCapability("food_service.orders")
          && hasBusinessCapability("food_service.menu");
    }
    if (permission.startsWith("table_order.")) {
      return hasBusinessCapability("food_service.orders");
    }
    if (permission.startsWith("table.")) {
      return hasBusinessCapability("food_service.tables");
    }
    if (permission.startsWith("menu.stock_")) {
      return hasBusinessCapability("food_service.menu")
          && hasBusinessCapability("commerce.inventory");
    }
    if (permission.startsWith("menu.")) {
      return hasBusinessCapability("food_service.menu");
    }
    if (permission.startsWith("reservation.")) {
      return hasAnyReservationCapability();
    }
    if ("customer.convert_to_reservation".equals(permission)) {
      return hasBusinessCapability("core.customers")
          && hasBusinessCapability("customer.requests")
          && hasAnyReservationCapability();
    }
    if ("customer.respond".equals(permission)
        || "customer.mark_answered".equals(permission)
        || "customer.reject".equals(permission)
        || permission.startsWith("request.")) {
      return hasBusinessCapability("core.customers")
          && hasBusinessCapability("customer.requests");
    }
    if (permission.startsWith("customer.")) {
      return hasBusinessCapability("core.customers");
    }
    if (permission.startsWith("daily_task.")) {
      return hasBusinessCapability("core.tasks");
    }
    if (permission.startsWith("finance.")) {
      return hasBusinessCapability("core.finance");
    }
    if (permission.startsWith("settings.") || permission.startsWith("android_devices.")) {
      return hasBusinessCapability("core.devices");
    }
    if ("message.delete".equals(permission)) {
      return hasBusinessCapability("core.customers")
          && hasBusinessCapability("service.whatsapp");
    }
    if ("market.summary.view".equals(permission)) {
      return hasAnyMarketCapability();
    }
    if ("market.product.view".equals(permission) || "market.product_create".equals(permission)) {
      return hasBusinessCapability("commerce.catalog");
    }
    if ("market.stock_count".equals(permission)) {
      return hasBusinessCapability("commerce.inventory");
    }
    if ("market.receiving".equals(permission)) {
      return hasBusinessCapability("retail.purchasing");
    }
    if ("market.cart_draft".equals(permission)) {
      return hasBusinessCapability("commerce.catalog")
          && hasBusinessCapability("commerce.sales");
    }
    if ("market.scan_to_desktop".equals(permission)) {
      return hasBusinessCapability("commerce.catalog")
          && hasBusinessCapability("commerce.sales")
          && hasBusinessCapability("retail.barcode");
    }
    if ("market.sale.complete".equals(permission)) {
      return MarketUiRules.hasRetailWorkspaceCapability(this) && hasBusinessCapability("commerce.catalog") && hasBusinessCapability("commerce.sales");
    }
    if ("customer_credit.view".equals(permission) || "customer_credit.payment".equals(permission)) {
      return MarketUiRules.hasRetailWorkspaceCapability(this) && hasBusinessCapability("commerce.customer_credit")
          && hasBusinessCapability("commerce.catalog") && hasBusinessCapability("commerce.sales")
          && hasBusinessCapability("core.customers") && hasBusinessCapability("core.finance");
    }
    return false;
  }

  boolean hasAnyReservationCapability() {
    return hasBusinessCapability("accommodation.reservations")
        || hasBusinessCapability("food_service.reservations");
  }

  boolean hasAnyMarketCapability() {
    return hasBusinessCapability("commerce.catalog")
        || hasBusinessCapability("commerce.inventory")
        || hasBusinessCapability("commerce.sales")
        || hasBusinessCapability("retail.barcode")
        || hasBusinessCapability("retail.purchasing")
        || hasBusinessCapability("retail.suppliers");
  }

  boolean isAdmin() {
    return permissionsResolved
        && deviceActive
        && hasBusinessCapability("service.android")
        && "admin".equals(deviceRole);
  }

  String deviceRoleLabel() {
    if (!permissionsResolved) {
      return "Personel (atanıyor)";
    }
    return "admin".equals(deviceRole) ? "Yönetici" : "Personel";
  }

  private void applyPermissionProfile(JSONObject profiles, String deviceId) {
    String normalizedDeviceId = deviceId == null ? "" : deviceId.trim();
    if (profiles == null || normalizedDeviceId.isEmpty()) {
      return;
    }
    JSONObject profile = profiles.optJSONObject(normalizedDeviceId);
    if (profile == null) {
      return;
    }

    applyPermissionProfile(profile);
  }

  void applyPermissionProfile(JSONObject profile) {
    if (profile == null) {
      return;
    }
    permissionsResolved = true;
    deviceRole = "admin".equals(value(profile, "role", "staff")) ? "admin" : "staff";
    deviceActive = profile.optBoolean("is_active", false);
    permissions.clear();
    JSONArray profilePermissions = profile.optJSONArray("permissions");
    if (profilePermissions == null) {
      companion.redact(this);
      return;
    }
    Set<String> allowed = new HashSet<>(Arrays.asList(ALL_PERMISSIONS));
    for (int index = 0; index < profilePermissions.length(); index += 1) {
      String permission = profilePermissions.optString(index, "").trim();
      if (allowed.contains(permission) && (!permission.startsWith("kbs.") || "admin".equals(deviceRole))) {
        permissions.add(permission);
      }
    }
    companion.redact(this);
    if (!KbsUiRules.canReadProjection(this)) {
      kbs = new KbsSnapshot();
      actions.removeIf(action -> KbsUiRules.isAction(action.type));
    }
  }

  TableOrder activeOrderForTable(String tableId) {
    for (TableOrder order : tableOrders) {
      if (tableId.equals(order.tableId) && order.isActive()) {
        return order;
      }
    }
    return null;
  }

  RequestRecord requestById(String requestId) {
    for (RequestRecord request : requests) {
      if (requestId.equals(request.id)) {
        return request;
      }
    }
    return null;
  }

  ReservationRecord reservationById(String reservationId) {
    for (ReservationRecord reservation : reservations) {
      if (reservationId.equals(reservation.id)) {
        return reservation;
      }
    }
    return null;
  }

  TaskRecord taskById(String taskId) {
    for (TaskRecord task : tasks) {
      if (taskId.equals(task.id)) {
        return task;
      }
    }
    return null;
  }

  CustomerRecord customerById(String customerId) {
    for (CustomerRecord customer : customers) {
      if (customerId.equals(customer.id)) {
        return customer;
      }
    }
    return null;
  }

  CustomerRoomStayRecord activeStayForRoom(String roomId) {
    for (CustomerRoomStayRecord stay : customerRoomStays) {
      if (roomId.equals(stay.roomId) && stay.isActive()) {
        return stay;
      }
    }
    return null;
  }

  List<CustomerRoomStayRecord> staysForCustomer(String customerId) {
    ArrayList<CustomerRoomStayRecord> result = new ArrayList<>();
    for (CustomerRoomStayRecord stay : customerRoomStays) {
      if (customerId.equals(stay.customerId)) {
        result.add(stay);
      }
    }
    return result;
  }

  String categoryName(String categoryId) {
    for (MenuCategory category : categories) {
      if (categoryId.equals(category.id)) {
        return category.name;
      }
    }
    return "Menü";
  }

  String adminCategoryName(String categoryId) {
    for (MenuCategory category : adminCategories) {
      if (categoryId.equals(category.id)) {
        return category.name;
      }
    }
    return "Menü";
  }

  MenuItem menuItemById(String menuItemId) {
    for (MenuItem item : menuItems) {
      if (menuItemId.equals(item.id)) {
        return item;
      }
    }
    return null;
  }

  ReportSnapshot report(String preset) {
    return reports.get(preset == null ? "" : preset);
  }

  interface JsonParser<T> {
    T parse(JSONObject value);
  }

  private static <T> void addRecords(JSONArray source, List<T> target, JsonParser<T> parser) {
    for (int index = 0; index < source.length(); index += 1) {
      JSONObject value = source.optJSONObject(index);
      if (value != null) {
        target.add(parser.parse(value));
      }
    }
  }

  static JSONObject object(JSONObject source, String key) {
    JSONObject result = source.optJSONObject(key);
    return result == null ? new JSONObject() : result;
  }

  static JSONArray array(JSONObject source, String key) {
    JSONArray result = source.optJSONArray(key);
    return result == null ? new JSONArray() : result;
  }

  static String value(JSONObject source, String key, String fallback) {
    String result = source.optString(key, fallback);
    return result == null ? fallback : result.trim();
  }

  static int number(JSONObject source, String key) {
    return Math.max(0, source.optInt(key, 0));
  }

  static double decimal(JSONObject source, String key) {
    return Math.max(0, source.optDouble(key, 0));
  }

  static double positiveDecimal(JSONObject source, String key, double fallback) {
    double value = source.optDouble(key, fallback);
    return Double.isFinite(value) && value > 0 ? value : fallback;
  }

  static Double nullableDecimal(JSONObject source, String key) {
    if (!source.has(key) || source.isNull(key)) {
      return null;
    }
    double value = source.optDouble(key, Double.NaN);
    return Double.isFinite(value) && value >= 0 ? value : null;
  }

  static List<String> strings(JSONObject source, String key) {
    ArrayList<String> values = new ArrayList<>();
    JSONArray sourceValues = source.optJSONArray(key);
    if (sourceValues == null) {
      return values;
    }
    for (int index = 0; index < sourceValues.length(); index += 1) {
      String value = sourceValues.optString(index, "").trim();
      if (!value.isEmpty()) {
        values.add(value);
      }
    }
    return values;
  }

  static final class MarketSnapshot {
    String primaryLocationId = "";
    final List<CustomerCreditAccount> customerCreditAccounts = new ArrayList<>();
    MarketProductDataSettings productData = new MarketProductDataSettings();
    MarketSummary summary = new MarketSummary();
    final List<MarketProduct> products = new ArrayList<>();
    final List<MarketSupplier> suppliers = new ArrayList<>();
    final List<MarketPurchase> recentPurchases = new ArrayList<>();
    final List<MarketCartDraft> cartDrafts = new ArrayList<>();

    static MarketSnapshot fromJson(JSONObject source) {
      MarketSnapshot market = new MarketSnapshot();
      market.primaryLocationId = value(source, "primary_location_id", "");
      market.productData = MarketProductDataSettings.fromJson(object(source, "product_data"));
      market.summary = MarketSummary.fromJson(object(source, "summary"));
      addRecords(array(source, "products"), market.products, MarketProduct::fromJson);
      addRecords(array(source, "suppliers"), market.suppliers, MarketSupplier::fromJson);
      addRecords(array(source, "recent_purchases"), market.recentPurchases, MarketPurchase::fromJson);
      addRecords(array(source, "cart_drafts"), market.cartDrafts, MarketCartDraft::fromJson);
      return market;
    }
  }

  static final class MarketProductDataSettings {
    boolean enabled;
    String provider = "open_food_facts";
    boolean autoSearchUnknownBarcode;
    boolean includeImages;

    static MarketProductDataSettings fromJson(JSONObject source) {
      MarketProductDataSettings settings = new MarketProductDataSettings();
      settings.enabled = source.optBoolean("enabled", false);
      settings.provider = value(source, "provider", "open_food_facts");
      settings.autoSearchUnknownBarcode = source.optBoolean("auto_search_unknown_barcode", false);
      settings.includeImages = source.optBoolean("include_images", false);
      return settings;
    }
  }

  static final class MarketSummary {
    int todaySaleCount;
    double todaySalesTotal;
    String currency = "TRY";
    int criticalStockCount;
    int recentReceivingCount;
    final List<MarketStockAdjustment> recentStockAdjustments = new ArrayList<>();

    static MarketSummary fromJson(JSONObject source) {
      MarketSummary summary = new MarketSummary();
      summary.todaySaleCount = number(source, "today_sale_count");
      summary.todaySalesTotal = decimal(source, "today_sales_total");
      summary.currency = value(source, "currency", "TRY");
      summary.criticalStockCount = number(source, "critical_stock_count");
      summary.recentReceivingCount = number(source, "recent_receiving_count");
      addRecords(array(source, "recent_stock_adjustments"), summary.recentStockAdjustments, MarketStockAdjustment::fromJson);
      return summary;
    }
  }

  static final class MarketStockAdjustment {
    String id = "";
    String productId = "";
    String productName = "Ürün";
    String type = "count";
    double quantityDelta;
    double quantityAfter;
    String note = "";
    String createdAt = "";

    static MarketStockAdjustment fromJson(JSONObject source) {
      MarketStockAdjustment adjustment = new MarketStockAdjustment();
      adjustment.id = value(source, "id", "");
      adjustment.productId = value(source, "product_id", "");
      adjustment.productName = value(source, "product_name", "Ürün");
      adjustment.type = "adjust".equals(value(source, "type", "count")) ? "adjust" : "count";
      adjustment.quantityDelta = source.optDouble("quantity_delta", 0);
      adjustment.quantityAfter = decimal(source, "quantity_after");
      adjustment.note = value(source, "note", "");
      adjustment.createdAt = value(source, "created_at", "");
      return adjustment;
    }
  }

  static final class MarketProduct {
    String id = "";
    String name = "Ürün";
    String sku = "";
    String barcode = "";
    String unit = "piece";
    double salePrice;
    String currency = "TRY";
    boolean active;
    boolean trackInventory;
    double currentQuantity;
    double minimumQuantity;
    String inventoryUpdatedAt = "";
    String updatedAt = "";
    String imageSourceUrl = "";
    String dataSource = "";

    static MarketProduct fromJson(JSONObject source) {
      MarketProduct product = new MarketProduct();
      product.id = value(source, "id", "");
      product.name = value(source, "name", "Ürün");
      product.sku = value(source, "sku", "");
      product.barcode = value(source, "barcode", "");
      product.unit = value(source, "unit", "piece");
      product.salePrice = decimal(source, "sale_price");
      product.currency = value(source, "currency", "TRY");
      product.active = source.optBoolean("is_active", false);
      product.trackInventory = source.optBoolean("track_inventory", false);
      product.currentQuantity = decimal(source, "current_quantity");
      product.minimumQuantity = decimal(source, "minimum_quantity");
      product.inventoryUpdatedAt = value(source, "inventory_updated_at", "");
      product.updatedAt = value(source, "updated_at", "");
      product.imageSourceUrl = value(source, "image_source_url", "");
      product.dataSource = value(source, "data_source", "");
      return product;
    }
  }

  static final class CustomerCreditAccount {
    String customerId = "";
    String fullName = "Müşteri";
    final List<CreditBalance> balances = new ArrayList<>();
    final List<CreditMovement> entries = new ArrayList<>();
    static CustomerCreditAccount fromJson(JSONObject source) {
      CustomerCreditAccount account = new CustomerCreditAccount();
      account.customerId = value(source, "customer_id", "");
      account.fullName = value(source, "full_name", "Müşteri");
      JSONArray balances = array(source, "balances");
      for (int i = 0; i < Math.min(10, balances.length()); i++) {
        JSONObject raw = balances.optJSONObject(i);
        if (raw == null || !raw.optString("currency").matches("[A-Z]{3}")) continue;
        long amount = raw.optLong("amount_minor", -1);
        if (amount < 0 || amount > 999999999999L) continue;
        CreditBalance balance = new CreditBalance();
        balance.currency = raw.optString("currency"); balance.amountMinor = amount;
        account.balances.add(balance);
      }
      JSONArray entries = array(source, "entries");
      for (int i = 0; i < Math.min(10, entries.length()); i++) {
        JSONObject raw = entries.optJSONObject(i);
        if (raw == null) continue;
        CreditMovement entry = new CreditMovement();
        entry.direction = value(raw, "direction", ""); entry.entryType = value(raw, "entry_type", "");
        entry.amountMinor = raw.optLong("amount_minor", 0); entry.currency = value(raw, "currency", "");
        entry.paymentMethod = value(raw, "payment_method", ""); entry.occurredAt = value(raw, "occurred_at", "");
        if (entry.amountMinor > 0 && entry.amountMinor <= 999999999999L && entry.currency.matches("[A-Z]{3}")) account.entries.add(entry);
      }
      return account;
    }
  }

  static final class CreditBalance { String currency = ""; long amountMinor; }
  static final class CreditMovement {
    String direction = "", entryType = "", currency = "", paymentMethod = "", occurredAt = "";
    long amountMinor;
  }

  static final class MarketSupplier {
    String id = "";
    String name = "Tedarikçi";
    boolean active;

    static MarketSupplier fromJson(JSONObject source) {
      MarketSupplier supplier = new MarketSupplier();
      supplier.id = value(source, "id", "");
      supplier.name = value(source, "name", "Tedarikçi");
      supplier.active = source.optBoolean("is_active", false);
      return supplier;
    }
  }

  static final class MarketPurchase {
    String id = "";
    String supplierId = "";
    String supplierName = "";
    String status = "received";
    String receivedAt = "";
    double total;
    String currency = "TRY";
    int lineCount;

    static MarketPurchase fromJson(JSONObject source) {
      MarketPurchase purchase = new MarketPurchase();
      purchase.id = value(source, "id", "");
      purchase.supplierId = value(source, "supplier_id", "");
      purchase.supplierName = value(source, "supplier_name", "");
      purchase.status = value(source, "status", "received");
      purchase.receivedAt = value(source, "received_at", "");
      purchase.total = decimal(source, "total");
      purchase.currency = value(source, "currency", "TRY");
      purchase.lineCount = number(source, "line_count");
      return purchase;
    }
  }

  static final class MarketCartDraftLine {
    String id = "";
    String productId = "";
    String productName = "Ürün";
    double quantity;

    static MarketCartDraftLine fromJson(JSONObject source) {
      MarketCartDraftLine line = new MarketCartDraftLine();
      line.id = value(source, "id", "");
      line.productId = value(source, "product_id", "");
      line.productName = value(source, "product_name", "Ürün");
      line.quantity = decimal(source, "quantity");
      return line;
    }
  }

  static final class MarketCartDraft {
    String id = "";
    String status = "pending";
    String source = "";
    String createdByDevice = "";
    String note = "";
    String createdAt = "";
    String updatedAt = "";
    final List<MarketCartDraftLine> lines = new ArrayList<>();

    static MarketCartDraft fromJson(JSONObject source) {
      MarketCartDraft draft = new MarketCartDraft();
      draft.id = value(source, "id", "");
      draft.status = "reviewed".equals(value(source, "status", "pending")) ? "reviewed" : "pending";
      draft.source = value(source, "source", "");
      draft.createdByDevice = value(source, "created_by_device", "");
      draft.note = value(source, "note", "");
      draft.createdAt = value(source, "created_at", "");
      draft.updatedAt = value(source, "updated_at", "");
      addRecords(array(source, "lines"), draft.lines, MarketCartDraftLine::fromJson);
      return draft;
    }
  }

  static final class RequestRecord {
    String id = "";
    String customerId = "";
    String type = "general_info";
    String status = "new";
    String customerName = "Misafir";
    String customerPhone = "";
    String dateText = "";
    String startDate = "";
    String endDate = "";
    String time = "";
    int guestCount;
    String message = "";
    String aiSummary = "";
    String aiSuggestedReply = "";
    String whatsappMessage = "";
    String priority = "normal";
    String createdAt = "";
    String updatedAt = "";

    static RequestRecord fromJson(JSONObject source) {
      RequestRecord record = new RequestRecord();
      record.id = value(source, "id", "");
      record.customerId = value(source, "customer_id", "");
      record.type = value(source, "request_type", "general_info");
      record.status = value(source, "status", "new");
      record.customerName = value(source, "customer_name", "Misafir");
      record.customerPhone = value(source, "customer_phone", "");
      record.dateText = value(source, "date_text", "");
      record.startDate = value(source, "start_date", "");
      record.endDate = value(source, "end_date", "");
      record.time = value(source, "time", "");
      record.guestCount = number(source, "guest_count");
      record.message = value(source, "message", "");
      record.aiSummary = value(source, "ai_summary", "");
      record.aiSuggestedReply = value(source, "ai_suggested_reply", "");
      record.whatsappMessage = value(source, "whatsapp_message", "");
      record.priority = value(source, "priority", "normal");
      record.createdAt = value(source, "created_at", "");
      record.updatedAt = value(source, "updated_at", "");
      return record;
    }

    String readyMessage() {
      return !aiSuggestedReply.isEmpty() ? aiSuggestedReply : whatsappMessage;
    }

    boolean waitingForResponse() {
      return "new".equals(status) || "seen".equals(status) || "waiting_owner".equals(status);
    }
  }

  static final class CustomerRecord {
    String id = "";
    String fullName = "";
    String phone = "";
    String email = "";
    String notes = "";
    String identityType = "";
    String identityNumber = "";
    String nationality = "";
    String birthDate = "";
    String gender = "";
    String documentSerialNumber = "";
    String documentExpiryDate = "";
    String birthPlace = "";
    String motherName = "";
    String fatherName = "";
    String issuingAuthority = "";
    String address = "";
    int requestCount;
    int reservationCount;
    int stayCount;
    String updatedAt = "";

    static CustomerRecord fromJson(JSONObject source) {
      CustomerRecord record = new CustomerRecord();
      record.id = value(source, "id", "");
      record.fullName = value(source, "full_name", "Misafir");
      record.phone = value(source, "phone", "");
      record.email = value(source, "email", "");
      record.notes = value(source, "notes", "");
      record.identityType = value(source, "identity_type", "");
      record.identityNumber = "";
      record.nationality = value(source, "nationality", "");
      record.birthDate = value(source, "birth_date", "");
      record.gender = value(source, "gender", "");
      record.documentSerialNumber = "";
      record.documentExpiryDate = value(source, "document_expiry_date", "");
      record.birthPlace = value(source, "birth_place", "");
      record.motherName = value(source, "mother_name", "");
      record.fatherName = value(source, "father_name", "");
      record.issuingAuthority = value(source, "issuing_authority", "");
      record.address = value(source, "address", "");
      record.requestCount = number(source, "request_count");
      record.reservationCount = number(source, "reservation_count");
      record.stayCount = number(source, "stay_count");
      record.updatedAt = value(source, "updated_at", "");
      return record;
    }
  }

  static final class CustomerRoomStayRecord {
    String id = "";
    String customerId = "";
    String customerName = "Misafir";
    String customerPhone = "";
    String roomId = "";
    String roomName = "Oda";
    String roomNumber = "";
    String reservationId = "";
    String status = "planned";
    String checkInDate = "";
    String checkOutDate = "";
    int guestCount = 1;
    String notes = "";
    String source = "";
    String checkedInAt = "";
    String checkedOutAt = "";
    String createdAt = "";
    String updatedAt = "";

    static CustomerRoomStayRecord fromJson(JSONObject source) {
      CustomerRoomStayRecord record = new CustomerRoomStayRecord();
      record.id = value(source, "id", "");
      record.customerId = value(source, "customer_id", "");
      record.customerName = value(source, "customer_name", "Misafir");
      record.customerPhone = value(source, "customer_phone", "");
      record.roomId = value(source, "room_id", "");
      record.roomName = value(source, "room_name", "Oda");
      record.roomNumber = value(source, "room_number", "");
      record.reservationId = value(source, "reservation_id", "");
      record.status = value(source, "status", "planned");
      record.checkInDate = value(source, "check_in_date", "");
      record.checkOutDate = value(source, "check_out_date", "");
      record.guestCount = Math.max(1, number(source, "guest_count"));
      record.notes = value(source, "notes", "");
      record.source = value(source, "source", "");
      record.checkedInAt = value(source, "checked_in_at", "");
      record.checkedOutAt = value(source, "checked_out_at", "");
      record.createdAt = value(source, "created_at", "");
      record.updatedAt = value(source, "updated_at", "");
      return record;
    }

    boolean isActive() {
      return "planned".equals(status) || "checked_in".equals(status);
    }
  }

  static final class ReservationRecord {
    String id = "";
    String requestId = "";
    String customerId = "";
    String customerName = "Misafir";
    String customerPhone = "";
    String type = "";
    String status = "pending";
    String title = "Rezervasyon";
    String startDate = "";
    String endDate = "";
    String time = "";
    int guestCount;
    List<String> roomIds = new ArrayList<>();
    List<String> tableIds = new ArrayList<>();
    String notes = "";
    String paymentStatus = "";
    String updatedAt = "";

    static ReservationRecord fromJson(JSONObject source) {
      ReservationRecord record = new ReservationRecord();
      record.id = value(source, "id", "");
      record.requestId = value(source, "request_id", "");
      record.customerId = value(source, "customer_id", "");
      record.customerName = value(source, "customer_name", "Misafir");
      record.customerPhone = value(source, "customer_phone", "");
      record.type = value(source, "reservation_type", "");
      record.status = value(source, "status", "pending");
      record.title = value(source, "title", "Rezervasyon");
      record.startDate = value(source, "start_date", "");
      record.endDate = value(source, "end_date", "");
      record.time = value(source, "time", "");
      record.guestCount = number(source, "guest_count");
      record.roomIds = strings(source, "room_ids");
      record.tableIds = strings(source, "table_ids");
      record.notes = value(source, "notes", "");
      record.paymentStatus = value(source, "payment_status", "");
      record.updatedAt = value(source, "updated_at", "");
      return record;
    }
  }

  static final class RoomRecord {
    String id = "";
    String name = "Oda";
    String number = "";
    int capacity;
    String status = "available";
    String activeReservation = "";
    String updatedAt = "";

    static RoomRecord fromJson(JSONObject source) {
      RoomRecord record = new RoomRecord();
      record.id = value(source, "id", "");
      record.name = value(source, "name", "Oda");
      record.number = value(source, "number", "");
      record.capacity = number(source, "capacity");
      record.status = value(source, "status", "available");
      record.activeReservation = value(source, "active_reservation_title", "");
      record.updatedAt = value(source, "updated_at", "");
      return record;
    }
  }

  static final class TableRecord {
    String id = "";
    String name = "Masa";
    String area = "";
    int capacity;
    String status = "available";
    String activeReservation = "";
    String updatedAt = "";

    static TableRecord fromJson(JSONObject source) {
      TableRecord record = new TableRecord();
      record.id = value(source, "id", "");
      record.name = value(source, "name", "Masa");
      record.area = value(source, "area", "");
      record.capacity = number(source, "capacity");
      record.status = value(source, "status", "available");
      record.activeReservation = value(source, "active_reservation_title", "");
      record.updatedAt = value(source, "updated_at", "");
      return record;
    }
  }

  static final class TaskRecord {
    String id = "";
    String title = "Günlük iş";
    String description = "";
    String type = "";
    String status = "pending";
    String dueDate = "";
    String dueTime = "";
    String relatedType = "";
    String relatedId = "";
    String relatedReservationType = "";
    String updatedAt = "";

    static TaskRecord fromJson(JSONObject source) {
      TaskRecord record = new TaskRecord();
      record.id = value(source, "id", "");
      record.title = value(source, "title", "Günlük iş");
      record.description = value(source, "description", "");
      record.type = value(source, "task_type", "");
      record.status = value(source, "status", "pending");
      record.dueDate = value(source, "due_date", "");
      record.dueTime = value(source, "due_time", "");
      record.relatedType = value(source, "related_type", "");
      record.relatedId = value(source, "related_id", "");
      record.relatedReservationType = value(source, "related_reservation_type", "");
      record.updatedAt = value(source, "updated_at", "");
      return record;
    }
  }

  static final class MenuCategory {
    String id = "";
    String name = "Menü";
    boolean active = true;
    String updatedAt = "";

    static MenuCategory fromJson(JSONObject source) {
      MenuCategory record = new MenuCategory();
      record.id = value(source, "id", "");
      record.name = value(source, "name", "Menü");
      record.active = source.optBoolean("is_active", true);
      record.updatedAt = value(source, "updated_at", "");
      return record;
    }
  }

  static final class MenuItem {
    String id = "";
    String productId = "";
    Double priceOverride;
    String categoryId = "";
    String name = "Ürün";
    String description = "";
    double price;
    String currency = "TRY";
    boolean available = true;
    boolean productActive = true;
    boolean featured;
    JSONArray allergens = new JSONArray();
    JSONArray tags = new JSONArray();
    int sortOrder;
    Double stockQuantity;
    Double stockMinQuantity;
    String stockUnit = "piece";
    double stockConsumptionQuantity = 1;
    boolean hideWhenOutOfStock;
    String updatedAt = "";

    static MenuItem fromJson(JSONObject source) {
      MenuItem record = new MenuItem();
      record.id = value(source, "id", "");
      record.productId = value(source, "product_id", "");
      record.priceOverride = nullableDecimal(source, "price_override");
      record.categoryId = value(source, "category_id", "");
      record.name = value(source, "name", "Ürün");
      record.description = value(source, "description", "");
      record.price = decimal(source, "price");
      record.currency = value(source, "currency", "TRY");
      record.available = source.optBoolean("is_available", true);
      record.productActive = source.optBoolean("product_is_active", true);
      record.featured = source.optBoolean("is_featured", false);
      record.allergens = source.optJSONArray("allergens") == null ? new JSONArray() : source.optJSONArray("allergens");
      record.tags = source.optJSONArray("tags") == null ? new JSONArray() : source.optJSONArray("tags");
      record.sortOrder = source.optInt("sort_order", 0);
      record.stockQuantity = nullableDecimal(source, "stock_quantity");
      record.stockMinQuantity = nullableDecimal(source, "stock_min_quantity");
      record.stockUnit = value(source, "stock_unit", "piece");
      record.stockConsumptionQuantity = positiveDecimal(source, "stock_consumption_quantity", 1);
      record.hideWhenOutOfStock = source.optBoolean("hide_when_out_of_stock", false);
      record.updatedAt = value(source, "updated_at", "");
      return record;
    }

    boolean outOfStock() {
      return stockQuantity != null && stockQuantity < stockConsumptionQuantity;
    }
  }

  static final class TrackedStockItem {
    String productId = "";
    String menuEntryId = "";
    String name = "Ürün";
    String category = "Menü";
    double price;
    double stockQuantity;
    Double stockMinQuantity;
    String stockUnit = "piece";
    double stockConsumptionQuantity = 1;
    boolean hideWhenOutOfStock;
    String stockStatus = "in_stock";

    static TrackedStockItem fromJson(JSONObject source) {
      TrackedStockItem record = new TrackedStockItem();
      record.productId = value(source, "product_id", "");
      record.menuEntryId = value(source, "menu_entry_id", "");
      record.name = value(source, "name", "Ürün");
      record.category = value(source, "category", "Menü");
      record.price = decimal(source, "price");
      record.stockQuantity = decimal(source, "stock_quantity");
      record.stockMinQuantity = nullableDecimal(source, "stock_min_quantity");
      record.stockUnit = value(source, "stock_unit", "piece");
      record.stockConsumptionQuantity = positiveDecimal(source, "stock_consumption_quantity", 1);
      record.hideWhenOutOfStock = source.optBoolean("hide_when_out_of_stock", false);
      record.stockStatus = value(source, "stock_status", record.derivedStatus());
      if (!"out_of_stock".equals(record.stockStatus)
          && !"low_stock".equals(record.stockStatus)
          && !"in_stock".equals(record.stockStatus)) {
        record.stockStatus = record.derivedStatus();
      }
      return record;
    }

    String derivedStatus() {
      if (stockQuantity < stockConsumptionQuantity) {
        return "out_of_stock";
      }
      if (stockMinQuantity != null && stockQuantity <= stockMinQuantity) {
        return "low_stock";
      }
      return "in_stock";
    }
  }

  static final class TableOrderItem {
    String id = "";
    String orderId = "";
    String productId = "";
    String menuEntryId = "";
    String productName = "Ürün";
    double unitPrice;
    String currency = "TRY";
    int quantity = 1;
    double lineTotal;
    String status = "open";
    String updatedAt = "";

    static TableOrderItem fromJson(JSONObject source) {
      TableOrderItem record = new TableOrderItem();
      record.id = value(source, "id", "");
      record.orderId = value(source, "order_id", "");
      record.productId = value(source, "product_id", "");
      record.menuEntryId = value(source, "menu_entry_id", "");
      record.productName = value(source, "product_name", "Ürün");
      record.unitPrice = decimal(source, "unit_price");
      record.currency = value(source, "currency", "TRY");
      record.quantity = Math.max(1, number(source, "quantity"));
      record.lineTotal = decimal(source, "line_total");
      record.status = value(source, "status", "open");
      record.updatedAt = value(source, "updated_at", "");
      return record;
    }
  }

  static final class TableOrder {
    String id = "";
    String tableId = "";
    String tableName = "Masa";
    String status = "open";
    String openedAt = "";
    double total;
    int itemCount;
    String updatedAt = "";
    final List<TableOrderItem> items = new ArrayList<>();

    static TableOrder fromJson(JSONObject source) {
      TableOrder record = new TableOrder();
      record.id = value(source, "id", "");
      record.tableId = value(source, "table_id", "");
      record.tableName = value(source, "table_name", "Masa");
      record.status = value(source, "status", "open");
      record.openedAt = value(source, "opened_at", "");
      record.total = decimal(source, "total");
      record.itemCount = number(source, "item_count");
      record.updatedAt = value(source, "updated_at", "");
      addRecords(array(source, "items"), record.items, TableOrderItem::fromJson);
      return record;
    }

    boolean isActive() {
      return "open".equals(status) || "preparing".equals(status) || "served".equals(status) || "payment".equals(status);
    }
  }

  static final class MessageRecord {
    String id = "";
    String requestId = "";
    String customerName = "Misafir";
    String customerPhone = "";
    String message = "";
    String status = "prepared";
    String updatedAt = "";

    static MessageRecord fromJson(JSONObject source) {
      MessageRecord record = new MessageRecord();
      record.id = value(source, "id", "");
      record.requestId = value(source, "request_id", "");
      record.customerName = value(source, "customer_name", "Misafir");
      record.customerPhone = value(source, "customer_phone", "");
      record.message = value(source, "message", "");
      record.status = value(source, "status", "prepared");
      record.updatedAt = value(source, "updated_at", "");
      return record;
    }
  }

  static final class ActionRecord {
    String notificationId = "";
    String id = "";
    String type = "";
    String status = "pending";
    String errorMessage = "";
    String taskType = "";
    String orderId = "";
    String expectedUpdatedAt = "";
    String expectedStatus = "";
    String createdAt = "";
    String processedAt = "";

    static ActionRecord fromJson(JSONObject source) {
      ActionRecord record = new ActionRecord();
      record.id = value(source, "id", "");
      record.type = value(source, "action_type", "");
      record.status = value(source, "status", "pending");
      record.errorMessage = value(source, "error_message", "");
      JSONObject payload = source.optJSONObject("payload");
      record.notificationId = payload == null ? "" : value(payload, "notification_id", "");
      record.taskType = payload == null ? "" : value(payload, "task_type", "");
      record.orderId = payload == null ? "" : value(payload, "order_id", "");
      record.expectedUpdatedAt = payload == null ? "" : value(payload, "expected_updated_at", "");
      record.expectedStatus = payload == null ? "" : value(payload, "expected_status", "");
      record.createdAt = value(source, "created_at", "");
      record.processedAt = value(source, "processed_at", "");
      return record;
    }
  }

  static final class KbsSnapshot {
    boolean enabled;
    boolean configured;
    String provider = "";
    int pendingCount, failedCount, unknownCount, sentCount, identityReadyCount, identityMissingCount;
    final List<KbsNotification> notifications = new ArrayList<>();
    static KbsSnapshot fromJson(JSONObject source) {
      KbsSnapshot result = new KbsSnapshot();
      if (source == null || !Boolean.TRUE.equals(source.opt("enabled"))
          || !Arrays.asList("egm", "jandarma").contains(source.optString("provider"))) return result;
      result.enabled = true;
      result.configured = Boolean.TRUE.equals(source.opt("configured"));
      result.provider = source.optString("provider");
      result.pendingCount = Math.max(0, source.optInt("pending_count"));
      result.failedCount = Math.max(0, source.optInt("failed_count"));
      result.unknownCount = Math.max(0, source.optInt("submission_unknown_count"));
      result.sentCount = Math.max(0, source.optInt("sent_count"));
      result.identityReadyCount = Math.max(0, source.optInt("identity_ready_count"));
      result.identityMissingCount = Math.max(0, source.optInt("identity_missing_count"));
      JSONArray rows = source.optJSONArray("notifications");
      if (rows != null) for (int i = 0; i < Math.min(500, rows.length()); i++) {
        JSONObject row = rows.optJSONObject(i);
        if (row == null || !(row.opt("id") instanceof String) || row.optString("id").trim().isEmpty()
            || !Arrays.asList("arrival", "departure", "room_change").contains(row.optString("kind"))
            || !Arrays.asList("pending", "failed", "submission_unknown", "sent").contains(row.optString("status"))) continue;
        KbsNotification record = new KbsNotification();
        record.id = bounded(row, "id", 180); record.customerName = bounded(row, "customer_name", 160);
        record.roomName = bounded(row, "room_name", 120); record.roomNumber = bounded(row, "room_number", 40);
        record.occurredAt = bounded(row, "occurred_at", 80); record.kind = row.optString("kind"); record.status = row.optString("status");
        record.identityReady = Boolean.TRUE.equals(row.opt("identity_ready"));
        record.retryReady = "failed".equals(record.status) && Boolean.TRUE.equals(row.opt("retry_ready"));
        record.deliveryRequested = "pending".equals(record.status) && Boolean.TRUE.equals(row.opt("delivery_requested"));
        record.requestState = Arrays.asList("queued","sent","failed","waiting","submission_unknown","denied").contains(row.optString("request_state")) ? row.optString("request_state") : "";
        result.notifications.add(record);
      }
      return result;
    }
    private static String bounded(JSONObject source, String key, int max) {
      Object raw = source.opt(key);
      if (!(raw instanceof String)) return "";
      String text = ((String) raw).trim(); return text.substring(0, Math.min(max, text.length()));
    }
  }
  static final class KbsNotification {
    String requestState = "";
    String id = "", customerName = "", roomName = "", roomNumber = "", occurredAt = "", kind = "", status = "";
    boolean identityReady, retryReady, deliveryRequested;
  }

  static final class RoomFolioRecord {
    String id = "";
    String version = "";
    boolean canAddItems;
    String stayId = "";
    String roomId = "";
    String roomName = "Oda";
    String roomNumber = "";
    String customerId = "";
    String customerName = "";
    String status = "open";
    int guestCount = 1;
    String checkInDate = "";
    String plannedCheckOutDate = "";
    int nights = 1;
    long nightlyPriceMinor;
    String currency = "TRY";
    long lodgingTotalMinor;
    long extrasTotalMinor;
    long chargeTotalMinor;
    long paidTotalMinor;
    long remainingMinor;
    String openedAt = "";

    static RoomFolioRecord fromJson(JSONObject source) {
      RoomFolioRecord folio = new RoomFolioRecord();
      folio.id = value(source, "id", "");
      folio.version = value(source, "version", "");
      folio.canAddItems = source.optBoolean("can_add_items", false);
      folio.stayId = value(source, "stay_id", "");
      folio.roomId = value(source, "room_id", "");
      folio.roomName = value(source, "room_name", "Oda");
      folio.roomNumber = value(source, "room_number", "");
      folio.customerId = value(source, "customer_id", "");
      folio.customerName = value(source, "customer_name", "");
      folio.status = value(source, "status", "open");
      folio.guestCount = Math.max(1, Math.min(50, source.optInt("guest_count", 1)));
      folio.checkInDate = value(source, "check_in_date", "");
      folio.plannedCheckOutDate = value(source, "planned_check_out_date", "");
      folio.nights = Math.max(1, source.optInt("nights", 1));
      folio.nightlyPriceMinor = Math.max(0L, source.optLong("nightly_price_minor", 0L));
      folio.currency = value(source, "currency", "TRY");
      folio.lodgingTotalMinor = Math.max(0L, source.optLong("lodging_total_minor", 0L));
      folio.extrasTotalMinor = source.optLong("extras_total_minor", 0L);
      folio.chargeTotalMinor = Math.max(0L, source.optLong("charge_total_minor", 0L));
      folio.paidTotalMinor = Math.max(0L, source.optLong("paid_total_minor", 0L));
      folio.remainingMinor = Math.max(0L, source.optLong("remaining_minor", 0L));
      folio.openedAt = value(source, "opened_at", "");
      return folio;
    }

    boolean isOpen() {
      return "open".equals(status);
    }
  }

  static final class FinanceSnapshot {
    String generatedAt = "";
    String currency = "TRY";
    long todayIncomeMinor;
    long todayExpenseMinor;
    long todayNetMinor;
    long outstandingPensionMinor;
    final List<FinanceEntry> recentEntries = new ArrayList<>();

    static FinanceSnapshot fromJson(JSONObject source) {
      FinanceSnapshot finance = new FinanceSnapshot();
      finance.generatedAt = value(source, "generated_at", "");
      finance.currency = value(source, "currency", "TRY");
      finance.todayIncomeMinor = source.optLong("today_income_minor", 0L);
      finance.todayExpenseMinor = source.optLong("today_expense_minor", 0L);
      finance.todayNetMinor = source.optLong("today_net_minor", 0L);
      finance.outstandingPensionMinor = source.optLong("outstanding_pension_minor", 0L);
      addRecords(array(source, "recent_entries"), finance.recentEntries, FinanceEntry::fromJson);
      return finance;
    }
  }

  static final class FinanceEntry {
    String id = "";
    String direction = "income";
    long amountMinor;
    String currency = "TRY";
    String paymentMethod = "unspecified";
    String category = "";
    String description = "";
    String occurredAt = "";
    String sourceType = "";
    String sourceId = "";
    String note = "";
    String createdAt = "";

    static FinanceEntry fromJson(JSONObject source) {
      FinanceEntry entry = new FinanceEntry();
      entry.id = value(source, "id", "");
      entry.direction = value(source, "direction", "income");
      entry.amountMinor = Math.max(0L, source.optLong("amount_minor", 0L));
      entry.currency = value(source, "currency", "TRY");
      entry.paymentMethod = value(source, "payment_method", "unspecified");
      entry.category = value(source, "category", "");
      entry.description = value(source, "description", "");
      entry.occurredAt = value(source, "occurred_at", "");
      entry.sourceType = value(source, "source_type", "");
      entry.sourceId = value(source, "source_id", "");
      entry.note = value(source, "note", "");
      entry.createdAt = value(source, "created_at", "");
      return entry;
    }

    boolean isIncome() {
      return "income".equals(direction);
    }
  }

  static final class ReportSnapshot {
    String preset = "";
    String label = "";
    String startDate = "";
    String endDate = "";
    double restaurantRevenue;
    int closedOrders;
    double averageOrder;
    int approvedReservations;
    int newRequests;
    int attentionCount;
    int soldItemCount;
    int cancelledOrders;
    int pendingRequests;
    int pendingReservations;
    int paymentWaitingTables;
    int overdueTasks;
    int incompleteTasks;
    int outOfStockItems;
    int lowStockItems;
    final List<ReportTopItem> topItems = new ArrayList<>();
    final List<ReportDay> dailyRevenue = new ArrayList<>();
    final List<ReportAttentionItem> attentionItems = new ArrayList<>();

    static ReportSnapshot fromJson(JSONObject source) {
      ReportSnapshot report = new ReportSnapshot();
      JSONObject period = object(source, "period");
      report.preset = value(period, "key", "");
      report.label = value(period, "label", "");
      report.startDate = value(period, "start", "");
      report.endDate = value(period, "end", "");

      JSONObject summary = object(source, "summary");
      report.restaurantRevenue = decimal(summary, "restaurant_revenue");
      report.closedOrders = number(summary, "closed_orders");
      report.averageOrder = decimal(summary, "average_order");
      report.approvedReservations = number(summary, "approved_reservations");
      report.newRequests = number(summary, "new_requests");
      report.attentionCount = number(summary, "attention_count");

      JSONObject restaurant = object(source, "restaurant");
      report.soldItemCount = number(restaurant, "sold_item_count");
      report.cancelledOrders = number(restaurant, "cancelled_orders");
      addRecords(array(restaurant, "top_items"), report.topItems, ReportTopItem::fromJson);
      addRecords(array(restaurant, "daily_revenue"), report.dailyRevenue, ReportDay::fromJson);

      JSONObject attention = object(source, "attention");
      report.pendingRequests = number(attention, "pending_requests");
      report.pendingReservations = number(attention, "pending_reservations");
      report.paymentWaitingTables = number(attention, "payment_waiting_tables");
      report.overdueTasks = number(attention, "overdue_tasks");
      report.incompleteTasks = number(attention, "incomplete_tasks");
      report.outOfStockItems = number(attention, "out_of_stock_items");
      report.lowStockItems = number(attention, "low_stock_items");
      addRecords(array(attention, "items"), report.attentionItems, ReportAttentionItem::fromJson);
      return report;
    }
  }

  static final class ReportTopItem {
    String name = "Ürün";
    double quantity;
    double revenue;

    static ReportTopItem fromJson(JSONObject source) {
      ReportTopItem item = new ReportTopItem();
      item.name = value(source, "name", "Ürün");
      item.quantity = decimal(source, "quantity");
      item.revenue = decimal(source, "revenue");
      return item;
    }
  }

  static final class ReportDay {
    String date = "";
    double revenue;
    int closedOrders;

    static ReportDay fromJson(JSONObject source) {
      ReportDay day = new ReportDay();
      day.date = value(source, "date", "");
      day.revenue = decimal(source, "revenue");
      day.closedOrders = number(source, "closed_orders");
      return day;
    }
  }

  static final class ReportAttentionItem {
    String kind = "";
    String title = "";
    String detail = "";

    static ReportAttentionItem fromJson(JSONObject source) {
      ReportAttentionItem item = new ReportAttentionItem();
      item.kind = value(source, "kind", "");
      item.title = value(source, "title", "");
      item.detail = value(source, "detail", "");
      return item;
    }
  }
}
