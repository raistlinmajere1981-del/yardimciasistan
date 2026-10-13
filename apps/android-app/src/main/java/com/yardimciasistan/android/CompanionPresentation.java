package com.yardimciasistan.android;

import java.util.ArrayList;
import java.util.List;

/** Text for the safe status read-model; no transitions or mutation affordances. */
final class CompanionPresentation {
  static final class Summary {
    final String title, status;
    final boolean failed, pending;
    final List<String> lines = new ArrayList<>();

    Summary(String title, String status, boolean failed, boolean pending) {
      this.title = title;
      this.status = status;
      this.failed = failed;
      this.pending = pending;
    }
  }

  private CompanionPresentation() {}

  static Summary order(CompanionData data, CompanionData.Order order, boolean showShipments) {
    Summary result = new Summary("Sipariş " + order.id, orderStatus(order.status), false, "placed".equals(order.status));
    result.lines.add("Kaynak: " + (order.dealerOrder ? "Bayi siparişi (Masaüstü)" : source(order.source)));
    result.lines.add("Tarih: " + date(order.placedAt));
    result.lines.add("Tutar: " + AndroidPresentation.money(order.total, order.currency)
        + ("TRY".equals(order.currency) ? " · TRY" : ""));
    result.lines.add("Teslimat: " + ("shipping".equals(order.deliveryMethod) ? "Kargo" : "Elden teslim"));
    if (showShipments) {
      for (CompanionData.Shipment shipment : data.shipments) {
        if (!order.id.equals(shipment.orderId)) continue;
        result.lines.add("Gönderi " + shipment.id + ": " + shipmentStatus(shipment.status));
        result.lines.add("Takip kaydı: " + (shipment.trackingAvailable ? "Var" : "Yok"));
      }
    }
    return result;
  }

  static Summary publication(CompanionData.Publication publication) {
    Summary result = new Summary("Yayın " + publication.id, publicationStatus(publication.status),
        "failed".equals(publication.status), "publishing".equals(publication.status));
    result.lines.add("Kanal: " + channel(publication.channel));
    result.lines.add("Hedef: " + (publication.desiredPublished ? "Yayında" : "Yayından kaldırılmış"));
    result.lines.add("Revizyon: " + publication.revision + " · Yayınlanan: " + publication.publishedRevision);
    result.lines.add("Güncelleme: " + date(publication.updatedAt));
    return result;
  }

  static Summary schedule(CompanionData.Schedule schedule) {
    Summary result = new Summary("Plan " + schedule.id, scheduleStatus(schedule.status),
        "failed".equals(schedule.lastExecutionStatus),
        "pending".equals(schedule.lastExecutionStatus) || "claimed".equals(schedule.lastExecutionStatus));
    result.lines.add("Kanal: " + channel(schedule.channel));
    result.lines.add("Hedef: " + ("audience_campaign".equals(schedule.targetType) ? "Kampanya" : "Yayın"));
    result.lines.add("Son çalıştırma: " + executionStatus(schedule.lastExecutionStatus));
    result.lines.add("Sonraki çalışma: " + date(schedule.nextRunAt));
    result.lines.add("Güncelleme: " + date(schedule.updatedAt));
    return result;
  }

  static Summary campaign(CompanionData.Campaign campaign) {
    Summary result = new Summary("Kampanya " + campaign.id, campaignStatus(campaign.status),
        campaign.failedCount > 0, campaign.pendingCount > 0);
    result.lines.add("Kanal: " + channel(campaign.channel));
    result.lines.add("Bekleyen: " + campaign.pendingCount + " · Başarısız: " + campaign.failedCount);
    result.lines.add("Güncelleme: " + date(campaign.updatedAt));
    return result;
  }

