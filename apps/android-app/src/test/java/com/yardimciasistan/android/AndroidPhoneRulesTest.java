package com.yardimciasistan.android;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public final class AndroidPhoneRulesTest {
  @Test
  public void preservesInternationalCountryCodesForWhatsApp() {
    assertEquals("447911123456", AndroidPhoneRules.normalizeWhatsAppPhone("+44 7911 123456"));
    assertEquals("12025550123", AndroidPhoneRules.normalizeWhatsAppPhone("+1 202 555 0123"));
  }

  @Test
  public void convertsDoubleZeroInternationalPrefixForWhatsApp() {
    assertEquals("447911123456", AndroidPhoneRules.normalizeWhatsAppPhone("0044 7911 123456"));
    assertEquals("905321234567", AndroidPhoneRules.normalizeWhatsAppPhone("0090 532 123 45 67"));
  }

  @Test
  public void keepsTurkeyLocalConvenienceFormatsWorking() {
    assertEquals("905321234567", AndroidPhoneRules.normalizeWhatsAppPhone("0532 123 45 67"));
    assertEquals("905321234567", AndroidPhoneRules.normalizeWhatsAppPhone("532 123 45 67"));
    assertEquals("905321234567", AndroidPhoneRules.normalizeWhatsAppPhone("+90 532 123 45 67"));
  }

  @Test
  public void emptyPhoneStaysEmpty() {
    assertEquals("", AndroidPhoneRules.normalizeWhatsAppPhone(""));
    assertEquals("", AndroidPhoneRules.normalizeWhatsAppPhone(null));
  }
}
