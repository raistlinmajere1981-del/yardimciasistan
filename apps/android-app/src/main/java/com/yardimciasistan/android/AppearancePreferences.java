package com.yardimciasistan.android;

import android.content.SharedPreferences;

/** Per-device, offline appearance settings. Never enter the business sync snapshot. */
final class AppearancePreferences {
  static final String KEY_FONT_PERCENT = "appearance_font_percent_v1";
  static final String KEY_ACCENT = "appearance_accent_v1";
  static final String KEY_HIGH_CONTRAST = "appearance_high_contrast_v1";
  static final int[] FONT_OPTIONS = {90, 100, 115, 130, 150};

  enum Accent {
    GREEN("green", "Yeşil"),
    BLUE("blue", "Mavi"),
    WARM("warm", "Sıcak"),
    VIOLET("violet", "Mor");

    final String key;
    final String label;
    Accent(String key, String label) { this.key = key; this.label = label; }
    static Accent parse(String value) {
      for (Accent accent : values()) if (accent.key.equals(value)) return accent;
      return GREEN;
    }
  }

  final int fontPercent;
  final Accent accent;
  final boolean highContrast;

  AppearancePreferences(int fontPercent, Accent accent, boolean highContrast) {
    this.fontPercent = supportedFontPercent(fontPercent);
    this.accent = accent == null ? Accent.GREEN : accent;
    this.highContrast = highContrast;
  }

  static AppearancePreferences defaults() { return new AppearancePreferences(100, Accent.GREEN, false); }

  static AppearancePreferences load(SharedPreferences preferences) {
    return new AppearancePreferences(
        preferences.getInt(KEY_FONT_PERCENT, 100),
        Accent.parse(preferences.getString(KEY_ACCENT, Accent.GREEN.key)),
        preferences.getBoolean(KEY_HIGH_CONTRAST, false)
    );
  }

  static int supportedFontPercent(int percent) {
    for (int allowed : FONT_OPTIONS) if (allowed == percent) return percent;
    return 100;
  }

  static float combinedFontScale(float systemScale, int percent) {
    float base = Float.isFinite(systemScale) && systemScale > 0 ? systemScale : 1.0f;
    return Math.min(3.0f, Math.max(0.5f, base * supportedFontPercent(percent) / 100f));
  }

  AppearancePreferences withFontPercent(int value) {
    return new AppearancePreferences(value, accent, highContrast);
  }

  AppearancePreferences withAccent(Accent value) {
    return new AppearancePreferences(fontPercent, value, highContrast);
  }

  AppearancePreferences withHighContrast(boolean value) {
    return new AppearancePreferences(fontPercent, accent, value);
  }

  boolean save(SharedPreferences preferences) {
    return preferences.edit()
        .putInt(KEY_FONT_PERCENT, fontPercent)
        .putString(KEY_ACCENT, accent.key)
        .putBoolean(KEY_HIGH_CONTRAST, highContrast)
        .commit();
  }
}
