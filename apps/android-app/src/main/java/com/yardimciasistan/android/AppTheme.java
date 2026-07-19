package com.yardimciasistan.android;

import android.content.SharedPreferences;

final class AppTheme {
  static final String KEY_MODE = "app_theme_mode";

  enum Mode {
    DAY("day", "Gündüz Modu", "Gece moduna geç"),
    NIGHT("night", "Gece Modu", "Gündüz moduna geç");

    final String storedValue;
    final String label;
    final String switchDescription;

    Mode(String storedValue, String label, String switchDescription) {
      this.storedValue = storedValue;
      this.label = label;
      this.switchDescription = switchDescription;
    }

    Mode toggled() {
      return this == NIGHT ? DAY : NIGHT;
    }

    static Mode fromStoredValue(String value) {
      if (DAY.storedValue.equals(value)) {
        return DAY;
      }
      // Unknown values intentionally fall back to night. Future SYSTEM/AUTO modes can
      // be added here without changing the persistence or token consumers.
      return NIGHT;
    }
  }

  private AppTheme() {}

  static Mode load(SharedPreferences preferences) {
    return Mode.fromStoredValue(preferences.getString(KEY_MODE, Mode.NIGHT.storedValue));
  }

  static boolean save(SharedPreferences preferences, Mode mode) {
    return preferences.edit().putString(KEY_MODE, mode.storedValue).commit();
  }

  static ThemeTokens tokens(Mode mode) {
    return mode == Mode.DAY ? ThemeTokens.day() : ThemeTokens.night();
  }
}

final class ThemeTokens {
  final int appBackground;
  final int surface;
  final int cardBackground;
  final int elevatedCard;
  final int border;
  final int textPrimary;
  final int textSecondary;
  final int textMuted;
  final int accent;
  final int accentPressed;
  final int accentText;
  final int success;
  final int warning;
  final int danger;
  final int info;
  final int disabledBackground;
  final int disabledText;
  final int bottomNavBackground;
  final int bottomNavActive;
  final int bottomNavInactive;
  final int iconButtonBackground;
  final int iconButtonForeground;
  final int chipBackground;
  final int chipActiveBackground;
  final int chipText;
  final int chipActiveText;
  final int secondaryAccent;
  final int secondaryAccentText;
  final int dangerBackground;
  final int dangerText;

  private ThemeTokens(
      int appBackground,
      int surface,
      int cardBackground,
      int elevatedCard,
      int border,
      int textPrimary,
      int textSecondary,
      int textMuted,
      int accent,
      int accentPressed,
      int accentText,
      int success,
      int warning,
      int danger,
      int info,
      int disabledBackground,
      int disabledText,
      int bottomNavBackground,
      int bottomNavActive,
      int bottomNavInactive,
      int iconButtonBackground,
      int iconButtonForeground,
      int chipBackground,
      int chipActiveBackground,
      int chipText,
      int chipActiveText,
      int secondaryAccent,
      int secondaryAccentText,
      int dangerBackground,
      int dangerText
  ) {
    this.appBackground = appBackground;
    this.surface = surface;
    this.cardBackground = cardBackground;
    this.elevatedCard = elevatedCard;
    this.border = border;
    this.textPrimary = textPrimary;
    this.textSecondary = textSecondary;
    this.textMuted = textMuted;
    this.accent = accent;
    this.accentPressed = accentPressed;
    this.accentText = accentText;
    this.success = success;
    this.warning = warning;
    this.danger = danger;
    this.info = info;
    this.disabledBackground = disabledBackground;
    this.disabledText = disabledText;
    this.bottomNavBackground = bottomNavBackground;
    this.bottomNavActive = bottomNavActive;
    this.bottomNavInactive = bottomNavInactive;
    this.iconButtonBackground = iconButtonBackground;
    this.iconButtonForeground = iconButtonForeground;
    this.chipBackground = chipBackground;
    this.chipActiveBackground = chipActiveBackground;
    this.chipText = chipText;
    this.chipActiveText = chipActiveText;
    this.secondaryAccent = secondaryAccent;
    this.secondaryAccentText = secondaryAccentText;
    this.dangerBackground = dangerBackground;
    this.dangerText = dangerText;
  }

  static ThemeTokens night() {
    return new ThemeTokens(
        0xFF0B1220,
        0xFF111827,
        0xFF1A2638,
        0xFF202C40,
        0xFF2E3B52,
        0xFFF3F6FA,
        0xFFAAB6C8,
        0xFF7D8AA0,
        0xFF38D0BE,
        0xFF2AB8A8,
        0xFF062E2A,
        0xFF34D399,
        0xFFFBBF24,
        0xFFF87171,
        0xFF60A5FA,
        0xFF253044,
        0xFF8290A5,
        0xFF111827,
        0xFF38D0BE,
        0xFF7D8AA0,
        0xFF202C40,
        0xFFF3F6FA,
        0xFF202C40,
        0xFF38D0BE,
        0xFFF3F6FA,
        0xFF062E2A,
        0xFFFB923C,
        0xFF431407,
        0xFF451F29,
        0xFFFFA0A0
    );
  }

  static ThemeTokens day() {
    return new ThemeTokens(
        0xFFF4F0E7,
        0xFFFFFDF8,
        0xFFFFFFFF,
        0xFFFFFFFF,
        0xFFD8D1C4,
        0xFF1E293B,
        0xFF475569,
        0xFF64748B,
        0xFF0F9F8F,
        0xFF0B766A,
        0xFF042B27,
        0xFF15803D,
        0xFFB45309,
        0xFFDC2626,
        0xFF2563EB,
        0xFFE3DED4,
        0xFF7C8796,
        0xFFFFFDF8,
        0xFF0F9F8F,
        0xFF64748B,
        0xFFFFFFFF,
        0xFF1E293B,
        0xFFFFFFFF,
        0xFF0F9F8F,
        0xFF1E293B,
        0xFF042B27,
        0xFFC2410C,
        0xFFFFFFFF,
        0xFFFFE8E8,
        0xFFB91C1C
    );
  }
}
