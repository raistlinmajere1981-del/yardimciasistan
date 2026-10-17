package com.yardimciasistan.android;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import java.util.List;

final class UiKit {
  private static ThemeTokens tokens = ThemeTokens.night();

  static int BG;
  static int SURFACE;
  static int CARD;
  static int SURFACE_ALT;
  static int BORDER;
  static int TEXT;
  static int SECONDARY;
  static int MUTED;
  static int PRIMARY;
  static int PRIMARY_DARK;
  static int ACCENT_PRESSED;
  static int ACCENT_TEXT;
  static int ACCENT;
  static int ACCENT_TEXT_SECONDARY;
  static int SUCCESS;
  static int WARNING;
  static int DANGER;
  static int INFO;
  static int DISABLED_BACKGROUND;
  static int DISABLED_TEXT;
  static int BOTTOM_NAV_BACKGROUND;
  static int BOTTOM_NAV_ACTIVE;
  static int BOTTOM_NAV_INACTIVE;
  static int ICON_BUTTON_BACKGROUND;
  static int ICON_BUTTON_FOREGROUND;
  static int CHIP_BACKGROUND;
  static int CHIP_ACTIVE_BACKGROUND;
  static int CHIP_TEXT;
  static int CHIP_ACTIVE_TEXT;
  static int DANGER_BACKGROUND;
  static int DANGER_TEXT;

  static {
    applyTheme(tokens);
  }

  private UiKit() {}

  static void applyTheme(ThemeTokens nextTokens) {
    tokens = nextTokens;
    BG = tokens.appBackground;
    SURFACE = tokens.surface;
    CARD = tokens.cardBackground;
    SURFACE_ALT = tokens.elevatedCard;
    BORDER = tokens.border;
    TEXT = tokens.textPrimary;
    SECONDARY = tokens.textSecondary;
    MUTED = tokens.textMuted;
    PRIMARY = tokens.accent;
    PRIMARY_DARK = blend(tokens.appBackground, tokens.accent, 0.22f);
    ACCENT_PRESSED = tokens.accentPressed;
    ACCENT_TEXT = tokens.accentText;
    ACCENT = tokens.secondaryAccent;
    ACCENT_TEXT_SECONDARY = tokens.secondaryAccentText;
    SUCCESS = tokens.success;
    WARNING = tokens.warning;
    DANGER = tokens.danger;
    INFO = tokens.info;
    DISABLED_BACKGROUND = tokens.disabledBackground;
    DISABLED_TEXT = tokens.disabledText;
    BOTTOM_NAV_BACKGROUND = tokens.bottomNavBackground;
    BOTTOM_NAV_ACTIVE = tokens.bottomNavActive;
    BOTTOM_NAV_INACTIVE = tokens.bottomNavInactive;
    ICON_BUTTON_BACKGROUND = tokens.iconButtonBackground;
    ICON_BUTTON_FOREGROUND = tokens.iconButtonForeground;
    CHIP_BACKGROUND = tokens.chipBackground;
    CHIP_ACTIVE_BACKGROUND = tokens.chipActiveBackground;
    CHIP_TEXT = tokens.chipText;
    CHIP_ACTIVE_TEXT = tokens.chipActiveText;
    DANGER_BACKGROUND = tokens.dangerBackground;
    DANGER_TEXT = tokens.dangerText;
  }

  static int dp(Context context, int value) {
    return Math.round(value * context.getResources().getDisplayMetrics().density);
  }

  static GradientDrawable rounded(Context context, int fill, int stroke, int radius) {
    GradientDrawable drawable = new GradientDrawable();
    drawable.setColor(fill);
    drawable.setCornerRadius(dp(context, radius));
    if (stroke != Color.TRANSPARENT) {
      drawable.setStroke(dp(context, 1), stroke);
    }
    return drawable;
  }

  static TextView text(Context context, String value, int sizeSp, int color, int style) {
    TextView text = new TextView(context);
    text.setText(value);
    text.setTextSize(sizeSp);
    text.setTextColor(color);
    text.setTypeface(Typeface.create("sans", style));
    text.setLineSpacing(0, 1.08f);
    return text;
  }

  static TextView title(Context context, String value) {
    TextView text = text(context, value, 24, TEXT, Typeface.BOLD);
    text.setPadding(0, 0, 0, dp(context, 3));
    return text;
  }

  static TextView sectionTitle(Context context, String value) {
    TextView text = text(context, value, 17, TEXT, Typeface.BOLD);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.setMargins(0, dp(context, 16), 0, dp(context, 8));
    text.setLayoutParams(params);
    return text;
  }

