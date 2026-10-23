package com.yardimciasistan.dealer;

import static org.junit.Assert.*;

import org.junit.Test;

public class DealerAppearanceTest {
  @Test
  public void allUserChoicesRoundTripAsOneDeviceProfile() {
    for (String theme : new String[] {"system", "light", "dark"})
      for (String accent : DealerAppearance.ACCENTS)
        for (int size : DealerAppearance.FONT_OPTIONS)
          for (boolean high : new boolean[] {false, true}) {
            DealerAppearance a = new DealerAppearance(theme, accent, size, high),
                             b = DealerAppearance.decode(a.encode());
            assertEquals(theme, b.theme);
            assertEquals(accent, b.accent);
            assertEquals(size, b.fontPercent);
            assertEquals(high, b.highContrast);
          }
  }
  @Test
  public void brokenOrUnsupportedPreferencesHaveReadableDefaults() {
    DealerAppearance p = DealerAppearance.decode("broken");
    assertEquals("blue", p.accent);
    assertEquals("system", p.theme);
    assertEquals(100, p.fontPercent);
    assertEquals(100, new DealerAppearance("bad", "bad", 999, false).fontPercent);
  }
  @Test
  public void appFontSizeCombinesWithSystemWithoutUnboundedGrowth() {
    assertEquals(1.8f, DealerAppearance.fontScale(1.2f, 150), .001f);
    assertEquals(3f, DealerAppearance.fontScale(3, 150), .001f);
    assertEquals(1, DealerAppearance.fontScale(Float.NaN, 100), .001f);
  }
}
