package com.yardimciasistan.android;

import java.util.ArrayList;
import java.util.List;

/** Visibility and list selection only; permissions and redaction belong to OperationData. */
final class CompanionUiRules {
  static final String ALL = "";
  static final String ONLINE = "web-online-sales";
  static final String DEALER = "web-dealer";

  private CompanionUiRules() {}

  static boolean isDecision(String type) {
    return "commerce_order_confirm".equals(type) || "commerce_order_cancel".equals(type);
  }

  static boolean orderPending(OperationData data, String orderId, List<ActionOutbox.PendingAction> local) {
    for (ActionOutbox.PendingAction action : local) if (isDecision(action.type) && orderId.equals(action.payload.optString("order_id"))) return true;
    for (OperationData.ActionRecord action : data.actions) if (isDecision(action.type) && orderId.equals(action.orderId) && "pending".equals(action.status)) return true;
    return false;
  }

  static org.json.JSONObject decisionPayload(CompanionData.Order order) throws org.json.JSONException {
    return new org.json.JSONObject().put("order_id", order.id).put("expected_updated_at", order.updatedAt).put("expected_status", order.status);
  }

  static boolean canDecide(OperationData data, CompanionData.Order order, String type, List<ActionOutbox.PendingAction> local) {
    if (local == null || order == null || order.details == null || !order.details.itemsComplete || !order.details.availableActions.contains(type)
        || order.updatedAt.isEmpty() || orderPending(data, order.id, local) || awaitingProjection(data, order)) return false;
    try { return AndroidActionPolicy.validationError(data, type, decisionPayload(order)).isEmpty(); }
    catch (org.json.JSONException ignored) { return false; }
  }

  /** An applied receipt can arrive before the corresponding canonical snapshot. */
  static boolean awaitingProjection(OperationData data, CompanionData.Order order) {
    if (order == null) return false;
    for (OperationData.ActionRecord action : data.actions) if (isDecision(action.type) && order.id.equals(action.orderId)) {
      return "applied".equals(action.status) && !action.expectedUpdatedAt.isEmpty() && !action.expectedStatus.isEmpty()
          && order.updatedAt.equals(action.expectedUpdatedAt) && order.status.equals(action.expectedStatus);
    }
    return false;
  }

  /** Delivery barriers, not an order status machine. Different orders can wait independently. */
  static String submissionError(OperationData data, String type, org.json.JSONObject payload,
      List<ActionOutbox.PendingAction> pending, String target) {
    CompanionData.Order order = data.companion.orderById(payload.optString("order_id"));
    if (order != null && (!order.updatedAt.equals(payload.optString("expected_updated_at")) || !order.status.equals(payload.optString("expected_status")))) {
      return "Sipariş ayrıntısı değişti. Güncel ayrıntıyı kontrol edip tekrar deneyin.";
    }
    if (!canDecide(data, order, type, pending)) return order != null && orderPending(data, order.id, pending)
        ? "Bu sipariş için bekleyen telefon işlemi var." : "Bu siparişin tam ve işlem yapılabilir ayrıntıları henüz eşitlenmedi.";
    for (ActionOutbox.PendingAction action : pending) {
      if (!action.matchesTarget(target)) return "Telefonda önceki bağlantıya ait bekleyen işlem var.";
      if (!isDecision(action.type)) return "Önce telefonda bekleyen işlem yeniden gönderilmeli.";
    }
    int known = 0;
    for (OperationData.ActionRecord action : data.actions) if (isDecision(action.type) && "pending".equals(action.status)) known++;
    return data.pendingActions > known ? "Önce masaüstünü bekleyen işlemlerin sonucu eşitlenmeli." : "";
  }

  static String orderActionStatus(OperationData data, String id, List<ActionOutbox.PendingAction> local) {
    for (ActionOutbox.PendingAction action : local) if (isDecision(action.type) && id.equals(action.payload.optString("order_id"))) {
      return decisionLabel(action.type) + " · Bekliyor\nBağlantı kurulunca aynı işlem yeniden gönderilir.";
    }
    for (OperationData.ActionRecord action : data.actions) if (isDecision(action.type) && id.equals(action.orderId)) {
      if ("unknown".equals(action.status)) return decisionLabel(action.type) + " · Sonuç kaydı bulunamadı\nSiparişin son eşitlenmiş durumunu kontrol edin.";
      String status = "applied".equals(action.status) ? "Uygulandı" : "failed".equals(action.status) ? "Uygulanamadı" : "Bekliyor";
      return AndroidPresentation.joinNonEmpty("\n", decisionLabel(action.type) + " · " + status,
          "failed".equals(action.status) ? action.errorMessage : "",
          "pending".equals(action.status) ? "İşlem masaüstünün uygulamasını bekliyor."
              : awaitingProjection(data, data.companion.orderById(id)) ? "Sipariş güncellemesi bekleniyor." : "");
    }
    return "";
  }