  static TextView eyebrow(Context context, String value) {
    TextView text = text(context, value.toUpperCase(), 11, PRIMARY, Typeface.BOLD);
    text.setLetterSpacing(0.08f);
    return text;
  }

  static LinearLayout column(Context context) {
    LinearLayout layout = new LinearLayout(context);
    layout.setOrientation(LinearLayout.VERTICAL);
    return layout;
  }

  static LinearLayout row(Context context) {
    LinearLayout layout = new LinearLayout(context);
    layout.setOrientation(LinearLayout.HORIZONTAL);
    layout.setGravity(Gravity.CENTER_VERTICAL);
    return layout;
  }

  static LinearLayout card(Context context) {
    LinearLayout card = column(context);
    card.setPadding(dp(context, 16), dp(context, 16), dp(context, 16), dp(context, 16));
    card.setBackground(rounded(context, CARD, BORDER, 18));
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.setMargins(0, 0, 0, dp(context, 9));
    card.setLayoutParams(params);
    return card;
  }

  static View divider(Context context) {
    View divider = new View(context);
    divider.setBackgroundColor(BORDER);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(context, 1));
    params.setMargins(0, dp(context, 10), 0, dp(context, 10));
    divider.setLayoutParams(params);
    return divider;
  }

  static Button button(Context context, String label, int tone, View.OnClickListener listener) {
    Button button = new Button(context);
    boolean primary = tone == PRIMARY;
    boolean secondaryAccent = tone == ACCENT;
    int enabledText = primary ? ACCENT_TEXT : (secondaryAccent ? ACCENT_TEXT_SECONDARY : readableTextColor(tone));
    int pressedFill = primary ? ACCENT_PRESSED : darken(tone, 0.82f);
    button.setText(label);
    button.setTextSize(14);
    button.setTextColor(statefulText(enabledText));
    button.setTypeface(Typeface.create("sans", Typeface.BOLD));
    button.setAllCaps(false);
    button.setGravity(Gravity.CENTER);
    button.setMinHeight(dp(context, 48));
    button.setMinimumHeight(dp(context, 48));
    button.setPadding(dp(context, 14), 0, dp(context, 14), 0);
    int fill = tone == PRIMARY ? PRIMARY : tone;
    button.setBackground(statefulRounded(context, fill, Color.TRANSPARENT, pressedFill, 12));
    button.setOnClickListener(listener);
    return button;
  }

  static Button outlineButton(Context context, String label, View.OnClickListener listener) {
    Button button = button(context, label, ICON_BUTTON_BACKGROUND, listener);
    button.setTextColor(statefulText(ICON_BUTTON_FOREGROUND));
    button.setBackground(statefulRounded(context, ICON_BUTTON_BACKGROUND, BORDER, SURFACE, 12));
    return button;
  }

  static Button dangerButton(Context context, String label, View.OnClickListener listener) {
    Button button = button(context, label, DANGER_BACKGROUND, listener);
    button.setTextColor(statefulText(DANGER_TEXT));
    button.setBackground(statefulRounded(context, DANGER_BACKGROUND, DANGER, darken(DANGER_BACKGROUND, 0.88f), 11));
    return button;
  }

  static Button chip(Context context, String label, boolean selected, View.OnClickListener listener) {
    Button button = new Button(context);
    button.setText(label);
    button.setTextSize(12);
    button.setTextColor(statefulText(selected ? CHIP_ACTIVE_TEXT : CHIP_TEXT));
    button.setTypeface(Typeface.create("sans", Typeface.BOLD));
    button.setAllCaps(false);
    button.setMinHeight(dp(context, 38));
    button.setMinimumHeight(dp(context, 38));
    button.setPadding(dp(context, 13), 0, dp(context, 13), 0);
    button.setBackground(statefulRounded(
        context,
        selected ? CHIP_ACTIVE_BACKGROUND : CHIP_BACKGROUND,
        selected ? PRIMARY : BORDER,
        selected ? ACCENT_PRESSED : SURFACE,
        18
    ));
    button.setOnClickListener(listener);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-2, dp(context, 40));
    params.setMargins(0, 0, dp(context, 7), 0);
    button.setLayoutParams(params);
    return button;
  }

  static Button iconButton(Context context, String glyph, String description, boolean selected, View.OnClickListener listener) {
    Button button = new Button(context);
    button.setText(glyph);
    button.setContentDescription(description);
    button.setTextSize(18);
    button.setTextColor(statefulText(selected ? PRIMARY : ICON_BUTTON_FOREGROUND));
    button.setTypeface(Typeface.create("sans", Typeface.BOLD));
    button.setAllCaps(false);
    button.setGravity(Gravity.CENTER);
    button.setMinimumWidth(dp(context, 44));
    button.setMinimumHeight(dp(context, 44));
    button.setPadding(0, 0, 0, 0);
    button.setBackground(statefulRounded(
        context,
        selected ? PRIMARY_DARK : ICON_BUTTON_BACKGROUND,
        selected ? PRIMARY : BORDER,
        selected ? blend(PRIMARY_DARK, PRIMARY, 0.18f) : SURFACE,
        11
    ));
    button.setOnClickListener(listener);
    return button;
  }

  static ImageButton themeIconButton(Context context, int iconResource, String description, View.OnClickListener listener) {
    ImageButton button = new ImageButton(context);
    button.setImageResource(iconResource);
    button.setImageTintList(statefulText(ICON_BUTTON_FOREGROUND));
    button.setContentDescription(description);
    button.setScaleType(ImageButton.ScaleType.CENTER);
    button.setMinimumWidth(dp(context, 44));
    button.setMinimumHeight(dp(context, 44));
    button.setPadding(dp(context, 10), dp(context, 10), dp(context, 10), dp(context, 10));
    button.setBackground(statefulRounded(context, ICON_BUTTON_BACKGROUND, BORDER, SURFACE, 12));
    button.setOnClickListener(listener);
    return button;
  }

  /** V16 summary tile; only cards backed by an authorized route are clickable. */
  static View metricCard(Context context, String label, long value, int tone, View.OnClickListener click) {
    LinearLayout card = column(context);
    card.setPadding(dp(context, 14), dp(context, 12), dp(context, 12), dp(context, 12));
    card.setMinimumHeight(dp(context, 92));
    card.setBackground(rounded(context, CARD, BORDER, 14));
    TextView count = text(context, String.valueOf(value), 22, TEXT, Typeface.BOLD);
    count.setIncludeFontPadding(false);
    TextView caption = text(context, label, 12, SECONDARY, Typeface.NORMAL);
    caption.setMaxLines(3);
    card.addView(count);
    LinearLayout.LayoutParams captionParams = new LinearLayout.LayoutParams(-1, -2);
    captionParams.setMargins(0, dp(context, 5), 0, 0);
    caption.setLayoutParams(captionParams);
    card.addView(caption);
    View line = new View(context);
    line.setBackgroundColor(tone);
    LinearLayout.LayoutParams lineParams = new LinearLayout.LayoutParams(dp(context, 30), dp(context, 3));
    lineParams.setMargins(0, dp(context, 8), 0, 0);
    line.setLayoutParams(lineParams);
    card.addView(line);
    card.setContentDescription(label + ": " + value);
    if (click != null) {
      card.setClickable(true);
      card.setFocusable(true);
      card.setOnClickListener(click);
    }
    return card;
  }

  /** Balanced two-column phone / three-column wide-screen tiles; no horizontal scrolling. */
  static View metricGrid(Context context, List<View> tiles) {
    LinearLayout grid = column(context);
    int columns = context.getResources().getConfiguration().screenWidthDp >= 600 ? 3 : 2;
    for (int offset = 0; offset < tiles.size(); offset += columns) {
      LinearLayout row = row(context);
      for (int i = 0; i < columns; i++) {
        View tile = offset + i < tiles.size() ? tiles.get(offset + i) : new View(context);
        LinearLayout.LayoutParams cell = new LinearLayout.LayoutParams(0, -2, 1f);
        if (i > 0) cell.setMargins(dp(context, 4), 0, 0, 0);
        if (i < columns - 1) cell.setMarginEnd(dp(context, 4));
        row.addView(tile, cell);
      }
      LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(-1, -2);
      rowParams.setMargins(0, 0, 0, dp(context, 8));
      grid.addView(row, rowParams);
    }
    return grid;
  }

  static Button counterChip(Context context, String label, long value, int tone, View.OnClickListener listener) {
    Button button = new Button(context);
    button.setText(label + " " + value);
    button.setTextSize(12);
    button.setTextColor(tone);
    button.setTypeface(Typeface.create("sans", Typeface.BOLD));
    button.setAllCaps(false);
    button.setSingleLine(true);
    button.setMinWidth(0);
    button.setMinimumWidth(0);
    button.setGravity(Gravity.CENTER);
    button.setMinHeight(dp(context, 34));
    button.setMinimumHeight(dp(context, 34));
    button.setPadding(dp(context, 10), 0, dp(context, 10), 0);
    button.setBackground(statefulRounded(
        context,
        withAlpha(tone, 24),
        withAlpha(tone, 84),
        withAlpha(tone, 42),
        17
    ));
    button.setOnClickListener(listener);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-2, dp(context, 36));
    params.setMargins(0, 0, dp(context, 7), 0);
    button.setLayoutParams(params);
    return button;
  }

  static TextView badge(Context context, String label, int tone) {
    TextView badge = text(context, label, 11, tone, Typeface.BOLD);
    badge.setGravity(Gravity.CENTER);
    badge.setPadding(dp(context, 9), dp(context, 4), dp(context, 9), dp(context, 4));
    badge.setBackground(rounded(context, withAlpha(tone, 34), withAlpha(tone, 105), 12));
    return badge;
  }

  static ScrollView scroll(Context context, View content) {
    return scroll(context, content, 24);
  }

  static ScrollView scroll(Context context, View content, int bottomPaddingDp) {
    ScrollView scroll = new ScrollView(context);
    scroll.setFillViewport(true);
    scroll.setClipToPadding(false);
    int inset = context.getResources().getConfiguration().screenWidthDp >= 600 ? 24 : 18;
    scroll.setPadding(dp(context, inset), dp(context, 16), dp(context, inset), dp(context, bottomPaddingDp));
    scroll.addView(content);
    return scroll;
  }

  static EditText input(Context context, String hint) {
    EditText input = new EditText(context);
    input.setHint(hint);
    input.setHintTextColor(MUTED);
    input.setTextColor(statefulText(TEXT));
    input.setTextSize(15);
    input.setSingleLine(true);
    input.setPadding(dp(context, 12), 0, dp(context, 12), 0);
    input.setMinHeight(dp(context, 50));
    StateListDrawable background = new StateListDrawable();
    background.addState(new int[] {-android.R.attr.state_enabled}, rounded(context, DISABLED_BACKGROUND, BORDER, 11));
    background.addState(new int[] {android.R.attr.state_focused}, rounded(context, SURFACE, PRIMARY, 11));
    background.addState(new int[] {}, rounded(context, SURFACE, BORDER, 11));
    input.setBackground(background);
    return input;
  }

  static void styleSwitch(Switch toggle) {
    int[][] states = {
        new int[] {-android.R.attr.state_enabled},
        new int[] {android.R.attr.state_checked},
        new int[] {}
    };
    toggle.setThumbTintList(new ColorStateList(
        states,
        new int[] {DISABLED_TEXT, PRIMARY, MUTED}
    ));
    toggle.setTrackTintList(new ColorStateList(
        states,
        new int[] {
            withAlpha(DISABLED_BACKGROUND, 180),
            withAlpha(PRIMARY, 88),
            withAlpha(BORDER, 150)
        }
    ));
  }

  static void addAction(LinearLayout row, View action, Context context) {
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(context, 44), 1f);
    if (row.getChildCount() > 0) {
      params.setMargins(dp(context, 7), 0, 0, 0);
    }
    action.setLayoutParams(params);
    row.addView(action);
  }

  static int withAlpha(int color, int alpha) {
    return Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color));
  }

  private static ColorStateList statefulText(int enabledColor) {
    return new ColorStateList(
        new int[][] {
            new int[] {-android.R.attr.state_enabled},
            new int[] {}
        },
        new int[] {DISABLED_TEXT, enabledColor}
    );
  }

  private static StateListDrawable statefulRounded(
      Context context,
      int fill,
      int stroke,
      int pressedFill,
      int radius
  ) {
    StateListDrawable drawable = new StateListDrawable();
    drawable.addState(
        new int[] {-android.R.attr.state_enabled},
        rounded(context, DISABLED_BACKGROUND, BORDER, radius)
    );
    drawable.addState(
        new int[] {android.R.attr.state_pressed},
        rounded(context, pressedFill, stroke, radius)
    );
    drawable.addState(new int[] {}, rounded(context, fill, stroke, radius));
    return drawable;
  }

  private static int blend(int base, int overlay, float overlayRatio) {
    float ratio = Math.max(0f, Math.min(1f, overlayRatio));
    return Color.rgb(
        Math.round(Color.red(base) * (1f - ratio) + Color.red(overlay) * ratio),
        Math.round(Color.green(base) * (1f - ratio) + Color.green(overlay) * ratio),
        Math.round(Color.blue(base) * (1f - ratio) + Color.blue(overlay) * ratio)
    );
  }

  private static int darken(int color, float ratio) {
    return Color.rgb(
        Math.round(Color.red(color) * ratio),
        Math.round(Color.green(color) * ratio),
        Math.round(Color.blue(color) * ratio)
    );
  }

  private static int readableTextColor(int background) {
    double luminance = 0.2126 * Color.red(background)
        + 0.7152 * Color.green(background)
        + 0.0722 * Color.blue(background);
    return luminance > 150 ? ACCENT_TEXT : TEXT;
  }
}
