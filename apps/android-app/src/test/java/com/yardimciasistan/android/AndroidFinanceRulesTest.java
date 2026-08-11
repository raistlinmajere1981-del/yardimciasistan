package com.yardimciasistan.android;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public final class AndroidFinanceRulesTest {
  @Test
  public void parsesTurkishAndDotDecimalAmountsIntoMinorUnits() {
    assertEquals(125050L, FinanceWorkspace.parseAmountMinor("1250.50"));
    assertEquals(125050L, FinanceWorkspace.parseAmountMinor("1250,50"));
    assertEquals(9900L, FinanceWorkspace.parseAmountMinor("99"));
  }

  @Test
  public void rejectsInvalidOrNonPositiveAmounts() {
    assertEquals(-1L, FinanceWorkspace.parseAmountMinor(""));
    assertEquals(-1L, FinanceWorkspace.parseAmountMinor("0"));
    assertEquals(-1L, FinanceWorkspace.parseAmountMinor("abc"));
  }
}
