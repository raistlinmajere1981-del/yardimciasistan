package com.yardimciasistan.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;

import org.junit.Test;

import java.util.Calendar;

public final class NativeDateTimePickerTest {
  @Test
  public void writesCanonicalIsoDateRegardlessOfTurkishUi() {
    Calendar parsed = NativeDateTimePicker.parseDate("2024-02-29");
    assertEquals("2024-02-29", NativeDateTimePicker.key(parsed));
    parsed.add(Calendar.DAY_OF_MONTH, 1);
    assertEquals("2024-03-01", NativeDateTimePicker.key(parsed));
  }

  @Test
  public void invalidCalendarDayIsNeverAcceptedAsEntered() {
    assertNotEquals("2026-02-30", NativeDateTimePicker.key(
        NativeDateTimePicker.parseDate("2026-02-30")));
  }
}
