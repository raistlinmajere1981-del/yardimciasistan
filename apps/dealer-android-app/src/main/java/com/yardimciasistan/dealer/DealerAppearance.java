package com.yardimciasistan.dealer;

import org.json.JSONObject;

/** Device-only appearance policy, shared by every Dealer surface. */
final class DealerAppearance {
  static final int[] FONT_OPTIONS = {90, 100, 115, 130, 150};
  static final String[] ACCENTS = {"blue", "green", "warm", "violet"};
  final String theme, accent;
  final int fontPercent;
  final boolean highContrast;
  DealerAppearance(String theme, String accent, int font, boolean high) {
    this.theme = "dark".equals(theme) || "light".equals(theme) ? theme : "system";
    this.accent = java.util.Arrays.asList(ACCENTS).contains(accent) ? accent : "blue";
    int supported = 100;
    for (int value : FONT_OPTIONS)
      if (font == value)
        supported = value;
    fontPercent = supported;
    highContrast = high;
  }
  static DealerAppearance defaults() {
    return new DealerAppearance("system", "blue", 100, false);
  }
  static DealerAppearance decode(String json) {
    try {
      JSONObject value = new JSONObject(json);
      return new DealerAppearance(value.optString("theme"), value.optString("accent"),
          value.optInt("font", 100), value.optBoolean("high"));
    } catch (Exception error) {
      return defaults();
    }
  }
  String encode() {
    try {
      return new JSONObject()
          .put("theme", theme)
          .put("accent", accent)
          .put("font", fontPercent)
          .put("high", highContrast)
          .toString();
    } catch (Exception error) {
      throw new IllegalStateException("Görünüm kaydedilemedi.");
    }
  }
  static float fontScale(float system, int percent) {
    return Math.min(3f,
        Math.max(.5f,
            (Float.isFinite(system) && system > 0 ? system : 1f)
                * new DealerAppearance("", "", percent, false).fontPercent / 100f));
  }
}
