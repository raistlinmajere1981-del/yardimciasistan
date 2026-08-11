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
      "menu.delete",
      "message.delete",
      "settings.view",
      "settings.edit",
      "android_devices.view",
      "android_devices.manage"
  };
  private static final String[] STAFF_PERMISSIONS = {
      "room.view",
      "room.update_status",
      "daily_task.view",
      "daily_task.create",
      "daily_task.update",
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
      "menu.view",
      "menu.stock_view"
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
  boolean permissionsResolved;
  final Set<String> permissions = new HashSet<>(Arrays.asList(STAFF_PERMISSIONS));

  final List<RequestRecord> requests = new ArrayList<>();
  final List<CustomerRecord> customers = new ArrayList<>();
  final List<CustomerRoomStayRecord> customerRoomStays = new ArrayList<>();
  final List<ReservationRecord> reservations = new ArrayList<>();
  final List<RoomRecord> rooms = new ArrayList<>();
  final List<TableRecord> tables = new ArrayList<>();
  final List<TaskRecord> tasks = new ArrayList<>();
  final List<MenuCategory> categories = new ArrayList<>();
  final List<MenuItem> menuItems = new ArrayList<>();
  final List<MenuCategory> adminCategories = new ArrayList<>();
  final List<MenuItem> adminMenuItems = new ArrayList<>();
  final List<TrackedStockItem> trackedStockItems = new ArrayList<>();
  final Set<String> appliedStockImageHashes = new HashSet<>();
  final List<TableOrder> tableOrders = new ArrayList<>();
  final List<MessageRecord> messages = new ArrayList<>();
  final List<ActionRecord> actions = new ArrayList<>();
  final Map<String, ReportSnapshot> reports = new HashMap<>();

  static OperationData fromJson(JSONObject root) {
    return fromJson(root, "");
  }

  static OperationData fromJson(JSONObject root, String deviceId) {
    OperationData data = new OperationData();
    data.serverRevision = Math.max(0L, root.optLong("server_revision", 0L));
    boolean messagesIncluded = root.has("messages") && root.optJSONArray("messages") != null;
    JSONObject business = object(root, "business");
    data.businessName = value(business, "display_name", "Yardımcı Asistan");
    data.businessPhone = value(business, "phone", "");
    data.businessWhatsapp = value(business, "whatsapp", data.businessPhone);

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
      adminMenu = menu;
    }
    addRecords(array(adminMenu, "categories"), data.adminCategories, MenuCategory::fromJson);
    addRecords(array(adminMenu, "items"), data.adminMenuItems, MenuItem::fromJson);

    data.applyPermissionProfile(root.optJSONObject("androidPermissions"), deviceId);

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
    return deviceActive && permissions.contains(permission);
  }

  boolean isAdmin() {
    return permissionsResolved && deviceActive && "admin".equals(deviceRole);
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
    if (profilePermissions == null && "admin".equals(deviceRole)) {
      permissions.addAll(Arrays.asList(ALL_PERMISSIONS));
      return;
    }
    if (profilePermissions == null) {
      return;
    }
    Set<String> allowed = new HashSet<>(Arrays.asList(ALL_PERMISSIONS));
    for (int index = 0; index < profilePermissions.length(); index += 1) {
      String permission = profilePermissions.optString(index, "").trim();
      if (allowed.contains(permission)) {
        permissions.add(permission);
      }
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

  TrackedStockItem trackedStockByMenuItemId(String menuItemId) {
    for (TrackedStockItem item : trackedStockItems) {
      if (menuItemId.equals(item.menuItemId)) {
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
    List<String> tags = new ArrayList<>();
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
      record.tags = strings(source, "tags");
      record.identityType = value(source, "identity_type", "");
      record.identityNumber = value(source, "identity_number", "");
      record.nationality = value(source, "nationality", "");
      record.birthDate = value(source, "birth_date", "");
      record.gender = value(source, "gender", "");
      record.documentSerialNumber = value(source, "document_serial_number", "");
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
    String categoryId = "";
    String name = "Ürün";
    String description = "";
    double price;
    String currency = "TRY";
    boolean available = true;
    Double stockQuantity;
    Double stockMinQuantity;
    String stockUnit = "piece";
    double stockConsumptionQuantity = 1;
    boolean hideWhenOutOfStock;
    String updatedAt = "";

    static MenuItem fromJson(JSONObject source) {
      MenuItem record = new MenuItem();
      record.id = value(source, "id", "");
      record.categoryId = value(source, "category_id", "");
      record.name = value(source, "name", "Ürün");
      record.description = value(source, "description", "");
      record.price = decimal(source, "price");
      record.currency = value(source, "currency", "TRY");
      record.available = source.optBoolean("is_available", true);
      record.stockQuantity = nullableDecimal(source, "stock_quantity");
      record.stockMinQuantity = nullableDecimal(source, "stock_min_quantity");
      record.stockUnit = "gram".equals(value(source, "stock_unit", "piece")) ? "gram" : "piece";
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
    String menuItemId = "";
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
      record.menuItemId = value(source, "menu_item_id", "");
      record.name = value(source, "name", "Ürün");
      record.category = value(source, "category", "Menü");
      record.price = decimal(source, "price");
      record.stockQuantity = decimal(source, "stock_quantity");
      record.stockMinQuantity = nullableDecimal(source, "stock_min_quantity");
      record.stockUnit = "gram".equals(value(source, "stock_unit", "piece")) ? "gram" : "piece";
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
    String menuItemId = "";
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
      record.menuItemId = value(source, "menu_item_id", "");
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
    String id = "";
    String type = "";
    String status = "pending";
    String errorMessage = "";
    String taskType = "";
    String createdAt = "";
    String processedAt = "";

    static ActionRecord fromJson(JSONObject source) {
      ActionRecord record = new ActionRecord();
      record.id = value(source, "id", "");
      record.type = value(source, "action_type", "");
      record.status = value(source, "status", "pending");
      record.errorMessage = value(source, "error_message", "");
      JSONObject payload = source.optJSONObject("payload");
      record.taskType = payload == null ? "" : value(payload, "task_type", "");
      record.createdAt = value(source, "created_at", "");
      record.processedAt = value(source, "processed_at", "");
      return record;
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
