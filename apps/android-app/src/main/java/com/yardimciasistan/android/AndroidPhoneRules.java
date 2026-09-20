package com.yardimciasistan.android;

final class AndroidPhoneRules {
  private AndroidPhoneRules() {}

  static String normalizeWhatsAppPhone(String phone) {
    String digits = phone == null ? "" : phone.replaceAll("[^0-9]", "");
    if (digits.startsWith("00")) {
      digits = digits.substring(2);
    }
    if (digits.startsWith("0") && digits.length() == 11) {
      return "90" + digits.substring(1);
    }
    if (digits.length() == 10) {
      return "90" + digits;
    }
    return digits;
  }
}