  static String decisionLabel(String type) { return "commerce_order_confirm".equals(type) ? "Onayla" : "İptal Et"; }

  static boolean isMode(String mode) {
    return AndroidUiRules.TODAY_COMMERCE.equals(mode)
        || AndroidUiRules.TODAY_SHIPMENTS.equals(mode)
        || AndroidUiRules.TODAY_MARKETING.equals(mode);
  }

  static boolean canOpen(OperationData data, String mode) {
    if (data == null) return false;
    if (AndroidUiRules.TODAY_COMMERCE.equals(mode)) return data.hasPermission("commerce_order.view");
    if (AndroidUiRules.TODAY_SHIPMENTS.equals(mode)) {
      return data.hasPermission("commerce_order.view") && data.hasPermission("shipment.view");
    }
    return AndroidUiRules.TODAY_MARKETING.equals(mode) && data.hasPermission("marketing.status.view");
  }

  static boolean sourceFilterAvailable(OperationData data, String source) {
    if (!canOpen(data, AndroidUiRules.TODAY_COMMERCE)) return false;
    if (ONLINE.equals(source)) return data.hasPermission("online_sales.view");
    if (DEALER.equals(source)) return data.hasBusinessCapability("commerce.wholesale");
    return ALL.equals(source);
  }

  static List<CompanionData.Order> orders(OperationData data, String source, boolean shipmentsOnly) {
    List<CompanionData.Order> result = new ArrayList<>();
    if (!canOpen(data, shipmentsOnly ? AndroidUiRules.TODAY_SHIPMENTS : AndroidUiRules.TODAY_COMMERCE)
        || !sourceFilterAvailable(data, source)) return result;
    data.companion.redact(data);
    for (CompanionData.Order order : data.companion.orders) {
      if (DEALER.equals(source) ? !isDealerOrder(order) : !ALL.equals(source) && !source.equals(order.source)) continue;
      if (shipmentsOnly && !hasShipment(data.companion, order.id)) continue;
      result.add(order);
    }
    return result;
  }

  static boolean isDealerOrder(CompanionData.Order order) {
    return order.dealerOrder || "web-dealer".equals(order.source);
  }

  private static boolean hasShipment(CompanionData data, String orderId) {
    for (CompanionData.Shipment shipment : data.shipments) if (orderId.equals(shipment.orderId)) return true;
    return false;
  }

  static String title(String mode) {
    if (AndroidUiRules.TODAY_COMMERCE.equals(mode)) return "Ticari siparişler";
    if (AndroidUiRules.TODAY_SHIPMENTS.equals(mode)) return "Gönderiler";
    if (AndroidUiRules.TODAY_MARKETING.equals(mode)) return "Pazarlama durumu";
    return "Bugün";
  }

  static String syncNotice(OperationData data, boolean loading, boolean failed, int pendingActions) {
    String state = loading ? "Senkronizasyon sürüyor." : failed ? "Bağlantı kurulamadı; son alınan özet gösteriliyor." : "";
    String lastSync = data.pulledAt == null || data.pulledAt.isEmpty()
        ? "Henüz senkronizasyon yapılmadı."
        : "Son senkron: " + AndroidPresentation.shortTimestamp(data.pulledAt);
    String snapshotTime = data.snapshotUpdatedAt == null || data.snapshotUpdatedAt.isEmpty()
        ? "Özet güncelleme zamanı bilinmiyor."
        : "Özet güncellemesi: " + AndroidPresentation.shortTimestamp(data.snapshotUpdatedAt);
    String pending = pendingActions > 0 ? pendingActions + " telefon işlemi masaüstünü bekliyor." : "";
    return AndroidPresentation.joinNonEmpty("\n", state, snapshotTime, lastSync, pending);
  }
}
