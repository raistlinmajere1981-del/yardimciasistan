package com.yardimciasistan.android;

import org.json.JSONArray;

import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Date;
import java.util.List;
import java.util.Locale;

final class AndroidPresentation {
  private AndroidPresentation() {}

  static boolean isPriorityTask(OperationData.TaskRecord task) {
    if (!"pending".equals(task.status)) return false;
    String today = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());
    return task.dueDate.isEmpty() || task.dueDate.compareTo(today) <= 0;
  }

  static String requestDate(OperationData.RequestRecord request) {
    String dates = !request.dateText.isEmpty() ? request.dateText : joinDateRange(request.startDate, request.endDate);
    if (dates.isEmpty()) dates = shortTimestamp(request.createdAt);
    if (!request.time.isEmpty()) dates += " · " + request.time;
    return dates.isEmpty() ? "Tarih belirtilmemiş" : dates;
  }

  static String joinDateRange(String start, String end) {
    if (start == null || start.isEmpty()) return end == null ? "" : end;
    if (end == null || end.isEmpty() || start.equals(end)) return start;
    return start + " → " + end;
  }

  static String reportPresetLabel(String preset) {
    if ("today".equals(preset)) return "Bugün";
    if ("yesterday".equals(preset)) return "Dün";
    if ("last30".equals(preset)) return "Son 30 Gün";
    return "Son 7 Gün";
  }

  static String formatReportPeriod(String start, String end) {
    String formattedStart = formatReportDate(start);
    String formattedEnd = formatReportDate(end);
    return formattedStart.equals(formattedEnd) ? formattedStart : formattedStart + " – " + formattedEnd;
  }

  static String formatReportDate(String value) {
    if (value == null || !value.matches("\\d{4}-\\d{2}-\\d{2}")) return value == null ? "" : value;
    try {
      SimpleDateFormat source = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
      source.setLenient(false);
      Date date = source.parse(value);
      return date == null ? value : new SimpleDateFormat("d MMM yyyy", new Locale("tr", "TR")).format(date);
    } catch (Exception ignored) {
      return value;
    }
  }

  static String joinNonEmpty(String separator, String... values) {
    StringBuilder result = new StringBuilder();
    for (String value : values) {
      if (value == null || value.trim().isEmpty()) continue;
      if (result.length() > 0) result.append(separator);
      result.append(value.trim());
    }
    return result.toString();
  }

  static boolean canTransitionCustomerRoomStay(OperationData.CustomerRoomStayRecord stay) {
    return stay != null && (
        "planned".equals(stay.status)
        || "checked_in".equals(stay.status)
        || "cancelled".equals(stay.status)
    );
  }

  static boolean hasCustomerIdentityDetails(OperationData.CustomerRecord customer) {
    return !customerIdentitySummary(customer).isEmpty()
        || !customer.nationality.isEmpty()
        || !customer.birthDate.isEmpty()
        || !customer.gender.isEmpty()
        || !customer.documentExpiryDate.isEmpty()
        || !customer.birthPlace.isEmpty()
        || !customer.motherName.isEmpty()
        || !customer.fatherName.isEmpty()
        || !customer.issuingAuthority.isEmpty()
        || !customer.address.isEmpty();
  }

  static String customerIdentitySummary(OperationData.CustomerRecord customer) {
    return joinNonEmpty(
        " · ",
        formatIdentityType(customer.identityType),
        customer.identityNumber,
        customer.documentSerialNumber
    );
  }

  static JSONArray parseCustomerTags(String source) {
    JSONArray result = new JSONArray();
    if (source == null || source.trim().isEmpty()) return result;
    java.util.HashSet<String> seen = new java.util.HashSet<>();
    for (String raw : source.split("[,;\\n]")) {
      String tag = raw.trim();
      String key = tag.toLowerCase(new Locale("tr", "TR"));
      if (!tag.isEmpty() && tag.length() <= 40 && seen.add(key) && result.length() < 20) result.put(tag);
    }
    return result;
  }

  static boolean isIsoDate(String value) {
    if (value == null || !value.matches("\\d{4}-\\d{2}-\\d{2}")) return false;
    try {
      SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
      format.setLenient(false);
      return format.parse(value) != null;
    } catch (Exception ignored) {
      return false;
    }
  }

  static String reservationMessage(OperationData.ReservationRecord reservation) {
    return "Merhaba " + reservation.customerName + ", " + joinDateRange(reservation.startDate, reservation.endDate)
        + " tarihli rezervasyonunuz hakkında size ulaşıyoruz.";
  }

  static String shortTimestamp(String value) {
    if (value == null || value.trim().isEmpty()) return "";
    String normalized = value.trim();
    DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm", Locale.ROOT)
        .withZone(ZoneId.systemDefault());
    try {
      return formatter.format(Instant.parse(normalized));
    } catch (Exception ignored) {
      try {
        return formatter.format(OffsetDateTime.parse(normalized).toInstant());
      } catch (Exception ignoredAgain) {
        String text = normalized.replace("T", " ");
        int zone = text.indexOf('+', 10);
        if (zone > 0) text = text.substring(0, zone);
        if (text.endsWith("Z")) text = text.substring(0, text.length() - 1);
        return text.length() > 16 ? text.substring(0, 16) : text;
      }
    }
  }

  static String ellipsize(String value, int length) {
    if (value == null) return "";
    String normalized = value.trim();
    return normalized.length() <= length ? normalized : normalized.substring(0, Math.max(0, length - 1)) + "…";
  }

  static String money(double value, String currency) {
    if ("TRY".equalsIgnoreCase(currency)) {
      NumberFormat format = NumberFormat.getCurrencyInstance(new Locale("tr", "TR"));
      return format.format(value);
    }
    return String.format(new Locale("tr", "TR"), "%.2f %s", value, currency == null ? "" : currency);
  }

  static String orderCurrency(OperationData.TableOrder order) {
    return order.items.isEmpty() ? "TRY" : order.items.get(0).currency;
  }

  static String formatRequestType(String value) {
    if ("pension_reservation".equals(value)) return "Pansiyon rezervasyonu";
    if ("restaurant_reservation".equals(value)) return "Masa rezervasyonu";
    if ("breakfast_request".equals(value)) return "Kahvaltı talebi";
    if ("price_question".equals(value)) return "Fiyat sorusu";
    if ("location_question".equals(value)) return "Konum sorusu";
    if ("qr_menu_question".equals(value)) return "Menü sorusu";
    if ("general_info".equals(value)) return "Bilgi talebi";
    return "Diğer talep";
  }

  static String formatRequestStatus(String value) {
    if ("new".equals(value)) return "Yeni";
    if ("seen".equals(value)) return "Görüldü";
    if ("waiting_owner".equals(value)) return "Sizi bekliyor";
    if ("waiting_customer".equals(value)) return "Müşteri bekleniyor";
    if ("approved".equals(value)) return "Onaylandı";
    if ("rejected".equals(value)) return "Reddedildi";
    if ("answered".equals(value)) return "Cevaplandı";
    if ("converted_to_reservation".equals(value)) return "Rezervasyona çevrildi";
    if ("cancelled".equals(value)) return "İptal";
    return value == null || value.isEmpty() ? "Bekliyor" : value;
  }

  static String formatReservationStatus(String value) {
    if ("pending".equals(value)) return "Bekliyor";
    if ("approved".equals(value)) return "Onaylı";
    if ("rejected".equals(value)) return "Reddedildi";
    if ("cancelled".equals(value)) return "İptal";
    if ("completed".equals(value)) return "Tamamlandı";
    return value;
  }

  static String formatRoomStatus(String value) {
    if ("available".equals(value)) return "Boş";
    if ("occupied".equals(value)) return "Dolu";
    if ("reserved".equals(value)) return "Rezerve";
    if ("cleaning".equals(value)) return "Temizlik";
    if ("maintenance".equals(value)) return "Bakım";
    return value;
  }

  static String formatCustomerRoomStayStatus(String value) {
    if ("planned".equals(value)) return "Planlı";
    if ("checked_in".equals(value)) return "Konaklıyor";
    if ("checked_out".equals(value)) return "Çıkış yapıldı";
    if ("cancelled".equals(value)) return "İptal";
    return value == null ? "" : value;
  }

  static String formatIdentityType(String value) {
    if ("tc_identity_card".equals(value)) return "T.C. kimlik kartı";
    if ("passport".equals(value)) return "Pasaport";
    if ("other".equals(value)) return "Diğer kimlik belgesi";
    return "";
  }

  static String formatCustomerGender(String value) {
    if ("female".equals(value)) return "Kadın";
    if ("male".equals(value)) return "Erkek";
    if ("unspecified".equals(value)) return "Belirtilmedi";
    return "";
  }

  static String formatTableStatus(String value) {
    if ("available".equals(value)) return "Boş";
    if ("occupied".equals(value)) return "Dolu";
    if ("reserved".equals(value)) return "Rezerve";
    if ("bill_waiting".equals(value)) return "Hesap";
    if ("cleaning".equals(value)) return "Temizlik";
    return value;
  }

  static String formatTaskStatus(String value) {
    if ("pending".equals(value)) return "Bekliyor";
    if ("done".equals(value)) return "Tamamlandı";
    if ("cancelled".equals(value)) return "İptal";
    return value;
  }

  static String formatOrderStatus(String value) {
    if ("open".equals(value)) return "Açık";
    if ("preparing".equals(value)) return "Hazırlanıyor";
    if ("served".equals(value)) return "Servis edildi";
    if ("payment".equals(value)) return "Hesap bekliyor";
    if ("paid".equals(value)) return "Ödendi";
    if ("cancelled".equals(value)) return "İptal";
    return value;
  }

  static String formatActionStatus(String value) {
    if ("pending".equals(value)) return "Bekliyor";
    if ("applied".equals(value)) return "Uygulandı";
    if ("failed".equals(value)) return "Uygulanamadı";
    return value;
  }

  static String formatActionType(String value) {
    if (MarketUiRules.ACTION_STOCK_COUNT.equals(value)) return "Market stok sayımı";
    if (MarketUiRules.ACTION_PURCHASE_RECEIVE.equals(value)) return "Market mal kabulü";
    if (MarketUiRules.ACTION_PRODUCT_CREATE.equals(value)) return "Yeni ürün";
    if (MarketUiRules.ACTION_CART_DRAFT_CREATE.equals(value)) return "Market sepet taslağı";
    if ("customer_create".equals(value)) return "Müşteri oluşturma";
    if ("customer_update".equals(value)) return "Müşteri güncelleme";
    if ("customer_room_assign".equals(value)) return "Müşteri-oda ataması";
    if ("customer_room_stay_status".equals(value)) return "Konaklama durumu";
    if (value.startsWith("customer_request")) return "Müşteri talebi";
    if (value.startsWith("reservation")) return "Rezervasyon";
    if (value.startsWith("room")) return "Oda durumu";
    if (value.startsWith("daily_task")) return "Günlük iş";
    if (value.startsWith("table_order")) return "Masa siparişi";
    if (value.startsWith("table")) return "Masa durumu";
    return "Telefon işlemi";
  }

  static int requestTone(String status) {
    if ("new".equals(status) || "seen".equals(status)) return UiKit.INFO;
    if ("waiting_owner".equals(status) || "waiting_customer".equals(status)) return UiKit.WARNING;
    if ("approved".equals(status) || "answered".equals(status) || "converted_to_reservation".equals(status)) return UiKit.SUCCESS;
    if ("rejected".equals(status) || "cancelled".equals(status)) return UiKit.DANGER;
    return UiKit.MUTED;
  }

  static int reservationTone(String status) {
    if ("pending".equals(status)) return UiKit.WARNING;
    if ("approved".equals(status) || "completed".equals(status)) return UiKit.SUCCESS;
    if ("rejected".equals(status) || "cancelled".equals(status)) return UiKit.DANGER;
    return UiKit.MUTED;
  }

  static int resourceTone(String status) {
    if ("available".equals(status)) return UiKit.SUCCESS;
    if ("occupied".equals(status)) return UiKit.INFO;
    if ("reserved".equals(status) || "bill_waiting".equals(status)) return UiKit.WARNING;
    if ("maintenance".equals(status)) return UiKit.DANGER;
    return UiKit.MUTED;
  }

  static int customerRoomStayTone(String status) {
    if ("planned".equals(status)) return UiKit.WARNING;
    if ("checked_in".equals(status)) return UiKit.INFO;
    if ("checked_out".equals(status)) return UiKit.SUCCESS;
    return UiKit.MUTED;
  }

  static int taskTone(String status) {
    if ("done".equals(status)) return UiKit.SUCCESS;
    if ("cancelled".equals(status)) return UiKit.DANGER;
    return UiKit.WARNING;
  }

  static int orderTone(String status) {
    if ("payment".equals(status)) return UiKit.WARNING;
    if ("served".equals(status)) return UiKit.SUCCESS;
    if ("preparing".equals(status)) return UiKit.ACCENT;
    return UiKit.INFO;
  }

  static String formatStockStatus(String status) {
    if ("out_of_stock".equals(status)) return "Stokta yok";
    if ("low_stock".equals(status)) return "Az stok";
    return "Stokta var";
  }

  static int stockTone(String status) {
    if ("out_of_stock".equals(status)) return UiKit.DANGER;
    if ("low_stock".equals(status)) return UiKit.WARNING;
    return UiKit.SUCCESS;
  }

  static String stockNumber(double value) {
    if (Math.rint(value) == value) return String.valueOf((long) value);
    return String.format(new Locale("tr", "TR"), "%.4f", value).replaceAll("0+$", "").replaceAll("[,\\.]$", "");
  }

  static String stockUnitLabel(String unit) {
    return "piece".equals(unit) ? "adet" : unit;
  }

  static String stockQuantity(double value, String unit) {
    return stockNumber(value) + " " + stockUnitLabel(unit);
  }

  static int pendingActionCount(List<OperationData.ActionRecord> actions) {
    int count = 0;
    for (OperationData.ActionRecord action : actions) {
      if ("pending".equals(action.status)) count += 1;
    }
    return count;
  }

  static int actionTone(String status) {
    if ("applied".equals(status)) return UiKit.SUCCESS;
    if ("failed".equals(status)) return UiKit.DANGER;
    return UiKit.WARNING;
  }
}
