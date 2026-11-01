package com.yardimciasistan.android;

import org.json.JSONObject;

final class AndroidActionPolicy {
  static String validationError(
      OperationData data,
      String actionType,
      JSONObject actionPayload
  ) {
    if (data == null) {
      return "Bu cihazın bu işlem için yetkisi yok.";
    }
    if (data.permissionsResolved && !data.deviceActive) {
      return "Cihaz masaüstünde pasifleştirilmiş.";
    }
    if (isAdminOnlyAction(actionType) && !data.isAdmin()) {
      return "Bu işlem yalnız yönetici cihazlarda kullanılabilir.";
    }
    if (!actionAllowedByCapabilities(data, actionType, actionPayload)) {
      return "Bu işlem işletmenin etkin özellikleri dışında.";
    }

    if (("commerce_order_confirm".equals(actionType) || "commerce_order_cancel".equals(actionType))
        && (actionPayload == null || actionPayload.optString("expected_updated_at", "").trim().isEmpty()
            || actionPayload.optString("expected_status", "").trim().isEmpty())) {
      return "Beklenen sipariş durumu ve güncelleme zamanı gerekli.";
    }
    String requiredPermission = requiredPermissionForAction(actionType, actionPayload);
    if (requiredPermission == null || !data.hasPermission(requiredPermission)) {
      return "table_order.close_paid".equals(requiredPermission)
          ? "Bu cihazın hesap kapatma yetkisi yok."
          : "Bu cihazın bu işlem için yetkisi yok.";
    }
    if (MarketUiRules.ACTION_SALE.equals(actionType) || MarketUiRules.ACTION_CREDIT_PAYMENT.equals(actionType)) {
      if (actionPayload == null) return "Satış veya tahsilat bilgileri eksik.";
      boolean sale = MarketUiRules.ACTION_SALE.equals(actionType);
      String[] allowed = sale
          ? new String[]{"lines", "location_id", "settlement", "customer_id", "payment_method", "external_payment_confirmed", "requestedPointsMinor", "couponPermitId"}
          : new String[]{"customer_id", "amount_minor", "currency", "expected_balance_minor", "payment_method", "external_payment_confirmed"};
      if (!hasOnlyKeys(actionPayload, allowed)) return "Mobil işlem desteklenmeyen alan içeriyor.";
      if (sale && !"paid".equals(actionPayload.optString("settlement"))
          && !"credit".equals(actionPayload.optString("settlement"))) return "Satış ödeme seçimi geçersiz.";
      String method = actionPayload.optString("payment_method", "");
      boolean credit = MarketUiRules.ACTION_SALE.equals(actionType) && "credit".equals(actionPayload.optString("settlement"));
      if (sale && actionPayload.has("requestedPointsMinor")) {
        Object rawPoints = actionPayload.opt("requestedPointsMinor");
        // A JSON amount is an intent, not a trusted permission to deduct points.
        if (!(rawPoints instanceof Integer || rawPoints instanceof Long)
            || ((Number) rawPoints).longValue() < 0 || ((Number) rawPoints).longValue() > 9007199254740991L)
          return "Mobil Puan tutarı geçersiz.";
        if (((Number) rawPoints).longValue() > 0 && (credit || actionPayload.optString("customer_id", "").isEmpty()))
          return "Puan için müşterili ücretli satış gerekli.";
      }
      boolean coupon = sale && actionPayload.has("couponPermitId");
      if (coupon) {
        Object rawCoupon = actionPayload.opt("couponPermitId");
        if (!(rawCoupon instanceof String) || !((String) rawCoupon)
            .matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))
          return "Kupon izni geçersiz.";
        if (!"paid".equals(actionPayload.optString("settlement")) || !"cash".equals(method)
            || actionPayload.optString("customer_id", "").isEmpty())
          return "Kupon yalnız müşterili nakit satışta kullanılabilir.";
        if (actionPayload.has("requestedPointsMinor")
            && ((Number) actionPayload.opt("requestedPointsMinor")).longValue() > 0)
          return "Kupon ile Puan birlikte kullanılamaz.";
      }
      if ((!credit && !java.util.Arrays.asList("cash", "card", "bank", "other").contains(method))
          || (credit && (!method.isEmpty() || actionPayload.optString("customer_id").isEmpty()))) return "Ödeme türü veya müşteri eksik.";
      if ("card".equals(method) && !Boolean.TRUE.equals(actionPayload.opt("external_payment_confirmed"))) return "Harici POS ödemesini onaylayın.";
      if (MarketUiRules.ACTION_SALE.equals(actionType)) {
        org.json.JSONArray lines = actionPayload.optJSONArray("lines");
        if (lines == null || lines.length() == 0 || lines.length() > 200) return "Satış ürünleri eksik.";
        for (int i = 0; i < lines.length(); i++) {
          JSONObject line = lines.optJSONObject(i);
          if (line == null || !hasOnlyKeys(line, new String[]{"product_id", "quantity", "expected_unit_price", "expected_currency", "expected_updated_at"}))
            return "Mobil satış satırı desteklenmeyen alan içeriyor.";
          Object quantityValue = line.opt("quantity");
          Object priceValue = line.opt("expected_unit_price");
          double quantity = quantityValue instanceof Number ? ((Number) quantityValue).doubleValue() : Double.NaN;
          double price = priceValue instanceof Number ? ((Number) priceValue).doubleValue() : Double.NaN;
          if (!Double.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000
              || Math.abs(quantity * 10_000 - Math.rint(quantity * 10_000)) > 0.00001
              || !Double.isFinite(price) || price < 0) return "Satış miktarı veya fiyatı geçersiz.";
          if (line.optString("product_id").isEmpty() || line.optString("expected_updated_at").isEmpty()
              || !line.optString("expected_currency").matches("[A-Z]{3}")) return "Güncel ürün fiyatı ve sürümü gerekli.";
        }
      } else if (!actionPayload.has("expected_balance_minor") || actionPayload.optLong("expected_balance_minor", 0) <= 0
          || actionPayload.optLong("amount_minor", 0) <= 0 || !actionPayload.optString("currency").matches("[A-Z]{3}")) return "Tahsilat tutarı ve güncel bakiye gerekli.";
    }
    if ("room_folio_menu_item_add".equals(actionType) || "room_folio_manual_charge_add".equals(actionType)) {
      if (!data.hasPermission("room_folio.view")
          || ("room_folio_menu_item_add".equals(actionType) && !data.hasPermission("menu.view"))) {
        return "Bu cihazın oda hesabı veya menü görüntüleme yetkisi yok.";
      }
      if (actionPayload == null || !actionPayload.optString("expected_folio_version", "").matches("[a-f0-9]{64}")) {
        return "Güncel oda hesabı gerekli. Veriyi yenileyip tekrar deneyin.";
      }
    }
    if (KbsUiRules.isAction(actionType)) return KbsUiRules.validationError(data, actionType, actionPayload);
    return "";
  }

  private static boolean hasOnlyKeys(JSONObject payload, String[] allowed) {
    java.util.Set<String> keys = new java.util.HashSet<>(java.util.Arrays.asList(allowed));
    java.util.Iterator<String> present = payload.keys();
    while (present.hasNext()) if (!keys.contains(present.next())) return false;
    return true;
  }

  static boolean actionAllowedByCapabilities(
      OperationData data,
      String actionType,
      JSONObject actionPayload
  ) {
    if (data == null
        || !data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ANDROID)) {
      return false;
    }

    String type = actionType == null ? "" : actionType;
    JSONObject payload = actionPayload == null ? new JSONObject() : actionPayload;
    if (KbsUiRules.isAction(type)) return KbsUiRules.canView(data);
    if (MarketUiRules.ACTION_SALE.equals(type)) {
      return MarketUiRules.canCompleteSale(data) && (!"credit".equals(payload.optString("settlement")) || MarketUiRules.canViewCredit(data));
    }
    if (MarketUiRules.ACTION_CREDIT_PAYMENT.equals(type)) return MarketUiRules.canPayCredit(data);
    if ("room_folio_menu_item_add".equals(type) || "room_folio_manual_charge_add".equals(type)) {
      return data.hasBusinessCapability("accommodation.folio") && data.hasBusinessCapability("accommodation.stays")
          && (!"room_folio_menu_item_add".equals(type) || data.hasBusinessCapability("food_service.menu"));
    }
    if ("menu_entry_create".equals(type) || "menu_entry_update".equals(type)) {
      return data.hasBusinessCapability("food_service.menu") && data.hasBusinessCapability("commerce.catalog");
    }

    if ("commerce_order_confirm".equals(type) || "commerce_order_cancel".equals(type)) {
      CompanionData.Order order = data.companion.orderById(payload.optString("order_id", ""));
      return data.hasPermission("commerce_order.view") && order != null
          && (!CompanionUiRules.isDealerOrder(order) || data.hasBusinessCapability("commerce.wholesale"))
          && (!"web-online-sales".equals(order.source) || data.hasPermission("online_sales.view"));
    }
    String marketPermission = MarketUiRules.requiredPermissionForAction(type);
    if (marketPermission != null) {
      return data.hasPermission(marketPermission);
    }
    if ("customer_request_convert_to_reservation".equals(type)) {
      OperationData.RequestRecord request = data.requestById(
          payload.optString("request_id", "")
      );
      return AndroidUiRules.canConvertRequest(data, request);
    }
    if (type.startsWith("reservation_room_")) {
      return data.hasBusinessCapability(
          AndroidUiRules.CAPABILITY_ACCOMMODATION_RESERVATIONS
      );
    }
    if (type.startsWith("reservation_table_")) {
      return data.hasBusinessCapability(
          AndroidUiRules.CAPABILITY_FOOD_RESERVATIONS
      );
    }
    if ("reservation_approve".equals(type)
        || "reservation_reject".equals(type)
        || "reservation_cancel".equals(type)) {
      OperationData.ReservationRecord reservation = data.reservationById(
          payload.optString("reservation_id", "")
      );
      return AndroidUiRules.reservationAllowed(data, reservation);
    }
    if (type.startsWith("daily_task_")) {
      String taskType = payload.optString("task_type", "");
      String relatedType = payload.optString("related_type", "");
      OperationData.TaskRecord task = "daily_task_create".equals(type)
          ? null
          : data.taskById(payload.optString("task_id", ""));
      if (task != null) {
        return AndroidUiRules.taskAllowed(data, task);
      }
      OperationData.ReservationRecord reservation = "reservation".equals(relatedType)
          ? data.reservationById(payload.optString("related_id", ""))
          : null;
      return AndroidUiRules.taskTypeAllowed(
          data,
          taskType,
          relatedType,
          reservation == null ? "" : reservation.type
      );
    }
    if ("room_status_update".equals(type)
        && "reserved".equals(payload.optString("status", ""))) {
      return data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ROOMS)
          && data.hasBusinessCapability(
              AndroidUiRules.CAPABILITY_ACCOMMODATION_RESERVATIONS
          );
    }
    if ("table_status_update".equals(type)) {
      String status = payload.optString("status", "");
      if ("reserved".equals(status)) {
        return data.hasBusinessCapability(AndroidUiRules.CAPABILITY_TABLES)
            && data.hasBusinessCapability(
                AndroidUiRules.CAPABILITY_FOOD_RESERVATIONS
            );
      }
      if ("bill_waiting".equals(status)
          || "waiting_bill".equals(status)
          || "checkout".equals(status)
          || "payment".equals(status)) {
        return data.hasBusinessCapability(AndroidUiRules.CAPABILITY_TABLES)
            && data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ORDERS);
      }
    }
    if ("menu_stock_image_import_apply".equals(type)) {
      return AndroidUiRules.canUseAi(data);
    }
    if ("message_delete".equals(type)) {
      return AndroidUiRules.canUseWhatsApp(data);
    }
    return true;
  }

  static String requiredPermissionForAction(
      String actionType,
      JSONObject actionPayload
  ) {
    String type = actionType == null ? "" : actionType;
    switch (type) {
      case "commerce_order_confirm": return "commerce_order.confirm";
      case "commerce_order_cancel": return "commerce_order.cancel";
      case "customer_create":
      case "customer_update":
        return "customer.manage";
      case "customer_room_assign":
      case "customer_room_stay_status":
        return "room.assign_customer";
      case "customer_request_delete":
        return "request.delete";
      case "customer_delete":
        return "customer.delete";
      case "menu_category_delete":
      case "menu_item_delete":
        return "menu.delete";
      case "menu_entry_create":
      case "menu_entry_update":
        return "menu.edit";
      case "message_delete":
        return "message.delete";
      case "customer_request_approve":
      case "customer_request_reopen":
        return "customer.respond";
      case "customer_request_mark_answered":
        return "customer.mark_answered";
      case "customer_request_reject":
        return "customer.reject";
      case "customer_request_convert_to_reservation":
        return "customer.convert_to_reservation";
      case "reservation_room_create":
      case "reservation_table_create":
        return "reservation.create";
      case "reservation_room_update":
      case "reservation_table_update":
        return "reservation.update";
      case "reservation_approve":
        return "reservation.approve";
      case "reservation_reject":
        return "reservation.reject";
      case "reservation_cancel":
        return "reservation.cancel";
      case "room_status_update":
        return "room.update_status";
      case "daily_task_create":
        return "daily_task.create";
      case "daily_task_update":
      case "daily_task_cancel":
        return "daily_task.update";
      case "daily_task_delete":
        return "daily_task.delete";
      case "daily_task_complete":
        return "daily_task.complete";
      case "daily_task_reopen":
        return "daily_task.reopen";
      case "finance_manual_create":
        return "finance.create";
      case "room_folio_payment_add":
        return "room_folio.payment";
      case KbsUiRules.SEND:
      case KbsUiRules.RETRY:
      case KbsUiRules.EXTERNAL:
        return KbsUiRules.permission(actionType);
      case "room_folio_menu_item_add":
        return "room_folio.add_menu_item";
      case "room_folio_manual_charge_add":
        return "room_folio.add_manual_charge";
      case "room_folio_checkout":
        return "room_folio.checkout";
      case "table_status_update":
        return "table.update_status";
      case "table_order_open":
        return "table_order.open";
      case "table_order_add_item":
        return "table_order.add_item";
      case "table_order_update_item_quantity":
        return "table_order.update_item";
      case "table_order_remove_item":
        return "table_order.remove_item";
      case "table_order_set_preparing":
        return "table_order.set_preparing";
      case "table_order_set_served":
        return "table_order.set_served";
      case "table_order_set_payment_waiting":
        return "table_order.set_payment_waiting";
      case "table_order_close_paid":
        return "table_order.close_paid";
      case "table_order_cancel":
        return "table_order.cancel";
      case "menu_stock_add":
      case "menu_stock_set":
      case "menu_stock_adjust":
      case "menu_stock_image_import_apply":
        return "menu.stock_update";
      case MarketUiRules.ACTION_STOCK_COUNT:
        return MarketUiRules.PERMISSION_STOCK_COUNT;
      case MarketUiRules.ACTION_PURCHASE_RECEIVE:
        return MarketUiRules.PERMISSION_RECEIVING;
      case MarketUiRules.ACTION_PRODUCT_CREATE:
        return MarketUiRules.PERMISSION_PRODUCT_CREATE;
      case MarketUiRules.ACTION_CART_DRAFT_CREATE:
        return MarketUiRules.PERMISSION_CART_DRAFT;
      case MarketUiRules.ACTION_BARCODE_SCAN:
        return MarketUiRules.PERMISSION_SCAN_TO_DESKTOP;
      case MarketUiRules.ACTION_SALE:
        return MarketUiRules.PERMISSION_SALE;
      case MarketUiRules.ACTION_CREDIT_PAYMENT:
        return MarketUiRules.PERMISSION_CREDIT_PAYMENT;
      default:
        return null;
    }
  }

  static boolean isAdminOnlyAction(String actionType) {
    String type = actionType == null ? "" : actionType;
    return KbsUiRules.isAction(type) || "customer_request_delete".equals(type)
        || "customer_delete".equals(type)
        || "customer_create".equals(type)
        || "customer_update".equals(type)
        || "customer_room_assign".equals(type)
        || "customer_room_stay_status".equals(type)
        || "daily_task_delete".equals(type)
        || "menu_category_delete".equals(type)
        || "menu_item_delete".equals(type)
        || "message_delete".equals(type);
  }

  private AndroidActionPolicy() {}
}
