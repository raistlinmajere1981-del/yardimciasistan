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
      if (NIGHT.storedValue.equals(value)) {
        return NIGHT;
      }
      // Unknown values intentionally fall back to day. Future SYSTEM/AUTO modes can
      // be added here without changing the persistence or token consumers.
      return DAY;
    }
  }

  private AppTheme() {}

  static Mode load(SharedPreferences preferences) {
    return Mode.fromStoredValue(preferences.getString(KEY_MODE, Mode.DAY.storedValue));
  }

  static boolean save(SharedPreferences preferences, Mode mode) {
    return preferences.edit().putString(KEY_MODE, mode.storedValue).commit();
  }

  static ThemeTokens tokens(Mode mode) {
    return mode == Mode.DAY ? ThemeTokens.day() : ThemeTokens.night();
  }
  static ThemeTokens tokens(Mode mode, AppearancePreferences appearance) {
    return ThemeTokens.withAppearance(tokens(mode), mode, appearance);
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

  static ThemeTokens withAppearance(
      ThemeTokens base, AppTheme.Mode mode, AppearancePreferences appearance) {
    if (appearance == null) return base;
    boolean night = mode == AppTheme.Mode.NIGHT;
    boolean high = appearance.highContrast;
    int accent = base.accent;
    int pressed = base.accentPressed;
    int onAccent = base.accentText;

    switch (appearance.accent) {
      case BLUE:
        accent = night ? 0xFF93C5FD : 0xFF1D4ED8;
        pressed = night ? 0xFF60A5FA : 0xFF1E40AF;
        onAccent = night ? 0xFF08192B : 0xFFFFFFFF;
        break;
      case WARM:
        accent = night ? 0xFFFDE047 : 0xFF9A3412;
        pressed = night ? 0xFFFACC15 : 0xFF7C2D12;
        onAccent = night ? 0xFF302000 : 0xFFFFFFFF;
        break;
      case VIOLET:
        accent = night ? 0xFFDDD6FE : 0xFF6D28D9;
        pressed = night ? 0xFFC4B5FD : 0xFF5B21B6;
        onAccent = night ? 0xFF21113B : 0xFFFFFFFF;
        break;
      case GREEN:
        if (high) {
          accent = night ? 0xFF5EEAD4 : 0xFF0B766A;
          pressed = night ? 0xFF2DD4BF : 0xFF075E54;
          onAccent = night ? 0xFF062E2A : 0xFFFFFFFF;
        }
        break;
    }
    if (!high && appearance.accent == AppearancePreferences.Accent.GREEN) return base;
    return new ThemeTokens(
        high ? (night ? 0xFF000000 : 0xFFFFFFFF) : base.appBackground,
        high ? (night ? 0xFF080808 : 0xFFFFFFFF) : base.surface,
        high ? (night ? 0xFF101010 : 0xFFFFFFFF) : base.cardBackground,
        high ? (night ? 0xFF161616 : 0xFFFFFFFF) : base.elevatedCard,
        high ? (night ? 0xFF94A3B8 : 0xFF334155) : base.border,
        high ? (night ? 0xFFFFFFFF : 0xFF0B1220) : base.textPrimary,
        high ? (night ? 0xFFF1F5F9 : 0xFF1E293B) : base.textSecondary,
        high ? (night ? 0xFFCBD5E1 : 0xFF334155) : base.textMuted,
        accent,
        pressed,
        onAccent,
        base.success, base.warning, base.danger, base.info,
        high ? (night ? 0xFF1F2937 : 0xFFE2E8F0) : base.disabledBackground,
        high ? (night ? 0xFFCBD5E1 : 0xFF475569) : base.disabledText,
        high ? (night ? 0xFF080808 : 0xFFFFFFFF) : base.bottomNavBackground,
        accent,
        high ? (night ? 0xFFCBD5E1 : 0xFF334155) : base.bottomNavInactive,
        high ? (night ? 0xFF101010 : 0xFFFFFFFF) : base.iconButtonBackground,
        high ? (night ? 0xFFFFFFFF : 0xFF0B1220) : base.iconButtonForeground,
        high ? (night ? 0xFF161616 : 0xFFFFFFFF) : base.chipBackground,
        accent,
        high ? (night ? 0xFFFFFFFF : 0xFF0B1220) : base.chipText,
        onAccent,
        base.secondaryAccent, base.secondaryAccentText,
        base.dangerBackground, base.dangerText
    );
  }

  static ThemeTokens night() {
    return new ThemeTokens(
        0xFF111C19,
        0xFF1B2A25,
        0xFF1B2A25,
        0xFF21342C,
        0xFF3B5147,
        0xFFF0F8F3,
        0xFFBACDC3,
        0xFFBACDC3,
        0xFF75DBB4,
        0xFF5BCFA4,
        0xFF10261E,
        0xFF66D6A6,
        0xFFFFC978,
        0xFFFFB0A9,
        0xFFA2D3ED,
        0xFF263E34,
        0xFF8BA89A,
        0xFF1B2A25,
        0xFF75DBB4,
        0xFFBACDC3,
        0xFF1B2A25,
        0xFFF0F8F3,
        0xFF1B2A25,
        0xFF24473A,
        0xFFBACDC3,
        0xFF75DBB4,
        0xFFA2D3ED,
        0xFF10261E,
        0xFF412623,
        0xFFFFB0A9
    );
  }

  static ThemeTokens day() {
    return new ThemeTokens(
        0xFFF6F8F5,
        0xFFFFFFFF,
        0xFFFFFFFF,
        0xFFFFFFFF,
        0xFFE5EDE8,
        0xFF152A28,
        0xFF617570,
        0xFF617570,
        0xFF116D61,
        0xFF09564C,
        0xFFFFFFFF,
        0xFF17765E,
        0xFF9D5A16,
        0xFFB63B37,
        0xFF286B97,
        0xFFEDF3EE,
        0xFF71817A,
        0xFFFFFFFF,
        0xFF116D61,
        0xFF536E63,
        0xFFFFFFFF,
        0xFF152A28,
        0xFFFFFFFF,
        0xFFE3F3ED,
        0xFF617570,
        0xFF116D61,
        0xFF286B97,
        0xFFFFFFFF,
        0xFFFFF0EE,
        0xFFB63B37
    );
  }
}