  static Summary shipment(CompanionData.Shipment shipment) {
    Summary result = new Summary("Gönderi " + shipment.id, shipmentStatus(shipment.status), false, false);
    result.lines.add("Kargo: " + missing(shipment.providerName));
    result.lines.add("Takip numarası: " + missing(shipment.trackingNumber));
    result.lines.add("Güncelleme: " + date(shipment.updatedAt));
    if (!shipment.note.isEmpty()) result.lines.add("Not: " + shipment.note);
    return result;
  }

  static String address(CompanionData.Address address) {
    if (address == null) return "Teslimat adresi belirtilmemiş.";
    return AndroidPresentation.joinNonEmpty("\n", address.recipient, address.line1, address.line2,
        AndroidPresentation.joinNonEmpty(" · ", address.district, address.city, address.postalCode, address.countryCode), address.note);
  }

  static String itemQuantity(CompanionData.Item item) {
    String unit;
    switch (item.unit) {
      case "piece": unit = "adet"; break;
      case "pack": unit = "paket"; break;
      case "box": unit = "kutu"; break;
      case "meter": unit = "metre"; break;
      case "other": unit = "diğer"; break;
      default: unit = item.unit;
    }
    return java.math.BigDecimal.valueOf(item.quantity).stripTrailingZeros().toPlainString() + " " + unit;
  }

  static String missing(String value) { return value == null || value.isEmpty() ? "Belirtilmemiş" : value; }

  private static String date(String value) {
    return value == null || value.isEmpty() ? "Belirtilmemiş" : AndroidPresentation.shortTimestamp(value);
  }

  private static String source(String value) {
    if ("web-online-sales".equals(value)) return "Online satış";
    if ("web-dealer".equals(value)) return "Bayi siparişi";
    return "desktop".equals(value) ? "Masaüstü" : "Diğer";
  }

  private static String channel(String value) {
    if ("website".equals(value)) return "Web sitesi";
    if ("instagram".equals(value)) return "Instagram";
    if ("whatsapp".equals(value)) return "WhatsApp";
    return "sms".equals(value) ? "SMS" : "Belirtilmemiş";
  }

  private static String orderStatus(String value) {
    if ("placed".equals(value)) return "Onay bekliyor";
    if ("confirmed".equals(value)) return "Onaylandı";
    if ("fulfilled".equals(value)) return "Tamamlandı";
    return "cancelled".equals(value) ? "İptal edildi" : "Durum bilinmiyor";
  }

  private static String shipmentStatus(String value) {
    if ("draft".equals(value)) return "Taslak";
    if ("ready".equals(value)) return "Hazır";
    if ("dispatched".equals(value)) return "Gönderildi";
    if ("delivered".equals(value)) return "Teslim edildi";
    return "cancelled".equals(value) ? "İptal edildi" : "Durum bilinmiyor";
  }

  private static String publicationStatus(String value) {
    if ("publishing".equals(value)) return "Yayınlanıyor";
    if ("published".equals(value)) return "Yayında";
    if ("unpublished".equals(value)) return "Yayından kaldırıldı";
    return "failed".equals(value) ? "Başarısız" : "Taslak";
  }

  private static String scheduleStatus(String value) {
    if ("active".equals(value)) return "Aktif";
    if ("paused".equals(value)) return "Duraklatıldı";
    if ("completed".equals(value)) return "Tamamlandı";
    return "cancelled".equals(value) ? "İptal edildi" : "Durum bilinmiyor";
  }

  private static String campaignStatus(String value) {
    if ("draft".equals(value)) return "Taslak";
    if ("prepared".equals(value)) return "Hazır";
    if ("running".equals(value)) return "Çalışıyor";
    return scheduleStatus(value);
  }

  private static String executionStatus(String value) {
    if ("pending".equals(value)) return "Bekliyor";
    if ("claimed".equals(value)) return "İşleniyor";
    if ("succeeded".equals(value)) return "Başarılı";
    if ("skipped".equals(value)) return "Atlandı";
    return "failed".equals(value) ? "Başarısız" : "Kayıt yok";
  }
}
