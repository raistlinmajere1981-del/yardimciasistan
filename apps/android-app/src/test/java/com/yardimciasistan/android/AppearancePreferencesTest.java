package com.yardimciasistan.android;

import static org.junit.Assert.*;
import android.content.SharedPreferences;
import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.Map;
import org.junit.Test;

public final class AppearancePreferencesTest {
  @Test public void optionsFallbackAndSystemScale() {
    assertEquals(100, AppearancePreferences.supportedFontPercent(-30));
    assertEquals(100, AppearancePreferences.supportedFontPercent(125));
    assertEquals(150, AppearancePreferences.supportedFontPercent(150));
    assertEquals(AppearancePreferences.Accent.GREEN, AppearancePreferences.Accent.parse("invalid"));
    assertEquals(AppearancePreferences.Accent.BLUE, AppearancePreferences.Accent.parse("blue"));
    assertEquals(1.5f, AppearancePreferences.combinedFontScale(1.0f, 150), 0.001f);
    assertEquals(1.8f, AppearancePreferences.combinedFontScale(1.2f, 150), 0.001f);
    assertEquals(3.0f, AppearancePreferences.combinedFontScale(2.8f, 150), 0.001f);
  }

  @Test public void savesAllThreePropertiesLocally() {
    Map<String, Object> store = new HashMap<>();
    final SharedPreferences.Editor[] editor = new SharedPreferences.Editor[1];
    editor[0] = (SharedPreferences.Editor) Proxy.newProxyInstance(
        SharedPreferences.Editor.class.getClassLoader(),
        new Class<?>[] {SharedPreferences.Editor.class},
        (proxy, method, args) -> {
          String name = method.getName();
          if (name.startsWith("put")) {store.put((String) args[0], args[1]); return proxy;}
          if ("commit".equals(name)) return true;
          return null;
        });
    SharedPreferences prefs = (SharedPreferences) Proxy.newProxyInstance(
        SharedPreferences.class.getClassLoader(),
        new Class<?>[] {SharedPreferences.class},
        (proxy, method, args) -> {
          String name = method.getName();
          if ("edit".equals(name)) return editor[0];
          if ("getInt".equals(name) || "getString".equals(name) || "getBoolean".equals(name)) {
            return store.getOrDefault(args[0], args[1]);
          }
          return null;
        });
    AppearancePreferences before = AppearancePreferences.load(prefs);
    assertEquals(100, before.fontPercent);
    assertEquals(AppearancePreferences.Accent.GREEN, before.accent);
    assertFalse(before.highContrast);
    assertTrue(before.withFontPercent(130).withAccent(AppearancePreferences.Accent.VIOLET)
        .withHighContrast(true).save(prefs));
    AppearancePreferences after = AppearancePreferences.load(prefs);
    assertEquals(130, after.fontPercent);
    assertEquals(AppearancePreferences.Accent.VIOLET, after.accent);
    assertTrue(after.highContrast);
    assertTrue(AppearancePreferences.defaults().save(prefs));
    assertEquals(100, AppearancePreferences.load(prefs).fontPercent);
  }

  @Test public void highContrastIsReadableInBothModesAndAllAccents() {
    for (AppTheme.Mode mode : AppTheme.Mode.values()) {
      for (AppearancePreferences.Accent accent : AppearancePreferences.Accent.values()) {
        for (boolean high : new boolean[] {false, true}) {
          ThemeTokens theme = AppTheme.tokens(mode, new AppearancePreferences(150, accent, high));
          assertAtLeast(4.5, theme.textPrimary, theme.appBackground);
          assertAtLeast(4.5, theme.textSecondary, theme.appBackground);
          assertAtLeast(4.5, theme.accentText, theme.accent);
          assertAtLeast(4.5, theme.chipActiveText, theme.chipActiveBackground);
          if (high) {
            assertAtLeast(7.0, theme.textPrimary, theme.appBackground);
            assertAtLeast(7.0, theme.textSecondary, theme.cardBackground);
            assertAtLeast(4.5, theme.textMuted, theme.appBackground);
            assertAtLeast(4.5, theme.iconButtonForeground, theme.iconButtonBackground);
          }
        }
      }
    }
  }

  @Test public void defaultAppearanceDoesNotChangeLegacyColors() {
    for (AppTheme.Mode mode : AppTheme.Mode.values()) {
      ThemeTokens old = AppTheme.tokens(mode);
      ThemeTokens current = AppTheme.tokens(mode, AppearancePreferences.defaults());
      assertEquals(old.appBackground, current.appBackground);
      assertEquals(old.accent, current.accent);
      assertEquals(old.textPrimary, current.textPrimary);
      assertEquals(old.border, current.border);
    }
  }

  private static void assertAtLeast(double min, int foreground, int background) {
    double a = luminance(foreground), b = luminance(background);
    double ratio = (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
    assertTrue(String.format("low contrast %.2f: #%08X on #%08X",ratio,foreground,background), ratio >= min);
  }

  private static double luminance(int c) {
    return 0.2126 * channel((c>>>16)&255)
        + 0.7152 * channel((c>>>8)&255)
        + 0.0722 * channel(c&255);
  }

  private static double channel(int value) {
    double v=value/255.0;
    return v <= 0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4);
  }
}
