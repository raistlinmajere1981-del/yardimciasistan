package com.yardimciasistan.android;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class NativeSearchListTest {
  @Test
  public void supportsTurkishCaseAndTrimmedQueries() {
    assertTrue(NativeSearchList.matches("  ışıL ", "Işıl Kaya"));
    assertTrue(NativeSearchList.matches("İZMİR", "İzmir"));
    assertTrue(NativeSearchList.matches("oda 104", "Oda 104 · Rezerve"));
    assertTrue(NativeSearchList.matches("", null));
  }

  @Test
  public void filtersOnlyExistingVisibleSnapshotContent() {
    assertFalse(NativeSearchList.matches("oda 105", "Oda 104"));
    assertFalse(NativeSearchList.matches("bilinmeyen", null));
    assertTrue(NativeSearchList.matches(null, "Herhangi bir kayıt"));
  }
}
