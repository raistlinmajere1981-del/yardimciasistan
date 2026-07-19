package com.yardimciasistan.android;

public final class AppThemeSmoke {
  private AppThemeSmoke() {}

  public static void main(String[] args) {
    switchesAndFallsBackSafely();
    exposesTheRequestedPalettes();
    keepsCoreTextContrastReadable();
    System.out.println("android-app-theme-smoke-ok");
  }

  private static void switchesAndFallsBackSafely() {
    assertEquals(AppTheme.Mode.NIGHT, AppTheme.Mode.fromStoredValue(null), "null mode fallback");
    assertEquals(AppTheme.Mode.NIGHT, AppTheme.Mode.fromStoredValue("system"), "future mode fallback");
    assertEquals(AppTheme.Mode.DAY, AppTheme.Mode.fromStoredValue("day"), "day persistence value");
    assertEquals(AppTheme.Mode.NIGHT, AppTheme.Mode.DAY.toggled(), "day toggles to night");
    assertEquals(AppTheme.Mode.DAY, AppTheme.Mode.NIGHT.toggled(), "night toggles to day");
    assertEquals("Gece moduna geç", AppTheme.Mode.DAY.switchDescription, "day action description");
    assertEquals("Gündüz moduna geç", AppTheme.Mode.NIGHT.switchDescription, "night action description");
  }

  private static void exposesTheRequestedPalettes() {
    ThemeTokens night = ThemeTokens.night();
    assertColor(0xFF0B1220, night.appBackground, "night background");
    assertColor(0xFF111827, night.surface, "night surface");
    assertColor(0xFF1A2638, night.cardBackground, "night card");
    assertColor(0xFF202C40, night.elevatedCard, "night elevated card");
    assertColor(0xFF2E3B52, night.border, "night border");
    assertColor(0xFFF3F6FA, night.textPrimary, "night primary text");
    assertColor(0xFFAAB6C8, night.textSecondary, "night secondary text");
    assertColor(0xFF7D8AA0, night.textMuted, "night muted text");
    assertColor(0xFF38D0BE, night.accent, "night accent");
    assertColor(0xFF2AB8A8, night.accentPressed, "night pressed accent");
    assertColor(0xFF34D399, night.success, "night success");
    assertColor(0xFFFBBF24, night.warning, "night warning");
    assertColor(0xFFF87171, night.danger, "night danger");
    assertColor(0xFF60A5FA, night.info, "night info");

    ThemeTokens day = ThemeTokens.day();
    assertColor(0xFFF4F0E7, day.appBackground, "day background");
    assertColor(0xFFFFFDF8, day.surface, "day surface");
    assertColor(0xFFFFFFFF, day.cardBackground, "day card");
    assertColor(0xFFFFFFFF, day.elevatedCard, "day elevated card");
    assertColor(0xFFD8D1C4, day.border, "day border");
    assertColor(0xFF1E293B, day.textPrimary, "day primary text");
    assertColor(0xFF475569, day.textSecondary, "day secondary text");
    assertColor(0xFF64748B, day.textMuted, "day muted text");
    assertColor(0xFF0F9F8F, day.accent, "day accent");
    assertColor(0xFF0B766A, day.accentPressed, "day pressed accent");
    assertColor(0xFF15803D, day.success, "day success");
    assertColor(0xFFB45309, day.warning, "day warning");
    assertColor(0xFFDC2626, day.danger, "day danger");
    assertColor(0xFF2563EB, day.info, "day info");

    assertSemanticTokensAreOpaque(night, "night");
    assertSemanticTokensAreOpaque(day, "day");
  }

  private static void keepsCoreTextContrastReadable() {
    for (ThemeTokens tokens : new ThemeTokens[] {ThemeTokens.night(), ThemeTokens.day()}) {
      assertContrast(tokens.textPrimary, tokens.appBackground, 7.0, "primary text/background");
      assertContrast(tokens.textSecondary, tokens.appBackground, 4.5, "secondary text/background");
      assertContrast(tokens.textMuted, tokens.appBackground, 4.0, "muted text/background");
      assertContrast(tokens.accentText, tokens.accent, 4.5, "accent button text");
      assertContrast(tokens.success, tokens.cardBackground, 4.5, "success/card");
      assertContrast(tokens.warning, tokens.cardBackground, 4.5, "warning/card");
      assertContrast(tokens.danger, tokens.cardBackground, 4.5, "danger/card");
      assertContrast(tokens.info, tokens.cardBackground, 4.5, "info/card");
    }
  }

  private static void assertSemanticTokensAreOpaque(ThemeTokens tokens, String label) {
    int[] colors = {
        tokens.disabledBackground,
        tokens.disabledText,
        tokens.bottomNavBackground,
        tokens.bottomNavActive,
        tokens.bottomNavInactive,
        tokens.iconButtonBackground,
        tokens.iconButtonForeground,
        tokens.chipBackground,
        tokens.chipActiveBackground,
        tokens.chipText,
        tokens.chipActiveText
    };
    for (int color : colors) {
      if ((color >>> 24) != 0xFF) {
        throw new AssertionError(label + " semantic token is not opaque: " + hex(color));
      }
    }
    if (tokens.disabledBackground == tokens.appBackground || tokens.disabledText == tokens.textPrimary) {
      throw new AssertionError(label + " disabled tokens are not visually distinct");
    }
  }

  private static void assertContrast(int foreground, int background, double minimum, String message) {
    double ratio = contrastRatio(foreground, background);
    if (ratio + 0.001 < minimum) {
      throw new AssertionError(message + ": expected >= " + minimum + ", actual=" + ratio);
    }
  }

  private static double contrastRatio(int first, int second) {
    double firstLuminance = relativeLuminance(first);
    double secondLuminance = relativeLuminance(second);
    return (Math.max(firstLuminance, secondLuminance) + 0.05)
        / (Math.min(firstLuminance, secondLuminance) + 0.05);
  }

  private static double relativeLuminance(int color) {
    double red = linear(((color >> 16) & 0xFF) / 255.0);
    double green = linear(((color >> 8) & 0xFF) / 255.0);
    double blue = linear((color & 0xFF) / 255.0);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }

  private static double linear(double channel) {
    return channel <= 0.04045
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4);
  }

  private static void assertColor(int expected, int actual, String message) {
    if (expected != actual) {
      throw new AssertionError(message + ": expected=" + hex(expected) + " actual=" + hex(actual));
    }
  }

  private static void assertEquals(Object expected, Object actual, String message) {
    if (expected == null ? actual != null : !expected.equals(actual)) {
      throw new AssertionError(message + ": expected=" + expected + " actual=" + actual);
    }
  }

  private static String hex(int color) {
    return String.format("#%08X", color);
  }
}
