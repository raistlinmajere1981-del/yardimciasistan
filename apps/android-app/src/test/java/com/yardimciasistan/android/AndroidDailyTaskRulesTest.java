package com.yardimciasistan.android;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public final class AndroidDailyTaskRulesTest {
  @Test
  public void validatesTitleDateAndTime() {
    assertEquals("Başlık boş olamaz.", DailyTaskEditorDialog.validate("", "", "", ""));
    assertEquals("", DailyTaskEditorDialog.validate("Oda 103 kontrol", "Havlu bırakılacak", "2036-05-10", "09:30"));
    assertEquals("Geçerli tarih seçin.", DailyTaskEditorDialog.validate("Kontrol", "", "2036-02-31", ""));
    assertEquals("Geçerli saat seçin.", DailyTaskEditorDialog.validate("Kontrol", "", "", "25:00"));
  }

  @Test
  public void mapsEditorAreaToManualTaskType() {
    assertEquals("manual_pension", DailyTaskEditorDialog.taskType(DailyTaskEditorDialog.Kind.PENSION));
    assertEquals("manual_restaurant", DailyTaskEditorDialog.taskType(DailyTaskEditorDialog.Kind.RESTAURANT));
  }
}
