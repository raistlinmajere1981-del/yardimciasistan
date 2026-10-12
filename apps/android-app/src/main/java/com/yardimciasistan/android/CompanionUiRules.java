package com.yardimciasistan.android;

import java.util.ArrayList;
import java.util.List;

/** Visibility and list selection only; permissions and redaction belong to OperationData. */
final class CompanionUiRules {
  static final String ALL = "";
  static final String ONLINE = "web-online-sales";
  static final String DEALER = "web-dealer";

  private CompanionUiRules() {}

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
      if (!ALL.equals(source) && !source.equals(order.source)) continue;
      if (shipmentsOnly && !hasShipment(data.companion, order.id)) continue;
      result.add(order);
    }
    return result;
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
